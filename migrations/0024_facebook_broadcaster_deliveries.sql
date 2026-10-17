-- ==============================================================
-- 19. FACEBOOK BROADCASTER PERMANENT DELIVERIES & ATOMIC DEDUPLICATION
-- Enforces hard uniqueness: UNIQUE(page_id, recipient_psid)
-- Guarantees "One PSID = One Message Ever" across all campaigns & reloads
-- ==============================================================

CREATE TABLE IF NOT EXISTS broadcaster_deliveries (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  recipient_psid TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('QUEUED', 'DELIVERED', 'FAILED', 'AMBIGUOUS')),
  message_id TEXT,
  queued_at TEXT NOT NULL,
  delivered_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(page_id, recipient_psid)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcaster_page_psid ON broadcaster_deliveries(page_id, recipient_psid);
CREATE INDEX IF NOT EXISTS idx_broadcaster_campaign ON broadcaster_deliveries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_broadcaster_status ON broadcaster_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_broadcaster_page_status ON broadcaster_deliveries(page_id, status);

-- Ephemeral scan cache table for transient in-flight scans.
-- "Reset Memory" purges only this table or in-memory scan state;
-- the permanent delivery ledger (broadcaster_deliveries) is never dropped or truncated.
CREATE TABLE IF NOT EXISTS broadcaster_scan_cache (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  raw_psid TEXT NOT NULL,
  scanned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_broadcaster_scan_cache_page_camp ON broadcaster_scan_cache(page_id, campaign_id);
