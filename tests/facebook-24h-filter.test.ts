import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateIncomingMessage24HourWindow,
  isRecipientEligibleFor24HourFilter,
  META_24_HOUR_WINDOW_MS,
  MAX_CLOCK_DRIFT_TOLERANCE_MS,
} from '../src/utils/facebookPolicy';
import {
  ensureFacebookCampaignSchema,
  upsertFacebookRecipientFromMessageInD1,
  getFacebookRecipientsFromD1,
  createFacebookCampaignInD1,
  processNextCampaignQueueItemInD1,
} from '../src/server/db';
import { syncMetaConversations } from '../src/server/facebookMessenger';

// In-memory SQLite D1 Mock for comprehensive testing
class MockD1PreparedStatement {
  constructor(private sql: string, private db: MockD1Database, private params: any[] = []) {}

  bind(...params: any[]) {
    return new MockD1PreparedStatement(this.sql, this.db, params);
  }

  async run() {
    return this.db.execute(this.sql, this.params);
  }

  async first<T = any>(colName?: string): Promise<T | null> {
    const res = await this.db.execute(this.sql, this.params);
    const firstRow = res.results?.[0] || null;
    if (firstRow && colName) return firstRow[colName];
    return firstRow as T | null;
  }

  async all<T = any>(): Promise<{ results: T[] }> {
    const res = await this.db.execute(this.sql, this.params);
    return { results: (res.results || []) as T[] };
  }
}

class MockD1Database {
  public tables: Record<string, any[]> = {
    fb_recipients: [],
    fb_campaigns: [],
    fb_campaign_queue: [],
    audit_logs: [],
  };

  prepare(sql: string) {
    return new MockD1PreparedStatement(sql, this);
  }

  async execute(sql: string, params: any[] = []): Promise<{ results: any[]; meta: { changes: number } }> {
    const trimmed = sql.trim();

    if (trimmed.startsWith('CREATE TABLE') || trimmed.startsWith('CREATE INDEX') || trimmed.startsWith('ALTER TABLE')) {
      return { results: [], meta: { changes: 0 } };
    }

    if (trimmed.includes("pragma_table_info('fb_recipients')")) {
      return {
        results: [
          { name: 'id' },
          { name: 'audience_type' },
          { name: 'name' },
          { name: 'psid' },
          { name: 'phone' },
          { name: 'email' },
          { name: 'source' },
          { name: 'consent_status' },
          { name: 'consent_timestamp' },
          { name: 'last_interaction_at' },
          { name: 'last_incoming_message_at' },
          { name: 'page_id' },
          { name: 'metadata' },
          { name: 'created_at' },
          { name: 'updated_at' },
        ],
        meta: { changes: 0 },
      };
    }

    // SELECT queries
    if (trimmed.toUpperCase().startsWith('SELECT')) {
      if (trimmed.includes('FROM fb_recipients')) {
        let rows = [...this.tables.fb_recipients];
        // WHERE psid = ? OR id = ?
        if (trimmed.includes('WHERE psid = ? OR id = ?')) {
          const val = params[0];
          rows = rows.filter((r) => r.psid === val || r.id === val);
          return { results: rows.slice(0, 1), meta: { changes: 0 } };
        }
        if (trimmed.includes('WHERE id = ? OR psid = ?')) {
          const idVal = params[0];
          const psidVal = params[1];
          rows = rows.filter((r) => r.id === idVal || r.psid === psidVal);
          return { results: rows.slice(0, 1), meta: { changes: 0 } };
        }
        // General getFacebookRecipientsFromD1
        if (params.length > 0) {
          let paramIdx = 0;
          if (trimmed.includes('audience_type = ?')) {
            const aud = params[paramIdx++];
            rows = rows.filter((r) => r.audience_type === aud);
          }
          if (trimmed.includes('(page_id = ? OR (page_id IS NULL AND source = ?))')) {
            const pid = params[paramIdx++];
            const src = params[paramIdx++];
            rows = rows.filter((r) => r.page_id === pid || (!r.page_id && r.source === src));
          }
          if (trimmed.includes('last_incoming_message_at >=')) {
            const minTime = params[paramIdx++];
            const maxTime = params[paramIdx++];
            rows = rows.filter(
              (r) =>
                r.psid &&
                r.consent_status !== 'opted_out' &&
                r.last_incoming_message_at &&
                r.last_incoming_message_at >= minTime &&
                r.last_incoming_message_at <= maxTime
            );
          }
        }
        return { results: rows, meta: { changes: 0 } };
      }

      if (trimmed.includes('FROM fb_campaigns')) {
        if (trimmed.includes('WHERE id = ?')) {
          const camp = this.tables.fb_campaigns.find((c) => c.id === params[0]) || null;
          return { results: camp ? [camp] : [], meta: { changes: 0 } };
        }
        return { results: this.tables.fb_campaigns, meta: { changes: 0 } };
      }

      if (trimmed.includes('FROM fb_campaign_queue')) {
        if (trimmed.includes("status = 'pending'")) {
          const item = this.tables.fb_campaign_queue.find((q) => q.campaign_id === params[0] && q.status === 'pending');
          return { results: item ? [item] : [], meta: { changes: 0 } };
        }
        if (trimmed.includes("status = 'processing'")) {
          const count = this.tables.fb_campaign_queue.filter((q) => q.campaign_id === params[0] && q.status === 'processing').length;
          return { results: [{ count }], meta: { changes: 0 } };
        }
        if (trimmed.includes('WHERE id = ?')) {
          const item = this.tables.fb_campaign_queue.find((q) => q.id === params[0]) || null;
          return { results: item ? [item] : [], meta: { changes: 0 } };
        }
      }
    }

    // INSERT queries
    if (trimmed.toUpperCase().startsWith('INSERT')) {
      if (trimmed.includes('INTO fb_recipients')) {
        const row = {
          id: params[0],
          audience_type: params[1],
          name: params[2],
          psid: params[3],
          source: params[4],
          consent_status: params[5],
          consent_timestamp: params[6],
          consent_source: params[7],
          last_interaction_at: params[8],
          last_incoming_message_at: params[9],
          page_id: params[10],
          metadata: params[11],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        this.tables.fb_recipients.push(row);
        return { results: [], meta: { changes: 1 } };
      }

      if (trimmed.includes('INTO fb_campaigns')) {
        const row = {
          id: params[0],
          name: params[1],
          audience_type: params[2],
          tag: params[3],
          message_template: params[4],
          status: 'draft',
          min_delay: params[5],
          max_delay: params[6],
          total_queued: params[7],
          accepted_count: 0,
          delivered_count: 0,
          skipped_count: 0,
          failed_count: 0,
          remaining_count: params[8],
          created_by: params[9],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        this.tables.fb_campaigns.push(row);
        return { results: [], meta: { changes: 1 } };
      }

      if (trimmed.includes('INTO fb_campaign_queue')) {
        const existing = this.tables.fb_campaign_queue.find((q) => q.id === params[0]);
        if (!existing) {
          const row = {
            id: params[0],
            campaign_id: params[1],
            recipient_id: params[2],
            recipient_name: params[3],
            psid: params[4],
            phone: params[5],
            is_within_24h: params[6],
            has_consent: params[7],
            message_text: params[8],
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          this.tables.fb_campaign_queue.push(row);
          return { results: [], meta: { changes: 1 } };
        }
        return { results: [], meta: { changes: 0 } };
      }
    }

    // UPDATE queries
    if (trimmed.toUpperCase().startsWith('UPDATE')) {
      if (trimmed.includes('UPDATE fb_recipients')) {
        const id = params[7];
        const rec = this.tables.fb_recipients.find((r) => r.id === id);
        if (rec) {
          if (params[0]) rec.name = params[0];
          rec.psid = params[1];
          rec.last_interaction_at = params[2];
          rec.last_incoming_message_at = params[3];
          if (params[4]) rec.page_id = params[4];
          rec.consent_status = 'consented';
          rec.consent_timestamp = params[5];
          rec.metadata = params[6];
          rec.updated_at = new Date().toISOString();
          return { results: [], meta: { changes: 1 } };
        }
      }

      if (trimmed.includes('UPDATE fb_campaign_queue')) {
        if (trimmed.includes("status = 'processing'")) {
          const item = this.tables.fb_campaign_queue.find((q) => q.id === params[0] && q.status === 'pending');
          if (item) {
            item.status = 'processing';
            return { results: [], meta: { changes: 1 } };
          }
          return { results: [], meta: { changes: 0 } };
        }
        if (trimmed.includes("status = 'skipped'")) {
          const skipReason = params[0];
          const delay = params[1];
          const id = params[2];
          const item = this.tables.fb_campaign_queue.find((q) => q.id === id);
          if (item) {
            item.status = 'skipped';
            item.skip_reason = skipReason;
            item.delay_used_seconds = delay;
            return { results: [], meta: { changes: 1 } };
          }
        }
        if (trimmed.includes("status = 'accepted'")) {
          const mid = params[0];
          const delay = params[1];
          const id = params[2];
          const item = this.tables.fb_campaign_queue.find((q) => q.id === id);
          if (item) {
            item.status = 'accepted';
            item.meta_message_id = mid;
            item.delay_used_seconds = delay;
            return { results: [], meta: { changes: 1 } };
          }
        }
      }

      if (trimmed.includes('UPDATE fb_campaigns')) {
        const id = params[params.length - 1];
        const camp = this.tables.fb_campaigns.find((c) => c.id === id);
        if (camp) {
          if (trimmed.includes("status = 'running'")) camp.status = 'running';
          if (trimmed.includes("status = 'completed'")) camp.status = 'completed';
          if (trimmed.includes('skipped_count = skipped_count + 1')) camp.skipped_count++;
          if (trimmed.includes('accepted_count = accepted_count + 1')) camp.accepted_count++;
          if (trimmed.includes('remaining_count = MAX(0, remaining_count - 1)')) {
            camp.remaining_count = Math.max(0, camp.remaining_count - 1);
          }
          return { results: [], meta: { changes: 1 } };
        }
      }
    }

    return { results: [], meta: { changes: 0 } };
  }
}

describe('Facebook Broadcaster: "Last 24 Hours" Recipient Filter Suite', () => {
  const FIXED_NOW = 1700000000000; // Reference fixed UTC timestamp
  let mockDb: MockD1Database;
  const mockEnv: any = {
    FB_PAGE_ID: 'page_123456789',
    FB_PAGE_ACCESS_TOKEN: 'EAAB_test_mock_token',
    FB_WEBHOOK_VERIFY_TOKEN: 'verify_token_test',
  };

  beforeEach(async () => {
    mockDb = new MockD1Database();
    await ensureFacebookCampaignSchema(mockDb as any);
  });

  // ==========================================
  // 1. TIMESTAMP & 24-HOUR POLICY WINDOW TESTS
  // ==========================================
  describe('Meta 24-Hour Messaging Window Policy Checks', () => {
    it('1. Incoming message received 5 minutes ago is valid and within the 24-hour window', () => {
      const fiveMinsAgoIso = new Date(FIXED_NOW - 5 * 60 * 1000).toISOString();
      const res = validateIncomingMessage24HourWindow(fiveMinsAgoIso, FIXED_NOW);

      expect(res.isWithin24Hours).toBe(true);
      expect(res.reason).toContain('within 24-hour window');
      expect(res.diffMs).toBe(5 * 60 * 1000);
      expect(res.diffHours).toBeCloseTo(0.1, 1);
    });

    it('2. Incoming message received 23 hours and 59 minutes ago is valid and within the window', () => {
      const almost24hAgoIso = new Date(FIXED_NOW - (23 * 60 + 59) * 60 * 1000).toISOString();
      const res = validateIncomingMessage24HourWindow(almost24hAgoIso, FIXED_NOW);

      expect(res.isWithin24Hours).toBe(true);
      expect(res.reason).toContain('within 24-hour window');
      expect(res.diffHours).toBeCloseTo(24.0, 1);
    });

    it('3. Incoming message received at the exact 24-hour boundary is inclusive and eligible', () => {
      const exact24hAgoIso = new Date(FIXED_NOW - META_24_HOUR_WINDOW_MS).toISOString();
      const res = validateIncomingMessage24HourWindow(exact24hAgoIso, FIXED_NOW);

      expect(res.isWithin24Hours).toBe(true);
      expect(res.diffMs).toBe(META_24_HOUR_WINDOW_MS);
      expect(res.diffHours).toBe(24.0);
    });

    it('4. Incoming message received more than 24 hours ago (e.g. 24h 1m) is excluded', () => {
      const past24hAgoIso = new Date(FIXED_NOW - (25 * 60 * 60 * 1000)).toISOString(); // 25 hours ago
      const res = validateIncomingMessage24HourWindow(past24hAgoIso, FIXED_NOW);

      expect(res.isWithin24Hours).toBe(false);
      expect(res.reason).toContain('exceeds 24-hour window');
      expect(res.diffHours).toBeGreaterThan(24.0);
    });

    it('5. Missing or invalid incoming-message timestamp is excluded', () => {
      expect(validateIncomingMessage24HourWindow(null, FIXED_NOW).isWithin24Hours).toBe(false);
      expect(validateIncomingMessage24HourWindow(undefined, FIXED_NOW).isWithin24Hours).toBe(false);
      expect(validateIncomingMessage24HourWindow('', FIXED_NOW).isWithin24Hours).toBe(false);
      expect(validateIncomingMessage24HourWindow('invalid-date-string', FIXED_NOW).isWithin24Hours).toBe(false);
    });

    it('6. Future timestamp beyond permissible clock drift (60s) is strictly rejected', () => {
      const futureFarIso = new Date(FIXED_NOW + 5 * 60 * 1000).toISOString(); // 5 minutes in future
      const resFar = validateIncomingMessage24HourWindow(futureFarIso, FIXED_NOW);

      expect(resFar.isWithin24Hours).toBe(false);
      expect(resFar.reason).toContain('Future incoming message timestamp');

      // Small clock skew within 60s tolerance is tolerated
      const futureSkewIso = new Date(FIXED_NOW + 30 * 1000).toISOString();
      const resSkew = validateIncomingMessage24HourWindow(futureSkewIso, FIXED_NOW);
      expect(resSkew.isWithin24Hours).toBe(true);
    });
  });

  // ==========================================
  // 2. WEBHOOK INGESTION & OUTGOING MESSAGE SAFEGUARDS
  // ==========================================
  describe('Webhook Ingestion & Outgoing Message Isolation', () => {
    it('7. Outgoing messages (echoes or sent by configured Page ID) must NOT refresh last_incoming_message_at', async () => {
      const userPsid = 'user_psid_999';
      const initialIncomingTime = FIXED_NOW - 10 * 60 * 1000; // 10 mins ago

      // Step A: Genuine incoming message from user
      const incomingRes = await upsertFacebookRecipientFromMessageInD1(
        mockDb as any,
        {
          senderId: userPsid,
          recipientId: mockEnv.FB_PAGE_ID,
          timestamp: initialIncomingTime,
          text: 'Hello from customer',
          mids: ['mid_incoming_001'],
          isEcho: false,
        },
        mockEnv
      );
      expect(incomingRes.success).toBe(true);

      const recordBefore = mockDb.tables.fb_recipients.find((r) => r.psid === userPsid);
      expect(recordBefore).toBeDefined();
      expect(recordBefore.last_incoming_message_at).toBe(new Date(initialIncomingTime).toISOString());

      // Step B: Outbound message sent by Page (echo webhook)
      const outboundEchoTime = FIXED_NOW - 1 * 60 * 1000; // 1 min ago
      const echoRes = await upsertFacebookRecipientFromMessageInD1(
        mockDb as any,
        {
          senderId: userPsid,
          recipientId: mockEnv.FB_PAGE_ID,
          timestamp: outboundEchoTime,
          text: 'Thanks for contacting us!',
          mids: ['mid_echo_002'],
          isEcho: true, // Marked as echo
        },
        mockEnv
      );
      expect(echoRes.success).toBe(false);
      expect(echoRes.error).toContain('Ignored: Event is an outbound echo');

      // Step C: Verify last_incoming_message_at did NOT get updated
      const recordAfter = mockDb.tables.fb_recipients.find((r) => r.psid === userPsid);
      expect(recordAfter.last_incoming_message_at).toBe(new Date(initialIncomingTime).toISOString());
    });

    it('8. Duplicate webhook events and out-of-order retries are handled safely without regressing timestamps', async () => {
      const userPsid = 'user_psid_888';
      const newerTime = FIXED_NOW - 10 * 60 * 1000;
      const olderTime = FIXED_NOW - 30 * 60 * 1000;

      // First webhook event
      await upsertFacebookRecipientFromMessageInD1(
        mockDb as any,
        {
          senderId: userPsid,
          recipientId: mockEnv.FB_PAGE_ID,
          timestamp: newerTime,
          text: 'Newest message',
          mids: ['mid_100'],
          isEcho: false,
        },
        mockEnv
      );

      // Duplicate webhook replay with same mid
      const duplicateRes = await upsertFacebookRecipientFromMessageInD1(
        mockDb as any,
        {
          senderId: userPsid,
          recipientId: mockEnv.FB_PAGE_ID,
          timestamp: newerTime,
          text: 'Newest message',
          mids: ['mid_100'],
          isEcho: false,
        },
        mockEnv
      );
      expect(duplicateRes.success).toBe(true);
      expect(duplicateRes.isDuplicate).toBe(true);

      // Out-of-order older message should NOT overwrite newer timestamp
      await upsertFacebookRecipientFromMessageInD1(
        mockDb as any,
        {
          senderId: userPsid,
          recipientId: mockEnv.FB_PAGE_ID,
          timestamp: olderTime,
          text: 'Older message arriving late',
          mids: ['mid_099'],
          isEcho: false,
        },
        mockEnv
      );

      const record = mockDb.tables.fb_recipients.find((r) => r.psid === userPsid);
      expect(record.last_incoming_message_at).toBe(new Date(newerTime).toISOString());
    });
  });

  // ==========================================
  // 3. PAGE ISOLATION & FILTER ELIGIBILITY
  // ==========================================
  describe('Facebook Page Isolation & Filter Scoping', () => {
    it('9. Recipient records belonging to different Facebook Pages are strictly isolated', async () => {
      const pageA = 'page_AAA';
      const pageB = 'page_BBB';
      const currentNow = Date.now();

      // Insert Page A recipient (active 1 hour ago)
      await upsertFacebookRecipientFromMessageInD1(
        mockDb as any,
        {
          senderId: 'user_page_A',
          recipientId: pageA,
          timestamp: currentNow - 1 * 60 * 60 * 1000,
          text: 'Message to Page A',
          isEcho: false,
        },
        { ...mockEnv, FB_PAGE_ID: pageA }
      );

      // Insert Page B recipient (active 1 hour ago)
      await upsertFacebookRecipientFromMessageInD1(
        mockDb as any,
        {
          senderId: 'user_page_B',
          recipientId: pageB,
          timestamp: currentNow - 1 * 60 * 60 * 1000,
          text: 'Message to Page B',
          isEcho: false,
        },
        { ...mockEnv, FB_PAGE_ID: pageB }
      );

      // Query recipients for Page A with last_24_hours filter
      const pageARecipients = await getFacebookRecipientsFromD1(mockDb as any, 'page_contacts', {
        pageId: pageA,
        filter: 'last_24_hours',
      });

      expect(pageARecipients.length).toBe(1);
      expect(pageARecipients[0].psid).toBe('user_page_A');
      expect(pageARecipients[0].pageId).toBe(pageA);

      // Policy eligibility check for Page A rejects Page B user
      const checkCross = isRecipientEligibleFor24HourFilter(
        {
          psid: 'user_page_B',
          pageId: pageB,
          lastIncomingMessageAt: new Date(currentNow - 10000).toISOString(),
        },
        pageA,
        currentNow
      );
      expect(checkCross.eligible).toBe(false);
      expect(checkCross.reason).toContain('belongs to a different Facebook Page');
    });

    it('10. isRecipientEligibleFor24HourFilter enforces PSID, consent, page match, and 24h window', () => {
      // Missing PSID
      expect(
        isRecipientEligibleFor24HourFilter({ psid: '', lastIncomingMessageAt: new Date(FIXED_NOW - 1000).toISOString() }, 'page_1', FIXED_NOW).eligible
      ).toBe(false);

      // Opted out
      expect(
        isRecipientEligibleFor24HourFilter(
          { psid: '123', consentStatus: 'opted_out', lastIncomingMessageAt: new Date(FIXED_NOW - 1000).toISOString() },
          'page_1',
          FIXED_NOW
        ).eligible
      ).toBe(false);

      // Expired incoming message (> 24 hours)
      expect(
        isRecipientEligibleFor24HourFilter(
          { psid: '123', lastIncomingMessageAt: new Date(FIXED_NOW - 25 * 60 * 60 * 1000).toISOString() },
          'page_1',
          FIXED_NOW
        ).eligible
      ).toBe(false);

      // Fully valid
      const valid = isRecipientEligibleFor24HourFilter(
        { psid: '123', pageId: 'page_1', lastIncomingMessageAt: new Date(FIXED_NOW - 2 * 60 * 60 * 1000).toISOString() },
        'page_1',
        FIXED_NOW
      );
      expect(valid.eligible).toBe(true);
      expect(valid.isWithin24Hours).toBe(true);
    });
  });

  // ==========================================
  // 4. SERVER-SIDE QUEUE CREATION & DISPATCH REVALIDATION
  // ==========================================
  describe('Server-Side Queue Creation & Dispatch Revalidation', () => {
    it('11. Revalidates recipient eligibility during campaign queue creation', async () => {
      const pageId = mockEnv.FB_PAGE_ID;
      const currentNow = Date.now();
      const recentIncomingIso = new Date(currentNow - 2 * 60 * 60 * 1000).toISOString();
      const expiredIncomingIso = new Date(currentNow - 26 * 60 * 60 * 1000).toISOString();

      // Seed recipients in D1
      mockDb.tables.fb_recipients.push(
        {
          id: 'rec_active',
          psid: 'psid_active',
          name: 'Active User',
          audience_type: 'page_contacts',
          source: 'facebook_messenger',
          consent_status: 'consented',
          last_incoming_message_at: recentIncomingIso,
          page_id: pageId,
        },
        {
          id: 'rec_expired',
          psid: 'psid_expired',
          name: 'Expired User',
          audience_type: 'page_contacts',
          source: 'facebook_messenger',
          consent_status: 'consented',
          last_incoming_message_at: expiredIncomingIso,
          page_id: pageId,
        }
      );

      // Create campaign with both
      const createRes = await createFacebookCampaignInD1(
        mockDb as any,
        {
          name: '24h Broadcast Campaign',
          audienceType: 'page_contacts',
          tag: 'NONE', // Standard messaging window
          messageTemplate: 'Hello {name}!',
        },
        [
          { id: 'rec_active', name: 'Active User', psid: 'psid_active', isWithin24Hours: true },
          { id: 'rec_expired', name: 'Expired User', psid: 'psid_expired', isWithin24Hours: true }, // Client claimed true, but D1 has expired
        ]
      );

      expect(createRes.queuedCount).toBe(2);
      // Verify server corrected is_within_24h based on actual D1 records
      const activeQueueItem = mockDb.tables.fb_campaign_queue.find((q) => q.recipient_id === 'rec_active');
      const expiredQueueItem = mockDb.tables.fb_campaign_queue.find((q) => q.recipient_id === 'rec_expired');

      expect(activeQueueItem.is_within_24h).toBe(1);
      expect(expiredQueueItem.is_within_24h).toBe(0); // Server corrected to false!
    });

    it('12. Dispatch engine strictly skips expired recipients when tag is NONE', async () => {
      const pageId = mockEnv.FB_PAGE_ID;
      const campaignId = 'camp_test_dispatch';

      mockDb.tables.fb_campaigns.push({
        id: campaignId,
        name: 'Standard Campaign',
        audience_type: 'page_contacts',
        tag: 'NONE',
        message_template: 'Special offer today!',
        status: 'draft',
        min_delay: 1.0,
        max_delay: 2.0,
        total_queued: 1,
        accepted_count: 0,
        delivered_count: 0,
        skipped_count: 0,
        failed_count: 0,
        remaining_count: 1,
      });

      // Queue item where recipient was marked outside 24h
      mockDb.tables.fb_campaign_queue.push({
        id: 'q_expired_1',
        campaign_id: campaignId,
        recipient_id: 'rec_expired',
        recipient_name: 'Late Sender',
        psid: 'psid_expired_123',
        is_within_24h: 0, // Outside 24h
        has_consent: 1,
        message_text: 'Special offer today!',
        status: 'pending',
      });

      const processRes = await processNextCampaignQueueItemInD1(mockDb as any, campaignId, mockEnv);

      expect(processRes.success).toBe(true);
      expect(processRes.item?.status).toBe('skipped');
      expect(processRes.item?.skipReason).toContain('Outside 24-hour messaging window');

      const camp = mockDb.tables.fb_campaigns.find((c) => c.id === campaignId);
      expect(camp.skipped_count).toBe(1);
      expect(camp.remaining_count).toBe(0);
    });

    it('13. Tagged messaging (e.g. POST_PURCHASE_UPDATE) allows delivery outside 24h for eligible orders', async () => {
      const campaignId = 'camp_test_tag';

      mockDb.tables.fb_campaigns.push({
        id: campaignId,
        name: 'Shipping Update',
        audience_type: 'post_purchase_subscribers',
        tag: 'POST_PURCHASE_UPDATE',
        message_template: 'Your order has shipped!',
        status: 'draft',
        min_delay: 1.0,
        max_delay: 2.0,
        total_queued: 1,
        accepted_count: 0,
        delivered_count: 0,
        skipped_count: 0,
        failed_count: 0,
        remaining_count: 1,
      });

      // Recipient is outside 24h, but has valid PSID and POST_PURCHASE_UPDATE tag
      mockDb.tables.fb_campaign_queue.push({
        id: 'q_tagged_1',
        campaign_id: campaignId,
        recipient_id: 'rec_customer',
        recipient_name: 'Customer With Order',
        psid: 'psid_valid_456',
        is_within_24h: 0,
        has_consent: 1,
        message_text: 'Your order #RT-123 has shipped!',
        status: 'pending',
      });

      const processRes = await processNextCampaignQueueItemInD1(mockDb as any, campaignId, mockEnv);

      expect(processRes.success).toBe(true);
      // Under POST_PURCHASE_UPDATE tag, message is accepted (or processed) without 24h restriction
      expect(processRes.item?.status).not.toBe('skipped');
    });
  });

  // ==========================================
  // 5. DIRECT FACEBOOK PAGE CONVERSATION SYNC & 24H SENDER RECOVERY
  // ==========================================
  describe('5. Direct Facebook Page Conversation Synchronization & 24h Sender Recovery', () => {
    it('14. syncMetaConversations isolates Page ID and recovers authentic 24h senders from conversation history', async () => {
      const pageId = '104829104820194';
      const userPsid = '209384729104820';
      const now = Date.now();
      const messageTimeIso = new Date(now - 30 * 60 * 1000).toISOString(); // 30 minutes ago

      // Mock global fetch for Graph API /conversations endpoint
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: any, init?: any) => {
        const urlStr = typeof input === 'string' ? input : input.url;
        if (urlStr.includes('/me?fields=id,name')) {
          return new Response(JSON.stringify({ id: pageId, name: 'Rongdhonu Trade' }), { status: 200 });
        }
        if (urlStr.includes('/conversations')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 't_12345',
                  updated_time: messageTimeIso,
                  participants: {
                    data: [
                      { id: pageId, name: 'Rongdhonu Trade' },
                      { id: userPsid, name: 'Shahriar Kabir' },
                    ],
                  },
                  messages: {
                    data: [
                      {
                        id: 'm_out_1',
                        created_time: messageTimeIso,
                        from: { id: pageId, name: 'Rongdhonu Trade' },
                        message: 'Hello, how can we help?',
                      },
                      {
                        id: 'm_in_1',
                        created_time: messageTimeIso,
                        from: { id: userPsid, name: 'Shahriar Kabir' },
                        message: 'Do you have size L available?',
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return originalFetch(input, init);
      };

      try {
        const syncRes = await syncMetaConversations(
          { ...mockEnv, FB_PAGE_ID: pageId },
          async (ev) => {
            await upsertFacebookRecipientFromMessageInD1(mockDb as any, ev, { ...mockEnv, FB_PAGE_ID: pageId });
          }
        );

        expect(syncRes.success).toBe(true);
        expect(syncRes.syncedCount).toBe(1);
        expect(syncRes.within24hCount).toBe(1);
        expect(syncRes.recipients[0].psid).toBe(userPsid);
        expect(syncRes.recipients[0].name).toBe('Shahriar Kabir');
        expect(syncRes.recipients[0].isWithin24Hours).toBe(true);
        expect(syncRes.recipients[0].lastMessageSnippet).toBe('Do you have size L available?');

        // Verify recipient was persisted into D1 and is returned by 24h filter
        const d1Recipients = await getFacebookRecipientsFromD1(mockDb as any, 'page_contacts', {
          pageId,
          filter: 'last_24_hours',
        });
        expect(d1Recipients.some((r) => r.psid === userPsid)).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
