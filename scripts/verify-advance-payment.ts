/**
 * Comprehensive Verification Suite for Advance Payment Foundation:
 * 1. D1 Migration 0020 syntax & master schema.sql integrity
 * 2. Order model & types extension (advancePayment, customerDue, dueAmount)
 * 3. Legacy / existing order compatibility (advancePayment = 0, profit unchanged, customerDue = total)
 * 4. Authoritative order total calculation & non-trust of frontend-supplied total
 * 5. Validation: finite number check, advance >= 0, advance <= total
 * 6. Customer due calculation: customer_due = final_order_total - advance_payment (never negative)
 * 7. Payment status synchronization (0 -> unpaid, partial -> PARTIAL, full -> Paid)
 * 8. Audit log recording via existing audit mechanism
 * 9. RBAC & authorization protection (order.manage / super_admin required)
 * 10. Financial invariants (advance is NOT discount, does NOT reduce product revenue or profit)
 */

import fs from 'fs';
import path from 'path';
import { rowToOrder } from '../src/server/db';
import { OrderRow } from '../src/server/types';
import { INITIAL_ORDERS, INITIAL_PRODUCTS } from '../src/data/seedData';
import { handleApiRequest } from '../src/server/router';
import { createAuthToken } from '../src/server/auth';

async function runVerification() {
  console.log('================================================================');
  console.log('VERIFYING ADVANCE PAYMENT BACKEND & DATABASE FOUNDATION');
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

  // -------------------------------------------------------------
  // Test 1: Verify D1 Migration 0020 file exists & has valid SQL
  // -------------------------------------------------------------
  const migrationPath = path.resolve(process.cwd(), 'migrations/0020_advance_payment.sql');
  assert(fs.existsSync(migrationPath), 'Migration file migrations/0020_advance_payment.sql exists');

  const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
  assert(
    migrationContent.includes('ALTER TABLE orders ADD COLUMN advance_payment REAL NOT NULL DEFAULT 0;') &&
    migrationContent.includes('ALTER TABLE orders ADD COLUMN advance_payment_method TEXT;') &&
    migrationContent.includes('ALTER TABLE orders ADD COLUMN advance_payment_note TEXT;') &&
    migrationContent.includes('ALTER TABLE orders ADD COLUMN advance_payment_updated_at TEXT;') &&
    migrationContent.includes('ALTER TABLE orders ADD COLUMN advance_payment_updated_by TEXT;'),
    'Migration 0020 adds all required advance payment columns with valid SQL ALTER statements'
  );
  assert(
    migrationContent.includes('CREATE INDEX IF NOT EXISTS idx_orders_advance_payment ON orders(advance_payment);'),
    'Migration 0020 creates index on advance_payment'
  );
  assert(
    migrationContent.includes('UPDATE orders SET advance_payment = 0 WHERE advance_payment IS NULL;'),
    'Migration 0020 sanitizes existing orders to advance_payment = 0'
  );

  // -------------------------------------------------------------
  // Test 2: Master schema.sql integrity
  // -------------------------------------------------------------
  const schemaPath = path.resolve(process.cwd(), 'schema.sql');
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  assert(
    schemaContent.includes('advance_payment REAL NOT NULL DEFAULT 0') &&
    schemaContent.includes('advance_payment_method TEXT') &&
    schemaContent.includes('advance_payment_note TEXT') &&
    schemaContent.includes('advance_payment_updated_at TEXT') &&
    schemaContent.includes('advance_payment_updated_by TEXT') &&
    schemaContent.includes('idx_orders_advance_payment'),
    'Master schema.sql contains advance payment columns and index in orders table'
  );

  // -------------------------------------------------------------
  // Test 3: Existing / Legacy Order Compatibility (advance_payment behaves as 0)
  // -------------------------------------------------------------
  const legacyRow: OrderRow = {
    id: 'ord-legacy-test',
    order_number: 'RT-2026-990001',
    user_id: null,
    user_email: null,
    customer_name: 'Karim Ullah',
    customer_phone: '01711223344',
    customer_address: 'House 5, Road 2, Mirpur 10, Dhaka',
    customer_district: 'Dhaka',
    customer_zone: 'inside_dhaka',
    customer_notes: null,
    items_json: JSON.stringify([{
      product: INITIAL_PRODUCTS[0],
      quantity: 1,
      buyingPriceSnapshot: 1000,
      productCost: 1000,
      productGrossProfit: 800,
    }]),
    subtotal: 1800,
    delivery_fee: 80,
    total_amount: 1880,
    coupon_code: null,
    discount_amount: 0,
    payment_method: 'COD',
    payment_status: 'DUE',
    transaction_id: null,
    shipping_status: 'Pending',
    courier_name: null,
    courier_waybill: null,
    consignment_id: null,
    courier_status: null,
    courier_booking_json: null,
    dbbl_details_json: null,
    card_details_json: null,
    last_courier_sync: null,
    total_cost: 1000,
    total_profit: 800,
    // Legacy order has NULL advance_payment fields:
    advance_payment: null,
    advance_payment_method: null,
    advance_payment_note: null,
    advance_payment_updated_at: null,
    advance_payment_updated_by: null,
    created_at: '2026-03-01T12:00:00Z',
    updated_at: '2026-03-01T12:00:00Z',
  };

  const parsedLegacy = rowToOrder(legacyRow);
  assert(parsedLegacy.advancePayment === 0, 'Legacy order defaults to advancePayment = 0');
  assert(parsedLegacy.customerDue === 1880, 'Legacy order customerDue equals totalAmount (1880)');
  assert(parsedLegacy.dueAmount === 1880, 'Legacy order dueAmount alias equals customerDue (1880)');
  assert(parsedLegacy.totalAmount === 1880, 'Legacy order totalAmount is unchanged (1880)');
  assert(parsedLegacy.totalCost === 1000, 'Legacy order totalCost is unchanged (1000)');
  assert(parsedLegacy.totalGrossProfit === 800, 'Legacy order totalGrossProfit is unchanged (800)');
  assert(parsedLegacy.paymentStatus === 'DUE', 'Legacy order paymentStatus is unchanged (DUE)');

  // -------------------------------------------------------------
  // Test 4: Row with Advance Payment recorded
  // -------------------------------------------------------------
  const partialAdvanceRow: OrderRow = {
    ...legacyRow,
    id: 'ord-partial-test',
    order_number: 'RT-2026-990002',
    total_amount: 2500,
    payment_status: 'PARTIAL',
    advance_payment: 500,
    advance_payment_method: 'bkash',
    advance_payment_note: 'Partial ৳500 advance via bKash TrxID 99AB12',
    advance_payment_updated_at: '2026-03-02T10:00:00Z',
    advance_payment_updated_by: 'admin@rongdhonutrade.com',
  };

  const parsedPartial = rowToOrder(partialAdvanceRow);
  assert(parsedPartial.advancePayment === 500, 'Parsed advancePayment is 500');
  assert(parsedPartial.advancePaymentMethod === 'bkash', 'Parsed advancePaymentMethod is bkash');
  assert(parsedPartial.advancePaymentNote?.includes('bKash TrxID'), 'Parsed advancePaymentNote is preserved');
  assert(parsedPartial.advancePaymentUpdatedBy === 'admin@rongdhonutrade.com', 'Parsed advancePaymentUpdatedBy is preserved');
  assert(parsedPartial.customerDue === 2000, 'Server-side customerDue is correctly 2500 - 500 = 2000');
  assert(parsedPartial.dueAmount === 2000, 'dueAmount matches customerDue');
  assert(parsedPartial.totalAmount === 2500, 'totalAmount is unaffected by advance payment');
  assert(parsedPartial.totalGrossProfit === 800, 'Profit is NOT reduced by advance payment');

  // -------------------------------------------------------------
  // Test 5: Full Advance Payment (customer_due = 0)
  // -------------------------------------------------------------
  const fullAdvanceRow: OrderRow = {
    ...legacyRow,
    id: 'ord-full-test',
    order_number: 'RT-2026-990003',
    total_amount: 1500,
    payment_status: 'PAID',
    advance_payment: 1500,
    advance_payment_method: 'nagad',
  };
  const parsedFull = rowToOrder(fullAdvanceRow);
  assert(parsedFull.advancePayment === 1500, 'Full advance payment stores 1500');
  assert(parsedFull.customerDue === 0, 'Customer due is 0 when advance equals total amount');
  assert(parsedFull.dueAmount === 0, 'dueAmount is 0');

  // -------------------------------------------------------------
  // Test 6: In-Memory / Dev Mock DB Verification via Router
  // -------------------------------------------------------------
  // Construct mock in-memory D1 database to test router & security rules
  const mockOrdersStore: Map<string, any> = new Map();
  const mockAuditLogsStore: any[] = [];

  const initialOrderForApi = {
    id: 'ord-api-test-1',
    order_number: 'RT-2026-112233',
    user_id: null,
    user_email: null,
    customer_name: 'Shakib Al Hasan',
    customer_phone: '01819202122',
    customer_address: 'Banani 11, Dhaka',
    customer_district: 'Dhaka',
    customer_zone: 'inside_dhaka',
    customer_notes: null,
    items_json: JSON.stringify([{
      product: INITIAL_PRODUCTS[0],
      quantity: 1,
      buyingPriceSnapshot: 1000,
      productCost: 1000,
      productGrossProfit: 800,
    }]),
    subtotal: 1800,
    delivery_fee: 80,
    total_amount: 1880,
    coupon_code: null,
    discount_amount: 0,
    payment_method: 'COD',
    payment_status: 'Pending',
    transaction_id: null,
    shipping_status: 'Pending',
    courier_name: null,
    courier_waybill: null,
    consignment_id: null,
    courier_status: null,
    courier_booking_json: null,
    dbbl_details_json: null,
    card_details_json: null,
    last_courier_sync: null,
    total_cost: 1000,
    total_profit: 800,
    advance_payment: 0,
    advance_payment_method: null,
    advance_payment_note: null,
    advance_payment_updated_at: null,
    advance_payment_updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  mockOrdersStore.set(initialOrderForApi.id, { ...initialOrderForApi });

  const mockUsers = [
    {
      id: 'super-admin-1',
      name: 'Super Admin',
      email: 'superadmin@rongdhonutrade.com',
      role: 'super_admin',
      permissions_json: null,
    },
    {
      id: 'subadmin-manage',
      name: 'Order Manager',
      email: 'manager@rongdhonutrade.com',
      role: 'sub_admin',
      permissions_json: JSON.stringify({ 'order.manage': true, 'order.view': true }),
    },
    {
      id: 'subadmin-viewonly',
      name: 'Viewer Staff',
      email: 'viewer@rongdhonutrade.com',
      role: 'sub_admin',
      permissions_json: JSON.stringify({ 'order.view': true }),
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
              if (cleanSql.includes('from orders where id = ? or order_number = ?')) {
                const idOrNum = args[0];
                for (const o of mockOrdersStore.values()) {
                  if (o.id === idOrNum || o.order_number === idOrNum) {
                    return { ...o } as any;
                  }
                }
                return null;
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
              return { success: true, results: [] as any };
            },
            async run() {
              const cleanSql = sql.trim().toLowerCase();
              if (cleanSql.startsWith('update orders set')) {
                const orderId = args[args.length - 1];
                const existing = mockOrdersStore.get(orderId);
                if (existing) {
                  // Bind order:
                  // customer_name, customer_phone, customer_address, customer_district, customer_zone, customer_notes,
                  // items_json, subtotal, delivery_fee, total_amount, coupon_code, discount_amount,
                  // payment_method, payment_status, transaction_id, shipping_status,
                  // courier_name, courier_waybill, consignment_id, courier_status,
                  // courier_booking_json, dbbl_details_json, card_details_json, last_courier_sync,
                  // total_cost, total_profit,
                  // advance_payment, advance_payment_method, advance_payment_note, advance_payment_updated_at, advance_payment_updated_by, id
                  existing.customer_name = args[0];
                  existing.customer_phone = args[1];
                  existing.customer_address = args[2];
                  existing.customer_district = args[3];
                  existing.customer_zone = args[4];
                  existing.customer_notes = args[5];
                  existing.items_json = args[6];
                  existing.subtotal = args[7];
                  existing.delivery_fee = args[8];
                  existing.total_amount = args[9];
                  existing.coupon_code = args[10];
                  existing.discount_amount = args[11];
                  existing.payment_method = args[12];
                  existing.payment_status = args[13];
                  existing.transaction_id = args[14];
                  existing.shipping_status = args[15];
                  existing.total_cost = args[24];
                  existing.total_profit = args[25];
                  existing.advance_payment = args[26];
                  existing.advance_payment_method = args[27];
                  existing.advance_payment_note = args[28];
                  existing.advance_payment_updated_at = args[29];
                  existing.advance_payment_updated_by = args[30];
                  mockOrdersStore.set(orderId, existing);
                  return { success: true, meta: { changes: 1 } };
                }
              }
              if (cleanSql.startsWith('insert into audit_logs')) {
                mockAuditLogsStore.push({
                  id: args[0],
                  timestamp: args[1],
                  actor_id: args[2],
                  actor_email: args[3],
                  actor_role: args[4],
                  action: args[5],
                  target_id: args[6],
                  targetId: args[6],
                  target_type: args[7],
                  details_json: args[8],
                  ip_address: args[9],
                });
                return { success: true };
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };

  const mockEnv: any = {
    DB: mockDb,
    ADMIN_SECRET: 'test-admin-secret-key-1234567890',
  };

  const adminToken = await createAuthToken(
    {
      userId: 'subadmin-manage',
      email: 'manager@rongdhonutrade.com',
      role: 'sub_admin',
    },
    mockEnv.ADMIN_SECRET,
    3600
  );

  const viewOnlyToken = await createAuthToken(
    {
      userId: 'subadmin-viewonly',
      email: 'viewer@rongdhonutrade.com',
      role: 'sub_admin',
    },
    mockEnv.ADMIN_SECRET,
    3600
  );

  // -------------------------------------------------------------
  // Test 7: Unauthorized user without order.manage cannot update advance
  // -------------------------------------------------------------
  const unauthReq = new Request('http://localhost:3000/api/orders/ord-api-test-1', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${viewOnlyToken}`,
    },
    body: JSON.stringify({
      advancePayment: 300,
    }),
  });
  const unauthRes = await handleApiRequest(unauthReq, mockEnv);
  assert(unauthRes.status === 403, 'User without order.manage permission receives 403 Forbidden on advance update');

  // -------------------------------------------------------------
  // Test 8: Validation: Advance payment cannot be negative
  // -------------------------------------------------------------
  const negReq = new Request('http://localhost:3000/api/orders/ord-api-test-1', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      advancePayment: -50,
    }),
  });
  const negRes = await handleApiRequest(negReq, mockEnv);
  const negData: any = await negRes.json();
  assert(negRes.status === 400 && negData.error?.includes('negative'), 'Negative advance payment (-50) is rejected with 400 and clear error');

  // -------------------------------------------------------------
  // Test 9: Validation: Advance payment cannot exceed authoritative order total
  // -------------------------------------------------------------
  // Order total is 1880. Sending 2500 must fail.
  // Frontend might also spoof totalAmount: 5000 in payload; backend MUST ignore frontend total!
  const exceedReq = new Request('http://localhost:3000/api/orders/ord-api-test-1', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      advancePayment: 2500,
      totalAmount: 5000, // Attacker trying to spoof total to allow higher advance!
    }),
  });
  const exceedRes = await handleApiRequest(exceedReq, mockEnv);
  const exceedData: any = await exceedRes.json();
  assert(
    exceedRes.status === 400 && exceedData.error?.includes('cannot exceed authoritative order total'),
    'Advance payment exceeding order total is rejected even if client spoofs totalAmount'
  );

  // -------------------------------------------------------------
  // Test 10: Validation: Non-finite value (NaN / garbage string)
  // -------------------------------------------------------------
  const nanReq = new Request('http://localhost:3000/api/orders/ord-api-test-1', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      advancePayment: 'not_a_number',
    }),
  });
  const nanRes = await handleApiRequest(nanReq, mockEnv);
  const nanData: any = await nanRes.json();
  assert(nanRes.status === 400 && nanData.error?.includes('valid finite monetary number'), 'Non-finite advance payment string is rejected with 400');

  // -------------------------------------------------------------
  // Test 11: Valid Partial Advance Payment update & payment_status = PARTIAL
  // -------------------------------------------------------------
  const validPartialReq = new Request('http://localhost:3000/api/orders/ord-api-test-1', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      advancePayment: 500,
      advancePaymentMethod: 'bKash Merchant',
      advancePaymentNote: 'Received ৳500 advance via 01711223344',
    }),
  });
  const validPartialRes = await handleApiRequest(validPartialReq, mockEnv);
  const validPartialData: any = await validPartialRes.json();
  assert(validPartialRes.status === 200 && validPartialData.success === true, 'Authorized admin successfully updates advance payment to ৳500');
  assert(validPartialData.order?.advancePayment === 500, 'Returned order has advancePayment = 500');
  assert(validPartialData.order?.customerDue === 1380, 'Authoritative customerDue calculated as 1880 - 500 = 1380');
  assert(validPartialData.order?.paymentStatus === 'PARTIAL', 'Payment status automatically synchronized to PARTIAL');
  assert(validPartialData.order?.totalAmount === 1880, 'Total order amount remains unchanged at 1880');
  assert(validPartialData.order?.subtotal === 1800, 'Subtotal remains unchanged at 1800');

  // Verify audit log was created
  const lastAudit = mockAuditLogsStore[mockAuditLogsStore.length - 1];
  assert(
    lastAudit && lastAudit.action === 'ORDER_ADVANCE_PAYMENT_UPDATE' && lastAudit.targetId === 'ord-api-test-1',
    'Audit log was recorded for advance payment update with existing audit mechanism'
  );
  if (lastAudit) {
    const details = JSON.parse(lastAudit.details_json);
    assert(details.newAdvance === 500 && details.customerDue === 1380, 'Audit log details include authoritative advance and due values');
  }

  // -------------------------------------------------------------
  // Test 12: Storing advance = 0 (resetting advance)
  // -------------------------------------------------------------
  const zeroAdvanceReq = new Request('http://localhost:3000/api/orders/ord-api-test-1', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      advancePayment: 0,
    }),
  });
  const zeroRes = await handleApiRequest(zeroAdvanceReq, mockEnv);
  const zeroData: any = await zeroRes.json();
  assert(zeroRes.status === 200 && zeroData.success === true, 'Can store advance = 0');
  assert(zeroData.order?.advancePayment === 0, 'Returned order has advancePayment = 0');
  assert(zeroData.order?.customerDue === 1880, 'Customer due returns to 1880 when advance is reset to 0');
  assert(zeroData.order?.paymentStatus === 'DUE', 'Payment status reverts from PARTIAL to DUE when advance is 0');

  // -------------------------------------------------------------
  // Test 13: Storing full advance (due = 0 -> Paid)
  // -------------------------------------------------------------
  const fullAdvanceReq = new Request('http://localhost:3000/api/orders/ord-api-test-1', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      advancePayment: 1880,
      advancePaymentMethod: 'Bank Transfer',
    }),
  });
  const fullRes = await handleApiRequest(fullAdvanceReq, mockEnv);
  const fullData: any = await fullRes.json();
  assert(fullRes.status === 200, 'Full advance payment request succeeds');
  assert(fullData.order?.advancePayment === 1880, 'advancePayment = 1880 stored');
  assert(fullData.order?.customerDue === 0, 'customerDue is exactly 0');
  assert(fullData.order?.paymentStatus === 'Paid', 'paymentStatus synchronized to Paid when customer due is 0');

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Unhandled verification error:', err);
  process.exit(1);
});
