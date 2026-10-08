/**
 * Verification Suite for Review Granular RBAC Permissions
 *
 * Verifies:
 * 1. Central registry and metadata for reviews.view, reviews.approve, reviews.delete, reviews.create, reviews.edit
 * 2. Super Admin grant and revoke capabilities
 * 3. Server-authoritative 403 Forbidden enforcement on all administrative review actions
 * 4. Distinct operational personas (Admin A vs Admin B vs Customer)
 * 5. Immediate server-side enforcement upon permission revocation
 */

import {
  PERMISSION_KEYS,
  PERMISSIONS_METADATA,
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_SUB_ADMIN_PERMISSIONS,
  resolveUserPermissions,
  normalizePermissionsInput,
  type PermissionKey,
} from '../src/server/permissions';
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
  private storage: MockReviewRbacD1Database;

  constructor(sql: string, storage: MockReviewRbacD1Database, bindings: any[] = []) {
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

class MockReviewRbacD1Database {
  products: any[] = [];
  users: any[] = [];
  reviews: any[] = [];
  auditLogs: any[] = [];
  rateLimits: any[] = [];

  constructor() {
    this.products = [
      { id: 'prod-watch-01', slug: 'luxury-watch', title: 'Luxury Chronograph Watch', price: 3500 },
    ];
    this.users = [
      {
        id: 'super-admin-01',
        email: 'superadmin@example.com',
        name: 'Master Super Admin',
        role: 'super_admin',
        password: null,
        permissions_json: '{}',
        is_active: 1,
      },
      {
        id: 'admin-a-01',
        email: 'admin-a@example.com',
        name: 'Admin A (Full Review Manager)',
        role: 'admin',
        password: null,
        permissions_json: JSON.stringify({
          'reviews.view': true,
          'reviews.approve': true,
          'reviews.delete': true,
          'reviews.create': true,
          'reviews.edit': true,
        }),
        is_active: 1,
      },
      {
        id: 'admin-b-01',
        email: 'admin-b@example.com',
        name: 'Admin B (Review Creator Only)',
        role: 'admin',
        password: null,
        permissions_json: JSON.stringify({
          'reviews.view': true,
          'reviews.create': true,
          'reviews.approve': false,
          'reviews.delete': false,
        }),
        is_active: 1,
      },
      {
        id: 'customer-c-01',
        email: 'customer@example.com',
        name: 'Regular Customer',
        role: 'customer',
        password: null,
        permissions_json: '{}',
        is_active: 1,
      },
    ];
    this.reviews = [
      {
        id: 'rev-test-01',
        product_id: 'prod-watch-01',
        author_name: 'John Doe',
        rating: 5,
        comment: 'Great watch, highly recommended!',
        verified_purchase: 1,
        status: 'pending',
        created_at: new Date().toISOString(),
      },
    ];
  }

  prepare(sql: string) {
    return new MockD1PreparedStatement(sql, this);
  }

  executeSql(sql: string, bindings: any[]): { success: boolean; meta: any } {
    if (sql.includes('UPDATE users SET permissions_json = ?')) {
      const [permsJson, userId] = bindings;
      const user = this.users.find((u) => u.id === userId);
      if (user) {
        user.permissions_json = permsJson;
      }
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes('INSERT INTO reviews')) {
      const [id, prodId, authorName, rating, comment, verified, createdAt] = bindings;
      this.reviews.push({
        id,
        product_id: prodId,
        author_name: authorName,
        rating,
        comment,
        verified_purchase: verified,
        status: 'approved',
        created_at: createdAt,
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes('UPDATE reviews SET status = ? WHERE id = ?')) {
      const [status, id] = bindings;
      const r = this.reviews.find((rev) => rev.id === id);
      if (r) r.status = status;
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes('DELETE FROM reviews WHERE id = ?')) {
      const [id] = bindings;
      this.reviews = this.reviews.filter((rev) => rev.id !== id);
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes('INSERT INTO audit_logs')) {
      this.auditLogs.push({ id: `audit-${Date.now()}`, bindings });
      return { success: true, meta: { changes: 1 } };
    }
    return { success: true, meta: {} };
  }

  querySql(sql: string, bindings: any[]): any[] {
    const s = sql.toLowerCase();
    if (s.includes('from users')) {
      const term1 = String(bindings[0] || '').toLowerCase();
      const term2 = String(bindings[1] || '').toLowerCase();
      const user = this.users.find(
        (u) =>
          u.email.toLowerCase() === term1 ||
          u.id.toLowerCase() === term1 ||
          (term2 && (u.email.toLowerCase() === term2 || u.id.toLowerCase() === term2))
      );
      return user ? [user] : [];
    }
    if (s.includes('from reviews where id = ?')) {
      const rev = this.reviews.find((r) => r.id === bindings[0]);
      return rev ? [rev] : [];
    }
    if (s.includes('from reviews')) {
      return this.reviews;
    }
    return [];
  }
}

async function runReviewRbacVerification() {
  console.log('========================================================');
  console.log('VERIFYING GRANULAR REVIEW RBAC PERMISSIONS');
  console.log('========================================================\n');

  const secret = getTestSecret();
  const mockDb = new MockReviewRbacD1Database();
  const env: any = {
    DB: mockDb,
    ADMIN_SECRET: secret,
    SUPER_ADMIN_EMAILS: 'superadmin@example.com',
    SUPER_ADMIN_USER_IDS: 'super-admin-01',
  };

  // Helper to build authenticated requests
  const makeReq = (path: string, method: string, user: any, body?: any) => {
    const token = createSignedTestToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    return new Request(`http://localhost:3000${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  // ----------------------------------------------------
  // SECTION 1: PERMISSION REGISTRY & METADATA CHECKS
  // ----------------------------------------------------
  console.log('--- SECTION 1: Central Registry & Metadata ---');
  const expectedReviewKeys: PermissionKey[] = [
    'reviews.view',
    'reviews.approve',
    'reviews.delete',
    'reviews.create',
    'reviews.edit',
  ];

  for (const key of expectedReviewKeys) {
    assert(PERMISSION_KEYS.includes(key), `1.1 Registry: contains ${key}`);
    const meta = PERMISSIONS_METADATA[key];
    assert(Boolean(meta), `1.2 Metadata: dictionary has definition for ${key}`);
    assert(meta?.group === 'Reviews', `1.3 Metadata: ${key} assigned to group "Reviews"`);
    assert(meta?.superAdminOnly === false, `1.4 Metadata: ${key} can be delegated to standard admins`);
  }

  // ----------------------------------------------------
  // SECTION 2: SUPER ADMIN ROLE & PRIVILEGES
  // ----------------------------------------------------
  console.log('\n--- SECTION 2: Super Admin Authority ---');
  const superAdminUser = mockDb.users.find((u) => u.role === 'super_admin');
  const superPerms = resolveUserPermissions('super_admin', null);
  assert(superPerms['reviews.view'] === true, '2.1 Super Admin has reviews.view');
  assert(superPerms['reviews.approve'] === true, '2.2 Super Admin has reviews.approve');
  assert(superPerms['reviews.delete'] === true, '2.3 Super Admin has reviews.delete');
  assert(superPerms['reviews.create'] === true, '2.4 Super Admin has reviews.create');
  assert(superPerms['reviews.edit'] === true, '2.5 Super Admin has reviews.edit');

  // Super Admin viewing admin reviews
  const superListReq = makeReq('/api/admin/reviews', 'GET', superAdminUser);
  const superListRes = await handleApiRequest(superListReq, env);
  assert(superListRes.status === 200, '2.6 Super Admin can list reviews (HTTP 200)');

  // ----------------------------------------------------
  // SECTION 3: ADMIN A (Full Review Management)
  // ----------------------------------------------------
  console.log('\n--- SECTION 3: Admin A (Authorized for View, Approve, Delete, Create) ---');
  const adminAUser = mockDb.users.find((u) => u.id === 'admin-a-01');

  // 3.1 Admin A lists reviews
  const aListReq = makeReq('/api/admin/reviews', 'GET', adminAUser);
  const aListRes = await handleApiRequest(aListReq, env);
  assert(aListRes.status === 200, '3.1 Admin A can view reviews (HTTP 200)');

  // 3.2 Admin A creates an admin review
  const aCreateReq = makeReq('/api/admin/reviews', 'POST', adminAUser, {
    review: {
      productId: 'prod-watch-01',
      authorName: 'Admin Verified Reviewer',
      comment: 'Superb quality verified by staff.',
      rating: 5,
      verifiedPurchase: true,
    },
  });
  const aCreateRes = await handleApiRequest(aCreateReq, env);
  assert(aCreateRes.status === 201, '3.2 Admin A can create review (HTTP 201)');

  // 3.3 Admin A approves pending review
  const aApproveReq = makeReq('/api/admin/reviews/rev-test-01/approve', 'POST', adminAUser);
  const aApproveRes = await handleApiRequest(aApproveReq, env);
  assert(aApproveRes.status === 200, '3.3 Admin A can approve review (HTTP 200)');

  // 3.4 Admin A deletes review
  const aDeleteReq = makeReq('/api/admin/reviews/rev-test-01', 'DELETE', adminAUser);
  const aDeleteRes = await handleApiRequest(aDeleteReq, env);
  assert(aDeleteRes.status === 200, '3.4 Admin A can delete review (HTTP 200)');

  // ----------------------------------------------------
  // SECTION 4: ADMIN B (Restricted: View & Create Only)
  // ----------------------------------------------------
  console.log('\n--- SECTION 4: Admin B (Authorized for View & Create; FORBIDDEN for Approve & Delete) ---');
  const adminBUser = mockDb.users.find((u) => u.id === 'admin-b-01');

  // Re-seed a test review for Admin B tests
  mockDb.reviews.push({
    id: 'rev-test-02',
    product_id: 'prod-watch-01',
    author_name: 'Customer Bob',
    rating: 4,
    comment: 'Good product.',
    status: 'pending',
    created_at: new Date().toISOString(),
  });

  // 4.1 Admin B can view reviews
  const bListReq = makeReq('/api/admin/reviews', 'GET', adminBUser);
  const bListRes = await handleApiRequest(bListReq, env);
  assert(bListRes.status === 200, '4.1 Admin B can view reviews (HTTP 200)');

  // 4.2 Admin B can create reviews
  const bCreateReq = makeReq('/api/admin/reviews', 'POST', adminBUser, {
    review: {
      productId: 'prod-watch-01',
      authorName: 'Store Staff',
      comment: 'Official staff testing comment.',
      rating: 5,
    },
  });
  const bCreateRes = await handleApiRequest(bCreateReq, env);
  assert(bCreateRes.status === 201, '4.2 Admin B can create review (HTTP 201)');

  // 4.3 Admin B attempts to approve review -> MUST BE 403 FORBIDDEN
  const bApproveReq = makeReq('/api/admin/reviews/rev-test-02/approve', 'POST', adminBUser);
  const bApproveRes = await handleApiRequest(bApproveReq, env);
  assert(bApproveRes.status === 403, '4.3 Admin B blocked from approving reviews (HTTP 403 Forbidden)');
  const bApproveJson: any = await bApproveRes.json();
  assert(
    bApproveJson.error?.includes('reviews.approve'),
    '4.4 Error message references required "reviews.approve" permission'
  );

  // 4.4 Admin B attempts to delete review -> MUST BE 403 FORBIDDEN
  const bDeleteReq = makeReq('/api/admin/reviews/rev-test-02', 'DELETE', adminBUser);
  const bDeleteRes = await handleApiRequest(bDeleteReq, env);
  assert(bDeleteRes.status === 403, '4.5 Admin B blocked from deleting reviews (HTTP 403 Forbidden)');
  const bDeleteJson: any = await bDeleteRes.json();
  assert(
    bDeleteJson.error?.includes('reviews.delete'),
    '4.6 Error message references required "reviews.delete" permission'
  );

  // ----------------------------------------------------
  // SECTION 5: CUSTOMER (Zero Administration Access)
  // ----------------------------------------------------
  console.log('\n--- SECTION 5: Customer (Zero Admin Access) ---');
  const customerUser = mockDb.users.find((u) => u.role === 'customer');

  const custListReq = makeReq('/api/admin/reviews', 'GET', customerUser);
  const custListRes = await handleApiRequest(custListReq, env);
  assert(custListRes.status === 403, '5.1 Customer blocked from listing admin reviews (HTTP 403)');

  const custCreateReq = makeReq('/api/admin/reviews', 'POST', customerUser, {
    review: { productId: 'prod-watch-01', comment: 'hacked' },
  });
  const custCreateRes = await handleApiRequest(custCreateReq, env);
  assert(custCreateRes.status === 403, '5.2 Customer blocked from admin review creation (HTTP 403)');

  const custApproveReq = makeReq('/api/admin/reviews/rev-test-02/approve', 'POST', customerUser);
  const custApproveRes = await handleApiRequest(custApproveReq, env);
  assert(custApproveRes.status === 403, '5.3 Customer blocked from approving reviews (HTTP 403)');

  const custDeleteReq = makeReq('/api/admin/reviews/rev-test-02', 'DELETE', customerUser);
  const custDeleteRes = await handleApiRequest(custDeleteReq, env);
  assert(custDeleteRes.status === 403, '5.4 Customer blocked from deleting reviews (HTTP 403)');

  // ----------------------------------------------------
  // SECTION 6: DYNAMIC PERMISSION GRANT & REVOCATION
  // ----------------------------------------------------
  console.log('\n--- SECTION 6: Super Admin Grant & Revocation Workflow ---');

  // 6.1 Super Admin revokes reviews.delete from Admin A
  const revokeReq = makeReq(
    '/api/admin/users/admin-a-01/permissions',
    'PUT',
    superAdminUser,
    {
      permissions: {
        'reviews.delete': false,
      },
    }
  );
  const revokeRes = await handleApiRequest(revokeReq, env);
  assert(revokeRes.status === 200, '6.1 Super Admin revokes reviews.delete from Admin A (HTTP 200)');

  // 6.2 Admin A attempts delete again -> NOW 403 FORBIDDEN
  const aDeletedAfterRevoke = await handleApiRequest(
    makeReq('/api/admin/reviews/rev-test-02', 'DELETE', adminAUser),
    env
  );
  assert(
    aDeletedAfterRevoke.status === 403,
    '6.2 Admin A is immediately rejected with HTTP 403 after reviews.delete is revoked'
  );

  // 6.3 Super Admin grants reviews.approve to Admin B
  const grantReq = makeReq(
    '/api/admin/users/admin-b-01/permissions',
    'PUT',
    superAdminUser,
    {
      permissions: {
        'reviews.approve': true,
      },
    }
  );
  const grantRes = await handleApiRequest(grantReq, env);
  assert(grantRes.status === 200, '6.3 Super Admin grants reviews.approve to Admin B (HTTP 200)');

  // 6.4 Admin B attempts approve again -> NOW SUCCEEDS (HTTP 200)
  const bApprovedAfterGrant = await handleApiRequest(
    makeReq('/api/admin/reviews/rev-test-02/approve', 'POST', adminBUser),
    env
  );
  assert(
    bApprovedAfterGrant.status === 200,
    '6.4 Admin B successfully approves review after permission granted (HTTP 200)'
  );

  console.log('\n========================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runReviewRbacVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
