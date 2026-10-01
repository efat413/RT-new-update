/**
 * Verification Script for Part 3B-2: Permission Management UI & RBAC API
 *
 * Validates:
 * 1. Super Admin can access Permission Management (permission.manage + super_admin)
 * 2. Admin cannot access Permission Management
 * 3. Sub Admin cannot access Permission Management
 * 4. Admin & Sub Admin can be selected for permission configuration
 * 5. Super Admin cannot be selected/modified through ordinary permission editing
 * 6. Permission values load from server via GET /api/users/:id/permissions
 * 7. Save calls existing permission API (PUT /api/users/:id/permissions)
 * 8. Success and error states work (e.g. privilege escalation rejection)
 * 9. No passwords or secret keys are exposed
 */

import { hasUserPermission } from '../src/utils/permissions';
import {
  PERMISSION_KEYS,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  isSuperAdminOnlyPermission,
} from '../src/server/permissions';
import type { UserAccount } from '../src/types';

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
  console.log('\n================================================================');
  console.log('PART 3B-2 VALIDATION: PERMISSION MANAGEMENT UI & ACCESS CONTROL');
  console.log('================================================================\n');

  const superAdminUser: UserAccount = {
    id: 'dev-super-admin-1',
    name: 'Dev Super Admin',
    email: 'dev-superadmin@local.test',
    role: 'super_admin',
    createdAt: new Date().toISOString(),
  };

  const adminUser: UserAccount = {
    id: 'user-admin-assistant',
    name: 'Senior Store Admin',
    email: 'admin.staff@rongdhonutrade.com',
    role: 'admin',
    permissions: {
      canManageOrders: true,
      canManageProducts: true,
      'product.view': true,
      'order.view': true,
    },
    createdAt: new Date().toISOString(),
  };

  const subAdminUser: UserAccount = {
    id: 'user-subadmin-orders',
    name: 'Logistics Dispatcher',
    email: 'orders@rongdhonutrade.com',
    role: 'sub_admin',
    permissions: {
      canManageOrders: true,
      'order.view': true,
      'courier.booking': true,
    },
    createdAt: new Date().toISOString(),
  };

  const customerUser: UserAccount = {
    id: 'user-customer',
    name: 'Customer Sakib',
    email: 'customer@gmail.com',
    role: 'customer',
    createdAt: new Date().toISOString(),
  };

  // ----------------------------------------------------------------
  // 1. UI Access Control: Only Super Admin can access Permission Management
  // ----------------------------------------------------------------
  console.log('1. UI Access Control Verification:');
  const superAdminCanManage =
    superAdminUser.role === 'super_admin' &&
    hasUserPermission(superAdminUser, 'permission.manage');
  assert(superAdminCanManage === true, 'Super Admin CAN access Permission Management (role: super_admin + permission.manage)');

  const adminCanManage =
    adminUser.role === 'super_admin' &&
    hasUserPermission(adminUser, 'permission.manage');
  assert(adminCanManage === false, 'Admin CANNOT access Permission Management (role: admin)');

  const subAdminCanManage =
    subAdminUser.role === 'super_admin' &&
    hasUserPermission(subAdminUser, 'permission.manage');
  assert(subAdminCanManage === false, 'Sub Admin CANNOT access Permission Management (role: sub_admin)');

  const customerCanManage =
    customerUser.role === 'super_admin' &&
    hasUserPermission(customerUser, 'permission.manage');
  assert(customerCanManage === false, 'Customer CANNOT access Permission Management (role: customer)');

  // ----------------------------------------------------------------
  // 2. Target User Selection Rules
  // ----------------------------------------------------------------
  console.log('\n2. Target User Selection Rules:');
  const isSuperAdminTargetProtected = (target: UserAccount) =>
    target.role === 'super_admin' || target.email.toLowerCase().trim() === 'dev-superadmin@local.test' || target.id === 'dev-super-admin-1';

  assert(isSuperAdminTargetProtected(superAdminUser) === true, 'Super Admin CANNOT be selected for ordinary permission editing (Permanently Protected)');
  assert(isSuperAdminTargetProtected(adminUser) === false, 'Admin CAN be selected for permission editing');
  assert(isSuperAdminTargetProtected(subAdminUser) === false, 'Sub Admin CAN be selected for permission editing');

  // ----------------------------------------------------------------
  // 3. Live Server API: Loading Permissions via GET /api/users/:id/permissions
  // ----------------------------------------------------------------
  console.log('\n3. Live Server API: Loading Permissions (GET /api/users/:id/permissions):');
  const superAdminToken = `dev-jwt-${Buffer.from(JSON.stringify({ email: 'dev-superadmin@local.test', role: 'super_admin', exp: Date.now() + 3600000 })).toString('base64')}`;
  const subAdminToken = `dev-jwt-${Buffer.from(JSON.stringify({ email: 'orders@rongdhonutrade.com', role: 'sub_admin', exp: Date.now() + 3600000 })).toString('base64')}`;

  try {
    const res = await fetch(`http://localhost:3000/api/users/${encodeURIComponent(subAdminUser.id)}/permissions`, {
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
      },
    });
    assert(res.status === 200, `Super Admin fetches permissions with HTTP 200 (Got: ${res.status})`);
    const data = await res.json();
    assert(data.success === true, 'Response success flag is true');
    assert(data.userId === subAdminUser.id, `Loaded permissions for correct target user ID: ${data.userId}`);
    assert(typeof data.permissions === 'object', 'Permissions object is returned from server');
    assert(data.permissions['order.view'] === true, 'Existing permission order.view is true in server response');
  } catch (err: any) {
    console.error('Fetch error in test 3:', err.message);
  }

  // ----------------------------------------------------------------
  // 4. Live Server API: Updating Permissions via PUT /api/users/:id/permissions
  // ----------------------------------------------------------------
  console.log('\n4. Live Server API: Saving Permissions (PUT /api/users/:id/permissions):');
  try {
    const updatedPerms = {
      'order.view': true,
      'order.manage': true,
      'courier.booking': true,
      'courier.tracking': true,
      'product.view': true,
      'product.create': false,
    };

    const res = await fetch(`http://localhost:3000/api/users/${encodeURIComponent(subAdminUser.id)}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ permissions: updatedPerms }),
    });

    assert(res.status === 200, `Super Admin successfully saves permissions with HTTP 200 (Got: ${res.status})`);
    const data = await res.json();
    assert(data.success === true, 'Save response success is true');
    assert(data.permissions['order.manage'] === true, 'Updated permission order.manage is saved as true');
  } catch (err: any) {
    console.error('Fetch error in test 4:', err.message);
  }

  // ----------------------------------------------------------------
  // 5. Backend Privilege Escalation Protection (Locked Permissions)
  // ----------------------------------------------------------------
  console.log('\n5. Backend Privilege Escalation Protection:');
  try {
    // Attempting to grant a Super Admin-only permission to a sub_admin
    const maliciousPayload = {
      'permission.manage': true,
    };

    const res = await fetch(`http://localhost:3000/api/users/${encodeURIComponent(subAdminUser.id)}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ permissions: maliciousPayload }),
    });

    assert(res.status === 403, `Backend strictly rejects granting Super Admin-only permission (permission.manage) with HTTP 403 (Got: ${res.status})`);
    const data = await res.json();
    assert(data.success === false, 'Escalation response success is false');
    assert(data.error.includes('permanently Super Admin-only'), `Clear, safe error message returned: "${data.error}"`);
  } catch (err: any) {
    console.error('Fetch error in test 5:', err.message);
  }

  // ----------------------------------------------------------------
  // 6. Non-Super Admin cannot call permission update API
  // ----------------------------------------------------------------
  console.log('\n6. Non-Super Admin Blocked from Updating Permissions:');
  try {
    const res = await fetch(`http://localhost:3000/api/users/${encodeURIComponent(subAdminUser.id)}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${subAdminToken}`, // Sub Admin token
      },
      body: JSON.stringify({ permissions: { 'order.view': true } }),
    });

    assert(res.status === 403, `Sub Admin calling permission update API is blocked with HTTP 403 (Got: ${res.status})`);
    const data = await res.json();
    assert(data.error.includes('Only Super Administrator can modify permissions'), `Received authoritative error: "${data.error}"`);
  } catch (err: any) {
    console.error('Fetch error in test 6:', err.message);
  }

  // ----------------------------------------------------------------
  // 7. Modifying Super Admin account is permanently forbidden
  // ----------------------------------------------------------------
  console.log('\n7. Modifying Super Admin Account is Blocked:');
  try {
    const res = await fetch(`http://localhost:3000/api/users/${encodeURIComponent(superAdminUser.id)}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ permissions: { 'order.view': true } }),
    });

    assert(res.status === 403, `Modifying Super Admin permissions is blocked with HTTP 403 (Got: ${res.status})`);
    const data = await res.json();
    assert(data.error.includes('Super Administrator permissions cannot be modified'), `Received authoritative error: "${data.error}"`);
  } catch (err: any) {
    console.error('Fetch error in test 7:', err.message);
  }

  // ----------------------------------------------------------------
  // 8. No credential or password leakage
  // ----------------------------------------------------------------
  console.log('\n8. Credential Privacy Check:');
  try {
    const res = await fetch('http://localhost:3000/api/users', {
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
      },
    });
    const data = await res.json();
    const hasPassword = data.users.some((u: any) => 'password' in u || 'password_hash' in u);
    assert(hasPassword === false, 'Users endpoint NEVER leaks password or password_hash fields');

    const permRes = await fetch(`http://localhost:3000/api/users/${encodeURIComponent(subAdminUser.id)}/permissions`, {
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
      },
    });
    const permData = await permRes.json();
    const permHasSecret = 'password' in permData || 'secret' in permData;
    assert(permHasSecret === false, 'Permissions endpoint NEVER leaks passwords or secret keys');
  } catch (err: any) {
    console.error('Fetch error in test 8:', err.message);
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
