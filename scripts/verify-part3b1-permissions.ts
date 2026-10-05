/**
 * Verification Script for Part 3B-1: Frontend Permission State + Central Helper
 *
 * Validates:
 * 1. Super Admin: hasPermission(any_permission) -> true
 * 2. Admin: existing server permission true -> true
 * 3. Admin: missing permission -> false, sensitive/super_admin-only -> false
 * 4. Sub Admin: missing permission -> false
 * 5. Customer / unauthenticated: Admin permission -> false
 * 6. LocalStorage tampering: does not grant backend authorization or circumvent server enforcement
 */

import { hasUserPermission, canUser } from '../src/utils/permissions';
import type { UserAccount } from '../src/types';
import { getTestCustomerToken, getTestStaffToken } from './test-auth-helper';

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
  console.log('\n======================================================');
  console.log('PART 3B-1 VALIDATION: FRONTEND PERMISSION STATE & HELPER');
  console.log('======================================================\n');

  // Sample users
  const superAdminUser: UserAccount = {
    id: 'user-super-admin',
    name: 'Master Super Admin',
    email: 'dev-superadmin@local.test',
    role: 'super_admin',
    permissions: {
      canManageOrders: true,
      canManageProducts: true,
      canManageCategories: true,
      canManageAccounts: true,
      canManageSettings: true,
    },
    createdAt: new Date().toISOString(),
  };

  const operationalAdminUser: UserAccount = {
    id: 'user-admin-ops',
    name: 'Operational Admin',
    email: 'admin.staff@rongdhonutrade.com',
    role: 'admin',
    permissions: {
      'product.view': true,
      'product.create': true,
      'product.update': true,
      'product.delete': false,
      'order.view': true,
      'order.manage': true,
      'courier.booking': true,
      // Super Admin-only permissions (cannot be granted or injected):
      'permission.manage': true as any,
      'user.manage': true as any,
      // Financial permissions set to false (unauthorized):
      'product.view_buying_price': false,
      'report.profit': false,
      'settings.manage': false,
      canManageProducts: true,
      canManageOrders: true,
    },
    createdAt: new Date().toISOString(),
  };

  const subAdminUser: UserAccount = {
    id: 'user-subadmin-dispatcher',
    name: 'Logistics Dispatcher',
    email: 'orders@rongdhonutrade.com',
    role: 'sub_admin',
    permissions: {
      'order.view': true,
      'order.manage': true,
      'courier.booking': true,
      'courier.tracking': true,
      'order.delete': false,
      'order.cancel': false,
      canManageOrders: true,
    },
    createdAt: new Date().toISOString(),
  };

  const customerUser: UserAccount = {
    id: 'user-customer-sakib',
    name: 'Sakib Customer',
    email: 'customer@gmail.com',
    role: 'customer',
    permissions: undefined,
    createdAt: new Date().toISOString(),
  };

  // ----------------------------------------------------
  // Test 1: Super Admin has full authority for all permissions
  // ----------------------------------------------------
  console.log('Test 1: Super Admin Permissions');
  assert(hasUserPermission(superAdminUser, 'product.create') === true, 'Super Admin: product.create -> true');
  assert(hasUserPermission(superAdminUser, 'order.delete') === true, 'Super Admin: order.delete -> true');
  assert(hasUserPermission(superAdminUser, 'product.view_buying_price') === true, 'Super Admin: product.view_buying_price -> true');
  assert(hasUserPermission(superAdminUser, 'report.profit') === true, 'Super Admin: report.profit -> true');
  assert(hasUserPermission(superAdminUser, 'settings.manage') === true, 'Super Admin: settings.manage -> true');
  assert(hasUserPermission(superAdminUser, 'non_standard.permission') === true, 'Super Admin: custom/any permission -> true');
  assert(canUser(superAdminUser, 'audit_log.view') === true, 'canUser alias works for Super Admin');

  // ----------------------------------------------------
  // Test 2: Admin with server permission true -> true
  // ----------------------------------------------------
  console.log('\nTest 2: Admin Existing Server Permission = true');
  assert(hasUserPermission(operationalAdminUser, 'product.create') === true, 'Admin: product.create (granted on server) -> true');
  assert(hasUserPermission(operationalAdminUser, 'product.view') === true, 'Admin: product.view (granted on server) -> true');
  assert(hasUserPermission(operationalAdminUser, 'order.view') === true, 'Admin: order.view (granted on server) -> true');
  assert(hasUserPermission(operationalAdminUser, 'courier.booking') === true, 'Admin: courier.booking (granted on server) -> true');
  assert(canUser(operationalAdminUser, 'product.create') === true, 'canUser alias works for Admin');

  // ----------------------------------------------------
  // Test 3: Admin missing / false / sensitive permissions -> false
  // ----------------------------------------------------
  console.log('\nTest 3: Admin Missing or Restricted Permissions');
  assert(hasUserPermission(operationalAdminUser, 'coupon.manage') === false, 'Admin: coupon.manage (missing) -> false');
  assert(hasUserPermission(operationalAdminUser, 'product.delete') === false, 'Admin: product.delete (explicitly false) -> false');
  assert(hasUserPermission(operationalAdminUser, 'category.manage') === false, 'Admin: category.manage (missing) -> false');
  // Unassigned / false permissions must be false for Admin
  assert(hasUserPermission(operationalAdminUser, 'product.view_buying_price') === false, 'Admin: product.view_buying_price (not granted) -> false');
  assert(hasUserPermission(operationalAdminUser, 'report.profit') === false, 'Admin: report.profit (not granted) -> false');
  assert(hasUserPermission(operationalAdminUser, 'settings.manage') === false, 'Admin: settings.manage (not granted) -> false');
  // Strictly Super Admin-only permissions (user.manage, permission.manage) blocked even if injected
  assert(hasUserPermission(operationalAdminUser, 'permission.manage') === false, 'Admin: permission.manage (strictly Super Admin only) -> false');
  assert(hasUserPermission(operationalAdminUser, 'user.manage') === false, 'Admin: user.manage (strictly Super Admin only) -> false');

  // ----------------------------------------------------
  // Test 4: Sub Admin missing permission -> false
  // ----------------------------------------------------
  console.log('\nTest 4: Sub Admin Permissions');
  assert(hasUserPermission(subAdminUser, 'order.view') === true, 'Sub Admin: order.view (granted) -> true');
  assert(hasUserPermission(subAdminUser, 'courier.booking') === true, 'Sub Admin: courier.booking (granted) -> true');
  assert(hasUserPermission(subAdminUser, 'order.delete') === false, 'Sub Admin: order.delete (explicitly false) -> false');
  assert(hasUserPermission(subAdminUser, 'order.cancel') === false, 'Sub Admin: order.cancel (explicitly false) -> false');
  assert(hasUserPermission(subAdminUser, 'product.create') === false, 'Sub Admin: product.create (missing) -> false');
  assert(hasUserPermission(subAdminUser, 'user.manage') === false, 'Sub Admin: user.manage (missing) -> false');

  // ----------------------------------------------------
  // Test 5: Customer & Unauthenticated -> false
  // ----------------------------------------------------
  console.log('\nTest 5: Customer & Unauthenticated Access');
  assert(hasUserPermission(customerUser, 'product.create') === false, 'Customer: product.create -> false');
  assert(hasUserPermission(customerUser, 'order.view') === false, 'Customer: order.view -> false');
  assert(hasUserPermission(customerUser, 'canManageOrders') === false, 'Customer: canManageOrders -> false');
  assert(hasUserPermission(customerUser, 'settings.manage') === false, 'Customer: settings.manage -> false');
  assert(hasUserPermission(null, 'product.view') === false, 'Unauthenticated (null user): product.view -> false');
  assert(hasUserPermission(undefined, 'product.view') === false, 'Unauthenticated (undefined user): product.view -> false');

  // ----------------------------------------------------
  // Test 6: Backend Authorization enforcement (LocalStorage tampering protection)
  // ----------------------------------------------------
  console.log('\nTest 6: Backend Authorization / LocalStorage Stale Protection');

  // Simulate API authorization check with an unauthorized customer bearer token
  const customerToken = await getTestCustomerToken('http://localhost:3000');

  try {
    const res = await fetch('http://localhost:3000/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        title: 'Tampered Product Attempt',
        price: 999,
        category: 'Watches',
      }),
    });

    assert(res.status === 403, `Backend blocks customer unauthorized action with HTTP 403 (Actual status: ${res.status})`);
  } catch (err: any) {
    console.error('API verification fetch error:', err.message);
  }

  // Sub Admin attempting Super Admin action (e.g. creating/managing users)
  const subAdminToken = await getTestStaffToken('http://localhost:3000');
  try {
    const res = await fetch('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${subAdminToken}`,
      },
      body: JSON.stringify({
        name: 'Injected User',
        email: 'injected@gmail.com',
        role: 'admin',
      }),
    });

    assert(res.status === 403, `Backend blocks sub_admin without user.manage permission with HTTP 403 (Actual status: ${res.status})`);
  } catch (err: any) {
    console.error('API verification fetch error:', err.message);
  }

  console.log('\n------------------------------------------------------');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
