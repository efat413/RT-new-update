-- ==============================================================
-- 21. FACEBOOK BROADCASTER BATCH SIZE & PAUSE DURATION CONFIGURATION
-- Supports:
-- 1. Configurable Batch Size (default 50) & Batch Pause Duration (default 30s)
-- 2. Persistent campaign job execution tracking for current batch deliveries
-- 3. Resumption countdown timestamp (paused_until) and pause reason tagging
-- ==============================================================

-- Broadcaster Config: add batch_size and batch_pause_sec
ALTER TABLE broadcaster_config ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 50;
ALTER TABLE broadcaster_config ADD COLUMN batch_pause_sec REAL NOT NULL DEFAULT 30;

-- Broadcaster Campaign Jobs: add batch fields, current batch count, and pause timestamps
ALTER TABLE broadcaster_campaign_jobs ADD COLUMN batch_size INTEGER DEFAULT 50;
ALTER TABLE broadcaster_campaign_jobs ADD COLUMN batch_pause_sec REAL DEFAULT 30;
ALTER TABLE broadcaster_campaign_jobs ADD COLUMN current_batch_delivered INTEGER DEFAULT 0;
ALTER TABLE broadcaster_campaign_jobs ADD COLUMN paused_until TEXT;
ALTER TABLE broadcaster_campaign_jobs ADD COLUMN pause_reason TEXT;
