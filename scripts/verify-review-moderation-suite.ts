/**
 * Automated Verification Suite for Complete Review System Replacement & Moderation
 * Part 10 - Comprehensive Automated Test Suite
 * 
 * Tests:
 * 1. Database migration and schema integrity (columns, defaults, indexes)
 * 2. Customer review submission defaults to pending
 * 3. Pending reviews do not appear in public product review API
 * 4. Pending reviews do not affect product average rating or review count
 * 5. Admin approval transitions review to approved, updates product rating and count, and makes it visible in public API
 * 6. Admin rejection transitions review to rejected and excludes it from public API and rating
 * 7. Admin restore/re-approval transitions review back to approved and recalculates rating/count
 * 8. Admin deletion removes review and recalculates rating/count
 * 9. RBAC enforcement: review.manage required for admin endpoints, 403 when missing
 * 10. Verified purchase security: customer cannot forge verifiedPurchase: true, verified purchase badge only appears when authoritatively verified
 * 11. Admin review creation supports setting status (pending vs approved) and updates aggregates correctly
 * 12. Backward compatibility: existing legacy reviews remain visible and approved
 */

import fs from 'fs';
import path from 'path';
import {
  insertReview,
  getAllReviews,
  getAdminReviews,
  updateReviewStatusInD1,
  deleteReviewFromD1,
  recalculateProductReviewAggregates,
  verifyCustomerPurchaseInD1,
  getProductById,
} from '../src/server/db';
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

// In-Memory Mock D1 Database simulating SQLite / Cloudflare D1
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
        id: 'prod-test-01',
        slug: 'test-leather-wallet',
        title: 'Premium Leather Wallet',
        price: 1500,
        original_price: 2000,
        category_id: 'cat-mens-fashion',
        description: 'Handcrafted genuine leather wallet',
        image_url: 'https://example.com/wallet.jpg',
        stock: 50,
        rating: 5.0,
        reviews_count: 1,
        featured: 1,
        featured_sort_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'prod-test-02',
        slug: 'test-wireless-earbuds',
        title: 'TWS Wireless Earbuds',
        price: 2500,
        original_price: 3200,
        category_id: 'cat-gadgets-electronics',
        description: 'Noise cancelling Bluetooth 5.3 earbuds',
        image_url: 'https://example.com/earbuds.jpg',
        stock: 30,
        rating: 0,
        reviews_count: 0,
        featured: 0,
        featured_sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    // Seed legacy review (approved)
    this.tables.reviews = [
      {
        id: 'rev-legacy-1',
        product_id: 'prod-test-01',
        author_name: 'Existing Customer',
        rating: 5,
        comment: 'Great quality wallet from original stock!',
        verified_purchase: 1,
        status: 'approved',
        moderator_id: null,
        moderated_at: null,
        moderation_note: null,
        created_by_admin: 0,
        created_at: '2026-03-01T10:00:00.000Z',
      },
    ];

    this.tables.orders = [
      {
        id: 'ord-verified-101',
        order_number: 'RT-202603-000101',
        user_id: 'user-buyer-1',
        user_email: 'buyer@example.com',
        customer_name: 'Legit Buyer',
        customer_phone: '01711223344',
        customer_address: 'Dhanmondi, Dhaka',
        shipping_status: 'Delivered',
        payment_method: 'COD',
        payment_status: 'paid',
        items_json: JSON.stringify([
          {
            product: { id: 'prod-test-01', slug: 'test-leather-wallet' },
            quantity: 1,
            price: 1500,
          },
        ]),
        created_at: '2026-03-02T12:00:00.000Z',
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
      {
        id: 'user-buyer-1',
        name: 'Verified Buyer',
        email: 'buyer@example.com',
        role: 'customer',
        permissions_json: null,
      },
      {
        id: 'user-random-99',
        name: 'Random Customer',
        email: 'random@example.com',
        role: 'customer',
        permissions_json: null,
      },
    ];

    this.tables.audit_logs = [];
    this.tables.rate_limits = [];
  }

  prepare(sql: string) {
    return new MockPreparedStatement(sql, this);
  }

  getReviews() {
    return this.tables.reviews;
  }

  getProducts() {
    return this.tables.products;
  }

  getOrders() {
    return this.tables.orders;
  }

  getAuditLogs() {
    return this.tables.audit_logs;
  }

  getUsers() {
    return this.tables.users;
  }
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
      const act = this.params[5] || this.params[4];
      this.db.getAuditLogs().push({
        id: this.params[0],
        actor_id: this.params[2],
        actor_email: this.params[3],
        actor_role: this.params[4],
        action: act,
        target_id: this.params[6],
        target_type: this.params[7],
        details: this.params[8],
        created_at: new Date().toISOString(),
      });
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

    // Admin review count queries (MUST check before generic status queries)
    if (s.includes('FROM reviews') && (s.includes('COUNT(*) as all_cnt') || s.includes('COUNT(*) as total_all') || s.includes('total_pending') || s.includes('total_all'))) {
      const allList = this.db.getReviews();
      const all_cnt = allList.length;
      const pending_cnt = allList.filter((r) => r.status === 'pending').length;
      const approved_cnt = allList.filter((r) => r.status === 'approved' || !r.status).length;
      const rejected_cnt = allList.filter((r) => r.status === 'rejected').length;
      return {
        results: [
          {
            all_cnt,
            pending_cnt,
            approved_cnt,
            rejected_cnt,
            total_all: all_cnt,
            total_pending: pending_cnt,
            total_approved: approved_cnt,
            total_rejected: rejected_cnt,
          },
        ] as T[],
      };
    }

    // SELECT rating FROM reviews WHERE product_id = ? AND status = 'approved'
    if (s.includes('FROM reviews WHERE product_id = ?') && s.includes("status = 'approved'")) {
      const prodId = this.params[0];
      const approved = this.db
        .getReviews()
        .filter((r) => r.product_id === prodId && (r.status === 'approved' || !r.status))
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

    // SELECT ... FROM reviews WHERE id = ?
    if (s.includes('FROM reviews WHERE id = ?')) {
      const revId = this.params[0];
      const r = this.db.getReviews().find((x) => x.id === revId);
      return { results: r ? [r as T] : [] };
    }

    // SELECT product_id FROM reviews WHERE id = ?
    if (s.includes('SELECT product_id FROM reviews WHERE id = ?')) {
      const revId = this.params[0];
      const r = this.db.getReviews().find((x) => x.id === revId);
      return { results: r ? [{ product_id: r.product_id } as T] : [] };
    }

    // Public reviews: SELECT ... FROM reviews WHERE status = 'approved'
    if (s.includes('FROM reviews') && s.includes("status = 'approved'") && !s.includes('product_id = ?')) {
      const approved = this.db
        .getReviews()
        .filter((r) => r.status === 'approved' || !r.status);
      return { results: approved as T[] };
    }

    // Public reviews for a product:
    if (s.includes('FROM reviews WHERE (status = \'approved\' OR status IS NULL OR status = \'\') AND product_id = ?')) {
      const prodId = this.params[0];
      const approved = this.db
        .getReviews()
        .filter((r) => r.product_id === prodId && (r.status === 'approved' || !r.status));
      return { results: approved as T[] };
    }


    // Admin total count: SELECT COUNT(*) as cnt FROM reviews
    if (s.startsWith('SELECT COUNT(*) as cnt FROM reviews')) {
      return { results: [{ cnt: this.db.getReviews().length }] as T[] };
    }

    // Admin reviews listing: SELECT ... FROM reviews ... ORDER BY created_at DESC
    if (s.includes('FROM reviews') && s.includes('ORDER BY created_at DESC')) {
      return { results: this.db.getReviews() as T[] };
    }

    // Orders query for verified purchase check
    if (s.includes('FROM orders WHERE')) {
      const cleanProdId = this.params[this.params.length - 1].replace(/%/g, '');
      const ords = this.db.getOrders().filter((o) => {
        const matchesProd = o.items_json.includes(cleanProdId) && o.shipping_status !== 'Cancelled';
        if (!matchesProd) return false;
        if (s.includes('user_id = ?') || s.includes('LOWER(user_email) = ?')) {
          const authId = this.params[0];
          const authEm = this.params[1] || '';
          return o.user_id === authId || o.user_email?.toLowerCase() === authEm.toLowerCase();
        }
        if (s.includes('order_number = ?')) {
          const ordNo = this.params[0];
          const phonePattern = this.params[1] || '';
          const cleanPhone = phonePattern.replace(/%/g, '');
          return o.order_number === ordNo && (!cleanPhone || o.customer_phone.includes(cleanPhone));
        }
        return true;
      });
      return { results: ords as T[] };
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

async function runReviewModerationSuite() {
  console.log('\n========================================================');
  console.log('RUNNING COMPLETE REVIEW SYSTEM & MODERATION SUITE');
  console.log('========================================================\n');

  const mockDb = new MockD1Database();
  const env: any = {
    DB: mockDb,
    ADMIN_SECRET: getTestSecret(),
  };

  // Auth tokens for testing
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
    permissions: { 'order.view': true }, // Missing review.manage
  });

  const superAdminToken = createSignedTestToken({
    userId: 'super-admin-1',
    email: 'superadmin@rongdhonutrade.com',
    role: 'super_admin',
    permissions: {},
  });

  // ----------------------------------------------------
  // TEST 1: Migration 0021 File & Schema Integrity
  // ----------------------------------------------------
  console.log('--- TEST 1: Database Migration & Schema Integrity ---');
  const migrationPath = path.resolve(process.cwd(), 'migrations/0021_review_moderation_system.sql');
  const migrationExists = fs.existsSync(migrationPath);
  assert(migrationExists, '1.1 Migration file 0021_review_moderation_system.sql exists');

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  assert(
    migrationSql.includes("ALTER TABLE reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';"),
    '1.2 Migration adds status column with default approved'
  );
  assert(
    migrationSql.includes('ALTER TABLE reviews ADD COLUMN moderator_id TEXT;'),
    '1.3 Migration adds moderator_id column'
  );
  assert(
    migrationSql.includes('ALTER TABLE reviews ADD COLUMN moderated_at TEXT;'),
    '1.4 Migration adds moderated_at column'
  );
  assert(
    migrationSql.includes('ALTER TABLE reviews ADD COLUMN moderation_note TEXT;'),
    '1.5 Migration adds moderation_note column'
  );
  assert(
    migrationSql.includes('CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);'),
    '1.6 Migration creates idx_reviews_status index'
  );
  assert(
    migrationSql.includes('CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_id, status);'),
    '1.7 Migration creates composite idx_reviews_product_status index'
  );
  assert(
    migrationSql.includes("UPDATE reviews SET status = 'approved'"),
    '1.8 Migration backfills legacy reviews as approved'
  );

  // ----------------------------------------------------
  // TEST 2: Customer Review Submission Defaults to Pending
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Customer Review Submission (Defaults to Pending) ---');
  const customerSubmitReq = new Request('http://localhost:3000/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: 'prod-test-01',
      authorName: 'New Shopper',
      rating: 4,
      comment: 'Nice wallet, genuine leather smell. Awaiting approval!',
      verifiedPurchase: true, // Attacker attempts to forge verified purchase!
    }),
  });

  const submitRes = await handleApiRequest(customerSubmitReq, env);
  const submitData = await submitRes.json();

  assert(submitRes.status === 201, '2.1 Customer review submission returns HTTP 201 Created');
  assert(submitData.success === true, '2.2 Customer review returns success: true');
  assert(
    submitData.message === 'Thank you! Your review has been submitted and is awaiting approval.',
    '2.3 Confirmation message explains review is awaiting approval'
  );
  assert(submitData.review.status === 'pending', '2.4 Returned review status is explicitly "pending"');
  assert(submitData.review.verifiedPurchase === false, '2.5 Forged client verifiedPurchase is stripped');

  const pendingReviewId = submitData.review.id;

  // ----------------------------------------------------
  // TEST 3: Pending Reviews Do NOT Leak in Public API
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Public Review API Leak Protection ---');
  const publicListReq = new Request(`http://localhost:3000/api/reviews?productId=prod-test-01`, {
    method: 'GET',
  });
  const publicListRes = await handleApiRequest(publicListReq, env);
  const publicListData = await publicListRes.json();

  assert(publicListRes.status === 200, '3.1 Public reviews endpoint returns HTTP 200');
  assert(
    !publicListData.reviews.some((r: any) => r.id === pendingReviewId),
    '3.2 Pending review does NOT appear in public reviews list'
  );
  assert(
    publicListData.reviews.some((r: any) => r.id === 'rev-legacy-1'),
    '3.3 Legacy approved review is present in public reviews list'
  );

  // ----------------------------------------------------
  // TEST 4: Pending Reviews Do NOT Alter Product Rating/Count
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Rating and Count Isolation for Pending Reviews ---');
  const prodCheck1 = await getProductById(env.DB, 'prod-test-01');
  assert(
    prodCheck1?.rating === 5.0 && prodCheck1?.reviewsCount === 1,
    `4.1 Product rating remains 5.0★ with 1 review (pending review did not modify rating)`
  );

  // ----------------------------------------------------
  // TEST 5: RBAC Authorization Protection on Admin Endpoints
  // ----------------------------------------------------
  console.log('\n--- TEST 5: RBAC Enforcement on Review Management Endpoints ---');
  
  // 5.1 Unauthenticated access to admin reviews
  const unauthReq = new Request('http://localhost:3000/api/admin/reviews', { method: 'GET' });
  const unauthRes = await handleApiRequest(unauthReq, env);
  assert(unauthRes.status === 401, '5.1 Unauthenticated request to /api/admin/reviews returns 401 Unauthorized');

  // 5.2 Unauthorized staff missing review.manage permission
  const staffMissingPermReq = new Request('http://localhost:3000/api/admin/reviews', {
    method: 'GET',
    headers: { Authorization: `Bearer ${unauthStaffToken}` },
  });
  const staffMissingPermRes = await handleApiRequest(staffMissingPermReq, env);
  assert(staffMissingPermRes.status === 403, '5.2 Staff without review.manage receives 403 Forbidden on review list');

  // 5.3 Unauthorized staff attempting status moderation
  const staffModStatusReq = new Request(`http://localhost:3000/api/admin/reviews/${pendingReviewId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${unauthStaffToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'approved' }),
  });
  const staffModStatusRes = await handleApiRequest(staffModStatusReq, env);
  assert(staffModStatusRes.status === 403, '5.3 Staff without review.manage receives 403 Forbidden on review approval');

  // 5.4 Unauthorized staff attempting review deletion
  const staffDeleteReq = new Request(`http://localhost:3000/api/admin/reviews/${pendingReviewId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${unauthStaffToken}` },
  });
  const staffDeleteRes = await handleApiRequest(staffDeleteReq, env);
  assert(staffDeleteRes.status === 403, '5.4 Staff without review.manage receives 403 Forbidden on review delete');

  // 5.5 Authorized moderator with review.manage can view admin reviews
  const modReq = new Request('http://localhost:3000/api/admin/reviews?status=all', {
    method: 'GET',
    headers: { Authorization: `Bearer ${moderatorToken}` },
  });
  const modRes = await handleApiRequest(modReq, env);
  const modData = await modRes.json();
  assert(modRes.status === 200 && modData.success === true, '5.5 Authorized moderator successfully fetches admin reviews');
  assert(
    modData.counts.pending >= 1,
    `5.6 Admin reviews endpoint returns pending count (${modData.counts.pending} pending)`
  );

  // ----------------------------------------------------
  // TEST 6: Admin Approval & Automatic Rating Recalculation
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Admin Approval Workflow & Rating Synchronization ---');
  const approveReq = new Request(`http://localhost:3000/api/admin/reviews/${pendingReviewId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${moderatorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'approved', note: 'Verified by moderator' }),
  });
  const approveRes = await handleApiRequest(approveReq, env);
  const approveData = await approveRes.json();

  assert(approveRes.status === 200 && approveData.success === true, '6.1 Review approval returns HTTP 200 Success');
  assert(approveData.review.status === 'approved', '6.2 Review status updated to "approved"');
  assert(approveData.review.moderatorId === 'admin-mod-1', '6.3 Moderator ID recorded accurately');

  // Verify public API now shows approved review
  const publicAfterApproveRes = await handleApiRequest(
    new Request(`http://localhost:3000/api/reviews?productId=prod-test-01`, { method: 'GET' }),
    env
  );
  const publicAfterApproveData = await publicAfterApproveRes.json();
  assert(
    publicAfterApproveData.reviews.some((r: any) => r.id === pendingReviewId),
    '6.4 Approved review is NOW visible in public review API'
  );

  // Verify product rating recalculated:
  // rev-legacy-1 (5★) + approved review (4★) = (5 + 4) / 2 = 4.5★, count = 2
  const prodCheck2 = await getProductById(env.DB, 'prod-test-01');
  assert(
    prodCheck2?.rating === 4.5 && prodCheck2?.reviewsCount === 2,
    `6.5 Product rating recalculated to 4.5★ and count updated to 2`
  );

  // ----------------------------------------------------
  // TEST 7: Admin Rejection Workflow & Public Removal
  // ----------------------------------------------------
  console.log('\n--- TEST 7: Admin Rejection Workflow & Aggregate Recalculation ---');
  const rejectReq = new Request(`http://localhost:3000/api/admin/reviews/${pendingReviewId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${moderatorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'rejected', note: 'Inappropriate content / Spam' }),
  });
  const rejectRes = await handleApiRequest(rejectReq, env);
  const rejectData = await rejectRes.json();

  assert(rejectRes.status === 200 && rejectData.success === true, '7.1 Review rejection returns HTTP 200 Success');
  assert(rejectData.review.status === 'rejected', '7.2 Review status transitioned to "rejected"');

  // Verify excluded from public API
  const publicAfterRejectRes = await handleApiRequest(
    new Request(`http://localhost:3000/api/reviews?productId=prod-test-01`, { method: 'GET' }),
    env
  );
  const publicAfterRejectData = await publicAfterRejectRes.json();
  assert(
    !publicAfterRejectData.reviews.some((r: any) => r.id === pendingReviewId),
    '7.3 Rejected review is REMOVED from public review API'
  );

  // Verify product rating restored to only legacy review (5.0★, count = 1)
  const prodCheck3 = await getProductById(env.DB, 'prod-test-01');
  assert(
    prodCheck3?.rating === 5.0 && prodCheck3?.reviewsCount === 1,
    `7.4 Product rating recalculated back to 5.0★ with 1 review`
  );

  // ----------------------------------------------------
  // TEST 8: Admin Restore / Re-Approval Workflow
  // ----------------------------------------------------
  console.log('\n--- TEST 8: Admin Restore / Re-Approval Workflow ---');
  const restoreReq = new Request(`http://localhost:3000/api/admin/reviews/${pendingReviewId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${superAdminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'approved', note: 'Restored after customer clarification' }),
  });
  const restoreRes = await handleApiRequest(restoreReq, env);
  const restoreData = await restoreRes.json();

  assert(restoreRes.status === 200 && restoreData.success === true, '8.1 Review restored to approved by Super Admin');
  const prodCheck4 = await getProductById(env.DB, 'prod-test-01');
  assert(
    prodCheck4?.rating === 4.5 && prodCheck4?.reviewsCount === 2,
    `8.2 Product rating recalculated to 4.5★ after restore`
  );

  // ----------------------------------------------------
  // TEST 9: Admin Deletion Workflow & Aggregate Sync
  // ----------------------------------------------------
  console.log('\n--- TEST 9: Review Deletion & Final Aggregate Sync ---');
  const deleteReq = new Request(`http://localhost:3000/api/admin/reviews/${pendingReviewId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${moderatorToken}` },
  });
  const deleteRes = await handleApiRequest(deleteReq, env);
  const deleteData = await deleteRes.json();

  assert(deleteRes.status === 200 && deleteData.success === true, '9.1 Review deletion returns HTTP 200');

  const prodCheck5 = await getProductById(env.DB, 'prod-test-01');
  assert(
    prodCheck5?.rating === 5.0 && prodCheck5?.reviewsCount === 1,
    `9.2 Product rating cleanly restored to 5.0★ and count to 1 after deletion`
  );

  // ----------------------------------------------------
  // TEST 10: Server-Authoritative Verified Purchase Check
  // ----------------------------------------------------
  console.log('\n--- TEST 10: Server-Authoritative Verified Purchase Security ---');
  // 10.1 Legitimate authenticated buyer of prod-test-01
  const legitBuyerToken = createSignedTestToken({
    userId: 'user-buyer-1',
    email: 'buyer@example.com',
    role: 'customer',
  });

  const legitBuyerSubmitReq = new Request('http://localhost:3000/api/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${legitBuyerToken}`,
    },
    body: JSON.stringify({
      productId: 'prod-test-01',
      authorName: 'Verified Legit Buyer',
      rating: 5,
      comment: 'Authentic leather confirmed, fast delivery!',
    }),
  });
  const legitBuyerRes = await handleApiRequest(legitBuyerSubmitReq, env);
  const legitBuyerData = await legitBuyerRes.json();

  assert(legitBuyerRes.status === 201, '10.1 Authenticated buyer review created');
  assert(
    legitBuyerData.review.verifiedPurchase === true,
    '10.2 Server authoritatively verified legitimate purchase for logged-in buyer'
  );

  // 10.2 Authenticated non-buyer attempting review
  const nonBuyerToken = createSignedTestToken({
    userId: 'user-random-99',
    email: 'random@example.com',
    role: 'customer',
  });
  const nonBuyerSubmitReq = new Request('http://localhost:3000/api/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${nonBuyerToken}`,
    },
    body: JSON.stringify({
      productId: 'prod-test-01',
      authorName: 'Random Customer',
      rating: 4,
      comment: 'Never ordered this item, just guessing!',
      verifiedPurchase: true, // Attempt forgery
    }),
  });
  const nonBuyerRes = await handleApiRequest(nonBuyerSubmitReq, env);
  const nonBuyerData = await nonBuyerRes.json();
  assert(
    nonBuyerData.review.verifiedPurchase === false,
    '10.3 Non-buyer is strictly marked verifiedPurchase = false'
  );

  // 10.3 Guest with valid multi-factor proof (orderNumber + phone)
  const guestValidReq = new Request('http://localhost:3000/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: 'prod-test-01',
      authorName: 'Guest With Order Proof',
      rating: 5,
      comment: 'Got my order yesterday, loved it!',
      orderNumber: 'RT-202603-000101',
      phone: '01711223344',
    }),
  });
  const guestValidRes = await handleApiRequest(guestValidReq, env);
  const guestValidData = await guestValidRes.json();
  assert(
    guestValidData.review.verifiedPurchase === true,
    '10.4 Guest with matching orderNumber + phone receives verifiedPurchase = true'
  );

  // 10.4 Guest with invalid phone proof
  const guestInvalidPhoneReq = new Request('http://localhost:3000/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: 'prod-test-01',
      authorName: 'Guest With Mismatched Phone',
      rating: 5,
      comment: 'Random review attempt',
      orderNumber: 'RT-202603-000101',
      phone: '01999999999',
    }),
  });
  const guestInvalidPhoneRes = await handleApiRequest(guestInvalidPhoneReq, env);
  const guestInvalidPhoneData = await guestInvalidPhoneRes.json();
  assert(
    guestInvalidPhoneData.review.verifiedPurchase === false,
    '10.5 Guest with mismatched phone receives verifiedPurchase = false'
  );

  // ----------------------------------------------------
  // TEST 11: Admin Manual Review Creation with Status Selection
  // ----------------------------------------------------
  console.log('\n--- TEST 11: Admin Manual Review Creation with Status Support ---');
  // 11.1 Create approved review for prod-test-02
  const adminCreateApprovedReq = new Request('http://localhost:3000/api/admin/reviews', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${moderatorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      review: {
        productId: 'prod-test-02',
        authorName: 'Staff Testimonial',
        rating: 5,
        comment: 'Crystal clear audio and long battery life. Tested in shop.',
        status: 'approved',
        moderationNote: 'Official in-store staff test',
      },
    }),
  });
  const adminCreateApprovedRes = await handleApiRequest(adminCreateApprovedReq, env);
  const adminCreateApprovedData = await adminCreateApprovedRes.json();

  assert(
    adminCreateApprovedRes.status === 201 && adminCreateApprovedData.success === true,
    '11.1 Admin review creation with status approved succeeds (HTTP 201)'
  );
  assert(
    adminCreateApprovedData.review.createdByAdmin === true,
    '11.2 Admin review explicitly flagged createdByAdmin = true'
  );
  assert(
    adminCreateApprovedData.review.verifiedPurchase === false,
    '11.3 Admin review is NOT falsely marked verified purchase'
  );

  // Check product aggregates for prod-test-02
  const prod2Check = await getProductById(env.DB, 'prod-test-02');
  assert(
    prod2Check?.rating === 5.0 && prod2Check?.reviewsCount === 1,
    `11.4 Product aggregates updated immediately to 5.0★ with 1 review`
  );

  // 11.2 Create pending review by admin
  const adminCreatePendingReq = new Request('http://localhost:3000/api/admin/reviews', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${moderatorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      review: {
        productId: 'prod-test-02',
        authorName: 'Pending Staff Review',
        rating: 3,
        comment: 'Testing pending queue insertion from admin modal.',
        status: 'pending',
        moderationNote: 'Draft staff review',
      },
    }),
  });
  const adminCreatePendingRes = await handleApiRequest(adminCreatePendingReq, env);
  const adminCreatePendingData = await adminCreatePendingRes.json();
  assert(
    adminCreatePendingData.review.status === 'pending',
    '11.5 Admin review can be intentionally created as pending'
  );

  const prod2CheckPending = await getProductById(env.DB, 'prod-test-02');
  assert(
    prod2CheckPending?.rating === 5.0 && prod2CheckPending?.reviewsCount === 1,
    `11.6 Pending admin review does not alter product aggregates (remains 5.0★, 1 review)`
  );

  // ----------------------------------------------------
  // TEST 12: Backward Compatibility for Legacy Reviews
  // ----------------------------------------------------
  console.log('\n--- TEST 12: Backward Compatibility for Legacy Reviews ---');
  const legacyReviews = await getAllReviews(env.DB, 'prod-test-01');
  const legacyRev = legacyReviews.find((r) => r.id === 'rev-legacy-1');

  assert(Boolean(legacyRev), '12.1 Legacy review rev-legacy-1 remains accessible and retrieved');
  assert(
    legacyRev?.status === 'approved',
    '12.2 Legacy review retains approved status without loss of data'
  );
  assert(
    legacyRev?.authorName === 'Existing Customer',
    '12.3 Legacy review author name and comment intact'
  );

  // Audit Log recording verification
  const auditLogs = mockDb.getAuditLogs();
  assert(
    auditLogs.some((l) => l.action === 'REVIEW_APPROVED'),
    '12.4 REVIEW_APPROVED action was recorded in audit logs'
  );
  assert(
    auditLogs.some((l) => l.action === 'REVIEW_REJECTED'),
    '12.5 REVIEW_REJECTED action was recorded in audit logs'
  );
  assert(
    auditLogs.some((l) => l.action === 'REVIEW_DELETE'),
    '12.6 REVIEW_DELETE action was recorded in audit logs'
  );
  assert(
    auditLogs.some((l) => l.action === 'REVIEW_CREATED_ADMIN'),
    '12.7 REVIEW_CREATED_ADMIN action was recorded in audit logs'
  );

  // ----------------------------------------------------
  // TEST 13: Admin Verified Customer Badge Management
  // ----------------------------------------------------
  console.log('\n--- TEST 13: Admin Verified Customer Badge Management ---');
  // 13.1 Admin toggle verified customer badge on unverified review
  const toggleVerifiedReq = new Request(`http://localhost:3000/api/admin/reviews/rev-legacy-1/verified`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${moderatorToken}`,
    },
    body: JSON.stringify({ verified: true }),
  });
  const toggleVerifiedRes = await handleApiRequest(toggleVerifiedReq, env);
  const toggleVerifiedData = await toggleVerifiedRes.json();
  assert(
    toggleVerifiedRes.status === 200 && toggleVerifiedData.success === true,
    '13.1 Admin successfully sets verified customer badge (HTTP 200)'
  );
  assert(
    toggleVerifiedData.review.verifiedPurchase === true,
    '13.2 Review verifiedPurchase updated to true'
  );

  // 13.3 Admin toggle verified badge to false
  const toggleUnverifiedReq = new Request(`http://localhost:3000/api/admin/reviews/rev-legacy-1/verified`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${moderatorToken}`,
    },
    body: JSON.stringify({ verified: false }),
  });
  const toggleUnverifiedRes = await handleApiRequest(toggleUnverifiedReq, env);
  const toggleUnverifiedData = await toggleUnverifiedRes.json();
  assert(
    toggleUnverifiedRes.status === 200 && toggleUnverifiedData.review.verifiedPurchase === false,
    '13.3 Admin successfully removes verified customer badge (verifiedPurchase: false)'
  );

  // 13.4 Admin creates review with verified customer badge enabled
  const adminCreateVerifiedReq = new Request('http://localhost:3000/api/admin/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${moderatorToken}`,
    },
    body: JSON.stringify({
      review: {
        productId: 'prod-test-01',
        authorName: 'VIP Verified Customer',
        rating: 5,
        comment: 'Excellent handcrafted wallet! Verified badge applied by admin.',
        status: 'approved',
        verifiedPurchase: true,
      },
    }),
  });
  const adminCreateVerifiedRes = await handleApiRequest(adminCreateVerifiedReq, env);
  const adminCreateVerifiedData = await adminCreateVerifiedRes.json();
  assert(
    adminCreateVerifiedRes.status === 201 && adminCreateVerifiedData.success === true,
    '13.4 Admin review created with verified customer badge option (HTTP 201)'
  );
  assert(
    adminCreateVerifiedData.review.verifiedPurchase === true,
    '13.5 Created review includes verifiedPurchase = true badge'
  );

  console.log('\n========================================================');
  console.log(`TOTAL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runReviewModerationSuite().catch((err) => {
  console.error('Test Suite Failed Exception:', err);
  process.exit(1);
});
