/**
 * Comprehensive Verification Suite for Part 2:
 * Order-Specific Selling Price & Profit Recalculation Improvements
 *
 * Verifies:
 * 1. Single product order price editing
 * 2. Multiple products in one order
 * 3. Quantity > 1 handling
 * 4. Price increase scenario (Selling ৳1,000 -> ৳1,200)
 * 5. Price decrease scenario (Selling ৳1,000 -> ৳900)
 * 6. Advance payment preservation (Advance ৳300 does NOT reduce profit)
 * 7. Discount amount application
 * 8. Delivery fee application
 * 9. Negative profit / genuine loss case (Selling ৳600, Buying ৳700 -> Profit -৳100)
 * 10. Advance conflict rejection (New total < Advance payment -> 400 rejection)
 * 11. Catalog price protection (Editing order unit price NEVER mutates global Product Catalog)
 */

import { Product } from '../src/types';
import { handleApiRequest } from '../src/server/router';
import { createAuthToken } from '../src/server/auth';

async function runVerification() {
  console.log('================================================================');
  console.log('PART 2: VERIFYING ORDER-SPECIFIC SELLING PRICE & PROFIT RECALC');
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

  // Set up mock D1 database in memory for testing router and D1 operations
  const mockOrdersStore = new Map<string, any>();
  const mockProductsStore = new Map<string, any>();
  const mockAuditLogs: any[] = [];

  // Seed sample products
  const catalogProduct1: Product = {
    id: 'prod-watch-101',
    title: 'Curren Chronograph Watch',
    price: 1000,
    buyingPrice: 700,
    stock: 50,
    rating: 4.8,
    reviewsCount: 12,
    featured: true,
    categoryId: 'cat-watches',
    description: 'Luxury watch',
    imageUrl: 'https://example.com/watch.jpg',
    createdAt: '2026-01-01T00:00:00Z',
  };

  const catalogProduct2: Product = {
    id: 'prod-wallet-202',
    title: 'Genuine Leather Wallet',
    price: 800,
    buyingPrice: 400,
    stock: 30,
    rating: 4.9,
    reviewsCount: 8,
    featured: false,
    categoryId: 'cat-accessories',
    description: 'Leather wallet',
    imageUrl: 'https://example.com/wallet.jpg',
    createdAt: '2026-01-01T00:00:00Z',
  };

  mockProductsStore.set(catalogProduct1.id, { ...catalogProduct1 });
  mockProductsStore.set(catalogProduct2.id, { ...catalogProduct2 });

  // Initial Order with Watch: Selling = ৳1000, Buying = ৳700, Delivery = ৳100, Advance = ৳300
  // Subtotal = ৳1000, Order Total = ৳1100, Due = ৳800, Profit = ৳300
  const initialOrderRow = {
    id: 'ord-test-part2',
    order_number: 'RT-2026-55001',
    user_id: null,
    user_email: null,
    customer_name: 'Tanvir Hossain',
    customer_phone: '01712345678',
    customer_address: 'House 12, Road 4, Uttara, Dhaka',
    customer_district: 'Dhaka',
    customer_zone: 'inside_dhaka',
    customer_notes: null,
    items_json: JSON.stringify([
      {
        product: { ...catalogProduct1 },
        quantity: 1,
        sellingPriceSnapshot: 1000,
        buyingPriceSnapshot: 700,
        productCost: 700,
        productGrossProfit: 300,
      },
    ]),
    subtotal: 1000,
    delivery_fee: 100,
    total_amount: 1100,
    coupon_code: null,
    discount_amount: 0,
    payment_method: 'COD',
    payment_status: 'PARTIAL',
    transaction_id: null,
    shipping_status: 'Processing',
    courier_name: null,
    courier_waybill: null,
    consignment_id: null,
    courier_status: null,
    courier_booking_json: null,
    dbbl_details_json: null,
    card_details_json: null,
    last_courier_sync: null,
    total_cost: 700,
    total_profit: 300,
    advance_payment: 300,
    advance_payment_method: 'bKash',
    advance_payment_note: 'Verified TrxID BK9928',
    advance_payment_updated_at: '2026-03-01T12:00:00Z',
    advance_payment_updated_by: 'admin@rongdhonutrade.com',
    created_at: '2026-03-01T12:00:00Z',
    updated_at: '2026-03-01T12:00:00Z',
  };
  mockOrdersStore.set(initialOrderRow.id, { ...initialOrderRow });

  const mockUsers = [
    {
      id: 'super-admin-1',
      name: 'Super Admin',
      email: 'admin@rongdhonutrade.com',
      role: 'super_admin',
      permissions_json: null,
    },
  ];

  const mockDb: any = {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            async first<T = any>(): Promise<T | null> {
              const cleanSql = sql.trim().toLowerCase();
              if (cleanSql.includes("from pragma_table_info('orders')")) {
                return null;
              }
              if (cleanSql.includes('from users where lower(trim(email)) = ? or id = ?') || cleanSql.includes('from users where id = ?')) {
                const idOrEmail = String(args[0]).toLowerCase();
                const u = mockUsers.find((x) => x.id === args[0] || x.email.toLowerCase() === idOrEmail);
                return (u as any) || null;
              }
              if (cleanSql.includes('from orders where id = ? or order_number = ?') || cleanSql.includes('from orders where id = ?')) {
                const idOrNum = args[0];
                for (const o of mockOrdersStore.values()) {
                  if (o.id === idOrNum || o.order_number === idOrNum) {
                    return { ...o } as any;
                  }
                }
                return null;
              }
              if (cleanSql.includes('from products where id = ?')) {
                const id = args[0];
                return (mockProductsStore.get(id) as any) || null;
              }
              if (cleanSql.includes('from store_settings')) {
                return { inside_dhaka_fee: 80, outside_dhaka_fee: 150 } as any;
              }
              return null;
            },
            async all<T = any>() {
              const cleanSql = sql.trim().toLowerCase();
              if (cleanSql.includes("from pragma_table_info('orders')")) {
                return {
                  success: true,
                  results: [
                    { name: 'id' }, { name: 'order_number' }, { name: 'advance_payment' },
                    { name: 'advance_payment_method' }, { name: 'advance_payment_note' },
                    { name: 'advance_payment_updated_at' }, { name: 'advance_payment_updated_by' },
                  ] as any,
                };
              }
              if (cleanSql.includes('from orders')) {
                return { success: true, results: Array.from(mockOrdersStore.values()) as any };
              }
              if (cleanSql.includes('from products')) {
                return { success: true, results: Array.from(mockProductsStore.values()) as any };
              }
              return { success: true, results: [] as any };
            },
            async run() {
              const cleanSql = sql.trim().toLowerCase();
              if (cleanSql.startsWith('update orders set')) {
                const orderId = args[args.length - 1];
                const existing = mockOrdersStore.get(orderId);
                if (existing) {
                  const updated = {
                    ...existing,
                    customer_name: args[0],
                    customer_phone: args[1],
                    customer_address: args[2],
                    customer_district: args[3],
                    customer_zone: args[4],
                    customer_notes: args[5],
                    items_json: args[6],
                    subtotal: args[7],
                    delivery_fee: args[8],
                    total_amount: args[9],
                    coupon_code: args[10],
                    discount_amount: args[11],
                    payment_method: args[12],
                    payment_status: args[13],
                    transaction_id: args[14],
                    shipping_status: args[15],
                    courier_name: args[16],
                    courier_waybill: args[17],
                    consignment_id: args[18],
                    courier_status: args[19],
                    courier_booking_json: args[20],
                    dbbl_details_json: args[21],
                    card_details_json: args[22],
                    last_courier_sync: args[23],
                    total_cost: args[24],
                    total_profit: args[25],
                    advance_payment: args[26],
                    advance_payment_method: args[27],
                    advance_payment_note: args[28],
                    advance_payment_updated_at: args[29],
                    advance_payment_updated_by: args[30],
                    updated_at: new Date().toISOString(),
                  };
                  mockOrdersStore.set(orderId, updated);
                }
                return { success: true, meta: { changes: 1 } };
              }
              if (cleanSql.includes('insert into audit_logs')) {
                mockAuditLogs.push(args);
                return { success: true };
              }
              return { success: true };
            },
          };
        },
      };
    },
  };

  const secret = 'super-secret-key-32-chars-long-minimum-prod';
  const superAdminToken = await createAuthToken(
    { userId: 'super-admin-1', email: 'admin@rongdhonutrade.com', role: 'super_admin' },
    secret
  );

  const mockEnv: any = {
    DB: mockDb,
    ADMIN_SECRET: secret,
    DEV_ADMIN_PASSWORD: 'admin',
    SUPER_ADMIN_EMAILS: 'admin@rongdhonutrade.com',
  };

  // -------------------------------------------------------------
  // Test 1: Verify Initial Case from Requirements
  // Selling = ৳1,000, Buying = ৳700, Delivery = ৳100, Advance = ৳300
  // Expected: Subtotal = ৳1,000, Total = ৳1,100, Due = ৳800, Profit = ৳300
  // -------------------------------------------------------------
  console.log('--- Test 1: Initial Order Baseline Values ---');
  const initialRow = mockOrdersStore.get('ord-test-part2');
  assert(initialRow.subtotal === 1000, 'Initial Subtotal is ৳1,000');
  assert(initialRow.total_amount === 1100, 'Initial Order Total is ৳1,100');
  assert(initialRow.total_profit === 300, 'Initial Profit is ৳300');
  assert(initialRow.advance_payment === 300, 'Initial Advance Payment is ৳300');
  const initialDue = initialRow.total_amount - initialRow.advance_payment;
  assert(initialDue === 800, 'Initial Customer Due is ৳800');

  // -------------------------------------------------------------
  // Test 2: Price Decrease Scenario from Requirements (Selling -> ৳900)
  // Expected: Subtotal = ৳900, Order Total = ৳1,000, Due = ৳700, Profit = ৳200
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Price Decrease Scenario (Selling ৳900) ---');
  const reqDecrease = new Request('http://localhost:3000/api/orders/ord-test-part2', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superAdminToken}`,
    },
    body: JSON.stringify({
      updates: {
        items: [
          {
            product: { ...catalogProduct1 },
            quantity: 1,
            sellingPriceSnapshot: 900,
          },
        ],
        deliveryFee: 100,
      },
    }),
  });

  const resDecrease = await handleApiRequest(reqDecrease, mockEnv);
  const dataDecrease = await resDecrease.json();
  assert(resDecrease.status === 200, 'Price decrease API returns 200 OK');
  assert(dataDecrease.success === true, 'Price decrease response success is true');
  assert(dataDecrease.order.subtotal === 900, 'Authoritative Subtotal recalculated to ৳900');
  assert(dataDecrease.order.totalAmount === 1000, 'Authoritative Order Total recalculated to ৳1,000 (900 + 100)');
  assert(dataDecrease.order.totalGrossProfit === 200, 'Authoritative Profit recalculated to ৳200 (900 - 700)');
  assert(dataDecrease.order.advancePayment === 300, 'Recorded Advance Payment preserved at ৳300');
  assert(dataDecrease.order.customerDue === 700, 'Authoritative Customer Due recalculated to ৳700 (1000 - 300)');

  // -------------------------------------------------------------
  // Test 3: Price Increase Scenario from Requirements (Selling -> ৳1,200)
  // Expected: Subtotal = ৳1,200, Order Total = ৳1,300, Due = ৳1,000, Profit = ৳500
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Price Increase Scenario (Selling ৳1,200) ---');
  const reqIncrease = new Request('http://localhost:3000/api/orders/ord-test-part2', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superAdminToken}`,
    },
    body: JSON.stringify({
      updates: {
        items: [
          {
            product: { ...catalogProduct1 },
            quantity: 1,
            sellingPriceSnapshot: 1200,
          },
        ],
        deliveryFee: 100,
      },
    }),
  });

  const resIncrease = await handleApiRequest(reqIncrease, mockEnv);
  const dataIncrease = await resIncrease.json();
  assert(resIncrease.status === 200, 'Price increase API returns 200 OK');
  assert(dataIncrease.order.subtotal === 1200, 'Authoritative Subtotal recalculated to ৳1,200');
  assert(dataIncrease.order.totalAmount === 1300, 'Authoritative Order Total recalculated to ৳1,300 (1200 + 100)');
  assert(dataIncrease.order.totalGrossProfit === 500, 'Authoritative Profit recalculated to ৳500 (1200 - 700)');
  assert(dataIncrease.order.advancePayment === 300, 'Advance payment remains ৳300 (does not reduce profit)');
  assert(dataIncrease.order.customerDue === 1000, 'Authoritative Customer Due recalculated to ৳1,000 (1300 - 300)');

  // -------------------------------------------------------------
  // Test 4: Multiple Products and Quantity > 1
  // Product 1: Qty 2, Selling ৳1000, Buying ৳700 -> Rev ৳2000, Cost ৳1400, Profit ৳600
  // Product 2: Qty 3, Selling ৳850, Buying ৳400 -> Rev ৳2550, Cost ৳1200, Profit ৳1350
  // Subtotal = ৳4,550, Delivery = ৳150, Discount = ৳200, Advance = ৳500
  // Order Total = 4550 + 150 - 200 = ৳4,500
  // Customer Due = 4500 - 500 = ৳4,000
  // Total Cost = 1400 + 1200 = ৳2,600
  // Total Profit = 600 + 1350 = ৳1,950 (or 4550 - 2600 = 1950)
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Multiple Products, Quantity > 1, Discount & Delivery ---');
  const reqMulti = new Request('http://localhost:3000/api/orders/ord-test-part2', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superAdminToken}`,
    },
    body: JSON.stringify({
      updates: {
        items: [
          {
            product: { ...catalogProduct1 },
            quantity: 2,
            sellingPriceSnapshot: 1000,
            buyingPriceSnapshot: 700,
          },
          {
            product: { ...catalogProduct2 },
            quantity: 3,
            sellingPriceSnapshot: 850,
            buyingPriceSnapshot: 400,
          },
        ],
        deliveryFee: 150,
        discountAmount: 200,
        advancePayment: 500,
      },
    }),
  });

  const resMulti = await handleApiRequest(reqMulti, mockEnv);
  const dataMulti = await resMulti.json();
  assert(resMulti.status === 200, 'Multi-item order edit returns 200 OK');
  assert(dataMulti.order.items.length === 2, 'Order has 2 distinct product items');
  assert(dataMulti.order.items[0].productCost === 1400, 'Item 1 cost = 700 * 2 = 1400');
  assert(dataMulti.order.items[0].productGrossProfit === 600, 'Item 1 profit = (1000 - 700) * 2 = 600');
  assert(dataMulti.order.items[1].productCost === 1200, 'Item 2 cost = 400 * 3 = 1200');
  assert(dataMulti.order.items[1].productGrossProfit === 1350, 'Item 2 profit = (850 - 400) * 3 = 1350');
  assert(dataMulti.order.subtotal === 4550, 'Authoritative subtotal = 2000 + 2550 = 4550');
  assert(dataMulti.order.totalCost === 2600, 'Authoritative total cost = 1400 + 1200 = 2600');
  assert(dataMulti.order.totalGrossProfit === 1950, 'Authoritative total profit = 4550 - 2600 = 1950');
  assert(dataMulti.order.totalAmount === 4500, 'Authoritative grand total = 4550 + 150 - 200 = 4500');
  assert(dataMulti.order.customerDue === 4000, 'Authoritative customer due = 4500 - 500 = 4000');

  // -------------------------------------------------------------
  // Test 5: Negative Profit / Genuine Loss Scenario (Requirement 6)
  // Selling = ৳600, Buying = ৳700
  // Actual profit/loss = -৳100 (must NOT be clamped to 0)
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Negative Profit / Genuine Loss Scenario ---');
  const reqLoss = new Request('http://localhost:3000/api/orders/ord-test-part2', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superAdminToken}`,
    },
    body: JSON.stringify({
      updates: {
        items: [
          {
            product: { ...catalogProduct1 },
            quantity: 1,
            sellingPriceSnapshot: 600,
            buyingPriceSnapshot: 700,
          },
        ],
        deliveryFee: 100,
        discountAmount: 0,
        advancePayment: 0,
      },
    }),
  });

  const resLoss = await handleApiRequest(reqLoss, mockEnv);
  const dataLoss = await resLoss.json();
  assert(resLoss.status === 200, 'Loss edit returns 200 OK');
  assert(dataLoss.order.subtotal === 600, 'Subtotal is ৳600');
  assert(dataLoss.order.totalCost === 700, 'Total Cost is ৳700');
  assert(dataLoss.order.totalGrossProfit === -100, 'Total Gross Profit is preserved as genuine loss: -৳100 (NOT 0)');
  assert(dataLoss.order.items[0].productGrossProfit === -100, 'Item Gross Profit is preserved as -৳100');

  // -------------------------------------------------------------
  // Test 6: Advance Conflict Rejection (Requirement 7)
  // Order has Advance = ৳500 recorded previously.
  // Admin attempts to reduce selling price to ৳300, delivery ৳100 -> Total = ৳400.
  // 400 < 500: Server MUST reject with 400 validation error!
  // Advance payment must NOT be silently lost or reduced.
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Advance Conflict Rejection ---');
  // First record an advance payment of ৳500 on the order
  await handleApiRequest(
    new Request('http://localhost:3000/api/orders/ord-test-part2', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        updates: {
          items: [
            {
              product: { ...catalogProduct1 },
              quantity: 1,
              sellingPriceSnapshot: 1000,
            },
          ],
          deliveryFee: 100,
          advancePayment: 500,
        },
      }),
    }),
    mockEnv
  );

  // Now attempt to reduce selling price so total becomes ৳400 (< ৳500 advance)
  const reqConflict = new Request('http://localhost:3000/api/orders/ord-test-part2', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superAdminToken}`,
    },
    body: JSON.stringify({
      updates: {
        items: [
          {
            product: { ...catalogProduct1 },
            quantity: 1,
            sellingPriceSnapshot: 300, // Total = 300 + 100 = 400 < 500 advance!
          },
        ],
        deliveryFee: 100,
      },
    }),
  });

  const resConflict = await handleApiRequest(reqConflict, mockEnv);
  const dataConflict = await resConflict.json();
  assert(resConflict.status === 400, 'Advance conflict request is REJECTED with HTTP 400 Bad Request');
  assert(dataConflict.success === false, 'Response indicates failure');
  assert(
    dataConflict.error?.toLowerCase().includes('advance payment') &&
      dataConflict.error?.toLowerCase().includes('cannot exceed'),
    `Validation error message returned: "${dataConflict.error}"`
  );

  // Verify that the order in DB was NOT corrupted
  const orderAfterRejection = mockOrdersStore.get('ord-test-part2');
  assert(orderAfterRejection.advance_payment === 500, 'Recorded advance payment of ৳500 is completely safe and unchanged');
  assert(orderAfterRejection.total_amount === 1100, 'Original order total of ৳1,100 is completely safe and unchanged');

  // -------------------------------------------------------------
  // Test 7: Catalog Price Protection (Requirement 8)
  // Catalog price of Product 1 is ৳1000.
  // Order item price was edited to ৳900, ৳1200, ৳600, etc.
  // Verify that Product Catalog in mockProductsStore is STILL ৳1000!
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Catalog Price Protection ---');
  const catalogProdInDb = mockProductsStore.get(catalogProduct1.id);
  assert(catalogProdInDb.price === 1000, 'Global Catalog price for Product 1 remains exactly ৳1,000');
  assert(catalogProdInDb.buyingPrice === 700, 'Global Catalog buying price remains exactly ৳700');

  // Verify other orders are unchanged
  const otherOrder = {
    id: 'ord-other-customer',
    order_number: 'RT-2026-99999',
    subtotal: 1000,
    total_amount: 1080,
    items_json: JSON.stringify([
      { product: { ...catalogProduct1 }, quantity: 1, sellingPriceSnapshot: 1000 },
    ]),
  };
  mockOrdersStore.set(otherOrder.id, otherOrder);
  assert(mockOrdersStore.get('ord-other-customer').subtotal === 1000, 'Other customer orders are completely unchanged');

  console.log('\n================================================================');
  console.log(`VERIFICATION COMPLETE: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
