import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleApiRequest } from '../src/server/router';
import { getProductById } from '../src/server/db';
import { Env } from '../src/server/types';
import worker from '../src/worker';

describe('Direct Product Share Link Resolution & Race Condition Hardening Suite', () => {
  const mockProduct = {
    id: 'prod-powerbank-101',
    slug: 'excel-ep-06-20000mah-22-5w-power-bank',
    title: 'Excel EP-06 20000mAh 22.5W Power Bank',
    price: 1850,
    original_price: 2400,
    buying_price: 1100,
    category_id: 'cat-electronics',
    description: 'High capacity 20000mAh fast charging power bank with digital display.',
    image_url: 'https://example.com/powerbank.jpg',
    images_json: JSON.stringify(['https://example.com/powerbank.jpg']),
    stock: 45,
    featured: 1,
    featured_sort_order: 1,
    rating: 4.9,
    reviews_count: 28,
    specs_json: JSON.stringify([{ label: 'Capacity', value: '20000mAh' }]),
    sizes_json: JSON.stringify([]),
    colors_json: JSON.stringify(['Black', 'White']),
    sku: 'EXCEL-EP06-PB',
    video_url: 'https://youtube.com/watch?v=mock123',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  const mockHistoricalSlug = {
    id: 'hist-slug-1',
    product_id: 'prod-powerbank-101',
    slug: 'old-excel-powerbank-20000mah',
    created_at: '2025-12-01T00:00:00Z',
  };

  let mockDb: any;
  let mockEnv: Env;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn((query: string) => {
        return {
          bind: vi.fn((...args: any[]) => {
            return {
              first: vi.fn(async () => {
                const normQuery = query.toLowerCase();

                // PRAGMA table_info
                if (normQuery.includes('pragma table_info')) {
                  return null;
                }

                // Querying products table by id or slug
                if (normQuery.includes('from products where id = ? or slug = ?')) {
                  const [argId, argSlug] = args;
                  if (
                    argId === mockProduct.id ||
                    argSlug === mockProduct.slug ||
                    argId === mockProduct.slug
                  ) {
                    return { ...mockProduct };
                  }
                  return null;
                }

                // Querying historical slugs in product_slug_history
                if (normQuery.includes('from product_slug_history psh')) {
                  const [histArg] = args;
                  if (histArg === mockHistoricalSlug.slug) {
                    return { ...mockProduct };
                  }
                  return null;
                }

                // Querying case-insensitive fallback
                if (normQuery.includes('lower(id) = lower(?) or lower(slug) = lower(?)')) {
                  const [arg1] = args;
                  if (
                    String(arg1).toLowerCase() === mockProduct.slug.toLowerCase() ||
                    String(arg1).toLowerCase() === mockProduct.id.toLowerCase()
                  ) {
                    return { ...mockProduct };
                  }
                  return null;
                }

                return null;
              }),
              all: vi.fn(async () => {
                if (query.toLowerCase().includes('pragma table_info')) {
                  return {
                    results: [
                      { name: 'id' },
                      { name: 'slug' },
                      { name: 'title' },
                      { name: 'price' },
                      { name: 'original_price' },
                      { name: 'buying_price' },
                      { name: 'category_id' },
                      { name: 'description' },
                      { name: 'image_url' },
                      { name: 'images_json' },
                      { name: 'stock' },
                      { name: 'featured' },
                      { name: 'featured_sort_order' },
                      { name: 'rating' },
                      { name: 'reviews_count' },
                      { name: 'specs_json' },
                      { name: 'sizes_json' },
                      { name: 'colors_json' },
                      { name: 'sku' },
                      { name: 'video_url' },
                      { name: 'status' },
                      { name: 'created_at' },
                      { name: 'updated_at' },
                    ],
                  };
                }
                return { results: [] };
              }),
              run: vi.fn(async () => ({ success: true })),
            };
          }),
        };
      }),
    };

    mockEnv = {
      DB: mockDb,
      ADMIN_SECRET: 'test-admin-secret-999',
      COURIER_WEBHOOK_SECRET: 'test-webhook-secret-999',
    } as unknown as Env;
  });

  describe('1. Decoupled Direct Product API Resolution', () => {
    it('resolves product directly by canonical SEO slug via /api/products/:slug', async () => {
      const req = new Request(
        `https://rongdhonutrade.com/api/products/${encodeURIComponent(mockProduct.slug)}`,
        { method: 'GET' }
      );
      const res = await handleApiRequest(req, mockEnv);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.product.id).toBe(mockProduct.id);
      expect(data.product.slug).toBe(mockProduct.slug);
      expect(data.product.title).toBe(mockProduct.title);
      // Public view strips confidential buyingPrice
      expect(data.product.buyingPrice).toBeUndefined();
    });

    it('resolves product directly by internal ID via /api/products/:id', async () => {
      const req = new Request(
        `https://rongdhonutrade.com/api/products/${mockProduct.id}`,
        { method: 'GET' }
      );
      const res = await handleApiRequest(req, mockEnv);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.product.id).toBe(mockProduct.id);
      expect(data.product.slug).toBe(mockProduct.slug);
    });

    it('resolves product via historical alias from product_slug_history table', async () => {
      const req = new Request(
        `https://rongdhonutrade.com/api/products/${encodeURIComponent(mockHistoricalSlug.slug)}`,
        { method: 'GET' }
      );
      const res = await handleApiRequest(req, mockEnv);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.product.id).toBe(mockProduct.id);
      expect(data.product.slug).toBe(mockProduct.slug);
    });

    it('resolves product with case-insensitive slug matching', async () => {
      const upperSlug = mockProduct.slug.toUpperCase();
      const req = new Request(
        `https://rongdhonutrade.com/api/products/${encodeURIComponent(upperSlug)}`,
        { method: 'GET' }
      );
      const res = await handleApiRequest(req, mockEnv);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.product.id).toBe(mockProduct.id);
    });
  });

  describe('2. Error Boundaries & 404 vs 5xx Distinction', () => {
    it('returns genuine 404 for non-existent product without technical internal leaks', async () => {
      const req = new Request(
        'https://rongdhonutrade.com/api/products/non-existent-product-slug-999',
        { method: 'GET' }
      );
      const res = await handleApiRequest(req, mockEnv);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Product not found');
    });

    it('returns genuine 500 when D1 encounters an unexpected database failure', async () => {
      const failingDb = {
        prepare: vi.fn(() => {
          throw new Error('D1_INTERNAL_LOCK_ERROR: Database disk image is locked');
        }),
      };
      const failingEnv = { ...mockEnv, DB: failingDb as any };

      const req = new Request(
        `https://rongdhonutrade.com/api/products/${mockProduct.slug}`,
        { method: 'GET' }
      );
      const res = await handleApiRequest(req, failingEnv);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Internal server error.');
      // Never leaks internal database strings in 500 responses
      expect(JSON.stringify(data)).not.toContain('D1_INTERNAL_LOCK_ERROR');
    });
  });

  describe('3. Cloudflare Worker Edge Route Resilience', () => {
    it('returns 301 redirect from legacy query param (?product=...) to canonical slug route', async () => {
      const req = new Request(
        `https://rongdhonutrade.com/?product=${mockProduct.id}`,
        { method: 'GET' }
      );
      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(301);
      const location = res.headers.get('Location');
      expect(location).toContain(`/product/${encodeURIComponent(mockProduct.slug)}`);
    });

    it('returns 301 redirect when accessing product ID path (/product/prod-...) if slug exists', async () => {
      const req = new Request(
        `https://rongdhonutrade.com/product/${mockProduct.id}`,
        { method: 'GET' }
      );
      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(301);
      const location = res.headers.get('Location');
      expect(location).toContain(`/product/${encodeURIComponent(mockProduct.slug)}`);
    });

    it('serves SPA HTML shell with 200 on direct /product/:slug when product is valid', async () => {
      const mockAssets = {
        fetch: vi.fn(async () => {
          return new Response('<!doctype html><html><head><title>Test</title></head><body><div id="root"></div></body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          });
        }),
      };
      const workerEnv = { ...mockEnv, ASSETS: mockAssets as any };
      const req = new Request(
        `https://rongdhonutrade.com/product/${encodeURIComponent(mockProduct.slug)}`,
        { method: 'GET' }
      );
      const res = await worker.fetch(req, workerEnv);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(mockProduct.title);
      expect(html).toContain('schema-product');
      expect(html).toContain(mockProduct.slug);
    });

    it('gracefully falls back to SPA shell (HTTP 200) instead of dead-end 404 when D1 has a transient outage', async () => {
      const failingDb = {
        prepare: vi.fn(() => {
          throw new Error('D1_READ_OUTAGE: Connection to edge replica timed out');
        }),
      };
      const mockAssets = {
        fetch: vi.fn(async () => {
          return new Response('<!doctype html><html><head><title>Test SPA</title></head><body><div id="root"></div></body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          });
        }),
      };
      const workerEnv = { ...mockEnv, DB: failingDb as any, ASSETS: mockAssets as any };
      const req = new Request(
        `https://rongdhonutrade.com/product/${encodeURIComponent(mockProduct.slug)}`,
        { method: 'GET' }
      );
      const res = await worker.fetch(req, workerEnv);
      // Must NOT return hard 404 on DB error!
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('root');
    });
  });

  describe('4. Direct Resolution DB Helper Tests', () => {
    it('getProductById handles whitespace-padded product identifiers cleanly', async () => {
      const res = await getProductById(mockDb, `  ${mockProduct.id}  `);
      expect(res).not.toBeNull();
      expect(res?.id).toBe(mockProduct.id);
    });

    it('getProductById returns null for empty or null strings without throwing', async () => {
      const res = await getProductById(mockDb, '');
      expect(res).toBeNull();
    });
  });
});
