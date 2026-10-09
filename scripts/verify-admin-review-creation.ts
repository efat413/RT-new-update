/**
 * Verification Suite for Admin Review Creation & Security Boundaries
 *
 * Verifies:
 * 1. Admin may create reviews manually with permission reviews.create.
 * 2. Unauthenticated and unauthorized users without reviews.create are strictly blocked (401 / 403).
 * 3. Form fields: Product, Customer Name, Rating, Comment.
 * 4. Optional fields: Review Source (Customer Submitted, Facebook, Messenger, WhatsApp, Instagram, Manual).
 * 5. Optional fields: Customer Image, Screenshot Attachment.
 * 6. Admin-created reviews have status = 'approved'.
 * 7. IMPORTANT: verifiedPurchase = false unless server independently verifies purchase.
 * 8. Client attempts to manually set approved_by, approved_at, verifiedPurchase are strictly ignored/overwritten by server.
 */

import { handleApiRequest } from '../src/server/router';
import { createSignedTestToken, getTestSecret } from './test-auth-helper';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    failed++;
  }
}

// In-Memory Mock D1 for comprehensive security testing
class MockD1PreparedStatement {
  private sql: string;
  private bindings: any[];
  private storage: MockReviewD1Database;

  constructor(sql: string, storage: MockReviewD1Database, bindings: any[] = []) {
    this.sql = sql;
    this.storage = storage;
    this.bindings = bindings;
  }

  bind(...params: any[]) {
    return new MockD1PreparedStatement(this.sql, this.storage, params);
  }

  async run() {
    return this.storage.executeSql(this.sql, this.bindings);
  }

  async all<T = any>() {
    const res = this.storage.querySql(this.sql, this.bindings);
    return { results: res as T[] };
  }

  async first<T = any>(colName?: string) {
    const res = this.storage.querySql(this.sql, this.bindings);
    if (!res || res.length === 0) return null;
    if (colName) return (res[0] as any)[colName] as T;
    return res[0] as T;
  }
}

class MockReviewD1Database {
  products: any[] = [];
  users: any[] = [];
  reviews: any[] = [];
  orders: any[] = [];
  auditLogs: any[] = [];
  rateLimits: any[] = [];

  constructor() {
    this.products = [
      { id: 'prod-watch-01', slug: 'luxury-watch', title: 'Luxury Chronograph Watch', price: 3500 },
    ];
    this.users = [
      {
        id: 'admin-creator-01',
        email: 'creator@example.com',
        name: 'Review Moderator Admin',
        role: 'admin',
        password: null,
        permissions_json: JSON.stringify({
          'reviews.view': true,
          'reviews.create': true,
        }),
        is_active: 1,
      },
      {
        id: 'admin-restricted-01',
        email: 'restricted@example.com',
        name: 'Restricted Admin (No Create)',
        role: 'admin',
        password: null,
        permissions_json: JSON.stringify({
          'reviews.view': true,
          'reviews.create': false,
        }),
        is_active: 1,
      },
      {
        id: 'cust-verified-01',
        email: 'buyer@example.com',
        name: 'Real Buyer',
        role: 'customer',
        password: null,
        permissions_json: '{}',
        is_active: 1,
      },
    ];
    // Order in DB for Real Buyer
    this.orders = [
      {
        id: 'ord-verified-99',
        order_number: 'ORD-9999',
        user_id: 'cust-verified-01',
        user_email: 'buyer@example.com',
        customer_phone: '01711223344',
        shipping_status: 'Delivered',
        items_json: JSON.stringify([
          {
            id: 'it-1',
            product: { id: 'prod-watch-01', title: 'Luxury Chronograph Watch' },
          },
        ]),
      },
    ];
  }

  prepare(sql: string) {
    return new MockD1PreparedStatement(sql, this);
  }

  executeSql(sql: string, bindings: any[] = []) {
    if (sql.includes('INSERT INTO reviews')) {
      const id = bindings[0];
      const product_id = bindings[1];
      const author_name = bindings[2];
      const rating = bindings[3];
      const comment = bindings[4];
      const verified_purchase = bindings[5];
      const status = bindings[6];
      const approved_at = bindings[7];
      const approved_by = bindings[8];
      const source = bindings.length > 10 ? bindings[9] : 'Customer Submitted';
      const customer_image = bindings.length > 11 ? bindings[10] : null;
      const screenshot_attachment = bindings.length > 12 ? bindings[11] : null;
      const created_at = bindings[bindings.length - 1];

      const record = {
        id,
        product_id,
        author_name,
        rating,
        comment,
        verified_purchase,
        status,
        approved_at,
        approved_by,
        source,
        customer_image,
        screenshot_attachment,
        created_at,
      };
      this.reviews.push(record);
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true, meta: { changes: 1 } };
  }

  querySql(sql: string, bindings: any[] = []) {
    if (sql.includes('FROM users')) {
      return this.users.filter((u) =>
        bindings.some((b) => b && (u.id === b || u.email.toLowerCase() === String(b).toLowerCase()))
      );
    }
    if (sql.includes('FROM reviews WHERE id = ?')) {
      return this.reviews.filter((r) => r.id === bindings[0]);
    }
    if (sql.includes('FROM reviews')) {
      return [...this.reviews];
    }
    if (sql.includes('FROM orders')) {
      return this.orders.filter((ord) => {
        if (bindings.some((b) => b === ord.user_id)) return true;
        if (bindings.some((b) => typeof b === 'string' && b.toLowerCase() === (ord.user_email || '').toLowerCase())) return true;
        if (bindings.some((b) => b === ord.order_number)) return true;
        return false;
      });
    }
    return [];
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('VERIFYING ADMIN REVIEW CREATION & SECURITY BOUNDARIES');
  console.log('========================================================');

  const secret = getTestSecret();
  const db = new MockReviewD1Database();
  const env: any = {
    DB: db,
    ADMIN_SECRET: secret,
  };

  const creatorToken = createSignedTestToken(
    {
      userId: 'admin-creator-01',
      email: 'creator@example.com',
      role: 'admin',
      permissions: { 'reviews.create': true, 'reviews.view': true },
    },
    secret
  );

  const restrictedToken = createSignedTestToken(
    {
      userId: 'admin-restricted-01',
      email: 'restricted@example.com',
      role: 'admin',
      permissions: { 'reviews.create': false, 'reviews.view': true },
    },
    secret
  );

  // ------------------------------------------------------------------
  // TEST 1: Unauthenticated request to POST /api/admin/reviews
  // ------------------------------------------------------------------
  console.log('\n--- TEST 1: Unauthenticated request ---');
  const reqUnauth = new Request('http://localhost/api/admin/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: 'prod-watch-01',
      authorName: 'Attacker',
      rating: 5,
      comment: 'Spam review',
    }),
  });
  const resUnauth = await handleApiRequest(reqUnauth, env);
  assert(resUnauth.status === 401, '1.1 Unauthenticated request blocked with 401 Unauthorized');

  // ------------------------------------------------------------------
  // TEST 2: Admin without reviews.create permission is blocked with 403
  // ------------------------------------------------------------------
  console.log('\n--- TEST 2: Admin without reviews.create blocked ---');
  const reqRestricted = new Request('http://localhost/api/admin/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${restrictedToken}`,
    },
    body: JSON.stringify({
      productId: 'prod-watch-01',
      authorName: 'Unauthorized Admin',
      rating: 5,
      comment: 'Should be rejected',
    }),
  });
  const resRestricted = await handleApiRequest(reqRestricted, env);
  assert(resRestricted.status === 403, '2.1 Admin lacking reviews.create blocked with 403 Forbidden');
  const bodyRestricted = await resRestricted.json();
  assert(
    bodyRestricted.error?.includes('reviews.create'),
    '2.2 Error message cites required "reviews.create" permission'
  );

  // ------------------------------------------------------------------
  // TEST 3: Admin with reviews.create creates review manually
  // ------------------------------------------------------------------
  console.log('\n--- TEST 3: Authorized review creation with optional fields ---');
  const reqCreate = new Request('http://localhost/api/admin/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creatorToken}`,
    },
    body: JSON.stringify({
      productId: 'prod-watch-01',
      authorName: 'Rahim Chowdhury',
      rating: 5,
      comment: 'Very premium packaging and rapid delivery in Dhaka!',
      source: 'WhatsApp',
      customerImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
      screenshotAttachment: 'https://images.unsplash.com/photo-1586769852044-692d6e3703f0',
    }),
  });
  const resCreate = await handleApiRequest(reqCreate, env);
  assert(resCreate.status === 201, '3.1 Admin review created with HTTP 201');
  const bodyCreate = await resCreate.json();
  assert(bodyCreate.success === true, '3.2 Response indicates success: true');
  const rev = bodyCreate.review;
  assert(rev.authorName === 'Rahim Chowdhury', '3.3 Author name correctly saved');
  assert(rev.rating === 5, '3.4 Rating saved');
  assert(rev.source === 'WhatsApp', '3.5 Optional Review Source (WhatsApp) saved');
  assert(
    rev.customerImage === 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
    '3.6 Optional Customer Image saved'
  );
  assert(
    rev.screenshotAttachment === 'https://images.unsplash.com/photo-1586769852044-692d6e3703f0',
    '3.7 Optional Screenshot Attachment saved'
  );
  assert(rev.status === 'approved', '3.8 Admin-created review status is STRICTLY approved');

  // ------------------------------------------------------------------
  // TEST 4: Security Rule - verifiedPurchase is FALSE by default
  // ------------------------------------------------------------------
  console.log('\n--- TEST 4: Server controls verifiedPurchase & denies client override ---');
  assert(rev.verifiedPurchase === false, '4.1 verifiedPurchase is FALSE by default');

  const reqSpoofVp = new Request('http://localhost/api/admin/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creatorToken}`,
    },
    body: JSON.stringify({
      productId: 'prod-watch-01',
      authorName: 'Spoof Test',
      rating: 4,
      comment: 'Attempting to spoof verified purchase',
      verifiedPurchase: true, // CLIENT TRIES TO FORCE TRUE
      status: 'pending',     // CLIENT TRIES TO FORCE PENDING
      approved_by: 'hacked_admin', // CLIENT TRIES TO SPOOF MODERATOR
      approved_at: '1999-01-01T00:00:00Z', // CLIENT TRIES TO SPOOF DATE
    }),
  });
  const resSpoofVp = await handleApiRequest(reqSpoofVp, env);
  assert(resSpoofVp.status === 201, '4.2 Spoof attempt request parsed');
  const bodySpoof = await resSpoofVp.json();
  const spoofedRev = bodySpoof.review;

  assert(
    spoofedRev.verifiedPurchase === false,
    '4.3 Client verifiedPurchase: true was REJECTED and set to false by server'
  );
  assert(
    spoofedRev.status === 'approved',
    '4.4 Client status: pending was OVERRIDDEN to approved by server rule'
  );
  assert(
    spoofedRev.approvedBy === 'creator@example.com' || spoofedRev.approvedBy === 'admin-creator-01',
    '4.5 Client approved_by was OVERRIDDEN by authenticated server user identity'
  );
  assert(
    spoofedRev.approvedAt !== '1999-01-01T00:00:00Z',
    '4.6 Client approved_at timestamp was OVERRIDDEN by current server timestamp'
  );

  // ------------------------------------------------------------------
  // TEST 5: Independent server verification grants verifiedPurchase
  // ------------------------------------------------------------------
  console.log('\n--- TEST 5: Independent server purchase verification ---');
  const reqVerifiedOrder = new Request('http://localhost/api/admin/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creatorToken}`,
    },
    body: JSON.stringify({
      productId: 'prod-watch-01',
      authorName: 'Real Buyer',
      rating: 5,
      comment: 'Legitimate buyer review from Facebook chat',
      source: 'Facebook',
      orderNumber: 'ORD-9999',
      customerPhone: '01711223344',
    }),
  });
  const resVerifiedOrder = await handleApiRequest(reqVerifiedOrder, env);
  assert(resVerifiedOrder.status === 201, '5.1 Verified order review created');
  const bodyVerified = await resVerifiedOrder.json();
  assert(
    bodyVerified.review.verifiedPurchase === true,
    '5.2 verifiedPurchase is TRUE when server independently verifies legitimate order match'
  );
  assert(
    bodyVerified.review.source === 'Facebook',
    '5.3 Review Source correctly set to Facebook'
  );

  // ------------------------------------------------------------------
  // TEST 6: Review Sources validation
  // ------------------------------------------------------------------
  console.log('\n--- TEST 6: Review Source enumeration validation ---');
  const validSources = ['Customer Submitted', 'Facebook', 'Messenger', 'WhatsApp', 'Instagram', 'Manual'];
  for (const src of validSources) {
    const reqSrc = new Request('http://localhost/api/admin/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creatorToken}`,
      },
      body: JSON.stringify({
        productId: 'prod-watch-01',
        authorName: `User ${src}`,
        rating: 5,
        comment: `Feedback via ${src}`,
        source: src,
      }),
    });
    const resSrc = await handleApiRequest(reqSrc, env);
    const bodySrc = await resSrc.json();
    assert(bodySrc.review?.source === src, `6.x Accepted valid source: ${src}`);
  }

  // Invalid source falls back to Manual
  const reqInvalidSrc = new Request('http://localhost/api/admin/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creatorToken}`,
    },
    body: JSON.stringify({
      productId: 'prod-watch-01',
      authorName: 'Invalid Source User',
      rating: 5,
      comment: 'Testing invalid source',
      source: 'MyCustomHackedChannel',
    }),
  });
  const resInvalidSrc = await handleApiRequest(reqInvalidSrc, env);
  const bodyInvalidSrc = await resInvalidSrc.json();
  assert(
    bodyInvalidSrc.review?.source === 'Manual',
    '6.7 Invalid source safely sanitized to "Manual"'
  );

  console.log('========================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
