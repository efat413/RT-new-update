-- ==============================================================
-- Cloudflare D1 Migration 0011: Webhook Replay Deduplication Store
-- Target Database: rongdhonu-db
--
-- Safe & idempotent schema update:
-- 1. Creates webhook_replays table for distributed edge replay protection
-- 2. Creates index on expires_at for efficient TTL lookups & cleanup
-- ==============================================================

CREATE TABLE IF NOT EXISTS webhook_replays (
  fingerprint TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_replays_expires ON webhook_replays(expires_at);
