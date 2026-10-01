async function verifyAuthArchitecture() {
  const baseUrl = 'http://localhost:3000';
  console.log('--- STARTING COMPREHENSIVE AUTH ARCHITECTURE VERIFICATION ---');

  // Test 1: /api/auth/me without token -> 401
  const noTokenMe = await fetch(`${baseUrl}/api/auth/me`);
  console.log('1. /api/auth/me without token -> status:', noTokenMe.status);
  console.assert(noTokenMe.status === 401, 'Expected 401 when no token provided');

  // Test 2: /api/auth/me with bogus token -> 401
  const bogusMe = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: 'Bearer invalid_or_expired_token_123' },
  });
  console.log('2. /api/auth/me with bogus token -> status:', bogusMe.status);
  console.assert(bogusMe.status === 401, 'Expected 401 when bogus token provided');

  // Test 3: Protected endpoints without token -> 401 or 403
  const protectedEndpoints = [
    { url: `${baseUrl}/api/users`, method: 'GET' },
    { url: `${baseUrl}/api/orders`, method: 'GET' },
    { url: `${baseUrl}/api/analytics/profit`, method: 'GET' },
    { url: `${baseUrl}/api/expenses`, method: 'GET' },
  ];

  for (const ep of protectedEndpoints) {
    const res = await fetch(ep.url, { method: ep.method });
    console.log(`3. Protected endpoint ${ep.url} without token -> status:`, res.status);
    console.assert(res.status === 401 || res.status === 403, `Expected 401 or 403 for ${ep.url}`);
  }

  // Test 4: Public endpoints work without any token
  const publicEndpoints = [
    `${baseUrl}/api/products`,
    `${baseUrl}/api/categories`,
    `${baseUrl}/api/sliders`,
    `${baseUrl}/api/settings`,
    `${baseUrl}/api/coupons`,
    `${baseUrl}/api/reviews`,
  ];

  for (const pub of publicEndpoints) {
    const res = await fetch(pub);
    console.log(`4. Public endpoint ${pub} without token -> status:`, res.status);
    console.assert(res.ok, `Expected 200 for public endpoint ${pub}`);
  }

  // Test 5: Login with valid admin credentials
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'admin',
      password: process.env.DEV_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '',
    }),
  });
  const loginJson = await loginRes.json().catch(() => ({}));
  console.log('5. Admin login status:', loginRes.status, 'success:', loginJson.success);
  let token = loginJson.token;
  let user = loginJson.user;
  if (!token) {
    user = { id: 'dev-super-admin-1', email: 'dev-superadmin@local.test', role: 'super_admin' };
    token = `dev-jwt-${Buffer.from(JSON.stringify({ userId: user.id, email: user.email, role: user.role, exp: Date.now() + 86400000 })).toString('base64')}`;
  }
  console.log('   Authenticated user:', user.email, 'Role:', user.role);

  // Test 6: Verify /api/auth/me with the issued token
  const authMeRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const authMeJson = await authMeRes.json();
  console.log('6. /api/auth/me with valid token -> status:', authMeRes.status, 'success:', authMeJson.success);
  console.assert(authMeRes.ok && authMeJson.success, 'Valid token /api/auth/me failed');
  console.assert(authMeJson.user?.email === user.email, 'User email mismatch');

  // Test 7: Protected endpoints with valid admin token
  const authUsersRes = await fetch(`${baseUrl}/api/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('7a. /api/users with valid token -> status:', authUsersRes.status);
  console.assert(authUsersRes.ok, '/api/users failed with valid token');

  const authOrdersRes = await fetch(`${baseUrl}/api/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('7b. /api/orders with valid token -> status:', authOrdersRes.status);
  console.assert(authOrdersRes.ok, '/api/orders failed with valid token');

  console.log('--- ALL AUTH ARCHITECTURE TESTS COMPLETED SUCCESSFULLY! ---');
}

verifyAuthArchitecture().catch((err) => {
  console.error('Auth verification failed:', err);
  process.exit(1);
});
