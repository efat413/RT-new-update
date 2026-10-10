import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleApiRequest } from '../src/server/router';
import { Env } from '../src/server/types';

describe('Homepage Payload De-duplication Contract & Schema Tests', () => {
  const mockCategories = [
    { id: 'cat-electronics', name: 'Electronics', slug: 'electronics' },
    { id: 'cat-fashion', name: 'Fashion', slug: 'fashion' },
  ];

  const mockSliders = [
    { id: 'slider-1', title: 'Big Sale', headline: 'Mega Discount', image_url: 'https://example.com/banner.jpg', sort_order: 1 },
  ];

  const mockSettings = {
    storeName: 'Rongdhonu Trade',
    currency: 'BDT',
    siteTitle: 'Best Store',
  };

  // Product 1 is both in cat-electronics and featured
  const rawProduct1 = {
    id: 'prod-1',
    slug: 'smartphone-xyz',
    title: 'Smartphone XYZ',
    price: 15000,
    original_price: 18000,
    buying_price: 12000,
    category_id: 'cat-electronics',
    description: 'A very very long product description taking lots of bytes...',
    image_url: 'https://example.com/phone.jpg',
    images_json: JSON.stringify(['https://example.com/phone.jpg', 'https://example.com/phone2.jpg']),
    stock: 25,
    featured: 1,
    featured_sort_order: 1,
    rating: 4.8,
    reviews_count: 14,
    specs_json: JSON.stringify([{ label: 'RAM', value: '8GB' }]),
    sizes_json: JSON.stringify([]),
    colors_json: JSON.stringify(['#000000', '#ffffff']),
    sku: 'SKU-PHONE-1',
    video_url: null,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  // Product 2 is in cat-fashion only
  const rawProduct2 = {
    id: 'prod-2',
    slug: 'cotton-tshirt',
    title: 'Cotton T-Shirt',
    price: 650,
    original_price: 800,
    buying_price: 350,
    category_id: 'cat-fashion',
    description: 'High grade combed cotton t-shirt with premium stitching details...',
    image_url: 'https://example.com/shirt.jpg',
    images_json: JSON.stringify(['https://example.com/shirt.jpg']),
    stock: 50,
    featured: 0,
    featured_sort_order: 0,
    rating: 4.9,
    reviews_count: 8,
    specs_json: JSON.stringify([{ label: 'Fabric', value: '100% Cotton' }]),
    sizes_json: JSON.stringify(['M', 'L', 'XL']),
    colors_json: JSON.stringify(['#navy', '#maroon']),
    sku: 'SKU-SHIRT-2',
    video_url: null,
    status: 'active',
    created_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-04T00:00:00Z',
  };

  function createMockEnv(): Env {
    return {
      DB: {
        prepare: vi.fn().mockImplementation((query: string) => {
          let bindings: any[] = [];
          const stmt = {
            bind: vi.fn().mockImplementation((...args: any[]) => {
              bindings = args;
              return stmt;
            }),
            all: vi.fn().mockImplementation(async () => {
              if (query.includes('FROM store_settings')) {
                return {
                  success: true,
                  results: [
                    { key: 'site_settings', value: JSON.stringify(mockSettings) },
                  ],
                };
              }
              if (query.includes('FROM categories')) {
                return { success: true, results: mockCategories };
              }
              if (query.includes('FROM sliders')) {
                return { success: true, results: mockSliders };
              }
              if (query.includes('featured = 1')) {
                return { success: true, results: [rawProduct1] };
              }
              if (query.includes('RankedProducts')) {
                return { success: true, results: [rawProduct1, rawProduct2] };
              }
              return { success: true, results: [] };
            }),
            first: vi.fn().mockImplementation(async () => null),
            run: vi.fn().mockImplementation(async () => ({ success: true })),
          };
          return stmt;
        }),
        batch: vi.fn().mockImplementation(async (stmts: any[]) => {
          return Promise.all(stmts.map((s) => s.all()));
        }),
      } as any,
    };
  }

  it('1. GET /api/store/homepage returns 200 with valid contract and de-duplicated products', async () => {
    const env = createMockEnv();
    const req = new Request('http://localhost:3000/api/store/homepage', {
      method: 'GET',
    });

    const res = await handleApiRequest(req, env);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify root contract keys
    expect(body).toHaveProperty('settings');
    expect(body).toHaveProperty('categories');
    expect(body).toHaveProperty('slides');
    expect(body).toHaveProperty('categoryProducts');
    expect(body).toHaveProperty('featuredProducts');
    expect(body).toHaveProperty('products');

    // Verify categories & sliders integrity
    expect(body.categories).toHaveLength(2);
    expect(body.slides).toHaveLength(1);

    // Verify category products mapping
    expect(body.categoryProducts).toHaveProperty('cat-electronics');
    expect(body.categoryProducts).toHaveProperty('cat-fashion');
    expect(body.categoryProducts['cat-electronics']).toHaveLength(1);
    expect(body.categoryProducts['cat-fashion']).toHaveLength(1);

    // Verify featured products
    expect(body.featuredProducts).toHaveLength(1);
    expect(body.featuredProducts[0].id).toBe('prod-1');

    // Verify products collection is de-duplicated (prod-1 only appears once despite being in categoryProducts and featuredProducts)
    const productIds = body.products.map((p: any) => p.id);
    const uniqueIds = Array.from(new Set(productIds));
    expect(productIds.length).toBe(uniqueIds.length);
    expect(body.products).toHaveLength(2);
  });

  it('2. Asserts zero schema regressions and preservation of essential card fields', async () => {
    const env = createMockEnv();
    const req = new Request('http://localhost:3000/api/store/homepage', {
      method: 'GET',
    });

    const res = await handleApiRequest(req, env);
    const body = await res.json();

    const checkProductShape = (p: any) => {
      // Required card fields
      expect(p.id).toBeDefined();
      expect(p.title).toBeDefined();
      expect(p.slug).toBeDefined();
      expect(p.price).toBeGreaterThan(0);
      expect(p.stock).toBeDefined();
      expect(p.imageUrl).toBeDefined();
      expect(p.categoryId).toBeDefined();
      expect(p.rating).toBeDefined();

      // Compatibility aliases
      expect(p.name).toBe(p.title);
      expect(p.sale_price).toBe(p.price);
      expect(p.main_image).toBe(p.imageUrl);
      expect(p.category_id).toBe(p.categoryId);
      expect(p.stock_status).toBe('instock');
      expect(typeof p.display_order).toBe('number');

      // Sensitive financial fields must be stripped for public storefront
      expect(p.buyingPrice).toBeUndefined();
      expect(p.buying_price).toBeUndefined();
      expect(p.unitProfit).toBeUndefined();
      expect(p.unit_profit).toBeUndefined();

      // Heavyweight long description must be stripped from listing payload
      expect(p.description).toBeUndefined();
    };

    // Assert schema across all sections
    body.featuredProducts.forEach(checkProductShape);
    body.categoryProducts['cat-electronics'].forEach(checkProductShape);
    body.categoryProducts['cat-fashion'].forEach(checkProductShape);
    body.products.forEach(checkProductShape);
  });

  it('3. Preserves out-of-stock representation correctly in card payload', async () => {
    const outOfStockRow = {
      ...rawProduct2,
      id: 'prod-out-of-stock',
      stock: 0,
    };

    const env = {
      DB: {
        prepare: vi.fn().mockImplementation((query: string) => {
          let bindings: any[] = [];
          const stmt: any = {
            bind: vi.fn().mockImplementation((...args: any[]) => {
              bindings = args;
              return stmt;
            }),
            all: vi.fn().mockImplementation(async () => {
              if (query.includes('FROM store_settings')) return { success: true, results: [{ key: 'site_settings', value: JSON.stringify(mockSettings) }] };
              if (query.includes('FROM categories')) return { success: true, results: mockCategories };
              if (query.includes('FROM sliders')) return { success: true, results: mockSliders };
              if (query.includes('featured = 1')) return { success: true, results: [] };
              if (query.includes('RankedProducts')) return { success: true, results: [outOfStockRow] };
              return { success: true, results: [] };
            }),
          };
          return stmt;
        }),
        batch: vi.fn().mockImplementation(async (stmts: any[]) => Promise.all(stmts.map((s) => s.all()))),
      } as any,
    };

    const req = new Request('http://localhost:3000/api/store/homepage', { method: 'GET' });
    const res = await handleApiRequest(req, env);
    const body = await res.json();

    const prod = body.categoryProducts['cat-fashion'][0];
    expect(prod.stock).toBe(0);
    expect(prod.stock_status).toBe('outofstock');
  });
});
