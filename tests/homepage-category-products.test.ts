import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleApiRequest } from '../src/server/router';
import { Env } from '../src/server/types';
import { createAuthToken, getAuthSecret } from '../src/server/auth';

describe('Custom Homepage Category Products Selection & Ordering Tests', () => {
  // Test categories
  const catA = { id: 'cat-a', name: 'Category A', slug: 'category-a' };
  const catB = { id: 'cat-b', name: 'Category B', slug: 'category-b' };
  const mockCategories = [catA, catB];

  // 10 products for Category A (created sequentially from 1 to 10)
  const categoryAProducts = Array.from({ length: 10 }, (_, i) => {
    const num = i + 1;
    return {
      id: `prod-a-${num}`,
      slug: `product-a-${num}`,
      title: `Product A-${num}`,
      price: 100 * num,
      original_price: 120 * num,
      category_id: 'cat-a',
      description: `Description for product A-${num}`,
      image_url: `https://example.com/a-${num}.jpg`,
      images_json: JSON.stringify([`https://example.com/a-${num}.jpg`]),
      stock: 10,
      featured: 0,
      featured_sort_order: 0,
      rating: 5,
      reviews_count: 1,
      specs_json: JSON.stringify([]),
      sizes_json: JSON.stringify([]),
      colors_json: JSON.stringify([]),
      sku: `SKU-A-${num}`,
      status: 'active',
      created_at: `2026-01-${String(num).padStart(2, '0')}T00:00:00Z`,
      updated_at: `2026-01-${String(num).padStart(2, '0')}T00:00:00Z`,
    };
  });

  // 6 products for Category B
  const categoryBProducts = Array.from({ length: 6 }, (_, i) => {
    const num = i + 1;
    return {
      id: `prod-b-${num}`,
      slug: `product-b-${num}`,
      title: `Product B-${num}`,
      price: 50 * num,
      original_price: 60 * num,
      category_id: 'cat-b',
      description: `Description for product B-${num}`,
      image_url: `https://example.com/b-${num}.jpg`,
      images_json: JSON.stringify([`https://example.com/b-${num}.jpg`]),
      stock: 15,
      featured: 0,
      featured_sort_order: 0,
      rating: 4.5,
      reviews_count: 2,
      specs_json: JSON.stringify([]),
      sizes_json: JSON.stringify([]),
      colors_json: JSON.stringify([]),
      sku: `SKU-B-${num}`,
      status: 'active',
      created_at: `2026-02-${String(num).padStart(2, '0')}T00:00:00Z`,
      updated_at: `2026-02-${String(num).padStart(2, '0')}T00:00:00Z`,
    };
  });

  // State in mock database for homepage_category_products
  let dbHomepageCategoryProducts: { category_id: string; product_id: string; sort_order: number }[] = [];
  let allCatalogProducts = [...categoryAProducts, ...categoryBProducts];

  const mockAdminUser = {
    id: 'admin-id-1',
    name: 'Super Admin',
    email: 'admin@rongdhonutrade.com',
    role: 'super_admin',
    permissions_json: JSON.stringify({
      canManageCategories: true,
      canManageProducts: true,
      'category.manage': true,
      'product.update': true,
      'settings.manage': true,
    }),
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
  };

  function createMockEnv(): Env {
    return {
      ADMIN_SECRET: 'test-admin-secret-key-32-chars-long!',
      DEV: true,
      DB: {
        prepare: vi.fn().mockImplementation((query: string) => {
          let stmtBindings: any[] = [];
          const stmt = {
            bind: vi.fn().mockImplementation((...args: any[]) => {
              stmtBindings = args;
              return stmt;
            }),
            all: vi.fn().mockImplementation(async () => {
              if (query.includes('FROM store_settings')) {
                return {
                  success: true,
                  results: [{ key: 'site_settings', value: JSON.stringify({ storeName: 'Rongdhonu Trade' }) }],
                };
              }
              if (query.includes('FROM categories')) {
                return { success: true, results: mockCategories };
              }
              if (query.includes('FROM sliders')) {
                return { success: true, results: [] };
              }
              if (query.includes('featured = 1')) {
                return { success: true, results: [] };
              }
              // Configured category ids query
              if (query.includes('SELECT DISTINCT category_id FROM homepage_category_products')) {
                const uniqueCatIds = Array.from(new Set(dbHomepageCategoryProducts.map((h) => h.category_id)));
                return {
                  success: true,
                  results: uniqueCatIds.map((cid) => ({ category_id: cid })),
                };
              }
              // Custom homepage category products query
              if (query.includes('FROM homepage_category_products hcp')) {
                const sorted = [...dbHomepageCategoryProducts].sort((a, b) => a.sort_order - b.sort_order);
                const results = sorted
                  .map((h) => {
                    const prod = allCatalogProducts.find((p) => p.id === h.product_id && p.category_id === h.category_id && p.status === 'active');
                    if (!prod) return null;
                    return {
                      ...prod,
                      hcp_cat_id: h.category_id,
                      hcp_sort: h.sort_order,
                    };
                  })
                  .filter(Boolean);

                return { success: true, results };
              }
              // Window ranked query for unconfigured categories
              if (query.includes('RankedProducts')) {
                const catAGroup = allCatalogProducts
                  .filter((p) => p.category_id === 'cat-a' && p.status === 'active')
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .slice(0, 5);
                const catBGroup = allCatalogProducts
                  .filter((p) => p.category_id === 'cat-b' && p.status === 'active')
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .slice(0, 5);

                return { success: true, results: [...catAGroup, ...catBGroup] };
              }
              // All configs query for getAllHomepageCategoryProductConfigs
              if (query.includes('SELECT category_id, product_id FROM homepage_category_products')) {
                const sorted = [...dbHomepageCategoryProducts].sort((a, b) => a.sort_order - b.sort_order);
                return { success: true, results: sorted };
              }
              // Specific category products config
              if (query.includes('SELECT product_id, sort_order FROM homepage_category_products WHERE category_id = ?')) {
                const categoryId = stmtBindings[0];
                const rows = dbHomepageCategoryProducts
                  .filter((h) => h.category_id === categoryId)
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((h) => ({ product_id: h.product_id, sort_order: h.sort_order }));
                return { success: true, results: rows };
              }
              if (query.includes('SELECT') && query.includes('FROM products') && query.includes('IN (')) {
                // Fetch products for getHomepageCategoryProductsConfig
                const cleanCatId = stmtBindings[stmtBindings.length - 1];
                const pids = stmtBindings.slice(0, stmtBindings.length - 1);
                const results = pids
                  .map((pid) => allCatalogProducts.find((p) => p.id === pid && p.category_id === cleanCatId && p.status === 'active'))
                  .filter(Boolean);
                return { success: true, results };
              }
              // Audit log
              if (query.includes('INSERT INTO audit_logs')) {
                return { success: true, results: [] };
              }
              return { success: true, results: [] };
            }),
            first: vi.fn().mockImplementation(async () => {
              if (query.includes('FROM users')) {
                return mockAdminUser;
              }
              if (query.includes('SELECT id FROM categories WHERE id = ?')) {
                const categoryId = stmtBindings[0];
                const found = mockCategories.find((c) => c.id === categoryId);
                return found || null;
              }
              if (query.includes('SELECT id FROM products WHERE id = ? AND category_id = ?')) {
                const [pid, cid] = stmtBindings;
                const found = allCatalogProducts.find((p) => p.id === pid && p.category_id === cid && p.status === 'active');
                return found || null;
              }
              if (query.includes('COUNT(product_id) as count FROM homepage_category_products WHERE category_id = ?')) {
                const categoryId = stmtBindings[0];
                const count = dbHomepageCategoryProducts.filter((h) => h.category_id === categoryId).length;
                return { count };
              }
              return null;
            }),
            run: vi.fn().mockImplementation(async () => {
              if (query.includes('DELETE FROM homepage_category_products WHERE category_id = ?')) {
                const categoryId = stmtBindings[0];
                dbHomepageCategoryProducts = dbHomepageCategoryProducts.filter((h) => h.category_id !== categoryId);
                return { success: true };
              }
              if (query.includes('INSERT INTO homepage_category_products')) {
                const [cid, pid, sortOrder] = stmtBindings;
                dbHomepageCategoryProducts.push({ category_id: cid, product_id: pid, sort_order: sortOrder });
                return { success: true };
              }
              return { success: true };
            }),
          };
          return stmt;
        }),
        batch: vi.fn().mockImplementation(async (stmts: any[]) => {
          const results = [];
          for (const s of stmts) {
            const allRes = await s.all();
            await s.run();
            results.push(allRes);
          }
          return results;
        }),
      } as any,
    };
  }

  beforeEach(() => {
    dbHomepageCategoryProducts = [];
    allCatalogProducts = [...categoryAProducts, ...categoryBProducts];
  });

  async function getAdminToken(env: Env) {
    const secret = getAuthSecret(env);
    return createAuthToken(
      {
        userId: mockAdminUser.id,
        email: mockAdminUser.email,
        role: mockAdminUser.role,
      },
      secret
    );
  }

  it('1. Default behavior: Homepage category displays 5 most recent products when unconfigured', async () => {
    const env = createMockEnv();
    const req = new Request('https://rongdhonutrade.com/api/store/homepage', { method: 'GET' });
    const res = await handleApiRequest(req, env);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // In default mode, Category A has 5 latest products (10, 9, 8, 7, 6)
    const catAProducts = body.categoryProducts['cat-a'];
    expect(catAProducts).toBeDefined();
    expect(catAProducts.length).toBe(5);
    const catAIds = catAProducts.map((p: any) => p.id);
    expect(catAIds).toEqual(['prod-a-10', 'prod-a-9', 'prod-a-8', 'prod-a-7', 'prod-a-6']);

    // Category B also returns its default latest 5 (6, 5, 4, 3, 2)
    const catBProducts = body.categoryProducts['cat-b'];
    expect(catBProducts).toBeDefined();
    expect(catBProducts.length).toBe(5);
    const catBIds = catBProducts.map((p: any) => p.id);
    expect(catBIds).toEqual(['prod-b-6', 'prod-b-5', 'prod-b-4', 'prod-b-3', 'prod-b-2']);
  });

  it('2. Admin can configure custom products and exact order (e.g. 5, 4, 9, 2, 7) for Category A', async () => {
    const env = createMockEnv();
    const token = await getAdminToken(env);
    const selectedIds = ['prod-a-5', 'prod-a-4', 'prod-a-9', 'prod-a-2', 'prod-a-7'];

    // PUT to admin endpoint with auth token
    const saveReq = new Request('https://rongdhonutrade.com/api/admin/categories/cat-a/homepage-products', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ productIds: selectedIds }),
    });

    const saveRes = await handleApiRequest(saveReq, env);
    expect(saveRes.status).toBe(200);
    const saveBody = await saveRes.json();
    expect(saveBody.success).toBe(true);
    expect(saveBody.count).toBe(5);
    expect(saveBody.productIds).toEqual(selectedIds);

    // Verify D1 table now has the 5 rows with sort_order 0, 1, 2, 3, 4
    expect(dbHomepageCategoryProducts.length).toBe(5);
    expect(dbHomepageCategoryProducts.map((h) => h.product_id)).toEqual(selectedIds);
    expect(dbHomepageCategoryProducts.map((h) => h.sort_order)).toEqual([0, 1, 2, 3, 4]);

    // Check homepage API now returns Category A in EXACT order 5, 4, 9, 2, 7
    const homeReq = new Request('https://rongdhonutrade.com/api/store/homepage', { method: 'GET' });
    const homeRes = await handleApiRequest(homeReq, env);
    const homeBody = await homeRes.json();

    const catAProducts = homeBody.categoryProducts['cat-a'];
    expect(catAProducts).toBeDefined();
    const displayedIds = catAProducts.map((p: any) => p.id);
    expect(displayedIds).toEqual(selectedIds);
  });

  it('3. Adding new products to the catalog does NOT overwrite or shift Category A custom selection', async () => {
    const env = createMockEnv();
    const token = await getAdminToken(env);
    const selectedIds = ['prod-a-5', 'prod-a-4', 'prod-a-9', 'prod-a-2', 'prod-a-7'];

    // Save custom selection
    await handleApiRequest(
      new Request('https://rongdhonutrade.com/api/admin/categories/cat-a/homepage-products', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ productIds: selectedIds }),
      }),
      env
    );

    // Now simulate adding 5 brand new products to Category A (e.g. prod-a-11 to prod-a-15)
    for (let i = 11; i <= 15; i++) {
      allCatalogProducts.push({
        id: `prod-a-${i}`,
        slug: `product-a-${i}`,
        title: `Product A-${i}`,
        price: 999,
        original_price: 1200,
        category_id: 'cat-a',
        description: `New product A-${i}`,
        image_url: `https://example.com/a-${i}.jpg`,
        images_json: JSON.stringify([`https://example.com/a-${i}.jpg`]),
        stock: 50,
        featured: 0,
        featured_sort_order: 0,
        rating: 5,
        reviews_count: 0,
        specs_json: JSON.stringify([]),
        sizes_json: JSON.stringify([]),
        colors_json: JSON.stringify([]),
        sku: `SKU-A-${i}`,
        status: 'active',
        created_at: `2026-03-${String(i).padStart(2, '0')}T00:00:00Z`,
        updated_at: `2026-03-${String(i).padStart(2, '0')}T00:00:00Z`,
      });
    }

    // Homepage must still return the pinned older products in exact configured order
    const homeReq = new Request('https://rongdhonutrade.com/api/store/homepage', { method: 'GET' });
    const homeRes = await handleApiRequest(homeReq, env);
    const homeBody = await homeRes.json();

    const catAProducts = homeBody.categoryProducts['cat-a'];
    expect(catAProducts.map((p: any) => p.id)).toEqual(selectedIds);
  });

  it('4. Category B remains completely independent and continues automatic latest behavior', async () => {
    const env = createMockEnv();
    const token = await getAdminToken(env);
    const selectedIds = ['prod-a-5', 'prod-a-4', 'prod-a-9', 'prod-a-2', 'prod-a-7'];

    // Configure Category A only
    await handleApiRequest(
      new Request('https://rongdhonutrade.com/api/admin/categories/cat-a/homepage-products', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ productIds: selectedIds }),
      }),
      env
    );

    const homeReq = new Request('https://rongdhonutrade.com/api/store/homepage', { method: 'GET' });
    const homeRes = await handleApiRequest(homeReq, env);
    const homeBody = await homeRes.json();

    // Category B was not touched, so it must still display its latest 5 products automatically
    const catBProducts = homeBody.categoryProducts['cat-b'];
    expect(catBProducts).toBeDefined();
    expect(catBProducts.map((p: any) => p.id)).toEqual([
      'prod-b-6',
      'prod-b-5',
      'prod-b-4',
      'prod-b-3',
      'prod-b-2',
    ]);
  });

  it('5. Safe handling: Deleting, unpublishing or reassigning a product excludes it safely without crashing', async () => {
    const env = createMockEnv();
    const token = await getAdminToken(env);
    const selectedIds = ['prod-a-5', 'prod-a-4', 'prod-a-9', 'prod-a-2', 'prod-a-7'];

    await handleApiRequest(
      new Request('https://rongdhonutrade.com/api/admin/categories/cat-a/homepage-products', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ productIds: selectedIds }),
      }),
      env
    );

    // Simulate product 4 unpublished (inactive) and product 9 deleted (removed from catalog)
    const prod4 = allCatalogProducts.find((p) => p.id === 'prod-a-4');
    if (prod4) prod4.status = 'inactive';
    allCatalogProducts = allCatalogProducts.filter((p) => p.id !== 'prod-a-9');

    const homeReq = new Request('https://rongdhonutrade.com/api/store/homepage', { method: 'GET' });
    const homeRes = await handleApiRequest(homeReq, env);
    const homeBody = await homeRes.json();

    const catAProducts = homeBody.categoryProducts['cat-a'];
    expect(catAProducts).toBeDefined();
    // Invalid/unpublished products 4 and 9 are safely omitted, preserving remaining order (5, 2, 7)
    expect(catAProducts.map((p: any) => p.id)).toEqual(['prod-a-5', 'prod-a-2', 'prod-a-7']);
  });

  it('6. Resetting Category A restores default automatic latest-products behavior', async () => {
    const env = createMockEnv();
    const token = await getAdminToken(env);
    const selectedIds = ['prod-a-5', 'prod-a-4', 'prod-a-9', 'prod-a-2', 'prod-a-7'];

    // 1. Configure Category A
    await handleApiRequest(
      new Request('https://rongdhonutrade.com/api/admin/categories/cat-a/homepage-products', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ productIds: selectedIds }),
      }),
      env
    );
    expect(dbHomepageCategoryProducts.length).toBe(5);

    // 2. Reset Category A
    const resetReq = new Request('https://rongdhonutrade.com/api/admin/categories/cat-a/homepage-products', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    const resetRes = await handleApiRequest(resetReq, env);
    expect(resetRes.status).toBe(200);
    const resetBody = await resetRes.json();
    expect(resetBody.success).toBe(true);
    expect(resetBody.isConfigured).toBe(false);
    expect(dbHomepageCategoryProducts.length).toBe(0);

    // 3. Homepage for Category A should immediately revert to latest 5 products (10, 9, 8, 7, 6)
    const homeReq = new Request('https://rongdhonutrade.com/api/store/homepage', { method: 'GET' });
    const homeRes = await handleApiRequest(homeReq, env);
    const homeBody = await homeRes.json();

    const catAProducts = homeBody.categoryProducts['cat-a'];
    expect(catAProducts.map((p: any) => p.id)).toEqual([
      'prod-a-10',
      'prod-a-9',
      'prod-a-8',
      'prod-a-7',
      'prod-a-6',
    ]);
  });

  it('7. Admin API: GET /api/admin/homepage-categories and GET /api/admin/categories/:id/homepage-products', async () => {
    const env = createMockEnv();
    const token = await getAdminToken(env);

    // Before config: GET category config shows isConfigured: false
    const getBeforeReq = new Request('https://rongdhonutrade.com/api/admin/categories/cat-a/homepage-products', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const getBeforeRes = await handleApiRequest(getBeforeReq, env);
    expect(getBeforeRes.status).toBe(200);
    const beforeData = await getBeforeRes.json();
    expect(beforeData.isConfigured).toBe(false);
    expect(beforeData.productIds).toEqual([]);

    // Save selection
    await handleApiRequest(
      new Request('https://rongdhonutrade.com/api/admin/categories/cat-a/homepage-products', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ productIds: ['prod-a-3', 'prod-a-1'] }),
      }),
      env
    );

    // GET category config shows isConfigured: true and productIds in order
    const getAfterReq = new Request('https://rongdhonutrade.com/api/admin/categories/cat-a/homepage-products', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const getAfterRes = await handleApiRequest(getAfterReq, env);
    const afterData = await getAfterRes.json();
    expect(afterData.isConfigured).toBe(true);
    expect(afterData.productIds).toEqual(['prod-a-3', 'prod-a-1']);

    // GET all configurations summary
    const getAllReq = new Request('https://rongdhonutrade.com/api/admin/homepage-categories', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const getAllRes = await handleApiRequest(getAllReq, env);
    const allData = await getAllRes.json();
    expect(allData.success).toBe(true);
    const catAConfig = allData.configurationsList.find((c: any) => c.categoryId === 'cat-a');
    expect(catAConfig.isConfigured).toBe(true);
    expect(catAConfig.productCount).toBe(2);
    expect(catAConfig.productIds).toEqual(['prod-a-3', 'prod-a-1']);
    expect(allData.configurations['cat-a']).toEqual(['prod-a-3', 'prod-a-1']);
  });
});
