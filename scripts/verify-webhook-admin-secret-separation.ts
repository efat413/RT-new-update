/**
 * Test Suite: Strict Separation of ADMIN_SECRET from Webhook Authentication
 * Rongdhonu Trade
 *
 * Requirements Verified:
 * 1. ADMIN_SECRET is NEVER accepted as a valid webhook authentication secret.
 * 2. Dedicated webhook secrets (COURIER_WEBHOOK_SECRET, STEADFAST_SECRET_KEY) are accepted.
 * 3. Invalid or arbitrary webhook secrets are rejected.
 * 4. Legitimate admin authentication using ADMIN_SECRET remains fully functional.
 */

import { verifyCourierWebhookAuth, computeHmacSha256Hex } from '../src/server/webhookAuth';
import { getTestAdminToken } from './test-auth-helper';

async function runSecuritySeparationTests() {
  console.log('================================================================');
  console.log('VERIFYING STRICT SEPARATION OF ADMIN_SECRET FROM WEBHOOK AUTH');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  const baseUrl = 'http://127.0.0.1:3000';
  const serverAdminSecret = process.env.ADMIN_SECRET || 'dev-secret-local-admin';
  const serverCourierSecret = process.env.COURIER_WEBHOOK_SECRET || 'dev-courier-webhook-secret-999';

  // ----------------------------------------------------------------
  // PART 1: UNIT LEVEL ENFORCEMENT IN verifyCourierWebhookAuth
  // ----------------------------------------------------------------
  console.log('--- PART 1: UNIT TEST VERIFICATION (verifyCourierWebhookAuth) ---');

  const unitAdminSecret = 'unit-test-admin-secret-strictly-for-admins-only-999';
  const unitCourierSecret = 'unit-test-courier-webhook-secret-dedicated-123';
  const unitEnv = {
    ADMIN_SECRET: unitAdminSecret,
    COURIER_WEBHOOK_SECRET: unitCourierSecret,
  };

  const payload = JSON.stringify({ consignment_id: 'CSF-UNIT-001', status: 'delivered' });
  const timestamp = Date.now().toString();

  // 1.1 ADMIN_SECRET as x-webhook-secret -> REJECTED (401)
  const unitTest1 = await verifyCourierWebhookAuth(
    {
      rawBody: payload,
      headers: {
        'x-webhook-secret': unitAdminSecret,
        'x-webhook-timestamp': timestamp,
      },
    },
    unitEnv as any
  );
  assert(
    unitTest1.authenticated === false && unitTest1.status === 401,
    '1.1 ADMIN_SECRET passed via x-webhook-secret is strictly REJECTED (401)'
  );

  // 1.2 ADMIN_SECRET as secret-key -> REJECTED (401)
  const unitTest2 = await verifyCourierWebhookAuth(
    {
      rawBody: payload,
      headers: {
        'secret-key': unitAdminSecret,
        'x-webhook-timestamp': timestamp,
      },
    },
    unitEnv as any
  );
  assert(
    unitTest2.authenticated === false && unitTest2.status === 401,
    '1.2 ADMIN_SECRET passed via secret-key is strictly REJECTED (401)'
  );

  // 1.3 ADMIN_SECRET as Bearer token in Authorization header -> REJECTED (401)
  const unitTest3 = await verifyCourierWebhookAuth(
    {
      rawBody: payload,
      headers: {
        authorization: `Bearer ${unitAdminSecret}`,
        'x-webhook-timestamp': timestamp,
      },
    },
    unitEnv as any
  );
  assert(
    unitTest3.authenticated === false && unitTest3.status === 401,
    '1.3 ADMIN_SECRET passed as Bearer token is strictly REJECTED (401)'
  );

  // 1.4 HMAC-SHA256 signature generated using ADMIN_SECRET -> REJECTED (401)
  const adminHmac = await computeHmacSha256Hex(unitAdminSecret, `${timestamp}.${payload}`);
  const unitTest4 = await verifyCourierWebhookAuth(
    {
      rawBody: payload,
      headers: {
        'x-webhook-signature': `sha256=${adminHmac}`,
        'x-webhook-timestamp': timestamp,
      },
    },
    unitEnv as any
  );
  assert(
    unitTest4.authenticated === false && unitTest4.status === 401,
    '1.4 HMAC-SHA256 signature generated with ADMIN_SECRET is strictly REJECTED (401)'
  );

  // 1.5 Dedicated COURIER_WEBHOOK_SECRET as x-webhook-secret -> ACCEPTED (200)
  const unitTest5 = await verifyCourierWebhookAuth(
    {
      rawBody: payload,
      headers: {
        'x-webhook-secret': unitCourierSecret,
        'x-webhook-timestamp': timestamp,
      },
    },
    unitEnv as any
  );
  assert(
    unitTest5.authenticated === true && unitTest5.status === 200,
    '1.5 Dedicated COURIER_WEBHOOK_SECRET passed via x-webhook-secret is ACCEPTED (200)'
  );

  // 1.6 Dedicated COURIER_WEBHOOK_SECRET HMAC signature -> ACCEPTED (200)
  const courierHmac = await computeHmacSha256Hex(unitCourierSecret, `${timestamp}.${payload}`);
  const unitTest6 = await verifyCourierWebhookAuth(
    {
      rawBody: payload,
      headers: {
        'x-webhook-signature': `sha256=${courierHmac}`,
        'x-webhook-timestamp': timestamp,
      },
    },
    unitEnv as any
  );
  assert(
    unitTest6.authenticated === true && unitTest6.status === 200,
    '1.6 Dedicated COURIER_WEBHOOK_SECRET HMAC signature is ACCEPTED (200)'
  );

  // 1.7 Invalid/unconfigured secret -> REJECTED (401)
  const unitTest7 = await verifyCourierWebhookAuth(
    {
      rawBody: payload,
      headers: {
        'x-webhook-secret': 'completely-random-untrusted-secret-888',
        'x-webhook-timestamp': timestamp,
      },
    },
    unitEnv as any
  );
  assert(
    unitTest7.authenticated === false && unitTest7.status === 401,
    '1.7 Invalid/unconfigured secret is REJECTED (401)'
  );

  // 1.8 Accidental settings.courierWebhooks matching ADMIN_SECRET is purged -> REJECTED (401)
  const unitTest8 = await verifyCourierWebhookAuth(
    {
      rawBody: payload,
      headers: {
        'x-webhook-secret': unitAdminSecret,
        'x-webhook-timestamp': timestamp,
      },
    },
    unitEnv as any,
    {
      courierWebhooks: [{ id: 'w-accidental', secret: unitAdminSecret, isActive: true }],
    }
  );
  assert(
    unitTest8.authenticated === false && unitTest8.status === 401,
    '1.8 Accidental store settings webhook secret matching ADMIN_SECRET is purged and REJECTED (401)'
  );

  // ----------------------------------------------------------------
  // PART 2: LIVE HTTP ENDPOINT VERIFICATION (/api/webhook/steadfast)
  // ----------------------------------------------------------------
  console.log('\n--- PART 2: LIVE WEBHOOK ENDPOINT VERIFICATION ---');

  const liveEndpoint = `${baseUrl}/api/webhook/steadfast`;
  const liveTs = Date.now().toString();
  const liveBody = JSON.stringify({
    consignment_id: 'CSF-LIVE-SEP-1',
    invoice: 'ORD-SEP-1',
    tracking_code: 'TRK-SEP-1',
    status: 'in_review',
    nonce: `sep-${Date.now()}`,
  });

  // 2.1 Live: ADMIN_SECRET passed via X-Webhook-Secret -> HTTP 401
  const liveHttp1 = await fetch(liveEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': serverAdminSecret,
      'X-Webhook-Timestamp': liveTs,
    },
    body: liveBody,
  });
  assert(
    liveHttp1.status === 401,
    '2.1 Live /api/webhook/steadfast REJECTS ADMIN_SECRET via X-Webhook-Secret (HTTP 401)'
  );

  // 2.2 Live: ADMIN_SECRET passed via X-Courier-Secret -> HTTP 401
  const liveHttp2 = await fetch(liveEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Courier-Secret': serverAdminSecret,
      'X-Webhook-Timestamp': liveTs,
    },
    body: liveBody,
  });
  assert(
    liveHttp2.status === 401,
    '2.2 Live /api/webhook/steadfast REJECTS ADMIN_SECRET via X-Courier-Secret (HTTP 401)'
  );

  // 2.3 Live: ADMIN_SECRET passed via Secret-Key -> HTTP 401
  const liveHttp3 = await fetch(liveEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Secret-Key': serverAdminSecret,
      'X-Webhook-Timestamp': liveTs,
    },
    body: liveBody,
  });
  assert(
    liveHttp3.status === 401,
    '2.3 Live /api/webhook/steadfast REJECTS ADMIN_SECRET via Secret-Key (HTTP 401)'
  );

  // 2.4 Live: ADMIN_SECRET passed as Bearer token -> HTTP 401
  const liveHttp4 = await fetch(liveEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverAdminSecret}`,
      'X-Webhook-Timestamp': liveTs,
    },
    body: liveBody,
  });
  assert(
    liveHttp4.status === 401,
    '2.4 Live /api/webhook/steadfast REJECTS ADMIN_SECRET via Authorization Bearer (HTTP 401)'
  );

  // 2.5 Live: HMAC signature signed with ADMIN_SECRET -> HTTP 401
  const liveAdminSig = await computeHmacSha256Hex(serverAdminSecret, `${liveTs}.${liveBody}`);
  const liveHttp5 = await fetch(liveEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${liveAdminSig}`,
      'X-Webhook-Timestamp': liveTs,
    },
    body: liveBody,
  });
  assert(
    liveHttp5.status === 401,
    '2.5 Live /api/webhook/steadfast REJECTS HMAC signature generated with ADMIN_SECRET (HTTP 401)'
  );

  // 2.6 Live: Dedicated COURIER_WEBHOOK_SECRET passed via X-Webhook-Secret -> HTTP 200
  const liveTsValid = (Date.now() + 50).toString();
  const liveBodyValid = JSON.stringify({
    consignment_id: 'CSF-LIVE-SEP-2',
    invoice: 'ORD-SEP-2',
    tracking_code: 'TRK-SEP-2',
    status: 'in_review',
    nonce: `sep-valid-${Date.now()}`,
  });
  const liveHttp6 = await fetch(liveEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': serverCourierSecret,
      'X-Webhook-Timestamp': liveTsValid,
    },
    body: liveBodyValid,
  });
  assert(
    liveHttp6.status === 200,
    '2.6 Live /api/webhook/steadfast ACCEPTS dedicated COURIER_WEBHOOK_SECRET via X-Webhook-Secret (HTTP 200)'
  );

  // 2.7 Live: Dedicated COURIER_WEBHOOK_SECRET HMAC signature -> HTTP 200
  const liveTsHmac = (Date.now() + 100).toString();
  const liveBodyHmac = JSON.stringify({
    consignment_id: 'CSF-LIVE-SEP-3',
    invoice: 'ORD-SEP-3',
    tracking_code: 'TRK-SEP-3',
    status: 'in_review',
    nonce: `sep-hmac-${Date.now()}`,
  });
  const liveCourierSig = await computeHmacSha256Hex(serverCourierSecret, `${liveTsHmac}.${liveBodyHmac}`);
  const liveHttp7 = await fetch(liveEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${liveCourierSig}`,
      'X-Webhook-Timestamp': liveTsHmac,
    },
    body: liveBodyHmac,
  });
  assert(
    liveHttp7.status === 200,
    '2.7 Live /api/webhook/steadfast ACCEPTS valid HMAC signature generated with dedicated COURIER_WEBHOOK_SECRET (HTTP 200)'
  );

  // 2.8 Live: Invalid webhook secret -> HTTP 401
  const liveHttp8 = await fetch(liveEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': 'completely-wrong-webhook-secret',
      'X-Webhook-Timestamp': liveTsHmac,
    },
    body: liveBodyHmac,
  });
  assert(
    liveHttp8.status === 401,
    '2.8 Live /api/webhook/steadfast REJECTS invalid webhook secret (HTTP 401)'
  );

  // ----------------------------------------------------------------
  // PART 3: LEGITIMATE ADMIN AUTHENTICATION CONTINUES TO FUNCTION
  // ----------------------------------------------------------------
  console.log('\n--- PART 3: LEGITIMATE ADMIN AUTHENTICATION VERIFICATION ---');

  const adminToken = await getTestAdminToken(baseUrl);

  // 3.1 Verify /api/auth/me returns super_admin
  const adminMeRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminMeJson = await adminMeRes.json().catch(() => ({}));
  assert(
    adminMeRes.status === 200 && adminMeJson.success === true && adminMeJson.user?.role === 'super_admin',
    '3.1 Legitimate Admin session (/api/auth/me) works with valid credentials (HTTP 200, role: super_admin)'
  );

  // 3.2 Verify /api/courier/webhooks requires admin auth and works for admin
  const adminWebhooksRes = await fetch(`${baseUrl}/api/courier/webhooks`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminWebhooksJson = await adminWebhooksRes.json().catch(() => ({}));
  assert(
    adminWebhooksRes.status === 200 && adminWebhooksJson.success === true && Array.isArray(adminWebhooksJson.webhooks),
    '3.2 Authorized Admin can access webhook management endpoint /api/courier/webhooks (HTTP 200)'
  );

  // 3.3 Verify /api/orders works for authenticated admin
  const adminOrdersRes = await fetch(`${baseUrl}/api/orders`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    adminOrdersRes.status === 200,
    '3.3 Authorized Admin can access /api/orders (HTTP 200)'
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecuritySeparationTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
