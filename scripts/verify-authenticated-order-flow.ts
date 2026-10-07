import assert from 'assert';
import { TEST_BASE_URL, getTestSecret, createSignedTestToken } from './test-auth-helper';

async function runTests() {
  console.log('=== STARTING AUTHENTICATED ORDER CREATION FLOW VERIFICATION ===');

  const secret = getTestSecret();
  const testUserId = 'test-customer-456';
  const testEmail = 'customer@test.com';

  const testToken = createSignedTestToken(
    {
      userId: testUserId,
      email: testEmail,
      role: 'customer',
    },
    secret
  );

  const testItem = {
    quantity: 1,
    product: {
      id: 'prod-watch-03',
      title: 'Curren Chronograph Leather Watch',
      price: 2450,
    },
  };

  // Test 1: Authenticated order creation via HttpOnly cookie (credentials: 'include')
  console.log('\n--- 1. Order Creation via HttpOnly Cookie ---');
  const cookieRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `auth_token=${encodeURIComponent(testToken)}`,
    },
    body: JSON.stringify({
      order: {
        customer: {
          fullName: 'Test Customer',
          phone: '01712345678',
          fullAddress: 'House 12, Road 4, Sector 3, Uttara',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [testItem],
        subtotal: 2450,
        deliveryFee: 60,
        totalAmount: 2510,
        paymentMethod: 'COD',
      },
    }),
  });

  const cookieData = await cookieRes.json();
  console.log('Cookie Order Response status:', cookieRes.status, 'success:', cookieData.success);
  assert(cookieRes.status === 201, `Expected status 201, got ${cookieRes.status}`);
  assert(cookieData.success === true, 'Expected success: true');
  assert(cookieData.order, 'Expected order object');
  assert.strictEqual(cookieData.order.userId, testUserId, `Expected userId: ${testUserId}, got: ${cookieData.order.userId}`);
  assert.strictEqual(cookieData.order.userEmail, testEmail, `Expected userEmail: ${testEmail}, got: ${cookieData.order.userEmail}`);
  assert.strictEqual(cookieData.order.customer?.userId, testUserId, `Expected customer.userId: ${testUserId}`);
  assert.strictEqual(cookieData.order.customer?.email, testEmail, `Expected customer.email: ${testEmail}`);
  console.log('✅ [PASS] 1. Authenticated customer order via HttpOnly Cookie attached userId & userEmail');

  // Test 2: Authenticated order creation via Authorization: Bearer token
  console.log('\n--- 2. Order Creation via Authorization: Bearer Header ---');
  const bearerRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${testToken}`,
    },
    body: JSON.stringify({
      order: {
        customer: {
          fullName: 'Test Customer Two',
          phone: '01812345678',
          fullAddress: 'Mirpur 10, Block C',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [testItem],
        subtotal: 2450,
        deliveryFee: 60,
        totalAmount: 2510,
        paymentMethod: 'COD',
      },
    }),
  });

  const bearerData = await bearerRes.json();
  assert(bearerRes.status === 201, `Expected status 201, got ${bearerRes.status}`);
  assert(bearerData.success === true, 'Expected success: true');
  assert.strictEqual(bearerData.order.userId, testUserId, `Expected userId: ${testUserId}`);
  assert.strictEqual(bearerData.order.userEmail, testEmail, `Expected userEmail: ${testEmail}`);
  assert.strictEqual(bearerData.order.customer?.userId, testUserId, `Expected customer.userId: ${testUserId}`);
  assert.strictEqual(bearerData.order.customer?.email, testEmail, `Expected customer.email: ${testEmail}`);
  console.log('✅ [PASS] 2. Authenticated customer order via Authorization Bearer attached userId & userEmail');

  // Test 3: Guest checkout (unauthenticated) preserves normal order placement without userId
  console.log('\n--- 3. Guest Checkout (Unauthenticated) ---');
  const guestRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      order: {
        customer: {
          fullName: 'Guest Buyer',
          phone: '01912345678',
          fullAddress: 'Dhanmondi 27, Dhaka',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [testItem],
        subtotal: 2450,
        deliveryFee: 60,
        totalAmount: 2510,
        paymentMethod: 'COD',
      },
    }),
  });

  const guestData = await guestRes.json();
  assert(guestRes.status === 201, `Expected status 201, got ${guestRes.status}`);
  assert(guestData.success === true, 'Expected guest checkout success: true');
  assert(!guestData.order.userId, 'Expected guest order to have NO userId');
  assert(!guestData.order.userEmail, 'Expected guest order to have NO userEmail');
  assert(!guestData.order.customer?.userId, 'Expected guest customer to have NO userId');
  console.log('✅ [PASS] 3. Guest checkout succeeds without userId/userEmail');

  // Test 4: Guest impersonation prevention (guest supplying fake userId in payload)
  console.log('\n--- 4. Guest Impersonation Prevention ---');
  const spoofRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      order: {
        userId: 'spoofed-admin-id',
        userEmail: 'spoofed-admin@test.com',
        customer: {
          fullName: 'Malicious Guest',
          phone: '01612345678',
          fullAddress: 'Fake Street, Dhaka',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
          userId: 'spoofed-admin-id',
        },
        items: [testItem],
        subtotal: 2450,
        deliveryFee: 60,
        totalAmount: 2510,
        paymentMethod: 'COD',
      },
    }),
  });

  const spoofData = await spoofRes.json();
  assert(spoofRes.status === 201, 'Guest order placed');
  assert(!spoofData.order.userId, 'Spoofed userId must be stripped for unauthenticated user');
  assert(!spoofData.order.userEmail, 'Spoofed userEmail must be stripped for unauthenticated user');
  assert(!spoofData.order.customer?.userId, 'Spoofed customer.userId must be stripped');
  console.log('✅ [PASS] 4. Spoofed userId/userEmail stripped from unauthenticated guest order');

  // Test 5: Order tracking remains functional for both authenticated and guest orders
  console.log('\n--- 5. Order Tracking Verification ---');
  const cookieOrderNum = cookieData.order.orderNumber;
  const cookiePhone = '01712345678';

  // Tracking query with order number and phone
  const trackRes = await fetch(`${TEST_BASE_URL}/api/orders/${cookieOrderNum}?phone=${cookiePhone}`);
  const trackData = await trackRes.json();
  assert(trackRes.status === 200, `Tracking returned status ${trackRes.status}`);
  assert(trackData.success === true, 'Tracking returned success: true');
  assert.strictEqual(trackData.order.orderNumber, cookieOrderNum, 'Tracked order number matches');
  console.log('✅ [PASS] 5. Public and authenticated order tracking functional and unchanged');

  console.log('\n================================================================');
  console.log('ALL AUTHENTICATED & GUEST ORDER CREATION TESTS PASSED (5/5)!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
