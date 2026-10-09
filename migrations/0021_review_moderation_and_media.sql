-- ==============================================================
-- Cloudflare D1 Migration 0021: Review Moderation & Photo Metadata
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Adds review moderation fields (pending, approved, rejected),
-- photo metadata (images_json array of storage keys/URLs),
-- audit attributes (approved_at, approved_by, source, updated_at),
-- and safe performance indexes.
--
-- Legacy Review Backfill Strategy:
-- Pre-existing reviews (from seed or legacy orders) were already
-- public on the storefront and contributed to catalog ratings.
-- To prevent live ratings from collapsing, pre-existing reviews
-- are explicitly backfilled to 'approved' with 'system_migration'
-- attribution. All new customer submissions default strictly to 'pending'.
-- ==============================================================

-- 1. Moderation status column
ALTER TABLE reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- 2. Review origin source ('customer' | 'admin')
ALTER TABLE reviews ADD COLUMN source TEXT NOT NULL DEFAULT 'customer';

-- 3. Moderation audit metadata
ALTER TABLE reviews ADD COLUMN approved_at TEXT;
ALTER TABLE reviews ADD COLUMN approved_by TEXT;
ALTER TABLE reviews ADD COLUMN updated_at TEXT;

-- 4. Review photos metadata (JSON array of media asset keys/URLs)
ALTER TABLE reviews ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]';

-- 5. Indexes for fast approved queries and moderation queue
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_status_created_at ON reviews(status, created_at DESC);

-- 6. Safe, explicit legacy review backfill
UPDATE reviews
SET status = 'approved',
    source = 'customer',
    approved_at = created_at,
    approved_by = 'system_migration',
    updated_at = created_at,
    images_json = '[]'
WHERE approved_at IS NULL;
