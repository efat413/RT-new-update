/**
 * Unit Regression Test Suite for Part 8 Critical Fixes (Batch 1)
 * 1. Bug #1: Stock Restoration on Order Cancellation (updateOrderInD1)
 * 2. Bug #2: Advance Payment Spoofing Protection (insertOrder & POST /api/orders)
 */

import { insertOrder, updateOrderInD1 } from '../src/server/db';
import { Order } from '../src/server/types';

// In-Memory D1 Mock Database for precise state verification
class MockD1Database {
  public products: Map<string, any> = new Map();
  public orders: Map<string, any> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.products.clear();
    this.orders.clear();

    this.products.set('prod-test-1', {
      id: 'prod-test-1',
      title: 'Premium Test Watch',
      price: 1000,
      buying_price: 600,
      stock: 10,
      category_id: 'cat-accessories',
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
        if (q.includes('FROM store_settings')) {
          return {
            id: 'default',
            settings_json: JSON.stringify({ insideDhakaFee: 80, outsideDhakaFee: 150 }),
            updated_at: new Date().toISOString(),
          } as T;
        }
        if (q.includes('FROM coupons')) {
          return null as T;
        }
        if (q.includes('FROM products WHERE id = ?')) {
          const p = this.products.get(boundArgs[0]);
          return p ? ({ ...p } as T) : (null as T);
        }
        if (q.includes('FROM orders WHERE id = ?') || q.includes('FROM orders WHERE order_number = ?')) {
          const o = this.orders.get(boundArgs[0]);
          return o ? ({ ...o } as T) : (null as T);
        }
        if (q.includes('SELECT COUNT(*) as count FROM orders')) {
          return { count: 0 } as T;
        }
        return null as T;
      },
      all: async <T = any>() => {
        if (q.includes('SELECT') && q.includes('FROM products WHERE id IN')) {
          const results = boundArgs.map((id) => this.products.get(id)).filter(Boolean);
          return { results } as any;
        }
        return { results: [] } as any;
      },
      run: async () => {
        // Stock restoration statement: UPDATE products SET stock = stock + ? ... WHERE id = ?
        if (q.includes('UPDATE products SET stock = stock + ?')) {
          const [qty, prodId] = boundArgs;
          const p = this.products.get(prodId);
          if (p) {
            p.stock += Number(qty);
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, error: 'Product not found', meta: { changes: 0 } };
        }

        // Stock deduction statement: UPDATE products SET stock = CASE WHEN stock >= ? ...
        if (q.includes('UPDATE products SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE -1 END')) {
          const [minQty, deductQty, prodId] = boundArgs;
          const p = this.products.get(prodId);
          if (!p) return { success: false, error: 'Product not found', meta: { changes: 0 } };
          if (p.stock < minQty) {
            return { success: false, error: 'INSUFFICIENT_STOCK', meta: { changes: 0 } };
          }
          p.stock -= Number(deductQty);
          return { success: true, meta: { changes: 1 } };
        }

        // Conditional atomic cancellation transition:
        // UPDATE orders SET shipping_status = 'Cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shipping_status != 'Cancelled'
        if (q.includes("UPDATE orders SET shipping_status = 'Cancelled'") && q.includes("shipping_status != 'Cancelled'")) {
          const [orderId] = boundArgs;
          const o = this.orders.get(orderId);
          if (!o) return { success: false, error: 'Order not found', meta: { changes: 0 } };
          if (o.shipping_status === 'Cancelled') {
            // Already cancelled - atomic transition must fail/report 0 changes!
            return { success: true, meta: { changes: 0 } };
          }
          o.shipping_status = 'Cancelled';
          return { success: true, meta: { changes: 1 } };
        }

        // Conditional atomic un-cancel transition:
        // UPDATE orders SET shipping_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shipping_status = 'Cancelled'
        if (q.includes("UPDATE orders SET shipping_status = ?") && q.includes("shipping_status = 'Cancelled'")) {
          const [targetStatus, orderId] = boundArgs;
          const o = this.orders.get(orderId);
          if (!o) return { success: false, error: 'Order not found', meta: { changes: 0 } };
          if (o.shipping_status !== 'Cancelled') {
            return { success: true, meta: { changes: 0 } };
          }
          o.shipping_status = targetStatus;
          return { success: true, meta: { changes: 1 } };
        }

        // General UPDATE orders SET ...
        if (q.startsWith('UPDATE orders SET')) {
          const orderId = boundArgs[boundArgs.length - 1];
          const existing = this.orders.get(orderId);
          if (existing) {
            // Update fields from bindings
            this.orders.set(orderId, {
              ...existing,
              customer_name: boundArgs[0],
              customer_phone: boundArgs[1],
              customer_address: boundArgs[2],
              items_json: boundArgs[6],
              subtotal: boundArgs[7],
              delivery_fee: boundArgs[8],
              total_amount: boundArgs[9],
              shipping_status: boundArgs[15],
              advance_payment: boundArgs[26],
              advance_payment_method: boundArgs[27],
              advance_payment_note: boundArgs[28],
              updated_at: new Date().toISOString(),
            });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, error: 'Order not found', meta: { changes: 0 } };
        }

        // INSERT INTO orders
        if (q.startsWith('INSERT INTO orders')) {
          const [
            id, order_number, user_id, user_email,
            customer_name, customer_phone, customer_address, customer_district, customer_zone, customer_notes,
            items_json, subtotal, delivery_fee, total_amount, coupon_code, discount_amount,
            payment_method, payment_status, transaction_id,
            shipping_status, courier_name, courier_waybill, consignment_id, courier_status,
            courier_booking_json, dbbl_details_json, card_details_json, last_courier_sync,
            total_cost, total_profit,
            advance_payment, advance_payment_method, advance_payment_note, advance_payment_updated_at, advance_payment_updated_by
          ] = boundArgs;

          this.orders.set(id, {
            id, order_number, user_id, user_email,
            customer_name, customer_phone, customer_address, customer_district, customer_zone, customer_notes,
            items_json, subtotal, delivery_fee, total_amount, coupon_code, discount_amount,
            payment_method, payment_status, transaction_id,
            shipping_status, courier_name, courier_waybill, consignment_id, courier_status,
            courier_booking_json, dbbl_details_json, card_details_json, last_courier_sync,
            total_cost, total_profit,
            advance_payment, advance_payment_method, advance_payment_note, advance_payment_updated_at, advance_payment_updated_by,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return { success: true, meta: { changes: 1 } };
        }

        return { success: true, meta: { changes: 1 } };
      },
    };

    return stmt;
  }

  async batch(statements: any[]) {
    const results = [];
    for (const stmt of statements) {
      const res = await stmt.run();
      results.push(res);
      if (!res.success) {
        return results;
      }
    }
    return results;
  }
}

async function runRegressionSuite() {
  console.log('================================================================');
  console.log('PART 8 CRITICAL FIX REGRESSION VERIFICATION (BATCH 1)');
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

  const db = new MockD1Database() as any;

  // ==================================================================
  // TEST GROUP 1: BUG #1 - STOCK RESTORATION ON ORDER CANCELLATION
  // ==================================================================
  console.log('--- TEST GROUP 1: Stock Restoration on Cancellation (updateOrderInD1) ---');

  // Place initial order for 2 units
  const initialOrder: Order = {
    id: 'ord-test-cancel-1',
    orderNumber: 'RT-2026-11111111',
    customer: {
      fullName: 'Test Customer',
      phone: '01712345678',
      fullAddress: 'Dhaka, Bangladesh',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
    },
    items: [
      {
        product: { id: 'prod-test-1', title: 'Premium Test Watch', price: 1000, stock: 10 } as any,
        quantity: 2,
      },
    ],
    subtotal: 2000,
    deliveryFee: 80,
    totalAmount: 2080,
    paymentMethod: 'cod',
    paymentStatus: 'Pending',
    shippingStatus: 'Pending',
    createdAt: new Date().toISOString(),
  };

  await insertOrder(db, initialOrder);
  // Stock starts at 10, after placing order for 2 units it should be 8
  const stockAfterOrder = db.products.get('prod-test-1').stock;
  assert(stockAfterOrder === 8, 'Initial order insertion correctly deducted 2 units of stock (stock = 8)');

  // 1.1: Cancel the order via updateOrderInD1
  const updatedOrder = await updateOrderInD1(db, 'ord-test-cancel-1', {
    shippingStatus: 'Cancelled',
  });
  const stockAfterCancel = db.products.get('prod-test-1').stock;
  assert(
    stockAfterCancel === 10,
    'updateOrderInD1 accurately restored stock from 8 back to 10 upon order cancellation',
    `Expected 10, got ${stockAfterCancel}`
  );
  assert(
    updatedOrder.shippingStatus === 'Cancelled',
    'Order shippingStatus updated to Cancelled'
  );

  // 1.2: Idempotency / Concurrency Guard: A second call to cancel must NOT restore stock twice!
  await updateOrderInD1(db, 'ord-test-cancel-1', {
    shippingStatus: 'Cancelled',
  });
  const stockAfterSecondCancel = db.products.get('prod-test-1').stock;
  assert(
    stockAfterSecondCancel === 10,
    'Subsequent/concurrent cancellation does not restore stock twice (stock remains 10)',
    `Expected 10, got ${stockAfterSecondCancel}`
  );

  // 1.3: Un-cancelling an order re-deducts stock
  await updateOrderInD1(db, 'ord-test-cancel-1', {
    shippingStatus: 'Pending',
  });
  const stockAfterUncancel = db.products.get('prod-test-1').stock;
  assert(
    stockAfterUncancel === 8,
    'Reactivating a cancelled order correctly re-deducts stock (stock is 8)',
    `Expected 8, got ${stockAfterUncancel}`
  );

  // ==================================================================
  // TEST GROUP 2: BUG #2 - ADVANCE PAYMENT SPOOFING PROTECTION
  // ==================================================================
  console.log('\n--- TEST GROUP 2: Advance Payment Spoofing Protection (insertOrder & POST /api/orders) ---');

  // 2.1: insertOrder with no options / unprivileged must force advancePayment = 0
  const spoofedOrder: Order = {
    id: 'ord-test-spoof-1',
    orderNumber: 'RT-2026-22222222',
    customer: {
      fullName: 'Spoof Attacker',
      phone: '01812345678',
      fullAddress: 'Chittagong, Bangladesh',
      district: 'Chittagong',
      deliveryZone: 'outside_dhaka',
    },
    items: [
      {
        product: { id: 'prod-test-1', title: 'Premium Test Watch', price: 1000, stock: 8 } as any,
        quantity: 1,
      },
    ],
    subtotal: 1000,
    deliveryFee: 150,
    totalAmount: 1150,
    paymentMethod: 'cod',
    paymentStatus: 'Pending',
    shippingStatus: 'Pending',
    advancePayment: 500, // Attacker injected advance payment!
    advancePaymentMethod: 'bKash',
    advancePaymentNote: 'Spoofed Transaction ID 9999',
    createdAt: new Date().toISOString(),
  };

  const savedUnprivileged = await insertOrder(db, spoofedOrder, { isPrivilegedAdmin: false });
  assert(
    savedUnprivileged.advancePayment === 0,
    'insertOrder forces advancePayment = 0 when isPrivilegedAdmin is false',
    `Expected 0, got ${savedUnprivileged.advancePayment}`
  );
  assert(
    !savedUnprivileged.advancePaymentMethod,
    'insertOrder strips advancePaymentMethod on unprivileged checkout'
  );

  // 2.2: insertOrder with isPrivilegedAdmin: true preserves advance payment for admin manual entry
  const adminManualOrder: Order = {
    id: 'ord-test-admin-1',
    orderNumber: 'RT-2026-33333333',
    customer: {
      fullName: 'Admin Direct Customer',
      phone: '01912345678',
      fullAddress: 'Sylhet, Bangladesh',
      district: 'Sylhet',
      deliveryZone: 'inside_dhaka',
    },
    items: [
      {
        product: { id: 'prod-test-1', title: 'Premium Test Watch', price: 1000, stock: 7 } as any,
        quantity: 1,
      },
    ],
    subtotal: 1000,
    deliveryFee: 80,
    totalAmount: 1080,
    paymentMethod: 'cod',
    paymentStatus: 'Pending',
    shippingStatus: 'Pending',
    advancePayment: 500,
    advancePaymentMethod: 'bKash',
    advancePaymentNote: 'Admin recorded manual advance deposit',
    createdAt: new Date().toISOString(),
  };

  const savedAdmin = await insertOrder(db, adminManualOrder, { isPrivilegedAdmin: true });
  assert(
    savedAdmin.advancePayment === 500,
    'insertOrder preserves client-supplied advancePayment strictly for authenticated admin sessions',
    `Expected 500, got ${savedAdmin.advancePayment}`
  );
  assert(
    savedAdmin.advancePaymentMethod === 'bKash',
    'insertOrder preserves advancePaymentMethod for admin'
  );

  console.log('\n================================================================');
  console.log(`REGRESSION SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
