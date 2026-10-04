-- Migration 0016: Add is_active column to sliders table
ALTER TABLE sliders ADD COLUMN is_active INTEGER DEFAULT 1;
