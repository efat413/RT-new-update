import {
  ensureCategoryHomepageProductsTable,
  getCategoryHomepageProductsConfig,
  saveCategoryHomepageProducts,
  resetCategoryHomepageProducts,
  getHomepageCategoryProducts,
  getAllCategoryHomepageConfigs,
} from '../src/server/db';

interface MockQueryResult {
  results?: any[];
  meta?: any;
}

class MockD1Database {
  public tables: {
    category_homepage_products: Array<{
      id: string;
      category_id: string;
      product_id: string;
      sort_order: number;
      created_at: string;
      updated_at: string;
    }>;
    products: Array<{
      id: string;
      category_id: string;
      title: string;
      price: number;
      status: string;
      stock: number;
      created_at: string;
    }>;
    categories: Array<{
      id: string;
      name: string;
      slug: string;
    }>;
  };

  constructor() {
    this.tables = {
      category_homepage_products: [],
      categories: [
        { id: 'cat-electronics', name: 'Electronics', slug: 'electronics' },
        { id: 'cat-fashion', name: 'Fashion', slug: 'fashion' },
      ],
      products: [
        { id: 'prod-1', category_id: 'cat-electronics', title: 'Earbuds A', price: 1200, status: 'active', stock: 10, created_at: '2026-01-01T00:00:00Z' },
        { id: 'prod-2', category_id: 'cat-electronics', title: 'Smartwatch B', price: 2500, status: 'active', stock: 5, created_at: '2026-01-02T00:00:00Z' },
        { id: 'prod-3', category_id: 'cat-electronics', title: 'Speaker C', price: 1800, status: 'active', stock: 8, created_at: '2026-01-03T00:00:00Z' },
        { id: 'prod-4', category_id: 'cat-electronics', title: 'Cable D', price: 300, status: 'active', stock: 20, created_at: '2026-01-04T00:00:00Z' },
        { id: 'prod-5', category_id: 'cat-electronics', title: 'Adapter E', price: 500, status: 'active', stock: 12, created_at: '2026-01-05T00:00:00Z' },
        { id: 'prod-6', category_id: 'cat-electronics', title: 'Powerbank F', price: 1500, status: 'active', stock: 15, created_at: '2026-01-06T00:00:00Z' },
        { id: 'prod-7', category_id: 'cat-electronics', title: 'Deleted Item', price: 900, status: 'inactive', stock: 0, created_at: '2026-01-07T00:00:00Z' },
        { id: 'prod-fashion-1', category_id: 'cat-fashion', title: 'Shirt', price: 800, status: 'active', stock: 10, created_at: '2026-01-01T00:00:00Z' },
      ],
    };
  }

  prepare(sql: string) {
    const db = this;
    let boundParams: any[] = [];

    const stmt = {
      bind(...params: any[]) {
        boundParams = params;
        return stmt;
      },
      async run() {
        if (sql.includes('CREATE TABLE IF NOT EXISTS category_homepage_products')) {
          return { success: true };
        }
        if (sql.includes('DELETE FROM category_homepage_products WHERE category_id = ?')) {
          const catId = boundParams[0];
          db.tables.category_homepage_products = db.tables.category_homepage_products.filter(
            (r) => r.category_id !== catId
          );
          return { success: true };
        }
        if (sql.includes('INSERT INTO category_homepage_products')) {
          // Multiple value inserts or single value insert
          const [id, catId, prodId, sortOrder] = boundParams;
          db.tables.category_homepage_products.push({
            id: id || `chp-${Date.now()}-${Math.random()}`,
            category_id: catId,
            product_id: prodId,
            sort_order: sortOrder,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return { success: true };
        }
        return { success: true };
      },
      async first<T = any>(colName?: string): Promise<T | null> {
        const res = await stmt.all<T>();
        const first = res.results && res.results.length > 0 ? res.results[0] : null;
        if (first && colName) {
          return (first as any)[colName] ?? null;
        }
        return first;
      },
      async all<T = any>(): Promise<{ results?: T[] }> {
        // Query for getAllCategoryHomepageConfigs
        if (sql.includes('SELECT chp.category_id, chp.product_id, chp.sort_order')) {
          const rows = db.tables.category_homepage_products
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((r) => {
              const p = db.tables.products.find((prod) => prod.id === r.product_id && prod.category_id === r.category_id && prod.status === 'active');
              if (!p) return null;
              return r;
            })
            .filter(Boolean) as unknown as T[];
          return { results: rows };
        }

        // Query category homepage products with join (either single category or IN)
        if (sql.includes('FROM category_homepage_products chp')) {
          let catIds: string[] = [];
          if (sql.includes('chp.category_id IN')) {
            catIds = boundParams;
          } else if (sql.includes('chp.category_id = ?')) {
            catIds = [boundParams[0]];
          } else {
            catIds = Array.from(new Set(db.tables.category_homepage_products.map((r) => r.category_id)));
          }

          const rows = db.tables.category_homepage_products
            .filter((r) => catIds.includes(r.category_id))
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((r) => {
              const p = db.tables.products.find((prod) => prod.id === r.product_id);
              if (!p) return null;
              if (p.category_id !== r.category_id) return null;
              if (p.status !== 'active') return null;
              return {
                ...p,
                category_id: p.category_id,
                config_cat_id: r.category_id,
                sort_order: r.sort_order,
                product_id: r.product_id,
                chp_id: r.id,
              };
            })
            .filter(Boolean) as unknown as T[];
          return { results: rows };
        }

        // COUNT query
        if (sql.includes('SELECT COUNT(*) as total FROM category_homepage_products WHERE category_id = ?')) {
          const catId = boundParams[0];
          const total = db.tables.category_homepage_products.filter((r) => r.category_id === catId).length;
          return { results: [{ total }] as unknown as T[] };
        }

        // Window query or Fallback recent products query
        if (sql.includes('RankedProducts') || (sql.includes('FROM products') && (sql.includes('category_id IN') || sql.includes('category_id =')))) {
          const limit = boundParams[boundParams.length - 1] || 5;
          const catIds = boundParams.slice(0, boundParams.length - 1);
          const rows = db.tables.products
            .filter((p) => catIds.includes(p.category_id) && p.status === 'active')
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, limit) as unknown as T[];
          return { results: rows };
        }

        return { results: [] };
      },
    };
    return stmt;
  }
}

async function runTests() {
  console.log('--- Starting Custom Homepage Category Products Test Suite ---');
  const mockDb = new MockD1Database() as any;

  // 1. Table creation check
  await ensureCategoryHomepageProductsTable(mockDb);
  console.log('✓ Step 1: Table schema self-healing passed');

  // 2. Unconfigured category default behavior
  const initialConfig = await getCategoryHomepageProductsConfig(mockDb, 'cat-electronics');
  if (initialConfig.isConfigured !== false || initialConfig.productIds.length !== 0) {
    throw new Error('Initial category should be unconfigured');
  }
  const defaultHomepageProductsMap = await getHomepageCategoryProducts(mockDb, 'cat-electronics', 5);
  const defaultHomepageProducts = defaultHomepageProductsMap['cat-electronics'] || [];
  if (defaultHomepageProducts.length !== 5) {
    throw new Error(`Expected 5 recent products by default, got ${defaultHomepageProducts.length}`);
  }
  // Verify recent ordering: prod-6, prod-5, prod-4, prod-3, prod-2
  if (defaultHomepageProducts[0].id !== 'prod-6' || defaultHomepageProducts[1].id !== 'prod-5') {
    throw new Error('Default fallback should return the most recent active products');
  }
  console.log('✓ Step 2: Unconfigured category returns 5 most recent active products');

  // 3. Configure custom selection and order: [prod-3, prod-1, prod-5]
  await saveCategoryHomepageProducts(mockDb, 'cat-electronics', ['prod-3', 'prod-1', 'prod-5']);
  const updatedConfig = await getCategoryHomepageProductsConfig(mockDb, 'cat-electronics');
  if (!updatedConfig.isConfigured || updatedConfig.productIds.join(',') !== 'prod-3,prod-1,prod-5') {
    throw new Error(`Expected configured [prod-3, prod-1, prod-5], got: ${updatedConfig.productIds.join(',')}`);
  }

  const customHomepageProductsMap = await getHomepageCategoryProducts(mockDb, 'cat-electronics', 5);
  const customHomepageProducts = customHomepageProductsMap['cat-electronics'] || [];
  if (customHomepageProducts.length !== 3) {
    throw new Error(`Expected 3 configured showcase products, got ${customHomepageProducts.length}`);
  }
  if (customHomepageProducts[0].id !== 'prod-3' || customHomepageProducts[1].id !== 'prod-1' || customHomepageProducts[2].id !== 'prod-5') {
    throw new Error('Custom homepage products did not respect manual sort order');
  }
  console.log('✓ Step 3: Manual selection & ordering saved persistently and returned correctly');

  // 4. Persistence guarantee: Adding a new product globally must NOT alter or overwrite the showcase
  mockDb.tables.products.push({
    id: 'prod-8-new-arrival',
    category_id: 'cat-electronics',
    title: 'Brand New Arrival',
    price: 3500,
    status: 'active',
    stock: 25,
    created_at: '2026-01-08T00:00:00Z',
  });
  const afterNewArrivalMap = await getHomepageCategoryProducts(mockDb, 'cat-electronics', 5);
  const afterNewArrival = afterNewArrivalMap['cat-electronics'] || [];
  if (afterNewArrival.length !== 3 || afterNewArrival[0].id !== 'prod-3') {
    throw new Error('Adding new global product overwrote configured homepage category showcase!');
  }
  console.log('✓ Step 4: Adding new products globally does not overwrite manual homepage showcase order');

  // 5. Edge case: Deleted / inactive / mismatched products are gracefully omitted
  // Add deleted item and foreign item to showcase configuration
  await saveCategoryHomepageProducts(mockDb, 'cat-electronics', ['prod-7', 'prod-fashion-1', 'prod-2', 'prod-1']);
  const safeHomepageProductsMap = await getHomepageCategoryProducts(mockDb, 'cat-electronics', 5);
  const safeHomepageProducts = safeHomepageProductsMap['cat-electronics'] || [];
  // prod-7 is inactive, prod-fashion-1 belongs to cat-fashion -> only prod-2 and prod-1 should be returned
  if (safeHomepageProducts.length !== 2 || safeHomepageProducts[0].id !== 'prod-2' || safeHomepageProducts[1].id !== 'prod-1') {
    throw new Error(`Safe edge case failed: expected [prod-2, prod-1], got ${safeHomepageProducts.map((p) => p.id).join(',')}`);
  }
  console.log('✓ Step 5: Inactive or category-mismatched products are gracefully excluded');

  // 6. Independent category configuration
  const fashionConfig = await getCategoryHomepageProductsConfig(mockDb, 'cat-fashion');
  if (fashionConfig.isConfigured) {
    throw new Error('Category fashion should remain unconfigured independently');
  }
  await saveCategoryHomepageProducts(mockDb, 'cat-fashion', ['prod-fashion-1']);
  const allConfigs = await getAllCategoryHomepageConfigs(mockDb);
  if (allConfigs['cat-fashion'].length !== 1 || allConfigs['cat-electronics'].length !== 2) {
    throw new Error(`getAllCategoryHomepageConfigs returned incorrect mapping: ${JSON.stringify(allConfigs)}`);
  }
  console.log('✓ Step 6: Category configurations are strictly isolated');

  // 7. Reset to default
  await resetCategoryHomepageProducts(mockDb, 'cat-electronics');
  const afterResetConfig = await getCategoryHomepageProductsConfig(mockDb, 'cat-electronics');
  if (afterResetConfig.isConfigured) {
    throw new Error('Category should not be configured after reset');
  }
  const afterResetProductsMap = await getHomepageCategoryProducts(mockDb, 'cat-electronics', 5);
  const afterResetProducts = afterResetProductsMap['cat-electronics'] || [];
  // Now should return the 5 most recent active products, which includes the new arrival prod-8!
  if (afterResetProducts.length !== 5 || afterResetProducts[0].id !== 'prod-8-new-arrival') {
    throw new Error('Reset failed to restore default 5 most recent products');
  }
  console.log('✓ Step 7: Reset to default successfully restores recent products fallback');

  console.log('\nAll 7 test steps passed cleanly!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
