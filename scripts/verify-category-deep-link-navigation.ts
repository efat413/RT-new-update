import assert from 'assert';

async function runCategoryDeepLinkVerification() {
  const baseUrl = 'http://localhost:3000';
  console.log('===============================================================');
  console.log('STARTING CATEGORY DEEP LINK & DIRECT URL BEHAVIOR VERIFICATION');
  console.log('===============================================================');

  // Test 1: Direct Category URL HTTP Response
  console.log('\n[TEST 1] Testing direct GET on /category/mens-accessories...');
  const catRes = await fetch(`${baseUrl}/category/mens-accessories`);
  assert.strictEqual(catRes.status, 200, 'Direct category URL must return 200 OK');
  const catHtml = await catRes.text();
  assert(catHtml.includes('<!DOCTYPE html>') || catHtml.includes('<html'), 'Must serve HTML applet document');
  console.log('✓ Direct GET /category/mens-accessories returns 200 OK HTML');

  // Test 2: Verify category product pagination API endpoint with slug
  console.log('\n[TEST 2] Testing /api/products?category=mens-accessories...');
  const apiRes = await fetch(`${baseUrl}/api/products?category=mens-accessories&page=1&limit=24`);
  assert.strictEqual(apiRes.status, 200, 'Category API must return 200 OK');
  const apiData = await apiRes.json();
  assert.strictEqual(apiData.success, true, 'API response must succeed');
  assert(apiData.products.length > 0, 'Must return products for category');
  console.log(`✓ /api/products?category=mens-accessories returned ${apiData.products.length} items (total: ${apiData.total})`);

  // Test 3: Verify category product pagination API endpoint with category ID
  console.log('\n[TEST 3] Testing /api/products?category=cat-mens-accessories (by ID)...');
  const apiIdRes = await fetch(`${baseUrl}/api/products?category=cat-mens-accessories&page=1&limit=24`);
  assert.strictEqual(apiIdRes.status, 200, 'Category API by ID must return 200 OK');
  const apiIdData = await apiIdRes.json();
  assert.strictEqual(apiIdData.success, true, 'API response must succeed');
  assert.strictEqual(apiIdData.total, apiData.total, 'Both slug and ID queries must return identical totals');
  console.log(`✓ Both slug and ID queries return consistent total: ${apiIdData.total}`);

  // Test 4: Verify Homepage store API includes all categories for matching
  console.log('\n[TEST 4] Verifying /api/store/homepage contains category definitions...');
  const hpRes = await fetch(`${baseUrl}/api/store/homepage`);
  assert.strictEqual(hpRes.status, 200, 'Homepage store API must return 200 OK');
  const hpData = await hpRes.json();
  assert(Array.isArray(hpData.categories), 'categories must be an array');
  const matched = hpData.categories.find(
    (c: any) => c.slug?.toLowerCase() === 'mens-accessories' || c.id === 'mens-accessories'
  );
  assert(matched, 'Category mens-accessories must exist in categories array');
  console.log(`✓ Category mens-accessories found in store data: id="${matched.id}", name="${matched.name}", slug="${matched.slug}"`);

  // Test 5: Verify invalid category URL returns genuine 404 (does NOT show homepage or redirect silently)
  console.log('\n[TEST 5] Testing non-existent category URL...');
  const invalidRes = await fetch(`${baseUrl}/category/non-existent-random-category-99999`);
  assert.strictEqual(invalidRes.status, 404, 'Invalid category must return 404 Not Found');
  console.log('✓ Invalid category URL strictly returns 404 Not Found');

  console.log('\n===============================================================');
  console.log('ALL CATEGORY DEEP LINK VERIFICATION CHECKS PASSED! ✅');
  console.log('===============================================================\n');
}

runCategoryDeepLinkVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
