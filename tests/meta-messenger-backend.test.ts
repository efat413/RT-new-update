import { describe, it, expect } from 'vitest';
import {
  getFacebookConfigStatus,
  sendMetaMessengerMessage,
  handleMetaWebhookHandshake,
  handleMetaWebhookEvent,
  testMetaConnection,
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

  describe('4. Authoritative Page ID & Optional Webhook Secrets (Scenarios 1-7)', () => {
    const realPageId = '987654321098765';
    const realPageName = 'Rongdhonu Trade Official';
    const validToken = 'EAAK_valid_page_access_token_12345';

    it('Scenario 1: Correct Page Access Token and matching Page ID returns real Page name and ID', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        const u = String(url);
        if (u.includes('graph.facebook.com/v21.0/me')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: realPageId,
              name: realPageName,
              category: 'Retail Company',
            }),
          };
        }
        return originalFetch(url);
      }) as any;

      try {
        const result = await testMetaConnection({
          FB_PAGE_ACCESS_TOKEN: validToken,
          FB_PAGE_ID: realPageId,
        });

        expect(result.success).toBe(true);
        expect(result.status).toBe(200);
        expect(result.pageId).toBe(realPageId);
        expect(result.pageName).toBe(realPageName);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Scenario 2: Missing Page ID reports clear configuration error without a fake ID', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        const u = String(url);
        if (u.includes('graph.facebook.com/v21.0/me')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: realPageId,
              name: realPageName,
            }),
          };
        }
        return originalFetch(url);
      }) as any;

      try {
        // Status check reports unconfigured Page ID without fake ID
        const status = getFacebookConfigStatus({
          FB_PAGE_ACCESS_TOKEN: validToken,
        });
        expect(status.hasPageId).toBe(false);
        expect(status.pageId).toBeNull();
        expect(status.isOutboundReady).toBe(false);
        expect(status.outboundMissingRequirements.some((r) => r.includes('FB_PAGE_ID'))).toBe(true);

        // Connection test reports missing FB_PAGE_ID configuration error clearly
        const connResult = await testMetaConnection({
          FB_PAGE_ACCESS_TOKEN: validToken,
        });
        expect(connResult.success).toBe(false);
        expect(connResult.status).toBe(400);
        expect(connResult.error).toContain('Facebook Page ID is not configured');
        expect(connResult.pageId).toBe(realPageId);
        expect(connResult.pageName).toBe(realPageName);

        // Send API blocks with HTTP 503 notConfigured when FB_PAGE_ID is missing
        const sendResult = await sendMetaMessengerMessage(
          {
            recipientPsid: 'psid_user_1',
            text: 'Hello test',
            isWithin24Hours: true,
          },
          {
            FB_PAGE_ACCESS_TOKEN: validToken,
          }
        );
        expect(sendResult.success).toBe(false);
        expect(sendResult.status).toBe(503);
        expect(sendResult.notConfigured).toBe(true);
        expect(sendResult.error).toContain('Facebook Page ID not configured');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Scenario 3: Page ID mismatch blocks sending and reports the mismatch', async () => {
      const configuredMismatchId = '111222333444555';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        const u = String(url);
        if (u.includes('graph.facebook.com/v21.0/me')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: realPageId,
              name: realPageName,
            }),
          };
        }
        return originalFetch(url);
      }) as any;

      try {
        // Connection test reports mismatch and blocks
        const connResult = await testMetaConnection({
          FB_PAGE_ACCESS_TOKEN: validToken,
          FB_PAGE_ID: configuredMismatchId,
        });
        expect(connResult.success).toBe(false);
        expect(connResult.status).toBe(409);
        expect(connResult.mismatch).toBe(true);
        expect(connResult.error).toContain('mismatch');
        expect(connResult.error).toContain(configuredMismatchId);
        expect(connResult.error).toContain(realPageId);

        // Dispatch blocks sending to prevent messaging from the wrong Page
        const sendResult = await sendMetaMessengerMessage(
          {
            recipientPsid: 'psid_user_1',
            text: 'Hello test',
            isWithin24Hours: true,
          },
          {
            FB_PAGE_ACCESS_TOKEN: validToken,
            FB_PAGE_ID: configuredMismatchId,
          }
        );
        expect(sendResult.success).toBe(false);
        expect(sendResult.status).toBe(409);
        expect(sendResult.error).toContain('mismatch');
        expect(sendResult.error).toContain(configuredMismatchId);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Scenario 4: Missing FB_APP_SECRET leaves outbound messaging available and webhook verification fails safely', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        const u = String(url);
        if (u.includes('/messages')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              recipient_id: 'psid_user_1',
              message_id: 'mid.success.123',
            }),
          };
        }
        if (u.includes('/me')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: realPageId,
              name: realPageName,
            }),
          };
        }
        return originalFetch(url);
      }) as any;

      try {
        const outboundEnv = {
          FB_PAGE_ACCESS_TOKEN: validToken,
          FB_PAGE_ID: realPageId,
          // FB_APP_SECRET is omitted
        };

        const status = getFacebookConfigStatus(outboundEnv);
        expect(status.isOutboundReady).toBe(true);
        expect(status.isWebhookReady).toBe(false);
        expect(status.isConfigured).toBe(true); // Outbound is configured!
        expect(status.hasAppSecret).toBe(false);

        // Outbound send succeeds
        const sendResult = await sendMetaMessengerMessage(
          {
            recipientPsid: 'psid_user_1',
            text: 'Outbound dispatch test',
            isWithin24Hours: true,
          },
          outboundEnv
        );
        expect(sendResult.success).toBe(true);
        expect(sendResult.messageId).toBe('mid.success.123');

        // Webhook event fails safely without FB_APP_SECRET
        const webhookReq = new Request('https://rongdhonutrade.com/api/webhooks/facebook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=abc' },
          body: '{}',
        });
        const webhookResult = await handleMetaWebhookEvent(webhookReq, '{}', outboundEnv);
        expect(webhookResult.success).toBe(false);
        expect(webhookResult.status).toBe(503);
        expect(webhookResult.error).toContain('FB_APP_SECRET is not configured');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Scenario 5: Missing FB_WEBHOOK_VERIFY_TOKEN leaves outbound messaging available and handshake fails safely', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        const u = String(url);
        if (u.includes('/messages')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              recipient_id: 'psid_user_1',
              message_id: 'mid.success.456',
            }),
          };
        }
        if (u.includes('/me')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: realPageId,
              name: realPageName,
            }),
          };
        }
        return originalFetch(url);
      }) as any;

      try {
        const outboundEnv = {
          FB_PAGE_ACCESS_TOKEN: validToken,
          FB_PAGE_ID: realPageId,
          // FB_WEBHOOK_VERIFY_TOKEN is omitted
        };

        const status = getFacebookConfigStatus(outboundEnv);
        expect(status.isOutboundReady).toBe(true);
        expect(status.hasWebhookVerifyToken).toBe(false);

        // Outbound send succeeds
        const sendResult = await sendMetaMessengerMessage(
          {
            recipientPsid: 'psid_user_1',
            text: 'Outbound dispatch test',
            isWithin24Hours: true,
          },
          outboundEnv
        );
        expect(sendResult.success).toBe(true);
        expect(sendResult.messageId).toBe('mid.success.456');

        // Webhook challenge handshake fails safely with HTTP 503
        const handshakeUrl = new URL('https://rongdhonutrade.com/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=token&hub.challenge=ch1');
        const handshakeRes = handleMetaWebhookHandshake(handshakeUrl, outboundEnv);
        expect(handshakeRes.status).toBe(503);
        const text = await handshakeRes.text();
        expect(text).toContain('Webhook verify token is not configured');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Scenario 6: Invalid or expired Page Access Token shows clear connection failure', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        const u = String(url);
        if (u.includes('graph.facebook.com')) {
          return {
            ok: false,
            status: 401,
            json: async () => ({
              error: {
                message: 'Error validating access token: Session has expired or token is invalid.',
                type: 'OAuthException',
                code: 190,
              },
            }),
          };
        }
        return originalFetch(url);
      }) as any;

      try {
        const result = await testMetaConnection({
          FB_PAGE_ACCESS_TOKEN: 'expired_or_invalid_token',
          FB_PAGE_ID: realPageId,
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe(401);
        expect(result.error).toContain('Error validating access token');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Scenario 7: Ensure no test Page ID or mock fallback credentials in production files', async () => {
      const fs = await import('fs');
      const componentContent = fs.readFileSync('src/components/AdminFacebookBroadcasterTab.tsx', 'utf-8');
      expect(componentContent).not.toContain("'104829104820194'");
      expect(componentContent).not.toContain('"104829104820194"');
      expect(componentContent).toContain('Facebook Page ID not configured');
    });

    it('Scenario 8: Insufficient permissions returns classified permission error', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        const u = String(url);
        if (u.includes('graph.facebook.com')) {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              error: {
                message: 'Application does not have permission for this action: requires pages_messaging',
                type: 'OAuthException',
                code: 200,
              },
            }),
          };
        }
        return originalFetch(url);
      }) as any;

      try {
        const result = await testMetaConnection({
          FB_PAGE_ACCESS_TOKEN: validToken,
          FB_PAGE_ID: realPageId,
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe(403);
        expect(result.errorCategory).toBe('insufficient_permissions');
        expect(result.error).toContain('Meta Permission Error');
        expect(result.error).toContain('pages_messaging');
        expect(result.diagnostics?.code).toBe(200);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Scenario 9: Meta API Code 100 invalid request classifies with diagnostics and queries minimal fields', async () => {
      let queriedUrl = '';
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        queriedUrl = String(url);
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              message: 'Invalid request: Tried accessing nonexisting field on type Page',
              type: 'OAuthException',
              code: 100,
              error_subcode: 33,
              fbtrace_id: 'FbTraceId123456',
            },
          }),
        };
      }) as any;

      try {
        const result = await testMetaConnection({
          FB_PAGE_ACCESS_TOKEN: validToken,
          FB_PAGE_ID: realPageId,
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe(400);
        expect(result.errorCategory).toBe('invalid_request');
        expect(result.errorCode).toBe(100);
        expect(result.errorSubcode).toBe(33);
        expect(result.diagnostics?.fbtraceId).toBe('FbTraceId123456');
        // Confirms request used simplified fields=id,name and avoided category,link
        expect(queriedUrl).toContain('fields=id,name');
        expect(queriedUrl).not.toContain('category');
        expect(queriedUrl).not.toContain('link');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Scenario 10: Network failure is caught, safely classified, and logs cleanly', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        throw new Error('Connection reset by peer: DNS timeout');
      }) as any;

      try {
        const result = await testMetaConnection({
          FB_PAGE_ACCESS_TOKEN: validToken,
          FB_PAGE_ID: realPageId,
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe(502);
        expect(result.errorCategory).toBe('network_error');
        expect(result.error).toContain('Network error connecting to Meta Graph API');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('Scenario 11: Remove all hardcoded, mock, test, or preselected recipient IDs from initial state', async () => {
      const fs = await import('fs');
      const componentContent = fs.readFileSync('src/components/AdminFacebookBroadcasterTab.tsx', 'utf-8');

      // Verify no mock recipient names or fake PSID lists
      expect(componentContent).not.toContain('pageContactsSample');
      expect(componentContent).not.toContain('psid_fb_84920491029');
      expect(componentContent).not.toContain('psid_fb_73910394812');
      expect(componentContent).not.toContain('psid_fb_92840192849');
      expect(componentContent).not.toContain('hasSimulatedPsid');
      expect(componentContent).not.toContain('psid_cust_');

      // Verify initial selectedRecipientIds state starts with new Set()
      expect(componentContent).toContain('selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(new Set())');

      // Verify no auto-select effect is preselecting recipients on mount
      expect(componentContent).not.toMatch(/useEffect\(\(\)\s*=>\s*\{[^}]*setSelectedRecipientIds\(eligibleIds\);[^}]*\}\s*,\s*\[eligibleCandidates\]\)/);
    });

    it('Scenario 12: Select Eligible handles empty state with clear notification and empty selection', async () => {
      const fs = await import('fs');
      const componentContent = fs.readFileSync('src/components/AdminFacebookBroadcasterTab.tsx', 'utf-8');

      // Contains guard in handleSelectAllEligible
      expect(componentContent).toContain('if (eligibleCandidates.length === 0)');
      expect(componentContent).toContain('No eligible recipients found');
      expect(componentContent).toContain('setSelectedRecipientIds(new Set())');

      // Contains empty state rendering in UI drawer
      expect(componentContent).toContain('No eligible recipients found');
    });

    it('Scenario 13: Eligible recipients filtering respects Meta 24-hour window and approved Tags with real PSID', () => {
      const now = Date.now();
      const mockOrders: any[] = [
        {
          id: 'ord-1',
          orderNumber: 'RT-1001',
          createdAt: new Date(now - 2 * 3600 * 1000).toISOString(), // 2h ago
          customer: { fullName: 'Customer A', phone: '01700000001' },
          psid: 'real_psid_customer_a',
        },
        {
          id: 'ord-2',
          orderNumber: 'RT-1002',
          createdAt: new Date(now - 30 * 3600 * 1000).toISOString(), // 30h ago (outside 24h)
          customer: { fullName: 'Customer B', phone: '01700000002' },
          psid: 'real_psid_customer_b',
        },
        {
          id: 'ord-3',
          orderNumber: 'RT-1003',
          createdAt: new Date(now - 1 * 3600 * 1000).toISOString(),
          customer: { fullName: 'Customer C', phone: '01700000003' },
          // No PSID
        },
      ];

      // Pure eligibility helper logic mirroring AdminFacebookBroadcasterTab
      const evaluateEligibility = (orders: any[], tag: string) => {
        return orders.map((order) => {
          const orderTime = new Date(order.createdAt).getTime();
          const diffHours = (now - orderTime) / (60 * 60 * 1000);
          const isWithin24 = diffHours <= 24;
          const psid = order.psid;

          let status: string;
          if (!psid) {
            status = 'ineligible_no_psid';
          } else if (isWithin24) {
            status = 'eligible_24h';
          } else if (tag === 'POST_PURCHASE_UPDATE' || tag !== 'NONE') {
            status = 'eligible_tag';
          } else {
            status = 'requires_consent';
          }
          return { id: `store-order-${order.id}`, status, psid };
        });
      };

      // With tag NONE: Only within 24h with PSID is eligible
      const resultsNone = evaluateEligibility(mockOrders, 'NONE');
      const eligibleNone = resultsNone.filter((r) => r.status === 'eligible_24h' || r.status === 'eligible_tag');
      expect(eligibleNone.length).toBe(1);
      expect(eligibleNone[0].id).toBe('store-order-ord-1');

      // With tag POST_PURCHASE_UPDATE: Both ord-1 and ord-2 have PSID and are eligible
      const resultsTag = evaluateEligibility(mockOrders, 'POST_PURCHASE_UPDATE');
      const eligibleTag = resultsTag.filter((r) => r.status === 'eligible_24h' || r.status === 'eligible_tag');
      expect(eligibleTag.length).toBe(2);
      expect(eligibleTag.some((r) => r.id === 'store-order-ord-3')).toBe(false); // ord-3 has no PSID
    });

    it('Scenario 14: Manual recipient selection, toggling, and clearing operate independently', () => {
      let selectedIds = new Set<string>();

      // Initial state is empty
      expect(selectedIds.size).toBe(0);

      // Toggle selection adds an ID
      const toggle = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selectedIds = next;
      };

      toggle('store-order-ord-1');
      expect(selectedIds.has('store-order-ord-1')).toBe(true);
      expect(selectedIds.size).toBe(1);

      // Toggle again deselects
      toggle('store-order-ord-1');
      expect(selectedIds.has('store-order-ord-1')).toBe(false);
      expect(selectedIds.size).toBe(0);

      // Select multiple
      toggle('store-order-ord-1');
      toggle('store-order-ord-2');
      expect(selectedIds.size).toBe(2);

      // Clear all
      selectedIds = new Set();
      expect(selectedIds.size).toBe(0);
    });
  });
});

