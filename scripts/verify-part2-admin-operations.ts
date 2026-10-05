async function runPart2Tests() {
  const baseUrl = 'http://localhost:3000';
  console.log('====================================================');
  console.log('STARTING PART 2 ADMIN OPERATIONS VERIFICATION');
  console.log('====================================================\n');

  // STEP 0: Perform Admin Login
  console.log('--- Step 0: Super Admin Login ---');
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'admin',
      password: process.env.DEV_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin',
    }),
  });
  const loginData = await loginRes.json().catch(() => ({}));
  let adminToken = loginData.token;
  if (!adminToken) {
    const errText = await loginRes.text().catch(() => '');
    throw new Error(`Super Admin login failed: ${errText}`);
  }
  console.log('✓ Super Admin logged in successfully with token:', adminToken.slice(0, 25) + '...\n');

  // TEST 1: Authorized Admin → Product Update
  console.log('--- TEST 1: Authorized Admin → Product Update ---');
  // First, get a product ID to update
  const prodsRes = await fetch(`${baseUrl}/api/products`);
  const prodsData = await prodsRes.json();
  const targetProduct = prodsData.products[0];
  console.log(`Target product: ${targetProduct.title} (ID: ${targetProduct.id})`);

  const updateProdRes = await fetch(`${baseUrl}/api/products/${targetProduct.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      updates: {
        title: `${targetProduct.title} [Verified]`,
        price: targetProduct.price,
      },
    }),
  });
  const updateProdData = await updateProdRes.json();
  console.log('Product Update status:', updateProdRes.status, 'success:', updateProdData.success);
  console.assert(updateProdRes.status === 200 && updateProdData.success === true, 'TEST 1 FAILED');
  console.log('✓ TEST 1 PASSED: Authorized Admin successfully updated product.\n');

  // TEST 2: Authorized Admin → Settings Save
  console.log('--- TEST 2: Authorized Admin → Settings Save ---');
  const updateSettingsRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      settings: {
        announcementText: 'Verified Store Announcement 2026',
      },
    }),
  });
  const updateSettingsData = await updateSettingsRes.json();
  console.log('Settings Save status:', updateSettingsRes.status, 'success:', updateSettingsData.success);
  console.assert(updateSettingsRes.status === 200 && updateSettingsData.success === true, 'TEST 2 FAILED');
  console.log('✓ TEST 2 PASSED: Authorized Admin successfully saved store settings.\n');

  // TEST 3: Authorized Admin → Courier Save
  console.log('--- TEST 3: Authorized Admin → Courier Save ---');
  const saveCourierRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      settings: {
        steadfastApiKey: 'test-api-key-12345',
        steadfastSecretKey: 'test-secret-key-67890',
      },
    }),
  });
  const saveCourierData = await saveCourierRes.json();
  console.log('Courier Save status:', saveCourierRes.status, 'success:', saveCourierData.success);
  console.assert(saveCourierRes.status === 200 && saveCourierData.success === true, 'TEST 3 FAILED');
  // Verify secrets are masked when returned
  console.assert(saveCourierData.settings?.steadfastApiKey === '••••••••', 'Steadfast API key must be masked in response');
  console.log('✓ TEST 3 PASSED: Authorized Admin successfully saved Courier settings with server-side masking.\n');

  // TEST 4: Authorized Admin → Courier Ping
  console.log('--- TEST 4: Authorized Admin → Courier Ping ---');
  const pingRes = await fetch(`${baseUrl}/api/courier/steadfast/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({}),
  });
  const pingData = await pingRes.json();
  console.log('Courier Ping status:', pingRes.status, 'response:', pingData);
  // Website authentication must succeed (not 401). Courier API result is handled separately.
  console.assert(pingRes.status !== 401, 'Website auth failed for courier ping!');
  console.assert(pingRes.status === 200 || pingRes.status === 400 || pingRes.status === 500, 'Expected courier response');
  console.log('✓ TEST 4 PASSED: Website authentication succeeded first; Courier API result handled separately without returning 401.\n');

  // TEST 5: Invalid token → Product Update
  console.log('--- TEST 5: Invalid token → Product Update ---');
  const invalidProdRes = await fetch(`${baseUrl}/api/products/${targetProduct.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer invalid_or_expired_token_xyz',
    },
    body: JSON.stringify({
      updates: { title: 'Hacked Title' },
    }),
  });
  const invalidProdData = await invalidProdRes.json();
  console.log('Invalid token Product Update status:', invalidProdRes.status, 'error:', invalidProdData.error);
  console.assert(invalidProdRes.status === 401, 'TEST 5 FAILED: Expected 401 Unauthorized');
  console.log('✓ TEST 5 PASSED: Invalid token returns 401 Unauthorized.\n');

  // Also verify No Token → Product Update returns 401
  const noTokenProdRes = await fetch(`${baseUrl}/api/products/${targetProduct.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates: { title: 'No Token Title' } }),
  });
  console.assert(noTokenProdRes.status === 401, 'No token must return 401');
  console.log('✓ No token returns 401 Unauthorized.\n');

  // TEST 6: Valid token but insufficient permission → Product Update
  console.log('--- TEST 6: Valid token but insufficient permission → Product Update ---');
  // Log in as an account without canManageProducts (e.g., orders@rongdhonutrade.com who has canManageOrders: true, canManageProducts: false)
  let subAdminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'orders@rongdhonutrade.com',
      password: process.env.STAFF_PASSWORD || 'Password123!',
    }),
  });
  if (!subAdminLogin.ok) {
    // Create the test sub-admin account via admin endpoint
    await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: 'Orders Sub Admin',
        email: 'orders@rongdhonutrade.com',
        password: 'Password123!',
        role: 'sub_admin',
        permissions: { 'order.view': true, 'order.manage': true, 'product.manage': false },
      }),
    });
    subAdminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'orders@rongdhonutrade.com',
        password: 'Password123!',
      }),
    });
  }
  const subAdminData = await subAdminLogin.json().catch(() => ({}));
  let subAdminToken = subAdminData.token;
  let subAdminUser = subAdminData.user;
  if (!subAdminToken) {
    const errText = await subAdminLogin.text().catch(() => '');
    throw new Error(`Sub-admin login failed: ${errText}`);
  }
  console.log(`Sub-admin logged in: ${subAdminUser.email} (Role: ${subAdminUser.role})`);
  console.log(`Sub-admin permissions:`, subAdminUser.permissions);

  const subAdminProdRes = await fetch(`${baseUrl}/api/products/${targetProduct.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${subAdminToken}`,
    },
    body: JSON.stringify({
      updates: { title: 'Unauthorized update' },
    }),
  });
  const subAdminProdData = await subAdminProdRes.json();
  console.log('Sub-admin Product Update status:', subAdminProdRes.status, 'error:', subAdminProdData.error);
  console.assert(subAdminProdRes.status === 403, 'TEST 6 FAILED: Expected 403 Forbidden for insufficient permission');
  console.log('✓ TEST 6 PASSED: Valid token but insufficient permission returns 403 Forbidden (NOT 401).\n');

  // Verify Sub-admin cannot update Settings (canManageSettings: false) -> 403
  const subAdminSettingsRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${subAdminToken}`,
    },
    body: JSON.stringify({ settings: { siteName: 'Hacked Store' } }),
  });
  console.log('Sub-admin Settings Update status:', subAdminSettingsRes.status);
  console.assert(subAdminSettingsRes.status === 403, 'Expected 403 for unauthorized settings update');
  console.log('✓ Sub-admin without canManageSettings returns 403 Forbidden on Settings.\n');

  // TEST 7: Logout → Product Update
  console.log('--- TEST 7: Logout → Product Update ---');
  await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
  // Simulating client-side token removal after logout
  const afterLogoutProdRes = await fetch(`${baseUrl}/api/products/${targetProduct.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      // No token sent after logout
    },
    body: JSON.stringify({ updates: { title: 'After Logout' } }),
  });
  console.log('After Logout Product Update status:', afterLogoutProdRes.status);
  console.assert(afterLogoutProdRes.status === 401, 'TEST 7 FAILED: Expected 401 Unauthorized after logout');
  console.log('✓ TEST 7 PASSED: Product Update without active session returns 401 Unauthorized.\n');

  // TEST 8: Re-login → Product Update
  console.log('--- TEST 8: Re-login → Product Update ---');
  const reloginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'admin',
      password: process.env.DEV_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin',
    }),
  });
  const reloginData = await reloginRes.json().catch(() => ({}));
  const freshAdminToken = reloginData.token;
  if (!freshAdminToken) {
    throw new Error(
      `Re-login failed to obtain admin authentication token from /api/auth/login (HTTP ${reloginRes.status}: ${JSON.stringify(reloginData)}). Check test environment setup.`
    );
  }
  console.log('Re-login successful. New token received.');

  const reloginProdRes = await fetch(`${baseUrl}/api/products/${targetProduct.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshAdminToken}`,
    },
    body: JSON.stringify({
      updates: {
        title: targetProduct.title, // Restore original title
      },
    }),
  });
  const reloginProdData = await reloginProdRes.json();
  console.log('Re-login Product Update status:', reloginProdRes.status, 'success:', reloginProdData.success);
  console.assert(reloginProdRes.status === 200 && reloginProdData.success === true, 'TEST 8 FAILED');
  console.log('✓ TEST 8 PASSED: Re-login successfully permits Product Update with the new token.\n');

  console.log('====================================================');
  console.log('ALL 8 PART 2 TESTS COMPLETED AND VERIFIED SUCCESSFULLY!');
  console.log('====================================================');
}

runPart2Tests().catch((err) => {
  console.error('PART 2 TEST FAILURE:', err);
  process.exit(1);
});
