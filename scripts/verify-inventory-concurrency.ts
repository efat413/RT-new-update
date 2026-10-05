/**
 * Automated Verification Suite for Inventory Concurrency,
 * Atomic Stock Deduction, Safe Cancellation, and Idempotency.
 * Rongdhonu Trade
 */

import { getTestAdminToken } from './test-auth-helper';

async function runInventoryConcurrencyVerification() {
  console.log('================================================================');
  console.log('STARTING INVENTORY CONCURRENCY & STOCK ATOMICITY VERIFICATION');
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

  // ================================================================
  // PART A: D1 ENGINE-LEVEL ATOMICITY & TRIGGER UNIT TESTS
  // ================================================================
  console.log('--- PART A: D1 ENGINE-LEVEL ATOMICITY & TRIGGER UNIT TESTS ---');

  // Simulated D1 database with SQLite trigger execution and batch rollback
  class MockD1InventoryDatabase {
    public products: Map<string, any> = new Map();
    public orders: Map<string, any> = new Map();

    constructor() {
      // Seed a test product with exactly 1 unit of stock
      this.products.set('prod-concurrency-test', {
        id: 'prod-concurrency-test',
        title: 'Limited Edition Watch',
        price: 2500,
        buying_price: 1500,
        stock: 1,
        category_id: 'cat-mens-accessories',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    prepare(query: string) {
      const q = query.trim();
      let boundArgs: any[] = [];

      const stmt = {
        bind: (...args: any[]) => {
          boundArgs = args;
          return stmt;
        },
        first: async <T = any>() => {
          if (q.startsWith('SELECT * FROM store_settings')) {
            return {
              id: 'default',
              settings_json: JSON.stringify({ insideDhakaFee: 80, outsideDhakaFee: 150 }),
              updated_at: new Date().toISOString(),
            } as T;
          }
          if (q.startsWith('SELECT * FROM coupons')) {
            return null as T;
          }
          if (q.startsWith('SELECT * FROM products WHERE id = ?')) {
            const p = this.products.get(boundArgs[0]);
            return p ? ({ ...p } as T) : (null as T);
          }
          if (q.startsWith('SELECT * FROM orders WHERE id = ?')) {
            const o = this.orders.get(boundArgs[0]);
            return o ? ({ ...o } as T) : (null as T);
          }
          return null as T;
        },
        all: async <T = any>() => {
          return { results: [] } as any;
        },
        run: async () => {
          // Check for trigger simulation: trg_prevent_negative_stock
          if (q.includes('UPDATE products SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE -1 END')) {
            const [minQty, deductQty, prodId] = boundArgs;
            const p = this.products.get(prodId);
            if (!p) return { success: false, error: 'Product not found', meta: { changes: 0 } };
            const newStock = p.stock >= minQty ? p.stock - deductQty : -1;
            if (newStock < 0) {
              return {
                success: false,
                error: 'INSUFFICIENT_STOCK: Product stock cannot be negative (ABORT triggered by trg_prevent_negative_stock)',
                meta: { changes: 0 },
              };
            }
            p.stock = newStock;
            return { success: true, meta: { changes: 1 } };
          }

          if (q.includes("UPDATE orders SET shipping_status = 'Cancelled'")) {
            const [orderId] = boundArgs;
            const o = this.orders.get(orderId);
            if (!o) return { success: false, error: 'Order not found', meta: { changes: 0 } };
            if (o.shipping_status === 'Cancelled') {
              // Already cancelled, WHERE condition fails!
              return { success: true, meta: { changes: 0 } };
            }
            o.shipping_status = 'Cancelled';
            return { success: true, meta: { changes: 1 } };
          }

          if (q.includes('UPDATE products SET stock = stock + ?')) {
            const [addQty, prodId] = boundArgs;
            const p = this.products.get(prodId);
            if (p) p.stock += addQty;
            return { success: true, meta: { changes: 1 } };
          }

          return { success: true, meta: { changes: 1 } };
        },
      };

      return stmt;
    }

    async batch(statements: any[]) {
      // Simulate SQLite atomic transaction: Snapshot state before batch
      const productSnapshot = new Map(Array.from(this.products.entries()).map(([k, v]) => [k, { ...v }]));
      const orderSnapshot = new Map(Array.from(this.orders.entries()).map(([k, v]) => [k, { ...v }]));

      const results = [];
      for (const s of statements) {
        const res = await s.run();
        if (!res.success) {
          // ROLLBACK TRANSACTION
          this.products = productSnapshot;
          this.orders = orderSnapshot;
          return [{ success: false, error: res.error }];
        }
        results.push(res);
      }
      return results;
    }
  }

  const d1Mock = new MockD1InventoryDatabase();

  // A.1 Verify single unit order claims stock and leaves stock at 0
  const prodBefore = d1Mock.products.get('prod-concurrency-test');
  assert(prodBefore.stock === 1, 'A.1 Test product starts with exactly 1 unit of stock');

  const orderStmt1 = d1Mock.prepare('INSERT INTO orders (id) VALUES (?)').bind('ord-test-1');
  const stockStmt1 = d1Mock
    .prepare('UPDATE products SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE -1 END WHERE id = ?')
    .bind(1, 1, 'prod-concurrency-test');

  const batch1 = await d1Mock.batch([orderStmt1, stockStmt1]);
  assert(
    batch1.every((r) => r.success),
    'A.2 First concurrent order successfully claims the last available unit (stock 1 -> 0)'
  );
  assert(
    d1Mock.products.get('prod-concurrency-test').stock === 0,
    'A.3 Product stock is now exactly 0'
  );

  // A.4 Second concurrent order attempts to claim from stock 0: Triggers atomic ABORT and rolls back
  const orderStmt2 = d1Mock.prepare('INSERT INTO orders (id) VALUES (?)').bind('ord-test-2');
  const stockStmt2 = d1Mock
    .prepare('UPDATE products SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE -1 END WHERE id = ?')
    .bind(1, 1, 'prod-concurrency-test');

  const batch2 = await d1Mock.batch([orderStmt2, stockStmt2]);
  assert(
    batch2.some((r) => !r.success && r.error.includes('INSUFFICIENT_STOCK')),
    'A.4 Second concurrent order hits INSUFFICIENT_STOCK trigger and rolls back entire batch'
  );
  assert(
    d1Mock.products.get('prod-concurrency-test').stock === 0,
    'A.5 Stock remains exactly 0 and NEVER drops below 0'
  );

  // ================================================================
  // PART B: LIVE HTTP SERVER ENDPOINT CONCURRENCY TESTS
  // ================================================================
  console.log('\n--- PART B: LIVE HTTP SERVER ENDPOINT CONCURRENCY TESTS ---');

  const baseUrl = 'http://127.0.0.1:3000';

  const adminToken = await getTestAdminToken(baseUrl);

  // 1. Get an existing product and check initial stock
  const prodRes = await fetch(`${baseUrl}/api/products/prod-wallet-01`);
  const prodJson = await prodRes.json();
  const initialStock = prodJson.product.stock;
  assert(
    prodRes.status === 200 && typeof initialStock === 'number' && initialStock > 0,
    `B.1 Target product (Premium Leather Wallet) found with initial stock: ${initialStock}`
  );

  // 2. Normal order: order 1 unit and verify stock deduction
  const normalOrderPayload = {
    customer: {
      fullName: 'Inventory Test Customer',
      phone: '01711998877',
      fullAddress: 'Dhanmondi, Dhaka',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
    },
    items: [
      {
        product: { id: 'prod-wallet-01' },
        quantity: 1,
      },
    ],
    paymentMethod: 'COD',
  };

  const normalRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': '10.0.0.1',
    },
    body: JSON.stringify(normalOrderPayload),
  });
  const normalJson = await normalRes.json();
  assert(
    normalRes.status === 201 && normalJson.success === true && normalJson.order?.id,
    'B.2 Normal order placement succeeds with HTTP 201'
  );

  const prodAfterNormal = await fetch(`${baseUrl}/api/products/prod-wallet-01`).then((r) => r.json());
  assert(
    prodAfterNormal.product.stock === initialStock - 1,
    `B.3 Product stock decreased by exactly 1 (${initialStock} -> ${prodAfterNormal.product.stock})`
  );

  // 3. Insufficient stock: order more than available stock
  const excessOrderPayload = {
    customer: {
      fullName: 'Excess Stock Test',
      phone: '01811223344',
      fullAddress: 'Gulshan, Dhaka',
      deliveryZone: 'inside_dhaka',
    },
    items: [
      {
        product: { id: 'prod-wallet-01' },
        quantity: 99999, // way higher than stock
      },
    ],
    paymentMethod: 'COD',
  };

  const excessRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': '10.0.0.2',
    },
    body: JSON.stringify(excessOrderPayload),
  });
  assert(
    excessRes.status === 400,
    'B.4 Order with insufficient stock is rejected with HTTP 400 Bad Request'
  );

  const prodAfterExcess = await fetch(`${baseUrl}/api/products/prod-wallet-01`).then((r) => r.json());
  assert(
    prodAfterExcess.product.stock === initialStock - 1,
    'B.5 Failed excess order did NOT consume stock (stock intact)'
  );

  // 4. Repeated Request / Idempotency Test
  const idemKey = `test-idem-${Date.now()}`;
  const idemPayload = {
    customer: {
      fullName: 'Idempotency Test User',
      phone: '01911445566',
      fullAddress: 'Banani, Dhaka',
      deliveryZone: 'inside_dhaka',
    },
    items: [
      {
        product: { id: 'prod-wallet-01' },
        quantity: 1,
      },
    ],
    paymentMethod: 'COD',
  };

  const idemRes1 = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey,
      'cf-connecting-ip': '10.0.0.3',
    },
    body: JSON.stringify(idemPayload),
  });
  const idemJson1 = await idemRes1.json();
  const stockAfterIdem1 = (await fetch(`${baseUrl}/api/products/prod-wallet-01`).then((r) => r.json())).product.stock;

  // Immediate retry with the exact same Idempotency-Key
  const idemRes2 = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idemKey,
      'cf-connecting-ip': '10.0.0.3',
    },
    body: JSON.stringify(idemPayload),
  });
  const idemJson2 = await idemRes2.json();
  const stockAfterIdem2 = (await fetch(`${baseUrl}/api/products/prod-wallet-01`).then((r) => r.json())).product.stock;

  assert(
    idemRes2.status === 200 &&
      idemJson2.idempotent === true &&
      idemJson2.order?.id === idemJson1.order?.id &&
      stockAfterIdem2 === stockAfterIdem1,
    `B.6 Repeated request with Idempotency-Key returns existing order without deducting stock again (stock: ${stockAfterIdem2})`
  );

  // 5. Order Cancellation & Stock Restoration
  const placedOrderId = normalJson.order.id;
  const stockBeforeCancel = (await fetch(`${baseUrl}/api/products/prod-wallet-01`).then((r) => r.json())).product.stock;

  const cancelRes1 = await fetch(`${baseUrl}/api/orders/${placedOrderId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ shippingStatus: 'Cancelled' }),
  });
  const cancelJson1 = await cancelRes1.json();
  const stockAfterCancel1 = (await fetch(`${baseUrl}/api/products/prod-wallet-01`).then((r) => r.json())).product.stock;

  assert(
    cancelRes1.status === 200 &&
      cancelJson1.success === true &&
      cancelJson1.order?.shippingStatus === 'Cancelled' &&
      stockAfterCancel1 === stockBeforeCancel + 1,
    `B.7 Order cancellation restores stock exactly once (+1, from ${stockBeforeCancel} to ${stockAfterCancel1})`
  );

  // 6. Duplicate Cancellation Prevention
  const cancelRes2 = await fetch(`${baseUrl}/api/orders/${placedOrderId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ shippingStatus: 'Cancelled' }),
  });
  const stockAfterCancel2 = (await fetch(`${baseUrl}/api/products/prod-wallet-01`).then((r) => r.json())).product.stock;

  assert(
    cancelRes2.status === 200 && stockAfterCancel2 === stockAfterCancel1,
    `B.8 Duplicate cancellation does NOT restore stock a second time (stock remains ${stockAfterCancel2})`
  );

  // Cancel the idempotency order too to restore its stock
  await fetch(`${baseUrl}/api/orders/${idemJson1.order.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ shippingStatus: 'Cancelled' }),
  });

  const baselineStock = (await fetch(`${baseUrl}/api/products/prod-wallet-01`).then((r) => r.json())).product.stock;
  assert(
    baselineStock === initialStock,
    `B.9 Stock is accurately restored to initial baseline (${initialStock})`
  );

  // ================================================================
  // PART C: CONCURRENT ORDER RACE FOR LAST UNIT
  // ================================================================
  console.log('\n--- PART C: CONCURRENT ORDER RACE FOR LAST UNIT ---');

  // Set up product with stock = 1
  await fetch(`${baseUrl}/api/products/prod-wallet-01`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ stock: 1 }),
  });

  const check1Unit = (await fetch(`${baseUrl}/api/products/prod-wallet-01`).then((r) => r.json())).product.stock;
  assert(check1Unit === 1, 'C.1 Product stock verified at exactly 1 unit before concurrent race');

  // Fire two concurrent orders for 1 unit at the exact same moment
  const raceOrderA = {
    customer: { fullName: 'Racer A', phone: '01700112233', fullAddress: 'Dhaka', deliveryZone: 'inside_dhaka' },
    items: [{ product: { id: 'prod-wallet-01' }, quantity: 1 }],
    paymentMethod: 'COD',
  };
  const raceOrderB = {
    customer: { fullName: 'Racer B', phone: '01700445566', fullAddress: 'Dhaka', deliveryZone: 'inside_dhaka' },
    items: [{ product: { id: 'prod-wallet-01' }, quantity: 1 }],
    paymentMethod: 'COD',
  };

  const [raceResA, raceResB] = await Promise.all([
    fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.0.1.1' },
      body: JSON.stringify(raceOrderA),
    }),
    fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.0.1.2' },
      body: JSON.stringify(raceOrderB),
    }),
  ]);

  const [raceJsonA, raceJsonB] = await Promise.all([raceResA.json(), raceResB.json()]);

  const successCount = [raceResA.status === 201, raceResB.status === 201].filter(Boolean).length;
  const rejectedCount = [raceResA.status === 400, raceResB.status === 400].filter(Boolean).length;

  assert(
    successCount === 1 && rejectedCount === 1,
    `C.2 Concurrent race for last unit: Exactly 1 order succeeded (201), exactly 1 was rejected (400) [success: ${successCount}, rejected: ${rejectedCount}]`
  );

  const postRaceStock = (await fetch(`${baseUrl}/api/products/prod-wallet-01`).then((r) => r.json())).product.stock;
  assert(
    postRaceStock === 0,
    `C.3 Product stock after concurrent race is exactly 0 (not negative: ${postRaceStock})`
  );

  // Restore the winning order and verify stock restored back to baseline
  const winningOrderId = raceJsonA.order?.id || raceJsonB.order?.id;
  if (winningOrderId) {
    await fetch(`${baseUrl}/api/orders/${winningOrderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ shippingStatus: 'Cancelled' }),
    });
  }

  // Restore original initialStock value
  await fetch(`${baseUrl}/api/products/prod-wallet-01`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ stock: initialStock }),
  });

  const finalStock = (await fetch(`${baseUrl}/api/products/prod-wallet-01`).then((r) => r.json())).product.stock;
  assert(
    finalStock === initialStock,
    `C.4 Product stock safely reset to original baseline (${initialStock})`
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runInventoryConcurrencyVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
