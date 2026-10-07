import { createSignedTestToken, TEST_BASE_URL } from './test-auth-helper';
import {
  SUPER_ADMIN_ONLY_PERMISSIONS,
  resolveUserPermissions,
  isSuperAdminOnlyPermission,
  PERMISSION_KEYS,
} from '../src/server/permissions';
import { hasUserPermission } from '../src/utils/permissions';

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
  console.log('🔒 FINANCIAL DATA AUTHORIZATION HARDENING AUDIT & TEST SUITE');
  console.log('================================================================\n');

  // 1. Registry & Super Admin-Only Set Verification
  console.log('--- 1. Authoritative Super Admin-Only Permission Set Audit ---');
  {
    const financialKeys = [
      'product.view_buying_price',
      'product.manage_buying_price',
      'product.buying_price',
      'product.view_profit',
      'report.profit',
      'report.financial',
    ] as const;

    for (const key of financialKeys) {
      assert(
        SUPER_ADMIN_ONLY_PERMISSIONS.has(key as any),
        `"${key}" is in SUPER_ADMIN_ONLY_PERMISSIONS`
      );
      assert(
        isSuperAdminOnlyPermission(key as any),
        `isSuperAdminOnlyPermission("${key}") returns true`
      );
    }
  }

  // 2. Resolver Forced-False Audit (Crafted Payload Immunity)
  console.log('\n--- 2. Backend Resolver Immunity to Crafted Payloads ---');
  {
    const maliciousPayload = {
      'product.view': true,
      'product.view_buying_price': true,
      'product.manage_buying_price': true,
      'product.buying_price': true,
      'product.view_profit': true,
      'report.profit': true,
      'report.financial': true,
      'canManageProducts': true,
    };

    const resolvedAdmin = resolveUserPermissions('admin', maliciousPayload);
    assert(resolvedAdmin['product.view'] === true, 'Admin product.view is granted');
    assert(resolvedAdmin['product.view_buying_price'] === false, 'Admin product.view_buying_price forcibly false');
    assert(resolvedAdmin['product.manage_buying_price'] === false, 'Admin product.manage_buying_price forcibly false');
    assert(resolvedAdmin['product.buying_price'] === false, 'Admin product.buying_price forcibly false');
    assert(resolvedAdmin['product.view_profit'] === false, 'Admin product.view_profit forcibly false');
    assert(resolvedAdmin['report.profit'] === false, 'Admin report.profit forcibly false');
    assert(resolvedAdmin['report.financial'] === false, 'Admin report.financial forcibly false');

    const resolvedSubAdmin = resolveUserPermissions('sub_admin', maliciousPayload);
    assert(resolvedSubAdmin['product.view_buying_price'] === false, 'Sub Admin product.view_buying_price forcibly false');
    assert(resolvedSubAdmin['product.manage_buying_price'] === false, 'Sub Admin product.manage_buying_price forcibly false');
    assert(resolvedSubAdmin['product.buying_price'] === false, 'Sub Admin product.buying_price forcibly false');
    assert(resolvedSubAdmin['product.view_profit'] === false, 'Sub Admin product.view_profit forcibly false');
    assert(resolvedSubAdmin['report.profit'] === false, 'Sub Admin report.profit forcibly false');
    assert(resolvedSubAdmin['report.financial'] === false, 'Sub Admin report.financial forcibly false');

    const resolvedSuper = resolveUserPermissions('super_admin', {});
    assert(resolvedSuper['product.view_buying_price'] === true, 'Super Admin product.view_buying_price true');
    assert(resolvedSuper['product.manage_buying_price'] === true, 'Super Admin product.manage_buying_price true');
    assert(resolvedSuper['product.buying_price'] === true, 'Super Admin product.buying_price true');
    assert(resolvedSuper['product.view_profit'] === true, 'Super Admin product.view_profit true');
    assert(resolvedSuper['report.profit'] === true, 'Super Admin report.profit true');
    assert(resolvedSuper['report.financial'] === true, 'Super Admin report.financial true');
  }

  // 3. Frontend Helper Alignment
  console.log('\n--- 3. Frontend Permission Evaluation Helper Alignment ---');
  {
    const adminUser: any = {
      id: 'test-admin-1',
      role: 'admin',
      permissions: {
        'product.view': true,
        'product.view_buying_price': true, // attempt to poison client state
        'report.profit': true,
      },
    };
    assert(hasUserPermission(adminUser, 'product.view') === true, 'Frontend: Admin product.view is true');
    assert(hasUserPermission(adminUser, 'product.view_buying_price') === false, 'Frontend: Admin product.view_buying_price is false');
    assert(hasUserPermission(adminUser, 'product.manage_buying_price') === false, 'Frontend: Admin product.manage_buying_price is false');
    assert(hasUserPermission(adminUser, 'product.view_profit') === false, 'Frontend: Admin product.view_profit is false');
    assert(hasUserPermission(adminUser, 'report.profit') === false, 'Frontend: Admin report.profit is false');
    assert(hasUserPermission(adminUser, 'report.financial') === false, 'Frontend: Admin report.financial is false');

    const superAdminUser: any = {
      id: 'dev-superadmin-1',
      role: 'super_admin',
      permissions: {},
    };
    assert(hasUserPermission(superAdminUser, 'product.view_buying_price') === true, 'Frontend: Super Admin product.view_buying_price is true');
    assert(hasUserPermission(superAdminUser, 'report.profit') === true, 'Frontend: Super Admin report.profit is true');
    assert(hasUserPermission(superAdminUser, 'report.financial') === true, 'Frontend: Super Admin report.financial is true');
  }

  // Live Endpoints Testing
  const superAdminToken = createSignedTestToken({
    userId: 'dev-superadmin-1',
    email: 'dev-superadmin@local.test',
    role: 'super_admin',
  });
  const superHeaders = { Authorization: `Bearer ${superAdminToken}`, Accept: 'application/json' };

  // Admin WITH product.view and crafted injection of financial permissions
  const adminCraftedToken = createSignedTestToken({
    userId: 'test-user-update-only',
    email: 'updater@local.test',
    role: 'admin',
    permissions: {
      'product.view': true,
      'product.update': true,
      'product.view_buying_price': true, // Crafted injection!
      'product.manage_buying_price': true,
      'product.buying_price': true,
      'product.view_profit': true,
      'report.profit': true,
      'report.financial': true,
    },
  });
  const adminHeaders = { Authorization: `Bearer ${adminCraftedToken}`, Accept: 'application/json' };

  // Sub Admin WITH product.view and crafted injection of financial permissions
  const subAdminCraftedToken = createSignedTestToken({
    userId: 'user-subadmin-inventory',
    email: 'inventory@rongdhonutrade.com',
    role: 'sub_admin',
    permissions: {
      'product.view': true,
      'product.update': true,
      'product.view_buying_price': true, // Crafted injection!
      'product.manage_buying_price': true,
      'product.buying_price': true,
      'product.view_profit': true,
      'report.profit': true,
      'report.financial': true,
    },
  });
  const subAdminHeaders = { Authorization: `Bearer ${subAdminCraftedToken}`, Accept: 'application/json' };

  // Sample product ID
  const superProdRes = await fetch(`${BASE_URL}/api/products`, { headers: superHeaders });
  const superProdData = await superProdRes.json();
  const sampleProduct = superProdData.products?.[0];
  const sampleProductId = sampleProduct?.id || 'prod-1';

  // 4. Product API: Super Admin Allowed vs Admin / Sub Admin Denied
  console.log('\n--- 4. Product API Buying Price & Profit Isolation ---');
  {
    // Super Admin: Legitimately sees buyingPrice
    const resSuper = await fetch(`${BASE_URL}/api/products/${sampleProductId}`, { headers: superHeaders });
    assert(resSuper.status === 200, 'Super Admin GET product details returns HTTP 200');
    const dataSuper = await resSuper.json();
    assert(dataSuper.product?.buyingPrice !== undefined, 'Super Admin legitimately sees buyingPrice in product details');

    // Admin with crafted token: MUST NOT see buyingPrice or unitProfit
    const resAdmin = await fetch(`${BASE_URL}/api/products/${sampleProductId}`, { headers: adminHeaders });
    assert(resAdmin.status === 200, 'Admin with product.view GET product details returns HTTP 200');
    const dataAdmin = await resAdmin.json();
    assert(dataAdmin.product?.buyingPrice === undefined, 'Admin NEVER receives buyingPrice despite crafted token');
    assert(dataAdmin.product?.unitProfit === undefined, 'Admin NEVER receives unitProfit despite crafted token');
    assert(dataAdmin.product?.buying_price === undefined, 'Admin NEVER receives buying_price alias');
    assert(dataAdmin.product?.profitMargin === undefined, 'Admin NEVER receives profitMargin');

    // Sub Admin with crafted token: MUST NOT see buyingPrice or unitProfit
    const resSub = await fetch(`${BASE_URL}/api/products/${sampleProductId}`, { headers: subAdminHeaders });
    assert(resSub.status === 200, 'Sub Admin with product.view GET product details returns HTTP 200');
    const dataSub = await resSub.json();
    assert(dataSub.product?.buyingPrice === undefined, 'Sub Admin NEVER receives buyingPrice despite crafted token');
    assert(dataSub.product?.unitProfit === undefined, 'Sub Admin NEVER receives unitProfit despite crafted token');

    // Full catalog list: verify zero financial fields
    const resAdminList = await fetch(`${BASE_URL}/api/admin/products`, { headers: adminHeaders });
    const dataAdminList = await resAdminList.json();
    const hasAdminListBp = (dataAdminList.products || []).some(
      (p: any) => p.buyingPrice !== undefined || p.buying_price !== undefined || p.unitProfit !== undefined
    );
    assert(!hasAdminListBp, 'Admin product list NEVER contains buyingPrice or unitProfit');
  }

  // 5. Profit Reports: Super Admin Only
  console.log('\n--- 5. Profit Report API Protection ---');
  {
    // Super Admin: Allowed
    const resSuperProfit = await fetch(`${BASE_URL}/api/analytics/profit?period=today`, { headers: superHeaders });
    assert(resSuperProfit.status === 200, 'Super Admin GET /api/analytics/profit returns HTTP 200');

    const resSuperAdminProfit = await fetch(`${BASE_URL}/api/admin/profit-analytics?period=today`, { headers: superHeaders });
    assert(resSuperAdminProfit.status === 200, 'Super Admin GET /api/admin/profit-analytics returns HTTP 200');

    // Admin with crafted token: Denied
    const resAdminProfit = await fetch(`${BASE_URL}/api/analytics/profit?period=today`, { headers: adminHeaders });
    assert(resAdminProfit.status === 403, 'Admin crafted request to /api/analytics/profit is DENIED (HTTP 403)', `Status: ${resAdminProfit.status}`);

    const resAdminAdminProfit = await fetch(`${BASE_URL}/api/admin/profit-analytics?period=today`, { headers: adminHeaders });
    assert(resAdminAdminProfit.status === 403, 'Admin crafted request to /api/admin/profit-analytics is DENIED (HTTP 403)', `Status: ${resAdminAdminProfit.status}`);

    // Sub Admin with crafted token: Denied
    const resSubProfit = await fetch(`${BASE_URL}/api/analytics/profit?period=today`, { headers: subAdminHeaders });
    assert(resSubProfit.status === 403, 'Sub Admin crafted request to /api/analytics/profit is DENIED (HTTP 403)', `Status: ${resSubProfit.status}`);
  }

  // 6. Financial & Expenses Reports: Super Admin Only
  console.log('\n--- 6. Financial Report & Expenses API Protection ---');
  {
    // Super Admin: Allowed
    const resSuperExpense = await fetch(`${BASE_URL}/api/expenses`, { headers: superHeaders });
    assert(resSuperExpense.status === 200, 'Super Admin GET /api/expenses returns HTTP 200');

    // Admin with crafted token: Denied
    const resAdminExpense = await fetch(`${BASE_URL}/api/expenses`, { headers: adminHeaders });
    assert(resAdminExpense.status === 403, 'Admin crafted request to /api/expenses is DENIED (HTTP 403)', `Status: ${resAdminExpense.status}`);

    // Sub Admin with crafted token: Denied
    const resSubExpense = await fetch(`${BASE_URL}/api/expenses`, { headers: subAdminHeaders });
    assert(resSubExpense.status === 403, 'Sub Admin crafted request to /api/expenses is DENIED (HTTP 403)', `Status: ${resSubExpense.status}`);
  }

  // 7. Attempts to Grant Financial Permissions
  console.log('\n--- 7. Permission Granting Hardening ---');
  {
    // Admin attempts to grant financial permission via /api/users/:id/permissions
    const adminGrantRes = await fetch(`${BASE_URL}/api/users/user-subadmin-inventory/permissions`, {
      method: 'PUT',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissions: { 'product.view_buying_price': true },
      }),
    });
    assert(adminGrantRes.status === 403, 'Admin cannot grant financial permissions to another user (HTTP 403)', `Status: ${adminGrantRes.status}`);

    // Sub Admin attempts to grant financial permission to themselves
    const subAdminSelfGrantRes = await fetch(`${BASE_URL}/api/users/user-subadmin-inventory/permissions`, {
      method: 'PUT',
      headers: { ...subAdminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissions: { 'report.profit': true },
      }),
    });
    assert(subAdminSelfGrantRes.status === 403, 'Sub Admin cannot grant financial permissions to themselves (HTTP 403)', `Status: ${subAdminSelfGrantRes.status}`);

    // Super Admin attempting to grant a Super Admin-only financial permission to an admin/sub_admin:
    // Backend strictly enforces that non-super admin accounts cannot receive Super Admin-only permissions!
    const superGrantAttempt = await fetch(`${BASE_URL}/api/users/user-subadmin-inventory/permissions`, {
      method: 'PUT',
      headers: { ...superHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissions: { 'product.view_buying_price': true },
      }),
    });
    assert(superGrantAttempt.status === 403, 'Server rejects granting Super Admin-only financial permission to sub_admin (HTTP 403)', `Status: ${superGrantAttempt.status}`);
  }

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n================================================================');
  const failed = results.filter((r) => !r.passed);
  if (failed.length === 0) {
    console.log(`🎉 ALL ${results.length} FINANCIAL AUTHORIZATION HARDENING TESTS PASSED!`);
  } else {
    console.error(`❌ ${failed.length} of ${results.length} TESTS FAILED!`);
    process.exit(1);
  }
  console.log('================================================================');
}

run().catch((err) => {
  console.error('Fatal error running financial hardening test suite:', err);
  process.exit(1);
});
