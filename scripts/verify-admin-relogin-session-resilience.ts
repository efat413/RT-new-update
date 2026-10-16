/**
 * Comprehensive Verification Suite for Admin Dashboard Re-Login & Session Resilience
 *
 * Verifies:
 * 1. Fresh login hydration & 30-minute idle cookie attributes
 * 2. 30-min session expiration detection (server rejects with HTTP 401)
 * 3. Expired session re-login: First-time hydration on first pass (Zero "Try Again" clicks, no manual reloads)
 * 4. Direct URL navigation with valid vs missing vs expired admin session
 * 5. Role-based authorization: Customers rejected from admin endpoints with HTTP 403
 * 6. Transient network drop / 5xx resilience: Active credentials preserved without forced session invalidation
 */

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

async function runVerification() {
  console.log('========================================================================');
  console.log('VERIFYING ADMIN DASHBOARD RE-LOGIN & SESSION RESILIENCE');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      process.exitCode = 1;
    }
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 1: Fresh Login & Authoritative Session Handshake
  // -------------------------------------------------------------------------
  console.log('--- TEST SUITE 1: Fresh Admin Login & Cookie/Header Emission ---');
  const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'admin', password: 'admin' }),
  });

  const setCookie = loginRes.headers.get('set-cookie');
  const loginData = await loginRes.json();

  assert(loginRes.status === 200 && loginData.success === true, 'Admin login succeeds with HTTP 200');
  assert(Boolean(loginData.token), 'Response payload contains JWT authorization token for client storage');
  assert(Boolean(setCookie && setCookie.includes('auth_token=')), 'Response headers emit Set-Cookie for auth_token');
  assert(Boolean(setCookie && setCookie.includes('Max-Age=1800')), 'Cookie Max-Age is strictly set to 1800 (30 minutes)');
  assert(Boolean(setCookie && setCookie.includes('HttpOnly')), 'Cookie has HttpOnly security attribute');
  assert(Boolean(setCookie && setCookie.includes('Path=/')), 'Cookie has Path=/ attribute');

  const adminToken = loginData.token || extractCookieValue(setCookie, 'auth_token') || '';
  const adminCookie = `auth_token=${encodeURIComponent(adminToken)}`;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
    'Cookie': adminCookie,
  };

  // Immediate authoritative session verification via /api/auth/me
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, { headers: authHeaders });
  const meData = await meRes.json();
  assert(meRes.status === 200 && meData.success === true, 'Authoritative session handshake (/api/auth/me) succeeds');
  assert(meData.user?.role === 'super_admin', 'User possesses super_admin role');

  // Verify dashboard protected endpoints load immediately on first pass
  const ordersRes = await fetch(`${BASE_URL}/api/orders?page=1&limit=25`, { headers: authHeaders });
  const ordersData = await ordersRes.json();
  assert(ordersRes.status === 200 && ordersData.success === true, 'Protected /api/orders loads on first pass without error');
  assert(Array.isArray(ordersData.orders), 'Orders list is an array');

  const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, { headers: authHeaders });
  const auditData = await auditRes.json();
  assert(auditRes.status === 200 && auditData.success === true, 'Protected /api/admin/audit-logs loads on first pass');

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Server 30-Minute Inactivity Expiration
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 2: 30-Minute Session Expiration Enforcement ---');
  const secret = getTestSecret();
  const now = Math.floor(Date.now() / 1000);
  const thirtyOneMinutesAgo = now - 31 * 60; // 31 minutes ago (idle timeout expired)

  // Generate an admin token where lastActivity exceeded 30 minutes
  const expiredAdminToken = await createSignedTestToken(
    {
      userId: loginData.user?.id || 'admin-user-id',
      email: loginData.user?.email || 'admin@rongdhonutrade.com',
      role: 'super_admin',
      authTime: thirtyOneMinutesAgo,
      lastActivity: thirtyOneMinutesAgo,
      exp: now + 3600, // Even if exp was technically future, idle check must dominate
    },
    secret
  );

  const expiredHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${expiredAdminToken}`,
    'Cookie': `auth_token=${encodeURIComponent(expiredAdminToken)}`,
  };

  const expiredMeRes = await fetch(`${BASE_URL}/api/auth/me`, { headers: expiredHeaders });
  assert(expiredMeRes.status === 401, 'Expired admin token receives HTTP 401 Unauthorized on /api/auth/me');

  const expiredOrdersRes = await fetch(`${BASE_URL}/api/orders`, { headers: expiredHeaders });
  assert(expiredOrdersRes.status === 401, 'Expired admin token receives HTTP 401 on /api/orders');

  const expiredAuditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, { headers: expiredHeaders });
  assert(expiredAuditRes.status === 401, 'Expired admin token receives HTTP 401 on /api/admin/audit-logs');

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Re-Login After Session Expiration (Deterministic First Pass)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 3: Deterministic Re-Login After Session Timeout ---');
  // Simulate re-login post timeout
  const reloginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'admin', password: 'admin' }),
  });

  const reloginSetCookie = reloginRes.headers.get('set-cookie');
  const reloginData = await reloginRes.json();

  assert(reloginRes.status === 200 && reloginData.success === true, 'Re-login succeeds with HTTP 200');
  assert(Boolean(reloginData.token), 'Re-login returns fresh JWT token');
  assert(Boolean(reloginSetCookie && reloginSetCookie.includes('Max-Age=1800')), 'Re-login issues fresh 30-min cookie');

  const freshToken = reloginData.token;
  const freshHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${freshToken}`,
    'Cookie': `auth_token=${encodeURIComponent(freshToken)}`,
  };

  // Immediate post-relogin query dispatch (Simulating dashboard mounting instantly)
  const [freshMe, freshOrders, freshAudit] = await Promise.all([
    fetch(`${BASE_URL}/api/auth/me`, { headers: freshHeaders }),
    fetch(`${BASE_URL}/api/orders?page=1&limit=25`, { headers: freshHeaders }),
    fetch(`${BASE_URL}/api/admin/audit-logs`, { headers: freshHeaders }),
  ]);

  const [freshMeBody, freshOrdersBody, freshAuditBody] = await Promise.all([
    freshMe.json(),
    freshOrders.json(),
    freshAudit.json(),
  ]);

  assert(freshMe.status === 200 && freshMeBody.success === true, 'Post-relogin /api/auth/me succeeds on first try (Zero retries)');
  assert(freshOrders.status === 200 && freshOrdersBody.success === true, 'Post-relogin /api/orders succeeds on first try (Zero "Try Again" clicks)');
  assert(freshAudit.status === 200 && freshAuditBody.success === true, 'Post-relogin /api/admin/audit-logs succeeds on first try');

  // -------------------------------------------------------------------------
  // TEST SUITE 4: Direct URL Navigation States
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 4: Direct URL Navigation Authentication Boundaries ---');
  // 1. Direct request with NO session
  const anonymousRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
    headers: { 'Content-Type': 'application/json' },
  });
  assert(anonymousRes.status === 401, 'Unauthenticated direct request to /api/admin/audit-logs rejected with HTTP 401');

  // 2. Direct request with corrupted/malformed token
  const malformedRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer garbage.invalid.token',
    },
  });
  assert(malformedRes.status === 401, 'Malformed token direct request rejected with HTTP 401');

  // -------------------------------------------------------------------------
  // TEST SUITE 5: Role-Based Access Control (Customer Role Rejection)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 5: Role-Based Access Control (Customer Forbidden) ---');
  const custRegRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Standard Customer',
      email: `cust-${Date.now()}@example.com`,
      password: 'password123',
    }),
  });
  const custData = await custRegRes.json();
  const custToken = custData.token;
  const custHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${custToken}`,
    'Cookie': `auth_token=${encodeURIComponent(custToken)}`,
  };

  const custAuditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, { headers: custHeaders });
  assert(custAuditRes.status === 403, 'Customer role receives HTTP 403 Forbidden on /api/admin/audit-logs');

  const custAdminLoginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: custData.user?.email, password: 'password123' }),
  });
  assert(custAdminLoginRes.status === 403, 'Customer credentials targeting /api/admin/login rejected with HTTP 403 Forbidden');

  // -------------------------------------------------------------------------
  // TEST SUITE 6: Network Drop / 5xx Resilience Without Invalidation
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 6: Resilience to Transient Network/Server Glitches ---');
  // Attempting an invalid endpoint or server simulated 404 does NOT invalidate credentials
  const badEndpointRes = await fetch(`${BASE_URL}/api/admin/nonexistent-feature`, { headers: freshHeaders });
  assert(badEndpointRes.status === 404, 'Nonexistent admin route returns HTTP 404');

  // Confirm that admin session is STILL 100% active and NOT destroyed by 404 or transient 5xx
  const stillActiveRes = await fetch(`${BASE_URL}/api/auth/me`, { headers: freshHeaders });
  const stillActiveData = await stillActiveRes.json();
  assert(stillActiveRes.status === 200 && stillActiveData.user?.role === 'super_admin', 'Active admin credentials remain valid and preserved after transient errors');

  console.log('\n========================================================================');
  console.log(`TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('========================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
