import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  PERMISSION_KEYS,
  PERMISSIONS_METADATA,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  resolveUserPermissions,
  hasUserPermission,
} from '../src/utils/permissions';
import { handleApiRequest } from '../src/server/router';
import { createAuthToken, computePasswordSignature } from '../src/server/auth';
import type { UserAccount } from '../src/types';

console.log('================================================================');
console.log('PART 6: GRANULAR REVIEW RBAC PERMISSIONS VERIFICATION AUDIT');
console.log('================================================================');

// -------------------------------------------------------------
// TEST 1: Permission Keys, Metadata & UI Architecture
// -------------------------------------------------------------
console.log('\n[TEST 1] Verifying permission keys, metadata and UI management integration...');
const requiredReviewKeys = [
  'reviews.view',
  'reviews.create',
  'reviews.edit',
  'reviews.approve',
  'reviews.delete',
] as const;

for (const key of requiredReviewKeys) {
  assert(PERMISSION_KEYS.includes(key as any), `PERMISSION_KEYS must include "${key}"`);
  assert(PERMISSIONS_METADATA[key as keyof typeof PERMISSIONS_METADATA], `PERMISSIONS_METADATA must define "${key}"`);
  assert.strictEqual(
    PERMISSIONS_METADATA[key as keyof typeof PERMISSIONS_METADATA].group,
    'Review',
    `"${key}" must belong to "Review" group`
  );
}

// Inspect Super Admin UI (PermissionManagementModal.tsx)
const permModalSource = fs.readFileSync(path.resolve('src/components/Admin/PermissionManagementModal.tsx'), 'utf-8');
assert(permModalSource.includes("'reviews.view'"), 'PermissionManagementModal must contain reviews.view');
assert(permModalSource.includes("'reviews.create'"), 'PermissionManagementModal must contain reviews.create');
assert(permModalSource.includes("'reviews.edit'"), 'PermissionManagementModal must contain reviews.edit');
assert(permModalSource.includes("'reviews.approve'"), 'PermissionManagementModal must contain reviews.approve');
assert(permModalSource.includes("'reviews.delete'"), 'PermissionManagementModal must contain reviews.delete');
assert(permModalSource.includes("id: 'review'"), 'Review Management group must be present in PermissionManagementModal');

// Inspect Product Manage -> Reviews actions in AdminPanel and AdminReviewsTab
const adminPanelSource = fs.readFileSync(path.resolve('src/components/AdminPanel.tsx'), 'utf-8');
const adminReviewsTabSource = fs.readFileSync(path.resolve('src/components/AdminReviewsTab.tsx'), 'utf-8');

assert(
  adminPanelSource.includes("hasPermission('reviews.view') || hasPermission('review.view')"),
  'Product Manage -> Reviews button in AdminPanel must be gated by reviews.view'
);
assert(
  adminReviewsTabSource.includes('reviews.create'),
  'AdminReviewsTab must evaluate reviews.create'
);
assert(
  adminReviewsTabSource.includes('reviews.edit'),
  'AdminReviewsTab must evaluate reviews.edit'
);
assert(
  adminReviewsTabSource.includes('reviews.approve'),
  'AdminReviewsTab must evaluate reviews.approve'
);
assert(
  adminReviewsTabSource.includes('reviews.delete'),
  'AdminReviewsTab must evaluate reviews.delete'
);
console.log('✅ TEST 1 PASSED: All 5 granular permissions integrated into RBAC definitions, Super Admin UI and frontend components.');

// -------------------------------------------------------------
// TEST 2: Client & Server Permission Matrix Evaluation
// -------------------------------------------------------------
console.log('\n[TEST 2] Verifying granular permission matrix evaluation across roles...');

// 2.1 Super Admin: unconditional access to all permissions
const superAdmin: UserAccount = {
  id: 'usr-super',
  name: 'Super Admin',
  email: 'super@rongdhonutrade.com',
  role: 'super_admin',
  createdAt: '2026-01-01T00:00:00.000Z',
};
for (const key of requiredReviewKeys) {
  assert.strictEqual(hasUserPermission(superAdmin, key), true, `Super Admin must have ${key}`);
}

// 2.2 Customer: zero permissions
const customer: UserAccount = {
  id: 'usr-cust',
  name: 'Customer',
  email: 'cust@example.com',
  role: 'customer',
  createdAt: '2026-01-01T00:00:00.000Z',
  permissions: {
    'reviews.view': true,
    'reviews.create': true,
  } as any,
};
for (const key of requiredReviewKeys) {
  assert.strictEqual(hasUserPermission(customer, key), false, `Customer must NOT have ${key}`);
}

// 2.3 User with ONLY reviews.view
const viewOnlyAdmin: UserAccount = {
  id: 'usr-view',
  name: 'View Only Admin',
  email: 'view@rongdhonutrade.com',
  role: 'sub_admin',
  createdAt: '2026-01-01T00:00:00.000Z',
  permissions: {
    'reviews.view': true,
    'reviews.create': false,
    'reviews.edit': false,
    'reviews.approve': false,
    'reviews.delete': false,
  } as any,
};
assert.strictEqual(hasUserPermission(viewOnlyAdmin, 'reviews.view'), true, 'viewOnlyAdmin has reviews.view');
assert.strictEqual(hasUserPermission(viewOnlyAdmin, 'reviews.create'), false, 'viewOnlyAdmin lacks reviews.create');
assert.strictEqual(hasUserPermission(viewOnlyAdmin, 'reviews.edit'), false, 'viewOnlyAdmin lacks reviews.edit');
assert.strictEqual(hasUserPermission(viewOnlyAdmin, 'reviews.approve'), false, 'viewOnlyAdmin lacks reviews.approve');
assert.strictEqual(hasUserPermission(viewOnlyAdmin, 'reviews.delete'), false, 'viewOnlyAdmin lacks reviews.delete');

// 2.4 User with reviews.create but WITHOUT reviews.approve
const creatorOnlyAdmin: UserAccount = {
  id: 'usr-creator',
  name: 'Creator Admin',
  email: 'creator@rongdhonutrade.com',
  role: 'sub_admin',
  createdAt: '2026-01-01T00:00:00.000Z',
  permissions: {
    'reviews.create': true,
    'reviews.view': false,
    'reviews.approve': false,
    'reviews.edit': false,
    'reviews.delete': false,
  } as any,
};
assert.strictEqual(hasUserPermission(creatorOnlyAdmin, 'reviews.create'), true, 'creator has reviews.create');
assert.strictEqual(hasUserPermission(creatorOnlyAdmin, 'reviews.approve'), false, 'creator without reviews.approve lacks reviews.approve');
assert.strictEqual(hasUserPermission(creatorOnlyAdmin, 'reviews.view'), false, 'creator without reviews.view lacks reviews.view');

// 2.5 User with reviews.edit but WITHOUT reviews.approve
const editorOnlyAdmin: UserAccount = {
  id: 'usr-editor',
  name: 'Editor Admin',
  email: 'editor@rongdhonutrade.com',
  role: 'sub_admin',
  createdAt: '2026-01-01T00:00:00.000Z',
  permissions: {
    'reviews.view': true,
    'reviews.edit': true,
    'reviews.approve': false,
    'reviews.delete': false,
  } as any,
};
assert.strictEqual(hasUserPermission(editorOnlyAdmin, 'reviews.edit'), true, 'editor has reviews.edit');
assert.strictEqual(hasUserPermission(editorOnlyAdmin, 'reviews.approve'), false, 'editor without reviews.approve lacks reviews.approve');

// 2.6 User with reviews.approve but WITHOUT reviews.edit or reviews.delete
const approverOnlyAdmin: UserAccount = {
  id: 'usr-approver',
  name: 'Approver Admin',
  email: 'approver@rongdhonutrade.com',
  role: 'sub_admin',
  createdAt: '2026-01-01T00:00:00.000Z',
  permissions: {
    'reviews.view': true,
    'reviews.approve': true,
    'reviews.edit': false,
    'reviews.delete': false,
  } as any,
};
assert.strictEqual(hasUserPermission(approverOnlyAdmin, 'reviews.approve'), true, 'approver has reviews.approve');
assert.strictEqual(hasUserPermission(approverOnlyAdmin, 'reviews.edit'), false, 'approver lacks reviews.edit');
assert.strictEqual(hasUserPermission(approverOnlyAdmin, 'reviews.delete'), false, 'approver lacks reviews.delete');

console.log('✅ TEST 2 PASSED: Fine-grained permission resolution correctly isolates each capability.');

// -------------------------------------------------------------
// TEST 3: Server Enforcement of Direct API Calls
// -------------------------------------------------------------
console.log('\n[TEST 3] Verifying server API enforcement for allowed & denied requests...');

// Mock D1 Environment with in-memory SQLite behavior
class MockD1PreparedStatement {
  private sql: string;
  private params: any[];
  private db: MockD1Database;

  constructor(sql: string, params: any[], db: MockD1Database) {
    this.sql = sql;
    this.params = params;
    this.db = db;
  }

  bind(...params: any[]) {
    return new MockD1PreparedStatement(this.sql, params, this.db);
  }

  async first<T = any>(): Promise<T | null> {
    const res = await this.all<T>();
    return res.results[0] || null;
  }

  async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
    const s = this.sql.trim();

    if (s.toLowerCase().includes('from users')) {
      if (s.toLowerCase().includes('where')) {
        const p0 = String(this.params[0] || '').toLowerCase().trim();
        const p1 = this.params[1] !== undefined ? String(this.params[1] || '').trim() : null;
        const u = this.db.users.find(
          (x) => x.email.toLowerCase() === p0 || x.id === p0 || (p1 && (x.email.toLowerCase() === p1.toLowerCase() || x.id === p1))
        );
        return { results: (u ? [u] : []) as T[], success: true };
      }
      return { results: [...this.db.users] as T[], success: true };
    }

    if (s.toLowerCase().includes('from reviews')) {
      if (s.toLowerCase().includes('where')) {
        if (s.includes('product_id = ? AND comment = ?') || (s.includes('product_id = ?') && s.includes('comment = ?'))) {
          const match = this.db.reviews.find((r) => (r.product_id === this.params[0] || r.productId === this.params[0]) && r.comment === this.params[1]);
          return { results: (match ? [match] : []) as T[], success: true };
        }
        if (s.includes('id = ?')) {
          const match = this.db.reviews.find((r) => r.id === this.params[0]);
          return { results: (match ? [match] : []) as T[], success: true };
        }
        if (s.includes('status = ?')) {
          return { results: this.db.reviews.filter((r) => r.status === this.params[0]) as T[], success: true };
        }
      }
      return { results: [...this.db.reviews] as T[], success: true };
    }

    if (s.includes('SELECT') && s.includes('FROM products') && s.includes('WHERE id = ?')) {
      const p = this.db.products.find((x) => x.id === this.params[0] || x.slug === this.params[0]);
      return { results: (p ? [p] : []) as T[], success: true };
    }

    return { results: [], success: true };
  }

  async run(): Promise<{ success: boolean; meta: any }> {
    const s = this.sql.trim();

    if (s.includes('INSERT INTO reviews')) {
      const newReview = {
        id: this.params[0],
        productId: this.params[1],
        product_id: this.params[1],
        authorName: this.params[2],
        author_name: this.params[2],
        comment: this.params[3],
        rating: this.params[4],
        verifiedPurchase: Boolean(this.params[5]),
        verified_purchase: this.params[5] ? 1 : 0,
        status: this.params[6],
        source: this.params[7],
        approvedAt: this.params[8],
        approved_at: this.params[8],
        approvedBy: this.params[9],
        approved_by: this.params[9],
        images_json: this.params[10] || '[]',
        images: JSON.parse(this.params[10] || '[]'),
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      this.db.reviews.unshift(newReview);
      return { success: true, meta: { changes: 1 } };
    }

    if (s.includes('UPDATE reviews SET') && s.includes('WHERE id = ?')) {
      const revId = this.params[this.params.length - 1];
      const r = this.db.reviews.find((x) => x.id === revId);
      if (r) {
        if (s.includes('status = ?')) {
          r.status = this.params[0];
          r.approved_by = this.params[1];
          r.approved_at = this.params[2];
        } else if (s.includes('comment = ?')) {
          r.comment = this.params[0];
          r.rating = this.params[1];
          r.author_name = this.params[2];
          r.authorName = this.params[2];
        }
      }
      return { success: true, meta: { changes: 1 } };
    }

    if (s.includes('DELETE FROM reviews WHERE id = ?')) {
      const revId = this.params[0];
      this.db.reviews = this.db.reviews.filter((x) => x.id !== revId);
      return { success: true, meta: { changes: 1 } };
    }

    if (s.includes('UPDATE users SET') && s.includes('WHERE id = ?')) {
      const usrId = this.params[this.params.length - 1];
      const u = this.db.users.find((x) => x.id === usrId);
      if (u) {
        if (s.includes('permissions_json = ?')) {
          u.permissions_json = this.params[0];
        }
        if (s.includes('role = ?')) {
          u.role = this.params[1];
        }
      }
      return { success: true, meta: { changes: 1 } };
    }

    return { success: true, meta: { changes: 1 } };
  }
}

class MockD1Database {
  users: any[] = [];
  reviews: any[] = [];
  products: any[] = [];

  prepare(sql: string) {
    return new MockD1PreparedStatement(sql, [], this);
  }

  async batch(statements: MockD1PreparedStatement[]) {
    const results = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }
}

async function runServerEnforcementTests() {
  const db = new MockD1Database();
  const jwtSecret = 'test-jwt-secret-part6-rbac-key-rongdhonu';

  // Seed Users
  db.users = [
    {
      id: 'usr-super',
      email: 'super@rongdhonutrade.com',
      name: 'Super Admin',
      role: 'super_admin',
      password: '$2a$12$dummyhashforpasswordtesting0123456789abcdef',
      permissions_json: '{}',
      is_active: 1,
    },
    {
      id: 'usr-no-view',
      email: 'noview@rongdhonutrade.com',
      name: 'No View Admin',
      role: 'sub_admin',
      password: '$2a$12$dummyhashforpasswordtesting0123456789abcdef',
      permissions_json: JSON.stringify({
        'reviews.view': false,
        'reviews.create': true,
      }),
      is_active: 1,
    },
    {
      id: 'usr-viewer',
      email: 'viewer@rongdhonutrade.com',
      name: 'Viewer Admin',
      role: 'sub_admin',
      password: '$2a$12$dummyhashforpasswordtesting0123456789abcdef',
      permissions_json: JSON.stringify({
        'reviews.view': true,
        'reviews.create': false,
        'reviews.edit': false,
        'reviews.approve': false,
        'reviews.delete': false,
      }),
      is_active: 1,
    },
    {
      id: 'usr-creator',
      email: 'creator@rongdhonutrade.com',
      name: 'Creator Admin',
      role: 'sub_admin',
      password: '$2a$12$dummyhashforpasswordtesting0123456789abcdef',
      permissions_json: JSON.stringify({
        'reviews.view': true,
        'reviews.create': true,
        'reviews.approve': false,
      }),
      is_active: 1,
    },
    {
      id: 'usr-editor',
      email: 'editor@rongdhonutrade.com',
      name: 'Editor Admin',
      role: 'sub_admin',
      password: '$2a$12$dummyhashforpasswordtesting0123456789abcdef',
      permissions_json: JSON.stringify({
        'reviews.view': true,
        'reviews.edit': true,
        'reviews.approve': false,
      }),
      is_active: 1,
    },
    {
      id: 'usr-approver',
      email: 'approver@rongdhonutrade.com',
      name: 'Approver Admin',
      role: 'sub_admin',
      password: '$2a$12$dummyhashforpasswordtesting0123456789abcdef',
      permissions_json: JSON.stringify({
        'reviews.view': true,
        'reviews.approve': true,
        'reviews.edit': false,
        'reviews.delete': false,
      }),
      is_active: 1,
    },
    {
      id: 'usr-deleter',
      email: 'deleter@rongdhonutrade.com',
      name: 'Deleter Admin',
      role: 'sub_admin',
      password: '$2a$12$dummyhashforpasswordtesting0123456789abcdef',
      permissions_json: JSON.stringify({
        'reviews.view': true,
        'reviews.delete': true,
        'reviews.approve': false,
      }),
      is_active: 1,
    },
  ];

  // Seed Products
  db.products = [
    {
      id: 'prod-watch',
      title: 'Luxury Chronograph Watch',
      slug: 'luxury-chronograph-watch',
      price: 3200,
      stock: 25,
      rating: 5.0,
      reviews_count: 1,
    },
  ];

  // Seed Reviews
  db.reviews = [
    {
      id: 'rev-001',
      product_id: 'prod-watch',
      productId: 'prod-watch',
      author_name: 'Existing Customer',
      authorName: 'Existing Customer',
      rating: 5,
      comment: 'Top quality craftsmanship!',
      status: 'approved',
      source: 'customer',
      created_at: new Date().toISOString(),
      images_json: '[]',
    },
    {
      id: 'rev-pending-002',
      product_id: 'prod-watch',
      productId: 'prod-watch',
      author_name: 'Pending Customer',
      authorName: 'Pending Customer',
      rating: 4,
      comment: 'Waiting for moderation check',
      status: 'pending',
      source: 'customer',
      created_at: new Date().toISOString(),
      images_json: '[]',
    },
  ];

  const env = {
    DB: db as any,
    ADMIN_SECRET: jwtSecret,
    JWT_SECRET: jwtSecret,
    NODE_ENV: 'test',
  };

  const testPwdSig = await computePasswordSignature('$2a$12$dummyhashforpasswordtesting0123456789abcdef');

  // Generate tokens
  const superToken = await createAuthToken({ userId: 'usr-super', email: 'super@rongdhonutrade.com', role: 'super_admin', pwdSig: testPwdSig }, jwtSecret);
  const noViewToken = await createAuthToken({ userId: 'usr-no-view', email: 'noview@rongdhonutrade.com', role: 'sub_admin', pwdSig: testPwdSig }, jwtSecret);
  const viewerToken = await createAuthToken({ userId: 'usr-viewer', email: 'viewer@rongdhonutrade.com', role: 'sub_admin', pwdSig: testPwdSig }, jwtSecret);
  const creatorToken = await createAuthToken({ userId: 'usr-creator', email: 'creator@rongdhonutrade.com', role: 'sub_admin', pwdSig: testPwdSig }, jwtSecret);
  const editorToken = await createAuthToken({ userId: 'usr-editor', email: 'editor@rongdhonutrade.com', role: 'sub_admin', pwdSig: testPwdSig }, jwtSecret);
  const approverToken = await createAuthToken({ userId: 'usr-approver', email: 'approver@rongdhonutrade.com', role: 'sub_admin', pwdSig: testPwdSig }, jwtSecret);
  const deleterToken = await createAuthToken({ userId: 'usr-deleter', email: 'deleter@rongdhonutrade.com', role: 'sub_admin', pwdSig: testPwdSig }, jwtSecret);

  // -------------------------------------------------------------------------
  // TEST 3.1: reviews.view Enforcement
  // Requirement 7: A user without reviews.view must not retrieve review data through direct API calls.
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3.1] Testing reviews.view direct API boundaries...');

  // User without reviews.view calling GET /api/reviews
  const noViewReq = new Request('http://localhost:3000/api/reviews', {
    method: 'GET',
    headers: { Authorization: `Bearer ${noViewToken}` },
  });
  const noViewRes = await handleApiRequest(noViewReq, env);
  assert.strictEqual(noViewRes.status, 403, 'User without reviews.view MUST receive HTTP 403 on GET /api/reviews');

  // User without reviews.view calling GET /api/reviews?status=pending
  const noViewQueueReq = new Request('http://localhost:3000/api/reviews?status=pending', {
    method: 'GET',
    headers: { Authorization: `Bearer ${noViewToken}` },
  });
  const noViewQueueRes = await handleApiRequest(noViewQueueReq, env);
  assert.strictEqual(noViewQueueRes.status, 403, 'User without reviews.view MUST receive HTTP 403 on GET /api/reviews?status=pending');

  // User without reviews.view calling GET /api/reviews/:id
  const noViewIdReq = new Request('http://localhost:3000/api/reviews/rev-001', {
    method: 'GET',
    headers: { Authorization: `Bearer ${noViewToken}` },
  });
  const noViewIdRes = await handleApiRequest(noViewIdReq, env);
  assert.strictEqual(noViewIdRes.status, 403, 'User without reviews.view MUST receive HTTP 403 on GET /api/reviews/:id');

  // User WITH reviews.view calling GET /api/reviews
  const viewerReq = new Request('http://localhost:3000/api/reviews', {
    method: 'GET',
    headers: { Authorization: `Bearer ${viewerToken}` },
  });
  const viewerRes = await handleApiRequest(viewerReq, env);
  assert.strictEqual(viewerRes.status, 200, 'User with reviews.view receives HTTP 200 on GET /api/reviews');
  console.log('✅ TEST 3.1 PASSED: reviews.view strictly enforced for direct API queries.');

  // -------------------------------------------------------------------------
  // TEST 3.2: reviews.create & reviews.approve Isolation
  // Requirement 6: A user with reviews.create but without reviews.approve must not be able to approve reviews.
  // Requirement 10: Keep admin-created review approval behavior consistent with actual permission model.
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3.2] Testing reviews.create without reviews.approve isolation...');

  // User with reviews.create but WITHOUT reviews.approve submits a review with status="approved"
  const createPendingReq = new Request('http://localhost:3000/api/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creatorToken}`,
    },
    body: JSON.stringify({
      productId: 'prod-watch',
      authorName: 'Official Staff Reviewer',
      rating: 5,
      comment: 'Staff member testing product quality.',
      status: 'approved', // attempts to approve directly
      source: 'admin',
    }),
  });
  const createPendingRes = await handleApiRequest(createPendingReq, env);
  assert.strictEqual(createPendingRes.status, 201, 'Creator can submit review (HTTP 201)');
  const createPendingData = await createPendingRes.json() as any;
  assert.strictEqual(
    createPendingData.review.status,
    'pending',
    'Review MUST be forced to "pending" because admin lacks "reviews.approve" permission!'
  );
  assert(
    !createPendingData.review.approvedBy,
    'approvedBy MUST remain null/falsy when admin lacks reviews.approve'
  );

  // Super Admin submits review with status="approved" (has reviews.approve)
  const superCreateReq = new Request('http://localhost:3000/api/reviews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superToken}`,
    },
    body: JSON.stringify({
      productId: 'prod-watch',
      authorName: 'Super Administrator',
      rating: 5,
      comment: 'Verified editorial masterpiece review.',
      status: 'approved',
      source: 'admin',
    }),
  });
  const superCreateRes = await handleApiRequest(superCreateReq, env);
  assert.strictEqual(superCreateRes.status, 201, 'Super Admin submits review (HTTP 201)');
  const superCreateData = await superCreateRes.json() as any;
  assert.strictEqual(
    superCreateData.review.status,
    'approved',
    'Review by authorized approver is successfully published with status="approved"'
  );
  assert(superCreateData.review.approvedBy, 'approvedBy is set for authorized approver');
  console.log('✅ TEST 3.2 PASSED: Admin with reviews.create but without reviews.approve cannot approve reviews.');

  // -------------------------------------------------------------------------
  // TEST 3.3: reviews.edit vs reviews.approve Enforcement on PATCH /api/reviews/:id
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3.3] Testing reviews.edit and reviews.approve on PATCH /api/reviews/:id...');

  // User without reviews.edit attempting to edit comment (approver only has reviews.approve)
  const unauthorizedEditReq = new Request('http://localhost:3000/api/reviews/rev-001', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${approverToken}`,
    },
    body: JSON.stringify({ comment: 'Hacked comment edit attempt' }),
  });
  const unauthorizedEditRes = await handleApiRequest(unauthorizedEditReq, env);
  assert.strictEqual(
    unauthorizedEditRes.status,
    403,
    'Admin without reviews.edit MUST be blocked from editing review comment (HTTP 403)'
  );

  // User with reviews.edit editing comment
  const authorizedEditReq = new Request('http://localhost:3000/api/reviews/rev-001', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${editorToken}`,
    },
    body: JSON.stringify({ comment: 'Professionally updated review comment text' }),
  });
  const authorizedEditRes = await handleApiRequest(authorizedEditReq, env);
  assert.strictEqual(authorizedEditRes.status, 200, 'Admin with reviews.edit succeeds with HTTP 200');

  // User without reviews.approve attempting to change status (editor only has reviews.edit)
  const unauthorizedStatusReq = new Request('http://localhost:3000/api/reviews/rev-pending-002', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${editorToken}`,
    },
    body: JSON.stringify({ status: 'approved' }),
  });
  const unauthorizedStatusRes = await handleApiRequest(unauthorizedStatusReq, env);
  assert.strictEqual(
    unauthorizedStatusRes.status,
    403,
    'Admin without reviews.approve MUST be blocked from changing status (HTTP 403)'
  );

  // User with reviews.approve changing status
  const authorizedStatusReq = new Request('http://localhost:3000/api/reviews/rev-pending-002', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${approverToken}`,
    },
    body: JSON.stringify({ status: 'approved' }),
  });
  const authorizedStatusRes = await handleApiRequest(authorizedStatusReq, env);
  assert.strictEqual(authorizedStatusRes.status, 200, 'Admin with reviews.approve succeeds with HTTP 200');
  console.log('✅ TEST 3.3 PASSED: reviews.edit and reviews.approve strictly partitioned on PATCH.');

  // -------------------------------------------------------------------------
  // TEST 3.4: reviews.delete Enforcement on DELETE /api/reviews/:id
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3.4] Testing reviews.delete boundary on DELETE /api/reviews/:id...');

  // User without reviews.delete attempting to delete (editor has reviews.edit, no delete)
  const unauthorizedDeleteReq = new Request('http://localhost:3000/api/reviews/rev-001', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${editorToken}` },
  });
  const unauthorizedDeleteRes = await handleApiRequest(unauthorizedDeleteReq, env);
  assert.strictEqual(
    unauthorizedDeleteRes.status,
    403,
    'Admin without reviews.delete MUST be blocked with HTTP 403'
  );

  // User with reviews.delete deleting review
  const authorizedDeleteReq = new Request('http://localhost:3000/api/reviews/rev-001', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${deleterToken}` },
  });
  const authorizedDeleteRes = await handleApiRequest(authorizedDeleteReq, env);
  assert.strictEqual(
    authorizedDeleteRes.status,
    200,
    'Admin with reviews.delete succeeds with HTTP 200'
  );
  console.log('✅ TEST 3.4 PASSED: reviews.delete strictly enforced.');

  // -------------------------------------------------------------------------
  // TEST 3.5: Privilege Escalation & Unauthorized Admin Management
  // Requirement 8: Prevent unauthorized users from granting themselves privileges or changing other admins' permissions.
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3.5] Testing privilege escalation prevention and administrative protection...');

  // Sub-admin attempting to grant themselves reviews.approve or reviews.delete
  const selfEscalateReq = new Request('http://localhost:3000/api/users/usr-creator', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creatorToken}`,
    },
    body: JSON.stringify({
      permissions: {
        'reviews.approve': true,
        'reviews.delete': true,
      },
    }),
  });
  const selfEscalateRes = await handleApiRequest(selfEscalateReq, env);
  assert.strictEqual(
    selfEscalateRes.status,
    403,
    'Non-super-admin self-escalation attempt MUST be rejected with HTTP 403'
  );

  // Sub-admin attempting to modify another admin
  const modifyOtherReq = new Request('http://localhost:3000/api/users/usr-viewer', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creatorToken}`,
    },
    body: JSON.stringify({
      permissions: {
        'reviews.approve': true,
      },
    }),
  });
  const modifyOtherRes = await handleApiRequest(modifyOtherReq, env);
  assert.strictEqual(
    modifyOtherRes.status,
    403,
    'Non-super-admin modifying other admin accounts MUST be rejected with HTTP 403'
  );

  // Super Admin updating permissions for an admin account
  const superUpdateReq = new Request('http://localhost:3000/api/users/usr-viewer/permissions', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${superToken}`,
    },
    body: JSON.stringify({
      permissions: {
        'reviews.view': true,
        'reviews.create': true,
        'reviews.edit': true,
        'reviews.approve': true,
        'reviews.delete': false,
      },
    }),
  });
  const superUpdateRes = await handleApiRequest(superUpdateReq, env);
  assert.strictEqual(
    superUpdateRes.status,
    200,
    'Super Admin can grant/revoke granular review permissions'
  );
  console.log('✅ TEST 3.5 PASSED: Unauthorized privilege modifications blocked; Super Admin control preserved.');
}

runServerEnforcementTests().then(() => {
  console.log('\n================================================================');
  console.log('🎉 ALL PART 6 GRANULAR REVIEW RBAC TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}).catch((err) => {
  console.error('\n❌ Part 6 Verification Failed:', err);
  process.exit(1);
});
