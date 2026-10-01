/**
 * Automated Verification Suite for Admin Audit Log Performance Hardening,
 * Server-Side Maximum Limit Clamping, Pagination, and RBAC Security.
 * Rongdhonu Trade
 */

import { getPaginatedAuditLogsFromD1 } from '../src/server/db';

async function runAuditLogPerformanceVerification() {
  console.log('================================================================');
  console.log('STARTING ADMIN AUDIT LOG PERFORMANCE & SECURITY VERIFICATION');
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

  // ================================================================
  // PART A: D1 DATABASE QUERY ATOMIC & SAFE LIMIT UNIT TESTS
  // ================================================================
  console.log('--- PART A: D1 DATABASE QUERY ATOMIC & SAFE LIMIT UNIT TESTS ---');

  // Simulated D1 database engine with 350 audit log entries
  class MockD1AuditDatabase {
    private logs: any[] = [];

    constructor() {
      const now = Date.now();
      for (let i = 0; i < 350; i++) {
        this.logs.push({
          id: `audit-mock-${1000 + i}`,
          timestamp: new Date(now - i * 60 * 1000).toISOString(),
          actor_id: 'dev-admin-1',
          actor_email: 'admin@local.test',
          actor_role: 'admin',
          action: 'SECURITY_EVENT',
          target_id: `target-${i}`,
          target_type: 'system',
          details_json: JSON.stringify({ index: i }),
          ip_address: '127.0.0.1',
        });
      }
    }

    prepare(query: string) {
      const q = query.trim().toUpperCase();
      let boundArgs: any[] = [];

      const stmt = {
        bind: (...args: any[]) => {
          boundArgs = args;
          return stmt;
        },
        first: async <T = any>() => {
          if (q.startsWith('SELECT COUNT(*) AS TOTAL FROM AUDIT_LOGS')) {
            return { total: this.logs.length } as T;
          }
          return null;
        },
        all: async <T = any>() => {
          if (q.startsWith('SELECT * FROM AUDIT_LOGS ORDER BY TIMESTAMP DESC LIMIT ? OFFSET ?')) {
            const [limit, offset] = boundArgs as [number, number];
            const sliced = this.logs.slice(offset, offset + limit);
            return { results: sliced } as any;
          }
          return { results: [] } as any;
        },
      };

      return stmt;
    }
  }

  const mockDb = new MockD1AuditDatabase() as any;

  // A.1 Default limit is 50 when no parameters supplied
  const resA1 = await getPaginatedAuditLogsFromD1(mockDb);
  assert(
    resA1.limit === 50 && resA1.page === 1 && resA1.logs.length === 50 && resA1.total === 350 && resA1.totalPages === 7,
    'A.1 getPaginatedAuditLogsFromD1 defaults to limit=50, page=1, calculating accurate totalPages'
  );

  // A.2 Huge limit (100000) is clamped to MAX_LIMIT (200)
  const resA2 = await getPaginatedAuditLogsFromD1(mockDb, { limit: 100000 });
  assert(
    resA2.limit === 200 && resA2.logs.length === 200,
    `A.2 getPaginatedAuditLogsFromD1 with limit=100000 strictly clamped to MAX_LIMIT of 200 (actual: ${resA2.limit})`
  );

  // A.3 Zero or negative limit is clamped to valid positive value
  const resA3 = await getPaginatedAuditLogsFromD1(mockDb, { limit: 0 });
  assert(
    resA3.limit === 50,
    'A.3 getPaginatedAuditLogsFromD1 with limit=0 safely defaults to 50'
  );

  // A.4 Page 2 with limit 50 returns next 50 distinct items
  const resA4 = await getPaginatedAuditLogsFromD1(mockDb, { page: 2, limit: 50 });
  const idsPage1 = new Set(resA1.logs.map((l) => l.id));
  const page2HasOverlap = resA4.logs.some((l) => idsPage1.has(l.id));
  assert(
    resA4.page === 2 && resA4.logs.length === 50 && !page2HasOverlap,
    'A.4 Page 2 returns next 50 distinct records without overlap'
  );

  // ================================================================
  // PART B: LIVE HTTP SERVER ENDPOINT TESTS
  // ================================================================
  console.log('\n--- PART B: LIVE HTTP SERVER ENDPOINT TESTS ---');

  const baseUrl = 'http://127.0.0.1:3000';

  const superAdminToken = `dev-jwt-${Buffer.from(
    JSON.stringify({
      userId: 'dev-super-admin-1',
      email: 'dev-superadmin@local.test',
      role: 'super_admin',
      exp: Date.now() + 86400000,
    })
  ).toString('base64')}`;

  const staffWithoutAuditToken = `dev-jwt-${Buffer.from(
    JSON.stringify({
      userId: 'user-subadmin-staff',
      email: 'staff@rongdhonutrade.com',
      role: 'sub_admin',
      permissions: {
        'audit_log.view': false,
      },
      exp: Date.now() + 86400000,
    })
  ).toString('base64')}`;

  const customerToken = `dev-jwt-${Buffer.from(
    JSON.stringify({
      userId: 'test-customer-1',
      email: 'customer@local.test',
      role: 'customer',
      exp: Date.now() + 86400000,
    })
  ).toString('base64')}`;

  // B.1 Unauthenticated request -> HTTP 401 Unauthorized
  const resB1 = await fetch(`${baseUrl}/api/admin/audit-logs`);
  assert(
    resB1.status === 401,
    'B.1 Unauthenticated GET /api/admin/audit-logs returns HTTP 401 Unauthorized'
  );

  // B.2 Customer request -> HTTP 403 Forbidden
  const resB2 = await fetch(`${baseUrl}/api/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  assert(
    resB2.status === 403,
    'B.2 Customer GET /api/admin/audit-logs returns HTTP 403 Forbidden'
  );

  // B.3 Staff without audit_log.view permission -> HTTP 403 Forbidden
  const resB3 = await fetch(`${baseUrl}/api/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${staffWithoutAuditToken}` },
  });
  assert(
    resB3.status === 403,
    'B.3 Staff account without audit_log.view permission returns HTTP 403 Forbidden'
  );

  // B.4 Authorized Admin request without pagination -> defaults to limit=50, page=1
  const resB4 = await fetch(`${baseUrl}/api/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const jsonB4 = await resB4.json();
  assert(
    resB4.status === 200 &&
      jsonB4.success === true &&
      jsonB4.page === 1 &&
      jsonB4.limit === 50 &&
      jsonB4.count <= 50 &&
      Array.isArray(jsonB4.logs),
    `B.4 Authorized Admin request defaults to page=1, limit=50 (count: ${jsonB4.count}, total: ${jsonB4.total})`
  );

  // B.5 Huge limit (?limit=100000) is strictly capped at server maximum (200)
  const resB5 = await fetch(`${baseUrl}/api/admin/audit-logs?limit=100000`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const jsonB5 = await resB5.json();
  assert(
    resB5.status === 200 &&
      jsonB5.success === true &&
      jsonB5.limit === 200 &&
      jsonB5.count <= 200,
    `B.5 Huge limit (?limit=100000) is strictly capped at maximum of 200 (actual limit: ${jsonB5.limit})`
  );

  // B.6 Custom valid pagination (?page=2&limit=25) works properly
  const resB6 = await fetch(`${baseUrl}/api/admin/audit-logs?page=2&limit=25`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const jsonB6 = await resB6.json();
  assert(
    resB6.status === 200 &&
      jsonB6.success === true &&
      jsonB6.page === 2 &&
      jsonB6.limit === 25 &&
      jsonB6.count === 25,
    'B.6 Custom pagination (?page=2&limit=25) returns expected slice'
  );

  // B.7 Newest records are returned first (chronological descending order)
  const timestamps = (jsonB4.logs || []).map((l: any) => new Date(l.timestamp).getTime());
  let isSortedDescending = true;
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] > timestamps[i - 1]) {
      isSortedDescending = false;
      break;
    }
  }
  assert(
    isSortedDescending,
    'B.7 Audit records maintain strict newest-first ordering (timestamp DESC)'
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuditLogPerformanceVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
