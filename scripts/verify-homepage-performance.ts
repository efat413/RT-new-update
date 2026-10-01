import assert from 'node:assert';
import { storeHomepageApi } from '../src/services/storeApi';
import { getResponsiveImageProps, RESPONSIVE_IMAGE_PRESETS } from '../src/utils/responsiveImage';

async function measureHomepagePerformance() {
  console.log('===============================================================');
  console.log('MEASURING HOMEPAGE PERFORMANCE & LOADING FLOW OPTIMIZATION');
  console.log('===============================================================');

  const baseUrl = 'http://localhost:3000';

  // 1. Measure /api/store/homepage API latency and payload size
  console.log('\n[BENCHMARK 1] Measuring /api/store/homepage API Response Time & Payload Size...');
  const samples: number[] = [];
  let payloadBytes = 0;
  let cacheControlHeader = '';

  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    const res = await fetch(`${baseUrl}/api/store/homepage`);
    const duration = performance.now() - start;
    samples.push(duration);

    assert(res.ok, `Homepage API responded with HTTP ${res.status}`);
    cacheControlHeader = res.headers.get('cache-control') || '';
    const text = await res.text();
    payloadBytes = Buffer.byteLength(text, 'utf8');
  }

  const avgDuration = (samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2);
  const minDuration = Math.min(...samples).toFixed(2);
  const maxDuration = Math.max(...samples).toFixed(2);

  console.log(`✓ Consolidate Homepage endpoint metrics:`);
  console.log(`  - Samples: ${samples.map((s) => s.toFixed(1) + 'ms').join(', ')}`);
  console.log(`  - Average Latency: ${avgDuration}ms (min: ${minDuration}ms, max: ${maxDuration}ms)`);
  console.log(`  - Consolidated Payload Size: ${(payloadBytes / 1024).toFixed(2)} KB`);
  console.log(`  - HTTP Cache-Control: "${cacheControlHeader}"`);

  assert(cacheControlHeader.includes('public'), 'Cache-Control must indicate public cacheability');
  assert(cacheControlHeader.includes('stale-while-revalidate'), 'Must support stale-while-revalidate for instant subsequent loads');

  // 2. Validate consolidated data structure
  console.log('\n[BENCHMARK 2] Validating Data Completeness & Integrity...');
  const hpRes = await fetch(`${baseUrl}/api/store/homepage`);
  const hpData = await hpRes.json();
  assert(hpData.success === true, 'Response must be success: true');
  assert(Array.isArray(hpData.categories) && hpData.categories.length > 0, 'Categories must be populated');
  assert(Array.isArray(hpData.slides) && hpData.slides.length > 0, 'Hero slides must be populated');
  assert(hpData.settings && typeof hpData.settings === 'object', 'Settings must be populated');
  assert(hpData.categoryProducts && typeof hpData.categoryProducts === 'object', 'categoryProducts map must be present');
  assert(Array.isArray(hpData.products) && hpData.products.length > 0, 'Unique products must be populated');

  console.log(`✓ Data completeness verified:`);
  console.log(`  - Categories returned: ${hpData.categories.length}`);
  console.log(`  - Hero slides returned: ${hpData.slides.length}`);
  console.log(`  - Unique products loaded: ${hpData.products.length}`);
  for (const cat of hpData.categories) {
    const count = (hpData.categoryProducts[cat.id] || []).length;
    console.log(`    • ${cat.name} (${cat.id}): ${count} products`);
    assert(count <= 6, `Homepage per-category limit must not exceed 6 (got ${count})`);
  }

  // 3. Verify zero leakage of admin fields in homepage data
  console.log('\n[BENCHMARK 3] Verifying Security & Admin Data Boundaries...');
  for (const prod of hpData.products) {
    assert(prod.buyingPrice === undefined, `Product ${prod.id} must not leak buyingPrice to storefront`);
    assert(prod.unitProfit === undefined, `Product ${prod.id} must not leak unitProfit to storefront`);
  }
  console.log('✓ Public storefront receives strictly sanitized product objects (no buying prices or unit profits)');

  // 4. Validate responsive image configurations
  console.log('\n[BENCHMARK 4] Validating Product Card and Banner Image Loading Strategies...');
  const sampleProduct = hpData.products[0];
  const cardPropsLazy = getResponsiveImageProps(sampleProduct.imageUrl, 'card');
  assert.strictEqual(cardPropsLazy.loading, 'lazy', 'Standard product cards must lazy-load');
  assert.strictEqual(cardPropsLazy.decoding, 'async', 'Standard product cards must decode async');
  assert.strictEqual(cardPropsLazy.fetchPriority, 'auto', 'Standard product cards must use auto fetchPriority');

  const bannerSlide = hpData.slides[0];
  const bannerProps = getResponsiveImageProps(bannerSlide.imageUrl, 'banner', { priority: true });
  assert.strictEqual(bannerProps.loading, 'eager', 'LCP Hero Banner must be eager');
  assert.strictEqual(bannerProps.fetchPriority, 'high', 'LCP Hero Banner must have high fetchPriority');
  assert.strictEqual(bannerProps.decoding, 'sync', 'LCP Hero Banner must decode sync');

  console.log('✓ Image loading attributes verified:');
  console.log(`  - Hero Banner (LCP): loading=eager, fetchPriority=high, decoding=sync`);
  console.log(`  - Product Cards: loading=lazy, fetchPriority=auto, decoding=async`);

  console.log('\n===============================================================');
  console.log('ALL HOMEPAGE PERFORMANCE & LOADING AUDITS PASSED ✅');
  console.log('===============================================================');
}

measureHomepagePerformance().catch((err) => {
  console.error('Measurement failed:', err);
  process.exit(1);
});
