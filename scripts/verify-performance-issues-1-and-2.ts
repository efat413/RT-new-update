import assert from 'node:assert';
import sharp from 'sharp';
import { getHomepageProducts } from '../src/server/db';
import { handleApiRequest } from '../src/server/router';
import type { D1Database, D1PreparedStatement, D1Result, ProductRow } from '../src/server/types';
import { getTestAdminToken } from './test-auth-helper';

async function runTests() {
  console.log('===============================================================');
  console.log('VERIFYING ISSUE 1: HOMEPAGE D1 DATABASE OPTIMIZATION');
  console.log('===============================================================');

  // Create a mock D1 with 500 products across 5 categories
  const mockProducts: ProductRow[] = [];
  const categories = [
    { id: 'cat-1', name: 'Category 1', slug: 'cat-1' },
    { id: 'cat-2', name: 'Category 2', slug: 'cat-2' },
    { id: 'cat-3', name: 'Category 3', slug: 'cat-3' },
    { id: 'cat-4', name: 'Category 4', slug: 'cat-4' },
    { id: 'cat-5', name: 'Category 5', slug: 'cat-5' },
  ];

  for (let i = 0; i < 500; i++) {
    const catId = categories[i % 5].id;
    mockProducts.push({
      id: `prod-${i}`,
      title: `Product ${i}`,
      price: 100 + i,
      original_price: 150 + i,
      buying_price: 50 + i,
      category_id: catId,
      description: `Description for product ${i}`,
      image_url: `/api/media/asset-1700000000000-${i}.jpg`,
      images_json: JSON.stringify([`/api/media/asset-1700000000000-${i}.jpg`]),
      stock: 10,
      featured: i < 20 ? 1 : 0,
      rating: 4.5,
      reviews_count: 5,
      specs_json: '[]',
      sizes_json: '[]',
      colors_json: '[]',
      sku: `SKU-${i}`,
      video_url: null,
      status: 'active',
      created_at: new Date(Date.now() - i * 60000).toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // Instrument D1 mock to count queries, track batching, and enforce SQL LIMIT
  let executedStatements = 0;
  let batchCalls = 0;
  let totalRowsReturned = 0;

  function createMockDb(): D1Database {
    return {
      prepare(sql: string): D1PreparedStatement {
        return {
          bind(...values: any[]): D1PreparedStatement {
            return {
              bind: () => this,
              async all<T = any>(): Promise<D1Result<T>> {
                executedStatements++;
                // Evaluate SQL in-memory
                let rows = [...mockProducts];
                // Check WHERE
                if (sql.includes('category_id = ?')) {
                  const catId = values[0];
                  rows = rows.filter((r) => r.category_id === catId);
                }
                if (sql.includes('featured = 1')) {
                  rows = rows.filter((r) => r.featured === 1);
                }
                // Check LIMIT
                const limitVal = values[values.length - 1];
                assert(typeof limitVal === 'number', 'SQL must pass numeric LIMIT parameter');
                assert(limitVal <= 8, `Limit parameter must be capped (got ${limitVal})`);
                const limitedRows = rows.slice(0, limitVal);
                totalRowsReturned += limitedRows.length;
                return { success: true, results: limitedRows as unknown as T[] };
              },
              async first() { return null; },
              async run() { return { success: true }; },
            };
          },
          async all() { return { success: true, results: [] }; },
          async first() { return null; },
          async run() { return { success: true }; },
        };
      },
      async batch<T = any>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
        batchCalls++;
        return Promise.all(statements.map((s) => s.all<T>()));
      },
      async exec() {},
    };
  }

  const mockDb = createMockDb();
  const categoryIds = categories.map((c) => c.id);

  console.log('Simulating getHomepageProducts with 500 active products in D1...');
  const hpResult = await getHomepageProducts(mockDb, categoryIds, {
    perCategoryLimit: 6,
    featuredLimit: 8,
  });

  console.log(`- Batch calls executed: ${batchCalls}`);
  console.log(`- Prepared statements executed: ${executedStatements}`);
  console.log(`- Total products loaded from D1: ${totalRowsReturned} (out of 500 in table)`);
  console.log(`- Featured products returned: ${hpResult.featuredProducts.length}`);
  console.log(`- Category products count:`, Object.fromEntries(
    Object.entries(hpResult.categoryProducts).map(([k, v]) => [k, v.length])
  ));

  assert.strictEqual(batchCalls, 1, 'All product queries must execute in 1 single D1 batch');
  assert.strictEqual(executedStatements, 6, '1 statement for featured + 5 statements for categories');
  assert(totalRowsReturned <= 38, `Must load at most 38 products (got ${totalRowsReturned}), NOT all 500`);
  assert.strictEqual(hpResult.featuredProducts.length, 8, 'Featured products must be capped at 8');
  for (const catId of categoryIds) {
    assert.strictEqual(hpResult.categoryProducts[catId].length, 6, `Category ${catId} must have at most 6 products`);
  }
  console.log('✓ D1 Homepage query optimization confirmed: bounded load, 1 batch, zero N+1 waterfall\n');

  // Verify full router endpoint response & privacy
  const mockEnv: any = {
    DB: {
      ...createMockDb(),
      prepare(sql: string) {
        if (sql.includes('categories')) {
          return {
            bind: () => this,
            all: async () => ({ success: true, results: categories }),
            first: async () => null,
            run: async () => ({ success: true }),
          };
        }
        if (sql.includes('sliders')) {
          return {
            bind: () => this,
            all: async () => ({ success: true, results: [] }),
            first: async () => null,
            run: async () => ({ success: true }),
          };
        }
        if (sql.includes('store_settings')) {
          return {
            bind: () => this,
            all: async () => ({ success: true, results: [] }),
            first: async () => ({ settings_json: '{}' }),
            run: async () => ({ success: true }),
          };
        }
        return createMockDb().prepare(sql);
      },
      batch: createMockDb().batch,
    },
  };

  const req = new Request('http://localhost/api/store/homepage', { method: 'GET' });
  const res = await handleApiRequest(req, mockEnv);
  assert.strictEqual(res.status, 200);
  assert(res.headers.get('Cache-Control')?.includes('public') && res.headers.get('Cache-Control')?.includes('stale-while-revalidate'));
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert(Array.isArray(data.categories));
  assert(Array.isArray(data.featuredProducts));
  assert(Array.isArray(data.products));
  // Ensure private admin fields like buying_price or buyingPrice are never exposed to public
  for (const p of data.products) {
    assert.strictEqual((p as any).buying_price, undefined, 'buying_price must not be exposed');
    assert.strictEqual((p as any).buyingPrice, undefined, 'buyingPrice must not be exposed');
  }
  console.log('✓ Public homepage response structure preserved & private fields masked\n');

  console.log('===============================================================');
  console.log('VERIFYING ISSUE 2: IMAGE TRANSFORMATION & RESPONSIVE DELIVERY');
  console.log('===============================================================');

  const baseUrl = 'http://localhost:3000';

  // 1. Create a large test image (1200x1200px PNG)
  const masterImage = await sharp({
    create: {
      width: 1200,
      height: 1200,
      channels: 4,
      background: { r: 230, g: 80, b: 60, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="1200" height="1200"><rect x="100" y="100" width="1000" height="1000" fill="#2563eb"/><circle cx="600" cy="600" r="300" fill="#facc15"/></svg>'
        ),
      },
    ])
    .png()
    .toBuffer();

  const originalSize = masterImage.length;
  console.log(`Created 1200x1200 master test image: ${originalSize} bytes`);

  // 2. Upload master image to server
  const adminToken = await getTestAdminToken(baseUrl);
  const uploadRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      dataUrl: `data:image/png;base64,${masterImage.toString('base64')}`,
    }),
  });
  assert.strictEqual(uploadRes.status, 200, 'Upload must succeed');
  const uploadData = await uploadRes.json();
  const mediaUrl = uploadData.url;
  console.log(`Uploaded master image to ${mediaUrl}`);

  // Test matrix:
  // A. Original (no params)
  const origRes = await fetch(`${baseUrl}${mediaUrl}`);
  assert.strictEqual(origRes.status, 200);
  assert(origRes.headers.get('cache-control')?.includes('immutable'));
  const origBuffer = Buffer.from(await origRes.arrayBuffer());
  const origMeta = await sharp(origBuffer).metadata();
  console.log(`✓ Original image: ${origBuffer.length} bytes, dimensions ${origMeta.width}x${origMeta.height}, format: ${origMeta.format}`);
  assert.strictEqual(origMeta.width, 1200);

  // B. 360px Product Card Image (?w=360 with Accept: image/webp)
  const res360 = await fetch(`${baseUrl}${mediaUrl}?w=360`, {
    headers: { 'Accept': 'image/webp,image/*,*/*' },
  });
  assert.strictEqual(res360.status, 200);
  assert(res360.headers.get('cache-control')?.includes('immutable'));
  const buf360 = Buffer.from(await res360.arrayBuffer());
  const meta360 = await sharp(buf360).metadata();
  console.log(`✓ ?w=360 product image: ${buf360.length} bytes (was ${originalSize} bytes, -${Math.round((1 - buf360.length / originalSize) * 100)}%), dimensions ${meta360.width}x${meta360.height}, format: ${meta360.format}`);
  assert.strictEqual(meta360.width, 360);
  assert(buf360.length < originalSize / 2, '360px image must be substantially smaller than original');

  // C. 480px Product Image (?w=480)
  const res480 = await fetch(`${baseUrl}${mediaUrl}?w=480`, {
    headers: { 'Accept': 'image/webp,image/*,*/*' },
  });
  assert.strictEqual(res480.status, 200);
  const buf480 = Buffer.from(await res480.arrayBuffer());
  const meta480 = await sharp(buf480).metadata();
  console.log(`✓ ?w=480 image: ${buf480.length} bytes, dimensions ${meta480.width}x${meta480.height}, format: ${meta480.format}`);
  assert.strictEqual(meta480.width, 480);
  assert(buf480.length < originalSize);

  // D. 640px Image (?w=640)
  const res640 = await fetch(`${baseUrl}${mediaUrl}?w=640`, {
    headers: { 'Accept': 'image/webp,image/*,*/*' },
  });
  assert.strictEqual(res640.status, 200);
  const buf640 = Buffer.from(await res640.arrayBuffer());
  const meta640 = await sharp(buf640).metadata();
  console.log(`✓ ?w=640 image: ${buf640.length} bytes, dimensions ${meta640.width}x${meta640.height}, format: ${meta640.format}`);
  assert(meta640.width === 640 || meta640.width === 720);
  assert(buf640.length < originalSize);

  // E. Banner Image (?w=1200&q=85)
  const resBanner = await fetch(`${baseUrl}${mediaUrl}?w=1200&q=85`, {
    headers: { 'Accept': 'image/webp,image/*,*/*' },
  });
  assert.strictEqual(resBanner.status, 200);
  const bufBanner = Buffer.from(await resBanner.arrayBuffer());
  const metaBanner = await sharp(bufBanner).metadata();
  console.log(`✓ Banner image (?w=1200&q=85): ${bufBanner.length} bytes, dimensions ${metaBanner.width}x${metaBanner.height}, format: ${metaBanner.format}`);
  assert(metaBanner.width === 1080 || metaBanner.width === 1200);

  // F. Existing Old Image URL (direct /api/media/:key without parameters)
  const resOld = await fetch(`${baseUrl}${mediaUrl}`);
  assert.strictEqual(resOld.status, 200);
  assert(resOld.headers.get('content-type')?.includes('image/png'));
  console.log('✓ Existing old image URL without params serves intact with immutable cache header');

  // G. Invalid Image Key (/api/media/malicious-key.jpg or ../../)
  const resInvalid = await fetch(`${baseUrl}/api/media/malicious-key.jpg`);
  assert.strictEqual(resInvalid.status, 400);
  console.log('✓ Invalid image key strictly rejected with 400 Bad Request');

  // H. Missing Image Key (/api/media/asset-9999999999999-missing.jpg)
  const resMissing = await fetch(`${baseUrl}/api/media/asset-9999999999999-missing.jpg`);
  assert.strictEqual(resMissing.status, 404);
  console.log('✓ Missing image key strictly returns 404 Not Found');

  console.log('\n===============================================================');
  console.log('✅ ALL VERIFICATIONS FOR ISSUE 1 & ISSUE 2 PASSED SUCCESSFULLY');
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
