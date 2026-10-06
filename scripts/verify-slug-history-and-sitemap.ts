/**
 * Rigorous Automated Verification for SEO Product Slugs, Dynamic Sitemap & 301 Slug History
 */

import { generateSitemapXml, generateProductSlug, SITE_DOMAIN } from '../src/utils/seo';
import { INITIAL_CATEGORIES, INITIAL_PRODUCTS } from '../src/data/seedData';
import {
  getSitemapData,
  recordProductSlugHistory,
  findProductBySlugHistory,
  getProductById,
  ensureUniqueSlugInD1,
  updateProductInD1,
} from '../src/server/db';

class MockD1PreparedStatement {
  private sql: string;
  private bindings: any[];
  private storage: MockD1Database;

  constructor(sql: string, storage: MockD1Database, bindings: any[] = []) {
    this.sql = sql;
    this.storage = storage;
    this.bindings = bindings;
  }

  bind(...params: any[]) {
    return new MockD1PreparedStatement(this.sql, this.storage, params);
  }

  async run() {
    return this.storage.executeSql(this.sql, this.bindings);
  }

  async all<T = any>() {
    const res = this.storage.querySql(this.sql, this.bindings);
    return { results: res as T[] };
  }

  async first<T = any>(colName?: string) {
    const res = this.storage.querySql(this.sql, this.bindings);
    if (!res || res.length === 0) return null;
    if (colName) return (res[0] as any)[colName] as T;
    return res[0] as T;
  }
}

class MockD1Database {
  products: any[] = [];
  slugHistory: any[] = [];
  categories: any[] = [];

  constructor() {
    this.products = INITIAL_PRODUCTS.map((p) => ({
      ...p,
      created_at: p.createdAt || '2026-03-01T00:00:00Z',
      original_price: p.originalPrice || 0,
      buying_price: 500,
      images_json: JSON.stringify(p.images || []),
      specs_json: JSON.stringify(p.specs || []),
      sizes_json: JSON.stringify(p.sizes || []),
      colors_json: JSON.stringify(p.colors || []),
      status: 'active',
    }));
    this.categories = INITIAL_CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description || '',
    }));
  }

  prepare(sql: string) {
    return new MockD1PreparedStatement(sql, this);
  }

  async batch(stmts: MockD1PreparedStatement[]) {
    const results = [];
    for (const stmt of stmts) {
      results.push(await stmt.all());
    }
    return results;
  }

  executeSql(sql: string, params: any[]) {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();

    if (cleanSql.startsWith('INSERT INTO product_slug_history') || cleanSql.startsWith('INSERT OR REPLACE INTO product_slug_history')) {
      const [id, productId, slug] = params;
      this.slugHistory = this.slugHistory.filter((h) => h.slug !== slug);
      this.slugHistory.push({ id, product_id: productId, slug, created_at: new Date().toISOString() });
      return { success: true };
    }

    if (cleanSql.startsWith('DELETE FROM product_slug_history WHERE slug = ?')) {
      const [slug] = params;
      this.slugHistory = this.slugHistory.filter((h) => h.slug !== slug);
      return { success: true };
    }

    if (cleanSql.startsWith('DELETE FROM product_slug_history WHERE product_id = ?')) {
      const [prodId] = params;
      this.slugHistory = this.slugHistory.filter((h) => h.product_id !== prodId);
      return { success: true };
    }

    if (cleanSql.startsWith('UPDATE products SET')) {
      const match = cleanSql.match(/UPDATE products SET (.+) WHERE id = \?/);
      if (match) {
        const cols = match[1]
          .split(',')
          .map((c) => c.trim().split('=')[0].trim())
          .filter((c) => c !== 'updated_at');
        const prodId = params[params.length - 1];
        const prod = this.products.find((p) => p.id === prodId);
        if (prod) {
          cols.forEach((col, idx) => {
            prod[col] = params[idx];
          });
        }
      }
      return { success: true };
    }

    return { success: true };
  }

  querySql(sql: string, params: any[]) {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();

    if (cleanSql.includes("pragma_table_info('products')") || cleanSql.includes('table_info(products)')) {
      return [
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
      ];
    }

    if (cleanSql.includes('SELECT id, slug FROM categories') || cleanSql.includes('FROM categories ORDER BY name ASC')) {
      return this.categories;
    }

    if (cleanSql.includes("FROM products WHERE (status = 'active'")) {
      return this.products.map((p) => ({
        id: p.id,
        slug: p.slug,
        status: p.status,
        featured: p.featured,
        created_at: p.created_at,
      }));
    }

    if (cleanSql.includes('FROM products WHERE id = ? OR slug = ?')) {
      const [param1, param2] = params;
      const found = this.products.find((p) => p.id === param1 || p.slug === param2);
      return found ? [found] : [];
    }

    if (cleanSql.includes('FROM product_slug_history psh JOIN products p ON psh.product_id = p.id WHERE psh.slug = ?')) {
      const [slug] = params;
      const hist = this.slugHistory.find((h) => h.slug === slug);
      if (!hist) return [];
      const prod = this.products.find((p) => p.id === hist.product_id);
      return prod ? [prod] : [];
    }

    if (cleanSql.includes('SELECT id FROM products WHERE slug = ?')) {
      const [candidate, excludeId] = params;
      const found = this.products.find((p) => p.slug === candidate && (excludeId ? p.id !== excludeId : true));
      return found ? [{ id: found.id }] : [];
    }

    if (cleanSql.includes('SELECT product_id FROM product_slug_history WHERE slug = ?')) {
      const [candidate, excludeId] = params;
      const found = this.slugHistory.find((h) => h.slug === candidate && (excludeId ? h.product_id !== excludeId : true));
      return found ? [{ product_id: found.product_id }] : [];
    }

    return [];
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('RUNNING VERIFICATION FOR SEO SLUGS, SITEMAP & 301 HISTORY');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string, extra?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc} - ${extra || 'Assertion failed'}`);
      failed++;
    }
  }

  const mockDb = new MockD1Database() as any;

  // 1. FIX #1: getSitemapData must select and return slug
  console.log('\n--- FIX #1: Dynamic Sitemap Data & Generation ---');
  const sitemapData = await getSitemapData(mockDb);
  assert(sitemapData.products.length > 0, '1.1 getSitemapData returns products');
  const walletProd = sitemapData.products.find((p) => p.id === 'prod-wallet-01');
  assert(Boolean(walletProd && walletProd.slug === 'leather-wallet'), '1.2 wallet product returns persisted slug "leather-wallet"');

  const sitemapXml = generateSitemapXml(sitemapData.categories as any, sitemapData.products as any);
  assert(sitemapXml.includes('<loc>https://rongdhonutrade.com/product/leather-wallet</loc>'), '1.3 sitemap includes canonical slug URL: https://rongdhonutrade.com/product/leather-wallet');
  assert(!sitemapXml.includes('/product/prod-wallet-01'), '1.4 sitemap does NOT use legacy product ID when slug is present');
  assert(!sitemapXml.includes('?product='), '1.5 sitemap does NOT contain ?product= query params');
  assert(sitemapXml.includes('<loc>https://rongdhonutrade.com/category/mens-accessories</loc>'), '1.6 sitemap includes canonical category slug URLs');

  // 2. FIX #2: Slug History Recording & 301 Redirect Logic
  console.log('\n--- FIX #2: Slug History & 301 Redirect Mechanism ---');

  // 2.1 Direct recording
  await recordProductSlugHistory(mockDb, 'prod-powerbank-06', 'excel-power-bank');
  const histLookup = await findProductBySlugHistory(mockDb, 'excel-power-bank');
  assert(Boolean(histLookup && histLookup.productId === 'prod-powerbank-06'), '2.1 recordProductSlugHistory persists and finds historical slug');
  assert(histLookup?.currentSlug === 'heavy-duty-power-bank-20000mah', '2.2 findProductBySlugHistory correctly returns canonical slug');

  // 2.2 getProductById resolves historical slugs
  const foundViaHistory = await getProductById(mockDb, 'excel-power-bank');
  assert(Boolean(foundViaHistory && foundViaHistory.id === 'prod-powerbank-06'), '2.3 getProductById resolves historical slug to canonical product');
  assert(foundViaHistory?.slug === 'heavy-duty-power-bank-20000mah', '2.4 resolved product contains current canonical slug');

  // 2.3 Simulating admin editing a product slug via updateProductInD1
  console.log('\n--- Admin Slug Editing & Auto-History Recording ---');
  const originalWallet = await getProductById(mockDb, 'prod-wallet-01');
  assert(originalWallet?.slug === 'leather-wallet', '2.5 original wallet slug is leather-wallet');

  // Admin changes slug from 'leather-wallet' to 'premium-cowhide-leather-wallet'
  await updateProductInD1(mockDb, 'prod-wallet-01', {
    slug: 'premium-cowhide-leather-wallet',
  });

  const updatedWallet = await getProductById(mockDb, 'prod-wallet-01');
  assert(updatedWallet?.slug === 'premium-cowhide-leather-wallet', '2.6 wallet slug successfully updated to premium-cowhide-leather-wallet');

  // Check that the old slug 'leather-wallet' was automatically recorded in history
  const oldSlugLookup = await findProductBySlugHistory(mockDb, 'leather-wallet');
  assert(Boolean(oldSlugLookup && oldSlugLookup.productId === 'prod-wallet-01'), '2.7 old slug "leather-wallet" was automatically archived in product_slug_history');
  assert(oldSlugLookup?.currentSlug === 'premium-cowhide-leather-wallet', '2.8 historical lookup points to new canonical slug');

  // 2.4 Server-Side 301 Redirect Verification
  console.log('\n--- Server-Side 301 Redirect Rules ---');

  function simulateWorkerRedirect(pathname: string, searchParams: Record<string, string>, product: any) {
    if (!product || product.status === 'inactive') return { status: 404 };
    const canonicalSlug = product.slug || product.id;
    const requestedPathSlug = decodeURIComponent(pathname.replace(/^\/product\//, '').replace(/\/$/, '')).trim();

    if (searchParams['product'] || searchParams['p']) {
      return { status: 301, location: `/product/${encodeURIComponent(canonicalSlug)}` };
    }

    if (product.slug && requestedPathSlug !== product.slug) {
      return { status: 301, location: `/product/${encodeURIComponent(product.slug)}` };
    }

    return { status: 200 };
  }

  // Case A: Old historical slug requested -> 301 redirect
  const histProduct = await getProductById(mockDb, 'leather-wallet');
  const redirectA = simulateWorkerRedirect('/product/leather-wallet', {}, histProduct);
  assert(redirectA.status === 301, '2.9 old slug returns HTTP 301');
  assert(redirectA.location === '/product/premium-cowhide-leather-wallet', '2.10 old slug redirects to Location: /product/premium-cowhide-leather-wallet');

  // Case B: Legacy product ID requested -> 301 redirect
  const redirectB = simulateWorkerRedirect('/product/prod-wallet-01', {}, histProduct);
  assert(redirectB.status === 301, '2.11 legacy product ID returns HTTP 301');
  assert(redirectB.location === '/product/premium-cowhide-leather-wallet', '2.12 legacy product ID redirects to Location: /product/premium-cowhide-leather-wallet');

  // Case C: Legacy query param ?product=prod-wallet-01 -> 301 redirect
  const redirectC = simulateWorkerRedirect('/', { product: 'prod-wallet-01' }, histProduct);
  assert(redirectC.status === 301, '2.13 legacy ?product= query param returns HTTP 301');
  assert(redirectC.location === '/product/premium-cowhide-leather-wallet', '2.14 legacy query param redirects to canonical slug');

  // Case D: Current canonical slug requested -> HTTP 200 (NO redirect)
  const redirectD = simulateWorkerRedirect('/product/premium-cowhide-leather-wallet', {}, histProduct);
  assert(redirectD.status === 200, '2.15 current canonical slug returns HTTP 200 without redirect (prevents redirect loop)');

  // Case E: Non-existent product -> HTTP 404
  const redirectE = simulateWorkerRedirect('/product/unknown-nonexistent-item', {}, null);
  assert(redirectE.status === 404, '2.16 non-existent slug returns HTTP 404 Not Found');

  // 3. Collision Protection with Historical Slugs
  console.log('\n--- Collision Protection with Historical Slugs ---');
  const collisionSlug = await ensureUniqueSlugInD1(mockDb, 'leather-wallet');
  assert(collisionSlug !== 'leather-wallet', '3.1 candidate slug colliding with historical slug receives numerical suffix');
  assert(collisionSlug === 'leather-wallet-2', '3.2 candidate slug resolved to leather-wallet-2');

  console.log('\n========================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
