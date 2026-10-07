import assert from 'assert';
import { handleApiRequest } from '../src/server/router';
import { Env } from '../src/server/types';
import { hashPassword } from '../src/server/auth';

/**
 * Creates an in-memory mock Cloudflare D1 Database for isolated unit testing
 */
function createMockD1(): any {
  const store: Record<string, { count: number; reset_at: number }> = {};
  const users: Record<string, any> = {};

  return {
    _store: store,
    _users: users,
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
            const entry = store[key];
            if (!entry) return null;
            return { count: entry.count, reset_at: entry.reset_at } as T;
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
          if (sql.includes('INSERT INTO rate_limits')) {
            const key = boundParams[0];
            const resetAt = boundParams[1];
            const now = boundParams[2];
            const entry = store[key];
            if (!entry || entry.reset_at <= now) {
              store[key] = { count: 1, reset_at: resetAt };
            } else {
              entry.count += 1;
            }
            return { success: true };
          }
          if (sql.includes('DELETE FROM rate_limits WHERE key = ?')) {
            const key = boundParams[0];
            delete store[key];
            return { success: true };
          }
          return { success: true };
        },
      };
    },
  };
}

async function runTests() {
  console.log('=== STARTING LOGIN RATE LIMITING AUDIT & VERIFICATION ===\n');

  const mockDb = createMockD1();
  const mockEnv: Env = {
    DB: mockDb,
    ADMIN_SECRET: 'test-admin-secret-999-secure',
    DEV: true,
  };

  // Seed two test accounts into mock D1
  const validPass1 = 'ValidPassword123!';
  const validPass2 = 'AttackerValidPass456!';
  const hash1 = await hashPassword(validPass1);
  const hash2 = await hashPassword(validPass2);

  mockDb._users['victim@test.com'] = {
    id: 'usr-victim',
    email: 'victim@test.com',
    role: 'customer',
    password: hash1,
    status: 'active',
    is_active: 1,
  };

  mockDb._users['attacker-account@test.com'] = {
    id: 'usr-attacker',
    email: 'attacker-account@test.com',
    role: 'customer',
    password: hash2,
    status: 'active',
    is_active: 1,
  };

  const attackerIp = '198.51.100.42';

  // -------------------------------------------------------------
  // TEST 1: Normal Login Success for Legitimate User
  // -------------------------------------------------------------
  console.log('--- 1. Testing Legitimate User Successful Login ---');
  const req1 = new Request('https://rongdhonutrade.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': attackerIp },
    body: JSON.stringify({ usernameOrEmail: 'victim@test.com', password: validPass1 }),
  });
  const res1 = await handleApiRequest(req1, mockEnv);
  const data1 = await res1.json();
  assert.strictEqual(res1.status, 200, `Expected 200 OK, got ${res1.status}`);
  assert.strictEqual(data1.success, true, 'Expected successful login');
  console.log('✅ [PASS] 1. Legitimate user can log in normally');

  // -------------------------------------------------------------
  // TEST 2: Account-Specific Failed Attempt Reset on Successful Login
  // -------------------------------------------------------------
  console.log('\n--- 2. Testing Account-Specific Rate Limit Reset on Success ---');
  const accountRateKey = `login:${attackerIp}:victim@test.com`;
  const ipRateKey = `login:ip:${attackerIp}`;

  // Fail twice for victim account
  for (let i = 0; i < 2; i++) {
    const failReq = new Request('https://rongdhonutrade.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': attackerIp },
      body: JSON.stringify({ usernameOrEmail: 'victim@test.com', password: 'WrongPassword!' }),
    });
    const failRes = await handleApiRequest(failReq, mockEnv);
    assert.strictEqual(failRes.status, 401, 'Wrong password returns 401');
  }

  assert(mockDb._store[accountRateKey]?.count === 2, 'Account failure counter should be 2');
  assert(mockDb._store[ipRateKey]?.count === 2, 'IP failure counter should be 2');

  // Now legitimate user enters correct password
  const successReq = new Request('https://rongdhonutrade.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': attackerIp },
    body: JSON.stringify({ usernameOrEmail: 'victim@test.com', password: validPass1 }),
  });
  const successRes = await handleApiRequest(successReq, mockEnv);
  assert.strictEqual(successRes.status, 200, 'Login succeeds with correct password');

  // Verify account rate limit was cleared
  assert.strictEqual(mockDb._store[accountRateKey], undefined, 'Account rate limit key should be deleted/cleared');
  console.log('✅ [PASS] 2. Account-specific rate limit was properly cleared on successful login');

  // -------------------------------------------------------------
  // TEST 3: IP-Based Rate Limit is NOT Reset on Successful Login
  // -------------------------------------------------------------
  console.log('\n--- 3. Testing IP-Based Rate Limit Retention (No Reset on Success) ---');
  // CRITICAL CHECK: The IP counter must NOT have been cleared by the successful login!
  assert(mockDb._store[ipRateKey] !== undefined, 'IP rate limit key must NOT be cleared on successful login!');
  assert.strictEqual(mockDb._store[ipRateKey]?.count, 2, 'IP rate limit counter must retain its count (2)');
  console.log('✅ [PASS] 3. Global IP rate limit was NOT cleared on successful login');

  // -------------------------------------------------------------
  // TEST 4: Attacker Cannot Reset IP Rate Limiter to Bypass Brute Force Throttling
  // -------------------------------------------------------------
  console.log('\n--- 4. Testing Attacker Credential Spraying / Stuffing Lockout ---');
  // Simulate attacker attempting 22 more failed logins against different targets
  for (let i = 0; i < 22; i++) {
    const sprayReq = new Request('https://rongdhonutrade.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': attackerIp },
      body: JSON.stringify({ usernameOrEmail: `target${i}@test.com`, password: 'GuessedPassword!' }),
    });
    const sprayRes = await handleApiRequest(sprayReq, mockEnv);
    assert.strictEqual(sprayRes.status, 401);
  }

  // IP count is now at 24 (2 original + 22 spray attempts = 24 / 25)
  assert.strictEqual(mockDb._store[ipRateKey]?.count, 24, 'IP count should be 24');

  // Attacker now tries to RESET the IP limiter by logging into their own valid account!
  const attackerBypassReq = new Request('https://rongdhonutrade.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': attackerIp },
    body: JSON.stringify({ usernameOrEmail: 'attacker-account@test.com', password: validPass2 }),
  });
  const attackerBypassRes = await handleApiRequest(attackerBypassReq, mockEnv);
  assert.strictEqual(attackerBypassRes.status, 200, 'Attacker valid login succeeded');

  // VERIFY: IP limiter was NOT reset! Count must still be 24!
  assert.strictEqual(
    mockDb._store[ipRateKey]?.count,
    24,
    'SECURITY VERIFICATION: IP rate counter was NOT wiped by valid attacker login!'
  );

  // 25th failed attempt from this IP
  const attempt25 = new Request('https://rongdhonutrade.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': attackerIp },
    body: JSON.stringify({ usernameOrEmail: 'victim@test.com', password: 'GuessedPassword25' }),
  });
  const res25 = await handleApiRequest(attempt25, mockEnv);
  assert.strictEqual(res25.status, 401, '25th attempt records failure');
  assert.strictEqual(mockDb._store[ipRateKey]?.count, 25, 'IP count reached limit of 25');

  // 26th attempt from this IP must now be LOCKED OUT with HTTP 429!
  const attempt26 = new Request('https://rongdhonutrade.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': attackerIp },
    body: JSON.stringify({ usernameOrEmail: 'victim@test.com', password: 'GuessedPassword26' }),
  });
  const res26 = await handleApiRequest(attempt26, mockEnv);
  const data26 = await res26.json();
  assert.strictEqual(res26.status, 429, `Expected HTTP 429 Too Many Requests, got ${res26.status}`);
  assert(data26.error?.includes('Too many login attempts from this network'), 'Expected IP rate limit error message');
  console.log('✅ [PASS] 4. IP-based rate limiting locked out attacker at 25 attempts despite valid login reset attempt');

  // -------------------------------------------------------------
  // TEST 5: Even Valid Login is Throttled When IP Exceeds Limit
  // -------------------------------------------------------------
  console.log('\n--- 5. Testing Network Lockout Enforcement on IP ---');
  const lockedLoginReq = new Request('https://rongdhonutrade.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': attackerIp },
    body: JSON.stringify({ usernameOrEmail: 'attacker-account@test.com', password: validPass2 }),
  });
  const lockedLoginRes = await handleApiRequest(lockedLoginReq, mockEnv);
  assert.strictEqual(lockedLoginRes.status, 429, 'Locked IP cannot make further login attempts');
  console.log('✅ [PASS] 5. Lockout enforced on all subsequent attempts from locked IP');

  console.log('\n================================================================');
  console.log('ALL LOGIN RATE LIMITING AUDIT TESTS PASSED (5/5)!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
