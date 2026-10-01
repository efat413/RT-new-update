-- Migration 0012: Add featured_sort_order for deterministic featured product ordering
ALTER TABLE products ADD COLUMN featured_sort_order INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_featured_sort_order ON products(featured, featured_sort_order ASC, created_at DESC);
