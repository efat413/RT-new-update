import { describe, it, expect, vi, beforeEach } from 'vitest';
import { productsApi } from '../src/services/storeApi';
import { getProductById } from '../src/server/db';
import worker from '../src/worker';
import { Product } from '../src/types';

describe('Direct Product Share Link Resolution & Race Condition Hardening Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. productsApi.getByIdDetailed & Decoupled Resolution', () => {
    it('resolves product directly with HTTP 200 without waiting for global catalog', async () => {
      const mockProduct: Product = {
        id: 'prod-excel-ep-06',
        slug: 'excel-ep-06-20000mah-22-5w-power-bank',
        title: 'Excel EP-06 20000mAh Power Bank',
        price: 1850,
        categoryId: 'cat-gadgets',
        description: 'High capacity power bank',
        imageUrl: 'https://images.unsplash.com/photo-1609592424367-938d2f116a44',
        images: ['https://images.unsplash.com/photo-1609592424367-938d2f116a44'],
        stock: 15,
        featured: true,
        rating: 4.9,
        reviewsCount: 12,
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            product: mockProduct,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const result = await productsApi.getByIdDetailed('excel-ep-06-20000mah-22-5w-power-bank');
      expect(result.success).toBe(true);
      expect(result.product).toEqual(mockProduct);
      expect(result.status).toBe(200);
      expect(result.isNotFound).toBe(false);
      expect(result.isNetworkOrServerError).toBe(false);
    });

    it('correctly categorizes HTTP 404 as genuine not found', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: 'Product not found',
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const result = await productsApi.getByIdDetailed('nonexistent-product-slug');
      expect(result.success).toBe(false);
      expect(result.product).toBeNull();
      expect(result.status).toBe(404);
      expect(result.isNotFound).toBe(true);
      expect(result.isNetworkOrServerError).toBe(false);
    });

    it('correctly categorizes HTTP 500 / network error as recoverable error, NOT 404', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: 'Database connection failed',
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const result = await productsApi.getByIdDetailed('excel-ep-06-20000mah-22-5w-power-bank');
      expect(result.success).toBe(false);
      expect(result.product).toBeNull();
      expect(result.status).toBe(500);
      expect(result.isNotFound).toBe(false);
      expect(result.isNetworkOrServerError).toBe(true);
    });

    it('handles network timeout or offline exception gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await productsApi.getByIdDetailed('excel-ep-06-20000mah-22-5w-power-bank');
      expect(result.success).toBe(false);
      expect(result.product).toBeNull();
      expect(result.status).toBe(0);
      expect(result.isNotFound).toBe(false);
      expect(result.isNetworkOrServerError).toBe(true);
    });

    it('propagates AbortError when AbortSignal is cancelled', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        productsApi.getByIdDetailed('excel-ep-06-20000mah-22-5w-power-bank', { signal: controller.signal })
      ).rejects.toThrow();
    });
  });

  describe('2. D1 Database Product Resolution (ID, Slug, Case-Insensitive, Historical)', () => {
    it('resolves product by exact slug in D1', async () => {
      const mockRow = {
        id: 'prod-excel-ep-06',
        slug: 'excel-ep-06-20000mah-22-5w-power-bank',
        title: 'Excel EP-06 20000mAh Power Bank',
        price: 1850,
        original_price: 2200,
        buying_price: 1100,
        category_id: 'cat-gadgets',
        description: 'High capacity power bank',
        image_url: 'https://images.unsplash.com/photo-1609592424367-938d2f116a44',
        images_json: JSON.stringify(['https://images.unsplash.com/photo-1609592424367-938d2f116a44']),
        stock: 15,
        featured: 1,
        featured_sort_order: 1,
        rating: 4.9,
        reviews_count: 12,
        specs_json: '[]',
        sizes_json: '[]',
        colors_json: '[]',
        sku: 'EP-06-BLK',
        video_url: null,
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };

      const mockDb: any = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: Object.keys(mockRow).map((name) => ({ name })),
          }),
          first: vi.fn().mockResolvedValue(mockRow),
        }),
      };

      const prod = await getProductById(mockDb, 'excel-ep-06-20000mah-22-5w-power-bank');
      expect(prod).not.toBeNull();
      expect(prod?.id).toBe('prod-excel-ep-06');
      expect(prod?.slug).toBe('excel-ep-06-20000mah-22-5w-power-bank');
      expect(prod?.title).toBe('Excel EP-06 20000mAh Power Bank');
    });

    it('resolves product by internal ID in D1', async () => {
      const mockRow = {
        id: 'prod-excel-ep-06',
        slug: 'excel-ep-06-20000mah-22-5w-power-bank',
        title: 'Excel EP-06 20000mAh Power Bank',
        price: 1850,
        category_id: 'cat-gadgets',
        image_url: 'https://images.unsplash.com/photo-1609592424367-938d2f116a44',
        stock: 15,
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
      };

      const mockDb: any = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: Object.keys(mockRow).map((name) => ({ name })),
          }),
          first: vi.fn().mockResolvedValue(mockRow),
        }),
      };

      const prod = await getProductById(mockDb, 'prod-excel-ep-06');
      expect(prod).not.toBeNull();
      expect(prod?.id).toBe('prod-excel-ep-06');
    });

    it('resolves product via historical slug alias when current slug was renamed', async () => {
      const mockUpdatedRow = {
        id: 'prod-excel-ep-06',
        slug: 'excel-ep-06-20000mah-new-edition',
        title: 'Excel EP-06 20000mAh Power Bank (New Edition)',
        price: 1950,
        category_id: 'cat-gadgets',
        image_url: 'https://images.unsplash.com/photo-1609592424367-938d2f116a44',
        stock: 10,
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
      };

      let queryCount = 0;
      const mockDb: any = {
        prepare: vi.fn().mockImplementation((sql: string) => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: Object.keys(mockUpdatedRow).map((name) => ({ name })),
          }),
          first: vi.fn().mockImplementation(async () => {
            queryCount++;
            // First query against products table returns null (old slug not in products)
            if (sql.includes('FROM products WHERE')) {
              return null;
            }
            // Second query against product_slug_history joins products and returns row
            if (sql.includes('product_slug_history')) {
              return mockUpdatedRow;
            }
            return null;
          }),
        })),
      };

      const prod = await getProductById(mockDb, 'excel-ep-06-20000mah-22-5w-power-bank');
      expect(prod).not.toBeNull();
      expect(prod?.id).toBe('prod-excel-ep-06');
      expect(prod?.slug).toBe('excel-ep-06-20000mah-new-edition');
    });

    it('returns null cleanly for empty or nonexistent identifier', async () => {
      const mockDb: any = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
        }),
      };

      const prodEmpty = await getProductById(mockDb, '');
      expect(prodEmpty).toBeNull();

      const prodMissing = await getProductById(mockDb, 'totally-fake-slug-404');
      expect(prodMissing).toBeNull();
    });
  });

  describe('3. Cloudflare Worker Edge Product Routing & SSR Parity', () => {
    it('redirects legacy query parameter ?product=slug to canonical /product/:slug (301)', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [{ name: 'id' }, { name: 'slug' }, { name: 'title' }, { name: 'price' }, { name: 'category_id' }] }),
            first: vi.fn().mockResolvedValue({
              id: 'prod-excel-ep-06',
              slug: 'excel-ep-06-20000mah-22-5w-power-bank',
              title: 'Excel EP-06 Power Bank',
              price: 1850,
              category_id: 'cat-gadgets',
              status: 'active',
              created_at: '2026-01-01T00:00:00.000Z',
            }),
          }),
        },
      };

      const req = new Request('https://rongdhonutrade.com/?product=excel-ep-06-20000mah-22-5w-power-bank');
      const res = await worker.fetch(req, mockEnv);

      expect(res.status).toBe(301);
      expect(res.headers.get('Location')).toContain('/product/excel-ep-06-20000mah-22-5w-power-bank');
    });

    it('redirects legacy product ID /product/prod-id to canonical SEO slug (301)', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [{ name: 'id' }, { name: 'slug' }, { name: 'title' }, { name: 'price' }, { name: 'category_id' }] }),
            first: vi.fn().mockResolvedValue({
              id: 'prod-excel-ep-06',
              slug: 'excel-ep-06-20000mah-22-5w-power-bank',
              title: 'Excel EP-06 Power Bank',
              price: 1850,
              category_id: 'cat-gadgets',
              status: 'active',
              created_at: '2026-01-01T00:00:00.000Z',
            }),
          }),
        },
      };

      const req = new Request('https://rongdhonutrade.com/product/prod-excel-ep-06');
      const res = await worker.fetch(req, mockEnv);

      expect(res.status).toBe(301);
      expect(res.headers.get('Location')).toContain('/product/excel-ep-06-20000mah-22-5w-power-bank');
    });

    it('returns genuine HTTP 404 for truly missing product', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [{ name: 'id' }, { name: 'slug' }, { name: 'title' }, { name: 'price' }] }),
            first: vi.fn().mockResolvedValue(null),
          }),
        },
      };

      const req = new Request('https://rongdhonutrade.com/product/non-existent-product-abc');
      const res = await worker.fetch(req, mockEnv);

      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toContain('Product Not Found');
    });

    it('serves SPA fallback HTML on transient D1 error to let client React resolve and retry', async () => {
      const mockEnv: any = {
        DB: {
          prepare: vi.fn().mockImplementation(() => {
            throw new Error('D1_TEMPORARY_UNAVAILABLE');
          }),
        },
      };

      const req = new Request('https://rongdhonutrade.com/product/excel-ep-06-20000mah-22-5w-power-bank');
      const res = await worker.fetch(req, mockEnv);

      // On transient database failure, does NOT emit false 404; serves SPA shell with HTTP 200
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('<div id="root"></div>');
    });
  });

  describe('4. Race Condition & Decoupled Resolution Hardening', () => {
    it('resolves product case-insensitively in D1 (e.g. EXCEL-EP-06-...)', async () => {
      const mockRow = {
        id: 'prod-excel-ep-06',
        slug: 'excel-ep-06-20000mah-22-5w-power-bank',
        title: 'Excel EP-06 20000mAh Power Bank',
        price: 1850,
        category_id: 'cat-gadgets',
        image_url: 'https://images.unsplash.com/photo-1609592424367-938d2f116a44',
        stock: 15,
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
      };

      const mockDb: any = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: Object.keys(mockRow).map((name) => ({ name })),
          }),
          first: vi.fn().mockResolvedValue(mockRow),
        }),
      };

      const prod = await getProductById(mockDb, 'EXCEL-EP-06-20000MAH-22-5W-POWER-BANK');
      expect(prod).not.toBeNull();
      expect(prod?.id).toBe('prod-excel-ep-06');
    });

    it('falls back to slugified title if product has no slug set in D1', async () => {
      const mockLegacyRow = {
        id: 'prod-legacy-item',
        slug: null,
        title: 'Legacy Power Adapter 45W',
        price: 1200,
        category_id: 'cat-gadgets',
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
      };

      let queryIndex = 0;
      const mockDb: any = {
        prepare: vi.fn().mockImplementation((sql: string) => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(async () => {
            if (sql.includes('SELECT') && sql.includes('FROM products WHERE status =')) {
              return { results: [mockLegacyRow] };
            }
            return { results: Object.keys(mockLegacyRow).map((name) => ({ name })) };
          }),
          first: vi.fn().mockImplementation(async () => {
            queryIndex++;
            return null; // neither id/slug nor history matches
          }),
        })),
      };

      const prod = await getProductById(mockDb, 'legacy-power-adapter-45w');
      expect(prod).not.toBeNull();
      expect(prod?.id).toBe('prod-legacy-item');
      expect(prod?.title).toBe('Legacy Power Adapter 45W');
    });

    it('caller AbortSignal cleanly throws AbortError without converting to 408 error object', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        productsApi.getByIdDetailed('excel-ep-06-20000mah-22-5w-power-bank', { signal: controller.signal })
      ).rejects.toThrow();
    });
  });
});
