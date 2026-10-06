-- ==============================================================
-- Cloudflare D1 Migration 0020: Advance Payment Database Foundation
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Safe & idempotent schema update:
-- 1. Adds advance_payment columns to orders table
-- 2. Sets default advance_payment = 0 for all existing orders
-- 3. Creates query index for advance payment lookup
-- ==============================================================

-- 1. Add advance payment columns to orders table
ALTER TABLE orders ADD COLUMN advance_payment REAL NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN advance_payment_method TEXT;
ALTER TABLE orders ADD COLUMN advance_payment_note TEXT;
ALTER TABLE orders ADD COLUMN advance_payment_updated_at TEXT;
ALTER TABLE orders ADD COLUMN advance_payment_updated_by TEXT;

-- 2. Create index on advance_payment for administrative queries and filtering
CREATE INDEX IF NOT EXISTS idx_orders_advance_payment ON orders(advance_payment);

-- 3. Ensure all existing legacy orders have advance_payment = 0
UPDATE orders SET advance_payment = 0 WHERE advance_payment IS NULL;
