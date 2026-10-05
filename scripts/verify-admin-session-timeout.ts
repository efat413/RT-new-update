import nodeCrypto from 'crypto';
import { getTestSecret, createSignedTestToken } from './test-auth-helper';

const BASE_URL = 'http://localhost:3000';

function extractCookieValue(setCookieHeader: string | null, cookieName: string): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function parseTokenPayload(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING ADMIN AUTHENTICATION SESSION TIMEOUT TESTS');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      process.exitCode = 1;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Admin Login Issues 30-Minute Idle Session Cookie
  // ----------------------------------------------------
  console.log('--- TEST SUITE 1: Admin Login & Idle Cookie Issuance ---');
  let adminCookie = '';
  let adminToken = '';

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'admin', password: 'admin' }),
  });

  const loginSetCookie = loginRes.headers.get('set-cookie');
  const loginData = await loginRes.json();

  assert(loginRes.status === 200 && loginData.success === true, 'Admin login succeeds with HTTP 200');
  assert(Boolean(loginSetCookie && loginSetCookie.includes('auth_token=')), 'Response contains Set-Cookie for auth_token');
  assert(Boolean(loginSetCookie && loginSetCookie.includes('Max-Age=1800')), 'Admin session cookie has Max-Age=1800 (30 minutes)');
  assert(Boolean(loginSetCookie && loginSetCookie.includes('HttpOnly')), 'Cookie has HttpOnly security attribute');
  assert(Boolean(loginSetCookie && loginSetCookie.includes('Path=/')), 'Cookie has Path=/');

  adminToken = loginData.token || extractCookieValue(loginSetCookie, 'auth_token') || '';
  adminCookie = `auth_token=${encodeURIComponent(adminToken)}`;

  const tokenPayload = parseTokenPayload(adminToken);
  assert(Boolean(tokenPayload && tokenPayload.role === 'super_admin'), 'Token payload correctly identifies role as super_admin');
  assert(Boolean(tokenPayload && typeof tokenPayload.authTime === 'number'), 'Token contains absolute authTime timestamp');
  assert(Boolean(tokenPayload && typeof tokenPayload.lastActivity === 'number'), 'Token contains lastActivity timestamp');
  assert(Boolean(tokenPayload && tokenPayload.exp - tokenPayload.lastActivity <= 1800), 'Token exp is strictly bounded to 30 minutes from lastActivity');

  // ----------------------------------------------------
  // TEST 2: Admin Can Access Protected APIs With Active Session
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 2: Protected Admin API Access ---');
  const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
    headers: { Cookie: adminCookie },
  });
  const auditData = await auditRes.json();
  assert(auditRes.status === 200 && auditData.success === true, 'Admin can access /api/admin/audit-logs with active session');

  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: adminCookie },
  });
  const meData = await meRes.json();
  assert(meRes.status === 200 && meData.user?.role === 'super_admin', 'Admin can access /api/auth/me and role is super_admin');

  // ----------------------------------------------------
  // TEST 3: Normal Customer Cannot Access Admin APIs
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 3: Customer Authorization Boundaries ---');
  // Register or login a customer
  let custToken = '';
  const custRegRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Customer Tester',
      email: `cust-${Date.now()}@test.com`,
      password: 'password123',
    }),
  });
  const custRegData = await custRegRes.json();
  custToken = custRegData.token;
  const custCookie = `auth_token=${encodeURIComponent(custToken)}`;

  const custAuditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
    headers: { Cookie: custCookie },
  });
  assert(custAuditRes.status === 403, 'Customer cannot access /api/admin/audit-logs (returns HTTP 403)');

  const custProfitRes = await fetch(`${BASE_URL}/api/admin/profit-analytics`, {
    headers: { Cookie: custCookie },
  });
  assert(custProfitRes.status === 403, 'Customer cannot access /api/admin/profit-analytics (returns HTTP 403)');

  // ----------------------------------------------------
  // TEST 4: Server Strictly Rejects Expired Admin Sessions (Idle Expiration)
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 4: Server Rejection of Expired Sessions (30-min Idle) ---');
  const now = Math.floor(Date.now() / 1000);
  const secret = getTestSecret();

  // Create token with lastActivity 31 minutes ago (idle timeout exceeded)
  const expiredIdlePayload = {
    userId: tokenPayload.userId,
    email: tokenPayload.email,
    role: 'super_admin',
    pwdSig: tokenPayload.pwdSig,
    authTime: now - 31 * 60,
    lastActivity: now - 31 * 60, // 31 minutes ago
    exp: now - 60, // already expired
  };
  const expiredIdleToken = createSignedTestToken(expiredIdlePayload, secret);
  const expiredIdleCookie = `auth_token=${encodeURIComponent(expiredIdleToken)}`;

  const expiredAuditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
    headers: { Cookie: expiredIdleCookie },
  });
  const expiredAuditData = await expiredAuditRes.json().catch(() => ({}));
  assert(expiredAuditRes.status === 401, 'Server rejects expired admin session with HTTP 401');
  assert(expiredAuditData.success === false, 'Expired response returns success: false');

  const expiredMeRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: expiredIdleCookie },
  });
  assert(expiredMeRes.status === 401, 'Server rejects /api/auth/me with HTTP 401 for expired admin token');

  // ----------------------------------------------------
  // TEST 5: Direct Calling of Admin APIs With Expired Token/Cookie Fails
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 5: Direct API Invocation With Expired Cookie ---');
  const expiredOrdersRes = await fetch(`${BASE_URL}/api/orders`, {
    headers: { Cookie: expiredIdleCookie },
  });
  assert(expiredOrdersRes.status === 401, 'Direct /api/orders request with expired cookie rejected with HTTP 401');

  const expiredSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: expiredIdleCookie },
    body: JSON.stringify({ siteName: 'Hacked Store' }),
  });
  assert(expiredSettingsRes.status === 401, 'Direct state-mutating request with expired cookie rejected with HTTP 401');

  // ----------------------------------------------------
  // TEST 6: Token With Manipulated/Future Exp But Stale lastActivity Is Rejected
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 6: Defense-in-Depth Idle Verification (Tampered Exp) ---');
  // An attacker creates a signed token or modifies exp to 7 days, but lastActivity is 35 minutes ago
  const staleActivityPayload = {
    userId: tokenPayload.userId,
    email: tokenPayload.email,
    role: 'super_admin',
    pwdSig: tokenPayload.pwdSig,
    authTime: now - 35 * 60,
    lastActivity: now - 35 * 60, // 35 minutes ago!
    exp: now + 86400, // attacker tried to set 1 day in future
  };
  const staleActivityToken = createSignedTestToken(staleActivityPayload, secret);
  const staleActivityCookie = `auth_token=${encodeURIComponent(staleActivityToken)}`;

  const staleRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
    headers: { Cookie: staleActivityCookie },
  });
  assert(staleRes.status === 401, 'Server rejects admin token with stale lastActivity (>30 min) even if exp is in the future');

  // ----------------------------------------------------
  // TEST 7: Absolute Session Lifetime (12 Hours) Exceeded Is Rejected
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 7: Absolute Session Lifetime (12 Hours) Enforced ---');
  // Token has fresh lastActivity, but authTime is 13 hours ago (exceeded 12-hour max lifetime)
  const absoluteExpiredPayload = {
    userId: tokenPayload.userId,
    email: tokenPayload.email,
    role: 'super_admin',
    pwdSig: tokenPayload.pwdSig,
    authTime: now - 13 * 3600, // 13 hours ago!
    lastActivity: now - 10,     // 10 seconds ago
    exp: now + 1800,
  };
  const absoluteExpiredToken = createSignedTestToken(absoluteExpiredPayload, secret);
  const absoluteExpiredCookie = `auth_token=${encodeURIComponent(absoluteExpiredToken)}`;

  const absoluteRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
    headers: { Cookie: absoluteExpiredCookie },
  });
  assert(absoluteRes.status === 401, 'Server rejects admin token exceeding 12-hour absolute lifetime even with recent activity');

  // ----------------------------------------------------
  // TEST 8: Password Change Invalidates Previous Sessions
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 8: Password Invalidation Verification ---');
  // 1. Staff admin logs in and gets token
  const staffLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'staff@rongdhonutrade.com', password: 'admin' }),
  });
  const staffLoginData = await staffLoginRes.json();
  const preChangeToken = staffLoginData.token || extractCookieValue(staffLoginRes.headers.get('set-cookie'), 'auth_token');
  const preChangeCookie = `auth_token=${encodeURIComponent(preChangeToken)}`;

  // 2. Change password to NewStaffPass123!
  const changeRes = await fetch(`${BASE_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: preChangeCookie },
    body: JSON.stringify({ currentPassword: 'admin', newPassword: 'NewStaffPass123!' }),
  });
  const changeData = await changeRes.json();
  assert(changeRes.status === 200 && changeData.success === true, 'Admin staff password changed successfully');

  // 3. Attempt to use old pre-change token
  const oldTokenRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: preChangeCookie },
  });
  assert(oldTokenRes.status === 401, 'Old pre-change session token is immediately invalidated and rejected with HTTP 401');

  // 4. Verify new credentials work
  const newLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'staff@rongdhonutrade.com', password: 'NewStaffPass123!' }),
  });
  assert(newLoginRes.status === 200, 'New credentials authenticate successfully after password change');

  // ----------------------------------------------------
  // TEST 9: Logout Clears the Session
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 9: Logout Endpoint Verification ---');
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: adminCookie },
  });
  const logoutSetCookie = logoutRes.headers.get('set-cookie') || '';
  assert(logoutRes.status === 200, 'Logout succeeds with HTTP 200');
  assert(logoutSetCookie.includes('Max-Age=0') || logoutSetCookie.includes('Expires=Thu, 01 Jan 1970'), 'Logout clears cookie with Max-Age=0 / expired date');

  // ----------------------------------------------------
  // TEST 10: Refreshing Page / Valid Session Sliding
  // ----------------------------------------------------
  console.log('\n--- TEST SUITE 10: Active Session Sliding on Legitimate Requests ---');
  // Re-login to get active session
  const activeLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'admin', password: 'admin' }),
  });
  const activeLoginCookie = activeLogin.headers.get('set-cookie');
  const activeToken = (await activeLogin.json()).token || extractCookieValue(activeLoginCookie, 'auth_token');
  const activeCookieHeader = `auth_token=${encodeURIComponent(activeToken)}`;

  // Legitimate request: /api/auth/me
  const activeMe = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: activeCookieHeader },
  });
  assert(activeMe.status === 200, 'Active admin session succeeds on page refresh / navigation');

  // Mutating request should slide session
  const mutateRes = await fetch(`${BASE_URL}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: activeCookieHeader },
    body: JSON.stringify({ siteName: 'Rongodhonu Trade' }),
  });
  const mutateSetCookie = mutateRes.headers.get('set-cookie');
  assert(mutateRes.status === 200, 'Mutating admin request succeeds');
  assert(Boolean(mutateSetCookie && mutateSetCookie.includes('auth_token=')), 'Mutating admin request slides the session and returns refreshed Set-Cookie');

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('====================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
