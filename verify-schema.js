#!/usr/bin/env node
/**
 * Standalone D1 Schema & Migration Reconciliation Verification Script
 * Validates Cloudflare D1 migrations, schema.sql definitions, tables,
 * columns, indexes, triggers, and constraints across complete history.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const SCHEMA_FILE = path.resolve(__dirname, 'schema.sql');

// Required tables across all migrations (0001 through 0031+)
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
  'fb_recipients',
  'fb_campaigns',
  'fb_campaign_queue',
  'fb_message_templates',
  'blocked_ips',
];

// Essential columns that must exist in tables (including columns added across migrations)
const EXPECTED_TABLE_COLUMNS = {
  products: [
    'id', 'title', 'price', 'original_price', 'buying_price', 'category_id',
    'description', 'image_url', 'images_json', 'stock', 'featured',
    'featured_sort_order', 'display_order', 'rating', 'reviews_count',
    'specs_json', 'sizes_json', 'colors_json', 'sku', 'video_url', 'slug',
    'status', 'created_at', 'updated_at',
  ],
  categories: [
    'id', 'name', 'slug', 'icon_name', 'description', 'created_at', 'updated_at',
  ],
  sliders: [
    'id', 'title', 'headline', 'subtext', 'tag', 'discount_badge', 'category_id',
    'image_url', 'accent_gradient', 'button_text', 'sort_order', 'is_active',
    'created_at', 'updated_at',
  ],
  store_settings: ['id', 'settings_json', 'updated_at'],
  coupons: [
    'code', 'discount_type', 'discount_value', 'min_spend', 'description',
    'is_active', 'created_at',
  ],
  reviews: [
    'id', 'product_id', 'author_name', 'rating', 'comment', 'verified_purchase',
    'status', 'source', 'approved_at', 'approved_by', 'updated_at', 'images_json',
    'created_at',
  ],
  users: [
    'id', 'name', 'email', 'password', 'role', 'permissions_json', 'phone',
    'address', 'district', 'delivery_zone', 'created_at', 'updated_at',
  ],
  orders: [
    'id', 'order_number', 'user_id', 'user_email', 'customer_name',
    'customer_phone', 'customer_address', 'customer_district', 'customer_zone',
    'customer_notes', 'items_json', 'subtotal', 'delivery_fee', 'total_amount',
    'total_cost', 'total_profit', 'coupon_code', 'discount_amount',
    'payment_method', 'payment_status', 'transaction_id', 'shipping_status',
    'courier_name', 'courier_waybill', 'consignment_id', 'courier_status',
    'courier_booking_json', 'dbbl_details_json', 'card_details_json',
    'last_courier_sync', 'advance_payment', 'advance_payment_method',
    'advance_payment_note', 'advance_payment_updated_at',
    'advance_payment_updated_by', 'ip_address', 'created_at', 'updated_at',
  ],
  expenses: [
    'id', 'expense_type', 'amount', 'date', 'note', 'created_at', 'created_by',
  ],
  audit_logs: [
    'id', 'timestamp', 'actor_id', 'actor_email', 'actor_role', 'action',
    'target_id', 'target_type', 'details_json', 'ip_address',
  ],
  password_reset_tokens: [
    'id', 'user_id', 'token_hash', 'expires_at', 'used_at', 'created_at',
  ],
  rate_limits: ['key', 'count', 'reset_at'],
  media_assets: ['id', 'content_type', 'data', 'size', 'created_at'],
  webhook_replays: ['fingerprint', 'created_at', 'expires_at'],
  product_slug_history: ['id', 'product_id', 'slug', 'created_at'],
  order_idempotency: [
    'key', 'order_id', 'order_number', 'response_json', 'created_at',
  ],
  review_images: [
    'id', 'review_id', 'product_id', 'mime_type', 'file_size', 'data', 'created_at',
  ],
  fb_campaigns: [
    'id', 'name', 'audience_type', 'tag', 'message_template', 'status',
    'min_delay', 'max_delay', 'total_queued', 'accepted_count', 'delivered_count',
    'skipped_count', 'failed_count', 'remaining_count', 'started_at', 'paused_at',
    'completed_at', 'created_by', 'created_at', 'updated_at',
  ],
  fb_campaign_queue: [
    'id', 'campaign_id', 'recipient_id', 'recipient_name', 'psid', 'phone',
    'is_within_24h', 'has_consent', 'message_text', 'status', 'meta_message_id',
    'delivered_watermark', 'delivered_at', 'skip_reason', 'error_message',
    'delay_used_seconds', 'processed_at', 'created_at', 'updated_at',
  ],
  fb_recipients: [
    'id', 'audience_type', 'name', 'psid', 'phone', 'email', 'source',
    'consent_status', 'consent_timestamp', 'consent_source', 'last_interaction_at',
    'last_incoming_message_at', 'page_id', 'recent_order_number', 'metadata',
    'created_at', 'updated_at',
  ],
  fb_message_templates: [
    'id', 'template_name', 'message_content', 'tag', 'created_by',
    'created_at', 'updated_at',
  ],
  blocked_ips: ['id', 'ip', 'reason', 'blocked_by', 'created_at'],
};

// All required indexes across schema and migrations
const EXPECTED_INDEXES = [
  'idx_products_category',
  'idx_products_featured',
  'idx_products_created_at',
  'idx_products_category_created_at',
  'idx_products_category_display_order',
  'idx_products_featured_created_at',
  'idx_products_featured_sort_order',
  'idx_products_sku',
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
  'idx_orders_ip_address',
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
  'idx_media_assets_created_at',
  'idx_webhook_replays_expires',
  'idx_product_slug_history_slug',
  'idx_product_slug_history_product_id',
  'idx_review_images_review_id',
  'idx_review_images_product_id',
  'idx_review_images_created_at',
  'idx_fb_campaigns_status',
  'idx_fb_campaigns_created_at',
  'idx_fb_queue_campaign_rec',
  'idx_fb_queue_campaign_status',
  'idx_fb_queue_meta_msg_id',
  'idx_fb_recipients_audience',
  'idx_fb_recipients_psid',
  'idx_fb_recipients_consent',
  'idx_fb_recipients_last_interaction',
  'idx_fb_recipients_incoming_time',
  'idx_fb_recipients_page_id',
  'idx_fb_templates_name',
  'idx_fb_templates_created_at',
  'idx_blocked_ips_ip',
  'idx_blocked_ips_created_at',
];

const EXPECTED_TRIGGERS = [
  'trg_prevent_negative_stock',
  'trg_prevent_negative_stock_insert',
];

const EXPECTED_CONSTRAINTS = [
  { table: 'product_slug_history', type: 'FOREIGN KEY', details: 'FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE' },
  { table: 'fb_campaign_queue', type: 'FOREIGN KEY', details: 'FOREIGN KEY (campaign_id) REFERENCES fb_campaigns(id) ON DELETE CASCADE' },
  { table: 'categories', type: 'UNIQUE', details: 'slug UNIQUE' },
  { table: 'users', type: 'UNIQUE', details: 'email UNIQUE' },
  { table: 'orders', type: 'UNIQUE', details: 'order_number UNIQUE' },
  { table: 'blocked_ips', type: 'UNIQUE', details: 'ip UNIQUE' },
];

function extractTableColumnsFromSql(schemaSql) {
  const tableColumns = {};
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
  let match;

  while ((match = createTableRegex.exec(schemaSql)) !== null) {
    const tableName = match[1].toLowerCase();
    const body = match[2];
    const lines = body.split('\n');
    const cols = [];

    for (const rawLine of lines) {
      const line = rawLine.trim().replace(/--.*$/, '').replace(/,$/, '');
      if (!line) continue;
      if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line)) {
        continue;
      }
      const colMatch = line.match(/^([a-zA-Z0-9_]+)\b/);
      if (colMatch) {
        cols.push(colMatch[1].toLowerCase());
      }
    }
    tableColumns[tableName] = cols;
  }

  return tableColumns;
}

function runAudit() {
  console.log('================================================================');
  console.log('Cloudflare D1 Schema & Complete Migration Reconciliation Audit');
  console.log('================================================================\n');

  const categoryResults = {};
  let overallFailed = false;

  // 1. Dynamic Migration History Discovery & Sequence Check
  console.log('1. Discovering migration history dynamically from migrations/...');
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`❌ Migrations directory not found at: ${MIGRATIONS_DIR}`);
    categoryResults['Migration Sequence & File Discovery'] = 'FAIL';
    categoryResults['Migration Metadata & Version Integrity'] = 'FAIL';
    overallFailed = true;
  } else {
    const allFiles = fs.readdirSync(MIGRATIONS_DIR);
    const sqlMigrationFiles = allFiles
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`   Found ${sqlMigrationFiles.length} SQL migration files dynamically.`);

    const versionPattern = /^(\d{4})_([a-z0-9_]+)\.sql$/i;
    const discoveredVersions = [];
    const duplicateVersions = new Map();
    const malformedFiles = [];
    let minSeq = Infinity;
    let maxSeq = -Infinity;

    for (const file of sqlMigrationFiles) {
      const match = file.match(versionPattern);
      if (!match) {
        malformedFiles.push(file);
        continue;
      }

      const seqNumber = parseInt(match[1], 10);
      discoveredVersions.push({ file, seq: seqNumber, prefix: match[1], name: match[2] });

      if (seqNumber < minSeq) minSeq = seqNumber;
      if (seqNumber > maxSeq) maxSeq = seqNumber;

      if (!duplicateVersions.has(seqNumber)) {
        duplicateVersions.set(seqNumber, [file]);
      } else {
        duplicateVersions.get(seqNumber).push(file);
      }
    }

    // Sequence & Missing numbers detection
    const missingSequenceNumbers = [];
    if (discoveredVersions.length === 0) {
      console.error('❌ No valid numbered migration files discovered.');
      categoryResults['Migration Sequence & File Discovery'] = 'FAIL';
      overallFailed = true;
    } else {
      for (let i = 1; i <= maxSeq; i++) {
        const found = discoveredVersions.some(v => v.seq === i);
        if (!found) {
          missingSequenceNumbers.push(String(i).padStart(4, '0'));
        }
      }

      if (missingSequenceNumbers.length > 0) {
        console.error(`❌ Detected missing migration sequence numbers: ${missingSequenceNumbers.join(', ')}`);
        categoryResults['Migration Sequence & File Discovery'] = 'FAIL';
        overallFailed = true;
      } else {
        console.log(`✓ Sequential history verified: 0001 through ${String(maxSeq).padStart(4, '0')} (${discoveredVersions.length} migrations, no gaps).`);
        categoryResults['Migration Sequence & File Discovery'] = 'PASS';
      }
    }

    // Version integrity and metadata
    const duplicates = Array.from(duplicateVersions.entries()).filter(([_, files]) => files.length > 1);
    if (duplicates.length > 0 || malformedFiles.length > 0) {
      if (duplicates.length > 0) {
        console.error(`❌ Duplicate migration versions detected:`);
        duplicates.forEach(([seq, files]) => {
          console.error(`   Sequence ${String(seq).padStart(4, '0')}: ${files.join(', ')}`);
        });
      }
      if (malformedFiles.length > 0) {
        console.error(`❌ Malformed migration filenames detected: ${malformedFiles.join(', ')}`);
      }
      categoryResults['Migration Metadata & Version Integrity'] = 'FAIL';
      overallFailed = true;
    } else {
      console.log(`✓ Migration metadata valid: no duplicate versions and standard naming enforced.`);
      categoryResults['Migration Metadata & Version Integrity'] = 'PASS';
    }
  }

  // 2. Validate schema.sql completeness
  console.log('\n2. Validating schema.sql against complete target schema...');
  if (!fs.existsSync(SCHEMA_FILE)) {
    console.error(`❌ schema.sql not found at ${SCHEMA_FILE}`);
    categoryResults['Table Definitions'] = 'FAIL';
    categoryResults['Column Definitions & Schema Alignment'] = 'FAIL';
    categoryResults['Index Definitions'] = 'FAIL';
    categoryResults['Trigger Definitions'] = 'FAIL';
    categoryResults['Foreign Key & Unique Constraints'] = 'FAIL';
    overallFailed = true;
  } else {
    const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');

    // Tables check
    const missingTables = [];
    for (const table of EXPECTED_TABLES) {
      const pattern = new RegExp(`CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, 'i');
      if (!pattern.test(schemaSql)) {
        missingTables.push(table);
      }
    }
    if (missingTables.length > 0) {
      console.error(`❌ Missing table definitions in schema.sql: ${missingTables.join(', ')}`);
      categoryResults['Table Definitions'] = 'FAIL';
      overallFailed = true;
    } else {
      console.log(`✓ All ${EXPECTED_TABLES.length} required tables defined in schema.sql.`);
      categoryResults['Table Definitions'] = 'PASS';
    }

    // Columns check
    const parsedColumns = extractTableColumnsFromSql(schemaSql);
    const missingColumnsByTable = [];
    for (const [table, cols] of Object.entries(EXPECTED_TABLE_COLUMNS)) {
      const presentCols = parsedColumns[table] || [];
      const missing = cols.filter(c => !presentCols.includes(c.toLowerCase()));
      if (missing.length > 0) {
        missingColumnsByTable.push(`${table}: [${missing.join(', ')}]`);
      }
    }
    if (missingColumnsByTable.length > 0) {
      console.error(`❌ Missing column definitions in schema.sql:`);
      missingColumnsByTable.forEach(m => console.error(`   - ${m}`));
      categoryResults['Column Definitions & Schema Alignment'] = 'FAIL';
      overallFailed = true;
    } else {
      console.log(`✓ All expected columns across ${Object.keys(EXPECTED_TABLE_COLUMNS).length} tables present in schema.sql.`);
      categoryResults['Column Definitions & Schema Alignment'] = 'PASS';
    }

    // Indexes check
    const missingIndexes = [];
    for (const idx of EXPECTED_INDEXES) {
      const pattern = new RegExp(`CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${idx}\\b`, 'i');
      if (!pattern.test(schemaSql)) {
        missingIndexes.push(idx);
      }
    }
    if (missingIndexes.length > 0) {
      console.error(`❌ Missing index definitions in schema.sql: ${missingIndexes.join(', ')}`);
      categoryResults['Index Definitions'] = 'FAIL';
      overallFailed = true;
    } else {
      console.log(`✓ All ${EXPECTED_INDEXES.length} required indexes defined in schema.sql.`);
      categoryResults['Index Definitions'] = 'PASS';
    }

    // Triggers check
    const missingTriggers = [];
    for (const trg of EXPECTED_TRIGGERS) {
      const pattern = new RegExp(`CREATE\\s+TRIGGER\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${trg}\\b`, 'i');
      if (!pattern.test(schemaSql)) {
        missingTriggers.push(trg);
      }
    }
    if (missingTriggers.length > 0) {
      console.error(`❌ Missing trigger definitions in schema.sql: ${missingTriggers.join(', ')}`);
      categoryResults['Trigger Definitions'] = 'FAIL';
      overallFailed = true;
    } else {
      console.log(`✓ All ${EXPECTED_TRIGGERS.length} required triggers defined in schema.sql.`);
      categoryResults['Trigger Definitions'] = 'PASS';
    }

    // Constraints & Foreign Keys check
    const missingConstraints = [];
    for (const item of EXPECTED_CONSTRAINTS) {
      if (item.type === 'FOREIGN KEY') {
        const escaped = item.details.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const pattern = new RegExp(escaped, 'i');
        if (!pattern.test(schemaSql)) {
          missingConstraints.push(`${item.table}: ${item.details}`);
        }
      } else if (item.type === 'UNIQUE') {
        const pattern = new RegExp(`\\b${item.details.replace(/\s+/g, '\\s+')}\\b`, 'i');
        const uniqueIndexPattern = new RegExp(`CREATE\\s+UNIQUE\\s+INDEX[\\s\\S]*?ON\\s+${item.table}\\b`, 'i');
        if (!pattern.test(schemaSql) && !uniqueIndexPattern.test(schemaSql)) {
          missingConstraints.push(`${item.table}: ${item.details}`);
        }
      }
    }
    if (missingConstraints.length > 0) {
      console.error(`❌ Missing constraint definitions in schema.sql: ${missingConstraints.join(', ')}`);
      categoryResults['Foreign Key & Unique Constraints'] = 'FAIL';
      overallFailed = true;
    } else {
      console.log(`✓ All foreign keys and unique constraints defined in schema.sql.`);
      categoryResults['Foreign Key & Unique Constraints'] = 'PASS';
    }
  }

  // 3. Local and Remote D1 Database Execution / Reconciliation Checks
  const args = process.argv.slice(2);
  const checkRemote = args.includes('--remote');
  const checkLocal = args.includes('--local');

  console.log('\n3. Checking Live Cloudflare D1 Databases...');

  if (checkLocal) {
    console.log('   Executing sqlite_master query against local D1 (--local)...');
    try {
      const query = "SELECT type, name, tbl_name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%';";
      const cmd = `npx wrangler d1 execute rongdhonu-db --local --command="${query}" --json`;
      const output = execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
      const parsed = JSON.parse(output);
      const results = (parsed[0] && parsed[0].results) || [];
      const existingNames = new Set(results.map(r => r.name));
      const missingLocalTables = EXPECTED_TABLES.filter(t => !existingNames.has(t));
      const missingLocalIndexes = EXPECTED_INDEXES.filter(i => !existingNames.has(i));

      if (missingLocalTables.length > 0 || missingLocalIndexes.length > 0) {
        console.warn(`⚠️ Local D1 database has unapplied migrations.`);
        if (missingLocalTables.length > 0) console.warn(`   Missing tables: ${missingLocalTables.join(', ')}`);
        if (missingLocalIndexes.length > 0) console.warn(`   Missing indexes: ${missingLocalIndexes.join(', ')}`);
        categoryResults['Local Live D1 Database'] = 'FAIL';
        overallFailed = true;
      } else {
        console.log(`✓ Local D1 database fully reconciles with schema.`);
        categoryResults['Local Live D1 Database'] = 'PASS';
      }
    } catch (err) {
      console.error(`❌ Failed to execute local D1 query: ${err.message || err}`);
      categoryResults['Local Live D1 Database'] = 'FAIL';
      overallFailed = true;
    }
  } else {
    categoryResults['Local Live D1 Database'] = 'NOT CHECKED';
    console.log('   [NOT CHECKED] Local live D1 was not queried (pass --local to verify).');
  }

  if (checkRemote) {
    console.log('   Executing sqlite_master query against remote D1 (--remote)...');
    try {
      const query = "SELECT type, name, tbl_name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%';";
      const cmd = `npx wrangler d1 execute rongdhonu-db --remote --command="${query}" --json`;
      const output = execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
      const parsed = JSON.parse(output);
      const results = (parsed[0] && parsed[0].results) || [];
      const existingNames = new Set(results.map(r => r.name));
      const missingRemoteTables = EXPECTED_TABLES.filter(t => !existingNames.has(t));
      const missingRemoteIndexes = EXPECTED_INDEXES.filter(i => !existingNames.has(i));

      if (missingRemoteTables.length > 0 || missingRemoteIndexes.length > 0) {
        console.warn(`⚠️ Remote D1 database has missing objects.`);
        if (missingRemoteTables.length > 0) console.warn(`   Missing tables: ${missingRemoteTables.join(', ')}`);
        if (missingRemoteIndexes.length > 0) console.warn(`   Missing indexes: ${missingRemoteIndexes.join(', ')}`);
        categoryResults['Remote Production D1 Database'] = 'FAIL';
        overallFailed = true;
      } else {
        console.log(`✓ Remote D1 database fully reconciles with schema.`);
        categoryResults['Remote Production D1 Database'] = 'PASS';
      }
    } catch (err) {
      console.error(`❌ Failed to execute remote D1 query: ${err.message || err}`);
      categoryResults['Remote Production D1 Database'] = 'FAIL';
      overallFailed = true;
    }
  } else {
    categoryResults['Remote Production D1 Database'] = 'NOT CHECKED';
    console.log('   [NOT CHECKED] Remote production D1 was not queried (pass --remote to verify).');
  }

  // 4. Print Structured Results Table
  console.log('\n================================================================');
  console.log('AUDIT CATEGORY RESULTS');
  console.log('================================================================');
  for (const [category, status] of Object.entries(categoryResults)) {
    const symbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚪';
    console.log(`  ${symbol} ${category.padEnd(42)}: [${status}]`);
  }
  console.log('================================================================');

  if (overallFailed) {
    console.error('\n❌ RECONCILIATION AUDIT FAILED: Required schema checks did not pass.');
    process.exit(1);
  }

  console.log('\n✅ RECONCILIATION AUDIT PASSED: All verified categories matched successfully.');
  process.exit(0);
}

runAudit();
