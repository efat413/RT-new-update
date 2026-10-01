-- ==============================================================
-- Cloudflare D1 Migration 0004: Product Buying Price & Expense Tracking
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Safe & idempotent schema update:
-- 1. Adds buying_price to products
-- 2. Adds total_cost and total_profit snapshots to orders
-- 3. Creates expenses table for net profit tracking
-- ==============================================================

-- 1. Add buying_price to products
ALTER TABLE products ADD COLUMN buying_price REAL DEFAULT 0;

-- 2. Add total_cost and total_profit snapshot columns to orders
ALTER TABLE orders ADD COLUMN total_cost REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN total_profit REAL DEFAULT 0;

-- 3. Create expenses table for Super Admin financial management
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  expense_type TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(expense_type);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
