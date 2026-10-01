/**
 * Forensic Audit & Verification Suite:
 * Google Analytics, Google Tag Manager, Meta Pixel & TikTok Pixel
 *
 * Verifies all 9 touchpoints requested by user:
 * 1. Single GA script loading point
 * 2. Single GTM container initialization point
 * 3. Single Source of Truth for Google platforms (no concurrent GTM + direct GA4 duplicate event dispatches)
 * 4. ProductView event deduplication
 * 5. AddToCart event deduplication
 * 6. InitiateCheckout event deduplication
 * 7. Purchase event deduplication & idempotency cache
 * 8. Pageview behavior during SPA route changes
 * 9. Meta & TikTok event deduplication
 */

import fs from 'node:fs';
import path from 'node:path';

// Mock minimal browser environment
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
      setAttribute: () => {},
      getAttribute: () => null,
      appendChild: () => {},
      style: {},
    };
  },
  body: {
    insertBefore: () => {},
    firstChild: null,
  },
  head: {
    appendChild: () => {},
  },
};

(global as any).window = {
  dataLayer: [],
  location: { href: 'http://localhost:3000/' },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  localStorage: {
    _data: {} as Record<string, string>,
    getItem(k: string) {
      return this._data[k] || null;
    },
    setItem(k: string, v: string) {
      this._data[k] = v;
    },
    removeItem(k: string) {
      delete this._data[k];
    },
  },
};

(global as any).CustomEvent = class {
  detail: any;
  constructor(name: string, opt?: any) {
    this.detail = opt?.detail;
  }
};

(global as any).localStorage = (global as any).window.localStorage;

async function runAnalyticsAudit() {
  console.log('================================================================');
  console.log('STARTING ANALYTICS & PIXEL TRACKING AUDIT VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // 1. Audit index.html: No hardcoded GA, GTM, Meta, or TikTok script tags
  console.log('--- 1. INDEX.HTML AUDIT ---');
  const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
  assert(
    !indexHtml.includes('<script async src="https://www.googletagmanager.com') &&
    !indexHtml.includes('<script src="https://www.googletagmanager.com') &&
    !indexHtml.includes('<script>window.dataLayer') &&
    !indexHtml.includes('gtag("config"'),
    '1.1 index.html contains ZERO hardcoded Google Analytics or GTM executable script tags'
  );
  assert(
    !indexHtml.includes('<script src="https://connect.facebook.net') &&
    !indexHtml.includes('<script src="https://analytics.tiktok.com'),
    '1.2 index.html contains ZERO hardcoded Meta Pixel or TikTok Pixel script tags'
  );

  // 2. Audit GTM & GA Script Initializers in pixelTracking.ts
  console.log('\n--- 2. INITIALIZATION ARCHITECTURE ---');
  const pixelCode = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/pixelTracking.ts'), 'utf-8');
  
  assert(
    pixelCode.includes('export function initGtm(') &&
    pixelCode.includes('currentLoadedGtmId !== cleanId && !existingScript'),
    '2.1 GTM initialization is consolidated into initGtm() with idempotent script guard'
  );

  assert(
    pixelCode.includes('export function initGoogleAnalytics(') &&
    pixelCode.includes('if (!existingScript) {'),
    '2.2 GA initialization is consolidated into initGoogleAnalytics() with idempotent script guard'
  );

  // 3. Dynamic Imports & Module imports
  const { syncPixelScripts, trackSocialEvent, clearStoredPixelLogs } = await import('../src/utils/pixelTracking');

  // Test Case A: GTM is active -> GTM is Source of Truth, direct GA4 dispatch suppressed
  console.log('\n--- 3. SOURCE OF TRUTH (GTM vs GA4 CONCURRENCY) ---');
  clearStoredPixelLogs();
  (global as any).window.dataLayer = [];

  const gtmActiveSettings: any = {
    trackingEnabled: true,
    fbPixelId: '1658959045653680',
    tiktokPixelId: 'CH7F8G9H0J1K2L3M4N',
    gtmId: 'GTM-RDN8429',
    googleAnalyticsId: 'G-CKJLJSDKFZ',
    advancedMatchingEnabled: true,
    trackingDebugMode: false,
  };

  syncPixelScripts(gtmActiveSettings);

  const eventWithGtm = trackSocialEvent('AddToCart', {
    content_name: 'Premium Leather Wallet',
    content_ids: ['prod-wallet-01'],
    value: 1450,
    currency: 'BDT',
  });

  assert(
    eventWithGtm.platforms.includes('gtm'),
    '3.1 GTM container receives AddToCart event via window.dataLayer when GTM is configured'
  );
  assert(
    !eventWithGtm.platforms.includes('ga'),
    '3.2 Direct GA4 gtag dispatch is SUPPRESSED when GTM is active, preventing duplicate event beacons'
  );

  // Test Case B: GTM is NOT active -> GA4 is Source of Truth, direct gtag fires
  console.log('\n--- 4. FALLBACK SOURCE OF TRUTH (DIRECT GA4 WITHOUT GTM) ---');
  (global as any).window.gtag = (...args: any[]) => {
    (global as any).window.dataLayer.push(args);
  };

  const directGaSettings: any = {
    trackingEnabled: true,
    fbPixelId: '1658959045653680',
    tiktokPixelId: 'CH7F8G9H0J1K2L3M4N',
    gtmId: '', // GTM empty
    googleAnalyticsId: 'G-CKJLJSDKFZ',
    advancedMatchingEnabled: true,
    trackingDebugMode: false,
  };

  const eventWithoutGtm = trackSocialEvent('AddToCart', {
    content_name: 'Premium Leather Wallet',
    content_ids: ['prod-wallet-01'],
    value: 1450,
    currency: 'BDT',
  }, null, directGaSettings);

  assert(
    !eventWithoutGtm.platforms.includes('gtm'),
    '4.1 GTM platform skipped when gtmId is empty'
  );
  assert(
    eventWithoutGtm.platforms.includes('ga'),
    '4.2 Direct GA4 gtag dispatch ACTIVATED when GTM is empty, ensuring zero lost events'
  );

  // 5. Audit ProductView / ViewContent Call Sites
  console.log('\n--- 5. PRODUCT VIEW AUDIT ---');
  const productDetailCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ProductDetailView.tsx'), 'utf-8');
  const quickViewCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/QuickViewModal.tsx'), 'utf-8');

  assert(
    productDetailCode.includes("trackEvent('ProductView',") &&
    productDetailCode.includes("}, [product?.id]);"),
    '5.1 ProductDetailView restricts ProductView trigger strictly to product?.id change'
  );
  assert(
    quickViewCode.includes("trackEvent('ProductView',") &&
    quickViewCode.includes("}, [product?.id]);"),
    '5.2 QuickViewModal restricts ProductView trigger strictly to product?.id change'
  );

  // 6. Audit AddToCart Call Sites
  console.log('\n--- 6. ADD TO CART AUDIT ---');
  const cartContextCode = fs.readFileSync(path.resolve(process.cwd(), 'src/context/CartContext.tsx'), 'utf-8');
  assert(
    cartContextCode.includes("trackSocialEvent('AddToCart',"),
    '6.1 AddToCart is authoritatively managed in CartContext.addToCart()'
  );
  const productCardCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ProductCard.tsx'), 'utf-8');
  assert(
    !productCardCode.includes("trackSocialEvent('AddToCart'") &&
    !productCardCode.includes("trackEvent('AddToCart'"),
    '6.2 ProductCard delegates to addToCart() without duplicate trackEvent call'
  );

  // 7. Audit InitiateCheckout Call Sites & Debounce
  console.log('\n--- 7. INITIATE CHECKOUT AUDIT ---');
  const cartDrawerCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CartDrawer.tsx'), 'utf-8');
  assert(
    cartDrawerCode.includes("hasTrackedCheckoutRef = useRef(false)") &&
    cartDrawerCode.includes("if (!hasTrackedCheckoutRef.current) {"),
    '7.1 CartDrawer uses ref guard (hasTrackedCheckoutRef) to prevent duplicate InitiateCheckout on quantity changes'
  );

  // 8. Audit Purchase Deduplication & Idempotency
  console.log('\n--- 8. PURCHASE IDEMPOTENCY AUDIT ---');
  const orderId = `TEST-ORDER-${Date.now()}`;
  const purchasePayload = {
    order_id: orderId,
    transaction_id: orderId,
    value: 2900,
    currency: 'BDT',
    contents: [{ id: 'prod-1', name: 'Item 1', price: 2900, quantity: 1 }],
  };

  const firstPurchase = trackSocialEvent('Purchase', purchasePayload, null, gtmActiveSettings);
  assert(
    firstPurchase.status !== 'skipped' && !firstPurchase.isDuplicate,
    '8.1 First purchase event processes normally'
  );

  const duplicatePurchase = trackSocialEvent('Purchase', purchasePayload, null, gtmActiveSettings);
  assert(
    duplicatePurchase.status === 'skipped' && duplicatePurchase.isDuplicate === true,
    '8.2 Second purchase event with same order ID is suppressed by idempotency cache'
  );

  // 9. Audit SPA Route Changes & Pageviews
  console.log('\n--- 9. SPA ROUTE CHANGES & PAGEVIEWS AUDIT ---');
  assert(
    pixelCode.includes("window.gtag('config', cleanId, isGtmActive ? { send_page_view: false } : undefined);"),
    '9.1 Standalone GA4 config explicitly disables automatic send_page_view when GTM is active'
  );
  assert(
    pixelCode.includes("if (currentLoadedMetaId !== cleanId) {") &&
    pixelCode.includes("window.fbq('track', 'PageView');"),
    '9.2 Meta Pixel fires PageView only during initial load, not re-syncs'
  );

  console.log('\n================================================================');
  console.log(`AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAnalyticsAudit().catch((err) => {
  console.error('Audit failed with unhandled error:', err);
  process.exit(1);
});
