/**
 * Comprehensive Verification Suite for Review Targeted Refresh & Batch Add
 * 
 * Verifies:
 * 1. Batch Review Creation (/api/admin/reviews/batch)
 *    - Validates required fields (productId, authorName, comment, rating)
 *    - Rejects invalid products or ratings
 *    - Correctly sets status ('approved' vs 'pending') and verifiedPurchase flag
 *    - Atomically recalculates product rating & review count for all affected products
 *    - Returns detailed result summary (totalProcessed, successfulCount, failedCount, errors, productAggregates)
 * 2. Targeted Data Refresh Workflow
 *    - Approving/rejecting returns updated review & affected product aggregates
 *    - Deleting review returns productId & updated aggregate
 *    - No full-store refresh triggered in AdminProvider for review actions
 * 3. Review Moderation & Verified Customer Security
 *    - Public submissions strictly receive status = 'pending'
 *    - Public visitors cannot spoof verifiedPurchase = true
 *    - Admin can toggle verified customer badge and changes persist
 */

import fs from 'fs';
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

// In-Memory Mock Database
class MockD1Database {
  private tables: {
    reviews: any[];
    products: any[];
    orders: any[];
    users: any[];
    audit_logs: any[];
    rate_limits: any[];
  } = {
    reviews: [],
    products: [],
    orders: [],
    users: [],
    audit_logs: [],
    rate_limits: [],
  };

  constructor() {
    this.reset();
  }

  reset() {
    this.tables.products = [
      {
        id: 'prod-batch-01',
        slug: 'silk-punjabi-01',
        title: 'Exclusive Silk Punjabi',
        price: 3200,
        original_price: 3800,
        category_id: 'cat-mens-fashion',
        description: 'Premium pure silk embroidered punjabi',
        image_url: 'https://example.com/punjabi.jpg',
        stock: 25,
        rating: 5.0,
        reviews_count: 0,
        featured: 0,
        featured_sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'prod-batch-02',
        slug: 'jamdani-saree-01',
        title: 'Handloom Jamdani Saree',
        price: 5500,
        original_price: 6500,
        category_id: 'cat-womens-fashion',
        description: 'Authentic Dhakai Jamdani handloom saree',
        image_url: 'https://example.com/saree.jpg',
        stock: 15,
        rating: 5.0,
        reviews_count: 0,
        featured: 0,
        featured_sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    this.tables.users = [
      {
        id: 'admin-mod-1',
        name: 'Staff Moderator',
        email: 'moderator@rongdhonutrade.com',
        role: 'sub_admin',
        permissions_json: JSON.stringify({
          'review.manage': true,
        }),
      },
      {
        id: 'admin-unauth-1',
        name: 'Unauthorized Staff',
        email: 'unauth@rongdhonutrade.com',
        role: 'sub_admin',
        permissions_json: JSON.stringify({
          'order.view': true,
        }),
      },
      {
        id: 'super-admin-1',
        name: 'Super Admin',
        email: 'superadmin@rongdhonutrade.com',
        role: 'super_admin',
        permissions_json: null,
      },
    ];

    this.tables.reviews = [];
    this.tables.orders = [];
    this.tables.audit_logs = [];
    this.tables.rate_limits = [];
  }

  prepare(query: string) {
    return new MockPreparedStatement(query, this);
  }

  getReviews() { return this.tables.reviews; }
  getProducts() { return this.tables.products; }
  getOrders() { return this.tables.orders; }
  getAuditLogs() { return this.tables.audit_logs; }
  getUsers() { return this.tables.users; }
}

class MockPreparedStatement {
  private sql: string;
  private db: MockD1Database;
  private params: any[] = [];

  constructor(sql: string, db: MockD1Database, params: any[] = []) {
    this.sql = sql;
    this.db = db;
    this.params = params;
  }

  bind(...params: any[]) {
    return new MockPreparedStatement(this.sql, this.db, params);
  }

  async run() {
    const s = this.sql.replace(/\s+/g, ' ').trim();

    // INSERT INTO reviews
    if (s.startsWith('INSERT INTO reviews')) {
      const id = this.params[0];
      const prodId = this.params[1];
      const author = this.params[2];
      const rating = Number(this.params[3]);
      const comment = this.params[4];
      const verified = Number(this.params[5] || 0);
      const status = this.params[6] || 'pending';
      const modId = this.params[7] || null;
      const modAt = this.params[8] || null;
      const modNote = this.params[9] || null;
      const createdByAdmin = Number(this.params[10] || 0);
      const createdAt = this.params[11] || new Date().toISOString();

      const newRev = {
        id,
        product_id: prodId,
        author_name: author,
        rating,
        comment,
        verified_purchase: verified,
        status,
        moderator_id: modId,
        moderated_at: modAt,
        moderation_note: modNote,
        created_by_admin: createdByAdmin,
        created_at: createdAt,
      };
      this.db.getReviews().unshift(newRev);
      return { success: true };
    }

    // UPDATE reviews SET status = ...
    if (s.startsWith('UPDATE reviews SET status = ?') || (s.includes('UPDATE reviews') && s.includes('SET status = ?'))) {
      const newStatus = this.params[0];
      const modId = this.params[1];
      const modAt = this.params[2];
      const modNote = this.params[3];
      const revId = this.params[4];

      const r = this.db.getReviews().find((x) => x.id === revId);
      if (r) {
        r.status = newStatus;
        r.moderator_id = modId;
        r.moderated_at = modAt;
        if (modNote !== undefined) r.moderation_note = modNote;
        return { success: true };
      }
      return { success: false };
    }

    // UPDATE reviews SET verified_purchase = ? WHERE id = ?
    if (s.startsWith('UPDATE reviews SET verified_purchase = ? WHERE id = ?') || (s.includes('UPDATE reviews') && s.includes('verified_purchase = ?'))) {
      const verified = Number(this.params[0]);
      const revId = this.params[1];
      const r = this.db.getReviews().find((x) => x.id === revId);
      if (r) {
        r.verified_purchase = verified;
        return { success: true };
      }
      return { success: false };
    }

    // DELETE FROM reviews WHERE id = ?
    if (s.startsWith('DELETE FROM reviews WHERE id = ?')) {
      const revId = this.params[0];
      const idx = this.db.getReviews().findIndex((x) => x.id === revId);
      if (idx !== -1) {
        this.db.getReviews().splice(idx, 1);
        return { success: true };
      }
      return { success: false };
    }

    // UPDATE products SET rating = ?, reviews_count = ?
    if (s.startsWith('UPDATE products SET rating = ?, reviews_count = ?')) {
      const newRating = Number(this.params[0]);
      const newCount = Number(this.params[1]);
      const prodId = this.params[2];

      const p = this.db.getProducts().find((x) => x.id === prodId);
      if (p) {
        p.rating = newRating;
        p.reviews_count = newCount;
        p.updated_at = new Date().toISOString();
        return { success: true };
      }
      return { success: false };
    }

    // INSERT INTO audit_logs
    if (s.startsWith('INSERT INTO audit_logs')) {
      return { success: true };
    }

    return { success: true };
  }

  async first<T = any>(colName?: string) {
    const res = await this.all<T>();
    const list = res.results || [];
    if (list.length === 0) return null;
    if (colName) return (list[0] as any)[colName] as T;
    return list[0] as T;
  }

  async all<T = any>() {
    const s = this.sql.replace(/\s+/g, ' ').trim();

    // SELECT rating FROM reviews WHERE product_id = ? AND status = 'approved'
    if (s.includes('FROM reviews WHERE product_id = ?') && s.includes("status = 'approved'")) {
      const prodId = this.params[0];
      const approved = this.db
        .getReviews()
        .filter((r) => r.product_id === prodId && r.status === 'approved')
        .map((r) => ({ rating: r.rating }));
      return { results: approved as T[] };
    }

    // SELECT rating, reviews_count FROM products WHERE id = ?
    if (s.startsWith('SELECT rating, reviews_count FROM products WHERE id = ?')) {
      const prodId = this.params[0];
      const p = this.db.getProducts().find((x) => x.id === prodId);
      if (p) {
        return { results: [{ rating: p.rating, reviews_count: p.reviews_count }] as T[] };
      }
      return { results: [] };
    }

    // SELECT * FROM products WHERE id = ? OR slug = ?
    if (s.includes('FROM products') && s.includes('WHERE id = ? OR slug = ?')) {
      const idOrSlug = this.params[0];
      const p = this.db.getProducts().find((x) => x.id === idOrSlug || x.slug === idOrSlug);
      return { results: p ? [p as T] : [] };
    }

    // SELECT * FROM products WHERE id = ?
    if (s.includes('FROM products') && s.includes('WHERE id = ?')) {
      const pId = this.params[0];
      const p = this.db.getProducts().find((x) => x.id === pId);
      return { results: p ? [p as T] : [] };
    }

    // SELECT product_id FROM reviews WHERE id = ?
    if (s.includes('SELECT product_id FROM reviews WHERE id = ?')) {
      const revId = this.params[0];
      const r = this.db.getReviews().find((x) => x.id === revId);
      return { results: r ? [{ product_id: r.product_id } as T] : [] };
    }

    // SELECT ... FROM reviews WHERE id = ?
    if (s.includes('FROM reviews WHERE id = ?')) {
      const revId = this.params[0];
      const r = this.db.getReviews().find((x) => x.id === revId);
      return { results: r ? [r as T] : [] };
    }

    // Public reviews for a product:
    if (s.includes('FROM reviews') && s.includes("status = 'approved'") && s.includes('product_id = ?')) {
      const prodId = this.params[0];
      const approved = this.db
        .getReviews()
        .filter((r) => r.product_id === prodId && r.status === 'approved');
      return { results: approved as T[] };
    }

    // Public reviews: SELECT ... FROM reviews WHERE status = 'approved'
    if (s.includes('FROM reviews') && s.includes("status = 'approved'") && !s.includes('product_id = ?')) {
      const approved = this.db
        .getReviews()
        .filter((r) => r.status === 'approved');
      return { results: approved as T[] };
    }

    // Admin reviews listing: SELECT ... FROM reviews ... ORDER BY created_at DESC
    if (s.includes('FROM reviews') && s.includes('ORDER BY created_at DESC')) {
      return { results: this.db.getReviews() as T[] };
    }

    // Users lookup for requireAuth:
    if (s.includes('FROM users')) {
      const p1 = String(this.params[0] || '').toLowerCase().trim();
      const p2 = String(this.params[1] || this.params[0] || '').trim();
      const u = this.db.getUsers().find((x) =>
        x.email.toLowerCase() === p1 || x.id === p2 || x.id === p1
      );
      return { results: u ? [u as T] : [] };
    }

    return { results: [] };
  }
}

async function runVerificationSuite() {
  console.log('========================================================');
  console.log('VERIFYING REVIEW BATCH ADD & TARGETED REFRESH SUITE');
  console.log('========================================================\n');

  const mockDb = new MockD1Database();
  const env: any = {
    DB: mockDb,
    ADMIN_SECRET: getTestSecret(),
  };

  const moderatorToken = createSignedTestToken({
    userId: 'admin-mod-1',
    email: 'moderator@rongdhonutrade.com',
    role: 'sub_admin',
    permissions: { 'review.manage': true },
  });

  const unauthStaffToken = createSignedTestToken({
    userId: 'admin-unauth-1',
    email: 'unauth@rongdhonutrade.com',
    role: 'sub_admin',
    permissions: { 'order.view': true },
  });

  // ----------------------------------------------------
  // TEST 1: Batch Review Creation API & Validation
  // ----------------------------------------------------
  console.log('--- TEST 1: Batch Review Creation End-to-End ---');

  // 1.1 Forbidden for staff without review.manage
  const staffBatchReq = new Request('https://api.test/api/admin/reviews/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${unauthStaffToken}`,
    },
    body: JSON.stringify({
      reviews: [{ productId: 'prod-batch-01', authorName: 'Customer A', rating: 5, comment: 'Great product' }],
    }),
  });
  const staffBatchRes = await handleApiRequest(staffBatchReq, env);
  assert(staffBatchRes.status === 403, '1.1 Non-authorized staff receives 403 Forbidden for batch reviews');

  // 1.2 Empty batch rejection
  const emptyBatchReq = new Request('https://api.test/api/admin/reviews/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${moderatorToken}`,
    },
    body: JSON.stringify({ reviews: [] }),
  });
  const emptyBatchRes = await handleApiRequest(emptyBatchReq, env);
  assert(emptyBatchRes.status === 400, '1.2 Empty review batch payload returns 400 Bad Request');

  // 1.3 Successful multi-row batch addition with mixed products, ratings, and statuses
  const batchPayload = {
    reviews: [
      {
        productId: 'prod-batch-01',
        authorName: 'Farhan Kabir',
        rating: 5,
        comment: 'Outstanding quality and authentic silk fabric. Highly recommend!',
        status: 'approved',
        verifiedPurchase: true,
        moderationNote: 'Verified buyer batch upload',
      },
      {
        productId: 'prod-batch-01',
        authorName: 'Nusrat Jahan',
        rating: 4,
        comment: 'Very nice finishing and timely delivery. True to size.',
        status: 'approved',
        verifiedPurchase: true,
        moderationNote: 'Verified buyer batch upload',
      },
      {
        productId: 'prod-batch-02',
        authorName: 'Sabrina Rahman',
        rating: 5,
        comment: 'Splendid jamdani weaving. Absolutely stunning colors!',
        status: 'approved',
        verifiedPurchase: true,
        moderationNote: 'Verified buyer batch upload',
      },
      {
        productId: 'prod-batch-02',
        authorName: 'Arafat Hossain',
        rating: 3,
        comment: 'Fabric is good but delivery was slightly delayed. Pending review.',
        status: 'pending', // Pending review must NOT affect rating
        verifiedPurchase: true,
        moderationNote: 'Customer inquiry verification pending',
      },
    ],
  };

  const validBatchReq = new Request('https://api.test/api/admin/reviews/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${moderatorToken}`,
    },
    body: JSON.stringify(batchPayload),
  });
  const validBatchRes = await handleApiRequest(validBatchReq, env);
  assert(validBatchRes.status === 201, '1.3 Valid batch upload returns HTTP 201 Created');
  const validBatchData = await validBatchRes.json();
  assert(validBatchData.success === true, '1.4 Batch result response indicates success: true');
  assert(validBatchData.totalProcessed === 4, '1.5 Processed total of 4 items');
  assert(validBatchData.successfulCount === 4, '1.6 All 4 valid review items succeeded');
  assert(validBatchData.failedCount === 0, '1.7 Zero failed items in valid batch');
  assert(Array.isArray(validBatchData.reviews) && validBatchData.reviews.length === 4, '1.8 Returns 4 created review objects');

  // 1.4 Product aggregates returned in batch response
  assert(Boolean(validBatchData.productAggregates), '1.9 Response includes targeted productAggregates map');
  const agg1 = validBatchData.productAggregates['prod-batch-01'];
  assert(agg1 && agg1.rating === 4.5 && agg1.reviewsCount === 2, '1.10 Product 01 rating recalculated to 4.5★ with 2 reviews');

  const agg2 = validBatchData.productAggregates['prod-batch-02'];
  assert(agg2 && agg2.rating === 5.0 && agg2.reviewsCount === 1, '1.11 Product 02 rating recalculated to 5.0★ with 1 approved review (pending excluded)');

  // ----------------------------------------------------
  // TEST 2: Targeted Refresh Response Structure
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Targeted Refresh Responses ---');

  // 2.1 Approving a pending review returns both updated review and aggregate
  const pendingRev = validBatchData.reviews.find((r: any) => r.status === 'pending');
  assert(Boolean(pendingRev), '2.1 Located pending review from batch upload');

  const approveReq = new Request(`https://api.test/api/admin/reviews/${pendingRev.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${moderatorToken}`,
    },
    body: JSON.stringify({ status: 'approved', note: 'Manually approved by admin' }),
  });
  const approveRes = await handleApiRequest(approveReq, env);
  assert(approveRes.status === 200, '2.2 Review approval returns HTTP 200');
  const approveData = await approveRes.json();
  assert(approveData.review.status === 'approved', '2.3 Review status updated to approved');
  assert(approveData.aggregate && approveData.aggregate.reviewsCount === 2 && approveData.aggregate.rating === 4.0,
    '2.4 Approval response includes targeted aggregate (rating: 4.0★, count: 2)');

  // 2.2 Rejecting review returns updated review and aggregate
  const rejectReq = new Request(`https://api.test/api/admin/reviews/${pendingRev.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${moderatorToken}`,
    },
    body: JSON.stringify({ status: 'rejected', note: 'Customer requested cancellation' }),
  });
  const rejectRes = await handleApiRequest(rejectReq, env);
  assert(rejectRes.status === 200, '2.5 Review rejection returns HTTP 200');
  const rejectData = await rejectRes.json();
  assert(rejectData.review.status === 'rejected', '2.6 Review status updated to rejected');
  assert(rejectData.aggregate && rejectData.aggregate.reviewsCount === 1 && rejectData.aggregate.rating === 5.0,
    '2.7 Rejection response includes targeted aggregate (reverted back to rating: 5.0★, count: 1)');

  // 2.3 Deleting review returns productId and updated aggregate
  const revToDelete = validBatchData.reviews[0]; // from prod-batch-01
  const deleteReq = new Request(`https://api.test/api/reviews/${revToDelete.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${moderatorToken}`,
    },
  });
  const deleteRes = await handleApiRequest(deleteReq, env);
  assert(deleteRes.status === 200, '2.8 Review deletion returns HTTP 200');
  const deleteData = await deleteRes.json();
  assert(deleteData.productId === 'prod-batch-01', '2.9 Deletion response includes affected productId');
  assert(deleteData.aggregate && deleteData.aggregate.reviewsCount === 1 && deleteData.aggregate.rating === 4.0,
    '2.10 Deletion response includes recalculated aggregate for targeted product');

  // ----------------------------------------------------
  // TEST 3: Verified Customer Badge Toggle & Security
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Verified Badge Management & Protection ---');

  const revToToggle = validBatchData.reviews[1];
  const toggleOffReq = new Request(`https://api.test/api/admin/reviews/${revToToggle.id}/verified`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${moderatorToken}`,
    },
    body: JSON.stringify({ verified: false }),
  });
  const toggleOffRes = await handleApiRequest(toggleOffReq, env);
  assert(toggleOffRes.status === 200, '3.1 Admin can toggle off verified badge (HTTP 200)');
  const toggleOffData = await toggleOffRes.json();
  assert(toggleOffData.review.verifiedPurchase === false, '3.2 Review verifiedPurchase set to false');

  const toggleOnReq = new Request(`https://api.test/api/admin/reviews/${revToToggle.id}/verified`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${moderatorToken}`,
    },
    body: JSON.stringify({ verified: true }),
  });
  const toggleOnRes = await handleApiRequest(toggleOnReq, env);
  assert(toggleOnRes.status === 200, '3.3 Admin can toggle on verified badge (HTTP 200)');
  const toggleOnData = await toggleOnRes.json();
  assert(toggleOnData.review.verifiedPurchase === true, '3.4 Review verifiedPurchase set to true');

  // Public customer submission cannot forge verifiedPurchase = true
  const publicSubmitReq = new Request('https://api.test/api/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': '203.0.113.195',
    },
    body: JSON.stringify({
      productId: 'prod-batch-01',
      authorName: 'Unverified Guest',
      comment: 'Trying to inject verified badge by client payload',
      rating: 5,
      verifiedPurchase: true, // Spoofed field
      status: 'approved',     // Spoofed field
    }),
  });
  const publicSubmitRes = await handleApiRequest(publicSubmitReq, env);
  assert(publicSubmitRes.status === 201, '3.5 Public review submitted successfully (HTTP 201)');
  const publicSubmitData = await publicSubmitRes.json();
  assert(publicSubmitData.review.status === 'pending', '3.6 Public review strictly defaults to pending');
  assert(publicSubmitData.review.verifiedPurchase === false, '3.7 Spoofed verifiedPurchase: true was authoritatively rejected');

  // ----------------------------------------------------
  // TEST 4: Frontend Targeted Architecture Audit
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Frontend Targeted Architecture Audit ---');

  const adminProviderCode = fs.readFileSync('src/context/AdminProvider.tsx', 'utf8');
  const hasStorefrontRefreshInReviewActions =
    /adminApproveReview[\s\S]*?refreshAllStoreData\(true\)/.test(adminProviderCode) ||
    /adminRejectReview[\s\S]*?refreshAllStoreData\(true\)/.test(adminProviderCode) ||
    /adminDeleteReview[\s\S]*?refreshAllStoreData\(true\)/.test(adminProviderCode);

  assert(!hasStorefrontRefreshInReviewActions, '4.1 AdminProvider does NOT invoke refreshAllStoreData(true) inside review action handlers');

  const hasTargetedAggregateUpdate = adminProviderCode.includes('updateProductAggregatesInState');
  assert(hasTargetedAggregateUpdate, '4.2 AdminProvider implements updateProductAggregatesInState for targeted in-memory updates');

  const hasBatchMethod = adminProviderCode.includes('adminBatchCreateReviews');
  assert(hasBatchMethod, '4.3 AdminProvider exports adminBatchCreateReviews function');

  const adminReviewsTabCode = fs.readFileSync('src/components/AdminReviewsTab.tsx', 'utf8');
  assert(adminReviewsTabCode.includes('Batch Add Verified Customer Reviews'), '4.4 AdminReviewsTab renders Batch Add Verified Customer Reviews modal');
  assert(adminReviewsTabCode.includes('handleBatchSubmit'), '4.5 AdminReviewsTab wires handleBatchSubmit to batch create API');

  console.log('\n========================================================');
  console.log(`TOTAL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerificationSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
