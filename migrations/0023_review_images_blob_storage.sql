-- ==============================================================
-- Cloudflare D1 Migration 0023: Review Images Binary BLOB Storage
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Safe additive table for storing customer & admin review photos directly
-- in Cloudflare D1 as binary BLOBs up to 2MB per image.
-- ==============================================================

CREATE TABLE IF NOT EXISTS review_images (
  id TEXT PRIMARY KEY,
  review_id TEXT,
  product_id TEXT,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  file_size INTEGER NOT NULL DEFAULT 0,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_review_images_review_id ON review_images(review_id);
CREATE INDEX IF NOT EXISTS idx_review_images_product_id ON review_images(product_id);
CREATE INDEX IF NOT EXISTS idx_review_images_created_at ON review_images(created_at);
