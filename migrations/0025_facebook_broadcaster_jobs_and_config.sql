-- ==============================================================
-- 20. FACEBOOK BROADCASTER CONFIGURATION & PERSISTENT CAMPAIGN JOBS
-- Supports:
-- 1. Encrypted Page Access Token configuration & token verification
-- 2. Server-side configurable Min / Max dispatch delays
-- 3. Persistent campaign job execution states for real Pause / Stop checkpoints
-- ==============================================================

CREATE TABLE IF NOT EXISTS broadcaster_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  page_id TEXT NOT NULL,
  encrypted_access_token TEXT,
  token_preview TEXT,
  token_status TEXT DEFAULT 'unconfigured',
  min_delay_sec REAL NOT NULL DEFAULT 2,
  max_delay_sec REAL NOT NULL DEFAULT 5,
  default_message_templates TEXT,
  verified_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS broadcaster_campaign_jobs (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('IDLE', 'RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED', 'FAILED')),
  total_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  ambiguous_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  min_delay_sec REAL DEFAULT 2,
  max_delay_sec REAL DEFAULT 5,
  message_template TEXT,
  current_psid TEXT,
  checkpoint_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_broadcaster_jobs_page_status ON broadcaster_campaign_jobs(page_id, status);
CREATE INDEX IF NOT EXISTS idx_broadcaster_jobs_campaign ON broadcaster_campaign_jobs(campaign_id);
