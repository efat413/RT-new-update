/**
 * Automated Verification Suite for Courier Webhook Replay / Idempotency Security & Atomicity
 * Rongdhonu Trade
 */

import { computeHmacSha256Hex, computeWebhookFingerprint, verifyCourierWebhookAuth } from '../src/server/webhookAuth';
import { checkAndRecordWebhookFingerprint } from '../src/server/db';

async function runWebhookAtomicityVerification() {
  console.log('================================================================');
  console.log('STARTING COURIER WEBHOOK ATOMIC REPLAY & IDEMPOTENCY VERIFICATION');
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

  // ================================================================
  // PART A: D1 DATABASE ATOMIC REGISTRATION UNIT TESTS
  // ================================================================
  console.log('--- PART A: D1 DATABASE ATOMIC REGISTRATION UNIT TESTS ---');

  // Simulated D1 database engine enforcing strict PRIMARY KEY constraint semantics
  class MockD1Database {
    private rows = new Map<string, { fingerprint: string; created_at: number; expires_at: number }>();

    prepare(query: string) {
      const q = query.trim().toUpperCase();
      let boundArgs: any[] = [];

      const stmt = {
        bind: (...args: any[]) => {
          boundArgs = args;
          return stmt;
        },
        run: async () => {
          if (q.startsWith('DELETE FROM WEBHOOK_REPLAYS WHERE EXPIRES_AT <')) {
            const cutoff = boundArgs[0] as number;
            let deleted = 0;
            for (const [k, v] of this.rows.entries()) {
              if (v.expires_at < cutoff) {
                this.rows.delete(k);
                deleted++;
              }
            }
            return { success: true, meta: { changes: deleted, rows_written: deleted } };
          }

          if (q.startsWith('INSERT INTO WEBHOOK_REPLAYS')) {
            const [fp, createdAt, expiresAt] = boundArgs as [string, number, number];
            // PRIMARY KEY constraint check: must throw SQLite constraint error if already exists
            if (this.rows.has(fp)) {
              const err = new Error(`D1_ERROR: UNIQUE constraint failed: webhook_replays.fingerprint`);
              (err as any).code = 'SQLITE_CONSTRAINT';
              throw err;
            }
            this.rows.set(fp, { fingerprint: fp, created_at: createdAt, expires_at: expiresAt });
            return { success: true, meta: { changes: 1, rows_written: 1 } };
          }

          return { success: true, meta: { changes: 0, rows_written: 0 } };
        },
        first: async () => {
          if (q.startsWith('SELECT FINGERPRINT FROM WEBHOOK_REPLAYS WHERE FINGERPRINT = ? AND EXPIRES_AT >=')) {
            const [fp, now] = boundArgs as [string, number];
            const row = this.rows.get(fp);
            if (row && row.expires_at >= now) {
              return { fingerprint: row.fingerprint };
            }
            return null;
          }
          return null;
        },
      };

      return stmt;
    }
  }

  const mockDb = new MockD1Database() as any;

  // A.1 First registration with new fingerprint succeeds
  const testFp1 = 'mock-fp-0001-' + Date.now();
  const resA1 = await checkAndRecordWebhookFingerprint(mockDb, testFp1, 600);
  assert(
    resA1.isReplay === false,
    'A.1 First registration with valid fingerprint succeeds (isReplay: false)'
  );

  // A.2 Sequential duplicate registration with same fingerprint conflicts
  const resA2 = await checkAndRecordWebhookFingerprint(mockDb, testFp1, 600);
  assert(
    resA2.isReplay === true,
    'A.2 Sequential duplicate with same fingerprint conflicts on PRIMARY KEY (isReplay: true)'
  );

  // A.3 Concurrent duplicate registration: 10 requests at exact same millisecond
  const testFpConcurrent = 'mock-fp-concurrent-' + Date.now();
  const concurrentD1Promises = Array.from({ length: 10 }).map(() =>
    checkAndRecordWebhookFingerprint(mockDb, testFpConcurrent, 600)
  );
  const concurrentD1Results = await Promise.all(concurrentD1Promises);
  const acceptedD1Count = concurrentD1Results.filter((r) => r.isReplay === false).length;
  const rejectedD1Count = concurrentD1Results.filter((r) => r.isReplay === true).length;

  assert(
    acceptedD1Count === 1 && rejectedD1Count === 9,
    `A.3 Concurrent duplicate registration: Exactly 1 registered (${acceptedD1Count}), 9 rejected as replays (${rejectedD1Count})`
  );

  // A.4 Different valid fingerprint succeeds
  const testFp2 = 'mock-fp-0002-' + Date.now();
  const resA4 = await checkAndRecordWebhookFingerprint(mockDb, testFp2, 600);
  assert(
    resA4.isReplay === false,
    'A.4 Different valid fingerprint succeeds independently (isReplay: false)'
  );

  // A.5 Expired fingerprint is cleaned up by TTL and can be re-registered
  const expiredFp = 'mock-fp-expired-' + Date.now();
  // Register with 1 second TTL
  await checkAndRecordWebhookFingerprint(mockDb, expiredFp, -10); // already expired
  const resA5 = await checkAndRecordWebhookFingerprint(mockDb, expiredFp, 600);
  assert(
    resA5.isReplay === false,
    'A.5 Expired fingerprint cleaned up by TTL and safely re-registered (no unbounded growth)'
  );

  // ================================================================
  // PART B: LIVE DEV SERVER WEBHOOK ENDPOINT ATOMICITY & SECURITY TESTS
  // ================================================================
  console.log('\n--- PART B: LIVE DEV SERVER WEBHOOK ENDPOINT TESTS ---');

  const baseUrl = 'http://127.0.0.1:3000';
  const webhookUrl = `${baseUrl}/api/webhook/steadfast`;
  const webhookSecret = process.env.COURIER_WEBHOOK_SECRET || 'dev-courier-webhook-secret-999';

  // Test B.1: Valid courier webhook with timestamp and signature -> ACCEPTED (200)
  const validTimestamp = Date.now().toString();
  const validBody = JSON.stringify({
    consignment_id: 'CSF-TEST-001',
    invoice: 'ORD-TEST-001',
    tracking_code: 'TRK-TEST-001',
    status: 'in_review',
    testNonce: `nonce-${Date.now()}-1`,
  });
  const validSig = await computeHmacSha256Hex(webhookSecret, `${validTimestamp}.${validBody}`);

  const testB1Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': validTimestamp,
      'X-Webhook-Signature': `sha256=${validSig}`,
    },
    body: validBody,
  });
  const testB1Json = await testB1Res.json().catch(() => ({}));
  assert(
    testB1Res.status === 200 && testB1Json.success === true,
    'B.1 Valid courier webhook with timestamp and signature is ACCEPTED (HTTP 200)'
  );

  // Test B.2: Invalid signature -> REJECTED (401)
  const testB2Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': validTimestamp,
      'X-Webhook-Signature': 'sha256=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    },
    body: validBody,
  });
  assert(
    testB2Res.status === 401,
    'B.2 Webhook with invalid signature is REJECTED (HTTP 401)'
  );

  // Test B.3: Stale timestamp (> 5 min) -> REJECTED (401)
  const staleTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
  const staleSig = await computeHmacSha256Hex(webhookSecret, `${staleTimestamp}.${validBody}`);
  const testB3Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': staleTimestamp,
      'X-Webhook-Signature': `sha256=${staleSig}`,
    },
    body: validBody,
  });
  assert(
    testB3Res.status === 401,
    'B.3 Webhook with stale timestamp is REJECTED (HTTP 401 Replay Protection)'
  );

  // Test B.4: Same webhook replayed sequentially -> REJECTED (409)
  const testB4Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': validTimestamp,
      'X-Webhook-Signature': `sha256=${validSig}`,
    },
    body: validBody,
  });
  assert(
    testB4Res.status === 409,
    'B.4 Same webhook request replayed sequentially is REJECTED (HTTP 409 Conflict)'
  );

  // Test B.5: CONCURRENT DUPLICATE WEBHOOK -> ONLY ONE PROCESSED (HTTP 200 vs HTTP 409)
  const concurrentTimestamp = (Date.now() + 500).toString();
  const concurrentBody = JSON.stringify({
    consignment_id: 'CSF-CONCURRENT-001',
    invoice: 'ORD-CONCURRENT-001',
    tracking_code: 'TRK-CONCURRENT-001',
    status: 'delivered',
    nonce: `race-test-${Date.now()}`,
  });
  const concurrentSig = await computeHmacSha256Hex(webhookSecret, `${concurrentTimestamp}.${concurrentBody}`);

  // Send 6 identical requests simultaneously
  const concurrentHttpPromises = Array.from({ length: 6 }).map(() =>
    fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Timestamp': concurrentTimestamp,
        'X-Webhook-Signature': `sha256=${concurrentSig}`,
      },
      body: concurrentBody,
    })
  );

  const concurrentHttpResponses = await Promise.all(concurrentHttpPromises);
  const statusCodes = concurrentHttpResponses.map((r) => r.status);
  const accepted200Count = statusCodes.filter((s) => s === 200).length;
  const conflict409Count = statusCodes.filter((s) => s === 409).length;

  assert(
    accepted200Count === 1 && conflict409Count === 5,
    `B.5 Concurrent duplicate webhooks: Exactly 1 processed (HTTP 200), 5 rejected as duplicate (HTTP 409) [counts: 200=${accepted200Count}, 409=${conflict409Count}]`
  );

  // Test B.6: Different valid webhook -> ACCEPTED (200)
  const differentTimestamp = (Date.now() + 1000).toString();
  const differentBody = JSON.stringify({
    consignment_id: 'CSF-DIFF-001',
    invoice: 'ORD-DIFF-001',
    tracking_code: 'TRK-DIFF-001',
    status: 'in_review',
    nonce: `different-${Date.now()}`,
  });
  const differentSig = await computeHmacSha256Hex(webhookSecret, `${differentTimestamp}.${differentBody}`);

  const testB6Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': differentTimestamp,
      'X-Webhook-Signature': `sha256=${differentSig}`,
    },
    body: differentBody,
  });
  assert(
    testB6Res.status === 200,
    'B.6 Different valid webhook request is ACCEPTED (HTTP 200)'
  );

  // Test B.7: Malformed timestamp -> REJECTED (400)
  const malformedTimestamp = 'invalid-timestamp-value';
  const malformedSig = await computeHmacSha256Hex(webhookSecret, `${malformedTimestamp}.${validBody}`);
  const testB7Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': malformedTimestamp,
      'X-Webhook-Signature': `sha256=${malformedSig}`,
    },
    body: validBody,
  });
  assert(
    testB7Res.status === 400,
    'B.7 Webhook with malformed timestamp header is REJECTED (HTTP 400 Bad Request)'
  );

  // Test B.8: Missing timestamp header with signature -> REJECTED (400)
  const testB8Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${validSig}`,
    },
    body: validBody,
  });
  assert(
    testB8Res.status === 400,
    'B.8 Webhook with missing timestamp header is REJECTED (HTTP 400 Bad Request)'
  );

  // Test B.9: Future timestamp outside 5-minute tolerance -> REJECTED (401)
  const futureTimestamp = (Date.now() + 10 * 60 * 1000).toString(); // 10 minutes in future
  const futureSig = await computeHmacSha256Hex(webhookSecret, `${futureTimestamp}.${validBody}`);
  const testB9Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': futureTimestamp,
      'X-Webhook-Signature': `sha256=${futureSig}`,
    },
    body: validBody,
  });
  assert(
    testB9Res.status === 401,
    'B.9 Webhook with future out-of-window timestamp is REJECTED (HTTP 401 Replay Protection)'
  );

  // Test B.10: Shared secret without timestamp header -> REJECTED (400)
  const testB10Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': webhookSecret,
    },
    body: validBody,
  });
  assert(
    testB10Res.status === 400,
    'B.10 Webhook with shared secret but missing timestamp header is REJECTED (HTTP 400 Bad Request)'
  );

  // Test B.11: Shared secret with expired timestamp -> REJECTED (401)
  const testB11Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': webhookSecret,
      'X-Webhook-Timestamp': staleTimestamp,
    },
    body: validBody,
  });
  assert(
    testB11Res.status === 401,
    'B.11 Webhook with shared secret but expired timestamp is REJECTED (HTTP 401 Replay Protection)'
  );

  // Test B.12: Shared secret with future timestamp -> REJECTED (401)
  const testB12Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': webhookSecret,
      'X-Webhook-Timestamp': futureTimestamp,
    },
    body: validBody,
  });
  assert(
    testB12Res.status === 401,
    'B.12 Webhook with shared secret but future timestamp is REJECTED (HTTP 401 Replay Protection)'
  );

  // ================================================================
  // PART C: STEADFAST COURIER STATUS UPDATE INTEGRATION
  // ================================================================
  console.log('\n--- PART C: STEADFAST STATUS UPDATE INTEGRATION ---');

  // Create an order first via public order endpoint or use seed order
  // Seed order 1 has orderNumber: '1001' or id: 'order-1'
  const sfUpdateTimestamp = (Date.now() + 2000).toString();
  const sfUpdateBody = JSON.stringify({
    consignment_id: '10000001',
    invoice: '1001',
    tracking_code: 'SF10000001',
    status: 'delivered',
  });
  const sfUpdateSig = await computeHmacSha256Hex(webhookSecret, `${sfUpdateTimestamp}.${sfUpdateBody}`);

  const sfUpdateRes = await fetch(`${baseUrl}/api/webhook/steadfast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': sfUpdateTimestamp,
      'X-Webhook-Signature': `sha256=${sfUpdateSig}`,
    },
    body: sfUpdateBody,
  });
  const sfUpdateJson = await sfUpdateRes.json().catch(() => ({}));

  assert(
    sfUpdateRes.status === 200 && sfUpdateJson.success === true,
    'C.1 Legitimate Steadfast webhook status update processes successfully (HTTP 200)'
  );

  // Verify that an immediate replay of this status update is rejected with 409
  const sfReplayRes = await fetch(`${baseUrl}/api/webhook/steadfast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': sfUpdateTimestamp,
      'X-Webhook-Signature': `sha256=${sfUpdateSig}`,
    },
    body: sfUpdateBody,
  });

  assert(
    sfReplayRes.status === 409,
    'C.2 Immediate replay of Steadfast status update is blocked with HTTP 409 Conflict'
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runWebhookAtomicityVerification().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
