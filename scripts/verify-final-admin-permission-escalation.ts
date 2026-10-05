/**
 * Test Suite: Final Hardening of Admin Permission Escalation
 * Verifies all security requirements specified in the security brief against http://localhost:3000
 */

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runAllEscalationTests() {
  console.log('================================================================');
  console.log('STARTING COMPREHENSIVE ADMIN PERMISSION ESCALATION AUDIT & TESTS');
  console.log('================================================================\n');

  const BASE_URL = 'http://localhost:3000';

  // 1. Dev Server Health
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert(healthRes.ok, `Dev server reachable (HTTP ${healthRes.status})`);

  // 2. Obtain Super Admin token
  const superLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin', password: process.env.DEV_ADMIN_PASSWORD || 'admin' }),
  });
  assert(superLoginRes.ok, `Super Admin login successful (HTTP ${superLoginRes.status})`);
  const superToken = (await superLoginRes.json()).token;
  assert(Boolean(superToken), 'Super Admin token obtained');

  // Fetch users list
  const usersRes = await fetch(`${BASE_URL}/api/users`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  const usersJson = await usersRes.json();
  const allUsers = usersJson.users || [];

  const superAdmin = allUsers.find((u: any) => u.role === 'super_admin');
  assert(Boolean(superAdmin), `Super Admin located: ${superAdmin?.email} (${superAdmin?.id})`);

  // Setup / verify Customer user
  let customerUser = allUsers.find((u: any) => u.role === 'customer');
  if (!customerUser) {
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Customer Subject',
        email: 'customer-test@local.test',
        password: 'Password123!',
        phone: '01711000001',
      }),
    });
    customerUser = (await regRes.json()).user;
  }
  assert(Boolean(customerUser), `Customer located: ${customerUser?.email} (${customerUser?.id})`);

  // Reset Customer password
  await fetch(`${BASE_URL}/api/users/${customerUser.id}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: 'Password123!' }),
  });

  // Login as Customer
  const custLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: customerUser.email, password: 'Password123!' }),
  });
  assert(custLoginRes.ok, `Customer login successful (HTTP ${custLoginRes.status})`);
  const customerToken = (await custLoginRes.json()).token;

  // Setup / verify Admin user
  let adminUser = allUsers.find((u: any) => u.role === 'admin' && u.id !== superAdmin.id);
  if (!adminUser) {
    const createAdminRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Normal Admin Subject',
        email: 'admin-subject@local.test',
        password: 'Password123!',
        role: 'admin',
        permissions: { 'order.view': true, 'product.view': true },
      }),
    });
    adminUser = (await createAdminRes.json()).user;
  }
  assert(Boolean(adminUser), `Admin located: ${adminUser?.email} (${adminUser?.id})`);

  // Reset password to ensure known credentials
  await fetch(`${BASE_URL}/api/users/${adminUser.id}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: 'Password123!' }),
  });
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminUser.email, password: 'Password123!' }),
  });
  assert(adminLoginRes.ok, `Admin login successful (HTTP ${adminLoginRes.status})`);
  const adminToken = (await adminLoginRes.json()).token;

  // Setup / verify a second Admin user
  let otherAdminUser = allUsers.find((u: any) => u.role === 'admin' && u.id !== adminUser.id && u.id !== superAdmin.id);
  if (!otherAdminUser) {
    const createOtherAdminRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Second Admin Subject',
        email: 'second-admin@local.test',
        password: 'Password123!',
        role: 'admin',
        permissions: { 'order.view': true },
      }),
    });
    otherAdminUser = (await createOtherAdminRes.json()).user;
  }
  assert(Boolean(otherAdminUser), `Second Admin located: ${otherAdminUser?.email} (${otherAdminUser?.id})`);

  // Setup / verify Sub Admin user
  let subAdminUser = allUsers.find((u: any) => u.role === 'sub_admin');
  if (!subAdminUser) {
    const createSubAdminRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sub Admin Subject',
        email: 'subadmin-subject@local.test',
        password: 'Password123!',
        role: 'sub_admin',
        permissions: { 'product.view': true },
      }),
    });
    subAdminUser = (await createSubAdminRes.json()).user;
  }
  assert(Boolean(subAdminUser), `Sub Admin located: ${subAdminUser?.email} (${subAdminUser?.id})`);

  // Reset Sub Admin password
  await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: 'Password123!' }),
  });
  const subAdminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: subAdminUser.email, password: 'Password123!' }),
  });
  assert(subAdminLoginRes.ok, `Sub Admin login successful (HTTP ${subAdminLoginRes.status})`);
  const subAdminToken = (await subAdminLoginRes.json()).token;

  console.log('\n--- SECTION 1: UNAUTHENTICATED ATTEMPTS (REQUIRE 401) ---');
  const u1 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.view': true } }),
  });
  assert(u1.status === 401, `Unauthenticated permission update returns HTTP 401 (got ${u1.status})`);

  const u2 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assert(u2.status === 401, `Unauthenticated role update returns HTTP 401 (got ${u2.status})`);

  const u3 = await fetch(`${BASE_URL}/api/users/${adminUser.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assert(u3.status === 401, `Unauthenticated user update returns HTTP 401 (got ${u3.status})`);

  console.log('\n--- SECTION 2: CUSTOMER PRIVILEGE ESCALATION ATTEMPTS (REQUIRE 403) ---');
  // Customer: change own permissions -> 403
  const c1 = await fetch(`${BASE_URL}/api/users/${customerUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_profit': true } }),
  });
  assert(c1.status === 403, `Customer: change own permissions via /permissions returns HTTP 403 (got ${c1.status})`);

  const c1b = await fetch(`${BASE_URL}/api/users/${customerUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_profit': true } }),
  });
  assert(c1b.status === 403, `Customer: change own permissions via user update returns HTTP 403 (got ${c1b.status})`);

  // Customer: change another user's permissions -> 403
  const c2 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_profit': true } }),
  });
  assert(c2.status === 403, `Customer: change another user permissions returns HTTP 403 (got ${c2.status})`);

  // Customer: set own role to super_admin -> 403
  const c3a = await fetch(`${BASE_URL}/api/users/${customerUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assert(c3a.status === 403, `Customer: set own role to super_admin via user update returns HTTP 403 (got ${c3a.status})`);

  const c3b = await fetch(`${BASE_URL}/api/users/${customerUser.id}/role`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assert(c3b.status === 403, `Customer: set own role to super_admin via /role returns HTTP 403 (got ${c3b.status})`);

  console.log('\n--- SECTION 3: ADMIN PRIVILEGE ESCALATION ATTEMPTS (REQUIRE 403) ---');
  // Admin: change own permissions -> 403
  const a1 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_buying_price': true } }),
  });
  assert(a1.status === 403, `Admin: change own permissions via /permissions returns HTTP 403 (got ${a1.status})`);

  const a1b = await fetch(`${BASE_URL}/api/users/${adminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_buying_price': true } }),
  });
  assert(a1b.status === 403, `Admin: change own permissions via user update returns HTTP 403 (got ${a1b.status})`);

  // Admin: change another admin's permissions -> 403
  const a2 = await fetch(`${BASE_URL}/api/users/${otherAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.status_change': true } }),
  });
  assert(a2.status === 403, `Admin: change another admin permissions returns HTTP 403 (got ${a2.status})`);

  // Admin: change sub_admin permissions -> 403
  const a3 = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.view': true } }),
  });
  assert(a3.status === 403, `Admin: change sub_admin permissions returns HTTP 403 (got ${a3.status})`);

  // Admin: modify own role -> 403
  const a4a = await fetch(`${BASE_URL}/api/users/${adminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assert(a4a.status === 403, `Admin: modify own role to super_admin returns HTTP 403 (got ${a4a.status})`);

  const a4b = await fetch(`${BASE_URL}/api/users/${adminUser.id}/role`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  assert(a4b.status === 403, `Admin: modify own role via /role returns HTTP 403 (got ${a4b.status})`);

  // Admin: modify another user's role -> 403
  const a5a = await fetch(`${BASE_URL}/api/users/${otherAdminUser.id}/role`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'customer' }),
  });
  assert(a5a.status === 403, `Admin: modify another admin role via /role returns HTTP 403 (got ${a5a.status})`);

  const a5b = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/role`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  assert(a5b.status === 403, `Admin: modify sub_admin role via /role returns HTTP 403 (got ${a5b.status})`);

  const a5c = await fetch(`${BASE_URL}/api/users/${customerUser.id}/role`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  assert(a5c.status === 403, `Admin: modify customer role via /role returns HTTP 403 (got ${a5c.status})`);

  // Admin: set own role to super_admin -> 403
  const a6 = await fetch(`${BASE_URL}/api/users/${adminUser.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_role: 'super_admin' }),
  });
  assert(a6.status === 403, `Admin: set own role to super_admin with alias field returns HTTP 403 (got ${a6.status})`);

  console.log('\n--- SECTION 4: SUB ADMIN PRIVILEGE ESCALATION ATTEMPTS (REQUIRE 403) ---');
  // Sub Admin: change own permissions -> 403
  const sa1 = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.manage': true } }),
  });
  assert(sa1.status === 403, `Sub Admin: change own permissions via /permissions returns HTTP 403 (got ${sa1.status})`);

  // Sub Admin: change another admin's permissions -> 403
  const sa2 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.manage': true } }),
  });
  assert(sa2.status === 403, `Sub Admin: change another admin permissions returns HTTP 403 (got ${sa2.status})`);

  // Sub Admin: change sub_admin permissions -> 403
  const sa3 = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_profit': true } }),
  });
  assert(sa3.status === 403, `Sub Admin: change sub_admin permissions returns HTTP 403 (got ${sa3.status})`);

  // Sub Admin: modify own role -> 403
  const sa4 = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  assert(sa4.status === 403, `Sub Admin: modify own role via user update returns HTTP 403 (got ${sa4.status})`);

  // Sub Admin: modify another user's role -> 403
  const sa5 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/role`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'sub_admin' }),
  });
  assert(sa5.status === 403, `Sub Admin: modify another user role via /role returns HTTP 403 (got ${sa5.status})`);

  // Sub Admin: set own role to super_admin -> 403
  const sa6 = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assert(sa6.status === 403, `Sub Admin: set own role to super_admin returns HTTP 403 (got ${sa6.status})`);

  console.log('\n--- SECTION 5: INDIRECT ESCALATION PAYLOADS (REQUIRE 403) ---');
  // Indirect: { "role": "super_admin" }
  const ind1 = await fetch(`${BASE_URL}/api/users/${adminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assert(ind1.status === 403, `Indirect: { "role": "super_admin" } returns HTTP 403 (got ${ind1.status})`);

  // Indirect: { "permissions": ["permission.manage"] }
  const ind2 = await fetch(`${BASE_URL}/api/users/${adminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: ['permission.manage'] }),
  });
  assert(ind2.status === 403, `Indirect: { "permissions": ["permission.manage"] } returns HTTP 403 (got ${ind2.status})`);

  // Indirect: nested { "user": { "role": "super_admin" } }
  const ind3 = await fetch(`${BASE_URL}/api/users/${adminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: { role: 'super_admin' } }),
  });
  assert(ind3.status === 403, `Indirect: nested { "user": { "role": "super_admin" } } returns HTTP 403 (got ${ind3.status})`);

  // Indirect: grant self permission.manage via permissions route
  const ind4 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: ['permission.manage'] }),
  });
  assert(ind4.status === 403, `Indirect: permissions route with ["permission.manage"] returns HTTP 403 (got ${ind4.status})`);

  // Indirect: Super Admin cannot grant permission.manage to an admin (Super Admin only permission)
  const ind5 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: ['permission.manage'] }),
  });
  assert(ind5.status === 403, `Indirect: Super Admin granting permission.manage to admin returns HTTP 403 (got ${ind5.status})`);

  console.log('\n--- SECTION 6: TARGET SUPER ADMIN PROTECTION (REQUIRE 403) ---');
  // Admin modifies Super Admin user account
  const sup1 = await fetch(`${BASE_URL}/api/users/${superAdmin.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Tampered Super Admin' }),
  });
  assert(sup1.status === 403, `Admin modifies Super Admin account returns HTTP 403 (got ${sup1.status})`);

  // Admin deletes Super Admin user account
  const sup2 = await fetch(`${BASE_URL}/api/users/${superAdmin.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(sup2.status === 403, `Admin deletes Super Admin account returns HTTP 403 (got ${sup2.status})`);

  // Super Admin cannot downgrade Super Admin account to admin or customer
  const sup3 = await fetch(`${BASE_URL}/api/users/${superAdmin.id}/role`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  assert(sup3.status === 403, `Super Admin downgrading Super Admin account returns HTTP 403 (got ${sup3.status})`);

  console.log('\n--- SECTION 7: LEGITIMATE SUPER ADMIN CAPABILITIES (REQUIRE 200) ---');
  // Legitimate permission update by Super Admin
  const leg1 = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      permissions: {
        'order.view': true,
        'order.status_change': true,
      },
    }),
  });
  assert(leg1.status === 200, `Super Admin legitimate permission update returns HTTP 200 (got ${leg1.status})`);
  const leg1Data = await leg1.json();
  assert(leg1Data.success === true, 'Legitimate permission update success is true');
  assert(leg1Data.permissions?.['order.view'] === true, 'Legitimate permission order.view is true');

  // Legitimate permission update using array payload
  const leg1Array = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      permissions: ['order.view', 'product.view'],
    }),
  });
  assert(leg1Array.status === 200, `Super Admin legitimate permission update with array returns HTTP 200 (got ${leg1Array.status})`);

  // Legitimate role update by Super Admin
  const leg2 = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/role`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'sub_admin' }),
  });
  assert(leg2.status === 200, `Super Admin legitimate role update returns HTTP 200 (got ${leg2.status})`);
  const leg2Data = await leg2.json();
  assert(leg2Data.success === true, 'Legitimate role update success is true');

  console.log('\n--- SECTION 8: ERROR MESSAGE PRIVACY (NO INTERNAL DETAILS LEAKED) ---');
  const errRes = await fetch(`${BASE_URL}/api/users/${adminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  const errBody = await errRes.text();
  assert(!errBody.includes('stack'), 'Error message does not leak stack trace');
  assert(!errBody.includes('TypeError'), 'Error message does not leak runtime exceptions');
  assert(!errBody.includes('SELECT'), 'Error message does not leak SQL queries');
  assert(!errBody.includes('FROM users'), 'Error message does not leak internal table names');
  console.log(`  ✓ Clean error response: ${errBody}`);

  console.log('\n================================================================');
  console.log('✅ ALL ADMIN PERMISSION ESCALATION AUDIT TESTS PASSED!');
  console.log('================================================================\n');
}

runAllEscalationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
