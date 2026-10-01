/**
 * Test Suite: Webhook Replay Protection & Strict Timestamp Verification
 * Rongdhonu Trade
 *
 * Requirements Verified:
 * 1. Valid timestamp + valid signature → accepted (HTTP 200)
 * 2. Missing timestamp → rejected (HTTP 400)
 * 3. Malformed timestamp → rejected (HTTP 400)
 * 4. Expired timestamp → rejected (HTTP 401)
 * 5. Future / out-of-window timestamp → rejected (HTTP 401)
 * 6. Invalid signature → rejected (HTTP 401)
 * 7. Duplicate / replayed valid event → rejected (HTTP 409 Conflict)
 * 8. Shared secret without timestamp → rejected (HTTP 400)
 * 9. Shared secret with valid timestamp → accepted (HTTP 200)
 * 10. Shared secret replayed → rejected (HTTP 409 Conflict)
 */

import { computeHmacSha256Hex, verifyCourierWebhookAuth } from '../src/server/webhookAuth';

async function runReplayProtectionTests() {
  console.log('================================================================');
  console.log('STARTING WEBHOOK REPLAY PROTECTION & TIMESTAMP VERIFICATION');
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

  // ----------------------------------------------------------------
  // PART 1: UNIT TEST VERIFICATION (verifyCourierWebhookAuth)
  // ----------------------------------------------------------------
  console.log('--- PART 1: UNIT TEST VERIFICATION (verifyCourierWebhookAuth) ---');

  const unitSecret = 'test-unit-secret-courier-999';
  const unitEnv = { COURIER_WEBHOOK_SECRET: unitSecret };
  const unitBody = JSON.stringify({ consignment_id: 'UNIT-REPLAY-1', status: 'delivered' });
  const nowMs = Date.now();
  const validTs = nowMs.toString();

  // 1.1 Valid timestamp + valid signature → accepted (200)
  const validUnitSig = await computeHmacSha256Hex(unitSecret, `${validTs}.${unitBody}`);
  const u1 = await verifyCourierWebhookAuth(
    {
      rawBody: unitBody,
      headers: {
        'x-webhook-timestamp': validTs,
        'x-webhook-signature': `sha256=${validUnitSig}`,
      },
    },
    unitEnv as any
  );
  assert(
    u1.authenticated === true && u1.status === 200,
    '1.1 [Unit] Valid timestamp + valid signature → ACCEPTED (200)'
  );

  // 1.2 Missing timestamp → rejected (400)
  const u2 = await verifyCourierWebhookAuth(
    {
      rawBody: unitBody,
      headers: {
        'x-webhook-signature': `sha256=${validUnitSig}`,
      },
    },
    unitEnv as any
  );
  assert(
    u2.authenticated === false && u2.status === 400,
    '1.2 [Unit] Missing timestamp → REJECTED (400)'
  );

  // 1.3 Malformed timestamp → rejected (400)
  const u3 = await verifyCourierWebhookAuth(
    {
      rawBody: unitBody,
      headers: {
        'x-webhook-timestamp': 'not-a-valid-timestamp',
        'x-webhook-signature': `sha256=${validUnitSig}`,
      },
    },
    unitEnv as any
  );
  assert(
    u3.authenticated === false && u3.status === 400,
    '1.3 [Unit] Malformed timestamp → REJECTED (400)'
  );

  // 1.4 Expired timestamp (> 5 min past) → rejected (401)
  const expiredTs = (nowMs - 6 * 60 * 1000).toString(); // 6 minutes ago
  const expiredSig = await computeHmacSha256Hex(unitSecret, `${expiredTs}.${unitBody}`);
  const u4 = await verifyCourierWebhookAuth(
    {
      rawBody: unitBody,
      headers: {
        'x-webhook-timestamp': expiredTs,
        'x-webhook-signature': `sha256=${expiredSig}`,
      },
    },
    unitEnv as any
  );
  assert(
    u4.authenticated === false && u4.status === 401,
    '1.4 [Unit] Expired timestamp (6 min ago) → REJECTED (401)'
  );

  // 1.5 Future timestamp (> 5 min future) → rejected (401)
  const futureTs = (nowMs + 6 * 60 * 1000).toString(); // 6 minutes in future
  const futureSig = await computeHmacSha256Hex(unitSecret, `${futureTs}.${unitBody}`);
  const u5 = await verifyCourierWebhookAuth(
    {
      rawBody: unitBody,
      headers: {
        'x-webhook-timestamp': futureTs,
        'x-webhook-signature': `sha256=${futureSig}`,
      },
    },
    unitEnv as any
  );
  assert(
    u5.authenticated === false && u5.status === 401,
    '1.5 [Unit] Future timestamp (6 min ahead) → REJECTED (401)'
  );

  // 1.6 Invalid signature → rejected (401)
  const u6 = await verifyCourierWebhookAuth(
    {
      rawBody: unitBody,
      headers: {
        'x-webhook-timestamp': validTs,
        'x-webhook-signature': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
      },
    },
    unitEnv as any
  );
  assert(
    u6.authenticated === false && u6.status === 401,
    '1.6 [Unit] Invalid signature → REJECTED (401)'
  );

  // 1.7 Static shared secret without timestamp → rejected (400)
  const u7 = await verifyCourierWebhookAuth(
    {
      rawBody: unitBody,
      headers: {
        'x-webhook-secret': unitSecret,
      },
    },
    unitEnv as any
  );
  assert(
    u7.authenticated === false && u7.status === 400,
    '1.7 [Unit] Static shared secret without timestamp → REJECTED (400)'
  );

  // 1.8 Static shared secret with valid timestamp → accepted (200)
  const u8 = await verifyCourierWebhookAuth(
    {
      rawBody: unitBody,
      headers: {
        'x-webhook-secret': unitSecret,
        'x-webhook-timestamp': validTs,
      },
    },
    unitEnv as any
  );
  assert(
    u8.authenticated === true && u8.status === 200,
    '1.8 [Unit] Static shared secret with valid timestamp → ACCEPTED (200)'
  );

  // ----------------------------------------------------------------
  // PART 2: LIVE HTTP ENDPOINT REPLAY & ATOMIC DEDUPLICATION TESTS
  // ----------------------------------------------------------------
  console.log('\n--- PART 2: LIVE HTTP ENDPOINT TESTS (/api/webhook/steadfast) ---');

  const liveTs = Date.now().toString();
  const livePayload = JSON.stringify({
    consignment_id: 'CSF-RP-001',
    invoice: 'ORD-RP-001',
    tracking_code: 'TRK-RP-001',
    status: 'in_review',
    nonce: `rp-${Date.now()}`,
  });
  const liveSig = await computeHmacSha256Hex(webhookSecret, `${liveTs}.${livePayload}`);

  // 2.1 Live: valid timestamp + valid signature → accepted (200)
  const live1 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': liveTs,
      'X-Webhook-Signature': `sha256=${liveSig}`,
    },
    body: livePayload,
  });
  const live1Json = await live1.json().catch(() => ({}));
  assert(
    live1.status === 200 && live1Json.success === true,
    '2.1 [Live] Valid timestamp + valid signature → ACCEPTED (HTTP 200)'
  );

  // 2.2 Live: missing timestamp header → rejected (400)
  const live2 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${liveSig}`,
    },
    body: livePayload,
  });
  assert(
    live2.status === 400,
    '2.2 [Live] Missing timestamp header → REJECTED (HTTP 400 Bad Request)'
  );

  // 2.3 Live: malformed timestamp header → rejected (400)
  const live3 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': 'bad-timestamp-string',
      'X-Webhook-Signature': `sha256=${liveSig}`,
    },
    body: livePayload,
  });
  assert(
    live3.status === 400,
    '2.3 [Live] Malformed timestamp header → REJECTED (HTTP 400 Bad Request)'
  );

  // 2.4 Live: expired timestamp (> 5 min past) → rejected (401)
  const liveExpiredTs = (Date.now() - 7 * 60 * 1000).toString(); // 7 minutes ago
  const liveExpiredSig = await computeHmacSha256Hex(webhookSecret, `${liveExpiredTs}.${livePayload}`);
  const live4 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': liveExpiredTs,
      'X-Webhook-Signature': `sha256=${liveExpiredSig}`,
    },
    body: livePayload,
  });
  assert(
    live4.status === 401,
    '2.4 [Live] Expired timestamp (7 min ago) → REJECTED (HTTP 401 Replay Protection)'
  );

  // 2.5 Live: future timestamp (> 5 min future) → rejected (401)
  const liveFutureTs = (Date.now() + 7 * 60 * 1000).toString(); // 7 minutes in future
  const liveFutureSig = await computeHmacSha256Hex(webhookSecret, `${liveFutureTs}.${livePayload}`);
  const live5 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': liveFutureTs,
      'X-Webhook-Signature': `sha256=${liveFutureSig}`,
    },
    body: livePayload,
  });
  assert(
    live5.status === 401,
    '2.5 [Live] Future timestamp (7 min ahead) → REJECTED (HTTP 401 Replay Protection)'
  );

  // 2.6 Live: invalid signature → rejected (401)
  const live6 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': liveTs,
      'X-Webhook-Signature': 'sha256=abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    },
    body: livePayload,
  });
  assert(
    live6.status === 401,
    '2.6 [Live] Invalid signature → REJECTED (HTTP 401)'
  );

  // 2.7 Live: duplicate / replayed valid event → rejected (409 Conflict)
  const live7 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': liveTs,
      'X-Webhook-Signature': `sha256=${liveSig}`,
    },
    body: livePayload,
  });
  assert(
    live7.status === 409,
    '2.7 [Live] Duplicate / replayed valid webhook request → REJECTED (HTTP 409 Conflict)'
  );

  // 2.8 Live: static shared secret without timestamp → rejected (400)
  const live8 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': webhookSecret,
    },
    body: livePayload,
  });
  assert(
    live8.status === 400,
    '2.8 [Live] Static shared secret without timestamp → REJECTED (HTTP 400 Bad Request)'
  );

  // 2.9 Live: static shared secret with valid timestamp → accepted (200)
  const liveSecretTs = (Date.now() + 50).toString();
  const liveSecretPayload = JSON.stringify({
    consignment_id: 'CSF-RP-002',
    invoice: 'ORD-RP-002',
    tracking_code: 'TRK-RP-002',
    status: 'in_review',
    nonce: `rp-sec-${Date.now()}`,
  });
  const live9 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': webhookSecret,
      'X-Webhook-Timestamp': liveSecretTs,
    },
    body: liveSecretPayload,
  });
  assert(
    live9.status === 200,
    '2.9 [Live] Static shared secret with valid timestamp → ACCEPTED (HTTP 200)'
  );

  // 2.10 Live: duplicate static shared secret request → rejected (409 Conflict)
  const live10 = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': webhookSecret,
      'X-Webhook-Timestamp': liveSecretTs,
    },
    body: liveSecretPayload,
  });
  assert(
    live10.status === 409,
    '2.10 [Live] Replay of static shared secret request → REJECTED (HTTP 409 Conflict)'
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runReplayProtectionTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
