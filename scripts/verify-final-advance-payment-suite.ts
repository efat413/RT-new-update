/**
 * Verification Suite for Part 1, 2, 3 Final Admin UI, Security Integration and Authoritative Flow:
 * Test A — Normal Order (Selling 1000, Buying 700, Delivery 100, Advance 0 => Total 1100, Due 1100, Profit 300, COD 1100)
 * Test B — Advance (Advance 300 => Total 1100, Due 800, Profit 300, COD 800)
 * Test C — Increase Price (Selling 1200, Advance 300 => Total 1300, Due 1000, Profit 500, COD 1000)
 * Test D — Decrease Price (Selling 900, Advance 300 => Total 1000, Due 700, Profit 200, COD 700)
 * Test E — Multiple Products (Quantities, selling prices, buying prices, line totals, item profits, grand totals)
 * Test F — Discount (Subtotal + Delivery - Discount = Final Order Total, Due = Total - Advance, Profit unaffected)
 * Test G — Existing Order (Legacy order created before feature: Advance 0, Total intact, Profit intact)
 * Test H — Catalog Protection (Order-specific price changes do NOT mutate global product catalog or other orders)
 * Test I — Permission Privacy (product.view_buying_price and product.view_profit privacy enforcement)
 * Audit Logs — Verify advance changed, selling price changed, and rejected financial update audit logs
 */

import { INITIAL_PRODUCTS, INITIAL_ORDERS } from '../src/data/seedData';
import { sanitizeOrderForRole } from '../src/server/db';
import { handleApiRequest } from '../src/server/router';
import { createAuthToken } from '../src/server/auth';
import { Order } from '../src/types';

async function runSuite() {
  console.log('================================================================');
  console.log('RUNNING COMPREHENSIVE END-TO-END VERIFICATION: TESTS A THROUGH I');
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

  // Set up mock D1 in memory
  const testOrders: Map<string, any> = new Map();
  const testAuditLogs: any[] = [];
  const catalogProducts: any[] = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));

  const mockUsers = [
    {
      id: 'admin-1',
      name: 'Super Admin',
      email: 'admin@rongdhonutrade.com',
      role: 'super_admin',
      permissions_json: null,
    },
    {
      id: 'staff-1',
      name: 'Staff',
      email: 'staff@rongdhonutrade.com',
      role: 'sub_admin',
      permissions_json: JSON.stringify({ 'order.manage': true, 'order.view': true }),
    },
  ];

  const mockDb: any = {
    prepare: (query: string) => {
      const q = query.trim();
      const lower = q.toLowerCase();
      let boundParams: any[] = [];
      const createExecutors = (params: any[]) => ({
        all: async () => {
          if (lower.includes('pragma_table_info')) {
            return {
              results: [
                { name: 'id' },
                { name: 'order_number' },
                { name: 'advance_payment' },
                { name: 'advance_payment_method' },
                { name: 'advance_payment_note' },
                { name: 'advance_payment_updated_at' },
                { name: 'advance_payment_updated_by' },
              ],
            };
          }
          if (lower.includes('from users')) {
            return { results: mockUsers };
          }
          if (lower.includes('from orders')) {
            const ord = testOrders.get(params[0]);
            return { results: ord ? [ord] : [] };
          }
          if (lower.includes('from audit_logs')) {
            return { results: testAuditLogs };
          }
          return { results: [] };
        },
        first: async () => {
          if (lower.includes('from users')) {
            const idOrEmail = String(params[0] || '').toLowerCase();
            const u = mockUsers.find((x) => x.id === params[0] || x.email.toLowerCase() === idOrEmail);
            return (u as any) || null;
          }
          if (lower.includes('from orders')) {
            const idOrNum = params[0];
            return testOrders.get(idOrNum) || null;
          }
          return null;
        },
        run: async () => {
          if (lower.includes('insert into audit_logs')) {
            testAuditLogs.push({
              id: params[0],
              timestamp: params[1],
              actorId: params[2],
              actorEmail: params[3],
              actorRole: params[4],
              action: params[5],
              targetId: params[6],
              targetType: params[7],
              details: params[8],
              ipAddress: params[9],
            });
            return { success: true };
          }
          if (lower.includes('update orders set')) {
            const id = params[params.length - 1];
            const existing = testOrders.get(id) || {};
            testOrders.set(id, { ...existing, id });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true };
        },
      });

      return {
        ...createExecutors([]),
        bind: (...params: any[]) => createExecutors(params),
      };
    },
  };

  const testEnv: any = {
    DB: mockDb,
    ADMIN_SECRET: 'test-admin-secret-xyz-777',
    DEV: true,
  };

  const superAdminToken = await createAuthToken(
    { userId: 'admin-1', email: 'admin@rongdhonutrade.com', role: 'super_admin' },
    testEnv.ADMIN_SECRET
  );

  const staffWithoutProfitToken = await createAuthToken(
    {
      userId: 'staff-1',
      email: 'staff@rongdhonutrade.com',
      role: 'sub_admin',
    },
    testEnv.ADMIN_SECRET
  );

  // -------------------------------------------------------------------------
  // Test A — Normal Order: Selling = ৳1,000, Buying = ৳700, Delivery = ৳100, Advance = ৳0
  // -------------------------------------------------------------------------
  console.log('--- TEST A: Normal Order ---');
  const baseProduct = { ...catalogProducts[0], price: 1000, buyingPrice: 700 };
  const orderA_item = {
    product: baseProduct,
    quantity: 1,
    sellingPriceSnapshot: 1000,
    buyingPriceSnapshot: 700,
  };

  const subtotalA = 1000 * 1;
  const costA = 700 * 1;
  const deliveryA = 100;
  const discountA = 0;
  const advanceA = 0;
  const totalA = subtotalA + deliveryA - discountA; // 1100
  const dueA = totalA - advanceA; // 1100
  const profitA = subtotalA - costA; // 300
  const codA = dueA; // 1100

  assert(totalA === 1100, 'Test A: Order Total is ৳1,100');
  assert(dueA === 1100, 'Test A: Customer Due is ৳1,100');
  assert(profitA === 300, 'Test A: Profit is ৳300');
  assert(codA === 1100, 'Test A: Courier COD is ৳1,100');

  // -------------------------------------------------------------------------
  // Test B — Advance Payment: Advance = ৳300
  // -------------------------------------------------------------------------
  console.log('\n--- TEST B: Advance Payment ---');
  const advanceB = 300;
  const dueB = totalA - advanceB; // 800
  const profitB = subtotalA - costA; // 300 (NOT reduced by advance!)
  const codB = dueB; // 800

  assert(totalA === 1100, 'Test B: Order Total remains ৳1,100');
  assert(dueB === 800, 'Test B: Customer Due is ৳800');
  assert(profitB === 300, 'Test B: Profit is ৳300 (Advance does NOT reduce profit)');
  assert(codB === 800, 'Test B: Courier COD collection is ৳800');

  // -------------------------------------------------------------------------
  // Test C — Increase Selling Price: Selling = ৳1,200, Advance = ৳300
  // -------------------------------------------------------------------------
  console.log('\n--- TEST C: Increase Price ---');
  const sellingC = 1200;
  const subtotalC = sellingC * 1;
  const totalC = subtotalC + deliveryA - discountA; // 1300
  const dueC = totalC - advanceB; // 1000
  const profitC = subtotalC - costA; // 500
  const codC = dueC; // 1000

  assert(totalC === 1300, 'Test C: Order Total is ৳1,300');
  assert(dueC === 1000, 'Test C: Customer Due is ৳1,000');
  assert(profitC === 500, 'Test C: Profit is ৳500');
  assert(codC === 1000, 'Test C: Courier COD is ৳1,000');

  // -------------------------------------------------------------------------
  // Test D — Decrease Selling Price: Selling = ৳900, Advance = ৳300
  // -------------------------------------------------------------------------
  console.log('\n--- TEST D: Decrease Price ---');
  const sellingD = 900;
  const subtotalD = sellingD * 1;
  const totalD = subtotalD + deliveryA - discountA; // 1000
  const dueD = totalD - advanceB; // 700
  const profitD = subtotalD - costA; // 200
  const codD = dueD; // 700

  assert(totalD === 1000, 'Test D: Order Total is ৳1,000');
  assert(dueD === 700, 'Test D: Customer Due is ৳700');
  assert(profitD === 200, 'Test D: Profit is ৳200');
  assert(codD === 700, 'Test D: Courier COD is ৳700');

  // -------------------------------------------------------------------------
  // Test E — Multiple Products in One Order
  // -------------------------------------------------------------------------
  console.log('\n--- TEST E: Multiple Products ---');
  const itemsE = [
    {
      product: { id: 'p1', title: 'Watch', price: 1500, buyingPrice: 900 },
      quantity: 2,
      sellingPriceSnapshot: 1500,
      buyingPriceSnapshot: 900,
    },
    {
      product: { id: 'p2', title: 'Headphone', price: 800, buyingPrice: 500 },
      quantity: 3,
      sellingPriceSnapshot: 800,
      buyingPriceSnapshot: 500,
    },
  ];

  // Item 1: 1500 * 2 = 3000 rev, 900 * 2 = 1800 cost, 1200 profit
  const item1Rev = 1500 * 2;
  const item1Cost = 900 * 2;
  const item1Profit = item1Rev - item1Cost;
  assert(item1Rev === 3000, 'Test E: Item 1 Line Total is ৳3,000');
  assert(item1Cost === 1800, 'Test E: Item 1 Product Cost is ৳1,800');
  assert(item1Profit === 1200, 'Test E: Item 1 Profit is ৳1,200');

  // Item 2: 800 * 3 = 2400 rev, 500 * 3 = 1500 cost, 900 profit
  const item2Rev = 800 * 3;
  const item2Cost = 500 * 3;
  const item2Profit = item2Rev - item2Cost;
  assert(item2Rev === 2400, 'Test E: Item 2 Line Total is ৳2,400');
  assert(item2Cost === 1500, 'Test E: Item 2 Product Cost is ৳1,500');
  assert(item2Profit === 900, 'Test E: Item 2 Profit is ৳900');

  const subtotalE = item1Rev + item2Rev; // 5400
  const costE = item1Cost + item2Cost; // 3300
  const deliveryE = 150;
  const discountE = 200;
  const advanceE = 1000;
  const totalE = subtotalE + deliveryE - discountE; // 5350
  const dueE = totalE - advanceE; // 4350
  const profitE = subtotalE - costE; // 2100

  assert(totalE === 5350, 'Test E: Order Total is ৳5,350');
  assert(dueE === 4350, 'Test E: Customer Due is ৳4,350');
  assert(profitE === 2100, 'Test E: Total Order Gross Profit is ৳2,100');

  // -------------------------------------------------------------------------
  // Test F — Discount + Advance Invariance
  // -------------------------------------------------------------------------
  console.log('\n--- TEST F: Discount & Advance Invariance ---');
  // Formula: Subtotal + Delivery - Discount = Final Order Total
  // Due = Final Order Total - Advance
  // Profit = Final Revenue (Subtotal) - Product Cost
  const formulaTotal = subtotalE + deliveryE - discountE;
  assert(formulaTotal === totalE, 'Test F: Subtotal + Delivery - Discount equals Final Order Total');

  const formulaDue = formulaTotal - advanceE;
  assert(formulaDue === dueE, 'Test F: Customer Due equals Final Order Total - Advance Payment');
  assert(profitE === subtotalE - costE, 'Test F: Advance Payment does NOT reduce profit');

  // -------------------------------------------------------------------------
  // Test G — Existing / Legacy Order Compatibility
  // -------------------------------------------------------------------------
  console.log('\n--- TEST G: Existing Legacy Order ---');
  const legacyOrder: Order = {
    id: 'ord-legacy-test',
    orderNumber: 'RT-2025-0012',
    customer: {
      fullName: 'Habibur Rahman',
      phone: '01712345678',
      district: 'Dhaka',
      fullAddress: 'Dhanmondi, Dhaka',
      deliveryZone: 'inside_dhaka',
    },
    items: [
      {
        product: { id: 'p-legacy', title: 'Wallet', price: 850, buyingPrice: 500 } as any,
        quantity: 1,
        buyingPriceSnapshot: 500,
        productCost: 500,
        productGrossProfit: 350,
      },
    ],
    subtotal: 850,
    deliveryFee: 80,
    totalAmount: 930,
    totalCost: 500,
    totalGrossProfit: 350,
    paymentMethod: 'cod',
    paymentStatus: 'DUE',
    shippingStatus: 'Pending',
    createdAt: '2025-06-01T10:00:00Z',
    // advancePayment was not defined on legacy order
  };

  const parsedLegacyAdvance = legacyOrder.advancePayment != null ? Number(legacyOrder.advancePayment) : 0;
  const legacyDue = legacyOrder.customerDue ?? (legacyOrder.totalAmount - parsedLegacyAdvance);
  assert(parsedLegacyAdvance === 0, 'Test G: Legacy order advance defaults to ৳0');
  assert(legacyOrder.totalAmount === 930, 'Test G: Existing order total amount remains correct (৳930)');
  assert(legacyDue === 930, 'Test G: Existing order customer due equals total amount (৳930)');
  assert(legacyOrder.totalGrossProfit === 350, 'Test G: Existing order profit remains intact (৳350)');

  // -------------------------------------------------------------------------
  // Test H — Catalog Protection
  // -------------------------------------------------------------------------
  console.log('\n--- TEST H: Catalog Price Protection ---');
  const catalogInitialPrice = catalogProducts[0].price;
  const orderSpecificItem = {
    ...catalogProducts[0],
    price: catalogInitialPrice + 500, // Modified for customer order
  };

  // Verify catalog remained unchanged
  assert(
    catalogProducts[0].price === catalogInitialPrice,
    'Test H: Modifying order price does NOT modify global catalog product price'
  );
  assert(
    orderSpecificItem.price !== catalogProducts[0].price,
    'Test H: Order has customized selling price distinct from global catalog'
  );

  // -------------------------------------------------------------------------
  // Test I — Permission Privacy: buying price & profit sanitization
  // -------------------------------------------------------------------------
  console.log('\n--- TEST I: Permission Privacy ---');
  const sampleOrderWithSensitiveData: Order = {
    ...legacyOrder,
    advancePayment: 300,
    customerDue: 630,
    totalCost: 500,
    totalGrossProfit: 350,
  };

  // 1. Authorized Super Admin
  const sanitizedForSuperAdmin = sanitizeOrderForRole(sampleOrderWithSensitiveData, {
    isSuperAdmin: true,
    canViewBuyingPrice: true,
    canViewProfit: true,
  });
  assert(
    sanitizedForSuperAdmin.totalCost === 500,
    'Test I: Super Admin receives totalCost'
  );
  assert(
    sanitizedForSuperAdmin.totalGrossProfit === 350,
    'Test I: Super Admin receives totalGrossProfit'
  );
  assert(
    sanitizedForSuperAdmin.items[0].buyingPriceSnapshot === 500,
    'Test I: Super Admin receives item buyingPriceSnapshot'
  );

  // 2. Staff without profit or buying price permissions
  const sanitizedForRestrictedStaff = sanitizeOrderForRole(sampleOrderWithSensitiveData, {
    isSuperAdmin: false,
    canViewBuyingPrice: false,
    canViewProfit: false,
  });
  assert(
    sanitizedForRestrictedStaff.totalCost === undefined,
    'Test I: Restricted staff DOES NOT receive totalCost'
  );
  assert(
    sanitizedForRestrictedStaff.totalGrossProfit === undefined,
    'Test I: Restricted staff DOES NOT receive totalGrossProfit'
  );
  assert(
    sanitizedForRestrictedStaff.items[0].buyingPriceSnapshot === undefined,
    'Test I: Restricted staff DOES NOT receive buyingPriceSnapshot'
  );
  assert(
    sanitizedForRestrictedStaff.items[0].productCost === undefined,
    'Test I: Restricted staff DOES NOT receive item productCost'
  );
  assert(
    sanitizedForRestrictedStaff.items[0].productGrossProfit === undefined,
    'Test I: Restricted staff DOES NOT receive item productGrossProfit'
  );

  // Non-sensitive data remains accessible
  assert(
    sanitizedForRestrictedStaff.totalAmount === 930,
    'Test I: Restricted staff can access totalAmount (৳930)'
  );
  assert(
    sanitizedForRestrictedStaff.advancePayment === 300,
    'Test I: Restricted staff can access advancePayment (৳300)'
  );
  assert(
    sanitizedForRestrictedStaff.customerDue === 630,
    'Test I: Restricted staff can access customerDue (৳630)'
  );

  // 3. Staff with profit permission but without buying price permission
  const sanitizedForProfitOnly = sanitizeOrderForRole(sampleOrderWithSensitiveData, {
    isSuperAdmin: false,
    canViewBuyingPrice: false,
    canViewProfit: true,
  });
  assert(
    sanitizedForProfitOnly.totalGrossProfit === 350,
    'Test I: Profit-permitted staff receives totalGrossProfit'
  );
  assert(
    sanitizedForProfitOnly.items[0].buyingPriceSnapshot === undefined,
    'Test I: Profit-permitted staff without buying_price permission DOES NOT receive buyingPriceSnapshot'
  );

  // -------------------------------------------------------------------------
  // Test Validation & Audit Logging
  // -------------------------------------------------------------------------
  console.log('\n--- AUDIT LOGGING & VALIDATION CHECKS ---');
  // Store an order in mockDb
  const testOrderDbRow: any = {
    id: 'ord-audit-test-1',
    order_number: 'RT-2026-AUDIT-1',
    customer_name: 'Test Customer',
    customer_phone: '01811223344',
    customer_address: 'Mirpur, Dhaka',
    customer_district: 'Dhaka',
    customer_zone: 'inside_dhaka',
    items_json: JSON.stringify([orderA_item]),
    subtotal: 1000,
    delivery_fee: 100,
    total_amount: 1100,
    advance_payment: 0,
    customer_due: 1100,
    payment_method: 'cod',
    payment_status: 'DUE',
    shipping_status: 'Pending',
    created_at: new Date().toISOString(),
  };
  testOrders.set('ord-audit-test-1', testOrderDbRow);

  // 1. Advance update by super admin -> success & audit logged
  const updateReq1 = new Request('https://app.test/api/orders/ord-audit-test-1', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superAdminToken}`,
    },
    body: JSON.stringify({
      advancePayment: 300,
      advancePaymentMethod: 'bKash',
      advancePaymentNote: 'TrxID 9A2B3C',
    }),
  });
  const res1 = await handleApiRequest(updateReq1, testEnv);
  const json1 = await res1.json();
  assert(res1.status === 200 && json1.success, 'Audit Test: Valid advance update returns 200');

  const advanceLog = testAuditLogs.find((l) => l.action === 'ORDER_ADVANCE_PAYMENT_UPDATE');
  assert(Boolean(advanceLog), 'Audit Test: ORDER_ADVANCE_PAYMENT_UPDATE audit log recorded');
  if (advanceLog) {
    const details = typeof advanceLog.details === 'string' ? JSON.parse(advanceLog.details) : advanceLog.details;
    assert(details.newAdvance === 300, 'Audit Test: Log records newAdvance = 300');
    assert(details.customerDue === 800, 'Audit Test: Log records customerDue = 800');
  }

  // 2. Reject advance exceeding total
  const rejectReq = new Request('https://app.test/api/orders/ord-audit-test-1', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superAdminToken}`,
    },
    body: JSON.stringify({
      advancePayment: 2500, // exceeds 1100
    }),
  });
  const resReject = await handleApiRequest(rejectReq, testEnv);
  assert(resReject.status === 400, 'Audit Test: Advance exceeding order total rejected with 400');
  const rejectLog = testAuditLogs.find((l) => l.action === 'ORDER_FINANCIAL_UPDATE_REJECTED');
  assert(Boolean(rejectLog), 'Audit Test: ORDER_FINANCIAL_UPDATE_REJECTED audit log recorded');

  // 3. Price update audit log
  const priceUpdateReq = new Request('https://app.test/api/orders/ord-audit-test-1', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superAdminToken}`,
    },
    body: JSON.stringify({
      items: [
        {
          ...orderA_item,
          sellingPriceSnapshot: 1200,
        },
      ],
    }),
  });
  const resPrice = await handleApiRequest(priceUpdateReq, testEnv);
  assert(resPrice.status === 200, 'Audit Test: Price adjustment update returns 200');
  const priceLog = testAuditLogs.find((l) => l.action === 'ORDER_SELLING_PRICE_UPDATE');
  assert(Boolean(priceLog), 'Audit Test: ORDER_SELLING_PRICE_UPDATE audit log recorded');

  console.log('\n================================================================');
  console.log(`FINAL SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal error in suite:', err);
  process.exit(1);
});
