-- ==============================================================
-- Cloudflare D1 Migration 0017: Order IP Tracking and IP Blocking
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Safe & idempotent schema update:
-- 1. Adds customer_ip column to orders table
-- 2. Creates blocked_ips table for persistent server-authoritative IP blocklist
-- ==============================================================

-- 1. Add customer_ip to orders table
ALTER TABLE orders ADD COLUMN customer_ip TEXT;

-- 2. Create blocked_ips table for IP blocking
CREATE TABLE IF NOT EXISTS blocked_ips (
  id TEXT PRIMARY KEY,
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT,
  blocked_by TEXT,
  blocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_ips_address ON blocked_ips(ip_address);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_blocked_at ON blocked_ips(blocked_at);
