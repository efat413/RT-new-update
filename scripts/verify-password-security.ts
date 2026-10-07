import assert from 'assert';

const BASE_URL = 'http://127.0.0.1:3000';

async function runVerification() {
  console.log('--- STARTING PASSWORD SECURITY VERIFICATION SUITE ---');

  // Test 1: Customer Registration Validation
  console.log('\n[1] Testing Registration Validation:');
  const regShortRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Short Pw User',
      email: `shortpw-${Date.now()}@example.com`,
      password: '12345678', // 8 chars (less than 10)
    }),
  });
  const regShortData = await regShortRes.json();
  console.log('Short registration response:', regShortRes.status, regShortData);
  assert.strictEqual(regShortRes.status, 400, 'Registration with < 10 chars must return 400');
  assert.strictEqual(regShortData.error, 'Password must be at least 10 characters long.');
  console.log('✅ Registration correctly rejected password shorter than 10 characters');

  const validTestEmail = `validpw-${Date.now()}@example.com`;
  const validTestPassword = 'SecurePassword2026!';
  const regValidRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Valid Pw User',
      email: validTestEmail,
      password: validTestPassword,
    }),
  });
  const regValidData = await regValidRes.json();
  console.log('Valid registration response:', regValidRes.status, regValidData.success);
  assert.strictEqual(regValidRes.status, 201, 'Registration with >= 10 chars must succeed with 201');
  assert.strictEqual(regValidData.success, true);
  console.log('✅ Registration succeeded with >= 10 characters');

  // Test 2: Login with the newly registered user
  console.log('\n[2] Testing Login with newly registered user:');
  const loginNewRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: validTestEmail,
      password: validTestPassword,
    }),
  });
  const loginNewData = await loginNewRes.json();
  assert.strictEqual(loginNewRes.status, 200, 'Login must succeed with 200');
  assert.strictEqual(loginNewData.success, true);
  const newUserToken = loginNewData.token;
  console.log('✅ New account logged in successfully');

  // Test 3: Password Change for logged-in user
  console.log('\n[3] Testing Password Change for logged-in user:');
  const changeShortRes = await fetch(`${BASE_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${newUserToken}`,
    },
    body: JSON.stringify({
      currentPassword: validTestPassword,
      newPassword: 'short99', // 7 chars
    }),
  });
  const changeShortData = await changeShortRes.json();
  console.log('Short password change response:', changeShortRes.status, changeShortData);
  assert.strictEqual(changeShortRes.status, 400, 'Password change with < 10 chars must return 400');
  assert.strictEqual(changeShortData.error, 'New password must be at least 10 characters long.');
  console.log('✅ Password change correctly rejected password shorter than 10 characters');

  const updatedPassword = 'NewSuperStrongPassword2026!';
  const changeValidRes = await fetch(`${BASE_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${newUserToken}`,
    },
    body: JSON.stringify({
      currentPassword: validTestPassword,
      newPassword: updatedPassword,
    }),
  });
  const changeValidData = await changeValidRes.json();
  assert.strictEqual(changeValidRes.status, 200, 'Password change with >= 10 chars must return 200');
  assert.strictEqual(changeValidData.success, true);
  console.log('✅ Password change succeeded with >= 10 characters');

  // Verify login with updated password
  const loginUpdatedRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: validTestEmail,
      password: updatedPassword,
    }),
  });
  const loginUpdatedData = await loginUpdatedRes.json();
  assert.strictEqual(loginUpdatedRes.status, 200);
  assert.strictEqual(loginUpdatedData.success, true);
  console.log('✅ Login with updated password succeeded');

  // Test 4: Password Reset API Validation
  console.log('\n[4] Testing Password Reset API Validation:');
  const resetShortRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'some-dummy-token-for-test',
      newPassword: 'short', // 5 chars
    }),
  });
  const resetShortData = await resetShortRes.json();
  console.log('Short reset password response:', resetShortRes.status, resetShortData);
  assert.strictEqual(resetShortRes.status, 400);
  assert.strictEqual(resetShortData.status, 'INVALID_PASSWORD');
  assert.strictEqual(resetShortData.message, 'New password must be at least 10 characters long.');
  console.log('✅ Password reset correctly rejected new password shorter than 10 characters');

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
  console.log('✅ Admin login succeeded (preserving existing admin credentials)');

  // Test 6: Admin creating a user account with short password
  console.log('\n[6] Testing Admin Account Creation with Password:');
  const adminCreateShortRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: 'Staff With Short Password',
      email: `staff-short-${Date.now()}@example.com`,
      password: 'short-pw', // 8 chars
      role: 'sub_admin',
    }),
  });
  const adminCreateShortData = await adminCreateShortRes.json();
  console.log('Admin create short pw response:', adminCreateShortRes.status, adminCreateShortData);
  assert.strictEqual(adminCreateShortRes.status, 400, 'Admin account creation with short password must return 400');
  assert.strictEqual(adminCreateShortData.error, 'Password must be at least 10 characters long.');
  console.log('✅ Admin user creation correctly rejected password shorter than 10 characters');

  // Test 7: Admin creating user account with valid >= 10 char password
  const staffEmail = `staff-valid-${Date.now()}@example.com`;
  const staffPassword = 'StaffMasterPassword2026!';
  const adminCreateValidRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name: 'Staff With Valid Password',
      email: staffEmail,
      password: staffPassword,
      role: 'sub_admin',
    }),
  });
  const adminCreateValidData = await adminCreateValidRes.json();
  assert.strictEqual(adminCreateValidRes.status, 201, 'Admin account creation with valid password must return 201');
  assert.strictEqual(adminCreateValidData.success, true);
  const createdStaffId = adminCreateValidData.user.id;
  console.log('✅ Admin user creation succeeded with >= 10 characters password');

  // Test 8: Admin resetting user password
  console.log('\n[8] Testing Admin Resetting User Password:');
  const adminResetShortRes = await fetch(`${BASE_URL}/api/users/${encodeURIComponent(createdStaffId)}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      newPassword: 'short', // 5 chars
    }),
  });
  const adminResetShortData = await adminResetShortRes.json();
  console.log('Admin reset short pw response:', adminResetShortRes.status, adminResetShortData);
  assert.strictEqual(adminResetShortRes.status, 400);
  assert.strictEqual(adminResetShortData.error, 'New password must be at least 10 characters long.');
  console.log('✅ Admin user password reset correctly rejected password shorter than 10 characters');

  const staffResetPassword = 'StaffResetSecurePassword2026!';
  const adminResetValidRes = await fetch(`${BASE_URL}/api/users/${encodeURIComponent(createdStaffId)}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      newPassword: staffResetPassword,
    }),
  });
  const adminResetValidData = await adminResetValidRes.json();
  assert.strictEqual(adminResetValidRes.status, 200);
  assert.strictEqual(adminResetValidData.success, true);
  console.log('✅ Admin user password reset succeeded with >= 10 characters password');

  console.log('\n--- ALL PASSWORD SECURITY VERIFICATIONS PASSED SUCCESSFULLY ---');
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
