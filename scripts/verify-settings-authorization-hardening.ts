/**
 * Regression Test Suite: Rongdhonu Trade Settings Authorization Hardening
 * 
 * Verifies:
 * 1. Super Admin settings access -> allowed (HTTP 200)
 * 2. Admin without settings.manage -> denied (HTTP 403)
 * 3. Sub Admin without settings.manage -> denied (HTTP 403)
 * 4. Admin crafted request (e.g. attempting to update settings or grant permission) -> denied (HTTP 403)
 * 5. Sub Admin crafted request -> denied (HTTP 403)
 * 6. Admin attempts to grant settings.manage -> denied (HTTP 403)
 * 7. Super Admin attempts to grant settings.manage to an admin/sub-admin -> denied (HTTP 403 - permanently Super Admin only)
 * 8. Legacy permission payload (canManageSettings) -> cannot bypass (resolveUserPermissions strips settings.manage)
 * 9. Frontend UI reflects restriction:
 *    - isSuperAdminOnlyPermission('settings.manage') === true
 *    - hasUserPermission(admin, 'settings.manage') === false
 *    - hasUserPermission(subAdmin, 'settings.manage') === false
 *    - hasUserPermission(customer, 'settings.manage') === false
 *    - hasUserPermission(superAdmin, 'settings.manage') === true
 *    - SUPER_ADMIN_ONLY_PERMISSIONS has 'settings.manage'
 * 10. Operational courier operations preserved for authorized non-super-admins:
 *    - hasUserPermission(admin, 'courier.booking') === true
 *    - hasUserPermission(admin, 'courier.configure') === true
 */

import {
  PERMISSION_KEYS,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  PERMISSIONS_METADATA,
  resolveUserPermissions,
  isSuperAdminOnlyPermission,
} from '../src/server/permissions';
import { hasUserPermission, canUser } from '../src/utils/permissions';
import {
  TEST_BASE_URL,
  getTestAdminToken,
  loginAndGetToken,
} from './test-auth-helper';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runSettingsAuthorizationTests() {
  console.log('====================================================');
  console.log('SETTINGS AUTHORIZATION HARDENING REGRESSION SUITE');
  console.log('====================================================\n');

  // 1. Authoritative Policy Verification
  console.log('[Test 1] Authoritative Policy Verification');
  assert(
    SUPER_ADMIN_ONLY_PERMISSIONS.has('settings.manage'),
    'settings.manage is registered in authoritative SUPER_ADMIN_ONLY_PERMISSIONS'
  );
  assert(
    isSuperAdminOnlyPermission('settings.manage'),
    'isSuperAdminOnlyPermission("settings.manage") returns true'
  );
  assert(
    PERMISSIONS_METADATA['settings.manage'].superAdminOnly === true,
    'PERMISSIONS_METADATA["settings.manage"].superAdminOnly is true'
  );
  assert(
    PERMISSIONS_METADATA['settings.manage'].dangerous === true,
    'PERMISSIONS_METADATA["settings.manage"].dangerous is true'
  );

  // 2. Client-side Permission State & UI Reflection
  console.log('\n[Test 2] Client Permission Evaluation & UI Guards');
  const superAdminUser = {
    id: 'user-super-admin',
    name: 'Super Admin',
    email: 'superadmin@local.test',
    role: 'super_admin' as const,
    createdAt: new Date().toISOString(),
    permissions: {} as any,
  };
  const adminUser = {
    id: 'user-admin-1',
    name: 'Operational Admin',
    email: 'admin1@local.test',
    role: 'admin' as const,
    createdAt: new Date().toISOString(),
    permissions: {
      'order.manage': true,
      'product.create': true,
      'courier.configure': true,
      'courier.booking': true,
      'slider.manage': true,
      'coupon.manage': true,
      // Injected settings.manage claim in client state (tamper attempt)
      'settings.manage': true,
    } as any,
  };
  const subAdminUser = {
    id: 'user-sub-admin-1',
    name: 'Order Staff',
    email: 'staff@local.test',
    role: 'sub_admin' as const,
    createdAt: new Date().toISOString(),
    permissions: {
      'order.view': true,
      'order.status_change': true,
      'courier.booking': true,
      'settings.manage': true, // Injected
    } as any,
  };
  const customerUser = {
    id: 'user-cust-1',
    name: 'Store Customer',
    email: 'cust@local.test',
    role: 'customer' as const,
    createdAt: new Date().toISOString(),
    permissions: {
      'settings.manage': true, // Injected
    } as any,
  };

  assert(hasUserPermission(superAdminUser, 'settings.manage') === true, 'Super Admin: settings.manage evaluates to TRUE');
  assert(hasUserPermission(adminUser, 'settings.manage') === false, 'Admin: settings.manage strictly evaluates to FALSE despite injection');
  assert(hasUserPermission(subAdminUser, 'settings.manage') === false, 'Sub Admin: settings.manage strictly evaluates to FALSE despite injection');
  assert(hasUserPermission(customerUser, 'settings.manage') === false, 'Customer: settings.manage strictly evaluates to FALSE despite injection');
  assert(canUser(adminUser, 'settings.manage') === false, 'canUser alias confirms settings.manage is false for Admin');

  // 3. Operational Permissions Preservation
  console.log('\n[Test 3] Preservation of Operational Courier & Order Permissions');
  assert(hasUserPermission(adminUser, 'courier.booking') === true, 'Admin preserves courier.booking');
  assert(hasUserPermission(adminUser, 'courier.configure') === true, 'Admin preserves courier.configure');
  assert(hasUserPermission(adminUser, 'slider.manage') === true, 'Admin preserves slider.manage');
  assert(hasUserPermission(adminUser, 'coupon.manage') === true, 'Admin preserves coupon.manage');
  assert(hasUserPermission(subAdminUser, 'courier.booking') === true, 'Sub Admin preserves courier.booking');

  // 4. Legacy Permission Payload Immunity
  console.log('\n[Test 4] Legacy Permission Payload (canManageSettings) Immunity');
  const legacyPayload = {
    canManageOrders: true,
    canManageProducts: true,
    canManageCategories: true,
    canManageAccounts: true,
    canManageSettings: true, // Legacy flag
  };
  const resolvedFromLegacy = resolveUserPermissions('admin', legacyPayload);
  assert(resolvedFromLegacy['settings.manage'] === false, 'Legacy canManageSettings CANNOT grant settings.manage');
  assert(resolvedFromLegacy['courier.configure'] === true, 'Legacy canManageSettings maps operational courier.configure');
  assert(resolvedFromLegacy['slider.manage'] === true, 'Legacy canManageSettings maps operational slider.manage');

  // Direct injection into permissions_json
  const injectedJson = JSON.stringify({
    'settings.manage': true,
    'product.view': true,
  });
  const resolvedFromJson = resolveUserPermissions('admin', injectedJson);
  assert(resolvedFromJson['settings.manage'] === false, 'Direct JSON injection of settings.manage is stripped');
  assert(resolvedFromJson['product.view'] === true, 'Valid permission product.view is preserved');

  // 5. Live Backend API Security Tests
  console.log('\n[Test 5] Live Backend API Endpoint Security Verification');
  const superToken = await getTestAdminToken(TEST_BASE_URL);
  assert(Boolean(superToken), 'Obtained authentic Super Admin token');

  // Obtain existing users from server
  const usersRes = await fetch(`${TEST_BASE_URL}/api/users`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  assert(usersRes.ok, 'Super Admin fetched users list');
  const { users } = await usersRes.json();
  
  // Find or create normal admin and sub_admin
  let adminAccount = users.find((u: any) => u.role === 'admin');
  if (!adminAccount) {
    const createRes = await fetch(`${TEST_BASE_URL}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Operational Admin',
        email: 'admin-op@local.test',
        password: 'Password123!',
        role: 'admin',
      }),
    });
    const cData = await createRes.json();
    adminAccount = cData.user;
  }
  assert(Boolean(adminAccount), `Identified Admin account: ${adminAccount.email}`);

  let subAdminAccount = users.find((u: any) => u.role === 'sub_admin');
  if (!subAdminAccount) {
    const createRes = await fetch(`${TEST_BASE_URL}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Staff SubAdmin',
        email: 'staff-sub@local.test',
        password: 'Password123!',
        role: 'sub_admin',
      }),
    });
    const cData = await createRes.json();
    subAdminAccount = cData.user;
  }
  assert(Boolean(subAdminAccount), `Identified Sub-Admin account: ${subAdminAccount.email}`);

  // Reset passwords to known test password if needed
  await fetch(`${TEST_BASE_URL}/api/users/${adminAccount.id}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: 'Password123!' }),
  });
  await fetch(`${TEST_BASE_URL}/api/users/${subAdminAccount.id}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: 'Password123!' }),
  });

  const adminToken = await loginAndGetToken(adminAccount.email, 'Password123!', TEST_BASE_URL);
  assert(Boolean(adminToken), 'Obtained authentic Admin token');

  const subAdminToken = await loginAndGetToken(subAdminAccount.email, 'Password123!', TEST_BASE_URL);
  assert(Boolean(subAdminToken), 'Obtained authentic Sub Admin token');

  // 5a. Super Admin settings access -> allowed
  console.log('\n[API 5a] Super Admin updates store settings -> allowed');
  const superSettingsRes = await fetch(`${TEST_BASE_URL}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superToken}`,
    },
    body: JSON.stringify({
      storeName: 'Rongdhonu Trade (Verified)',
      deliveryFeeInsideDhaka: 60,
    }),
  });
  assert(superSettingsRes.status === 200, `Super Admin settings update returns HTTP 200 (got ${superSettingsRes.status})`);
  const superSettingsJson = await superSettingsRes.json();
  assert(superSettingsJson.success === true, 'Super Admin settings update success is true');

  // 5b. Admin without settings.manage -> denied
  console.log('\n[API 5b] Admin without settings.manage -> denied');
  const adminSettingsRes = await fetch(`${TEST_BASE_URL}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      storeName: 'Hacked Store Name',
    }),
  });
  assert(adminSettingsRes.status === 403, `Admin settings update returns HTTP 403 (got ${adminSettingsRes.status})`);

  // 5c. Sub Admin without settings.manage -> denied
  console.log('\n[API 5c] Sub Admin without settings.manage -> denied');
  const subAdminSettingsRes = await fetch(`${TEST_BASE_URL}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${subAdminToken}`,
    },
    body: JSON.stringify({
      storeName: 'Hacked Store Name SubAdmin',
    }),
  });
  assert(subAdminSettingsRes.status === 403, `Sub Admin settings update returns HTTP 403 (got ${subAdminSettingsRes.status})`);

  // 5d. Admin crafted request (trying to alter role or permissions via user update) -> denied
  console.log('\n[API 5d] Admin crafted request trying to grant self settings.manage -> denied');
  const adminCraftedUserRes = await fetch(`${TEST_BASE_URL}/api/users/${adminAccount.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      permissions: { 'settings.manage': true },
    }),
  });
  assert(
    adminCraftedUserRes.status === 403,
    `Admin crafted request on self returns HTTP 403 (got ${adminCraftedUserRes.status})`
  );

  // 5e. Sub Admin crafted request trying to grant settings.manage -> denied
  console.log('\n[API 5e] Sub Admin crafted request trying to grant self settings.manage -> denied');
  const subAdminCraftedUserRes = await fetch(`${TEST_BASE_URL}/api/users/${subAdminAccount.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${subAdminToken}`,
    },
    body: JSON.stringify({
      'settings.manage': true,
    }),
  });
  assert(
    subAdminCraftedUserRes.status === 403,
    `Sub Admin crafted request returns HTTP 403 (got ${subAdminCraftedUserRes.status})`
  );

  // 5f. Admin attempts to grant settings.manage via permissions endpoint -> denied
  console.log('\n[API 5f] Admin attempts to grant settings.manage -> denied');
  const adminGrantSelfRes = await fetch(`${TEST_BASE_URL}/api/admin/users/${adminAccount.id}/permissions`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      permissions: { 'settings.manage': true },
    }),
  });
  assert(
    adminGrantSelfRes.status === 403,
    `Admin granting settings.manage returns HTTP 403 (got ${adminGrantSelfRes.status})`
  );

  // 5g. Even Super Admin cannot grant settings.manage to a non-super-admin user (Super Admin-only policy enforcement)
  console.log('\n[API 5g] Attempt to grant settings.manage to an admin account -> denied (Super Admin only policy)');
  const superAdminGrantToAdminRes = await fetch(`${TEST_BASE_URL}/api/admin/users/${adminAccount.id}/permissions`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superToken}`,
    },
    body: JSON.stringify({
      permissions: { 'settings.manage': true },
    }),
  });
  assert(
    superAdminGrantToAdminRes.status === 403,
    `Attempt to assign settings.manage to non-super-admin returns HTTP 403 (got ${superAdminGrantToAdminRes.status})`
  );

  // 5h. Protected diagnostics endpoint (/api/admin/health and /api/admin/diagnostics)
  console.log('\n[API 5h] Protected Admin diagnostics endpoint requires settings.manage');
  const superDiagRes = await fetch(`${TEST_BASE_URL}/api/admin/diagnostics`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  assert(superDiagRes.status === 200, `Super Admin diagnostics access returns HTTP 200 (got ${superDiagRes.status})`);

  const adminDiagRes = await fetch(`${TEST_BASE_URL}/api/admin/diagnostics`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(adminDiagRes.status === 403, `Admin diagnostics access returns HTTP 403 (got ${adminDiagRes.status})`);

  // 5i. Legacy credentials cleanup requires settings.manage
  console.log('\n[API 5i] Courier cleanup-legacy-credentials requires settings.manage');
  const adminCleanupRes = await fetch(`${TEST_BASE_URL}/api/admin/courier/cleanup-legacy-credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ force: true }),
  });
  assert(adminCleanupRes.status === 403, `Admin legacy cleanup returns HTTP 403 (got ${adminCleanupRes.status})`);

  console.log('\n====================================================');
  console.log('✅ ALL SETTINGS AUTHORIZATION HARDENING TESTS PASSED!');
  console.log('====================================================\n');
}

runSettingsAuthorizationTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
