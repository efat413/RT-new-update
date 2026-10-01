-- Migration 0010: Composite indexes for homepage category and featured product queries
CREATE INDEX IF NOT EXISTS idx_products_category_created_at ON products(category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_featured_created_at ON products(featured, created_at DESC);
