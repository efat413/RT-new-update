import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  saveBroadcasterConfig,
  getBroadcasterConfig,
  ensureBroadcasterDeliveriesTable,
} from '../src/server/db';
import { handleBroadcasterApiRequest } from '../src/server/broadcasterRouter';
import { encryptToken, decryptToken, redactToken } from '../src/server/broadcasterSecurity';

/**
 * Creates an in-memory D1Database wrapper powered by Node 22 native SQLite engine
 * to enforce exact D1 constraint and SQL execution behavior.
 */
function createTestD1Database(): any {
  const sqlite = new DatabaseSync(':memory:');

  return {
    rawDb: sqlite,
    prepare: (sql: string) => {
      let boundParams: any[] = [];
      const stmt = {
        bind: (...params: any[]) => {
          boundParams = params;
          return stmt;
        },
        first: async <T = any>(colName?: string): Promise<T | null> => {
          try {
            const s = sqlite.prepare(sql);
            const row = s.get(...boundParams) as any;
            if (!row) return null;
            if (colName) return row[colName];
            return row;
          } catch (err: any) {
            throw new Error(`D1_ERROR: ${err.message}`);
          }
        },
        all: async <T = any>(): Promise<{ results: T[]; success: boolean }> => {
          try {
            const s = sqlite.prepare(sql);
            const results = s.all(...boundParams) as T[];
            return { results, success: true };
          } catch (err: any) {
            throw new Error(`D1_ERROR: ${err.message}`);
          }
        },
        run: async (): Promise<{ success: boolean; meta: any }> => {
          try {
            const s = sqlite.prepare(sql);
            const res = s.run(...boundParams);
            return {
              success: true,
              meta: {
                changes: res.changes,
                last_row_id: Number(res.lastInsertRowid),
              },
            };
          } catch (err: any) {
            throw new Error(`D1_ERROR: ${err.message}`);
          }
        },
      };
      return stmt;
    },
    batch: async (statements: any[]) => {
      const results = [];
      for (const st of statements) {
        results.push(await st.run());
      }
      return results;
    },
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
}

describe('Facebook Broadcaster Configuration Save & D1 Upsert Hardening', () => {
  let db: any;
  const masterSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(async () => {
    db = createTestD1Database();
    await ensureBroadcasterDeliveriesTable(db);
  });

  it('1. Saves a new Page ID successfully into broadcaster_config', async () => {
    const pageId = '1122334455';
    const encryptedToken = await encryptToken('EAAG_MOCK_TOKEN_NEW_1', masterSecret);

    await saveBroadcasterConfig(db, {
      page_id: pageId,
      encrypted_access_token: encryptedToken,
      token_preview: redactToken('EAAG_MOCK_TOKEN_NEW_1'),
      token_status: 'configured',
      min_delay_sec: 3,
      max_delay_sec: 8,
      batch_size: 40,
      batch_pause_sec: 25,
      default_message_templates: 'Template 1 | Template 2',
      anti_duplicate_enabled: 1,
    });

    const saved = await getBroadcasterConfig(db, pageId);
    expect(saved).not.toBeNull();
    expect(saved?.page_id).toBe(pageId);
    expect(saved?.min_delay_sec).toBe(3);
    expect(saved?.max_delay_sec).toBe(8);
    expect(saved?.batch_size).toBe(40);
    expect(saved?.batch_pause_sec).toBe(25);
    expect(saved?.token_preview).toContain('EAAG_MO');
    expect(saved?.anti_duplicate_enabled).toBe(true);

    const decrypted = await decryptToken(saved!.encrypted_access_token!, masterSecret);
    expect(decrypted).toBe('EAAG_MOCK_TOKEN_NEW_1');
  });

  it('2. Saves the same Page ID again without causing UNIQUE constraint error', async () => {
    const pageId = '104829105829104';
    const token1 = await encryptToken('EAAG_TEST_TOKEN_INITIAL', masterSecret);

    // Initial save
    await saveBroadcasterConfig(db, {
      page_id: pageId,
      encrypted_access_token: token1,
      token_preview: redactToken('EAAG_TEST_TOKEN_INITIAL'),
      token_status: 'configured',
      min_delay_sec: 2,
      max_delay_sec: 5,
      batch_size: 50,
      batch_pause_sec: 30,
    });

    // Second save for the exact same Page ID - MUST NOT THROW UNIQUE constraint error
    await expect(
      saveBroadcasterConfig(db, {
        page_id: pageId,
        min_delay_sec: 4,
        max_delay_sec: 10,
        batch_size: 75,
        batch_pause_sec: 45,
      })
    ).resolves.not.toThrow();

    const allConfigs = await db.rawDb.prepare('SELECT * FROM broadcaster_config WHERE page_id = ?').all(pageId);
    expect(allConfigs).toHaveLength(1); // Exact single row preserved

    const updated = await getBroadcasterConfig(db, pageId);
    expect(updated?.min_delay_sec).toBe(4);
    expect(updated?.max_delay_sec).toBe(10);
    expect(updated?.batch_size).toBe(75);
    expect(updated?.batch_pause_sec).toBe(45);
  });

  it('3. Updates configuration fields on an existing row without creating duplicate rows', async () => {
    const pageId = '7788990011';
    await saveBroadcasterConfig(db, {
      page_id: pageId,
      min_delay_sec: 2,
      max_delay_sec: 4,
      batch_size: 30,
      batch_pause_sec: 15,
      default_message_templates: 'Original Template',
      anti_duplicate_enabled: 1,
    });

    // Update settings multiple times
    await saveBroadcasterConfig(db, {
      page_id: pageId,
      min_delay_sec: 5,
      max_delay_sec: 15,
    });

    await saveBroadcasterConfig(db, {
      page_id: pageId,
      batch_size: 100,
      default_message_templates: 'Updated Template Variation A | Variation B',
      anti_duplicate_enabled: 0,
    });

    const rows = await db.rawDb.prepare('SELECT id, page_id, min_delay_sec, max_delay_sec, batch_size, default_message_templates, anti_duplicate_enabled FROM broadcaster_config WHERE page_id = ?').all(pageId);
    expect(rows).toHaveLength(1);
    expect(rows[0].min_delay_sec).toBe(5);
    expect(rows[0].max_delay_sec).toBe(15);
    expect(rows[0].batch_size).toBe(100);
    expect(rows[0].default_message_templates).toBe('Updated Template Variation A | Variation B');
    expect(rows[0].anti_duplicate_enabled).toBe(0);
  });

  it('4. Preserves encrypted Page Access Token when the user leaves the token field blank', async () => {
    const pageId = '3344556677';
    const originalToken = 'EAAG_SECRET_PAGE_ACCESS_TOKEN_VALUE';
    const encryptedOriginal = await encryptToken(originalToken, masterSecret);
    const originalPreview = redactToken(originalToken);

    // Initial save with token
    await saveBroadcasterConfig(db, {
      page_id: pageId,
      encrypted_access_token: encryptedOriginal,
      token_preview: originalPreview,
      token_status: 'configured',
      min_delay_sec: 2,
      max_delay_sec: 5,
    });

    // Subsequent save leaving token omitted / blank
    await saveBroadcasterConfig(db, {
      page_id: pageId,
      encrypted_access_token: undefined, // blank input
      token_preview: undefined,
      token_status: undefined,
      min_delay_sec: 4,
      max_delay_sec: 9,
    });

    const saved = await getBroadcasterConfig(db, pageId);
    expect(saved).not.toBeNull();
    // Token must not be overwritten or wiped with empty string/null
    expect(saved?.encrypted_access_token).toBe(encryptedOriginal);
    expect(saved?.token_preview).toBe(originalPreview);
    expect(saved?.token_status).toBe('configured');
    expect(saved?.min_delay_sec).toBe(4);
    expect(saved?.max_delay_sec).toBe(9);

    const decrypted = await decryptToken(saved!.encrypted_access_token!, masterSecret);
    expect(decrypted).toBe(originalToken);
  });

  it('5. Saves a different Page ID without corrupting or overwriting the previous configuration', async () => {
    const page1 = 'PAGE_ALPHA_111';
    const page2 = 'PAGE_BETA_222';

    const tokenAlpha = await encryptToken('EAAG_ALPHA_TOKEN_SECRET', masterSecret);
    const tokenBeta = await encryptToken('EAAG_BETA_TOKEN_SECRET', masterSecret);

    // Save Page 1
    await saveBroadcasterConfig(db, {
      page_id: page1,
      encrypted_access_token: tokenAlpha,
      token_preview: redactToken('EAAG_ALPHA_TOKEN_SECRET'),
      min_delay_sec: 2,
      max_delay_sec: 5,
      batch_size: 50,
    });

    // Save Page 2
    await saveBroadcasterConfig(db, {
      page_id: page2,
      encrypted_access_token: tokenBeta,
      token_preview: redactToken('EAAG_BETA_TOKEN_SECRET'),
      min_delay_sec: 4,
      max_delay_sec: 8,
      batch_size: 100,
    });

    // Verify Page 1 is still pristine and unaltered
    const conf1 = await getBroadcasterConfig(db, page1);
    expect(conf1?.page_id).toBe(page1);
    expect(conf1?.min_delay_sec).toBe(2);
    expect(conf1?.batch_size).toBe(50);
    const decAlpha = await decryptToken(conf1!.encrypted_access_token!, masterSecret);
    expect(decAlpha).toBe('EAAG_ALPHA_TOKEN_SECRET');

    // Verify Page 2 is saved accurately
    const conf2 = await getBroadcasterConfig(db, page2);
    expect(conf2?.page_id).toBe(page2);
    expect(conf2?.min_delay_sec).toBe(4);
    expect(conf2?.batch_size).toBe(100);
    const decBeta = await decryptToken(conf2!.encrypted_access_token!, masterSecret);
    expect(decBeta).toBe('EAAG_BETA_TOKEN_SECRET');

    // Total rows in database must equal 2
    const totalRows = await db.rawDb.prepare('SELECT count(*) as count FROM broadcaster_config').get();
    expect(totalRows.count).toBe(2);
  });

  it('6. Handles concurrent save requests safely without SQLite constraint failure', async () => {
    const pageId = 'CONCURRENT_PAGE_999';

    // Simulate 10 simultaneous concurrent save requests
    const promises = Array.from({ length: 10 }).map((_, idx) =>
      saveBroadcasterConfig(db, {
        page_id: pageId,
        min_delay_sec: 2 + idx,
        max_delay_sec: 10 + idx,
        batch_size: 50 + idx,
        batch_pause_sec: 30,
      })
    );

    // All concurrent requests must resolve cleanly
    await expect(Promise.all(promises)).resolves.not.toThrow();

    // Exactly one row exists in broadcaster_config for this pageId
    const rows = await db.rawDb.prepare('SELECT * FROM broadcaster_config WHERE page_id = ?').all(pageId);
    expect(rows).toHaveLength(1);
  });

  it('7. Strictly preserves UNIQUE constraint on page_id in D1 schema', async () => {
    // Attempting a raw INSERT with an existing page_id without ON CONFLICT must throw SQLITE_CONSTRAINT
    const pageId = 'STRICT_UNIQUE_TEST_PAGE';
    await saveBroadcasterConfig(db, { page_id: pageId, min_delay_sec: 2, max_delay_sec: 5 });

    // A raw INSERT of duplicate page_id must fail at the database engine level
    expect(() => {
      db.rawDb.prepare(
        'INSERT INTO broadcaster_config (id, page_id, min_delay_sec, max_delay_sec) VALUES (?, ?, ?, ?)'
      ).run('different_id_conflict', pageId, 2, 5);
    }).toThrow(/UNIQUE constraint failed: broadcaster_config\.page_id/);
  });

  it('8. Router endpoint POST /api/broadcaster/config works seamlessly with blank token and preserves existing token', async () => {
    const pageId = 'ROUTER_TEST_PAGE_456';
    const rawToken = 'EAAG_INITIAL_TOKEN_ROUTER_123';

    // 1. Initial save via Router API with token
    const req1 = new Request('http://localhost/api/broadcaster/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageId,
        pageAccessToken: rawToken,
        minDelaySec: 2,
        maxDelaySec: 6,
        batchSize: 60,
        batchPauseSec: 35,
      }),
    });

    const res1 = await handleBroadcasterApiRequest(
      req1,
      { DB: db, BROADCASTER_ENCRYPTION_SECRET: masterSecret },
      { id: 'admin-1', email: 'admin@rongdhonutrade.com', role: 'SUPER_ADMIN' }
    );
    const data1 = await res1.json();
    expect(data1.success).toBe(true);
    expect(data1.tokenPreview).toContain('EAAG_IN');

    // 2. Subsequent update via Router API with token omitted
    const req2 = new Request('http://localhost/api/broadcaster/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageId,
        minDelaySec: 4,
        maxDelaySec: 8,
        batchSize: 80,
      }),
    });

    const res2 = await handleBroadcasterApiRequest(
      req2,
      { DB: db, BROADCASTER_ENCRYPTION_SECRET: masterSecret },
      { id: 'admin-1', email: 'admin@rongdhonutrade.com', role: 'SUPER_ADMIN' }
    );
    const data2 = await res2.json();
    expect(data2.success).toBe(true);
    expect(data2.minDelaySec).toBe(4);
    expect(data2.maxDelaySec).toBe(8);
    expect(data2.batchSize).toBe(80);
    // Token preview is preserved
    expect(data2.tokenPreview).toContain('EAAG_IN');

    // Verify token can still be decrypted from database
    const saved = await getBroadcasterConfig(db, pageId);
    expect(saved?.encrypted_access_token).toBeDefined();
    const decrypted = await decryptToken(saved!.encrypted_access_token!, masterSecret);
    expect(decrypted).toBe(rawToken);
  });

  it('9. Verifies manual pause prevents automatic batch resumption', async () => {
    const campaignId = 'CAMP_PAUSE_TEST_101';
    const pageId = 'PAGE_PAUSE_TEST';

    // Insert campaign job in PAUSED status with MANUAL_PAUSE
    await db.rawDb.prepare(`
      INSERT INTO broadcaster_campaign_jobs (
        id, campaign_id, page_id, status, pause_reason, total_count, processed_count, delivered_count, batch_size, batch_pause_sec
      ) VALUES (?, ?, ?, 'PAUSED', 'MANUAL_PAUSE', 100, 20, 20, 20, 30)
    `).run('job_101', campaignId, pageId);

    // Query job-status route
    const req = new Request(`http://localhost/api/broadcaster/job-status?campaignId=${campaignId}&pageId=${pageId}`);
    const res = await handleBroadcasterApiRequest(req, { DB: db });
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.job.status).toBe('PAUSED');
    expect(data.job.pauseReason).toBe('MANUAL_PAUSE');
    // For manual pause, countdownSeconds must be 0 and auto-resume cannot be triggered
    expect(data.job.isBatchPaused).toBe(false);
    expect(data.job.countdownSeconds).toBe(0);
  });
});
