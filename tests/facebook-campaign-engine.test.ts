import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createFacebookCampaignInD1,
  getFacebookCampaignByIdFromD1,
  updateFacebookCampaignStatusInD1,
  updateFacebookCampaignDelaysInD1,
  processNextCampaignQueueItemInD1,
  recordMetaDeliveryWatermarkInD1,
} from '../src/server/db';
import { Env } from '../src/server/types';

// In-memory mock D1 database implementation for comprehensive integration testing
class MockD1Database {
  public tables: {
    fb_campaigns: Map<string, any>;
    fb_campaign_queue: Map<string, any>;
  };

  constructor() {
    this.tables = {
      fb_campaigns: new Map(),
      fb_campaign_queue: new Map(),
    };
  }

  prepare(query: string) {
    const db = this;
    const cleanQuery = query.trim().replace(/\s+/g, ' ');

    const createStatement = (args: any[] = []) => ({
      bind(...newArgs: any[]) {
        return createStatement(newArgs);
      },

      async run() {
        // Handle CREATE TABLE / INDEX queries
        if (
          cleanQuery.startsWith('CREATE TABLE') ||
          cleanQuery.startsWith('CREATE INDEX') ||
          cleanQuery.startsWith('CREATE UNIQUE INDEX')
        ) {
          return { success: true, meta: { changes: 0 } };
        }

        // INSERT INTO fb_campaigns
        if (cleanQuery.includes('INSERT INTO fb_campaigns')) {
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
            started_at: null,
            paused_at: null,
            completed_at: null,
            created_by,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return { success: true, meta: { changes: 1 } };
        }

        // INSERT OR IGNORE INTO fb_campaign_queue
        if (cleanQuery.includes('INSERT OR IGNORE INTO fb_campaign_queue')) {
          const [id, campaign_id, recipient_id, recipient_name, psid, phone, is_within_24h, has_consent, message_text] = args;
          const alreadyExists = Array.from(db.tables.fb_campaign_queue.values()).some(
            (q) => q.campaign_id === campaign_id && q.recipient_id === recipient_id
          );
          if (alreadyExists) {
            return { success: true, meta: { changes: 0 } };
          }

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
            meta_message_id: null,
            delivered_watermark: null,
            delivered_at: null,
            skip_reason: null,
            error_message: null,
            delay_used_seconds: null,
            processed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return { success: true, meta: { changes: 1 } };
        }

        // UPDATE fb_campaigns SET min_delay = ?, max_delay = ?
        if (cleanQuery.includes('UPDATE fb_campaigns SET min_delay = ?, max_delay = ?')) {
          const [min_delay, max_delay, id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.min_delay = min_delay;
            row.max_delay = max_delay;
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaigns SET status = 'paused'
        if (cleanQuery.includes("UPDATE fb_campaigns SET status = 'paused'")) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.status = 'paused';
            row.paused_at = new Date().toISOString();
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaigns SET status = 'running'
        if (cleanQuery.includes("UPDATE fb_campaigns SET status = 'running'")) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.status = 'running';
            if (!row.started_at) row.started_at = new Date().toISOString();
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaign_queue SET status = 'cancelled'
        if (cleanQuery.includes("UPDATE fb_campaign_queue SET status = 'cancelled'")) {
          const [campaignId] = args;
          let changes = 0;
          for (const item of db.tables.fb_campaign_queue.values()) {
            if (item.campaign_id === campaignId && (item.status === 'pending' || item.status === 'processing')) {
              item.status = 'cancelled';
              item.updated_at = new Date().toISOString();
              changes++;
            }
          }
          return { success: true, meta: { changes } };
        }

        // UPDATE fb_campaigns SET status = 'cancelled'
        if (cleanQuery.includes("UPDATE fb_campaigns SET status = 'cancelled'")) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.status = 'cancelled';
            row.remaining_count = 0;
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaigns SET status = 'completed'
        if (cleanQuery.includes("UPDATE fb_campaigns SET status = 'completed'")) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.status = 'completed';
            row.remaining_count = 0;
            row.completed_at = new Date().toISOString();
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaign_queue SET status = 'processing'
        if (cleanQuery.includes("UPDATE fb_campaign_queue SET status = 'processing'")) {
          const [id] = args;
          const row = db.tables.fb_campaign_queue.get(id);
          if (row && row.status === 'pending') {
            row.status = 'processing';
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaign_queue SET status = 'accepted'
        if (cleanQuery.includes("UPDATE fb_campaign_queue SET status = 'accepted'")) {
          const [meta_message_id, delay_used_seconds, id] = args;
          const row = db.tables.fb_campaign_queue.get(id);
          if (row) {
            row.status = 'accepted';
            row.meta_message_id = meta_message_id;
            row.delay_used_seconds = delay_used_seconds;
            row.processed_at = new Date().toISOString();
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaigns SET accepted_count = accepted_count + 1
        if (cleanQuery.includes('UPDATE fb_campaigns SET accepted_count = accepted_count + 1')) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.accepted_count++;
            row.remaining_count = Math.max(0, row.remaining_count - 1);
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaign_queue SET status = 'skipped'
        if (cleanQuery.includes("UPDATE fb_campaign_queue SET status = 'skipped'")) {
          const [skip_reason, delay_used_seconds, id] = args;
          const row = db.tables.fb_campaign_queue.get(id);
          if (row) {
            row.status = 'skipped';
            row.skip_reason = skip_reason;
            row.delay_used_seconds = delay_used_seconds;
            row.processed_at = new Date().toISOString();
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaigns SET skipped_count = skipped_count + 1
        if (cleanQuery.includes('UPDATE fb_campaigns SET skipped_count = skipped_count + 1')) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.skipped_count++;
            row.remaining_count = Math.max(0, row.remaining_count - 1);
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaign_queue SET status = 'failed'
        if (cleanQuery.includes("UPDATE fb_campaign_queue SET status = 'failed'")) {
          const [error_message, delay_used_seconds, id] = args;
          const row = db.tables.fb_campaign_queue.get(id);
          if (row) {
            row.status = 'failed';
            row.error_message = error_message;
            row.delay_used_seconds = delay_used_seconds;
            row.processed_at = new Date().toISOString();
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaigns SET failed_count = failed_count + 1
        if (cleanQuery.includes('UPDATE fb_campaigns SET failed_count = failed_count + 1')) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.failed_count++;
            row.remaining_count = Math.max(0, row.remaining_count - 1);
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaign_queue SET status = 'delivered'
        if (cleanQuery.includes("UPDATE fb_campaign_queue SET status = 'delivered'")) {
          const [delivered_watermark, id] = args;
          const row = db.tables.fb_campaign_queue.get(id);
          if (row) {
            row.status = 'delivered';
            row.delivered_watermark = delivered_watermark;
            row.delivered_at = new Date().toISOString();
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        // UPDATE fb_campaigns SET delivered_count = delivered_count + 1
        if (cleanQuery.includes('UPDATE fb_campaigns SET delivered_count = delivered_count + 1')) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.delivered_count++;
            row.updated_at = new Date().toISOString();
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }

        return { success: true, meta: { changes: 0 } };
      },

      async first<T = any>() {
        // SELECT * FROM fb_campaigns WHERE id = ?
        if (
          cleanQuery.includes('SELECT * FROM fb_campaigns WHERE id = ?') ||
          cleanQuery.includes('SELECT remaining_count FROM fb_campaigns WHERE id = ?')
        ) {
          const [id] = args;
          return (db.tables.fb_campaigns.get(id) || null) as unknown as T;
        }

        // SELECT * FROM fb_campaign_queue WHERE campaign_id = ? AND status = 'pending'
        if (cleanQuery.includes("SELECT * FROM fb_campaign_queue WHERE campaign_id = ? AND status = 'pending'")) {
          const [campaignId] = args;
          for (const item of db.tables.fb_campaign_queue.values()) {
            if (item.campaign_id === campaignId && item.status === 'pending') {
              return item as unknown as T;
            }
          }
          return null as unknown as T;
        }

        // SELECT count(*) as count FROM fb_campaign_queue WHERE campaign_id = ? AND status = 'processing'
        if (cleanQuery.includes("status = 'processing'")) {
          const [campaignId] = args;
          let count = 0;
          for (const item of db.tables.fb_campaign_queue.values()) {
            if (item.campaign_id === campaignId && item.status === 'processing') count++;
          }
          return { count } as unknown as T;
        }

        // SELECT count(*) as count FROM fb_campaign_queue WHERE campaign_id = ? AND status IN ('pending', 'processing')
        if (cleanQuery.includes("status IN ('pending', 'processing')")) {
          const [campaignId] = args;
          let count = 0;
          for (const item of db.tables.fb_campaign_queue.values()) {
            if (item.campaign_id === campaignId && (item.status === 'pending' || item.status === 'processing')) count++;
          }
          return { count } as unknown as T;
        }

        // SELECT id, campaign_id, status FROM fb_campaign_queue WHERE meta_message_id = ?
        if (cleanQuery.includes('WHERE meta_message_id = ?')) {
          const [mid] = args;
          for (const item of db.tables.fb_campaign_queue.values()) {
            if (item.meta_message_id === mid) {
              return { id: item.id, campaign_id: item.campaign_id, status: item.status } as unknown as T;
            }
          }
          return null as unknown as T;
        }

        // SELECT * FROM fb_campaign_queue WHERE id = ?
        if (cleanQuery.includes('SELECT * FROM fb_campaign_queue WHERE id = ?')) {
          const [id] = args;
          return (db.tables.fb_campaign_queue.get(id) || null) as unknown as T;
        }

        return null as unknown as T;
      },

      async all() {
        // SELECT * FROM fb_campaigns ORDER BY created_at DESC
        if (cleanQuery.includes('SELECT * FROM fb_campaigns')) {
          return { results: Array.from(db.tables.fb_campaigns.values()) };
        }

        // SELECT * FROM fb_campaign_queue WHERE campaign_id = ?
        if (cleanQuery.includes('SELECT * FROM fb_campaign_queue WHERE campaign_id = ?')) {
          const [campaignId] = args;
          const matches = Array.from(db.tables.fb_campaign_queue.values()).filter(
            (q) => q.campaign_id === campaignId
          );
          return { results: matches };
        }

        return { results: [] };
      },
    });

    return createStatement();
  }
}

describe('Facebook Broadcaster Campaign Engine & Persistent Queue (Part 5)', () => {
  let mockDb: any;
  let testEnv: Env;
  let originalFetch: any;

  beforeEach(() => {
    mockDb = new MockD1Database();
    testEnv = {
      DB: mockDb,
      JWT_SECRET: 'test-secret-at-least-32-chars-long-12345678',
      FB_PAGE_ACCESS_TOKEN: 'EAAB...testToken',
      FB_PAGE_ID: '104829104820194',
      FB_APP_SECRET: 'test-app-secret',
    };

    originalFetch = globalThis.fetch;
    // Mock fetch for Meta Graph API calls
    globalThis.fetch = vi.fn().mockImplementation(async (url: any, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes('graph.facebook.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            recipient_id: 'psid_mock',
            message_id: `m_mid.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
          }),
        };
      }
      return originalFetch(url, opts);
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('1. Campaign Queue Creation & Deduplication', () => {
    it('creates persistent campaign with queue items in D1 and prevents duplicate recipients', async () => {
      const recipients = [
        { id: 'rec-1', name: 'Tanvir Ahmed', psid: 'psid_001', isWithin24Hours: true, personalizedText: 'Hello Tanvir' },
        { id: 'rec-2', name: 'Nusrat Jahan', psid: 'psid_002', isWithin24Hours: true, personalizedText: 'Hello Nusrat' },
        { id: 'rec-1', name: 'Tanvir Ahmed (Duplicate)', psid: 'psid_001', isWithin24Hours: true, personalizedText: 'Dup' },
      ];

      const result = await createFacebookCampaignInD1(
        mockDb,
        {
          name: 'Spring Flash Sale Broadcast',
          audienceType: 'page_contacts',
          tag: 'NONE',
          messageTemplate: 'Hello {name}!',
          minDelay: 2.0,
          maxDelay: 3.0,
          createdBy: 'admin@rongdhonutrade.com',
        },
        recipients
      );

      expect(result.campaign.name).toBe('Spring Flash Sale Broadcast');
      expect(result.campaign.status).toBe('draft');
      expect(result.campaign.minDelay).toBe(2.0);
      expect(result.campaign.maxDelay).toBe(3.0);
      // Deduped from 3 to 2 unique recipients
      expect(result.queuedCount).toBe(2);
      expect(result.campaign.totalQueued).toBe(2);
      expect(result.campaign.remainingCount).toBe(2);

      const fetched = await getFacebookCampaignByIdFromD1(mockDb, result.campaign.id);
      expect(fetched.campaign).not.toBeNull();
      expect(fetched.queue.length).toBe(2);
      expect(fetched.queue[0].recipientName).toBe('Tanvir Ahmed');
      expect(fetched.queue[1].recipientName).toBe('Nusrat Jahan');
    });
  });

  describe('2. Dynamic Random Pacing Delay Engine', () => {
    it('generates a fresh random delay within the configured min/max range for each send', async () => {
      const recipients = [
        { id: 'rec-10', name: 'Customer A', psid: 'psid_10', isWithin24Hours: true, personalizedText: 'Hi A' },
        { id: 'rec-11', name: 'Customer B', psid: 'psid_11', isWithin24Hours: true, personalizedText: 'Hi B' },
        { id: 'rec-12', name: 'Customer C', psid: 'psid_12', isWithin24Hours: true, personalizedText: 'Hi C' },
      ];

      const { campaign } = await createFacebookCampaignInD1(
        mockDb,
        {
          name: 'Pacing Test Campaign',
          audienceType: 'page_contacts',
          tag: 'NONE',
          messageTemplate: 'Hi',
          minDelay: 2.0,
          maxDelay: 3.0,
        },
        recipients
      );

      // Process first item
      const step1 = await processNextCampaignQueueItemInD1(mockDb, campaign.id, testEnv);
      expect(step1.success).toBe(true);
      expect(step1.delayUsedSeconds).toBeGreaterThanOrEqual(2.0);
      expect(step1.delayUsedSeconds).toBeLessThanOrEqual(3.0);

      // Process second item
      const step2 = await processNextCampaignQueueItemInD1(mockDb, campaign.id, testEnv);
      expect(step2.success).toBe(true);
      expect(step2.delayUsedSeconds).toBeGreaterThanOrEqual(2.0);
      expect(step2.delayUsedSeconds).toBeLessThanOrEqual(3.0);
    });

    it('allows changing delay range during active campaign and applies new range to future sends', async () => {
      const recipients = [
        { id: 'rec-20', name: 'User 1', psid: 'psid_20', isWithin24Hours: true, personalizedText: 'Msg 1' },
        { id: 'rec-21', name: 'User 2', psid: 'psid_21', isWithin24Hours: true, personalizedText: 'Msg 2' },
      ];

      const { campaign } = await createFacebookCampaignInD1(
        mockDb,
        {
          name: 'Dynamic Delay Change Campaign',
          audienceType: 'page_contacts',
          tag: 'NONE',
          messageTemplate: 'Msg',
          minDelay: 2.0,
          maxDelay: 3.0,
        },
        recipients
      );

      // Admin modifies delay range to 5.0s – 7.0s while campaign is active
      const delayUpdate = await updateFacebookCampaignDelaysInD1(mockDb, campaign.id, 5.0, 7.0);
      expect(delayUpdate.success).toBe(true);
      expect(delayUpdate.minDelay).toBe(5.0);
      expect(delayUpdate.maxDelay).toBe(7.0);

      // Next send must now select a random delay in the new 5.0–7.0s range
      const step = await processNextCampaignQueueItemInD1(mockDb, campaign.id, testEnv);
      expect(step.success).toBe(true);
      expect(step.delayUsedSeconds).toBeGreaterThanOrEqual(5.0);
      expect(step.delayUsedSeconds).toBeLessThanOrEqual(7.0);
    });
  });

  describe('3. Campaign Execution Controls (Pause, Resume, Cancel)', () => {
    it('pauses execution and blocks further processing until resumed', async () => {
      const recipients = [
        { id: 'rec-30', name: 'User 30', psid: 'psid_30', isWithin24Hours: true, personalizedText: 'Msg 30' },
        { id: 'rec-31', name: 'User 31', psid: 'psid_31', isWithin24Hours: true, personalizedText: 'Msg 31' },
      ];

      const { campaign } = await createFacebookCampaignInD1(
        mockDb,
        {
          name: 'Pause Resume Test',
          audienceType: 'page_contacts',
          tag: 'NONE',
          messageTemplate: 'Msg',
        },
        recipients
      );

      // Step 1: Process 1 item -> status transitions to running
      const step1 = await processNextCampaignQueueItemInD1(mockDb, campaign.id, testEnv);
      expect(step1.success).toBe(true);
      expect(step1.remainingCount).toBe(1);

      // Administrator clicks Pause
      const pauseRes = await updateFacebookCampaignStatusInD1(mockDb, campaign.id, 'paused');
      expect(pauseRes.success).toBe(true);
      expect(pauseRes.status).toBe('paused');

      // Attempting to process next item while paused must be safely blocked
      const blockedStep = await processNextCampaignQueueItemInD1(mockDb, campaign.id, testEnv);
      expect(blockedStep.success).toBe(false);
      expect(blockedStep.campaignStatus).toBe('paused');
      expect(blockedStep.error).toContain('paused');

      // Administrator clicks Resume
      const resumeRes = await updateFacebookCampaignStatusInD1(mockDb, campaign.id, 'running');
      expect(resumeRes.success).toBe(true);
      expect(resumeRes.status).toBe('running');

      // Processing continues smoothly from remaining pending item
      const step2 = await processNextCampaignQueueItemInD1(mockDb, campaign.id, testEnv);
      expect(step2.success).toBe(true);
      expect(step2.completed).toBe(true);
      expect(step2.campaignStatus).toBe('completed');
    });

    it('cancelling campaign aborts remaining queue items in D1 and halts processing', async () => {
      const recipients = [
        { id: 'rec-40', name: 'User 40', psid: 'psid_40', isWithin24Hours: true, personalizedText: 'Msg' },
        { id: 'rec-41', name: 'User 41', psid: 'psid_41', isWithin24Hours: true, personalizedText: 'Msg' },
        { id: 'rec-42', name: 'User 42', psid: 'psid_42', isWithin24Hours: true, personalizedText: 'Msg' },
      ];

      const { campaign } = await createFacebookCampaignInD1(
        mockDb,
        {
          name: 'Cancel Test',
          audienceType: 'page_contacts',
          tag: 'NONE',
          messageTemplate: 'Msg',
        },
        recipients
      );

      // Process 1 item
      await processNextCampaignQueueItemInD1(mockDb, campaign.id, testEnv);

      // Admin clicks Cancel
      const cancelRes = await updateFacebookCampaignStatusInD1(mockDb, campaign.id, 'cancelled');
      expect(cancelRes.success).toBe(true);
      expect(cancelRes.status).toBe('cancelled');

      // Verify campaign status in D1 is cancelled with 0 remaining
      const details = await getFacebookCampaignByIdFromD1(mockDb, campaign.id);
      expect(details.campaign?.status).toBe('cancelled');
      expect(details.campaign?.remainingCount).toBe(0);

      // Verify pending items were marked cancelled
      const cancelledItems = details.queue.filter((q) => q.status === 'cancelled');
      expect(cancelledItems.length).toBe(2);

      // Future calls to process-next are rejected
      const nextAttempt = await processNextCampaignQueueItemInD1(mockDb, campaign.id, testEnv);
      expect(nextAttempt.success).toBe(false);
      expect(nextAttempt.campaignStatus).toBe('cancelled');
    });
  });

  describe('4. Meta Limits & Policy Guard Enforcement in Persistent Queue', () => {
    it('skips recipient outside 24h window when no approved message tag is set', async () => {
      const recipients = [
        { id: 'rec-50', name: 'Old Contact', psid: 'psid_50', isWithin24Hours: false, personalizedText: 'Promo' },
      ];

      const { campaign } = await createFacebookCampaignInD1(
        mockDb,
        {
          name: 'Policy Test',
          audienceType: 'page_contacts',
          tag: 'NONE', // Untagged outside 24h
          messageTemplate: 'Promo',
        },
        recipients
      );

      const step = await processNextCampaignQueueItemInD1(mockDb, campaign.id, testEnv);
      expect(step.success).toBe(true);
      expect(step.item?.status).toBe('skipped');
      expect(step.item?.skipReason).toContain('Outside 24-hour messaging window');

      const details = await getFacebookCampaignByIdFromD1(mockDb, campaign.id);
      expect(details.campaign?.skippedCount).toBe(1);
      expect(details.campaign?.acceptedCount).toBe(0);
    });

    it('enforces 2,000 character message length limit and marks item failed', async () => {
      const longMessage = 'A'.repeat(2005);
      const recipients = [
        { id: 'rec-60', name: 'User 60', psid: 'psid_60', isWithin24Hours: true, personalizedText: longMessage },
      ];

      const { campaign } = await createFacebookCampaignInD1(
        mockDb,
        {
          name: 'Length Test',
          audienceType: 'page_contacts',
          tag: 'NONE',
          messageTemplate: longMessage,
        },
        recipients
      );

      const step = await processNextCampaignQueueItemInD1(mockDb, campaign.id, testEnv);
      expect(step.success).toBe(true);
      expect(step.item?.status).toBe('failed');
      expect(step.item?.errorMessage).toContain('2,000 characters');

      const details = await getFacebookCampaignByIdFromD1(mockDb, campaign.id);
      expect(details.campaign?.failedCount).toBe(1);
    });
  });

  describe('5. Delivery Tracking & Separation of Accepted vs Delivered', () => {
    it('strictly updates delivered count only when verified Meta delivery webhook arrives', async () => {
      const recipients = [
        { id: 'rec-70', name: 'User 70', psid: 'psid_70', isWithin24Hours: true, personalizedText: 'Order dispatched' },
      ];

      const { campaign } = await createFacebookCampaignInD1(
        mockDb,
        {
          name: 'Delivery Webhook Test',
          audienceType: 'post_purchase_subscribers',
          tag: 'POST_PURCHASE_UPDATE',
          messageTemplate: 'Order dispatched',
        },
        recipients
      );

      // Process item: mock fetch returns message_id and marks status 'accepted'
      const step = await processNextCampaignQueueItemInD1(mockDb, campaign.id, testEnv);
      expect(step.success).toBe(true);
      expect(step.item?.status).toBe('accepted');
      const messageId = step.item?.metaMessageId;
      expect(messageId).toBeTruthy();

      // At this stage, accepted is 1, delivered must still be 0!
      let details = await getFacebookCampaignByIdFromD1(mockDb, campaign.id);
      expect(details.campaign?.acceptedCount).toBe(1);
      expect(details.campaign?.deliveredCount).toBe(0);

      // Simulate incoming Meta delivery webhook receipt with messageId and watermark timestamp
      const webhookDelivery = await recordMetaDeliveryWatermarkInD1(mockDb, [messageId!], Date.now());
      expect(webhookDelivery.updatedCount).toBe(1);

      // Now delivered count must be incremented to 1
      details = await getFacebookCampaignByIdFromD1(mockDb, campaign.id);
      expect(details.campaign?.deliveredCount).toBe(1);
      expect(details.queue[0].status).toBe('delivered');
      expect(details.queue[0].deliveredWatermark).toBeDefined();
    });
  });
});
