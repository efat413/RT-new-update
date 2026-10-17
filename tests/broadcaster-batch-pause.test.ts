import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateDelayConfig,
  validateBatchConfig,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BATCH_PAUSE_SEC,
  DEFAULT_MIN_DELAY_SEC,
  DEFAULT_MAX_DELAY_SEC,
} from '../src/server/broadcasterSecurity';
import { dispatchBroadcasterBatch } from '../src/server/broadcasterService';

describe('Facebook Broadcaster Batch Size & Message Delay System', () => {
  describe('1. Message Delay Configuration Validation', () => {
    it('accepts safe default delay range (2s - 5s)', () => {
      const res = validateDelayConfig(2, 5);
      expect(res.valid).toBe(true);
      expect(res.min).toBe(2);
      expect(res.max).toBe(5);
    });

    it('rejects Max Delay smaller than Min Delay', () => {
      const res = validateDelayConfig(5, 2);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/cannot be less than/i);
    });

    it('rejects negative delay values', () => {
      const res1 = validateDelayConfig(-1, 5);
      expect(res1.valid).toBe(false);
      expect(res1.error).toMatch(/non-negative/i);

      const res2 = validateDelayConfig(2, -3);
      expect(res2.valid).toBe(false);
      expect(res2.error).toMatch(/non-negative/i);
    });

    it('rejects non-finite, NaN, or malformed delay numbers', () => {
      const res1 = validateDelayConfig(NaN, 5);
      expect(res1.valid).toBe(false);

      const res2 = validateDelayConfig(2, Infinity);
      expect(res2.valid).toBe(false);

      const res3 = validateDelayConfig('abc', 5);
      expect(res3.valid).toBe(false);
    });

    it('rejects excessively large delay values exceeding safe ceiling (60s)', () => {
      const res = validateDelayConfig(10, 75);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/exceeds the safe ceiling/i);
    });
  });

  describe('2. Batch Size & Batch Pause Duration Validation', () => {
    it('accepts safe default batch configurations (50 size, 30s pause)', () => {
      const res = validateBatchConfig(DEFAULT_BATCH_SIZE, DEFAULT_BATCH_PAUSE_SEC);
      expect(res.valid).toBe(true);
      expect(res.batchSize).toBe(50);
      expect(res.batchPauseSec).toBe(30);
    });

    it('accepts valid custom batch parameters', () => {
      const res = validateBatchConfig(25, 45);
      expect(res.valid).toBe(true);
      expect(res.batchSize).toBe(25);
      expect(res.batchPauseSec).toBe(45);
    });

    it('rejects batch size outside of safe bounds (1 - 1000)', () => {
      const resZero = validateBatchConfig(0, 30);
      expect(resZero.valid).toBe(false);
      expect(resZero.error).toMatch(/between 1 and 1000/i);

      const resNeg = validateBatchConfig(-10, 30);
      expect(resNeg.valid).toBe(false);

      const resTooBig = validateBatchConfig(1001, 30);
      expect(resTooBig.valid).toBe(false);
      expect(resTooBig.error).toMatch(/between 1 and 1000/i);
    });

    it('rejects non-integer or malformed batch sizes', () => {
      const resFloat = validateBatchConfig(12.5, 30);
      expect(resFloat.valid).toBe(false);
      expect(resFloat.error).toMatch(/integer/i);

      const resNaN = validateBatchConfig(NaN, 30);
      expect(resNaN.valid).toBe(false);
    });

    it('rejects batch pause duration outside of safe bounds (1 - 3600s)', () => {
      const resZero = validateBatchConfig(50, 0);
      expect(resZero.valid).toBe(false);
      expect(resZero.error).toMatch(/at least 1 second/i);

      const resNeg = validateBatchConfig(50, -5);
      expect(resNeg.valid).toBe(false);

      const resTooBig = validateBatchConfig(50, 4000);
      expect(resTooBig.valid).toBe(false);
      expect(resTooBig.error).toMatch(/exceeds the safe ceiling/i);
    });

    it('rejects non-integer or malformed batch pause duration', () => {
      const resFloat = validateBatchConfig(50, 15.8);
      expect(resFloat.valid).toBe(false);
      expect(resFloat.error).toMatch(/integer/i);
    });
  });

  describe('3. Server-Side Batch Threshold Enforcement & Pause Mechanics', () => {
    function createMockD1() {
      const tables: Record<string, any[]> = {
        broadcaster_deliveries: [],
        broadcaster_campaign_jobs: [],
        broadcaster_config: [],
      };

      return {
        prepare: vi.fn((sql: string) => {
          const stmt = {
            run: async () => ({ success: true, meta: { changes: 1 } }),
            first: async <T>() => null as unknown as T,
            all: async <T>() => ({ results: [] as T[], success: true }),
            bind: (...params: any[]) => ({
              run: async () => {
                if (sql.includes('broadcaster_config')) {
                  const [id, page_id, token, preview, status, minD, maxD, bSize, bPause, templates] = params;
                  const idx = tables.broadcaster_config.findIndex((r) => r.page_id === page_id);
                  const record = {
                    id: 'default',
                    page_id,
                    encrypted_access_token: token,
                    token_preview: preview,
                    token_status: status,
                    min_delay_sec: minD ?? 2,
                    max_delay_sec: maxD ?? 5,
                    batch_size: bSize ?? 50,
                    batch_pause_sec: bPause ?? 30,
                    default_message_templates: templates,
                    verified_at: new Date().toISOString(),
                  };
                  if (idx >= 0) tables.broadcaster_config[idx] = record;
                  else tables.broadcaster_config.push(record);
                  return { success: true, meta: { changes: 1 } };
                }

                if (sql.includes('INSERT INTO broadcaster_campaign_jobs')) {
                  const [
                    id,
                    page_id,
                    campaign_id,
                    status,
                    total_count,
                    processed_count,
                    delivered_count,
                    ambiguous_count,
                    failed_count,
                    skipped_count,
                    min_delay_sec,
                    max_delay_sec,
                    batch_size,
                    batch_pause_sec,
                    current_batch_delivered,
                    paused_until,
                    pause_reason,
                    message_template,
                    current_psid,
                    checkpoint_note,
                  ] = params;

                  const existingIdx = tables.broadcaster_campaign_jobs.findIndex((j) => j.campaign_id === campaign_id);
                  const record = {
                    id,
                    campaign_id,
                    page_id,
                    status,
                    total_count,
                    processed_count,
                    delivered_count,
                    ambiguous_count,
                    failed_count,
                    skipped_count,
                    min_delay_sec,
                    max_delay_sec,
                    batch_size,
                    batch_pause_sec,
                    current_batch_delivered,
                    paused_until,
                    pause_reason,
                    checkpoint_note,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  if (existingIdx >= 0) tables.broadcaster_campaign_jobs[existingIdx] = record;
                  else tables.broadcaster_campaign_jobs.push(record);
                  return { success: true, meta: { changes: 1 } };
                }

                if (sql.includes('UPDATE broadcaster_campaign_jobs SET status = ?')) {
                  const [status, note, reason, paused_until, current_batch, campaign_id] = params;
                  const job = tables.broadcaster_campaign_jobs.find((j) => j.campaign_id === campaign_id);
                  if (job) {
                    job.status = status;
                    if (note) job.checkpoint_note = note;
                    if (reason !== undefined) job.pause_reason = reason;
                    if (paused_until !== undefined) job.paused_until = paused_until;
                    if (current_batch !== undefined && current_batch !== null) job.current_batch_delivered = current_batch;
                    job.updated_at = new Date().toISOString();
                  }
                  return { success: true, meta: { changes: 1 } };
                }

                if (sql.includes('INSERT INTO broadcaster_deliveries')) {
                  const [id, page_id, psid, campaign_id, queued_at, created_at, updated_at] = params;
                  const exists = tables.broadcaster_deliveries.some((d) => d.page_id === page_id && d.recipient_psid === psid);
                  if (exists) {
                    return { success: true, meta: { changes: 0 } };
                  }
                  tables.broadcaster_deliveries.push({
                    id,
                    page_id,
                    recipient_psid: psid,
                    campaign_id,
                    status: 'QUEUED',
                    queued_at,
                    created_at,
                    updated_at,
                  });
                  return { success: true, meta: { changes: 1 } };
                }

                if (sql.includes('UPDATE broadcaster_deliveries')) {
                  if (sql.includes("SET status = 'DELIVERED'")) {
                    const [mid, delivered_at, updated_at, page_id, psid] = params;
                    const item = tables.broadcaster_deliveries.find((d) => d.page_id === page_id && d.recipient_psid === psid);
                    if (item) {
                      item.status = 'DELIVERED';
                      item.message_id = mid;
                      item.delivered_at = delivered_at;
                      item.updated_at = updated_at;
                    }
                  } else if (sql.includes("SET status = 'FAILED'")) {
                    const [error, updated_at, page_id, psid] = params;
                    const item = tables.broadcaster_deliveries.find((d) => d.page_id === page_id && d.recipient_psid === psid);
                    if (item) {
                      item.status = 'FAILED';
                      item.error_message = error;
                      item.updated_at = updated_at;
                    }
                  } else if (sql.includes("SET status = 'AMBIGUOUS'")) {
                    const [error, updated_at, page_id, psid] = params;
                    const item = tables.broadcaster_deliveries.find((d) => d.page_id === page_id && d.recipient_psid === psid);
                    if (item) {
                      item.status = 'AMBIGUOUS';
                      item.error_message = error;
                      item.updated_at = updated_at;
                    }
                  }
                  return { success: true, meta: { changes: 1 } };
                }

                return { success: true, meta: { changes: 1 } };
              },
              first: async <T>() => {
                if (sql.includes('FROM broadcaster_campaign_jobs WHERE campaign_id = ?')) {
                  const [cId] = params;
                  const job = tables.broadcaster_campaign_jobs.find((j) => j.campaign_id === cId);
                  return (job || null) as unknown as T;
                }
                if (sql.includes('FROM broadcaster_config WHERE page_id = ?')) {
                  const [pId] = params;
                  const conf = tables.broadcaster_config.find((c) => c.page_id === pId);
                  return (conf || null) as unknown as T;
                }
                if (sql.includes('FROM broadcaster_deliveries WHERE page_id = ? AND recipient_psid = ?')) {
                  const [pId, psid] = params;
                  const item = tables.broadcaster_deliveries.find((d) => d.page_id === pId && d.recipient_psid === psid);
                  return (item || null) as unknown as T;
                }
                return null as unknown as T;
              },
              all: async <T>() => {
                if (sql.includes('FROM broadcaster_deliveries WHERE page_id = ? AND recipient_psid IN')) {
                  const [pId, ...psids] = params;
                  const matching = tables.broadcaster_deliveries.filter((d) => d.page_id === pId && psids.includes(d.recipient_psid));
                  return { results: matching as T[], success: true };
                }
                return { results: [] as T[], success: true };
              },
            }),
          };
          return stmt;
        }),
        _tables: tables,
      };
    }

    it('enters BATCH_PAUSED when batchSize successful deliveries are achieved', async () => {
      const mockDb = createMockD1();

      const mockFetch: typeof fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ recipient_id: '123', message_id: 'mid.test.1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const result = await dispatchBroadcasterBatch(mockDb as any, {
        pageId: 'page-batch-test',
        campaignId: 'camp-batch-1',
        messageText: 'Hello {name}!',
        recipients: [
          { psid: 'recip_1', name: 'User 1' },
          { psid: 'recip_2', name: 'User 2' },
          { psid: 'recip_3', name: 'User 3' },
          { psid: 'recip_4', name: 'User 4' },
        ],
        pageAccessToken: 'EAAG_TEST_TOKEN',
        batchSize: 2, // Pause after 2 successful deliveries
        batchPauseSec: 15,
        minDelaySec: 0,
        maxDelaySec: 0,
        customFetch: mockFetch,
      });

      expect(result.jobStatus).toBe('BATCH_PAUSED');
      expect(result.deliveredCount).toBe(2);
      expect(result.totalProcessed).toBe(2);
      expect(result.remainingCount).toBe(2);
      expect(result.batchSize).toBe(2);
      expect(result.batchPauseSec).toBe(15);
      expect(result.pausedUntil).toBeTruthy();
      expect(result.pauseReason).toBe('BATCH_PAUSE');

      const savedJob = mockDb._tables.broadcaster_campaign_jobs.find((j) => j.campaign_id === 'camp-batch-1');
      expect(savedJob).toBeTruthy();
      expect(savedJob?.status).toBe('PAUSED');
      expect(savedJob?.pause_reason).toBe('BATCH_PAUSE');
      expect(savedJob?.batch_size).toBe(2);
      expect(savedJob?.batch_pause_sec).toBe(15);
      expect(savedJob?.delivered_count).toBe(2);
    });

    it('does NOT increment batch delivery counter on skipped or failed recipients', async () => {
      const mockDb = createMockD1();

      // Recipient 1 already messaged in historical ledger -> SKIPPED
      mockDb._tables.broadcaster_deliveries.push({
        id: 'deliv-pre-1',
        page_id: 'page-batch-test',
        recipient_psid: 'recip_historical',
        campaign_id: 'camp-old',
        status: 'DELIVERED',
        queued_at: new Date().toISOString(),
      });

      // Recipient 2 will fail upstream
      let callCount = 0;
      const mockFetch: typeof fetch = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          // Failure
          return new Response(JSON.stringify({ error: { message: 'Recipient blocked' } }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Success
        return new Response(JSON.stringify({ message_id: 'mid.success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const result = await dispatchBroadcasterBatch(mockDb as any, {
        pageId: 'page-batch-test',
        campaignId: 'camp-batch-threshold-accuracy',
        messageText: 'Hello {name}!',
        recipients: [
          { psid: 'recip_historical' }, // SKIPPED (doesn't count)
          { psid: 'recip_failing' }, // FAILED (doesn't count)
          { psid: 'recip_success_1' }, // DELIVERED (counts as 1)
          { psid: 'recip_success_2' }, // DELIVERED (counts as 2)
          { psid: 'recip_future' }, // Remaining
        ],
        pageAccessToken: 'EAAG_TEST_TOKEN',
        batchSize: 2, // Threshold is 2 DELIVERED recipients
        batchPauseSec: 20,
        minDelaySec: 0,
        maxDelaySec: 0,
        customFetch: mockFetch,
      });

      expect(result.jobStatus).toBe('BATCH_PAUSED');
      expect(result.skippedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.deliveredCount).toBe(2);
      expect(result.totalProcessed).toBe(4);
      expect(result.remainingCount).toBe(1);
    });

    it('rejects overlapping worker during active batch pause', async () => {
      const mockDb = createMockD1();

      const futureExpiry = new Date(Date.now() + 20000).toISOString();
      mockDb._tables.broadcaster_campaign_jobs.push({
        campaign_id: 'camp-active-pause',
        page_id: 'page-batch-test',
        status: 'PAUSED',
        pause_reason: 'BATCH_PAUSE',
        paused_until: futureExpiry,
        total_count: 5,
        processed_count: 2,
        delivered_count: 2,
        batch_size: 2,
        batch_pause_sec: 20,
      });

      const mockFetch = vi.fn();

      const result = await dispatchBroadcasterBatch(mockDb as any, {
        pageId: 'page-batch-test',
        campaignId: 'camp-active-pause',
        messageText: 'Hello!',
        recipients: [
          { psid: 'recip_1' },
          { psid: 'recip_2' },
          { psid: 'recip_3' },
          { psid: 'recip_4' },
          { psid: 'recip_5' },
        ],
        pageAccessToken: 'EAAG_TEST_TOKEN',
        customFetch: mockFetch as any,
      });

      expect(result.jobStatus).toBe('BATCH_PAUSED');
      expect(result.pausedUntil).toBe(futureExpiry);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('manual pause overrides batch pause and halts automatic resumption', async () => {
      const mockDb = createMockD1();

      mockDb._tables.broadcaster_campaign_jobs.push({
        campaign_id: 'camp-manual-pause',
        page_id: 'page-batch-test',
        status: 'PAUSED',
        pause_reason: 'MANUAL_PAUSE',
        paused_until: null,
        total_count: 10,
        processed_count: 4,
        delivered_count: 4,
      });

      const mockFetch = vi.fn();

      const result = await dispatchBroadcasterBatch(mockDb as any, {
        pageId: 'page-batch-test',
        campaignId: 'camp-manual-pause',
        messageText: 'Hello!',
        recipients: [
          { psid: 'recip_1' },
          { psid: 'recip_2' },
          { psid: 'recip_3' },
          { psid: 'recip_4' },
          { psid: 'recip_5' },
        ],
        pageAccessToken: 'EAAG_TEST_TOKEN',
        customFetch: mockFetch as any,
      });

      expect(result.jobStatus).toBe('PAUSED');
      expect(result.pauseReason).toBe('MANUAL_PAUSE');
      expect(result.pausedUntil).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('stopped campaign aborts further dispatch permanently', async () => {
      const mockDb = createMockD1();

      mockDb._tables.broadcaster_campaign_jobs.push({
        campaign_id: 'camp-stopped',
        page_id: 'page-batch-test',
        status: 'STOPPED',
        total_count: 10,
        processed_count: 3,
        delivered_count: 3,
      });

      const mockFetch = vi.fn();

      const result = await dispatchBroadcasterBatch(mockDb as any, {
        pageId: 'page-batch-test',
        campaignId: 'camp-stopped',
        messageText: 'Hello!',
        recipients: [{ psid: 'recip_1' }],
        customFetch: mockFetch as any,
      });

      expect(result.jobStatus).toBe('STOPPED');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
