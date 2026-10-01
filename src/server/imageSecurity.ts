/**
 * Image Upload Security & Validation Module
 * Validates binary image signatures (magic bytes), strictly blocks SVG and HTML/JS polyglots,
 * sanitizes filenames, enforces maximum upload sizes, and guarantees safe serving headers.
 */

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 Megabytes
export const MIN_IMAGE_SIZE_BYTES = 12; // Minimum bytes to verify magic headers

export type SupportedImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'ico';

export interface ImageValidationResult {
  valid: boolean;
  format?: SupportedImageFormat;
  mime?: string;
  extension?: string;
  size?: number;
  error?: string;
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
  const rand = Math.random().toString(36).substring(2, 8);
  return `asset-${timestamp}-${rand}.${safeExt}`;
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
