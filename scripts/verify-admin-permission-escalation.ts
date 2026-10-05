/**
 * Security Verification Script: Admin Permission Escalation Security
 * Tests all 10 security scenarios specified in the brief against http://localhost:3000
 */

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runSecurityTests() {
  console.log('====================================================');
  console.log('STARTING ADMIN PERMISSION ESCALATION SECURITY TESTS');
  console.log('====================================================\n');

  const BASE_URL = 'http://localhost:3000';

  // 0. Ensure dev server is responsive
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert(healthRes.ok, `Dev server reachable (HTTP ${healthRes.status})`);

  // Authenticate as Super Admin
  let superToken = '';
  const superLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin', password: process.env.DEV_ADMIN_PASSWORD || 'admin' }),
  });
  if (superLoginRes.ok) {
    const superData = await superLoginRes.json();
    superToken = superData.token;
  }
  if (!superToken) {
    const errText = await superLoginRes.text().catch(() => '');
    throw new Error(
      `Failed to obtain Super Admin authentication token from /api/auth/login (HTTP ${superLoginRes.status}: ${errText}). Check test environment setup.`
    );
  }
  assert(Boolean(superToken), 'Super Admin token obtained');

  // Fetch users
  const usersRes = await fetch(`${BASE_URL}/api/users`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  assert(usersRes.ok, `Fetched users list (HTTP ${usersRes.status})`);
  const usersJson = await usersRes.json();
  const usersList = usersJson.users || [];

  const superAdminUser = usersList.find((u: any) => u.role === 'super_admin');
  assert(Boolean(superAdminUser), `Identified Super Admin: ${superAdminUser?.email}`);

  // Find or create Normal Admin
  let normalAdminUser = usersList.find((u: any) => u.role === 'admin' && u.email !== superAdminUser?.email);
  if (!normalAdminUser) {
    const createAdminRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Normal Admin Subject',
        email: 'normal-admin-sec@local.test',
        password: 'Password123!',
        role: 'admin',
        permissions: { 'order.view': true, 'product.view': true },
      }),
    });
    const cData = await createAdminRes.json();
    normalAdminUser = cData.user;
  }
  assert(Boolean(normalAdminUser), `Identified Normal Admin: ${normalAdminUser.id}`);

  // Find or create a second Admin/Sub Admin
  let otherAdminUser = usersList.find((u: any) => (u.role === 'admin' || u.role === 'sub_admin') && u.id !== normalAdminUser?.id && u.id !== superAdminUser?.id);
  if (!otherAdminUser) {
    const createOtherRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Other Sub Admin Subject',
        email: 'other-admin-sec@local.test',
        password: 'Password123!',
        role: 'sub_admin',
      }),
    });
    const oData = await createOtherRes.json();
    otherAdminUser = oData.user;
  }
  assert(Boolean(otherAdminUser), `Identified Other Admin/Sub Admin: ${otherAdminUser.id}`);

  // Obtain legitimate Normal Admin token
  let normalAdminToken = '';
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalAdminUser.email, password: 'Password123!' }),
  });
  if (adminLoginRes.ok) {
    const adminData = await adminLoginRes.json();
    normalAdminToken = adminData.token;
  }
  if (!normalAdminToken) {
    const errText = await adminLoginRes.text().catch(() => '');
    throw new Error(
      `Failed to obtain Normal Admin authentication token from /api/auth/login for ${normalAdminUser.email} (HTTP ${adminLoginRes.status}: ${errText}). Check test environment setup.`
    );
  }
  assert(Boolean(normalAdminToken), 'Normal Admin token obtained');

  console.log('\n--- EXECUTING 10 SECURITY TESTS ---');

  // Test 1: Admin modifies own permissions → 403
  console.log('\n[Security Test 1] Admin modifies own permissions');
  // 1a. via PUT /api/admin/users/:id/permissions
  const t1a = await fetch(`${BASE_URL}/api/admin/users/${normalAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_buying_price': true } }),
  });
  assert(t1a.status === 403, `1a. PUT /api/admin/users/:ownId/permissions returns HTTP 403 (got ${t1a.status})`);

  // 1b. via PUT /api/users/:id/permissions
  const t1b = await fetch(`${BASE_URL}/api/users/${normalAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_buying_price': true } }),
  });
  assert(t1b.status === 403, `1b. PUT /api/users/:ownId/permissions returns HTTP 403 (got ${t1b.status})`);

  // 1c. via PUT /api/users/:ownId with injected permissions in body
  const t1c = await fetch(`${BASE_URL}/api/users/${normalAdminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_profit': true } }),
  });
  assert(t1c.status === 403, `1c. PUT /api/users/:ownId with injected permissions returns HTTP 403 (got ${t1c.status})`);

  // Test 2: Admin modifies another Admin → 403
  console.log('\n[Security Test 2] Admin modifies another Admin');
  // 2a. via PUT /api/admin/users/:otherId/permissions
  const t2a = await fetch(`${BASE_URL}/api/admin/users/${otherAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.manage': true } }),
  });
  assert(t2a.status === 403, `2a. PUT /api/admin/users/:otherId/permissions returns HTTP 403 (got ${t2a.status})`);

  // 2b. via PUT /api/users/:otherId
  const t2b = await fetch(`${BASE_URL}/api/users/${otherAdminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Tampered Name' }),
  });
  assert(t2b.status === 403, `2b. PUT /api/users/:otherAdminId returns HTTP 403 (got ${t2b.status})`);

  // 2c. via POST /api/users/:otherId/reset-password
  const t2c = await fetch(`${BASE_URL}/api/users/${otherAdminUser.id}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: 'NewPassword123!' }),
  });
  assert(t2c.status === 403, `2c. POST /api/users/:otherAdminId/reset-password returns HTTP 403 (got ${t2c.status})`);

  // Test 3: Admin modifies Super Admin → 403
  console.log('\n[Security Test 3] Admin modifies Super Admin');
  const t3a = await fetch(`${BASE_URL}/api/admin/users/${superAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view': false } }),
  });
  assert(t3a.status === 403, `3a. PUT /api/admin/users/:superAdminId/permissions returns HTTP 403 (got ${t3a.status})`);

  const t3b = await fetch(`${BASE_URL}/api/users/${superAdminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Tampered Super Admin' }),
  });
  assert(t3b.status === 403, `3b. PUT /api/users/:superAdminId returns HTTP 403 (got ${t3b.status})`);

  const t3c = await fetch(`${BASE_URL}/api/users/${superAdminUser.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${normalAdminToken}` },
  });
  assert(t3c.status === 403, `3c. DELETE /api/users/:superAdminId returns HTTP 403 (got ${t3c.status})`);

  // Test 4: Admin sets own role to super_admin → 403
  console.log('\n[Security Test 4] Admin sets own role to super_admin');
  const t4 = await fetch(`${BASE_URL}/api/users/${normalAdminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assert(t4.status === 403, `4. Setting own role to super_admin returns HTTP 403 (got ${t4.status})`);

  // Test 5: Admin grants self permission.manage → 403
  console.log('\n[Security Test 5] Admin grants self permission.manage');
  const t5 = await fetch(`${BASE_URL}/api/admin/users/${normalAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'permission.manage': true } }),
  });
  assert(t5.status === 403, `5. Granting self permission.manage returns HTTP 403 (got ${t5.status})`);

  // Test 6: Admin grants self settings.manage → 403
  console.log('\n[Security Test 6] Admin grants self settings.manage');
  const t6 = await fetch(`${BASE_URL}/api/admin/users/${normalAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'settings.manage': true } }),
  });
  assert(t6.status === 403, `6. Granting self settings.manage returns HTTP 403 (got ${t6.status})`);

  // Test 7: Admin grants self product.view_profit → 403
  console.log('\n[Security Test 7] Admin grants self product.view_profit');
  const t7 = await fetch(`${BASE_URL}/api/admin/users/${normalAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${normalAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_profit': true } }),
  });
  assert(t7.status === 403, `7. Granting self product.view_profit returns HTTP 403 (got ${t7.status})`);

  // Test 8: Modify localStorage role → no security impact
  console.log('\n[Security Test 8] Modify localStorage role simulation');
  // Client attempts to send request with spoofed role claim in token
  const tokenParts = normalAdminToken.split('.');
  const spoofedPayload = Buffer.from(JSON.stringify({
    userId: normalAdminUser.id,
    email: normalAdminUser.email,
    role: 'super_admin', // Spoofed client-side claim
    exp: Math.floor(Date.now() / 1000) + 86400,
  })).toString('base64url');
  const spoofedRoleToken = `${tokenParts[0] || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'}.${spoofedPayload}.${tokenParts[2] || 'invalidsig'}`;

  const t8a = await fetch(`${BASE_URL}/api/admin/profit-analytics`, {
    headers: { Authorization: `Bearer ${spoofedRoleToken}` },
  });
  assert(t8a.status === 403, `8a. Spoofed token role rejected with HTTP 403 on profit analytics (got ${t8a.status})`);

  const t8b = await fetch(`${BASE_URL}/api/settings`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${spoofedRoleToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteName: 'Hacked Store Name' }),
  });
  assert(t8b.status === 403, `8b. Spoofed token role rejected with HTTP 403 on settings update (got ${t8b.status})`);

  // Test 9: Modify localStorage permissions → no security impact
  console.log('\n[Security Test 9] Modify localStorage permissions simulation');
  // Client tries accessing buying price / profit endpoint using their legitimate admin token
  const t9a = await fetch(`${BASE_URL}/api/products`, {
    headers: { Authorization: `Bearer ${normalAdminToken}` },
  });
  assert(t9a.ok, `9a. Products fetched with admin token (HTTP ${t9a.status})`);
  const t9aJson = await t9a.json();
  const sampleProduct = t9aJson.products?.[0];
  assert(sampleProduct && sampleProduct.buyingPrice === undefined, '9b. Server strips buyingPrice from products for normal admin');
  assert(sampleProduct && sampleProduct.unitProfit === undefined, '9c. Server strips unitProfit from products for normal admin');

  // Test 10: Super Admin permission management → continues working
  console.log('\n[Security Test 10] Super Admin permission management continues working');
  const t10 = await fetch(`${BASE_URL}/api/admin/users/${otherAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      permissions: {
        'order.view': true,
        'order.status_change': true,
      },
    }),
  });
  assert(t10.status === 200, `10a. Super Admin legitimately updating permissions returns HTTP 200 (got ${t10.status})`);
  const t10Data = await t10.json();
  assert(t10Data.success === true, '10b. Super Admin permission update success is true');
  assert(t10Data.permissions?.['order.view'] === true, '10c. Updated permission order.view is true');

  console.log('\n====================================================');
  console.log('✅ ALL 10 SECURITY ESCALATION TESTS PASSED!');
  console.log('====================================================\n');
}

runSecurityTests().catch((err) => {
  console.error('Security test encountered fatal error:', err);
  process.exit(1);
});
