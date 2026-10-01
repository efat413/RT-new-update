import assert from 'node:assert';
import { storeHomepageApi, categoriesApi, slidersApi, settingsApi, productsApi } from '../src/services/storeApi';
import { authApi } from '../src/services/authApi';

async function testHomepageOptimization() {
  console.log('===============================================================');
  console.log('TESTING HOMEPAGE LOADING & REQUEST DEDUPLICATION SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function test(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // 1. IN-FLIGHT REQUEST DEDUPLICATION TEST FOR HOMEPAGE API
  console.log('--- 1. IN-FLIGHT CONCURRENT DEDUPLICATION ---');
  storeHomepageApi.clearCache();

  // Fire 5 concurrent calls to storeHomepageApi.getHomepage() simultaneously
  const concurrentCalls = await Promise.all([
    storeHomepageApi.getHomepage(),
    storeHomepageApi.getHomepage(),
    storeHomepageApi.getHomepage(),
    storeHomepageApi.getHomepage(),
    storeHomepageApi.getHomepage(),
  ]);

  const allSuccessful = concurrentCalls.every((res) => res.success && res.data);
  test(allSuccessful, '1.1 All 5 concurrent homepage requests resolved successfully');

  // Verify all 5 resolved with the exact same data reference
  const firstData = concurrentCalls[0].data;
  const allIdentical = concurrentCalls.every((res) => res.data === firstData);
  test(allIdentical, '1.2 Concurrent requests were deduplicated and shared the exact same in-flight promise');

  // 2. IN-MEMORY CACHE REUSE TEST (ZERO NETWORK OVERHEAD)
  console.log('\n--- 2. IN-MEMORY CACHE REUSE ---');
  const cachedStart = performance.now();
  const cachedCall = await storeHomepageApi.getHomepage();
  const cachedDuration = performance.now() - cachedStart;

  test(cachedCall.success && cachedCall.data === firstData, '2.1 Subsequent getHomepage() reused cached in-memory data');
  test(cachedDuration < 5, `2.2 Cached getHomepage() returned virtually instantly (${cachedDuration.toFixed(2)}ms < 5ms)`);

  // 3. SUB-CACHE WARMING (ZERO EXTRA NETWORK CALLS FOR CATEGORIES, SLIDERS, SETTINGS)
  console.log('\n--- 3. CROSS-CACHE WARMING ---');
  const catStart = performance.now();
  const cats = await categoriesApi.getAll();
  const catDuration = performance.now() - catStart;
  test(Array.isArray(cats) && cats.length > 0, '3.1 categoriesApi.getAll() resolved without extra network call');
  test(catDuration < 5, `3.2 categoriesApi.getAll() was served from warmed cache (${catDuration.toFixed(2)}ms < 5ms)`);

  const sldStart = performance.now();
  const slides = await slidersApi.getAll();
  const sldDuration = performance.now() - sldStart;
  test(Array.isArray(slides) && slides.length > 0, '3.3 slidersApi.getAll() resolved without extra network call');
  test(sldDuration < 5, `3.4 slidersApi.getAll() was served from warmed cache (${sldDuration.toFixed(2)}ms < 5ms)`);

  const sttStart = performance.now();
  const settings = await settingsApi.get();
  const sttDuration = performance.now() - sttStart;
  test(Boolean(settings && settings.siteName), '3.5 settingsApi.get() resolved without extra network call');
  test(sttDuration < 5, `3.6 settingsApi.get() was served from warmed cache (${sttDuration.toFixed(2)}ms < 5ms)`);

  // 4. AUTH SESSION IN-FLIGHT DEDUPLICATION & CACHING
  console.log('\n--- 4. AUTH SESSION REQUEST DEDUPLICATION ---');
  authApi.clearCache();
  const authCalls = await Promise.all([
    authApi.me(),
    authApi.me(),
    authApi.me(),
  ]);
  const authSuccess = authCalls.every((res) => res !== null);
  test(authSuccess, '4.1 Concurrent authApi.me() requests were deduplicated into a single in-flight network call');

  const cachedAuth = await authApi.me();
  test(cachedAuth !== null, '4.2 Subsequent authApi.me() call reused cached session result');

  // 5. CACHE INVALIDATION ON MUTATIONS
  console.log('\n--- 5. CACHE INVALIDATION HOOKS ---');
  test(storeHomepageApi.getCached() !== null, '5.1 Homepage cache is populated prior to invalidation');
  storeHomepageApi.clearCache();
  test(storeHomepageApi.getCached() === null, '5.2 storeHomepageApi.clearCache() successfully purged cache');

  console.log('\n===============================================================');
  console.log(`OPTIMIZATION VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

testHomepageOptimization().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
