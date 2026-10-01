/**
 * Automated Verification Suite for Public Product API Performance,
 * Safe Pagination Defaults, Hard Limits, and Admin Integrity.
 * Rongdhonu Trade
 */

async function runProductApiPerformanceVerification() {
  console.log('================================================================');
  console.log('STARTING PUBLIC PRODUCT API PERFORMANCE & PAGINATION VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  const baseUrl = 'http://127.0.0.1:3000';

  // Admin token
  const adminToken = `dev-jwt-${Buffer.from(
    JSON.stringify({
      userId: 'dev-super-admin-1',
      email: 'dev-superadmin@local.test',
      role: 'super_admin',
      exp: Date.now() + 86400000,
    })
  ).toString('base64')}`;

  // ================================================================
  // 1. PUBLIC STOREFRONT REQUESTS - SAFE DEFAULTS & HARD MAXIMUM LIMITS
  // ================================================================
  console.log('--- 1. PUBLIC STOREFRONT REQUESTS ---');

  // 1.1 Public request without pagination parameters defaults to page=1, limit=24
  const res1 = await fetch(`${baseUrl}/api/products`);
  const json1 = await res1.json();
  assert(
    res1.status === 200 &&
      json1.success === true &&
      json1.page === 1 &&
      json1.limit === 24 &&
      Array.isArray(json1.products) &&
      json1.products.length <= 24,
    '1.1 Public GET /api/products without pagination parameters defaults to page=1, limit=24'
  );

  // 1.2 Public request with arbitrary huge limit (?limit=100000) is strictly capped at MAX_PUBLIC_LIMIT (48)
  const res2 = await fetch(`${baseUrl}/api/products?limit=100000`);
  const json2 = await res2.json();
  assert(
    res2.status === 200 &&
      json2.success === true &&
      json2.limit === 48 &&
      json2.products.length <= 48,
    '1.2 Public GET /api/products?limit=100000 is strictly capped at hard maximum limit of 48'
  );

  // 1.3 Public request with zero or negative limit (?limit=0) is clamped to 1
  const res3 = await fetch(`${baseUrl}/api/products?limit=0`);
  const json3 = await res3.json();
  assert(
    res3.status === 200 &&
      json3.success === true &&
      json3.limit >= 1 &&
      json3.limit <= 48,
    '1.3 Public GET /api/products?limit=0 is safely clamped to a valid positive range'
  );

  // 1.4 Public request with explicit valid pagination (?page=1&limit=5) returns exactly limit
  const res4 = await fetch(`${baseUrl}/api/products?page=1&limit=5`);
  const json4 = await res4.json();
  assert(
    res4.status === 200 &&
      json4.success === true &&
      json4.page === 1 &&
      json4.limit === 5 &&
      json4.count === 5 &&
      json4.products.length === 5,
    '1.4 Public GET /api/products?page=1&limit=5 correctly preserves explicit pagination (count=5, limit=5)'
  );

  // 1.5 Public request for page 2 returns distinct items
  const res5 = await fetch(`${baseUrl}/api/products?page=2&limit=5`);
  const json5 = await res5.json();
  const page1Ids = new Set((json4.products || []).map((p: any) => p.id));
  const page2HasOverlap = (json5.products || []).some((p: any) => page1Ids.has(p.id));
  assert(
    res5.status === 200 &&
      json5.success === true &&
      json5.page === 2 &&
      json5.limit === 5 &&
      !page2HasOverlap,
    '1.5 Public GET /api/products?page=2&limit=5 returns distinct page 2 records without overlap'
  );

  // 1.6 Public requests never contain sensitive buyingPrice or unitProfit
  const hasBuyingPriceInPublic = JSON.stringify(json1).includes('buyingPrice');
  const hasUnitProfitInPublic = JSON.stringify(json1).includes('unitProfit');
  assert(
    !hasBuyingPriceInPublic && !hasUnitProfitInPublic,
    '1.6 Public /api/products response strictly redacts buyingPrice and unitProfit'
  );

  // ================================================================
  // 2. CATEGORY, SEARCH & STOREFRONT VIEWS INTEGRATION
  // ================================================================
  console.log('\n--- 2. CATEGORY, SEARCH & STOREFRONT VIEWS ---');

  // 2.1 Category paginated query (?category=cat-mens-accessories&page=1&limit=24)
  const resCat = await fetch(`${baseUrl}/api/products?category=cat-mens-accessories&page=1&limit=24`);
  const jsonCat = await resCat.json();
  assert(
    resCat.status === 200 &&
      jsonCat.success === true &&
      jsonCat.page === 1 &&
      jsonCat.limit === 24 &&
      Array.isArray(jsonCat.products) &&
      jsonCat.products.every((p: any) => p.categoryId === 'cat-mens-accessories'),
    '2.1 Category listing query preserves category pagination and filters accurately'
  );

  // 2.2 Search paginated query (?search=wallet&page=1&limit=24)
  const resSearch = await fetch(`${baseUrl}/api/products?search=wallet&page=1&limit=24`);
  const jsonSearch = await resSearch.json();
  assert(
    resSearch.status === 200 &&
      jsonSearch.success === true &&
      jsonSearch.products.length >= 1 &&
      jsonSearch.products[0].title.toLowerCase().includes('wallet'),
    '2.2 Product search query preserves search filtering and pagination'
  );

  // 2.3 Single product detail view (/api/products/:id)
  const resDetail = await fetch(`${baseUrl}/api/products/prod-wallet-01`);
  const jsonDetail = await resDetail.json();
  assert(
    resDetail.status === 200 &&
      jsonDetail.success === true &&
      jsonDetail.product?.id === 'prod-wallet-01',
    '2.3 Single product detail endpoint (/api/products/:id) functions normally'
  );

  // 2.4 Consolidated homepage API (/api/store/homepage)
  const resHome = await fetch(`${baseUrl}/api/store/homepage`);
  const jsonHome = await resHome.json();
  assert(
    resHome.status === 200 &&
      jsonHome.success === true &&
      Array.isArray(jsonHome.categories) &&
      Array.isArray(jsonHome.slides) &&
      Array.isArray(jsonHome.products) &&
      typeof jsonHome.categoryProducts === 'object',
    '2.4 Consolidated /api/store/homepage architecture remains intact and functional'
  );

  // ================================================================
  // 3. AUTHORIZED ADMIN PRODUCT MANAGEMENT PRESERVATION
  // ================================================================
  console.log('\n--- 3. AUTHORIZED ADMIN PRODUCT MANAGEMENT ---');

  // 3.1 Authorized Admin request without pagination returns full catalog
  const resAdmin = await fetch(`${baseUrl}/api/products`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const jsonAdmin = await resAdmin.json();
  assert(
    resAdmin.status === 200 &&
      jsonAdmin.success === true &&
      jsonAdmin.count === jsonAdmin.total &&
      jsonAdmin.products.length === jsonAdmin.total &&
      jsonAdmin.total >= 17,
    `3.1 Authorized Admin GET /api/products returns full catalog (${jsonAdmin.total} products) for inventory management`
  );

  // 3.2 Authorized Admin response includes financial fields (buyingPrice)
  const hasBuyingPriceInAdmin = (jsonAdmin.products || []).some((p: any) => p.buyingPrice !== undefined);
  assert(
    hasBuyingPriceInAdmin,
    '3.2 Authorized Admin response includes buyingPrice for profit calculations'
  );

  // 3.3 Authorized Admin request with custom large limit (?limit=200) allows up to MAX_ADMIN_LIMIT (500)
  const resAdminLimit = await fetch(`${baseUrl}/api/products?page=1&limit=200`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const jsonAdminLimit = await resAdminLimit.json();
  assert(
    resAdminLimit.status === 200 &&
      jsonAdminLimit.success === true &&
      jsonAdminLimit.limit === 200,
    '3.3 Authorized Admin request supports large custom limits (limit=200)'
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runProductApiPerformanceVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
