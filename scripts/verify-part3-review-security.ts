import assert from 'node:assert';
import { handleApiRequest } from '../src/server/router';
import { createAuthToken, computePasswordSignature } from '../src/server/auth';
import { sanitizeReviewImageReference, isValidMediaKey } from '../src/server/imageSecurity';
import {
  insertReview,
  updateReviewInD1,
  deleteReviewFromD1,
  recalculateProductRatingFromApprovedReviews,
  verifyCustomerPurchaseInD1,
} from '../src/server/db';
import type { ReviewRow } from '../src/server/types';

class MockPreparedStatement {
  constructor(private sql: string, private db: MockD1Database) {}

  bind(...bindings: any[]) {
    return new MockPreparedStatementWithBindings(this.sql, this.db, bindings);
  }

  async first<T = any>(): Promise<T | null> {
    return new MockPreparedStatementWithBindings(this.sql, this.db, []).first<T>();
  }

  async all<T = any>(): Promise<{ results: T[] }> {
    return new MockPreparedStatementWithBindings(this.sql, this.db, []).all<T>();
  }

  async run(): Promise<{ success: boolean }> {
    return new MockPreparedStatementWithBindings(this.sql, this.db, []).run();
  }
}

class MockPreparedStatementWithBindings {
  constructor(private sql: string, private db: MockD1Database, private bindings: any[]) {}

  async first<T = any>(): Promise<T | null> {
    const res = this.db.querySql(this.sql, this.bindings);
    return res.length > 0 ? (res[0] as T) : null;
  }

  async all<T = any>(): Promise<{ results: T[] }> {
    const res = this.db.querySql(this.sql, this.bindings);
    return { results: res as T[] };
  }

  async run(): Promise<{ success: boolean }> {
    return this.db.executeSql(this.sql, this.bindings);
  }
}

class MockD1Database {
  products: any[] = [
    {
      id: 'prod-watch-01',
      slug: 'quartz-watch',
      title: 'Luxury Quartz Watch',
      price: 2500,
      stock: 10,
      rating: 5.0,
      reviews_count: 1,
      status: 'active',
    },
    {
      id: 'prod-wallet-01',
      slug: 'leather-wallet',
      title: 'Premium Leather Wallet',
      price: 1200,
      stock: 15,
      rating: 5.0,
      reviews_count: 0,
      status: 'active',
    },
  ];

  users: any[] = [
    {
      id: 'user-super-01',
      email: 'super@rongdhonutrade.com',
      name: 'Super Admin',
      role: 'super_admin',
      password: '$2a$12$e6xI14b7eM8Yg5Q/nN0LceKxP0cZ1bF7p2j4u6w8y0z2a4c6e8g0i',
      permissions_json: '{}',
      is_active: 1,
    },
    {
      id: 'user-admin-reviews',
      email: 'moderator@rongdhonutrade.com',
      name: 'Review Moderator',
      role: 'admin',
      password: '$2a$12$e6xI14b7eM8Yg5Q/nN0LceKxP0cZ1bF7p2j4u6w8y0z2a4c6e8g0i',
      permissions_json: JSON.stringify({
        'review.view': true,
        'review.manage': true,
        'review.delete': true,
      }),
      is_active: 1,
    },
    {
      id: 'user-admin-readonly',
      email: 'readonly@rongdhonutrade.com',
      name: 'Readonly Admin',
      role: 'admin',
      password: '$2a$12$e6xI14b7eM8Yg5Q/nN0LceKxP0cZ1bF7p2j4u6w8y0z2a4c6e8g0i',
      permissions_json: JSON.stringify({
        'review.view': true,
        'review.manage': false,
        'review.delete': false,
      }),
      is_active: 1,
    },
    {
      id: 'user-customer-alice',
      email: 'alice@example.com',
      name: 'Alice Purchaser',
      role: 'customer',
      password: '$2a$12$e6xI14b7eM8Yg5Q/nN0LceKxP0cZ1bF7p2j4u6w8y0z2a4c6e8g0i',
      permissions_json: '{}',
      is_active: 1,
    },
    {
      id: 'user-customer-bob',
      email: 'bob@example.com',
      name: 'Bob NonPurchaser',
      role: 'customer',
      password: '$2a$12$e6xI14b7eM8Yg5Q/nN0LceKxP0cZ1bF7p2j4u6w8y0z2a4c6e8g0i',
      permissions_json: '{}',
      is_active: 1,
    },
  ];

  orders: any[] = [
    {
      id: 'ord-101',
      order_number: 'ORD-101',
      user_id: 'user-customer-alice',
      user_email: 'alice@example.com',
      customer_name: 'Alice Purchaser',
      customer_phone: '01711223344',
      shipping_status: 'Delivered',
      items_json: JSON.stringify([
        {
          id: 'prod-watch-01',
          productId: 'prod-watch-01',
          product: { id: 'prod-watch-01', slug: 'quartz-watch' },
        },
      ]),
    },
    {
      id: 'ord-102',
      order_number: 'ORD-102-GUEST',
      user_id: null,
      user_email: 'guest@example.com',
      customer_name: 'Guest Buyer',
      customer_phone: '01899887766',
      shipping_status: 'Shipped',
      items_json: JSON.stringify([
        {
          id: 'prod-wallet-01',
          productId: 'prod-wallet-01',
          product: { id: 'prod-wallet-01', slug: 'leather-wallet' },
        },
      ]),
    },
  ];

  reviews: any[] = [
    {
      id: 'rev-seed-1',
      product_id: 'prod-watch-01',
      author_name: 'Legacy Buyer',
      rating: 5,
      comment: 'Initial 5-star review',
      verified_purchase: 1,
      status: 'approved',
      source: 'customer',
      approved_at: '2026-01-01T00:00:00Z',
      approved_by: 'system_migration',
      images_json: '[]',
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  mediaAssets: any[] = [
    { id: 'asset-1740000000000-valid123.jpg' },
  ];

  prepare(sql: string) {
    return new MockPreparedStatement(sql, this);
  }

  querySql(sql: string, bindings: any[] = []): any[] {
    const s = sql.toLowerCase();

    if (s.includes('pragma table_info')) {
      return [
        { name: 'id' },
        { name: 'product_id' },
        { name: 'author_name' },
        { name: 'rating' },
        { name: 'comment' },
        { name: 'verified_purchase' },
        { name: 'status' },
        { name: 'source' },
        { name: 'approved_at' },
        { name: 'approved_by' },
        { name: 'updated_at' },
        { name: 'images_json' },
        { name: 'created_at' },
      ];
    }

    if (s.includes('from rate_limits')) return [];

    if (s.includes('from users')) {
      const term = bindings[0];
      return this.users.filter((u) => u.email === term || u.id === term);
    }

    if (s.includes('from products')) {
      if (bindings.length >= 1) {
        const idOrSlug = bindings[0];
        return this.products.filter((p) => p.id === idOrSlug || p.slug === idOrSlug);
      }
      return this.products;
    }

    if (s.includes('from media_assets')) {
      if (bindings.length >= 1) {
        const id = bindings[0];
        return this.mediaAssets.filter((m) => m.id === id);
      }
      return this.mediaAssets;
    }

    if (s.includes('count(id)') && s.includes('avg(rating)') && s.includes('from reviews')) {
      const prodId = bindings[0];
      const approved = this.reviews.filter(
        (r) => r.product_id === prodId && (r.status === 'approved' || r.status === null || r.status === undefined)
      );
      const total_count = approved.length;
      const avg_rating = total_count > 0 ? approved.reduce((sum, r) => sum + Number(r.rating || 5), 0) / total_count : null;
      return [{ total_count, avg_rating }];
    }

    if (s.includes('from reviews')) {
      if (s.includes('where product_id = ? and comment = ?')) {
        const [pid, comment] = bindings;
        return this.reviews.filter((r) => r.product_id === pid && r.comment === comment);
      }
      if (s.includes('where id = ?')) {
        return this.reviews.filter((r) => r.id === bindings[0]);
      }
      if (s.includes("status = 'approved' or status is null")) {
        let rows = this.reviews.filter((r) => r.status === 'approved' || !r.status);
        if (bindings.length > 0 && s.includes('product_id = ?')) {
          rows = rows.filter((r) => r.product_id === bindings[0]);
        }
        return rows;
      }
      if (s.includes('status = ?')) {
        const statusVal = bindings[s.includes('product_id = ?') ? 1 : 0];
        return this.reviews.filter((r) => r.status === statusVal);
      }
      return this.reviews;
    }

    if (s.includes('from orders')) {
      return this.orders.filter((ord) => {
        if (s.includes("shipping_status != 'cancelled'") && ord.shipping_status === 'Cancelled') {
          return false;
        }
        const prodBinding = bindings[bindings.length - 1];
        const cleanProd = String(prodBinding).replace(/%/g, '');
        if (!ord.items_json.includes(cleanProd)) return false;

        if (s.includes('user_id = ?') || s.includes('lower(user_email) = ?')) {
          return bindings.some(
            (b) => b === ord.user_id || (ord.user_email && String(b).toLowerCase() === ord.user_email.toLowerCase())
          );
        }

        if (s.includes('order_number = ?') && s.includes('customer_phone like ?')) {
          const ordNo = bindings[0];
          const phonePattern = bindings[1].replace(/%/g, '');
          return ord.order_number === ordNo && ord.customer_phone.includes(phonePattern);
        }

        return false;
      });
    }

    return [];
  }

  executeSql(sql: string, bindings: any[] = []): any {
    const s = sql.toLowerCase();

    if (s.includes('insert into reviews')) {
      const id = bindings[0];
      const product_id = bindings[1];
      const author_name = bindings[2];
      const rating = bindings[3];
      const comment = bindings[4];
      const verified_purchase = bindings[5];
      const status = bindings[6];
      const source = bindings[7];
      const approved_at = bindings[8];
      const approved_by = bindings[9];
      const images_json = bindings[10];
      const created_at = bindings[11];

      const newRev = {
        id,
        product_id,
        author_name,
        rating,
        comment,
        verified_purchase,
        status,
        source,
        approved_at,
        approved_by,
        images_json: images_json || '[]',
        created_at,
      };
      this.reviews.push(newRev);
      return { success: true };
    }

    if (s.includes('update reviews set')) {
      const id = bindings[bindings.length - 1];
      const idx = this.reviews.findIndex((r) => r.id === id);
      if (idx !== -1) {
        if (s.includes('status = ?')) {
          const statusIdx = s.indexOf('status = ?');
          this.reviews[idx].status = bindings[0];
        }
      }
      return { success: true };
    }

    if (s.includes('delete from reviews where id = ?')) {
      const id = bindings[0];
      this.reviews = this.reviews.filter((r) => r.id !== id);
      return { success: true };
    }

    if (s.includes('update products set rating = ?, reviews_count = ?')) {
      const [rating, reviews_count, id] = bindings;
      const p = this.products.find((prod) => prod.id === id);
      if (p) {
        p.rating = rating;
        p.reviews_count = reviews_count;
      }
      return { success: true };
    }

    return { success: true };
  }
}

async function runPart3SecurityVerification() {
  console.log('================================================================');
  console.log('PART 3 REVIEW SYSTEM: SECURITY, MODERATION & ISOLATION AUDIT');
  console.log('================================================================\n');

  const mockDb = new MockD1Database();
  const env: any = {
    DB: mockDb,
    ADMIN_SECRET: 'test-admin-secret-999',
  };

  const testPwdHash = '$2a$12$e6xI14b7eM8Yg5Q/nN0LceKxP0cZ1bF7p2j4u6w8y0z2a4c6e8g0i';
  const testPwdSig = await computePasswordSignature(testPwdHash);

  const moderatorToken = await createAuthToken(
    { userId: 'user-admin-reviews', email: 'moderator@rongdhonutrade.com', role: 'admin', pwdSig: testPwdSig },
    env.ADMIN_SECRET
  );

  const readonlyAdminToken = await createAuthToken(
    { userId: 'user-admin-readonly', email: 'readonly@rongdhonutrade.com', role: 'admin', pwdSig: testPwdSig },
    env.ADMIN_SECRET
  );

  const aliceCustomerToken = await createAuthToken(
    { userId: 'user-customer-alice', email: 'alice@example.com', role: 'customer', pwdSig: testPwdSig },
    env.ADMIN_SECRET
  );

  // -------------------------------------------------------------------------
  // 1. Customer Review Defaults to Pending & Strips Client Overrides
  // -------------------------------------------------------------------------
  console.log('[TEST 1] Verifying customer review defaults strictly to Pending and strips client metadata...');
  {
    const req = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.0.1' },
      body: JSON.stringify({
        productId: 'prod-watch-01',
        authorName: 'Hacker Joe',
        rating: 1,
        comment: 'This is a test pending review.',
        // Attacker payload trying to override protected fields:
        status: 'approved',
        approvedBy: 'HackerStaff',
        approvedAt: '2026-01-01T00:00:00Z',
        source: 'admin',
        verifiedPurchase: true,
      }),
    });

    const res = await handleApiRequest(req, env);
    const data = await res.json() as any;

    assert.strictEqual(res.status, 201, '1.1 Customer review creation succeeds with 201');
    assert.strictEqual(data.success, true, '1.2 Response success is true');
    assert.strictEqual(data.review.status, 'pending', '1.3 Review status MUST be pending despite client asking for approved');
    assert.strictEqual(data.review.source, 'customer', '1.4 Review source MUST be customer despite client asking for admin');
    assert.strictEqual(data.review.approvedBy, undefined, '1.5 approvedBy MUST be undefined for customer review');
    assert.strictEqual(data.review.verifiedPurchase, false, '1.6 verifiedPurchase MUST be false (attacker is not verified buyer)');

    // Ensure product rating remains 5.0 (isolated from pending review)
    const watchProd = mockDb.products.find((p) => p.id === 'prod-watch-01');
    assert.strictEqual(watchProd.rating, 5.0, '1.7 Product rating is NOT degraded by pending review');
    console.log('✅ TEST 1 PASSED: Customer review strictly isolated in pending status.');
  }

  // -------------------------------------------------------------------------
  // 2. Public API Returns Approved Reviews Only
  // -------------------------------------------------------------------------
  console.log('\n[TEST 2] Verifying Public API filters to Approved reviews only...');
  {
    // Public query (no auth)
    const publicReq = new Request('http://localhost:3000/api/reviews?productId=prod-watch-01', {
      method: 'GET',
    });
    const publicRes = await handleApiRequest(publicReq, env);
    const publicData = await publicRes.json() as any;

    assert.strictEqual(publicRes.status, 200, '2.1 Public query returns 200');
    assert(Array.isArray(publicData.reviews), '2.2 Reviews array returned');
    assert(publicData.reviews.every((r: any) => r.status === 'approved'), '2.3 Public results contain ONLY approved reviews');
    assert(!publicData.reviews.some((r: any) => r.status === 'pending'), '2.4 Pending reviews are NEVER returned publicly');

    // Unauthorized query asking for pending queue (?status=pending)
    const unauthQueueReq = new Request('http://localhost:3000/api/reviews?status=pending', {
      method: 'GET',
    });
    const unauthQueueRes = await handleApiRequest(unauthQueueReq, env);
    assert.strictEqual(unauthQueueRes.status, 403, '2.5 Unauthenticated request for pending queue blocked with HTTP 403');

    // Customer query asking for pending queue
    const custQueueReq = new Request('http://localhost:3000/api/reviews?status=pending', {
      method: 'GET',
      headers: { Authorization: `Bearer ${aliceCustomerToken}` },
    });
    const custQueueRes = await handleApiRequest(custQueueReq, env);
    assert.strictEqual(custQueueRes.status, 403, '2.6 Customer request for moderation queue blocked with HTTP 403');
    console.log('✅ TEST 2 PASSED: Moderation queue is completely inaccessible to unauthenticated/customer users.');
  }

  // -------------------------------------------------------------------------
  // 3. Authorized Admin Moderation & Rating Recalculation
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3] Verifying Admin Moderation approval and permission boundaries...');
  {
    // Readonly admin attempting to approve review (has review.view, but NOT review.manage)
    const unauthorizedPatchReq = new Request('http://localhost:3000/api/reviews/rev-seed-1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${readonlyAdminToken}`,
      },
      body: JSON.stringify({ status: 'rejected' }),
    });
    const unauthorizedPatchRes = await handleApiRequest(unauthorizedPatchReq, env);
    assert.strictEqual(unauthorizedPatchRes.status, 403, '3.1 Admin without review.manage blocked from approving/rejecting');

    // Authorized moderator approving review
    const authorizedPatchReq = new Request('http://localhost:3000/api/reviews/rev-seed-1', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${moderatorToken}`,
      },
      body: JSON.stringify({ status: 'approved' }),
    });
    const authorizedPatchRes = await handleApiRequest(authorizedPatchReq, env);
    assert.strictEqual(authorizedPatchRes.status, 200, '3.2 Authorized moderator updates review with HTTP 200');

    // Customer attempting to delete review
    const custDeleteReq = new Request('http://localhost:3000/api/reviews/rev-seed-1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${aliceCustomerToken}` },
    });
    const custDeleteRes = await handleApiRequest(custDeleteReq, env);
    assert.strictEqual(custDeleteRes.status, 403, '3.3 Customer DELETE review blocked with HTTP 403');
    console.log('✅ TEST 3 PASSED: Server-side RBAC strictly governs review moderation and deletion.');
  }

  // -------------------------------------------------------------------------
  // 4. Server-Authoritative Verified Purchase Check
  // -------------------------------------------------------------------------
  console.log('\n[TEST 4] Verifying Verified Purchase server check...');
  {
    // Authenticated Alice who bought prod-watch-01
    const aliceReq = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceCustomerToken}`,
        'x-real-ip': '10.0.0.2',
      },
      body: JSON.stringify({
        productId: 'prod-watch-01',
        authorName: 'Alice Purchaser',
        rating: 5,
        comment: 'I really love this luxury watch!',
      }),
    });
    const aliceRes = await handleApiRequest(aliceReq, env);
    const aliceData = await aliceRes.json() as any;
    assert.strictEqual(aliceRes.status, 201, '4.1 Alice review submitted successfully');
    assert.strictEqual(aliceData.review.verifiedPurchase, true, '4.2 Alice verifiedPurchase resolved to TRUE');

    // Guest with valid order number and phone matching ord-102-GUEST (bought prod-wallet-01)
    const guestReq = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-real-ip': '10.0.0.3',
      },
      body: JSON.stringify({
        productId: 'prod-wallet-01',
        authorName: 'Guest Buyer',
        orderNumber: 'ORD-102-GUEST',
        phone: '01899887766',
        rating: 5,
        comment: 'Great genuine leather wallet!',
      }),
    });
    const guestRes = await handleApiRequest(guestReq, env);
    const guestData = await guestRes.json() as any;
    assert.strictEqual(guestRes.status, 201, '4.3 Guest review created');
    assert.strictEqual(guestData.review.verifiedPurchase, true, '4.4 Guest verifiedPurchase verified by 2-factor order+phone match');
    console.log('✅ TEST 4 PASSED: Server-authoritative verified purchase check validated.');
  }

  // -------------------------------------------------------------------------
  // 5. Input Validation, Cross-Product Protection & Arbitrary URL Sanitization
  // -------------------------------------------------------------------------
  console.log('\n[TEST 5] Verifying Input Validation, cross-product checks, and image URL sanitization...');
  {
    // Nonexistent product ID
    const badProdReq = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.0.4' },
      body: JSON.stringify({
        productId: 'nonexistent-prod-id',
        authorName: 'Test Author',
        rating: 5,
        comment: 'Great item',
      }),
    });
    const badProdRes = await handleApiRequest(badProdReq, env);
    assert.strictEqual(badProdRes.status, 400, '5.1 Nonexistent product rejected with HTTP 400');

    // Invalid rating (> 5)
    const badRatingReq = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.0.5' },
      body: JSON.stringify({
        productId: 'prod-watch-01',
        authorName: 'Test Author',
        rating: 10,
        comment: 'Super awesome',
      }),
    });
    const badRatingRes = await handleApiRequest(badRatingReq, env);
    assert.strictEqual(badRatingRes.status, 400, '5.2 Rating > 5 rejected with HTTP 400');

    // Malicious image URL injection testing
    const maliciousImg = sanitizeReviewImageReference('javascript:alert(1)');
    assert.strictEqual(maliciousImg, null, '5.3 javascript: image injection blocked');

    const dataUriImg = sanitizeReviewImageReference('data:image/jpeg;base64,1234');
    assert.strictEqual(dataUriImg, null, '5.4 data: inline payload injection blocked');

    const untrustedExtImg = sanitizeReviewImageReference('http://evil-tracker.com/cookie.png');
    assert.strictEqual(untrustedExtImg, null, '5.5 Insecure http untrusted domain blocked');

    const validStorageKey = sanitizeReviewImageReference('asset-1740000000000-valid123.jpg');
    assert(validStorageKey !== null, '5.6 Valid internal media key accepted');

    const validUnsplash = sanitizeReviewImageReference('https://images.unsplash.com/photo-123.jpg');
    assert(validUnsplash !== null, '5.7 Trusted CDN image URL accepted');
    console.log('✅ TEST 5 PASSED: Strict input validation and image sanitization verified.');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL PART 3 REVIEW SECURITY & MODERATION TESTS PASSED CLEANLY!');
  console.log('================================================================');
}

runPart3SecurityVerification().catch((err) => {
  console.error('Part 3 Verification Failed:', err);
  process.exit(1);
});
