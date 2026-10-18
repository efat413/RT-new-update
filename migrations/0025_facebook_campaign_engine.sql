-- ==============================================================
-- Cloudflare D1 Migration 0025: Facebook Campaign Engine & Persistent Queue
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Safe additive schema for storing campaigns, persistent queues,
-- inter-message delay configuration, execution state, and delivery receipts.
-- ==============================================================

CREATE TABLE IF NOT EXISTS fb_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  audience_type TEXT NOT NULL DEFAULT 'page_contacts',
  tag TEXT NOT NULL DEFAULT 'NONE',
  message_template TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'running' | 'paused' | 'cancelled' | 'completed'
  min_delay REAL NOT NULL DEFAULT 2.0,
  max_delay REAL NOT NULL DEFAULT 3.0,
  total_queued INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  remaining_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  paused_at TEXT,
  completed_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fb_campaigns_status ON fb_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_fb_campaigns_created_at ON fb_campaigns(created_at);

CREATE TABLE IF NOT EXISTS fb_campaign_queue (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  psid TEXT,
  phone TEXT,
  is_within_24h INTEGER NOT NULL DEFAULT 1,
  has_consent INTEGER NOT NULL DEFAULT 1,
  message_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'accepted' | 'delivered' | 'skipped' | 'failed' | 'cancelled'
  meta_message_id TEXT,
  delivered_watermark INTEGER,
  delivered_at TEXT,
  skip_reason TEXT,
  error_message TEXT,
  delay_used_seconds REAL,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES fb_campaigns(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_queue_campaign_rec ON fb_campaign_queue(campaign_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_fb_queue_campaign_status ON fb_campaign_queue(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_fb_queue_meta_msg_id ON fb_campaign_queue(meta_message_id);
