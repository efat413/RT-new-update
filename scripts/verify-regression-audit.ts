import assert from 'node:assert';

async function runRegressionAudit() {
  console.log('===============================================================');
  console.log('STARTING REGRESSION AUDIT: SINGLE PRODUCT PAGE & URL BEHAVIOR');
  console.log('===============================================================');

  const baseUrl = 'http://localhost:3000';

  // 1. PRODUCT AUDITS
  console.log('\n--- 1. PRODUCT TESTS ---');

  // 1.1 Direct Product URL (Valid)
  const validProductRes = await fetch(`${baseUrl}/product/prod-wallet-01`);
  console.log(`[TEST 1.1] Direct Product URL /product/prod-wallet-01 -> Status: ${validProductRes.status}`);
  assert.strictEqual(validProductRes.status, 200, 'Valid product direct URL must return HTTP 200');
  const validProductHtml = await validProductRes.text();
  assert(validProductHtml.includes('<!doctype html>') || validProductHtml.includes('<html'), 'Must serve HTML');
  console.log('✓ Valid direct product URL serves HTML (200 OK)');

  // 1.2 Invalid Product URL (Must return 404 and NOT redirect to homepage)
  const invalidProductRes = await fetch(`${baseUrl}/product/non-existent-product-id-999`, {
    redirect: 'manual',
  });
  console.log(`[TEST 1.2] Invalid Product URL /product/non-existent-product-id-999 -> Status: ${invalidProductRes.status}`);
  assert.strictEqual(invalidProductRes.status, 404, 'Invalid product URL must strictly return 404');
  const invalidProductHtml = await invalidProductRes.text();
  assert(invalidProductHtml.includes('Product Not Found') || invalidProductHtml.includes('404'), 'Must serve 404 error page');
  console.log('✓ Invalid product URL strictly returns 404 Not Found without silent redirect');

  // 1.3 Product API endpoint
  const productApiRes = await fetch(`${baseUrl}/api/products/prod-wallet-01`);
  assert.strictEqual(productApiRes.status, 200, 'Product API must return 200');
  const productJson = await productApiRes.json();
  assert(productJson.success === true && productJson.product, 'Must return valid product object');
  assert.strictEqual(productJson.product.id, 'prod-wallet-01');
  console.log('✓ Product API /api/products/:id returned product details successfully');

  // 1.4 Invalid Product API endpoint
  const invalidApiRes = await fetch(`${baseUrl}/api/products/fake-id-12345`);
  assert.strictEqual(invalidApiRes.status, 404, 'Invalid product API must return 404');
  console.log('✓ Invalid Product API /api/products/:id returned 404 Not Found');

  // 2. CATEGORY AUDITS
  console.log('\n--- 2. CATEGORY TESTS ---');

  // 2.1 Valid Category Direct URL
  const validCatRes = await fetch(`${baseUrl}/category/mens-accessories`);
  console.log(`[TEST 2.1] Direct Category URL /category/mens-accessories -> Status: ${validCatRes.status}`);
  assert.strictEqual(validCatRes.status, 200, 'Valid category direct URL must return HTTP 200');
  console.log('✓ Valid direct category URL serves HTML (200 OK)');

  // 2.2 Invalid Category Direct URL (Must return 404 and NOT redirect)
  const invalidCatRes = await fetch(`${baseUrl}/category/unknown-bogus-category-999`, {
    redirect: 'manual',
  });
  console.log(`[TEST 2.2] Invalid Category URL /category/unknown-bogus-category-999 -> Status: ${invalidCatRes.status}`);
  assert.strictEqual(invalidCatRes.status, 404, 'Invalid category URL must return 404');
  const invalidCatHtml = await invalidCatRes.text();
  assert(invalidCatHtml.includes('Category Not Found') || invalidCatHtml.includes('404'), 'Must serve 404 error page');
  console.log('✓ Invalid category URL strictly returns 404 Not Found without silent redirect');

  // 2.3 Category Pagination API
  const catPageRes = await fetch(`${baseUrl}/api/products?category=cat-mens-accessories&page=1&limit=24`);
  assert.strictEqual(catPageRes.status, 200);
  const catPageJson = await catPageRes.json();
  assert(catPageJson.total !== undefined && catPageJson.totalPages !== undefined, 'Must provide pagination metadata');
  console.log(`✓ Category pagination API verified: total=${catPageJson.total}, totalPages=${catPageJson.totalPages}`);

  // 3. HOMEPAGE AUDITS
  console.log('\n--- 3. HOMEPAGE TESTS ---');
  const hpRes = await fetch(`${baseUrl}/api/store/homepage`);
  assert.strictEqual(hpRes.status, 200);
  const hpJson = await hpRes.json();
  assert(hpJson.success === true);
  assert(Array.isArray(hpJson.categories) && hpJson.categories.length > 0, 'Homepage must have categories');
  assert(Array.isArray(hpJson.slides) && hpJson.slides.length > 0, 'Homepage must have hero slides');
  assert(hpJson.settings && hpJson.settings.siteName, 'Homepage must have site settings');
  console.log(`✓ Homepage consolidated API returned ${hpJson.categories.length} categories, ${hpJson.slides.length} slides, ${hpJson.products.length} products`);

  // 4. URL ROUTING AUDITS
  console.log('\n--- 4. URL BEHAVIOR TESTS ---');

  // 4.1 Root route
  const rootRes = await fetch(`${baseUrl}/`);
  assert.strictEqual(rootRes.status, 200);
  console.log('✓ Root URL / -> 200 OK');

  // 4.2 Known SPA routes
  const adminRes = await fetch(`${baseUrl}/admin`);
  assert.strictEqual(adminRes.status, 200);
  console.log('✓ Admin route /admin -> 200 OK');

  const resetPassRes = await fetch(`${baseUrl}/reset-password`);
  assert.strictEqual(resetPassRes.status, 200);
  console.log('✓ Reset password route /reset-password -> 200 OK');

  // 4.3 Unknown route outside SPA (Must return 404)
  const unknownRouteRes = await fetch(`${baseUrl}/totally-random-page-does-not-exist`, {
    redirect: 'manual',
  });
  console.log(`[TEST 4.3] Unknown Page URL /totally-random-page-does-not-exist -> Status: ${unknownRouteRes.status}`);
  assert.strictEqual(unknownRouteRes.status, 404, 'Unknown arbitrary route must return 404');
  console.log('✓ Unknown routes return 404 Page Not Found without silent redirect');

  console.log('\n===============================================================');
  console.log('ALL REGRESSION AUDIT CHECKS PASSED ✅');
  console.log('===============================================================');
}

runRegressionAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
