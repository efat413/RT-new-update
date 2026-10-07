import { createSignedTestToken, TEST_BASE_URL } from './test-auth-helper';

const BASE_URL = TEST_BASE_URL;

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    results.push({ name, passed: true, details });
  } else {
    console.error(`  ❌ [FAIL] ${name} ${details ? `(${details})` : ''}`);
    results.push({ name, passed: false, details });
  }
}

async function run() {
  console.log('================================================================');
  console.log('🔒 SERVER-SIDE PRODUCT & INACTIVE PRODUCT AUTHORIZATION SUITE');
  console.log('================================================================\n');

  // Personas
  const guestHeaders: Record<string, string> = { Accept: 'application/json' };

  // Customer
  const customerToken = createSignedTestToken({
    userId: 'test-customer-1',
    email: 'customer@local.test',
    role: 'customer',
  });
  const customerHeaders = { Authorization: `Bearer ${customerToken}`, Accept: 'application/json' };

  // Admin WITHOUT product.view (orderadmin@local.test / test-admin-no-product)
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
      'product.view_profit': false,
    },
  });
  const adminNoProductViewHeaders = { Authorization: `Bearer ${adminNoProductViewToken}`, Accept: 'application/json' };

  // Sub Admin WITHOUT product.view (orders@rongdhonutrade.com / user-subadmin-orders)
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
      'product.view_buying_price': false,
      'product.view_profit': false,
    },
  });
  const subAdminNoProductViewHeaders = { Authorization: `Bearer ${subAdminNoProductViewToken}`, Accept: 'application/json' };

  // Admin WITH product.view (updater@local.test / test-user-update-only)
  const adminWithProductViewToken = createSignedTestToken({
    userId: 'test-user-update-only',
    email: 'updater@local.test',
    role: 'admin',
    permissions: {
      'product.view': true,
      'product.update': true,
      'product.view_buying_price': false,
      'product.view_profit': false,
    },
  });
  const adminWithProductViewHeaders = { Authorization: `Bearer ${adminWithProductViewToken}`, Accept: 'application/json' };

  // Sub Admin WITH product.view (inventory@rongdhonutrade.com / user-subadmin-inventory)
  const subAdminWithProductViewToken = createSignedTestToken({
    userId: 'user-subadmin-inventory',
    email: 'inventory@rongdhonutrade.com',
    role: 'sub_admin',
    permissions: {
      'product.view': true,
      'product.update': true,
      'product.view_buying_price': false,
      'product.view_profit': false,
    },
  });
  const subAdminWithProductViewHeaders = { Authorization: `Bearer ${subAdminWithProductViewToken}`, Accept: 'application/json' };

  // Super Admin
  const superAdminToken = createSignedTestToken({
    userId: 'dev-superadmin-1',
    email: 'dev-superadmin@local.test',
    role: 'super_admin',
  });
  const superAdminHeaders = { Authorization: `Bearer ${superAdminToken}`, Accept: 'application/json' };

  const inactiveProductId = 'prod-test-inactive-01';
  const inactiveProductSlug = 'inactive-test-product';

  // -------------------------------------------------------------
  // Test A: Public Customer / Guest -> Active Products -> Allowed
  // -------------------------------------------------------------
  console.log('--- Test A: Public Storefront Active Products ---');
  {
    const res = await fetch(`${BASE_URL}/api/products`, { headers: guestHeaders });
    assert(res.status === 200, 'Guest GET /api/products returns HTTP 200');
    const data = await res.json();
    assert(data.success === true, 'Guest GET /api/products success is true');
    assert(Array.isArray(data.products) && data.products.length > 0, 'Guest receives active product list');
    const hasInactive = data.products.some((p: any) => p.id === inactiveProductId || p.slug === inactiveProductSlug || p.status === 'inactive');
    assert(!hasInactive, 'Guest NEVER sees inactive products in general product list');
    const hasBuyingPrice = data.products.some((p: any) => p.buyingPrice !== undefined || p.buying_price !== undefined || p.unitProfit !== undefined);
    assert(!hasBuyingPrice, 'Guest NEVER sees buyingPrice or profit fields');
  }

  // -------------------------------------------------------------
  // Test B: Public Customer / Guest -> Inactive Product (by ID) -> 404
  // -------------------------------------------------------------
  console.log('\n--- Test B: Public Customer / Guest Direct Inactive ID ---');
  {
    const guestRes = await fetch(`${BASE_URL}/api/products/${inactiveProductId}`, { headers: guestHeaders });
    assert(guestRes.status === 404, 'Guest GET /api/products/:inactiveId returns HTTP 404 (Not Found)', `Status: ${guestRes.status}`);

    const custRes = await fetch(`${BASE_URL}/api/products/${inactiveProductId}`, { headers: customerHeaders });
    assert(custRes.status === 404, 'Authenticated Customer GET /api/products/:inactiveId returns HTTP 404 (Not Found)', `Status: ${custRes.status}`);
  }

  // -------------------------------------------------------------
  // Test C: Public Customer / Guest -> Inactive Product (by Slug) -> 404
  // -------------------------------------------------------------
  console.log('\n--- Test C: Public Customer / Guest Direct Inactive Slug ---');
  {
    const guestRes = await fetch(`${BASE_URL}/api/products/${inactiveProductSlug}`, { headers: guestHeaders });
    assert(guestRes.status === 404, 'Guest GET /api/products/:inactiveSlug returns HTTP 404 (Not Found)', `Status: ${guestRes.status}`);

    const custRes = await fetch(`${BASE_URL}/api/products/${inactiveProductSlug}`, { headers: customerHeaders });
    assert(custRes.status === 404, 'Authenticated Customer GET /api/products/:inactiveSlug returns HTTP 404 (Not Found)', `Status: ${custRes.status}`);
  }

  // -------------------------------------------------------------
  // Test D: Customer / Guest + includeInactive=true -> Blocked / No Inactive
  // -------------------------------------------------------------
  console.log('\n--- Test D: Customer / Guest with includeInactive=true ---');
  {
    const guestRes = await fetch(`${BASE_URL}/api/products?includeInactive=true`, { headers: guestHeaders });
    assert(guestRes.status === 401, 'Guest GET /api/products?includeInactive=true returns HTTP 401 Unauthorized', `Status: ${guestRes.status}`);

    const custRes = await fetch(`${BASE_URL}/api/products?includeInactive=true`, { headers: customerHeaders });
    assert(custRes.status === 403, 'Customer GET /api/products?includeInactive=true returns HTTP 403 Forbidden', `Status: ${custRes.status}`);
  }

  // -------------------------------------------------------------
  // Test E: Customer / Guest + all=true -> Blocked / No Inactive
  // -------------------------------------------------------------
  console.log('\n--- Test E: Customer / Guest with all=true ---');
  {
    const guestRes = await fetch(`${BASE_URL}/api/products?all=true`, { headers: guestHeaders });
    assert(guestRes.status === 401, 'Guest GET /api/products?all=true returns HTTP 401 Unauthorized', `Status: ${guestRes.status}`);

    const custRes = await fetch(`${BASE_URL}/api/products?all=true`, { headers: customerHeaders });
    assert(custRes.status === 403, 'Customer GET /api/products?all=true returns HTTP 403 Forbidden', `Status: ${custRes.status}`);
  }

  // -------------------------------------------------------------
  // Test F: Admin WITHOUT product.view -> Protected Product APIs -> Denied (403)
  // -------------------------------------------------------------
  console.log('\n--- Test F: Admin WITHOUT product.view Protected APIs ---');
  {
    const resAdminRoute = await fetch(`${BASE_URL}/api/admin/products`, { headers: adminNoProductViewHeaders });
    assert(resAdminRoute.status === 403, 'Admin without product.view GET /api/admin/products returns HTTP 403', `Status: ${resAdminRoute.status}`);

    const resInactiveParam = await fetch(`${BASE_URL}/api/products?includeInactive=true`, { headers: adminNoProductViewHeaders });
    assert(resInactiveParam.status === 403, 'Admin without product.view GET /api/products?includeInactive=true returns HTTP 403', `Status: ${resInactiveParam.status}`);

    const resAllParam = await fetch(`${BASE_URL}/api/products?all=true`, { headers: adminNoProductViewHeaders });
    assert(resAllParam.status === 403, 'Admin without product.view GET /api/products?all=true returns HTTP 403', `Status: ${resAllParam.status}`);

    const resAdminParam = await fetch(`${BASE_URL}/api/products?admin=true`, { headers: adminNoProductViewHeaders });
    assert(resAdminParam.status === 403, 'Admin without product.view GET /api/products?admin=true returns HTTP 403', `Status: ${resAdminParam.status}`);

    const resInactiveById = await fetch(`${BASE_URL}/api/products/${inactiveProductId}`, { headers: adminNoProductViewHeaders });
    assert(resInactiveById.status === 403, 'Admin without product.view GET /api/products/:inactiveId returns HTTP 403', `Status: ${resInactiveById.status}`);

    const resInactiveBySlug = await fetch(`${BASE_URL}/api/products/${inactiveProductSlug}`, { headers: adminNoProductViewHeaders });
    assert(resInactiveBySlug.status === 403, 'Admin without product.view GET /api/products/:inactiveSlug returns HTTP 403', `Status: ${resInactiveBySlug.status}`);
  }

  // -------------------------------------------------------------
  // Test G: Sub Admin WITHOUT product.view -> Protected Product APIs -> Denied (403)
  // -------------------------------------------------------------
  console.log('\n--- Test G: Sub Admin WITHOUT product.view Protected APIs ---');
  {
    const resAdminRoute = await fetch(`${BASE_URL}/api/admin/products`, { headers: subAdminNoProductViewHeaders });
    assert(resAdminRoute.status === 403, 'Sub Admin without product.view GET /api/admin/products returns HTTP 403', `Status: ${resAdminRoute.status}`);

    const resInactiveParam = await fetch(`${BASE_URL}/api/products?includeInactive=true`, { headers: subAdminNoProductViewHeaders });
    assert(resInactiveParam.status === 403, 'Sub Admin without product.view GET /api/products?includeInactive=true returns HTTP 403', `Status: ${resInactiveParam.status}`);

    const resAllParam = await fetch(`${BASE_URL}/api/products?all=true`, { headers: subAdminNoProductViewHeaders });
    assert(resAllParam.status === 403, 'Sub Admin without product.view GET /api/products?all=true returns HTTP 403', `Status: ${resAllParam.status}`);

    const resInactiveById = await fetch(`${BASE_URL}/api/products/${inactiveProductId}`, { headers: subAdminNoProductViewHeaders });
    assert(resInactiveById.status === 403, 'Sub Admin without product.view GET /api/products/:inactiveId returns HTTP 403', `Status: ${resInactiveById.status}`);

    const resInactiveBySlug = await fetch(`${BASE_URL}/api/products/${inactiveProductSlug}`, { headers: subAdminNoProductViewHeaders });
    assert(resInactiveBySlug.status === 403, 'Sub Admin without product.view GET /api/products/:inactiveSlug returns HTTP 403', `Status: ${resInactiveBySlug.status}`);
  }

  // -------------------------------------------------------------
  // Test H: Admin WITH product.view -> Allowed
  // -------------------------------------------------------------
  console.log('\n--- Test H: Admin WITH product.view Access ---');
  {
    const resAdmin = await fetch(`${BASE_URL}/api/admin/products`, { headers: adminWithProductViewHeaders });
    assert(resAdmin.status === 200, 'Admin with product.view GET /api/admin/products returns HTTP 200', `Status: ${resAdmin.status}`);
    const dataAdmin = await resAdmin.json();
    assert(dataAdmin.success === true, 'Admin with product.view receives product catalog');
    const hasInactive = dataAdmin.products.some((p: any) => p.id === inactiveProductId);
    assert(hasInactive, 'Admin with product.view sees inactive products in admin catalog');

    const resSingleInactive = await fetch(`${BASE_URL}/api/products/${inactiveProductId}`, { headers: adminWithProductViewHeaders });
    assert(resSingleInactive.status === 200, 'Admin with product.view GET /api/products/:inactiveId returns HTTP 200', `Status: ${resSingleInactive.status}`);

    const resSingleSlug = await fetch(`${BASE_URL}/api/products/${inactiveProductSlug}`, { headers: adminWithProductViewHeaders });
    assert(resSingleSlug.status === 200, 'Admin with product.view GET /api/products/:inactiveSlug returns HTTP 200', `Status: ${resSingleSlug.status}`);

    const singleData = await resSingleInactive.json();
    assert(singleData.product.buyingPrice === undefined, 'Admin without view_buying_price does NOT receive buyingPrice');
  }

  // -------------------------------------------------------------
  // Test I: Sub Admin WITH product.view -> Allowed
  // -------------------------------------------------------------
  console.log('\n--- Test I: Sub Admin WITH product.view Access ---');
  {
    const resAdmin = await fetch(`${BASE_URL}/api/admin/products`, { headers: subAdminWithProductViewHeaders });
    assert(resAdmin.status === 200, 'Sub Admin with product.view GET /api/admin/products returns HTTP 200', `Status: ${resAdmin.status}`);

    const resSingleInactive = await fetch(`${BASE_URL}/api/products/${inactiveProductId}`, { headers: subAdminWithProductViewHeaders });
    assert(resSingleInactive.status === 200, 'Sub Admin with product.view GET /api/products/:inactiveId returns HTTP 200', `Status: ${resSingleInactive.status}`);

    const resSingleSlug = await fetch(`${BASE_URL}/api/products/${inactiveProductSlug}`, { headers: subAdminWithProductViewHeaders });
    assert(resSingleSlug.status === 200, 'Sub Admin with product.view GET /api/products/:inactiveSlug returns HTTP 200', `Status: ${resSingleSlug.status}`);
  }

  // -------------------------------------------------------------
  // Test J: Super Admin -> Legitimate Master Access
  // -------------------------------------------------------------
  console.log('\n--- Test J: Super Admin Master Access ---');
  {
    const resAdmin = await fetch(`${BASE_URL}/api/admin/products`, { headers: superAdminHeaders });
    assert(resAdmin.status === 200, 'Super Admin GET /api/admin/products returns HTTP 200', `Status: ${resAdmin.status}`);
    const data = await resAdmin.json();
    assert(data.success === true, 'Super Admin successfully retrieves products');
    const hasInactive = data.products.some((p: any) => p.id === inactiveProductId);
    assert(hasInactive, 'Super Admin sees inactive products');

    const resSingleInactive = await fetch(`${BASE_URL}/api/products/${inactiveProductId}`, { headers: superAdminHeaders });
    assert(resSingleInactive.status === 200, 'Super Admin GET /api/products/:inactiveId returns HTTP 200', `Status: ${resSingleInactive.status}`);
    const singleData = await resSingleInactive.json();
    assert(singleData.product.buyingPrice !== undefined, 'Super Admin legitimately sees buyingPrice');
  }

  // -------------------------------------------------------------
  // Test K: Storefront Functionality (Search, Category, Featured, Homepage)
  // -------------------------------------------------------------
  console.log('\n--- Test K: Storefront Browsing Features ---');
  {
    const catRes = await fetch(`${BASE_URL}/api/products?category=cat-mens-accessories`, { headers: guestHeaders });
    assert(catRes.status === 200, 'Guest category filter returns HTTP 200');
    const catData = await catRes.json();
    assert(!catData.products.some((p: any) => p.status === 'inactive'), 'Category products do not contain inactive items');

    const featRes = await fetch(`${BASE_URL}/api/products?featured=true`, { headers: guestHeaders });
    assert(featRes.status === 200, 'Guest featured filter returns HTTP 200');
    const featData = await featRes.json();
    assert(!featData.products.some((p: any) => p.status === 'inactive'), 'Featured products do not contain inactive items');

    const homeRes = await fetch(`${BASE_URL}/api/store/homepage`, { headers: guestHeaders });
    assert(homeRes.status === 200, 'Guest homepage API returns HTTP 200');
    const homeData = await homeRes.json();
    assert(homeData.success === true && Array.isArray(homeData.featuredProducts), 'Homepage API structure valid');
  }

  // -------------------------------------------------------------
  // Test L: Cache-Control Headers Security
  // -------------------------------------------------------------
  console.log('\n--- Test L: Cache-Control Header Audit ---');
  {
    // Public active product should allow caching
    const activeRes = await fetch(`${BASE_URL}/api/products`, { headers: guestHeaders });
    const publicCacheHeader = activeRes.headers.get('Cache-Control') || '';
    assert(publicCacheHeader.includes('public'), 'Public active products list has public Cache-Control header');

    // Inactive product access by authorized user MUST have no-store / private
    const authInactiveRes = await fetch(`${BASE_URL}/api/products/${inactiveProductId}`, { headers: superAdminHeaders });
    const authCacheHeader = authInactiveRes.headers.get('Cache-Control') || '';
    assert(
      authCacheHeader.includes('no-store') || authCacheHeader.includes('private'),
      'Authorized inactive product read has no-store/private Cache-Control header',
      `Header: ${authCacheHeader}`
    );
  }

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n================================================================');
  const failed = results.filter((r) => !r.passed);
  if (failed.length === 0) {
    console.log(`🎉 ALL ${results.length} AUTHORIZATION & INACTIVE PRODUCT TESTS PASSED!`);
  } else {
    console.error(`❌ ${failed.length} of ${results.length} TESTS FAILED!`);
    process.exit(1);
  }
  console.log('================================================================');
}

run().catch((err) => {
  console.error('Fatal error running authorization test suite:', err);
  process.exit(1);
});
