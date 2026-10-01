-- ==============================================================
-- Cloudflare D1 Migration 0003: Media Assets & Hardening
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Adds dedicated media_assets table for uploaded logos, favicons,
-- banners, and QR codes. Storing media in dedicated assets prevents
-- huge Base64 strings from inflating store_settings and hitting
-- query size limits.
-- ==============================================================

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  data TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at);
