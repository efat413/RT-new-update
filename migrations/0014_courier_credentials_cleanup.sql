-- Migration 0014: Security Hardening - Courier Credentials Storage Migration
-- Separates Courier API credentials from D1 database store_settings.
-- Production Steadfast credentials must reside exclusively in Cloudflare Worker Secrets:
--   STEADFAST_API_KEY
--   STEADFAST_SECRET_KEY
--   COURIER_WEBHOOK_SECRET
--
-- BEFORE RUNNING CLEANUP IN PRODUCTION:
-- Ensure Worker Secrets have been set in Cloudflare dashboard or via Wrangler CLI:
--   npx wrangler secret put STEADFAST_API_KEY
--   npx wrangler secret put STEADFAST_SECRET_KEY
--   npx wrangler secret put COURIER_WEBHOOK_SECRET
--
-- Once secrets are configured, this cleanup migration removes legacy plaintext
-- steadfastApiKey and steadfastSecretKey fields from the D1 store_settings table.

UPDATE store_settings
SET settings_json = json_remove(settings_json, '$.steadfastApiKey', '$.steadfastSecretKey'),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'default'
  AND (json_extract(settings_json, '$.steadfastApiKey') IS NOT NULL
       OR json_extract(settings_json, '$.steadfastSecretKey') IS NOT NULL);
