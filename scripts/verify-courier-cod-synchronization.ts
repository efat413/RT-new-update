/**
 * Courier COD & Payment Synchronization Verification Suite
 * Verifies:
 * 1. Authoritative Courier COD = Final Order Total - Advance Payment = Customer Due
 * 2. Example calculation verification (৳1000 selling, ৳700 buying, ৳100 delivery, ৳300 advance => Due ৳800, COD ৳800, Profit ৳300)
 * 3. Price change to ৳900 => Order Total ৳1000, Due ৳700, COD ৳700, Profit ৳200
 * 4. Price change to ৳1200 => Order Total ৳1300, Due ৳1000, COD ৳1000, Profit ৳500
 * 5. Full advance => Due ৳0, COD ৳0, PaymentStatus synchronized to Paid
 * 6. Discount + Delivery + Advance handling
 * 7. Multiple items / Quantity > 1
 * 8. Server-side authoritative calculation: Spoofed frontend COD amounts are ignored
 * 9. Prevent stale COD across retries and rebooking
 * 10. Courier delivery webhook updates paymentStatus to Paid and customerDue to 0
 * 11. Courier credentials remain strictly server-side
 */

import { handleApiRequest } from '../src/server/router';
import { createAuthToken } from '../src/server/auth';
import { INITIAL_USERS } from '../src/data/seedData';
import { Order } from '../src/types';

async function runVerification() {
  console.log('================================================================');
  console.log('STARTING COURIER COD & PAYMENT SYNCHRONIZATION VERIFICATION');
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

  // Set up in-memory mock D1 database
  const ordersStore = new Map<string, any>();
  const auditLogs: any[] = [];
  const mockUsers = [
    {
      id: 'admin-super-1',
      email: 'admin@rongdhonutrade.com',
      role: 'super_admin',
      is_active: 1,
      permissions_json: JSON.stringify({}),
    },
  ];

  const mockD1Database: any = {
    prepare(query: string) {
      let boundParams: any[] = [];
      const cleanSql = query.trim().toLowerCase();
      const stmt = {
        bind(...params: any[]) {
          boundParams = params;
          return stmt;
        },
        async first<T = any>(): Promise<T | null> {
          if (cleanSql.includes('from users')) {
            const idOrEmail = String(boundParams[0] || '').toLowerCase();
            const user = mockUsers.find((u) => u.id === boundParams[0] || u.email.toLowerCase() === idOrEmail);
            return (user as any) || null;
          }
          if (cleanSql.includes('from orders') && (cleanSql.includes('id = ?') || cleanSql.includes('order_number = ?'))) {
            const key = boundParams[0];
            const found = Array.from(ordersStore.values()).find(
              (o) => o.id === key || o.order_number === key
            );
            return found ? { ...found } : null;
          }
          if (cleanSql.includes('from orders where consignment_id = ? or courier_waybill = ?')) {
            const cid = boundParams[0];
            const waybill = boundParams[1];
            const found = Array.from(ordersStore.values()).find(
              (o) => (o.consignment_id && o.consignment_id === cid) || (o.courier_waybill && o.courier_waybill === waybill)
            );
            return found ? { ...found } : null;
          }
          if (cleanSql.includes('from orders where (invoice = ? or order_number = ?)')) {
            const inv = boundParams[0];
            const found = Array.from(ordersStore.values()).find(
              (o) => o.order_number === inv || o.id === inv
            );
            return found ? { ...found } : null;
          }
          if (cleanSql.includes('from store_settings')) {
            return {
              id: 'settings-1',
              settings_json: JSON.stringify({}),
              updated_at: new Date().toISOString(),
            } as any;
          }
          return null;
        },
        async all<T = any>(): Promise<{ results: T[] }> {
          if (cleanSql.includes('pragma_table_info')) {
            return {
              results: [
                { name: 'id' },
                { name: 'order_number' },
                { name: 'advance_payment' },
                { name: 'advance_payment_method' },
                { name: 'advance_payment_note' },
                { name: 'advance_payment_updated_at' },
                { name: 'advance_payment_updated_by' },
                { name: 'customer_due' },
                { name: 'due_amount' },
                { name: 'total_amount' },
                { name: 'subtotal' },
                { name: 'delivery_fee' },
                { name: 'discount_amount' },
                { name: 'payment_status' },
                { name: 'shipping_status' },
                { name: 'courier_name' },
                { name: 'courier_status' },
                { name: 'courier_waybill' },
                { name: 'consignment_id' },
                { name: 'last_courier_sync' },
                { name: 'courier_booking_json' },
                { name: 'items_json' },
                { name: 'customer_json' },
                { name: 'total_cost' },
                { name: 'total_profit' },
                { name: 'created_at' },
                { name: 'updated_at' },
              ] as any[],
            };
          }
          return { results: [] };
        },
        async run(): Promise<{ success: boolean; meta: any }> {
          if (cleanSql.includes('insert into audit_logs')) {
            auditLogs.push({ query, params: boundParams });
            return { success: true, meta: { changes: 1 } };
          }
          if (cleanSql.startsWith('update orders set')) {
            const orderId = boundParams[boundParams.length - 1];
            const existing = ordersStore.get(orderId);
            if (existing) {
              existing.customer_name = boundParams[0];
              existing.customer_phone = boundParams[1];
              existing.customer_address = boundParams[2];
              existing.customer_district = boundParams[3];
              existing.customer_zone = boundParams[4];
              existing.customer_notes = boundParams[5];
              existing.items_json = boundParams[6];
              existing.subtotal = boundParams[7];
              existing.delivery_fee = boundParams[8];
              existing.total_amount = boundParams[9];
              existing.coupon_code = boundParams[10];
              existing.discount_amount = boundParams[11];
              existing.payment_method = boundParams[12];
              existing.payment_status = boundParams[13];
              existing.transaction_id = boundParams[14];
              existing.shipping_status = boundParams[15];
              existing.courier_name = boundParams[16];
              existing.courier_waybill = boundParams[17];
              existing.consignment_id = boundParams[18];
              existing.courier_status = boundParams[19];
              existing.courier_booking_json = boundParams[20];
              existing.last_courier_sync = boundParams[23];
              existing.total_cost = boundParams[24];
              existing.total_profit = boundParams[25];
              existing.advance_payment = boundParams[26];
              existing.advance_payment_method = boundParams[27];
              existing.advance_payment_note = boundParams[28];
              existing.advance_payment_updated_at = boundParams[29];
              existing.advance_payment_updated_by = boundParams[30];
              const isPaid = existing.payment_status === 'Paid' || existing.payment_status === 'PAID';
              existing.customer_due = isPaid ? 0 : Math.max(0, (Number(existing.total_amount) || 0) - (Number(existing.advance_payment) || 0));
              existing.due_amount = existing.customer_due;
              ordersStore.set(orderId, existing);
            }
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      const results = [];
      for (const s of stmts) {
        results.push(await s.run());
      }
      return results;
    },
  };

  const adminSecret = 'test-admin-secret-minimum-32-characters-length!';
  const testEnv = {
    DB: mockD1Database,
    ADMIN_SECRET: adminSecret,
    STEADFAST_API_KEY: 'test-sf-key-123',
    STEADFAST_SECRET_KEY: 'test-sf-secret-456',
    COURIER_WEBHOOK_SECRET: 'test-webhook-secret-789',
  };

  const adminToken = await createAuthToken(
    { userId: 'admin-super-1', email: 'admin@rongdhonutrade.com', role: 'super_admin' },
    adminSecret
  );

  // Helper to store an order in mock D1
  function seedOrder(order: any) {
    const row = {
      id: order.id,
      order_number: order.orderNumber,
      customer_id: order.customer?.userId || 'cust-1',
      customer_name: order.customer?.fullName || 'Test Customer',
      customer_phone: order.customer?.phone || '01712345678',
      customer_district: order.customer?.district || 'Dhaka',
      customer_address: order.customer?.fullAddress || 'House 1, Road 2, Dhanmondi, Dhaka',
      customer_json: JSON.stringify(order.customer),
      items_json: JSON.stringify(order.items),
      subtotal: order.subtotal,
      delivery_fee: order.deliveryFee,
      discount_amount: order.discountAmount || 0,
      total_amount: order.totalAmount,
      advance_payment: order.advancePayment || 0,
      customer_due: order.customerDue != null ? order.customerDue : (order.totalAmount - (order.advancePayment || 0)),
      due_amount: order.dueAmount != null ? order.dueAmount : (order.totalAmount - (order.advancePayment || 0)),
      total_cost: order.totalCost,
      total_profit: order.totalGrossProfit,
      payment_method: order.paymentMethod || 'cod',
      payment_status: order.paymentStatus || 'DUE',
      shipping_status: order.shippingStatus || 'Processing',
      shipping_method: order.shippingMethod || 'inside',
      courier_name: order.courierName || null,
      courier_status: order.courierStatus || null,
      courier_waybill: order.courierWaybill || null,
      consignment_id: order.consignmentId || null,
      courier_booking_json: order.courierBooking ? JSON.stringify(order.courierBooking) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    ordersStore.set(order.id, row);
    return row;
  }

  // Intercept fetch so Steadfast API calls succeed without hitting actual external gateways
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('portal.packzy.com') || url.includes('portal.steadfast.com.bd') || url.includes('/create_order')) {
      const parsedBody = init?.body ? JSON.parse(init.body) : {};
      return new Response(
        JSON.stringify({
          status: 200,
          message: 'Order created successfully',
          consignment: {
            consignment_id: 'SF-CONS-999',
            tracking_code: 'SF-TRACK-888',
            cod_amount: parsedBody.cod_amount,
            invoice: parsedBody.invoice,
            recipient_name: parsedBody.recipient_name,
            recipient_phone: parsedBody.recipient_phone,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return originalFetch(input, init);
  };

  try {
    // =========================================================================
    // TEST 1: Baseline Example from Specification
    // Product selling = ৳1,000, Buying = ৳700, Delivery = ৳100, Advance = ৳300
    // Expected: Subtotal = ৳1,000, Order Total = ৳1,100, Due = ৳800, Courier COD = ৳800, Profit = ৳300
    // =========================================================================
    console.log('--- TEST 1: Baseline Specification Example ---');
    const order1: any = {
      id: 'ord-test-1',
      orderNumber: 'RT-2026-0001',
      items: [
        {
          product: { id: 'prod-1', title: 'Premium Polo Shirt', price: 1000, buyingPrice: 700 },
          quantity: 1,
          sellingPriceSnapshot: 1000,
          buyingPriceSnapshot: 700,
          productCost: 700,
          productGrossProfit: 300,
        },
      ],
      subtotal: 1000,
      deliveryFee: 100,
      discountAmount: 0,
      totalAmount: 1100,
      advancePayment: 300,
      customerDue: 800,
      dueAmount: 800,
      totalCost: 700,
      totalGrossProfit: 300,
      paymentStatus: 'PARTIAL',
      paymentMethod: 'cod',
      customer: {
        fullName: 'Rahim Ahmed',
        phone: '01711223344',
        district: 'Dhaka',
        fullAddress: 'House 12, Road 4, Banani, Dhaka',
      },
    };
    seedOrder(order1);

    const dispatchReq1 = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        order: { id: 'ord-test-1', orderNumber: 'RT-2026-0001' },
        courier: { code: 'Steadfast', name: 'Steadfast Courier' },
      }),
    });
    const dispatchRes1 = await handleApiRequest(dispatchReq1, testEnv);
    const dispatchData1 = await dispatchRes1.json();

    assert(dispatchRes1.status === 200 && dispatchData1.success === true, '1.1 Initial courier dispatch succeeds');
    assert(dispatchData1.cod_amount === 800, `1.2 Authoritative Courier COD is ৳800 (got ${dispatchData1.cod_amount})`);
    assert(dispatchData1.customerDue === 800, `1.3 Customer Due is ৳800 (got ${dispatchData1.customerDue})`);
    assert(dispatchData1.totalAmount === 1100, `1.4 Order Total is ৳1100 (got ${dispatchData1.totalAmount})`);
    assert(dispatchData1.advancePayment === 300, `1.5 Advance payment is ৳300 (got ${dispatchData1.advancePayment})`);

    // =========================================================================
    // TEST 2: Price Changed to ৳900 (Price decrease)
    // Selling = ৳900, Buying = ৳700, Delivery = ৳100, Advance = ৳300
    // Expected: Subtotal = ৳900, Order Total = ৳1,000, Due = ৳700, Courier COD = ৳700, Profit = ৳200
    // =========================================================================
    console.log('\n--- TEST 2: Selling Price Decreased to ৳900 ---');
    const updateReq2 = new Request('https://rongdhonutrade.com/api/orders/ord-test-1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            product: { id: 'prod-1', title: 'Premium Polo Shirt', price: 900, buyingPrice: 700 },
            quantity: 1,
            sellingPriceSnapshot: 900,
            buyingPriceSnapshot: 700,
          },
        ],
      }),
    });
    const updateRes2 = await handleApiRequest(updateReq2, testEnv);
    const updateData2 = await updateRes2.json();

    assert(updateRes2.status === 200 && updateData2.success === true, '2.1 Admin updates selling price to ৳900');
    assert(updateData2.order?.subtotal === 900, `2.2 Subtotal recalculated to ৳900 (got ${updateData2.order?.subtotal})`);
    assert(updateData2.order?.totalAmount === 1000, `2.3 Order total recalculated to ৳1000 (got ${updateData2.order?.totalAmount})`);
    assert(updateData2.order?.customerDue === 700, `2.4 Customer due recalculated to ৳700 (got ${updateData2.order?.customerDue})`);
    assert(updateData2.order?.totalGrossProfit === 200, `2.5 Profit recalculated to ৳200 (got ${updateData2.order?.totalGrossProfit})`);

    // Resubmit / Rebook courier
    const dispatchReq2 = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        order: { id: 'ord-test-1', orderNumber: 'RT-2026-0001' },
        courier: { code: 'Steadfast', name: 'Steadfast Courier' },
      }),
    });
    const dispatchRes2 = await handleApiRequest(dispatchReq2, testEnv);
    const dispatchData2 = await dispatchRes2.json();

    assert(dispatchData2.cod_amount === 700, `2.6 Rebooked Courier COD updated to ৳700 (got ${dispatchData2.cod_amount})`);
    assert(dispatchData2.customerDue === 700, `2.7 Courier customerDue matches ৳700`);

    // =========================================================================
    // TEST 3: Price Changed to ৳1,200 (Price increase)
    // Selling = ৳1,200, Buying = ৳700, Delivery = ৳100, Advance = ৳300
    // Expected: Subtotal = ৳1,200, Order Total = ৳1,300, Due = ৳1,000, Courier COD = ৳1,000, Profit = ৳500
    // =========================================================================
    console.log('\n--- TEST 3: Selling Price Increased to ৳1,200 ---');
    const updateReq3 = new Request('https://rongdhonutrade.com/api/orders/ord-test-1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            product: { id: 'prod-1', title: 'Premium Polo Shirt', price: 1200, buyingPrice: 700 },
            quantity: 1,
            sellingPriceSnapshot: 1200,
            buyingPriceSnapshot: 700,
          },
        ],
      }),
    });
    const updateRes3 = await handleApiRequest(updateReq3, testEnv);
    const updateData3 = await updateRes3.json();

    assert(updateRes3.status === 200 && updateData3.success === true, '3.1 Admin updates selling price to ৳1,200');
    assert(updateData3.order?.subtotal === 1200, `3.2 Subtotal recalculated to ৳1200 (got ${updateData3.order?.subtotal})`);
    assert(updateData3.order?.totalAmount === 1300, `3.3 Order total recalculated to ৳1300 (got ${updateData3.order?.totalAmount})`);
    assert(updateData3.order?.customerDue === 1000, `3.4 Customer due recalculated to ৳1000 (got ${updateData3.order?.customerDue})`);
    assert(updateData3.order?.totalGrossProfit === 500, `3.5 Profit recalculated to ৳500 (got ${updateData3.order?.totalGrossProfit})`);

    const dispatchReq3 = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        order: { id: 'ord-test-1', orderNumber: 'RT-2026-0001' },
        courier: { code: 'Steadfast', name: 'Steadfast Courier' },
      }),
    });
    const dispatchRes3 = await handleApiRequest(dispatchReq3, testEnv);
    const dispatchData3 = await dispatchRes3.json();

    assert(dispatchData3.cod_amount === 1000, `3.6 Rebooked Courier COD updated to ৳1000 (got ${dispatchData3.cod_amount})`);

    // =========================================================================
    // TEST 4: Full Advance Payment (Advance == Total)
    // Order Total = ৳1,100, Advance = ৳1,100 => Customer Due = 0, Courier COD = 0
    // =========================================================================
    console.log('\n--- TEST 4: Full Advance Payment ---');
    const order4: any = {
      id: 'ord-test-4',
      orderNumber: 'RT-2026-0004',
      items: [
        {
          product: { id: 'prod-4', title: 'Wireless Headphones', price: 1000, buyingPrice: 600 },
          quantity: 1,
          sellingPriceSnapshot: 1000,
          buyingPriceSnapshot: 600,
        },
      ],
      subtotal: 1000,
      deliveryFee: 100,
      discountAmount: 0,
      totalAmount: 1100,
      advancePayment: 1100,
      customerDue: 0,
      dueAmount: 0,
      totalCost: 600,
      totalGrossProfit: 400,
      paymentStatus: 'Paid',
      paymentMethod: 'dbbl',
      customer: {
        fullName: 'Karim Ullah',
        phone: '01811223344',
        district: 'Chattogram',
        fullAddress: 'Agrabad, Chattogram',
      },
    };
    seedOrder(order4);

    const dispatchReq4 = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        order: { id: 'ord-test-4', orderNumber: 'RT-2026-0004' },
        courier: { code: 'Steadfast', name: 'Steadfast Courier' },
      }),
    });
    const dispatchRes4 = await handleApiRequest(dispatchReq4, testEnv);
    const dispatchData4 = await dispatchRes4.json();

    assert(dispatchRes4.status === 200 && dispatchData4.success === true, '4.1 Courier dispatch succeeds for fully paid order');
    assert(dispatchData4.cod_amount === 0, `4.2 Courier COD is strictly ৳0 when fully paid (got ${dispatchData4.cod_amount})`);
    assert(dispatchData4.customerDue === 0, `4.3 Customer due is ৳0`);

    // =========================================================================
    // TEST 5: Discount + Delivery Fee + Advance Handling
    // Subtotal = ৳1,000, Delivery = ৳120, Discount = ৳50, Advance = ৳300
    // Total = 1000 + 120 - 50 = ৳1,070, Due = 1070 - 300 = ৳770, Courier COD = ৳770
    // =========================================================================
    console.log('\n--- TEST 5: Discount + Delivery Fee + Advance ---');
    const order5: any = {
      id: 'ord-test-5',
      orderNumber: 'RT-2026-0005',
      items: [
        {
          product: { id: 'prod-5', title: 'Smart Watch', price: 1000, buyingPrice: 500 },
          quantity: 1,
          sellingPriceSnapshot: 1000,
          buyingPriceSnapshot: 500,
        },
      ],
      subtotal: 1000,
      deliveryFee: 120,
      discountAmount: 50,
      totalAmount: 1070,
      advancePayment: 300,
      customerDue: 770,
      dueAmount: 770,
      totalCost: 500,
      totalGrossProfit: 500,
      paymentStatus: 'PARTIAL',
      paymentMethod: 'cod',
      customer: {
        fullName: 'Sumon Barua',
        phone: '01911223344',
        district: 'Sylhet',
        fullAddress: 'Zindabazar, Sylhet',
      },
    };
    seedOrder(order5);

    const dispatchReq5 = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        order: { id: 'ord-test-5', orderNumber: 'RT-2026-0005' },
        courier: { code: 'Steadfast', name: 'Steadfast Courier' },
      }),
    });
    const dispatchRes5 = await handleApiRequest(dispatchReq5, testEnv);
    const dispatchData5 = await dispatchRes5.json();

    assert(dispatchData5.cod_amount === 770, `5.1 COD is ৳770 accounting for discount + delivery + advance (got ${dispatchData5.cod_amount})`);
    assert(dispatchData5.totalAmount === 1070, `5.2 Total order amount is ৳1070 (got ${dispatchData5.totalAmount})`);

    // =========================================================================
    // TEST 6: Multiple Items & Quantity > 1
    // Item 1: Qty 2 @ ৳500 (Cost ৳300) = Line ৳1000, Cost ৳600, Profit ৳400
    // Item 2: Qty 1 @ ৳400 (Cost ৳250) = Line ৳400, Cost ৳250, Profit ৳150
    // Delivery = ৳100, Discount = ৳100, Advance = ৳400
    // Subtotal = ৳1400, Total = ৳1400, Due = ৳1000, COD = ৳1000, Total Profit = ৳550
    // =========================================================================
    console.log('\n--- TEST 6: Multiple Items & Quantity > 1 ---');
    const order6: any = {
      id: 'ord-test-6',
      orderNumber: 'RT-2026-0006',
      items: [
        {
          product: { id: 'prod-6a', title: 'T-Shirt White', price: 500, buyingPrice: 300 },
          quantity: 2,
          sellingPriceSnapshot: 500,
          buyingPriceSnapshot: 300,
        },
        {
          product: { id: 'prod-6b', title: 'Baseball Cap', price: 400, buyingPrice: 250 },
          quantity: 1,
          sellingPriceSnapshot: 400,
          buyingPriceSnapshot: 250,
        },
      ],
      subtotal: 1400,
      deliveryFee: 100,
      discountAmount: 100,
      totalAmount: 1400,
      advancePayment: 400,
      customerDue: 1000,
      dueAmount: 1000,
      totalCost: 850,
      totalGrossProfit: 550,
      paymentStatus: 'PARTIAL',
      paymentMethod: 'cod',
      customer: {
        fullName: 'Farhana Yeasmin',
        phone: '01511223344',
        district: 'Dhaka',
        fullAddress: 'Uttara Sector 7, Dhaka',
      },
    };
    seedOrder(order6);

    const dispatchReq6 = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        order: { id: 'ord-test-6', orderNumber: 'RT-2026-0006' },
        courier: { code: 'Steadfast', name: 'Steadfast Courier' },
      }),
    });
    const dispatchRes6 = await handleApiRequest(dispatchReq6, testEnv);
    const dispatchData6 = await dispatchRes6.json();

    assert(dispatchData6.cod_amount === 1000, `6.1 Multiple item COD is correctly ৳1000 (got ${dispatchData6.cod_amount})`);
    assert(dispatchData6.totalAmount === 1400, `6.2 Total amount is ৳1400 (got ${dispatchData6.totalAmount})`);

    // =========================================================================
    // TEST 7: Server-Side Authoritative Calculation (Client Spoof Resistance)
    // Client attempts to send spoofed cod_amount in parcelData (e.g. 9999 or 0)
    // Server MUST compute authoritative customer due and ignore spoofed COD
    // =========================================================================
    console.log('\n--- TEST 7: Client Spoof Resistance ---');
    const dispatchReq7 = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        order: { id: 'ord-test-1', orderNumber: 'RT-2026-0001' },
        parcelData: {
          cod_amount: 99999, // Malicious / spoofed COD amount
        },
        courier: { code: 'Steadfast', name: 'Steadfast Courier' },
      }),
    });
    const dispatchRes7 = await handleApiRequest(dispatchReq7, testEnv);
    const dispatchData7 = await dispatchRes7.json();

    // Order 1 was updated to ৳1200 selling, ৳100 delivery, ৳300 advance => Due ৳1000
    assert(
      dispatchData7.cod_amount === 1000,
      `7.1 Server ignores spoofed cod_amount (99999) and enforces authoritative due ৳1000 (got ${dispatchData7.cod_amount})`
    );

    // =========================================================================
    // TEST 8: Prevent Stale COD (Quantity or Delivery Fee Updated)
    // =========================================================================
    console.log('\n--- TEST 8: Prevent Stale COD On Quantity Update ---');
    const updateReq8 = new Request('https://rongdhonutrade.com/api/orders/ord-test-1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            product: { id: 'prod-1', title: 'Premium Polo Shirt', price: 1000, buyingPrice: 700 },
            quantity: 3, // 3 * 1000 = 3000
            sellingPriceSnapshot: 1000,
            buyingPriceSnapshot: 700,
          },
        ],
        deliveryFee: 150,
      }),
    });
    const updateRes8 = await handleApiRequest(updateReq8, testEnv);
    const updateData8 = await updateRes8.json();

    // Total = 3000 + 150 = 3150, Advance = 300 => Due = 2850
    assert(updateData8.order?.totalAmount === 3150, `8.1 Updated total is ৳3150 (got ${updateData8.order?.totalAmount})`);
    assert(updateData8.order?.customerDue === 2850, `8.2 Updated due is ৳2850 (got ${updateData8.order?.customerDue})`);

    const dispatchReq8 = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        order: { id: 'ord-test-1', orderNumber: 'RT-2026-0001' },
        courier: { code: 'Steadfast', name: 'Steadfast Courier' },
      }),
    });
    const dispatchRes8 = await handleApiRequest(dispatchReq8, testEnv);
    const dispatchData8 = await dispatchRes8.json();

    assert(
      dispatchData8.cod_amount === 2850,
      `8.3 Courier COD uses fresh recalculated due ৳2850, not stale ৳1000 (got ${dispatchData8.cod_amount})`
    );

    // =========================================================================
    // TEST 9: Courier Delivery Webhook Payment Synchronization
    // When courier webhook reports 'delivered', paymentStatus becomes 'Paid'
    // and customerDue becomes 0
    // =========================================================================
    console.log('\n--- TEST 9: Courier Delivery Webhook Synchronization ---');
    const webhookReq = new Request('https://rongdhonutrade.com/api/webhook/steadfast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Courier-Secret': testEnv.COURIER_WEBHOOK_SECRET,
        'X-Webhook-Timestamp': String(Date.now()),
      },
      body: JSON.stringify({
        invoice: 'RT-2026-0001',
        consignment_id: 'SF-CONS-999',
        status: 'delivered',
      }),
    });
    const webhookRes = await handleApiRequest(webhookReq, testEnv);
    assert(webhookRes.status === 200, '9.1 Steadfast delivery webhook processed successfully');

    // Verify stored order was updated
    const deliveredRow = ordersStore.get('ord-test-1');
    assert(deliveredRow !== undefined, '9.2 Order found in database');
    assert(deliveredRow.payment_status === 'Paid', `9.3 Delivered order payment status updated to Paid (got ${deliveredRow.payment_status})`);
    assert(deliveredRow.customer_due === 0, `9.4 Delivered order customer due updated to 0 (got ${deliveredRow.customer_due})`);

    // =========================================================================
    // TEST 10: Courier API Credentials Security
    // Verify that courier API credentials never leak in order or tracking responses
    // =========================================================================
    console.log('\n--- TEST 10: Courier Credential Server-Side Isolation ---');
    const orderFetchReq = new Request('https://rongdhonutrade.com/api/orders/RT-2026-0001?phone=01711223344', {
      method: 'GET',
    });
    const orderFetchRes = await handleApiRequest(orderFetchReq, testEnv);
    const orderFetchData = await orderFetchRes.json();
    const serializedTrackingResponse = JSON.stringify(orderFetchData);

    assert(!serializedTrackingResponse.includes('test-sf-key-123'), '10.1 Tracking response contains no STEADFAST_API_KEY');
    assert(!serializedTrackingResponse.includes('test-sf-secret-456'), '10.2 Tracking response contains no STEADFAST_SECRET_KEY');
    assert(!serializedTrackingResponse.includes('test-webhook-secret-789'), '10.3 Tracking response contains no COURIER_WEBHOOK_SECRET');

  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
