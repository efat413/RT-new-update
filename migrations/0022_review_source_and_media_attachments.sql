-- Migration 0022: Review Source and Media Attachments
-- Adds channel attribution and visual proofs for customer reviews

ALTER TABLE reviews ADD COLUMN source TEXT DEFAULT 'Customer Submitted';
ALTER TABLE reviews ADD COLUMN customer_image TEXT;
ALTER TABLE reviews ADD COLUMN screenshot_attachment TEXT;

CREATE INDEX IF NOT EXISTS idx_reviews_source ON reviews(source);
