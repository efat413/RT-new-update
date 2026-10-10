import { describe, it, expect } from 'vitest';
import { verifyCourierWebhookAuth, computeHmacSha256Hex } from '../src/server/webhookAuth';

describe('Courier Webhook False-Positive Test-Ping Fix', () => {
  const secret = 'test-secret-12345';
  const mockEnv = { COURIER_WEBHOOK_SECRET: secret };

  it('does NOT classify a real delivery payload with courier object as a test ping', async () => {
    const timestamp = Date.now().toString();
    const rawBody = JSON.stringify({
      consignment_id: 'SF-12345',
      invoice: 'ORD-9999',
      status: 'delivered',
      courier: {
        name: 'Steadfast Courier',
        code: 'steadfast',
      },
    });

    // When static shared secret header without timestamp is sent for a real event,
    // verifyCourierWebhookAuth requires timestamp for replay protection (because it is NOT a test ping!).
    const resultNoTs = await verifyCourierWebhookAuth(
      {
        rawBody,
        headers: {
          'x-webhook-secret': secret,
        },
      },
      mockEnv
    );

    // If it were mistakenly classified as a test ping, it would bypass timestamp requirement and return authenticated: true.
    // Because it is correctly classified as a real event, it requires a timestamp!
    expect(resultNoTs.authenticated).toBe(false);
    expect(resultNoTs.error).toContain('Missing required courier webhook timestamp');

    // With timestamp and valid signature, it authenticates successfully
    const sig = await computeHmacSha256Hex(secret, `${timestamp}.${rawBody}`);
    const resultWithSig = await verifyCourierWebhookAuth(
      {
        rawBody,
        headers: {
          'x-webhook-timestamp': timestamp,
          'x-webhook-signature': `sha256=${sig}`,
        },
      },
      mockEnv
    );

    expect(resultWithSig.authenticated).toBe(true);
    expect(resultWithSig.status).toBe(200);
  });

  it('correctly classifies explicitly marked test pings even when courier metadata is present', async () => {
    const rawBody = JSON.stringify({
      ping: true,
      action: 'test_ping',
      courier: {
        name: 'Steadfast Courier',
      },
    });

    // Test ping allows static shared secret without timestamp header
    const result = await verifyCourierWebhookAuth(
      {
        rawBody,
        headers: {
          'x-webhook-secret': secret,
        },
      },
      mockEnv
    );

    expect(result.authenticated).toBe(true);
    expect(result.status).toBe(200);
  });

  it('rejects unauthenticated requests regardless of courier metadata', async () => {
    const rawBody = JSON.stringify({
      consignment_id: 'SF-12345',
      invoice: 'ORD-9999',
      status: 'delivered',
      courier: {
        name: 'Steadfast Courier',
      },
    });

    const result = await verifyCourierWebhookAuth(
      {
        rawBody,
        headers: {},
      },
      mockEnv
    );

    expect(result.authenticated).toBe(false);
    expect(result.status).toBe(401);
  });

  it('rejects tampered signatures on requests containing courier metadata', async () => {
    const timestamp = Date.now().toString();
    const rawBody = JSON.stringify({
      consignment_id: 'SF-12345',
      invoice: 'ORD-9999',
      status: 'delivered',
      courier: {
        name: 'Steadfast Courier',
      },
    });

    const result = await verifyCourierWebhookAuth(
      {
        rawBody,
        headers: {
          'x-webhook-timestamp': timestamp,
          'x-webhook-signature': 'sha256=invalidfakesignature1234567890abcdef',
        },
      },
      mockEnv
    );

    expect(result.authenticated).toBe(false);
    expect(result.status).toBe(401);
  });
});
