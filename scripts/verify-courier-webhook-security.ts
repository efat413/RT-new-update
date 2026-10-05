/**
 * Verification Suite for Courier Webhook Secret Exposure and Security Hardening Fixes
 */

import { maskCourierWebhooks } from '../src/server/router';
import { controlledMergeSettings } from '../src/server/db';
import { computePasswordSignature } from '../src/server/auth';
import { INITIAL_SETTINGS } from '../src/data/seedData';
import { verifyCourierWebhookAuth, computeHmacSha256Hex } from '../src/server/webhookAuth';
import { getTestAdminToken, getTestStaffToken } from './test-auth-helper';

async function runCourierSecurityTests() {
  console.log('================================================================');
  console.log('STARTING COURIER WEBHOOK SECURITY & RBAC VERIFICATION');
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

  // 1. maskCourierWebhooks unit tests
  console.log('--- 1. WEBHOOK SECRET MASKING FUNCTION ---');
  const sampleWebhooks = [
    {
      id: 'wh-1',
      name: 'Zapier Webhook',
      url: 'https://hooks.zapier.com/hooks/catch/123/abc',
      secret: 'super_secret_webhook_key_9999',
      events: ['courier.added'],
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'wh-2',
      name: 'Slack Alerts',
      url: 'https://hooks.slack.com/services/T00/B00/X00',
      secret: undefined,
      events: ['courier.dispatched'],
      isActive: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'wh-3',
      name: 'Masked Webhook',
      url: 'https://example.com/webhook',
      secret: '••••••••',
      hasSecret: true,
      events: ['*'],
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const masked = maskCourierWebhooks(sampleWebhooks);

  assert(
    masked.length === 3,
    '1.1 maskCourierWebhooks preserves list length'
  );

  assert(
    masked[0].secret === '••••••••' && masked[0].hasSecret === true,
    '1.2 Webhook with real secret returns masked "••••••••" and hasSecret=true'
  );

  assert(
    !JSON.stringify(masked).includes('super_secret_webhook_key_9999'),
    '1.3 Real secret is completely absent from masked output'
  );

  assert(
    masked[1].secret === undefined && masked[1].hasSecret === false,
    '1.4 Webhook without secret returns secret=undefined and hasSecret=false'
  );

  assert(
    masked[2].secret === '••••••••' && masked[2].hasSecret === true,
    '1.5 Pre-masked webhook retains masked placeholder and hasSecret=true'
  );

  // 2. controlledMergeSettings secret preservation
  console.log('\n--- 2. STORE SETTINGS CONTROLLED MERGE SECRET PRESERVATION ---');
  const currentSettings = {
    ...INITIAL_SETTINGS,
    courierWebhooks: [
      {
        id: 'wh-1',
        name: 'Zapier Webhook',
        url: 'https://hooks.zapier.com/hooks/catch/123/abc',
        secret: 'actual_d1_stored_secret_key_12345',
        events: ['courier.added'],
        isActive: true,
        createdAt: '2026-03-01T00:00:00Z',
      },
    ],
  };

  // Client sends back masked secret '••••••••' during edit
  const mergedWithMasked = controlledMergeSettings(currentSettings, {
    courierWebhooks: [
      {
        id: 'wh-1',
        name: 'Updated Zapier Webhook Name',
        url: 'https://hooks.zapier.com/hooks/catch/123/abc',
        secret: '••••••••',
        events: ['courier.added', 'courier.dispatched'],
        isActive: true,
        createdAt: '2026-03-01T00:00:00Z',
      },
    ],
  });

  assert(
    mergedWithMasked.courierWebhooks?.[0].secret === 'actual_d1_stored_secret_key_12345',
    '2.1 controlledMergeSettings preserves existing real secret when client sends "••••••••"'
  );

  assert(
    mergedWithMasked.courierWebhooks?.[0].name === 'Updated Zapier Webhook Name',
    '2.2 Other updated fields (name, events) are updated correctly'
  );

  // Client enters a new secret
  const mergedWithNewSecret = controlledMergeSettings(currentSettings, {
    courierWebhooks: [
      {
        id: 'wh-1',
        name: 'Updated Name',
        url: 'https://hooks.zapier.com/hooks/catch/123/abc',
        secret: 'brand_new_secret_key_9999',
        events: ['courier.added'],
        isActive: true,
        createdAt: '2026-03-01T00:00:00Z',
      },
    ],
  });

  assert(
    mergedWithNewSecret.courierWebhooks?.[0].secret === 'brand_new_secret_key_9999',
    '2.3 controlledMergeSettings saves new secret when explicitly provided'
  );

  // 3. Password signature cryptographic entropy
  console.log('\n--- 3. PASSWORD SIGNATURE ENTROPY & INTEGRITY ---');
  const sampleHash1 = 'pbkdf2:100000:a1b2c3d4e5f607182930415263748596:9876543210abcdef0123456789abcdef';
  const sampleHash2 = 'pbkdf2:100000:a1b2c3d4e5f607182930415263748596:00000000000000000000000000000000';

  const sig1 = await computePasswordSignature(sampleHash1);
  const sig2 = await computePasswordSignature(sampleHash2);

  assert(
    typeof sig1 === 'string' && sig1.length === 32,
    '3.1 computePasswordSignature produces 32-hex-character (128-bit) signature'
  );

  assert(
    sig1 !== sig2,
    '3.2 Different password hashes produce different signatures even with identical salt prefix'
  );

  // 4. Live Localhost Dev Server Endpoints
  console.log('\n--- 4. DEV SERVER LIVE API ENDPOINT PROTECTION ---');
  const baseUrl = 'http://127.0.0.1:3000';

  // 4.1 GET /api/courier/webhooks without auth -> 401
  const unauthGetRes = await fetch(`${baseUrl}/api/courier/webhooks`);
  assert(
    unauthGetRes.status === 401,
    '4.1 GET /api/courier/webhooks returns HTTP 401 Unauthorized when unauthenticated'
  );

  // 4.2 GET /api/courier/webhooks/logs without auth -> 401
  const unauthLogsRes = await fetch(`${baseUrl}/api/courier/webhooks/logs`);
  assert(
    unauthLogsRes.status === 401,
    '4.2 GET /api/courier/webhooks/logs returns HTTP 401 Unauthorized when unauthenticated'
  );

  // 4.3 GET /api/settings without auth does not leak courierWebhooks
  const publicSettingsRes = await fetch(`${baseUrl}/api/settings`);
  const publicSettingsJson = await publicSettingsRes.json();
  assert(
    publicSettingsJson.success === true &&
    publicSettingsJson.settings.courierWebhooks === undefined &&
    publicSettingsJson.settings.steadfastApiKey === undefined &&
    publicSettingsJson.settings.steadfastSecretKey === undefined,
    '4.3 Public /api/settings response completely excludes courierWebhooks and courier API credentials'
  );

  // 4.4 GET /api/courier/webhooks with non-privileged staff auth -> 403 Forbidden
  const staffToken = await getTestStaffToken(baseUrl);
  const customerGetRes = await fetch(`${baseUrl}/api/courier/webhooks`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  assert(
    customerGetRes.status === 403,
    '4.4 GET /api/courier/webhooks returns HTTP 403 Forbidden for accounts without courier.configure permission'
  );

  // 4.5 GET /api/courier/webhooks with admin auth -> 200 with masked secrets
  const adminToken = await getTestAdminToken(baseUrl);
  const adminGetRes = await fetch(`${baseUrl}/api/courier/webhooks`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminGetJson = await adminGetRes.json();
  assert(
    adminGetRes.status === 200 && adminGetJson.success === true && Array.isArray(adminGetJson.webhooks),
    '4.5 GET /api/courier/webhooks returns HTTP 200 and webhooks array for authorized admin'
  );

  const rawSecretsExposed = (adminGetJson.webhooks || []).some((w: any) => w.secret && w.secret !== '••••••••');
  assert(
    !rawSecretsExposed,
    '4.6 Admin API response contains ZERO unmasked webhook secrets'
  );

  // 4.6 PUT /api/users/:id self-update password requires current password confirmation
  const userUpdateWithoutCurrentPw = await fetch(`${baseUrl}/api/users/dev-super-admin-1`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      password: 'new_unauthorized_password_123',
    }),
  });
  assert(
    userUpdateWithoutCurrentPw.status === 400,
    '4.7 PUT /api/users/:id returns HTTP 400 when attempting self-service password update without current password'
  );

  // ================================================================
  // 5. COMPLETE SEPARATION OF ADMIN_SECRET FROM WEBHOOK AUTHENTICATION
  // ================================================================
  console.log('\n--- 5. ADMIN_SECRET STRICT ISOLATION FROM WEBHOOK AUTHENTICATION ---');

  // 5.1 Unit Level Isolation: verifyCourierWebhookAuth with isolated mock environment
  const mockAdminSecret = 'test-isolated-admin-secret-99999-exclusive';
  const mockCourierSecret = 'test-dedicated-courier-webhook-secret-12345';
  const mockIsolationEnv = {
    ADMIN_SECRET: mockAdminSecret,
    COURIER_WEBHOOK_SECRET: mockCourierSecret,
  };

  const testPayload = JSON.stringify({ consignment_id: 'TEST-ISO-1', status: 'delivered' });
  const testIsoTimestamp = Date.now().toString();

  // Test 5.1: ADMIN_SECRET passed as X-Webhook-Secret must be REJECTED (401)
  const resUnitAdminSecret = await verifyCourierWebhookAuth(
    {
      rawBody: testPayload,
      headers: {
        'x-webhook-secret': mockAdminSecret,
        'x-webhook-timestamp': testIsoTimestamp,
      },
    },
    mockIsolationEnv as any
  );
  assert(
    resUnitAdminSecret.authenticated === false && resUnitAdminSecret.status === 401,
    '5.1 verifyCourierWebhookAuth REJECTS ADMIN_SECRET provided via x-webhook-secret header (authenticated: false, 401)'
  );

  // Test 5.2: HMAC signature computed with ADMIN_SECRET must be REJECTED (401)
  const adminSignedSig = await computeHmacSha256Hex(mockAdminSecret, `${testIsoTimestamp}.${testPayload}`);
  const resUnitAdminSig = await verifyCourierWebhookAuth(
    {
      rawBody: testPayload,
      headers: {
        'x-webhook-signature': `sha256=${adminSignedSig}`,
        'x-webhook-timestamp': testIsoTimestamp,
      },
    },
    mockIsolationEnv as any
  );
  assert(
    resUnitAdminSig.authenticated === false && resUnitAdminSig.status === 401,
    '5.2 verifyCourierWebhookAuth REJECTS HMAC signature generated with ADMIN_SECRET (authenticated: false, 401)'
  );

  // Test 5.3: Dedicated COURIER_WEBHOOK_SECRET provided via header must be ACCEPTED (200)
  const resUnitCourierSecret = await verifyCourierWebhookAuth(
    {
      rawBody: testPayload,
      headers: {
        'x-webhook-secret': mockCourierSecret,
        'x-webhook-timestamp': testIsoTimestamp,
      },
    },
    mockIsolationEnv as any
  );
  assert(
    resUnitCourierSecret.authenticated === true && resUnitCourierSecret.status === 200,
    '5.3 verifyCourierWebhookAuth ACCEPTS dedicated COURIER_WEBHOOK_SECRET provided via x-webhook-secret header (200)'
  );

  // Test 5.4: Dedicated COURIER_WEBHOOK_SECRET HMAC signature must be ACCEPTED (200)
  const courierSignedSig = await computeHmacSha256Hex(mockCourierSecret, `${testIsoTimestamp}.${testPayload}`);
  const resUnitCourierSig = await verifyCourierWebhookAuth(
    {
      rawBody: testPayload,
      headers: {
        'x-webhook-signature': `sha256=${courierSignedSig}`,
        'x-webhook-timestamp': testIsoTimestamp,
      },
    },
    mockIsolationEnv as any
  );
  assert(
    resUnitCourierSig.authenticated === true && resUnitCourierSig.status === 200,
    '5.4 verifyCourierWebhookAuth ACCEPTS valid HMAC signature generated with COURIER_WEBHOOK_SECRET (200)'
  );

  // Test 5.5: Invalid arbitrary secret must be REJECTED (401)
  const resUnitInvalidSecret = await verifyCourierWebhookAuth(
    {
      rawBody: testPayload,
      headers: {
        'x-webhook-secret': 'completely-wrong-unconfigured-secret-999',
        'x-webhook-timestamp': testIsoTimestamp,
      },
    },
    mockIsolationEnv as any
  );
  assert(
    resUnitInvalidSecret.authenticated === false && resUnitInvalidSecret.status === 401,
    '5.5 verifyCourierWebhookAuth REJECTS invalid/unconfigured webhook secret (authenticated: false, 401)'
  );

  // Test 5.6: Accidental settings secret equal to ADMIN_SECRET is purged and REJECTED
  const resAccidentalSettings = await verifyCourierWebhookAuth(
    {
      rawBody: testPayload,
      headers: {
        'x-webhook-secret': mockAdminSecret,
        'x-webhook-timestamp': testIsoTimestamp,
      },
    },
    mockIsolationEnv as any,
    {
      courierWebhooks: [{ id: 'accidental', url: 'https://example.com', secret: mockAdminSecret, isActive: true }],
    }
  );
  assert(
    resAccidentalSettings.authenticated === false && resAccidentalSettings.status === 401,
    '5.6 Accidental courierWebhooks setting equal to ADMIN_SECRET is purged and strictly REJECTED (401)'
  );

  // 5.2 Live HTTP Endpoint Tests on /api/webhook/steadfast
  const serverAdminSecret = process.env.ADMIN_SECRET || 'dev-secret-local-admin';
  const serverCourierSecret = process.env.COURIER_WEBHOOK_SECRET || 'dev-courier-webhook-secret-999';

  const liveIsoTimestamp = Date.now().toString();
  const livePayload = JSON.stringify({
    consignment_id: 'ISO-LIVE-001',
    invoice: 'ORD-LIVE-001',
    tracking_code: 'TRK-LIVE-001',
    status: 'in_review',
    nonce: `iso-${Date.now()}`,
  });

  // Test 5.7: Live POST /api/webhook/steadfast with ADMIN_SECRET as X-Webhook-Secret -> 401
  const liveResAdminSecret = await fetch(`${baseUrl}/api/webhook/steadfast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': serverAdminSecret,
      'X-Webhook-Timestamp': liveIsoTimestamp,
    },
    body: livePayload,
  });
  assert(
    liveResAdminSecret.status === 401,
    '5.7 Live endpoint /api/webhook/steadfast REJECTS ADMIN_SECRET passed via X-Webhook-Secret (HTTP 401)'
  );

  // Test 5.8: Live POST /api/webhook/steadfast with ADMIN_SECRET as X-Courier-Secret -> 401
  const liveResAdminCourierHeader = await fetch(`${baseUrl}/api/webhook/steadfast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Courier-Secret': serverAdminSecret,
      'X-Webhook-Timestamp': liveIsoTimestamp,
    },
    body: livePayload,
  });
  assert(
    liveResAdminCourierHeader.status === 401,
    '5.8 Live endpoint /api/webhook/steadfast REJECTS ADMIN_SECRET passed via X-Courier-Secret (HTTP 401)'
  );

  // Test 5.9: Live POST /api/webhook/steadfast with ADMIN_SECRET as Bearer token -> 401
  const liveResAdminBearer = await fetch(`${baseUrl}/api/webhook/steadfast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverAdminSecret}`,
      'X-Webhook-Timestamp': liveIsoTimestamp,
    },
    body: livePayload,
  });
  assert(
    liveResAdminBearer.status === 401,
    '5.9 Live endpoint /api/webhook/steadfast REJECTS ADMIN_SECRET passed via Authorization Bearer header (HTTP 401)'
  );

  // Test 5.10: Live POST /api/webhook/steadfast with HMAC signature computed with ADMIN_SECRET -> 401
  const liveAdminSig = await computeHmacSha256Hex(serverAdminSecret, `${liveIsoTimestamp}.${livePayload}`);
  const liveResAdminSig = await fetch(`${baseUrl}/api/webhook/steadfast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${liveAdminSig}`,
      'X-Webhook-Timestamp': liveIsoTimestamp,
    },
    body: livePayload,
  });
  assert(
    liveResAdminSig.status === 401,
    '5.10 Live endpoint /api/webhook/steadfast REJECTS HMAC signature generated with ADMIN_SECRET (HTTP 401)'
  );

  // Test 5.11: Live POST /api/webhook/steadfast with valid COURIER_WEBHOOK_SECRET -> 200
  const liveCourierTimestamp = (Date.now() + 100).toString();
  const liveCourierPayload = JSON.stringify({
    consignment_id: 'ISO-LIVE-002',
    invoice: 'ORD-LIVE-002',
    tracking_code: 'TRK-LIVE-002',
    status: 'in_review',
    nonce: `iso-courier-${Date.now()}`,
  });
  const liveCourierSig = await computeHmacSha256Hex(serverCourierSecret, `${liveCourierTimestamp}.${liveCourierPayload}`);
  const liveResCourier = await fetch(`${baseUrl}/api/webhook/steadfast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${liveCourierSig}`,
      'X-Webhook-Timestamp': liveCourierTimestamp,
    },
    body: liveCourierPayload,
  });
  assert(
    liveResCourier.status === 200,
    '5.11 Live endpoint /api/webhook/steadfast ACCEPTS valid HMAC signature generated with dedicated COURIER_WEBHOOK_SECRET (HTTP 200)'
  );

  // Test 5.12: Live POST /api/webhook/steadfast with invalid secret -> 401
  const liveResInvalid = await fetch(`${baseUrl}/api/webhook/steadfast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': 'invalid-bogus-secret-8888',
      'X-Webhook-Timestamp': liveCourierTimestamp,
    },
    body: liveCourierPayload,
  });
  assert(
    liveResInvalid.status === 401,
    '5.12 Live endpoint /api/webhook/steadfast REJECTS invalid secret (HTTP 401)'
  );

  // Test 5.13: Legitimate Admin Authentication is NOT broken and continues to work normally
  const adminMeRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminMeJson = await adminMeRes.json().catch(() => ({}));
  assert(
    adminMeRes.status === 200 && adminMeJson.success === true && adminMeJson.user?.role === 'super_admin',
    '5.13 Legitimate Admin Authentication (/api/auth/me) continues to function perfectly with verified admin session'
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCourierSecurityTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
