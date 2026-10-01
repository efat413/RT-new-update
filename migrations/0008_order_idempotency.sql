-- ==============================================================
-- Cloudflare D1 Migration 0008: Persistent Order Idempotency & Stock Guard
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Safe & idempotent schema update:
-- 1. Creates order_idempotency table for distributed edge idempotency
-- 2. Creates index on created_at for TTL expiration lookups
-- 3. Creates trigger to prevent negative stock at the database engine level
-- ==============================================================

CREATE TABLE IF NOT EXISTS order_idempotency (
  key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_idempotency_created ON order_idempotency(created_at);

-- Engine-level guard preventing race conditions from overselling below 0
CREATE TRIGGER IF NOT EXISTS trg_prevent_negative_stock
BEFORE UPDATE OF stock ON products
FOR EACH ROW
WHEN NEW.stock < 0
BEGIN
  SELECT RAISE(ABORT, 'INSUFFICIENT_STOCK: Product stock cannot be negative');
END;
