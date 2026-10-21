-- ==============================================================
-- Cloudflare D1 Migration 0029: Order IP Capture & IP Blacklist System
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- 1. Adds ip_address column to orders table to store customer IP at checkout.
-- 2. Creates blocked_ips table to store blacklisted IP addresses.
-- 3. Creates indexes for high-performance lookup and checkout validation.
-- ==============================================================

-- 1. ADD IP ADDRESS COLUMN TO ORDERS
ALTER TABLE orders ADD COLUMN ip_address TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_ip_address ON orders(ip_address);

-- 2. BLOCKED IPS TABLE
CREATE TABLE IF NOT EXISTS blocked_ips (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL UNIQUE,
  reason TEXT DEFAULT '',
  blocked_by TEXT DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_ips_ip ON blocked_ips(ip);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_created_at ON blocked_ips(created_at DESC);
