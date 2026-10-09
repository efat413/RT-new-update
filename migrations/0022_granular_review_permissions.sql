-- ==============================================================
-- Cloudflare D1 Migration 0022: Granular Review RBAC Permissions
-- Target Database: rongdhonu-db (ID: 3276795d-5593-42c0-8e14-947f3ab1172b)
--
-- Part 6 of 8: Integrates granular review permissions:
-- - reviews.view
-- - reviews.create
-- - reviews.edit
-- - reviews.approve
-- - reviews.delete
--
-- Preserves existing user permissions stored in users.permissions_json.
-- No DDL table changes required as permissions are stored in JSON format.
-- Validates index integrity for reviews and audit trails.
-- ==============================================================

-- Ensure review indexes exist for high-performance moderation and queries
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_status_created_at ON reviews(status, created_at DESC);
