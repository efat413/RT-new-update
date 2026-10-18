import {
  getFacebookConfigStatus,
  sendMetaMessengerMessage,
  handleMetaWebhookHandshake,
  handleMetaWebhookEvent,
} from '../src/server/facebookMessenger';
import { Env } from '../src/server/types';
import { computeHmacSha256Hex } from '../src/server/webhookAuth';

async function runBroadcasterVerification() {
  console.log('--- STARTING FACEBOOK BROADCASTER VERIFICATION ---');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean) {
    if (condition) {
      console.log(`✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. Secret Protection & Readiness Status
  const unconfiguredEnv: Env = {
    DB: {} as any,
    JWT_SECRET: 'test-secret-min-32-chars-long-security',
  };
  const statusUnconfigured = getFacebookConfigStatus(unconfiguredEnv);
  assert('Unconfigured env detects missing credentials safely', !statusUnconfigured.isConfigured);
  assert('Missing requirements guide user to set Worker secrets', statusUnconfigured.missingRequirements.length >= 3);

  const configuredEnv: Env = {
    DB: {} as any,
    JWT_SECRET: 'test-secret-min-32-chars-long-security',
    FB_PAGE_ACCESS_TOKEN: 'EAABfakeAccessTokenForTestingPolicyGuards1234567890',
    FB_APP_SECRET: 'supersecretappsecretkey123456789',
    FB_PAGE_ID: '104829104820194',
    FB_WEBHOOK_VERIFY_TOKEN: 'rongdhonu_webhook_verify_token_2026',
  };
  const statusConfigured = getFacebookConfigStatus(configuredEnv);
  assert('Configured env detects complete status without leaking token', statusConfigured.isConfigured);
  assert('Page ID is exposed non-sensitively', statusConfigured.pageId === '104829104820194');

  // 2. Meta 24-Hour Policy Guard Enforcement
  const outside24Untagged = await sendMetaMessengerMessage(
    {
      recipientPsid: 'psid_user_test_9999',
      text: 'Special discount just for you!',
      tag: 'NONE',
      isWithin24Hours: false,
    },
    configuredEnv
  );
  assert('Meta 24h Policy blocks untagged message outside window', outside24Untagged.policyBlocked === true);
  assert('Policy error message is accurate', outside24Untagged.status === 403);

  // 3. Allowed Message Tag outside 24h
  // In dev / test with dummy credentials, it attempts Graph API and fails with Auth, but passes policy guard
  const outside24Tagged = await sendMetaMessengerMessage(
    {
      recipientPsid: 'psid_user_test_9999',
      text: 'Your order RT-99201 is confirmed and dispatched via Steadfast.',
      tag: 'POST_PURCHASE_UPDATE',
      isWithin24Hours: false,
    },
    configuredEnv
  );
  assert('Tagged message passes policy check without policyBlocked flag', !outside24Tagged.policyBlocked);

  // 4. Input validation (Empty PSID / Empty text)
  const emptyPsid = await sendMetaMessengerMessage(
    {
      recipientPsid: '',
      text: 'Hello',
    },
    configuredEnv
  );
  assert('Empty PSID rejected with 400', emptyPsid.status === 400);

  const emptyText = await sendMetaMessengerMessage(
    {
      recipientPsid: 'psid_valid_123',
      text: '',
    },
    configuredEnv
  );
  assert('Empty text rejected with 400', emptyText.status === 400);

  // 5. Meta Webhook Handshake (GET)
  const validUrl = new URL('https://example.com/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=rongdhonu_webhook_verify_token_2026&hub.challenge=test_challenge_12345');
  const handshakeSuccess = handleMetaWebhookHandshake(validUrl, configuredEnv);
  assert('Webhook challenge response status is 200', handshakeSuccess.status === 200);
  const challengeBody = await handshakeSuccess.text();
  assert('Webhook challenge matches expected hub.challenge', challengeBody === 'test_challenge_12345');

  const invalidUrl = new URL('https://example.com/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test_challenge_12345');
  const handshakeFail = handleMetaWebhookHandshake(invalidUrl, configuredEnv);
  assert('Invalid verify token is rejected with 403', handshakeFail.status === 403);

  // 6. Meta Webhook Delivery Signature Verification (POST)
  const webhookBody = JSON.stringify({
    object: 'page',
    entry: [
      {
        id: '104829104820194',
        time: 1729267200,
        messaging: [
          {
            sender: { id: '104829104820194' },
            recipient: { id: 'psid_user_test_9999' },
            timestamp: 1729267201,
            delivery: {
              mids: ['mid.1458668856286:234567890a'],
              watermark: 1729267201,
            },
          },
        ],
      },
    ],
  });

  const validSignature = await computeHmacSha256Hex(configuredEnv.FB_APP_SECRET!, webhookBody);
  const validWebhookReq = new Request('https://example.com/api/webhooks/facebook', {
    method: 'POST',
    headers: {
      'x-hub-signature-256': `sha256=${validSignature}`,
      'content-type': 'application/json',
    },
    body: webhookBody,
  });

  const webhookResult = await handleMetaWebhookEvent(validWebhookReq, webhookBody, configuredEnv);
  assert('Webhook signature verified and delivery events parsed', webhookResult.success === true);
  assert('Delivery event has type=delivery and watermark', webhookResult.events?.[0]?.type === 'delivery');
  assert('Delivery MID captured', webhookResult.events?.[0]?.mids?.[0] === 'mid.1458668856286:234567890a');

  // Tampered signature test
  const tamperedWebhookReq = new Request('https://example.com/api/webhooks/facebook', {
    method: 'POST',
    headers: {
      'x-hub-signature-256': `sha256=invalidtamperedhash123456789`,
      'content-type': 'application/json',
    },
    body: webhookBody,
  });
  const tamperedResult = await handleMetaWebhookEvent(tamperedWebhookReq, webhookBody, configuredEnv);
  assert('Tampered webhook signature rejected with 401', tamperedResult.status === 401);

  console.log('--------------------------------------------------');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

runBroadcasterVerification().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
