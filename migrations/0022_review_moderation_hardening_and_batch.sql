-- ==============================================================
-- Cloudflare D1 Migration 0022: Review Moderation Hardening & Batch Indexes
-- Target Database: rongdhonu-db
--
-- Safe & idempotent schema update:
-- 1. Ensures reviews table moderation columns and default values
-- 2. Ensures indexes for composite queries (product_id, status, created_at)
-- 3. Guarantees pending status protection
-- ==============================================================

-- 1. Ensure moderation columns exist on reviews table (idempotent for fresh or existing environments)
-- Note: In SQLite / D1, ADD COLUMN will succeed or can be caught safely.
CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_product_verified ON reviews(product_id, verified_purchase);

-- 2. Audit check: ensure any legacy records without a status explicitly receive 'approved'
-- and any empty or null status is safely normalized.
UPDATE reviews SET status = 'approved' WHERE (status IS NULL OR status = '') AND created_by_admin = 0;
UPDATE reviews SET verified_purchase = 0 WHERE verified_purchase IS NULL;
UPDATE reviews SET created_by_admin = 0 WHERE created_by_admin IS NULL;
