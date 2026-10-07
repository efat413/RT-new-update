/**
 * Automated Verification Suite for Server-Side Product API Authorization (Granular RBAC)
 *
 * Verifies exact requirements:
 * 1. customer + includeInactive=true -> blocked (403)
 * 2. customer + all=true -> blocked (403)
 * 3. admin without product.view + includeInactive=true -> blocked (403)
 * 4. sub_admin without product.view + all=true -> blocked (403)
 * 5. authorized staff + inactive products -> allowed (200)
 * 6. super_admin + inactive products -> allowed (200)
 * 7. direct inactive product ID -> blocked for unauthorized (404/403), allowed for authorized (200)
 * 8. direct inactive slug -> blocked for unauthorized (404/403), allowed for authorized (200)
 * 9. public active product browsing -> allowed, strictly no inactive products leaked
 * 10. Cache-Control behavior -> no-store / private headers prevent authorized responses from leaking via CDN/browser cache
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
  console.log('🛡️  VERIFICATION SUITE: INACTIVE PRODUCT RBAC AUTHORIZATION');
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

  // Persona 4: Authorized Staff (Admin WITH product.view)
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

  // Persona 5: Authorized Staff (Sub Admin WITH product.view)
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
  // 1. customer + includeInactive=true
  // ===========================================================================
  console.log('\n[1] customer + includeInactive=true:');
  const test1Res = await fetch(`${BASE_URL}/api/products?includeInactive=true`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  assert(
    test1Res.status === 403,
    `Customer requesting includeInactive=true is blocked with HTTP 403 (got ${test1Res.status})`
  );

  // ===========================================================================
  // 2. customer + all=true
  // ===========================================================================
  console.log('\n[2] customer + all=true:');
  const test2Res = await fetch(`${BASE_URL}/api/products?all=true`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  assert(
    test2Res.status === 403,
    `Customer requesting all=true is blocked with HTTP 403 (got ${test2Res.status})`
  );

  // ===========================================================================
  // 3. admin without product.view + includeInactive=true
  // ===========================================================================
  console.log('\n[3] admin without product.view + includeInactive=true:');
  const test3Res = await fetch(`${BASE_URL}/api/products?includeInactive=true`, {
    headers: { Authorization: `Bearer ${adminNoProductViewToken}` },
  });
  assert(
    test3Res.status === 403,
    `Admin without product.view requesting includeInactive=true is blocked with HTTP 403 (got ${test3Res.status})`
  );

  // ===========================================================================
  // 4. sub_admin without product.view + all=true
  // ===========================================================================
  console.log('\n[4] sub_admin without product.view + all=true:');
  const test4Res = await fetch(`${BASE_URL}/api/products?all=true`, {
    headers: { Authorization: `Bearer ${subAdminNoProductViewToken}` },
  });
  assert(
    test4Res.status === 403,
    `Sub Admin without product.view requesting all=true is blocked with HTTP 403 (got ${test4Res.status})`
  );

  // ===========================================================================
  // 5. authorized staff + inactive products
  // ===========================================================================
  console.log('\n[5] authorized staff + inactive products:');
  // Admin with product.view
  const test5AdminRes = await fetch(`${BASE_URL}/api/products?includeInactive=true`, {
    headers: { Authorization: `Bearer ${adminWithProductViewToken}` },
  });
  assert(test5AdminRes.status === 200, `Admin with product.view gets HTTP 200 on includeInactive=true (got ${test5AdminRes.status})`);
  const test5AdminData = await test5AdminRes.json();
  const hasInactiveAdmin = (test5AdminData.products || []).some((p: any) => p.status === 'inactive');
  assert(hasInactiveAdmin, 'Admin with product.view legitimately retrieves inactive products');

  // Sub Admin with product.view
  const test5SubAdminRes = await fetch(`${BASE_URL}/api/products?includeInactive=true`, {
    headers: { Authorization: `Bearer ${subAdminWithProductViewToken}` },
  });
  assert(test5SubAdminRes.status === 200, `Sub Admin with product.view gets HTTP 200 on includeInactive=true (got ${test5SubAdminRes.status})`);
  const test5SubAdminData = await test5SubAdminRes.json();
  const hasInactiveSubAdmin = (test5SubAdminData.products || []).some((p: any) => p.status === 'inactive');
  assert(hasInactiveSubAdmin, 'Sub Admin with product.view legitimately retrieves inactive products');

  // ===========================================================================
  // 6. super_admin + inactive products
  // ===========================================================================
  console.log('\n[6] super_admin + inactive products:');
  const test6Res = await fetch(`${BASE_URL}/api/products?includeInactive=true`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert(test6Res.status === 200, `Super Admin gets HTTP 200 on includeInactive=true (got ${test6Res.status})`);
  const test6Data = await test6Res.json();
  const hasInactiveSuper = (test6Data.products || []).some((p: any) => p.status === 'inactive');
  assert(hasInactiveSuper, 'Super Admin legitimately retrieves inactive products');

  // ===========================================================================
  // 7. direct inactive product ID
  // ===========================================================================
  console.log('\n[7] direct inactive product ID (prod-test-inactive-01):');
  // Customer
  const test7CustRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  assert(test7CustRes.status === 404, `Customer accessing inactive product by ID receives 404 (got ${test7CustRes.status})`);

  // Unauthenticated guest
  const test7GuestRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`);
  assert(test7GuestRes.status === 404, `Guest accessing inactive product by ID receives 404 (got ${test7GuestRes.status})`);

  // Admin without product.view
  const test7AdminNoPermRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`, {
    headers: { Authorization: `Bearer ${adminNoProductViewToken}` },
  });
  assert(
    test7AdminNoPermRes.status === 403,
    `Admin without product.view accessing inactive product by ID receives 403 (got ${test7AdminNoPermRes.status})`
  );

  // Sub Admin without product.view
  const test7SubAdminNoPermRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`, {
    headers: { Authorization: `Bearer ${subAdminNoProductViewToken}` },
  });
  assert(
    test7SubAdminNoPermRes.status === 403,
    `Sub Admin without product.view accessing inactive product by ID receives 403 (got ${test7SubAdminNoPermRes.status})`
  );

  // Authorized staff (with product.view)
  const test7AuthStaffRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`, {
    headers: { Authorization: `Bearer ${adminWithProductViewToken}` },
  });
  assert(test7AuthStaffRes.status === 200, `Authorized staff accessing inactive product by ID receives 200 (got ${test7AuthStaffRes.status})`);
  const test7AuthStaffData = await test7AuthStaffRes.json();
  assert(test7AuthStaffData.product?.id === 'prod-test-inactive-01', 'Authorized staff gets inactive product details');

  // Super Admin
  const test7SuperRes = await fetch(`${BASE_URL}/api/products/prod-test-inactive-01`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert(test7SuperRes.status === 200, `Super Admin accessing inactive product by ID receives 200 (got ${test7SuperRes.status})`);

  // ===========================================================================
  // 8. direct inactive slug
  // ===========================================================================
  console.log('\n[8] direct inactive slug (inactive-test-product):');
  // Customer
  const test8CustRes = await fetch(`${BASE_URL}/api/products/inactive-test-product`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  assert(test8CustRes.status === 404, `Customer accessing inactive product by slug receives 404 (got ${test8CustRes.status})`);

  // Guest
  const test8GuestRes = await fetch(`${BASE_URL}/api/products/inactive-test-product`);
  assert(test8GuestRes.status === 404, `Guest accessing inactive product by slug receives 404 (got ${test8GuestRes.status})`);

  // Admin without product.view
  const test8AdminNoPermRes = await fetch(`${BASE_URL}/api/products/inactive-test-product`, {
    headers: { Authorization: `Bearer ${adminNoProductViewToken}` },
  });
  assert(
    test8AdminNoPermRes.status === 403,
    `Admin without product.view accessing inactive product by slug receives 403 (got ${test8AdminNoPermRes.status})`
  );

  // Sub Admin without product.view
  const test8SubAdminNoPermRes = await fetch(`${BASE_URL}/api/products/inactive-test-product`, {
    headers: { Authorization: `Bearer ${subAdminNoProductViewToken}` },
  });
  assert(
    test8SubAdminNoPermRes.status === 403,
    `Sub Admin without product.view accessing inactive product by slug receives 403 (got ${test8SubAdminNoPermRes.status})`
  );

  // Authorized staff (with product.view)
  const test8AuthStaffRes = await fetch(`${BASE_URL}/api/products/inactive-test-product`, {
    headers: { Authorization: `Bearer ${adminWithProductViewToken}` },
  });
  assert(test8AuthStaffRes.status === 200, `Authorized staff accessing inactive product by slug receives 200 (got ${test8AuthStaffRes.status})`);
  const test8AuthStaffData = await test8AuthStaffRes.json();
  assert(test8AuthStaffData.product?.id === 'prod-test-inactive-01', 'Authorized staff gets inactive product details via slug');

  // Super Admin
  const test8SuperRes = await fetch(`${BASE_URL}/api/products/inactive-test-product`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert(test8SuperRes.status === 200, `Super Admin accessing inactive product by slug receives 200 (got ${test8SuperRes.status})`);

  // ===========================================================================
  // 9. public active product browsing
  // ===========================================================================
  console.log('\n[9] public active product browsing:');
  const test9ListRes = await fetch(`${BASE_URL}/api/products`);
  assert(test9ListRes.status === 200, 'Public catalog browsing returns HTTP 200');
  const test9ListData = await test9ListRes.json();
  const test9ActiveOnly = (test9ListData.products || []).every((p: any) => p.status !== 'inactive' && !p.isDeleted);
  assert(test9ActiveOnly, 'Public catalog browsing returns STRICTLY active products');
  const inactiveLeaked = (test9ListData.products || []).some((p: any) => p.id === 'prod-test-inactive-01' || p.slug === 'inactive-test-product');
  assert(!inactiveLeaked, 'Inactive product is NOT leaked in public catalog');

  // Category browse
  const test9CatRes = await fetch(`${BASE_URL}/api/products?category=cat-mens-accessories`);
  assert(test9CatRes.status === 200, 'Public category browsing returns HTTP 200');
  const test9CatData = await test9CatRes.json();
  const catInactiveLeaked = (test9CatData.products || []).some((p: any) => p.id === 'prod-test-inactive-01' || p.status === 'inactive');
  assert(!catInactiveLeaked, 'Inactive product is NOT leaked in category browsing');

  // Search browse
  const test9SearchRes = await fetch(`${BASE_URL}/api/products?search=inactive`);
  assert(test9SearchRes.status === 200, 'Public search browsing returns HTTP 200');
  const test9SearchData = await test9SearchRes.json();
  const searchInactiveLeaked = (test9SearchData.products || []).some((p: any) => p.id === 'prod-test-inactive-01');
  assert(!searchInactiveLeaked, 'Inactive product is NOT leaked in search browsing');

  // Homepage browse
  const test9HpRes = await fetch(`${BASE_URL}/api/store/homepage`);
  assert(test9HpRes.status === 200, 'Public homepage returns HTTP 200');
  const test9HpData = await test9HpRes.json();
  const hpInactiveLeaked = (test9HpData.products || []).some((p: any) => p.id === 'prod-test-inactive-01' || p.status === 'inactive');
  assert(!hpInactiveLeaked, 'Inactive product is NOT leaked in homepage payload');

  // ===========================================================================
  // 10. Cache-Control behavior verification
  // ===========================================================================
  console.log('\n[10] Cache-Control behavior verification:');
  // Check authorized inactive product list response
  const cacheListHeaders = test5AdminRes.headers.get('cache-control') || '';
  assert(
    cacheListHeaders.includes('no-store') && cacheListHeaders.includes('no-cache'),
    `Authorized inactive product list has no-store, no-cache: "${cacheListHeaders}"`
  );

  // Check authorized inactive single product response
  const cacheSingleHeaders = test7AuthStaffRes.headers.get('cache-control') || '';
  assert(
    cacheSingleHeaders.includes('no-store') && cacheSingleHeaders.includes('no-cache'),
    `Authorized inactive single product has no-store, no-cache: "${cacheSingleHeaders}"`
  );

  // Check public active catalog response
  const cachePublicHeaders = test9ListRes.headers.get('cache-control') || '';
  assert(
    cachePublicHeaders.includes('public') && !cachePublicHeaders.includes('no-store'),
    `Public active catalog has public caching header: "${cachePublicHeaders}"`
  );

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
