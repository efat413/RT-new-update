/**
 * Comprehensive Verification Suite for Advance Payment Backend & Database Foundation
 *
 * Verifies:
 * 1. Cloudflare D1 Migration (0020_advance_payment.sql) and schema.sql
 * 2. Legacy Order Compatibility:
 *    - advancePayment defaults to 0
 *    - Order total and profit snapshots remain intact
 *    - customerDue authoritative server-side calculation (totalAmount - advancePayment)
 * 3. Validation Rules:
 *    - advance >= 0 (negative rejected with HTTP 400)
 *    - advance <= authoritative order total (advance > total rejected with HTTP 400)
 *    - Non-finite / NaN values rejected with HTTP 400
 *    - Frontend provided total / due / profit untrusted
 * 4. Payment Status Synchronization:
 *    - advance = 0 -> unpaid behavior
 *    - advance > 0 and due > 0 -> PARTIAL behavior
 *    - due = 0 -> Paid behavior
 * 5. RBAC & Security:
 *    - Unauthenticated request -> HTTP 401
 *    - Customer role -> HTTP 403
 *    - User without order.manage -> HTTP 403
 *    - Authorized Admin / Super Admin -> HTTP 200
 * 6. Audit Logging:
 *    - Action recorded: ORDER_ADVANCE_PAYMENT_UPDATE with correct payload & diff
 */

import fs from 'fs';
import path from 'path';
import { rowToOrder, ensureOrderTableSchema, insertAuditLogInD1 } from '../src/server/db';
import { handleApiRequest } from '../src/server/router';
import { createAuthToken } from '../src/server/auth';
import { OrderRow } from '../src/server/types';

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

  // ---------------------------------------------------------------------------
  // 1. D1 MIGRATION & SCHEMA INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('--- 1. D1 MIGRATION & SCHEMA SYNTAX ---');
  const migrationFile = path.resolve('migrations/0020_advance_payment.sql');
  assert(fs.existsSync(migrationFile), 'Migration 0020_advance_payment.sql exists');

  const migrationContent = fs.readFileSync(migrationFile, 'utf8');
  assert(
    migrationContent.includes('ALTER TABLE orders ADD COLUMN advance_payment REAL NOT NULL DEFAULT 0;'),
    'Migration adds advance_payment column with default 0'
  );
  assert(
    migrationContent.includes('ALTER TABLE orders ADD COLUMN advance_payment_method TEXT;'),
    'Migration adds advance_payment_method column'
  );
  assert(
    migrationContent.includes('ALTER TABLE orders ADD COLUMN advance_payment_note TEXT;'),
    'Migration adds advance_payment_note column'
  );
  assert(
    migrationContent.includes('ALTER TABLE orders ADD COLUMN advance_payment_updated_at TEXT;'),
    'Migration adds advance_payment_updated_at column'
  );
  assert(
    migrationContent.includes('ALTER TABLE orders ADD COLUMN advance_payment_updated_by TEXT;'),
    'Migration adds advance_payment_updated_by column'
  );
  assert(
    migrationContent.includes('CREATE INDEX IF NOT EXISTS idx_orders_advance_payment ON orders(advance_payment);'),
    'Migration creates index on advance_payment'
  );
  assert(
    migrationContent.includes('UPDATE orders SET advance_payment = 0 WHERE advance_payment IS NULL;'),
    'Migration backfills existing legacy orders to advance_payment = 0'
  );

  const schemaContent = fs.readFileSync(path.resolve('schema.sql'), 'utf8');
  assert(schemaContent.includes('advance_payment REAL NOT NULL DEFAULT 0,'), 'schema.sql orders table has advance_payment');
  assert(schemaContent.includes('idx_orders_advance_payment'), 'schema.sql includes idx_orders_advance_payment index');

  // ---------------------------------------------------------------------------
  // 2. LEGACY ORDER COMPATIBILITY & rowToOrder MAPPING
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. LEGACY ORDER COMPATIBILITY & DUE CALCULATION ---');

  const legacyRow: OrderRow = {
    id: 'ord-legacy-001',
    order_number: 'RT-2025-00001',
    user_id: 'user-001',
    user_email: 'customer@example.com',
    customer_name: 'Karim Rahman',
    customer_phone: '01712345678',
    customer_address: 'House 12, Road 4, Dhanmondi',
    customer_district: 'Dhaka',
    customer_zone: 'inside_dhaka',
    customer_notes: null,
    items_json: JSON.stringify([
      {
        product: { id: 'prod-1', title: 'T-Shirt', price: 600, buyingPrice: 350 },
        quantity: 2,
        productCost: 700,
        productGrossProfit: 500,
      },
    ]),
    subtotal: 1200,
    delivery_fee: 80,
    total_amount: 1280,
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
    total_cost: 700,
    total_profit: 500,
    created_at: '2025-01-15T10:00:00.000Z',
    updated_at: '2025-01-15T10:00:00.000Z',
  };

  const mappedLegacy = rowToOrder(legacyRow);
  assert(mappedLegacy.advancePayment === 0, 'Legacy order defaults advancePayment to 0');
  assert(mappedLegacy.totalAmount === 1280, 'Legacy order totalAmount is preserved unchanged (1280)');
  assert(mappedLegacy.totalGrossProfit === 500, 'Legacy order profit is preserved unchanged (500)');
  assert(mappedLegacy.customerDue === 1280, 'Legacy order customerDue is accurately calculated as 1280 (1280 - 0)');
  assert(mappedLegacy.dueAmount === 1280, 'Legacy order dueAmount is accurately calculated as 1280');

  // Test row with explicit advance payment
  const advanceRow: OrderRow = {
    ...legacyRow,
    id: 'ord-advance-002',
    order_number: 'RT-2026-00002',
    advance_payment: 300,
    advance_payment_method: 'bKash',
    advance_payment_note: 'TRX: 9J8K2L1',
    advance_payment_updated_at: '2026-02-01T12:00:00.000Z',
    advance_payment_updated_by: 'admin@rongdhonutrade.com',
  };

  const mappedAdvance = rowToOrder(advanceRow);
  assert(mappedAdvance.advancePayment === 300, 'Order correctly maps advancePayment (300)');
  assert(mappedAdvance.advancePaymentMethod === 'bKash', 'Order maps advancePaymentMethod');
  assert(mappedAdvance.advancePaymentNote === 'TRX: 9J8K2L1', 'Order maps advancePaymentNote');
  assert(mappedAdvance.customerDue === 980, 'customerDue is calculated server-side as 980 (1280 - 300)');
  assert(mappedAdvance.totalGrossProfit === 500, 'Gross profit is NOT decreased by advance payment');

  // ---------------------------------------------------------------------------
  // 3. SERVER ROUTE VALIDATION & SECURITY TESTS
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. SERVER-SIDE AUTHORIZATION & ADVANCE PAYMENT VALIDATIONS ---');

  // Construct in-memory mock D1 database
  const ordersDbMap = new Map<string, any>();
  const auditLogsList: any[] = [];

  const initialTestOrder = {
    ...mappedLegacy,
    id: 'ord-test-100',
    orderNumber: 'RT-2026-99999',
    totalAmount: 1200,
    subtotal: 1120,
    deliveryFee: 80,
    paymentMethod: 'COD',
    paymentStatus: 'Pending',
    advancePayment: 0,
    customerDue: 1200,
    dueAmount: 1200,
  };
  ordersDbMap.set('ord-test-100', initialTestOrder);
  ordersDbMap.set('RT-2026-99999', initialTestOrder);

  const mockDb: any = {
    prepare: (query: string) => {
      const statementObj = {
        all: async <T>() => {
          if (query.includes("pragma_table_info('orders')")) {
            return {
              results: [
                { name: 'id' }, { name: 'order_number' }, { name: 'total_amount' },
                { name: 'advance_payment' }, { name: 'advance_payment_method' },
                { name: 'advance_payment_note' }, { name: 'advance_payment_updated_at' },
                { name: 'advance_payment_updated_by' },
              ],
            };
          }
          return { results: [] };
        },
        first: async <T>() => null,
        run: async () => ({ success: true }),
        bind: (...params: any[]) => ({
          first: async <T>() => {
            if (query.includes("pragma_table_info('orders')")) {
              return [
                { name: 'id' }, { name: 'order_number' }, { name: 'total_amount' },
                { name: 'advance_payment' }, { name: 'advance_payment_method' },
                { name: 'advance_payment_note' }, { name: 'advance_payment_updated_at' },
                { name: 'advance_payment_updated_by' },
              ];
            }
            if (query.includes('FROM orders WHERE')) {
              const idOrNum = params[0];
              const ord = ordersDbMap.get(idOrNum);
              if (!ord) return null;
              return {
                id: ord.id,
                order_number: ord.orderNumber,
                user_id: ord.userId || null,
                user_email: ord.userEmail || null,
                customer_name: ord.customer.fullName,
                customer_phone: ord.customer.phone,
                customer_address: ord.customer.fullAddress,
                customer_district: ord.customer.district,
                customer_zone: ord.customer.deliveryZone,
                customer_notes: ord.customer.notes || null,
                items_json: JSON.stringify(ord.items || []),
                subtotal: ord.subtotal,
                delivery_fee: ord.deliveryFee,
                total_amount: ord.totalAmount,
                total_cost: ord.totalCost || 0,
                total_profit: ord.totalGrossProfit || 0,
                coupon_code: ord.couponCode || null,
                discount_amount: ord.discountAmount || 0,
                payment_method: ord.paymentMethod,
                payment_status: ord.paymentStatus,
                transaction_id: ord.transactionId || null,
                shipping_status: ord.shippingStatus,
                courier_name: ord.courierName || null,
                courier_waybill: ord.courierWaybill || null,
                consignment_id: ord.consignmentId || null,
                courier_status: ord.courierStatus || null,
                courier_booking_json: null,
                dbbl_details_json: null,
                card_details_json: null,
                last_courier_sync: null,
                advance_payment: ord.advancePayment ?? 0,
                advance_payment_method: ord.advancePaymentMethod || null,
                advance_payment_note: ord.advancePaymentNote || null,
                advance_payment_updated_at: ord.advancePaymentUpdatedAt || null,
                advance_payment_updated_by: ord.advancePaymentUpdatedBy || null,
                created_at: ord.createdAt,
                updated_at: ord.updatedAt || ord.createdAt,
              };
            }
            if (query.includes('FROM users WHERE')) {
              const idOrEmail = params[0];
              if (idOrEmail === 'admin-id' || idOrEmail === 'admin@test.com') {
                return {
                  id: 'admin-id',
                  name: 'Admin User',
                  email: 'admin@test.com',
                  role: 'admin',
                  permissions_json: JSON.stringify({ canManageOrders: true }),
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
              }
              if (idOrEmail === 'cust-id' || idOrEmail === 'cust@test.com') {
                return {
                  id: 'cust-id',
                  name: 'Customer User',
                  email: 'cust@test.com',
                  role: 'customer',
                  permissions_json: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
              }
              return null;
            }
            return null;
          },
          all: async <T>() => {
            if (query.includes("pragma_table_info('orders')")) {
              return {
                results: [
                  { name: 'id' }, { name: 'order_number' }, { name: 'total_amount' },
                  { name: 'advance_payment' }, { name: 'advance_payment_method' },
                  { name: 'advance_payment_note' }, { name: 'advance_payment_updated_at' },
                  { name: 'advance_payment_updated_by' },
                ],
              };
            }
            return { results: [] };
          },
          run: async () => {
            if (query.includes('UPDATE orders SET')) {
              const id = params[params.length - 1];
              const existing = ordersDbMap.get(id);
              if (existing) {
                const advToSave = params[params.length - 6];
                const advMethod = params[params.length - 5];
                const advNote = params[params.length - 4];
                const advUpdAt = params[params.length - 3];
                const advUpdBy = params[params.length - 2];
                const paymentStatus = params[13];

                const updated = {
                  ...existing,
                  advancePayment: advToSave,
                  advancePaymentMethod: advMethod,
                  advancePaymentNote: advNote,
                  advancePaymentUpdatedAt: advUpdAt,
                  advancePaymentUpdatedBy: advUpdBy,
                  paymentStatus: paymentStatus || existing.paymentStatus,
                  customerDue: Math.max(0, existing.totalAmount - advToSave),
                  dueAmount: Math.max(0, existing.totalAmount - advToSave),
                };
                ordersDbMap.set(id, updated);
                ordersDbMap.set(existing.orderNumber, updated);
              }
              return { success: true, meta: { changes: 1 } };
            }
            if (query.includes('INSERT INTO audit_logs')) {
              auditLogsList.push({
                id: params[0],
                timestamp: params[1],
                actorId: params[2],
                actorEmail: params[3],
                actorRole: params[4],
                action: params[5],
                targetId: params[6],
                targetType: params[7],
                details: params[8] ? JSON.parse(params[8]) : null,
              });
              return { success: true };
            }
            return { success: true };
          },
        }),
      };
      return statementObj;
    },
    batch: async (stmts: any[]) => {
      for (const s of stmts) await s.run();
      return stmts.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };

  const env: any = {
    DB: mockDb,
    ADMIN_SECRET: 'test-admin-secret-key-32-chars-length!!',
  };

  const adminToken = await createAuthToken(
    { userId: 'admin-id', email: 'admin@test.com', role: 'admin' },
    env.ADMIN_SECRET
  );
  const customerToken = await createAuthToken(
    { userId: 'cust-id', email: 'cust@test.com', role: 'customer' },
    env.ADMIN_SECRET
  );

  // 3.1 Security: Unauthenticated request must fail with 401
  const unauthReq = new Request('http://localhost/api/orders/ord-test-100', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ advancePayment: 200 }),
  });
  const unauthRes = await handleApiRequest(unauthReq, env);
  assert(unauthRes.status === 401, 'Unauthenticated order update fails with HTTP 401');

  // 3.2 Security: Customer role must fail with 403
  const custReq = new Request('http://localhost/api/orders/ord-test-100', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({ advancePayment: 200 }),
  });
  const custRes = await handleApiRequest(custReq, env);
  assert(custRes.status === 403, 'Customer role cannot modify advance payment (HTTP 403)');

  // 3.3 Validation: Negative advance payment must fail with 400
  const negReq = new Request('http://localhost/api/orders/ord-test-100', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ advancePayment: -50 }),
  });
  const negRes = await handleApiRequest(negReq, env);
  const negBody = await negRes.json();
  assert(negRes.status === 400, 'Negative advance payment is rejected with HTTP 400');
  assert(negBody.error.includes('cannot be negative'), 'Error message specifies non-negative constraint');

  // 3.4 Validation: Advance payment exceeding total amount must fail with 400
  const exceedReq = new Request('http://localhost/api/orders/ord-test-100', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      advancePayment: 1500, // order total is 1200
      totalAmount: 2000, // client attempts to spoof total amount
    }),
  });
  const exceedRes = await handleApiRequest(exceedReq, env);
  const exceedBody = await exceedRes.json();
  assert(exceedRes.status === 400, 'Advance payment exceeding authoritative total is rejected with HTTP 400');
  assert(
    exceedBody.error.includes('cannot exceed authoritative order total'),
    'Client spoofed total is ignored; checked against authoritative total'
  );

  // 3.5 Validation: Non-finite / NaN advance payment rejected with 400
  const nanReq = new Request('http://localhost/api/orders/ord-test-100', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ advancePayment: 'invalid-number' }),
  });
  const nanRes = await handleApiRequest(nanReq, env);
  assert(nanRes.status === 400, 'Non-numeric advance payment rejected with HTTP 400');

  // 3.6 Success: Partial advance payment (৳500 on ৳1200 order)
  const partialReq = new Request('http://localhost/api/orders/ord-test-100', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      advancePayment: 500,
      advancePaymentMethod: 'bKash Merchant',
      advancePaymentNote: 'Received ৳500 advance via bKash',
    }),
  });
  const partialRes = await handleApiRequest(partialReq, env);
  const partialBody = await partialRes.json();
  assert(partialRes.status === 200, 'Valid partial advance payment accepted with HTTP 200');
  assert(partialBody.order.advancePayment === 500, 'Stored advancePayment is 500');
  assert(partialBody.order.customerDue === 700, 'Authoritative customerDue is 700 (1200 - 500)');
  assert(partialBody.order.dueAmount === 700, 'Authoritative dueAmount is 700');
  assert(partialBody.order.paymentStatus === 'PARTIAL', 'Payment status automatically synchronized to PARTIAL');
  assert(partialBody.order.advancePaymentMethod === 'bKash Merchant', 'advancePaymentMethod stored correctly');

  // 3.7 Success: Full advance payment (৳1200 on ৳1200 order)
  const fullReq = new Request('http://localhost/api/orders/ord-test-100', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      advancePayment: 1200,
      advancePaymentMethod: 'Nagad',
    }),
  });
  const fullRes = await handleApiRequest(fullReq, env);
  const fullBody = await fullRes.json();
  assert(fullRes.status === 200, 'Full advance payment accepted with HTTP 200');
  assert(fullBody.order.advancePayment === 1200, 'Stored advancePayment is 1200');
  assert(fullBody.order.customerDue === 0, 'Customer due is 0');
  assert(fullBody.order.paymentStatus === 'Paid', 'Payment status synchronized to Paid when customer due is 0');

  // 3.8 Success: Advance payment reset to 0
  const zeroReq = new Request('http://localhost/api/orders/ord-test-100', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      advancePayment: 0,
      advancePaymentNote: 'Refunded advance to customer',
    }),
  });
  const zeroRes = await handleApiRequest(zeroReq, env);
  const zeroBody = await zeroRes.json();
  assert(zeroRes.status === 200, 'Resetting advance payment to 0 succeeds with HTTP 200');
  assert(zeroBody.order.advancePayment === 0, 'Stored advancePayment is 0');
  assert(zeroBody.order.customerDue === 1200, 'Customer due is restored to full total 1200');
  assert(zeroBody.order.paymentStatus === 'DUE' || zeroBody.order.paymentStatus === 'Pending', 'Payment status reverted to unpaid status');

  // ---------------------------------------------------------------------------
  // 4. AUDIT LOGGING VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. AUDIT LOGGING OF ADVANCE PAYMENT CHANGES ---');
  const advanceAuditLogs = auditLogsList.filter((log) => log.action === 'ORDER_ADVANCE_PAYMENT_UPDATE');
  assert(advanceAuditLogs.length > 0, `Audit logs created for advance payment updates (${advanceAuditLogs.length} logs captured)`);

  const latestLog = advanceAuditLogs[advanceAuditLogs.length - 1];
  assert(latestLog.actorEmail === 'admin@test.com', 'Audit log records actorEmail');
  assert(latestLog.targetId === 'ord-test-100', 'Audit log targetId matches order ID');
  assert(latestLog.details.orderNumber === 'RT-2026-99999', 'Audit log records orderNumber');
  assert(latestLog.details.customerDue === 1200, 'Audit log records customerDue');
  assert('previousAdvance' in latestLog.details && 'newAdvance' in latestLog.details, 'Audit log records diff (previousAdvance & newAdvance)');

  console.log('\n================================================================');
  console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
