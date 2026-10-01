-- ==============================================================
-- Cloudflare D1 Migration 0001: Initial Schema
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Creates all core tables and performance indexes for Rongdhonu Trade:
--   1. products
--   2. categories
--   3. sliders
--   4. store_settings
--   5. coupons
--   6. reviews
--   7. users
--   8. orders
--
-- Safe & idempotent: Uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- Never drops tables or destroys existing production data.
-- ==============================================================

-- 1. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  original_price REAL DEFAULT 0,
  category_id TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  images_json TEXT NOT NULL DEFAULT '[]',
  stock INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  rating REAL DEFAULT 5.0,
  reviews_count INTEGER DEFAULT 0,
  specs_json TEXT DEFAULT '[]',
  sizes_json TEXT DEFAULT '[]',
  colors_json TEXT DEFAULT '[]',
  sku TEXT,
  video_url TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);

-- 2. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon_name TEXT,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- 3. SLIDERS / HERO BANNERS TABLE
CREATE TABLE IF NOT EXISTS sliders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  headline TEXT NOT NULL,
  subtext TEXT DEFAULT '',
  tag TEXT DEFAULT '',
  discount_badge TEXT DEFAULT '',
  category_id TEXT DEFAULT '',
  image_url TEXT NOT NULL,
  accent_gradient TEXT DEFAULT '',
  button_text TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sliders_sort_order ON sliders(sort_order);

-- 4. STORE SETTINGS TABLE
CREATE TABLE IF NOT EXISTS store_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  settings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. COUPONS / VOUCHERS TABLE
CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  discount_type TEXT NOT NULL,
  discount_value REAL NOT NULL,
  min_spend REAL DEFAULT 0,
  description TEXT DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. PRODUCT REVIEWS TABLE
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5,
  comment TEXT NOT NULL,
  verified_purchase INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

-- 7. USERS & ADMIN ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  permissions_json TEXT,
  phone TEXT,
  address TEXT,
  district TEXT,
  delivery_zone TEXT DEFAULT 'inside_dhaka',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 8. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id TEXT,
  user_email TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  customer_district TEXT,
  customer_zone TEXT DEFAULT 'inside_dhaka',
  customer_notes TEXT,
  items_json TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  delivery_fee REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  coupon_code TEXT,
  discount_amount REAL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'COD',
  payment_status TEXT NOT NULL DEFAULT 'Pending',
  transaction_id TEXT,
  shipping_status TEXT NOT NULL DEFAULT 'Pending',
  courier_name TEXT,
  courier_waybill TEXT,
  consignment_id TEXT,
  courier_status TEXT,
  courier_booking_json TEXT,
  dbbl_details_json TEXT,
  card_details_json TEXT,
  last_courier_sync TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_status ON orders(shipping_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
