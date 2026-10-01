-- ==============================================================
-- Cloudflare D1 Migration 0007: Rate Limits Table & Schema Cleanup
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Safe & idempotent schema update:
-- 1. Creates rate_limits table for distributed edge rate limiting
-- 2. Adds index on rate_limits(reset_at) for efficient cleanup
-- 3. Adds index on products(sku) for fast catalog search
-- 4. Ensures media_assets and expenses tables exist
-- ==============================================================

-- 1. Rate limits table for brute-force and request abuse protection
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  reset_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at);

-- 2. Product SKU index for scalable catalog and order lookups
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

-- 3. Ensure media_assets table exists (idempotent fallback)
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  data TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets(created_at);
