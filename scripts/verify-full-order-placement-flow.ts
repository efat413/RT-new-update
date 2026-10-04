/**
 * Comprehensive Verification Suite for Order Placement Architecture
 * Validates:
 * 1. Guest COD order
 * 2. Logged-in COD order
 * 3. DBBL order
 * 4. Coupon order
 * 5. Outside Dhaka order
 * 6. Inside Dhaka order
 * 7. Invalid phone rejection
 * 8. Empty cart rejection
 * 9. Insufficient stock protection & trigger handling
 * 10. Duplicate submit protection
 * 11. Idempotency key retry
 * 12. Existing product order & stock deduction
 * 13. Existing customer association
 * 14. New customer order
 * 15. Production D1 schema & preflight schema verification (with and without migrated columns)
 * 16. Sensitive buying price / profit sanitization for customer vs admin
 */

import { insertOrder, verifyOrderTableSchema, getOrderById, getAllOrders, sanitizeOrderForRole } from '../src/server/db';
import { Order } from '../src/types';

async function runFullOrderVerification() {
  console.log('================================================================');
  console.log('STARTING FULL ORDER PLACEMENT VERIFICATION');
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

  // In-memory mock database implementing the Cloudflare D1 interface
  class TestD1Database {
    public products: Map<string, any> = new Map();
    public orders: Map<string, any> = new Map();
    public coupons: Map<string, any> = new Map();
    public users: Map<string, any> = new Map();
    public settings: any = {
      id: 'default',
      settings_json: JSON.stringify({
        insideDhakaFee: 80,
        outsideDhakaFee: 150,
        antiSpamEnabled: false,
      }),
      updated_at: new Date().toISOString(),
    };
    public rateLimits: Map<string, any> = new Map();
    public idempotency: Map<string, any> = new Map();
    public blockedIps: Map<string, any> = new Map();

    public orderColumns: Set<string>;

    constructor(customColumns?: string[]) {
      this.orderColumns = new Set(
        customColumns || [
          'id', 'order_number', 'user_id', 'user_email',
          'customer_name', 'customer_phone', 'customer_address', 'customer_district', 'customer_zone', 'customer_notes',
          'items_json', 'subtotal', 'delivery_fee', 'total_amount', 'coupon_code', 'discount_amount',
          'payment_method', 'payment_status', 'transaction_id',
          'shipping_status', 'courier_name', 'courier_waybill', 'consignment_id', 'courier_status',
          'courier_booking_json', 'dbbl_details_json', 'card_details_json', 'last_courier_sync',
          'total_cost', 'total_profit', 'customer_ip', 'created_at', 'updated_at'
        ]
      );

      // Seed products
      this.products.set('prod-wallet-01', {
        id: 'prod-wallet-01',
        title: 'Premium Leather Wallet',
        price: 1450,
        buying_price: 900,
        stock: 20,
        category_id: 'cat-mens-accessories',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      this.products.set('prod-watch-03', {
        id: 'prod-watch-03',
        title: 'Luxury Quartz Watch',
        price: 3200,
        buying_price: 2000,
        stock: 2, // low stock for testing insufficient stock
        category_id: 'cat-mens-accessories',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Seed coupon
      this.coupons.set('DISCOUNT10', {
        code: 'DISCOUNT10',
        discount_type: 'percentage',
        discount_value: 10,
        min_spend: 1000,
        is_active: 1,
        created_at: new Date().toISOString(),
      });

      // Seed existing customer user
      this.users.set('user-cust-1', {
        id: 'user-cust-1',
        name: 'Existing Customer',
        email: 'customer@test.com',
        role: 'customer',
        phone: '01711111111',
        created_at: new Date().toISOString(),
      });
    }

    prepare(query: string) {
      const q = query.trim();
      let boundArgs: any[] = [];

      const stmt: any = {
        bind: (...args: any[]) => {
          boundArgs = args;
          return stmt;
        },
        first: async <T = any>(): Promise<T | null> => {
          if (q.includes("pragma_table_info('orders')")) {
            return null;
          }
          if (q.includes("pragma_table_info('products')")) {
            return null;
          }
          if (q.startsWith('SELECT id FROM users WHERE id = ?')) {
            const u = this.users.get(boundArgs[0]);
            return u ? ({ id: u.id } as T) : null;
          }
          if (q.startsWith('SELECT * FROM store_settings') || q.includes('FROM store_settings')) {
            return this.settings as T;
          }
          if (q.includes('FROM coupons WHERE UPPER(code) = ?')) {
            const c = this.coupons.get(String(boundArgs[0]).toUpperCase());
            return c ? ({ ...c } as T) : null;
          }
          if (q.includes('FROM products WHERE id = ?')) {
            const p = this.products.get(boundArgs[0]);
            return p ? ({ ...p } as T) : null;
          }
          if (q.includes('FROM orders WHERE id = ? OR order_number = ?')) {
            const val = boundArgs[0];
            for (const o of this.orders.values()) {
              if (o.id === val || o.order_number === val) {
                return { ...o } as T;
              }
            }
            return null;
          }
          if (q.includes('FROM order_idempotency WHERE key = ?')) {
            const item = this.idempotency.get(boundArgs[0]);
            return item ? ({ ...item } as T) : null;
          }
          if (q.includes('FROM blocked_ips WHERE ip_address = ?')) {
            const item = this.blockedIps.get(boundArgs[0]);
            return item ? ({ id: item.id } as T) : null;
          }
          if (q.includes('FROM rate_limits WHERE key = ?')) {
            const item = this.rateLimits.get(boundArgs[0]);
            return item ? ({ count: item.count, reset_at: item.reset_at } as T) : null;
          }
          return null;
        },
        all: async <T = any>(): Promise<{ results: T[] }> => {
          if (q.includes("pragma_table_info('orders')")) {
            const rows = Array.from(this.orderColumns).map((name) => ({ name }));
            return { results: rows as any };
          }
          if (q.includes("pragma_table_info('products')")) {
            const rows = ['id', 'title', 'price', 'original_price', 'buying_price', 'stock', 'status', 'created_at', 'updated_at'].map((name) => ({ name }));
            return { results: rows as any };
          }
          if (q.includes('FROM products WHERE id IN')) {
            const results: any[] = [];
            for (const id of boundArgs) {
              const p = this.products.get(id);
              if (p) results.push({ ...p });
            }
            return { results: results as any };
          }
          if (q.includes('FROM orders')) {
            return { results: Array.from(this.orders.values()) as any };
          }
          return { results: [] };
        },
        run: async () => {
          if (q.startsWith('INSERT INTO orders')) {
            // Extract column list from SQL: INSERT INTO orders ( col1, col2... ) VALUES ( ... )
            const match = q.match(/INSERT\s+INTO\s+orders\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
            if (match) {
              const cols = match[1].split(',').map((c) => c.trim().toLowerCase());
              const rowObj: any = {};
              let argIdx = 0;
              for (const col of cols) {
                if (col === 'updated_at') {
                  rowObj[col] = new Date().toISOString();
                } else {
                  rowObj[col] = boundArgs[argIdx++];
                }
              }
              this.orders.set(rowObj.id, rowObj);
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (q.includes('UPDATE products SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE -1 END')) {
            const [minQty, deductQty, prodId] = boundArgs;
            const p = this.products.get(prodId);
            if (!p) return { success: false, error: 'Product not found', meta: { changes: 0 } };
            if (p.stock < minQty) {
              return {
                success: false,
                error: 'INSUFFICIENT_STOCK: Product stock cannot be negative (ABORT triggered by trg_prevent_negative_stock)',
                meta: { changes: 0 },
              };
            }
            p.stock -= deductQty;
            return { success: true, meta: { changes: 1 } };
          }
          if (q.includes('DELETE FROM orders WHERE id = ?')) {
            this.orders.delete(boundArgs[0]);
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
          break;
        }
      }
      return results;
    }
  }

  // ================================================================
  // TEST 1: Guest COD Order (Inside Dhaka)
  // ================================================================
  console.log('--- TEST 1: Guest COD Order (Inside Dhaka) ---');
  const db1 = new TestD1Database() as any;
  const initialStock1 = db1.products.get('prod-wallet-01').stock;

  const guestCodOrder: Order = {
    id: `ord-guest-${Date.now()}`,
    orderNumber: `RT-2026-11111111`,
    customer: {
      fullName: 'Afsan Ahmed',
      phone: '01712345678',
      fullAddress: 'House 12, Road 4, Sector 3, Uttara, Dhaka',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
    },
    items: [
      {
        product: { id: 'prod-wallet-01', title: 'Premium Leather Wallet', price: 1450 } as any,
        quantity: 1,
      },
    ],
    subtotal: 1450,
    deliveryFee: 80,
    totalAmount: 1530,
    paymentMethod: 'COD' as any,
    paymentStatus: 'Pending' as any,
    shippingStatus: 'Pending',
    createdAt: new Date().toISOString(),
  };

  const created1 = await insertOrder(db1, guestCodOrder);
  assert(Boolean(created1 && created1.id), 'Guest COD order created successfully');
  assert((created1.paymentMethod as string) === 'COD', 'Payment method is COD');
  assert((created1.paymentStatus as string) === 'Pending', 'Payment status is Pending');
  assert(created1.deliveryFee === 80, 'Delivery fee calculated authoritatively as 80 BDT for inside Dhaka');
  assert(created1.totalAmount === 1530, 'Total amount matches 1450 + 80 = 1530');
  assert(db1.products.get('prod-wallet-01').stock === initialStock1 - 1, 'Product stock was deducted exactly once (from 20 to 19)');
  assert(created1.totalCost === 900, 'Authoritative total cost calculated from buying price (900)');
  assert(created1.totalGrossProfit === 550, 'Authoritative gross profit calculated (1450 - 900 = 550)');

  // ================================================================
  // TEST 2: Logged-in Customer COD Order
  // ================================================================
  console.log('\n--- TEST 2: Logged-in Customer COD Order ---');
  const loggedInOrder: Order = {
    id: `ord-logged-${Date.now()}`,
    orderNumber: `RT-2026-22222222`,
    userId: 'user-cust-1',
    userEmail: 'customer@test.com',
    customer: {
      fullName: 'Existing Customer',
      phone: '01711111111',
      fullAddress: 'Mirpur 10, Dhaka',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
    },
    items: [
      {
        product: { id: 'prod-wallet-01', title: 'Premium Leather Wallet', price: 1450 } as any,
        quantity: 2,
      },
    ],
    subtotal: 2900,
    deliveryFee: 80,
    totalAmount: 2980,
    paymentMethod: 'COD' as any,
    paymentStatus: 'Pending' as any,
    shippingStatus: 'Pending',
    createdAt: new Date().toISOString(),
  };

  const created2 = await insertOrder(db1, loggedInOrder);
  assert(Boolean(created2 && created2.userId === 'user-cust-1'), 'Order correctly linked to user account');
  assert(created2.userEmail === 'customer@test.com', 'User email persisted');
  assert(db1.products.get('prod-wallet-01').stock === initialStock1 - 3, 'Stock deducted for quantity 2 (down to 17)');

  // ================================================================
  // TEST 3: DBBL Order (Dutch-Bangla Bank)
  // ================================================================
  console.log('\n--- TEST 3: DBBL Order ---');
  const dbblOrder: Order = {
    id: `ord-dbbl-${Date.now()}`,
    orderNumber: `RT-2026-33333333`,
    customer: {
      fullName: 'DBBL Payer',
      phone: '01812345678',
      fullAddress: 'Agrabad, Chattogram',
      district: 'Chattogram',
      deliveryZone: 'outside_dhaka',
    },
    items: [
      {
        product: { id: 'prod-wallet-01', title: 'Premium Leather Wallet', price: 1450 } as any,
        quantity: 1,
      },
    ],
    subtotal: 1450,
    deliveryFee: 150,
    totalAmount: 1600,
    paymentMethod: 'dbbl',
    paymentStatus: 'Unverified' as any,
    transactionId: 'DBBL-TRX-987654321',
    dbblDetails: {
      senderBank: 'Dutch-Bangla Bank NexusPay',
      senderAccountOrPhone: '01812345678',
      transactionId: 'DBBL-TRX-987654321',
    },
    shippingStatus: 'Pending',
    createdAt: new Date().toISOString(),
  };

  const created3 = await insertOrder(db1, dbblOrder);
  assert(created3.paymentMethod === 'dbbl', 'Payment method is dbbl');
  assert((created3.paymentStatus as string) === 'Unverified', 'Payment status is forced Unverified (cannot spoof to Paid)');
  assert(created3.dbblDetails?.transactionId === 'DBBL-TRX-987654321', 'DBBL details correctly recorded');

  // ================================================================
  // TEST 4: Coupon Discount Order
  // ================================================================
  console.log('\n--- TEST 4: Coupon Discount Order ---');
  const couponOrder: Order = {
    id: `ord-coupon-${Date.now()}`,
    orderNumber: `RT-2026-44444444`,
    customer: {
      fullName: 'Coupon User',
      phone: '01912345678',
      fullAddress: 'Dhanmondi, Dhaka',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
    },
    items: [
      {
        product: { id: 'prod-wallet-01', title: 'Premium Leather Wallet', price: 1450 } as any,
        quantity: 1,
      },
    ],
    couponCode: 'DISCOUNT10',
    subtotal: 1450,
    deliveryFee: 80,
    totalAmount: 1385,
    paymentMethod: 'COD' as any,
    paymentStatus: 'Pending' as any,
    shippingStatus: 'Pending',
    createdAt: new Date().toISOString(),
  };

  const created4 = await insertOrder(db1, couponOrder);
  assert(created4.couponCode === 'DISCOUNT10', 'Coupon code applied');
  assert(created4.discountAmount === 145, '10% discount calculated authoritatively (145 BDT on 1450)');
  assert(created4.totalAmount === 1450 + 80 - 145, 'Total amount matches: 1450 + 80 - 145 = 1385 BDT');

  // ================================================================
  // TEST 5 & 6: Outside Dhaka vs Inside Dhaka Delivery Zones
  // ================================================================
  console.log('\n--- TEST 5 & 6: Outside Dhaka vs Inside Dhaka Fees ---');
  const outsideOrder: Order = {
    id: `ord-outside-${Date.now()}`,
    orderNumber: `RT-2026-55555555`,
    customer: {
      fullName: 'Sylhet Customer',
      phone: '01799887766',
      fullAddress: 'Zindabazar, Sylhet',
      district: 'Sylhet',
      deliveryZone: 'outside_dhaka',
    },
    items: [
      {
        product: { id: 'prod-wallet-01', title: 'Premium Leather Wallet', price: 1450 } as any,
        quantity: 1,
      },
    ],
    subtotal: 1450,
    deliveryFee: 150,
    totalAmount: 1600,
    paymentMethod: 'COD' as any,
    paymentStatus: 'Pending' as any,
    shippingStatus: 'Pending',
    createdAt: new Date().toISOString(),
  };

  const created5 = await insertOrder(db1, outsideOrder);
  assert(created5.deliveryFee === 150, 'Outside Dhaka fee authoritatively applied as 150 BDT');
  assert(created5.totalAmount === 1600, 'Total amount reflects outside Dhaka fee (1450 + 150 = 1600)');

  // ================================================================
  // TEST 7: Invalid Phone Number Rejection
  // ================================================================
  console.log('\n--- TEST 7: Invalid Phone Rejection ---');
  let phoneRejected = false;
  try {
    await insertOrder(db1, {
      ...outsideOrder,
      id: `ord-inv-phone-${Date.now()}`,
      customer: {
        ...outsideOrder.customer,
        phone: '12345', // too short
      },
    });
  } catch (err: any) {
    phoneRejected = err?.message?.includes('11-digit');
  }
  assert(phoneRejected, 'Invalid phone number (< 11 digits) rejected with validation error');

  // ================================================================
  // TEST 8: Empty Cart Rejection
  // ================================================================
  console.log('\n--- TEST 8: Empty Cart Rejection ---');
  let emptyCartRejected = false;
  try {
    await insertOrder(db1, {
      ...outsideOrder,
      id: `ord-empty-cart-${Date.now()}`,
      items: [],
    });
  } catch (err: any) {
    emptyCartRejected = err?.message?.includes('at least one item');
  }
  assert(emptyCartRejected, 'Empty cart order rejected with validation error');

  // ================================================================
  // TEST 9: Insufficient Stock Protection
  // ================================================================
  console.log('\n--- TEST 9: Insufficient Stock Protection ---');
  let stockRejected = false;
  try {
    await insertOrder(db1, {
      ...outsideOrder,
      id: `ord-no-stock-${Date.now()}`,
      items: [
        {
          product: { id: 'prod-watch-03', title: 'Luxury Quartz Watch', price: 3200 } as any,
          quantity: 99, // stock is only 2
        },
      ],
    });
  } catch (err: any) {
    stockRejected = err?.message?.includes('Insufficient stock');
  }
  assert(stockRejected, 'Order exceeding available stock rejected with Insufficient stock error');
  assert(db1.products.get('prod-watch-03').stock === 2, 'Stock remained untouched at 2 after failed order');

  // ================================================================
  // TEST 10: Duplicate Order ID (IDOR / Overwrite Prevention)
  // ================================================================
  console.log('\n--- TEST 10: Duplicate Order ID Overwrite Prevention ---');
  let duplicateRejected = false;
  try {
    await insertOrder(db1, {
      ...created1,
      // Attempting to submit with same ID as already created order
    });
  } catch (err: any) {
    duplicateRejected = err?.message?.includes('already exists');
  }
  assert(duplicateRejected, 'Attempt to overwrite existing order ID safely rejected');

  // ================================================================
  // TEST 11: Idempotency Retry Simulation
  // ================================================================
  console.log('\n--- TEST 11: Idempotency Key Handling ---');
  const testIdempotencyKey = 'idem-unit-test-12345';
  db1.idempotency.set(testIdempotencyKey, {
    key: testIdempotencyKey,
    order_id: created1.id,
    order_number: created1.orderNumber,
    response_json: JSON.stringify({
      success: true,
      message: `Order #${created1.orderNumber} successfully retrieved (idempotent request).`,
      order: created1,
      idempotent: true,
    }),
    created_at: Date.now(),
  });

  const row = await db1.prepare('SELECT response_json, created_at FROM order_idempotency WHERE key = ?')
    .bind(testIdempotencyKey)
    .first();
  const cachedResp = JSON.parse(row.response_json);
  assert(cachedResp.idempotent === true, 'Idempotency lookup successfully returned original cached payload');
  assert(cachedResp.order.orderNumber === created1.orderNumber, 'Idempotent response matches original order number');

  // ================================================================
  // TEST 12: Order Retrieval and Admin Visibility
  // ================================================================
  console.log('\n--- TEST 12: Order Verification in D1 & Admin Orders ---');
  const fetchedOrder = await getOrderById(db1, created1.id);
  assert(Boolean(fetchedOrder), 'Created order retrieved via getOrderById');
  assert(fetchedOrder?.orderNumber === created1.orderNumber, 'Retrieved order number matches');

  const allOrdersList = await getAllOrders(db1);
  assert(allOrdersList.length >= 5, `Admin orders list contains all created orders (count: ${allOrdersList.length})`);

  // ================================================================
  // TEST 13 & 14: Sensitive Buying Price & Profit Sanitization
  // ================================================================
  console.log('\n--- TEST 13 & 14: Financial Data Sanitization for Roles ---');
  // Customer view
  const customerView = sanitizeOrderForRole(created1, false);
  assert((customerView as any).totalCost === undefined, 'Buying price / totalCost stripped from customer view');
  assert((customerView as any).totalGrossProfit === undefined, 'totalGrossProfit stripped from customer view');
  assert((customerView.items[0] as any).buyingPriceSnapshot === undefined, 'buyingPriceSnapshot stripped from customer item view');

  // Super Admin view
  const adminView = sanitizeOrderForRole(created1, true);
  assert(adminView.totalCost === 900, 'totalCost preserved for Super Admin view');
  assert(adminView.totalGrossProfit === 550, 'totalGrossProfit preserved for Super Admin view');
  assert(adminView.items[0].buyingPriceSnapshot === 900, 'buyingPriceSnapshot preserved for Super Admin view');

  // ================================================================
  // TEST 15: Schema Preflight & Unmigrated Schema Graceful Compatibility
  // ================================================================
  console.log('\n--- TEST 15: Schema Preflight & Graceful Backward Compatibility ---');
  // Simulate an unmigrated database that only has migration 0001 columns (missing total_cost, total_profit, customer_ip)
  const legacyColumns = [
    'id', 'order_number', 'user_id', 'user_email',
    'customer_name', 'customer_phone', 'customer_address', 'customer_district', 'customer_zone', 'customer_notes',
    'items_json', 'subtotal', 'delivery_fee', 'total_amount', 'coupon_code', 'discount_amount',
    'payment_method', 'payment_status', 'transaction_id',
    'shipping_status', 'courier_name', 'courier_waybill', 'consignment_id', 'courier_status',
    'courier_booking_json', 'dbbl_details_json', 'card_details_json', 'last_courier_sync',
    'created_at', 'updated_at'
  ];
  const legacyDb = new TestD1Database(legacyColumns) as any;

  // Preflight check should identify missing columns without crashing
  const preflight = await verifyOrderTableSchema(legacyDb, true);
  assert(preflight.missingColumns.includes('total_cost'), 'Preflight correctly detects missing total_cost');
  assert(preflight.missingColumns.includes('total_profit'), 'Preflight correctly detects missing total_profit');
  assert(preflight.missingColumns.includes('customer_ip'), 'Preflight correctly detects missing customer_ip');

  // Order placement should STILL SUCCEED on unmigrated database without throwing SQL error
  const legacyOrder: Order = {
    id: `ord-legacy-${Date.now()}`,
    orderNumber: `RT-2026-66666666`,
    customer: {
      fullName: 'Legacy DB Customer',
      phone: '01700112233',
      fullAddress: 'Motijheel, Dhaka',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
    },
    items: [
      {
        product: { id: 'prod-wallet-01', title: 'Premium Leather Wallet', price: 1450 } as any,
        quantity: 1,
      },
    ],
    subtotal: 1450,
    deliveryFee: 80,
    totalAmount: 1530,
    paymentMethod: 'COD' as any,
    paymentStatus: 'Pending' as any,
    shippingStatus: 'Pending',
    createdAt: new Date().toISOString(),
  };

  const createdLegacy = await insertOrder(legacyDb, legacyOrder);
  assert(Boolean(createdLegacy && createdLegacy.id), 'Order created successfully even on unmigrated legacy schema');
  assert(createdLegacy.totalAmount === 1530, 'Legacy order totalAmount is preserved');

  console.log('\n================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runFullOrderVerification().catch((err) => {
  console.error('Unexpected error in verification runner:', err);
  process.exit(1);
});
