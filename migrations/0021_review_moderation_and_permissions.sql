-- Migration 0021: Review moderation system and status column
ALTER TABLE reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_id, status);
