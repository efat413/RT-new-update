-- ==============================================================
-- Cloudflare D1 Migration 0013: Atomic Inventory Guards & Negative Stock Triggers
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Safe & idempotent schema update:
-- 1. Enforces engine-level guard preventing race conditions from overselling below 0
-- 2. Ensures INSERT on products cannot introduce negative stock
-- ==============================================================

CREATE TRIGGER IF NOT EXISTS trg_prevent_negative_stock
BEFORE UPDATE OF stock ON products
FOR EACH ROW
WHEN NEW.stock < 0
BEGIN
  SELECT RAISE(ABORT, 'INSUFFICIENT_STOCK: Product stock cannot be negative');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_negative_stock_insert
BEFORE INSERT ON products
FOR EACH ROW
WHEN NEW.stock < 0
BEGIN
  SELECT RAISE(ABORT, 'INSUFFICIENT_STOCK: Product stock cannot be negative');
END;
