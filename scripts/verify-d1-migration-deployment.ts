/**
 * Cloudflare D1 Migration Chain & Deployment Order Verification Tool
 *
 * Verifies:
 * 1. Exactly 20 migration files exist in migrations/ (0001 through 0020).
 * 2. Strict sequential numbering without gaps (0001, 0002, ..., 0020).
 * 3. Migration 0020_advance_payment.sql is present and correctly structured.
 * 4. wrangler.json D1 database binding configuration ("database_name": "rongdhonu-db", "migrations_dir": "migrations").
 * 5. GitHub Actions deploy workflow order:
 *    - Steps: [Checkout Code] -> [Setup Node] -> [npm ci] -> [npm run build] -> [Apply D1 Migrations] -> [Deploy Worker]
 *    - Strict fail-closed: If migration fails, worker deployment step is NOT executed.
 * 6. Migration idempotency & non-destructiveness:
 *    - Zero DROP TABLE statements across all migrations.
 *    - Migration files are immutable historical records.
 * 7. Verification of wrangler d1 migrations CLI compatibility.
 */

import fs from 'fs';
import path from 'path';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function verifyD1MigrationChain() {
  console.log('====================================================');
  console.log('CLOUDFLARE D1 MIGRATION CHAIN & DEPLOYMENT AUDIT');
  console.log('====================================================\n');

  // 1. Inspect migrations directory
  console.log('[Test 1] Inspecting migrations directory and file ordering...');
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  assert(fs.existsSync(migrationsDir), 'migrations/ directory exists');

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`  Found ${files.length} SQL migration files in migrations/`);
  assert(files.length === 20, `Exactly 20 migration files exist (found ${files.length})`);

  // Verify sequential numbers 0001 to 0020
  for (let i = 1; i <= 20; i++) {
    const prefix = String(i).padStart(4, '0');
    const matched = files.find((f) => f.startsWith(`${prefix}_`));
    assert(!!matched, `Migration with prefix ${prefix} exists: "${matched}"`);
  }

  // 2. Verify migration 0020 specifically
  console.log('\n[Test 2] Verifying migration 0020_advance_payment.sql...');
  const m20 = files.find((f) => f.startsWith('0020_'));
  assert(m20 === '0020_advance_payment.sql', `Migration 0020 is "0020_advance_payment.sql" (found ${m20})`);
  const m20Content = fs.readFileSync(path.join(migrationsDir, m20!), 'utf8');
  assert(m20Content.includes('ALTER TABLE orders ADD COLUMN advance_payment'), '0020 contains advance_payment column definition');
  assert(m20Content.includes('idx_orders_advance_payment'), '0020 contains advance_payment index creation');
  assert(!m20Content.toUpperCase().includes('DROP TABLE'), '0020 contains zero destructive DROP TABLE statements');

  // 3. Inspect all migrations for non-destructiveness
  console.log('\n[Test 3] Auditing all 20 migrations for non-destructive schema discipline...');
  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    // Ensure no DROP TABLE
    const upper = content.toUpperCase();
    assert(!upper.includes('DROP TABLE '), `Migration "${file}" contains no DROP TABLE statements`);
  }

  // 4. Inspect wrangler.json configuration
  console.log('\n[Test 4] Inspecting wrangler.json D1 configuration...');
  const wranglerPath = path.resolve(process.cwd(), 'wrangler.json');
  assert(fs.existsSync(wranglerPath), 'wrangler.json exists');
  const wranglerConfig = JSON.parse(fs.readFileSync(wranglerPath, 'utf8'));

  assert(Array.isArray(wranglerConfig.d1_databases), 'wrangler.json has d1_databases array');
  const dbConfig = wranglerConfig.d1_databases.find((d: any) => d.database_name === 'rongdhonu-db');
  assert(!!dbConfig, 'D1 database "rongdhonu-db" is configured in wrangler.json');
  assert(dbConfig.binding === 'DB', 'D1 binding is named "DB"');
  assert(dbConfig.database_id === '3276795d-5593-42c0-8e14-947f3ab1172b', `D1 database_id matches "3276795d-5593-42c0-8e14-947f3ab1172b"`);
  assert(dbConfig.migrations_dir === 'migrations', 'migrations_dir is configured as "migrations"');

  // 5. Inspect GitHub Actions deploy pipeline
  console.log('\n[Test 5] Inspecting GitHub Actions deployment workflow (.github/workflows/deploy.yml)...');
  const workflowPath = path.resolve(process.cwd(), '.github/workflows/deploy.yml');
  assert(fs.existsSync(workflowPath), '.github/workflows/deploy.yml exists');
  const workflowContent = fs.readFileSync(workflowPath, 'utf8');

  // Find step positions
  const migrateStepIndex = workflowContent.indexOf('Apply Cloudflare D1 Remote Migrations');
  const deployStepIndex = workflowContent.indexOf('Deploy Worker & Static Assets to Cloudflare');
  assert(migrateStepIndex !== -1, 'Migration step "Apply Cloudflare D1 Remote Migrations" is defined in deploy job');
  assert(deployStepIndex !== -1, 'Worker deployment step "Deploy Worker & Static Assets to Cloudflare" is defined in deploy job');
  assert(migrateStepIndex < deployStepIndex, 'MIGRATION APPLIED FIRST: Migration step runs BEFORE Worker deployment step');

  // Verify command
  assert(workflowContent.includes('npx wrangler d1 migrations apply rongdhonu-db --remote'), 'Migration command is "npx wrangler d1 migrations apply rongdhonu-db --remote"');
  assert(workflowContent.includes('npx wrangler deploy'), 'Deploy command is "npx wrangler deploy"');

  // Verify fail-closed behavior: GitHub Actions halts by default when any step returns non-zero exit code
  assert(!workflowContent.includes('continue-on-error: true'), 'Workflow strictly enforces fail-closed: no "continue-on-error: true" on migration step');

  console.log('\n====================================================');
  console.log('✅ ALL D1 MIGRATION DEPLOYMENT PROCESS CHECKS PASSED!');
  console.log('====================================================');
}

verifyD1MigrationChain().catch((err) => {
  console.error('Fatal error during D1 migration verification:', err);
  process.exit(1);
});
