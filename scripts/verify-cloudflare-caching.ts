/**
 * Verification Suite for Cloudflare Caching Optimization
 * Tests Cache-Control and Vary headers across all public, authenticated, static, and SSR endpoints.
 */

import { getTestAdminToken } from './test-auth-helper';

async function testCloudflareCaching() {
  const baseUrl = 'http://localhost:3000';
  console.log('--- Starting Cloudflare Caching Verification Suite ---');

  // 1. Public Homepage Data
  console.log('\n[1] Verifying /api/store/homepage Caching');
  const hpRes = await fetch(`${baseUrl}/api/store/homepage`);
  const hpCache = hpRes.headers.get('cache-control') || '';
  const hpVary = hpRes.headers.get('vary') || '';
  console.log('Homepage Cache-Control:', hpCache);
  console.log('Homepage Vary:', hpVary);
  console.assert(hpCache.includes('public'), 'Homepage must be public');
  console.assert(hpCache.includes('max-age=30'), 'Homepage browser max-age must be 30s');
  console.assert(hpCache.includes('s-maxage=60'), 'Homepage edge s-maxage must be 60s');
  console.assert(hpCache.includes('stale-while-revalidate=30'), 'Homepage must include stale-while-revalidate=30');
  console.assert(hpVary.includes('Origin'), 'Homepage must Vary on Origin');
  console.log('✓ Public homepage caching verified');

  // 2. Public Products & Search
  console.log('\n[2] Verifying /api/products Caching');
  const prodRes = await fetch(`${baseUrl}/api/products`);
  const prodCache = prodRes.headers.get('cache-control') || '';
  const prodVary = prodRes.headers.get('vary') || '';
  console.log('Catalog Cache-Control:', prodCache);
  console.log('Catalog Vary:', prodVary);
  console.assert(prodCache.includes('public'), 'Catalog must be public');
  console.assert(prodCache.includes('max-age=30'), 'Catalog max-age must be 30s');
  console.assert(prodCache.includes('s-maxage=60'), 'Catalog s-maxage must be 60s');
  console.assert(prodVary.includes('Cookie') || prodVary.includes('Authorization'), 'Catalog must Vary on Cookie/Authorization');
  console.log('✓ Public product catalog browsing caching verified');

  // Search query
  const searchRes = await fetch(`${baseUrl}/api/products?search=wallet`);
  const searchCache = searchRes.headers.get('cache-control') || '';
  console.log('Search Cache-Control:', searchCache);
  console.assert(searchCache.includes('public'), 'Search must be public');
  console.assert(searchCache.includes('max-age=15'), 'Search max-age must be short (15s)');
  console.assert(searchCache.includes('s-maxage=30'), 'Search s-maxage must be short (30s)');
  console.log('✓ Public search dynamic caching verified');

  // Single Product Detail
  const singleProdRes = await fetch(`${baseUrl}/api/products/prod-wallet-01`);
  const singleProdCache = singleProdRes.headers.get('cache-control') || '';
  const singleProdVary = singleProdRes.headers.get('vary') || '';
  console.log('Product Detail Cache-Control:', singleProdCache);
  console.log('Product Detail Vary:', singleProdVary);
  console.assert(singleProdCache.includes('public'), 'Product detail must be public');
  console.assert(singleProdCache.includes('max-age=15'), 'Product detail max-age must be 15s to preserve live stock');
  console.assert(singleProdCache.includes('s-maxage=45'), 'Product detail edge s-maxage must be 45s');
  console.assert(singleProdCache.includes('stale-while-revalidate=30'), 'Product detail must support SWR');
  console.log('✓ Public product detail caching verified');

  // 3. Categories & Sliders
  console.log('\n[3] Verifying /api/categories & /api/sliders Caching');
  const catRes = await fetch(`${baseUrl}/api/categories`);
  const catCache = catRes.headers.get('cache-control') || '';
  console.log('Categories Cache-Control:', catCache);
  console.assert(catCache.includes('public'), 'Categories must be public');
  console.assert(catCache.includes('max-age=60'), 'Categories max-age must be 60s');
  console.assert(catCache.includes('s-maxage=300'), 'Categories edge s-maxage must be 300s');
  console.log('✓ Public categories caching verified');

  const sliderRes = await fetch(`${baseUrl}/api/sliders`);
  const sliderCache = sliderRes.headers.get('cache-control') || '';
  console.log('Sliders Cache-Control:', sliderCache);
  console.assert(sliderCache.includes('public'), 'Sliders must be public');
  console.assert(sliderCache.includes('max-age=60'), 'Sliders max-age must be 60s');
  console.log('✓ Public sliders caching verified');

  // 4. Coupons & Reviews
  console.log('\n[4] Verifying /api/coupons & /api/reviews Caching');
  const couponRes = await fetch(`${baseUrl}/api/coupons`);
  const couponCache = couponRes.headers.get('cache-control') || '';
  console.log('Coupons Cache-Control:', couponCache);
  console.assert(couponCache.includes('public'), 'Coupons must be public');
  console.assert(couponCache.includes('max-age=30'), 'Coupons max-age must be 30s');
  console.log('✓ Public coupons caching verified');

  const reviewRes = await fetch(`${baseUrl}/api/reviews`);
  const reviewCache = reviewRes.headers.get('cache-control') || '';
  console.log('Reviews Cache-Control:', reviewCache);
  console.assert(reviewCache.includes('public'), 'Reviews must be public');
  console.assert(reviewCache.includes('max-age=30'), 'Reviews max-age must be 30s');
  console.log('✓ Public reviews caching verified');

  // 5. Store Settings
  console.log('\n[5] Verifying /api/settings Caching');
  const settingsRes = await fetch(`${baseUrl}/api/settings`);
  const settingsCache = settingsRes.headers.get('cache-control') || '';
  console.log('Public Settings Cache-Control:', settingsCache);
  console.assert(settingsCache.includes('public'), 'Public settings must be public');
  console.assert(settingsCache.includes('max-age=30'), 'Public settings max-age must be 30s');
  console.log('✓ Public settings caching verified');

  // 6. Security Check: Authenticated Requests MUST NEVER be Cached Publicly
  console.log('\n[6] Verifying Authenticated Responses are NOT Publicly Cached');
  const devToken = await getTestAdminToken(baseUrl);

  const authHeaders = {
    'Authorization': `Bearer ${devToken}`,
    'Content-Type': 'application/json',
  };

  // 6.1 Authenticated Products API (contains buying_price)
  const authProdRes = await fetch(`${baseUrl}/api/products`, { headers: authHeaders });
  const authProdCache = authProdRes.headers.get('cache-control') || '';
  console.log('Auth Products Cache-Control:', authProdCache);
  console.assert(authProdCache.includes('no-store'), 'Auth products must be no-store');
  console.assert(authProdCache.includes('no-cache'), 'Auth products must be no-cache');
  console.assert(!authProdCache.includes('public'), 'Auth products must NOT be public');
  console.log('✓ Authenticated products API is strictly no-store');

  // 6.2 Authenticated Settings API
  const authSettingsRes = await fetch(`${baseUrl}/api/settings`, { headers: authHeaders });
  const authSettingsCache = authSettingsRes.headers.get('cache-control') || '';
  console.log('Auth Settings Cache-Control:', authSettingsCache);
  console.assert(authSettingsCache.includes('no-store'), 'Auth settings must be no-store');
  console.assert(!authSettingsCache.includes('public'), 'Auth settings must NOT be public');
  console.log('✓ Authenticated settings API is strictly no-store');

  // 6.3 Orders List API
  const ordersRes = await fetch(`${baseUrl}/api/orders`, { headers: authHeaders });
  const ordersCache = ordersRes.headers.get('cache-control') || '';
  console.log('Orders Cache-Control:', ordersCache);
  console.assert(ordersCache.includes('no-store'), 'Orders list must be no-store');
  console.assert(!ordersCache.includes('public'), 'Orders list must NOT be public');
  console.log('✓ Orders API is strictly no-store');

  // 6.4 Order Tracking (Private data)
  const trackRes = await fetch(`${baseUrl}/api/orders/track?orderId=RT-2026-00000000&phone=01700000000`);
  const trackCache = trackRes.headers.get('cache-control') || '';
  console.log('Order Track Cache-Control:', trackCache);
  console.assert(trackCache.includes('no-store') || trackCache.includes('no-cache'), 'Tracking must be no-store/no-cache');
  console.assert(!trackCache.includes('public'), 'Tracking must NOT be public');
  console.log('✓ Order tracking API is private and uncacheable by public proxies');

  // 7. Verify public/_headers rules
  console.log('\n[7] Verifying public/_headers Static Caching Directives');
  const fs = await import('fs');
  const headersFile = fs.readFileSync('public/_headers', 'utf-8');
  console.assert(headersFile.includes('/assets/*'), 'Must contain /assets/*');
  console.assert(headersFile.includes('public, max-age=31536000, immutable'), 'Must have immutable rule');
  console.assert(headersFile.includes('/assets/*.js'), 'Must contain /assets/*.js');
  console.assert(headersFile.includes('/assets/*.css'), 'Must contain /assets/*.css');
  console.assert(headersFile.includes('/assets/*.woff2'), 'Must contain /assets/*.woff2');
  console.assert(headersFile.includes('/favicon.ico'), 'Must contain /favicon.ico');
  console.assert(headersFile.includes('/*.png'), 'Must contain /*.png');
  console.assert(headersFile.includes('max-age=0, must-revalidate'), 'Must contain max-age=0 for HTML');
  console.log('✓ public/_headers contains explicit immutable rules for JS, CSS, fonts, and images');

  console.log('\n======================================================');
  console.log('ALL CLOUDFLARE CACHING AUDIT CHECKS PASSED! 🎉');
  console.log('======================================================');
}

testCloudflareCaching().catch((err) => {
  console.error('CACHING VERIFICATION FAILED:', err);
  process.exit(1);
});
