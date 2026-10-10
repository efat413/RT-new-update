/**
 * Request Body Size Limiting & Pre-Parse Streaming Guard
 * Protects Rongdhonu Trade Cloudflare Worker from OOM crashes and unconstrained memory allocation.
 * Enforces early Content-Length header inspection and streaming chunk abort (HTTP 413)
 * prior to JSON parsing or full body buffering.
 */

// Route-specific size thresholds
export const BODY_LIMIT_AUTH = 64 * 1024; // 64 KB: Credentials, password reset tokens, auth profile
export const BODY_LIMIT_ORDER = 128 * 1024; // 128 KB: Checkout orders, address, item arrays, advance payments
export const BODY_LIMIT_WEBHOOK = 64 * 1024; // 64 KB: Courier status updates and delivery lifecycle events
export const BODY_LIMIT_REVIEW_UPLOAD = 12 * 1024 * 1024; // 12 MB: Up to 5 photos (8 MB aggregate decoded binary + 33% base64 expansion + envelope)
export const BODY_LIMIT_REVIEW_MODERATION = 128 * 1024; // 128 KB: Review status updates & text edits (no image upload)
export const BODY_LIMIT_ADMIN_CATALOG = 1024 * 1024; // 1 MB: Products, categories, sliders, settings, rich markdown
export const BODY_LIMIT_MEDIA_UPLOAD = 15 * 1024 * 1024; // 15 MB: Up to 10 MB binary image + base64 encoding / multipart
export const BODY_LIMIT_DEFAULT = 256 * 1024; // 256 KB: Default ceiling for any other mutating routes

export interface BodyReadError {
  status: 400 | 413;
  error: string;
}

/**
 * Resolves the authoritative maximum allowable request body size in bytes
 * based on the target endpoint pathname and HTTP method.
 */
export function getBodySizeLimit(pathname: string, method = 'POST'): number {
  const normPath = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const normMethod = method.toUpperCase();

  // 1. Direct Media Upload Endpoint (supports up to 10MB binary + base64 expansion)
  if (normPath === '/api/media/upload' || normPath.startsWith('/api/media/upload/')) {
    return BODY_LIMIT_MEDIA_UPLOAD;
  }

  // 2. Review Submission Endpoint with Photos (supports up to 8MB aggregate binary + base64 + JSON envelope)
  if (normPath === '/api/reviews' && normMethod === 'POST') {
    return BODY_LIMIT_REVIEW_UPLOAD;
  }

  // 3. Auth & Session Routes (strict tight 64 KB limit)
  if (
    normPath.startsWith('/api/auth/') ||
    normPath === '/api/admin/login' ||
    normPath === '/api/auth/login' ||
    normPath === '/api/auth/register' ||
    normPath === '/api/auth/forgot-password' ||
    normPath === '/api/auth/reset-password' ||
    normPath === '/api/auth/change-password' ||
    normPath === '/api/auth/update-profile'
  ) {
    return BODY_LIMIT_AUTH;
  }

  // 4. Order Checkout & Revenue-Critical Operations (strict 128 KB limit)
  if (
    (normPath === '/api/orders' && normMethod === 'POST') ||
    normPath === '/api/orders/recalculate' ||
    normPath.includes('/advance-payment') ||
    normPath === '/api/tracking'
  ) {
    return BODY_LIMIT_ORDER;
  }

  // 5. Courier Inbound Webhooks (strict 64 KB limit)
  if (
    normPath === '/api/webhook' ||
    normPath === '/api/webhooks' ||
    normPath.startsWith('/api/webhook/') ||
    normPath.startsWith('/api/courier/webhook') ||
    normPath.startsWith('/api/steadfast/webhook')
  ) {
    return BODY_LIMIT_WEBHOOK;
  }

  // 6. Review Moderation / Status Edits without photo upload (128 KB)
  if (normPath.startsWith('/api/reviews/')) {
    return BODY_LIMIT_REVIEW_MODERATION;
  }

  // 7. Standard Admin & Catalog entities (1 MB headroom for rich text, descriptions, SEO)
  if (
    normPath.startsWith('/api/products') ||
    normPath.startsWith('/api/categories') ||
    normPath.startsWith('/api/sliders') ||
    normPath.startsWith('/api/settings') ||
    normPath.startsWith('/api/coupons') ||
    normPath.startsWith('/api/expenses') ||
    normPath.startsWith('/api/admin/users') ||
    normPath.startsWith('/api/courier/webhooks') ||
    (normPath.startsWith('/api/orders') && normMethod !== 'POST') // Admin order modifications / status changes
  ) {
    return BODY_LIMIT_ADMIN_CATALOG;
  }

  // 8. Safe Default for any other mutating requests
  return BODY_LIMIT_DEFAULT;
}

/**
 * Pre-parse stream reader that enforces body size limits before buffering.
 * 1. Inspects Content-Length header upfront (fails fast if > maxBytes).
 * 2. Reads raw body stream in chunks, keeping track of byte count.
 * 3. Immediately cancels the stream reader (HTTP 413) if chunks exceed maxBytes,
 *    preventing memory exhaustion from spoofed or missing Content-Length headers.
 * 4. Buffers chunks only once into a merged Uint8Array. Never buffers twice.
 */
export async function readRawBodyWithLimit(
  request: Request,
  maxBytes: number
): Promise<{ buffer: Uint8Array | null; error: BodyReadError | null }> {
  // 1. Upfront Content-Length header validation
  const clHeader = request.headers.get('content-length');
  if (clHeader !== null && clHeader !== '') {
    const parsedLen = parseInt(clHeader, 10);
    if (isNaN(parsedLen) || parsedLen < 0) {
      return {
        buffer: null,
        error: {
          status: 400,
          error: 'Invalid Content-Length header.',
        },
      };
    }
    if (parsedLen > maxBytes) {
      return {
        buffer: null,
        error: {
          status: 413,
          error: 'Payload too large: Request body exceeds maximum allowed size.',
        },
      };
    }
  }

  // 2. Empty or missing body
  if (!request.body) {
    return { buffer: new Uint8Array(0), error: null };
  }

  // 3. Streaming chunk reading with early abort guard
  let totalBytes = 0;
  const chunks: Uint8Array[] = [];

  if (typeof (request.body as any).getReader === 'function') {
    const reader = (request.body as ReadableStream<Uint8Array>).getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            // Early abort: cancel stream to immediately stop socket consumption
            try {
              await reader.cancel('Payload Too Large');
            } catch {}
            return {
              buffer: null,
              error: {
                status: 413,
                error: 'Payload too large: Request body exceeds maximum allowed size.',
              },
            };
          }
          chunks.push(value);
        }
      }
    } catch (err: any) {
      if (totalBytes > maxBytes) {
        return {
          buffer: null,
          error: {
            status: 413,
            error: 'Payload too large: Request body exceeds maximum allowed size.',
          },
        };
      }
      throw err;
    }
  } else if (typeof request.arrayBuffer === 'function') {
    // Non-streaming fallback for mock test runtimes
    const arrayBuf = await request.arrayBuffer();
    if (arrayBuf.byteLength > maxBytes) {
      return {
        buffer: null,
        error: {
          status: 413,
          error: 'Payload too large: Request body exceeds maximum allowed size.',
        },
      };
    }
    chunks.push(new Uint8Array(arrayBuf));
    totalBytes = arrayBuf.byteLength;
  } else {
    return { buffer: new Uint8Array(0), error: null };
  }

  // 4. Merge chunks cleanly into a single contiguous Uint8Array without duplicate allocations
  let finalBuffer: Uint8Array;
  if (chunks.length === 0) {
    finalBuffer = new Uint8Array(0);
  } else if (chunks.length === 1) {
    finalBuffer = chunks[0];
  } else {
    finalBuffer = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      finalBuffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }

  return { buffer: finalBuffer, error: null };
}
