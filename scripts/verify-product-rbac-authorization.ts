/**
 * Automated Verification Suite for Server-Side Product API Authorization (Granular RBAC)
 *
 * Verifies:
 * A. Public customer -> active products -> allowed
 * B. Public customer -> inactive product -> denied / not exposed (404)
 * C. Admin without product.view -> protected product API -> denied (403)
 * D. Sub Admin without product.view -> protected product API -> denied (403)
 * E. Admin with product.view -> allowed (200)
 * F. Sub Admin with product.view -> allowed (200)
 * G. Super Admin -> allowed (200)
 * H. Unauthorized user cannot obtain buyingPrice or profit fields
 * I. Existing category/search/featured product functionality continues working
 */

import { createSignedTestToken, TEST_BASE_URL } from './test-auth-helper';

const BASE_URL = TEST_BASE_URL;

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${description}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🛡️  VERIFICATION SUITE: SERVER-SIDE PRODUCT API AUTHORIZATION');
  console.log('================================================================\n');

  // Persona 1: Public Customer
  const customerToken = createSignedTestToken({
    userId: 'test-customer-1',
    email: 'customer@local.test',
    role: 'customer',
  });

  // Persona 2: Admin WITHOUT product.view
  const adminNoProductViewToken = createSignedTestToken({
    userId: 'test-admin-no-product',
    email: 'orderadmin@local.test',
    role: 'admin',
    permissions: {
      'order.view': true,
      'order.manage': true,
      'product.view': false,
      'product.create': false,
      'product.update': false,
      'product.delete': false,
      'product.view_buying_price': false,
      'product.manage_buying_price': false,
      'product.view_profit': false,
    },
  });

  // Persona 3: Sub Admin WITHOUT product.view
  const subAdminNoProductViewToken = createSignedTestToken({
    userId: 'user-subadmin-orders',
    email: 'orders@rongdhonutrade.com',
    role: 'sub_admin',
    permissions: {
      'order.view': true,
      'courier.booking': true,
      'product.view': false,
      'product.create': false,
      'product.update': false,
      'product.delete': false,
    },
  });

  // Persona 4: Admin WITH product.view (but without buying price / profit)
  const adminWithProductViewToken = createSignedTestToken({
    userId: 'test-user-update-only',
    email: 'updater@local.test',
    role: 'admin',
    permissions: {
      'product.view': true,
      'product.update': true,
      'product.view_buying_price': false,
      'product.manage_buying_price': false,
      'product.view_profit': false,
    },
  });

  // Persona 5: Sub Admin WITH product.view
  const subAdminWithProductViewToken = createSignedTestToken({
    userId: 'user-subadmin-inventory',
    email: 'inventory@rongdhonutrade.com',
    role: 'sub_admin',
    permissions: {
      'product.view': true,
      'product.update': true,
    },
  });

  // Persona 6: Super Admin
  const superAdminToken = createSignedTestToken({
    userId: 'dev-super-admin-1',
    email: 'dev-superadmin@local.test',
    role: 'super_admin',
  });

  // ===========================================================================
  // TEST A: Public customer -> active products -> allowed
  // ===========================================================================
  console.log('\n[TEST A] Public customer -> active products -> allowed:');
  const testARes = await fetch(`${BASE_URL}/api/products`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const testAData = await testARes.json();
  assert(testARes.status === 200, 'Public customer gets HTTP 200 on GET /api/products');
  assert(testAData.success === true, 'Public customer response indicates success: true');
  assert(Array.isArray(testAData.products) && testAData.products.length > 0, 'Public customer receives active product list');
  const allActive = testAData.products.every((p: any) => p.status !== 'inactive' && !p.isDeleted);
  assert(allActive, 'Public customer only sees active non-deleted products');

  // Also test unauthenticated visitor on active product by ID
  const testAIdRes = await fetch(`${BASE_URL}/api/products/prod-wallet-01`);
  const testAIdData = await testAIdRes.json();
  assert(testAIdRes.status === 200, 'Public visitor gets HTTP 200 on active product prod-wallet-01');
  assert(testAIdData.product?.id === 'prod-wallet-01', 'Public visitor retrieves product details');

  // ===========================================================================
  // TEST B: Public customer -> inactive product -> denied / not exposed
  // ===========================================================================
  console.log('\n[TEST B] Public customer -> inactive product -> denied/not exposed:');
  const testBRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  assert(testBRes.status === 404, `Public customer accessing inactive product gets 404 (got ${testBRes.status})`);

  const testBUnauthRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`);
  assert(testBUnauthRes.status === 404, `Unauthenticated visitor accessing inactive product gets 404 (got ${testBUnauthRes.status})`);

  // ===========================================================================
  // TEST C: Admin without product.view -> protected product API -> denied
  // ===========================================================================
  console.log('\n[TEST C] Admin without product.view -> protected product API -> denied:');
  // C1: Requesting inactive product by ID
  const testCInactiveRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`, {
    headers: { Authorization: `Bearer ${adminNoProductViewToken}` },
  });
  assert(
    testCInactiveRes.status === 403,
    `Admin without product.view accessing inactive product gets 403 Forbidden (got ${testCInactiveRes.status})`
  );

  // C2: Requesting protected includeInactive=true
  const testCIncludeInactiveRes = await fetch(`${BASE_URL}/api/products?includeInactive=true`, {
    headers: { Authorization: `Bearer ${adminNoProductViewToken}` },
  });
  assert(
    testCIncludeInactiveRes.status === 403,
    `Admin without product.view requesting includeInactive=true gets 403 Forbidden (got ${testCIncludeInactiveRes.status})`
  );

  // C3: Requesting protected admin product endpoint /api/admin/products
  const testCAdminEndpointRes = await fetch(`${BASE_URL}/api/admin/products`, {
    headers: { Authorization: `Bearer ${adminNoProductViewToken}` },
  });
  assert(
    testCAdminEndpointRes.status === 403,
    `Admin without product.view accessing /api/admin/products gets 403 Forbidden (got ${testCAdminEndpointRes.status})`
  );

  // C4: Requesting protected admin single-product endpoint /api/admin/products/:id
  const testCAdminSingleRes = await fetch(`${BASE_URL}/api/admin/products/prod-wallet-01`, {
    headers: { Authorization: `Bearer ${adminNoProductViewToken}` },
  });
  assert(
    testCAdminSingleRes.status === 403,
    `Admin without product.view accessing /api/admin/products/:id gets 403 Forbidden (got ${testCAdminSingleRes.status})`
  );

  // ===========================================================================
  // TEST D: Sub Admin without product.view -> protected product API -> denied
  // ===========================================================================
  console.log('\n[TEST D] Sub Admin without product.view -> protected product API -> denied:');
  // D1: Requesting inactive product by ID
  const testDInactiveRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`, {
    headers: { Authorization: `Bearer ${subAdminNoProductViewToken}` },
  });
  assert(
    testDInactiveRes.status === 403,
    `Sub Admin without product.view accessing inactive product gets 403 Forbidden (got ${testDInactiveRes.status})`
  );

  // D2: Requesting protected includeInactive=true
  const testDIncludeInactiveRes = await fetch(`${BASE_URL}/api/products?includeInactive=true`, {
    headers: { Authorization: `Bearer ${subAdminNoProductViewToken}` },
  });
  assert(
    testDIncludeInactiveRes.status === 403,
    `Sub Admin without product.view requesting includeInactive=true gets 403 Forbidden (got ${testDIncludeInactiveRes.status})`
  );

  // D3: Requesting protected admin product endpoint /api/admin/products
  const testDAdminEndpointRes = await fetch(`${BASE_URL}/api/admin/products`, {
    headers: { Authorization: `Bearer ${subAdminNoProductViewToken}` },
  });
  assert(
    testDAdminEndpointRes.status === 403,
    `Sub Admin without product.view accessing /api/admin/products gets 403 Forbidden (got ${testDAdminEndpointRes.status})`
  );

  // ===========================================================================
  // TEST E: Admin with product.view -> allowed
  // ===========================================================================
  console.log('\n[TEST E] Admin with product.view -> allowed:');
  // E1: Accessing inactive product by ID
  const testEInactiveRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`, {
    headers: { Authorization: `Bearer ${adminWithProductViewToken}` },
  });
  assert(
    testEInactiveRes.status === 200,
    `Admin with product.view accessing inactive product gets 200 OK (got ${testEInactiveRes.status})`
  );
  const testEInactiveData = await testEInactiveRes.json();
  assert(testEInactiveData.product?.id === 'prod-test-inactive-01', 'Admin with product.view retrieved inactive product details');

  // E2: Requesting protected includeInactive=true
  const testEIncludeInactiveRes = await fetch(`${BASE_URL}/api/products?includeInactive=true`, {
    headers: { Authorization: `Bearer ${adminWithProductViewToken}` },
  });
  assert(
    testEIncludeInactiveRes.status === 200,
    `Admin with product.view requesting includeInactive=true gets 200 OK (got ${testEIncludeInactiveRes.status})`
  );
  const testEIncludeData = await testEIncludeInactiveRes.json();
  assert(
    testEIncludeData.products.some((p: any) => p.status === 'inactive'),
    'Admin with product.view receives inactive products when includeInactive=true'
  );

  // E3: Requesting /api/admin/products
  const testEAdminRes = await fetch(`${BASE_URL}/api/admin/products`, {
    headers: { Authorization: `Bearer ${adminWithProductViewToken}` },
  });
  assert(
    testEAdminRes.status === 200,
    `Admin with product.view accessing /api/admin/products gets 200 OK (got ${testEAdminRes.status})`
  );

  // ===========================================================================
  // TEST F: Sub Admin with product.view -> allowed
  // ===========================================================================
  console.log('\n[TEST F] Sub Admin with product.view -> allowed:');
  // F1: Accessing inactive product by ID
  const testFInactiveRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`, {
    headers: { Authorization: `Bearer ${subAdminWithProductViewToken}` },
  });
  assert(
    testFInactiveRes.status === 200,
    `Sub Admin with product.view accessing inactive product gets 200 OK (got ${testFInactiveRes.status})`
  );

  // F2: Requesting includeInactive=true
  const testFIncludeInactiveRes = await fetch(`${BASE_URL}/api/products?includeInactive=true`, {
    headers: { Authorization: `Bearer ${subAdminWithProductViewToken}` },
  });
  assert(
    testFIncludeInactiveRes.status === 200,
    `Sub Admin with product.view requesting includeInactive=true gets 200 OK (got ${testFIncludeInactiveRes.status})`
  );

  // F3: Requesting /api/admin/products
  const testFAdminRes = await fetch(`${BASE_URL}/api/admin/products`, {
    headers: { Authorization: `Bearer ${subAdminWithProductViewToken}` },
  });
  assert(
    testFAdminRes.status === 200,
    `Sub Admin with product.view accessing /api/admin/products gets 200 OK (got ${testFAdminRes.status})`
  );

  // ===========================================================================
  // TEST G: Super Admin -> allowed
  // ===========================================================================
  console.log('\n[TEST G] Super Admin -> allowed:');
  // G1: Accessing inactive product by ID
  const testGInactiveRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert(
    testGInactiveRes.status === 200,
    `Super Admin accessing inactive product gets 200 OK (got ${testGInactiveRes.status})`
  );

  // G2: Requesting includeInactive=true
  const testGIncludeInactiveRes = await fetch(`${BASE_URL}/api/products?includeInactive=true`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert(
    testGIncludeInactiveRes.status === 200,
    `Super Admin requesting includeInactive=true gets 200 OK (got ${testGIncludeInactiveRes.status})`
  );

  // G3: Requesting /api/admin/products
  const testGAdminRes = await fetch(`${BASE_URL}/api/admin/products`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert(
    testGAdminRes.status === 200,
    `Super Admin accessing /api/admin/products gets 200 OK (got ${testGAdminRes.status})`
  );

  // ===========================================================================
  // TEST H: Unauthorized user cannot obtain buyingPrice or profit fields
  // ===========================================================================
  console.log('\n[TEST H] Unauthorized user cannot obtain buyingPrice or profit fields:');
  const FORBIDDEN_FIELDS = [
    'buyingPrice',
    'buying_price',
    'unitProfit',
    'unit_profit',
    'grossProfit',
    'gross_profit',
    'productCost',
    'product_cost',
    'profitMargin',
    'profit_margin',
  ];

  // H1: Public Customer
  const custProdsRes = await fetch(`${BASE_URL}/api/products`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const custProdsData = await custProdsRes.json();
  let custLeaks = 0;
  for (const p of custProdsData.products || []) {
    for (const f of FORBIDDEN_FIELDS) {
      if (p[f] !== undefined) custLeaks++;
    }
  }
  assert(custLeaks === 0, `Public customer response contains 0 leaked buyingPrice/profit fields (found ${custLeaks})`);

  // H2: Admin with product.view but WITHOUT product.view_buying_price
  const adminViewerProdsRes = await fetch(`${BASE_URL}/api/products`, {
    headers: { Authorization: `Bearer ${adminWithProductViewToken}` },
  });
  const adminViewerProdsData = await adminViewerProdsRes.json();
  let adminViewerLeaks = 0;
  for (const p of adminViewerProdsData.products || []) {
    for (const f of FORBIDDEN_FIELDS) {
      if (p[f] !== undefined) adminViewerLeaks++;
    }
  }
  assert(
    adminViewerLeaks === 0,
    `Admin without buying_price permission contains 0 leaked buyingPrice/profit fields (found ${adminViewerLeaks})`
  );

  // H3: Super Admin DOES legitimately receive buyingPrice and unitProfit
  const superProdsRes = await fetch(`${BASE_URL}/api/products`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const superProdsData = await superProdsRes.json();
  const superHasBuyingPrice = (superProdsData.products || []).some((p: any) => p.buyingPrice !== undefined);
  const superHasUnitProfit = (superProdsData.products || []).some((p: any) => p.unitProfit !== undefined);
  assert(superHasBuyingPrice, 'Super Admin legitimately receives buyingPrice');
  assert(superHasUnitProfit, 'Super Admin legitimately receives unitProfit');

  // ===========================================================================
  // TEST I: Existing category/search/featured product functionality continues working
  // ===========================================================================
  console.log('\n[TEST I] Existing category/search/featured product functionality:');
  // I1: Category filter
  const catRes = await fetch(`${BASE_URL}/api/products?category=cat-mens-accessories`);
  const catData = await catRes.json();
  assert(catRes.status === 200, 'GET /api/products?category=... returns HTTP 200');
  assert(Array.isArray(catData.products) && catData.products.length > 0, 'Category filter returns non-empty products list');
  const allCategoryMatch = catData.products.every((p: any) => p.categoryId === 'cat-mens-accessories');
  assert(allCategoryMatch, 'All returned products match requested category');

  // I2: Search filter
  const searchRes = await fetch(`${BASE_URL}/api/products?search=wallet`);
  const searchData = await searchRes.json();
  assert(searchRes.status === 200, 'GET /api/products?search=... returns HTTP 200');
  assert(Array.isArray(searchData.products) && searchData.products.length > 0, 'Search filter returns matching products');
  const searchMatch = searchData.products.some((p: any) =>
    p.title?.toLowerCase().includes('wallet') || p.description?.toLowerCase().includes('wallet')
  );
  assert(searchMatch, 'Returned search products contain search query term');

  // I3: Featured filter
  const featRes = await fetch(`${BASE_URL}/api/products?featured=true`);
  const featData = await featRes.json();
  assert(featRes.status === 200, 'GET /api/products?featured=true returns HTTP 200');
  assert(Array.isArray(featData.products) && featData.products.length > 0, 'Featured filter returns non-empty list');
  const allFeatured = featData.products.every((p: any) => Boolean(p.featured) === true);
  assert(allFeatured, 'All returned products from featured filter have featured=true');

  // I4: Homepage consolidated route
  const hpRes = await fetch(`${BASE_URL}/api/store/homepage`);
  const hpData = await hpRes.json();
  assert(hpRes.status === 200, 'GET /api/store/homepage returns HTTP 200');
  assert(Array.isArray(hpData.categories), 'Homepage data includes categories array');
  assert(Array.isArray(hpData.slides), 'Homepage data includes slides array');
  assert(Array.isArray(hpData.featuredProducts), 'Homepage data includes featuredProducts array');
  assert(Boolean(hpData.categoryProducts), 'Homepage data includes categoryProducts map');

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
