-- ==============================================================
-- 20. FACEBOOK BROADCASTER CONFIGURATION & PERSISTENT CAMPAIGN JOBS
-- Supports:
-- 1. Encrypted Page Access Token configuration & token verification
-- 2. Server-side configurable Min / Max dispatch delays
-- 3. Persistent campaign job execution states for real Pause / Stop checkpoints
-- 4. Permanent recipient memory ledger for atomic deduplication ("One PSID = One Message Ever")
-- ==============================================================

CREATE TABLE IF NOT EXISTS broadcaster_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  page_id TEXT NOT NULL,
  encrypted_access_token TEXT,
  token_preview TEXT,
  token_status TEXT DEFAULT 'unconfigured',
  min_delay_sec REAL NOT NULL DEFAULT 2,
  max_delay_sec REAL NOT NULL DEFAULT 5,
  min_delay_ms INTEGER NOT NULL DEFAULT 2000,
  max_delay_ms INTEGER NOT NULL DEFAULT 5000,
  batch_size INTEGER NOT NULL DEFAULT 50,
  batch_pause_sec REAL NOT NULL DEFAULT 30,
  default_message_templates TEXT,
  anti_duplicate_enabled INTEGER NOT NULL DEFAULT 1,
  verified_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcaster_config_page_id ON broadcaster_config(page_id);

CREATE TABLE IF NOT EXISTS broadcaster_recipient_memory (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  recipient_psid TEXT NOT NULL,
  campaign_id TEXT,
  status TEXT NOT NULL DEFAULT 'DELIVERED',
  message_id TEXT,
  first_messaged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(page_id, recipient_psid)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcaster_memory_page_psid ON broadcaster_recipient_memory(page_id, recipient_psid);
CREATE INDEX IF NOT EXISTS idx_broadcaster_memory_page ON broadcaster_recipient_memory(page_id);

CREATE TABLE IF NOT EXISTS broadcaster_campaigns (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('IDLE', 'RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED', 'FAILED')),
  total_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  ambiguous_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  remaining_count INTEGER DEFAULT 0,
  min_delay_ms INTEGER DEFAULT 2000,
  max_delay_ms INTEGER DEFAULT 5000,
  batch_size INTEGER DEFAULT 50,
  batch_pause_sec REAL DEFAULT 30,
  message_template TEXT,
  anti_duplicate_enabled INTEGER DEFAULT 1,
  checkpoint_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_broadcaster_campaigns_page_status ON broadcaster_campaigns(page_id, status);

CREATE TABLE IF NOT EXISTS broadcaster_jobs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  recipient_psid TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('QUEUED', 'DELIVERED', 'FAILED', 'AMBIGUOUS', 'SKIPPED')),
  message_id TEXT,
  error_message TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_broadcaster_jobs_campaign ON broadcaster_jobs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_broadcaster_jobs_status ON broadcaster_jobs(status);

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
CREATE INDEX IF NOT EXISTS idx_broadcaster_jobs_campaign_legacy ON broadcaster_campaign_jobs(campaign_id);

