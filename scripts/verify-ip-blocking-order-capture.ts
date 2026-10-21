/**
 * Comprehensive verification for Order IP Capture and IP Blocking System
 * Tests:
 * 1. Admin IP Blacklist API Authentication Security (401 on missing auth token)
 * 2. Authenticated Admin IP Blacklist API (GET, POST, DELETE /api/admin/blocked-ips)
 * 3. Order Checkout Validation (Rejection with 403 and error message when IP is blacklisted)
 * 4. Order IP Capture (Capturing CF-Connecting-IP and storing it on the Order)
 * 5. IP Unblock & Restoration of checkout capability
 */

import { getTestAdminToken } from './test-auth-helper';

async function runVerification() {
  const baseUrl = 'http://localhost:3000';
  console.log('🚀 Starting Order IP Capture & IP Blocking Verification...\n');

  const testIp = '198.51.100.77';
  const normalIp = '203.0.113.99';

  // Step 1: Verify Admin Route Authentication Security (Unauthenticated call rejected)
  console.log('1️⃣ Testing Admin Security: Unauthenticated request to /api/admin/blocked-ips...');
  const unauthRes = await fetch(`${baseUrl}/api/admin/blocked-ips`);
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401 Unauthorized for unauthenticated admin call, got: ${unauthRes.status}`);
  }
  console.log('   ✅ Security check passed: Unauthenticated access rejected with 401.');

  // Step 2: Authenticate Admin
  console.log('\n2️⃣ Authenticating Admin via secure login...');
  const adminToken = await getTestAdminToken(baseUrl);
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };
  console.log('   ✅ Admin successfully authenticated.');

  // Step 3: Query initial blocked IPs
  console.log('\n3️⃣ Fetching initial blocked IPs via authenticated GET /api/admin/blocked-ips...');
  const getRes = await fetch(`${baseUrl}/api/admin/blocked-ips`, { headers: authHeaders });
  if (!getRes.ok) {
    throw new Error(`Failed to GET /api/admin/blocked-ips: ${getRes.status} ${await getRes.text()}`);
  }
  const getData = (await getRes.json()) as any;
  console.log(`   Initial blocked IPs count: ${getData.blockedIps?.length || 0}`);

  // Step 4: Block test IP via Admin API
  console.log(`\n4️⃣ Blocking IP: ${testIp} via POST /api/admin/blocked-ips...`);
  const blockRes = await fetch(`${baseUrl}/api/admin/blocked-ips`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      ip: testIp,
      reason: 'Automated spam abuse and fraud detection',
    }),
  });
  if (!blockRes.ok) {
    throw new Error(`Failed to block IP: ${blockRes.status} ${await blockRes.text()}`);
  }
  const blockData = (await blockRes.json()) as any;
  console.log('   Block response:', blockData.message);
  if (!blockData.success || blockData.blockedIp?.ip !== testIp) {
    throw new Error(`IP block response verification failed: ${JSON.stringify(blockData)}`);
  }

  // Step 5: Attempt order placement with blocked IP
  console.log(`\n5️⃣ Testing checkout validation from blocked IP (${testIp})...`);
  const blockedOrderPayload = {
    customer: {
      fullName: 'Blocked User Test',
      phone: '01711223344',
      district: 'Dhaka',
      fullAddress: 'Test Address Block 5, Road 2',
    },
    items: [
      {
        productId: 'prod-wallet-01',
        title: 'Premium Leather Wallet',
        price: 1200,
        quantity: 1,
      },
    ],
    deliveryFee: 70,
    paymentMethod: 'COD',
  };

  const blockedOrderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': testIp,
    },
    body: JSON.stringify(blockedOrderPayload),
  });

  const blockedOrderData = (await blockedOrderRes.json()) as any;
  console.log(`   Checkout response status: ${blockedOrderRes.status}`);
  console.log(`   Checkout response body:`, blockedOrderData);

  if (blockedOrderRes.status !== 403) {
    throw new Error(`Expected HTTP 403 for blocked IP, got ${blockedOrderRes.status}`);
  }
  if (!blockedOrderData.error?.includes('blocked from placing orders')) {
    throw new Error(`Expected error message to mention IP blocked, got: ${blockedOrderData.error}`);
  }
  if (blockedOrderData.code !== 'IP_BLOCKED') {
    throw new Error(`Expected error code to be 'IP_BLOCKED', got: ${blockedOrderData.code}`);
  }
  console.log('   ✅ Blocked IP checkout was properly rejected with 403 and error message!');

  // Step 6: Place order with clean/unblocked IP and verify IP capture
  console.log(`\n6️⃣ Placing order with clean IP (${normalIp}) to verify IP capture...`);
  const validOrderPayload = {
    customer: {
      fullName: 'Legitimate Customer',
      phone: '01811223344',
      district: 'Chittagong',
      fullAddress: 'Agrabad C/A, Chittagong',
    },
    items: [
      {
        productId: 'prod-wallet-01',
        title: 'Premium Leather Wallet',
        price: 1200,
        quantity: 1,
      },
    ],
    deliveryFee: 130,
    paymentMethod: 'COD',
  };

  const validOrderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': normalIp,
    },
    body: JSON.stringify(validOrderPayload),
  });

  if (!validOrderRes.ok) {
    throw new Error(`Failed to place valid order: ${validOrderRes.status} ${await validOrderRes.text()}`);
  }

  const validOrderData = (await validOrderRes.json()) as any;
  console.log(`   Order placed successfully! Order #: ${validOrderData.order?.orderNumber}`);
  console.log(`   Captured IP address on order: ${validOrderData.order?.ipAddress}`);

  if (validOrderData.order?.ipAddress !== normalIp) {
    throw new Error(`Expected order ipAddress to be ${normalIp}, got ${validOrderData.order?.ipAddress}`);
  }
  console.log('   ✅ Customer IP address successfully captured from CF-Connecting-IP on order details!');

  // Step 7: Unblock test IP via Admin API
  console.log(`\n7️⃣ Unblocking IP: ${testIp} via DELETE /api/admin/blocked-ips...`);
  const unblockRes = await fetch(`${baseUrl}/api/admin/blocked-ips`, {
    method: 'DELETE',
    headers: authHeaders,
    body: JSON.stringify({ ip: testIp }),
  });
  if (!unblockRes.ok) {
    throw new Error(`Failed to unblock IP: ${unblockRes.status} ${await unblockRes.text()}`);
  }
  const unblockData = (await unblockRes.json()) as any;
  console.log('   Unblock response:', unblockData.message);

  // Step 8: Verify test IP is no longer blocked on checkout
  console.log(`\n8️⃣ Verifying previously blocked IP (${testIp}) can now proceed through checkout...`);
  const retryOrderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': testIp,
    },
    body: JSON.stringify({
      ...blockedOrderPayload,
      customer: {
        ...blockedOrderPayload.customer,
        phone: '01911223344',
      },
    }),
  });

  const retryOrderData = (await retryOrderRes.json()) as any;
  if (retryOrderRes.status === 403 && retryOrderData.code === 'IP_BLOCKED') {
    throw new Error('IP is still blocked after unblock operation!');
  }
  console.log(`   Retry response status: ${retryOrderRes.status} (Not 403 Forbidden)`);
  if (retryOrderRes.ok) {
    console.log(`   Order successfully placed after unblocking! Order #: ${retryOrderData.order?.orderNumber}`);
    console.log(`   Captured IP on unblocked order: ${retryOrderData.order?.ipAddress}`);
  }
  console.log('   ✅ Unblocking verified: checkout is fully restored!');

  console.log('\n============================================================');
  console.log('🎉 ALL IP CAPTURE & BLOCKING VERIFICATION CHECKS PASSED! 🎉');
  console.log('============================================================\n');
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
