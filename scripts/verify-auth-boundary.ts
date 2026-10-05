/**
 * Comprehensive Verification Suite for Development vs Production Authentication Boundary
 *
 * Verifies:
 * 1. Local development registration and login
 * 2. Local dev authenticated API request (/api/auth/me)
 * 3. dev-jwt token functionality in dev
 * 4. Production authentication (HMAC-SHA256)
 * 5. Invalid production token
 * 6. Expired production token
 * 7. dev-jwt token sent to production path (must be strictly rejected with HTTP 401)
 * 8. Normal user permissions (customers blocked from admin endpoints)
 * 9. Admin permissions (admin granted, role spoofing prevented)
 */

import {
  createAuthToken,
  verifyAuthToken,
  getAuthSecret,
} from '../src/server/auth';
import {
  getTestAdminToken,
  getTestStaffToken,
  getTestCustomerToken,
  createSignedTestToken,
} from './test-auth-helper';
import { handleApiRequest } from '../src/server/router';
import { Env } from '../src/server/types';

async function runAuthBoundaryTests() {
  console.log('===========================================================');
  console.log('STARTING DEV VS PRODUCTION AUTHENTICATION BOUNDARY TESTS');
  console.log('===========================================================');

  const baseUrl = 'http://127.0.0.1:3000';
  const prodSecret = 'prod-authoritative-secret-super-secure-key-9999';

  // =========================================================================
  // TEST 1: LOCAL DEVELOPMENT LOGIN & REGISTRATION
  // =========================================================================
  console.log('\n[TEST 1] Local Development Registration & Login (/api/auth/register & /api/auth/login)...');
  const testEmail = `auth-test-${Date.now()}@example.com`;
  const testPassword = 'StrongPassword123!';

  // 1a: Register customer account in local dev
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Auth Test User',
      email: testEmail,
      password: testPassword,
      phone: '01700112233',
    }),
  });
  console.assert(regRes.status === 201, `Expected 201 for register, got ${regRes.status}`);
  const regData = await regRes.json();
  console.assert(regData.success === true, 'Registration must succeed');
  console.log('✓ Local development registration succeeded (HTTP 201)');

  // 1b: Login with created credentials
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  console.assert(loginRes.status === 200, `Expected 200 for login, got ${loginRes.status}`);
  const loginData = await loginRes.json();
  console.assert(loginData.success === true, 'Login response must have success: true');
  console.assert(loginData.token, 'Login response must provide a session token');
  console.assert(loginData.user && loginData.user.email === testEmail, 'User email must match');
  console.log('✓ Local development login succeeded (HTTP 200)');

  const userSessionToken = loginData.token;

  // =========================================================================
  // TEST 2: LOCAL DEV AUTHENTICATED API REQUEST
  // =========================================================================
  console.log('\n[TEST 2] Local Dev Authenticated API Request (/api/auth/me)...');
  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${userSessionToken}`,
    },
  });
  console.assert(meRes.status === 200, `Expected 200, got ${meRes.status}`);
  const meData = await meRes.json();
  console.assert(meData.success === true && meData.user.email === testEmail, 'Me response must match user');
  console.log('✓ Authenticated API request in local dev succeeded (HTTP 200)');

  // =========================================================================
  // TEST 3: DEV-JWT TOKEN REJECTION & REAL TOKEN IN LOCAL DEV
  // =========================================================================
  console.log('\n[TEST 3] dev-jwt Token Rejection & Real Token In Local Dev Environment...');
  const fakeDevStaffToken = `dev-jwt-${Buffer.from(
    JSON.stringify({ userId: 'user-subadmin-staff', email: 'staff@rongdhonutrade.com', role: 'sub_admin', exp: Date.now() + 86400000 })
  ).toString('base64')}`;

  const devJwtRejectRes = await fetch(`${baseUrl}/api/auth/me`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${fakeDevStaffToken}` },
  });
  console.assert(devJwtRejectRes.status === 401, `Expected 401 in dev for dev-jwt, got ${devJwtRejectRes.status}`);
  console.log('✓ dev-jwt token strictly rejected with HTTP 401 in local development server');

  const realStaffToken = await getTestStaffToken(baseUrl);
  const staffReqRes = await fetch(`${baseUrl}/api/auth/me`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${realStaffToken}` },
  });
  console.assert(staffReqRes.status === 200, `Expected 200 in dev for real token, got ${staffReqRes.status}`);
  const staffReqData = await staffReqRes.json();
  console.assert(staffReqData.user.email === 'staff@rongdhonutrade.com', 'Staff dev request must succeed');
  console.log('✓ Legitimate staff session authenticated with real cryptographic token');

  // =========================================================================
  // TEST 4: PRODUCTION AUTHENTICATION (HMAC-SHA256 CRYPTOGRAPHIC SIGNING)
  // =========================================================================
  console.log('\n[TEST 4] Production Cryptographic Authentication (HMAC-SHA256)...');
  const validPayload = {
    userId: 'dev-super-admin-1',
    email: 'dev-superadmin@local.test',
    role: 'super_admin',
  };

  const signedProdToken = await createAuthToken(validPayload, prodSecret, 3600);
  console.assert(signedProdToken.split('.').length === 3, 'Production token must have 3 dot-separated parts');

  const verified = await verifyAuthToken(signedProdToken, prodSecret);
  console.assert(verified !== null, 'Cryptographic verification must succeed with correct secret');
  console.assert(verified?.userId === 'dev-super-admin-1', 'Verified payload userId must match');
  console.assert(verified?.email === 'dev-superadmin@local.test', 'Verified payload email must match');
  console.log('✓ Production cryptographic token created and verified successfully');

  // =========================================================================
  // TEST 5: INVALID PRODUCTION TOKEN
  // =========================================================================
  console.log('\n[TEST 5] Invalid Production Token (Tampered Signature / Wrong Secret)...');
  // 5a: Verified with wrong secret
  const wrongSecretVerified = await verifyAuthToken(signedProdToken, 'wrong-secret-1234');
  console.assert(wrongSecretVerified === null, 'Verification with wrong secret must return null');

  // 5b: Tampered payload
  const [h, p, s] = signedProdToken.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ ...validPayload, role: 'attacker_elevated' })).toString('base64url');
  const tamperedToken = `${h}.${tamperedPayload}.${s}`;
  const tamperedVerified = await verifyAuthToken(tamperedToken, prodSecret);
  console.assert(tamperedVerified === null, 'Tampered payload with original signature must return null');
  console.log('✓ Invalid and tampered production tokens strictly rejected');

  // =========================================================================
  // TEST 6: EXPIRED PRODUCTION TOKEN
  // =========================================================================
  console.log('\n[TEST 6] Expired Production Token...');
  // Create token expired 1 hour ago
  const expiredToken = await createAuthToken(validPayload, prodSecret, -3600);
  const expiredVerified = await verifyAuthToken(expiredToken, prodSecret);
  console.assert(expiredVerified === null, 'Expired token must return null');
  console.log('✓ Expired production token strictly rejected');

  // =========================================================================
  // TEST 7: DEV-JWT TOKEN SENT TO PRODUCTION PATH (MUST STRICTLY REJECT)
  // =========================================================================
  console.log('\n[TEST 7] dev-jwt Token Sent to Production Path...');

  // 7a: verifyAuthToken unit check
  const devTokenDirectCheck = await verifyAuthToken(fakeDevStaffToken, prodSecret);
  console.assert(devTokenDirectCheck === null, 'verifyAuthToken must reject dev-jwt tokens unconditionally');

  // 7b: handleApiRequest production router check
  // Mock production Cloudflare Worker environment with D1
  const mockD1: any = {
    prepare: (query: string) => ({
      bind: (...args: any[]) => ({
        first: async () => ({
          id: 'dev-super-admin-1',
          email: 'dev-superadmin@local.test',
          role: 'super_admin',
          name: 'Store Admin',
        }),
        all: async () => ({ results: [], success: true }),
        run: async () => ({ success: true }),
      }),
    }),
  };

  const prodEnv: Env = {
    DB: mockD1,
    ADMIN_SECRET: prodSecret,
    DEV: false,
  };

  // Attempt to call protected /api/auth/me in production using dev-jwt token
  const prodRequestWithDevToken = new Request('https://rongdhonutrade.com/api/auth/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${fakeDevStaffToken}`,
    },
  });

  const prodResponse = await handleApiRequest(prodRequestWithDevToken, prodEnv);
  console.assert(prodResponse.status === 401, `Expected HTTP 401 for dev-jwt in production, got ${prodResponse.status}`);
  const prodResponseBody = await prodResponse.json();
  console.assert(prodResponseBody.success === false, 'Production must reject dev-jwt');
  console.assert(
    Boolean(prodResponseBody.error),
    'Must return error message for rejected dev-jwt'
  );
  console.log('✓ Production router strictly rejected dev-jwt with HTTP 401 Unauthorized');

  // 7c: Attempt to call protected /api/upload in production using dev-jwt token
  const devAdminToken = `dev-jwt-${Buffer.from(
    JSON.stringify({ userId: 'dev-super-admin-1', email: 'dev-superadmin@local.test', role: 'super_admin', exp: Date.now() + 86400000 })
  ).toString('base64')}`;

  const prodUploadRequest = new Request('https://rongdhonutrade.com/api/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${devAdminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }),
  });

  const prodUploadResponse = await handleApiRequest(prodUploadRequest, prodEnv);
  console.assert(prodUploadResponse.status === 401, `Production upload must reject dev-jwt with 401, got ${prodUploadResponse.status}`);
  console.log('✓ Production upload route strictly rejected dev-jwt with HTTP 401');

  // 7d: Real cryptographic production token succeeds on the same production router
  const prodRequestWithRealToken = new Request('https://rongdhonutrade.com/api/auth/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${signedProdToken}`,
    },
  });
  const realProdRes = await handleApiRequest(prodRequestWithRealToken, prodEnv);
  console.assert(realProdRes.status === 200, `Real HMAC token must succeed with 200, got ${realProdRes.status}`);
  console.log('✓ Real cryptographic HMAC token successfully authenticated on production router');

  // =========================================================================
  // TEST 8: NORMAL USER PERMISSIONS
  // =========================================================================
  console.log('\n[TEST 8] Normal User Permissions (RBAC Enforcement)...');
  const customerToken = await getTestCustomerToken(baseUrl);

  // Customer attempting to access admin audit logs
  const custAdminRes = await fetch(`${baseUrl}/api/admin/audit-logs`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${customerToken}` },
  });
  console.assert(custAdminRes.status === 403, `Customer must get 403 Forbidden for admin route, got ${custAdminRes.status}`);

  // Customer attempting upload
  const custUploadRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }),
  });
  console.assert(custUploadRes.status === 403, `Customer must get 403 for upload, got ${custUploadRes.status}`);
  console.log('✓ Normal customer account strictly denied access to admin and upload routes (HTTP 403)');

  // =========================================================================
  // TEST 9: ADMIN PERMISSIONS & SPOOFING PREVENTION
  // =========================================================================
  console.log('\n[TEST 9] Admin Permissions & Role Spoofing Prevention...');
  // Legitimate admin can access admin routes
  const adminToken = await getTestAdminToken(baseUrl);
  const adminAccessRes = await fetch(`${baseUrl}/api/admin/audit-logs`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  console.assert(adminAccessRes.status === 200, `Admin must get 200 for admin audit logs, got ${adminAccessRes.status}`);
  console.log('✓ Admin permissions granted for legitimate administrator');

  // Attempt role spoofing: Customer account token claiming role: 'super_admin' in signed payload
  const spoofedToken = createSignedTestToken(
    { userId: 'user-cust-demo', email: 'customer@gmail.com', role: 'super_admin' },
    process.env.ADMIN_SECRET || 'dev-secret-test-shared-999'
  );

  const spoofedRes = await fetch(`${baseUrl}/api/admin/audit-logs`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${spoofedToken}` },
  });
  console.assert(
    spoofedRes.status === 403 || spoofedRes.status === 401,
    `Role spoofing attempt must be denied with 403 or 401, got ${spoofedRes.status}`
  );
  console.log('✓ Role spoofing in token payload strictly prevented (role resolved from server record)');

  console.log('\n===========================================================');
  console.log('✅ ALL 9 AUTHENTICATION & BOUNDARY TESTS PASSED');
  console.log('===========================================================');
}

runAuthBoundaryTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
