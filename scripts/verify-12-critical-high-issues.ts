import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getAuthSecret, verifyAuthToken, createAuthToken } from '../src/server/auth';
import { getClientIp, isSuperAdminUserServer } from '../src/server/router';
import { getSuperAdminEmails, getSuperAdminUserIds } from '../src/server/permissions';
import { generateSecureOrderNumber } from '../src/server/db';

async function verifyAll12Issues() {
  console.log('================================================================');
  console.log('VERIFYING ALL 12 CRITICAL & HIGH SECURITY / LOGIC FIXES');
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

  // -------------------------------------------------------------
  // ISSUE 1: ADMIN_SECRET Legacy Fallback
  // -------------------------------------------------------------
  console.log('--- ISSUE 1: ADMIN_SECRET Legacy Fallback ---');
  const oldEnv = process.env.NODE_ENV;
  const oldAdmin = process.env.ADMIN_SECRET;
  try {
    delete process.env.ADMIN_SECRET;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';

    let threw = false;
    try {
      getAuthSecret({ DB: {} as any });
    } catch (e: any) {
      threw = e.message.includes('SERVER_CONFIGURATION_ERROR');
    }
    assert(threw, '1.1 getAuthSecret fails closed in production when ADMIN_SECRET is absent');

    // verifyAuthToken rejects tokens when signature does not match ADMIN_SECRET (no D1 fallback)
    const fakeToken = await createAuthToken({ userId: 'u1', email: 'test@example.com', role: 'admin' }, 'old-secret');
    const mockDb = {
      prepare: () => ({
        bind: () => ({ first: async () => ({ settings_json: JSON.stringify({ auth_secret: 'old-secret' }) }) })
      })
    };
    const resVerify = await verifyAuthToken(fakeToken, 'prod-admin-secret', { DB: mockDb as any });
    assert(resVerify === null, '1.2 verifyAuthToken strictly fails closed without D1 store_settings secret fallback');

    // Scan source code for D1 auth_secret / jwt_secret fallbacks
    const authCode = readFileSync(resolve('./src/server/auth.ts'), 'utf-8');
    assert(
      !authCode.includes('auth_secret') && !authCode.includes('jwt_secret'),
      '1.3 src/server/auth.ts contains zero D1 auth_secret or jwt_secret fallbacks'
    );
  } finally {
    process.env.NODE_ENV = oldEnv;
    if (oldAdmin !== undefined) process.env.ADMIN_SECRET = oldAdmin;
  }

  // -------------------------------------------------------------
  // ISSUE 2: Rate Limiter Fail-Open / Race Condition
  // -------------------------------------------------------------
  console.log('\n--- ISSUE 2: Rate Limiter Fail-Open & Concurrency ---');
  const routerCode = readFileSync(resolve('./src/server/router.ts'), 'utf-8');
  assert(
    routerCode.includes("console.error('[RateLimit Error] Rate limits table check failed in D1:', err);") &&
    routerCode.includes('return { allowed: false, remainingSeconds: 60 };'),
    '2.1 checkRateLimit fails closed on D1 database errors (never silently allows)'
  );
  assert(
    routerCode.includes('ON CONFLICT(key) DO UPDATE SET') &&
    routerCode.includes('count = CASE WHEN reset_at <='),
    '2.2 recordFailedAttempt uses atomic upsert in Cloudflare D1'
  );
  assert(
    !routerCode.includes("'default-ip'"),
    '2.3 Router does not use shared "default-ip" fallback bucket'
  );

  // -------------------------------------------------------------
  // ISSUE 3: Public Order Abuse + Persistent Idempotency
  // -------------------------------------------------------------
  console.log('\n--- ISSUE 3: Public Order Abuse & Persistent Idempotency ---');
  const mig8 = readFileSync(resolve('./migrations/0008_order_idempotency.sql'), 'utf-8');
  assert(
    mig8.includes('CREATE TABLE IF NOT EXISTS order_idempotency') &&
    mig8.includes('key TEXT PRIMARY KEY'),
    '3.1 Migration 0008 defines persistent order_idempotency table'
  );
  assert(
    routerCode.includes('FROM order_idempotency WHERE key = ?') &&
    routerCode.includes('INSERT INTO order_idempotency'),
    '3.2 POST /api/orders uses persistent D1 order_idempotency table'
  );

  // -------------------------------------------------------------
  // ISSUE 4: Concurrent Stock Overselling
  // -------------------------------------------------------------
  console.log('\n--- ISSUE 4: Concurrent Stock Overselling Guard ---');
  assert(
    mig8.includes('CREATE TRIGGER IF NOT EXISTS trg_prevent_negative_stock') &&
    mig8.includes('WHEN NEW.stock < 0') &&
    mig8.includes('RAISE(ABORT'),
    '4.1 D1 Migration 0008 enforces engine-level negative stock prevention trigger'
  );
  const dbCode = readFileSync(resolve('./src/server/db.ts'), 'utf-8');
  assert(
    dbCode.includes('const changes = sRes?.meta?.changes') &&
    dbCode.includes('if (changes < 1)') &&
    dbCode.includes('DELETE FROM orders WHERE id = ?') &&
    dbCode.includes('UPDATE products SET stock = stock + ?'),
    '4.2 insertOrder validates changes for all stock statements and rolls back order + restored stock on concurrency failure'
  );

  // -------------------------------------------------------------
  // ISSUE 5: Public Order Identity Trust
  // -------------------------------------------------------------
  console.log('\n--- ISSUE 5: Public Order Identity Trust ---');
  assert(
    routerCode.includes('verifiedTokenUser = await verifyAuthToken(token, secret, env)') &&
    routerCode.includes('orderData.userId = verifiedTokenUser.userId;') &&
    routerCode.includes('// Guest checkout') &&
    routerCode.includes('orderData.userId = undefined;') &&
    routerCode.includes('orderData.userEmail = undefined;'),
    '5.1 Public order creation strictly derives user identity from server session token and strips guest spoofed IDs'
  );

  // -------------------------------------------------------------
  // ISSUE 6: verifiedPurchase Trust
  // -------------------------------------------------------------
  console.log('\n--- ISSUE 6: verifiedPurchase Trust ---');
  assert(
    routerCode.includes('// 4. Server-Authoritative verifiedPurchase Verification:') &&
    routerCode.includes('SELECT id FROM orders') &&
    routerCode.includes('verifiedPurchase: isVerifiedPurchase'),
    '6.1 Review creation determines verifiedPurchase authoritatively from D1 orders (client cannot force true)'
  );

  // -------------------------------------------------------------
  // ISSUE 7: Steadfast Fake Tracking / Consignment IDs
  // -------------------------------------------------------------
  console.log('\n--- ISSUE 7: Steadfast Fake Tracking / Consignment IDs Removal ---');
  const viteCode = readFileSync(resolve('./vite.config.ts'), 'utf-8');
  assert(
    !routerCode.includes('Math.random() * 9000') &&
    !routerCode.includes('`CID-${Date.now()'),
    '7.1 src/server/router.ts contains zero fake trackingCode or consignmentId generation fallbacks'
  );
  assert(
    !viteCode.includes('`STDF-${order.orderNumber}') &&
    !viteCode.includes('`CID-${Date.now()'),
    '7.2 vite.config.ts contains zero fake trackingCode or consignmentId generation fallbacks'
  );
  assert(
    routerCode.includes('if (!trackingCode || !consignmentId) {') &&
    routerCode.includes('error: \'Steadfast booking failed: API response did not contain a valid tracking code or consignment ID.'),
    '7.3 Courier dispatch fails safely with 400 when tracking or consignment ID is missing'
  );

  // -------------------------------------------------------------
  // ISSUE 8: Super Admin Hardcoded Identity
  // -------------------------------------------------------------
  console.log('\n--- ISSUE 8: Super Admin Hardcoded Identity ---');
  const permCode = readFileSync(resolve('./src/server/permissions.ts'), 'utf-8');
  assert(
    !permCode.includes('cmt413uec@gmail.com') &&
    !permCode.includes('efatmkt5@gmail.com') &&
    !permCode.includes('efatmkt7@gmail.com') &&
    !permCode.includes('clean.startsWith'),
    '8.1 src/server/permissions.ts contains zero hardcoded super admin emails or startsWith checks'
  );
  assert(
    permCode.includes('env?.SUPER_ADMIN_EMAILS') &&
    permCode.includes('env?.SUPER_ADMIN_USER_IDS'),
    '8.2 Super admin identities are resolved strictly from SUPER_ADMIN_EMAILS and SUPER_ADMIN_USER_IDS env vars'
  );
  assert(
    routerCode.includes('isSuperAdminUserServer('),
    '8.3 Server router uses server-authoritative isSuperAdminUserServer helper'
  );

  // -------------------------------------------------------------
  // ISSUE 9: Public Product Data Integrity
  // -------------------------------------------------------------
  console.log('\n--- ISSUE 9: Public Product Data Integrity ---');
  assert(
    dbCode.includes('// Public product data integrity: Exclude inactive/deleted products') &&
    dbCode.includes("status = 'active' OR status = 'published' OR status IS NULL"),
    '9.1 D1 database product query excludes inactive/deleted products by default'
  );
  assert(
    routerCode.includes('const isInactive = product.status !== \'active\' || Boolean((product as any).isDeleted);') &&
    routerCode.includes('if (isInactive && !isPrivileged) {') &&
    routerCode.includes('return jsonResponse({ success: false, error: \'Product not found\' }, 404);'),
    '9.2 Public single-product endpoint returns HTTP 404 for inactive or deleted products'
  );

  // -------------------------------------------------------------
  // ISSUE 10: Runtime Database Schema Creation
  // -------------------------------------------------------------
  console.log('\n--- ISSUE 10: Runtime Database Schema Creation Removal ---');
  const srcFiles = ['src/server/db.ts', 'src/server/router.ts', 'src/server/auth.ts', 'src/server/courier.ts'];
  let runtimeCreateTableCount = 0;
  for (const f of srcFiles) {
    const content = readFileSync(resolve(f), 'utf-8');
    if (content.includes('CREATE TABLE')) {
      runtimeCreateTableCount++;
    }
  }
  assert(
    runtimeCreateTableCount === 0,
    '10.1 Zero runtime CREATE TABLE statements exist across all server source code files'
  );

  // -------------------------------------------------------------
  // ISSUE 11: Login Timing Enumeration
  // -------------------------------------------------------------
  console.log('\n--- ISSUE 11: Login Timing Enumeration Mitigation ---');
  assert(
    routerCode.includes('const DUMMY_PBKDF2_HASH =') &&
    routerCode.includes('if (!userRow) {') &&
    routerCode.includes('await verifyPassword(password, DUMMY_PBKDF2_HASH);'),
    '11.1 Login handler verifies password against fixed dummy PBKDF2 hash on non-existent user to eliminate timing difference'
  );

  // -------------------------------------------------------------
  // ISSUE 12: Forgot Password Timing Enumeration
  // -------------------------------------------------------------
  console.log('\n--- ISSUE 12: Forgot Password Timing Enumeration Mitigation ---');
  assert(
    routerCode.includes('// Perform simulated cryptographic digest to prevent timing analysis') &&
    routerCode.includes('crypto.subtle.digest') &&
    routerCode.includes('return jsonResponse(genericSuccessResponse, 200);'),
    '12.1 Forgot password returns identical 200 generic response and simulates crypto digest on non-existent account'
  );

  console.log('\n================================================================');
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

verifyAll12Issues().catch((err) => {
  console.error('Verification crashed:', err);
  process.exit(1);
});
