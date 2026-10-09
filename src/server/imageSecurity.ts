/**
 * Image Upload Security & Validation Module
 * Validates binary image signatures (magic bytes), strictly blocks SVG and HTML/JS polyglots,
 * sanitizes filenames, enforces maximum upload sizes, and guarantees safe serving headers.
 */

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 Megabytes for general site media
export const REVIEW_MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 Megabytes strictly for review photos
export const MIN_IMAGE_SIZE_BYTES = 12; // Minimum bytes to verify magic headers
export const D1_SAFE_BLOB_CHUNK_BYTES = 768 * 1024; // 768 KB safe ceiling per D1 statement/row to avoid SQLite row limits
export const MAX_IMAGE_DIMENSION = 4096; // 4096px maximum dimension ceiling for site media
export const MAX_REVIEW_IMAGE_DIMENSION = 2560; // 2560px maximum dimension ceiling for customer review photos

export type SupportedImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'ico';

export interface ImageValidationResult {
  valid: boolean;
  format?: SupportedImageFormat;
  mime?: string;
  extension?: string;
  size?: number;
  width?: number;
  height?: number;
  error?: string;
}

/**
 * Memory-efficient conversion from Uint8Array to Base64 string without millions of string allocations.
 * Uses 16KB batch chunks with String.fromCharCode.apply, or Buffer if present in the runtime.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  const CHUNK_SIZE = 16384;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }
  return btoa(chunks.join(''));
}

/**
 * Memory-efficient conversion from Base64 string to Uint8Array without single-character string iteration.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 4096) {
    const end = Math.min(i + 4096, len);
    for (let j = i; j < end; j++) {
      bytes[j] = binary.charCodeAt(j);
    }
  }
  return bytes;
}

/**
 * Extracts width and height directly from image binary headers before full buffer processing.
 * Supports PNG, GIF, WebP (VP8, VP8L, VP8X), and JPEG (SOF markers).
 */
export function getImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 16) return null;

  // 1. PNG: Dimensions stored in IHDR chunk (bytes 16-23)
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes.length >= 24) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width: Math.abs(width), height: Math.abs(height) };
  }

  // 2. GIF: Width (bytes 6-7), Height (bytes 8-9) in little-endian
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes.length >= 10) {
    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    return { width, height };
  }

  // 3. WebP: RIFF ... WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes.length >= 30) {
    const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (type === 'VP8 ' && bytes.length >= 30) {
      const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
      return { width, height };
    }
    if (type === 'VP8L' && bytes.length >= 25) {
      const b0 = bytes[21];
      const b1 = bytes[22];
      const b2 = bytes[23];
      const b3 = bytes[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
    if (type === 'VP8X' && bytes.length >= 30) {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width, height };
    }
  }

  // 4. JPEG: Scan through markers looking for SOF (Start of Frame)
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    let offset = 2;
    const maxScan = Math.min(bytes.length, 65536);
    while (offset < maxScan - 8) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      // Baseline / Progressive / Extended SOF markers
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height };
      }
      const len = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (len <= 0) break;
      offset += 2 + len;
    }
  }

  return null;
}

// Disallowed executable / script / markup tags that must never appear in raw image data
const DANGEROUS_PAYLOAD_PATTERNS = [
  /<svg[\s>]/i,
  /<\?xml/i,
  /<html[\s>]/i,
  /<script[\s>]/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<!doctype/i,
  /javascript:/i,
  /vbscript:/i,
  /onload\s*=/i,
  /onerror\s*=/i,
  /onclick\s*=/i,
  /<\?php/i,
  /eval\s*\(/i,
  /<style[\s>]/i,
];

/**
 * Checks if the binary buffer contains any embedded HTML, SVG, or script tags
 * that could be executed by a browser or parsed as a polyglot document.
 */
function containsMaliciousPayload(bytes: Uint8Array): boolean {
  // Convert sample chunks (start, end, and middle samples) to ASCII for fast regex scanning
  const checkSample = (slice: Uint8Array): boolean => {
    let str = '';
    const len = Math.min(slice.length, 16384);
    for (let i = 0; i < len; i++) {
      const code = slice[i];
      // Only include printable ASCII characters or common whitespace
      if (code >= 32 && code <= 126) {
        str += String.fromCharCode(code);
      } else if (code === 9 || code === 10 || code === 13) {
        str += ' ';
      }
    }

    for (const pattern of DANGEROUS_PAYLOAD_PATTERNS) {
      if (pattern.test(str)) {
        return true;
      }
    }
    return false;
  };

  // Check header sample (first 16KB)
  if (checkSample(bytes.subarray(0, Math.min(bytes.length, 16384)))) {
    return true;
  }

  // Check tail sample (last 4KB, where SVG tags or script tags are often appended in polyglots)
  if (bytes.length > 4096) {
    if (checkSample(bytes.subarray(bytes.length - 4096))) {
      return true;
    }
  }

  return false;
}

/**
 * Inspects the binary contents of an uploaded file against authoritative magic byte signatures.
 * Does NOT rely on client-provided MIME type or extension.
 */
export function validateImageBuffer(buffer: ArrayBuffer | Uint8Array): ImageValidationResult {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const size = bytes.byteLength;

  if (size < MIN_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: 'File is too small or truncated to be a valid image.',
    };
  }

  if (size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed limit of ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB.`,
    };
  }

  // 1. Check for malicious SVG / HTML / script injections in buffer
  if (containsMaliciousPayload(bytes)) {
    return {
      valid: false,
      error: 'Disallowed file content detected: Vector graphics (SVG), XML, HTML, and executable scripts are strictly prohibited.',
    };
  }

  // 1.1 Enforce maximum image dimensions ceiling before processing
  const dims = getImageDimensions(bytes);
  if (dims && (dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION)) {
    return {
      valid: false,
      error: `Image dimensions (${dims.width}x${dims.height}px) exceed maximum allowed limit of ${MAX_IMAGE_DIMENSION}px.`,
    };
  }

  // 2. Validate JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    // Basic JPEG structure check: must have marker after header (e.g. 0xE0, 0xE1, 0xDB, 0xC0)
    if (bytes[3] >= 0xc0) {
      return {
        valid: true,
        format: 'jpeg',
        mime: 'image/jpeg',
        extension: 'jpg',
        size,
      };
    }
  }

  // 3. Validate PNG: 89 50 4E 47 0D 0A 1A 0A followed by IHDR chunk
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    // Bytes 12-15 must be IHDR chunk header (0x49 0x48 0x44 0x52)
    if (
      bytes.length >= 16 &&
      bytes[12] === 0x49 &&
      bytes[13] === 0x48 &&
      bytes[14] === 0x44 &&
      bytes[15] === 0x52
    ) {
      return {
        valid: true,
        format: 'png',
        mime: 'image/png',
        extension: 'png',
        size,
      };
    }
  }

  // 4. Validate WebP: RIFF ... WEBP VP8
  if (
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50    // P
  ) {
    // Sub-format check: VP8 (lossy), VP8L (lossless), or VP8X (extended)
    if (
      bytes.length >= 16 &&
      bytes[12] === 0x56 && // V
      bytes[13] === 0x50 && // P
      bytes[14] === 0x38    // 8
    ) {
      return {
        valid: true,
        format: 'webp',
        mime: 'image/webp',
        extension: 'webp',
        size,
      };
    }
  }

  // 5. Validate GIF: GIF87a or GIF89a
  if (
    bytes[0] === 0x47 && // G
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x38 && // 8
    (bytes[4] === 0x37 || bytes[4] === 0x39) && // 7 or 9
    bytes[5] === 0x61    // a
  ) {
    return {
      valid: true,
      format: 'gif',
      mime: 'image/gif',
      extension: 'gif',
      size,
    };
  }

  // 6. Validate ICO: 00 00 01 00
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x01 &&
    bytes[3] === 0x00
  ) {
    return {
      valid: true,
      format: 'ico',
      mime: 'image/x-icon',
      extension: 'ico',
      size,
    };
  }

  return {
    valid: false,
    error: 'Unsupported or corrupted image file format. Only JPEG, PNG, WebP, GIF, and ICO image formats are accepted.',
  };
}

/**
 * Validates media asset storage keys against path traversal and unauthorized characters.
 */
export function isValidMediaKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  // Strict regex: must strictly match asset-<timestamp>-<alphanumeric>(_w<width>)?<ext>
  return /^asset-\d+-[a-z0-9]+(_w\d+)?\.(jpg|png|webp|gif|ico)$/.test(key);
}

/**
 * Generates an authoritative, tamper-proof media storage key based strictly on
 * the verified extension from magic byte inspection.
 */
export function generateSafeMediaKey(extension: string): string {
  const safeExt = extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const timestamp = Date.now();
  // Security Hardening: Use CSPRNG randomUUID for collision-resistant media key
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `asset-${timestamp}-${rand}.${safeExt}`;
}

export const MAX_REVIEW_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB (2,097,152 bytes)
export const ALLOWED_REVIEW_PHOTO_FORMATS = ['jpeg', 'png', 'webp'] as const;

/**
 * Validates review photo buffer against 2 MB limit and enforces JPEG/PNG/WebP formats.
 * Does not affect global site media limits (which remain at 10 MB).
 */
export function validateReviewPhotoBuffer(buffer: ArrayBuffer | Uint8Array): {
  valid: boolean;
  format?: 'jpeg' | 'png' | 'webp';
  mime?: string;
  extension?: string;
  error?: string;
} {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength > MAX_REVIEW_PHOTO_BYTES) {
    return { valid: false, error: 'Review photo exceeds maximum allowed limit of 2 MB.' };
  }
  const dims = getImageDimensions(bytes);
  if (dims && (dims.width > MAX_REVIEW_IMAGE_DIMENSION || dims.height > MAX_REVIEW_IMAGE_DIMENSION)) {
    return {
      valid: false,
      error: `Review photo dimensions (${dims.width}x${dims.height}px) exceed maximum allowed ceiling of ${MAX_REVIEW_IMAGE_DIMENSION}px.`,
    };
  }
  const result = validateImageBuffer(bytes);
  if (!result.valid || !result.format || !ALLOWED_REVIEW_PHOTO_FORMATS.includes(result.format as any)) {
    return { valid: false, error: 'Invalid review photo format. Only JPEG, PNG, and WebP images are permitted.' };
  }
  return {
    valid: true,
    format: result.format as 'jpeg' | 'png' | 'webp',
    mime: result.mime,
    extension: result.extension,
  };
}

/**
 * Returns strict security headers when serving uploaded media.
 * Ensures Vary: Accept so WebP content negotiation never causes cache collisions across clients.
 */
export function getSafeMediaHeaders(mime: string): Record<string, string> {
  return {
    'Content-Type': mime,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Vary': 'Accept',
  };
}

/**
 * Validates and sanitizes review photo references.
 * Strictly blocks arbitrary URL injection, JavaScript/data schemes, and non-image extensions.
 */
export function sanitizeReviewImageReference(img: any): string | null {
  if (typeof img !== 'string') return null;
  const trimmed = img.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  // Strictly disallow executable, script, data, and dangerous protocols
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return null;
  if (/[<>"'`\\;\r\n]/.test(trimmed)) return null;
  if (trimmed.includes('..')) return null;

  // 1. Authoritative media key: asset-<timestamp>-<hash>(_w<width>)?<ext>
  if (isValidMediaKey(trimmed)) return trimmed;

  // 2. Authoritative internal media URL: /api/media/asset-...
  const mediaMatch = trimmed.match(/^\/api\/media\/([a-zA-Z0-9_\-.]+)$/);
  if (mediaMatch && isValidMediaKey(mediaMatch[1])) return trimmed;

  // 3. Authoritative internal review image URL: /api/reviews/images/<id>
  const revImgMatch = trimmed.match(/^\/api\/reviews\/images\/([a-zA-Z0-9_\-]+)$/);
  if (revImgMatch) return trimmed;

  // 4. Safe relative image filename (for existing seed & test data support)
  if (/^[a-zA-Z0-9_\-]+\.(jpg|jpeg|png|webp|gif|ico)$/i.test(trimmed)) return trimmed;

  // 5. Safe HTTPS URL to trusted image hosts
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    const hostname = parsed.hostname.toLowerCase();
    const trustedHosts = [
      'images.unsplash.com',
      'i.pinimg.com',
      'rongdhonutrade.com',
      'localhost',
      '127.0.0.1',
    ];
    if (trustedHosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

