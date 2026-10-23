-- Migration 0031: Homepage Category Products Custom Ordering & Selection
-- Allows store administrators to independently select which products appear in each
-- homepage category section and determine their exact display sequence.

CREATE TABLE IF NOT EXISTS homepage_category_products (
  category_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (category_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_hcp_category_sort ON homepage_category_products(category_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_hcp_product_id ON homepage_category_products(product_id);
