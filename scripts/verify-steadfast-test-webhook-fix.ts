/**
 * Verification Test Suite: Steadfast Courier Webhook Fix
 * Rongdhonu Trade
 *
 * Requirements Tested:
 * 1. Steadfast test ping (Authorization: Bearer <token>) -> HTTP 200 OK {"success": true, "message": "Webhook received"}
 * 2. Repeated test ping (clicking "Test Webhook" multiple times) -> ALWAYS HTTP 200 OK (NEVER 409 Conflict)
 * 3. Steadfast courier.added trigger test -> HTTP 200 OK
 * 4. Steadfast courier.updated trigger test -> HTTP 200 OK
 * 5. Steadfast courier.dispatched trigger test -> HTTP 200 OK
 * 6. Valid real webhook status update -> HTTP 200 OK
 * 7. Duplicate real webhook status update -> HTTP 409 Conflict (replay protection preserved)
 * 8. Missing authentication -> HTTP 401 Unauthorized
 * 9. Invalid authentication -> HTTP 401 Unauthorized
 * 10. ADMIN_SECRET passed as webhook secret -> HTTP 401 Unauthorized
 * 11. Malformed webhook payload (invalid JSON) -> HTTP 400 Bad Request
 * 12. GET /api/webhook/steadfast -> HTTP 200 OK {"status": "active"}
 */

import { computeHmacSha256Hex } from '../src/server/webhookAuth';

async function runSteadfastWebhookFixVerification() {
  console.log('================================================================');
  console.log('STARTING STEADFAST WEBHOOK FIX VERIFICATION');
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
  const webhookUrl = `${baseUrl}/api/webhook/steadfast`;
  const webhookSecret = process.env.COURIER_WEBHOOK_SECRET || 'dev-courier-webhook-secret-999';
  const adminSecret = process.env.ADMIN_SECRET || 'dev-admin-secret-test';

  // ----------------------------------------------------------------
  // 1. GET /api/webhook/steadfast (Endpoint status check)
  // ----------------------------------------------------------------
  console.log('--- 1. GET WEBHOOK RECEIVER STATUS ---');
  const getRes = await fetch(webhookUrl, { method: 'GET' });
  const getJson = await getRes.json().catch(() => ({}));
  assert(
    getRes.status === 200 && getJson.status === 'active' && getJson.success === true,
    '1.1 GET /api/webhook/steadfast returns HTTP 200 with status: "active"'
  );

  // ----------------------------------------------------------------
  // 2. STEADFAST TEST WEBHOOK (Bearer Token Authentication)
  // ----------------------------------------------------------------
  console.log('\n--- 2. STEADFAST TEST WEBHOOK / PING (Bearer Token) ---');

  // 2.1 Standard Steadfast test ping
  const testPingPayload = JSON.stringify({
    action: 'test_ping',
    event: 'test.ping',
    ping: true,
  });

  const testPingRes1 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${webhookSecret}`,
    },
    body: testPingPayload,
  });
  const testPingJson1 = await testPingRes1.json().catch(() => ({}));

  assert(
    testPingRes1.status === 200 &&
      testPingJson1.success === true &&
      (testPingJson1.message === 'Webhook received' || testPingJson1.message.includes('acknowledged')),
    `2.1 Steadfast "Test Webhook" with Bearer token returns HTTP 200 OK (status=${testPingRes1.status}, msg="${testPingJson1.message}")`
  );

  // 2.2 Clicking "Test Webhook" a SECOND time (Must NOT return 409 Conflict!)
  const testPingRes2 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${webhookSecret}`,
    },
    body: testPingPayload,
  });
  const testPingJson2 = await testPingRes2.json().catch(() => ({}));

  assert(
    testPingRes2.status === 200 && testPingJson2.success === true,
    `2.2 Clicking "Test Webhook" repeatedly does NOT return HTTP 409 (status=${testPingRes2.status}, expected=200)`
  );

  // 2.3 Clicking "Test Webhook" multiple consecutive times
  const consecutiveResults = await Promise.all([
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${webhookSecret}` },
      body: testPingPayload,
    }),
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${webhookSecret}` },
      body: testPingPayload,
    }),
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${webhookSecret}` },
      body: testPingPayload,
    }),
  ]);
  const allConsecutive200 = consecutiveResults.every((r) => r.status === 200);
  assert(
    allConsecutive200,
    '2.3 Multiple consecutive test pings all return HTTP 200 OK without replay collision'
  );

  // ----------------------------------------------------------------
  // 3. STEADFAST TRIGGER EVENTS (courier.added, courier.updated, courier.dispatched)
  // ----------------------------------------------------------------
  console.log('\n--- 3. STEADFAST TRIGGER EVENTS ---');

  // 3.1 courier.added trigger test
  const triggerAddedRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${webhookSecret}`,
    },
    body: JSON.stringify({
      event: 'courier.added',
      notification_type: 'courier.added',
    }),
  });
  const triggerAddedJson = await triggerAddedRes.json().catch(() => ({}));
  assert(
    triggerAddedRes.status === 200 && triggerAddedJson.success === true,
    `3.1 courier.added trigger test returns HTTP 200 OK (status=${triggerAddedRes.status})`
  );

  // 3.2 courier.updated trigger test
  const triggerUpdatedRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${webhookSecret}`,
    },
    body: JSON.stringify({
      event: 'courier.updated',
      notification_type: 'courier.updated',
    }),
  });
  const triggerUpdatedJson = await triggerUpdatedRes.json().catch(() => ({}));
  assert(
    triggerUpdatedRes.status === 200 && triggerUpdatedJson.success === true,
    `3.2 courier.updated trigger test returns HTTP 200 OK (status=${triggerUpdatedRes.status})`
  );

  // 3.3 courier.dispatched trigger test
  const triggerDispatchedRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${webhookSecret}`,
    },
    body: JSON.stringify({
      event: 'courier.dispatched',
      notification_type: 'courier.dispatched',
    }),
  });
  const triggerDispatchedJson = await triggerDispatchedRes.json().catch(() => ({}));
  assert(
    triggerDispatchedRes.status === 200 && triggerDispatchedJson.success === true,
    `3.3 courier.dispatched trigger test returns HTTP 200 OK (status=${triggerDispatchedRes.status})`
  );

  // ----------------------------------------------------------------
  // 4. REAL WEBHOOK DELIVERY UPDATES & REPLAY PROTECTION
  // ----------------------------------------------------------------
  console.log('\n--- 4. REAL DELIVERY UPDATES & REPLAY DEDUPLICATION ---');

  const realTs = Date.now().toString();
  const realPayload = JSON.stringify({
    consignment_id: 'SF-PROD-99881',
    invoice: 'ORD-PROD-99881',
    tracking_code: 'TRK-PROD-99881',
    status: 'in_review',
    nonce: `real-${Date.now()}`,
  });
  const realSig = await computeHmacSha256Hex(webhookSecret, `${realTs}.${realPayload}`);

  // 4.1 First submission of genuine delivery update -> HTTP 200
  const realRes1 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': realTs,
      'X-Webhook-Signature': `sha256=${realSig}`,
    },
    body: realPayload,
  });
  const realJson1 = await realRes1.json().catch(() => ({}));

  assert(
    realRes1.status === 200 && realJson1.success === true,
    `4.1 Valid real delivery webhook is processed successfully (HTTP 200, status=${realRes1.status})`
  );

  // 4.2 Replay of genuine delivery update -> HTTP 409 Conflict
  const realRes2 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': realTs,
      'X-Webhook-Signature': `sha256=${realSig}`,
    },
    body: realPayload,
  });
  const realJson2 = await realRes2.json().catch(() => ({}));

  assert(
    realRes2.status === 409 &&
      realJson2.success === false &&
      realJson2.error.includes('Webhook replay rejected'),
    `4.2 Replay of genuine delivery update is rejected with HTTP 409 Conflict (status=${realRes2.status})`
  );

  // ----------------------------------------------------------------
  // 5. AUTHENTICATION BOUNDARY & ERROR HANDLING
  // ----------------------------------------------------------------
  console.log('\n--- 5. AUTHENTICATION & MALFORMED PAYLOAD CHECKS ---');

  // 5.1 Missing authentication -> HTTP 401
  const missingAuthRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: testPingPayload,
  });
  assert(
    missingAuthRes.status === 401,
    `5.1 Missing authentication returns HTTP 401 Unauthorized (status=${missingAuthRes.status})`
  );

  // 5.2 Invalid Bearer token -> HTTP 401
  const invalidBearerRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer completely-fake-bogus-token-12345',
    },
    body: testPingPayload,
  });
  assert(
    invalidBearerRes.status === 401,
    `5.2 Invalid Bearer token returns HTTP 401 Unauthorized (status=${invalidBearerRes.status})`
  );

  // 5.3 ADMIN_SECRET passed as Bearer token -> strictly HTTP 401
  const adminSecretRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminSecret}`,
    },
    body: testPingPayload,
  });
  assert(
    adminSecretRes.status === 401,
    `5.3 ADMIN_SECRET passed as webhook Bearer token is strictly REJECTED (HTTP 401, status=${adminSecretRes.status})`
  );

  // 5.4 Malformed JSON payload -> HTTP 400 Bad Request
  const malformedRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${webhookSecret}`,
    },
    body: '{"invalid_json": true, broken...',
  });
  assert(
    malformedRes.status === 400,
    `5.4 Malformed webhook payload returns HTTP 400 Bad Request (status=${malformedRes.status})`
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSteadfastWebhookFixVerification().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
