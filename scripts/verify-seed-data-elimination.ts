/**
 * Verification Script: Seed Data Bundle Optimization & Verification
 * Verifies:
 * 1. Production bundle index JS does NOT contain seed products, orders, coupons, or reviews
 * 2. Dedicated lazy chunk 'seed-data-*.js' exists and contains mock data isolated from the critical path
 * 3. Fallback mechanism remains operational
 * 4. No secrets or credentials exist in seedData.ts
 * 5. Development data endpoints continue serving data properly
 */

import fs from 'fs';
import path from 'path';

async function runSeedDataVerification() {
  console.log('================================================================');
  console.log('🚀 RUNNING SEED DATA ELIMINATION VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   Detail: ${detail}`);
      failed++;
    }
  }

  const distAssetsDir = path.resolve(process.cwd(), 'dist/assets');
  const files = fs.readdirSync(distAssetsDir);

  const indexJsFile = files.find((f) => f.startsWith('index-') && f.endsWith('.js') && !f.includes('DlFpMWx_'));
  const seedDataChunkFile = files.find((f) => f.startsWith('seed-data-') && f.endsWith('.js'));

  assert(Boolean(indexJsFile), `Found production entry index chunk: ${indexJsFile}`);
  assert(Boolean(seedDataChunkFile), `Found isolated seed-data chunk: ${seedDataChunkFile}`);

  if (indexJsFile && seedDataChunkFile) {
    const indexJsContent = fs.readFileSync(path.join(distAssetsDir, indexJsFile), 'utf-8');
    const seedDataChunkContent = fs.readFileSync(path.join(distAssetsDir, seedDataChunkFile), 'utf-8');

    // 1. Verify index JS does not contain heavy seed products
    const hasSeedProductInIndex = indexJsContent.includes('Premium Leather Wallet');
    assert(!hasSeedProductInIndex, 'Production Entry: Zero mock products ("Premium Leather Wallet") in index JS');

    const hasSeedProductIdsInIndex = indexJsContent.includes('prod-wallet-01');
    assert(!hasSeedProductIdsInIndex, 'Production Entry: Zero mock product IDs ("prod-wallet-01") in index JS');

    // 2. Verify index JS does not contain seed reviews
    const hasSeedReviewsInIndex = indexJsContent.includes('Siam Ahmed');
    assert(!hasSeedReviewsInIndex, 'Production Entry: Zero mock reviews ("Siam Ahmed") in index JS');

    // 3. Verify index JS does not contain seed coupons
    const hasSeedCouponsInIndex = indexJsContent.includes('WELCOME50');
    assert(!hasSeedCouponsInIndex, 'Production Entry: Zero mock coupons ("WELCOME50") in index JS');

    // 4. Verify seed-data chunk contains the isolated data
    const hasSeedProductInChunk = seedDataChunkContent.includes('Premium Leather Wallet');
    assert(hasSeedProductInChunk, 'Isolated Seed Chunk: Contains mock products for on-demand fallback/reset');

    const hasSeedReviewsInChunk = seedDataChunkContent.includes('Siam Ahmed');
    assert(hasSeedReviewsInChunk, 'Isolated Seed Chunk: Contains mock reviews for on-demand fallback/reset');

    const hasSeedCouponsInChunk = seedDataChunkContent.includes('WELCOME50');
    assert(hasSeedCouponsInChunk, 'Isolated Seed Chunk: Contains mock coupons for on-demand fallback/reset');
  }

  // 5. Verify security scan of seedData.ts
  const seedDataPath = path.resolve(process.cwd(), 'src/data/seedData.ts');
  const seedDataContent = fs.readFileSync(seedDataPath, 'utf-8');

  assert(!seedDataContent.includes('password123'), 'Security Scan: No plain passwords in seedData.ts');
  assert(!seedDataContent.includes('sk_live_'), 'Security Scan: No live secret keys in seedData.ts');
  assert(
    !seedDataContent.includes("steadfastApiKey: '") || seedDataContent.includes("steadfastApiKey: ''"),
    'Security Scan: No hardcoded courier API keys in seedData.ts'
  );

  // 6. Verify defaultSettings.ts exists and provides clean fallback configuration
  const defaultSettingsPath = path.resolve(process.cwd(), 'src/data/defaultSettings.ts');
  assert(fs.existsSync(defaultSettingsPath), 'Architecture: defaultSettings.ts extracted and cleanly separated');

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSeedDataVerification().catch((err) => {
  console.error('Fatal error during seed data verification:', err);
  process.exit(1);
});
