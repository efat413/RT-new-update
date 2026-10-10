import { Env, UserRow, D1Database, OrderRow } from './types';
import {
  checkTablesExist,
  // Products
  getAllProducts,
  getPaginatedProducts,
  getHomepageProducts,
  getHomepageCategoryProducts,
  getProductById,
  getProductsByIds,
  insertProduct,
  updateProductInD1,
  setProductFeaturedInD1,
  deleteProductFromD1,
  // Categories
  getAllCategories,
  getCategoryById,
  getCategoryProductsPaginated,
  parseSafePagination,
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
  mediaAssetExistsInD1,
  // Coupons
  getAllCoupons,
  insertCoupon,
  updateCouponInD1,
  deleteCouponFromD1,
  // Reviews
  getAllReviews,
  getReviewById,
  insertReview,
  updateReviewInD1,
  deleteReviewFromD1,
  verifyCustomerPurchaseInD1,
  ReviewQueryFilter,
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
  rowToOrder,
  // Schema & Sanitation
  sanitizeProductForRole,
  sanitizeOrderForRole,
  sanitizeOrderForPublicTracking,
  deepSanitizeCostAndProfit,
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
  // Review Image Binary Blobs
  saveReviewImageBlobInD1,
  getReviewImageBlobFromD1,
  deleteReviewImageFromD1,
} from './db';
import {
  Order,
  Product,
  Category,
  CarouselSlide,
  StoreSettings,
  Coupon,
  ProductReview,
  ReviewStatus,
  ReviewSource,
  UserAccount,
  AdminPermissions,
  UserRole,
} from '../types';
import {
  verifyPassword,
  hashPassword,
  needsPasswordRehash,
  MIN_PASSWORD_LENGTH,
  PBKDF2_RECOMMENDED_ITERATIONS,
  createAuthToken,
  verifyAuthToken,
  getAuthSecret,
  resolveAuthSecret,
  bufferToHex,
  computePasswordSignature,
  TokenPayload,
  ADMIN_SESSION_IDLE_TIMEOUT_SECONDS,
  ADMIN_SESSION_ABSOLUTE_TIMEOUT_SECONDS,
  CUSTOMER_SESSION_EXPIRATION_SECONDS,
  ADMIN_SESSION_REFRESH_THROTTLE_SECONDS,
  isAdminRole,
} from './auth';
import {
  syncSingleOrderCourierStatus,
  syncAllActiveCourierOrders,
  callSteadfastApi,
  dispatchOrderToSteadfast,
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
  validateCourierApiDestination,
  safeFetchCourierApi,
} from './ssrf';
import {
  validateImageBuffer,
  validateReviewPhotoBuffer,
  generateSafeMediaKey,
  isValidMediaKey,
  getSafeMediaHeaders,
  sanitizeReviewImageReference,
  MAX_IMAGE_SIZE_BYTES,
  REVIEW_MAX_IMAGE_SIZE,
  uint8ArrayToBase64,
  base64ToUint8Array,
  D1_SAFE_BLOB_CHUNK_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_REVIEW_IMAGE_DIMENSION,
} from './imageSecurity';

let activeApiRequest: Request | null = null;
let activeEnv: Env | null = null;
let activeRefreshedCookie: string | null = null;

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

  const originHeader = request.headers.get('origin') || request.headers.get('referer');
  let isCrossOrigin = false;
  if (originHeader) {
    try {
      const parsedOrigin = new URL(originHeader);
      if (parsedOrigin.hostname && reqHostname && parsedOrigin.hostname !== reqHostname) {
        isCrossOrigin = true;
      }
    } catch {}
  }

  const secFetchSite = (request.headers.get('sec-fetch-site') || '').toLowerCase();
  const isCrossSite = isHttps && (secFetchSite === 'cross-site' || isCrossOrigin || reqHostname.endsWith('.run.app'));

  const sameSite = isCrossSite ? 'None' : 'Lax';
  const secureAttr = (isHttps || sameSite === 'None') ? '; Secure' : '';
  const encodedVal = token ? encodeURIComponent(token) : '';
  const expiresAttr = maxAgeSeconds <= 0 ? '; Expires=Thu, 01 Jan 1970 00:00:00 GMT' : '';

  return `auth_token=${encodedVal}; Path=/; HttpOnly${secureAttr}; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}${expiresAttr}`;
}

/**
 * Standard JSON response helper with restricted CORS, credential support, cache-busting, and safe internal error masking
 */
function jsonResponse(data: any, status = 200, customHeaders: Record<string, string> = {}): Response {
  let payload = data;
  let finalStatus = status;

  if (payload && typeof payload === 'object') {
    // 1. Strip raw stack traces, SQL queries, exception objects, and file paths unconditionally
    if ('stack' in payload) {
      console.error('[Server Technical Stack Logged Safely]:', payload.stack);
      delete payload.stack;
    }
    if ('sql' in payload) {
      console.error('[Server SQL Query Logged Safely]:', payload.sql);
      delete payload.sql;
    }
    if ('exception' in payload) {
      console.error('[Server Technical Exception Logged Safely]:', payload.exception);
      delete payload.exception;
    }

    // 2. Review 503 responses:
    // Allow health check probes or explicit temporarily unavailable service messages
    if (finalStatus === 503) {
      const isHealthCheckProbe = payload.status === 'error' && Object.keys(payload).length === 1;
      const isServiceUnavailable = typeof payload.error === 'string' && payload.error.includes('temporarily unavailable');
      if (!isHealthCheckProbe && !isServiceUnavailable) {
        console.error('[503 Converted to Safe 500 Internal Error]:', payload.error || payload);
        finalStatus = 500;
        payload = {
          success: false,
          error: 'Internal server error.',
        };
      }
    }

    // 3. For 500 responses: Ensure generic safe response
    if (finalStatus >= 500) {
      const isSafeOrderErrorMessage =
        typeof payload.error === 'string' &&
        payload.error === 'Unable to place the order right now. Please try again.';

      const isServiceUnavailable =
        finalStatus === 503 &&
        typeof payload.error === 'string' &&
        payload.error.includes('temporarily unavailable');

      if (payload.error && payload.error !== 'Internal server error.' && !isSafeOrderErrorMessage && !isServiceUnavailable) {
        console.error('[Server Internal Error Logged Safely]:', payload.error);
      }
      if (payload.message && typeof payload.message === 'string' && !payload.success) {
        console.error('[Server Internal Message Logged Safely]:', payload.message);
      }

      if (!isSafeOrderErrorMessage && !isServiceUnavailable) {
        payload = {
          success: false,
          error: 'Internal server error.',
        };
      }
    } else {
      // 4. Defense-in-depth for 4xx responses: Intercept any accidental SQL, D1 driver, or filesystem leaks
      const errStr = typeof payload.error === 'string' ? payload.error : '';
      const isLeakingInternals =
        /sqlite|d1_error|no such table|syntax error|table |column |foreign key|prepare|bind|database disk|file not found|\/app\/|\/src\/|\.ts:\d+|\.js:\d+|cloudflare d1|admin_secret|resend_api_key|token|auth_token|typeerror|referenceerror|rangeerror|evalerror/i.test(errStr);
      if (isLeakingInternals) {
        console.error('[Server Internal Leak Intercepted & Masked Safely]:', errStr);
        payload = {
          success: false,
          error: 'Invalid request.',
        };
      }
    }
  }

  let serialized = JSON.stringify(payload);
  const FORBIDDEN_LEAK_REGEX = /sqlite|d1_error|no such table|syntax error|at\s+[a-zA-Z0-9_$.<>]+\s+\(|(?:\/src\/|\/app\/|\.env\b|node_modules|ADMIN_SECRET|COURIER_WEBHOOK_SECRET|STEADFAST_API_KEY|STEADFAST_SECRET_KEY|RESEND_API_KEY|DEV_ADMIN_PASSWORD|auth_secret)/i;

  if (finalStatus >= 400 && FORBIDDEN_LEAK_REGEX.test(serialized)) {
    if (payload?.error === 'Malformed JSON payload. Please provide valid JSON.') {
      // Safe client validation error
    } else {
      console.error('[CRITICAL Internal Leak Prevented & Masked to 500]:', serialized);
      finalStatus = 500;
      payload = {
        success: false,
        error: 'Internal server error.',
      };
      serialized = JSON.stringify(payload);
    }
  }

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getCorsHeaders(),
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  if (activeRefreshedCookie && !customHeaders['Set-Cookie']) {
    responseHeaders['Set-Cookie'] = activeRefreshedCookie;
  }

  Object.assign(responseHeaders, customHeaders);

  return new Response(serialized, {
    status: finalStatus,
    headers: responseHeaders,
  });
}

/**
 * Centralized safe JSON request body parser.
 * - Safely parses incoming JSON request payloads.
 * - Returns { data: parsed, errorResponse: null } on valid JSON (including empty object `{}`).
 * - Returns HTTP 400 Bad Request if the JSON payload is malformed or invalid.
 * - NEVER silently converts malformed JSON into {}, null, an empty body, or another fallback object.
 * - Ensures parser stack traces or internals are never leaked.
 */
export async function safeParseJson<T = any>(
  request: Request
): Promise<{ data: T; errorResponse: null } | { data: null; errorResponse: Response }> {
  try {
    const data = (await request.json()) as T;
    return { data: (data ?? ({} as T)), errorResponse: null };
  } catch {
    return {
      data: null,
      errorResponse: jsonResponse(
        { success: false, error: 'Malformed JSON payload. Please provide valid JSON.' },
        400
      ),
    };
  }
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
  const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)(?:auth_token|session_token)=([^;]+)/);
    if (match) {
      const val = decodeURIComponent(match[1]).trim();
      if (val) return val;
    }
  }

  // 2. Fallback: Authorization header (Bearer <token>)
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (authHeader) {
    const trimmed = authHeader.trim();
    if (/^bearer\s+/i.test(trimmed)) {
      const t = trimmed.replace(/^bearer\s+/i, '').trim().replace(/^["']|["']$/g, '');
      if (t) return t;
    }
  }

  // 3. Fallback: Custom session headers
  const customHeader = request.headers.get('x-auth-token') || request.headers.get('X-Auth-Token');
  if (customHeader) {
    const t = customHeader.trim();
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
interface IdempotencyCacheEntry {
  order: Order;
  payload: any;
  timestamp: number;
}
const orderIdempotencyMap = new Map<string, IdempotencyCacheEntry>();
const orderRecentSubmissionMap = new Map<string, { order: Order; timestamp: number }>();

/**
 * Hardened Order Idempotency Security Helpers:
 * 1. deriveCustomerIdentityScope:
 *    Authoritatively binds idempotency keys to user identity (when authenticated)
 *    or normalized customer phone and email (guest checkout). Prevents cross-customer
 *    idempotency key hijacking and cross-tenant replay attacks.
 * 2. computeOrderPayloadFingerprint:
 *    Calculates a deterministic SHA-256 cryptographic digest of the canonical order
 *    payload (items, quantities, delivery destination, payment method, coupon code).
 *    Ensures idempotency keys cannot be maliciously replayed with mutated parameters.
 */
export function deriveCustomerIdentityScope(
  authenticatedUserId?: string,
  customerPhone?: string,
  customerEmail?: string
): string {
  if (authenticatedUserId && authenticatedUserId.trim()) {
    return `auth:${authenticatedUserId.trim()}`;
  }
  const cleanPhone = String(customerPhone || '').replace(/\D/g, '');
  const cleanEmail = String(customerEmail || '').toLowerCase().trim();
  return `guest:${cleanPhone}:${cleanEmail}`;
}

export async function computeOrderPayloadFingerprint(orderData: any): Promise<string> {
  const cleanPhone = String(orderData?.customer?.phone || '').replace(/\D/g, '');
  const cleanEmail = String(orderData?.customer?.email || orderData?.userEmail || '').toLowerCase().trim();
  const deliveryZone = String(orderData?.customer?.deliveryZone || orderData?.deliveryZone || '').trim().toLowerCase();
  const paymentMethod = String(orderData?.paymentMethod || '').toLowerCase().trim();
  const couponCode = String(orderData?.couponCode || '').toUpperCase().trim();
  const address = String(orderData?.customer?.fullAddress || '').trim().toLowerCase();

  const rawItems = Array.isArray(orderData?.items) ? orderData.items : [];
  const items = rawItems.map((it: any) => ({
    p: String(it.product?.id || it.productId || it.id || '').trim(),
    v: String(it.selectedVariantId || it.variantId || '').trim(),
    q: Number(it.quantity) || 1,
  })).sort((a, b) => a.p.localeCompare(b.p) || a.v.localeCompare(b.v));

  const canonicalPayload = JSON.stringify({
    ph: cleanPhone,
    em: cleanEmail,
    dz: deliveryZone,
    ad: address,
    pm: paymentMethod,
    cp: couponCode,
    it: items,
  });

  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPayload));
  return bufferToHex(hashBuffer);
}

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

// In-memory sliding log for IP order attempts (atomic per edge isolate)
const orderIpRateLimitMap = new Map<string, number[]>();

export async function checkAndConsumeOrderRateLimit(
  clientIp: string,
  limit = 4,
  windowSeconds = 600,
  db?: D1Database,
  timeOffsetMs = 0
): Promise<{ allowed: boolean; remainingSeconds?: number }> {
  const now = Date.now() + timeOffsetMs;
  const windowMs = windowSeconds * 1000;
  const key = `order_ip:${clientIp}`;

  // 1. Sliding window check & update in memory (atomic for isolate)
  const timestamps = (orderIpRateLimitMap.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    const rem = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    orderIpRateLimitMap.set(key, timestamps);
    return { allowed: false, remainingSeconds: rem };
  }

  // 2. Multi-edge Cloudflare D1 distributed check (if DB is bound)
  if (db) {
    try {
      const resetAt = now + windowMs;
      // Atomic upsert with RETURNING count, reset_at
      const result = await db
        .prepare(
          `INSERT INTO rate_limits (key, count, reset_at)
           VALUES (?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET
             count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
             reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
           RETURNING count, reset_at`
        )
        .bind(key, resetAt, now, now, resetAt)
        .first<{ count: number; reset_at: number }>();

      if (result && result.count > limit && result.reset_at > now) {
        const rem = Math.max(1, Math.ceil((result.reset_at - now) / 1000));
        return { allowed: false, remainingSeconds: rem };
      }
    } catch (d1Err) {
      console.error('[RateLimit Error] Atomic order rate limit check failed in D1:', d1Err);
    }
  }

  // Reserve slot
  timestamps.push(now);
  orderIpRateLimitMap.set(key, timestamps);

  return { allowed: true };
}

export async function rollbackOrderRateLimit(
  clientIp: string,
  db?: D1Database
): Promise<void> {
  const key = `order_ip:${clientIp}`;
  const timestamps = orderIpRateLimitMap.get(key);
  if (timestamps && timestamps.length > 0) {
    timestamps.pop();
    orderIpRateLimitMap.set(key, timestamps);
  }
  if (db) {
    try {
      await db
        .prepare(`UPDATE rate_limits SET count = MAX(0, count - 1) WHERE key = ?`)
        .bind(key)
        .run()
        .catch(() => {});
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
  detectPrivilegeEscalationAttempt,
  normalizePermissionsInput,
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
      errorResponse: jsonResponse({ success: false, error: 'Internal server error.' }, 500),
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
  const isPrivilegedAdmin = isAdminRole(role);

  // Server-Enforced Admin Session Expiration (30-min idle timeout and 12-hour absolute timeout)
  if (isPrivilegedAdmin) {
    const now = Math.floor(Date.now() / 1000);
    const authTime = tokenUser.authTime || tokenUser.iat || now;
    const lastActivity = tokenUser.lastActivity || tokenUser.iat || now;

    // 1. Strict Absolute Maximum Session Duration (12 hours)
    if (now - authTime > ADMIN_SESSION_ABSOLUTE_TIMEOUT_SECONDS) {
      return {
        errorResponse: jsonResponse(
          { success: false, error: 'Unauthorized: Session expired. Maximum session duration reached. Please log in again.' },
          401
        ),
      };
    }

    // 2. Strict Continuous Inactivity / Idle Timeout (30 minutes)
    if (now - lastActivity > ADMIN_SESSION_IDLE_TIMEOUT_SECONDS) {
      return {
        errorResponse: jsonResponse(
          { success: false, error: 'Unauthorized: Admin session expired due to 30 minutes of inactivity. Please log in again.' },
          401
        ),
      };
    }

    // 3. Sliding Session Refresh:
    // Only refresh on legitimate user requests (skip passive background probes)
    const isPassive =
      request.headers.get('x-background-poll') === 'true' ||
      request.headers.get('x-passive-probe') === 'true';

    const isMutating = request.method !== 'GET' && request.method !== 'HEAD';
    if (!isPassive && (now - lastActivity >= ADMIN_SESSION_REFRESH_THROTTLE_SECONDS || isMutating)) {
      const remainingAbsolute = (authTime + ADMIN_SESSION_ABSOLUTE_TIMEOUT_SECONDS) - now;
      if (remainingAbsolute > 0) {
        const slideSeconds = Math.min(ADMIN_SESSION_IDLE_TIMEOUT_SECONDS, remainingAbsolute);
        try {
          const freshToken = await createAuthToken(
            {
              userId: dbUser.id,
              email: dbUser.email,
              role: dbUser.role,
              pwdSig: tokenUser.pwdSig,
              authTime,
              lastActivity: now,
            },
            secret,
            slideSeconds
          );
          activeRefreshedCookie = buildAuthCookieHeader(request, freshToken, slideSeconds, env);
        } catch (refreshErr) {
          console.warn('[Session Refresh Error]:', refreshErr);
        }
      }
    }
  }

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

  // Explicit checks for product financial permissions
  if (keyStr === 'product.view_buying_price' || keyStr === 'product.buying_price' || keyStr === 'view_buying_price') {
    return Boolean(auth.permissions && (auth.permissions['product.view_buying_price'] || auth.permissions['product.buying_price']));
  }
  if (keyStr === 'product.manage_buying_price' || keyStr === 'manage_buying_price') {
    return Boolean(auth.permissions && auth.permissions['product.manage_buying_price']);
  }
  if (keyStr === 'product.view_profit' || keyStr === 'report.profit' || keyStr === 'view_profit') {
    return Boolean(auth.permissions && (auth.permissions['product.view_profit'] || auth.permissions['report.profit']));
  }
  if (keyStr === 'product.update') {
    return Boolean(auth.permissions && auth.permissions['product.update']);
  }

  // Explicit checks for granular review permissions
  if (keyStr === 'reviews.view' || keyStr === 'review.view') {
    return Boolean(
      auth.permissions && (
        auth.permissions['reviews.view'] ||
        auth.permissions['review.view'] ||
        auth.permissions['review.manage']
      )
    );
  }
  if (keyStr === 'reviews.create' || keyStr === 'review.create') {
    return Boolean(
      auth.permissions && (
        auth.permissions['reviews.create'] ||
        auth.permissions['review.create'] ||
        auth.permissions['review.manage']
      )
    );
  }
  if (keyStr === 'reviews.edit' || keyStr === 'review.edit') {
    return Boolean(
      auth.permissions && (
        auth.permissions['reviews.edit'] ||
        auth.permissions['review.edit'] ||
        auth.permissions['review.manage']
      )
    );
  }
  if (keyStr === 'reviews.approve' || keyStr === 'review.approve') {
    return Boolean(
      auth.permissions && (
        auth.permissions['reviews.approve'] ||
        auth.permissions['review.approve'] ||
        auth.permissions['review.manage']
      )
    );
  }
  if (keyStr === 'reviews.delete' || keyStr === 'review.delete') {
    return Boolean(
      auth.permissions && (
        auth.permissions['reviews.delete'] ||
        auth.permissions['review.delete']
      )
    );
  }
  if (keyStr === 'review.manage') {
    return Boolean(
      auth.permissions && (
        auth.permissions['review.manage'] ||
        (auth.permissions['reviews.approve'] && auth.permissions['reviews.edit'])
      )
    );
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
 * Sanitizes a single CSV cell against CSV / Formula Injection attacks (CWE-1236).
 * Prepends a single quote `'` if value begins with `=, +, -, @, \t, \r`.
 * Wraps values containing commas, double quotes, tabs, or newlines in RFC-4180 standard quotes.
 */
export function sanitizeCsvCell(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val);

  // Formula injection defense: prepend single quote if text starts with formula operator (=, +, -, @, \t, \r)
  if (/^[=+\-@\t\r\n]/.test(str)) {
    str = `'${str}`;
  }

  // Normalize CRLF to LF internally
  str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Escape internal double quotes and wrap in quotes if field contains commas, quotes, newlines, or tabs
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\t')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export interface CsvOrderExportOptions {
  isSuperAdmin?: boolean;
  canViewBuyingPrice?: boolean;
  canViewProfit?: boolean;
  format?: 'summary' | 'itemized';
}

/**
 * Generates an RFC-4180 compliant CSV string with UTF-8 BOM (\uFEFF) for orders.
 * Joins order_items consistently for accounting.
 * Strictly excludes sensitive internal columns (card details, DBBL raw credentials/tokens, courier auth secrets).
 */
export function generateOrdersCsv(orders: Order[], options?: CsvOrderExportOptions): string {
  const isItemized = options?.format === 'itemized';
  const canViewCost = Boolean(options?.isSuperAdmin || options?.canViewBuyingPrice);
  const canViewProfit = Boolean(options?.isSuperAdmin || options?.canViewProfit);

  const rows: string[] = [];

  if (isItemized) {
    // 1. Accounting Line-Item View (1 row per order item joined consistently)
    const headers = [
      'Order Number',
      'Order Date',
      'Customer Name',
      'Customer Phone',
      'Customer Address',
      'District',
      'Delivery Zone',
      'Item Title',
      'SKU',
      'Variant',
      'Quantity',
      'Unit Price (BDT)',
      'Line Total (BDT)',
      ...(canViewCost ? ['Unit Cost (BDT)', 'Line Cost (BDT)'] : []),
      ...(canViewProfit ? ['Line Gross Profit (BDT)'] : []),
      'Order Subtotal (BDT)',
      'Delivery Fee (BDT)',
      'Discount (BDT)',
      'Coupon Code',
      'Total Amount (BDT)',
      'Advance Payment (BDT)',
      'Due Amount (BDT)',
      'Payment Method',
      'Payment Status',
      'Shipping Status',
      'Courier Name',
      'Courier Tracking',
      'Consignment ID',
      'Customer Notes',
    ];
    rows.push(headers.map(sanitizeCsvCell).join(','));

    for (const ord of orders) {
      const items = Array.isArray(ord.items) && ord.items.length > 0 ? ord.items : [null];
      for (const it of items) {
        const rawIt = it as any;
        const itemTitle = rawIt ? (rawIt.product?.title || rawIt.title || 'Item') : 'N/A';
        const itemSku = rawIt ? (rawIt.product?.sku || rawIt.sku || '') : '';
        const itemVariant = rawIt ? [rawIt.selectedColor, rawIt.selectedSize].filter(Boolean).join(', ') : '';
        const itemQty = rawIt ? (Number(rawIt.quantity) || 1) : 0;
        const itemUnitPrice = rawIt ? (Number(rawIt.product?.price || rawIt.price) || 0) : 0;
        const itemLineTotal = rawIt ? itemUnitPrice * itemQty : 0;
        const itemUnitCost = rawIt
          ? (Number(rawIt.productCost ? rawIt.productCost / itemQty : (rawIt.buyingPriceSnapshot || rawIt.product?.buyingPrice || 0)))
          : 0;
        const itemLineCost = rawIt ? itemUnitCost * itemQty : 0;
        const itemLineProfit = itemLineTotal - itemLineCost;

        const row = [
          ord.orderNumber || ord.id,
          ord.createdAt || '',
          ord.customer?.fullName || '',
          ord.customer?.phone || '',
          ord.customer?.fullAddress || '',
          ord.customer?.district || '',
          ord.customer?.deliveryZone || '',
          itemTitle,
          itemSku,
          itemVariant,
          itemQty,
          itemUnitPrice,
          itemLineTotal,
          ...(canViewCost ? [itemUnitCost, itemLineCost] : []),
          ...(canViewProfit ? [itemLineProfit] : []),
          ord.subtotal ?? 0,
          ord.deliveryFee ?? 0,
          ord.discountAmount ?? 0,
          ord.couponCode || '',
          ord.totalAmount ?? 0,
          ord.advancePayment ?? 0,
          ord.dueAmount ?? 0,
          ord.paymentMethod || 'COD',
          ord.paymentStatus || 'Pending',
          ord.shippingStatus || 'Pending',
          ord.courierName || '',
          ord.courierWaybill || '',
          ord.consignmentId || '',
          ord.customer?.notes || '',
        ];
        rows.push(row.map(sanitizeCsvCell).join(','));
      }
    }
  } else {
    // 2. Accounting Order Summary View (1 row per order with joined items accounting columns)
    const headers = [
      'Order Number',
      'Order Date',
      'Customer Name',
      'Customer Phone',
      'Customer Address',
      'District',
      'Delivery Zone',
      'Items Summary',
      'Item SKUs',
      'Total Items Quantity',
      'Subtotal (BDT)',
      'Delivery Fee (BDT)',
      'Discount (BDT)',
      'Coupon Code',
      'Total Amount (BDT)',
      'Advance Payment (BDT)',
      'Due Amount (BDT)',
      ...(canViewCost ? ['Total Cost (BDT)'] : []),
      ...(canViewProfit ? ['Total Profit (BDT)'] : []),
      'Payment Method',
      'Payment Status',
      'Shipping Status',
      'Courier Name',
      'Courier Tracking',
      'Consignment ID',
      'Transaction ID',
      'Customer Notes',
    ];
    rows.push(headers.map(sanitizeCsvCell).join(','));

    for (const ord of orders) {
      const itemsList = Array.isArray(ord.items) ? ord.items : [];
      const itemsSummary = itemsList
        .map((it: any) => {
          const title = it.product?.title || it.title || 'Item';
          const qty = it.quantity || 1;
          const price = it.product?.price || it.price || 0;
          const variants = [it.selectedColor, it.selectedSize].filter(Boolean).join('/');
          const variantSuffix = variants ? ` (${variants})` : '';
          const skuSuffix = it.product?.sku || it.sku ? ` [${it.product?.sku || it.sku}]` : '';
          return `${title}${variantSuffix}${skuSuffix} x ${qty} @ ৳${price}`;
        })
        .join('; ');

      const totalItemsQty = itemsList.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);
      const skus = Array.from(
        new Set(itemsList.map((it: any) => it.product?.sku || it.sku).filter(Boolean))
      ).join(', ');

      const row = [
        ord.orderNumber || ord.id,
        ord.createdAt || '',
        ord.customer?.fullName || '',
        ord.customer?.phone || '',
        ord.customer?.fullAddress || '',
        ord.customer?.district || '',
        ord.customer?.deliveryZone || '',
        itemsSummary,
        skus,
        totalItemsQty,
        ord.subtotal ?? 0,
        ord.deliveryFee ?? 0,
        ord.discountAmount ?? 0,
        ord.couponCode || '',
        ord.totalAmount ?? 0,
        ord.advancePayment ?? 0,
        ord.dueAmount ?? 0,
        ...(canViewCost ? [ord.totalCost ?? 0] : []),
        ...(canViewProfit ? [ord.totalGrossProfit ?? 0] : []),
        ord.paymentMethod || 'COD',
        ord.paymentStatus || 'Pending',
        ord.shippingStatus || 'Pending',
        ord.courierName || '',
        ord.courierWaybill || '',
        ord.consignmentId || '',
        ord.transactionId || '',
        ord.customer?.notes || '',
      ];
      rows.push(row.map(sanitizeCsvCell).join(','));
    }
  }

  // Prepend UTF-8 BOM (\uFEFF) for native Excel UTF-8 decoding (Bangla font support)
  return '\uFEFF' + rows.join('\r\n');
}

/**
 * Handles all /api/* requests inside Cloudflare Worker or Cloudflare Pages Functions
 */
export async function handleApiRequest(request: Request, env: Env, ctx?: any): Promise<Response> {
  try {
    activeApiRequest = request;
    activeEnv = env;
    activeRefreshedCookie = null;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // Intentional error simulation hook for verification suites and automated tests
    const simulateHeader = request.headers.get('x-test-simulate');
    if (simulateHeader === 'db-error') {
      throw new Error('D1_ERROR: SQLITE_ERROR: no such table: test_table at /src/server/db.ts:42');
    }
    if (simulateHeader === 'unexpected-error') {
      throw new Error('TypeError: Cannot read properties of undefined (reading "execute") at /src/server/router.ts:88');
    }

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

    // Strict CSRF and Origin Validation on mutating state-changing requests (POST, PUT, PATCH, DELETE)
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const isExternalWebhook =
        path.startsWith('/api/courier/webhook') ||
        path.startsWith('/api/steadfast/webhook');

      if (!isExternalWebhook) {
        const origin = request.headers.get('Origin')?.trim();
        const secFetchSite = (request.headers.get('sec-fetch-site') || '').toLowerCase();
        const cors = getCorsHeaders(request, env);

        // If Origin header is sent by browser, it MUST match an authorized CORS origin
        if (origin && !cors['Access-Control-Allow-Origin']) {
          return new Response(
            JSON.stringify({ success: false, error: 'Forbidden: Cross-origin mutation rejected by CSRF policy.' }),
            {
              status: 403,
              headers: {
                'Content-Type': 'application/json',
                'Vary': 'Origin',
              },
            }
          );
        }

        // If sec-fetch-site is explicitly cross-site and not trusted, reject immediately
        if (secFetchSite === 'cross-site' && !cors['Access-Control-Allow-Origin']) {
          return new Response(
            JSON.stringify({ success: false, error: 'Forbidden: Cross-site request rejected by CSRF policy.' }),
            {
              status: 403,
              headers: {
                'Content-Type': 'application/json',
                'Vary': 'Origin',
              },
            }
          );
        }
      }
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
            success: false,
            status: 'error',
            error: 'Internal server error.',
            timestamp: new Date().toISOString(),
          },
          500
        );
      }

      try {
        const ping = await env.DB.prepare('SELECT 1 as alive').first<{ alive: number }>();
        const { missing } = await checkTablesExist(env.DB);
        const isHealthy = ping?.alive === 1 && missing.length === 0;

        return jsonResponse(
          {
            status: isHealthy ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
          },
          isHealthy ? 200 : 500
        );
      } catch {
        return jsonResponse(
          {
            success: false,
            status: 'error',
            error: 'Internal server error.',
            timestamp: new Date().toISOString(),
          },
          500
        );
      }
    }

    // Check if D1 database binding exists for data routes
    if (!env.DB) {
      return jsonResponse(
        { success: false, error: 'Internal server error.' },
        500
      );
    }

  // ==========================================
  // AUTHENTICATION ROUTES (Authoritative D1 + PBKDF2)
  // ==========================================
  if ((path === '/api/auth/login' || path === '/api/admin/login') && method === 'POST') {
    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    try {
      const identifier = (body?.usernameOrEmail || body?.email || body?.username || '').trim();
      const password = (body?.password || '').trim();

      if (!identifier || !password) {
        return jsonResponse(
          { success: false, error: 'Email/Username and password are required.' },
          400
        );
      }

      // Brute-force rate limit protection (distributed D1 + memory)
      const isDev = isDevEnvironment(env);
      const clientIp = getClientIp(request, isDev);
      const ipRateKey = `login:ip:${clientIp}`;
      const rateKey = `login:${clientIp}:${identifier.toLowerCase()}`;

      // Check both IP-level credential spray limit (25 attempts per 15 min) and target account limit (5 per 15 min)
      const [ipRateCheck, rateCheck] = await Promise.all([
        checkRateLimit(ipRateKey, 25, 900, env.DB),
        checkRateLimit(rateKey, 5, 900, env.DB),
      ]);

      if (!ipRateCheck.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Too many login attempts from this network. Please wait ${ipRateCheck.remainingSeconds || 300} seconds before trying again.`,
          },
          429
        );
      }

      if (!rateCheck.allowed) {
        return jsonResponse(
          {
            success: false,
            error: `Too many failed login attempts for this account. Please wait ${rateCheck.remainingSeconds || 300} seconds before trying again.`,
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
      // takes the identical computational time (600,000 PBKDF2 iterations) as wrong-password verification.
      const DUMMY_PBKDF2_HASH = `pbkdf2:${PBKDF2_RECOMMENDED_ITERATIONS}:0123456789abcdef0123456789abcdef:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`;

      if (!userRow) {
        await verifyPassword(password, DUMMY_PBKDF2_HASH);
        await Promise.all([
          recordFailedAttempt(rateKey, 5, 900, env.DB),
          recordFailedAttempt(ipRateKey, 25, 900, env.DB),
        ]);
        return jsonResponse({ success: false, error: 'Invalid email/username or password.' }, 401);
      }

      // Verify password strictly using PBKDF2 Web Crypto against D1 stored hash
      const isValid = await verifyPassword(password, userRow.password || '');
      if (!isValid) {
        await Promise.all([
          recordFailedAttempt(rateKey, 5, 900, env.DB),
          recordFailedAttempt(ipRateKey, 25, 900, env.DB),
        ]);
        return jsonResponse({ success: false, error: 'Invalid email/username or password.' }, 401);
      }

      // Account status enforcement: Inactive or suspended accounts cannot authenticate
      if ((userRow as any).status === 'inactive' || (userRow as any).status === 'suspended' || (userRow as any).is_active === 0) {
        return jsonResponse(
          { success: false, error: 'Forbidden: Account has been deactivated or suspended.' },
          403
        );
      }

      // Security Hardening: Reset account-specific failed attempts upon successful login,
      // so a legitimate user who previously mistyped their password is not locked out on subsequent attempts.
      //
      // CRITICAL SECURITY CONTROL (Credential Stuffing & Password Spraying Protection):
      // Do NOT clear the global IP rate limit (`ipRateKey`).
      // Clearing the IP limiter on successful login would allow an attacker possessing a valid account
      // (or test credentials) to repeatedly reset their IP rate limit and execute unlimited brute-force
      // attacks against other accounts from that IP address.
      // The IP rate limit must persist and expire naturally according to its TTL window (900s / 15 minutes).
      await clearFailedAttempts(rateKey, env.DB);

      // Automatic Password Hash Migration Strategy:
      // If user has a plaintext password or an older PBKDF2 hash with fewer iterations (< 600,000),
      // transparently re-hash their password with the modern 600,000 iterations standard and update D1.
      // This strengthens existing accounts on the fly without breaking sessions or requiring password resets.
      if (userRow.password && needsPasswordRehash(userRow.password)) {
        await updateUserPasswordInD1(env.DB, userRow.id, password);
        userRow = (await getUserByEmailOrUsername(env.DB, userRow.id)) || userRow;
      }

      const secret = await resolveAuthSecret(env);
      const isPrivilegedAdmin = isAdminRole(userRow.role);
      if (path === '/api/admin/login' && !isPrivilegedAdmin) {
        return jsonResponse(
          { success: false, error: 'Forbidden: Admin access required.' },
          403
        );
      }
      const now = Math.floor(Date.now() / 1000);
      const maxAgeSeconds = isPrivilegedAdmin ? ADMIN_SESSION_IDLE_TIMEOUT_SECONDS : CUSTOMER_SESSION_EXPIRATION_SECONDS;

      const token = await createAuthToken(
        {
          userId: userRow.id,
          email: userRow.email,
          role: userRow.role,
          pwdSig: await computePasswordSignature(userRow.password || ''),
          ...(isPrivilegedAdmin ? { authTime: now, lastActivity: now } : {}),
        },
        secret,
        maxAgeSeconds
      );

      const sanitizedUser = rowToUser(userRow);
      return jsonResponse(
        {
          success: true,
          message: 'Authentication successful',
          user: sanitizedUser,
          token,
        },
        200,
        {
          'Set-Cookie': buildAuthCookieHeader(request, token, maxAgeSeconds, env),
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
    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    try {
      const isDev = isDevEnvironment(env);
      const clientIp = getClientIp(request, isDev);
      const name = (body?.name || '').trim();
      const email = (body?.email || '').toLowerCase().trim();
      const password = (body?.password || '').trim();
      const phone = (body?.phone || '').trim();

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
      if (!password || password.length < MIN_PASSWORD_LENGTH) {
        return jsonResponse({ success: false, error: 'Password must be at least 8 characters long.' }, 400);
      }

      // Check D1 for existing user
      const existingUser = await getUserByEmailOrUsername(env.DB, email);
      if (existingUser) {
        return jsonResponse({ success: false, error: 'An account with this email address already exists. Please log in.' }, 409);
      }

      // Strictly register as a customer role with no admin permissions
      // Security Hardening: Use CSPRNG randomUUID for collision-resistant user ID
      const userRand = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      const newCustomer = await insertUser(env.DB, {
        id: `user-${Date.now()}-${userRand}`,
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
    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    try {
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
    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    try {
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

      if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
        return jsonResponse(
          {
            success: false,
            status: 'INVALID_PASSWORD',
            message: 'New password must be at least 8 characters long.',
            error: 'New password must be at least 8 characters long.',
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

    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    const newPassword = (body?.newPassword || '').trim();
    const currentPassword = (body?.currentPassword || body?.oldPassword || '').trim();

    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return jsonResponse(
        { success: false, error: 'New password must be at least 8 characters long.' },
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
    const isPrivilegedAdmin = isAdminRole(auth!.dbUser.role);
    const now = Math.floor(Date.now() / 1000);
    const maxAgeSeconds = isPrivilegedAdmin ? ADMIN_SESSION_IDLE_TIMEOUT_SECONDS : CUSTOMER_SESSION_EXPIRATION_SECONDS;

    const freshToken = await createAuthToken(
      {
        userId: auth!.dbUser.id,
        email: auth!.dbUser.email,
        role: auth!.dbUser.role,
        pwdSig: newPwdSig,
        ...(isPrivilegedAdmin ? { authTime: auth!.tokenUser.authTime || now, lastActivity: now } : {}),
      },
      secret,
      maxAgeSeconds
    );

    return jsonResponse(
      {
        success: true,
        message: 'Password updated successfully.',
      },
      200,
      {
        'Set-Cookie': buildAuthCookieHeader(request, freshToken, maxAgeSeconds, env),
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

  const permGetMatch = path.match(/^\/api\/(?:admin\/)?(?:users\/([^/]+)\/permissions|permissions\/([^/]+))\/?$/);
  if (permGetMatch && method === 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;

    const targetUserId = decodeURIComponent(permGetMatch[1] || permGetMatch[2]);
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

  const permUpdateMatch = path.match(/^\/api\/(?:admin\/)?(?:users\/([^/]+)\/permissions|permissions\/([^/]+))\/?$/);
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

    const targetUserId = decodeURIComponent(permUpdateMatch[1] || permUpdateMatch[2]);
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

    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    const rawPermissions = body?.permissions || body?.user_permissions || body?.permissions_json || body;
    const permissionsInput = normalizePermissionsInput(rawPermissions);

    if (!permissionsInput || typeof permissionsInput !== 'object') {
      return jsonResponse({ success: false, error: 'Invalid permissions payload: expected a permissions object or array.' }, 400);
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
        updatedPermissions[key] = Boolean(val);
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
  // ROLE MANAGEMENT ROUTES (Super Admin Only)
  // ==========================================
  const roleRouteMatch = path.match(/^\/api\/(?:admin\/)?(?:users\/([^/]+)\/role|roles\/([^/]+))\/?$/);
  if (roleRouteMatch) {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;

    // Strict Privilege Escalation Protection: ONLY super_admin can modify roles
    if (auth!.role !== 'super_admin') {
      return jsonResponse(
        { success: false, error: 'Forbidden: Only Super Administrator can modify user roles.' },
        403
      );
    }

    const targetUserId = decodeURIComponent(roleRouteMatch[1] || roleRouteMatch[2]);
    const targetUserRow = await env.DB.prepare('SELECT id, name, email, role, permissions_json FROM users WHERE id = ?')
      .bind(targetUserId)
      .first<UserRow>();

    if (!targetUserRow) {
      return jsonResponse({ success: false, error: 'Target user not found.' }, 404);
    }

    if (method === 'GET') {
      return jsonResponse({
        success: true,
        userId: targetUserId,
        role: targetUserRow.role,
      });
    }

    if (method !== 'PUT' && method !== 'PATCH' && method !== 'POST') {
      return jsonResponse({ success: false, error: 'Method not allowed.' }, 405);
    }

    const isTargetSuperAdmin = isSuperAdminUserServer(targetUserRow, env) || targetUserRow.role === 'super_admin';

    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    const requestedRole = (
      body?.role ||
      body?.userRole ||
      body?.user_role ||
      body?.targetRole ||
      body?.target_role ||
      body?.newRole ||
      body?.new_role ||
      ''
    ).toString().toLowerCase().trim();

    const allowedRoles = ['admin', 'sub_admin', 'customer', 'super_admin'];
    if (!allowedRoles.includes(requestedRole)) {
      return jsonResponse(
        { success: false, error: `Invalid role "${requestedRole}". Allowed roles are: admin, sub_admin, customer.` },
        400
      );
    }

    // Target super_admin account cannot be downgraded away from super_admin!
    if (isTargetSuperAdmin && requestedRole !== 'super_admin') {
      return jsonResponse(
        { success: false, error: 'Forbidden: Super Administrator role cannot be modified.' },
        403
      );
    }

    let newPermissionsJson = targetUserRow.permissions_json;
    if (requestedRole === 'customer') {
      newPermissionsJson = null;
    }

    await env.DB.prepare('UPDATE users SET role = ?, permissions_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(requestedRole, newPermissionsJson, targetUserId)
      .run();

    await insertAuditLogInD1(env.DB, {
      actorId: auth!.dbUser.id,
      actorEmail: auth!.dbUser.email,
      actorRole: auth!.role,
      action: 'user.role_update',
      targetId: targetUserId,
      targetType: 'user',
      details: { previousRole: targetUserRow.role, newRole: requestedRole },
    });

    const updatedUserRow = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetUserId).first<UserRow>();
    return jsonResponse({
      success: true,
      message: `User role updated successfully for "${targetUserRow.name}".`,
      user: rowToUser(updatedUserRow!),
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

    const isSuperAdmin = auth!.role === 'super_admin';
    const canViewBuyingPrice = Boolean(
      isSuperAdmin || hasPermission(auth!, 'product.view_buying_price') || hasPermission(auth!, 'product.buying_price')
    );
    const canViewProfit = Boolean(
      isSuperAdmin || hasPermission(auth!, 'product.view_profit') || hasPermission(auth!, 'report.profit')
    );

    const safeLogs = paginated.logs.map((log) => {
      const sanitizedLog: any = deepSanitizeCostAndProfit(log, { isSuperAdmin, canViewBuyingPrice, canViewProfit });
      if (!canViewBuyingPrice || !canViewProfit) {
        if (typeof sanitizedLog.details === 'string') {
          if (!canViewBuyingPrice) {
            sanitizedLog.details = sanitizedLog.details.replace(
              /((?:buying|purchase|cost|wholesale)[_\s]*price|(?:unit|total|product)[_\s]*cost)[\s:=]+[\d,.]+(?:\s*(?:BDT|Tk|৳))?/gi,
              '[CONFIDENTIAL COST REDACTED]'
            );
          }
          if (!canViewProfit) {
            sanitizedLog.details = sanitizedLog.details.replace(
              /((?:unit|gross|net|total)[_\s]*profit|profit[_\s]*margin)[\s:=]+[\d,.]+(?:\s*(?:BDT|Tk|৳|%))?/gi,
              '[CONFIDENTIAL PROFIT REDACTED]'
            );
          }
        }
      }
      return sanitizedLog;
    });

    return jsonResponse({
      success: true,
      count: safeLogs.length,
      total: paginated.total,
      page: paginated.page,
      limit: paginated.limit,
      totalPages: paginated.totalPages,
      logs: safeLogs,
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

      // Performance & payload deduplication: strip heavyweight non-card fields
      // (long descriptions, raw specs, admin metadata) while preserving essential card fields:
      // id, title, slug, price, originalPrice, sale_price, stock, stock_status, imageUrl, main_image, categoryId, category_id, display_order, etc.
      const toHomepageCardProduct = (raw: any) => {
        const p = sanitizePublic(raw);
        return {
          id: p.id,
          title: p.title,
          name: p.title,
          slug: p.slug,
          price: p.price,
          originalPrice: p.originalPrice,
          sale_price: p.price,
          stock: p.stock,
          stock_status: p.stock > 0 ? 'instock' : 'outofstock',
          imageUrl: p.imageUrl,
          main_image: p.imageUrl,
          images: p.images,
          categoryId: p.categoryId,
          category_id: p.categoryId,
          display_order: (p as any).display_order ?? (p as any).displayOrder ?? 0,
          featured: Boolean(p.featured),
          featuredSortOrder: p.featuredSortOrder,
          rating: p.rating,
          reviewsCount: p.reviewsCount,
          colors: p.colors,
          sizes: p.sizes,
          status: p.status,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      };

      const safeCategoryProducts: Record<string, any[]> = {};
      for (const [catId, prods] of Object.entries(homepageData.categoryProducts)) {
        safeCategoryProducts[catId] = prods.map(toHomepageCardProduct);
      }

      const safeFeaturedProducts = homepageData.featuredProducts.map(toHomepageCardProduct);
      const safeUniqueProducts = homepageData.uniqueProducts.map(toHomepageCardProduct);

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
  if (path === '/api/products' || path === '/api/admin/products') {
    if (method === 'GET') {
      try {
        const isAdminRoute = path === '/api/admin/products';
        const category = url.searchParams.get('category') || undefined;
        const search = url.searchParams.get('search') || undefined;
        const featuredParam = url.searchParams.get('featured');
        const featured = featuredParam !== null ? featuredParam === 'true' || featuredParam === '1' : undefined;
        const pageParam = url.searchParams.get('page');
        const limitParam = url.searchParams.get('limit');
        const sortBy = (url.searchParams.get('sortBy') || undefined) as any;
        const includeInactiveParam = url.searchParams.get('includeInactive');
        const allParam = url.searchParams.get('all');
        const adminParam = url.searchParams.get('admin');

        const isExplicitAdminRequest = isAdminRoute || includeInactiveParam === 'true' || allParam === 'true' || adminParam === 'true';

        // Security check: Authorize request using authoritative permission resolver
        const authRes = await requireAuth(request, env);
        const user = authRes.auth;

        // If explicitly requesting protected administrative product access:
        // Caller MUST be authenticated and MUST strictly have 'product.view' permission (or be Super Admin)!
        // Being admin or sub_admin by role ALONE does NOT grant administrative product access.
        if (isExplicitAdminRequest) {
          if (authRes.errorResponse) {
            return authRes.errorResponse;
          }
          const isSuperAdmin = user?.role === 'super_admin';
          const hasProductView = Boolean(isSuperAdmin || (user && hasPermission(user, 'product.view')));
          if (!hasProductView) {
            return jsonResponse(
              {
                success: false,
                error: 'Forbidden: You do not have the "product.view" permission required to perform this action.',
              },
              403
            );
          }
        }

        const isSuperAdmin = Boolean(!authRes.errorResponse && user?.role === 'super_admin');
        const hasProductView = Boolean(!authRes.errorResponse && user && (isSuperAdmin || hasPermission(user, 'product.view')));
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

        // Granular RBAC: Administrative product-read access requires product.view permission or Super Admin.
        // Role alone (admin / sub_admin) without product.view NEVER grants administrative catalog access.
        const isPrivileged = hasProductView;
        const includeInactive = Boolean(isPrivileged && (isAdminRoute || includeInactiveParam === 'true' || allParam === 'true'));

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
            const { page, limit } = parseSafePagination(pageParam, limitParam, {
              defaultLimit: 100,
              maxLimit: MAX_ADMIN_LIMIT,
            });
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
          // Default: limit=12 when filtering by category, otherwise 24. Hard cap: maxLimit=50.
          // Prevents full catalog dumps and excessive database/worker/bandwidth load.
          const defaultLimit = category ? 12 : DEFAULT_PUBLIC_LIMIT;
          const { page, limit } = parseSafePagination(pageParam, limitParam, {
            defaultLimit,
            maxLimit: 50,
          });

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
            items: safeProducts,
            products: safeProducts,
            count: safeProducts.length,
            total: paginated.total,
            page: paginated.page,
            limit: paginated.limit,
            totalPages: paginated.totalPages,
            hasMore: paginated.hasMore ?? (paginated.page < paginated.totalPages),
          };
        }

        const cacheControl = (isPrivileged || includeInactive)
          ? 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, private'
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      try {
        const productData = body?.product || body;

        // Security: Non-super admin cannot set buyingPrice without dedicated product.manage_buying_price permission
        // Viewing buying price NEVER grants permission to modify buying price
        const canManageBuyingPrice = auth!.role === 'super_admin' || hasPermission(auth!, 'product.manage_buying_price');
        const hasBuyingAttempt = productData.buyingPrice !== undefined || productData.buying_price !== undefined;
        if (!canManageBuyingPrice && hasBuyingAttempt) {
          return jsonResponse({
            success: false,
            error: 'Forbidden: You do not have the "product.manage_buying_price" permission required to set buying price.',
            requiredPermission: 'product.manage_buying_price',
          }, 403);
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      try {
        const isFeatured = body?.isFeatured !== undefined
          ? Boolean(body.isFeatured)
          : Boolean(body?.featured);
        const featuredSortOrder = body?.featuredSortOrder !== undefined
          ? Number(body.featuredSortOrder)
          : (body?.sortOrder !== undefined ? Number(body.sortOrder) : undefined);

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

  const productIdMatch = path.match(/^\/api\/(?:admin\/)?products\/([^/]+)$/);
  if (productIdMatch) {
    const prodId = decodeURIComponent(productIdMatch[1]);
    const isAdminRoute = path.startsWith('/api/admin/products/');
    const adminParam = url.searchParams.get('admin') === 'true';
    const isExplicitAdminRequest = isAdminRoute || adminParam;

    if (method === 'GET') {
      try {
        const authRes = await requireAuth(request, env);
        const user = authRes.auth;
        const isSuperAdmin = Boolean(!authRes.errorResponse && user?.role === 'super_admin');
        const hasProductView = Boolean(!authRes.errorResponse && user && (isSuperAdmin || hasPermission(user, 'product.view')));
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

        // If explicitly requesting admin product read:
        // Must be authenticated and have product.view permission or be Super Admin
        if (isExplicitAdminRequest) {
          if (authRes.errorResponse) {
            return authRes.errorResponse;
          }
          if (!hasProductView) {
            return jsonResponse(
              {
                success: false,
                error: 'Forbidden: You do not have the "product.view" permission required to perform this action.',
              },
              403
            );
          }
        }

        const shouldIncludeBuyingPrice = isSuperAdmin || canViewBuyingPrice;
        const product = await getProductById(env.DB, prodId, { includeBuyingPrice: shouldIncludeBuyingPrice });
        if (!product) return jsonResponse({ success: false, error: 'Product not found' }, 404);

        // Inactive / deleted products protection:
        const isInactive = Boolean(
          (product.status && product.status !== 'active' && (product.status as string) !== 'published') ||
          (product as any).isDeleted
        );
        if (isInactive) {
          // Public customers and unauthenticated users must never discover or view inactive products
          if (!user || user.role === 'customer') {
            return jsonResponse({ success: false, error: 'Product not found' }, 404);
          }
          // Authenticated staff / admin accounts must strictly have product.view permission
          if (!hasProductView) {
            return jsonResponse(
              {
                success: false,
                error: 'Forbidden: You do not have the "product.view" permission required to view inactive products.',
              },
              403
            );
          }
        }

        const safeProduct = sanitizeProductForRole(product, { isSuperAdmin, canViewBuyingPrice, canViewProfit });

        const cacheControl = (hasProductView || isInactive)
          ? 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, private'
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      try {
        const updates = body?.updates || body?.product || body;

        // Security: Non-super admin cannot modify buyingPrice without dedicated product.manage_buying_price permission
        // Viewing buying price NEVER grants permission to modify buying price
        const canManageBuyingPrice = auth!.role === 'super_admin' || hasPermission(auth!, 'product.manage_buying_price');
        const hasBuyingAttempt = updates.buyingPrice !== undefined || updates.buying_price !== undefined;
        if (!canManageBuyingPrice && hasBuyingAttempt) {
          return jsonResponse({
            success: false,
            error: 'Forbidden: You do not have the "product.manage_buying_price" permission required to modify buying price.',
            requiredPermission: 'product.manage_buying_price',
          }, 403);
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      try {
        const catData = body?.category || body;
        const created = await insertCategory(env.DB, catData);
        return jsonResponse({ success: true, category: created }, 201);
      } catch (err: any) {
        console.error('Error creating category:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  const categoryProductsMatch = path.match(/^\/api\/categories\/([^/]+)\/products\/?$/);
  if (categoryProductsMatch && method === 'GET') {
    const catId = decodeURIComponent(categoryProductsMatch[1]);
    const pageParam = url.searchParams.get('page');
    const limitParam = url.searchParams.get('limit');

    try {
      const { page, limit } = parseSafePagination(pageParam, limitParam, {
        defaultLimit: 12,
        maxLimit: 50,
      });

      const paginated = await getCategoryProductsPaginated(env.DB, {
        categoryId: catId,
        page,
        limit,
      });

      const safeItems = paginated.items.map((p) =>
        sanitizeProductForRole(p, { isSuperAdmin: false, canViewBuyingPrice: false, canViewProfit: false })
      );

      return jsonResponse(
        {
          success: true,
          items: safeItems,
          products: safeItems,
          total: paginated.total,
          page: paginated.page,
          limit: paginated.limit,
          totalPages: paginated.totalPages,
          hasMore: paginated.hasMore,
        },
        200,
        {
          'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=30',
          'Vary': 'Origin, Accept-Encoding',
        }
      );
    } catch (err: any) {
      console.error('Error fetching paginated category products:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      try {
        const updates = body?.updates || body?.category || body;
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      try {
        const slideData = body?.slide || body;
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      try {
        const items = Array.isArray(body) ? body : (body?.slides || body?.sliders || body?.order || []);
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      try {
        const updates = body?.updates || body?.slide || body;
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      try {
        const updates = body?.settings || body;

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
  // 4B. MEDIA ASSET UPLOAD & SERVING (D1 STORAGE)
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
        const uploadPurpose = String(formData.get('purpose') || '').trim().toLowerCase();
        if (!file) {
          return jsonResponse({ success: false, error: 'No file provided in form data' }, 400);
        }
        const maxLimit = uploadPurpose === 'review' ? REVIEW_MAX_IMAGE_SIZE : MAX_IMAGE_SIZE_BYTES;
        if (file.size > maxLimit) {
          return jsonResponse({
            success: false,
            error: uploadPurpose === 'review'
              ? 'File size exceeds maximum allowed 2MB limit for review photos.'
              : 'File size exceeds maximum allowed 10MB limit.',
          }, 413);
        }
        fileBuffer = await file.arrayBuffer();
      } else {
        const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
        if (jsonErr) return jsonErr;
        const uploadPurpose = String(body?.purpose || '').trim().toLowerCase();
        const dataUrl = body?.dataUrl || body?.image || '';
        if (!dataUrl || typeof dataUrl !== 'string') {
          return jsonResponse({ success: false, error: 'Expected dataUrl in JSON body' }, 400);
        }
        const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const base64Str = matches[2];
          const approxSize = Math.ceil((base64Str.length * 3) / 4);
          const maxLimit = uploadPurpose === 'review' ? REVIEW_MAX_IMAGE_SIZE : MAX_IMAGE_SIZE_BYTES;
          if (approxSize > maxLimit) {
            return jsonResponse({
              success: false,
              error: uploadPurpose === 'review'
                ? 'File size exceeds maximum allowed 2MB limit for review photos.'
                : 'File size exceeds maximum allowed 10MB limit.',
            }, 413);
          }
          const u8 = base64ToUint8Array(base64Str);
          if (u8.byteLength > maxLimit) {
            return jsonResponse({
              success: false,
              error: uploadPurpose === 'review'
                ? 'File size exceeds maximum allowed 2MB limit for review photos.'
                : 'File size exceeds maximum allowed 10MB limit.',
            }, 413);
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

      // 3. Store asset in Cloudflare D1 with strictly verified MIME type
      // Atomicity Guarantee: Fail the entire upload request (HTTP 500) if primary binary fails D1 persistence
      if (!env.DB) {
        return jsonResponse(
          { success: false, error: 'Database service unavailable for media persistence.' },
          500
        );
      }

      const base64Data = uint8ArrayToBase64(new Uint8Array(fileBuffer));
      try {
        await saveMediaAssetInD1(env.DB, key, verifiedMime, base64Data, fileBuffer.byteLength);
      } catch (persistErr: any) {
        console.error('[Upload Atomicity Failure] Primary media binary failed D1 persistence:', persistErr);
        return jsonResponse(
          { success: false, error: 'Failed to persist media asset in database.' },
          500
        );
      }

      // Pre-generate standard responsive variants (240, 360, 480, 720, 1080) if node/sharp is available
      // Isolate variant generation: Treat responsive WebP variants as non-blocking/optional
      if (typeof process !== 'undefined' && process.versions?.node) {
        try {
          const sharpModule = await import('sharp');
          const sharp = (sharpModule as any).default || sharpModule;
          const baseKeyWithoutExt = key.replace(/\.[^.]+$/, '');
          const standardWidths = [240, 360, 480, 720, 1080];
          for (const w of standardWidths) {
            try {
              const webpBuf = await sharp(Buffer.from(fileBuffer))
                .resize(w, null, { withoutEnlargement: true, fit: 'inside' })
                .webp({ quality: 82 })
                .toBuffer();
              const varKey = `${baseKeyWithoutExt}_w${w}.webp`;
              if (env.DB) {
                const b64 = Buffer.from(webpBuf).toString('base64');
                await saveMediaAssetInD1(env.DB, varKey, 'image/webp', b64, webpBuf.byteLength).catch((vErr) => {
                  console.warn(`[Media Variant] Non-blocking variant persistence skipped for ${varKey}:`, vErr);
                });
              }
            } catch (singleVarErr) {
              console.warn(`[Media Variant] Non-blocking variant generation skipped for width ${w}:`, singleVarErr);
            }
          }
        } catch (variantErr) {
          console.warn('Failed to pre-generate variants during upload:', variantErr);
        }
      }

      // 4. Record successful upload in distributed rate limiters ONLY after successful primary persistence
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

      const standardWidths = [240, 360, 480, 720, 1080];
      const matchedWidth = targetWidth
        ? (standardWidths.find((sw) => sw >= targetWidth) || 1080)
        : null;

      // 1. Check for pre-generated variant in D1 media storage first:
      if (targetWidth && targetWidth > 0 && targetWidth <= 2400) {
        const baseKeyWithoutExt = key.replace(/\.[^.]+$/, '');
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
          if (env.DB) {
            const varAsset = await getMediaAssetFromD1(env.DB, variantKey);
            if (varAsset) {
              variantBuffer = base64ToUint8Array(varAsset.dataBase64);
            }
          }
          if (variantBuffer && variantBuffer.byteLength > 0) {
            // Strictly validate MIME from magic-byte inspection before serving variant
            const varValidation = validateImageBuffer(variantBuffer);
            if (varValidation.valid && varValidation.mime) {
              return new Response(variantBuffer, {
                status: 200,
                headers: {
                  ...getSafeMediaHeaders(varValidation.mime),
                  ...getCorsHeaders(request, env),
                  'Content-Length': String(variantBuffer.byteLength),
                },
              });
            }
          }
        }
      }

      // 2. In production Cloudflare Workers with Image Resizing enabled:
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

      // Check D1 media_assets table
      if (env.DB) {
        const asset = await getMediaAssetFromD1(env.DB, key);
        if (asset) {
          rawBuffer = base64ToUint8Array(asset.dataBase64);
        }
      }

      if (!rawBuffer || rawBuffer.byteLength === 0) {
        return new Response('Media asset not found', {
          status: 404,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            ...getCorsHeaders(request, env),
          },
        });
      }

      // Strictly validate MIME/Content-Type from magic-byte inspection before responding
      const rawValidation = validateImageBuffer(rawBuffer);
      if (!rawValidation.valid || !rawValidation.mime) {
        return new Response('Invalid or corrupted image data', {
          status: 400,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            ...getCorsHeaders(request, env),
          },
        });
      }
      let verifiedContentType = rawValidation.mime;

      // If transformation was requested (?w=360, etc.)
      if (targetWidth && targetWidth > 0 && targetWidth <= 2400) {
        try {
          if (typeof process !== 'undefined' && process.versions?.node) {
            const sharpModule = await import('sharp');
            const sharp = (sharpModule as any).default || sharpModule;
            const accept = request.headers.get('accept') || '';
            const wantsWebp = accept.includes('image/webp') || verifiedContentType !== 'image/gif';

            const effectiveWidth = matchedWidth || targetWidth;
            let pipeline = sharp(Buffer.from(rawBuffer)).resize(effectiveWidth, null, {
              withoutEnlargement: true,
              fit: 'inside',
            });

            if (wantsWebp) {
              const webpBuffer = await pipeline.webp({ quality: Math.min(Math.max(targetQuality, 50), 95) }).toBuffer();
              const baseKeyWithoutExt = key.replace(/\.[^.]+$/, '');
              const varKey = `${baseKeyWithoutExt}_w${effectiveWidth}.webp`;
              try {
                if (env.DB) {
                  const b64 = Buffer.from(webpBuffer).toString('base64');
                  await saveMediaAssetInD1(env.DB, varKey, 'image/webp', b64, webpBuffer.byteLength);
                }
              } catch (persistErr) {
                console.warn('Failed to persist dynamic variant:', persistErr);
              }

              const transformedValidation = validateImageBuffer(webpBuffer);
              const dynamicMime = transformedValidation.valid && transformedValidation.mime ? transformedValidation.mime : 'image/webp';

              return new Response(webpBuffer, {
                status: 200,
                headers: {
                  ...getSafeMediaHeaders(dynamicMime),
                  ...getCorsHeaders(request, env),
                  'Content-Length': String(webpBuffer.byteLength),
                },
              });
            } else {
              const resizedBuffer = await pipeline.toBuffer();
              const transformedValidation = validateImageBuffer(resizedBuffer);
              const dynamicMime = transformedValidation.valid && transformedValidation.mime ? transformedValidation.mime : verifiedContentType;

              return new Response(resizedBuffer, {
                status: 200,
                headers: {
                  ...getSafeMediaHeaders(dynamicMime),
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
          ...getSafeMediaHeaders(verifiedContentType),
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
  // 4C. REVIEW IMAGES BLOB SERVING (D1 BINARY BLOB)
  // ==========================================
  const reviewImageBlobMatch = path.match(/^\/api\/reviews\/images\/([^/]+)$/);
  if (reviewImageBlobMatch && method === 'GET') {
    const imageId = decodeURIComponent(reviewImageBlobMatch[1]).trim();
    // Validate ID format to prevent unauthenticated ID tampering / path traversal / SQL injection
    if (!imageId || !/^[a-zA-Z0-9_\-]+$/.test(imageId)) {
      return jsonResponse({ success: false, error: 'Invalid review image ID format.' }, 400);
    }

    if (!env.DB) {
      return jsonResponse({ success: false, error: 'Database service unavailable.' }, 503);
    }

    try {
      const asset = await getReviewImageBlobFromD1(env.DB, imageId);
      if (!asset || !asset.data || asset.data.byteLength === 0) {
        return jsonResponse(
          { success: false, error: 'Review image not found.' },
          404,
          {
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          }
        );
      }

      const isApproved = asset.reviewStatus === 'approved';

      // If review is pending/rejected/deleted/unapproved, allow access ONLY if the request
      // contains valid admin authentication with review view permission; otherwise return 404.
      if (!isApproved) {
        const authRes = await requireAuth(request, env);
        if (authRes.errorResponse || !authRes.auth) {
          return jsonResponse(
            { success: false, error: 'Review image not found.' },
            404,
            {
              'Cache-Control': 'private, no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
            }
          );
        }

        const canView =
          hasPermission(authRes.auth, 'reviews.view') ||
          hasPermission(authRes.auth, 'review.view') ||
          hasPermission(authRes.auth, 'review.manage') ||
          authRes.auth.role === 'super_admin';

        if (!canView) {
          return jsonResponse(
            { success: false, error: 'Review image not found.' },
            404,
            {
              'Cache-Control': 'private, no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
            }
          );
        }
      }

      // Strictly validate MIME/Content-Type from magic-byte inspection before responding
      const validation = validateImageBuffer(asset.data);
      if (!validation.valid || !validation.mime) {
        return jsonResponse(
          { success: false, error: 'Corrupted or unsupported review image binary.' },
          400,
          {
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          }
        );
      }
      const verifiedMime = validation.mime;

      // Cache-Control headers:
      // - Moderated media: Serve with Cache-Control: private, no-cache for unapproved/pending states
      // - Serve with Cache-Control: public, max-age=86400, stale-while-revalidate=3600 ONLY for approved states
      const cacheControl = isApproved
        ? 'public, max-age=86400, stale-while-revalidate=3600'
        : 'private, no-cache';

      return new Response(asset.data.buffer, {
        status: 200,
        headers: {
          'Content-Type': verifiedMime,
          'Content-Length': String(asset.data.byteLength),
          'Cache-Control': cacheControl,
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'",
          'Vary': 'Accept, Origin, Cookie, Authorization',
          ...getCorsHeaders(request, env),
        },
      });
    } catch (err: any) {
      logServerError({ route: path, method, error: err, action: 'review_image.serve' });
      return jsonResponse({ success: false, error: 'Failed to retrieve review image.' }, 500);
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      try {
        const couponData = body?.coupon || body;
        const code = String(couponData?.code || '').trim();
        if (!code) {
          return jsonResponse({ success: false, error: 'Coupon code is required.' }, 400);
        }
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      try {
        const updates = body?.updates || body?.coupon || body;
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
        const requestedStatus = url.searchParams.get('status') || undefined;

        let allowNonApproved = false;
        if (requestedStatus && requestedStatus !== 'approved') {
          const authCheck = await requireAuth(request, env);
          if (authCheck.errorResponse || !authCheck.auth || authCheck.auth.role === 'customer') {
            return jsonResponse({
              success: false,
              error: 'Forbidden: Insufficient permissions to access review moderation queue.',
              requiredPermission: 'reviews.view',
            }, 403);
          }
          const hasView = hasPermission(authCheck.auth, 'reviews.view') || hasPermission(authCheck.auth, 'review.view');
          if (!hasView) {
            return jsonResponse({
              success: false,
              error: 'Forbidden: Insufficient permissions to access review moderation queue.',
              requiredPermission: 'reviews.view',
            }, 403);
          }
          allowNonApproved = true;
        }

        // Direct API check for authenticated admin users:
        // A user with an administrative token who lacks reviews.view must not retrieve review data through direct API calls.
        const token = extractTokenFromRequest(request);
        if (token) {
          const authRes = await requireAuth(request, env);
          if (authRes.errorResponse) {
            return authRes.errorResponse;
          }
          if (authRes.auth && (authRes.auth.role === 'admin' || authRes.auth.role === 'sub_admin')) {
            const hasView = hasPermission(authRes.auth, 'reviews.view') || hasPermission(authRes.auth, 'review.view');
            if (!hasView) {
              return jsonResponse({
                success: false,
                error: 'Forbidden: Insufficient permissions to view review data.',
                requiredPermission: 'reviews.view',
              }, 403);
            }
          }
        }

        const filter: ReviewQueryFilter = {
          productId,
          status: allowNonApproved ? (requestedStatus === 'all' ? undefined : requestedStatus) : 'approved',
          includeAllStatus: allowNonApproved && requestedStatus === 'all',
        };

        const reviews = await getAllReviews(env.DB, filter);
        const headers: Record<string, string> = {
          'Vary': 'Origin, Accept-Encoding',
        };
        if (!allowNonApproved) {
          headers['Cache-Control'] = 'public, max-age=30, s-maxage=60, stale-while-revalidate=30';
        } else {
          headers['Cache-Control'] = 'private, no-cache, no-store';
        }

        return jsonResponse({ success: true, count: reviews.length, reviews }, 200, headers);
      } catch (err: any) {
        console.error('Error fetching reviews:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }

    if (method === 'POST') {
      const createdReviewImageIds: string[] = [];
      try {
        const isDev = isDevEnvironment(env);
        const clientIp = getClientIp(request, isDev);
        const reviewIpKey = `rev-ip:${clientIp}`;

        const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
        if (jsonErr) return jsonErr;

        const reviewData = body?.review || body;

        const rawProductId = String(reviewData.productId || '').trim();
        const authorName = String(reviewData.authorName || reviewData.author || '').trim();
        const comment = String(reviewData.comment || '').trim();
        const rawRating = Number(reviewData.rating);

        if (!rawProductId) {
          return jsonResponse({ success: false, error: 'Product ID is required.' }, 400);
        }

        if (!authorName || !comment) {
          return jsonResponse({ success: false, error: 'Product, author name, and comment are required.' }, 400);
        }

        if (authorName.length < 2 || authorName.length > 60) {
          return jsonResponse({ success: false, error: 'Author name must be between 2 and 60 characters.' }, 400);
        }

        if (comment.length < 3 || comment.length > 1000) {
          return jsonResponse({ success: false, error: 'Review comment must be between 3 and 1000 characters.' }, 400);
        }

        if (!Number.isFinite(rawRating) || rawRating < 1 || rawRating > 5) {
          return jsonResponse({ success: false, error: 'Rating must be an integer between 1 and 5.' }, 400);
        }
        const rating = Math.min(5, Math.max(1, Math.round(rawRating)));

        // Validate target product exists in catalog and resolve canonical ID
        let targetProductId = rawProductId;
        if (env.DB) {
          try {
            const prod = await getProductById(env.DB, rawProductId);
            if (!prod) {
              return jsonResponse({ success: false, error: 'Product not found or invalid product ID.' }, 400);
            }
            targetProductId = prod.id;
          } catch (prodErr) {
            console.warn('[Review Route] Product resolution warning in D1:', prodErr);
          }
        }

        // Check if requester is authenticated admin creating an official review
        let isAdminCreation = false;
        let adminUser: any = null;
        let canApproveDirectly = false;
        const token = extractTokenFromRequest(request);
        if (token) {
          try {
            const authRes = await requireAuth(request, env);
            if (!authRes.errorResponse && authRes.auth && authRes.auth.role !== 'customer') {
              const canCreate = hasPermission(authRes.auth, 'reviews.create') || hasPermission(authRes.auth, 'review.manage') || authRes.auth.role === 'super_admin';
              if (canCreate) {
                isAdminCreation = true;
                adminUser = authRes.auth;
                canApproveDirectly = hasPermission(authRes.auth, 'reviews.approve') || hasPermission(authRes.auth, 'review.manage') || authRes.auth.role === 'super_admin';
              } else {
                const reqSrc = String(reviewData.source || '').toLowerCase().trim();
                const isExplicitAdminSubmission = (reqSrc && reqSrc !== 'customer') || reviewData.status !== undefined;
                if (isExplicitAdminSubmission) {
                  return jsonResponse({
                    success: false,
                    error: 'Forbidden: You do not have the "reviews.create" permission required to create official reviews.',
                    requiredPermission: 'reviews.create',
                  }, 403);
                }
              }
            }
          } catch {}
        }

        // Rate limiting applies to non-admin review submissions
        if (!isAdminCreation) {
          // 1. IP-based rate limiting (max 5 reviews per 10 minutes)
          const ipCheck = await checkRateLimit(reviewIpKey, 5, 600, env.DB);
          if (!ipCheck.allowed) {
            return jsonResponse({
              success: false,
              error: 'Too many reviews submitted from your connection. Please wait a few minutes before submitting another.'
            }, 429);
          }

          // 2. Per-product throttling (max 2 reviews per product per IP per 10 minutes)
          const prodThrottleKey = `rev-prod:${clientIp}:${targetProductId}`;
          const prodCheck = await checkRateLimit(prodThrottleKey, 2, 600, env.DB);
          if (!prodCheck.allowed) {
            return jsonResponse({
              success: false,
              error: 'You have recently reviewed this product. Please wait before submitting another review.'
            }, 429);
          }

          // Record submission attempts for rate limits
          await recordFailedAttempt(reviewIpKey, 5, 600, env.DB);
          await recordFailedAttempt(prodThrottleKey, 2, 600, env.DB);
        }

        // 3. Duplicate submission protection
        if (env.DB) {
          const dup = await env.DB.prepare(
            'SELECT id FROM reviews WHERE product_id = ? AND comment = ? LIMIT 1'
          ).bind(targetProductId, comment).first();
          if (dup) {
            return jsonResponse({
              success: false,
              error: 'A review with identical content has already been submitted for this product.'
            }, 409);
          }
        }

        // 4. Server-Authoritative verifiedPurchase Verification:
        // Customer submissions can NEVER force verifiedPurchase = true.
        // Client-provided email alone can NEVER make a review verifiedPurchase = true.
        let isVerifiedPurchase = false;

        if (env.DB) {
          try {
            if (isAdminCreation && reviewData.verifiedPurchase !== undefined) {
              isVerifiedPurchase = Boolean(reviewData.verifiedPurchase);
            } else {
              let authenticatedUserId: string | null = null;
              let authenticatedEmail: string | null = null;

              if (adminUser?.dbUser) {
                authenticatedUserId = String(adminUser.dbUser.id || '').trim();
                authenticatedEmail = String(adminUser.dbUser.email || '').trim().toLowerCase();
              } else if (token) {
                try {
                  const authRes = await requireAuth(request, env);
                  if (!authRes.errorResponse && authRes.auth?.dbUser) {
                    authenticatedUserId = String(authRes.auth.dbUser.id || '').trim();
                    authenticatedEmail = String(authRes.auth.dbUser.email || '').trim().toLowerCase();
                  }
                } catch {}
              }

              const guestOrderNo = String(reviewData.orderNumber || reviewData.order_number || '').trim();
              const guestPhone = String(reviewData.phone || reviewData.customerPhone || '').replace(/\D/g, '');

              isVerifiedPurchase = await verifyCustomerPurchaseInD1(env.DB, {
                authenticatedUserId,
                authenticatedEmail,
                guestOrderNumber: guestOrderNo,
                guestPhone,
                productId: targetProductId,
              });
            }
          } catch (vpErr) {
            console.error('[Review Error] Error determining verified purchase status in D1:', vpErr);
            isVerifiedPurchase = false;
          }
        }

        // 5. Sanitize and validate photos metadata (Strictly 2 MB per image, JPEG/PNG/WebP, max 5 photos)
        const reviewImages: string[] = [];

        try {
          if (Array.isArray(reviewData.images)) {
            for (const rawImg of reviewData.images.slice(0, 5)) {
              if (typeof rawImg !== 'string') continue;

              // Handle Base64 Data URLs (e.g. from customer review upload)
              const base64Match = rawImg.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/i);
              if (base64Match) {
                const base64Content = base64Match[2];
                const approxBinaryLength = Math.floor((base64Content.length * 3) / 4);
                if (approxBinaryLength > 2 * 1024 * 1024) {
                  return jsonResponse({
                    success: false,
                    error: 'Attached review photo exceeds maximum allowed limit of 2 MB.',
                  }, 400);
                }

                const u8 = base64ToUint8Array(base64Content);
                if (u8.byteLength > 2 * 1024 * 1024) {
                  return jsonResponse({
                    success: false,
                    error: 'Attached review photo exceeds maximum allowed limit of 2 MB.',
                  }, 400);
                }

                const validation = validateReviewPhotoBuffer(u8);
                if (!validation.valid || !validation.mime || !validation.extension) {
                  return jsonResponse({
                    success: false,
                    error: validation.error || 'Invalid review photo format. Only JPEG, PNG, and WebP are accepted.',
                  }, 400);
                }

                const imageId = `rev-img-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
                if (env.DB) {
                  await saveReviewImageBlobInD1(
                    env.DB,
                    imageId,
                    null,
                    targetProductId,
                    validation.mime,
                    u8
                  );
                  createdReviewImageIds.push(imageId);
                }
                reviewImages.push(`/api/reviews/images/${imageId}`);
                continue;
              }

              // Internal media references / safe URL references (arbitrary external URLs are rejected)
              const sanitized = sanitizeReviewImageReference(rawImg);
              if (sanitized) {
                const mediaKeyMatch = sanitized.match(/(?:^\/api\/media\/|^)([a-zA-Z0-9_\-.]+)$/);
                if (mediaKeyMatch && isValidMediaKey(mediaKeyMatch[1]) && env.DB) {
                  try {
                    const exists = await mediaAssetExistsInD1(env.DB, mediaKeyMatch[1]);
                    if (!exists) {
                      continue; // Skip invalid or nonexistent internal media assets
                    }
                  } catch {}
                }
                reviewImages.push(sanitized);
              }
            }
          }
        } catch (photoErr: any) {
          if (env.DB && createdReviewImageIds.length > 0) {
            for (const rollId of createdReviewImageIds) {
              await deleteReviewImageFromD1(env.DB, rollId).catch(() => {});
            }
          }
          console.error('[Review Photo Persist Error]:', photoErr);
          return jsonResponse({
            success: false,
            error: 'Failed to persist review photo asset in storage.',
          }, 500);
        }

        // 6. Security Rule: Customer-submitted reviews default strictly to 'pending' on the server.
        // Client attempts to set approval status, approved_by, approved_at, or source are strictly stripped.
        // Requirement 6 & 10: A user with reviews.create but without reviews.approve MUST NOT be able to approve reviews.
        let initialStatus: ReviewStatus = 'pending';
        let approvedBy: string | null = null;
        let approvedAt: string | null = null;

        if (isAdminCreation) {
          if (canApproveDirectly) {
            initialStatus = reviewData.status ? reviewData.status : 'approved';
            if (initialStatus === 'approved') {
              approvedBy = adminUser?.dbUser?.name || adminUser?.tokenUser?.email || 'admin';
              approvedAt = new Date().toISOString();
            }
          } else {
            // Admin has reviews.create but lacks reviews.approve: force to pending
            initialStatus = 'pending';
            approvedBy = null;
            approvedAt = null;
          }
        }
        const validReqSources: ReviewSource[] = ['admin', 'manual', 'whatsapp', 'facebook', 'messenger', 'instagram'];
        const reqSrc = String(reviewData.source || '').toLowerCase().trim();
        const initialSource: ReviewSource = isAdminCreation && validReqSources.includes(reqSrc as ReviewSource)
          ? (reqSrc as ReviewSource)
          : (isAdminCreation ? 'admin' : 'customer');

        let created;
        try {
          created = await insertReview(env.DB, {
            productId: targetProductId,
            authorName,
            comment,
            rating,
            verifiedPurchase: isVerifiedPurchase,
            status: initialStatus,
            source: initialSource,
            approvedAt,
            approvedBy,
            images: reviewImages,
          });

          // Link stored binary review_images to created review ID (including chunk rows)
          if (env.DB && createdReviewImageIds.length > 0) {
            for (const imgId of createdReviewImageIds) {
              await env.DB.prepare('UPDATE review_images SET review_id = ? WHERE id = ? OR id LIKE ?')
                .bind(created.id, imgId, `${imgId}_chunk_%`)
                .run();
            }
          }
        } catch (insertErr) {
          if (env.DB && createdReviewImageIds.length > 0) {
            for (const rollId of createdReviewImageIds) {
              await deleteReviewImageFromD1(env.DB, rollId).catch(() => {});
            }
          }
          throw insertErr;
        }

        return jsonResponse({ success: true, review: created }, 201);
      } catch (err: any) {
        if (env.DB && createdReviewImageIds.length > 0) {
          for (const rollId of createdReviewImageIds) {
            await deleteReviewImageFromD1(env.DB, rollId).catch(() => {});
          }
        }
        console.error('Error creating review:', err);
        return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
      }
    }
  }

  const reviewIdMatch = path.match(/^\/api\/reviews\/([^/]+)$/);
  if (reviewIdMatch && method === 'GET') {
    const revId = decodeURIComponent(reviewIdMatch[1]);
    try {
      const review = await getReviewById(env.DB, revId);
      if (!review) {
        return jsonResponse({ success: false, error: 'Review not found.' }, 404);
      }

      // Check if an admin token is passed: admin must have reviews.view
      const token = extractTokenFromRequest(request);
      if (token) {
        const authRes = await requireAuth(request, env);
        if (authRes.errorResponse) {
          return authRes.errorResponse;
        }
        if (authRes.auth && (authRes.auth.role === 'admin' || authRes.auth.role === 'sub_admin')) {
          const hasView = hasPermission(authRes.auth, 'reviews.view') || hasPermission(authRes.auth, 'review.view');
          if (!hasView) {
            return jsonResponse({
              success: false,
              error: 'Forbidden: Insufficient permissions to view review data.',
              requiredPermission: 'reviews.view',
            }, 403);
          }
        }
      }

      if (review.status !== 'approved') {
        const authCheck = await requireAuth(request, env);
        if (authCheck.errorResponse || !authCheck.auth || authCheck.auth.role === 'customer') {
          return jsonResponse({ success: false, error: 'Review not found.' }, 404);
        }
        const hasView = hasPermission(authCheck.auth, 'reviews.view') || hasPermission(authCheck.auth, 'review.view');
        if (!hasView) {
          return jsonResponse({ success: false, error: 'Forbidden: Insufficient permissions to access unapproved review details.', requiredPermission: 'reviews.view' }, 403);
        }
      }
      return jsonResponse({ success: true, review });
    } catch (err: any) {
      console.error('Error fetching review by ID:', err);
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  if (reviewIdMatch && (method === 'PATCH' || method === 'PUT')) {
    const revId = decodeURIComponent(reviewIdMatch[1]);
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    if (auth!.role === 'customer') {
      return jsonResponse({ success: false, error: 'Forbidden: Customers cannot moderate reviews.' }, 403);
    }

    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    const updates = body?.updates || body;
    const isChangingStatus = updates.status !== undefined;
    const isEditingContent =
      updates.comment !== undefined ||
      updates.rating !== undefined ||
      updates.authorName !== undefined ||
      updates.images !== undefined ||
      updates.verifiedPurchase !== undefined;

    const hasApprovePerm = hasPermission(auth!, 'reviews.approve') || hasPermission(auth!, 'review.manage') || auth!.role === 'super_admin';
    const hasEditPerm = hasPermission(auth!, 'reviews.edit') || hasPermission(auth!, 'review.manage') || auth!.role === 'super_admin';

    if (isChangingStatus && !hasApprovePerm) {
      return jsonResponse({
        success: false,
        error: 'Forbidden: You do not have the "reviews.approve" permission required to approve or moderate reviews.',
        requiredPermission: 'reviews.approve',
      }, 403);
    }

    if (isEditingContent && !hasEditPerm) {
      return jsonResponse({
        success: false,
        error: 'Forbidden: You do not have the "reviews.edit" permission required to edit reviews.',
        requiredPermission: 'reviews.edit',
      }, 403);
    }

    if (!hasApprovePerm && !hasEditPerm) {
      return jsonResponse({
        success: false,
        error: 'Forbidden: You do not have permission to moderate or edit reviews.',
        requiredPermission: 'reviews.edit',
      }, 403);
    }

    const adminIdentifier = auth!.dbUser?.name || auth!.tokenUser?.email || 'admin';

    // Validate updates
    if (updates.status !== undefined) {
      const s = String(updates.status).toLowerCase();
      if (s !== 'pending' && s !== 'approved' && s !== 'rejected') {
        return jsonResponse({ success: false, error: 'Invalid review status. Must be pending, approved, or rejected.' }, 400);
      }
    }

    if (updates.rating !== undefined) {
      const r = Number(updates.rating);
      if (!Number.isFinite(r) || r < 1 || r > 5) {
        return jsonResponse({ success: false, error: 'Rating must be an integer between 1 and 5.' }, 400);
      }
    }

    if (updates.comment !== undefined) {
      const c = String(updates.comment).trim();
      if (c.length < 3 || c.length > 1000) {
        return jsonResponse({ success: false, error: 'Review comment must be between 3 and 1000 characters.' }, 400);
      }
    }

    if (updates.authorName !== undefined) {
      const a = String(updates.authorName).trim();
      if (a.length < 2 || a.length > 60) {
        return jsonResponse({ success: false, error: 'Author name must be between 2 and 60 characters.' }, 400);
      }
    }

    let validatedImages: string[] | undefined = undefined;
    if (Array.isArray(updates.images)) {
      validatedImages = [];
      for (const rawImg of updates.images.slice(0, 5)) {
        const sanitized = sanitizeReviewImageReference(rawImg);
        if (sanitized) validatedImages.push(sanitized);
      }
    }

    try {
      const updated = await updateReviewInD1(env.DB, revId, {
        status: updates.status,
        approvedBy: adminIdentifier,
        comment: updates.comment ? String(updates.comment).trim() : undefined,
        rating: updates.rating !== undefined ? Math.round(Number(updates.rating)) : undefined,
        authorName: updates.authorName ? String(updates.authorName).trim() : undefined,
        images: validatedImages,
        verifiedPurchase: updates.verifiedPurchase !== undefined ? Boolean(updates.verifiedPurchase) : undefined,
      });

      if (!updated) {
        return jsonResponse({ success: false, error: 'Review not found.' }, 404);
      }

      // Edge cache invalidation when review is rejected or status transitions away from approved
      if (updates.status === 'rejected' || updates.status === 'pending') {
        if (typeof caches !== 'undefined' && (caches as any).default) {
          try {
            const origin = new URL(request.url).origin;
            const imgs = Array.isArray(updated.images) ? updated.images : [];
            for (const img of imgs) {
              const imgMatch = String(img).match(/\/api\/reviews\/images\/([a-zA-Z0-9_\-]+)/);
              if (imgMatch) {
                await (caches as any).default.delete(new Request(`${origin}/api/reviews/images/${imgMatch[1]}`));
              }
            }
          } catch (cacheErr) {
            console.warn('[Cache Invalidation Warning]:', cacheErr);
          }
        }
      }

      return jsonResponse({ success: true, review: updated });
    } catch (err: any) {
      logServerError({ route: path, method, error: err, action: 'review.manage' });
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
    }
  }

  if (reviewIdMatch && method === 'DELETE') {
    const revId = decodeURIComponent(reviewIdMatch[1]);
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;
    if (auth!.role === 'customer') {
      return jsonResponse({ success: false, error: 'Forbidden: Customers cannot delete reviews.' }, 403);
    }
    const permErr = requirePermission(auth!, 'reviews.delete');
    if (permErr) return permErr;

    try {
      const existingReview = await getReviewById(env.DB, revId).catch(() => null);

      await deleteReviewFromD1(env.DB, revId);

      // Edge cache invalidation when review is deleted
      if (typeof caches !== 'undefined' && (caches as any).default && existingReview && Array.isArray(existingReview.images)) {
        try {
          const origin = new URL(request.url).origin;
          for (const img of existingReview.images) {
            const imgMatch = String(img).match(/\/api\/reviews\/images\/([a-zA-Z0-9_\-]+)/);
            if (imgMatch) {
              await (caches as any).default.delete(new Request(`${origin}/api/reviews/images/${imgMatch[1]}`));
            }
          }
        } catch (cacheErr) {
          console.warn('[Cache Invalidation Warning]:', cacheErr);
        }
      }

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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      try {
        const userData = body?.user || body;

        // Sub-admin or admin can NEVER create a super_admin account!
        if (userData.role === 'super_admin' && auth!.role !== 'super_admin') {
          return jsonResponse(
            { success: false, error: 'Forbidden: Only a Super Administrator can create a Super Admin account.' },
            403
          );
        }

        // Sub-admin or admin can NEVER configure roles or permissions during account creation!
        if (auth!.role !== 'super_admin' && (detectPrivilegeEscalationAttempt(body) || userData.role !== undefined || userData.permissions || userData.permissions_json)) {
          return jsonResponse(
            { success: false, error: 'Forbidden: Only Super Administrator can configure account roles or permissions.' },
            403
          );
        }

        // Validate password policy if supplied during admin user creation
        if (userData.password) {
          const plainPw = String(userData.password).trim();
          if (plainPw.length < MIN_PASSWORD_LENGTH) {
            return jsonResponse(
              { success: false, error: 'Password must be at least 8 characters long.' },
              400
            );
          }
          userData.password = plainPw;
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) return jsonErr;

      // Strict Privilege Escalation Protection:
      // Non-super_admin accounts can NEVER modify roles or permissions for any account (including their own).
      // Checked immediately to prevent user enumeration and guarantee HTTP 403 on all unauthorized escalation attempts.
      if (auth!.role !== 'super_admin' && detectPrivilegeEscalationAttempt(body)) {
        return jsonResponse(
          { success: false, error: 'Forbidden: Only Super Administrator can modify account roles or permissions.' },
          403
        );
      }

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
        const updates = body?.updates || body?.user || body || {};

        // Never allow altering internal immutable primary key or timestamps
        delete updates.id;
        delete updates.createdAt;
        delete updates.created_at;
        delete updates.updatedAt;
        delete updates.updated_at;

        const hasDirectRole = Object.prototype.hasOwnProperty.call(body || {}, 'role');
        const hasDirectPerm = Object.prototype.hasOwnProperty.call(body || {}, 'permissions');

        if (auth!.role !== 'super_admin' && (hasDirectRole || hasDirectPerm)) {
          return jsonResponse(
            { success: false, error: 'Forbidden: Only Super Administrator can modify account roles or permissions.' },
            403
          );
        }

        if (isSelf && auth!.role !== 'super_admin') {
          delete updates.role;
          delete updates.permissions;
        }

        // Strict Privilege Escalation Protection:
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

        if (updates.role === 'super_admin' && auth!.role !== 'super_admin') {
          return jsonResponse(
            { success: false, error: 'Forbidden: Cannot promote account to Super Administrator.' },
            403
          );
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
          if (plainPw.length < MIN_PASSWORD_LENGTH) {
            return jsonResponse(
              { success: false, error: 'New password must be at least 8 characters long.' },
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
          const isPrivilegedAdmin = isAdminRole(updated.role);
          const now = Math.floor(Date.now() / 1000);
          const maxAgeSeconds = isPrivilegedAdmin ? ADMIN_SESSION_IDLE_TIMEOUT_SECONDS : CUSTOMER_SESSION_EXPIRATION_SECONDS;

          const freshToken = await createAuthToken(
            {
              userId: updated.id,
              email: updated.email,
              role: updated.role,
              pwdSig: newPwdSig,
              ...(isPrivilegedAdmin ? { authTime: auth?.tokenUser?.authTime || now, lastActivity: now } : {}),
            },
            secret,
            maxAgeSeconds
          );
          freshCookieHeader = buildAuthCookieHeader(request, freshToken, maxAgeSeconds, env);
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

    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    try {
      const newPassword = (body?.newPassword || body?.password || '').trim();

      if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
        return jsonResponse(
          { success: false, error: 'New password must be at least 8 characters long.' },
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
  if ((path === '/api/admin/orders/export' || path === '/api/orders/export') && method === 'GET') {
    const { auth, errorResponse } = await requireAuth(request, env);
    if (errorResponse) return errorResponse;

    const canViewOrders =
      auth!.role === 'super_admin' ||
      hasPermission(auth!, 'order.view') ||
      hasPermission(auth!, 'order.manage');

    if (!canViewOrders) {
      return jsonResponse(
        {
          success: false,
          error: 'Forbidden: Insufficient permissions to view or export orders.',
          requiredPermission: 'order.view',
        },
        403
      );
    }

    try {
      let whereClause = ' WHERE 1=1';
      const bindings: any[] = [];

      // 1. Parameterized Date Range Filters (startDate & endDate)
      const startDate = (url.searchParams.get('startDate') || '').trim();
      if (startDate) {
        if (startDate.length === 10) {
          whereClause += ' AND substr(created_at, 1, 10) >= ?';
          bindings.push(startDate);
        } else {
          whereClause += ' AND created_at >= ?';
          bindings.push(startDate);
        }
      }

      const endDate = (url.searchParams.get('endDate') || '').trim();
      if (endDate) {
        if (endDate.length === 10) {
          whereClause += ' AND substr(created_at, 1, 10) <= ?';
          bindings.push(endDate);
        } else {
          whereClause += ' AND created_at <= ?';
          bindings.push(endDate);
        }
      }

      // 2. Parameterized Shipping / Courier Status Filter
      const statusParam = (url.searchParams.get('status') || '').trim();
      if (statusParam && statusParam.toLowerCase() !== 'all') {
        const statusKey = statusParam.toLowerCase();
        if (statusKey === 'pending') {
          whereClause += ` AND (
            LOWER(shipping_status) IN ('pending', 'processing')
            OR LOWER(COALESCE(courier_status, '')) LIKE '%pending%'
            OR LOWER(COALESCE(courier_status, '')) LIKE '%pickup%'
          )`;
        } else if (statusKey === 'processing') {
          whereClause += ` AND LOWER(shipping_status) = 'processing'`;
        } else if (statusKey === 'shipped') {
          whereClause += ` AND (
            LOWER(shipping_status) = 'shipped'
            OR LOWER(COALESCE(courier_status, '')) LIKE '%ship%'
            OR LOWER(COALESCE(courier_status, '')) LIKE '%transit%'
          )`;
        } else if (statusKey === 'delivered') {
          whereClause += ` AND (
            LOWER(shipping_status) = 'delivered'
            OR LOWER(COALESCE(courier_status, '')) LIKE '%deliver%'
          )`;
        } else if (statusKey === 'cancelled') {
          whereClause += ` AND (
            LOWER(shipping_status) = 'cancelled'
            OR LOWER(COALESCE(courier_status, '')) LIKE '%cancel%'
            OR LOWER(COALESCE(courier_status, '')) LIKE '%return%'
          )`;
        } else {
          whereClause += ` AND LOWER(shipping_status) = ?`;
          bindings.push(statusKey);
        }
      }

      // 3. Parameterized Payment Status Filter
      const paymentParam = (url.searchParams.get('paymentStatus') || url.searchParams.get('payment') || '').trim();
      if (paymentParam && paymentParam.toLowerCase() !== 'all') {
        const paymentKey = paymentParam.toUpperCase();
        if (paymentKey === 'PAID') {
          whereClause += ` AND UPPER(payment_status) = 'PAID'`;
        } else if (paymentKey === 'PARTIAL' || paymentKey === 'PARTIALLY_PAID') {
          whereClause += ` AND (UPPER(payment_status) = 'PARTIAL' OR UPPER(payment_status) = 'PARTIALLY_PAID')`;
        } else if (paymentKey === 'DUE') {
          whereClause += ` AND UPPER(payment_status) != 'PAID'`;
        } else if (paymentParam.toLowerCase() === 'dbbl') {
          whereClause += ` AND LOWER(payment_method) = 'dbbl'`;
        } else if (paymentParam.toLowerCase() === 'cod') {
          whereClause += ` AND LOWER(payment_method) = 'cod'`;
        } else {
          whereClause += ` AND UPPER(payment_status) = ?`;
          bindings.push(paymentKey);
        }
      }

      // 4. Parameterized Search Filter (customer name, phone, order number, id)
      const searchParam = (url.searchParams.get('search') || '').trim();
      if (searchParam) {
        const s = `%${searchParam}%`;
        whereClause += ` AND (
          order_number LIKE ?
          OR customer_phone LIKE ?
          OR customer_name LIKE ?
          OR id LIKE ?
          OR customer_address LIKE ?
          OR COALESCE(customer_district, '') LIKE ?
          OR COALESCE(courier_waybill, '') LIKE ?
          OR COALESCE(consignment_id, '') LIKE ?
        )`;
        bindings.push(s, s, s, s, s, s, s, s);
      }

      // 5. Parameterized Order IDs List Filter
      const rawOrderIds = url.searchParams.get('orderIds');
      const orderIdsList = rawOrderIds
        ? rawOrderIds.split(',').map((id) => id.trim()).filter(Boolean)
        : url.searchParams.getAll('orderIds').map((id) => id.trim()).filter(Boolean);

      if (orderIdsList.length > 0) {
        const safeIds = orderIdsList.slice(0, 500);
        const placeholders = safeIds.map(() => '?').join(', ');
        whereClause += ` AND (id IN (${placeholders}) OR order_number IN (${placeholders}))`;
        bindings.push(...safeIds, ...safeIds);
      }

      // 6. Parameterized Bounded Limit (default 2000, capped at max 2000 rows)
      const rawLimit = parseInt(url.searchParams.get('limit') || '2000', 10);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(2000, rawLimit) : 2000;

      const querySql = `SELECT * FROM orders${whereClause} ORDER BY created_at DESC, id DESC LIMIT ?`;
      bindings.push(limit);

      const dbStmt = env.DB.prepare(querySql).bind(...bindings);
      const queryResult = await dbStmt.all<OrderRow>();
      const orderRows = queryResult.results || [];
      const orders = orderRows.map(rowToOrder);

      // 7. Role-based cost & profit permission controls
      const isSuperAdmin = auth!.role === 'super_admin';
      const canViewBuyingPrice = hasPermission(auth!, 'product.view_buying_price') || isSuperAdmin;
      const canViewProfit =
        hasPermission(auth!, 'report.profit') ||
        hasPermission(auth!, 'product.view_profit') ||
        isSuperAdmin;

      const format = (url.searchParams.get('format') || (url.searchParams.get('itemized') === 'true' ? 'itemized' : 'summary')) as 'summary' | 'itemized';

      const csvContent = generateOrdersCsv(orders, {
        isSuperAdmin,
        canViewBuyingPrice,
        canViewProfit,
        format,
      });

      const todayStr = new Date().toISOString().slice(0, 10);
      const filename = `orders-export-${todayStr}.csv`;

      return new Response(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          ...getCorsHeaders(request, env),
        },
      });
    } catch (err: any) {
      console.error('Error exporting orders to CSV:', err);
      return jsonResponse({ success: false, error: 'Internal server error while exporting orders.' }, 500);
    }
  }

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

      // 1. Backend Enforced IP Rate Limit: Maximum 4 successful order attempts in a rolling 10-minute window
      const timeOffsetMs = isDev ? (Number(request.headers.get('x-test-timestamp-offset')) || 0) : 0;
      const rateLimitCheck = await checkAndConsumeOrderRateLimit(clientIp, 4, 600, env.DB, timeOffsetMs);
      if (!rateLimitCheck.allowed) {
        const retrySecs = rateLimitCheck.remainingSeconds || 600;
        return jsonResponse(
          {
            success: false,
            error: 'Too many orders. Please try again later.',
          },
          429,
          {
            'Retry-After': String(retrySecs),
            'X-RateLimit-Limit': '4',
            'X-RateLimit-Remaining': '0',
          }
        );
      }

      const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
      if (jsonErr) {
        await rollbackOrderRateLimit(clientIp, env.DB);
        return jsonErr;
      }
      const orderData: Order = body?.order || body;

      if (!orderData) {
        await rollbackOrderRateLimit(clientIp, env.DB);
        return jsonResponse({ success: false, error: 'Invalid order payload.' }, 400);
      }

      // Authoritative Identity Determination:
      // Supports BOTH HttpOnly cookie ('auth_token') and 'Authorization: Bearer <token>' headers.
      // - If session token is provided:
      //   Authenticate authoritatively via requireAuth(request, env).
      //   If requireAuth fails (expired, invalid signature, password changed, account deactivated/suspended):
      //     Immediately rollback rate limit, return the 401/403 error response, and stop execution.
      //   No fallback token verification that bypasses session validation rules is permitted.
      // - If valid authenticated session exists:
      //   Authoritatively attach verified userId and userEmail from server-side context.
      // - If unauthenticated (guest checkout, no token provided):
      //   Proceed as legitimate guest checkout.
      //   Client-supplied userId, customerId, role, and authentication status are NEVER trusted and are stripped.
      verifiedTokenUser = null;
      let authenticatedDbUser: any = null;
      let isAdminSession = false;

      const token = extractTokenFromRequest(request);
      if (token) {
        const authRes = await requireAuth(request, env);
        if (authRes.errorResponse || !authRes.auth) {
          await rollbackOrderRateLimit(clientIp, env.DB);
          return (
            authRes.errorResponse ||
            jsonResponse(
              { success: false, error: 'Unauthorized: Authentication required.' },
              401
            )
          );
        }
        authenticatedDbUser = authRes.auth.dbUser;
        verifiedTokenUser = authRes.auth.tokenUser;
        isAdminSession = Boolean(
          authRes.auth.role === 'super_admin' ||
          authRes.auth.role === 'admin' ||
          authRes.auth.role === 'sub_admin' ||
          hasPermission(authRes.auth, 'order.manage')
        );
      }

      // Security hardening: Client-provided userId, customerId, role, and auth status are NEVER trusted
      delete (orderData as any).role;
      delete (orderData as any).userRole;
      delete (orderData as any).customerId;
      delete (orderData as any).isAuthenticated;
      delete (orderData as any).authenticated;
      if (orderData.customer) {
        delete (orderData.customer as any).role;
        delete (orderData.customer as any).userRole;
        delete (orderData.customer as any).customerId;
        delete (orderData.customer as any).isAuthenticated;
        delete (orderData.customer as any).authenticated;
      }

      // Security hardening: Advance payment spoofing protection (Bug #2)
      // Force advancePayment = 0 for unauthenticated guest or non-admin checkout.
      // Strictly preserve client-supplied advancePayment ONLY for authenticated admin sessions.
      if (!isAdminSession) {
        orderData.advancePayment = 0;
        delete (orderData as any).advance_payment;
        orderData.advancePaymentMethod = undefined;
        delete (orderData as any).advance_payment_method;
        orderData.advancePaymentNote = undefined;
        delete (orderData as any).advance_payment_note;
        orderData.advancePaymentUpdatedAt = undefined;
        delete (orderData as any).advance_payment_updated_at;
        orderData.advancePaymentUpdatedBy = undefined;
        delete (orderData as any).advance_payment_updated_by;
      }

      if (verifiedTokenUser) {
        const resolvedUserId = (authenticatedDbUser?.id || verifiedTokenUser.userId || '').trim();
        const resolvedUserEmail = (authenticatedDbUser?.email || verifiedTokenUser.email || '').trim().toLowerCase();

        orderData.userId = resolvedUserId || undefined;
        orderData.userEmail = resolvedUserEmail || undefined;

        if (orderData.customer) {
          orderData.customer.userId = resolvedUserId || undefined;
          if (resolvedUserEmail) {
            orderData.customer.email = resolvedUserEmail;
          }
          if (!orderData.customer.fullName && authenticatedDbUser?.name) {
            orderData.customer.fullName = authenticatedDbUser.name;
          }
          if (!orderData.customer.phone && authenticatedDbUser?.phone) {
            orderData.customer.phone = authenticatedDbUser.phone;
          }
        }
      } else {
        // Guest checkout: preserve delivery info but strip client-supplied userId to prevent impersonation
        orderData.userId = undefined;
        orderData.userEmail = undefined;
        if (orderData.customer) {
          orderData.customer.userId = undefined;
        }
      }

      if (!orderData.customer?.fullName || !orderData.customer?.phone || !orderData.customer?.fullAddress) {
        await rollbackOrderRateLimit(clientIp, env.DB);
        return jsonResponse({ success: false, error: 'Missing required customer delivery information.' }, 400);
      }

      const cleanPhone = (orderData.customer.phone || '').replace(/\D/g, '');
      if (cleanPhone.length < 11) {
        await rollbackOrderRateLimit(clientIp, env.DB);
        return jsonResponse({ success: false, error: 'A valid 11-digit Bangladeshi contact phone number is required.' }, 400);
      }

      // 2. Abuse Protection: Hourly phone-based limit (maximum 6 in 1 hour; no 60s cooldown)
      const phoneSustainedCheck = await checkRateLimit(`order_ph_hour:${cleanPhone}`, 6, 3600, env.DB);
      if (!phoneSustainedCheck.allowed) {
        await rollbackOrderRateLimit(clientIp, env.DB);
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
      // Security Hardening: Idempotency is strictly bound to customer identity (user ID or guest phone/email)
      // and the deterministic SHA-256 fingerprint of the order payload to prevent cross-user token reuse.
      const customerIdentity = deriveCustomerIdentityScope(
        orderData.userId,
        cleanPhone,
        (orderData.customer?.email || orderData.userEmail || '').toLowerCase().trim()
      );
      const payloadFingerprint = await computeOrderPayloadFingerprint(orderData);

      const idempotencyKey = (
        request.headers.get('idempotency-key') ||
        request.headers.get('x-idempotency-key') ||
        body.idempotencyKey ||
        (orderData as any).idempotencyKey ||
        ''
      ).trim();

      if (idempotencyKey) {
        // Look up cached idempotency record (first persistent D1, then in-memory map)
        let cachedEntry: { payload: any; createdAt: number } | null = null;

        if (env.DB) {
          try {
            const row = await env.DB.prepare(
              'SELECT response_json, created_at FROM order_idempotency WHERE key = ? LIMIT 1'
            ).bind(idempotencyKey).first<{ response_json: string; created_at: number }>();

            if (row && row.response_json) {
              const now = Date.now();
              if (now - row.created_at < 24 * 60 * 60 * 1000) {
                cachedEntry = {
                  payload: JSON.parse(row.response_json),
                  createdAt: row.created_at,
                };
              }
            }
          } catch (idemErr) {
            console.error('[Idempotency Error] Error checking D1 order_idempotency:', idemErr);
          }
        }

        if (!cachedEntry) {
          const mem = orderIdempotencyMap.get(idempotencyKey);
          if (mem && Date.now() - mem.timestamp < 15 * 60 * 1000) {
            cachedEntry = {
              payload: mem.payload,
              createdAt: mem.timestamp,
            };
          }
        }

        if (cachedEntry) {
          const cachedPayload = cachedEntry.payload;
          const meta = cachedPayload?._meta;

          // Security Verification 1: Identity Binding Check
          // An idempotency key MUST NOT be reused across different users or guest sessions.
          if (meta?.ownerIdentity && meta.ownerIdentity !== customerIdentity) {
            await rollbackOrderRateLimit(clientIp, env.DB);
            return jsonResponse(
              {
                success: false,
                error: 'Idempotency key has already been used by a different customer session.',
                code: 'IDEMPOTENCY_IDENTITY_MISMATCH',
              },
              409
            );
          } else if (!meta?.ownerIdentity && cachedPayload?.order) {
            // Backward compatibility with legacy cached records:
            const cachedUserId = cachedPayload.order.userId;
            const cachedPhone = (cachedPayload.order.customer?.phone || '').replace(/\D/g, '');
            if (orderData.userId && cachedUserId && orderData.userId !== cachedUserId) {
              await rollbackOrderRateLimit(clientIp, env.DB);
              return jsonResponse(
                { success: false, error: 'Idempotency key has already been used by a different customer session.', code: 'IDEMPOTENCY_IDENTITY_MISMATCH' },
                409
              );
            }
            if (cleanPhone && cachedPhone && cleanPhone !== cachedPhone) {
              await rollbackOrderRateLimit(clientIp, env.DB);
              return jsonResponse(
                { success: false, error: 'Idempotency key has already been used by a different contact phone.', code: 'IDEMPOTENCY_IDENTITY_MISMATCH' },
                409
              );
            }
          }

          // Security Verification 2: Request Payload Fingerprint Check
          // An idempotency key cannot be replayed with mutated order parameters.
          if (meta?.payloadFingerprint && meta.payloadFingerprint !== payloadFingerprint) {
            await rollbackOrderRateLimit(clientIp, env.DB);
            return jsonResponse(
              {
                success: false,
                error: 'Idempotency key was previously used with different order parameters.',
                code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
              },
              409
            );
          }

          // Valid Idempotent Replay Match: Rollback consumed rate limit and return cached response
          await rollbackOrderRateLimit(clientIp, env.DB);
          const sanitizedOrder = sanitizeOrderForRole(cachedPayload.order, false);
          return jsonResponse(
            {
              success: true,
              message: `Order #${cachedPayload.order?.orderNumber || ''} successfully retrieved (idempotent request).`,
              order: sanitizedOrder,
              idempotent: true,
            },
            200,
            { 'X-Idempotency-Cache': 'HIT' }
          );
        }
      }

      // 4. Duplicate Click Protection: Rapid double-click within 15 seconds from same phone & IP
      const doubleClickFingerprint = `${clientIp}:${cleanPhone}:${payloadFingerprint.slice(0, 16)}`;
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
      const saved = await insertOrder(env.DB, orderData, { isPrivilegedAdmin: isAdminSession });

      // Record rate limit attempt for hourly phone throttling (no 60s cooldown)
      await recordFailedAttempt(`order_ph_hour:${cleanPhone}`, 6, 3600, env.DB);

      // Cache for idempotency & rapid duplicate avoidance (both persistent D1 and memory)
      if (idempotencyKey) {
        const idempotentPayload = {
          success: true,
          message: `Order #${saved.orderNumber} successfully retrieved (idempotent request).`,
          order: sanitizeOrderForRole(saved, false),
          idempotent: true,
          _meta: {
            ownerIdentity: customerIdentity,
            payloadFingerprint: payloadFingerprint,
            createdAt: Date.now(),
          },
        };

        orderIdempotencyMap.set(idempotencyKey, {
          order: saved,
          payload: idempotentPayload,
          timestamp: Date.now(),
        });

        if (env.DB) {
          try {
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
      await rollbackOrderRateLimit(clientIp, env.DB);
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

      const { data: body, errorResponse: jsonErr } = await safeParseJson<{ updates?: Partial<Order> } & Partial<Order>>(request);
      if (jsonErr) return jsonErr;

      try {
        const updates: Partial<Order> = body?.updates || body || {};
        if (!updates || typeof updates !== 'object') {
          return jsonResponse({ success: false, error: 'Invalid update payload.' }, 400);
        }
        const updateKeys = Object.keys(updates);

        const existing = await getOrderById(env.DB, orderId);
        if (!existing) {
          return jsonResponse({ success: false, error: 'Order not found' }, 404);
        }

        const hasAdvanceUpdate =
          updates.advancePayment !== undefined ||
          (updates as any).advance_payment !== undefined;

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
        } else if (isStatusOnly && !hasAdvanceUpdate) {
          if (!hasPermission(auth!, 'order.status_change') && !hasPermission(auth!, 'order.manage') && auth!.role !== 'super_admin') {
            return jsonResponse({ success: false, error: 'Forbidden: Order status change permission required.', requiredPermission: 'order.status_change' }, 403);
          }
        } else {
          const permErr = requirePermission(auth!, 'order.manage');
          if (permErr) return permErr;
        }

        const previousAdvance = existing.advancePayment != null ? Number(existing.advancePayment) : 0;
        let validatedAdvance = previousAdvance;

        if (hasAdvanceUpdate) {
          const rawAdvance = updates.advancePayment !== undefined ? updates.advancePayment : (updates as any).advance_payment;
          const parsedAdvance = typeof rawAdvance === 'string' ? Number(rawAdvance) : rawAdvance;

          // 1. Value must be a valid finite monetary number
          if (typeof parsedAdvance !== 'number' || !Number.isFinite(parsedAdvance) || Number.isNaN(parsedAdvance)) {
            return jsonResponse({
              success: false,
              error: 'Invalid advance payment: Must be a valid finite monetary number.',
            }, 400);
          }

          // 2. advance >= 0
          if (parsedAdvance < 0) {
            return jsonResponse({
              success: false,
              error: 'Invalid advance payment: Advance payment amount cannot be negative. Value must be greater than or equal to 0.',
            }, 400);
          }

          validatedAdvance = Math.round(parsedAdvance * 100) / 100;
        }

        // Authoritative Server-Side Recalculation (Items, Prices, Subtotal, Delivery, Discount, Total, Profit, Due)
        let authoritativeSubtotal = Number(existing.subtotal) || 0;
        let authoritativeTotalCost = Number(existing.totalCost) || 0;
        let authoritativeTotalProfit = Number(existing.totalGrossProfit) || 0;
        let enrichedItems: any[] | null = null;

        const MAX_ORDER_ITEM_QTY = 100;

        if (updates.items !== undefined) {
          if (!Array.isArray(updates.items) || updates.items.length === 0) {
            return jsonResponse({
              success: false,
              error: 'Invalid order items: An order must contain at least one product item.',
            }, 400);
          }

          // 1. Strict validation of each item quantity and product ID
          for (const it of updates.items) {
            if (!it || typeof it !== 'object') {
              return jsonResponse({
                success: false,
                error: 'Invalid order item: Each item must be a valid object.',
              }, 400);
            }
            const prodId = String(it.product?.id || (it as any).productId || '').trim();
            if (!prodId) {
              return jsonResponse({
                success: false,
                error: 'Invalid order item: Each order item must specify a valid product ID.',
              }, 400);
            }
            const rawQty = (it as any).quantity;
            let parsedQty: number;
            if (typeof rawQty === 'number') {
              parsedQty = rawQty;
            } else if (typeof rawQty === 'string' && /^\d+$/.test((rawQty as string).trim())) {
              parsedQty = Number((rawQty as string).trim());
            } else {
              return jsonResponse({
                success: false,
                error: `Invalid item quantity for product "${prodId}": Must be a strict finite positive integer between 1 and ${MAX_ORDER_ITEM_QTY}.`,
              }, 400);
            }

            if (!Number.isFinite(parsedQty) || !Number.isInteger(parsedQty) || parsedQty < 1 || parsedQty > MAX_ORDER_ITEM_QTY) {
              return jsonResponse({
                success: false,
                error: `Invalid item quantity for product "${prodId}": Must be a strict finite positive integer between 1 and ${MAX_ORDER_ITEM_QTY}.`,
              }, 400);
            }
          }

          // 2. Validate products existence and active status in D1
          const uniqueProductIds = Array.from(
            new Set(updates.items.map((it: any) => String(it.product?.id || it.productId || '').trim()))
          );
          const d1Products = await getProductsByIds(env.DB, uniqueProductIds, { includeBuyingPrice: true });
          const d1ProductMap = new Map(d1Products.map((p) => [p.id, p]));

          for (const pid of uniqueProductIds) {
            const d1Prod = d1ProductMap.get(pid);
            if (!d1Prod) {
              return jsonResponse({
                success: false,
                error: `Product with ID "${pid}" does not exist in D1 database.`,
              }, 400);
            }
            if (d1Prod.status && d1Prod.status !== 'active') {
              return jsonResponse({
                success: false,
                error: `Product "${d1Prod.title}" is inactive or unavailable for ordering.`,
              }, 400);
            }
          }

          // 3. Deduplication & Aggregation: Sum quantities across duplicate product lines
          const requestedQtyByProduct = new Map<string, number>();
          for (const it of updates.items) {
            const pid = String(it.product?.id || (it as any).productId || '').trim();
            const qty = typeof it.quantity === 'number' ? it.quantity : Number(it.quantity);
            requestedQtyByProduct.set(pid, (requestedQtyByProduct.get(pid) || 0) + qty);
          }

          for (const [pid, totalQty] of requestedQtyByProduct.entries()) {
            if (totalQty > MAX_ORDER_ITEM_QTY) {
              const d1Prod = d1ProductMap.get(pid)!;
              return jsonResponse({
                success: false,
                error: `Aggregated quantity for "${d1Prod.title}" (${totalQty}) exceeds maximum allowable quantity of ${MAX_ORDER_ITEM_QTY}.`,
              }, 400);
            }
          }

          // 4. Pre-check stock delta against persisted order items (if order will remain active)
          const isTargetCancelled = (updates.shippingStatus !== undefined ? updates.shippingStatus : existing.shippingStatus) === 'Cancelled';
          if (!isTargetCancelled) {
            const persistedQtyMap = new Map<string, number>();
            if (existing.shippingStatus !== 'Cancelled' && Array.isArray(existing.items)) {
              for (const it of existing.items) {
                const pid = String(it?.product?.id || (it as any)?.productId || '').trim();
                if (pid) {
                  persistedQtyMap.set(pid, (persistedQtyMap.get(pid) || 0) + (Number(it.quantity) || 0));
                }
              }
            }
            for (const [pid, newQty] of requestedQtyByProduct.entries()) {
              const oldQty = persistedQtyMap.get(pid) || 0;
              const delta = newQty - oldQty;
              if (delta > 0) {
                const d1Prod = d1ProductMap.get(pid)!;
                if (d1Prod.stock < delta) {
                  return jsonResponse({
                    success: false,
                    error: `Insufficient stock for "${d1Prod.title}". Requested additional: ${delta}, Available in stock: ${d1Prod.stock}.`,
                  }, 400);
                }
              }
            }
          }

          // 5. Enrich items with snapshots and authoritative calculations
          let subtotalAcc = 0;
          let costAcc = 0;
          let profitAcc = 0;
          enrichedItems = [];

          for (const it of updates.items) {
            const pid = String(it.product?.id || (it as any).productId || '').trim();
            const d1Prod = d1ProductMap.get(pid)!;
            const qty = typeof it.quantity === 'number' ? it.quantity : Number(it.quantity);

            const rawSellingPrice =
              it.sellingPriceSnapshot != null && !isNaN(Number(it.sellingPriceSnapshot))
                ? Number(it.sellingPriceSnapshot)
                : Number(d1Prod.price || 0);

            if (typeof rawSellingPrice !== 'number' || isNaN(rawSellingPrice) || rawSellingPrice < 0) {
              return jsonResponse({
                success: false,
                error: 'Invalid item price: Unit price must be a valid non-negative number.',
              }, 400);
            }

            const unitSellingPrice = Math.round(rawSellingPrice * 100) / 100;
            const buyingPrice =
              it.buyingPriceSnapshot != null && !isNaN(Number(it.buyingPriceSnapshot))
                ? Number(it.buyingPriceSnapshot)
                : (d1Prod.buyingPrice != null && !isNaN(Number(d1Prod.buyingPrice)) ? Number(d1Prod.buyingPrice) : 0);

            const itemLineTotal = Math.round(unitSellingPrice * qty * 100) / 100;
            const itemCost = Math.round(buyingPrice * qty * 100) / 100;
            const itemProfit = Math.round((unitSellingPrice - buyingPrice) * qty * 100) / 100;

            subtotalAcc += itemLineTotal;
            costAcc += itemCost;
            profitAcc += itemProfit;

            enrichedItems.push({
              ...it,
              quantity: qty,
              product: {
                ...d1Prod,
                ...(it.product || {}),
                id: d1Prod.id,
                title: d1Prod.title,
                price: unitSellingPrice,
              },
              sellingPriceSnapshot: unitSellingPrice,
              buyingPriceSnapshot: buyingPrice,
              productCost: itemCost,
              productGrossProfit: itemProfit,
            });
          }

          authoritativeSubtotal = Math.round(subtotalAcc * 100) / 100;
          authoritativeTotalCost = Math.round(costAcc * 100) / 100;
          authoritativeTotalProfit = Math.round(profitAcc * 100) / 100;
          updates.items = enrichedItems;
          updates.subtotal = authoritativeSubtotal;
          updates.totalCost = authoritativeTotalCost;
          updates.totalGrossProfit = authoritativeTotalProfit;
        }

        const authoritativeDeliveryFee = updates.deliveryFee !== undefined
          ? Math.max(0, Number(updates.deliveryFee) || 0)
          : (existing.deliveryFee ?? 0);
        const authoritativeDiscount = updates.discountAmount !== undefined
          ? Math.max(0, Number(updates.discountAmount) || 0)
          : (existing.discountAmount ?? 0);

        // Final Order Total = Subtotal + Delivery Fee - Discount
        const authoritativeFinalTotal = Math.max(
          0,
          Math.round((authoritativeSubtotal + authoritativeDeliveryFee - authoritativeDiscount) * 100) / 100
        );
        updates.deliveryFee = authoritativeDeliveryFee;
        updates.discountAmount = authoritativeDiscount;
        updates.totalAmount = authoritativeFinalTotal;

        // Requirement 7: Advance Conflict Check
        // If the Admin reduces the order total below the already-recorded advance:
        // Do NOT silently create negative customer due. Reject the update with a clear server-side validation error.
        if (validatedAdvance > authoritativeFinalTotal) {
          try {
            await insertAuditLogInD1(env.DB, {
              actorId: auth!.dbUser?.id || auth!.tokenUser?.userId || 'admin',
              actorEmail: auth!.dbUser?.email || auth!.tokenUser?.email || 'admin@local.test',
              actorRole: auth!.role,
              action: 'ORDER_FINANCIAL_UPDATE_REJECTED',
              targetId: existing.id,
              targetType: 'order',
              details: {
                orderNumber: existing.orderNumber,
                attemptedAdvance: validatedAdvance,
                authoritativeTotal: authoritativeFinalTotal,
                reason: 'Advance payment cannot exceed authoritative order total',
              },
              ipAddress: getClientIp(request, isDevEnvironment(env)),
            });
          } catch (auditErr) {
            console.warn('Failed to record financial update rejection audit log:', auditErr);
          }
          return jsonResponse({
            success: false,
            error: `Invalid order update: Advance payment (৳${validatedAdvance}) cannot exceed authoritative order total (৳${authoritativeFinalTotal}). Please adjust the advance payment first before reducing the order total.`,
          }, 400);
        }

        // Authoritative Customer Due = Final Order Total - Advance Payment
        const customerDue = Math.max(0, Math.round((authoritativeFinalTotal - validatedAdvance) * 100) / 100);
        updates.customerDue = customerDue;
        updates.dueAmount = customerDue;
        updates.advancePayment = validatedAdvance;

        // Record audit log for order selling price / items modifications
        const previousSubtotal = Number(existing.subtotal) || 0;
        const previousTotal = Number(existing.totalAmount) || 0;
        const isPriceChanged = updates.items !== undefined && (authoritativeSubtotal !== previousSubtotal || authoritativeFinalTotal !== previousTotal);
        if (isPriceChanged) {
          try {
            await insertAuditLogInD1(env.DB, {
              actorId: auth!.dbUser?.id || auth!.tokenUser?.userId || 'admin',
              actorEmail: auth!.dbUser?.email || auth!.tokenUser?.email || 'admin@local.test',
              actorRole: auth!.role,
              action: 'ORDER_SELLING_PRICE_UPDATE',
              targetId: existing.id,
              targetType: 'order',
              details: {
                orderNumber: existing.orderNumber,
                previousSubtotal,
                newSubtotal: authoritativeSubtotal,
                previousTotal,
                newTotal: authoritativeFinalTotal,
                customerDue,
              },
              ipAddress: getClientIp(request, isDevEnvironment(env)),
            });
          } catch (auditErr) {
            console.warn('Failed to record price change audit log in D1:', auditErr);
          }
        }

        if (hasAdvanceUpdate) {
          const nowIso = new Date().toISOString();
          const actorIdentifier =
            auth!.dbUser?.email ||
            auth!.dbUser?.id ||
            auth!.tokenUser?.email ||
            auth!.tokenUser?.userId ||
            'admin';

          const rawMethod =
            updates.advancePaymentMethod !== undefined
              ? updates.advancePaymentMethod
              : (updates as any).advance_payment_method;
          const advanceMethod = rawMethod !== undefined
            ? (rawMethod ? String(rawMethod).trim() : null)
            : (existing.advancePaymentMethod || null);

          const rawNote =
            updates.advancePaymentNote !== undefined
              ? updates.advancePaymentNote
              : (updates as any).advance_payment_note;
          const advanceNote = rawNote !== undefined
            ? (rawNote ? String(rawNote).trim() : null)
            : (existing.advancePaymentNote || null);

          updates.advancePaymentMethod = advanceMethod || undefined;
          updates.advancePaymentNote = advanceNote || undefined;
          updates.advancePaymentUpdatedAt = nowIso;
          updates.advancePaymentUpdatedBy = actorIdentifier;
        }

        // Payment status synchronization:
        // - advance = 0 -> existing unpaid behavior
        // - advance > 0 and due > 0 -> existing partial-payment behavior (PARTIAL)
        // - due = 0 -> existing paid behavior (Paid)
        if (!updates.paymentStatus) {
          if (validatedAdvance === 0) {
            if (existing.paymentStatus === 'PARTIAL' || existing.paymentStatus === 'Partial' || existing.paymentStatus === 'Paid' || existing.paymentStatus === 'PAID') {
              updates.paymentStatus = (existing.paymentMethod === 'dbbl' ? 'UNVERIFIED' : 'DUE') as any;
            }
          } else if (customerDue === 0 && authoritativeFinalTotal > 0) {
            updates.paymentStatus = 'Paid' as any;
          } else if (validatedAdvance > 0 && customerDue > 0) {
            updates.paymentStatus = 'PARTIAL' as any;
          }
        }

        const updated = await updateOrderInD1(env.DB, orderId, updates);

        // 6. Audit logging using existing audit mechanism
        if (
          hasAdvanceUpdate &&
          (previousAdvance !== validatedAdvance ||
            updates.advancePaymentMethod !== existing.advancePaymentMethod ||
            updates.advancePaymentNote !== existing.advancePaymentNote)
        ) {
          try {
            await insertAuditLogInD1(env.DB, {
              actorId: auth?.dbUser?.id || auth?.tokenUser?.userId || 'admin',
              actorEmail: auth?.dbUser?.email || auth?.tokenUser?.email || 'admin@local.test',
              actorRole: auth?.role || 'admin',
              action: 'ORDER_ADVANCE_PAYMENT_UPDATE',
              targetId: existing.id,
              targetType: 'order',
              details: {
                orderNumber: existing.orderNumber,
                previousAdvance,
                newAdvance: validatedAdvance,
                orderTotal: existing.totalAmount,
                customerDue,
                paymentMethod: updates.advancePaymentMethod || null,
                note: updates.advancePaymentNote || null,
              },
              ipAddress: getClientIp(request, isDevEnvironment(env)),
            });
          } catch (auditErr) {
            console.warn('Failed to record advance payment audit log in D1:', auditErr);
          }
        }

        const isSuperAdmin = auth?.role === 'super_admin';
        const canViewBuyingPrice = Boolean(auth && (hasPermission(auth, 'product.view_buying_price') || isSuperAdmin));
        const canViewProfit = Boolean(auth && (hasPermission(auth, 'report.profit') || hasPermission(auth, 'product.view_profit') || isSuperAdmin));

        return jsonResponse({
          success: true,
          message: `Order #${updated.orderNumber} updated successfully!`,
          order: sanitizeOrderForRole(updated, { isSuperAdmin, canViewBuyingPrice, canViewProfit }),
        });
      } catch (err: any) {
        logServerError({ route: path, method, error: err, action: 'order.update', orderId });
        const errMsg = err?.message || '';
        if (errMsg.includes('not found') || errMsg.includes('does not exist')) {
          return jsonResponse({ success: false, error: 'Order not found' }, 404);
        }
        if (
          errMsg.includes('Insufficient stock') ||
          errMsg.includes('INSUFFICIENT_STOCK') ||
          errMsg.includes('Invalid') ||
          errMsg.includes('inactive')
        ) {
          return jsonResponse({
            success: false,
            error: errMsg.replace(/^INSUFFICIENT_STOCK:\s*/i, ''),
          }, 400);
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

    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;
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

    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    try {
      const apiKey = (body?.apiKey || env.STEADFAST_API_KEY || '').trim();
      const secretKey = (body?.secretKey || env.STEADFAST_SECRET_KEY || '').trim();
      const baseUrl = body?.baseUrl;

      // Reject arbitrary custom baseUrl to prevent SSRF and secret exfiltration
      if (baseUrl) {
        const val = validateCourierApiDestination(baseUrl, { courierType: 'steadfast' });
        if (!val.valid) {
          return jsonResponse({
            success: false,
            error: 'Invalid Steadfast API destination. Only approved Steadfast gateways (portal.packzy.com) are permitted.',
          }, 400);
        }
      }

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

    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    try {
      const orderParam = body?.order as Order;
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

      // Authoritative Server-Side Calculation of Final Order Total and Customer Due
      // 1. Load authoritative order items
      const items = Array.isArray(order.items) ? order.items : [];
      let authoritativeSubtotal = 0;
      if (items.length > 0) {
        for (const it of items) {
          const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
          const rawPrice =
            it.sellingPriceSnapshot != null && !isNaN(Number(it.sellingPriceSnapshot))
              ? Number(it.sellingPriceSnapshot)
              : Number(it.product?.price || 0);
          const unitSellingPrice = Math.max(0, Number.isFinite(rawPrice) ? rawPrice : 0);
          authoritativeSubtotal += Math.round(unitSellingPrice * qty * 100) / 100;
        }
        authoritativeSubtotal = Math.round(authoritativeSubtotal * 100) / 100;
      } else {
        authoritativeSubtotal = Number(order.subtotal) || 0;
      }

      // 2. Recalculate current final order total (Subtotal + Delivery Fee - Discount)
      const authoritativeDeliveryFee = Math.max(0, Number(order.deliveryFee ?? 0));
      const authoritativeDiscount = Math.max(0, Number(order.discountAmount ?? 0));
      const authoritativeFinalTotal = Math.max(
        0,
        Math.round((authoritativeSubtotal + authoritativeDeliveryFee - authoritativeDiscount) * 100) / 100
      );

      // 3. Load current advance payment
      const authoritativeAdvance = Math.max(0, Number(order.advancePayment) || 0);

      // 4. Calculate customer due: Customer Due = Final Order Total - Advance Payment
      const authoritativeCustomerDue = Math.max(
        0,
        Math.round((authoritativeFinalTotal - authoritativeAdvance) * 100) / 100
      );

      // 5. Courier COD = Customer Due (or 0 if fully paid/prepaid)
      // Never accept frontend-supplied cod_amount as authoritative
      const isPrepaid = order.paymentStatus === 'PAID' || order.paymentStatus === 'Paid' || authoritativeCustomerDue === 0;
      const codAmount = isPrepaid ? 0 : authoritativeCustomerDue;

      // 6. Synchronize payment status
      let synchronizedPaymentStatus = order.paymentStatus;
      if (isPrepaid || authoritativeCustomerDue === 0) {
        if (authoritativeFinalTotal > 0 && order.paymentStatus !== 'PAID' && order.paymentStatus !== 'Paid') {
          synchronizedPaymentStatus = 'Paid';
        }
      } else if (authoritativeAdvance > 0 && authoritativeCustomerDue > 0) {
        if (order.paymentStatus !== 'PARTIAL' && order.paymentStatus !== 'Partial') {
          synchronizedPaymentStatus = 'PARTIAL';
        }
      } else if (authoritativeAdvance === 0 && authoritativeCustomerDue > 0) {
        if (order.paymentStatus === 'PARTIAL' || order.paymentStatus === 'Partial' || order.paymentStatus === 'Paid' || order.paymentStatus === 'PAID') {
          synchronizedPaymentStatus = order.paymentMethod === 'dbbl' ? 'UNVERIFIED' : 'DUE';
        }
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

        // Validate courierParam.baseUrl if provided by client request
        if (courierParam.baseUrl) {
          const val = validateCourierApiDestination(courierParam.baseUrl, { courierType: 'steadfast' });
          if (!val.valid) {
            return jsonResponse({
              success: false,
              error: 'Invalid Steadfast courier destination. Only approved Steadfast gateways (portal.packzy.com) are permitted.',
            }, 400);
          }
          courierParam.baseUrl = val.normalizedUrl || courierParam.baseUrl;
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
        const sfResult = await dispatchOrderToSteadfast(steadfastPayload, {
          apiKey,
          secretKey,
          baseUrl: courierParam.baseUrl,
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
            totalAmount: authoritativeFinalTotal,
            subtotal: authoritativeSubtotal,
            customerDue: authoritativeCustomerDue,
            dueAmount: authoritativeCustomerDue,
            advancePayment: authoritativeAdvance,
            paymentStatus: synchronizedPaymentStatus,
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
            cod_amount: codAmount,
            customerDue: authoritativeCustomerDue,
            totalAmount: authoritativeFinalTotal,
            advancePayment: authoritativeAdvance,
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

      // Security check: NEVER send Steadfast secrets to generic courier URLs
      if ((env.STEADFAST_API_KEY && apiKey === env.STEADFAST_API_KEY) || (env.STEADFAST_SECRET_KEY && secretKey === env.STEADFAST_SECRET_KEY)) {
        return jsonResponse({
          success: false,
          error: 'Security violation: Steadfast credentials cannot be sent to other courier gateways.',
        }, 400);
      }

      if (!apiKey) {
        return jsonResponse({
          success: false,
          error: `${courierName} API credentials are not configured. Please enter API Key or configure it in Courier APIs tab.`,
        }, 400);
      }

      let trackingCode = '';
      let consignmentId = '';

      if (baseUrl) {
        // Enforce SSRF validation and allowlist for generic courier gateway
        const val = validateCourierApiDestination(baseUrl, { courierType: courierCode });
        if (!val.valid) {
          return jsonResponse({
            success: false,
            error: val.error || `Invalid courier API destination for ${courierName}. Destination domain is not approved or violates SSRF protection.`,
          }, 400);
        }

        try {
          const cleanBase = val.normalizedUrl!.replace(/\/+$/, '');
          const endpoint = cleanBase.includes('/v1') || cleanBase.includes('/api') ? `${cleanBase}/orders` : `${cleanBase}/api/v1/orders`;
          
          const endpointVal = validateCourierApiDestination(endpoint, { courierType: courierCode });
          if (!endpointVal.valid) {
            return jsonResponse({
              success: false,
              error: endpointVal.error || `Invalid courier API endpoint URL.`,
            }, 400);
          }

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

          const fetchResult = await safeFetchCourierApi({
            url: endpoint,
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
            timeoutMs: 12000,
            courierType: courierCode,
            maxRedirects: 2,
          });

          if (fetchResult.ok) {
            const data: any = fetchResult.data || {};
            trackingCode = (data.tracking_code || data.trackingCode || data.consignment_id || data.id || '').trim();
            consignmentId = String(data.consignment_id || data.consignmentId || data.id || '').trim();
          } else if (fetchResult.status === 401 || fetchResult.status === 403) {
            const data: any = fetchResult.data || {};
            return jsonResponse({
              success: false,
              error: data.message || `Invalid API credentials for ${courierName}. Please check API Key and Secret.`,
            }, 400);
          } else if (!fetchResult.ok) {
            return jsonResponse({
              success: false,
              error: fetchResult.error || `Courier gateway error from ${courierName}.`,
            }, 400);
          }
        } catch (fetchErr: any) {
          console.error('Non-steadfast courier dispatch error:', fetchErr);
        }
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
        totalAmount: authoritativeFinalTotal,
        subtotal: authoritativeSubtotal,
        customerDue: authoritativeCustomerDue,
        dueAmount: authoritativeCustomerDue,
        advancePayment: authoritativeAdvance,
        paymentStatus: synchronizedPaymentStatus,
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
        cod_amount: codAmount,
        customerDue: authoritativeCustomerDue,
        totalAmount: authoritativeFinalTotal,
        advancePayment: authoritativeAdvance,
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
        error: 'Steadfast Courier service is temporarily unavailable. Courier credentials are not configured.',
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
      return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
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
        const isNotFound = result.error?.toLowerCase().includes('not found');
        return jsonResponse({ success: false, error: result.error }, isNotFound ? 404 : 400);
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
        let body: any = {};
        if (rawBody && rawBody.trim()) {
          try {
            body = JSON.parse(rawBody);
          } catch {
            return jsonResponse({ success: false, error: 'Malformed JSON payload. Please provide valid JSON.' }, 400);
          }
        }

        const settings = await getStoreSettings(env.DB).catch(() => ({} as any));

        // CRITICAL SECURITY: Authenticate webhook request before processing or modifying any order
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

        const nowIso = new Date().toISOString();

        // 1. Extract Steadfast delivery update parameters
        const sfData = body?.data && typeof body.data === 'object' ? body.data : (body || {});
        const rawCid = sfData?.consignment_id ?? sfData?.consignmentId ?? sfData?.cid;
        const consignmentId = rawCid != null ? String(rawCid).trim() : undefined;
        const rawInv = sfData?.invoice ?? sfData?.order_id ?? sfData?.orderId ?? sfData?.orderNumber;
        const invoice = rawInv != null ? String(rawInv).trim() : undefined;
        const rawTrack = sfData?.tracking_code ?? sfData?.trackingCode ?? sfData?.tracking;
        const trackingCode = rawTrack != null ? String(rawTrack).trim() : undefined;
        const rawStatus = sfData?.status ?? sfData?.delivery_status ?? sfData?.status_name;

        const eventType = String(body?.event || body?.notification_type || body?.type || body?.action || '').toLowerCase();
        const isDummyConsignment = consignmentId === '0' || consignmentId === 'test' || String(invoice || '').toLowerCase() === 'test';

        // Check if this is a test ping (Steadfast "Test Webhook", UI tester, or trigger verification)
        const isExplicitTestPing =
          body?.ping === true ||
          body?.ping === 'true' ||
          body?.test === true ||
          body?.test === 'true' ||
          body?.is_test === true ||
          sfData?.test === true ||
          sfData?.test === 'true' ||
          eventType === 'test_ping' ||
          eventType === 'test.ping' ||
          eventType === 'ping' ||
          eventType === 'test' ||
          eventType === 'test_webhook' ||
          rawStatus === 'test' ||
          rawStatus === 'test_ping';

        // Steadfast trigger test pings (courier.added, courier.updated, courier.dispatched without a real order update)
        const isSteadfastTriggerTest =
          (eventType === 'courier.added' ||
           eventType === 'courier.updated' ||
           eventType === 'courier.dispatched' ||
           eventType === 'courier.deleted') &&
          (!consignmentId || isDummyConsignment);

        const isEmptyProbe = !consignmentId && !invoice && !trackingCode && !rawStatus && !eventType;

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
        const matchResult = await findOrderByCourierIdentifier(env.DB, {
          invoice,
          consignmentId,
          trackingCode,
        });

        if (matchResult.status === 'ambiguous') {
          return jsonResponse(
            {
              success: false,
              status: 'ambiguous',
              error: matchResult.error,
              matchedBy: matchResult.matchedBy,
              identifier: matchResult.identifier,
              receivedAt: nowIso,
            },
            409
          );
        }

        if (matchResult.status === 'not_found') {
          return jsonResponse({
            success: true,
            status: 200,
            message: `Webhook received. No matching order found for invoice="${invoice || ''}", consignmentId="${consignmentId || ''}".`,
            receivedAt: nowIso,
          });
        }

        const matchedOrder = matchResult.order;

        // Normalize status
        const normalized = normalizeSteadfastStatus(rawStatus);
        const updates: Partial<Order> = {
          courierStatus: normalized.courierStatus,
          shippingStatus: normalized.shippingStatus as any,
          lastCourierSync: nowIso,
        };

        if (normalized.isDelivered) {
          if (matchedOrder.paymentStatus !== 'PAID' && matchedOrder.paymentStatus !== 'Paid') {
            updates.paymentStatus = 'Paid';
          }
          updates.customerDue = 0;
          updates.dueAmount = 0;
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

    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    try {
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
      let body: any = {};
      if (!idToDelete) {
        const { data: parsedBody, errorResponse: jsonErr } = await safeParseJson(request);
        if (jsonErr) return jsonErr;
        body = parsedBody;
      }
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

    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    try {
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

    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    try {
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

    const { data: body, errorResponse: jsonErr } = await safeParseJson(request);
    if (jsonErr) return jsonErr;

    try {
      const expenseData = body?.expense || body;

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

    return jsonResponse({ success: false, error: 'Endpoint not found' }, 404);
  } catch (err: any) {
    console.error('[Router Unhandled Exception Logged Safely]:', err);
    return jsonResponse({ success: false, error: 'Internal server error.' }, 500);
  }
}
