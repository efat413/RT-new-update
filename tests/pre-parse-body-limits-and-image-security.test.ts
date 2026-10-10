import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/worker';
import { handleApiRequest } from '../src/server/router';
import {
  getBodySizeLimit,
  readRawBodyWithLimit,
  BODY_LIMIT_AUTH,
  BODY_LIMIT_ORDER,
  BODY_LIMIT_WEBHOOK,
  BODY_LIMIT_REVIEW_UPLOAD,
  BODY_LIMIT_REVIEW_MODERATION,
  BODY_LIMIT_ADMIN_CATALOG,
  BODY_LIMIT_MEDIA_UPLOAD,
  BODY_LIMIT_DEFAULT,
} from '../src/server/bodyLimits';
import {
  isValidBase64,
  validateAndDecodeReviewPhoto,
  MAX_REVIEW_IMAGE_COUNT,
  MAX_REVIEW_PHOTO_BYTES,
  MAX_REVIEW_AGGREGATE_BYTES,
} from '../src/server/imageSecurity';

// Minimal 1x1 valid PNG base64
const VALID_1X1_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_1X1_PNG_DATA_URL = `data:image/png;base64,${VALID_1X1_PNG_BASE64}`;

// Helper to create a mock D1 instance for review & order routing
function createMockD1(): any {
  const reviewsMap = new Map<string, any>();
  return {
    prepare(sql: string) {
      let boundParams: any[] = [];
      return {
        bind(...params: any[]) {
          boundParams = params;
          return this;
        },
        async first<T = any>() {
          if (sql.includes('SELECT 1 as alive')) return { alive: 1 };
          if (sql.includes('SELECT id FROM products')) {
            return { id: boundParams[0] || 'prod-test-1', title: 'Test Product' };
          }
          if (sql.includes('FROM products WHERE id = ?')) {
            return {
              id: boundParams[0] || 'prod-test-1',
              title: 'Test Product',
              price: 1000,
              stock: 50,
              status: 'active',
            };
          }
          if (sql.includes('SELECT id FROM reviews WHERE product_id = ? AND comment = ?')) {
            return null; // No duplicate
          }
          if (sql.includes('SELECT * FROM reviews WHERE id = ?')) {
            const rev = reviewsMap.get(boundParams[0]);
            if (rev) return rev;
            return {
              id: boundParams[0],
              product_id: 'prod-test-1',
              author_name: 'Tanvir Hossain',
              comment: 'Excellent item',
              rating: 5,
              status: 'pending',
              source: 'customer',
              verified_purchase: 0,
              images_json: JSON.stringify(['/api/reviews/images/rev-img-1']),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          }
          return null;
        },
        async all<T = any>() {
          return { results: [] };
        },
        async run() {
          if (sql.includes('INSERT INTO reviews')) {
            const id = boundParams[0];
            const imagesJson = boundParams.find((p) => typeof p === 'string' && p.startsWith('["')) || '[]';
            reviewsMap.set(id, {
              id,
              product_id: boundParams[1],
              author_name: boundParams[2],
              comment: boundParams[4] || boundParams[3],
              rating: boundParams[3] || 5,
              status: 'pending',
              source: 'customer',
              verified_purchase: 0,
              images_json: imagesJson,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
    batch: async () => [],
    exec: async () => ({ count: 0 }),
  };
}

describe('1. Endpoint-Specific Body Size Threshold Calculation', () => {
  it('assigns strict 64 KB limit to authentication endpoints', () => {
    expect(getBodySizeLimit('/api/auth/login', 'POST')).toBe(BODY_LIMIT_AUTH);
    expect(getBodySizeLimit('/api/admin/login', 'POST')).toBe(BODY_LIMIT_AUTH);
    expect(getBodySizeLimit('/api/auth/register', 'POST')).toBe(BODY_LIMIT_AUTH);
    expect(getBodySizeLimit('/api/auth/forgot-password', 'POST')).toBe(BODY_LIMIT_AUTH);
    expect(getBodySizeLimit('/api/auth/reset-password', 'POST')).toBe(BODY_LIMIT_AUTH);
    expect(getBodySizeLimit('/api/auth/update-profile', 'PATCH')).toBe(BODY_LIMIT_AUTH);
    expect(BODY_LIMIT_AUTH).toBe(65536);
  });

  it('assigns strict 128 KB limit to checkout and order recalculation', () => {
    expect(getBodySizeLimit('/api/orders', 'POST')).toBe(BODY_LIMIT_ORDER);
    expect(getBodySizeLimit('/api/orders/recalculate', 'POST')).toBe(BODY_LIMIT_ORDER);
    expect(getBodySizeLimit('/api/orders/ord-123/advance-payment', 'PATCH')).toBe(BODY_LIMIT_ORDER);
    expect(getBodySizeLimit('/api/tracking', 'POST')).toBe(BODY_LIMIT_ORDER);
    expect(BODY_LIMIT_ORDER).toBe(131072);
  });

  it('assigns calculated 12 MB limit to customer review creation with photos', () => {
    expect(getBodySizeLimit('/api/reviews', 'POST')).toBe(BODY_LIMIT_REVIEW_UPLOAD);
    expect(BODY_LIMIT_REVIEW_UPLOAD).toBe(12 * 1024 * 1024);
  });

  it('assigns 128 KB limit to review moderation without photo uploads', () => {
    expect(getBodySizeLimit('/api/reviews/rev-123', 'PATCH')).toBe(BODY_LIMIT_REVIEW_MODERATION);
    expect(getBodySizeLimit('/api/reviews/rev-123', 'PUT')).toBe(BODY_LIMIT_REVIEW_MODERATION);
  });

  it('assigns 1 MB limit to admin and catalog management endpoints', () => {
    expect(getBodySizeLimit('/api/products', 'POST')).toBe(BODY_LIMIT_ADMIN_CATALOG);
    expect(getBodySizeLimit('/api/products/prod-1', 'PUT')).toBe(BODY_LIMIT_ADMIN_CATALOG);
    expect(getBodySizeLimit('/api/categories', 'POST')).toBe(BODY_LIMIT_ADMIN_CATALOG);
    expect(getBodySizeLimit('/api/sliders', 'POST')).toBe(BODY_LIMIT_ADMIN_CATALOG);
    expect(getBodySizeLimit('/api/settings', 'PUT')).toBe(BODY_LIMIT_ADMIN_CATALOG);
    expect(getBodySizeLimit('/api/coupons', 'POST')).toBe(BODY_LIMIT_ADMIN_CATALOG);
    expect(getBodySizeLimit('/api/orders/ord-1', 'PATCH')).toBe(BODY_LIMIT_ADMIN_CATALOG);
  });

  it('assigns 15 MB limit to direct media uploads', () => {
    expect(getBodySizeLimit('/api/media/upload', 'POST')).toBe(BODY_LIMIT_MEDIA_UPLOAD);
    expect(BODY_LIMIT_MEDIA_UPLOAD).toBe(15 * 1024 * 1024);
  });

  it('assigns 64 KB limit to incoming courier webhooks', () => {
    expect(getBodySizeLimit('/api/courier/webhook', 'POST')).toBe(BODY_LIMIT_WEBHOOK);
    expect(getBodySizeLimit('/api/steadfast/webhook', 'POST')).toBe(BODY_LIMIT_WEBHOOK);
    expect(getBodySizeLimit('/api/webhook/steadfast', 'POST')).toBe(BODY_LIMIT_WEBHOOK);
  });

  it('falls back to 256 KB default for other mutating endpoints', () => {
    expect(getBodySizeLimit('/api/unknown-action', 'POST')).toBe(BODY_LIMIT_DEFAULT);
    expect(BODY_LIMIT_DEFAULT).toBe(262144);
  });
});

describe('2. Early Pre-Parse Body Sizing & Streaming Abort', () => {
  it('aborts oversized chunked stream prior to full JSON parsing (early 413)', async () => {
    let cancelCalled = false;
    let chunksEmitted = 0;

    // Create a stream that emits 10 chunks of 10 KB (100 KB total)
    // When limit is 64 KB, it should abort around chunk 7
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) {
          const chunk = new Uint8Array(10 * 1024).fill(65); // 10 KB chunk
          controller.enqueue(chunk);
          chunksEmitted++;
        }
        controller.close();
      },
      cancel(reason) {
        cancelCalled = true;
      },
    });

    const request = new Request('https://rongdhonutrade.com/api/auth/login', {
      method: 'POST',
      body: stream,
      headers: {
        'Content-Type': 'application/json',
      },
      // @ts-ignore
      duplex: 'half',
    });

    const { buffer, error } = await readRawBodyWithLimit(request, BODY_LIMIT_AUTH);
    expect(buffer).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.status).toBe(413);
    expect(error?.error).toContain('Payload too large');
    expect(cancelCalled).toBe(true);
  });

  it('inspects Content-Length upfront and rejects oversized payload immediately', async () => {
    const request = new Request('https://rongdhonutrade.com/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'secretpassword' }),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '70000', // 70 KB declared > 64 KB limit
      },
    });

    const { buffer, error } = await readRawBodyWithLimit(request, BODY_LIMIT_AUTH);
    expect(buffer).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.status).toBe(413);
    expect(error?.error).toContain('Payload too large');
  });

  it('detects spoofed low Content-Length and aborts when stream chunks exceed threshold', async () => {
    let cancelCalled = false;
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < 5) {
          controller.enqueue(new Uint8Array(20 * 1024).fill(65));
          index++;
        } else {
          controller.close();
        }
      },
      cancel() {
        cancelCalled = true;
      },
    });

    const request = new Request('https://rongdhonutrade.com/api/auth/login', {
      method: 'POST',
      body: stream,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '50', // Spoofed header claiming only 50 bytes!
      },
      // @ts-ignore
      duplex: 'half',
    });

    const { buffer, error } = await readRawBodyWithLimit(request, BODY_LIMIT_AUTH);
    expect(buffer).toBeNull();
    expect(error?.status).toBe(413);
    expect(error?.error).toContain('Payload too large');
    expect(cancelCalled).toBe(true);
  });

  it('rejects invalid or negative Content-Length header with HTTP 400', async () => {
    const req1 = new Request('https://rongdhonutrade.com/api/auth/login', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Length': '-5', 'Content-Type': 'application/json' },
    });
    const res1 = await readRawBodyWithLimit(req1, BODY_LIMIT_AUTH);
    expect(res1.error?.status).toBe(400);
    expect(res1.error?.error).toContain('Invalid Content-Length');

    const req2 = new Request('https://rongdhonutrade.com/api/auth/login', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Length': 'invalid-number', 'Content-Type': 'application/json' },
    });
    const res2 = await readRawBodyWithLimit(req2, BODY_LIMIT_AUTH);
    expect(res2.error?.status).toBe(400);
  });

  it('enforces size limit even when Content-Length header is omitted entirely', async () => {
    const largeStr = 'a'.repeat(70 * 1024); // 70 KB
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(largeStr));
        controller.close();
      },
    });

    const request = new Request('https://rongdhonutrade.com/api/auth/login', {
      method: 'POST',
      body: stream,
      headers: {
        'Content-Type': 'application/json',
        // Content-Length intentionally omitted
      },
      // @ts-ignore
      duplex: 'half',
    });

    const { buffer, error } = await readRawBodyWithLimit(request, BODY_LIMIT_AUTH);
    expect(buffer).toBeNull();
    expect(error?.status).toBe(413);
  });
});

describe('3. Strict RFC 4648 Base64 & Image Validation', () => {
  it('validates strictly formatted Base64 strings', () => {
    expect(isValidBase64(VALID_1X1_PNG_BASE64)).toBe(true);
    expect(isValidBase64('AQIDBA==')).toBe(true); // 4 bytes with 2 '=' padding
    expect(isValidBase64('AQIDBAU=')).toBe(true); // 5 bytes with 1 '=' padding
    expect(isValidBase64('AQIDBAUG')).toBe(true); // 6 bytes with no padding
  });

  it('rejects corrupted Base64 strings with invalid characters or illegal padding', () => {
    expect(isValidBase64('')).toBe(false);
    expect(isValidBase64('Invalid!Char@Here#')).toBe(false); // Illegal characters
    expect(isValidBase64('AQIDBA===')).toBe(false); // 3 '=' paddings (illegal)
    expect(isValidBase64('AQ=IDBAU')).toBe(false); // '=' padding in middle
    expect(isValidBase64('AQIDBA')).toBe(false); // Length 6 (not multiple of 4)
    expect(isValidBase64('   ')).toBe(false);
  });

  it('rejects review with unsupported MIME types (SVG, GIF, PDF)', () => {
    const svgDataUrl = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    const res1 = validateAndDecodeReviewPhoto(svgDataUrl, 0);
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain('Unsupported image MIME type');

    const gifDataUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const res2 = validateAndDecodeReviewPhoto(gifDataUrl, 0);
    expect(res2.valid).toBe(false);
    expect(res2.error).toContain('Unsupported image MIME type');

    const pdfDataUrl = 'data:application/pdf;base64,JVBERi0xLjQK';
    const res3 = validateAndDecodeReviewPhoto(pdfDataUrl, 0);
    expect(res3.valid).toBe(false);
  });

  it('rejects malformed data URL prefixes', () => {
    const badPrefix = 'data:image/jpeg;notbase64,AQID';
    const res = validateAndDecodeReviewPhoto(badPrefix, 0);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Malformed image data URL');
  });

  it('rejects individual photo exceeding MAX_REVIEW_PHOTO_BYTES (2 MB)', () => {
    // 2.1 MB binary data
    const oversizedBinary = new Uint8Array(2.1 * 1024 * 1024);
    // Pretend JPEG magic bytes
    oversizedBinary[0] = 0xff;
    oversizedBinary[1] = 0xd8;
    oversizedBinary[2] = 0xff;
    oversizedBinary[3] = 0xe0;

    const b64 = Buffer.from(oversizedBinary).toString('base64');
    const dataUrl = `data:image/jpeg;base64,${b64}`;

    const res = validateAndDecodeReviewPhoto(dataUrl, 0);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('exceeds maximum allowed limit of 2 MB');
  });

  it('rejects photos that would exceed MAX_REVIEW_AGGREGATE_BYTES (8 MB)', () => {
    // Current aggregate already 7.5 MB
    const currentAggregate = 7.5 * 1024 * 1024;
    // New photo 1 MB -> total 8.5 MB > 8 MB
    const oneMbBinary = new Uint8Array(1 * 1024 * 1024);
    oneMbBinary[0] = 0xff;
    oneMbBinary[1] = 0xd8;
    oneMbBinary[2] = 0xff;
    oneMbBinary[3] = 0xe0;

    const b64 = Buffer.from(oneMbBinary).toString('base64');
    const dataUrl = `data:image/jpeg;base64,${b64}`;

    const res = validateAndDecodeReviewPhoto(dataUrl, currentAggregate);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('exceed aggregate size limit of 8 MB');
  });

  it('accepts valid 1x1 PNG review photo within all caps', () => {
    const res = validateAndDecodeReviewPhoto(VALID_1X1_PNG_DATA_URL, 0);
    expect(res.valid).toBe(true);
    expect(res.mime).toBe('image/png');
    expect(res.format).toBe('png');
    expect(res.size).toBeGreaterThan(0);
  });
});

describe('4. Router & Worker Endpoint Integration Tests', () => {
  const mockEnv: any = {
    DB: createMockD1(),
    DEV: true,
  };

  it('enforces 413 on oversized Order Checkout via handleApiRequest', async () => {
    // Limit for /api/orders POST is 128 KB
    const largeCustomerNotes = 'x'.repeat(140 * 1024); // 140 KB payload
    const body = JSON.stringify({
      customer: { fullName: 'Rahim Khan', phone: '01711111111', fullAddress: 'Dhaka', district: 'Dhaka' },
      items: [{ productId: 'prod-1', quantity: 1 }],
      notes: largeCustomerNotes,
    });

    const request = new Request('https://rongdhonutrade.com/api/orders', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      },
    });

    const response = await handleApiRequest(request, mockEnv);
    expect(response.status).toBe(413);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Payload too large');
  });

  it('enforces 413 on oversized Auth Login via worker.fetch', async () => {
    // Limit for /api/auth/login is 64 KB
    const body = JSON.stringify({
      usernameOrEmail: 'user@example.com',
      password: 'p'.repeat(70 * 1024), // 70 KB
    });

    const request = new Request('https://rongdhonutrade.com/api/auth/login', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      },
    });

    const response = await worker.fetch(request, mockEnv);
    expect(response.status).toBe(413);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Payload too large');
  });

  it('rejects review creation when image count exceeds MAX_REVIEW_IMAGE_COUNT (5)', async () => {
    // 6 images submitted (cap is 5)
    const images = Array(6).fill(VALID_1X1_PNG_DATA_URL);

    const body = JSON.stringify({
      review: {
        productId: 'prod-test-1',
        authorName: 'Efat Ahmed',
        comment: 'Great product with lots of photos',
        rating: 5,
        images,
      },
    });

    const request = new Request('https://rongdhonutrade.com/api/reviews', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await handleApiRequest(request, mockEnv);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Maximum 5 images allowed');
  });

  it('rejects review creation with corrupted Base64 image payload', async () => {
    const corruptedImage = 'data:image/jpeg;base64,Corrupted#Data@With$Symbols!';

    const body = JSON.stringify({
      review: {
        productId: 'prod-test-1',
        authorName: 'Efat Ahmed',
        comment: 'Review with bad image',
        rating: 5,
        images: [corruptedImage],
      },
    });

    const request = new Request('https://rongdhonutrade.com/api/reviews', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await handleApiRequest(request, mockEnv);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Malformed or corrupted Base64 image payload');
  });

  it('processes valid max-boundary checkout payload within 128 KB limit without 413', async () => {
    // Valid checkout payload of ~50 KB (well within 128 KB)
    const safePadding = 'A'.repeat(50 * 1024);
    const body = JSON.stringify({
      customer: { fullName: 'Rahim Khan', phone: '01711111111', fullAddress: 'Dhaka', district: 'Dhaka' },
      items: [{ productId: 'prod-1', quantity: 1 }],
      notes: safePadding,
    });

    const request = new Request('https://rongdhonutrade.com/api/orders', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      },
    });

    const response = await handleApiRequest(request, mockEnv);
    // Should NOT be 413 Payload Too Large!
    expect(response.status).not.toBe(413);
  });

  it('processes normal review submission with valid photos within all caps', async () => {
    const body = JSON.stringify({
      review: {
        productId: 'prod-test-1',
        authorName: 'Tanvir Hossain',
        comment: 'Excellent item, perfectly matching description!',
        rating: 5,
        images: [VALID_1X1_PNG_DATA_URL],
      },
    });

    const request = new Request('https://rongdhonutrade.com/api/reviews', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '198.51.100.99',
      },
    });

    const response = await handleApiRequest(request, mockEnv);
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.review.authorName).toBe('Tanvir Hossain');
    expect(json.review.images[0]).toContain('/api/reviews/images/');
  });

  it('rejects POST with body to non-API static route via worker.fetch with 413', async () => {
    const request = new Request('https://rongdhonutrade.com/robots.txt', {
      method: 'POST',
      body: JSON.stringify({ malicious: 'body' }),
      headers: {
        'Content-Length': '30',
        'Content-Type': 'application/json',
      },
    });

    const response = await worker.fetch(request, mockEnv);
    expect(response.status).toBe(413);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Non-API endpoints do not accept body payloads');
  });
});
