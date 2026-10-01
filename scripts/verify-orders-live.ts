/**
 * Live test of POST /api/orders abuse protection and idempotency against dev server
 */

async function testOrders() {
  console.log('Testing POST /api/orders live on http://localhost:3000...');

  const idempotencyKey = `test-key-${Date.now()}`;
  const orderPayload = {
    idempotencyKey,
    order: {
      customer: {
        fullName: 'Audit Tester',
        phone: '01712345678',
        district: 'Dhaka',
        fullAddress: 'Dhanmondi, Dhaka 1205',
        notes: 'Testing idempotency and abuse protection',
      },
      items: [
        {
          productId: 'prod-wallet-01',
          title: 'Premium Leather Wallet',
          price: 99999, // client spoofed price (should be recalculated or validated)
          quantity: 1,
        },
      ],
      deliveryFee: 10, // client spoofed fee
      totalAmount: 1, // client spoofed total
      paymentMethod: 'COD',
      paymentStatus: 'Paid', // client spoofed status (should be forced Pending)
    },
  };

  // 1. Submit order
  const res1 = await fetch('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(orderPayload),
  });

  const data1 = await res1.json();
  console.log('First order submission status:', res1.status, 'success:', data1.success);
  if (!data1.success) {
    console.error('Order creation failed:', data1);
    process.exit(1);
  }

  const orderNum1 = data1.order?.orderNumber;
  const orderId1 = data1.order?.id;
  console.log(`Created Order #${orderNum1} (ID: ${orderId1})`);
  console.log(`Payment Status: ${data1.order?.paymentStatus}`); // Should be Pending, not Paid

  if (data1.order?.paymentStatus === 'Paid') {
    console.error('FAIL: Client was able to spoof paymentStatus to Paid!');
    process.exit(1);
  }
  console.log('✅ PASS: Server authoritative paymentStatus enforced (Pending)');

  // 2. Submit duplicate with SAME idempotency key (simulating network retry or double-click)
  const res2 = await fetch('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(orderPayload),
  });

  const data2 = await res2.json();
  console.log('Second order submission status:', res2.status, 'idempotent flag:', data2.idempotent);
  console.log(`Returned Order #${data2.order?.orderNumber} (ID: ${data2.order?.id})`);

  if (data2.order?.orderNumber !== orderNum1 || data2.order?.id !== orderId1) {
    console.error('FAIL: Idempotency failed! A new order was created instead of returning original!');
    process.exit(1);
  }
  console.log('✅ PASS: Idempotency key successfully returned original order without duplicate creation');

  console.log('ALL LIVE ORDER TESTS PASSED! 🎉');
}

testOrders().catch((e) => {
  console.error(e);
  process.exit(1);
});
