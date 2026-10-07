import assert from 'assert';

const BASE_URL = 'http://127.0.0.1:3000';

async function runIdempotencyVerification() {
  console.log('--- STARTING ORDER IDEMPOTENCY HARDENING VERIFICATION ---');

  // Register two distinct users
  const user1Email = `idem_user1_${Date.now()}@example.com`;
  const user2Email = `idem_user2_${Date.now()}@example.com`;

  const reg1 = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'User One', email: user1Email, password: 'SecurePassword123!' }),
  });
  const reg1Data = await reg1.json();
  assert.strictEqual(reg1.status, 201);
  const token1 = reg1Data.token;

  const reg2 = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'User Two', email: user2Email, password: 'SecurePassword123!' }),
  });
  const reg2Data = await reg2.json();
  assert.strictEqual(reg2.status, 201);
  const token2 = reg2Data.token;

  console.log('✅ Two test users registered successfully');

  // Base order payload
  const orderPayload1 = {
    customer: {
      fullName: 'User One Customer',
      phone: '01711111111',
      fullAddress: 'House 1, Road 2, Dhanmondi, Dhaka',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
    },
    items: [
      {
        id: 'item-1',
        product: {
          id: 'prod-mug-13b',
          title: 'Personalized Ceramic Mug',
          price: 650,
          stock: 50,
        },
        quantity: 1,
      },
    ],
    subtotal: 650,
    deliveryFee: 70,
    totalAmount: 720,
    paymentMethod: 'cod',
    paymentStatus: 'Pending',
  };

  const sharedKey = `idem-test-${Date.now()}-shared-key`;

  // [TEST 1] User 1 places initial order with sharedKey
  console.log('\n[TEST 1] User 1 creates order with idempotency key:');
  const res1 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token1}`,
      'Idempotency-Key': sharedKey,
    },
    body: JSON.stringify(orderPayload1),
  });
  const data1 = await res1.json();
  assert.strictEqual(res1.status, 201, 'First order creation must succeed with 201');
  assert(data1.order?.orderNumber, 'Order must have orderNumber');
  const user1OrderNum = data1.order.orderNumber;
  console.log('✅ User 1 order created successfully with orderNumber:', user1OrderNum);

  // [TEST 2] Duplicate Order Submission: User 1 replays same request with same idempotency key
  console.log('\n[TEST 2] User 1 replays exact same order with same idempotency key (duplicate protection):');
  const res1Replay = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token1}`,
      'Idempotency-Key': sharedKey,
    },
    body: JSON.stringify(orderPayload1),
  });
  const data1Replay = await res1Replay.json();
  assert.strictEqual(res1Replay.status, 200, 'Replay with same user & payload must return 200 OK');
  assert.strictEqual(data1Replay.idempotent, true, 'Response must indicate idempotent cache hit');
  assert.strictEqual(data1Replay.order?.orderNumber, user1OrderNum, 'Must return the same orderNumber');
  console.log('✅ User 1 replay safely returned cached order without creating duplicate');

  // [TEST 3] Cross-User Abuse Protection: User 2 attempts to use User 1's idempotency key
  console.log('\n[TEST 3] User 2 attempts to use User 1\'s idempotency key (cross-user replay):');
  const orderPayloadUser2 = {
    ...orderPayload1,
    customer: {
      fullName: 'User Two Customer',
      phone: '01722222222',
      fullAddress: 'House 5, Road 10, Gulshan, Dhaka',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
    },
  };

  const resUser2Abuse = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token2}`,
      'Idempotency-Key': sharedKey, // Attempting to use User 1's key!
    },
    body: JSON.stringify(orderPayloadUser2),
  });
  const dataUser2Abuse = await resUser2Abuse.json();
  console.log('User 2 abuse response status:', resUser2Abuse.status, dataUser2Abuse);
  assert.strictEqual(resUser2Abuse.status, 409, 'Cross-user idempotency key reuse must be rejected with 409 Conflict');
  assert.strictEqual(dataUser2Abuse.code, 'IDEMPOTENCY_IDENTITY_MISMATCH');
  console.log('✅ Cross-user idempotency replay strictly rejected with 409 Conflict');

  // [TEST 4] Payload Fingerprint Mismatch Protection: Same User 1 reuses key with different payload
  console.log('\n[TEST 4] User 1 attempts to reuse key with mutated order parameters:');
  const mutatedPayload = {
    ...orderPayload1,
    items: [
      {
        id: 'item-2',
        product: {
          id: 'prod-tshirt-22',
          title: 'Premium Cotton T-Shirt',
          price: 950,
          stock: 30,
        },
        quantity: 2, // Changed item and quantity
      },
    ],
    subtotal: 1900,
    totalAmount: 1970,
  };

  const resMutated = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token1}`,
      'Idempotency-Key': sharedKey, // Reusing key with different items!
    },
    body: JSON.stringify(mutatedPayload),
  });
  const dataMutated = await resMutated.json();
  console.log('Mutated payload response status:', resMutated.status, dataMutated);
  assert.strictEqual(resMutated.status, 409, 'Reusing key with different payload must be rejected with 409 Conflict');
  assert.strictEqual(dataMutated.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');
  console.log('✅ Mutated payload idempotency reuse strictly rejected with 409 Conflict');

  // [TEST 5] Guest Order Idempotency and Cross-Guest Isolation
  console.log('\n[TEST 5] Guest order idempotency and isolation:');
  const guestKey = `idem-guest-${Date.now()}-abc`;
  const guestOrder1 = {
    customer: {
      fullName: 'Guest Alpha',
      phone: '01833333333',
      fullAddress: 'Agrabad, Chittagong',
      district: 'Chittagong',
      deliveryZone: 'outside_dhaka',
    },
    items: [
      {
        id: 'item-1',
        product: {
          id: 'prod-mug-13b',
          title: 'Personalized Ceramic Mug',
          price: 650,
          stock: 50,
        },
        quantity: 1,
      },
    ],
    subtotal: 650,
    deliveryFee: 130,
    totalAmount: 780,
    paymentMethod: 'cod',
    paymentStatus: 'Pending',
  };

  // Guest Alpha places order
  const resGuest1 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': guestKey,
    },
    body: JSON.stringify(guestOrder1),
  });
  const dataGuest1 = await resGuest1.json();
  assert.strictEqual(resGuest1.status, 201);
  const guest1OrderNum = dataGuest1.order.orderNumber;
  console.log('✅ Guest Alpha placed order:', guest1OrderNum);

  // Guest Alpha re-submits (network retry) -> 200 OK
  const resGuest1Retry = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': guestKey,
    },
    body: JSON.stringify(guestOrder1),
  });
  const dataGuest1Retry = await resGuest1Retry.json();
  assert.strictEqual(resGuest1Retry.status, 200);
  assert.strictEqual(dataGuest1Retry.idempotent, true);
  assert.strictEqual(dataGuest1Retry.order.orderNumber, guest1OrderNum);
  console.log('✅ Guest Alpha idempotent retry succeeded with 200 OK');

  // Guest Beta with different phone tries to hijack/reuse Guest Alpha's key
  const guestOrder2 = {
    ...guestOrder1,
    customer: {
      fullName: 'Guest Beta',
      phone: '01844444444', // Different phone
      fullAddress: 'Agrabad, Chittagong',
      district: 'Chittagong',
      deliveryZone: 'outside_dhaka',
    },
  };
  const resGuestBeta = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': guestKey,
    },
    body: JSON.stringify(guestOrder2),
  });
  const dataGuestBeta = await resGuestBeta.json();
  assert.strictEqual(resGuestBeta.status, 409);
  assert.strictEqual(dataGuestBeta.code, 'IDEMPOTENCY_IDENTITY_MISMATCH');
  console.log('✅ Guest Beta blocked from hijacking Guest Alpha\'s idempotency key (409 Conflict)');

  console.log('\n======================================================');
  console.log('ALL ORDER IDEMPOTENCY HARDENING TESTS PASSED! 🎉');
  console.log('======================================================');
}

runIdempotencyVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
