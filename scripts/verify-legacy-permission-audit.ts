/**
 * Comprehensive Legacy Permission Compatibility & Security Audit Suite
 *
 * Verifies:
 * 1. Every legacy permission alias resolves to its expected canonical key.
 * 2. Explicit mapping table of: legacy key -> canonical key -> security sensitivity.
 * 3. Sensitive financial aliases cannot grant financial access to non-super-admin accounts.
 * 4. Broad legacy permissions (canManageProducts, canManageOrders, canManageCategories, canManageAccounts, canManageSettings)
 *    cannot grant:
 *      - buyingPrice access (product.view_buying_price, product.manage_buying_price, product.buying_price)
 *      - profit access (product.view_profit, report.profit)
 *      - financial reports (report.financial)
 *      - settings.manage
 *      - user.manage
 *      - user.delete
 *      - permission.manage
 * 5. Backward compatibility for harmless operational legacy permissions (e.g., courier.dispatch, category.create, etc.)
 *    is preserved for Admin/Sub-Admin.
 * 6. Malicious permissions_json payloads containing old and new names tested against Admin, Sub-Admin, and Super Admin.
 *    Only Super Admin receives sensitive access!
 * 7. Live API endpoint tests verifying server-authoritative enforcement against legacy crafted payloads.
 */

import {
  LEGACY_PERMISSION_MAPPINGS,
  getCanonicalPermissionKey,
  resolveUserPermissions,
  mapLegacyPermissionsToGranular,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  isSuperAdminOnlyPermission,
  type PermissionKey,
} from '../src/server/permissions';
import { hasUserPermission } from '../src/utils/permissions';
import { getTestAdminToken } from './test-auth-helper';

const BASE_URL = 'http://localhost:3000';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function runLegacyAuditSuite() {
  console.log('====================================================');
  console.log('LEGACY PERMISSION COMPATIBILITY & SECURITY AUDIT');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // TEST 1: EXPLICIT MAPPING TABLE VERIFICATION
  // ----------------------------------------------------
  console.log('[Test 1] Verifying Explicit Legacy Permission Mapping Table...');

  const expectedMappings: Array<{
    legacy: string;
    canonical: PermissionKey;
    sensitivity: 'super_admin_only' | 'sensitive' | 'operational';
  }> = [
    // Financial aliases
    { legacy: 'product.buying_price', canonical: 'product.view_buying_price', sensitivity: 'super_admin_only' },
    { legacy: 'buying_price', canonical: 'product.view_buying_price', sensitivity: 'super_admin_only' },
    { legacy: 'buyingPrice', canonical: 'product.view_buying_price', sensitivity: 'super_admin_only' },
    { legacy: 'view_buying_price', canonical: 'product.view_buying_price', sensitivity: 'super_admin_only' },
    { legacy: 'viewBuyingPrice', canonical: 'product.view_buying_price', sensitivity: 'super_admin_only' },
    { legacy: 'product.manage_buying_price', canonical: 'product.manage_buying_price', sensitivity: 'super_admin_only' },
    { legacy: 'manage_buying_price', canonical: 'product.manage_buying_price', sensitivity: 'super_admin_only' },
    { legacy: 'manageBuyingPrice', canonical: 'product.manage_buying_price', sensitivity: 'super_admin_only' },
    { legacy: 'product.view_profit', canonical: 'product.view_profit', sensitivity: 'super_admin_only' },
    { legacy: 'report.profit', canonical: 'report.profit', sensitivity: 'super_admin_only' },
    { legacy: 'profit', canonical: 'product.view_profit', sensitivity: 'super_admin_only' },
    { legacy: 'unitprofit', canonical: 'product.view_profit', sensitivity: 'super_admin_only' },
    { legacy: 'unitProfit', canonical: 'product.view_profit', sensitivity: 'super_admin_only' },
    { legacy: 'view_profit', canonical: 'product.view_profit', sensitivity: 'super_admin_only' },
    { legacy: 'viewProfit', canonical: 'product.view_profit', sensitivity: 'super_admin_only' },
    { legacy: 'report_profit', canonical: 'report.profit', sensitivity: 'super_admin_only' },
    { legacy: 'reportProfit', canonical: 'report.profit', sensitivity: 'super_admin_only' },
    { legacy: 'report.financial', canonical: 'report.financial', sensitivity: 'super_admin_only' },
    { legacy: 'report_financial', canonical: 'report.financial', sensitivity: 'super_admin_only' },
    { legacy: 'reportFinancial', canonical: 'report.financial', sensitivity: 'super_admin_only' },
    { legacy: 'analytics.financial', canonical: 'report.financial', sensitivity: 'super_admin_only' },

    // Store settings aliases
    { legacy: 'settings.manage', canonical: 'settings.manage', sensitivity: 'super_admin_only' },
    { legacy: 'manage_settings', canonical: 'settings.manage', sensitivity: 'super_admin_only' },
    { legacy: 'manageSettings', canonical: 'settings.manage', sensitivity: 'super_admin_only' },

    // User / RBAC aliases
    { legacy: 'user.manage', canonical: 'user.manage', sensitivity: 'super_admin_only' },
    { legacy: 'manage_users', canonical: 'user.manage', sensitivity: 'super_admin_only' },
    { legacy: 'manageUsers', canonical: 'user.manage', sensitivity: 'super_admin_only' },
    { legacy: 'user.delete', canonical: 'user.delete', sensitivity: 'super_admin_only' },
    { legacy: 'delete_users', canonical: 'user.delete', sensitivity: 'super_admin_only' },
    { legacy: 'deleteUsers', canonical: 'user.delete', sensitivity: 'super_admin_only' },
    { legacy: 'permission.manage', canonical: 'permission.manage', sensitivity: 'super_admin_only' },
    { legacy: 'manage_permissions', canonical: 'permission.manage', sensitivity: 'super_admin_only' },
    { legacy: 'managePermissions', canonical: 'permission.manage', sensitivity: 'super_admin_only' },

    // Harmless operational aliases
    { legacy: 'courier.dispatch', canonical: 'courier.booking', sensitivity: 'operational' },
    { legacy: 'order.dispatch', canonical: 'courier.booking', sensitivity: 'operational' },
    { legacy: 'category.create', canonical: 'category.manage', sensitivity: 'operational' },
    { legacy: 'category.update', canonical: 'category.manage', sensitivity: 'operational' },
    { legacy: 'slider.create', canonical: 'slider.manage', sensitivity: 'operational' },
    { legacy: 'slider.update', canonical: 'slider.manage', sensitivity: 'operational' },
    { legacy: 'coupon.create', canonical: 'coupon.manage', sensitivity: 'operational' },
    { legacy: 'coupon.update', canonical: 'coupon.manage', sensitivity: 'operational' },
  ];

  for (const exp of expectedMappings) {
    const entry = LEGACY_PERMISSION_MAPPINGS[exp.legacy];
    assert(!!entry, `Legacy mapping exists for "${exp.legacy}"`);
    assert(entry.canonicalKey === exp.canonical, `"${exp.legacy}" maps to canonical "${exp.canonical}"`);
    assert(entry.sensitivity === exp.sensitivity, `"${exp.legacy}" has sensitivity "${exp.sensitivity}"`);

    const canonicalResolved = getCanonicalPermissionKey(exp.legacy);
    assert(canonicalResolved === exp.canonical, `getCanonicalPermissionKey("${exp.legacy}") returns "${exp.canonical}"`);

    if (exp.sensitivity === 'super_admin_only') {
      assert(SUPER_ADMIN_ONLY_PERMISSIONS.has(exp.canonical), `Canonical key "${exp.canonical}" is strictly in SUPER_ADMIN_ONLY_PERMISSIONS`);
      assert(isSuperAdminOnlyPermission(exp.legacy), `isSuperAdminOnlyPermission("${exp.legacy}") returns true`);
    }
  }

  // ----------------------------------------------------
  // TEST 2: BROAD LEGACY FLAGS IMMUNITY AUDIT
  // ----------------------------------------------------
  console.log('\n[Test 2] Verifying Broad Legacy Flags (5-flag model) Cannot Escalate Privileges...');

  const fullBroadPayload = {
    canManageProducts: true,
    canManageOrders: true,
    canManageCategories: true,
    canManageAccounts: true,
    canManageSettings: true,
  };

  const mappedGranular = mapLegacyPermissionsToGranular(fullBroadPayload);

  // Proves that none of the Super Admin-only permissions are granted by broad legacy flags
  const protectedKeys: PermissionKey[] = [
    'product.view_buying_price',
    'product.manage_buying_price',
    'product.buying_price',
    'product.view_profit',
    'report.profit',
    'report.financial',
    'settings.manage',
    'user.manage',
    'user.delete',
    'permission.manage',
  ];

  for (const protKey of protectedKeys) {
    assert(mappedGranular[protKey] === false, `Broad legacy flags do NOT grant "${protKey}" in mapLegacyPermissionsToGranular`);
  }

  // Verify safe operational permissions ARE mapped
  assert(mappedGranular['product.create'] === true, 'Broad canManageProducts grants operational product.create');
  assert(mappedGranular['order.manage'] === true, 'Broad canManageOrders grants operational order.manage');
  assert(mappedGranular['category.manage'] === true, 'Broad canManageCategories grants operational category.manage');
  assert(mappedGranular['courier.booking'] === true, 'Broad canManageOrders grants operational courier.booking');
  assert(mappedGranular['slider.manage'] === true, 'Broad canManageSettings grants operational slider.manage');
  assert(mappedGranular['coupon.manage'] === true, 'Broad canManageSettings grants operational coupon.manage');
  assert(mappedGranular['courier.configure'] === true, 'Broad canManageSettings grants operational courier.configure');
  assert(mappedGranular['customer.manage'] === true, 'Broad canManageAccounts grants operational customer.manage');

  // ----------------------------------------------------
  // TEST 3: MALICIOUS PERMISSIONS_JSON PAYLOAD TESTS
  // ----------------------------------------------------
  console.log('\n[Test 3] Auditing Malicious / Crafty Payload Injection for Admin, Sub-Admin, and Super Admin...');

  // Highly malicious payload mixing old names, new names, camelCase, snake_case, and broad flags
  const maliciousPayload = {
    canManageProducts: true,
    canManageOrders: true,
    canManageCategories: true,
    canManageAccounts: true,
    canManageSettings: true,

    // Sensitive legacy financial aliases
    'product.buying_price': true,
    buying_price: true,
    buyingPrice: true,
    view_buying_price: true,
    viewBuyingPrice: true,
    'product.manage_buying_price': true,
    manage_buying_price: true,
    manageBuyingPrice: true,
    'product.view_profit': true,
    'report.profit': true,
    profit: true,
    unitprofit: true,
    unitProfit: true,
    view_profit: true,
    viewProfit: true,
    report_profit: true,
    reportProfit: true,
    'report.financial': true,
    report_financial: true,
    reportFinancial: true,
    'analytics.financial': true,

    // Sensitive settings aliases
    'settings.manage': true,
    manage_settings: true,
    manageSettings: true,

    // Sensitive user/permission aliases
    'user.manage': true,
    manage_users: true,
    manageUsers: true,
    'user.delete': true,
    delete_users: true,
    deleteUsers: true,
    'permission.manage': true,
    manage_permissions: true,
    managePermissions: true,

    // Harmless operational aliases
    'courier.dispatch': true,
    'category.create': true,
  };

  // Case A: Normal Admin
  const adminResolved = resolveUserPermissions('admin', maliciousPayload);
  for (const protKey of protectedKeys) {
    assert(adminResolved[protKey] === false, `Admin resolved "${protKey}" is STRICTLY FALSE despite malicious payload`);
  }
  assert(adminResolved['courier.booking'] === true, 'Admin resolved operational courier.booking from courier.dispatch');
  assert(adminResolved['category.manage'] === true, 'Admin resolved operational category.manage from category.create');

  // Case B: Sub Admin
  const subAdminResolved = resolveUserPermissions('sub_admin', maliciousPayload);
  for (const protKey of protectedKeys) {
    assert(subAdminResolved[protKey] === false, `Sub-Admin resolved "${protKey}" is STRICTLY FALSE despite malicious payload`);
  }
  assert(subAdminResolved['courier.booking'] === true, 'Sub-Admin resolved operational courier.booking from courier.dispatch');
  assert(subAdminResolved['category.manage'] === true, 'Sub-Admin resolved operational category.manage from category.create');

  // Case C: Super Admin
  const superAdminResolved = resolveUserPermissions('super_admin', maliciousPayload);
  for (const protKey of protectedKeys) {
    assert(superAdminResolved[protKey] === true, `Super Admin resolved "${protKey}" is TRUE`);
  }

  // ----------------------------------------------------
  // TEST 4: CLIENT-SIDE UI EVALUATION (hasUserPermission / canUser)
  // ----------------------------------------------------
  console.log('\n[Test 4] Verifying Client-Side Permission Evaluation (hasUserPermission)...');

  const mockAdminUser: any = {
    id: 'admin-123',
    role: 'admin',
    permissions: adminResolved,
  };

  const mockSubAdminUser: any = {
    id: 'subadmin-123',
    role: 'sub_admin',
    permissions: subAdminResolved,
  };

  const mockSuperAdminUser: any = {
    id: 'superadmin-123',
    role: 'super_admin',
    permissions: superAdminResolved,
  };

  // Verify all aliases tested with hasUserPermission for Admin and Sub-Admin
  const testAliases = [
    'product.buying_price',
    'buying_price',
    'buyingPrice',
    'viewBuyingPrice',
    'manageBuyingPrice',
    'report.profit',
    'reportProfit',
    'unitProfit',
    'report.financial',
    'settings.manage',
    'manageSettings',
    'user.manage',
    'manageUsers',
    'user.delete',
    'permission.manage',
  ];

  for (const alias of testAliases) {
    assert(hasUserPermission(mockAdminUser, alias) === false, `Admin hasUserPermission("${alias}") is FALSE`);
    assert(hasUserPermission(mockSubAdminUser, alias) === false, `Sub-Admin hasUserPermission("${alias}") is FALSE`);
    assert(hasUserPermission(mockSuperAdminUser, alias) === true, `Super Admin hasUserPermission("${alias}") is TRUE`);
  }

  // Harmless operational aliases
  assert(hasUserPermission(mockAdminUser, 'courier.booking') === true, 'Admin hasUserPermission("courier.booking") is TRUE');
  assert(hasUserPermission(mockSubAdminUser, 'courier.booking') === true, 'Sub-Admin hasUserPermission("courier.booking") is TRUE');

  // ----------------------------------------------------
  // TEST 5: LIVE BACKEND API AUTHORIZATION ENFORCEMENT
  // ----------------------------------------------------
  console.log('\n[Test 5] Live Backend Endpoints: Testing crafted HTTP requests using legacy aliases...');

  const superToken = await getTestAdminToken();
  assert(!!superToken, 'Obtained Super Admin token');

  // Fetch admin and sub-admin tokens
  const usersRes = await fetch(`${BASE_URL}/api/users`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  const usersData: any = await usersRes.json();
  const normalAdmin = usersData.users?.find((u: any) => u.role === 'admin' && !u.email.includes('superadmin'));
  const subAdmin = usersData.users?.find((u: any) => u.role === 'sub_admin');

  assert(!!normalAdmin, `Found normal admin (${normalAdmin?.email})`);
  assert(!!subAdmin, `Found sub-admin (${subAdmin?.email})`);

  async function getLoginToken(email: string, password = 'Password123!'): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d: any = await res.json();
    return d.token || '';
  }

  const adminToken = await getLoginToken(normalAdmin.email);
  const subAdminToken = await getLoginToken(subAdmin.email);
  assert(!!adminToken, 'Obtained normal admin token');
  assert(!!subAdminToken, 'Obtained sub-admin token');

  // 5a. Admin attempts to access profit analytics via API
  const profitResAdmin = await fetch(`${BASE_URL}/api/analytics/profit`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(profitResAdmin.status === 403, `Admin accessing /api/analytics/profit returns 403 (got ${profitResAdmin.status})`);

  // 5b. Sub-Admin attempts to access profit analytics via API
  const profitResSubAdmin = await fetch(`${BASE_URL}/api/analytics/profit`, {
    headers: { Authorization: `Bearer ${subAdminToken}` },
  });
  assert(profitResSubAdmin.status === 403, `Sub-Admin accessing /api/analytics/profit returns 403 (got ${profitResSubAdmin.status})`);

  // 5c. Super Admin accesses profit analytics via API
  const profitResSuper = await fetch(`${BASE_URL}/api/analytics/profit`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  assert(profitResSuper.status === 200, `Super Admin accessing /api/analytics/profit returns 200 (got ${profitResSuper.status})`);

  // 5d. Admin attempts to update store settings via API
  const settingsResAdmin = await fetch(`${BASE_URL}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ storeName: 'Hacked Store' }),
  });
  assert(settingsResAdmin.status === 403, `Admin updating /api/settings returns 403 (got ${settingsResAdmin.status})`);

  // 5e. Sub-Admin attempts to update store settings via API
  const settingsResSubAdmin = await fetch(`${BASE_URL}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${subAdminToken}`,
    },
    body: JSON.stringify({ storeName: 'Hacked Store' }),
  });
  assert(settingsResSubAdmin.status === 403, `Sub-Admin updating /api/settings returns 403 (got ${settingsResSubAdmin.status})`);

  // 5f. Admin attempts to self-grant legacy financial alias via PUT /api/users/:id
  const escalatePayload = {
    permissions: {
      'product.buying_price': true,
      buyingPrice: true,
      'report.profit': true,
      manageSettings: true,
    },
  };
  const escalateRes = await fetch(`${BASE_URL}/api/users/${normalAdmin.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(escalatePayload),
  });
  assert(escalateRes.status === 403, `Admin attempting to self-grant legacy aliases returns 403 (got ${escalateRes.status})`);

  // 5g. Super Admin attempts to grant legacy aliases to admin -> should be rejected by server (Super Admin only policy)
  const superGrantRes = await fetch(`${BASE_URL}/api/admin/users/${normalAdmin.id}/permissions`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superToken}`,
    },
    body: JSON.stringify({
      permissions: {
        'product.buying_price': true,
      },
    }),
  });
  assert(superGrantRes.status === 403, `Granting legacy financial alias to non-super-admin is rejected with 403 (got ${superGrantRes.status})`);

  console.log('\n====================================================');
  console.log('✅ ALL LEGACY PERMISSION AUDIT & REGRESSION CHECKS PASSED!');
  console.log('====================================================');
}

runLegacyAuditSuite().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
