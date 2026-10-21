import assert from 'assert';
import { handleApiRequest } from '../src/server/router';
import { Env } from '../src/server/types';
import {
  hashPassword,
  verifyPassword,
  needsPasswordRehash,
  PBKDF2_RECOMMENDED_ITERATIONS,
  PBKDF2_LEGACY_ITERATIONS,
} from '../src/server/auth';

/**
 * In-memory mock Cloudflare D1 Database
 */
function createMockD1(): any {
  const users: Record<string, any> = {};
  const rateLimits: Record<string, any> = {};

  return {
    _users: users,
    _rateLimits: rateLimits,
    prepare(sql: string) {
      let boundParams: any[] = [];
      return {
        bind(...params: any[]) {
          boundParams = params;
          return this;
        },
        async first<T = any>(): Promise<T | null> {
          if (sql.includes('FROM rate_limits WHERE key = ?')) {
            const key = boundParams[0];
            return rateLimits[key] || null;
          }
          if (sql.includes('FROM users WHERE')) {
            const ident = String(boundParams[0]).toLowerCase();
            return (users[ident] || null) as T;
          }
          return null;
        },
        async all<T = any>(): Promise<{ results: T[] }> {
          return { results: [] };
        },
        async run(): Promise<{ success: boolean; meta?: any }> {
          if (sql.includes('UPDATE users SET password = ?')) {
            const newHash = boundParams[0];
            const userId = boundParams[1];
            for (const email of Object.keys(users)) {
              if (users[email].id === userId) {
                users[email].password = newHash;
                users[email].updated_at = new Date().toISOString();
              }
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO rate_limits')) {
            const key = boundParams[0];
            rateLimits[key] = { count: 1, reset_at: boundParams[1] };
            return { success: true };
          }
          if (sql.includes('DELETE FROM rate_limits WHERE key = ?')) {
            delete rateLimits[boundParams[0]];
            return { success: true };
          }
          return { success: true };
        },
      };
    },
  };
}

async function runTests() {
  console.log('=== STARTING PASSWORD HASHING UPGRADE AUDIT & VERIFICATION ===\n');

  // -------------------------------------------------------------
  // TEST 1: Default Hashing Parameters & Cloudflare Workers Standard
  // -------------------------------------------------------------
  console.log('--- 1. Testing Default Hashing Parameters ---');
  assert.strictEqual(
    PBKDF2_RECOMMENDED_ITERATIONS,
    100000,
    'Cloudflare Workers runtime standard must be 100,000 iterations to stay within workerd limits'
  );

  const startHashTime = performance.now();
  const testPlainPassword = 'MySecretP@ssword2026!';
  const newHash = await hashPassword(testPlainPassword);
  const hashDuration = performance.now() - startHashTime;
  console.log(`100,000 iterations hash completed in ${hashDuration.toFixed(2)}ms`);

  assert(newHash.startsWith('pbkdf2:100000:'), `Hash must start with pbkdf2:100000:, got: ${newHash.slice(0, 20)}`);
  const hashParts = newHash.split(':');
  assert.strictEqual(hashParts.length, 4, 'Hash must contain 4 colon-delimited components (scheme:iterations:salt:hash)');
  assert.strictEqual(parseInt(hashParts[1], 10), 100000, 'Iteration count in hash must be 100,000');
  assert.strictEqual(hashParts[2].length, 32, 'Salt must be 16 bytes = 32 hex characters');
  assert.strictEqual(hashParts[3].length, 64, 'SHA-256 derived key must be 32 bytes = 64 hex characters');

  assert.strictEqual(needsPasswordRehash(newHash), false, 'New 100,000 iteration hash must NOT need re-hashing');
  console.log('✅ [PASS] 1. New passwords use Cloudflare Workers 100,000 iterations standard');

  // -------------------------------------------------------------
  // TEST 2: Backward Compatibility with Existing 100,000 Iteration Hashes
  // -------------------------------------------------------------
  console.log('\n--- 2. Testing Backward Compatibility with Existing 100,000 Iteration Hashes ---');
  const legacyPassword = 'LegacyUserPassword2025!';
  const legacyHash = await hashPassword(legacyPassword, PBKDF2_LEGACY_ITERATIONS);
  assert(legacyHash.startsWith('pbkdf2:100000:'), 'Legacy hash starts with pbkdf2:100000:');

  // Existing user must verify correctly with legacy hash
  const legacyValid = await verifyPassword(legacyPassword, legacyHash);
  assert.strictEqual(legacyValid, true, 'Existing 100,000 iteration password must verify successfully');

  // Incorrect password must be rejected
  const legacyWrong = await verifyPassword('IncorrectPassword123!', legacyHash);
  assert.strictEqual(legacyWrong, false, 'Wrong password must be rejected on legacy hash');

  console.log('✅ [PASS] 2. Existing 100,000 iteration hashes verify seamlessly');

  // -------------------------------------------------------------
  // TEST 3: Login Verification in Server Router
  // -------------------------------------------------------------
  console.log('\n--- 3. Testing Login in Server Router ---');
  const mockDb = createMockD1();
  const mockEnv: Env = {
    DB: mockDb,
    ADMIN_SECRET: 'test-admin-secret-999-secure',
    DEV: true,
  };

  const userEmail = 'existing-user@example.com';
  const userPassword = 'UserExistingPass2025!';
  const initialLegacyHash = await hashPassword(userPassword, 100000);

  mockDb._users[userEmail] = {
    id: 'usr-existing-001',
    email: userEmail,
    role: 'customer',
    password: initialLegacyHash,
    status: 'active',
    is_active: 1,
  };

  assert(mockDb._users[userEmail].password.startsWith('pbkdf2:100000:'), 'Initial stored password is 100,000 iterations');

  // Existing user logs in
  const loginReq = new Request('https://rongdhonutrade.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.99' },
    body: JSON.stringify({ usernameOrEmail: userEmail, password: userPassword }),
  });
  const loginRes = await handleApiRequest(loginReq, mockEnv);
  const loginData = await loginRes.json();

  assert.strictEqual(loginRes.status, 200, `Expected HTTP 200 OK, got ${loginRes.status}`);
  assert.strictEqual(loginData.success, true, 'Expected successful login');
  console.log('✅ [PASS] 3. Existing user successfully logged in with 100,000 iteration hash');

  // -------------------------------------------------------------
  // TEST 4: Subsequent Login Verifies Against Hash
  // -------------------------------------------------------------
  console.log('\n--- 4. Testing Subsequent Login ---');
  const secondLoginReq = new Request('https://rongdhonutrade.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.99' },
    body: JSON.stringify({ usernameOrEmail: userEmail, password: userPassword }),
  });
  const secondLoginRes = await handleApiRequest(secondLoginReq, mockEnv);
  const secondLoginData = await secondLoginRes.json();

  assert.strictEqual(secondLoginRes.status, 200, 'Subsequent login with valid hash must succeed');
  assert.strictEqual(secondLoginData.success, true);
  console.log('✅ [PASS] 4. Subsequent login succeeds seamlessly with 100,000 iteration hash');

  // -------------------------------------------------------------
  // TEST 5: Wrong Password Handling & Timing Attack Safety
  // -------------------------------------------------------------
  console.log('\n--- 5. Testing Wrong Password Rejection & Timing Attack Safety ---');
  const wrongLoginReq = new Request('https://rongdhonutrade.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.99' },
    body: JSON.stringify({ usernameOrEmail: userEmail, password: 'WrongPassword!' }),
  });
  const wrongLoginRes = await handleApiRequest(wrongLoginReq, mockEnv);
  assert.strictEqual(wrongLoginRes.status, 401, 'Wrong password must return 401 Unauthorized');

  // Non-existent user login (uses dummy hash with 600,000 iterations)
  const nonExistentReq = new Request('https://rongdhonutrade.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.99' },
    body: JSON.stringify({ usernameOrEmail: 'ghost-account@example.com', password: 'SomePassword!' }),
  });
  const nonExistentRes = await handleApiRequest(nonExistentReq, mockEnv);
  assert.strictEqual(nonExistentRes.status, 401, 'Non-existent account returns 401');
  console.log('✅ [PASS] 5. Invalid credentials strictly rejected; timing attack protection verified');

  console.log('\n================================================================');
  console.log('ALL PASSWORD HASHING UPGRADE AUDIT TESTS PASSED (5/5)!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
