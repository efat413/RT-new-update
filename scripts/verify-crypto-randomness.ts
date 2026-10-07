import assert from 'assert';
import { generateSecureOrderNumber } from '../src/server/db';
import { generateSafeMediaKey } from '../src/server/imageSecurity';

const BASE_URL = 'http://127.0.0.1:3000';

async function testCryptoRandomness() {
  console.log('--- STARTING CRYPTOGRAPHIC RANDOMNESS AUDIT & VERIFICATION ---');

  // Test 1: Order number generator format & uniqueness
  console.log('\n[1] Testing generateSecureOrderNumber format & uniqueness:');
  const generatedNumbers = new Set<string>();
  const currentYear = new Date().getFullYear();
  for (let i = 0; i < 500; i++) {
    const num = generateSecureOrderNumber();
    assert(/^RT-\d{4}-\d{8}$/.test(num), `Order number "${num}" must match format RT-YYYY-XXXXXXXX`);
    assert(num.startsWith(`RT-${currentYear}-`), `Order number must start with RT-${currentYear}-`);
    assert(!generatedNumbers.has(num), `Collision detected in generateSecureOrderNumber: ${num}`);
    generatedNumbers.add(num);
  }
  console.log(`✅ 500 order numbers generated with 0 collisions: e.g. ${Array.from(generatedNumbers)[0]}`);

  // Test 2: Safe Media Key generation
  console.log('\n[2] Testing generateSafeMediaKey:');
  const mediaKeys = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const key = generateSafeMediaKey('png');
    assert(/^asset-\d+-[a-f0-9]{8}\.png$/.test(key), `Media key "${key}" must match format`);
    assert(!mediaKeys.has(key), `Collision detected in media keys: ${key}`);
    mediaKeys.add(key);
  }
  console.log(`✅ 200 media keys generated with CSPRNG with 0 collisions: e.g. ${Array.from(mediaKeys)[0]}`);

  // Test 3: Live Order submission via API
  console.log('\n[3] Testing Live Order creation via API:');
  const orderPayload = {
    customer: {
      fullName: 'Crypto Audit Customer',
      phone: '01712345678',
      fullAddress: 'Road 1, Block A, Uttara, Dhaka',
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
          originalPrice: 750,
          imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80',
          stock: 10,
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

  const orderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload),
  });
  const orderData = await orderRes.json();
  assert.strictEqual(orderRes.status, 201, 'Order creation must return 201');
  assert(orderData.success, 'Order response must be successful');
  assert(orderData.order?.id, 'Order must have an ID');
  assert(orderData.order.id.startsWith('ord-'), `Order ID must start with ord-, got: ${orderData.order.id}`);
  assert(orderData.order?.orderNumber, 'Order must have an orderNumber');
  assert(/^RT-\d{4}-\d{8}$/.test(orderData.order.orderNumber), `Order number must match format RT-YYYY-XXXXXXXX, got: ${orderData.order.orderNumber}`);
  console.log('✅ Live Order created with CSPRNG ID and orderNumber:', orderData.order.id, orderData.order.orderNumber);

  // Test 4: Live User Registration via API
  console.log('\n[4] Testing Live User Registration via API:');
  const userEmail = `cryptouser-${Date.now()}@example.com`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Crypto User',
      email: userEmail,
      password: 'SecureCryptoPass2026!',
    }),
  });
  const regData = await regRes.json();
  assert.strictEqual(regRes.status, 201, 'User registration must return 201');
  assert(regData.success, 'Registration must be successful');
  assert(regData.user?.id, 'User must have an ID');
  assert(regData.user.id.startsWith('user-'), `User ID must start with user-, got: ${regData.user.id}`);
  console.log('✅ Live User registered with CSPRNG user ID:', regData.user.id);

  // Test 5: Existing Accounts & Orders remain functional
  console.log('\n[5] Testing Existing Accounts & Admin login:');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'dev-superadmin@local.test',
      password: process.env.DEV_ADMIN_PASSWORD || 'admin',
    }),
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginRes.status, 200, 'Existing Super Admin login must succeed');
  assert(loginData.success, 'Existing Super Admin login must return success');
  console.log('✅ Existing Super Admin logged in successfully');

  console.log('\n======================================================');
  console.log('ALL CRYPTOGRAPHIC RANDOMNESS AUDIT TESTS PASSED! 🎉');
  console.log('======================================================');
}

testCryptoRandomness().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
