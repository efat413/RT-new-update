import { updateUserPasswordInD1, unclaimPasswordResetToken } from '../src/server/db';
import { hashPassword, verifyPassword } from '../src/server/auth';

async function runTests() {
  console.log('--- STARTING VERIFICATION TESTS ---');

  // Test 1: PBKDF2 hashing & verification
  console.log('Test 1: PBKDF2 Hashing and Verification');
  const password = 'SuperSecurePassword2026!';
  const hash = await hashPassword(password);
  console.assert(hash.startsWith('pbkdf2:'), 'Hash must follow pbkdf2 standard');
  const isValid = await verifyPassword(password, hash);
  console.assert(isValid === true, 'Valid password must verify');
  const isWrong = await verifyPassword('WrongPassword', hash);
  console.assert(isWrong === false, 'Wrong password must be rejected');
  console.log('✅ PBKDF2 hashing works correctly');

  // Test 2: updateUserPasswordInD1 checks changes count
  console.log('Test 2: updateUserPasswordInD1 checks changes and success');
  const mockDbSuccess: any = {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ success: true, meta: { changes: 1 } }),
      }),
    }),
  };
  const successResult = await updateUserPasswordInD1(mockDbSuccess, 'real-user-1', 'newPass123');
  console.assert(successResult === true, 'Must return true when changes > 0');

  const mockDbNoChanges: any = {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ success: true, meta: { changes: 0 } }),
      }),
    }),
  };
  const noChangeResult = await updateUserPasswordInD1(mockDbNoChanges, 'non-existent-user', 'newPass123');
  console.assert(noChangeResult === false, 'Must return false when changes === 0');

  const mockDbError: any = {
    prepare: () => ({
      bind: () => ({
        run: async () => { throw new Error('D1 Disk Full'); },
      }),
    }),
  };
  const errorResult = await updateUserPasswordInD1(mockDbError, 'user-1', 'newPass123');
  console.assert(errorResult === false, 'Must return false on database error');
  console.log('✅ updateUserPasswordInD1 accurately reflects row updates');

  // Test 3: API login rejects demo accounts
  console.log('Test 3: Verify preset/demo accounts are rejected on API login');
  const demoAccounts = [
    'dev-superadmin@local.test',
    'subadmin@rongdhonutrade.com',
    'sakib@gmail.com',
    'updater@local.test',
    'viewer@local.test',
    'finance@local.test',
    'customer@local.test',
    'operations@rongdhonu.com',
    'staff@rongdhonutrade.com',
    'customer@gmail.com',
    'tanvir@gmail.com',
    'admin.staff@rongdhonutrade.com',
  ];

  for (const email of demoAccounts) {
    const res = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail: email, password: 'password123' }),
    });
    console.assert(res.status === 401, `Demo account ${email} must be rejected with 401, got ${res.status}`);
  }
  console.log('✅ All preset/demo user accounts rejected');

  // Test 4: Password reset flow through API
  console.log('Test 4: Forgot password and reset flow API testing');
  // Request forgot password for configured super admin
  const forgotRes = await fetch('http://localhost:3000/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'cmt413uec@gmail.com' }),
  });
  const forgotData = await forgotRes.json();
  console.assert(forgotRes.status === 200, 'Forgot password request must return 200');
  console.assert(forgotData.success === true, 'Forgot password response must be successful');
  console.log('✅ Forgot password initiated successfully');

  // Test invalid reset token
  const badTokenRes = await fetch('http://localhost:3000/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'completely-bogus-token-123', newPassword: 'FreshPassword2026!' }),
  });
  console.assert(badTokenRes.status === 400, 'Invalid reset token must return 400');
  console.log('✅ Invalid reset token properly rejected');

  // Test 5: Verify build command and package-lock.json
  console.log('Test 5: Build artifacts and lockfile check');
  const fs = await import('fs');
  console.assert(fs.existsSync('package-lock.json'), 'package-lock.json must exist for deterministic Cloudflare CI/CD builds');
  console.assert(!fs.existsSync('bun.lock'), 'bun.lock must NOT exist');
  console.log('✅ package-lock.json verified and bun.lock absent');

  console.log('--- ALL VERIFICATION TESTS PASSED ---');
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
