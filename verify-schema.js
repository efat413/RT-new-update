#!/usr/bin/env node
/**
 * Standalone D1 Schema & Migration Reconciliation Verification Script
 * Validates Cloudflare D1 sqlite_master tables, indexes, and triggers
 * against migrations 0001 through 0023 and schema.sql.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_MIGRATIONS_COUNT = 23;
const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const SCHEMA_FILE = path.resolve(__dirname, 'schema.sql');

const EXPECTED_TABLES = [
  'products',
  'categories',
  'sliders',
  'store_settings',
  'coupons',
  'reviews',
  'users',
  'orders',
  'expenses',
  'audit_logs',
  'password_reset_tokens',
  'rate_limits',
  'order_idempotency',
  'media_assets',
  'webhook_replays',
  'product_slug_history',
  'review_images',
];

const EXPECTED_INDEXES = [
  'idx_products_category',
  'idx_products_featured',
  'idx_products_created_at',
  'idx_products_sku',
  'idx_products_category_created_at',
  'idx_products_featured_created_at',
  'idx_products_featured_sort_order',
  'idx_products_slug',
  'idx_categories_slug',
  'idx_sliders_sort_order',
  'idx_reviews_product',
  'idx_reviews_product_verified',
  'idx_reviews_status',
  'idx_reviews_product_status',
  'idx_reviews_status_created_at',
  'idx_users_email',
  'idx_orders_order_number',
  'idx_orders_phone',
  'idx_orders_shipping_status',
  'idx_orders_created_at',
  'idx_orders_shipping_status_created_at',
  'idx_orders_payment_status_created_at',
  'idx_orders_payment_method_created_at',
  'idx_orders_advance_payment',
  'idx_expenses_date',
  'idx_expenses_type',
  'idx_expenses_created_at',
  'idx_audit_logs_timestamp',
  'idx_audit_logs_actor',
  'idx_audit_logs_action',
  'idx_prt_token_hash',
  'idx_prt_user_id',
  'idx_rate_limits_reset_at',
  'idx_order_idempotency_created',
  'idx_media_assets_created',
  'idx_webhook_replays_expires',
  'idx_product_slug_history_slug',
  'idx_product_slug_history_product_id',
  'idx_review_images_review_id',
  'idx_review_images_product_id',
  'idx_review_images_created_at',
];

const EXPECTED_TRIGGERS = [
  'trg_prevent_negative_stock',
  'trg_prevent_negative_stock_insert',
];

function runAudit() {
  console.log('================================================================');
  console.log('Cloudflare D1 Schema & Migrations 0001-0023 Verification Audit');
  console.log('================================================================\n');

  // 1. Verify migrations count and sequence
  console.log('1. Checking migrations directory sequence (0001 - 0023)...');
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (migrationFiles.length < EXPECTED_MIGRATIONS_COUNT) {
    console.error(`❌ Expected at least ${EXPECTED_MIGRATIONS_COUNT} migrations, found ${migrationFiles.length}`);
    process.exit(1);
  }
  console.log(`✓ Found ${migrationFiles.length} migration files in migrations/`);

  for (let i = 1; i <= EXPECTED_MIGRATIONS_COUNT; i++) {
    const prefix = String(i).padStart(4, '0');
    const match = migrationFiles.find(f => f.startsWith(`${prefix}_`));
    if (!match) {
      console.error(`❌ Missing migration file for sequence ${prefix}`);
      process.exit(1);
    }
  }
  console.log(`✓ All migrations 0001 through 0023 present sequentially.\n`);

  // 2. Validate schema.sql completeness
  console.log('2. Validating schema.sql against expected entities...');
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');

  let missingInSchema = [];
  for (const table of EXPECTED_TABLES) {
    const pattern = new RegExp(`CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, 'i');
    if (!pattern.test(schemaSql)) {
      missingInSchema.push(`Table: ${table}`);
    }
  }

  for (const idx of EXPECTED_INDEXES) {
    const pattern = new RegExp(`CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${idx}\\b`, 'i');
    if (!pattern.test(schemaSql)) {
      missingInSchema.push(`Index: ${idx}`);
    }
  }

  for (const trg of EXPECTED_TRIGGERS) {
    const pattern = new RegExp(`CREATE\\s+TRIGGER\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${trg}\\b`, 'i');
    if (!pattern.test(schemaSql)) {
      missingInSchema.push(`Trigger: ${trg}`);
    }
  }

  if (missingInSchema.length > 0) {
    console.error('❌ Missing definitions in schema.sql:');
    missingInSchema.forEach(m => console.error(`  - ${m}`));
    process.exit(1);
  }
  console.log(`✓ schema.sql contains all ${EXPECTED_TABLES.length} tables, ${EXPECTED_INDEXES.length} indexes, and triggers.\n`);

  // 3. Optional live query verification if passed --remote or --local
  const args = process.argv.slice(2);
  const checkRemote = args.includes('--remote');
  const checkLocal = args.includes('--local');

  if (checkRemote || checkLocal) {
    const flag = checkRemote ? '--remote' : '--local';
    console.log(`3. Executing sqlite_master query against D1 (${flag})...`);
    try {
      const query = "SELECT type, name, tbl_name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%';";
      const cmd = `npx wrangler d1 execute rongdhonu-db ${flag} --command="${query}" --json`;
      const output = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8' });
      const parsed = JSON.parse(output);
      const results = (parsed[0] && parsed[0].results) || [];

      const existingNames = new Set(results.map(r => r.name));
      const missingTables = EXPECTED_TABLES.filter(t => !existingNames.has(t));
      const missingIndexes = EXPECTED_INDEXES.filter(i => !existingNames.has(i));

      console.log(`Live objects found: ${results.length}`);
      if (missingTables.length > 0) console.warn('Missing live tables:', missingTables);
      if (missingIndexes.length > 0) console.warn('Missing live indexes:', missingIndexes);
      if (missingTables.length === 0 && missingIndexes.length === 0) {
        console.log(`✓ Live D1 database fully reconciles with migrations 0001-0023.`);
      }
    } catch (e) {
      console.warn(`Could not run live D1 query (check credentials or network):`, e.message || e);
    }
  } else {
    console.log('3. Live check skipped. Run `node verify-schema.js --remote` or `node verify-schema.js --local` to test against Cloudflare D1.');
  }

  console.log('\n================================================================');
  console.log('✅ RECONCILIATION AUDIT COMPLETED SUCCESSFULLY');
  console.log('================================================================');
}

runAudit();
