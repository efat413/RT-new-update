import { Env, UserRow, D1Database } from './types';
import {
  checkTablesExist,
  // Products
  getAllProducts,
  getPaginatedProducts,
  getHomepageProducts,
  getProductById,
  insertProduct,
  updateProductInD1,
  setProductFeaturedInD1,
  deleteProductFromD1,
  // Categories
  getAllCategories,
  getCategoryById,
  insertCategory,
  updateCategoryInD1,
  deleteCategoryFromD1,
  // Sliders
  getAllSliders,
  getSliderById,
  insertSlider,
  updateSliderInD1,
  reorderSlidersInD1,
  deleteSliderFromD1,
  // Store Settings
  getStoreSettings,
  getHomepageMetadata,
  updateStoreSettingsInD1,
  detectLegacyD1CourierCredentials,
  cleanupLegacyCourierCredentialsFromD1,
  // Media Assets
  saveMediaAssetInD1,
  getMediaAssetFromD1,
  // Coupons
  getAllCoupons,
  insertCoupon,
  updateCouponInD1,
  deleteCouponFromD1,
  // Reviews
  getAllReviews,
  insertReview,
  deleteReviewFromD1,
  // Users
  getAllUsers,
  getUserByEmail,
  getUserByEmailOrUsername,
  insertUser,
  updateUserInD1,
  updateUserPasswordInD1,
  deleteUserFromD1,
  rowToUser,
  // Password Reset Tokens
  createPasswordResetToken,
  getPasswordResetToken,
  claimPasswordResetToken,
  unclaimPasswordResetToken,
  markPasswordResetTokenUsed,
  // Orders
  getAllOrders,
  getPaginatedOrders,
  sanitizeOrderPaginationParams,
  getOrderById,
  insertOrder,
  updateOrderInD1,
  deleteOrderFromD1,
  // Schema & Sanitation
  sanitizeProductForRole,
  sanitizeOrderForRole,
  sanitizeOrderForPublicTracking,
  // Expenses & Analytics
  getAllExpenses,
  insertExpense,
  deleteExpenseFromD1,
  getProfitAnalytics,
  // Audit Logs
  insertAuditLogInD1,
  getAuditLogsFromD1,
  getPaginatedAuditLogsFromD1,
  findOrderByCourierIdentifier,
  checkAndRecordWebhookFingerprint,
} from './db';
import {
  Order,
  Product,
  Category,
  CarouselSlide,
  StoreSettings,
  Coupon,
  ProductReview,
  UserAccount,
  AdminPermissions,
  UserRole,
} from '../types';
import {
  verifyPassword,
  hashPassword,
  createAuthToken,
  verifyAuthToken,
  getAuthSecret,
  resolveAuthSecret,
  bufferToHex,
  computePasswordSignature,
  TokenPayload,
} from './auth';
import {
  syncSingleOrderCourierStatus,
  syncAllActiveCourierOrders,
  callSteadfastApi,
  normalizeSteadfastStatus,
} from './courier';
import {
  verifyCourierWebhookAuth,
  computeHmacSha256Hex,
  computeWebhookFingerprint,
} from './webhookAuth';
import {
  validateWebhookDestination,
  safeFetchWebhook,
} from './ssrf';
import {
  validateImageBuffer,
  generateSafeMediaKey,
  isValidMediaKey,
  getSafeMediaHeaders,
  MAX_IMAGE_SIZE_BYTES,
} from './imageSecurity';

let activeApiRequest: Request | null = null;
let activeEnv: Env | null = null;

/**
 * Environment-aware CORS origin policy.
 * - In production: Permits ONLY explicitly trusted production origin(s) configured in
 *   PRODUCTION_ORIGIN, ALLOWED_ORIGINS, or the official store domains (https://rongdhonutrade.com).
 *   Wildcard origins (*.pages.dev, *.workers.dev, *.run.app) are strictly blocked from production credential access.
 * - In development: Localhost / loopback origins (and AI Studio preview container) are permitted.
 * - Untrusted origins receive NO Access-Control-Allow-Origin or Access-Control-Allow-Credentials headers.
 */
export function getCorsHeaders(req?: Request | null, env?: Env | null): Record<string, string> {
  const currentReq = req || activeApiRequest;
  const currentEnv = env || activeEnv;
  const origin = currentReq?.headers.get('Origin')?.trim() || '';

  // 1. Resolve primary production origin
  const primaryProductionOrigin = (
    currentEnv?.PRODUCTION_ORIGIN ||
    process.env.PRODUCTION_ORIGIN ||
    'https://rongdhonutrade.com'
  ).trim().replace(/\/+$/, '');

  const trustedOrigins = new Set<string>([
    primaryProductionOrigin,
    'https://rongdhonutrade.com',
    'https://www.rongdhonutrade.com',
  ]);

  // 2. Add explicitly configured extra origins from ALLOWED_ORIGINS (comma-separated)
  const envAllowed = currentEnv?.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS;
  if (envAllowed && typeof envAllowed === 'string') {
    envAllowed.split(',').forEach((o) => {
      const trimmed = o.trim().replace(/\/+$/, '');
      if (trimmed) trustedOrigins.add(trimmed);
    });
  }

  // 3. Environment detection: only allow local dev origins if genuinely in development mode
  const isDev = Boolean(
    currentEnv?.ENVIRONMENT === 'development' ||
    process.env.NODE_ENV === 'development' ||
    process.env.DEV === 'true' ||
    process.env.VITE
  );

  let isAllowed = false;

  if (origin) {
    if (trustedOrigins.has(origin)) {
      isAllowed = true;
    } else if (isDev) {
      try {
        const parsed = new URL(origin);
        if (
          parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname === '0.0.0.0'
        ) {
          isAllowed = true;
        } else if (parsed.hostname.endsWith('.run.app')) {
          isAllowed = true;
        }
      } catch {}
    }
  }

  // If no Origin header (same-origin browser navigation, curl, or internal dispatch):
  // Safe default: return Vary: Origin without credential/origin exposure
  if (!origin) {
    return {
      'Vary': 'Origin',
    };
  }

  // Reject untrusted origins safely: do NOT return Access-Control-Allow-Origin or Access-Control-Allow-Credentials
  if (!isAllowed) {
    return {
      'Vary': 'Origin',
    };
  }

  // Explicitly trusted origin: return credentialed CORS headers for that origin only
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Cache-Control, X-Webhook-Signature, X-Webhook-Secret, X-Signature, X-Timestamp, Api-Key, Secret-Key',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

/**
 * Builds the authoritative Set-Cookie header for `auth_token`.
 * Adapts Secure and SameSite attributes safely for production HTTPS, cross-site HTTPS preview iframes, and local HTTP.
 */
function buildAuthCookieHeader(request: Request, token: string, maxAgeSeconds: number, env?: Env | null): string {
  let isHttps = false;
  let reqHostname = '';
  try {
    const reqUrl = new URL(request.url);
    reqHostname = reqUrl.hostname;
    if (reqUrl.protocol === 'https:') {
      isHttps = true;
    }
  } catch {}

  const forwardedProto = (request.headers.get('x-forwarded-proto') || '').toLowerCase();
  const cfVisitor = (request.headers.get('cf-visitor') || '').toLowerCase();
  if (forwardedProto.includes('https') || cfVisitor.includes('"https"')) {
    isHttps = true;
  }

  const currentEnv = env || activeEnv;
  const isDev = Boolean(
    currentEnv?.ENVIRONMENT === 'development' ||
    process.env.NODE_ENV === 'development' ||
    process.env.DEV === 'true' ||
    process.env.VITE
  );

  const secFetchSite = (request.headers.get('sec-fetch-site') || '').toLowerCase();
  // Only permit SameSite=None for HTTPS cross-site requests in development preview environments
  const isDevCrossSite = isDev && isHttps && (secFetchSite === 'cross-site' || reqHostname.endsWith('.run.app'));

  const sameSite = isDevCrossSite ? 'None' : 'Lax';
  const secureAttr = isHttps ? '; Secure' : '';
  const encodedVal = token ? encodeURIComponent(token) : '';
  const expiresAttr = maxAgeSeconds <= 0 ? '; Expires=Thu, 01 Jan 1970 00:00:00 GMT' : '';

  return `auth_token=${encodedVal}; Path=/; HttpOnly${secureAttr}; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}${expiresAttr}`;
}

/**
 * Standard JSON response helper with restricted CORS, credential support, cache-busting, and safe internal error masking
 */
function jsonResponse(data: any, status = 200, customHeaders: Record<string, string> = {}): Response {
  let payload = data;

  if (payload && typeof payload === 'object') {
    // 1. Strip raw stack traces, SQL queries, and file paths unconditionally
    if ('stack' in payload) {
      console.error('[Server Technical Stack Logged Safely]:', payload.stack);
      delete payload.stack;
    }
    if ('sql' in payload) {
      console.error('[Server SQL Query Logged Safely]:', payload.sql);
      delete payload.sql;
    }

    // 2. Hide internal server errors (5xx): Never expose raw err.message or database internals to clients
    if (status >= 500) {
      const isSafe503Message =
        status === 503 &&
        typeof payload.error === 'string' &&
        payload.error.toLowerCase().includes('unavailable');

      const isSafeOrderErrorMessage =
        typeof payload.error === 'string' &&
        payload.error === 'Unable to place the order right now. Please try again.';

      if (!isSafe503Message && !isSafeOrderErrorMessage && payload.error && payload.error !== 'Internal server error.' && payload.error !== 'Something went wrong. Please try again.') {
        console.error('[Server Internal Error Logged Safely]:', payload.error);
        payload = {
          ...payload,
          error: 'Internal server error.',
        };
      }
      if (!isSafe503Message && !isSafeOrderErrorMessage && payload.message && typeof payload.message === 'string' && !payload.success) {
        console.error('[Server Internal Message Logged Safely]:', payload.message);
        payload = {
          ...payload,
          message: 'Internal server error.',
        };
      }
    } else {
      // 3. Defense-in-depth for 4xx responses: Intercept any accidental SQL, D1 driver, or filesystem leaks
      const errStr = typeof payload.error === 'string' ? payload.error : '';
      const isLeakingInternals =
        /sqlite|syntax error|d1|table |column |foreign key|prepare|bind|database disk|file not found|\/app\/|\/src\/|\.ts:\d+|\.js:\d+|cloudflare d1|admin_secret|resend_api_key|token|auth_token|typeerror|referenceerror|rangeerror|evalerror/i.test(errStr);
      if (isLeakingInternals) {
        console.error('[Server Internal Leak Intercepted & Masked Safely]:', errStr);
        payload = {
          ...payload,
          error: 'Invalid request.',
        };
      }
    }
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...customHeaders,
    },
  });
}

export interface SafeLogContext {
  route: string;
  method: string;
  userId?: string;
  orderId?: string;
  orderNumber?: string;
  action?: string;
  error?: any;
  extra?: Record<string, any>;
}

/**
 * Server-Side Safe Diagnostic Error Logging
 * Logs safe diagnostic context (timestamp, route, method, user ID, error type/message)
 * strictly without leaking passwords, tokens, ADMIN_SECRET, courier secrets, or sensitive customer data.
 */
export function logServerError(ctx: SafeLogContext): void {
  const timestamp = new Date().toISOString();
  const safeLog: Record<string, any> = {
    timestamp,
    route: ctx.route,
    method: ctx.method,
  };
  if (ctx.userId) safeLog.userId = ctx.userId;
  if (ctx.orderId) safeLog.orderId = ctx.orderId;
  if (ctx.orderNumber) safeLog.orderNumber = ctx.orderNumber;
  if (ctx.action) safeLog.action = ctx.action;

  if (ctx.error) {
    const err = ctx.error;
    safeLog.errorType = err?.name || typeof err;
    safeLog.errorMessage = err?.message
      ? String(err.message).replace(/(bearer\s+)[^\s]+/gi, '$1[REDACTED]')
      : String(err);
  }

  if (ctx.extra) {
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(ctx.extra)) {
      if (/password|token|secret|api[_-]?key|auth|cookie|credential/i.test(k)) {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = v;
      }
    }
    safeLog.extra = sanitized;
  }

  console.error('[Safe Diagnostic Error]:', JSON.stringify(safeLog));
}

/**
 * Extracts authentication token prioritizing authoritative HttpOnly Cookie
 */
function extractTokenFromRequest(request: Request): string | null {
  // 1. Authoritative: HttpOnly Cookie 'auth_token'
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]).trim();
    }
  }

  // 2. Fallback: Authorization header (for test scripts / automated checks)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const t = authHeader.substring(7).trim();
    if (t) return t;
  }

  return null;
}

/**
 * Helper to determine if running in a local development/testing environment.
 * Strict fail-closed: Never infers development mode from missing DB bindings.
 */
export function isDevEnvironment(env?: any): boolean {
  if (env?.DEV === true) return true;
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      return true;
    }
  }
  return false;
}

/**
 * Safely extracts client IP address strictly prioritizing Cloudflare's authoritative header.
 * Avoids trusting client-spoofed headers when running behind Cloudflare edge.
 * In production, does NOT trust arbitrary client-sent x-forwarded-for or group clients under a literal "default-ip".
 */
export function getClientIp(request: Request, isDev?: boolean): string {
  // 1. Authoritative Cloudflare edge header (set securely by Cloudflare network in production)
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) {
    return cfIp.trim();
  }
  const trueClientIp = request.headers.get('true-client-ip');
  if (trueClientIp && trueClientIp.trim()) {
    return trueClientIp.trim();
  }

  // 2. Safe local development / testing fallback (only allowed when isDev is explicitly true)
  if (isDev) {
    const xff = request.headers.get('x-forwarded-for');
    if (xff && xff.trim()) {
      return xff.split(',')[0].trim();
    }
    const realIp = request.headers.get('x-real-ip');
    if (realIp && realIp.trim()) {
      return realIp.trim();
    }
    return '127.0.0.1';
  }

  // 3. Cloudflare production edge fallback: Bounded Ray identifier (never a shared "default-ip")
  const cfRay = request.headers.get('cf-ray');
  if (cfRay && cfRay.trim()) {
    return `cf-ray-${cfRay.split('-')[0].trim()}`;
  }

  return 'cf-unidentified';
}

/**
 * Tracking rate limit configurations (prevent brute-force, phone enumeration, and scraping)
 */
const TRACKING_FAIL_LIMIT = 5;          // Max failed attempts before cooldown
const TRACKING_FAIL_WINDOW = 300;       // 5-minute failure counting window
const TRACKING_COOLDOWN_SECONDS = 300;  // 5-minute cooldown duration
const TRACKING_REQ_LIMIT = 15;          // Max lookups (both successful & failed) per IP per minute
const TRACKING_REQ_WINDOW = 60;         // 60-second window
const TRACKING_ORDER_LIMIT = 10;        // Max lookups per target order number per 5 minutes
const TRACKING_ORDER_WINDOW = 300;      // 5-minute window

/**
 * Brute force attempt limiter (Memory tier + Cloudflare D1 distributed fallback)
 */
const loginAttemptMap = new Map<string, { count: number; lockedUntil: number }>();

/**
 * Server-side order idempotency and duplicate double-click protection cache (15-minute TTL)
 */
const orderIdempotencyMap = new Map<string, { order: Order; timestamp: number }>();
const orderRecentSubmissionMap = new Map<string, { order: Order; timestamp: number }>();

function cleanupOrderAbuseMaps(): void {
  const now = Date.now();
  for (const [key, val] of orderIdempotencyMap.entries()) {
    if (now - val.timestamp > 15 * 60 * 1000) {
      orderIdempotencyMap.delete(key);
    }
  }
  for (const [key, val] of orderRecentSubmissionMap.entries()) {
    if (now - val.timestamp > 30 * 1000) {
      orderRecentSubmissionMap.delete(key);
    }
  }
}

async function checkRateLimit(
  key: string,
  limit = 5,
  windowSeconds = 900,
  db?: D1Database
): Promise<{ allowed: boolean; remainingSeconds?: number }> {
  const now = Date.now();

  // Tier 1: Check memory map
  const memEntry = loginAttemptMap.get(key);
  if (memEntry && memEntry.lockedUntil > now) {
    return {
      allowed: false,
      remainingSeconds: Math.ceil((memEntry.lockedUntil - now) / 1000),
    };
  }

  // Tier 2: Check Cloudflare D1 for multi-edge persistence
  if (db) {
    try {
      const row = await db
        .prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?')
        .bind(key)
        .first<{ count: number; reset_at: number }>();

      if (row) {
        if (row.reset_at > now && row.count >= limit) {
          const rem = Math.ceil((row.reset_at - now) / 1000);
          loginAttemptMap.set(key, { count: row.count, lockedUntil: row.reset_at });
          return { allowed: false, remainingSeconds: rem };
        } else if (row.reset_at <= now) {
          await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run().catch(() => {});
        }
      }
    } catch (err) {
      console.error('[RateLimit Error] Rate limits table check failed in D1:', err);
      // Security: Rate-limit failures must not silently result in allowed: true
      return { allowed: false, remainingSeconds: 60 };
    }
  }

  return { allowed: true };
}

async function recordFailedAttempt(
  key: string,
  limit = 5,
  windowSeconds = 900,
  db?: D1Database
): Promise<void> {
  const now = Date.now();
  const resetAt = now + windowSeconds * 1000;

  // In-memory update
  const entry = loginAttemptMap.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= limit) {
    entry.lockedUntil = resetAt;
  }
  loginAttemptMap.set(key, entry);

  // D1 distributed atomic upsert
  if (db) {
    try {
      await db.prepare(
        `INSERT INTO rate_limits (key, count, reset_at)
         VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
           reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END`
      ).bind(key, resetAt, now, now, resetAt).run();
    } catch (err) {
      console.error('[RateLimit Error] Atomic record failed attempt error in D1:', err);
    }
  }
}

async function clearFailedAttempts(key: string, db?: D1Database): Promise<void> {
  loginAttemptMap.delete(key);
  if (db) {
    try {
      await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run().catch(() => {});
    } catch {}
  }
}

import {
  PermissionKey,
  PERMISSION_KEYS,
  PERMISSIONS_METADATA,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  isValidPermissionKey,
  isSuperAdminOnlyPermission,
  resolveUserPermissions,
  generateLegacyPermissionFlags,
  getSuperAdminEmails,
  getSuperAdminUserIds,
  isSuperAdminEmailServer,
  isSuperAdminUserIdServer,
} from './permissions';

/**
 * Server-authoritative check for Super Administrator identity.
 * Evaluates role, configured server env emails, and configured server env user IDs.
 * Never uses hardcoded emails or client-controlled values.
 */
export function isSuperAdminUserServer(u?: { role?: string; email?: string; id?: string } | null, env?: any): boolean {
  if (!u) return false;
  if (u.role === 'super_admin') return true;
  if (u.email && isSuperAdminEmailServer(u.email, env)) return true;
  if (u.id && isSuperAdminUserIdServer(u.id, env)) return true;
  return false;
}

/**
 * Authenticated User Context for Backend RBAC
 */
export interface AuthContext {
  tokenUser: TokenPayload;
  dbUser: any;
  role: UserRole;
  permissions: Record<PermissionKey, boolean>;
  legacyPermissions: AdminPermissions;
}

/**
 * Validates the Authorization Bearer token and verifies the user exists in D1
 */
async function requireAuth(
  request: Request,
  env: Env
): Promise<{ auth?: AuthContext; errorResponse?: Response }> {
  if (!env.DB) {
    return {
      errorResponse: jsonResponse({ success: false, error: 'Database binding unavailable.' }, 503),
    };
  }

  const token = extractTokenFromRequest(request);
  if (!token) {
    return {
      errorResponse: jsonResponse(
        { success: false, error: 'Unauthorized: Authentication required.' },
        401
      ),
    };
  }

  // Security Hardening: Development-only tokens (dev-jwt-*) are strictly rejected by the server router.
  // Production authentication MUST ALWAYS use full cryptographic HMAC-SHA256 verification.
  if (token.startsWith('dev-jwt-') || token.startsWith('dev-') || !token.includes('.')) {
    return {
      errorResponse: jsonResponse(
        { success: false, error: 'Unauthorized: Invalid or expired session token.' },
        401
      ),
    };
  }

  let secret: string;
  try {
    secret = await resolveAuthSecret(env);
  } catch (err: any) {
    console.error('Error resolving auth secret:', err);
    return {
      errorResponse: jsonResponse({ success: false, error: 'Internal server error.' }, 500),
    };
  }

  const tokenUser = await verifyAuthToken(token, secret, env);
  if (!tokenUser) {
    return {
      errorResponse: jsonResponse(
        { success: false, error: 'Unauthorized: Invalid or expired session token.' },
        401
      ),
    };
  }

  // Look up user in Cloudflare D1 (by email first, then fallback to userId)
  let dbUser = await getUserByEmailOrUsername(env.DB, tokenUser.email);
  if (!dbUser && tokenUser.userId) {
    dbUser = await getUserByEmailOrUsername(env.DB, tokenUser.userId);
  }
  if (!dbUser && tokenUser.email === 'admin') {
    const defaultSuper = getSuperAdminEmails(env)[0];
    if (defaultSuper) {
      dbUser = await getUserByEmailOrUsername(env.DB, defaultSuper);
    }
  }
  if (!dbUser) {
    return {
      errorResponse: jsonResponse(
        { success: false, error: 'Unauthorized: User account no longer exists.' },
        401
      ),
    };
  }

  // Session Invalidation: If user has a password in D1, verify token carries valid 32-character pwdSig
  if (dbUser.password) {
    const expectedSig = await computePasswordSignature(dbUser.password);
    const tokenSig = tokenUser.pwdSig;
    // Hardened session validation: Strictly accept only the secure 32-character SHA-256 signature
    // Legacy 16-character prefix signatures are unconditionally rejected
    const isSigValid = Boolean(
      tokenSig &&
      typeof tokenSig === 'string' &&
      tokenSig.length === 32 &&
      tokenSig === expectedSig
    );

    if (!isSigValid) {
      return {
        errorResponse: jsonResponse(
          { success: false, error: 'Unauthorized: Session invalidated or password was changed. Please log in again.' },
          401
        ),
      };
    }
  }

  // Session Invalidation: Check for critical role change
  if (tokenUser.role && dbUser.role && tokenUser.role !== dbUser.role) {
    return {
      errorResponse: jsonResponse(
        { success: false, error: 'Unauthorized: Session invalidated due to account role change. Please log in again.' },
        401
      ),
    };
  }

  // Account status enforcement: Inactive or suspended accounts cannot authenticate
  if ((dbUser as any).status === 'inactive' || (dbUser as any).status === 'suspended' || (dbUser as any).is_active === 0) {
    return {
      errorResponse: jsonResponse(
        { success: false, error: 'Forbidden: Account has been deactivated or suspended.' },
        403
      ),
    };
  }

  const role = (dbUser.role as UserRole) || 'customer';
  // Centralized permission resolution: Only super_admin has unconditional full access.
  // Admin and sub_admin permissions are strictly loaded from server-side permissions_json.
  const permissions = resolveUserPermissions(role, dbUser.permissions_json);
  const legacyPermissions = generateLegacyPermissionFlags(permissions);

  return {
    auth: {
      tokenUser,
      dbUser,
      role,
      permissions,
      legacyPermissions,
    },
  };
}

/**
 * Checks whether the authenticated user has a specific permission
 */
function hasPermission(
  auth: AuthContext,
  permKey: PermissionKey | keyof AdminPermissions | string
): boolean {
  if (auth.role === 'super_admin') return true;
  if (auth.role === 'customer' || !auth.role) return false;

  const keyStr = String(permKey);
  if (isSuperAdminOnlyPermission(keyStr as any)) {
    return false; // Permanently Super Admin-only!
  }

  // Cross-alias check for sensitive financial permissions
  if (keyStr === 'product.buying_price' || keyStr === 'product.view_buying_price') {
    return Boolean(auth.permissions?.['product.view_buying_price'] || auth.permissions?.['product.buying_price']);
  }
  if (keyStr === 'report.profit' || keyStr === 'product.view_profit') {
    return Boolean(auth.permissions?.['report.profit'] || auth.permissions?.['product.view_profit']);
  }

  // Granular PermissionKey check
  if (isValidPermissionKey(keyStr)) {
    return Boolean(auth.permissions && auth.permissions[keyStr as PermissionKey]);
  }

  // Backward-compatible legacy flag check
  if (auth.legacyPermissions && permKey in auth.legacyPermissions) {
    return Boolean((auth.legacyPermissions as any)[permKey]);
  }

  return false;
}

function requirePermission(
  auth: AuthContext,
  permKey: PermissionKey | keyof AdminPermissions | string
): Response | null {
  if (!hasPermission(auth, permKey)) {
    return jsonResponse(
      {
        success: false,
        error: `Forbidden: You do not have the "${permKey}" permission required to perform this action.`,
      },
      403
    );
  }
  return null;
}

function requireSuperAdmin(auth: AuthContext): Response | null {
  if (auth.role !== 'super_admin') {
    return jsonResponse(
      {
        success: false,
        error: 'Forbidden: Master Super Administrator access required.',
      },
      403
    );
  }
  return null;
}

/**
 * Masks webhook secrets in courier webhook configs so credentials are never exposed to browser
 */
export function maskCourierWebhooks(webhooks: any[]): any[] {
  if (!Array.isArray(webhooks)) return [];
  return webhooks.map((w) => {
    if (!w || typeof w !== 'object') return w;
    const hasSec = Boolean(w.secret || w.hasSecret);
    return {
      ...w,
      secret: hasSec ? '••••••••' : undefined,
      hasSecret: hasSec,
    };
  });
}

/**
 * Masks internal secrets in settings for authorized admin responses
 */
function maskSettings(
  settings: StoreSettings,
  isAuthenticatedAdmin: boolean,
  canViewCourierCredentials: boolean = false,
  env?: any
): StoreSettings {
  if (!isAuthenticatedAdmin) {
    // Return only safe customer-facing public properties
    return {
      siteName: settings.siteName,
      logoUrl: settings.logoUrl,
      faviconUrl: settings.faviconUrl,
      bannerUrl: settings.bannerUrl,
      phone: settings.phone,
      address: settings.address,
      insideDhakaFee: settings.insideDhakaFee,
      outsideDhakaFee: settings.outsideDhakaFee,
      announcementText: settings.announcementText,
      topBarAnnouncementText: settings.topBarAnnouncementText,
      bannerHeadline: settings.bannerHeadline,
      bannerSubtext: settings.bannerSubtext,
      currencySymbol: settings.currencySymbol,
      dbblBank: settings.dbblBank,
      antiSpamEnabled: settings.antiSpamEnabled,
      maxOrdersPerPhonePerDay: settings.maxOrdersPerPhonePerDay,
      trackingEnabled: settings.trackingEnabled,
      fbPixelId: settings.fbPixelId,
      fbTestEventCode: settings.fbTestEventCode,
      tiktokPixelId: settings.tiktokPixelId,
      tiktokTestEventCode: settings.tiktokTestEventCode,
      gtmId: settings.gtmId,
      advancedMatchingEnabled: settings.advancedMatchingEnabled,
      trackingDebugMode: settings.trackingDebugMode,
      sliderAspectRatio: settings.sliderAspectRatio,
      bannerFitMode: settings.bannerFitMode,
      footer: settings.footer,
      // Internal courier credentials strictly omitted for customers
    };
  }

  // For authenticated admins: mask secrets so credentials are never exposed in browser
  const safeAdminSettings: StoreSettings = {
    ...settings,
  };
  if (canViewCourierCredentials) {
    const hasSteadfastConfigured = Boolean(
      (env && env.STEADFAST_API_KEY && env.STEADFAST_API_KEY.trim().length > 0) ||
      (typeof settings.steadfastApiKey === 'string' && settings.steadfastApiKey.trim().length > 0)
    );
    safeAdminSettings.steadfastApiKey = hasSteadfastConfigured ? '••••••••' : '';
    safeAdminSettings.steadfastSecretKey = hasSteadfastConfigured ? '••••••••' : '';
    if (Array.isArray(settings.courierWebhooks)) {
      safeAdminSettings.courierWebhooks = maskCourierWebhooks(settings.courierWebhooks);
    }
  } else {
    delete (safeAdminSettings as any).steadfastApiKey;
    delete (safeAdminSettings as any).steadfastSecretKey;
    delete (safeAdminSettings as any).courierWebhooks;
  }
  return safeAdminSettings;
}

/**
 * Safely extracts an environment variable from Cloudflare Workers/Pages runtime bindings,
 * global scope, or process environment without throwing.
 */
export function getEnvVar(env: any, key: string, fallback: string = ''): string {
  if (env && typeof env === 'object') {
    if (typeof env[key] === 'string' && env[key].trim()) {
      return env[key].trim();
    }
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(env)) {
      if (k.toLowerCase() === lowerKey && typeof v === 'string' && v.trim()) {
        return v.trim();
      }
    }
  }
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as any;
    if (typeof g[key] === 'string' && g[key].trim()) {
      return g[key].trim();
    }
    if (g.env && typeof g.env === 'object' && typeof g.env[key] === 'string' && g.env[key].trim()) {
      return g.env[key].trim();
    }
  }
  if (typeof process !== 'undefined' && process.env) {
    const val = process.env[key];
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }
  return fallback;
}

/**
 * Formats sender address with display name and verified domain email.
 */
export function formatResendFromEmail(rawFrom: string): string {
  const trimmed = rawFrom.trim();
  if (!trimmed) return 'Rongodhonu Trade <support@rongdhonutrade.com>';
  if (trimmed.includes('<') && trimmed.includes('>')) {
    return trimmed;
  }
  return `Rongodhonu Trade <${trimmed}>`;
}

/**
 * Resolves authoritative APP_URL for absolute reset links and email callbacks.
 */
export function resolveAppUrl(env: any, requestUrl?: string): string {
  let appUrl = getEnvVar(env, 'APP_URL', '').replace(/\/+$/, '');
  if (appUrl) {
    if (!appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
      appUrl = `https://${appUrl}`;
    }
    return appUrl;
  }
  if (requestUrl) {
    try {
      const parsed = new URL(requestUrl);
      if (parsed.hostname !== 'localhost' && !parsed.hostname.startsWith('127.')) {
        return parsed.origin;
      }
    } catch {}
  }
  return 'https://rongdhonutrade.com';
}

/**
 * Sends a password reset email via the Resend API.
 * The Resend API key is read STRICTLY from env.RESEND_API_KEY with robust runtime fallback.
 * The sender is configurable via env.RESEND_FROM_EMAIL.
 * No secrets, tokens, or hashes are logged.
 */
async function sendPasswordResetEmail(
  env: Env,
  toEmail: string,
  resetUrl: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  // Read Resend API key strictly from env.RESEND_API_KEY with runtime environment bindings
  const apiKey = (env?.RESEND_API_KEY || getEnvVar(env, 'RESEND_API_KEY')).trim();
  if (!apiKey) {
    console.error('[Resend Error] RESEND_API_KEY is not configured in Cloudflare environment secrets.');
    return { success: false, error: 'Email service is not configured.' };
  }

  const rawFrom = (env?.RESEND_FROM_EMAIL || getEnvVar(env, 'RESEND_FROM_EMAIL', 'support@rongdhonutrade.com')).trim();
  const fromEmail = formatResendFromEmail(rawFrom);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your Rongodhonu Trade password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
          <tr>
            <td style="height: 6px; background: linear-gradient(135deg, #ef4444 0%, #f59e0b 25%, #10b981 50%, #0ea5e9 75%, #8b5cf6 100%);"></td>
          </tr>
          <tr>
            <td style="padding: 36px 32px;">
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">
                Rongodhonu Trade
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b;">
                রঙধনু ট্রেড • Account Security
              </p>

              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #334155;">
                Hello,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #334155;">
                You requested a password reset for your Rongodhonu Trade account.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #334155;">
                Click the button below to create a new password.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center" style="border-radius: 12px; background: #0f172a;">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 12px; background: #0f172a;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 12px 0; font-size: 13px; color: #e11d48; font-weight: 600;">
                This reset link expires in 60 minutes.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 13px; line-height: 20px; color: #64748b;">
                If you did not request this password reset, you can safely ignore this email.
              </p>

              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;">

              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #94a3b8;">
                If the button above does not work, copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color: #0284c7; word-break: break-all; text-decoration: underline;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px; background: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                © ${new Date().getFullYear()} Rongodhonu Trade. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Rongodhonu Trade\n\nYou requested a password reset for your Rongodhonu Trade account.\n\nClick the button below to create a new password.\n\nReset Password: ${resetUrl}\n\nThis reset link expires in 60 minutes.\n\nIf you did not request this password reset, you can safely ignore this email.\n`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: 'Reset your Rongodhonu Trade password',
        html,
        text,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      console.error('[Auth Diagnostics] resend_failure: Resend API rejected request', {
        status: res.status,
        name: data?.name,
        message: data?.message || 'Resend API returned non-2xx status',
      });
      return {
        success: false,
        error: 'Failed to send password reset email.',
      };
    }

    console.log(`[Auth Diagnostics] resend_success: Email successfully dispatched via Resend, id: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[Auth Diagnostics] resend_failure: Network error communicating with Resend API', err?.message || err);
    return { success: false, error: 'Network error connecting to email service.' };
  }
}

/**
 * Handles all /api/* requests inside Cloudflare Worker or Cloudflare Pages Functions
 */
export async function handleApiRequest(request: Request, env: Env, ctx?: any): Promise<Response> {
  activeApiRequest = request;
  activeEnv = env;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // Handle CORS preflight with restricted origins and credentials
  if (method === 'OPTIONS') {
    const cors = getCorsHeaders(request, env);
    const origin = request.headers.get('Origin')?.trim();
    if (origin && !cors['Access-Control-Allow-Origin']) {
      // Untrusted cross-origin preflight: reject safely
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: Origin not allowed by CORS policy.' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Vary': 'Origin',
        },
      });
    }
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // ==========================================
  // 0. HEALTH CHECK (Public production health check: minimal information)
  // ==========================================
  if (path === '/api/health' || path === '/api/status') {
    if (!env.DB) {
      return jsonResponse({ status: 'error' }, 503);
    }

    try {
      const ping = await env.DB.prepare('SELECT 1 as alive').first<{ alive: number }>();
      if (ping?.alive === 1) {
        return jsonResponse({ status: 'ok' }, 200);
      }
      return jsonResponse({ status: 'error' }, 503);
    } catch {
      return jsonResponse({ status: 'error' }, 503);
    }
  }

  // ==========================================
  // 0B. PROTECTED ADMIN DIAGNOSTICS & SYSTEM STATUS
  // ==========================================
  if (path === '/api/admin/health' || path === '/api/admin/diagnostics') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const canView = auth!.role === 'super_admin' || hasPermission(auth!, 'settings.manage');
    if (!canView) {
      return jsonResponse(
        { success: false, error: 'Forbidden: Admin diagnostics require settings.manage permission.', requiredPermission: 'settings.manage' },
        403
      );
    }

    if (!env.DB) {
      return jsonResponse(
        {
          status: 'error',
          databaseBinding: 'missing',
          timestamp: new Date().toISOString(),
        },
        503
      );
    }

    try {
      const ping = await env.DB.prepare('SELECT 1 as alive').first<{ alive: number }>();
      const { existing, missing } = await checkTablesExist(env.DB);
      const isHealthy = ping?.alive === 1 && missing.length === 0;

      return jsonResponse(
        {
          status: isHealthy ? 'ok' : 'degraded',
          database: ping?.alive === 1 ? 'ok' : 'unresponsive',
          databaseBinding: 'present',
          tablesCount: existing.length,
          isSchemaReady: missing.length === 0,
          timestamp: new Date().toISOString(),
        },
        isHealthy ? 200 : 500
      );
    } catch {
      return jsonResponse(
        {
          status: 'error',
          databaseBinding: 'present',
          databaseQuery: 'failed',
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }

  // Check if D1 database binding exists for data routes
  if (!env.DB) {
    return jsonResponse(
      { success: false, error: 'Database service is currently unavailable.' },
      503
    );
  }

  // ==========================================
  // AUTHENTICATION ROUTES (Authoritative D1 + PBKDF2)
  // ==========================================
  if (path === '/api/auth/login' && method === 'POST') {
    try {
      const body = (await request.json().catch(() => ({}))) as any;
      const identifier = (body.usernameOrEmail || body.email || body.username || '').trim();
      const password = (body.password || '').trim();

      if (!identifier || !password) {
        return jsonResponse(
          { success: false, error: 'Email/Username and password are required.' },
          400
        );
      }

      // Brute-force rate limit protection (distributed D1 + memory)
      const isDev = isDevEnvironment(env);
      const clientIp = getClientIp(request, isDev);
      const rateKey = `login:${clientIp}:${identifier.toLowerCase()}`;
      const rateCheck = await checkRateLimit(rateKey, 5, 900, env.DB);
      if (!rateCheck.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Too many failed login attempts. Please wait ${rateCheck.remainingSeconds || 300} seconds before trying again.`,
          },
          429
        );
      }

      // Check D1 for matching user
      let userRow = await getUserByEmailOrUsername(env.DB, identifier);

      // Deterministic master admin resolution for username "admin"
      if (!userRow && identifier.toLowerCase() === 'admin') {
        const defaultSuper = getSuperAdminEmails(env)[0];
        if (defaultSuper) {
          userRow = await getUserByEmailOrUsername(env.DB, defaultSuper);
        }
      }

      // Timing Attack Protection: Use fixed dummy PBKDF2 hash so non-existent account verification
      // takes the identical computational time (100,000 PBKDF2 iterations) as wrong-password verification.
      const DUMMY_PBKDF2_HASH = 'pbkdf2:100000:0123456789abcdef0123456789abcdef:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      if (!userRow) {
        await verifyPassword(password, DUMMY_PBKDF2_HASH);
        await recordFailedAttempt(rateKey, 5, 900, env.DB);
        return jsonResponse({ success: false, error: 'Invalid email/username or password.' }, 401);
      }

      // Verify password strictly using PBKDF2 Web Crypto against D1 stored hash
      const isValid = await verifyPassword(password, userRow.password || '');
      if (!isValid) {
        await recordFailedAttempt(rateKey, 5, 900, env.DB);
        return jsonResponse({ success: false, error: 'Invalid email/username or password.' }, 401);
      }

      // Clear failed rate limit on successful credentials
      await clearFailedAttempts(rateKey, env.DB);

      // If user had plaintext password in D1, upgrade to PBKDF2 hash immediately and refresh userRow
      if (userRow.password && !userRow.password.startsWith('pbkdf2:')) {
        await updateUserPasswordInD1(env.DB, userRow.id, password);
        userRow = (await getUserByEmailOrUsername(env.DB, userRow.id)) || userRow;
      }

      const secret = await resolveAuthSecret(env);
      const token = await createAuthToken(
        {
          userId: userRow.id,
          email: userRow.email,
          role: userRow.role,
          pwdSig: await computePasswordSignature(userRow.password || ''),
        },
        secret
      );

      const sanitizedUser = rowToUser(userRow);
      return jsonResponse(
        {
          success: true,
          message: 'Authentication successful',
          user: sanitizedUser,
        },
        200,
        {
          'Set-Cookie': buildAuthCookieHeader(request, token, 7 * 86400),
        }
      );
    } catch (err: any) {
      console.error('Login error:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  // ==========================================
  // AUTHENTICATION: PUBLIC CUSTOMER REGISTRATION
  // ==========================================
  if (path === '/api/auth/register' && method === 'POST') {
    try {
      const isDev = isDevEnvironment(env);
      const clientIp = getClientIp(request, isDev);
      const body = (await request.json().catch(() => ({}))) as any;
      const name = (body.name || '').trim();
      const email = (body.email || '').toLowerCase().trim();
      const password = (body.password || '').trim();
      const phone = (body.phone || '').trim();

      // Multi-layer rate limit keys:
      // 1. IP attempt limiter: 10 registration attempts per 15 minutes
      // 2. IP success limiter: 5 successful account creations per 1 hour
      // 3. Email attempt limiter: 5 registration attempts per 15 minutes
      const regIpKey = `reg:ip:${clientIp}`;
      const regIpSuccessKey = `reg:ip:success:${clientIp}`;
      const regEmailKey = email ? `reg:email:${email}` : `reg:empty-email:${clientIp}`;

      const [ipCheck, ipSuccessCheck, emailCheck] = await Promise.all([
        checkRateLimit(regIpKey, 10, 900, env.DB),
        checkRateLimit(regIpSuccessKey, 5, 3600, env.DB),
        checkRateLimit(regEmailKey, 5, 900, env.DB),
      ]);

      if (!ipCheck.allowed || !ipSuccessCheck.allowed || !emailCheck.allowed) {
        return jsonResponse(
          {
            success: false,
            error: 'Too many registration requests. Please wait a few minutes before trying again.',
          },
          429,
          {
            'Retry-After': '900',
          }
        );
      }

      // CRITICAL: Consume the attempt slot immediately across both IP and Email.
      // This prevents bypass through repeated failures, input probing, or racing requests.
      await Promise.all([
        recordFailedAttempt(regIpKey, 10, 900, env.DB),
        email ? recordFailedAttempt(regEmailKey, 5, 900, env.DB) : Promise.resolve(),
      ]);

      if (!name) {
        return jsonResponse({ success: false, error: 'Full name is required.' }, 400);
      }
      if (!email || !email.includes('@')) {
        return jsonResponse({ success: false, error: 'Valid email address is required.' }, 400);
      }
      if (!password || password.length < 6) {
        return jsonResponse({ success: false, error: 'Password must be at least 6 characters long.' }, 400);
      }

      // Check D1 for existing user
      const existingUser = await getUserByEmailOrUsername(env.DB, email);
      if (existingUser) {
        return jsonResponse({ success: false, error: 'An account with this email address already exists. Please log in.' }, 409);
      }

      // Strictly register as a customer role with no admin permissions
      const newCustomer = await insertUser(env.DB, {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        email,
        password,
        role: 'customer',
        permissions: null,
        phone,
      });

      // Record successful registration against IP creation limit
      await recordFailedAttempt(regIpSuccessKey, 5, 3600, env.DB);

      // Retrieve user row to obtain password hash signature for token
      const createdRow = await getUserByEmailOrUsername(env.DB, email);
      const secret = await resolveAuthSecret(env);
      const token = await createAuthToken(
        {
          userId: newCustomer.id,
          email: newCustomer.email,
          role: 'customer',
          pwdSig: await computePasswordSignature(createdRow?.password || ''),
        },
        secret
      );

      return jsonResponse(
        {
          success: true,
          message: 'Account registered successfully.',
          user: newCustomer,
        },
        201,
        {
          'Set-Cookie': buildAuthCookieHeader(request, token, 7 * 86400),
        }
      );
    } catch (err: any) {
      return jsonResponse({ success: false, error: 'Registration failed. Please try again.' }, 500);
    }
  }

  // ==========================================
  // AUTHENTICATION: FORGOT PASSWORD (Resend Integration & Hashed Reset Tokens)
  // ==========================================
  if (path === '/api/auth/forgot-password' && method === 'POST') {
    try {
      const body = (await request.json().catch(() => ({}))) as any;
      const rawEmail = String(body?.email || '').trim().toLowerCase();

      // Format validation
      if (!rawEmail || !rawEmail.includes('@') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return jsonResponse(
          {
            success: false,
            status: 'INVALID_EMAIL',
            message: 'Please enter a valid email address.',
          },
          400
        );
      }

      // Server-side brute-force & enumeration rate limiting by IP, email, and IP+email combination
      const isDev = isDevEnvironment(env);
      const clientIp = getClientIp(request, isDev);
      const ipRateKey = `pwd-reset-ip:${clientIp}`;
      const emailRateKey = `pwd-reset-email:${rawEmail}`;
      const comboRateKey = `pwd-reset:${clientIp}:${rawEmail}`;

      const [ipRateCheck, emailRateCheck, comboRateCheck] = await Promise.all([
        checkRateLimit(ipRateKey, 10, 900, env.DB),
        checkRateLimit(emailRateKey, 5, 900, env.DB),
        checkRateLimit(comboRateKey, 5, 900, env.DB),
      ]);

      if (!ipRateCheck.allowed || !emailRateCheck.allowed || !comboRateCheck.allowed) {
        return jsonResponse(
          {
            success: false,
            status: 'RATE_LIMITED',
            message: 'Too many password reset requests. Please try again later.',
          },
          429
        );
      }

      await Promise.all([
        recordFailedAttempt(ipRateKey, 10, 900, env.DB),
        recordFailedAttempt(emailRateKey, 5, 900, env.DB),
        recordFailedAttempt(comboRateKey, 5, 900, env.DB),
      ]);

      const startTime = Date.now();

      // Look up existing user in D1 using parameterized case-insensitive email query
      const user = env.DB ? await getUserByEmail(env.DB, rawEmail) : null;

      // Generic anti-enumeration response string: identical whether account exists or not
      const genericSuccessResponse = {
        success: true,
        status: 'RESET_EMAIL_SENT',
        message: 'If the account exists, password reset instructions have been sent.',
      };

      if (!user || !user.email) {
        // Perform simulated cryptographic digest to prevent timing analysis
        // Case 2 — Account does NOT exist: Perform matched dummy operations to eliminate timing analysis
        const dummyTokenBytes = new Uint8Array(32);
        crypto.getRandomValues(dummyTokenBytes);
        const dummyRawToken = bufferToHex(dummyTokenBytes.buffer);
        const dummyHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dummyRawToken));
        const dummyTokenHash = bufferToHex(dummyHashBuffer);
        const dummyAppUrl = resolveAppUrl(env, request.url);
        const dummyResetUrl = `${dummyAppUrl}/reset-password?token=${encodeURIComponent(dummyRawToken)}`;
        void dummyResetUrl;

        if (env.DB) {
          try {
            await env.DB
              .prepare('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL')
              .bind(Date.now(), '__dummy_nonexistent_user__')
              .run();
            await env.DB
              .prepare('SELECT id FROM password_reset_tokens WHERE id = ? LIMIT 1')
              .bind(dummyTokenHash)
              .first();
          } catch {}
        }
      } else {
        // Case 1 — Account exists
        // 1. Generate cryptographically secure random token (32 bytes = 64 hex characters)
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const rawToken = bufferToHex(tokenBytes.buffer);

        // 2. Store ONLY the SHA-256 hash of the reset token in D1 (never plaintext)
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
        const tokenHash = bufferToHex(hashBuffer);

        // 3. Short expiration time: 60 minutes
        const expiresAt = Date.now() + 60 * 60 * 1000;

        if (env.DB) {
          await createPasswordResetToken(env.DB, user.id, tokenHash, expiresAt);
        }

        // 4. Give raw token ONLY to the email-link generation logic using production APP_URL
        const appUrl = resolveAppUrl(env, request.url);
        const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

        // 5. Send password-reset email to the exact registered email address in the background
        const emailPromise = sendPasswordResetEmail(env, user.email, resetUrl).catch((err) => {
          console.error('[Auth Diagnostics] resend_failure: Failed to dispatch password reset email.', err);
        });

        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(emailPromise);
        } else {
          void emailPromise;
        }
      }

      // Equalize response timing across existing and non-existing accounts
      const TARGET_RESET_TIME_MS = 100;
      const elapsed = Date.now() - startTime;
      const remainingDelay = TARGET_RESET_TIME_MS - elapsed;
      if (remainingDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingDelay));
      }

      return jsonResponse(genericSuccessResponse, 200);
    } catch {
      console.error('[Forgot Password Error] Internal error processing password reset request.');
      return jsonResponse(
        {
          success: false,
          status: 'INTERNAL_ERROR',
          message: 'Unable to process password reset request right now. Please try again later.',
        },
        500
      );
    }
  }

  // ==========================================
  // AUTHENTICATION: RESET PASSWORD (Token Hash Verification & PBKDF2 Hashing)
  // ==========================================
  if (path === '/api/auth/reset-password' && method === 'POST') {
    try {
      const body = (await request.json().catch(() => ({}))) as any;
      const rawToken = String(body?.token || '').trim();
      const newPassword = String(body?.newPassword || '').trim();

      if (!rawToken) {
        return jsonResponse(
          {
            success: false,
            status: 'INVALID_TOKEN',
            message: 'Password reset token is required.',
            error: 'Password reset token is required.',
          },
          400
        );
      }

      if (!newPassword || newPassword.length < 6) {
        return jsonResponse(
          {
            success: false,
            status: 'INVALID_PASSWORD',
            message: 'New password must be at least 6 characters long.',
            error: 'New password must be at least 6 characters long.',
          },
          400
        );
      }

      // Rate limit token verification attempts by IP
      const isDev = isDevEnvironment(env);
      const clientIp = getClientIp(request, isDev);
      const verifyRateKey = `pwd-reset-verify:${clientIp}`;
      const verifyRateCheck = await checkRateLimit(verifyRateKey, 10, 900, env.DB);
      if (!verifyRateCheck.allowed) {
        return jsonResponse(
          {
            success: false,
            status: 'RATE_LIMITED',
            message: 'Too many password reset attempts. Please try again later.',
            error: 'Too many password reset attempts. Please try again later.',
          },
          429
        );
      }

      // Hash the submitted token using SHA-256 to compare with stored token hash
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
      const tokenHash = bufferToHex(hashBuffer);

      // Check existing reset token before claiming
      const existingToken = await getPasswordResetToken(env.DB, tokenHash);
      const now = Date.now();
      if (!existingToken || existingToken.used_at != null || existingToken.expires_at <= now) {
        await recordFailedAttempt(verifyRateKey, 10, 900, env.DB);
        return jsonResponse(
          {
            success: false,
            status: 'INVALID_TOKEN',
            message: 'Invalid or expired password reset link. Please request a new one.',
            error: 'Invalid or expired password reset link. Please request a new one.',
          },
          400
        );
      }

      // Verify associated user account exists in D1 before claiming token
      const targetUser = await env.DB.prepare('SELECT id, email, role FROM users WHERE id = ?').bind(existingToken.user_id).first<UserRow>();
      if (!targetUser) {
        return jsonResponse(
          {
            success: false,
            status: 'INVALID_TOKEN',
            message: 'Invalid or expired password reset link. Please request a new one.',
            error: 'Invalid or expired password reset link. Please request a new one.',
          },
          400
        );
      }

      // Atomic claim: Claim the reset token in a single atomic SQL operation.
      // Eliminates the race condition where concurrent requests could use the same token.
      const claimResult = await claimPasswordResetToken(env.DB, tokenHash);
      if (!claimResult.success || !claimResult.tokenRecord) {
        await recordFailedAttempt(verifyRateKey, 10, 900, env.DB);
        return jsonResponse(
          {
            success: false,
            status: 'INVALID_TOKEN',
            message: 'Invalid or expired password reset link. Please request a new one.',
            error: 'Invalid or expired password reset link. Please request a new one.',
          },
          400
        );
      }

      // Update password using authoritative updateUserPasswordInD1 (which uses PBKDF2 hashPassword)
      const updateSuccess = await updateUserPasswordInD1(env.DB, targetUser.id, newPassword);
      if (!updateSuccess) {
        // Avoid consuming the reset token unnecessarily if the password update cannot be completed in D1
        await unclaimPasswordResetToken(env.DB, claimResult.tokenRecord.id);
        return jsonResponse(
          {
            success: false,
            status: 'UPDATE_FAILED',
            message: 'Failed to update password in database. Please try again.',
            error: 'Failed to update password in database. Please try again.',
          },
          500
        );
      }

      await clearFailedAttempts(verifyRateKey, env.DB);

      return jsonResponse({
        success: true,
        status: 'PASSWORD_RESET_SUCCESS',
        message: 'Your password has been successfully reset. You can now log in with your new password.',
      });
    } catch {
      return jsonResponse(
        {
          success: false,
          status: 'INTERNAL_ERROR',
          message: 'Failed to reset password. Please try again later.',
          error: 'Failed to reset password. Please try again later.',
        },
        500
      );
    }
  }

  if (path === '/api/auth/me' && method === 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    return jsonResponse({ success: true, user: rowToUser(auth!.dbUser) });
  }

  if (path === '/api/auth/change-password' && method === 'POST') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;

    const body = (await request.json().catch(() => ({}))) as any;
    const newPassword = (body.newPassword || '').trim();
    const currentPassword = (body.currentPassword || body.oldPassword || '').trim();

    if (!newPassword || newPassword.length < 6) {
      return jsonResponse(
        { success: false, error: 'New password must be at least 6 characters long.' },
        400
      );
    }

    if (!currentPassword) {
      return jsonResponse(
        { success: false, error: 'Current password is required to verify your identity.' },
        400
      );
    }

    // Verify current password on the server against D1 stored hash
    const isCurrentValid = await verifyPassword(currentPassword, auth!.dbUser.password || '');
    if (!isCurrentValid) {
      return jsonResponse(
        { success: false, error: 'Current password does not match. Please verify and try again.' },
        400
      );
    }

    // Update password in Cloudflare D1 with fresh PBKDF2 hash
    const updateSuccess = await updateUserPasswordInD1(env.DB, auth!.dbUser.id, newPassword);
    if (!updateSuccess) {
      return jsonResponse(
        { success: false, error: 'Failed to update password in database. Please try again.' },
        500
      );
    }

    // Fetch updated user to obtain fresh password signature
    const updatedUserRow = await getUserByEmailOrUsername(env.DB, auth!.dbUser.email);
    const newPwdSig = await computePasswordSignature(updatedUserRow?.password || '');

    // Issue fresh token so the current session continues uninterrupted
    const secret = await resolveAuthSecret(env);
    const freshToken = await createAuthToken(
      {
        userId: auth!.dbUser.id,
        email: auth!.dbUser.email,
        role: auth!.dbUser.role,
        pwdSig: newPwdSig,
      },
      secret
    );

    return jsonResponse(
      {
        success: true,
        message: 'Password updated successfully.',
      },
      200,
      {
        'Set-Cookie': buildAuthCookieHeader(request, freshToken, 7 * 86400),
      }
    );
  }

  if ((path === '/api/auth/logout' || path === '/api/admin/logout') && method === 'POST') {
    return jsonResponse(
      { success: true, message: 'Logged out successfully.' },
      200,
      {
        'Set-Cookie': buildAuthCookieHeader(request, '', 0),
      }
    );
  }

  // ==========================================
  // PERMISSION MANAGEMENT & METADATA ROUTES (Super Admin Only)
  // ==========================================
  if (path === '/api/admin/permissions/metadata' && method === 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    if (auth!.role === 'customer') {
      return jsonResponse({ success: false, error: 'Forbidden: Customers cannot view permission metadata.' }, 403);
    }
    return jsonResponse({
      success: true,
      metadata: PERMISSIONS_METADATA,
      keys: PERMISSION_KEYS,
      superAdminOnly: Array.from(SUPER_ADMIN_ONLY_PERMISSIONS),
    });
  }

  const permGetMatch = path.match(/^\/api\/(?:admin\/)?users\/([^/]+)\/permissions\/?$/);
  if (permGetMatch && method === 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;

    const targetUserId = decodeURIComponent(permGetMatch[1]);
    const isSelf = auth!.dbUser.id === targetUserId;
    const canView = isSelf || auth!.role === 'super_admin' || hasPermission(auth!, 'permission.manage') || hasPermission(auth!, 'user.view');

    if (!canView) {
      return jsonResponse({ success: false, error: 'Forbidden: Insufficient permissions to view user permissions.' }, 403);
    }

    const targetUserRow = await env.DB.prepare('SELECT id, name, email, role, permissions_json FROM users WHERE id = ?')
      .bind(targetUserId)
      .first<UserRow>();

    if (!targetUserRow) {
      return jsonResponse({ success: false, error: 'User not found.' }, 404);
    }

    const effectivePermissions = resolveUserPermissions(targetUserRow.role, targetUserRow.permissions_json);
    return jsonResponse({
      success: true,
      userId: targetUserId,
      role: targetUserRow.role,
      permissions: effectivePermissions,
    });
  }

  const permUpdateMatch = path.match(/^\/api\/(?:admin\/)?users\/([^/]+)\/permissions\/?$/);
  if (permUpdateMatch && method !== 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;

    // Privilege escalation protection: ONLY super_admin can manage permissions!
    if (auth!.role !== 'super_admin') {
      return jsonResponse(
        { success: false, error: 'Forbidden: Only Super Administrator can modify permissions.' },
        403
      );
    }

    if (method !== 'PUT' && method !== 'PATCH') {
      return jsonResponse({ success: false, error: 'Method not allowed.' }, 405);
    }

    const targetUserId = decodeURIComponent(permUpdateMatch[1]);
    const targetUserRow = await env.DB.prepare('SELECT id, name, email, role, permissions_json FROM users WHERE id = ?')
      .bind(targetUserId)
      .first<UserRow>();

    if (!targetUserRow) {
      return jsonResponse({ success: false, error: 'Target user not found.' }, 404);
    }

    // Target user protection: super_admin permissions cannot be modified via this API!
    if (isSuperAdminUserServer(targetUserRow, env) || targetUserRow.role === 'super_admin') {
      return jsonResponse(
        { success: false, error: 'Forbidden: Super Administrator permissions cannot be modified.' },
        403
      );
    }

    // Verify target role is admin or sub_admin
    if (targetUserRow.role !== 'admin' && targetUserRow.role !== 'sub_admin') {
      return jsonResponse(
        { success: false, error: 'Forbidden: Target user must have role "admin" or "sub_admin" to configure admin permissions.' },
        403
      );
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const permissionsInput = body.permissions || body;

    if (!permissionsInput || typeof permissionsInput !== 'object') {
      return jsonResponse({ success: false, error: 'Invalid permissions payload: expected a permissions object.' }, 400);
    }

    // Validate every permission key against central registry
    for (const [key, val] of Object.entries(permissionsInput)) {
      if (!isValidPermissionKey(key)) {
        return jsonResponse(
          { success: false, error: `Bad Request: Unknown permission key "${key}".` },
          400
        );
      }
      if (Boolean(val) && isSuperAdminOnlyPermission(key)) {
        return jsonResponse(
          { success: false, error: `Forbidden: Permission "${key}" is permanently Super Admin-only and cannot be granted to ${targetUserRow.role}.` },
          403
        );
      }
    }

    // Parse existing permissions
    let existingPermissions: Record<string, boolean> = {};
    if (targetUserRow.permissions_json) {
      try {
        existingPermissions = JSON.parse(targetUserRow.permissions_json);
      } catch {}
    }

    // Build clean updated permissions
    const updatedPermissions: Record<string, boolean> = { ...existingPermissions };
    for (const [key, val] of Object.entries(permissionsInput)) {
      if (isValidPermissionKey(key)) {
        if (val) {
          updatedPermissions[key] = true;
        } else {
          delete updatedPermissions[key];
        }
      }
    }

    const permissionsJson = JSON.stringify(updatedPermissions);
    await env.DB.prepare('UPDATE users SET permissions_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(permissionsJson, targetUserId)
      .run();

    // Record audit event
    await insertAuditLogInD1(env.DB, {
      actorId: auth!.dbUser.id,
      actorEmail: auth!.dbUser.email,
      actorRole: auth!.role,
      action: 'permission.update',
      targetId: targetUserId,
      targetType: 'user',
      details: { changedPermissions: permissionsInput },
    });

    const freshUserRow = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetUserId).first<UserRow>();
    return jsonResponse({
      success: true,
      message: `Permissions updated successfully for user "${targetUserRow.name}".`,
      permissions: resolveUserPermissions(targetUserRow.role, permissionsJson),
      user: freshUserRow ? rowToUser(freshUserRow) : null,
    });
  }

  // ==========================================
  // AUDIT LOGS ROUTE
  // ==========================================
  if (path === '/api/admin/audit-logs' && method === 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const permErr = requirePermission(auth!, 'audit_log.view');
    if (permErr) return permErr;

    const pageParam = url.searchParams.get('page');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    const DEFAULT_LIMIT = 50;
    const MAX_LIMIT = 200;

    let parsedLimit = DEFAULT_LIMIT;
    if (limitParam !== null) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed)) {
        parsedLimit = Math.min(MAX_LIMIT, Math.max(1, parsed));
      }
    }

    let page = 1;
    let offset = 0;
    if (pageParam !== null) {
      const parsedPage = parseInt(pageParam, 10);
      if (!isNaN(parsedPage) && parsedPage >= 1) {
        page = parsedPage;
        offset = (page - 1) * parsedLimit;
      }
    } else if (offsetParam !== null) {
      const parsedOffset = parseInt(offsetParam, 10);
      if (!isNaN(parsedOffset) && parsedOffset >= 0) {
        offset = parsedOffset;
        page = Math.floor(offset / parsedLimit) + 1;
      }
    }

    const paginated = await getPaginatedAuditLogsFromD1(env.DB, {
      page,
      limit: parsedLimit,
      offset,
    });

    return jsonResponse({
      success: true,
      count: paginated.logs.length,
      total: paginated.total,
      page: paginated.page,
      limit: paginated.limit,
      totalPages: paginated.totalPages,
      logs: paginated.logs,
    });
  }

  // ==========================================
  // 0. OPTIMIZED PUBLIC HOMEPAGE CONSOLIDATED ROUTE
  // ==========================================
  if (path === '/api/store/homepage' && (method === 'GET' || method === 'HEAD')) {
    try {
      // Single-batch fetch of store settings, categories, and sliders
      const { settings: rawSettings, categories, sliders } = await getHomepageMetadata(env.DB);

      const safeSettings = maskSettings(rawSettings, false, false);
      const activeSliders = sliders;

      const categoryIds = (categories || []).map((c) => c.id);
      const homepageData = await getHomepageProducts(env.DB, categoryIds, {
        perCategoryLimit: 6,
        featuredLimit: 8,
      });

      const sanitizePublic = (p: any) =>
        sanitizeProductForRole(p, { isSuperAdmin: false, canViewBuyingPrice: false, canViewProfit: false });

      const safeCategoryProducts: Record<string, any[]> = {};
      for (const [catId, prods] of Object.entries(homepageData.categoryProducts)) {
        safeCategoryProducts[catId] = prods.map(sanitizePublic);
      }

      const safeFeaturedProducts = homepageData.featuredProducts.map(sanitizePublic);
      const safeUniqueProducts = homepageData.uniqueProducts.map(sanitizePublic);

      return jsonResponse(
        {
          success: true,
          settings: safeSettings,
          categories,
          slides: activeSliders,
          categoryProducts: safeCategoryProducts,
          featuredProducts: safeFeaturedProducts,
          products: safeUniqueProducts,
        },
        200,
        {
          'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=30',
          'Vary': 'Origin, Accept-Encoding',
        }
      );
    } catch (err: any) {
      console.error('Error loading homepage store data:', err);
      return jsonResponse(
        { success: false, error: 'Internal server error.' },
        500
      );
    }
  }

  // ==========================================
  // 1. PRODUCTS CRUD ROUTES
  // ==========================================
  if (path === '/api/products') {
    if (method === 'GET') {
      try {
        const category = url.searchParams.get('category') || undefined;
        const search = url.searchParams.get('search') || undefined;
        const featuredParam = url.searchParams.get('featured');
        const featured = featuredParam !== null ? featuredParam === 'true' || featuredParam === '1' : undefined;
        const pageParam = url.searchParams.get('page');
        const limitParam = url.searchParams.get('limit');
        const sortBy = (url.searchParams.get('sortBy') || undefined) as any;

        // Security check: Buying price & Unit profit strictly filtered on server!
        const authRes = await requireAuth(request, env);
        const user = authRes.auth;
        const isSuperAdmin = Boolean(!authRes.errorResponse && user?.role === 'super_admin');
        const isStaff = Boolean(
          !authRes.errorResponse &&
          user &&
          (user.role === 'admin' || user.role === 'sub_admin' || user.role === 'super_admin')
        );
        // Root cause remediation: Ensure Super Admin and permission aliases are fully recognized
        const canViewBuyingPrice = Boolean(
          !authRes.errorResponse &&
          user &&
          (isSuperAdmin || hasPermission(user, 'product.view_buying_price') || hasPermission(user, 'product.buying_price'))
        );
        const canViewProfit = Boolean(
          !authRes.errorResponse &&
          user &&
          (isSuperAdmin || hasPermission(user, 'product.view_profit') || hasPermission(user, 'report.profit'))
        );
        const canManageProducts = Boolean(
          !authRes.errorResponse &&
          user &&
          (isSuperAdmin || hasPermission(user, 'product.create') || hasPermission(user, 'product.update') || hasPermission(user, 'product.view'))
        );
        const isPrivileged = isSuperAdmin || isStaff || canViewBuyingPrice || canViewProfit || canManageProducts;
        const includeInactive = Boolean(isPrivileged && (url.searchParams.get('includeInactive') === 'true' || url.searchParams.get('all') === 'true'));

        // Performance & DoS Protection: Safe pagination defaults & hard maximum limits
        const DEFAULT_PUBLIC_PAGE = 1;
        const DEFAULT_PUBLIC_LIMIT = 24;
        const MAX_PUBLIC_LIMIT = 48;
        const MAX_ADMIN_LIMIT = 500;

        let responsePayload: any;

        if (isPrivileged) {
          // Authorized Admin / Staff Request:
          // If no page/limit specified, return full catalog for admin product management & inventory auditing
          // ROOT CAUSE FIX: includeBuyingPrice was previously omitted from the filter object passed to
          // getAllProducts / getPaginatedProducts, causing buildSelectProductColumns to omit the 'buying_price'
          // column from the SQL query. As a result, row.buying_price was undefined, stripping buyingPrice
          // from the products returned to the admin dashboard!
          const shouldIncludeBuyingPrice = isSuperAdmin || canViewBuyingPrice;
          if (pageParam === null && limitParam === null) {
            const products = await getAllProducts(env.DB, {
              category,
              search,
              featured,
              sortBy,
              includeInactive,
              includeBuyingPrice: shouldIncludeBuyingPrice,
            });
            const safeProducts = products.map((p) => sanitizeProductForRole(p, { isSuperAdmin, canViewBuyingPrice, canViewProfit }));
            responsePayload = {
              success: true,
              count: safeProducts.length,
              total: safeProducts.length,
              page: 1,
              limit: safeProducts.length,
              totalPages: 1,
              products: safeProducts,
            };
          } else {
            const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
            const parsedLimit = limitParam ? parseInt(limitParam, 10) : 100;
            const limit = Math.min(MAX_ADMIN_LIMIT, Math.max(1, isNaN(parsedLimit) ? 100 : parsedLimit));
            const paginated = await getPaginatedProducts(env.DB, {
              category,
              search,
              featured,
              page,
              limit,
              sortBy,
              includeInactive,
              includeBuyingPrice: shouldIncludeBuyingPrice,
            });
            const safeProducts = paginated.products.map((p) => sanitizeProductForRole(p, { isSuperAdmin, canViewBuyingPrice, canViewProfit }));
            responsePayload = {
              success: true,
              count: safeProducts.length,
              total: paginated.total,
              page: paginated.page,
              limit: paginated.limit,
              totalPages: paginated.totalPages,
              products: safeProducts,
            };
          }
        } else {
          // Public Storefront Request:
          // Default: page=1, limit=24. Hard cap: MAX_PUBLIC_LIMIT=48.
          // Prevents full catalog dumps and excessive database/worker/bandwidth load.
          const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : DEFAULT_PUBLIC_PAGE;
          const parsedLimit = limitParam ? parseInt(limitParam, 10) : DEFAULT_PUBLIC_LIMIT;
          const requestedLimit = isNaN(parsedLimit) ? DEFAULT_PUBLIC_LIMIT : parsedLimit;
          const limit = Math.min(MAX_PUBLIC_LIMIT, Math.max(1, requestedLimit));

          const paginated = await getPaginatedProducts(env.DB, {
            category,
            search,
            featured,
            page,
            limit,
            sortBy,
            includeInactive: false,
          });
          const safeProducts = paginated.products.map((p) =>
            sanitizeProductForRole(p, { isSuperAdmin: false, canViewBuyingPrice: false, canViewProfit: false })
          );
          responsePayload = {
            success: true,
            count: safeProducts.length,
            total: paginated.total,
            page: paginated.page,
            limit: paginated.limit,
            totalPages: paginated.totalPages,
            products: safeProducts,
          };
        }

        const cacheControl = isPrivileged
          ? 'no-store, no-cache, must-revalidate, max-age=0'
          : (search ? 'public, max-age=15, s-maxage=30, stale-while-revalidate=15' : 'public, max-age=30, s-maxage=60, stale-while-revalidate=30');

        return jsonResponse(responsePayload, 200, {
          'Cache-Control': cacheControl,
          'Vary': 'Origin, Cookie, Authorization, Accept-Encoding',
        });
      } catch (err: any) {
        console.error('Error fetching products:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'POST') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'product.create');
      if (permErr) return permErr;

      try {
        const body = (await request.json()) as any;
        const productData = body.product || body;

        // Security: Non-super admin cannot set buyingPrice without dedicated product.manage_buying_price permission
        // Viewing buying price NEVER grants permission to modify buying price
        const canManageBuyingPrice = auth!.role === 'super_admin' || hasPermission(auth!, 'product.manage_buying_price');
        if (!canManageBuyingPrice) {
          delete productData.buyingPrice;
          delete productData.buying_price;
        }

        const created = await insertProduct(env.DB, productData);
        const isSuperAdmin = auth!.role === 'super_admin';
        const canViewBuyingPrice = isSuperAdmin || hasPermission(auth!, 'product.view_buying_price') || hasPermission(auth!, 'product.buying_price');
        const canViewProfit = isSuperAdmin || hasPermission(auth!, 'product.view_profit') || hasPermission(auth!, 'report.profit');

        return jsonResponse(
          { success: true, product: sanitizeProductForRole(created, { isSuperAdmin, canViewBuyingPrice, canViewProfit }) },
          201
        );
      } catch (err: any) {
        logServerError({
          route: '/api/products',
          method: 'POST',
          action: 'product.create',
          userId: auth?.dbUser?.id,
          error: err,
        });
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  const featuredProductMatch = path.match(/^\/api\/products\/([^/]+)\/featured$/);
  if (featuredProductMatch) {
    const prodId = decodeURIComponent(featuredProductMatch[1]);
    if (method === 'PUT' || method === 'PATCH') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'product.update');
      if (permErr) return permErr;

      try {
        const body = (await request.json()) as any;
        const isFeatured = body.isFeatured !== undefined
          ? Boolean(body.isFeatured)
          : Boolean(body.featured);
        const featuredSortOrder = body.featuredSortOrder !== undefined
          ? Number(body.featuredSortOrder)
          : (body.sortOrder !== undefined ? Number(body.sortOrder) : undefined);

        const updated = await setProductFeaturedInD1(env.DB, prodId, isFeatured, featuredSortOrder);
        const isSuperAdmin = auth!.role === 'super_admin';
        const canViewBuyingPrice = isSuperAdmin || hasPermission(auth!, 'product.view_buying_price') || hasPermission(auth!, 'product.buying_price');
        const canViewProfit = isSuperAdmin || hasPermission(auth!, 'product.view_profit') || hasPermission(auth!, 'report.profit');

        return jsonResponse({
          success: true,
          product: sanitizeProductForRole(updated, { isSuperAdmin, canViewBuyingPrice, canViewProfit }),
        });
      } catch (err: any) {
        console.error('Error updating product featured status:', err);
        if (err?.message?.includes('not found')) {
          return jsonResponse({ success: false, error: 'Product not found' }, 404);
        }
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  const productIdMatch = path.match(/^\/api\/products\/([^/]+)$/);
  if (productIdMatch) {
    const prodId = decodeURIComponent(productIdMatch[1]);

    if (method === 'GET') {
      try {
        // Security check: ONLY Super Admin or authorized users receive Buying Price & Unit Profit!
        const authRes = await requireAuth(request, env);
        const isSuperAdmin = Boolean(!authRes.errorResponse && authRes.auth?.role === 'super_admin');
        const canViewBuyingPrice = Boolean(
          !authRes.errorResponse &&
          authRes.auth &&
          (isSuperAdmin || hasPermission(authRes.auth, 'product.view_buying_price') || hasPermission(authRes.auth, 'product.buying_price'))
        );
        const canViewProfit = Boolean(
          !authRes.errorResponse &&
          authRes.auth &&
          (isSuperAdmin || hasPermission(authRes.auth, 'product.view_profit') || hasPermission(authRes.auth, 'report.profit'))
        );
        const canManageProducts = Boolean(
          !authRes.errorResponse &&
          authRes.auth &&
          (isSuperAdmin || hasPermission(authRes.auth, 'product.create') || hasPermission(authRes.auth, 'product.update'))
        );
        const isPrivileged = isSuperAdmin || canViewBuyingPrice || canViewProfit || canManageProducts;

        const product = await getProductById(env.DB, prodId, { includeBuyingPrice: isSuperAdmin || canViewBuyingPrice || isPrivileged });
        if (!product) return jsonResponse({ success: false, error: 'Product not found' }, 404);

        // Public single-product endpoint: Inactive/deleted products must not be publicly accessible
        const isInactive = product.status !== 'active' || Boolean((product as any).isDeleted);
        if (isInactive && !isPrivileged) {
          return jsonResponse({ success: false, error: 'Product not found' }, 404);
        }

        const safeProduct = sanitizeProductForRole(product, { isSuperAdmin, canViewBuyingPrice, canViewProfit });

        const cacheControl = isPrivileged
          ? 'no-store, no-cache, must-revalidate, max-age=0'
          : 'public, max-age=15, s-maxage=45, stale-while-revalidate=30';

        return jsonResponse({ success: true, product: safeProduct }, 200, {
          'Cache-Control': cacheControl,
          'Vary': 'Origin, Cookie, Authorization, Accept-Encoding',
        });
      } catch (err: any) {
        console.error('Error fetching product by ID:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'PUT' || method === 'PATCH') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'product.update');
      if (permErr) return permErr;

      try {
        const body = (await request.json()) as any;
        const updates = body.updates || body.product || body;

        // Security: Non-super admin cannot modify buyingPrice without dedicated product.manage_buying_price permission
        // Viewing buying price NEVER grants permission to modify buying price
        const canManageBuyingPrice = auth!.role === 'super_admin' || hasPermission(auth!, 'product.manage_buying_price');
        if (!canManageBuyingPrice) {
          delete updates.buyingPrice;
          delete updates.buying_price;
        }

        const updated = await updateProductInD1(env.DB, prodId, updates);
        const isSuperAdmin = auth!.role === 'super_admin';
        const canViewBuyingPrice = isSuperAdmin || hasPermission(auth!, 'product.view_buying_price') || hasPermission(auth!, 'product.buying_price');
        const canViewProfit = isSuperAdmin || hasPermission(auth!, 'product.view_profit') || hasPermission(auth!, 'report.profit');

        return jsonResponse({
          success: true,
          product: sanitizeProductForRole(updated, { isSuperAdmin, canViewBuyingPrice, canViewProfit }),
        });
      } catch (err: any) {
        console.error('Error updating product:', err);
        if (err?.message?.includes('not found')) {
          return jsonResponse({ success: false, error: 'Product not found' }, 404);
        }
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'DELETE') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'product.delete');
      if (permErr) return permErr;

      try {
        await deleteProductFromD1(env.DB, prodId);
        return jsonResponse({ success: true, message: `Product "${prodId}" deleted successfully.` });
      } catch (err: any) {
        logServerError({ route: path, method, error: err, action: 'product.delete' });
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  // ==========================================
  // 2. CATEGORIES CRUD ROUTES
  // ==========================================
  if (path === '/api/categories') {
    if (method === 'GET') {
      try {
        const categories = await getAllCategories(env.DB);
        return jsonResponse({ success: true, count: categories.length, categories }, 200, {
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=120',
          'Vary': 'Origin, Accept-Encoding',
        });
      } catch (err: any) {
        console.error('Error fetching categories:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'POST') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'category.manage');
      if (permErr) return permErr;

      try {
        const body = (await request.json()) as any;
        const catData = body.category || body;
        const created = await insertCategory(env.DB, catData);
        return jsonResponse({ success: true, category: created }, 201);
      } catch (err: any) {
        console.error('Error creating category:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  const categoryIdMatch = path.match(/^\/api\/categories\/([^/]+)$/);
  if (categoryIdMatch) {
    const catId = decodeURIComponent(categoryIdMatch[1]);

    if (method === 'GET') {
      try {
        const category = await getCategoryById(env.DB, catId);
        if (!category) return jsonResponse({ success: false, error: 'Category not found' }, 404);
        return jsonResponse({ success: true, category }, 200, {
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=120',
          'Vary': 'Origin, Accept-Encoding',
        });
      } catch (err: any) {
        console.error('Error fetching category by ID:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'PUT' || method === 'PATCH') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'category.manage');
      if (permErr) return permErr;

      try {
        const body = (await request.json()) as any;
        const updates = body.updates || body.category || body;
        const updated = await updateCategoryInD1(env.DB, catId, updates);
        return jsonResponse({ success: true, category: updated });
      } catch (err: any) {
        console.error('Error updating category:', err);
        if (err?.message?.includes('not found')) {
          return jsonResponse({ success: false, error: 'Category not found' }, 404);
        }
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'DELETE') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'category.manage');
      if (permErr) return permErr;

      try {
        await deleteCategoryFromD1(env.DB, catId);
        return jsonResponse({ success: true, message: `Category "${catId}" deleted successfully.` });
      } catch (err: any) {
        logServerError({ route: path, method, error: err, action: 'category.delete' });
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  // ==========================================
  // 3. SLIDERS CRUD ROUTES
  // ==========================================
  if (path === '/api/sliders') {
    if (method === 'GET') {
      try {
        const sliders = await getAllSliders(env.DB);
        return jsonResponse({ success: true, count: sliders.length, sliders }, 200, {
          'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=60',
          'Vary': 'Origin, Accept-Encoding',
        });
      } catch (err: any) {
        logServerError({ route: path, method, error: err, action: 'sliders.list' });
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'POST') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'slider.manage');
      if (permErr) return permErr;

      try {
        const body = (await request.json()) as any;
        const slideData = body.slide || body;
        const created = await insertSlider(env.DB, slideData);
        return jsonResponse({ success: true, slider: created }, 201);
      } catch (err: any) {
        logServerError({ route: path, method, error: err, action: 'slider.create' });
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  // Slider Reordering Endpoint (Accepts PUT/POST on /api/sliders/order and /api/admin/sliders/order)
  if (path === '/api/sliders/order' || path === '/api/admin/sliders/order') {
    if (method === 'PUT' || method === 'POST') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'slider.manage');
      if (permErr) return permErr;

      try {
        const body = (await request.json()) as any;
        const items = Array.isArray(body) ? body : (body.slides || body.sliders || body.order || []);
        if (!Array.isArray(items) || items.length === 0) {
          return jsonResponse({ success: false, error: 'Non-empty array expected for slider ordering.' }, 400);
        }
        const updated = await reorderSlidersInD1(env.DB, items);
        return jsonResponse(
          {
            success: true,
            count: updated.length,
            sliders: updated,
            message: 'Slider ordering updated successfully.',
          },
          200,
          {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          }
        );
      } catch (err: any) {
        logServerError({ route: path, method, error: err, action: 'slider.reorder' });
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  const sliderIdMatch = path.match(/^\/api\/sliders\/([^/]+)$/);
  if (sliderIdMatch && sliderIdMatch[1] !== 'order') {
    const slideId = decodeURIComponent(sliderIdMatch[1]);

    if (method === 'GET') {
      try {
        const slide = await getSliderById(env.DB, slideId);
        if (!slide) return jsonResponse({ success: false, error: 'Slider not found' }, 404);
        return jsonResponse({ success: true, slider: slide }, 200, {
          'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=60',
          'Vary': 'Origin',
        });
      } catch (err: any) {
        console.error('Error fetching slider by ID:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'PUT' || method === 'PATCH') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'slider.manage');
      if (permErr) return permErr;

      try {
        const body = (await request.json()) as any;
        const updates = body.updates || body.slide || body;
        const updated = await updateSliderInD1(env.DB, slideId, updates);
        return jsonResponse({ success: true, slider: updated });
      } catch (err: any) {
        console.error('Error updating slider:', err);
        if (err?.message?.includes('not found')) {
          return jsonResponse({ success: false, error: 'Slider not found' }, 404);
        }
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'DELETE') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'slider.manage');
      if (permErr) return permErr;

      try {
        await deleteSliderFromD1(env.DB, slideId);
        return jsonResponse({ success: true, message: `Slider deleted successfully.` });
      } catch (err: any) {
        logServerError({ route: path, method, error: err, action: 'slider.delete' });
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  // ==========================================
  // 4. STORE SETTINGS ROUTES
  // ==========================================
  if (path === '/api/settings' || path === '/api/admin/settings') {
    if (method === 'GET') {
      try {
        const rawSettings = await getStoreSettings(env.DB);
        // Check if request is from an authenticated admin
        const authRes = await requireAuth(request, env);
        const isAdmin = Boolean(!authRes.errorResponse && authRes.auth && (authRes.auth.role === 'super_admin' || authRes.auth.role === 'admin' || authRes.auth.role === 'sub_admin'));
        const canViewCourier = Boolean(!authRes.errorResponse && authRes.auth && (authRes.auth.role === 'super_admin' || hasPermission(authRes.auth, 'courier.configure') || hasPermission(authRes.auth, 'settings.manage')));

        const isAuthenticated = Boolean(!authRes.errorResponse && authRes.auth);
        const cacheControl = isAuthenticated
          ? 'no-store, no-cache, must-revalidate, max-age=0'
          : 'public, max-age=30, s-maxage=60, stale-while-revalidate=30';

        return jsonResponse({
          success: true,
          settings: maskSettings(rawSettings, isAdmin, canViewCourier, env),
        }, 200, {
          'Cache-Control': cacheControl,
          'Vary': 'Origin, Cookie, Authorization, Accept-Encoding',
        });
      } catch (err: any) {
        console.error('Error fetching settings:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'settings.manage');
      if (permErr) return permErr;

      try {
        const body = (await request.json().catch(() => ({}))) as any;
        const updates = body.settings || body;

        if (!updates || typeof updates !== 'object') {
          return jsonResponse({ success: false, error: 'Invalid settings payload: expected a settings object.' }, 400);
        }

        // Courier credentials must NEVER be persisted into D1 store settings
        delete updates.steadfastApiKey;
        delete updates.steadfastSecretKey;

        // Save to Cloudflare D1
        const canonical = await updateStoreSettingsInD1(env.DB, updates);

        const canViewCourier = Boolean(
          auth!.role === 'super_admin' ||
          hasPermission(auth!, 'courier.configure') ||
          hasPermission(auth!, 'settings.manage')
        );

        return jsonResponse({
          success: true,
          message: 'Website settings saved successfully!',
          settings: maskSettings(canonical, true, canViewCourier, env),
        });
      } catch (err: any) {
        logServerError({ route: path, method, error: err, action: 'settings.update' });
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  // ==========================================
  // 4B. MEDIA ASSET UPLOAD & SERVING (R2 & D1)
  // ==========================================
  if (path === '/api/upload' && method === 'POST') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    if (auth!.role === 'customer') {
      return jsonResponse({ success: false, error: 'Forbidden: Customers cannot upload media.' }, 403);
    }

    // Server-verified user identity (never trust client-supplied userId)
    const userId = auth!.dbUser?.id || auth!.tokenUser?.userId || auth!.tokenUser?.email || 'authenticated-user';
    const burstKey = `upload_burst:user:${userId}`;
    const hourKey = `upload_hour:user:${userId}`;

    // Distributed Rate Limit Checks via D1 rate_limits table & in-memory cache
    const [burstCheck, hourCheck] = await Promise.all([
      checkRateLimit(burstKey, 10, 60, env.DB),
      checkRateLimit(hourKey, 60, 3600, env.DB),
    ]);

    if (!burstCheck.allowed) {
      const retrySecs = burstCheck.remainingSeconds || 60;
      return jsonResponse(
        {
          success: false,
          error: 'Upload rate limit exceeded. Please wait a moment before uploading more images.',
          retryAfter: retrySecs,
        },
        429,
        {
          'Retry-After': String(retrySecs),
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': '0',
        }
      );
    }

    if (!hourCheck.allowed) {
      const retrySecs = hourCheck.remainingSeconds || 3600;
      return jsonResponse(
        {
          success: false,
          error: 'Hourly upload limit reached. Please wait before uploading more images.',
          retryAfter: retrySecs,
        },
        429,
        {
          'Retry-After': String(retrySecs),
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
        }
      );
    }

    try {
      // 1. Strict pre-upload size check BEFORE processing the entire body
      const contentLengthHeader = request.headers.get('Content-Length');
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && contentLength > MAX_IMAGE_SIZE_BYTES) {
          return jsonResponse(
            { success: false, error: `Upload rejected: Content-Length exceeds maximum allowed limit of ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB.` },
            413
          );
        }
      }

      const contentTypeHeader = request.headers.get('Content-Type') || '';
      let fileBuffer: ArrayBuffer | null = null;

      if (contentTypeHeader.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) {
          return jsonResponse({ success: false, error: 'No file provided in form data' }, 400);
        }
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          return jsonResponse({ success: false, error: 'File size exceeds maximum allowed 10MB limit.' }, 413);
        }
        fileBuffer = await file.arrayBuffer();
      } else {
        const body = (await request.json().catch(() => ({}))) as any;
        const dataUrl = body.dataUrl || body.image || '';
        if (!dataUrl || typeof dataUrl !== 'string') {
          return jsonResponse({ success: false, error: 'Expected dataUrl in JSON body' }, 400);
        }
        const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const raw = atob(matches[2]);
          const u8 = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) {
            u8[i] = raw.charCodeAt(i);
          }
          fileBuffer = u8.buffer;
        } else {
          return jsonResponse({ success: false, error: 'Invalid data URL format' }, 400);
        }
      }

      if (!fileBuffer || fileBuffer.byteLength === 0) {
        return jsonResponse({ success: false, error: 'File is empty' }, 400);
      }

      // 2. Validate authoritative magic bytes and inspect buffer for script/markup injection
      const validation = validateImageBuffer(fileBuffer);
      if (!validation.valid || !validation.mime || !validation.extension) {
        await recordFailedAttempt(burstKey, 10, 60, env.DB);
        return jsonResponse(
          { success: false, error: validation.error || 'Invalid or unsupported image file.' },
          400
        );
      }

      const verifiedMime = validation.mime;
      const verifiedExt = validation.extension;
      const key = generateSafeMediaKey(verifiedExt);

      // 3. Store asset in Cloudflare R2 or fallback to D1 with strictly verified MIME type
      const r2Bucket = env.R2 || env.BUCKET;
      if (r2Bucket) {
        await r2Bucket.put(key, fileBuffer, {
          httpMetadata: {
            contentType: verifiedMime,
          },
        });
      } else {
        const bytes = new Uint8Array(fileBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);
        await saveMediaAssetInD1(env.DB, key, verifiedMime, base64Data, fileBuffer.byteLength);
      }

      // Pre-generate standard responsive variants (240, 360, 480, 720, 1080) if node/sharp is available
      if (typeof process !== 'undefined' && process.versions?.node) {
        try {
          const sharpModule = await import('sharp');
          const sharp = (sharpModule as any).default || sharpModule;
          const baseKeyWithoutExt = key.replace(/\.[^.]+$/, '');
          const standardWidths = [240, 360, 480, 720, 1080];
          for (const w of standardWidths) {
            const webpBuf = await sharp(Buffer.from(fileBuffer)).resize(w, null, { withoutEnlargement: true, fit: 'inside' }).webp({ quality: 82 }).toBuffer();
            const varKey = `${baseKeyWithoutExt}_w${w}.webp`;
            if (r2Bucket) {
              await r2Bucket.put(varKey, webpBuf, { httpMetadata: { contentType: 'image/webp' } });
            } else {
              const b64 = Buffer.from(webpBuf).toString('base64');
              await saveMediaAssetInD1(env.DB, varKey, 'image/webp', b64, webpBuf.byteLength);
            }
          }
        } catch (variantErr) {
          console.warn('Failed to pre-generate variants during upload:', variantErr);
        }
      }

      // 4. Record successful upload in distributed rate limiters
      await Promise.all([
        recordFailedAttempt(burstKey, 10, 60, env.DB),
        recordFailedAttempt(hourKey, 60, 3600, env.DB),
      ]);

      const mediaUrl = `/api/media/${key}`;
      return jsonResponse({
        success: true,
        url: mediaUrl,
        key,
        size: fileBuffer.byteLength,
        contentType: verifiedMime,
        format: validation.format,
      });
    } catch (err: any) {
      console.error('Failed to process upload:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  const mediaMatch = path.match(/^\/api\/media\/([^/]+)$/);
  if (mediaMatch && method === 'GET') {
    const rawKey = decodeURIComponent(mediaMatch[1]);

    // Path traversal and dangerous key sanitization
    if (!isValidMediaKey(rawKey)) {
      return new Response('Invalid media asset key', { status: 400 });
    }
    const key = rawKey;

    try {
      const urlObj = new URL(request.url);
      const widthParam = urlObj.searchParams.get('w') || urlObj.searchParams.get('width');
      const targetWidth = widthParam ? parseInt(widthParam, 10) : null;
      const qualityParam = urlObj.searchParams.get('q') || urlObj.searchParams.get('quality');
      const targetQuality = qualityParam ? parseInt(qualityParam, 10) : 82;

      const r2Bucket = env.R2 || env.BUCKET;
      const standardWidths = [240, 360, 480, 720, 1080];
      const matchedWidth = targetWidth
        ? (standardWidths.find((sw) => sw >= targetWidth) || 1080)
        : null;

      // 1. Check for pre-generated variant in R2 / D1 first:
      if (targetWidth && targetWidth > 0 && targetWidth <= 2400) {
        const baseKeyWithoutExt = key.replace(/\.[^.]+$/, '');
        // Prioritized candidate variant keys:
        // a. Exact target width requested
        // b. Matched standard width (240, 360, 480, 720, 1080)
        // c. Closest alternative standard variants
        const candidateKeys = Array.from(new Set([
          `${baseKeyWithoutExt}_w${targetWidth}.webp`,
          ...(matchedWidth ? [`${baseKeyWithoutExt}_w${matchedWidth}.webp`] : []),
          ...standardWidths
            .slice()
            .sort((a, b) => Math.abs(a - targetWidth) - Math.abs(b - targetWidth))
            .map((w) => `${baseKeyWithoutExt}_w${w}.webp`),
        ]));

        for (const variantKey of candidateKeys) {
          let variantBuffer: Uint8Array | null = null;
          if (r2Bucket) {
            const varObj = await r2Bucket.get(variantKey);
            if (varObj) {
              if (typeof (varObj as any).arrayBuffer === 'function') {
                const ab = await (varObj as any).arrayBuffer();
                variantBuffer = new Uint8Array(ab);
              } else if ((varObj as any).body) {
                const reader = ((varObj as any).body as ReadableStream).getReader();
                const chunks: Uint8Array[] = [];
                let total = 0;
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (value) {
                    chunks.push(value);
                    total += value.length;
                  }
                }
                variantBuffer = new Uint8Array(total);
                let offset = 0;
                for (const chunk of chunks) {
                  variantBuffer.set(chunk, offset);
                  offset += chunk.length;
                }
              }
            }
          }
          if (!variantBuffer && env.DB) {
            const varAsset = await getMediaAssetFromD1(env.DB, variantKey);
            if (varAsset) {
              const raw = atob(varAsset.dataBase64);
              variantBuffer = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i++) {
                variantBuffer[i] = raw.charCodeAt(i);
              }
            }
          }
          if (variantBuffer && variantBuffer.byteLength > 0) {
            return new Response(variantBuffer, {
              status: 200,
              headers: {
                ...getSafeMediaHeaders('image/webp'),
                ...getCorsHeaders(request, env),
                'Content-Length': String(variantBuffer.byteLength),
              },
            });
          }
        }
      }

      // 2. In production Cloudflare Workers with Image Resizing enabled:
      // Check if Cloudflare edge image transformation is available on this request
      const isCloudflareResizeRequest = request.headers.has('cf-image-resizing');
      if (
        !isCloudflareResizeRequest &&
        targetWidth &&
        targetWidth > 0 &&
        targetWidth <= 2400 &&
        (request as any).cf &&
        typeof (globalThis as any).fetch === 'function'
      ) {
        try {
          const originUrl = new URL(request.url);
          originUrl.search = '';
          const cfRes = await (globalThis as any).fetch(originUrl.toString(), {
            headers: {
              ...Object.fromEntries(request.headers.entries()),
              'cf-image-resizing': 'active',
            },
            cf: {
              image: {
                width: matchedWidth || targetWidth,
                quality: Math.min(Math.max(targetQuality, 50), 95),
                format: 'auto',
                fit: 'scale-down',
              },
            },
          });
          if (cfRes && cfRes.ok) {
            return cfRes;
          }
        } catch {}
      }

      let rawBuffer: Uint8Array | null = null;
      let contentType = 'image/jpeg';

      if (r2Bucket) {
        const obj = await r2Bucket.get(key);
        if (obj) {
          contentType = obj.httpMetadata?.contentType || 'image/jpeg';
          if (typeof (obj as any).arrayBuffer === 'function') {
            const ab = await (obj as any).arrayBuffer();
            rawBuffer = new Uint8Array(ab);
          } else if (obj.body) {
            const reader = (obj.body as ReadableStream).getReader();
            const chunks: Uint8Array[] = [];
            let total = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                chunks.push(value);
                total += value.length;
              }
            }
            rawBuffer = new Uint8Array(total);
            let offset = 0;
            for (const chunk of chunks) {
              rawBuffer.set(chunk, offset);
              offset += chunk.length;
            }
          }
        }
      }

      // Check D1 media_assets table
      if (!rawBuffer && env.DB) {
        const asset = await getMediaAssetFromD1(env.DB, key);
        if (asset) {
          const raw = atob(asset.dataBase64);
          rawBuffer = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) {
            rawBuffer[i] = raw.charCodeAt(i);
          }
          contentType = asset.contentType || 'image/jpeg';
        }
      }

      if (!rawBuffer) {
        return new Response('Media asset not found', { status: 404 });
      }

      // If transformation was requested (?w=360, etc.)
      if (targetWidth && targetWidth > 0 && targetWidth <= 2400) {
        try {
          if (typeof process !== 'undefined' && process.versions?.node) {
            const sharpModule = await import('sharp');
            const sharp = (sharpModule as any).default || sharpModule;
            const accept = request.headers.get('accept') || '';
            const wantsWebp = accept.includes('image/webp') || contentType !== 'image/gif';

            const effectiveWidth = matchedWidth || targetWidth;
            let pipeline = sharp(Buffer.from(rawBuffer)).resize(effectiveWidth, null, {
              withoutEnlargement: true,
              fit: 'inside',
            });

            if (wantsWebp) {
              const webpBuffer = await pipeline.webp({ quality: Math.min(Math.max(targetQuality, 50), 95) }).toBuffer();
              // Persist newly generated variant into R2 or D1 for instant future hits
              const baseKeyWithoutExt = key.replace(/\.[^.]+$/, '');
              const varKey = `${baseKeyWithoutExt}_w${effectiveWidth}.webp`;
              try {
                if (r2Bucket) {
                  await r2Bucket.put(varKey, webpBuffer, { httpMetadata: { contentType: 'image/webp' } });
                } else if (env.DB) {
                  const b64 = Buffer.from(webpBuffer).toString('base64');
                  await saveMediaAssetInD1(env.DB, varKey, 'image/webp', b64, webpBuffer.byteLength);
                }
              } catch (persistErr) {
                console.warn('Failed to persist dynamic variant:', persistErr);
              }

              return new Response(webpBuffer, {
                status: 200,
                headers: {
                  ...getSafeMediaHeaders('image/webp'),
                  ...getCorsHeaders(request, env),
                  'Content-Length': String(webpBuffer.byteLength),
                },
              });
            } else {
              const resizedBuffer = await pipeline.toBuffer();
              return new Response(resizedBuffer, {
                status: 200,
                headers: {
                  ...getSafeMediaHeaders(contentType),
                  ...getCorsHeaders(request, env),
                  'Content-Length': String(resizedBuffer.byteLength),
                },
              });
            }
          }
        } catch (resizeErr) {
          console.warn('Image resizing fallback error:', resizeErr);
        }
      }

      return new Response(rawBuffer.buffer, {
        status: 200,
        headers: {
          ...getSafeMediaHeaders(contentType),
          ...getCorsHeaders(request, env),
          'Content-Length': String(rawBuffer.byteLength),
        },
      });
    } catch (err: any) {
      console.error('[Media Retrieval Error]', err);
      return new Response('Error retrieving media asset.', { status: 500, headers: getCorsHeaders(request) });
    }
  }

  // ==========================================
  // 5. COUPONS CRUD ROUTES
  // ==========================================
  if (path === '/api/coupons') {
    if (method === 'GET') {
      try {
        // If authenticated admin with coupon.view, return all coupons; otherwise return only active coupons directly from D1
        const authRes = await requireAuth(request, env);
        const hasCouponView = Boolean(!authRes.errorResponse && authRes.auth && hasPermission(authRes.auth, 'coupon.view'));

        const returnList = await getAllCoupons(env.DB, !hasCouponView);
        const isAuthenticated = Boolean(!authRes.errorResponse && authRes.auth);
        const cacheControl = isAuthenticated
          ? 'no-store, no-cache, must-revalidate, max-age=0'
          : 'public, max-age=30, s-maxage=60, stale-while-revalidate=30';

        return jsonResponse({ success: true, coupons: returnList }, 200, {
          'Cache-Control': cacheControl,
          'Vary': 'Origin, Cookie, Authorization, Accept-Encoding',
        });
      } catch (err: any) {
        console.error('Error fetching coupons:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'POST') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'coupon.manage');
      if (permErr) return permErr;

      try {
        const body = (await request.json()) as any;
        const couponData = body.coupon || body;
        const created = await insertCoupon(env.DB, couponData);
        return jsonResponse({ success: true, coupon: created }, 201);
      } catch (err: any) {
        console.error('Error creating coupon:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  const couponCodeMatch = path.match(/^\/api\/coupons\/([^/]+)$/);
  if (couponCodeMatch) {
    const code = decodeURIComponent(couponCodeMatch[1]);

    if (method === 'PUT' || method === 'PATCH') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'coupon.manage');
      if (permErr) return permErr;

      try {
        const body = (await request.json()) as any;
        const updates = body.updates || body.coupon || body;
        const updated = await updateCouponInD1(env.DB, code, updates);
        return jsonResponse({ success: true, coupon: updated });
      } catch (err: any) {
        console.error('Error updating coupon:', err);
        if (err?.message?.includes('not found')) {
          return jsonResponse({ success: false, error: 'Coupon not found' }, 404);
        }
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'DELETE') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'coupon.manage');
      if (permErr) return permErr;

      try {
        await deleteCouponFromD1(env.DB, code);
        return jsonResponse({ success: true, message: `Coupon deleted successfully.` });
      } catch (err: any) {
        logServerError({ route: path, method, error: err, action: 'coupon.delete' });
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  // ==========================================
  // 6. REVIEWS CRUD ROUTES
  // ==========================================
  if (path === '/api/reviews') {
    if (method === 'GET') {
      try {
        const productId = url.searchParams.get('productId') || undefined;
        const reviews = await getAllReviews(env.DB, productId);
        return jsonResponse({ success: true, count: reviews.length, reviews }, 200, {
          'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=30',
          'Vary': 'Origin, Accept-Encoding',
        });
      } catch (err: any) {
        console.error('Error fetching reviews:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'POST') {
      try {
        const isDev = isDevEnvironment(env);
        const clientIp = getClientIp(request, isDev);
        const reviewIpKey = `rev-ip:${clientIp}`;

        // 1. IP-based rate limiting (max 5 reviews per 10 minutes)
        const ipCheck = await checkRateLimit(reviewIpKey, 5, 600, env.DB);
        if (!ipCheck.allowed) {
          return jsonResponse({
            success: false,
            error: 'Too many reviews submitted from your connection. Please wait a few minutes before submitting another.'
          }, 429);
        }

        const body = (await request.json().catch(() => ({}))) as any;
        const reviewData = body.review || body;

        const productId = String(reviewData.productId || '').trim();
        const authorName = String(reviewData.authorName || reviewData.author || '').trim();
        const comment = String(reviewData.comment || '').trim();
        const rating = Math.min(5, Math.max(1, Math.round(Number(reviewData.rating) || 5)));

        if (!productId || !authorName || !comment) {
          return jsonResponse({ success: false, error: 'Product, author name, and comment are required.' }, 400);
        }

        if (authorName.length < 2 || authorName.length > 60) {
          return jsonResponse({ success: false, error: 'Author name must be between 2 and 60 characters.' }, 400);
        }

        if (comment.length < 3 || comment.length > 1000) {
          return jsonResponse({ success: false, error: 'Review comment must be between 3 and 1000 characters.' }, 400);
        }

        // 2. Per-product throttling (max 2 reviews per product per IP per 10 minutes)
        const prodThrottleKey = `rev-prod:${clientIp}:${productId}`;
        const prodCheck = await checkRateLimit(prodThrottleKey, 2, 600, env.DB);
        if (!prodCheck.allowed) {
          return jsonResponse({
            success: false,
            error: 'You have recently reviewed this product. Please wait before submitting another review.'
          }, 429);
        }

        // 3. Duplicate submission protection
        if (env.DB) {
          const dup = await env.DB.prepare(
            'SELECT id FROM reviews WHERE product_id = ? AND comment = ? LIMIT 1'
          ).bind(productId, comment).first();
          if (dup) {
            return jsonResponse({
              success: false,
              error: 'A review with identical content has already been submitted for this product.'
            }, 409);
          }
        }

        // Record submission attempts for rate limits
        await recordFailedAttempt(reviewIpKey, 5, 600, env.DB);
        await recordFailedAttempt(prodThrottleKey, 2, 600, env.DB);

        // 4. Server-Authoritative verifiedPurchase Verification:
        // Client cannot force verifiedPurchase: true.
        // The server verifies against authoritative D1 order records.
        let isVerifiedPurchase = false;
        if (env.DB) {
          try {
            let authUser: TokenPayload | null = null;
            const authHeader = request.headers.get('Authorization') || '';
            if (authHeader.startsWith('Bearer ')) {
              const token = authHeader.slice(7).trim();
              try {
                const secret = await resolveAuthSecret(env);
                authUser = await verifyAuthToken(token, secret, env);
              } catch {}
            }

            const reviewerEmail = (authUser?.email || reviewData.email || reviewData.userEmail || '').trim().toLowerCase();
            const reviewerUserId = authUser?.userId || reviewData.userId || '';
            const reviewerPhone = (reviewData.phone || reviewData.customerPhone || '').replace(/\D/g, '');
            const reviewOrderNo = String(reviewData.orderNumber || reviewData.order_number || '').trim();

            if (reviewerUserId || reviewerEmail || reviewerPhone || reviewOrderNo) {
              const qualifyingOrder = await env.DB.prepare(`
                SELECT id FROM orders
                WHERE (
                  (? != '' AND user_id = ?) OR
                  (? != '' AND LOWER(user_email) = ?) OR
                  (? != '' AND customer_phone LIKE ?) OR
                  (? != '' AND order_number = ?)
                )
                AND items_json LIKE ?
                AND shipping_status != 'Cancelled'
                LIMIT 1
              `).bind(
                reviewerUserId, reviewerUserId,
                reviewerEmail, reviewerEmail,
                reviewerPhone ? `%${reviewerPhone.slice(-11)}%` : '', reviewerPhone ? `%${reviewerPhone.slice(-11)}%` : '',
                reviewOrderNo, reviewOrderNo,
                `%${productId}%`
              ).first();

              if (qualifyingOrder) {
                isVerifiedPurchase = true;
              }
            }
          } catch (vpErr) {
            console.error('[Review Error] Error determining verified purchase status in D1:', vpErr);
            isVerifiedPurchase = false;
          }
        }

        const created = await insertReview(env.DB, {
          productId,
          authorName,
          comment,
          rating,
          verifiedPurchase: isVerifiedPurchase,
        });
        return jsonResponse({ success: true, review: created }, 201);
      } catch (err: any) {
        console.error('Error creating review:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  const reviewIdMatch = path.match(/^\/api\/reviews\/([^/]+)$/);
  if (reviewIdMatch && method === 'DELETE') {
    const revId = decodeURIComponent(reviewIdMatch[1]);
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    if (auth!.role === 'customer') {
      return jsonResponse({ success: false, error: 'Forbidden: Customers cannot delete reviews.' }, 403);
    }

    try {
      await deleteReviewFromD1(env.DB, revId);
      return jsonResponse({ success: true, message: `Review deleted successfully.` });
    } catch (err: any) {
      logServerError({ route: path, method, error: err, action: 'review.delete' });
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  // ==========================================
  // 7. USERS CRUD ROUTES (Strict Server-Side RBAC & Super Admin Privacy)
  // ==========================================
  if (path === '/api/users' || path === '/api/users/' || path === '/api/admin/users' || path === '/api/admin/users/') {
    if (method === 'GET') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;

      const hasUserView = hasPermission(auth!, 'user.view');
      const hasCustView = hasPermission(auth!, 'customer.view');

      if (!hasUserView && !hasCustView) {
        return jsonResponse({ success: false, error: 'Forbidden: Insufficient permissions to view users.' }, 403);
      }

      try {
        const allUsers = await getAllUsers(env.DB);

        // If requester only has customer.view (no general user.view): strictly return customers
        if (!hasUserView && hasCustView) {
          const customersOnly = allUsers.filter((u) => u.role === 'customer');
          return jsonResponse({ success: true, count: customersOnly.length, users: customersOnly });
        }

        // If requester is super_admin, return all accounts (already sanitized, no passwords)
        if (auth!.role === 'super_admin') {
          return jsonResponse({ success: true, count: allUsers.length, users: allUsers });
        }

        // If requester is admin or sub_admin:
        // Exclude ALL super_admin accounts and protect Super Admin information entirely
        const nonSuperAdminUsers = allUsers.filter(
          (u) => !isSuperAdminUserServer(u, env)
        );

        return jsonResponse({ success: true, count: nonSuperAdminUsers.length, users: nonSuperAdminUsers });
      } catch (err: any) {
        console.error('Error fetching users:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'POST') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'user.manage');
      if (permErr) return permErr;

      try {
        const body = (await request.json()) as any;
        const userData = body.user || body;

        // Sub-admin or admin can NEVER create a super_admin account!
        if (userData.role === 'super_admin' && auth!.role !== 'super_admin') {
          return jsonResponse(
            { success: false, error: 'Forbidden: Only a Super Administrator can create a Super Admin account.' },
            403
          );
        }

        // Sub-admin or admin can NEVER configure roles or permissions during account creation!
        if (auth!.role !== 'super_admin' && (userData.role !== undefined || userData.permissions || userData.permissions_json)) {
          return jsonResponse(
            { success: false, error: 'Forbidden: Only Super Administrator can configure account roles or permissions.' },
            403
          );
        }

        const created = await insertUser(env.DB, userData);
        return jsonResponse({ success: true, user: created }, 201);
      } catch (err: any) {
        console.error('Error creating user:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  const userIdMatch = path.match(/^\/api\/(?:admin\/)?users\/([^/]+)\/?$/);
  if (userIdMatch) {
    const usrId = decodeURIComponent(userIdMatch[1]);

    if (method === 'PUT' || method === 'PATCH') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;

      // Check target user in D1
      const targetUser = await env.DB.prepare('SELECT id, email, role FROM users WHERE id = ?').bind(usrId).first<{ id: string; email: string; role: string }>();
      if (!targetUser) {
        return jsonResponse({ success: false, error: 'User not found.' }, 404);
      }

      // Check self-update vs administrative update
      const isSelf = auth!.dbUser.id === usrId;
      const isTargetSuperAdmin = isSuperAdminUserServer(targetUser, env) || targetUser.role === 'super_admin';

      if (isTargetSuperAdmin && auth!.role !== 'super_admin') {
        return jsonResponse(
          { success: false, error: 'Forbidden: Super Administrator account cannot be modified by other users.' },
          403
        );
      }

      // Privilege escalation & tamper protection: Normal Admin/Sub Admin can NEVER modify another Admin/Sub Admin
      if (!isSelf && targetUser.role !== 'customer' && auth!.role !== 'super_admin') {
        return jsonResponse(
          { success: false, error: 'Forbidden: Only Super Administrator can modify administrative accounts.' },
          403
        );
      }

      if (!isSelf) {
        const permErr = requirePermission(auth!, 'user.manage');
        if (permErr) return permErr;
      }

      try {
        const body = (await request.json().catch(() => ({}))) as any;
        const updates = body.updates || body.user || body || {};

        // Never allow altering internal immutable primary key or timestamps
        delete updates.id;
        delete updates.createdAt;
        delete updates.created_at;
        delete updates.updatedAt;
        delete updates.updated_at;

        // Strict Privilege Escalation Protection:
        if (isSelf && auth!.role !== 'super_admin') {
          delete updates.role;
          delete updates.permissions;
        }

        if (updates.role === 'super_admin' && auth!.role !== 'super_admin') {
          return jsonResponse(
            { success: false, error: 'Forbidden: Cannot promote account to Super Administrator.' },
            403
          );
        }

        // Non-super_admin accounts can NEVER modify roles or permissions for any account (including their own).
        if (auth!.role !== 'super_admin') {
          const hasRoleField = updates.role !== undefined || body.role !== undefined;
          const hasPermissionField =
            updates.permissions !== undefined ||
            body.permissions !== undefined ||
            updates.permissions_json !== undefined ||
            body.permissions_json !== undefined;

          if (hasRoleField || hasPermissionField) {
            return jsonResponse(
              { success: false, error: 'Forbidden: Only Super Administrator can modify account roles or permissions.' },
              403
            );
          }
        }

        // Even Super Admins cannot alter an existing Super Admin account's role away from super_admin via user update
        if (isTargetSuperAdmin && updates.role && updates.role !== 'super_admin') {
          return jsonResponse(
            { success: false, error: 'Forbidden: Super Administrator role cannot be modified.' },
            403
          );
        }

        const isChangingEmail = Boolean(
          updates.email && updates.email.toLowerCase().trim() !== auth!.dbUser.email.toLowerCase().trim()
        );
        const isChangingPassword = Boolean(updates.password && String(updates.password).trim());

        // Security Control: Self-service password or email modification strictly requires current password verification
        if (isSelf && (isChangingEmail || isChangingPassword)) {
          const currentPassword = String(
            body.currentPassword || body.current_password || body.oldPassword || ''
          ).trim();
          if (!currentPassword) {
            return jsonResponse(
              {
                success: false,
                error: 'Current password confirmation is required to change your email or password.',
              },
              400
            );
          }
          const isCurrentValid = await verifyPassword(currentPassword, auth!.dbUser.password || '');
          if (!isCurrentValid) {
            return jsonResponse(
              { success: false, error: 'Current password does not match. Please verify and try again.' },
              400
            );
          }
        }

        // Validate new password policy if password is being updated
        if (updates.password) {
          const plainPw = String(updates.password).trim();
          if (plainPw.length < 6) {
            return jsonResponse(
              { success: false, error: 'New password must be at least 6 characters long.' },
              400
            );
          }
          updates.password = plainPw;
        }

        // Validate email format and uniqueness if email is being updated
        if (updates.email) {
          const cleanEmail = String(updates.email).toLowerCase().trim();
          if (!cleanEmail || !cleanEmail.includes('@') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return jsonResponse(
              { success: false, error: 'Please enter a valid email address.' },
              400
            );
          }
          const existingWithEmail = await env.DB.prepare(
            'SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?'
          )
            .bind(cleanEmail, usrId)
            .first();
          if (existingWithEmail) {
            return jsonResponse(
              { success: false, error: 'This email address is already in use by another account.' },
              400
            );
          }
          updates.email = cleanEmail;
        }

        // Prevent unauthorized escalation of role to super_admin
        if (updates.role === 'super_admin' && auth!.role !== 'super_admin') {
          return jsonResponse(
            { success: false, error: 'Forbidden: Cannot promote account to Super Administrator.' },
            403
          );
        }

        // Sub-admin or admin cannot modify permissions or role of super_admin
        if (isTargetSuperAdmin && auth!.role !== 'super_admin') {
          return jsonResponse(
            { success: false, error: 'Forbidden: Unauthorized to edit Super Admin role or permissions.' },
            403
          );
        }

        if (updates.role === 'customer') {
          updates.permissions_json = null;
          updates.permissions = null;
        }

        const updated = await updateUserInD1(env.DB, usrId, updates);

        // If self updated password or email, issue fresh session token with updated pwdSig so session continues
        let freshCookieHeader: string | undefined;
        if (isSelf && (isChangingPassword || isChangingEmail)) {
          const updatedUserRow = await getUserByEmailOrUsername(env.DB, updated.email);
          const newPwdSig = await computePasswordSignature(updatedUserRow?.password || '');
          const secret = await resolveAuthSecret(env);
          const freshToken = await createAuthToken(
            {
              userId: updated.id,
              email: updated.email,
              role: updated.role,
              pwdSig: newPwdSig,
            },
            secret
          );
          freshCookieHeader = buildAuthCookieHeader(request, freshToken, 7 * 86400);
        }

        const responseHeaders: Record<string, string> = {};
        if (freshCookieHeader) {
          responseHeaders['Set-Cookie'] = freshCookieHeader;
        }

        return jsonResponse({ success: true, user: updated }, 200, responseHeaders);
      } catch (err: any) {
        console.error('Error updating user:', err);
        if (err?.message?.includes('not found')) {
          return jsonResponse({ success: false, error: 'User not found' }, 404);
        }
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'DELETE') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;

      const targetUser = await env.DB.prepare('SELECT id, email, role FROM users WHERE id = ? OR email = ?').bind(usrId, usrId).first<{ id: string; email: string; role: string }>();
      if (!targetUser) {
        return jsonResponse({ success: false, error: 'User account not found in database.' }, 404);
      }

      // The primary master Super Admin account can NEVER be deleted!
      if (isSuperAdminUserServer(targetUser, env) || targetUser.role === 'super_admin') {
        return jsonResponse(
          { success: false, error: 'Forbidden: Super Administrator accounts cannot be deleted.' },
          403
        );
      }

      // Prevent the currently authenticated user from deleting their own account
      if (auth!.dbUser.id === targetUser.id || auth!.tokenUser.email?.toLowerCase().trim() === targetUser.email.toLowerCase().trim()) {
        return jsonResponse(
          { success: false, error: 'Forbidden: You cannot delete your own logged-in account.' },
          403
        );
      }

      // RBAC: Only a Super Administrator can delete administrative accounts (admin / sub_admin)
      if (targetUser.role !== 'customer' && auth!.role !== 'super_admin') {
        return jsonResponse(
          { success: false, error: 'Forbidden: Only a Super Administrator can delete administrative accounts.' },
          403
        );
      }

      // Customer account deletion permission check
      if (targetUser.role === 'customer') {
        const canDeleteCust = auth!.role === 'super_admin' || hasPermission(auth!, 'customer.delete') || hasPermission(auth!, 'user.delete');
        if (!canDeleteCust) {
          return jsonResponse({ success: false, error: 'Forbidden: Insufficient permissions to delete customer accounts.' }, 403);
        }
      }

      try {
        const deleteSuccess = await deleteUserFromD1(env.DB, targetUser.id);
        if (!deleteSuccess) {
          return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
        }
        return jsonResponse({ success: true, message: `Account for ${targetUser.email} has been permanently deleted.` });
      } catch (err: any) {
        logServerError({ route: path, method, error: err, action: 'user.delete' });
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  // ==========================================
  // 7.1 USER PASSWORD RESET (ADMIN PANEL & SUPER ADMIN SELF-RESET)
  // ==========================================
  const userResetPwMatch = path.match(/^\/api\/(?:admin\/)?users\/([^/]+)\/reset-password\/?$/);
  if (userResetPwMatch && method === 'POST') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;

    const usrId = decodeURIComponent(userResetPwMatch[1]);
    const targetUser = await env.DB.prepare('SELECT id, email, role FROM users WHERE id = ?').bind(usrId).first<UserRow>();
    if (!targetUser) {
      return jsonResponse({ success: false, error: 'User account not found.' }, 404);
    }

    const isTargetSuper = isSuperAdminUserServer(targetUser, env) || targetUser.role === 'super_admin';

    // STRICT RULE (Section 11): ONLY the currently authenticated Super Admin can change their OWN Super Admin password!
    if (isTargetSuper) {
      const isSuperAdminRequester = auth!.role === 'super_admin';
      const isSelf = auth!.dbUser.id === targetUser.id;
      if (!isSuperAdminRequester || !isSelf) {
        return jsonResponse(
          {
            success: false,
            error: 'Forbidden: Only the authenticated Super Administrator can reset their own Super Admin password.',
          },
          403
        );
      }
    } else {
      // Normal customer accounts cannot reset other user passwords
      if (auth!.role === 'customer') {
        return jsonResponse({ success: false, error: 'Forbidden: Customers cannot reset user passwords.' }, 403);
      }

      const isSelf = auth!.dbUser.id === targetUser.id;

      // Privilege protection: Non-super_admin can NEVER reset password for other administrative accounts (admin / sub_admin)
      if (!isSelf && targetUser.role !== 'customer' && auth!.role !== 'super_admin') {
        return jsonResponse(
          { success: false, error: 'Forbidden: Only Super Administrator can reset administrative account passwords.' },
          403
        );
      }

      const canManageUsers = hasPermission(auth!, 'user.manage');
      const canManageCust = targetUser.role === 'customer' && (hasPermission(auth!, 'customer.manage') || hasPermission(auth!, 'user.manage'));

      if (!isSelf && !canManageUsers && !canManageCust) {
        return jsonResponse(
          {
            success: false,
            error: 'Forbidden: You do not have permission to reset user passwords.',
          },
          403
        );
      }
    }

    try {
      const body = (await request.json().catch(() => ({}))) as any;
      const newPassword = (body.newPassword || body.password || '').trim();

      if (!newPassword || newPassword.length < 6) {
        return jsonResponse(
          { success: false, error: 'New password must be at least 6 characters long.' },
          400
        );
      }

      // Update password in D1 using existing PBKDF2 hashPassword
      const updateSuccess = await updateUserPasswordInD1(env.DB, targetUser.id, newPassword);
      if (!updateSuccess) {
        return jsonResponse(
          { success: false, error: 'Failed to update user password in database.' },
          500
        );
      }

      return jsonResponse({
        success: true,
        message: `Password for ${targetUser.email} has been reset successfully.`,
      });
    } catch (err: any) {
      console.error('Error resetting user password:', err);
      return jsonResponse(
        { success: false, error: 'Internal server error.' },
        500
      );
    }
  }

  // ==========================================
  // 8. ORDERS CRUD ROUTES (Authoritative D1 & Financial Security)
  // ==========================================
  if (path === '/api/orders' && method === 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;

    const canViewOrders = auth!.role === 'super_admin' || hasPermission(auth!, 'order.view') || hasPermission(auth!, 'order.manage');
    if (!canViewOrders) {
      return jsonResponse({ success: false, error: 'Forbidden: Insufficient permissions to view orders.', requiredPermission: 'order.view' }, 403);
    }

    try {
      const pageParam = url.searchParams.get('page');
      const limitParam = url.searchParams.get('limit');
      const search = url.searchParams.get('search') || undefined;
      const status = url.searchParams.get('status') || undefined;
      const payment = url.searchParams.get('payment') || undefined;
      const sortBy = url.searchParams.get('sortBy') || url.searchParams.get('sort') || undefined;

      const { page, limit } = sanitizeOrderPaginationParams(pageParam, limitParam);

      const paginated = await getPaginatedOrders(env.DB, {
        page,
        limit,
        search,
        status,
        payment,
        sortBy,
      });

      const isSuperAdmin = auth!.role === 'super_admin';
      const canViewBuyingPrice = hasPermission(auth!, 'product.view_buying_price') || isSuperAdmin;
      const canViewProfit = hasPermission(auth!, 'report.profit') || hasPermission(auth!, 'product.view_profit') || isSuperAdmin;
      const safeOrders = paginated.orders.map((o) =>
        sanitizeOrderForRole(o, { isSuperAdmin, canViewBuyingPrice, canViewProfit })
      );

      return jsonResponse({
        success: true,
        count: safeOrders.length,
        total: paginated.total,
        page: paginated.page,
        limit: paginated.limit,
        totalPages: paginated.totalPages,
        hasNextPage: paginated.hasNextPage,
        hasPrevPage: paginated.hasPrevPage,
        summary: paginated.summary,
        orders: safeOrders,
      });
    } catch (err: any) {
      console.error('Error fetching orders from D1:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  if (path === '/api/orders' && method === 'POST') {
    let clientIp = '127.0.0.1';
    let verifiedTokenUser: TokenPayload | null = null;
    try {
      cleanupOrderAbuseMaps();
      const isDev = isDevEnvironment(env);
      clientIp = getClientIp(request, isDev);

      // 1. Abuse Protection: Short burst protection (maximum 2 order submissions in 10 seconds per IP)
      const burstCheck = await checkRateLimit(`order_burst:${clientIp}`, 2, 10, env.DB);
      if (!burstCheck.allowed) {
        const retrySecs = burstCheck.remainingSeconds || 10;
        return jsonResponse(
          {
            success: false,
            error: 'Please wait a moment before submitting another order.',
            retryAfter: retrySecs,
          },
          429,
          {
            'Retry-After': String(retrySecs),
            'X-RateLimit-Limit': '2',
            'X-RateLimit-Remaining': '0',
          }
        );
      }

      // 2. Abuse Protection: Sustained rate limit (maximum 10 orders per 10 minutes per IP)
      const sustainedCheck = await checkRateLimit(`order_ip:${clientIp}`, 10, 600, env.DB);
      if (!sustainedCheck.allowed) {
        const retrySecs = sustainedCheck.remainingSeconds || 300;
        return jsonResponse(
          {
            success: false,
            error: 'Order submission rate limit reached. Please wait a few minutes before trying again.',
            retryAfter: retrySecs,
          },
          429,
          {
            'Retry-After': String(retrySecs),
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
          }
        );
      }

      let body: any;
      try {
        const rawBodyText = await request.text();
        body = rawBodyText && rawBodyText.trim() ? JSON.parse(rawBodyText) : {};
      } catch {
        return jsonResponse(
          { success: false, error: 'Malformed JSON payload. Please provide valid JSON.' },
          400
        );
      }
      const orderData: Order = body.order || body;

      if (!orderData) {
        return jsonResponse({ success: false, error: 'Invalid order payload.' }, 400);
      }

      // Authoritative Identity Determination:
      // If user is authenticated, derive userId & userEmail authoritatively from verified token.
      // If user is guest/unauthenticated, strip client-supplied userId and userEmail to prevent account impersonation.
      verifiedTokenUser = null;
      const authHeader = request.headers.get('Authorization') || '';
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        try {
          const secret = await resolveAuthSecret(env);
          verifiedTokenUser = await verifyAuthToken(token, secret, env);
        } catch {}
      }

      if (verifiedTokenUser) {
        orderData.userId = verifiedTokenUser.userId;
        orderData.userEmail = verifiedTokenUser.email;
      } else {
        // Guest checkout
        orderData.userId = undefined;
        orderData.userEmail = undefined;
      }

      if (!orderData.customer?.fullName || !orderData.customer?.phone || !orderData.customer?.fullAddress) {
        return jsonResponse({ success: false, error: 'Missing required customer delivery information.' }, 400);
      }

      const cleanPhone = (orderData.customer.phone || '').replace(/\D/g, '');
      if (cleanPhone.length < 11) {
        return jsonResponse({ success: false, error: 'A valid 11-digit Bangladeshi contact phone number is required.' }, 400);
      }

      // 2b. Abuse Protection: Phone-based throttling (burst protection: max 2 in 60s; sustained: max 6 in 1 hour)
      const phoneBurstCheck = await checkRateLimit(`order_ph_burst:${cleanPhone}`, 2, 60, env.DB);
      if (!phoneBurstCheck.allowed) {
        const retrySecs = phoneBurstCheck.remainingSeconds || 30;
        return jsonResponse(
          {
            success: false,
            error: 'You have submitted an order recently with this contact number. Please wait a moment before trying again.',
            retryAfter: retrySecs,
          },
          429,
          { 'Retry-After': String(retrySecs) }
        );
      }

      const phoneSustainedCheck = await checkRateLimit(`order_ph_hour:${cleanPhone}`, 6, 3600, env.DB);
      if (!phoneSustainedCheck.allowed) {
        const retrySecs = phoneSustainedCheck.remainingSeconds || 600;
        return jsonResponse(
          {
            success: false,
            error: 'Order limit reached for this contact number. Please contact customer support.',
            retryAfter: retrySecs,
          },
          429,
          { 'Retry-After': String(retrySecs) }
        );
      }

      // 3. Duplicate & Idempotency Protection: Client-provided idempotency key with persistent D1 storage
      const idempotencyKey = (
        request.headers.get('idempotency-key') ||
        request.headers.get('x-idempotency-key') ||
        body.idempotencyKey ||
        (orderData as any).idempotencyKey ||
        ''
      ).trim();

      if (idempotencyKey) {
        // Tier 1: Check persistent Cloudflare D1 storage
        if (env.DB) {
          try {
            const row = await env.DB.prepare(
              'SELECT response_json, created_at FROM order_idempotency WHERE key = ? LIMIT 1'
            ).bind(idempotencyKey).first<{ response_json: string; created_at: number }>();

            if (row && row.response_json) {
              const now = Date.now();
              if (now - row.created_at < 24 * 60 * 60 * 1000) {
                const cachedPayload = JSON.parse(row.response_json);
                return jsonResponse(cachedPayload, 200, {
                  'X-Idempotency-Cache': 'HIT',
                });
              }
            }
          } catch (idemErr) {
            console.error('[Idempotency Error] Error checking D1 order_idempotency:', idemErr);
          }
        }

        // Tier 2: Check in-memory map
        const cached = orderIdempotencyMap.get(idempotencyKey);
        if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
          return jsonResponse(
            {
              success: true,
              message: `Order #${cached.order.orderNumber} successfully retrieved (idempotent request).`,
              order: sanitizeOrderForRole(cached.order, false),
              idempotent: true,
            },
            200
          );
        }
      }

      // 4. Duplicate Click Protection: Rapid double-click within 15 seconds from same phone & IP
      const itemsCount = Array.isArray(orderData.items) ? orderData.items.length : 0;
      const doubleClickFingerprint = `${clientIp}:${cleanPhone}:${itemsCount}`;
      const recent = orderRecentSubmissionMap.get(doubleClickFingerprint);
      if (recent && Date.now() - recent.timestamp < 15000) {
        return jsonResponse(
          {
            success: true,
            message: `Order #${recent.order.orderNumber} already confirmed!`,
            order: sanitizeOrderForRole(recent.order, false),
            duplicatePrevented: true,
          },
          200
        );
      }

      // 5. Server-side authoritative validation, pricing calculation & stock deduction via insertOrder
      const saved = await insertOrder(env.DB, orderData);

      // Record rate limit attempts for phone throttling
      await Promise.all([
        recordFailedAttempt(`order_ph_burst:${cleanPhone}`, 2, 60, env.DB),
        recordFailedAttempt(`order_ph_hour:${cleanPhone}`, 6, 3600, env.DB),
      ]);

      // Cache for idempotency & rapid duplicate avoidance (both persistent D1 and memory)
      if (idempotencyKey) {
        orderIdempotencyMap.set(idempotencyKey, { order: saved, timestamp: Date.now() });
        if (env.DB) {
          try {
            const idempotentPayload = {
              success: true,
              message: `Order #${saved.orderNumber} successfully retrieved (idempotent request).`,
              order: sanitizeOrderForRole(saved, false),
              idempotent: true,
            };
            await env.DB.prepare(`
              INSERT INTO order_idempotency (key, order_id, order_number, response_json, created_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET response_json = excluded.response_json
            `).bind(idempotencyKey, saved.id, saved.orderNumber, JSON.stringify(idempotentPayload), Date.now()).run();
          } catch (idemSaveErr) {
            console.error('[Idempotency Error] Error saving order_idempotency to D1:', idemSaveErr);
          }
        }
      }
      orderRecentSubmissionMap.set(doubleClickFingerprint, { order: saved, timestamp: Date.now() });

      return jsonResponse(
        {
          success: true,
          message: `Order #${saved.orderNumber} placed successfully!`,
          order: sanitizeOrderForRole(saved, false),
        },
        201
      );
    } catch (err: any) {
      logServerError({
        route: '/api/orders',
        method: 'POST',
        error: err,
        userId: verifiedTokenUser?.userId,
        extra: { clientIp },
      });
      if (err instanceof SyntaxError || err?.name === 'SyntaxError') {
        return jsonResponse({ success: false, error: 'Malformed JSON payload. Please provide valid JSON.' }, 400);
      }
      const errMsg = err?.message || '';
      const isClientValidationError = [
        'required',
        'Bangladeshi contact phone number',
        'restricted for this contact number',
        'Daily order limit',
        'at least one item',
        'missing a valid product ID',
        'Invalid item quantity',
        'Insufficient stock',
        'sold out during checkout',
        'does not exist',
        'already exists',
      ].some((pattern) => errMsg.includes(pattern));

      const hasSqlOrDbLeak = /sqlite|syntax error|d1_error|table |column |foreign key|prepare|bind|database/i.test(errMsg);
      if (isClientValidationError && !hasSqlOrDbLeak) {
        return jsonResponse({ success: false, error: errMsg }, 400);
      }
      return jsonResponse({ success: false, error: 'Unable to place the order right now. Please try again.' }, 500);
    }
  }

  const orderIdMatch = path.match(/^\/api\/orders\/([^/]+)$/);
  if (orderIdMatch) {
    const orderId = decodeURIComponent(orderIdMatch[1]);

    if (method === 'GET') {
      try {
        const authRes = await requireAuth(request, env);

        // 1. If authenticated admin: allow access according to role and permissions
        if (
          !authRes.errorResponse &&
          authRes.auth &&
          (authRes.auth.role === 'super_admin' ||
            hasPermission(authRes.auth, 'order.view') ||
            hasPermission(authRes.auth, 'order.manage'))
        ) {
          const order = await getOrderById(env.DB, orderId);
          if (!order) return jsonResponse({ success: false, error: 'Order not found' }, 404);

          const isSuperAdmin = authRes.auth.role === 'super_admin';
          const canViewBuyingPrice = hasPermission(authRes.auth, 'product.view_buying_price') || isSuperAdmin;
          const canViewProfit = hasPermission(authRes.auth, 'report.profit') || hasPermission(authRes.auth, 'product.view_profit') || isSuperAdmin;
          return jsonResponse({
            success: true,
            order: sanitizeOrderForRole(order, { isSuperAdmin, canViewBuyingPrice, canViewProfit }),
          });
        }

        // 2. If authenticated customer viewing their own order
        if (!authRes.errorResponse && authRes.auth) {
          const order = await getOrderById(env.DB, orderId);
          if (
            order &&
            ((order.userId && authRes.auth.dbUser.id === order.userId) ||
              (order.userEmail && authRes.auth.dbUser.email.toLowerCase() === order.userEmail.toLowerCase()))
          ) {
            return jsonResponse({ success: true, order: sanitizeOrderForRole(order, false) });
          }
        }

        // 3. Public customer order tracking (unauthenticated)
        const isDev = isDevEnvironment(env);
        const clientIp = getClientIp(request, isDev);

        // A. Check failure cooldown (prevents brute-force)
        const cooldownCheck = await checkRateLimit(`track_cd:${clientIp}`, 1, TRACKING_COOLDOWN_SECONDS, env.DB);
        if (!cooldownCheck.allowed) {
          const rem = cooldownCheck.remainingSeconds || TRACKING_COOLDOWN_SECONDS;
          return jsonResponse(
            {
              success: false,
              error: `Too many failed tracking attempts. Please wait ${rem} seconds before trying again.`,
              isRateLimited: true,
              retryAfter: rem,
            },
            429,
            {
              'Retry-After': String(rem),
              'X-RateLimit-Limit': String(TRACKING_FAIL_LIMIT),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + rem),
            }
          );
        }

        // B. Check general request volume (rate-limits both successful and failed lookups)
        const volCheck = await checkRateLimit(`track_vol:${clientIp}`, TRACKING_REQ_LIMIT, TRACKING_REQ_WINDOW, env.DB);
        if (!volCheck.allowed) {
          const rem = volCheck.remainingSeconds || TRACKING_REQ_WINDOW;
          return jsonResponse(
            {
              success: false,
              error: 'Too many tracking requests. Please slow down and try again later.',
              isRateLimited: true,
              retryAfter: rem,
            },
            429,
            {
              'Retry-After': String(rem),
              'X-RateLimit-Limit': String(TRACKING_REQ_LIMIT),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + rem),
            }
          );
        }

        // C. Validate tracking credentials (both order number AND phone number required)
        const verifyPhone = (url.searchParams.get('phone') || '').replace(/\D/g, '');
        if (!verifyPhone || verifyPhone.length < 11) {
          await recordFailedAttempt(`track_vol:${clientIp}`, TRACKING_REQ_LIMIT, TRACKING_REQ_WINDOW, env.DB);
          await recordFailedAttempt(`track_fail:${clientIp}`, TRACKING_FAIL_LIMIT, TRACKING_FAIL_WINDOW, env.DB);
          return jsonResponse(
            {
              success: false,
              error: 'Both Order Number and valid 11-digit contact number are required for order tracking.',
            },
            400
          );
        }

        // D. Target order lookup limiter (prevents distributed brute-forcing of a single order)
        const targetKey = `track_ord:${orderId.toLowerCase()}`;
        const targetCheck = await checkRateLimit(targetKey, TRACKING_ORDER_LIMIT, TRACKING_ORDER_WINDOW, env.DB);
        if (!targetCheck.allowed) {
          const rem = targetCheck.remainingSeconds || TRACKING_ORDER_WINDOW;
          return jsonResponse(
            {
              success: false,
              error: 'Too many lookup attempts for this order. Please try again later.',
              isRateLimited: true,
              retryAfter: rem,
            },
            429,
            {
              'Retry-After': String(rem),
            }
          );
        }

        // Record attempt in volume and target order rate limiters
        await recordFailedAttempt(`track_vol:${clientIp}`, TRACKING_REQ_LIMIT, TRACKING_REQ_WINDOW, env.DB);
        await recordFailedAttempt(targetKey, TRACKING_ORDER_LIMIT, TRACKING_ORDER_WINDOW, env.DB);

        // Fetch order from D1
        const order = await getOrderById(env.DB, orderId);
        const cleanOrderPhone = (order?.customer?.phone || '').replace(/\D/g, '');
        const isMatch = Boolean(order && cleanOrderPhone.length >= 11 && cleanOrderPhone.endsWith(verifyPhone.slice(-11)));

        if (!isMatch) {
          // Increment failed attempt count for cooldown tracking
          const failKey = `track_fail:${clientIp}`;
          await recordFailedAttempt(failKey, TRACKING_FAIL_LIMIT, TRACKING_FAIL_WINDOW, env.DB);

          // Check if failure limit reached; if so, trigger cooldown
          const memEntry = loginAttemptMap.get(failKey);
          if (memEntry && memEntry.count >= TRACKING_FAIL_LIMIT) {
            await recordFailedAttempt(`track_cd:${clientIp}`, 1, TRACKING_COOLDOWN_SECONDS, env.DB);
          }

          // Anti-enumeration: exact same response whether order does not exist or phone is wrong
          return jsonResponse(
            {
              success: false,
              error: 'Order not found or contact number does not match.',
            },
            404
          );
        }

        // On successful match, clear consecutive failures for this client IP
        await clearFailedAttempts(`track_fail:${clientIp}`, env.DB);

        // Return privacy-hardened public tracking payload
        return jsonResponse({
          success: true,
          order: sanitizeOrderForPublicTracking(order!),
        }, 200, {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
          'Vary': 'Origin',
        });
      } catch (err: any) {
        console.error('Error processing tracking request:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'PATCH' || method === 'PUT') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;

      try {
        const body = (await request.json()) as { updates?: Partial<Order> } & Partial<Order>;
        const updates: Partial<Order> = body.updates || body;
        const updateKeys = Object.keys(updates);

        // Check if this is a cancellation request
        const isCancellation =
          (updates.shippingStatus === 'Cancelled' || (updates as any).orderStatus === 'Cancelled' || (updates as any).status === 'Cancelled') &&
          updateKeys.every((k) => ['shippingStatus', 'orderStatus', 'status', 'notes', 'cancellationReason', 'updatedAt'].includes(k));

        // Check if this is only a status update (shipping/payment/courier status)
        const isStatusOnly = updateKeys.every((k) =>
          ['shippingStatus', 'courierStatus', 'paymentStatus', 'courierWaybill', 'consignmentId', 'lastCourierSync', 'updatedAt'].includes(k)
        );

        if (isCancellation) {
          if (!hasPermission(auth!, 'order.cancel') && !hasPermission(auth!, 'order.manage') && auth!.role !== 'super_admin') {
            return jsonResponse({ success: false, error: 'Forbidden: Order cancellation permission required.', requiredPermission: 'order.cancel' }, 403);
          }
        } else if (isStatusOnly) {
          if (!hasPermission(auth!, 'order.status_change') && !hasPermission(auth!, 'order.manage') && auth!.role !== 'super_admin') {
            return jsonResponse({ success: false, error: 'Forbidden: Order status change permission required.', requiredPermission: 'order.status_change' }, 403);
          }
        } else {
          const permErr = requirePermission(auth!, 'order.manage');
          if (permErr) return permErr;
        }

        const updated = await updateOrderInD1(env.DB, orderId, updates);
        const isSuperAdmin = auth!.role === 'super_admin';
        const canViewBuyingPrice = hasPermission(auth!, 'product.view_buying_price') || isSuperAdmin;
        const canViewProfit = hasPermission(auth!, 'report.profit') || hasPermission(auth!, 'product.view_profit') || isSuperAdmin;

        return jsonResponse({
          success: true,
          message: `Order #${updated.orderNumber} updated successfully!`,
          order: sanitizeOrderForRole(updated, { isSuperAdmin, canViewBuyingPrice, canViewProfit }),
        });
      } catch (err: any) {
        logServerError({ route: path, method, error: err, action: 'order.update', orderId });
        if (err?.message?.includes('not found')) {
          return jsonResponse({ success: false, error: 'Order not found' }, 404);
        }
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'DELETE') {
      const { auth, errorResponse } = await requireAuth(request, env);
      if (errorResponse) return errorResponse;
      const permErr = requirePermission(auth!, 'order.delete');
      if (permErr) return permErr;

      try {
        await deleteOrderFromD1(env.DB, orderId);
        return jsonResponse({
          success: true,
          message: `Order #${orderId} deleted successfully.`,
        });
      } catch (err: any) {
        logServerError({ route: path, method, error: err, action: 'order.delete', orderId });
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  // ==========================================
  // 9. COURIER PROXY ROUTES (Secure Server-Side Steadfast Integration)
  // ==========================================

  // Check courier credentials migration status (Worker secrets vs D1 legacy storage)
  if (path === '/api/admin/courier/credentials/status' && method === 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const canCheck = auth!.role === 'super_admin' || hasPermission(auth!, 'courier.configure') || hasPermission(auth!, 'settings.manage');
    if (!canCheck) {
      return jsonResponse({ success: false, error: 'Forbidden: Courier configuration permission required.' }, 403);
    }

    const legacyReport = await detectLegacyD1CourierCredentials(env.DB);
    const hasWorkerApiKey = Boolean(env.STEADFAST_API_KEY && env.STEADFAST_API_KEY.trim().length > 0);
    const hasWorkerSecretKey = Boolean(env.STEADFAST_SECRET_KEY && env.STEADFAST_SECRET_KEY.trim().length > 0);
    const hasWorkerWebhookSecret = Boolean(env.COURIER_WEBHOOK_SECRET && env.COURIER_WEBHOOK_SECRET.trim().length > 0);

    return jsonResponse({
      success: true,
      workerSecretsConfigured: {
        apiKey: hasWorkerApiKey,
        secretKey: hasWorkerSecretKey,
        webhookSecret: hasWorkerWebhookSecret,
      },
      legacyD1Credentials: {
        detected: legacyReport.hasLegacyCredentials,
        hasApiKey: legacyReport.hasLegacyApiKey,
        hasSecretKey: legacyReport.hasLegacySecretKey,
      },
      migrationSafe: hasWorkerApiKey && hasWorkerSecretKey,
      instructions: 'Configure Cloudflare Worker Secrets: npx wrangler secret put STEADFAST_API_KEY and npx wrangler secret put STEADFAST_SECRET_KEY. Then trigger cleanup via POST /api/admin/courier/cleanup-legacy-credentials.',
    });
  }

  // Safely cleanup legacy courier credentials from D1 after migration
  if (path === '/api/admin/courier/cleanup-legacy-credentials' && method === 'POST') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const canManage = auth!.role === 'super_admin' || hasPermission(auth!, 'settings.manage');
    if (!canManage) {
      return jsonResponse({ success: false, error: 'Forbidden: Settings manage permission required.' }, 403);
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const hasWorkerApiKey = Boolean(env.STEADFAST_API_KEY && env.STEADFAST_API_KEY.trim().length > 0);

    if (!hasWorkerApiKey && !body?.force) {
      return jsonResponse({
        success: false,
        error: 'Cannot cleanup legacy D1 credentials before Cloudflare Worker Secret STEADFAST_API_KEY is configured. Pass { "force": true } if you intend to remove them without worker secrets.',
      }, 400);
    }

    const cleanupResult = await cleanupLegacyCourierCredentialsFromD1(env.DB);

    await insertAuditLogInD1(env.DB, {
      actorId: auth!.dbUser?.id || auth!.tokenUser?.userId || 'admin',
      actorEmail: auth!.dbUser?.email || auth!.tokenUser?.email || 'admin@local',
      actorRole: auth!.role,
      action: 'COURIER_CREDENTIALS_MIGRATION_CLEANUP',
      targetId: 'store_settings:default',
      targetType: 'settings',
      details: 'Legacy plaintext courier credentials safely removed from D1 store_settings table.',
      ipAddress: getClientIp(request),
    }).catch((err) => console.warn('Audit log write error:', err));

    return jsonResponse({
      success: true,
      cleaned: cleanupResult.cleaned,
      message: cleanupResult.message,
    });
  }

  if (path === '/api/courier/steadfast/test' && method === 'POST') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const permErr = requirePermission(auth!, 'courier.configure');
    if (permErr) return permErr;

    try {
      const body = (await request.json().catch(() => ({}))) as any;
      const apiKey = (body?.apiKey || env.STEADFAST_API_KEY || '').trim();
      const secretKey = (body?.secretKey || env.STEADFAST_SECRET_KEY || '').trim();
      const baseUrl = body?.baseUrl;

      if (!apiKey || !secretKey) {
        return jsonResponse({
          success: false,
          error: 'Steadfast Courier API credentials are not configured in Worker secrets or provided in request.',
        }, 400);
      }

      // Test real connection via resilient get_balance endpoint
      const callResult = await callSteadfastApi('get_balance', { apiKey, secretKey, baseUrl });
      const sfData = callResult.data || {};

      if (callResult.ok && (sfData.status === 200 || sfData.current_balance !== undefined || sfData.balance !== undefined)) {
        return jsonResponse({
          success: true,
          message: 'Connected successfully to Steadfast Courier API! (200 OK)',
          current_balance: sfData.current_balance ?? sfData.balance ?? 0,
          data: sfData,
        });
      }

      const rawError = callResult.error || sfData.message || 'Failed to connect to Steadfast Courier API';
      const cleanError = typeof rawError === 'string' && rawError.length < 300 && !/secret|key|token|stack|\.ts/i.test(rawError)
        ? rawError
        : 'Failed to connect to Steadfast Courier API';
      return jsonResponse({
        success: false,
        error: cleanError,
      }, 400);
    } catch (err: any) {
      console.error('Failed to communicate with Steadfast API:', err);
      return jsonResponse({
        success: false,
        error: 'Internal server error.',
      }, 500);
    }
  }

  if (path === '/api/courier/dispatch' && method === 'POST') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const permErr = requirePermission(auth!, 'courier.booking');
    if (permErr) return permErr;

    try {
      const body = (await request.json()) as any;
      const orderParam = body.order as Order;
      const parcelData = body.parcelData || {};

      if (!orderParam || (!orderParam.id && !orderParam.orderNumber)) {
        return jsonResponse({ success: false, error: 'Order details are required for courier dispatch.' }, 400);
      }

      // Read authoritative order from Cloudflare D1
      const order = await getOrderById(env.DB, orderParam.id || orderParam.orderNumber);
      if (!order) {
        return jsonResponse({ success: false, error: 'Order not found.' }, 404);
      }

      // Retrieve server credentials strictly from server environment or D1
      const settings = await getStoreSettings(env.DB);
      const courierParam = body.courier || {};
      const courierCode = String(courierParam.code || courierParam.name || body.courierCode || parcelData.courier || 'Steadfast').toLowerCase();
      const isSteadfast = courierCode.includes('steadfast');
      const courierName = courierParam.name || (isSteadfast ? 'Steadfast Courier' : (courierParam.code || 'Courier'));

      // Format recipient address from authoritative D1 order
      const rawAddress = (parcelData.recipient_address || order.customer.fullAddress || '').trim();
      const rawArea = (parcelData.area || '').trim();
      const rawDistrict = (parcelData.district || order.customer.district || '').trim();
      const addressParts: string[] = [rawAddress];
      if (rawArea && !rawAddress.toLowerCase().includes(rawArea.toLowerCase())) {
        addressParts.push(rawArea);
      }
      if (rawDistrict && !rawAddress.toLowerCase().includes(rawDistrict.toLowerCase())) {
        addressParts.push(rawDistrict);
      }
      const combinedAddress = addressParts.filter(Boolean).join(', ').substring(0, 250);

      // Description & lot
      let itemDescription = (parcelData.item_description || '').trim();
      let totalLot = parcelData.total_lot != null ? Number(parcelData.total_lot) : 0;
      if (!itemDescription && Array.isArray(order.items) && order.items.length > 0) {
        itemDescription = order.items.map((it) => `${it.product?.title || 'Product'} x ${it.quantity}`).join(', ');
      }
      if (!totalLot && Array.isArray(order.items)) {
        totalLot = order.items.reduce((sum, it) => sum + (it.quantity || 1), 0);
      }

      // Authoritative COD calculation from D1 order
      let codAmount: number;
      if (parcelData.cod_amount !== undefined && parcelData.cod_amount !== null) {
        codAmount = Number(parcelData.cod_amount);
      } else {
        const isPrepaid = order.paymentStatus === 'PAID' || order.paymentStatus === 'Paid';
        codAmount = isPrepaid ? 0 : Number(order.totalAmount) || 0;
      }

      const recipientPhone = (parcelData.recipient_phone || order.customer.phone || '').replace(/[^0-9]/g, '');

      if (isSteadfast) {
        // Production Steadfast credentials must come exclusively from Cloudflare Worker secrets
        const apiKey = (env.STEADFAST_API_KEY || '').trim();
        const secretKey = (env.STEADFAST_SECRET_KEY || '').trim();

        if (!apiKey || !secretKey) {
          return jsonResponse({
            success: false,
            error: 'Steadfast Courier API credentials are not configured in Worker secrets.',
          }, 400);
        }

        // Build Steadfast payload
        const steadfastPayload: Record<string, any> = {
          invoice: String(parcelData.invoice || order.orderNumber),
          recipient_name: String(parcelData.recipient_name || order.customer.fullName).trim(),
          recipient_phone: recipientPhone,
          recipient_address: combinedAddress,
          cod_amount: codAmount,
          delivery_type: parcelData.delivery_type === 1 ? 1 : 0,
        };

        if (parcelData.alternative_phone) {
          const altPhone = String(parcelData.alternative_phone).replace(/[^0-9]/g, '');
          if (altPhone) steadfastPayload.alternative_phone = altPhone;
        }
        if (parcelData.recipient_email) {
          steadfastPayload.recipient_email = String(parcelData.recipient_email).trim();
        }
        const note = (parcelData.note || order.customer.notes || `Order #${order.orderNumber} - Rongdhonu Trade`).trim();
        if (note) steadfastPayload.note = note;
        if (itemDescription) steadfastPayload.item_description = itemDescription.substring(0, 200);
        if (totalLot > 0) steadfastPayload.total_lot = totalLot;
        if (parcelData.weight != null && Number(parcelData.weight) > 0) {
          steadfastPayload.weight = Number(parcelData.weight);
        }

        // Dispatch to Steadfast via resilient multi-gateway handler
        const sfResult = await callSteadfastApi('create_order', { apiKey, secretKey, baseUrl: courierParam.baseUrl }, {
          method: 'POST',
          body: steadfastPayload,
        });

        const sfData = sfResult.data || {};

        if (sfResult.ok && (sfData.status === 200 || sfData.consignment)) {
          const consignment = sfData.consignment || sfData;
          const trackingCode = (consignment.tracking_code || '').trim();
          const consignmentId = String(consignment.consignment_id || consignment.id || '').trim();

          if (!trackingCode || !consignmentId) {
            return jsonResponse({
              success: false,
              error: 'Steadfast booking failed: API response did not contain a valid tracking code or consignment ID. Order remains unbooked.',
            }, 400);
          }

          // Persist courier details to Cloudflare D1 order record
          await updateOrderInD1(env.DB, order.id, {
            consignmentId,
            courierWaybill: trackingCode,
            courierName: courierName || 'Steadfast',
            courierStatus: 'In Transit',
            shippingStatus: 'Shipped',
            lastCourierSync: new Date().toISOString(),
            courierBooking: {
              provider: courierName || 'Steadfast',
              waybillId: trackingCode,
              trackingUrl: `https://steadfast.com.bd/t/${trackingCode}`,
              consignmentId,
              bookedAt: new Date().toISOString(),
            },
          }).catch((err) => console.error('Error saving courier tracking to D1 order:', err));

          return jsonResponse({
            success: true,
            tracking_code: trackingCode,
            consignment_id: consignmentId,
            message: `Order dispatched to ${courierName} successfully!`,
          });
        }

        const rawDetail = sfResult.error || sfData.message || (sfData.errors ? (typeof sfData.errors === 'string' ? sfData.errors : JSON.stringify(sfData.errors)) : 'Steadfast dispatch failed. Please check order details.');
        const errorDetail = typeof rawDetail === 'string' && rawDetail.length < 300 && !/sqlite|token|secret|stack|\.ts/i.test(rawDetail)
          ? rawDetail
          : 'Steadfast dispatch failed. Please check order details.';
        return jsonResponse({
          success: false,
          error: errorDetail,
        }, 400);
      }

      // Handling for non-Steadfast couriers (Pathao, RedX, Paperfly, or custom courier)
      const apiKey = (courierParam.apiKey || body.apiKey || parcelData.apiKey || '').trim();
      const secretKey = (courierParam.secretKey || body.secretKey || parcelData.secretKey || '').trim();
      const baseUrl = (courierParam.baseUrl || body.baseUrl || parcelData.baseUrl || '').trim();
      const trackingPattern = (courierParam.trackingUrlPattern || '').trim() || 'https://steadfast.com.bd/t/{trackingCode}';

      if (!apiKey) {
        return jsonResponse({
          success: false,
          error: `${courierName} API credentials are not configured. Please enter API Key or configure it in Courier APIs tab.`,
        }, 400);
      }

      let trackingCode = '';
      let consignmentId = '';

      if (baseUrl) {
        try {
          const cleanBase = baseUrl.replace(/\/+$/, '');
          const endpoint = cleanBase.includes('/v1') || cleanBase.includes('/api') ? `${cleanBase}/orders` : `${cleanBase}/api/v1/orders`;
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
            'Api-Key': apiKey,
          };
          if (secretKey) {
            headers['Secret-Key'] = secretKey;
            headers['X-Secret-Key'] = secretKey;
          }

          const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              invoice: String(parcelData.invoice || order.orderNumber),
              recipient_name: String(parcelData.recipient_name || order.customer.fullName).trim(),
              recipient_phone: recipientPhone,
              recipient_address: combinedAddress,
              cod_amount: codAmount,
              note: parcelData.note || order.customer.notes || `Order #${order.orderNumber}`,
              weight: Number(parcelData.weight) || 0.5,
              items_count: totalLot || 1,
            }),
            signal: AbortSignal.timeout(12000),
          });

          if (response.ok) {
            const data: any = await response.json().catch(() => ({}));
            trackingCode = (data.tracking_code || data.trackingCode || data.consignment_id || data.id || '').trim();
            consignmentId = String(data.consignment_id || data.consignmentId || data.id || '').trim();
          } else if (response.status === 401 || response.status === 403) {
            const data: any = await response.json().catch(() => ({}));
            return jsonResponse({
              success: false,
              error: data.message || `Invalid API credentials for ${courierName}. Please check API Key and Secret.`,
            }, 400);
          }
        } catch {}
      }

      if (!trackingCode || !consignmentId) {
        return jsonResponse({
          success: false,
          error: `Courier booking failed: ${courierName} did not return a valid tracking code or consignment ID. Order remains in Pending state.`,
        }, 400);
      }

      const trackingUrl = trackingPattern.includes('{trackingCode}')
        ? trackingPattern.replace('{trackingCode}', trackingCode)
        : `${trackingPattern}/${trackingCode}`;

      await updateOrderInD1(env.DB, order.id, {
        consignmentId,
        courierWaybill: trackingCode,
        courierName,
        courierStatus: 'In Transit',
        shippingStatus: 'Shipped',
        lastCourierSync: new Date().toISOString(),
        courierBooking: {
          provider: courierName,
          waybillId: trackingCode,
          trackingUrl,
          consignmentId,
          bookedAt: new Date().toISOString(),
        },
      }).catch((err) => console.error('Error saving courier tracking to D1 order:', err));

      return jsonResponse({
        success: true,
        tracking_code: trackingCode,
        consignment_id: consignmentId,
        message: `Order dispatched to ${courierName} successfully!`,
      });
    } catch (err: any) {
      return jsonResponse({ success: false, error: 'Courier dispatch failed. Please try again.' }, 500);
    }
  }

  const courierStatusMatch = path.match(/^\/api\/courier\/(?:steadfast\/)?status\/([^/]+)$/);
  if (courierStatusMatch && method === 'GET') {
    const cid = decodeURIComponent(courierStatusMatch[1]).trim();
    const { auth, errorResponse } = await requireAuth(request, env);
    const hasTrackingPerm =
      !errorResponse &&
      auth &&
      (auth.role === 'super_admin' || hasPermission(auth, 'courier.tracking'));

    if (!hasTrackingPerm) {
      const clientIp = getClientIp(request);

      // Check cooldown
      const cooldownCheck = await checkRateLimit(`track_cd:${clientIp}`, 1, TRACKING_COOLDOWN_SECONDS, env.DB);
      if (!cooldownCheck.allowed) {
        const rem = cooldownCheck.remainingSeconds || TRACKING_COOLDOWN_SECONDS;
        return jsonResponse(
          {
            success: false,
            error: `Too many failed tracking attempts. Please wait ${rem} seconds before trying again.`,
            isRateLimited: true,
            retryAfter: rem,
          },
          429,
          { 'Retry-After': String(rem) }
        );
      }

      // Check volume limit
      const volCheck = await checkRateLimit(`track_vol:${clientIp}`, TRACKING_REQ_LIMIT, TRACKING_REQ_WINDOW, env.DB);
      if (!volCheck.allowed) {
        const rem = volCheck.remainingSeconds || TRACKING_REQ_WINDOW;
        return jsonResponse(
          {
            success: false,
            error: 'Too many tracking requests. Please slow down and try again later.',
            isRateLimited: true,
            retryAfter: rem,
          },
          429,
          { 'Retry-After': String(rem) }
        );
      }

      // Customer tracking strictly requires valid 11-digit phone
      const verifyPhone = (url.searchParams.get('phone') || '').replace(/\D/g, '');
      if (!verifyPhone || verifyPhone.length < 11) {
        await recordFailedAttempt(`track_vol:${clientIp}`, TRACKING_REQ_LIMIT, TRACKING_REQ_WINDOW, env.DB);
        await recordFailedAttempt(`track_fail:${clientIp}`, TRACKING_FAIL_LIMIT, TRACKING_FAIL_WINDOW, env.DB);
        return jsonResponse(
          { success: false, error: 'Valid 11-digit contact number is required to view courier tracking.' },
          400
        );
      }

      await recordFailedAttempt(`track_vol:${clientIp}`, TRACKING_REQ_LIMIT, TRACKING_REQ_WINDOW, env.DB);

      const orderRow = await env.DB.prepare(
        "SELECT customer_phone FROM orders WHERE consignment_id = ? OR courier_waybill = ? LIMIT 1"
      ).bind(cid, cid).first<{ customer_phone: string }>();

      const cleanRowPhone = (orderRow?.customer_phone || '').replace(/\D/g, '');
      if (!orderRow || cleanRowPhone.length < 11 || !cleanRowPhone.endsWith(verifyPhone.slice(-11))) {
        const failKey = `track_fail:${clientIp}`;
        await recordFailedAttempt(failKey, TRACKING_FAIL_LIMIT, TRACKING_FAIL_WINDOW, env.DB);
        const memEntry = loginAttemptMap.get(failKey);
        if (memEntry && memEntry.count >= TRACKING_FAIL_LIMIT) {
          await recordFailedAttempt(`track_cd:${clientIp}`, 1, TRACKING_COOLDOWN_SECONDS, env.DB);
        }
        return jsonResponse(
          { success: false, error: 'Tracking information not found or contact number does not match.' },
          404
        );
      }

      await clearFailedAttempts(`track_fail:${clientIp}`, env.DB);
    }

    const apiKey = (env.STEADFAST_API_KEY || '').trim();
    const secretKey = (env.STEADFAST_SECRET_KEY || '').trim();

    if (!apiKey || !secretKey) {
      return jsonResponse({
        success: false,
        error: 'Courier service temporarily unavailable (Worker secrets unconfigured).',
      }, 503);
    }

    try {
      const sfResult = await callSteadfastApi(`status_by_cid/${cid}`, { apiKey, secretKey });
      if (sfResult.ok) {
        if (hasTrackingPerm) {
          return jsonResponse({ success: true, data: sfResult.data });
        }
        const sfData = sfResult.data?.delivery_status || sfResult.data?.status_name || sfResult.data;
        const normalized = normalizeSteadfastStatus(typeof sfData === 'string' ? sfData : sfData?.delivery_status || 'in_transit');
        return jsonResponse({
          success: true,
          deliveryStatus: normalized,
          courierStatus: sfResult.data?.delivery_status || normalized,
          consignmentId: cid,
        });
      }
      return jsonResponse({ success: false, error: 'Failed to fetch tracking status from courier' }, 400);
    } catch {
      return jsonResponse({ success: false, error: 'Courier service temporarily unavailable.' }, 503);
    }
  }

  // ==========================================
  // 9B. COURIER AUTOMATIC & ON-DEMAND SYNC ROUTES
  // ==========================================
  if (path === '/api/courier/sync' && method === 'POST') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const canSync = auth!.role === 'super_admin' || hasPermission(auth!, 'courier.status_sync');
    if (!canSync) {
      return jsonResponse({ success: false, error: 'Forbidden: Courier status sync permission required.', requiredPermission: 'courier.status_sync' }, 403);
    }

    const apiKey = (env.STEADFAST_API_KEY || '').trim();
    const secretKey = (env.STEADFAST_SECRET_KEY || '').trim();

    if (!apiKey || !secretKey) {
      return jsonResponse({ success: false, error: 'Steadfast Courier API credentials are not configured in Worker secrets.' }, 400);
    }

    try {
      const result = await syncAllActiveCourierOrders(env.DB, { apiKey, secretKey });
      return jsonResponse({
        success: true,
        message: `Courier synchronization complete. Checked ${result.totalChecked} orders, updated ${result.updatedCount}.`,
        ...result,
      });
    } catch (err: any) {
      console.error('Courier sync failed:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  const syncSingleMatch = path.match(/^\/api\/courier\/sync\/([^/]+)$/);
  if (syncSingleMatch && method === 'POST') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const canSync = auth!.role === 'super_admin' || hasPermission(auth!, 'courier.status_sync');
    if (!canSync) {
      return jsonResponse({ success: false, error: 'Forbidden: Courier status sync permission required.', requiredPermission: 'courier.status_sync' }, 403);
    }

    const ordId = decodeURIComponent(syncSingleMatch[1]);
    const apiKey = (env.STEADFAST_API_KEY || '').trim();
    const secretKey = (env.STEADFAST_SECRET_KEY || '').trim();

    if (!apiKey || !secretKey) {
      return jsonResponse({ success: false, error: 'Steadfast Courier API credentials are not configured in Worker secrets.' }, 400);
    }

    try {
      const result = await syncSingleOrderCourierStatus(env.DB, ordId, { apiKey, secretKey });
      if (!result.success) {
        return jsonResponse({ success: false, error: result.error }, 400);
      }
      const isSuperAdmin = auth!.role === 'super_admin';
      const canViewBuyingPrice = hasPermission(auth!, 'product.view_buying_price') || isSuperAdmin;
      const canViewProfit = hasPermission(auth!, 'report.profit') || hasPermission(auth!, 'product.view_profit') || isSuperAdmin;

      return jsonResponse({
        success: true,
        message: result.message,
        order: sanitizeOrderForRole(result.order!, { isSuperAdmin, canViewBuyingPrice, canViewProfit }),
      });
    } catch (err: any) {
      console.error('Failed to sync order:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  // ==========================================
  // 9B-1. INCOMING COURIER WEBHOOK LISTENER (Steadfast & Logistics Delivery Updates)
  // Endpoints: /api/webhook, /api/webhooks, /api/webhook/steadfast, /api/webhook/courier, /api/courier/webhook, /api/webhooks/courier-added
  // ==========================================
  const normalizedWebhookPath = path.replace(/\/+$/, '');
  const isAdminCourierWebhooksEndpoint =
    normalizedWebhookPath === '/api/courier/webhooks' ||
    normalizedWebhookPath === '/api/courier/webhooks/test' ||
    normalizedWebhookPath === '/api/courier/webhooks/trigger';

  const isIncomingWebhook =
    !isAdminCourierWebhooksEndpoint &&
    (normalizedWebhookPath === '/api/webhook' ||
      normalizedWebhookPath === '/api/webhooks' ||
      normalizedWebhookPath === '/api/webhook/steadfast' ||
      normalizedWebhookPath === '/api/courier/webhook/steadfast' ||
      normalizedWebhookPath === '/api/courier/webhook' ||
      normalizedWebhookPath === '/api/courier/webhooks/listener' ||
      normalizedWebhookPath === '/api/webhook/courier' ||
      normalizedWebhookPath.startsWith('/api/webhook/') ||
      normalizedWebhookPath.startsWith('/api/courier/webhook/'));

  if (isIncomingWebhook) {
    if (method === 'GET') {
      return jsonResponse({
        success: true,
        status: 'active',
        endpoint: path,
        service: 'Rongdhonu Trade Courier Webhook Listener',
        message: 'Courier webhook listener is online and ready to receive delivery status notifications and courier lifecycle events.',
        supportedCouriers: ['Steadfast', 'Pathao', 'RedX', 'Paperfly', 'eCourier'],
        timestamp: new Date().toISOString(),
      });
    }

    if (method === 'POST') {
      try {
        const rawBody = await request.text();
        const settings = await getStoreSettings(env.DB).catch(() => ({} as any));

        // CRITICAL SECURITY: Authenticate webhook request before parsing or modifying any order
        const authResult = await verifyCourierWebhookAuth(
          {
            rawBody,
            headers: request.headers,
            url: request.url,
          },
          env,
          settings
        );

        if (!authResult.authenticated) {
          return jsonResponse(
            {
              success: false,
              error: authResult.error || 'Unauthorized: Courier webhook authentication failed.',
            },
            authResult.status || 401
          );
        }

        let body: any = {};
        if (rawBody && rawBody.trim()) {
          try {
            body = JSON.parse(rawBody);
          } catch {
            return jsonResponse({ success: false, error: 'Malformed JSON payload.' }, 400);
          }
        }

        const nowIso = new Date().toISOString();

        // 1. Extract Steadfast delivery update parameters
        const sfData = body?.data && typeof body.data === 'object' ? body.data : body;
        const consignmentId = sfData?.consignment_id || sfData?.consignmentId || sfData?.cid;
        const invoice = sfData?.invoice || sfData?.order_id || sfData?.orderId || sfData?.orderNumber;
        const trackingCode = sfData?.tracking_code || sfData?.trackingCode || sfData?.tracking;
        const rawStatus = sfData?.status || sfData?.delivery_status || sfData?.status_name;

        const eventType = String(body?.event || body?.notification_type || body?.type || body?.action || '').toLowerCase();
        const isDummyConsignment = consignmentId === 0 || consignmentId === '0' || consignmentId === 'test' || String(invoice).toLowerCase() === 'test';

        // Check if this is a test ping (Steadfast "Test Webhook", UI tester, or trigger verification)
        const isExplicitTestPing =
          body?.ping === true ||
          body?.ping === 'true' ||
          body?.test === true ||
          body?.test === 'true' ||
          body?.is_test === true ||
          eventType === 'test_ping' ||
          eventType === 'test.ping' ||
          eventType === 'ping' ||
          eventType === 'test' ||
          eventType === 'test_webhook' ||
          rawStatus === 'test' ||
          rawStatus === 'test_ping' ||
          Boolean(body?.courier);

        // Steadfast trigger test pings (courier.added, courier.updated, courier.dispatched without a real order update)
        const isSteadfastTriggerTest =
          (eventType === 'courier.added' ||
           eventType === 'courier.updated' ||
           eventType === 'courier.dispatched' ||
           eventType === 'courier.deleted') &&
          (!consignmentId || isDummyConsignment);

        const isEmptyProbe = !consignmentId && !invoice && !trackingCode && !rawStatus;

        const isTestWebhook = isExplicitTestPing || isSteadfastTriggerTest || isEmptyProbe;

        if (isTestWebhook) {
          // IMPORTANT: Steadfast Test Webhook and trigger pings do not mutate orders.
          // They must ALWAYS return HTTP 200 OK and MUST NEVER be rejected as 409 Conflict.
          return jsonResponse({
            success: true,
            status: 200,
            message: 'Webhook received',
            event: body?.event || body?.notification_type || body?.action || 'test_acknowledged',
            courier: body?.courier?.name || body?.courier?.code || 'steadfast',
            receivedAt: nowIso,
          });
        }

        // REPLAY PROTECTION: Fingerprint deduplication strictly for real order delivery updates
        const timestampHeader =
          request.headers.get('x-webhook-timestamp') ||
          request.headers.get('x-timestamp') ||
          request.headers.get('x-signature-timestamp') ||
          request.headers.get('x-req-timestamp') ||
          request.headers.get('x-steadfast-timestamp') ||
          request.headers.get('timestamp') ||
          request.headers.get('date') ||
          sfData?.timestamp ||
          sfData?.provider_updated_at ||
          sfData?.updated_at ||
          sfData?.created_at ||
          '';

        const sigOrSecret =
          request.headers.get('x-steadfast-signature') ||
          request.headers.get('x-webhook-signature') ||
          request.headers.get('x-signature') ||
          request.headers.get('x-hub-signature-256') ||
          request.headers.get('x-signature-sha256') ||
          request.headers.get('x-webhook-secret') ||
          request.headers.get('secret-key') ||
          (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
          '';

        const fingerprint = await computeWebhookFingerprint(rawBody, String(timestampHeader), sigOrSecret);
        if (env.DB) {
          const { isReplay } = await checkAndRecordWebhookFingerprint(env.DB, fingerprint, 600);
          if (isReplay) {
            return jsonResponse(
              {
                success: false,
                error: 'Webhook replay rejected: This webhook request has already been processed.',
              },
              409
            );
          }
        }

        // Find the corresponding order in D1
        const matchedOrder = await findOrderByCourierIdentifier(env.DB, {
          invoice,
          consignmentId,
          trackingCode,
        });

        if (!matchedOrder) {
          return jsonResponse({
            success: true,
            status: 200,
            message: `Webhook received. No matching order found for invoice="${invoice || ''}", consignmentId="${consignmentId || ''}".`,
            receivedAt: nowIso,
          });
        }

        // Normalize status
        const normalized = normalizeSteadfastStatus(rawStatus);
        const updates: Partial<Order> = {
          courierStatus: normalized.courierStatus,
          shippingStatus: normalized.shippingStatus as any,
          lastCourierSync: nowIso,
        };

        if (normalized.isDelivered && matchedOrder.paymentStatus !== 'PAID' && matchedOrder.paymentStatus !== 'Paid') {
          updates.paymentStatus = 'Paid';
        }

        if (matchedOrder.courierBooking) {
          updates.courierBooking = {
            ...matchedOrder.courierBooking,
            status: normalized.courierStatus,
            lastCheckedAt: nowIso,
          };
        }

        await updateOrderInD1(env.DB, matchedOrder.id, updates);

        try {
          await insertAuditLogInD1(env.DB, {
            actorId: 'webhook:steadfast',
            actorEmail: 'webhook@steadfast.com.bd',
            actorRole: 'webhook',
            action: 'ORDER_COURIER_WEBHOOK_UPDATE',
            targetId: matchedOrder.id,
            targetType: 'order',
            details: `Order #${matchedOrder.orderNumber} status updated to "${normalized.courierStatus}" via Steadfast webhook.`,
          });
        } catch {}

        return jsonResponse({
          success: true,
          status: 200,
          message: `Order #${matchedOrder.orderNumber} status updated to "${normalized.courierStatus}" successfully.`,
          orderId: matchedOrder.id,
          orderNumber: matchedOrder.orderNumber,
          courierStatus: normalized.courierStatus,
          shippingStatus: normalized.shippingStatus,
        });
      } catch (err: any) {
        console.error('Failed to process courier webhook:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  // ==========================================
  // 9B. COURIER WEBHOOKS ROUTES
  // ==========================================
  if (path === '/api/courier/webhooks' && method === 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const canManage = auth!.role === 'super_admin' || hasPermission(auth!, 'courier.configure') || hasPermission(auth!, 'settings.manage');
    if (!canManage) {
      return jsonResponse({ success: false, error: 'Forbidden: Permission required to view courier webhooks.', requiredPermission: 'courier.configure' }, 403);
    }

    try {
      const settings = await getStoreSettings(env.DB);
      const rawWebhooks = Array.isArray(settings.courierWebhooks) ? settings.courierWebhooks : [];
      return jsonResponse({
        success: true,
        webhooks: maskCourierWebhooks(rawWebhooks),
      });
    } catch (err: any) {
      console.error('Failed to load courier webhooks:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  if (path === '/api/courier/webhooks' && (method === 'POST' || method === 'PUT')) {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const canManage = auth!.role === 'super_admin' || hasPermission(auth!, 'courier.configure') || hasPermission(auth!, 'settings.manage');
    if (!canManage) {
      return jsonResponse({ success: false, error: 'Forbidden: Permission required to manage courier webhooks.', requiredPermission: 'courier.configure' }, 403);
    }

    try {
      const body = (await request.json().catch(() => ({}))) as any;
      const webhooks = Array.isArray(body?.webhooks) ? body.webhooks : [];
      const updated = await updateStoreSettingsInD1(env.DB, { courierWebhooks: webhooks });
      return jsonResponse({
        success: true,
        webhooks: maskCourierWebhooks(updated.courierWebhooks || []),
        message: 'Courier webhooks saved successfully.',
      });
    } catch (err: any) {
      console.error('Failed to save courier webhooks:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  if ((path === '/api/courier/webhooks' || path.startsWith('/api/courier/webhooks/')) && method === 'DELETE') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const canManage = auth!.role === 'super_admin' || hasPermission(auth!, 'courier.configure') || hasPermission(auth!, 'settings.manage');
    if (!canManage) {
      return jsonResponse({ success: false, error: 'Forbidden: Permission required to delete courier webhooks.', requiredPermission: 'courier.configure' }, 403);
    }

    try {
      const idToDelete = path.startsWith('/api/courier/webhooks/') ? path.replace('/api/courier/webhooks/', '').trim() : '';
      const body = (await request.json().catch(() => ({}))) as any;
      const targetId = idToDelete || body?.id;

      const existingSettings = await getStoreSettings(env.DB);
      const existingWebhooks = Array.isArray(existingSettings.courierWebhooks) ? existingSettings.courierWebhooks : [];
      const filtered = targetId ? existingWebhooks.filter((w) => w.id !== targetId) : [];
      const updated = await updateStoreSettingsInD1(env.DB, { courierWebhooks: filtered });

      return jsonResponse({
        success: true,
        webhooks: maskCourierWebhooks(updated.courierWebhooks || []),
        message: 'Courier webhook deleted successfully.',
      });
    } catch (err: any) {
      console.error('Failed to delete courier webhook:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  if (path === '/api/courier/webhooks/logs' && method === 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const canManage = auth!.role === 'super_admin' || hasPermission(auth!, 'courier.configure') || hasPermission(auth!, 'settings.manage');
    if (!canManage) {
      return jsonResponse({ success: false, error: 'Forbidden: Permission required to view courier webhook logs.', requiredPermission: 'courier.configure' }, 403);
    }

    return jsonResponse({
      success: true,
      logs: [],
    });
  }

  if (path === '/api/courier/webhooks/test' && method === 'POST') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const canManage = auth!.role === 'super_admin' || hasPermission(auth!, 'courier.configure') || hasPermission(auth!, 'settings.manage');
    if (!canManage) {
      return jsonResponse({ success: false, error: 'Forbidden: Permission required to test courier webhooks.', requiredPermission: 'courier.configure' }, 403);
    }

    try {
      const body = (await request.json().catch(() => ({}))) as any;
      const targetUrl = (body?.url || '').trim();
      let secret = (body?.secret || '').trim();
      const eventName = body?.event || 'courier.added';

      const settings = await getStoreSettings(env.DB);
      if (!secret || secret === '••••••••' || secret.startsWith('****')) {
        const webhookId = body?.webhookId;
        if (webhookId && Array.isArray(settings.courierWebhooks)) {
          const dbW = settings.courierWebhooks.find((w: any) => w.id === webhookId);
          if (dbW?.secret) secret = dbW.secret.trim();
        } else if (targetUrl && Array.isArray(settings.courierWebhooks)) {
          const dbW = settings.courierWebhooks.find((w: any) => w.url === targetUrl);
          if (dbW?.secret) secret = dbW.secret.trim();
        }
      }

      // 1. SSRF Validation: Reject internal addresses, private IPs, loopback, cloud metadata, and illegal protocols
      const validation = validateWebhookDestination(targetUrl, request.url);
      if (!validation.valid) {
        return jsonResponse(
          {
            success: false,
            error: validation.error || 'Invalid webhook destination URL.',
          },
          400
        );
      }

      const testPayload = body?.payload || {
        event: eventName,
        action: 'test_ping',
        timestamp: new Date().toISOString(),
        courier: body?.courier || {
          id: 'courier-test-01',
          name: 'Steadfast Courier (Test Ping)',
          code: 'steadfast',
          baseUrl: 'https://portal.packzy.com/api/v1',
          trackingUrlPattern: 'https://steadfast.com.bd/t/{trackingCode}',
          isActive: true,
          hasApiKey: true,
          hasSecretKey: false,
          createdAt: new Date().toISOString(),
        },
        store: {
          siteName: settings.siteName || 'Rongdhonu Trade',
          currency: settings.currencySymbol || '৳',
        },
      };

      const start = Date.now();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'RongdhonuTrade-Webhook/1.0',
        'X-Webhook-Event': eventName,
        'X-Webhook-Timestamp': new Date().toISOString(),
      };
      const serializedTestPayload = JSON.stringify(testPayload);
      const effectiveTestSecret = secret || (env?.COURIER_WEBHOOK_SECRET || env?.STEADFAST_SECRET_KEY || '').trim();
      if (effectiveTestSecret) {
        headers['X-Webhook-Secret'] = effectiveTestSecret;
        const sig = await computeHmacSha256Hex(effectiveTestSecret, serializedTestPayload);
        headers['X-Webhook-Signature'] = sig;
        headers['X-Signature'] = `sha256=${sig}`;
      }

      // 2. Safe Internal dispatch to store built-in receiver if target points to local store receiver
      if (validation.isInternalReceiver) {
        const normInternal = validation.internalPath || '/api/webhook/courier';
        try {
          const internalReq = new Request(new URL(normInternal, request.url).toString(), {
            method: 'POST',
            headers,
            body: serializedTestPayload,
          });
          const internalResp = await handleApiRequest(internalReq, env);
          const latencyMs = Date.now() - start;
          const respText = await internalResp.text().catch(() => '');

          return jsonResponse({
            success: internalResp.ok,
            status: internalResp.status,
            latencyMs,
            responsePreview: respText.slice(0, 500) || (internalResp.ok ? 'OK' : `HTTP ${internalResp.status}`),
            message: internalResp.ok
              ? `Webhook test delivered successfully with status HTTP ${internalResp.status} (${latencyMs}ms)`
              : `Endpoint returned HTTP status ${internalResp.status}`,
          });
        } catch {
          return jsonResponse(
            {
              success: false,
              status: 500,
              latencyMs: Date.now() - start,
              error: 'Internal webhook execution failed.',
            },
            400
          );
        }
      }

      // 3. External delivery via hardened SSRF-safe fetch with redirect validation and strict 5s timeout
      const deliveryResult = await safeFetchWebhook({
        url: validation.normalizedUrl!,
        headers,
        body: serializedTestPayload,
        timeoutMs: 5000,
        maxRedirects: 3,
        maxResponseBytes: 1024,
      });

      return jsonResponse({
        success: deliveryResult.success,
        status: deliveryResult.status,
        latencyMs: deliveryResult.latencyMs,
        responsePreview: deliveryResult.responsePreview,
        message: deliveryResult.message,
      });
    } catch {
      return jsonResponse({ success: false, error: 'Webhook test request failed.' }, 500);
    }
  }

  if (path === '/api/courier/webhooks/trigger' && method === 'POST') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const canManage = auth!.role === 'super_admin' || hasPermission(auth!, 'courier.configure') || hasPermission(auth!, 'settings.manage');
    if (!canManage) {
      return jsonResponse({ success: false, error: 'Forbidden: Permission required to trigger courier webhooks.', requiredPermission: 'courier.configure' }, 403);
    }

    try {
      const body = (await request.json().catch(() => ({}))) as any;
      const event = body?.event || 'courier.added';
      const courier = body?.courier || {};
      const settings = await getStoreSettings(env.DB);
      const configuredWebhooks = Array.isArray(body?.webhooks) ? body.webhooks : (settings.courierWebhooks || []);

      const activeWebhooks = configuredWebhooks.filter(
        (w: any) => w.isActive && (w.events?.includes(event) || w.events?.includes('*') || !w.events || w.events.length === 0)
      );

      const targetList: { url: string; secret?: string; webhookId?: string; name: string }[] = [];
      for (const w of activeWebhooks) {
        if (w.url && typeof w.url === 'string' && w.url.trim()) {
          let realSecret = w.secret;
          if (!realSecret || realSecret === '••••••••' || (typeof realSecret === 'string' && realSecret.startsWith('****'))) {
            const dbW = (settings.courierWebhooks || []).find((x: any) => x.id === w.id);
            realSecret = dbW?.secret;
          }
          targetList.push({ url: w.url.trim(), secret: realSecret, webhookId: w.id, name: w.name });
        }
      }

      if (body?.targetUrl && typeof body.targetUrl === 'string' && body.targetUrl.trim()) {
        const directUrl = body.targetUrl.trim();
        if (!targetList.some((t) => t.url === directUrl)) {
          targetList.push({ url: directUrl, secret: body?.secret, webhookId: 'direct', name: 'Direct Endpoint' });
        }
      }

      const payload = {
        event,
        action: event === 'courier.added' ? 'courier_created' : event,
        timestamp: new Date().toISOString(),
        courier: {
          id: courier.id,
          name: courier.name,
          code: courier.code,
          baseUrl: courier.baseUrl,
          trackingUrlPattern: courier.trackingUrlPattern,
          isActive: courier.isActive,
          hasApiKey: Boolean(courier.apiKey),
          hasSecretKey: Boolean(courier.secretKey),
          createdAt: courier.createdAt || new Date().toISOString(),
        },
        store: {
          siteName: settings.siteName || 'Rongdhonu Trade',
          currency: settings.currencySymbol || '৳',
        },
      };

      const results = await Promise.all(
        targetList.map(async (t) => {
          const start = Date.now();
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'RongdhonuTrade-Webhook/1.0',
            'X-Webhook-Event': event,
            'X-Webhook-Timestamp': new Date().toISOString(),
          };
          const serializedPayload = JSON.stringify(payload);
          const effectiveTriggerSecret = t.secret || (env?.COURIER_WEBHOOK_SECRET || env?.STEADFAST_SECRET_KEY || '').trim();
          if (effectiveTriggerSecret) {
            headers['X-Webhook-Secret'] = effectiveTriggerSecret;
            const sig = await computeHmacSha256Hex(effectiveTriggerSecret, serializedPayload);
            headers['X-Webhook-Signature'] = sig;
            headers['X-Signature'] = `sha256=${sig}`;
          }

          // SSRF Validation
          const validation = validateWebhookDestination(t.url, request.url);
          if (!validation.valid) {
            return {
              url: t.url,
              name: t.name,
              webhookId: t.webhookId,
              success: false,
              status: 0,
              durationMs: 0,
              error: validation.error || 'Destination URL failed SSRF validation.',
              responsePreview: 'Destination blocked by SSRF filter',
            };
          }

          if (validation.isInternalReceiver) {
            const normInternal = validation.internalPath || '/api/webhook/courier';
            try {
              const internalReq = new Request(new URL(normInternal, request.url).toString(), {
                method: 'POST',
                headers,
                body: serializedPayload,
              });
              const internalResp = await handleApiRequest(internalReq, env);
              const durationMs = Date.now() - start;
              const respText = await internalResp.text().catch(() => '');
              return {
                url: t.url,
                name: t.name,
                webhookId: t.webhookId,
                success: internalResp.ok,
                status: internalResp.status,
                durationMs,
                responsePreview: respText.slice(0, 300) || (internalResp.ok ? 'OK' : `HTTP ${internalResp.status}`),
              };
            } catch {
              return {
                url: t.url,
                name: t.name,
                webhookId: t.webhookId,
                success: false,
                status: 500,
                durationMs: Date.now() - start,
                error: 'Internal webhook execution failed.',
              };
            }
          }

          const fetchResult = await safeFetchWebhook({
            url: validation.normalizedUrl!,
            headers,
            body: serializedPayload,
            timeoutMs: 5000,
            maxRedirects: 3,
            maxResponseBytes: 1024,
          });

          return {
            url: t.url,
            name: t.name,
            webhookId: t.webhookId,
            success: fetchResult.success,
            status: fetchResult.status,
            durationMs: fetchResult.latencyMs,
            responsePreview: fetchResult.responsePreview,
            error: fetchResult.error,
          };
        })
      );

      return jsonResponse({
        success: true,
        dispatchedCount: results.length,
        results,
      });
    } catch (err: any) {
      console.error('Failed to trigger webhooks:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  // ==========================================
  // 10. PROFIT ANALYTICS & EXPENSES ROUTES (STRICTLY SUPER ADMIN ONLY)
  // ==========================================
  if ((path === '/api/analytics/profit' || path === '/api/admin/profit-analytics') && method === 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const permErr = requirePermission(auth!, 'report.profit');
    if (permErr) return permErr;

    try {
      const period = (url.searchParams.get('period') as any) || 'today';
      const startDate = url.searchParams.get('startDate') || undefined;
      const endDate = url.searchParams.get('endDate') || undefined;

      const summary = await getProfitAnalytics(env.DB, { period, startDate, endDate });
      return jsonResponse({ success: true, summary });
    } catch (err: any) {
      console.error('Error fetching profit analytics:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  if (path === '/api/expenses' && method === 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const permErr = requirePermission(auth!, 'report.financial');
    if (permErr) return permErr;

    try {
      const startDate = url.searchParams.get('startDate') || undefined;
      const endDate = url.searchParams.get('endDate') || undefined;
      const expenseType = url.searchParams.get('expenseType') || undefined;

      const expenses = await getAllExpenses(env.DB, { startDate, endDate, expenseType });
      return jsonResponse({ success: true, count: expenses.length, expenses });
    } catch (err: any) {
      console.error('Error fetching expenses:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  if (path === '/api/expenses' && method === 'POST') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const permErr = requirePermission(auth!, 'report.financial');
    if (permErr) return permErr;

    try {
      const body = (await request.json().catch(() => ({}))) as any;
      const expenseData = body.expense || body;

      const amount = Number(expenseData.amount);
      if (isNaN(amount) || amount < 0) {
        return jsonResponse({ success: false, error: 'Expense amount must be a positive number.' }, 400);
      }
      if (!expenseData.expenseType) {
        return jsonResponse({ success: false, error: 'Expense type is required.' }, 400);
      }

      const created = await insertExpense(env.DB, expenseData, auth!.dbUser.email);
      return jsonResponse({ success: true, expense: created, message: 'Expense recorded successfully.' }, 201);
    } catch (err: any) {
      console.error('Error creating expense:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  const expenseIdMatch = path.match(/^\/api\/expenses\/([^/]+)$/);
  if (expenseIdMatch && method === 'DELETE') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    const permErr = requirePermission(auth!, 'report.financial');
    if (permErr) return permErr;

    try {
      const expId = decodeURIComponent(expenseIdMatch[1]);
      await deleteExpenseFromD1(env.DB, expId);
      return jsonResponse({ success: true, message: `Expense "${expId}" deleted.` });
    } catch (err: any) {
      console.error('Error deleting expense:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  return jsonResponse({ error: 'Endpoint not found', path }, 404);
}
