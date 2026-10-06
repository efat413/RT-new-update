-- Migration 0018: Add product_slug_history table for historical slug 301 redirects
CREATE TABLE IF NOT EXISTS product_slug_history (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_slug_history_slug ON product_slug_history(slug);
CREATE INDEX IF NOT EXISTS idx_product_slug_history_product_id ON product_slug_history(product_id);

-- Backfill missing product slugs safely and idempotently
UPDATE products
SET slug = 'leather-wallet'
WHERE id = 'prod-wallet-01' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'stainless-steel-bracelet'
WHERE id = 'prod-bracelet-02' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'luxury-quartz-watch'
WHERE id = 'prod-watch-03' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'obsidian-signet-ring'
WHERE id = 'prod-ring-04' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'genuine-leather-belt'
WHERE id = 'prod-belt-04' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'mens-casual-cap'
WHERE id = 'prod-cap-04b' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'polarized-sunglasses-for-men'
WHERE id = 'prod-sunglasses-04c' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'anc-tws-earbuds'
WHERE id = 'prod-tws-05' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'heavy-duty-power-bank-20000mah'
WHERE id = 'prod-powerbank-06' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'portable-bluetooth-speaker'
WHERE id = 'prod-speaker-07' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = '65w-fast-phone-charger'
WHERE id = 'prod-charger-08' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'over-ear-headphones'
WHERE id = 'prod-headphones-09' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'ergonomic-wireless-mouse'
WHERE id = 'prod-mouse-09b' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'customized-wooden-gift-box'
WHERE id = 'prod-giftbox-10' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'couple-watch-set'
WHERE id = 'prod-couplewatch-11' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'luxury-pen-journal-combo'
WHERE id = 'prod-penjournal-12' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'led-ambient-mood-lamp'
WHERE id = 'prod-moodlamp-13' AND (slug IS NULL OR trim(slug) = '');

UPDATE products
SET slug = 'personalized-ceramic-mug'
WHERE id = 'prod-mug-13b' AND (slug IS NULL OR trim(slug) = '');
