import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  scanAndFilterRecipients,
  dispatchSingleRecipient,
  dispatchBroadcasterBatch,
  resetBroadcasterEphemeralMemory,
  getBroadcasterDeliveryHistory,
  getBroadcasterSummaryStats,
  normalizePsid,
  isConfirmedBot,
  BroadcasterDeliveryRecord,
} from '../src/server/broadcasterService';
import { runConcurrentBroadcasterQueue } from '../src/server/broadcasterWorker';
import {
  encryptToken,
  decryptToken,
  redactToken,
  validateMetaPageToken,
  validateDelayConfig,
  calculateRandomDelayMs,
  parseMessageTemplates,
  renderMessageForRecipient,
  MAX_SAFE_DELAY_SECONDS,
  META_MESSENGER_MAX_CHARS,
} from '../src/server/broadcasterSecurity';
import { D1Database } from '../src/server/types';

/**
 * Creates an in-memory test D1Database that simulates SQLite with hard UNIQUE(page_id, recipient_psid)
 * and atomic INSERT ... ON CONFLICT DO NOTHING behavior.
 */
function createMockD1Database(): D1Database {
  const deliveries = new Map<string, BroadcasterDeliveryRecord>();
  const scanCache: any[] = [];

  const db: D1Database = {
    prepare(sql: string) {
      let boundValues: any[] = [];
      const stmt: any = {
        bind(...args: any[]) {
          boundValues = args;
          return stmt;
        },
        async run() {
          const norm = sql.trim().replace(/\s+/g, ' ');

          // INSERT INTO broadcaster_deliveries ... ON CONFLICT DO NOTHING
          if (norm.includes('INSERT INTO broadcaster_deliveries')) {
            const [id, pageId, recipientPsid, campaignId, status, queuedAt, createdAt, updatedAt] = boundValues;
            const key = `${pageId}:${recipientPsid}`;

            // Check UNIQUE constraint
            if (deliveries.has(key)) {
              return { success: true, meta: { changes: 0 } };
            }

            const record: BroadcasterDeliveryRecord = {
              id,
              page_id: pageId,
              recipient_psid: recipientPsid,
              campaign_id: campaignId,
              status,
              queued_at: queuedAt,
              created_at: createdAt,
              updated_at: updatedAt,
            };
            deliveries.set(key, record);
            return { success: true, meta: { changes: 1 } };
          }

          // UPDATE broadcaster_deliveries SET status = ...
          if (norm.includes('UPDATE broadcaster_deliveries')) {
            if (norm.includes("status = 'DELIVERED'")) {
              const [messageId, deliveredAt, updatedAt, pageId, recipientPsid] = boundValues;
              const key = `${pageId}:${recipientPsid}`;
              const row = deliveries.get(key);
              if (row) {
                row.status = 'DELIVERED';
                row.message_id = messageId;
                row.delivered_at = deliveredAt;
                row.updated_at = updatedAt;
                row.error_message = null;
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            }

            if (norm.includes("status = 'AMBIGUOUS'")) {
              const [errorMessage, updatedAt, pageId, recipientPsid] = boundValues;
              const key = `${pageId}:${recipientPsid}`;
              const row = deliveries.get(key);
              if (row) {
                row.status = 'AMBIGUOUS';
                row.error_message = errorMessage;
                row.updated_at = updatedAt;
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            }

            if (norm.includes("status = 'FAILED'")) {
              const [errorMessage, updatedAt, pageId, recipientPsid] = boundValues;
              const key = `${pageId}:${recipientPsid}`;
              const row = deliveries.get(key);
              if (row) {
                row.status = 'FAILED';
                row.error_message = errorMessage;
                row.updated_at = updatedAt;
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            }
          }

          // DELETE FROM broadcaster_scan_cache
          if (norm.includes('DELETE FROM broadcaster_scan_cache')) {
            const count = scanCache.length;
            scanCache.length = 0;
            return { success: true, meta: { changes: count } };
          }

          // Schema creations & indexes (no-op in mock)
          if (norm.includes('CREATE TABLE') || norm.includes('CREATE INDEX')) {
            return { success: true, meta: { changes: 0 } };
          }

          return { success: true, meta: { changes: 0 } };
        },
        async first(col?: string) {
          const norm = sql.trim().replace(/\s+/g, ' ');

          // SELECT COUNT(*) as count FROM broadcaster_deliveries
          if (norm.includes('SELECT COUNT(*) as count FROM broadcaster_deliveries')) {
            let list = Array.from(deliveries.values());
            if (boundValues.length > 0 && norm.includes('page_id = ?')) {
              list = list.filter((r) => r.page_id === boundValues[0]);
            }
            if (norm.includes('status = ?')) {
              const status = boundValues[boundValues.length - 1];
              list = list.filter((r) => r.status === status);
            }
            return { count: list.length } as any;
          }

          // Aggregated summary stats
          if (norm.includes("SUM(CASE WHEN status = 'DELIVERED'")) {
            let list = Array.from(deliveries.values());
            if (boundValues.length > 0 && norm.includes('WHERE page_id = ?')) {
              list = list.filter((r) => r.page_id === boundValues[0]);
            }
            const delivered = list.filter((r) => r.status === 'DELIVERED').length;
            const ambiguous = list.filter((r) => r.status === 'AMBIGUOUS').length;
            const failed = list.filter((r) => r.status === 'FAILED').length;
            const queued = list.filter((r) => r.status === 'QUEUED').length;
            return {
              total: list.length,
              delivered,
              ambiguous,
              failed,
              queued,
            } as any;
          }

          return null;
        },
        async all() {
          const norm = sql.trim().replace(/\s+/g, ' ');

          // SELECT ... FROM broadcaster_deliveries WHERE page_id = ? AND recipient_psid IN (...)
          if (norm.includes('SELECT') && norm.includes('FROM broadcaster_deliveries')) {
            const pageId = boundValues[0];
            let list = Array.from(deliveries.values()).filter((r) => r.page_id === pageId);

            if (norm.includes('recipient_psid IN')) {
              const requestedPsids = new Set(boundValues.slice(1));
              list = list.filter((r) => requestedPsids.has(r.recipient_psid));
            }

            if (norm.includes('status = ?')) {
              const statusVal = boundValues[boundValues.length - 3] || boundValues[1];
              list = list.filter((r) => r.status === statusVal);
            }

            return { success: true, results: list };
          }

          return { success: true, results: [] };
        },
      };
      return stmt;
    },
    async batch(stmts) {
      return Promise.all(stmts.map((s) => s.run()));
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
  };

  return db;
}

describe('Facebook Broadcaster: Atomic Deduplication & One PSID = One Message Ever', () => {
  let db: D1Database;
  const pageId = '104829105829104';

  beforeEach(() => {
    vi.restoreAllMocks();
    db = createMockD1Database();
  });

  describe('1. Recipient Normalization & Bot Validation', () => {
    it('normalizes valid PSID strings and removes outer quotes', () => {
      const res = normalizePsid(' "89012345678901" ');
      expect(res.valid).toBe(true);
      expect(res.psid).toBe('89012345678901');
    });

    it('rejects display names containing whitespace to protect PSID integrity', () => {
      const res = normalizePsid('Adnan Ashik');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('display name');
    });

    it('rejects empty or null PSID inputs', () => {
      expect(normalizePsid(null).valid).toBe(false);
      expect(normalizePsid('   ').valid).toBe(false);
    });

    it('reliably identifies confirmed bot accounts in metadata', () => {
      expect(isConfirmedBot({ psid: '123', is_bot: true })).toBe(true);
      expect(isConfirmedBot({ psid: '123', isBot: true })).toBe(true);
      expect(isConfirmedBot({ psid: '123', account_type: 'bot' })).toBe(true);
      expect(isConfirmedBot({ psid: '123', metadata: { is_bot: true } })).toBe(true);
      expect(isConfirmedBot({ psid: '123', name: 'Real Customer' })).toBe(false);
    });
  });

  describe('2. Multi-Stage Scan & Deterministic Telemetry Reasons', () => {
    it('correctly filters bot accounts, intra-scan duplicates, and historical deliveries with exact telemetry strings', async () => {
      // Seed Campaign A delivery in D1
      const mockMetaFetchSuccess = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ message_id: 'mid.seed.1001' }),
      });

      await dispatchSingleRecipient(db, {
        pageId,
        recipientPsid: 'PSID_HISTORICAL_101',
        campaignId: 'camp-seed-01',
        messageText: 'Seed message',
        customFetch: mockMetaFetchSuccess as any,
      });

      // Now run Scan with mixed audience:
      // - PSID_HISTORICAL_101: Already in D1
      // - PSID_FRESH_201: Fresh
      // - PSID_FRESH_201: Intra-scan duplicate
      // - PSID_BOT_301: Confirmed bot
      const scanResult = await scanAndFilterRecipients(db, {
        pageId,
        campaignId: 'camp-live-02',
        recipients: [
          { psid: 'PSID_HISTORICAL_101', name: 'Old User' },
          { psid: 'PSID_FRESH_201', name: 'New User First' },
          { psid: 'PSID_FRESH_201', name: 'New User Second (Duplicate)' },
          { psid: 'PSID_BOT_301', is_bot: true },
        ],
      });

      expect(scanResult.totalInput).toBe(4);
      expect(scanResult.eligibleCount).toBe(1);
      expect(scanResult.eligibleRecipients[0].psid).toBe('PSID_FRESH_201');

      // Verify exact deterministic telemetry strings:
      const reasons = scanResult.telemetryLogs.map((l) => l.reason);
      expect(reasons).toContain('Skipped: Already messaged (historical)');
      expect(reasons).toContain('Skipped: Duplicate in current scan');
      expect(reasons).toContain('Skipped: Ineligible / Bot account');
    });
  });

  describe('3. Cross-Campaign PSID Suppression (One PSID = One Message Ever)', () => {
    it('locks delivered PSID in Campaign 1 and suppresses it across Campaign 2, 3, and browser reloads', async () => {
      const mockMetaFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ recipient_id: 'PSID_VIP_001', message_id: 'mid.meta.confirmed.001' }),
      });

      // Campaign 1: Dispatch to PSID_VIP_001
      const camp1Result = await dispatchBroadcasterBatch(db, {
        pageId,
        campaignId: 'campaign-eid-offer',
        messageText: 'Eid Offer 2026',
        recipients: [{ psid: 'PSID_VIP_001' }],
        customFetch: mockMetaFetch as any,
      });

      expect(camp1Result.deliveredCount).toBe(1);
      expect(camp1Result.items[0].status).toBe('DELIVERED');
      expect(camp1Result.items[0].reason).toBe('Delivered: Confirmed by Meta');
      expect(mockMetaFetch).toHaveBeenCalledTimes(1);

      // Verify D1 delivery ledger has permanent DELIVERED record
      const history1 = await getBroadcasterDeliveryHistory(db, { pageId });
      expect(history1.total).toBe(1);
      expect(history1.deliveries[0].recipient_psid).toBe('PSID_VIP_001');
      expect(history1.deliveries[0].status).toBe('DELIVERED');

      // Campaign 2: Later campaign attempts to broadcast to the same PSID_VIP_001
      const camp2Scan = await scanAndFilterRecipients(db, {
        pageId,
        campaignId: 'campaign-pohela-boishakh',
        recipients: [{ psid: 'PSID_VIP_001' }],
      });

      // Pre-filter suppresses it
      expect(camp2Scan.eligibleCount).toBe(0);
      expect(camp2Scan.telemetryLogs[0].reason).toBe('Skipped: Already messaged (historical)');

      // If directly pushed to dispatch, atomic D1 reservation also rejects it
      const camp2Dispatch = await dispatchBroadcasterBatch(db, {
        pageId,
        campaignId: 'campaign-pohela-boishakh',
        messageText: 'New Year Offer',
        recipients: [{ psid: 'PSID_VIP_001' }],
        customFetch: mockMetaFetch as any,
      });

      expect(camp2Dispatch.deliveredCount).toBe(0);
      expect(camp2Dispatch.skippedCount).toBe(1);
      expect(camp2Dispatch.items[0].status).toBe('SKIPPED');
      expect(camp2Dispatch.items[0].reason).toBe('Skipped: Already messaged (historical)');

      // Meta API was NOT called a second time (called exactly 1 time in total)
      expect(mockMetaFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Parallel / Concurrent Worker Race Condition on Identical PSID', () => {
    it('guarantees that simultaneous parallel workers competing for the same PSID resolve with exactly 1 winner and zero double-sends', async () => {
      const targetPsid = 'PSID_CONCURRENT_RACE_999';
      let metaCallCount = 0;

      // Mock Meta API with slight async delay to allow true concurrent overlap
      const mockConcurrentFetch = vi.fn().mockImplementation(async () => {
        metaCallCount++;
        await new Promise((r) => setTimeout(r, 10));
        return {
          status: 200,
          json: async () => ({ message_id: `mid.race.won.${Date.now()}` }),
        };
      });

      // 5 concurrent worker tasks competing for the exact same PSID simultaneously
      const workerPromises = [1, 2, 3, 4, 5].map((workerId) =>
        dispatchSingleRecipient(db, {
          pageId,
          recipientPsid: targetPsid,
          campaignId: `camp-worker-${workerId}`,
          messageText: `Worker ${workerId} dispatch`,
          customFetch: mockConcurrentFetch as any,
        })
      );

      const results = await Promise.all(workerPromises);

      // Exactly 1 worker wins atomic reservation and delivers
      const deliveredResults = results.filter((r) => r.status === 'DELIVERED');
      const skippedResults = results.filter((r) => r.status === 'SKIPPED');

      expect(deliveredResults.length).toBe(1);
      expect(skippedResults.length).toBe(4);
      expect(deliveredResults[0].reason).toBe('Delivered: Confirmed by Meta');
      expect(skippedResults[0].reason).toBe('Skipped: Already messaged (historical)');

      // Meta API was called exactly once
      expect(metaCallCount).toBe(1);

      // D1 delivery ledger has exactly 1 entry for this PSID
      const history = await getBroadcasterDeliveryHistory(db, { pageId });
      const matching = history.deliveries.filter((d) => d.recipient_psid === targetPsid);
      expect(matching.length).toBe(1);
      expect(matching[0].status).toBe('DELIVERED');
    });
  });

  describe('5. Ambiguous Timeout & Network Drop Fail-Safe Behavior', () => {
    it('locks status as AMBIGUOUS on timeout, aborts auto-retry, and permanently suppresses duplicate dispatch', async () => {
      const targetPsid = 'PSID_TIMEOUT_VICTIM_404';

      // Mock fetch simulating network timeout abort
      const mockTimeoutFetch = vi.fn().mockImplementation(() => {
        const abortErr = new Error('The operation was aborted due to timeout');
        abortErr.name = 'AbortError';
        return Promise.reject(abortErr);
      });

      const dispatchResult = await dispatchSingleRecipient(db, {
        pageId,
        recipientPsid: targetPsid,
        campaignId: 'camp-timeout-test',
        messageText: 'Timeout test message',
        timeoutMs: 100,
        customFetch: mockTimeoutFetch as any,
      });

      // Must be classified as AMBIGUOUS with fail-safe reason
      expect(dispatchResult.status).toBe('AMBIGUOUS');
      expect(dispatchResult.reason).toBe('Failed: Ambiguous network timeout (fail-safe locked)');
      expect(dispatchResult.error_message).toContain('Network timeout');

      // Verify D1 state is permanently AMBIGUOUS
      const history = await getBroadcasterDeliveryHistory(db, { pageId });
      const record = history.deliveries.find((d) => d.recipient_psid === targetPsid);
      expect(record).toBeDefined();
      expect(record?.status).toBe('AMBIGUOUS');

      // Next attempt or campaign must NOT auto-retry this PSID!
      const mockMetaSuccess = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ message_id: 'mid.retry' }) });

      const retryDispatch = await dispatchSingleRecipient(db, {
        pageId,
        recipientPsid: targetPsid,
        campaignId: 'camp-timeout-retry-attempt',
        messageText: 'Attempting retry',
        customFetch: mockMetaSuccess as any,
      });

      // Atomic guard suppresses dispatch
      expect(retryDispatch.status).toBe('SKIPPED');
      expect(retryDispatch.reason).toBe('Skipped: Already messaged (historical)');
      expect(mockMetaSuccess).not.toHaveBeenCalled();
    });

    it('marks AMBIGUOUS on upstream 502/504 Bad Gateway / Gateway Timeout to protect against duplicate send', async () => {
      const mockGatewayTimeoutFetch = vi.fn().mockResolvedValue({
        status: 504,
        text: async () => 'Gateway Timeout upstream from Meta',
      });

      const res = await dispatchSingleRecipient(db, {
        pageId,
        recipientPsid: 'PSID_504_TEST',
        campaignId: 'camp-504',
        messageText: '504 test',
        customFetch: mockGatewayTimeoutFetch as any,
      });

      expect(res.status).toBe('AMBIGUOUS');
      expect(res.reason).toBe('Failed: Ambiguous network timeout (fail-safe locked)');
      expect(res.error_message).toContain('504');
    });

    it('marks FAILED on upstream 400 Bad Request client error', async () => {
      const mockClientErrorFetch = vi.fn().mockResolvedValue({
        status: 400,
        text: async () => '{"error":{"message":"Invalid OAuth access token."}}',
      });

      const res = await dispatchSingleRecipient(db, {
        pageId,
        recipientPsid: 'PSID_400_TEST',
        campaignId: 'camp-400',
        messageText: '400 test',
        customFetch: mockClientErrorFetch as any,
      });

      expect(res.status).toBe('FAILED');
      expect(res.reason).toBe('Failed: Upstream API error');
    });
  });

  describe('6. Data Protection: Safe Ephemeral Memory Reset', () => {
    it('ensures "Reset Memory" purges only scan caches and strictly preserves the permanent delivery ledger', async () => {
      const mockMetaFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ message_id: 'mid.perm.123' }),
      });

      // Deliver 3 permanent recipients into D1
      for (const psid of ['PSID_PERM_1', 'PSID_PERM_2', 'PSID_PERM_3']) {
        await dispatchSingleRecipient(db, {
          pageId,
          recipientPsid: psid,
          campaignId: 'camp-perm-initial',
          messageText: 'Initial delivery',
          customFetch: mockMetaFetch as any,
        });
      }

      // Check stats before reset
      const statsBefore = await getBroadcasterSummaryStats(db, pageId);
      expect(statsBefore.totalDeliveries).toBe(3);
      expect(statsBefore.deliveredCount).toBe(3);

      // Perform Ephemeral Reset
      const resetResult = await resetBroadcasterEphemeralMemory(db, pageId);
      expect(resetResult.success).toBe(true);
      expect(resetResult.permanentLedgerRowsProtected).toBe(3);

      // Verify delivery ledger is completely untouched
      const statsAfter = await getBroadcasterSummaryStats(db, pageId);
      expect(statsAfter.totalDeliveries).toBe(3);
      expect(statsAfter.deliveredCount).toBe(3);

      const historyAfter = await getBroadcasterDeliveryHistory(db, { pageId });
      expect(historyAfter.total).toBe(3);
      const psids = historyAfter.deliveries.map((d) => d.recipient_psid);
      expect(psids).toContain('PSID_PERM_1');
      expect(psids).toContain('PSID_PERM_2');
      expect(psids).toContain('PSID_PERM_3');
    });
  });

  describe('7. Concurrent Queue Worker Harness', () => {
    it('executes runConcurrentBroadcasterQueue and records detailed worker reservation traces', async () => {
      const mockMetaFetch = vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ message_id: 'mid.queue.worker' }),
      });

      const queueResult = await runConcurrentBroadcasterQueue(db, {
        pageId,
        campaignId: 'camp-worker-pool',
        messageText: 'Queue test',
        recipients: [
          { psid: 'PSID_Q_1' },
          { psid: 'PSID_Q_2' },
          { psid: 'PSID_Q_1' }, // Duplicate in stream
        ],
        config: {
          workerCount: 3,
          customFetch: mockMetaFetch as any,
        },
      });

      expect(queueResult.deliveredCount).toBe(2);
      expect(queueResult.skippedRaceCount).toBe(1);
      expect(queueResult.traces.length).toBeGreaterThanOrEqual(3);
      expect(queueResult.traces.some((t) => t.action === 'RESERVATION_ATTEMPT')).toBe(true);
      expect(queueResult.traces.some((t) => t.action === 'RESERVATION_LOST_SUPPRESSED')).toBe(true);
    });
  });

  describe('8. Secure Token Encryption & Meta Graph API Validation', () => {
    const testSecret = 'test-admin-secret-rongdhonu-2026-key';

    it('encrypts and decrypts Page Access Token using AES-256-GCM with PBKDF2', async () => {
      const rawToken = 'EAAG_LIVE_PAGE_ACCESS_TOKEN_SECRET_987654321';
      const encrypted = await encryptToken(rawToken, testSecret);

      expect(encrypted).not.toBe(rawToken);
      expect(encrypted.split(':')).toHaveLength(3); // salt:iv:ciphertext

      const decrypted = await decryptToken(encrypted, testSecret);
      expect(decrypted).toBe(rawToken);
    });

    it('redacts tokens safely for UI preview without leaking secrets', () => {
      expect(redactToken('EAAG_LONG_PAGE_ACCESS_TOKEN_12345')).toBe('EAAG_LO...2345');
      expect(redactToken('1234567890')).toBe('********');
      expect(redactToken(null)).toBe('unconfigured');
    });

    it('validates token with Meta Graph API when Page ID matches', async () => {
      const mockMetaFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: pageId,
          name: 'Rongdhonu Trade Official',
          category: 'Retail Store',
        }),
      });

      const res = await validateMetaPageToken({
        token: 'EAAG_VALID_TOKEN',
        expectedPageId: pageId,
        customFetch: mockMetaFetch as any,
      });

      expect(res.valid).toBe(true);
      expect(res.pageId).toBe(pageId);
      expect(res.pageName).toBe('Rongdhonu Trade Official');
      expect(res.permissions).toContain('pages_messaging');
    });

    it('strictly rejects tokens belonging to a mismatched or arbitrary Page ID', async () => {
      const mockMetaFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: '999999999999999', // Mismatched Page ID
          name: 'Different Impostor Page',
        }),
      });

      const res = await validateMetaPageToken({
        token: 'EAAG_MISMATCHED_TOKEN',
        expectedPageId: pageId,
        customFetch: mockMetaFetch as any,
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain('Page ID mismatch');
    });

    it('handles Meta Graph API error responses gracefully', async () => {
      const mockMetaFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: { message: 'Invalid OAuth access token - Cannot parse access token' },
        }),
      });

      const res = await validateMetaPageToken({
        token: 'EAAG_INVALID_TOKEN',
        expectedPageId: pageId,
        customFetch: mockMetaFetch as any,
      });

      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid OAuth access token');
    });
  });

  describe('9. Configurable Server-Side Delays', () => {
    it('accepts valid default delay configurations (2s min, 5s max)', () => {
      const res = validateDelayConfig(2, 5);
      expect(res.valid).toBe(true);
      expect(res.min).toBe(2);
      expect(res.max).toBe(5);
    });

    it('rejects Max Delay below Min Delay', () => {
      const res = validateDelayConfig(5, 2);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('cannot be less than Min Delay');
    });

    it('rejects negative delay values', () => {
      expect(validateDelayConfig(-1, 5).valid).toBe(false);
      expect(validateDelayConfig(2, -3).valid).toBe(false);
    });

    it('enforces safe upper limit ceiling (<= 60s)', () => {
      const res = validateDelayConfig(2, 120, 60);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('exceeds the safe ceiling');
    });

    it('calculates randomized jitter delay within bounds', () => {
      for (let i = 0; i < 20; i++) {
        const delay = calculateRandomDelayMs(2, 5);
        expect(delay).toBeGreaterThanOrEqual(2000);
        expect(delay).toBeLessThanOrEqual(5000);
      }
    });
  });

  describe('10. Message Variations & {name} Substitution Engine', () => {
    it('parses multiple message templates separated by "|"', () => {
      const raw = 'Template A | Template B |  Template C  ';
      const templates = parseMessageTemplates(raw);
      expect(templates).toEqual(['Template A', 'Template B', 'Template C']);
    });

    it('substitutes {name} correctly when recipient name is available', () => {
      const rendered = renderMessageForRecipient({
        templates: ['স্বাগতম {name}! রঙধনু ট্রেড এ আপনাকে স্বাগতম।'],
        recipientIndex: 0,
        recipientPsid: 'PSID_001',
        recipientName: 'আহমেদ',
      });

      expect(rendered.text).toBe('স্বাগতম আহমেদ! রঙধনু ট্রেড এ আপনাকে স্বাগতম।');
      expect(rendered.nameSubstituted).toBe(true);
      expect(rendered.charCount).toBeGreaterThan(10);
    });

    it('cleanly cleans up {name} and punctuation when recipient name is missing', () => {
      const rendered = renderMessageForRecipient({
        templates: ['স্বাগতম {name}! রঙধনু ট্রেড এ আপনাকে স্বাগতম।'],
        recipientIndex: 0,
        recipientPsid: 'PSID_002',
        recipientName: undefined,
      });

      expect(rendered.text).toBe('স্বাগতম! রঙধনু ট্রেড এ আপনাকে স্বাগতম।');
      expect(rendered.nameSubstituted).toBe(false);
      expect(rendered.text).not.toContain('{name}');
    });

    it('distributes variations across recipients in round-robin fashion', () => {
      const templates = ['Variation One', 'Variation Two', 'Variation Three'];
      const r0 = renderMessageForRecipient({ templates, recipientIndex: 0, recipientPsid: '1' });
      const r1 = renderMessageForRecipient({ templates, recipientIndex: 1, recipientPsid: '2' });
      const r2 = renderMessageForRecipient({ templates, recipientIndex: 2, recipientPsid: '3' });
      const r3 = renderMessageForRecipient({ templates, recipientIndex: 3, recipientPsid: '4' });

      expect(r0.text).toBe('Variation One');
      expect(r1.text).toBe('Variation Two');
      expect(r2.text).toBe('Variation Three');
      expect(r3.text).toBe('Variation One');
    });

    it('calculates Unicode and Bengali character counts accurately', () => {
      const bengaliText = 'রঙধনু ট্রেড - প্রিমিয়াম কোয়ালিটি পণ্য';
      const count = Array.from(bengaliText).length;
      expect(count).toBe(37);
    });
  });
});
