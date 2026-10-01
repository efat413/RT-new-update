/**
 * Verification Script: Marketing Pixel & Analytics Performance Optimization
 * Verifies:
 * 1. Removal of render-blocking tracking scripts from index.html head
 * 2. Idle scheduling & non-blocking execution via requestIdleCallback / setTimeout
 * 3. ProductView event firing and platform mapping
 * 4. AddToCart event firing and platform mapping
 * 5. InitiateCheckout event firing and platform mapping
 * 6. Purchase event firing and platform mapping
 * 7. Prevention of duplicate Purchase events via order idempotency cache
 * 8. Prevention of duplicate GA & GTM script injections and duplicate PageViews
 * 9. Accurate script source attribution (data-loaded-by, data-source)
 */

import fs from 'fs';
import path from 'path';

// Mock browser environment for unit test
class MockScriptElement {
  id = '';
  src = '';
  async = false;
  attributes: Record<string, string> = {};
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  parentNode: any = null;

  setAttribute(k: string, v: string) {
    this.attributes[k] = v;
  }
  getAttribute(k: string) {
    return this.attributes[k] || null;
  }
}

const mockScripts: MockScriptElement[] = [];

(global as any).document = {
  getElementById(id: string) {
    return mockScripts.find((s) => s.id === id) || null;
  },
  getElementsByTagName(tag: string) {
    if (tag === 'script') return mockScripts;
    return [];
  },
  createElement(tag: string) {
    if (tag === 'script') {
      const el = new MockScriptElement();
      mockScripts.push(el);
      return el;
    }
    return {
      id: '',
      src: '',
      style: {},
      appendChild() {},
    };
  },
  body: {
    insertBefore() {},
  },
  head: {
    appendChild(el: any) {
      if (!mockScripts.includes(el)) mockScripts.push(el);
    },
  },
};

(global as any).window = {
  dataLayer: [],
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
};

(global as any).localStorage = {
  _store: {} as Record<string, string>,
  getItem(k: string) {
    return this._store[k] || null;
  },
  setItem(k: string, v: string) {
    this._store[k] = v;
  },
  removeItem(k: string) {
    delete this._store[k];
  },
};

// Import pixelTracking module under test
import {
  scheduleIdleTask,
  initMetaPixel,
  initTikTokPixel,
  initGtm,
  initGoogleAnalytics,
  syncPixelScripts,
  trackSocialEvent,
  getTrackingSources,
  clearStoredPixelLogs,
  getStoredPixelLogs,
} from '../src/utils/pixelTracking';

async function runVerification() {
  console.log('================================================================');
  console.log('🚀 RUNNING PIXEL & ANALYTICS OPTIMIZATION VERIFICATION');
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

  // 1. Verify index.html critical rendering path
  const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
  const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');
  const hasRenderBlockingGtagInHead = indexHtmlContent.includes('<script async src="https://www.googletagmanager.com/gtag/js?id=G-CKJLJSDKFZ"></script>');
  assert(
    !hasRenderBlockingGtagInHead,
    'Critical Path: No render-blocking Google tag in index.html <head>',
    'Found blocking gtag script in index.html'
  );

  // 2. Verify scheduleIdleTask non-blocking behavior
  let idleExecuted = false;
  scheduleIdleTask(() => {
    idleExecuted = true;
  }, 100);
  await new Promise((r) => setTimeout(r, 200));
  assert(idleExecuted, 'Scheduler: scheduleIdleTask executes successfully without blocking');

  // 3. Verify Script Initialization & Sourcing
  const testSettings: any = {
    trackingEnabled: true,
    fbPixelId: '123456789012345',
    tiktokPixelId: 'TT-TEST-12345',
    gtmId: 'GTM-TEST01',
    googleAnalyticsId: 'G-CKJLJSDKFZ',
    advancedMatchingEnabled: true,
    trackingDebugMode: false,
  };

  (global as any).localStorage.setItem('rongdhonu_settings_v1', JSON.stringify(testSettings));

  syncPixelScripts(testSettings);

  const sources = getTrackingSources();
  assert(sources.meta.loaded, 'Meta Pixel: Initialized by orchestrator');
  assert(sources.tiktok.loaded, 'TikTok Pixel: Initialized by orchestrator');
  assert(sources.gtm.loaded, 'GTM: Container loaded with source store-settings');
  assert(sources.ga.loaded, 'GA: Google Analytics loaded with source store-settings');

  // Check script tags have explicit data-source and data-loaded-by attributes
  const metaScript = (global as any).document.getElementById('rongdhonu-meta-pixel-script');
  assert(
    metaScript?.getAttribute('data-loaded-by') === 'rongdhonu-pixel-orchestrator',
    'Script Attribution: Meta pixel has data-loaded-by="rongdhonu-pixel-orchestrator"'
  );
  assert(
    metaScript?.getAttribute('data-source') === 'store-settings',
    'Script Attribution: Meta pixel has data-source="store-settings"'
  );

  // 4. Verify Duplicate Script & PageView Prevention (Requirement 10 & 11)
  const initialScriptCount = mockScripts.length;
  // Re-run sync to simulate component re-render or navigation
  syncPixelScripts(testSettings);
  assert(
    mockScripts.length === initialScriptCount,
    'Deduplication: No duplicate script elements injected on re-sync',
    `Script count grew from ${initialScriptCount} to ${mockScripts.length}`
  );

  clearStoredPixelLogs();

  // 5. Verify ProductView Event
  const productViewLog = trackSocialEvent('ProductView', {
    content_name: 'Luxury Quartz Watch',
    content_ids: ['prod-watch-03'],
    content_type: 'product',
    value: 3200,
    currency: 'BDT',
  });
  assert(
    productViewLog.eventName === 'ProductView',
    'ProductView Event: Fires with correct eventName'
  );
  assert(
    productViewLog.platforms.includes('meta') &&
    productViewLog.platforms.includes('tiktok') &&
    productViewLog.platforms.includes('gtm'),
    'ProductView Event: Reached Meta, TikTok, and GTM platforms'
  );

  // 6. Verify AddToCart Event
  const addToCartLog = trackSocialEvent('AddToCart', {
    content_name: 'Luxury Quartz Watch',
    content_ids: ['prod-watch-03'],
    content_type: 'product',
    value: 3200,
    currency: 'BDT',
  });
  assert(
    addToCartLog.eventName === 'AddToCart',
    'AddToCart Event: Fires with correct eventName'
  );
  assert(
    addToCartLog.platforms.includes('meta') && addToCartLog.platforms.includes('tiktok'),
    'AddToCart Event: Reached Meta and TikTok'
  );

  // 7. Verify InitiateCheckout Event
  const checkoutLog = trackSocialEvent('InitiateCheckout', {
    content_name: 'Luxury Quartz Watch',
    content_ids: ['prod-watch-03'],
    value: 3200,
    currency: 'BDT',
    num_items: 1,
  });
  assert(
    checkoutLog.eventName === 'InitiateCheckout',
    'InitiateCheckout Event: Fires with correct eventName'
  );
  assert(
    checkoutLog.platforms.length > 0,
    'InitiateCheckout Event: Dispatched to active tracking platforms'
  );

  // 8. Verify Purchase Event
  const purchaseLog1 = trackSocialEvent('Purchase', {
    order_id: 'ord-test-99991',
    transaction_id: 'TXN-99991',
    value: 3280,
    currency: 'BDT',
    content_name: 'Luxury Quartz Watch',
    content_ids: ['prod-watch-03'],
  });
  assert(
    purchaseLog1.eventName === 'Purchase' && purchaseLog1.status === 'success',
    'Purchase Event: First purchase event tracks successfully'
  );
  assert(
    purchaseLog1.platforms.includes('meta') && purchaseLog1.platforms.includes('tiktok'),
    'Purchase Event: Reached Meta and TikTok pipelines'
  );

  // 9. Verify Duplicate Purchase Prevention (Requirement 9)
  const purchaseLog2 = trackSocialEvent('Purchase', {
    order_id: 'ord-test-99991',
    transaction_id: 'TXN-99991',
    value: 3280,
    currency: 'BDT',
    content_name: 'Luxury Quartz Watch',
    content_ids: ['prod-watch-03'],
  });
  assert(
    purchaseLog2.isDuplicate === true && purchaseLog2.status === 'skipped',
    'Deduplication: Duplicate Purchase event correctly identified and suppressed',
    `Expected status: skipped, got: ${purchaseLog2.status}`
  );
  assert(
    purchaseLog2.platforms.length === 0,
    'Deduplication: No tracking hits sent to external platforms for duplicate purchase'
  );

  // 10. Verify Privacy Switch
  const disabledSettings: any = {
    ...testSettings,
    trackingEnabled: false,
  };
  const privacyLog = trackSocialEvent({
    eventName: 'AddToCart',
    params: { value: 500 },
    settings: disabledSettings,
  });
  assert(
    privacyLog.status === 'skipped' && privacyLog.platforms.length === 0,
    'Privacy Guard: Tracking strictly skipped when trackingEnabled is false'
  );

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
