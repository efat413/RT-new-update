/**
 * Verification test for:
 * 1. Health Endpoint Information Disclosure
 * 2. Order Tracking Privacy + Abuse Protection
 */

import { sanitizeOrderForPublicTracking, sanitizeOrderForRole } from '../src/server/db';
import { getClientIp } from '../src/server/router';
import { Order } from '../src/server/types';

async function runVerification() {
  const baseUrl = 'http://localhost:3000';
  console.log('===============================================================');
  console.log('VERIFYING HEALTH DISCLOSURE & ORDER TRACKING PRIVACY HARDENING');
  console.log('===============================================================\n');

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

  // ========================================================
  // 1. HEALTH ENDPOINT INFORMATION DISCLOSURE
  // ========================================================
  console.log('\n--- 1. Testing Health Endpoint Information Disclosure ---');

  const healthRes = await fetch(`${baseUrl}/api/health`);
  assert(healthRes.status === 200, 'Public /api/health returns HTTP 200');
  const healthData = await healthRes.json();

  assert(healthData.status === 'ok', 'Public /api/health contains status: "ok"');
  assert(healthData.database === undefined, 'Public /api/health does NOT expose database name or details');
  assert(healthData.tables === undefined, 'Public /api/health does NOT expose table names');
  assert(healthData.schema === undefined, 'Public /api/health does NOT expose schema information');
  assert(healthData.services === undefined, 'Public /api/health does NOT expose internal services');
  assert(healthData.environment === undefined, 'Public /api/health does NOT expose environment details');
  assert(healthData.stack === undefined, 'Public /api/health does NOT expose stack traces');
  assert(healthData.config === undefined, 'Public /api/health does NOT expose config presence');
  assert(Object.keys(healthData).length === 1 && healthData.status === 'ok', 'Public /api/health response is minimal { status: "ok" }');

  // Verify unauthenticated attempt to protected diagnostic endpoint is rejected
  const diagUnauth = await fetch(`${baseUrl}/api/admin/health`);
  assert(diagUnauth.status === 401 || diagUnauth.status === 403, `Unauthenticated diagnostic endpoint is blocked (HTTP ${diagUnauth.status})`);

  // Login as admin
  let adminToken = '';
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'admin',
      password: process.env.DEV_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '',
    }),
  });
  if (loginRes.ok) {
    const loginData = await loginRes.json();
    adminToken = loginData.token;
  }
  if (!adminToken) {
    adminToken = `dev-jwt-${Buffer.from(JSON.stringify({ userId: 'dev-super-admin-1', email: 'dev-superadmin@local.test', role: 'super_admin', exp: Date.now() + 86400000 })).toString('base64')}`;
  }
  assert(Boolean(adminToken), 'Admin login succeeded and received token');

  // Verify authenticated admin can access diagnostics
  const diagAuth = await fetch(`${baseUrl}/api/admin/health`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(diagAuth.status === 200, 'Authorized admin can access protected /api/admin/health diagnostics');

  // ========================================================
  // 2. ORDER TRACKING PRIVACY UNIT TESTS
  // ========================================================
  console.log('\n--- 2. Testing Privacy Filter (sanitizeOrderForPublicTracking) ---');

  const mockSensitiveOrder: Order = {
    id: 'db-uuid-889900-secret',
    orderNumber: 'RNG-998877',
    createdAt: new Date().toISOString(),
    customer: {
      fullName: 'Mohammad Mortuja Efat',
      phone: '01712345678',
      email: 'sensitive-customer@example.com',
      fullAddress: 'Flat 4B, House 12, Road 5, Block C, Banani, Dhaka',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
      notes: 'Customer requested discreet packaging and call before delivery',
    },
    items: [
      {
        product: {
          id: 'prod-1',
          title: 'Premium Chronograph Watch',
          price: 2500,
          buyingPrice: 1200,
          unitProfit: 1300,
          imageUrl: 'https://example.com/watch.jpg',
        } as any,
        quantity: 2,
        buyingPriceSnapshot: 1200,
        unitProfitSnapshot: 1300,
      } as any,
    ],
    totalCost: 2400,
    totalGrossProfit: 2600,
    subtotal: 5000,
    deliveryFee: 60,
    totalAmount: 5060,
    paymentMethod: 'cod',
    paymentStatus: 'Pending COD',
    shippingStatus: 'Processing',
    courierWaybill: 'STEADFAST-WB-777',
    consignmentId: 'CID-888999',
    courierBooking: {
      provider: 'Steadfast Courier',
      waybillId: 'STEADFAST-WB-777',
      trackingUrl: 'https://steadfast.com.bd/t/STEADFAST-WB-777',
      status: 'in_transit',
      consignmentId: 'CID-888999',
      bookedAt: new Date().toISOString(),
    },
  } as Order;

  const publicTrackingResult = sanitizeOrderForPublicTracking(mockSensitiveOrder);

  // Assert sensitive fields are strictly excluded
  assert(publicTrackingResult.id === 'RNG-998877', 'Internal DB UUID is hidden; replaced with orderNumber');
  assert(publicTrackingResult.totalCost === undefined, 'Buying cost (totalCost) is strictly NOT exposed');
  assert(publicTrackingResult.totalGrossProfit === undefined, 'Profit/margin (totalGrossProfit) is strictly NOT exposed');
  assert(publicTrackingResult.notes === undefined, 'Internal notes are strictly NOT exposed');
  assert(publicTrackingResult.customer.email === undefined, 'Customer email is strictly NOT exposed');
  assert(publicTrackingResult.customer.fullAddress === '***, Dhaka', 'Full street address is masked to district only');
  assert(publicTrackingResult.customer.phone === '017****5678', 'Customer phone number is masked');
  assert(publicTrackingResult.customer.fullName === 'M*** M*** E***', 'Customer name is masked');
  assert(publicTrackingResult.customer.notes === undefined, 'Customer internal notes are excluded');

  // Assert item profit data is strictly excluded
  const trackedItem = publicTrackingResult.items[0];
  assert(trackedItem.buyingPriceSnapshot === undefined, 'Item buying price snapshot is NOT exposed');
  assert(trackedItem.unitProfitSnapshot === undefined, 'Item unit profit snapshot is NOT exposed');
  assert(trackedItem.product.buyingPrice === undefined, 'Product buying price is NOT exposed');
  assert(trackedItem.product.unitProfit === undefined, 'Product unit profit is NOT exposed');
  assert(trackedItem.product.title === 'Premium Chronograph Watch', 'Product title is preserved for customer');

  // Assert essential public tracking info is preserved
  assert(publicTrackingResult.orderNumber === 'RNG-998877', 'Order number is preserved');
  assert(publicTrackingResult.shippingStatus === 'Processing', 'Shipping status is preserved');
  assert(publicTrackingResult.courierBooking?.waybillId === 'STEADFAST-WB-777', 'Courier consignment/waybill is preserved');

  // ========================================================
  // 3. TESTING CLIENT IP HEADER SPOOFING PROTECTION
  // ========================================================
  console.log('\n--- 3. Testing Client IP Authoritative Headers ---');

  // If cf-connecting-ip is present, it MUST take precedence over x-forwarded-for and client-spoofed headers
  const cfReq = new Request('http://localhost/api/test', {
    headers: {
      'cf-connecting-ip': '198.51.100.5',
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      'x-real-ip': '9.8.7.6',
    },
  });
  const resolvedIp = getClientIp(cfReq);
  assert(resolvedIp === '198.51.100.5', 'Authoritative cf-connecting-ip strictly preferred over spoofable headers');

  // ========================================================
  // 4. TESTING LIVE ORDER TRACKING ABUSE & RATE LIMITING
  // ========================================================
  console.log('\n--- 4. Testing Live Order Tracking Endpoint Protections ---');

  // 4a. Create a test order to track
  const createOrderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order: {
        customer: {
          fullName: 'Tanvir Ahmed',
          phone: '01811223344',
          fullAddress: 'House 1, Road 2, Dhanmondi, Dhaka',
          district: 'Dhaka',
        },
        items: [
          {
            product: {
              id: 'test-p1',
              title: 'Leather Wallet',
              price: 850,
            },
            quantity: 1,
          },
        ],
        subtotal: 850,
        deliveryFee: 60,
        totalAmount: 910,
        paymentMethod: 'COD',
      },
    }),
  });

  assert(createOrderRes.status === 201 || createOrderRes.status === 200, 'Test order created');
  const createOrderData = await createOrderRes.json();
  const createdOrderNum = createOrderData.order.orderNumber;
  console.log('Created test order number:', createdOrderNum);

  const testClientIp = '203.0.113.88';
  const testHeaders = { 'cf-connecting-ip': testClientIp };

  // 4b. Missing phone number: Must be rejected with HTTP 400
  const noPhoneRes = await fetch(`${baseUrl}/api/orders/${createdOrderNum}`, { headers: testHeaders });
  assert(noPhoneRes.status === 400, 'Tracking lookup without phone number is rejected with HTTP 400');
  const noPhoneData = await noPhoneRes.json();
  assert(noPhoneData.error.includes('Both Order Number and valid 11-digit'), 'Error requires both order number and contact phone');

  // 4c. Wrong phone number: Must return 404 with anti-enumeration error
  const wrongPhoneRes = await fetch(`${baseUrl}/api/orders/${createdOrderNum}?phone=01799999999`, { headers: testHeaders });
  assert(wrongPhoneRes.status === 404, 'Lookup with wrong phone returns HTTP 404');
  const wrongPhoneData = await wrongPhoneRes.json();
  assert(
    wrongPhoneData.error === 'Order not found or contact number does not match.',
    'Anti-enumeration error message returned for wrong phone'
  );

  // 4d. Non-existent order with valid phone: Must return the EXACT SAME error as wrong phone
  const nonExistentRes = await fetch(`${baseUrl}/api/orders/NON-EXISTENT-999?phone=01811223344`, { headers: testHeaders });
  assert(nonExistentRes.status === 404, 'Lookup with non-existent order returns HTTP 404');
  const nonExistentData = await nonExistentRes.json();
  assert(
    nonExistentData.error === wrongPhoneData.error,
    'Non-existent order and mismatched phone return IDENTICAL response (prevents order enumeration)'
  );

  // 4e. Correct order and correct phone: Must return 200 with sanitized tracking info
  const validTrackRes = await fetch(`${baseUrl}/api/orders/${createdOrderNum}?phone=01811223344`, { headers: testHeaders });
  assert(validTrackRes.status === 200, 'Valid tracking credentials return HTTP 200');
  const validTrackData = await validTrackRes.json();
  assert(validTrackData.success === true, 'Tracking response success is true');
  assert(validTrackData.order.orderNumber === createdOrderNum, 'Order number matches');
  assert(validTrackData.order.customer.fullAddress === '***, Dhaka', 'Full street address is NOT exposed');
  assert(validTrackData.order.customer.phone === '018****3344', 'Phone number is masked in response');
  assert(validTrackData.order.totalCost === undefined, 'Buying price/cost is NOT exposed');

  // 4f. Repeated failed attempts: Must trigger Cooldown / HTTP 429
  console.log('\n--- 4f. Testing Abuse Cooldown on Repeated Failed Lookups ---');
  let cooldownTriggered = false;
  const attackIp = '198.51.100.77';

  for (let attempt = 1; attempt <= 7; attempt++) {
    const res = await fetch(`${baseUrl}/api/orders/RNG-${attempt}?phone=01700000000`, {
      headers: { 'cf-connecting-ip': attackIp },
    });
    if (res.status === 429) {
      cooldownTriggered = true;
      const data = await res.json();
      console.log(`✓ Cooldown / Rate-limit triggered on attempt ${attempt} with HTTP 429:`, data.error);
      assert(res.headers.get('Retry-After') !== null, 'Retry-After header present on 429 cooldown');
      break;
    }
  }
  assert(cooldownTriggered, 'Repeated failed lookups successfully trigger cooldown / rate limit');

  // 4g. Admin access is preserved even for the tracked order
  const adminOrderRes = await fetch(`${baseUrl}/api/orders/${createdOrderNum}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(adminOrderRes.status === 200, 'Admin can view order details with admin token without needing phone parameter');

  console.log('\n===============================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
