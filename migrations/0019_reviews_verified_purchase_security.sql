-- Migration 0019: Review verified purchase security and index
CREATE INDEX IF NOT EXISTS idx_reviews_product_verified ON reviews(product_id, verified_purchase);

-- Sanitize any reviews with NULL verified_purchase to safe unverified default (0)
UPDATE reviews SET verified_purchase = 0 WHERE verified_purchase IS NULL;
