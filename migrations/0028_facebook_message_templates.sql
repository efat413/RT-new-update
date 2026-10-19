-- ==============================================================
-- Cloudflare D1 Migration 0028: Facebook Broadcaster Saved Message Templates
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Safe additive schema for storing reusable custom message templates in Cloudflare D1.
-- Supports template name, message variations/content, optional Meta message tag,
-- author tracking, and updated timestamps.
-- ==============================================================

CREATE TABLE IF NOT EXISTS fb_message_templates (
  id TEXT PRIMARY KEY,
  template_name TEXT NOT NULL,
  message_content TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT 'NONE',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fb_templates_name ON fb_message_templates(template_name);
CREATE INDEX IF NOT EXISTS idx_fb_templates_created_at ON fb_message_templates(created_at);
