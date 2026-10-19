-- ==============================================================
-- Cloudflare D1 Migration 0027: Facebook Recipient Incoming Message & Page Isolation
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Safe additive schema for storing genuine incoming Messenger message timestamps
-- (last_incoming_message_at) and Facebook Page ID scoping (page_id) to strictly
-- isolate recipients by Page and enable Meta 24-hour messaging window compliance.
-- ==============================================================

ALTER TABLE fb_recipients ADD COLUMN last_incoming_message_at TEXT;
ALTER TABLE fb_recipients ADD COLUMN page_id TEXT;

CREATE INDEX IF NOT EXISTS idx_fb_recipients_incoming_time ON fb_recipients(last_incoming_message_at);
CREATE INDEX IF NOT EXISTS idx_fb_recipients_page_id ON fb_recipients(page_id);
