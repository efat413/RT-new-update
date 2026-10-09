-- Migration 0023: Ensure approved review records are the only source of truth for public rating and review count
-- Cleanses manual, seeded, or stale ratings/review counts so that products.rating and products.reviews_count strictly reflect approved reviews.

UPDATE products
SET 
  reviews_count = (
    SELECT COUNT(*) 
    FROM reviews 
    WHERE reviews.product_id = products.id AND reviews.status = 'approved'
  ),
  rating = COALESCE((
    SELECT ROUND(AVG(CAST(rating AS REAL)), 1) 
    FROM reviews 
    WHERE reviews.product_id = products.id AND reviews.status = 'approved'
  ), 0.0);
