import assert from 'assert';

const BASE_URL = 'http://127.0.0.1:3000';

async function runVerification() {
  console.log('--- STARTING PASSWORD SECURITY VERIFICATION SUITE (MINIMUM 8 CHARACTERS) ---');

  // Test 1: Customer Registration Validation
  console.log('\n[1] Testing Registration Validation:');

  let ipIndex = 1;
  const nextIp = () => `10.200.0.${ipIndex++}`;

  // 1A: 7 characters -> must be rejected (400)
  const reg7Res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
    body: JSON.stringify({
      name: '7 Char Pw User',
      email: `reg7-${Date.now()}@example.com`,
      password: '1234567', // 7 chars (< 8)
    }),
  });
  const reg7Data = await reg7Res.json();
  console.log('7-char registration response:', reg7Res.status, reg7Data);
  assert.strictEqual(reg7Res.status, 400, 'Registration with 7 chars (< 8) must return 400');
  assert.strictEqual(reg7Data.error, 'Password must be at least 8 characters long.');
  console.log('✅ Registration correctly rejected 7 characters password');

  // 1B: 8 characters -> must be accepted (201)
  const reg8Email = `reg8-${Date.now()}@example.com`;
  const reg8Password = '12345678'; // exactly 8 chars
  const reg8Res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
    body: JSON.stringify({
      name: '8 Char Pw User',
      email: reg8Email,
      password: reg8Password,
    }),
  });
  const reg8Data = await reg8Res.json();
  console.log('8-char registration response:', reg8Res.status, reg8Data.success);
  assert.strictEqual(reg8Res.status, 201, 'Registration with 8 chars (>= 8) must return 201');
  assert.strictEqual(reg8Data.success, true);
  console.log('✅ Registration accepted 8 characters password');

  // 1C: 9 characters -> must be accepted (201)
  const reg9Email = `reg9-${Date.now()}@example.com`;
  const reg9Password = '123456789'; // 9 chars
  const reg9Res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
    body: JSON.stringify({
      name: '9 Char Pw User',
      email: reg9Email,
      password: reg9Password,
    }),
  });
  const reg9Data = await reg9Res.json();
  assert.strictEqual(reg9Res.status, 201, 'Registration with 9 chars must return 201');
  assert.strictEqual(reg9Data.success, true);
  console.log('✅ Registration accepted 9 characters password');

  // 1D: 10+ characters -> must be accepted (201)
  const validTestEmail = `reg10plus-${Date.now()}@example.com`;
  const validTestPassword = 'SecurePassword2026!'; // 18 chars
  const regValidRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': nextIp() },
    body: JSON.stringify({
      name: 'Valid 10+ Pw User',
      email: validTestEmail,
      password: validTestPassword,
    }),
  });
  const regValidData = await regValidRes.json();
  assert.strictEqual(regValidRes.status, 201, 'Registration with 10+ chars must return 201');
  assert.strictEqual(regValidData.success, true);
  console.log('✅ Registration accepted 10+ characters password');

  // Test 2: Login with the registered users
  console.log('\n[2] Testing Login:');
  const login8Res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: reg8Email,
      password: reg8Password,
    }),
  });
  const login8Data = await login8Res.json();
  assert.strictEqual(login8Res.status, 200, 'Login with 8 char password must succeed');
  assert.strictEqual(login8Data.success, true);
  const user8Token = login8Data.token;
  console.log('✅ 8-char password user logged in successfully');

  // Test 3: Password Change for logged-in user
  console.log('\n[3] Testing Password Change for logged-in user:');

  // 3A: 7 characters -> rejected (400)
  const change7Res = await fetch(`${BASE_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user8Token}`,
    },
    body: JSON.stringify({
      currentPassword: reg8Password,
      newPassword: 'short99', // 7 chars (< 8)
    }),
  });
  const change7Data = await change7Res.json();
  console.log('7-char password change response:', change7Res.status, change7Data);
  assert.strictEqual(change7Res.status, 400, 'Password change with 7 chars (< 8) must return 400');
  assert.strictEqual(change7Data.error, 'New password must be at least 8 characters long.');
  console.log('✅ Password change correctly rejected 7 characters password');

  // 3B: 8 characters -> accepted (200)
  const change8Res = await fetch(`${BASE_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user8Token}`,
    },
    body: JSON.stringify({
      currentPassword: reg8Password,
      newPassword: 'newpass8', // 8 chars
    }),
  });
  const change8Data = await change8Res.json();
  assert.strictEqual(change8Res.status, 200, 'Password change with 8 chars must return 200');
  assert.strictEqual(change8Data.success, true);
  console.log('✅ Password change accepted 8 characters password');

  // Verify login with new 8-char password
  const loginChanged8Res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: reg8Email,
      password: 'newpass8',
    }),
  });
  const loginChanged8Data = await loginChanged8Res.json();
  assert.strictEqual(loginChanged8Res.status, 200);
  assert.strictEqual(loginChanged8Data.success, true);
  const updatedUserToken = loginChanged8Data.token;
  console.log('✅ Login with updated 8-char password succeeded');

  // 3C: 9 characters -> accepted (200)
  const change9Res = await fetch(`${BASE_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${updatedUserToken}`,
    },
    body: JSON.stringify({
      currentPassword: 'newpass8',
      newPassword: 'newpass09', // 9 chars
    }),
  });
  const change9Data = await change9Res.json();
  assert.strictEqual(change9Res.status, 200, 'Password change with 9 chars must return 200');
  assert.strictEqual(change9Data.success, true);
  console.log('✅ Password change accepted 9 characters password');

  // Log in with new 9-char password to obtain fresh token (session invalidation check)
  const loginChanged9Res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: reg8Email,
      password: 'newpass09',
    }),
  });
  const loginChanged9Data = await loginChanged9Res.json();
  assert.strictEqual(loginChanged9Res.status, 200);
  const userToken9 = loginChanged9Data.token;

  // 3D: 10+ characters -> accepted (200)
  const updatedPassword = 'NewSuperStrongPassword2026!'; // 27 chars
  const change10PlusRes = await fetch(`${BASE_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken9}`,
    },
    body: JSON.stringify({
      currentPassword: 'newpass09',
      newPassword: updatedPassword,
    }),
  });
  const change10PlusData = await change10PlusRes.json();
  assert.strictEqual(change10PlusRes.status, 200, 'Password change with 10+ chars must return 200');
  assert.strictEqual(change10PlusData.success, true);
  console.log('✅ Password change accepted 10+ characters password');

  // Test 4: Password Reset API Validation
  console.log('\n[4] Testing Password Reset API Validation:');

  // 4A: 7 characters -> rejected (400)
  const reset7Res = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'some-dummy-token-for-test',
      newPassword: '1234567', // 7 chars
    }),
  });
  const reset7Data = await reset7Res.json();
  console.log('7-char reset password response:', reset7Res.status, reset7Data);
  assert.strictEqual(reset7Res.status, 400);
  assert.strictEqual(reset7Data.status, 'INVALID_PASSWORD');
  assert.strictEqual(reset7Data.message, 'New password must be at least 8 characters long.');
  console.log('✅ Password reset correctly rejected 7 characters password');

  // 4B: 8 characters -> validation passes (token error occurs next, NOT INVALID_PASSWORD)
  const reset8Res = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'dummy-token-000000000000000000000000000000000000000000000000000000000000',
      newPassword: 'resetpw8', // 8 chars
    }),
  });
  const reset8Data = await reset8Res.json();
  assert.notStrictEqual(reset8Data.status, 'INVALID_PASSWORD', '8 chars must not fail password length validation');
  console.log('✅ Password reset accepted 8 characters password (passed password policy check)');

  // Test 5: Admin Login and Admin Account Operations
  console.log('\n[5] Testing Super Admin Login and Operations:');
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'dev-superadmin@local.test',
      password: process.env.DEV_ADMIN_PASSWORD || 'admin',
    }),
  });
  const adminLoginData = await adminLoginRes.json();
  assert.strictEqual(adminLoginRes.status, 200, 'Admin login must succeed');
  const adminToken = adminLoginData.token;
  console.log('✅ Admin login succeeded');

  // Test 6: Admin creating a user account with passwords: 7, 8, 9, 10+ chars
  console.log('\n[6] Testing Admin Account Creation with Password:');

  // 6A: 7 characters -> rejected (400)
  const adminCreate7Res = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: 'Staff With 7 Char Password',
      email: `staff-7-${Date.now()}@example.com`,
      password: '1234567', // 7 chars
      role: 'sub_admin',
    }),
  });
  const adminCreate7Data = await adminCreate7Res.json();
  console.log('Admin create 7-char pw response:', adminCreate7Res.status, adminCreate7Data);
  assert.strictEqual(adminCreate7Res.status, 400, 'Admin user creation with 7 chars must return 400');
  assert.strictEqual(adminCreate7Data.error, 'Password must be at least 8 characters long.');
  console.log('✅ Admin user creation correctly rejected 7 characters password');

  // 6B: 8 characters -> accepted (201)
  const staff8Email = `staff-8-${Date.now()}@example.com`;
  const adminCreate8Res = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: 'Staff With 8 Char Password',
      email: staff8Email,
      password: 'staffpw8', // 8 chars
      role: 'sub_admin',
    }),
  });
  const adminCreate8Data = await adminCreate8Res.json();
  assert.strictEqual(adminCreate8Res.status, 201, 'Admin user creation with 8 chars must return 201');
  assert.strictEqual(adminCreate8Data.success, true);
  const createdStaff8Id = adminCreate8Data.user.id;
  console.log('✅ Admin user creation accepted 8 characters password');

  // 6C: 9 characters -> accepted (201)
  const adminCreate9Res = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: 'Staff With 9 Char Password',
      email: `staff-9-${Date.now()}@example.com`,
      password: 'staffpw09', // 9 chars
      role: 'sub_admin',
    }),
  });
  const adminCreate9Data = await adminCreate9Res.json();
  assert.strictEqual(adminCreate9Res.status, 201, 'Admin user creation with 9 chars must return 201');
  assert.strictEqual(adminCreate9Data.success, true);
  console.log('✅ Admin user creation accepted 9 characters password');

  // 6D: 10+ characters -> accepted (201)
  const staffPassword10Plus = 'StaffMasterPassword2026!'; // 24 chars
  const adminCreate10Res = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: 'Staff With 10+ Char Password',
      email: `staff-10plus-${Date.now()}@example.com`,
      password: staffPassword10Plus,
      role: 'sub_admin',
    }),
  });
  const adminCreate10Data = await adminCreate10Res.json();
  assert.strictEqual(adminCreate10Res.status, 201, 'Admin user creation with 10+ chars must return 201');
  assert.strictEqual(adminCreate10Data.success, true);
  console.log('✅ Admin user creation accepted 10+ characters password');

  // Test 7: Admin resetting user password
  console.log('\n[7] Testing Admin Resetting User Password:');

  // 7A: 7 characters -> rejected (400)
  const adminReset7Res = await fetch(`${BASE_URL}/api/users/${encodeURIComponent(createdStaff8Id)}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      newPassword: 'short99', // 7 chars
    }),
  });
  const adminReset7Data = await adminReset7Res.json();
  console.log('Admin reset 7-char pw response:', adminReset7Res.status, adminReset7Data);
  assert.strictEqual(adminReset7Res.status, 400);
  assert.strictEqual(adminReset7Data.error, 'New password must be at least 8 characters long.');
  console.log('✅ Admin user password reset correctly rejected 7 characters password');

  // 7B: 8 characters -> accepted (200)
  const adminReset8Res = await fetch(`${BASE_URL}/api/users/${encodeURIComponent(createdStaff8Id)}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      newPassword: 'newreset8', // 8 chars
    }),
  });
  const adminReset8Data = await adminReset8Res.json();
  assert.strictEqual(adminReset8Res.status, 200);
  assert.strictEqual(adminReset8Data.success, true);
  console.log('✅ Admin user password reset accepted 8 characters password');

  // 7C: 9 characters -> accepted (200)
  const adminReset9Res = await fetch(`${BASE_URL}/api/users/${encodeURIComponent(createdStaff8Id)}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      newPassword: 'newreset09', // 9 chars
    }),
  });
  const adminReset9Data = await adminReset9Res.json();
  assert.strictEqual(adminReset9Res.status, 200);
  assert.strictEqual(adminReset9Data.success, true);
  console.log('✅ Admin user password reset accepted 9 characters password');

  // 7D: 10+ characters -> accepted (200)
  const adminReset10PlusRes = await fetch(`${BASE_URL}/api/users/${encodeURIComponent(createdStaff8Id)}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      newPassword: 'SuperStaffResetPassword2026!', // 28 chars
    }),
  });
  const adminReset10PlusData = await adminReset10PlusRes.json();
  assert.strictEqual(adminReset10PlusRes.status, 200);
  assert.strictEqual(adminReset10PlusData.success, true);
  console.log('✅ Admin user password reset accepted 10+ characters password');

  console.log('\n--- ALL PASSWORD SECURITY VERIFICATIONS PASSED SUCCESSFULLY (MINIMUM 8 CHARACTERS) ---');
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
