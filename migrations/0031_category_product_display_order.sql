-- Migration 0031: Category Product Display Order
-- Enables customizing and managing the exact sequence of products for each category on the homepage

ALTER TABLE products ADD COLUMN display_order INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_products_category_display_order ON products(category_id, display_order ASC, created_at DESC);
