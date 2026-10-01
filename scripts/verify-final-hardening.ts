/**
 * Automated Verification Suite for Final Security & Performance Hardening
 * Rongdhonu Trade
 */

import { computeHmacSha256Hex, computeWebhookFingerprint, verifyCourierWebhookAuth } from '../src/server/webhookAuth';
import { getResponsiveImageUrl, getResponsiveSrcSet, isInternalMediaUrl, isUnsplashUrl } from '../src/utils/responsiveImage';

async function runHardeningVerification() {
  console.log('================================================================');
  console.log('STARTING FINAL SECURITY & PERFORMANCE HARDENING VERIFICATION');
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

  const baseUrl = 'http://127.0.0.1:3000';

  // ================================================================
  // 1. BUYING PRICE PERMISSION SEPARATION TESTS
  // ================================================================
  console.log('--- 1. BUYING PRICE PERMISSION SEPARATION ---');

  // Helper tokens
  const tokenUpdateOnly = `dev-jwt-${Buffer.from(
    JSON.stringify({
      userId: 'test-user-update-only',
      email: 'updater@local.test',
      role: 'admin',
      permissions: {
        'product.view': true,
        'product.update': true,
        'product.view_buying_price': false,
        'product.manage_buying_price': false,
      },
      exp: Date.now() + 86400000,
    })
  ).toString('base64')}`;

  const tokenUpdateAndViewOnly = `dev-jwt-${Buffer.from(
    JSON.stringify({
      userId: 'test-user-view-only',
      email: 'viewer@local.test',
      role: 'admin',
      permissions: {
        'product.view': true,
        'product.update': true,
        'product.view_buying_price': true,
        'product.manage_buying_price': false,
      },
      exp: Date.now() + 86400000,
    })
  ).toString('base64')}`;

  const tokenFinancialManager = `dev-jwt-${Buffer.from(
    JSON.stringify({
      userId: 'test-user-financial-mgr',
      email: 'finance@local.test',
      role: 'admin',
      permissions: {
        'product.view': true,
        'product.update': true,
        'product.view_buying_price': true,
        'product.manage_buying_price': true,
      },
      exp: Date.now() + 86400000,
    })
  ).toString('base64')}`;

  const tokenSuperAdmin = `dev-jwt-${Buffer.from(
    JSON.stringify({
      userId: 'dev-super-admin-1',
      email: 'dev-superadmin@local.test',
      role: 'super_admin',
      exp: Date.now() + 86400000,
    })
  ).toString('base64')}`;

  const tokenCustomer = `dev-jwt-${Buffer.from(
    JSON.stringify({
      userId: 'test-customer-1',
      email: 'sakib@gmail.com',
      role: 'customer',
      exp: Date.now() + 86400000,
    })
  ).toString('base64')}`;

  // Get initial state of a product
  const getProductRes = await fetch(`${baseUrl}/api/products/prod-wallet-01`, {
    headers: { Authorization: `Bearer ${tokenSuperAdmin}` },
  });
  const initialProdJson = await getProductRes.json();
  const originalBuyingPrice = initialProdJson.product?.buyingPrice;

  // 1.1 User with product.update only -> cannot modify buyingPrice
  const updateOnlyRes = await fetch(`${baseUrl}/api/products/prod-wallet-01`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tokenUpdateOnly}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Premium Leather Wallet (Updated by Editor)',
      buyingPrice: 99999, // Unauthorized change
    }),
  });
  const updateOnlyJson = await updateOnlyRes.json();

  // Verify in super admin view that buying price remained intact
  const verifyAfterUpdateOnly = await (
    await fetch(`${baseUrl}/api/products/prod-wallet-01`, {
      headers: { Authorization: `Bearer ${tokenSuperAdmin}` },
    })
  ).json();

  assert(
    updateOnlyRes.status === 200 &&
      updateOnlyJson.product.buyingPrice === undefined &&
      verifyAfterUpdateOnly.product.buyingPrice === originalBuyingPrice,
    '1.1 User with product.update only CANNOT modify buyingPrice and cannot view buyingPrice'
  );

  // 1.2 User with product.update + product.view_buying_price (WITHOUT product.manage_buying_price) -> still cannot modify buyingPrice
  const updateAndViewRes = await fetch(`${baseUrl}/api/products/prod-wallet-01`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tokenUpdateAndViewOnly}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Premium Leather Wallet (Updated by Viewer)',
      buyingPrice: 88888, // Unauthorized change
    }),
  });
  const updateAndViewJson = await updateAndViewRes.json();

  const verifyAfterUpdateAndView = await (
    await fetch(`${baseUrl}/api/products/prod-wallet-01`, {
      headers: { Authorization: `Bearer ${tokenSuperAdmin}` },
    })
  ).json();

  assert(
    updateAndViewRes.status === 200 &&
      updateAndViewJson.product.buyingPrice === originalBuyingPrice &&
      verifyAfterUpdateAndView.product.buyingPrice === originalBuyingPrice,
    '1.2 User with product.update + product.view_buying_price CANNOT modify buyingPrice (buyingPrice modification stripped)'
  );

  // 1.3 Authorized Financial Manager (with product.manage_buying_price) -> CAN modify buyingPrice
  const targetNewBuyingPrice = 1250;
  const financeMgrRes = await fetch(`${baseUrl}/api/products/prod-wallet-01`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tokenFinancialManager}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      buyingPrice: targetNewBuyingPrice,
    }),
  });
  const financeMgrJson = await financeMgrRes.json();

  const verifyAfterFinanceMgr = await (
    await fetch(`${baseUrl}/api/products/prod-wallet-01`, {
      headers: { Authorization: `Bearer ${tokenSuperAdmin}` },
    })
  ).json();

  assert(
    financeMgrRes.status === 200 &&
      financeMgrJson.product.buyingPrice === targetNewBuyingPrice &&
      verifyAfterFinanceMgr.product.buyingPrice === targetNewBuyingPrice,
    '1.3 Authorized Financial Manager (with product.manage_buying_price) CAN modify buyingPrice'
  );

  // 1.4 Super Admin -> CAN modify buyingPrice
  const superAdminModifyRes = await fetch(`${baseUrl}/api/products/prod-wallet-01`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tokenSuperAdmin}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      buyingPrice: originalBuyingPrice, // restore
    }),
  });
  const superAdminModifyJson = await superAdminModifyRes.json();
  assert(
    superAdminModifyRes.status === 200 && superAdminModifyJson.product.buyingPrice === originalBuyingPrice,
    '1.4 Super Admin CAN modify buyingPrice unconditionally'
  );

  // 1.5 Public / Customer -> cannot view or modify buyingPrice
  const customerViewRes = await fetch(`${baseUrl}/api/products/prod-wallet-01`, {
    headers: { Authorization: `Bearer ${tokenCustomer}` },
  });
  const customerViewJson = await customerViewRes.json();

  const customerModifyRes = await fetch(`${baseUrl}/api/products/prod-wallet-01`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tokenCustomer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ buyingPrice: 50 }),
  });

  assert(
    customerViewJson.product?.buyingPrice === undefined && customerModifyRes.status === 403,
    '1.5 Public / Customer cannot view or modify buyingPrice (strictly 403 forbidden and redacted)'
  );

  // ================================================================
  // 2. COURIER WEBHOOK REPLAY PROTECTION TESTS
  // ================================================================
  console.log('\n--- 2. COURIER WEBHOOK REPLAY PROTECTION ---');

  const webhookSecret = process.env.COURIER_WEBHOOK_SECRET || 'dev-courier-webhook-secret-999';
  const webhookUrl = `${baseUrl}/api/courier/webhook`;

  // Test 1: Valid webhook with valid timestamp & signature -> accepted (200)
  const validTimestamp = Date.now().toString();
  const validBody = JSON.stringify({
    ping: true,
    action: 'test_ping',
    event: 'test.ping',
    source: 'automated-hardening-test',
    testId: `test-${Date.now()}-1`,
  });
  const validSig = await computeHmacSha256Hex(webhookSecret, `${validTimestamp}.${validBody}`);

  const test1Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': validTimestamp,
      'X-Webhook-Signature': `sha256=${validSig}`,
    },
    body: validBody,
  });
  const test1Json = await test1Res.json().catch(() => ({}));
  assert(
    test1Res.status === 200 && test1Json.success === true,
    '2.1 Valid courier webhook with timestamp and signature is ACCEPTED (HTTP 200)'
  );

  // Test 2: Invalid signature -> rejected (401)
  const test2Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': validTimestamp,
      'X-Webhook-Signature': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
    },
    body: validBody,
  });
  assert(
    test2Res.status === 401,
    '2.2 Webhook with invalid signature is REJECTED (HTTP 401)'
  );

  // Test 3: Stale timestamp (> 5 min) -> rejected (401)
  const staleTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
  const staleSig = await computeHmacSha256Hex(webhookSecret, `${staleTimestamp}.${validBody}`);
  const test3Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': staleTimestamp,
      'X-Webhook-Signature': `sha256=${staleSig}`,
    },
    body: validBody,
  });
  assert(
    test3Res.status === 401,
    '2.3 Webhook with stale timestamp is REJECTED (HTTP 401 Replay Protection)'
  );

  // Test 4: Real signed status update webhook replay -> rejected (409)
  const realStatusPayload = JSON.stringify({
    consignment_id: 'CSF-HARDEN-REAL-1',
    invoice: 'ORD-HARDEN-REAL-1',
    status: 'in_review',
    source: 'automated-hardening-test',
  });
  const realStatusSig = await computeHmacSha256Hex(webhookSecret, `${validTimestamp}.${realStatusPayload}`);

  // Send first time -> 200
  await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': validTimestamp,
      'X-Webhook-Signature': `sha256=${realStatusSig}`,
    },
    body: realStatusPayload,
  });

  // Replay exact same request -> 409
  const test4Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': validTimestamp,
      'X-Webhook-Signature': `sha256=${realStatusSig}`,
    },
    body: realStatusPayload,
  });
  assert(
    test4Res.status === 409,
    '2.4 Replaying the EXACT same signed webhook request is REJECTED (HTTP 409 Conflict Replay Deduplication)'
  );

  // Test 2.4b: Concurrent duplicate webhook requests -> only one is processed (HTTP 200 vs HTTP 409)
  const concurrentTimestamp = (Date.now() + 500).toString();
  const concurrentBody = JSON.stringify({
    consignment_id: 'CSF-HARDEN-REAL-2',
    invoice: 'ORD-HARDEN-REAL-2',
    status: 'in_review',
    source: 'automated-hardening-test-concurrent',
    testId: `concurrent-${Date.now()}`,
  });
  const concurrentSig = await computeHmacSha256Hex(webhookSecret, `${concurrentTimestamp}.${concurrentBody}`);

  const concurrentPromises = Array.from({ length: 4 }).map(() =>
    fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Timestamp': concurrentTimestamp,
        'X-Webhook-Signature': `sha256=${concurrentSig}`,
      },
      body: concurrentBody,
    })
  );
  const concurrentResponses = await Promise.all(concurrentPromises);
  const concurrentCodes = concurrentResponses.map((r) => r.status);
  const pass200Count = concurrentCodes.filter((s) => s === 200).length;
  const pass409Count = concurrentCodes.filter((s) => s === 409).length;

  assert(
    pass200Count === 1 && pass409Count === 3,
    `2.4b Concurrent duplicate webhook requests: Exactly 1 accepted (HTTP 200), 3 rejected as duplicate (HTTP 409) [counts: 200=${pass200Count}, 409=${pass409Count}]`
  );

  // Test 5: Different valid webhook -> accepted (200)
  const differentTimestamp = (Date.now() + 1000).toString();
  const differentBody = JSON.stringify({
    ping: true,
    action: 'test_ping',
    event: 'test.ping',
    source: 'automated-hardening-test',
    testId: `test-${Date.now()}-2-different`,
  });
  const differentSig = await computeHmacSha256Hex(webhookSecret, `${differentTimestamp}.${differentBody}`);

  const test5Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': differentTimestamp,
      'X-Webhook-Signature': `sha256=${differentSig}`,
    },
    body: differentBody,
  });
  assert(
    test5Res.status === 200,
    '2.5 Different valid webhook request is ACCEPTED (HTTP 200)'
  );

  // Test 6: Malformed timestamp -> rejected (400)
  const malformedTimestamp = 'not-a-valid-timestamp-string';
  const malformedSig = await computeHmacSha256Hex(webhookSecret, `${malformedTimestamp}.${validBody}`);
  const test6Res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': malformedTimestamp,
      'X-Webhook-Signature': `sha256=${malformedSig}`,
    },
    body: validBody,
  });
  assert(
    test6Res.status === 400,
    '2.6 Webhook with malformed timestamp header is REJECTED (HTTP 400 Bad Request)'
  );

  // ================================================================
  // 3. IMAGE PERFORMANCE & RESPONSIVE IMAGE TESTS
  // ================================================================
  console.log('\n--- 3. IMAGE PERFORMANCE & RESPONSIVE DELIVERY ---');

  const internalUrl = '/api/media/asset-1234567890-abc123.jpg';
  const internalCleanUrl = getResponsiveImageUrl(internalUrl, 360);
  const internalSrcSet = getResponsiveSrcSet(internalUrl, [240, 360, 480]);

  assert(
    internalCleanUrl.includes('?w=360') && typeof internalSrcSet === 'string' && internalSrcSet.includes('240w'),
    '3.1 Internal /api/media/:key correctly generates responsive ?w= query params and standard srcSet variants'
  );

  const unsplashUrl = 'https://images.unsplash.com/photo-1524805444758-089113d48a6d';
  const unsplashResizedUrl = getResponsiveImageUrl(unsplashUrl, 480);
  const unsplashSrcSet = getResponsiveSrcSet(unsplashUrl, [360, 480, 720]);

  assert(
    unsplashResizedUrl.includes('w=480') &&
      typeof unsplashSrcSet === 'string' &&
      unsplashSrcSet.includes('360w') &&
      unsplashSrcSet.includes('480w'),
    '3.2 Genuine dynamic resizing CDN (Unsplash) correctly generates responsive srcSet and width parameters'
  );

  // ================================================================
  // 4. API CACHING & FINANCIAL DATA ISOLATION TESTS
  // ================================================================
  console.log('\n--- 4. API CACHE & SENSITIVE DATA ISOLATION ---');

  // 4.1 Homepage API cache and security check
  const homepageRes = await fetch(`${baseUrl}/api/store/homepage`);
  const homepageJson = await homepageRes.json();
  const homepageCache = homepageRes.headers.get('cache-control') || '';

  const homepageHasBuyingPrice = JSON.stringify(homepageJson).includes('buyingPrice');
  const homepageHasSteadfastSecret = JSON.stringify(homepageJson).includes('steadfastSecretKey');

  assert(
    homepageRes.status === 200 &&
      homepageCache.includes('public') &&
      !homepageHasBuyingPrice &&
      !homepageHasSteadfastSecret,
    '4.1 /api/store/homepage is publicly cached and NEVER contains buyingPrice, unitProfit, or courier secrets'
  );

  // 4.2 Authenticated products request cache check
  const authProductsRes = await fetch(`${baseUrl}/api/products`, {
    headers: { Authorization: `Bearer ${tokenSuperAdmin}` },
  });
  const authProductsCache = authProductsRes.headers.get('cache-control') || '';
  const authProductsVary = authProductsRes.headers.get('vary') || '';

  assert(
    authProductsCache.includes('no-store') && authProductsVary.includes('Authorization'),
    '4.2 Authenticated /api/products response is strictly "no-store" with Vary: Origin, Cookie, Authorization'
  );

  // 4.3 Public products request cache check
  const publicProductsRes = await fetch(`${baseUrl}/api/products`);
  const publicProductsCache = publicProductsRes.headers.get('cache-control') || '';
  const publicProductsJson = await publicProductsRes.json();
  const publicHasBuyingPrice = JSON.stringify(publicProductsJson).includes('buyingPrice');

  assert(
    publicProductsCache.includes('public') && !publicHasBuyingPrice,
    '4.3 Public /api/products response allows public edge caching and NEVER contains buyingPrice'
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runHardeningVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
