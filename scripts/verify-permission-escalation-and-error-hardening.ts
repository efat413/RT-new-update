/**
 * Security Hardening Test Suite: Admin Permission Escalation & Error Handling
 * Executes direct HTTP API attacks against localhost:3000
 */

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING DIRECT API ATTACK & ERROR HANDLING TESTS');
  console.log('====================================================\n');

  const BASE_URL = 'http://localhost:3000';

  // 1. Verify Dev Server is reachable
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert(healthRes.ok, `Dev server health endpoint reachable (HTTP ${healthRes.status})`);

  // 2. Authenticate as Super Admin
  let superToken = '';
  const superAdminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin', password: process.env.DEV_ADMIN_PASSWORD || 'admin' }),
  });
  if (superAdminLoginRes.ok) {
    const superAdminData = await superAdminLoginRes.json();
    superToken = superAdminData.token;
  }
  if (!superToken) {
    const errText = await superAdminLoginRes.text().catch(() => '');
    throw new Error(
      `Failed to obtain Super Admin authentication token from /api/auth/login (HTTP ${superAdminLoginRes.status}: ${errText}). Check test environment setup.`
    );
  }
  assert(Boolean(superToken), 'Received valid Super Admin token');

  // Fetch users to obtain Super Admin, Normal Admin, and Sub Admin IDs
  const usersRes = await fetch(`${BASE_URL}/api/users`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  assert(usersRes.ok, `Super Admin fetched users list (HTTP ${usersRes.status})`);
  const usersJson = await usersRes.json();
  const usersList = usersJson.users || [];

  const superAdminUser = usersList.find((u: any) => u.role === 'super_admin');
  assert(Boolean(superAdminUser), `Super Admin user identified: ${superAdminUser?.email}`);

  // Create a Normal Admin for direct attack testing if not present
  let normalAdminUser = usersList.find((u: any) => u.role === 'admin' && u.email !== superAdminUser?.email);
  if (!normalAdminUser) {
    const createAdminRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Normal Admin',
        email: 'test-admin@local.test',
        password: 'Password123!',
        role: 'admin',
        permissions: {
          'order.view': true,
          'product.view': true,
        },
      }),
    });
    if (createAdminRes.ok) {
      const createdJson = await createAdminRes.json();
      normalAdminUser = createdJson.user;
    }
  }

  // Also obtain or create a Sub Admin user for other-user attack testing
  let otherAdminUser = usersList.find((u: any) => (u.role === 'admin' || u.role === 'sub_admin') && u.id !== normalAdminUser?.id && u.id !== superAdminUser?.id);
  if (!otherAdminUser) {
    const createOtherRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Target Sub Admin',
        email: 'other-subadmin@local.test',
        password: 'Password123!',
        role: 'sub_admin',
      }),
    });
    if (createOtherRes.ok) {
      const createdOtherJson = await createOtherRes.json();
      otherAdminUser = createdOtherJson.user;
    }
  }

  assert(Boolean(normalAdminUser), `Normal Admin identified: ${normalAdminUser?.id} (${normalAdminUser?.email})`);
  assert(Boolean(otherAdminUser), `Second Admin/SubAdmin identified: ${otherAdminUser?.id} (${otherAdminUser?.email})`);

  // Log in as Normal Admin to obtain an authenticated Normal Admin session token
  let normalAdminToken = '';
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalAdminUser.email, password: 'Password123!' }),
  });
  if (adminLoginRes.ok) {
    const adminLoginData = await adminLoginRes.json();
    normalAdminToken = adminLoginData.token;
  }
  if (!normalAdminToken) {
    const errText = await adminLoginRes.text().catch(() => '');
    throw new Error(
      `Failed to obtain Normal Admin authentication token from /api/auth/login for ${normalAdminUser.email} (HTTP ${adminLoginRes.status}: ${errText}). Check test environment setup.`
    );
  }
  assert(Boolean(normalAdminToken), 'Obtained Normal Admin authentication token');

  console.log('\n--- PART 1: DIRECT API ATTACK TESTS ---');

  // Test A: Normal Admin -> modify own permissions
  console.log('\n[Test A] Normal Admin attempts to modify own permissions via /api/users/:id/permissions');
  const testARes = await fetch(`${BASE_URL}/api/users/${normalAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_profit': true, 'settings.manage': true } }),
  });
  assert(testARes.status === 403, `Test A: PUT own permissions returns HTTP 403 (got ${testARes.status})`);
  const testAData = await testARes.json();
  assert(testAData.success === false, 'Test A: Response success is false');

  // Also Test A2: Normal Admin attempts to modify own permissions via PUT /api/users/:id
  console.log('[Test A2] Normal Admin attempts to inject permissions in self update via PUT /api/users/:id');
  const testA2Res = await fetch(`${BASE_URL}/api/users/${normalAdminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: normalAdminUser.name,
      permissions: { 'product.view_profit': true, 'settings.manage': true, 'permission.manage': true },
    }),
  });
  assert(testA2Res.status === 403, `Test A2: Self update injecting permissions returns HTTP 403 (got ${testA2Res.status})`);

  // Test B: Normal Admin -> modify another Admin permissions
  console.log('\n[Test B] Normal Admin attempts to modify another Admin permissions');
  const testBRes = await fetch(`${BASE_URL}/api/users/${otherAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.delete': true } }),
  });
  assert(testBRes.status === 403, `Test B: Modifying other user permissions returns HTTP 403 (got ${testBRes.status})`);

  // Test C: Normal Admin -> modify Super Admin
  console.log('\n[Test C] Normal Admin attempts to modify Super Admin user or permissions');
  const testCPermRes = await fetch(`${BASE_URL}/api/users/${superAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view': false } }),
  });
  assert(testCPermRes.status === 403, `Test C: Modifying Super Admin permissions returns HTTP 403 (got ${testCPermRes.status})`);

  const testCUserRes = await fetch(`${BASE_URL}/api/users/${superAdminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hacked Admin' }),
  });
  assert(testCUserRes.status === 403, `Test C: Modifying Super Admin account returns HTTP 403 (got ${testCUserRes.status})`);

  // Test D: Normal Admin -> set role=super_admin
  console.log('\n[Test D] Normal Admin attempts to set role="super_admin" on themselves');
  const testDRes = await fetch(`${BASE_URL}/api/users/${normalAdminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assert(testDRes.status === 403, `Test D: Escalating role to super_admin returns HTTP 403 (got ${testDRes.status})`);

  // Test E: Normal Admin -> grant themselves permission.manage
  console.log('\n[Test E] Normal Admin attempts to grant themselves permission.manage');
  const testERes = await fetch(`${BASE_URL}/api/users/${normalAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'permission.manage': true } }),
  });
  assert(testERes.status === 403, `Test E: Granting permission.manage returns HTTP 403 (got ${testERes.status})`);

  // Test F: Normal Admin -> grant themselves settings.manage
  console.log('\n[Test F] Normal Admin attempts to grant themselves settings.manage');
  const testFRes = await fetch(`${BASE_URL}/api/users/${normalAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'settings.manage': true } }),
  });
  assert(testFRes.status === 403, `Test F: Granting settings.manage returns HTTP 403 (got ${testFRes.status})`);

  // Test G: Normal Admin -> grant themselves product.view_profit
  console.log('\n[Test G] Normal Admin attempts to grant themselves product.view_profit');
  const testGRes = await fetch(`${BASE_URL}/api/users/${normalAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_profit': true } }),
  });
  assert(testGRes.status === 403, `Test G: Granting product.view_profit returns HTTP 403 (got ${testGRes.status})`);

  // Test H & I: LocalStorage Role & Permissions Modification Simulation
  console.log('\n[Test H & I] Client-side spoofed tokens / localStorage role modification');
  // If client crafts a bearer token claiming role: 'super_admin' with their Normal Admin user ID or email:
  const tokenParts = normalAdminToken.split('.');
  const spoofedPayload = Buffer.from(JSON.stringify({
    userId: normalAdminUser.id,
    email: normalAdminUser.email,
    role: 'super_admin', // Client pretends to be super_admin
    exp: Math.floor(Date.now() / 1000) + 86400,
  })).toString('base64url');
  const spoofedRoleToken = `${tokenParts[0] || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'}.${spoofedPayload}.${tokenParts[2] || 'invalidsig'}`;

  // Attempt Super Admin only endpoint /api/admin/profit-analytics
  const spoofedAnalyticsRes = await fetch(`${BASE_URL}/api/admin/profit-analytics`, {
    headers: { Authorization: `Bearer ${spoofedRoleToken}` },
  });
  assert(
    spoofedAnalyticsRes.status === 403,
    `Test H: Token with spoofed role='super_admin' rejected with HTTP 403 by server (got ${spoofedAnalyticsRes.status})`
  );

  // Attempt to update settings with spoofed token
  const spoofedSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${spoofedRoleToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteName: 'Hacked Store' }),
  });
  assert(
    spoofedSettingsRes.status === 403,
    `Test I: Spoofed role token attempting settings update rejected with HTTP 403 (got ${spoofedSettingsRes.status})`
  );

  // Test J: Missing or invalid authentication token
  console.log('\n[Test J] Missing or invalid authentication token');
  const noAuthRes = await fetch(`${BASE_URL}/api/admin/permissions/metadata`);
  assert(noAuthRes.status === 401, `Test J1: Missing token returns HTTP 401 (got ${noAuthRes.status})`);

  const invalidTokenRes = await fetch(`${BASE_URL}/api/admin/permissions/metadata`, {
    headers: { Authorization: 'Bearer totally-invalid-token-12345' },
  });
  assert(invalidTokenRes.status === 401, `Test J2: Invalid token returns HTTP 401 (got ${invalidTokenRes.status})`);

  // Test K: Authenticated user without permission
  console.log('\n[Test K] Authenticated user without permission');
  const noPermRes = await fetch(`${BASE_URL}/api/admin/profit-analytics`, {
    headers: { Authorization: `Bearer ${normalAdminToken}` },
  });
  assert(noPermRes.status === 403, `Test K: Authenticated user lacking report.profit returns HTTP 403 (got ${noPermRes.status})`);

  console.log('\n--- PART 2: ERROR HANDLING & INFORMATION LEAK TESTS ---');

  // Test L: Unexpected Order placement error handling & safe error masking
  console.log('\n[Test L] Order creation error response format');
  // 1. Missing phone number (known validation error -> 400 Bad Request)
  const badOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: { fullName: 'Test', phone: '123' }, // invalid short phone
    }),
  });
  assert(badOrderRes.status === 400, `Validation error returns HTTP 400 (got ${badOrderRes.status})`);
  const badOrderData = await badOrderRes.json();
  assert(badOrderData.success === false, 'Validation response success is false');
  assert(typeof badOrderData.error === 'string', 'Validation response includes helpful error string');
  assert(!badOrderData.error.toLowerCase().includes('sql'), 'Error does not leak SQL');
  assert(!badOrderData.error.toLowerCase().includes('d1'), 'Error does not leak D1 internals');

  // 2. Unexpected 500 error leak test
  // Submit an order with malformed items designed to trigger internal calculation/processing failure
  const malformedOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order: {
        customer: { fullName: 'Test Customer', phone: '01711999888', fullAddress: 'Dhaka, Bangladesh' },
        items: null, // Null items to trigger unexpected server processing
      },
    }),
  });
  // Expect safe error (either 400 validation or 500 server error)
  const malformedData = await malformedOrderRes.json();
  console.log(`  Response status: ${malformedOrderRes.status}, error message: "${malformedData.error}"`);
  assert(
    !malformedData.error?.includes('TypeError') &&
    !malformedData.error?.includes('stack') &&
    !malformedData.error?.includes('sqlite') &&
    !malformedData.error?.includes('d1'),
    'Unexpected error does NOT expose stack traces, TypeError, sqlite, or d1 internals'
  );
  if (malformedOrderRes.status >= 500) {
    assert(
      malformedData.error === 'Unable to place the order right now. Please try again.' ||
      malformedData.error === 'Internal server error.',
      `Unexpected 500 error returns safe generic message (got "${malformedData.error}")`
    );
  }

  // Test M: Legitimate Super Admin authorization and functionality
  console.log('\n--- PART 3: SUPER ADMIN INTEGRITY CHECK ---');
  // Verify Super Admin can still modify Sub Admin permissions
  const validPermUpdateRes = await fetch(`${BASE_URL}/api/users/${otherAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      permissions: {
        'order.view': true,
        'order.status_change': true,
      },
    }),
  });
  assert(validPermUpdateRes.status === 200, `Super Admin legitimately updating Sub Admin permissions returns HTTP 200 (got ${validPermUpdateRes.status})`);
  const validPermData = await validPermUpdateRes.json();
  assert(validPermData.success === true, 'Super Admin permission update success is true');

  console.log('\n====================================================');
  console.log('✅ ALL SECURITY HARDENING TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test execution encountered fatal error:', err);
  process.exit(1);
});
