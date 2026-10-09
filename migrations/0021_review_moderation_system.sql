-- ==============================================================
-- Cloudflare D1 Migration 0021: Product Review Moderation System
-- Target Database: rongdhonu-db
--
-- Safe & idempotent schema update:
-- 1. Adds moderation status and metadata columns to reviews table
-- 2. Backfills existing legacy reviews with status = 'approved'
-- 3. Creates indexes for product ID, status, and creation timestamps
-- ==============================================================

-- 1. Add moderation columns to reviews table
ALTER TABLE reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE reviews ADD COLUMN moderator_id TEXT;
ALTER TABLE reviews ADD COLUMN moderated_at TEXT;
ALTER TABLE reviews ADD COLUMN moderation_note TEXT;
ALTER TABLE reviews ADD COLUMN created_by_admin INTEGER DEFAULT 0;

-- 2. Ensure all existing legacy reviews are approved and have created_by_admin initialized
UPDATE reviews SET status = 'approved' WHERE status IS NULL OR status = '';
UPDATE reviews SET created_by_admin = 0 WHERE created_by_admin IS NULL;

-- 3. Create query performance indexes for review moderation
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
