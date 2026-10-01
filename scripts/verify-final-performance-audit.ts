import assert from 'node:assert';
import { storeHomepageApi } from '../src/services/storeApi';
import { authApi } from '../src/services/authApi';
import { getResponsiveImageProps } from '../src/utils/responsiveImage';

async function runFinalPerformanceAudit() {
  console.log('===============================================================');
  console.log('FINAL PERFORMANCE AUDIT: STOREFRONT LOADING & RESOURCE FLOW');
  console.log('===============================================================');

  const baseUrl = 'http://localhost:3000';

  // 1. Audit Initial HTML / Worker Response
  console.log('\n[AUDIT 1] Inspecting Initial HTML / Worker Response & Preconnects...');
  const htmlStart = performance.now();
  const htmlRes = await fetch(`${baseUrl}/`);
  const htmlDuration = performance.now() - htmlStart;
  assert(htmlRes.ok, `Expected 200 OK from HTML entry, got ${htmlRes.status}`);

  const htmlText = await htmlRes.text();
  assert(htmlText.includes('preconnect') && htmlText.includes('fonts.googleapis.com'), 'Must preconnect to Google Fonts');
  assert(htmlText.includes('preconnect') && htmlText.includes('images.unsplash.com'), 'Must preconnect to image CDN');
  assert(htmlText.includes('dns-prefetch') && htmlText.includes('images.unsplash.com'), 'Must dns-prefetch image CDN');
  console.log(`✓ HTML entry responded in ${htmlDuration.toFixed(2)}ms with DNS prefetch and preconnect headers`);

  // 2. Audit /api/store/homepage latency & caching
  console.log('\n[AUDIT 2] Measuring /api/store/homepage Latency, Payload, & Caching...');
  const hpStart = performance.now();
  const hpRes = await fetch(`${baseUrl}/api/store/homepage`);
  const hpDuration = performance.now() - hpStart;
  assert(hpRes.ok, `Expected 200 OK, got ${hpRes.status}`);
  const cacheControl = hpRes.headers.get('cache-control') || '';
  assert(cacheControl.includes('public'), 'Cache-Control must be public');
  assert(cacheControl.includes('stale-while-revalidate'), 'Must include stale-while-revalidate');

  const hpJson = await hpRes.json();
  assert(hpJson.success === true, 'Homepage response must succeed');
  assert(Array.isArray(hpJson.categories) && hpJson.categories.length > 0, 'Categories must be present');
  assert(Array.isArray(hpJson.slides) && hpJson.slides.length > 0, 'Slides must be present');
  assert(Array.isArray(hpJson.products) && hpJson.products.length > 0, 'Unique products must be present');

  console.log(`✓ /api/store/homepage responded in ${hpDuration.toFixed(2)}ms`);
  console.log(`  - Cache-Control: ${cacheControl}`);
  console.log(`  - Categories: ${hpJson.categories.length}, Slides: ${hpJson.slides.length}, Products: ${hpJson.products.length}`);

  // 3. Audit In-flight API Request Deduplication
  console.log('\n[AUDIT 3] Verifying Concurrent In-Flight Request Deduplication...');
  let networkCalls = 0;
  const originalFetch = globalThis.fetch;

  // Intercept fetch to verify deduplication
  (globalThis as any).fetch = async (input: any, init: any) => {
    networkCalls++;
    return originalFetch(input, init);
  };

  try {
    const beforeHpCalls = networkCalls;
    // Launch 3 concurrent calls to storeHomepageApi.getHomepage()
    const [p1, p2, p3] = await Promise.all([
      storeHomepageApi.getHomepage(),
      storeHomepageApi.getHomepage(),
      storeHomepageApi.getHomepage(),
    ]);

    assert(p1.success && p2.success && p3.success, 'All concurrent calls must resolve successfully');
    const hpNetworkCalls = networkCalls - beforeHpCalls;
    assert.strictEqual(hpNetworkCalls, 1, `Expected exactly 1 network call for 3 concurrent homepage requests, got ${hpNetworkCalls}`);
    console.log(`✓ Concurrent storeHomepageApi calls: 3 callers dispatched exactly ${hpNetworkCalls} network request`);

    const beforeAuthCalls = networkCalls;
    // Launch 3 concurrent calls to authApi.me()
    const [m1, m2, m3] = await Promise.all([
      authApi.me(),
      authApi.me(),
      authApi.me(),
    ]);
    const authNetworkCalls = networkCalls - beforeAuthCalls;
    assert.strictEqual(authNetworkCalls, 1, `Expected exactly 1 network call for 3 concurrent auth requests, got ${authNetworkCalls}`);
    console.log(`✓ Concurrent authApi.me calls: 3 callers dispatched exactly ${authNetworkCalls} network request`);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 4. Audit Image Loading Attributes & Priorities
  console.log('\n[AUDIT 4] Validating Image Loading Strategy Across Storefront...');
  const heroSlide = hpJson.slides[0];
  const bannerProps = getResponsiveImageProps(heroSlide.imageUrl, 'banner', { priority: true });
  assert.strictEqual(bannerProps.loading, 'eager', 'Hero banner must be eager-loaded for optimal LCP');
  assert.strictEqual(bannerProps.fetchPriority, 'high', 'Hero banner must have fetchPriority="high"');
  assert.strictEqual(bannerProps.decoding, 'sync', 'Hero banner must decode sync');

  const sampleProduct = hpJson.products[0];
  const cardProps = getResponsiveImageProps(sampleProduct.imageUrl, 'card');
  assert.strictEqual(cardProps.loading, 'lazy', 'Standard product cards must be lazy-loaded');
  assert.strictEqual(cardProps.decoding, 'async', 'Standard product cards must decode async');
  assert.strictEqual(cardProps.fetchPriority, 'auto', 'Standard product cards must have auto priority');

  console.log('✓ Hero Banner configured for high priority LCP delivery');
  console.log('✓ Product cards configured for below-the-fold lazy loading');

  // 5. Audit D1 Security Boundaries
  console.log('\n[AUDIT 5] Verifying D1 Data Sanitization & Security Boundaries...');
  for (const product of hpJson.products) {
    assert(product.buyingPrice === undefined, `Product ${product.id} must not reveal buyingPrice`);
    assert(product.unitProfit === undefined, `Product ${product.id} must not reveal unitProfit`);
  }
  console.log('✓ Zero financial data leakage across all public homepage products');

  console.log('\n===============================================================');
  console.log('ALL FINAL PERFORMANCE AUDIT CHECKS PASSED SUCCESSFULLY ✅');
  console.log('===============================================================');
}

runFinalPerformanceAudit().catch((err) => {
  console.error('Final performance audit failed:', err);
  process.exit(1);
});
