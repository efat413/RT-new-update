import { describe, it, expect } from 'vitest';
import {
  getFacebookConfigStatus,
  sendMetaMessengerMessage,
  handleMetaWebhookHandshake,
  handleMetaWebhookEvent,
} from '../src/server/facebookMessenger';
import { computeHmacSha256Hex } from '../src/server/webhookAuth';

describe('Meta Messenger Backend Integration & Security Tests', () => {
  describe('1. Configuration & Readiness Checks', () => {
    it('detects unconfigured status and returns actionable setup commands without leaking secrets', () => {
      const status = getFacebookConfigStatus({});
      expect(status.isConfigured).toBe(false);
      expect(status.hasPageAccessToken).toBe(false);
      expect(status.hasAppSecret).toBe(false);
      expect(status.hasPageId).toBe(false);
      expect(status.missingRequirements.length).toBeGreaterThan(0);
      expect(status.policyNotes.some((n) => n.includes('24-Hour'))).toBe(true);
    });

    it('detects configured status when valid worker secrets are provided', () => {
      const status = getFacebookConfigStatus({
        FB_PAGE_ACCESS_TOKEN: 'EAAK...very_long_page_access_token_mock',
        FB_APP_SECRET: '38a92019482910482019482019482019',
        FB_PAGE_ID: '104829104820194',
        FB_WEBHOOK_VERIFY_TOKEN: 'verify-token-super-secret-999',
      });
      expect(status.isConfigured).toBe(true);
      expect(status.hasPageAccessToken).toBe(true);
      expect(status.hasAppSecret).toBe(true);
      expect(status.hasPageId).toBe(true);
      expect(status.pageId).toBe('104829104820194');
      expect(status.missingRequirements.length).toBe(0);
    });
  });

  describe('2. Meta 24-Hour Policy & Message Tag Enforcement', () => {
    it('rejects dispatch to recipient outside 24h window when no tag is selected (strict 24-hour rule)', async () => {
      const result = await sendMetaMessengerMessage(
        {
          recipientPsid: 'psid_test_123',
          text: 'Hello, special promo for you!',
          tag: 'NONE',
          isWithin24Hours: false,
        },
        {
          FB_PAGE_ACCESS_TOKEN: 'EAAK...token',
        }
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(403);
      expect(result.policyBlocked).toBe(true);
      expect(result.error).toContain('Meta Policy Guard');
    });

    it('rejects empty or missing PSID with HTTP 400', async () => {
      const result = await sendMetaMessengerMessage(
        {
          recipientPsid: '',
          text: 'Order update notification',
        },
        {}
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toContain('(PSID) is required');
    });

    it('rejects empty message text with HTTP 400', async () => {
      const result = await sendMetaMessengerMessage(
        {
          recipientPsid: 'psid_test_123',
          text: '   ',
        },
        {}
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toContain('Message text cannot be empty');
    });

    it('returns notConfigured error with HTTP 503 if FB_PAGE_ACCESS_TOKEN is missing', async () => {
      const result = await sendMetaMessengerMessage(
        {
          recipientPsid: 'psid_test_123',
          text: 'Hello test message',
          tag: 'POST_PURCHASE_UPDATE',
          isWithin24Hours: false,
        },
        {}
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe(503);
      expect(result.notConfigured).toBe(true);
      expect(result.error).toContain('FB_PAGE_ACCESS_TOKEN');
    });
  });

  describe('3. Meta Webhook Handshake & Signature Security', () => {
    const testSecret = 'test_meta_app_secret_1234567890abcdef';
    const verifyToken = 'test-challenge-verify-token-xyz';

    it('verifies Meta challenge handshake (GET) when hub.verify_token matches', async () => {
      const url = new URL('https://rongdhonutrade.com/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=test-challenge-verify-token-xyz&hub.challenge=11582012');
      const response = handleMetaWebhookHandshake(url, {
        FB_WEBHOOK_VERIFY_TOKEN: verifyToken,
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('11582012');
    });

    it('rejects Meta challenge handshake (GET) when verify token does not match', async () => {
      const url = new URL('https://rongdhonutrade.com/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=11582012');
      const response = handleMetaWebhookHandshake(url, {
        FB_WEBHOOK_VERIFY_TOKEN: verifyToken,
      });

      expect(response.status).toBe(403);
    });

    it('accepts and parses incoming delivery watermark event (POST) with valid HMAC-SHA256 signature', async () => {
      const rawPayload = JSON.stringify({
        object: 'page',
        entry: [
          {
            id: '104829104820194',
            time: 1729270000000,
            messaging: [
              {
                sender: { id: 'psid_user_999' },
                recipient: { id: '104829104820194' },
                timestamp: 1729270000000,
                delivery: {
                  mids: ['mid.1457764197618:41d102a3e1ae20024'],
                  watermark: 1729270000000,
                },
              },
            ],
          },
        ],
      });

      const signature = await computeHmacSha256Hex(testSecret, rawPayload);
      const request = new Request('https://rongdhonutrade.com/api/webhooks/facebook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${signature}`,
        },
        body: rawPayload,
      });

      const result = await handleMetaWebhookEvent(request, rawPayload, {
        FB_APP_SECRET: testSecret,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.events?.length).toBe(1);
      expect(result.events?.[0].type).toBe('delivery');
      expect(result.events?.[0].watermark).toBe(1729270000000);
    });

    it('rejects incoming webhook event (POST) when signature is invalid or tampered', async () => {
      const rawPayload = JSON.stringify({ object: 'page', entry: [] });
      const request = new Request('https://rongdhonutrade.com/api/webhooks/facebook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=invalid_tampered_signature_1234567890abcdef',
        },
        body: rawPayload,
      });

      const result = await handleMetaWebhookEvent(request, rawPayload, {
        FB_APP_SECRET: testSecret,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(401);
      expect(result.error).toContain('signature');
    });
  });
});
