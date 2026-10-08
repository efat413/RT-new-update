-- Migration 0021: Review Moderation System, Status Tracking, and Audit Fields
-- Safe, D1-compatible schema upgrade. Preserves all existing reviews and review counts.

-- 1. Add status column defaulting to 'approved' for historical records so existing reviews are preserved
ALTER TABLE reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';

-- 2. Add audit fields for administrator moderation tracking
ALTER TABLE reviews ADD COLUMN approved_at TEXT;
ALTER TABLE reviews ADD COLUMN approved_by TEXT;

-- 3. Backfill approval timestamp for existing approved reviews to preserve chronological integrity
UPDATE reviews SET approved_at = created_at WHERE approved_at IS NULL AND status = 'approved';

-- 4. High-performance composite indexes for storefront filtering and admin queue sorting
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_created_status ON reviews(created_at, status);
