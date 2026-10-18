-- ==============================================================
-- Cloudflare D1 Migration 0024: Facebook Broadcaster Recipients & Consent
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Safe additive schema for storing Facebook Page Contacts, Website Customers
-- with verified Messenger opt-in, PSIDs, consent audits, and interaction timestamps.
-- ==============================================================

CREATE TABLE IF NOT EXISTS fb_recipients (
  id TEXT PRIMARY KEY,
  audience_type TEXT NOT NULL, -- 'page_contacts' | 'website_customers'
  name TEXT NOT NULL,
  psid TEXT,
  phone TEXT,
  email TEXT,
  source TEXT NOT NULL DEFAULT 'facebook_messenger', -- 'facebook_messenger' | 'customer_chat_plugin' | 'website_checkout_optin' | 'account_optin'
  consent_status TEXT NOT NULL DEFAULT 'unconsented', -- 'consented' | 'opted_out' | 'unconsented'
  consent_timestamp TEXT,
  consent_source TEXT,
  last_interaction_at TEXT NOT NULL,
  recent_order_number TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fb_recipients_audience ON fb_recipients(audience_type);
CREATE INDEX IF NOT EXISTS idx_fb_recipients_psid ON fb_recipients(psid);
CREATE INDEX IF NOT EXISTS idx_fb_recipients_consent ON fb_recipients(consent_status);
CREATE INDEX IF NOT EXISTS idx_fb_recipients_last_interaction ON fb_recipients(last_interaction_at);
