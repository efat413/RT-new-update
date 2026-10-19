import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleApiRequest } from '../src/server/router';
import {
  getFacebookConfigStatus,
  sendMetaMessengerMessage,
  handleMetaWebhookHandshake,
  handleMetaWebhookEvent,
} from '../src/server/facebookMessenger';
import {
  createFacebookCampaignInD1,
  getFacebookCampaignByIdFromD1,
  updateFacebookCampaignStatusInD1,
  updateFacebookCampaignDelaysInD1,
  processNextCampaignQueueItemInD1,
  recordMetaDeliveryWatermarkInD1,
} from '../src/server/db';
import { Env, UserRow } from '../src/server/types';
import { createAuthToken, getAuthSecret } from '../src/server/auth';
import { computeHmacSha256Hex } from '../src/server/webhookAuth';

// Mock D1 Database for router & db integration tests
class ComprehensiveMockD1 {
  public tables = {
    fb_campaigns: new Map<string, any>(),
    fb_campaign_queue: new Map<string, any>(),
    fb_recipients: new Map<string, any>(),
    users: new Map<string, any>(),
    audit_logs: [] as any[],
  };

  constructor() {
    this.tables.users.set('admin-1', {
      id: 'admin-1',
      email: 'admin@rongdhonutrade.com',
      role: 'admin',
      password_hash: 'pbkdf2:600000:mockSaltHex:mockHashHex',
      full_name: 'Admin User',
      created_at: new Date().toISOString(),
    });
    this.tables.users.set('customer-1', {
      id: 'customer-1',
      email: 'customer@gmail.com',
      role: 'customer',
      password_hash: 'pbkdf2:600000:mockSaltHex:mockHashHex',
      full_name: 'Customer User',
      created_at: new Date().toISOString(),
    });
  }

  prepare(query: string) {
    const db = this;
    const clean = query.trim().replace(/\s+/g, ' ');

    const stmt = (args: any[] = []) => ({
      bind(...newArgs: any[]) {
        return stmt(newArgs);
      },

      async run() {
        if (clean.startsWith('CREATE TABLE') || clean.startsWith('CREATE INDEX') || clean.startsWith('CREATE UNIQUE INDEX')) {
          return { success: true, meta: { changes: 0 } };
        }

        if (clean.includes('INSERT INTO audit_logs')) {
          db.tables.audit_logs.push(args);
          return { success: true, meta: { changes: 1 } };
        }

        if (clean.includes('INSERT INTO fb_campaigns')) {
          const [id, name, audience_type, tag, message_template, min_delay, max_delay, total_queued, remaining_count, created_by] = args;
          db.tables.fb_campaigns.set(id, {
            id,
            name,
            audience_type,
            tag,
            message_template,
            status: 'draft',
            min_delay,
            max_delay,
            total_queued,
            accepted_count: 0,
            delivered_count: 0,
            skipped_count: 0,
            failed_count: 0,
            remaining_count,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (clean.includes('INSERT OR IGNORE INTO fb_campaign_queue')) {
          const [id, campaign_id, recipient_id, recipient_name, psid, phone, is_within_24h, has_consent, message_text] = args;
          const exists = Array.from(db.tables.fb_campaign_queue.values()).some(
            (q) => q.campaign_id === campaign_id && q.recipient_id === recipient_id
          );
          if (exists) return { success: true, meta: { changes: 0 } };

          db.tables.fb_campaign_queue.set(id, {
            id,
            campaign_id,
            recipient_id,
            recipient_name,
            psid,
            phone,
            is_within_24h,
            has_consent,
            message_text,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (clean.includes('UPDATE fb_campaigns SET min_delay = ?, max_delay = ?')) {
          const [minD, maxD, id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.min_delay = minD;
            row.max_delay = maxD;
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
        }

        if (clean.includes("UPDATE fb_campaigns SET status = 'paused'")) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.status = 'paused';
            return { success: true, meta: { changes: 1 } };
          }
        }

        if (clean.includes("UPDATE fb_campaigns SET status = 'running'")) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.status = 'running';
            return { success: true, meta: { changes: 1 } };
          }
        }

        if (clean.includes("UPDATE fb_campaign_queue SET status = 'cancelled'")) {
          const [cid] = args;
          for (const q of db.tables.fb_campaign_queue.values()) {
            if (q.campaign_id === cid && (q.status === 'pending' || q.status === 'processing')) {
              q.status = 'cancelled';
            }
          }
          return { success: true, meta: { changes: 1 } };
        }

        if (clean.includes("UPDATE fb_campaigns SET status = 'cancelled'")) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.status = 'cancelled';
            row.remaining_count = 0;
            return { success: true, meta: { changes: 1 } };
          }
        }

        if (clean.includes("UPDATE fb_campaign_queue SET status = 'processing'")) {
          const [id] = args;
          const q = db.tables.fb_campaign_queue.get(id);
          if (q && q.status === 'pending') {
            q.status = 'processing';
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        if (clean.includes("UPDATE fb_campaign_queue SET status = 'accepted'")) {
          const [mid, delay, id] = args;
          const q = db.tables.fb_campaign_queue.get(id);
          if (q) {
            q.status = 'accepted';
            q.meta_message_id = mid;
            q.delay_used_seconds = delay;
            return { success: true, meta: { changes: 1 } };
          }
        }

        if (clean.includes('UPDATE fb_campaigns SET accepted_count = accepted_count + 1')) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.accepted_count++;
            row.remaining_count = Math.max(0, row.remaining_count - 1);
            return { success: true, meta: { changes: 1 } };
          }
        }

        if (clean.includes("UPDATE fb_campaign_queue SET status = 'skipped'")) {
          const [reason, delay, id] = args;
          const q = db.tables.fb_campaign_queue.get(id);
          if (q) {
            q.status = 'skipped';
            q.skip_reason = reason;
            q.delay_used_seconds = delay;
            return { success: true, meta: { changes: 1 } };
          }
        }

        if (clean.includes('UPDATE fb_campaigns SET skipped_count = skipped_count + 1')) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.skipped_count++;
            row.remaining_count = Math.max(0, row.remaining_count - 1);
            return { success: true, meta: { changes: 1 } };
          }
        }

        if (clean.includes("UPDATE fb_campaign_queue SET status = 'delivered'")) {
          const [watermark, id] = args;
          const q = db.tables.fb_campaign_queue.get(id);
          if (q) {
            q.status = 'delivered';
            q.delivered_watermark = watermark;
            return { success: true, meta: { changes: 1 } };
          }
        }

        if (clean.includes('UPDATE fb_campaigns SET delivered_count = delivered_count + 1')) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.delivered_count++;
            return { success: true, meta: { changes: 1 } };
          }
        }

        if (clean.includes("UPDATE fb_campaigns SET status = 'completed'")) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.status = 'completed';
            row.remaining_count = 0;
            return { success: true, meta: { changes: 1 } };
          }
        }

        if (clean.includes('INSERT INTO fb_recipients')) {
          const [id, audience_type, name, psid, source, consent_status, consent_timestamp, consent_source, last_interaction_at, metadata] = args;
          db.tables.fb_recipients.set(id, {
            id,
            audience_type: audience_type || 'page_contacts',
            name: name || 'Messenger User',
            psid,
            source: source || 'facebook_messenger',
            consent_status: consent_status || 'consented',
            consent_timestamp,
            consent_source,
            last_interaction_at,
            metadata,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (clean.includes('UPDATE fb_recipients')) {
          const [name, psid, last_interaction_at, consent_timestamp, consent_source, metadata, id] = args;
          const row = db.tables.fb_recipients.get(id);
          if (row) {
            row.name = name || row.name;
            row.psid = psid;
            row.last_interaction_at = last_interaction_at;
            row.consent_timestamp = consent_timestamp;
            row.consent_source = consent_source || 'incoming_message';
            row.metadata = metadata;
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
        }

        return { success: true, meta: { changes: 0 } };
      },

      async first<T = any>() {
        if (clean.includes('SELECT * FROM users')) {
          const [emailOrId, fallbackId] = args;
          for (const user of db.tables.users.values()) {
            if (
              user.email.toLowerCase() === String(emailOrId).toLowerCase() ||
              user.id === emailOrId ||
              user.id === fallbackId
            ) {
              return user as unknown as T;
            }
          }
          return null as unknown as T;
        }

        if (clean.includes('SELECT * FROM fb_campaigns WHERE id = ?') || clean.includes('SELECT remaining_count FROM fb_campaigns WHERE id = ?')) {
          const [id] = args;
          return (db.tables.fb_campaigns.get(id) || null) as unknown as T;
        }

        if (clean.includes("SELECT * FROM fb_campaign_queue WHERE campaign_id = ? AND status = 'pending'")) {
          const [cid] = args;
          for (const q of db.tables.fb_campaign_queue.values()) {
            if (q.campaign_id === cid && q.status === 'pending') return q as unknown as T;
          }
          return null as unknown as T;
        }

        if (clean.includes("status = 'processing'")) {
          const [cid] = args;
          let count = 0;
          for (const q of db.tables.fb_campaign_queue.values()) {
            if (q.campaign_id === cid && q.status === 'processing') count++;
          }
          return { count } as unknown as T;
        }

        if (clean.includes("status IN ('pending', 'processing')")) {
          const [cid] = args;
          let count = 0;
          for (const q of db.tables.fb_campaign_queue.values()) {
            if (q.campaign_id === cid && (q.status === 'pending' || q.status === 'processing')) count++;
          }
          return { count } as unknown as T;
        }

        if (clean.includes('WHERE meta_message_id = ?')) {
          const [mid] = args;
          for (const q of db.tables.fb_campaign_queue.values()) {
            if (q.meta_message_id === mid) return { id: q.id, campaign_id: q.campaign_id, status: q.status } as unknown as T;
          }
          return null as unknown as T;
        }

        if (clean.includes('SELECT * FROM fb_campaign_queue WHERE id = ?')) {
          const [id] = args;
          return (db.tables.fb_campaign_queue.get(id) || null) as unknown as T;
        }

        if (clean.includes('FROM fb_recipients WHERE psid = ? OR id = ?')) {
          const [psid, id] = args;
          for (const r of db.tables.fb_recipients.values()) {
            if (r.psid === psid || r.id === id) return r as unknown as T;
          }
          return null as unknown as T;
        }

        return null as unknown as T;
      },

      async all() {
        if (clean.includes('SELECT * FROM fb_campaigns')) {
          return { results: Array.from(db.tables.fb_campaigns.values()) };
        }
        if (clean.includes('SELECT * FROM fb_campaign_queue WHERE campaign_id = ?')) {
          const [cid] = args;
          const items = Array.from(db.tables.fb_campaign_queue.values()).filter((q) => q.campaign_id === cid);
          return { results: items };
        }
        if (clean.includes('SELECT * FROM fb_recipients')) {
          return { results: Array.from(db.tables.fb_recipients.values()) };
        }
        return { results: [] };
      },
    });

    return stmt();
  }
}

describe('Facebook Broadcaster Comprehensive Security & Deployment Audit (Part 6)', () => {
  const secretKey = 'test-admin-secret-at-least-32-chars-long-12345678';
  let mockDb: ComprehensiveMockD1;
  let testEnv: Env;
  let adminToken: string;
  let customerToken: string;
  let originalFetch: any;

  beforeEach(async () => {
    mockDb = new ComprehensiveMockD1();
    testEnv = {
      DB: mockDb as any,
      ADMIN_SECRET: secretKey,
      JWT_SECRET: secretKey,
      FB_PAGE_ACCESS_TOKEN: 'EAAB...secretPageToken',
      FB_APP_SECRET: '38a92019482910482019482019482019',
      FB_PAGE_ID: '104829104820194',
      FB_WEBHOOK_VERIFY_TOKEN: 'rongdhonu_webhook_verify_token_2026',
    };

    const authSecret = getAuthSecret(testEnv);

    adminToken = await createAuthToken(
      {
        userId: 'admin-1',
        email: 'admin@rongdhonutrade.com',
        role: 'admin',
      },
      authSecret
    );

    customerToken = await createAuthToken(
      {
        userId: 'customer-1',
        email: 'customer@gmail.com',
        role: 'customer',
      },
      authSecret
    );

    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: any, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes('graph.facebook.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            recipient_id: 'psid_mock',
            message_id: `mid.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
          }),
        };
      }
      return originalFetch(url, opts);
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('1. Role-Based Authorization & Endpoint Boundaries', () => {
    const protectedEndpoints = [
      { path: '/api/admin/facebook/status', method: 'GET' },
      { path: '/api/admin/facebook/test-connection', method: 'POST' },
      { path: '/api/admin/facebook/send', method: 'POST' },
      { path: '/api/admin/facebook/campaigns', method: 'GET' },
      { path: '/api/admin/facebook/campaigns', method: 'POST' },
      { path: '/api/admin/facebook/campaigns/fbc-123/pause', method: 'POST' },
      { path: '/api/admin/facebook/campaigns/fbc-123/resume', method: 'POST' },
      { path: '/api/admin/facebook/campaigns/fbc-123/cancel', method: 'POST' },
      { path: '/api/admin/facebook/campaigns/fbc-123/delays', method: 'PATCH' },
      { path: '/api/admin/facebook/campaigns/fbc-123/process-next', method: 'POST' },
    ];

    it.each(protectedEndpoints)('rejects unauthenticated request to $method $path with 401', async ({ path, method }) => {
      const req = new Request(`https://rongdhonutrade.com${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await handleApiRequest(req, testEnv);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Authentication required|invalid/i);
    });

    it.each(protectedEndpoints)('rejects non-admin customer request to $method $path with 403 Forbidden', async ({ path, method }) => {
      const req = new Request(`https://rongdhonutrade.com${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: method !== 'GET' ? JSON.stringify({ name: 'Test' }) : undefined,
      });

      const res = await handleApiRequest(req, testEnv);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Forbidden|privileges required/i);
    });

    it('permits authorized administrator to access status and campaign management', async () => {
      const req = new Request('https://rongdhonutrade.com/api/admin/facebook/status', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const res = await handleApiRequest(req, testEnv);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status.isConfigured).toBe(true);
    });
  });

  describe('2. Secret Redaction & Token Security', () => {
    it('status response exposes readiness flags and Page ID but never leaks raw tokens or secrets', async () => {
      const status = getFacebookConfigStatus(testEnv);
      expect(status.isConfigured).toBe(true);
      expect(status.hasPageAccessToken).toBe(true);
      expect(status.hasAppSecret).toBe(true);
      expect(status.pageId).toBe('104829104820194');

      // Crucial: Raw tokens must never be on the status object
      expect((status as any).FB_PAGE_ACCESS_TOKEN).toBeUndefined();
      expect((status as any).FB_APP_SECRET).toBeUndefined();
      expect((status as any).pageAccessToken).toBeUndefined();
      expect((status as any).appSecret).toBeUndefined();
      expect(JSON.stringify(status)).not.toContain('EAAB...secretPageToken');
      expect(JSON.stringify(status)).not.toContain('38a92019482910482019482019482019');
    });
  });

  describe('3. Meta Messaging Consent & 24-Hour Policy Window', () => {
    it('enforces 24-hour policy: untagged message outside window is blocked', async () => {
      const blocked = await sendMetaMessengerMessage(
        {
          recipientPsid: 'psid_user_stale',
          text: 'Promo announcement',
          tag: 'NONE',
          isWithin24Hours: false,
        },
        testEnv
      );

      expect(blocked.success).toBe(false);
      expect(blocked.status).toBe(403);
      expect(blocked.policyBlocked).toBe(true);
      expect(blocked.error).toContain('Meta Policy Guard');
    });

    it('allows eligible message outside 24h when using authorized POST_PURCHASE_UPDATE tag', async () => {
      const allowed = await sendMetaMessengerMessage(
        {
          recipientPsid: 'psid_user_stale',
          text: 'Your order RT-1002 has shipped.',
          tag: 'POST_PURCHASE_UPDATE',
          isWithin24Hours: false,
        },
        testEnv
      );

      expect(allowed.success).toBe(true);
      expect(allowed.messageId).toBeTruthy();
    });
  });

  describe('4. Persistent Campaign Queue Lifecycle & State Transitions', () => {
    it('manages complete lifecycle: create -> run -> pause -> resume -> complete', async () => {
      const recipients = [
        { id: 'usr-1', name: 'User 1', psid: 'psid_1', isWithin24Hours: true, personalizedText: 'Hi 1' },
        { id: 'usr-2', name: 'User 2', psid: 'psid_2', isWithin24Hours: true, personalizedText: 'Hi 2' },
      ];

      // 1. Create in D1
      const { campaign } = await createFacebookCampaignInD1(
        mockDb as any,
        {
          name: 'Lifecycle Campaign',
          audienceType: 'page_contacts',
          tag: 'NONE',
          messageTemplate: 'Hi',
          minDelay: 2.0,
          maxDelay: 3.0,
        },
        recipients
      );
      expect(campaign.status).toBe('draft');
      expect(campaign.remainingCount).toBe(2);

      // 2. Process first item -> auto transitions to running
      const step1 = await processNextCampaignQueueItemInD1(mockDb as any, campaign.id, testEnv);
      expect(step1.success).toBe(true);
      expect(step1.campaignStatus).toBe('running');
      expect(step1.remainingCount).toBe(1);

      // 3. Pause
      const pauseRes = await updateFacebookCampaignStatusInD1(mockDb as any, campaign.id, 'paused');
      expect(pauseRes.status).toBe('paused');

      const blockedStep = await processNextCampaignQueueItemInD1(mockDb as any, campaign.id, testEnv);
      expect(blockedStep.success).toBe(false);
      expect(blockedStep.campaignStatus).toBe('paused');

      // 4. Resume
      const resumeRes = await updateFacebookCampaignStatusInD1(mockDb as any, campaign.id, 'running');
      expect(resumeRes.status).toBe('running');

      // 5. Complete
      const step2 = await processNextCampaignQueueItemInD1(mockDb as any, campaign.id, testEnv);
      expect(step2.success).toBe(true);
      expect(step2.completed).toBe(true);
      expect(step2.campaignStatus).toBe('completed');
      expect(step2.remainingCount).toBe(0);
    });

    it('cancelling campaign aborts remaining items and marks campaign cancelled with 0 remaining', async () => {
      const recipients = [
        { id: 'c-1', name: 'User C1', psid: 'psid_c1', isWithin24Hours: true },
        { id: 'c-2', name: 'User C2', psid: 'psid_c2', isWithin24Hours: true },
      ];

      const { campaign } = await createFacebookCampaignInD1(
        mockDb as any,
        {
          name: 'Cancel Test',
          audienceType: 'page_contacts',
          tag: 'NONE',
          messageTemplate: 'Hi',
        },
        recipients
      );

      const cancelRes = await updateFacebookCampaignStatusInD1(mockDb as any, campaign.id, 'cancelled');
      expect(cancelRes.status).toBe('cancelled');

      const details = await getFacebookCampaignByIdFromD1(mockDb as any, campaign.id);
      expect(details.campaign?.status).toBe('cancelled');
      expect(details.campaign?.remainingCount).toBe(0);
      expect(details.queue.every((q) => q.status === 'cancelled')).toBe(true);
    });
  });

  describe('5. Pacing Delay Range Bounds & Dynamic Modification', () => {
    it('bounds invalid or negative delay ranges safely (min >= 0.5s, max <= 60s)', async () => {
      const { campaign } = await createFacebookCampaignInD1(
        mockDb as any,
        {
          name: 'Bounds Test',
          audienceType: 'page_contacts',
          tag: 'NONE',
          messageTemplate: 'Hi',
          minDelay: -5, // Invalid negative
          maxDelay: 999, // Exceeds cap
        },
        [{ id: 'b-1', name: 'User B', psid: 'psid_b', isWithin24Hours: true }]
      );

      expect(campaign.minDelay).toBe(0.5);
      expect(campaign.maxDelay).toBe(60);

      // Updating delay during run also sanitizes bounds
      const updated = await updateFacebookCampaignDelaysInD1(mockDb as any, campaign.id, 0.1, 100);
      expect(updated.minDelay).toBe(0.5);
      expect(updated.maxDelay).toBe(60);
    });
  });

  describe('6. Duplicate Prevention', () => {
    it('deduplicates multiple entries of the same recipient ID during queue creation', async () => {
      const duplicates = [
        { id: 'same-recipient', name: 'Duplicate 1', psid: 'psid_same', isWithin24Hours: true },
        { id: 'same-recipient', name: 'Duplicate 2', psid: 'psid_same', isWithin24Hours: true },
        { id: 'other-recipient', name: 'Unique', psid: 'psid_other', isWithin24Hours: true },
      ];

      const { campaign, queuedCount } = await createFacebookCampaignInD1(
        mockDb as any,
        {
          name: 'Dedup Test',
          audienceType: 'page_contacts',
          tag: 'NONE',
          messageTemplate: 'Hi',
        },
        duplicates
      );

      expect(queuedCount).toBe(2);
      expect(campaign.totalQueued).toBe(2);
      expect(campaign.remainingCount).toBe(2);
    });
  });

  describe('7. Webhook Signature Security & Delivery Tracking', () => {
    it('strictly separates API acceptance from verified delivery (delivered only on webhook receipt)', async () => {
      const { campaign } = await createFacebookCampaignInD1(
        mockDb as any,
        {
          name: 'Delivery Audit',
          audienceType: 'page_contacts',
          tag: 'NONE',
          messageTemplate: 'Hi',
        },
        [{ id: 'd-1', name: 'Delivery Recipient', psid: 'psid_d1', isWithin24Hours: true }]
      );

      // Dispatch step
      const step = await processNextCampaignQueueItemInD1(mockDb as any, campaign.id, testEnv);
      expect(step.success).toBe(true);
      expect(step.item?.status).toBe('accepted');
      const mid = step.item?.metaMessageId;
      expect(mid).toBeTruthy();

      // Verified delivery count must remain 0 before webhook receipt
      let details = await getFacebookCampaignByIdFromD1(mockDb as any, campaign.id);
      expect(details.campaign?.acceptedCount).toBe(1);
      expect(details.campaign?.deliveredCount).toBe(0);

      // Inbound Meta delivery webhook
      await recordMetaDeliveryWatermarkInD1(mockDb as any, [mid!], 1729270000000);

      // Verified delivery count now updates to 1
      details = await getFacebookCampaignByIdFromD1(mockDb as any, campaign.id);
      expect(details.campaign?.deliveredCount).toBe(1);
      expect(details.queue[0].status).toBe('delivered');
      expect(details.queue[0].deliveredWatermark).toBe(1729270000000);
    });

    it('rejects tampered or forged webhook payloads with HTTP 401', async () => {
      const payload = JSON.stringify({ object: 'page', entry: [] });
      const req = new Request('https://rongdhonutrade.com/api/webhooks/facebook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=forged_bad_signature_0000000000000000000000',
        },
        body: payload,
      });

      const res = await handleMetaWebhookEvent(req, payload, testEnv);
      expect(res.success).toBe(false);
      expect(res.status).toBe(401);
      expect(res.error).toContain('signature');
    });
  });

  describe('8. Incoming Messenger Webhook Persistence & Admin Recipients API', () => {
    it('persists incoming message PSID to D1 fb_recipients and returns EVENT_RECEIVED', async () => {
      const incomingPayload = JSON.stringify({
        object: 'page',
        entry: [
          {
            id: 'page-123456789',
            time: Date.now(),
            messaging: [
              {
                sender: { id: 'psid_customer_real_100' },
                recipient: { id: 'page-123456789' },
                timestamp: Date.now(),
                message: {
                  mid: 'mid.incoming.test.100',
                  text: 'Hi Rongdhonu Trade, I want to confirm my delivery.',
                },
              },
            ],
          },
        ],
      });

      const sig = await computeHmacSha256Hex(testEnv.FB_APP_SECRET!, incomingPayload);
      const req = new Request('https://rongdhonutrade.com/api/webhooks/facebook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${sig}`,
        },
        body: incomingPayload,
      });

      const res = await handleApiRequest(req, testEnv);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('EVENT_RECEIVED');

      // Verify recipient was persisted in D1
      const saved = mockDb.tables.fb_recipients.get('fb_psid_customer_real_100');
      expect(saved).toBeDefined();
      expect(saved.psid).toBe('psid_customer_real_100');
      expect(saved.source).toBe('facebook_messenger');
      expect(saved.consent_status).toBe('consented');
    });

    it('retrieves persisted Messenger recipients via GET /api/admin/facebook/recipients for authorized admin', async () => {
      mockDb.tables.fb_recipients.set('fb_psid_customer_real_100', {
        id: 'fb_psid_customer_real_100',
        audience_type: 'page_contacts',
        name: 'Messenger User',
        psid: 'psid_customer_real_100',
        source: 'facebook_messenger',
        consent_status: 'consented',
        last_interaction_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const req = new Request('https://rongdhonutrade.com/api/admin/facebook/recipients', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const res = await handleApiRequest(req, testEnv);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.recipients)).toBe(true);
      const found = data.recipients.find((r: any) => r.psid === 'psid_customer_real_100');
      expect(found).toBeDefined();
      expect(found.source).toBe('facebook_messenger');
    });

    it('rejects unauthorized access to /api/admin/facebook/recipients with HTTP 401/403', async () => {
      // Unauthenticated
      const unauthReq = new Request('https://rongdhonutrade.com/api/admin/facebook/recipients', {
        method: 'GET',
      });
      const unauthRes = await handleApiRequest(unauthReq, testEnv);
      expect(unauthRes.status).toBe(401);

      // Customer account without admin permissions
      const customerToken = await createAuthToken(
        { userId: 'customer-1', email: 'customer@gmail.com', role: 'customer' },
        secretKey
      );
      const custReq = new Request('https://rongdhonutrade.com/api/admin/facebook/recipients', {
        method: 'GET',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      const custRes = await handleApiRequest(custReq, testEnv);
      expect(custRes.status).toBe(403);
    });
  });
});

