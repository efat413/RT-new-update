/**
 * Verification test for stealthy, user-friendly checkout error handling on IP block
 * 
 * Verifies:
 * 1. Backend continues to enforce security authoritatively with HTTP 403 and IP_BLOCKED.
 * 2. Frontend orderApi.createOrder transforms IP block / 403 / security rejections into
 *    the stealthy, polite user message:
 *    "We are currently unable to process your order due to a temporary network issue. Please try again later or contact our support team."
 * 3. The harsh "Your IP has been blocked" message is NEVER leaked to the user.
 */

import { orderApi } from '../src/services/orderApi';
import { getTestAdminToken } from './test-auth-helper';

async function testStealthyErrorHandling() {
  const baseUrl = 'http://localhost:3000';
  console.log('🚀 Testing Stealthy Frontend Checkout Error Handling on IP Block...\n');

  const blockedIp = '198.51.100.88';

  // Step 1: Admin blocks the test IP
  console.log(`1️⃣ Admin blocking IP: ${blockedIp}...`);
  const adminToken = await getTestAdminToken(baseUrl);
  const blockRes = await fetch(`${baseUrl}/api/admin/blocked-ips`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ ip: blockedIp, reason: 'Stealth error handling verification' }),
  });
  if (!blockRes.ok) throw new Error(`Failed to block test IP: ${blockRes.status}`);
  console.log('   ✅ IP successfully blocked by Admin.');

  // Step 2: Test raw backend response (must remain secure with 403)
  console.log('\n2️⃣ Testing raw backend response for blocked IP...');
  const rawRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': blockedIp,
    },
    body: JSON.stringify({
      customer: { fullName: 'Test User', phone: '01711223344', fullAddress: 'Dhaka', district: 'Dhaka' },
      items: [{ productId: 'prod-wallet-01', title: 'Wallet', price: 1000, quantity: 1 }],
      deliveryFee: 70,
      paymentMethod: 'COD',
    }),
  });

  const rawData = await rawRes.json() as any;
  console.log(`   Backend status: ${rawRes.status}`);
  console.log(`   Backend error code: ${rawData.code}`);
  if (rawRes.status !== 403 || rawData.code !== 'IP_BLOCKED') {
    throw new Error(`Expected backend to reject with 403 IP_BLOCKED, got: ${rawRes.status}`);
  }
  console.log('   ✅ Backend authoritatively returned 403 Forbidden with code IP_BLOCKED.');

  // Step 3: Test frontend orderApi.createOrder client method handling
  console.log('\n3️⃣ Testing frontend orderApi.createOrder stealth transformation...');
  // We mock fetch with CF-Connecting-IP header for the test environment
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: any, init: any = {}) => {
    const url = typeof input === 'string' && input.startsWith('/api') ? `${baseUrl}${input}` : input;
    init.headers = {
      ...(init.headers || {}),
      'CF-Connecting-IP': blockedIp,
    };
    return originalFetch(url, init);
  };

  try {
    const clientResult = await orderApi.createOrder({
      id: 'test-order-stealth',
      orderNumber: 'RT-2026-TEST',
      customer: { fullName: 'Test Customer', phone: '01711223344', fullAddress: 'Dhaka', district: 'Dhaka', deliveryZone: 'inside_dhaka' },
      items: [{ product: { id: 'prod-wallet-01', title: 'Wallet', price: 1000 } as any, quantity: 1 }],
      subtotal: 1000,
      deliveryFee: 70,
      totalAmount: 1070,
      paymentMethod: 'cod',
      paymentStatus: 'DUE',
      shippingStatus: 'Pending',
      createdAt: new Date().toISOString(),
    });

    console.log(`   Frontend client success flag: ${clientResult.success}`);
    console.log(`   Frontend client error: "${clientResult.error}"`);

    const expectedStealthMessage =
      'We are currently unable to process your order due to a temporary network issue. Please try again later or contact our support team.';

    if (clientResult.success !== false) {
      throw new Error(`Expected clientResult.success to be false, got: ${clientResult.success}`);
    }

    if (clientResult.error !== expectedStealthMessage) {
      throw new Error(`Expected error message to be exact stealth message:\n"${expectedStealthMessage}"\nGot:\n"${clientResult.error}"`);
    }

    if (clientResult.error.toLowerCase().includes('ip') || clientResult.error.toLowerCase().includes('blocked')) {
      throw new Error(`Error leaked harsh words 'ip' or 'blocked': ${clientResult.error}`);
    }

    console.log('   ✅ Stealth error handling validated perfectly! Harsh blacklist string suppressed.');
  } finally {
    globalThis.fetch = originalFetch;
    // Clean up: unblock test IP
    await fetch(`${baseUrl}/api/admin/blocked-ips`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ ip: blockedIp }),
    });
    console.log('\n🧹 Test IP cleaned up and unblocked.');
  }

  console.log('\n============================================================');
  console.log('🎉 ALL STEALTHY CHECKOUT ERROR HANDLING CHECKS PASSED! 🎉');
  console.log('============================================================\n');
}

testStealthyErrorHandling().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
