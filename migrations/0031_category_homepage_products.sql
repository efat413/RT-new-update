-- ==============================================================
-- Cloudflare D1 Migration 0031: Category Homepage Products
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Dedicated table for isolated per-category homepage product selection & ordering.
-- Allows manual selection and sorting without altering global catalog or featured products.
-- ==============================================================

CREATE TABLE IF NOT EXISTS category_homepage_products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cat_hp_prods_category ON category_homepage_products(category_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_cat_hp_prods_product ON category_homepage_products(product_id);
