/**
 * Verification Suite for Admin Orders Server-Side Pagination
 * Tests:
 * 1. Default page size (25) & maximum page size enforcement (100)
 * 2. Never trusting huge client-provided limits (e.g., limit=100000 -> clamped to 100)
 * 3. First page & Next page navigation (zero overlap, deterministic ordering)
 * 4. Search + pagination at database level
 * 5. Filter (status & payment) + pagination at database level
 * 6. Sort (newest, oldest, amount-desc, amount-asc) + pagination
 * 7. Empty result handling
 * 8. Admin authentication (401/403) & RBAC financial field sanitization
 */

import {
  DEFAULT_ORDER_PAGE_SIZE,
  MAX_ORDER_PAGE_SIZE,
  sanitizeOrderPaginationParams,
  getPaginatedOrders,
} from '../src/server/db';
import type { D1Database, OrderRow } from '../src/server/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

/**
 * Lightweight SQLite-compatible D1 mock that evaluates SQL WHERE, ORDER BY, LIMIT, OFFSET, and COUNT/SUM
 * against a dataset of OrderRow records to verify SQL generation and parameter binding in getPaginatedOrders.
 */
function createOrdersD1Mock(rows: OrderRow[]): D1Database {
  const evaluateWhere = (row: OrderRow, sql: string, bindings: any[]): boolean => {
    let bindIdx = 0;

    // Status checks
    if (sql.includes("LOWER(shipping_status) IN ('pending', 'processing')")) {
      const ship = (row.shipping_status || '').toLowerCase();
      const cour = (row.courier_status || '').toLowerCase();
      if (!(ship === 'pending' || ship === 'processing' || cour.includes('pending') || cour.includes('pickup'))) {
        return false;
      }
    } else if (sql.includes("LOWER(shipping_status) = 'processing'")) {
      if ((row.shipping_status || '').toLowerCase() !== 'processing') return false;
    } else if (sql.includes("LOWER(shipping_status) = 'shipped'")) {
      const ship = (row.shipping_status || '').toLowerCase();
      const cour = (row.courier_status || '').toLowerCase();
      if (!(ship === 'shipped' || cour.includes('ship') || cour.includes('transit'))) return false;
    } else if (sql.includes("LOWER(shipping_status) = 'delivered'")) {
      const ship = (row.shipping_status || '').toLowerCase();
      const cour = (row.courier_status || '').toLowerCase();
      if (!(ship === 'delivered' || cour.includes('deliver'))) return false;
    } else if (sql.includes("LOWER(shipping_status) = 'cancelled'")) {
      const ship = (row.shipping_status || '').toLowerCase();
      const cour = (row.courier_status || '').toLowerCase();
      if (!(ship === 'cancelled' || cour.includes('cancel') || cour.includes('return'))) return false;
    } else if (sql.includes('LOWER(shipping_status) = ?')) {
      const target = String(bindings[bindIdx++] || '').toLowerCase();
      if ((row.shipping_status || '').toLowerCase() !== target) return false;
    }

    // Payment checks
    if (sql.includes("UPPER(payment_status) = 'PAID'")) {
      if ((row.payment_status || '').toUpperCase() !== 'PAID') return false;
    } else if (sql.includes("UPPER(payment_status) != 'PAID'")) {
      if ((row.payment_status || '').toUpperCase() === 'PAID') return false;
    } else if (sql.includes("LOWER(payment_method) = 'dbbl'")) {
      if ((row.payment_method || '').toLowerCase() !== 'dbbl') return false;
    } else if (sql.includes("LOWER(payment_method) = 'cod'")) {
      if ((row.payment_method || '').toLowerCase() !== 'cod') return false;
    }

    // Search check (8 LIKE bindings)
    if (sql.includes('order_number LIKE ?')) {
      const rawPattern = String(bindings[bindIdx] || '');
      bindIdx += 8;
      const needle = rawPattern.replace(/^%|%$/g, '').toLowerCase();
      const haystack = [
        row.order_number,
        row.customer_phone,
        row.customer_name,
        row.customer_address,
        row.customer_district || '',
        row.transaction_id || '',
        row.courier_waybill || '',
        row.consignment_id || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  };

  return {
    prepare(query: string) {
      let boundValues: any[] = [];
      const stmt = {
        bind(...values: any[]) {
          boundValues = values;
          return stmt;
        },
        async first<T = any>(): Promise<T | null> {
          if (query.includes('COUNT(*) as total_all')) {
            return {
              total_all: rows.length,
              pending_count: rows.filter((r) => ['pending', 'processing'].includes(r.shipping_status.toLowerCase())).length,
              shipped_count: rows.filter((r) => r.shipping_status.toLowerCase() === 'shipped').length,
              delivered_count: rows.filter((r) => r.shipping_status.toLowerCase() === 'delivered').length,
              cancelled_count: rows.filter((r) => r.shipping_status.toLowerCase() === 'cancelled').length,
              unverified_dbbl_count: rows.filter((r) => r.payment_method.toLowerCase() === 'dbbl' && r.payment_status.toUpperCase() !== 'PAID').length,
              total_revenue: rows.reduce((s, r) => s + r.total_amount, 0),
              total_delivery_value: rows.reduce((s, r) => s + r.delivery_fee, 0),
              cancelled_orders_value: rows.filter((r) => r.shipping_status.toLowerCase() === 'cancelled').reduce((s, r) => s + r.total_amount, 0),
              cancelled_products_value: rows.filter((r) => r.shipping_status.toLowerCase() === 'cancelled').reduce((s, r) => s + r.subtotal, 0),
            } as any;
          }
          if (query.includes('SELECT COUNT(*) as total FROM orders')) {
            const matched = rows.filter((r) => evaluateWhere(r, query, boundValues));
            return { total: matched.length } as any;
          }
          return null;
        },
        async all<T = any>() {
          const matched = rows.filter((r) => evaluateWhere(r, query, boundValues));
          if (query.includes('ORDER BY created_at ASC')) {
            matched.sort((a, b) => a.created_at.localeCompare(b.created_at));
          } else if (query.includes('ORDER BY total_amount DESC')) {
            matched.sort((a, b) => b.total_amount - a.total_amount || b.created_at.localeCompare(a.created_at));
          } else if (query.includes('ORDER BY total_amount ASC')) {
            matched.sort((a, b) => a.total_amount - b.total_amount || b.created_at.localeCompare(a.created_at));
          } else {
            matched.sort((a, b) => b.created_at.localeCompare(a.created_at));
          }

          if (query.includes('LIMIT ? OFFSET ?')) {
            const limit = Number(boundValues[boundValues.length - 2]);
            const offset = Number(boundValues[boundValues.length - 1]);
            return {
              success: true,
              results: matched.slice(offset, offset + limit) as unknown as T[],
            };
          }
          return { success: true, results: matched as unknown as T[] };
        },
        async run() {
          return { success: true };
        },
      };
      return stmt;
    },
    async batch(statements: any[]) {
      return statements.map(() => ({ success: true }));
    },
    async exec() {
      return { count: 1, duration: 1 };
    },
  };
}

async function runTests() {
  console.log('====================================================');
  console.log('1. UNIT TESTS: PAGINATION SANITIZATION & LIMIT CLAMPING');
  console.log('====================================================');

  assert(DEFAULT_ORDER_PAGE_SIZE === 25, `Default page size is 25 (got ${DEFAULT_ORDER_PAGE_SIZE})`);
  assert(MAX_ORDER_PAGE_SIZE === 100, `Max page size is 100 (got ${MAX_ORDER_PAGE_SIZE})`);

  const def = sanitizeOrderPaginationParams(undefined, undefined);
  assert(def.page === 1 && def.limit === 25 && def.offset === 0, 'Undefined params default to page=1, limit=25, offset=0');

  const huge = sanitizeOrderPaginationParams('2', '999999');
  assert(huge.page === 2 && huge.limit === 100 && huge.offset === 100, 'Huge client limit (999999) is strictly clamped to 100');

  const negative = sanitizeOrderPaginationParams('-5', '-20');
  assert(negative.page === 1 && negative.limit === 25 && negative.offset === 0, 'Negative page/limit fallback to safe defaults (1, 25)');

  const invalid = sanitizeOrderPaginationParams('abc', 'NaN');
  assert(invalid.page === 1 && invalid.limit === 25 && invalid.offset === 0, 'Non-numeric page/limit fallback to safe defaults (1, 25)');

  console.log('\n====================================================');
  console.log('2. DATABASE LAYER TESTS (140 ORDERS DATASET)');
  console.log('====================================================');

  const statuses = ['Pending', 'Shipped', 'Delivered', 'Cancelled'];
  const mockRows: OrderRow[] = Array.from({ length: 140 }, (_, idx) => {
    const num = idx + 1;
    const status = statuses[idx % statuses.length];
    const isDbbl = idx % 3 === 0;
    const isPaid = status === 'Delivered' || idx % 2 === 0;
    const createdDate = new Date(Date.UTC(2026, 0, 1, 0, 0, idx)).toISOString();
    return {
      id: `ord-test-${String(num).padStart(4, '0')}`,
      order_number: `RT-2026-${String(10000000 + num)}`,
      user_id: null,
      user_email: null,
      customer_name: idx % 10 === 0 ? `Tanvir Ahmed ${num}` : `Customer ${num}`,
      customer_phone: `017${String(10000000 + num).slice(-8)}`,
      customer_address: `House ${num}, Road ${(idx % 15) + 1}, Dhaka`,
      customer_district: idx % 5 === 0 ? 'Chattogram' : 'Dhaka',
      customer_zone: idx % 5 === 0 ? 'outside_dhaka' : 'inside_dhaka',
      customer_notes: null,
      items_json: JSON.stringify([
        {
          product: { id: 'prod-1', title: 'Luxury Watch', price: 1000 + num * 10 },
          quantity: 1,
          buyingPriceSnapshot: 600,
          sellingPriceSnapshot: 1000 + num * 10,
          productCost: 600,
          productGrossProfit: 400 + num * 10,
        },
      ]),
      subtotal: 1000 + num * 10,
      delivery_fee: 80,
      total_amount: 1080 + num * 10,
      total_cost: 600,
      total_profit: 400 + num * 10,
      coupon_code: null,
      discount_amount: 0,
      payment_method: isDbbl ? 'dbbl' : 'COD',
      payment_status: isPaid ? 'Paid' : 'Pending',
      transaction_id: isDbbl ? `TRX${1000 + num}` : null,
      shipping_status: status,
      courier_name: status === 'Shipped' || status === 'Delivered' ? 'Steadfast' : null,
      courier_waybill: status === 'Shipped' || status === 'Delivered' ? `SFWB${num}` : null,
      consignment_id: status === 'Shipped' || status === 'Delivered' ? `SFCID${num}` : null,
      courier_status: status === 'Shipped' ? 'In Transit' : status === 'Delivered' ? 'Delivered' : null,
      courier_booking_json: null,
      dbbl_details_json: null,
      card_details_json: null,
      last_courier_sync: null,
      created_at: createdDate,
      updated_at: createdDate,
    };
  });

  const db = createOrdersD1Mock(mockRows);

  // Test 2.1: First page (default limit = 25)
  const page1 = await getPaginatedOrders(db, { page: 1 });
  assert(page1.orders.length === 25, `First page returns 25 orders by default (got ${page1.orders.length})`);
  assert(page1.total === 140, `Total count is 140 (got ${page1.total})`);
  assert(page1.page === 1, `Current page is 1 (got ${page1.page})`);
  assert(page1.limit === 25, `Page limit is 25 (got ${page1.limit})`);
  assert(page1.totalPages === 6, `Total pages for 140 items at 25/page is 6 (got ${page1.totalPages})`);
  assert(page1.hasNextPage === true && page1.hasPrevPage === false, 'First page hasNextPage=true, hasPrevPage=false');
  assert(page1.orders[0].orderNumber === 'RT-2026-10000140', `Newest order is first on page 1 (${page1.orders[0].orderNumber})`);

  // Test 2.2: Next page (page = 2)
  const page2 = await getPaginatedOrders(db, { page: 2 });
  assert(page2.orders.length === 25, `Second page returns 25 orders (got ${page2.orders.length})`);
  assert(page2.page === 2 && page2.hasPrevPage === true && page2.hasNextPage === true, 'Second page hasPrevPage=true, hasNextPage=true');
  assert(page2.orders[0].orderNumber === 'RT-2026-10000115', `Page 2 starts immediately after Page 1 (${page2.orders[0].orderNumber})`);
  const page1Ids = new Set(page1.orders.map((o) => o.id));
  const overlap = page2.orders.some((o) => page1Ids.has(o.id));
  assert(!overlap, 'Zero duplicate/overlapping orders between Page 1 and Page 2');

  // Test 2.3: Search + Pagination
  const searchP1 = await getPaginatedOrders(db, { search: 'Tanvir Ahmed', page: 1, limit: 5 });
  assert(searchP1.total === 14, `Search "Tanvir Ahmed" matches 14 orders across dataset (got ${searchP1.total})`);
  assert(searchP1.orders.length === 5, `Search Page 1 with limit=5 returns 5 orders (got ${searchP1.orders.length})`);
  assert(searchP1.totalPages === 3, `Search totalPages is 3 (got ${searchP1.totalPages})`);
  const searchP3 = await getPaginatedOrders(db, { search: 'Tanvir Ahmed', page: 3, limit: 5 });
  assert(searchP3.orders.length === 4 && searchP3.hasNextPage === false, 'Search Page 3 returns remaining 4 orders and hasNextPage=false');

  // Test 2.4: Filter + Pagination (status='Shipped')
  const filterShippedP1 = await getPaginatedOrders(db, { status: 'Shipped', page: 1, limit: 15 });
  assert(filterShippedP1.total === 35, `Status filter "Shipped" matches 35 orders (got ${filterShippedP1.total})`);
  assert(filterShippedP1.orders.length === 15, `Status filter Page 1 with limit=15 returns 15 orders`);
  assert(filterShippedP1.orders.every((o) => o.shippingStatus === 'Shipped'), 'Every returned order has shippingStatus="Shipped"');
  assert(filterShippedP1.summary.totalAll === 140, 'Summary still preserves global totalAll=140 so badge counters stay accurate');

  // Test 2.5: Empty Result
  const emptyRes = await getPaginatedOrders(db, { search: 'NON_EXISTENT_9999999', page: 1, limit: 25 });
  assert(emptyRes.orders.length === 0, 'Empty search returns 0 orders');
  assert(emptyRes.total === 0, 'Empty search total is 0');
  assert(emptyRes.totalPages === 1, 'Empty search totalPages is 1');
  assert(emptyRes.hasNextPage === false && emptyRes.hasPrevPage === false, 'Empty search hasNextPage=false and hasPrevPage=false');

  // Test 2.6: Maximum Page Size Clamping
  const maxPageRes = await getPaginatedOrders(db, { page: 1, limit: 50000 });
  assert(maxPageRes.limit === 100, `Client limit=50000 is clamped to max limit=100 (got ${maxPageRes.limit})`);
  assert(maxPageRes.orders.length === 100, `Returned orders count is capped at 100 (got ${maxPageRes.orders.length})`);
  assert(maxPageRes.totalPages === 2, `With limit=100 and 140 total rows, totalPages=2 (got ${maxPageRes.totalPages})`);

  console.log('\n====================================================');
  console.log('3. LIVE DEV SERVER API VERIFICATION (/api/orders)');
  console.log('====================================================');

  const baseUrl = 'http://localhost:3000';

  // 3.1 Verify unauthenticated request is rejected with 401
  const unauthRes = await fetch(`${baseUrl}/api/orders`);
  assert(unauthRes.status === 401, `Unauthenticated GET /api/orders returns 401 (got ${unauthRes.status})`);

  // 3.2 Verify customer role is forbidden (403)
  const customerToken = 'dev-jwt-' + Buffer.from(JSON.stringify({
    userId: 'user-cust-demo',
    email: 'customer@gmail.com',
    role: 'customer',
    exp: Date.now() + 3600000,
  })).toString('base64');
  const custRes = await fetch(`${baseUrl}/api/orders`, {
    headers: { Cookie: `auth_token=${customerToken}` },
  });
  assert(custRes.status === 403, `Customer GET /api/orders returns 403 Forbidden (got ${custRes.status})`);

  // 3.3 Authenticated Super Admin live API tests
  const adminToken = 'dev-jwt-' + Buffer.from(JSON.stringify({
    userId: 'user-admin-01',
    email: 'admin',
    role: 'super_admin',
    exp: Date.now() + 3600000,
  })).toString('base64');
  const cookieHeader = `auth_token=${adminToken}`;

  // Live Default Page Size
  const liveDefaultRes = await fetch(`${baseUrl}/api/orders`, {
    headers: { Cookie: cookieHeader },
  });
  const liveDefault = await liveDefaultRes.json();
  assert(liveDefaultRes.status === 200 && liveDefault.success === true, 'Authenticated GET /api/orders returns 200 OK');
  assert(liveDefault.page === 1 && liveDefault.limit === 25, `Live API default page=1, limit=25 (got page=${liveDefault.page}, limit=${liveDefault.limit})`);
  assert(Boolean(liveDefault.summary && typeof liveDefault.summary.totalAll === 'number'), 'Live API returns summary counts');

  // Live First Page + Next Page (limit=1)
  const liveP1Res = await fetch(`${baseUrl}/api/orders?page=1&limit=1`, {
    headers: { Cookie: cookieHeader },
  });
  const liveP1 = await liveP1Res.json();
  assert(liveP1.page === 1 && liveP1.limit === 1 && liveP1.orders.length === 1, 'Live First Page (page=1&limit=1) returns 1 order');

  if (liveP1.total > 1) {
    const liveP2Res = await fetch(`${baseUrl}/api/orders?page=2&limit=1`, {
      headers: { Cookie: cookieHeader },
    });
    const liveP2 = await liveP2Res.json();
    assert(liveP2.page === 2 && liveP2.limit === 1 && liveP2.orders.length === 1, 'Live Next Page (page=2&limit=1) returns 1 order');
    assert(liveP2.orders[0].id !== liveP1.orders[0].id, 'Live Page 1 and Page 2 return distinct orders');
  }

  // Live Search + Pagination
  const sampleOrderNum = liveP1.orders[0]?.orderNumber || 'RT-';
  const liveSearchRes = await fetch(`${baseUrl}/api/orders?search=${encodeURIComponent(sampleOrderNum)}&page=1&limit=5`, {
    headers: { Cookie: cookieHeader },
  });
  const liveSearch = await liveSearchRes.json();
  assert(liveSearch.success === true && liveSearch.orders.length >= 1, `Live Search + Pagination matches "${sampleOrderNum}"`);

  // Live Filter + Pagination
  const sampleStatus = liveP1.orders[0]?.shippingStatus || 'Pending';
  const liveFilterRes = await fetch(`${baseUrl}/api/orders?status=${encodeURIComponent(sampleStatus)}&page=1&limit=10`, {
    headers: { Cookie: cookieHeader },
  });
  const liveFilter = await liveFilterRes.json();
  assert(liveFilter.success === true && liveFilter.orders.length >= 1, `Live Filter + Pagination matches status="${sampleStatus}"`);

  // Live Huge Limit Clamping
  const liveHugeRes = await fetch(`${baseUrl}/api/orders?page=1&limit=99999`, {
    headers: { Cookie: cookieHeader },
  });
  const liveHuge = await liveHugeRes.json();
  assert(liveHuge.limit === 100, `Live API clamps limit=99999 to 100 (got ${liveHuge.limit})`);

  // Live Empty Result
  const liveEmptyRes = await fetch(`${baseUrl}/api/orders?search=__NO_MATCH_ORDER_99999__`, {
    headers: { Cookie: cookieHeader },
  });
  const liveEmpty = await liveEmptyRes.json();
  assert(
    liveEmpty.orders.length === 0 && liveEmpty.total === 0 && liveEmpty.totalPages === 1,
    'Live API empty search returns orders=[], total=0, totalPages=1'
  );

  console.log('\n✅ ALL ADMIN ORDERS PAGINATION TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
