import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import nodeCrypto from 'crypto';
import { defineConfig, Plugin } from 'vite';
import {
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_SLIDES,
  INITIAL_SETTINGS,
  INITIAL_COUPONS,
  INITIAL_REVIEWS,
  INITIAL_USERS,
  INITIAL_ORDERS,
} from './src/data/seedData';
import {
  generateSitemapXml,
  ROBOTS_TXT_CONTENT,
  generate404Html,
  injectProductSEOIntoHtml,
  injectCategorySEOIntoHtml,
  DEFAULT_SITE_NAME,
} from './src/utils/seo';
import {
  PERMISSION_KEYS,
  PERMISSIONS_METADATA,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  isValidPermissionKey,
  isSuperAdminOnlyPermission,
  resolveUserPermissions,
  generateLegacyPermissionFlags,
  detectPrivilegeEscalationAttempt,
  normalizePermissionsInput,
  type PermissionKey,
} from './src/server/permissions';
import { callSteadfastApi, normalizeSteadfastStatus } from './src/server/courier';
import { bufferToHex, verifyPassword, hashPassword } from './src/server/auth';
import { verifyCourierWebhookAuth, computeHmacSha256Hex, computeWebhookFingerprint } from './src/server/webhookAuth';
import { validateWebhookDestination, safeFetchWebhook } from './src/server/ssrf';
import {
  validateImageBuffer,
  generateSafeMediaKey,
  isValidMediaKey,
  getSafeMediaHeaders,
  MAX_IMAGE_SIZE_BYTES,
} from './src/server/imageSecurity';

process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || 'dev-secret-test-shared-999';
process.env.COURIER_WEBHOOK_SECRET = process.env.COURIER_WEBHOOK_SECRET || 'dev-courier-webhook-secret-999';

function localApiDevPlugin(): Plugin {
  const SETTINGS_FILE = path.resolve(import.meta.dirname || '.', '.dev-settings.json');

  // In-memory dev collections initialized from seed data
  let devOrders: any[] = INITIAL_ORDERS.map((o) => {
    const items = (o.items || []).map((it: any) => {
      const bp = it.buyingPriceSnapshot ?? Math.round(Number(it.product?.price || 0) * 0.6);
      const itemCost = bp * (Number(it.quantity) || 1);
      const itemRev = Number(it.product?.price || 0) * (Number(it.quantity) || 1);
      return {
        ...it,
        buyingPriceSnapshot: bp,
        productCost: itemCost,
        productGrossProfit: Math.max(0, itemRev - itemCost),
      };
    });
    const totalCost = o.totalCost ?? items.reduce((s: number, it: any) => s + (it.productCost || 0), 0);
    const totalGrossProfit = o.totalGrossProfit ?? Math.max(0, (Number(o.subtotal) || 0) - totalCost);
    return {
      ...o,
      items,
      totalCost,
      totalGrossProfit,
    };
  });
  let devProducts: any[] = INITIAL_PRODUCTS.map((p) => ({
    ...p,
    buyingPrice: p.buyingPrice ?? Math.round(Number(p.price) * 0.6),
  }));
  let devCategories: any[] = [...INITIAL_CATEGORIES];
  let devSliders: any[] = [...INITIAL_SLIDES];
  let devSettings: any = { ...INITIAL_SETTINGS };
  const generateInitialDevAuditLogs = (): any[] => {
    const actions = [
      { action: 'SETTINGS_UPDATE', targetType: 'settings', details: 'Store brand settings updated' },
      { action: 'ORDER_COURIER_DISPATCH', targetType: 'order', details: 'Order dispatched via Steadfast' },
      { action: 'ORDER_COURIER_WEBHOOK_UPDATE', targetType: 'order', details: 'Order status updated via courier webhook' },
      { action: 'USER_PERMISSION_UPDATE', targetType: 'user', details: 'Role permissions modified' },
      { action: 'PRODUCT_PRICE_UPDATE', targetType: 'product', details: 'Product pricing updated' },
      { action: 'EXPENSE_RECORDED', targetType: 'expense', details: 'Operating expense recorded' },
    ];
    const roles = ['super_admin', 'admin', 'sub_admin', 'webhook'];
    const logs: any[] = [];
    const now = Date.now();
    for (let i = 0; i < 120; i++) {
      const act = actions[i % actions.length];
      const role = roles[i % roles.length];
      logs.push({
        id: `audit-seed-${1000 + i}`,
        timestamp: new Date(now - i * 15 * 60 * 1000).toISOString(),
        actorId: role === 'webhook' ? 'webhook:steadfast' : `dev-${role}-1`,
        actorEmail: role === 'webhook' ? 'webhook@steadfast.com.bd' : `${role}@local.test`,
        actorRole: role,
        action: act.action,
        targetId: `target-${100 + i}`,
        targetType: act.targetType,
        details: act.details,
        ipAddress: '127.0.0.1',
      });
    }
    return logs;
  };

  let devAuditLogs: any[] = generateInitialDevAuditLogs();

  // Load persistent dev settings from disk if available
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const savedRaw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const savedParsed = JSON.parse(savedRaw);
      if (savedParsed && typeof savedParsed === 'object') {
        devSettings = {
          ...INITIAL_SETTINGS,
          ...savedParsed,
          dbblBank: {
            ...INITIAL_SETTINGS.dbblBank,
            ...(savedParsed.dbblBank || {}),
          },
          footer: {
            ...INITIAL_SETTINGS.footer,
            ...(savedParsed.footer || {}),
          },
        };
      }
    }
  } catch {}

  let devCoupons: any[] = [...INITIAL_COUPONS];
  let devReviews: any[] = [...INITIAL_REVIEWS];

  // Resolve Super Admin identities server-side from environment variables
  // Real production Super Admin identities must NEVER be hardcoded into source code fallbacks
  const configuredSuperAdminEmails: string[] = (
    process.env.SUPER_ADMIN_EMAILS || ''
  )
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const configuredSuperAdminUserIds: string[] = (
    process.env.SUPER_ADMIN_USER_IDS || ''
  )
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const devSuperAdminEmails: string[] = Array.from(new Set([
    ...configuredSuperAdminEmails,
    'dev-superadmin@local.test',
  ]));

  const devSuperAdminAccounts: any[] = devSuperAdminEmails.map((email, idx) => ({
    id: configuredSuperAdminUserIds[idx] || (email === 'dev-superadmin@local.test' ? 'dev-super-admin-1' : `super-admin-${idx + 1}`),
    name: 'Super Administrator',
    email: email,
    role: 'super_admin',
    permissions: {
      canManageOrders: true,
      canManageProducts: true,
      canManageCategories: true,
      canManageAccounts: true,
      canManageSettings: true,
    },
    phone: '01800000000',
    createdAt: '2026-01-01T00:00:00.000Z',
  }));

  const devStaffAccounts: any[] = [
    {
      id: 'user-subadmin-staff',
      name: 'Sub Admin Staff',
      email: 'staff@rongdhonutrade.com',
      role: 'sub_admin',
      permissions: {},
      phone: '01700000001',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'user-subadmin-orders',
      name: 'Logistics Dispatcher',
      email: 'orders@rongdhonutrade.com',
      role: 'sub_admin',
      permissions: {
        canManageOrders: true,
        'order.view': true,
        'courier.booking': true,
      },
      phone: '01700000002',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'user-subadmin-inventory',
      name: 'Inventory Manager',
      email: 'inventory@rongdhonutrade.com',
      role: 'sub_admin',
      permissions: {
        canManageProducts: true,
        'product.view': true,
        'product.update': true,
      },
      phone: '01700000003',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'test-user-update-only',
      name: 'Product Updater',
      email: 'updater@local.test',
      role: 'admin',
      permissions: {
        'product.view': true,
        'product.update': true,
        'product.view_buying_price': false,
        'product.manage_buying_price': false,
      },
      phone: '01700000004',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'test-user-view-only',
      name: 'Product Viewer',
      email: 'viewer@local.test',
      role: 'admin',
      permissions: {
        'product.view': true,
        'product.update': true,
        'product.view_buying_price': true,
        'product.manage_buying_price': false,
      },
      phone: '01700000005',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'test-user-financial-mgr',
      name: 'Financial Manager',
      email: 'finance@local.test',
      role: 'admin',
      permissions: {
        'product.view': true,
        'product.update': true,
        'product.view_buying_price': true,
        'product.manage_buying_price': true,
      },
      phone: '01700000006',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'user-cust-demo',
      name: 'Customer Sakib',
      email: 'customer@gmail.com',
      role: 'customer',
      permissions: {},
      phone: '01700000007',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'test-customer-1',
      name: 'Test Customer',
      email: 'customer@local.test',
      role: 'customer',
      permissions: {},
      phone: '01700000008',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  let devUsers: any[] = [
    ...devSuperAdminAccounts,
    ...devStaffAccounts,
    ...INITIAL_USERS.filter((u) => u.role !== 'super_admin'),
  ];

  // In-memory PBKDF2 password hashes for local development
  // Never contains plaintext credentials.
  const devUserPasswordHashes = new Map<string, string>();
  const SEED_ADMIN_HASH = 'pbkdf2:100000:b603d5397bc2fdb6104fe115366eff03:7e97e177b74c884cacfbc9d753b734fc0be6fe90f66a91a7f22c9384d45af1e9';

  devSuperAdminEmails.forEach((email) => {
    devUserPasswordHashes.set(email, SEED_ADMIN_HASH);
  });
  devUserPasswordHashes.set('admin', SEED_ADMIN_HASH);
  devUserPasswordHashes.set('superadmin', SEED_ADMIN_HASH);
  devStaffAccounts.forEach((acc) => {
    devUserPasswordHashes.set(acc.email.toLowerCase(), SEED_ADMIN_HASH);
  });

  const computeDevPasswordSig = (hash: string): string => {
    if (!hash) return '';
    return nodeCrypto.createHash('sha256').update(hash).digest('hex').slice(0, 32);
  };

  const ADMIN_SESSION_IDLE_TIMEOUT_SECONDS = 30 * 60; // 30 minutes
  const ADMIN_SESSION_ABSOLUTE_TIMEOUT_SECONDS = 12 * 3600; // 12 hours
  const CUSTOMER_SESSION_EXPIRATION_SECONDS = 7 * 86400; // 7 days
  const ADMIN_SESSION_REFRESH_THROTTLE_SECONDS = 60; // 60s throttle

  const isDevAdminRole = (role?: string | null): boolean => {
    return role === 'super_admin' || role === 'admin' || role === 'sub_admin';
  };

  const buildDevAuthCookieHelper = (req: any, token: string, maxAgeSeconds: number): string => {
    const forwardedProto = ((req.headers['x-forwarded-proto'] || '') as string).toLowerCase();
    const isHttps = req.connection?.encrypted || forwardedProto.includes('https');
    const secFetchSite = ((req.headers['sec-fetch-site'] || '') as string).toLowerCase();
    const reqHost = ((req.headers['host'] || '') as string).toLowerCase();
    const reqOrigin = ((req.headers['origin'] || '') as string).toLowerCase();
    const isCrossSite =
      secFetchSite === 'cross-site' ||
      reqHost.endsWith('.run.app') ||
      (Boolean(reqOrigin) && !reqOrigin.includes(reqHost.split(':')[0]));
    const sameSite = isHttps && isCrossSite ? 'None' : 'Lax';
    const secureAttr = isHttps ? '; Secure' : '';
    const encodedVal = token ? encodeURIComponent(token) : '';
    const expiresAttr = maxAgeSeconds <= 0 ? '; Expires=Thu, 01 Jan 1970 00:00:00 GMT' : '';
    return `auth_token=${encodedVal}; Path=/; HttpOnly${secureAttr}; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}${expiresAttr}`;
  };

  /**
   * Cryptographically signs an HMAC-SHA256 session JWT.
   * Standard 3-part format (Header.Payload.Signature) matching production verifyAuthToken.
   * Insecure dev-jwt-* tokens are strictly banned.
   */
  const signDevSessionToken = (
    payload: {
      userId: string;
      email: string;
      role: string;
      pwdSig?: string;
      authTime?: number;
      lastActivity?: number;
    },
    expiresInSeconds: number = 7 * 86400
  ): string => {
    const secret = process.env.ADMIN_SECRET as string;
    const now = Math.floor(Date.now() / 1000);
    const exp = now + expiresInSeconds;
    const fullPayload = { ...payload, iat: now, exp };
    const header = { alg: 'HS256', typ: 'JWT' };
    const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const message = `${b64Header}.${b64Payload}`;
    const sig = nodeCrypto.createHmac('sha256', secret).update(message).digest('base64url');
    return `${message}.${sig}`;
  };

  /**
   * Cryptographically verifies an HMAC-SHA256 session JWT against the authoritative secret.
   * Strictly rejects any token starting with dev-jwt-, dev-, mock-, or with invalid signature.
   */
  const verifyDevSessionToken = (token: string): any | null => {
    if (!token || typeof token !== 'string') return null;
    const trimmed = token.trim();
    if (trimmed.startsWith('dev-jwt-') || trimmed.startsWith('dev-') || trimmed.startsWith('mock-') || !trimmed.includes('.')) {
      return null;
    }
    const parts = trimmed.split('.');
    if (parts.length !== 3) return null;
    const [b64Header, b64Payload, sig] = parts;
    const message = `${b64Header}.${b64Payload}`;
    const secret = process.env.ADMIN_SECRET as string;
    const expectedSig = nodeCrypto.createHmac('sha256', secret).update(message).digest('base64url');
    if (sig.length !== expectedSig.length) return null;
    const match = nodeCrypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
    if (!match) return null;
    try {
      const header = JSON.parse(Buffer.from(b64Header, 'base64url').toString('utf-8'));
      if (!header || header.alg !== 'HS256' || (header.typ && header.typ !== 'JWT')) return null;
      const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf-8'));
      const now = Math.floor(Date.now() / 1000);
      if (!payload.exp || typeof payload.exp !== 'number' || isNaN(payload.exp) || payload.exp <= now) return null;

      // Defense-in-depth: Strictly enforce 30-minute idle and 12-hour absolute timeout for admin roles
      if (isDevAdminRole(payload.role)) {
        const authTime = typeof payload.authTime === 'number' ? payload.authTime : (typeof payload.iat === 'number' ? payload.iat : null);
        const lastActivity = typeof payload.lastActivity === 'number' ? payload.lastActivity : (typeof payload.iat === 'number' ? payload.iat : null);
        if (authTime === null || lastActivity === null) return null;
        if (now - authTime > ADMIN_SESSION_ABSOLUTE_TIMEOUT_SECONDS) return null;
        if (now - lastActivity > ADMIN_SESSION_IDLE_TIMEOUT_SECONDS) return null;
      }

      return payload;
    } catch {
      return null;
    }
  };
  const devMedia = new Map<string, { buffer: Buffer; contentType: string }>();
  let devExpenses: any[] = [];
  let devCourierWebhooks: any[] = Array.isArray(devSettings.courierWebhooks) ? devSettings.courierWebhooks : [];
  let devCourierWebhookLogs: any[] = [];
  const devPasswordResetTokens = new Map<string, { id: string; userId: string; tokenHash: string; expiresAt: number; usedAt: number | null; createdAt: number }>();
  const devRateLimits = new Map<string, { count: number; resetAt: number }>();
  const devOrderIdempotencyMap = new Map<string, { order: any; timestamp: number }>();
  const devWebhookReplays = new Map<string, { createdAt: number; expiresAt: number }>();

  const checkAndRecordDevWebhookReplay = (fingerprint: string, ttlSeconds: number = 600): { isReplay: boolean } => {
    const now = Date.now();
    // Opportunistic cleanup of expired entries
    for (const [k, v] of devWebhookReplays.entries()) {
      if (v.expiresAt < now) devWebhookReplays.delete(k);
    }
    const existing = devWebhookReplays.get(fingerprint);
    if (existing && existing.expiresAt > now) {
      return { isReplay: true };
    }
    // Atomically claim fingerprint
    devWebhookReplays.set(fingerprint, { createdAt: now, expiresAt: now + ttlSeconds * 1000 });
    return { isReplay: false };
  };

  const devOrderIpTimestamps = new Map<string, number[]>();

  const checkAndConsumeOrderRateLimitDev = (
    clientIp: string,
    limit = 4,
    windowSeconds = 600,
    timeOffsetMs = 0
  ): { allowed: boolean; remainingSeconds: number } => {
    const now = Date.now() + timeOffsetMs;
    const windowMs = windowSeconds * 1000;
    const timestamps = (devOrderIpTimestamps.get(clientIp) || []).filter(
      (t) => now - t < windowMs
    );

    if (timestamps.length >= limit) {
      const oldest = timestamps[0];
      const remainingSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      devOrderIpTimestamps.set(clientIp, timestamps);
      return { allowed: false, remainingSeconds };
    }

    timestamps.push(now);
    devOrderIpTimestamps.set(clientIp, timestamps);
    return { allowed: true, remainingSeconds: windowSeconds };
  };

  const rollbackOrderRateLimitDev = (clientIp: string): void => {
    const timestamps = devOrderIpTimestamps.get(clientIp);
    if (timestamps && timestamps.length > 0) {
      timestamps.pop();
      devOrderIpTimestamps.set(clientIp, timestamps);
    }
  };

  const checkDevRateLimit = (key: string, limit: number, windowSeconds: number): boolean => {
    const now = Date.now();
    const entry = devRateLimits.get(key);
    if (!entry || entry.resetAt <= now) {
      return true;
    }
    return entry.count < limit;
  };

  const recordDevRateAttempt = (key: string, windowSeconds: number): void => {
    const now = Date.now();
    const entry = devRateLimits.get(key);
    if (!entry || entry.resetAt <= now) {
      devRateLimits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    } else {
      entry.count += 1;
    }
  };

  const getDevClientIp = (req: any): string => {
    const cf = req.headers['cf-connecting-ip'];
    if (cf && typeof cf === 'string' && cf.trim()) return cf.trim();
    const trueIp = req.headers['true-client-ip'];
    if (trueIp && typeof trueIp === 'string' && trueIp.trim()) return trueIp.trim();
    const realIp = req.headers['x-real-ip'];
    if (realIp && typeof realIp === 'string' && realIp.trim()) return realIp.trim();
    const xff = req.headers['x-forwarded-for'];
    if (xff && typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
    const remote = req.socket?.remoteAddress;
    if (remote && typeof remote === 'string' && remote.trim()) return remote.trim();
    return '127.0.0.1';
  };

  interface DevAuthContext {
    user: any;
    role: string;
    permissions: {
      canManageOrders: boolean;
      canManageProducts: boolean;
      canManageCategories: boolean;
      canManageAccounts: boolean;
      canManageSettings: boolean;
    };
    granularPermissions: Record<string, boolean>;
  }

  interface DevAuthResult {
    auth?: DevAuthContext;
    error?: { status: number; body: { success: boolean; error: string; requiredPermission?: string } };
  }

  const requireDevAuth = (req: any): DevAuthResult => {
    let token = '';
    const cookieHeader = (req.headers['cookie'] || '') as string;
    const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
    if (match) {
      token = decodeURIComponent(match[1]).trim();
    } else {
      const authHeader = (req.headers['authorization'] || '') as string;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
    }

    if (!token) {
      return {
        error: { status: 401, body: { success: false, error: 'Unauthorized: Authentication required.' } },
      };
    }

    try {
      const decoded = verifyDevSessionToken(token);
      if (!decoded) {
        return {
          error: { status: 401, body: { success: false, error: 'Unauthorized: Invalid or expired session token.' } },
        };
      }

        const email = (decoded.email || '').toLowerCase().trim();
        const userId = (decoded.userId || '').trim();
        let foundUser = devUsers.find(
          (u) =>
            (userId && u.id === userId) ||
            u.email.toLowerCase() === email ||
            u.id === email ||
            (u.name && u.name.toLowerCase().trim() === email)
        );
        if (!foundUser && (email === 'admin' || email === 'superadmin' || devSuperAdminEmails.includes(email))) {
          foundUser = devUsers.find((u) => u.email === devSuperAdminEmails[0]) || devSuperAdminAccounts[0];
        } else if (!foundUser && decoded.role === 'customer') {
          foundUser = {
            id: userId || `user-cust-${Date.now()}`,
            name: decoded.name || 'Customer User',
            email: email || 'customer@gmail.com',
            role: 'customer',
            permissions: {},
          };
          devUsers.push(foundUser);
        }

        if (!foundUser) {
          return {
            error: { status: 401, body: { success: false, error: 'Unauthorized: User account no longer exists.' } },
          };
        }

        // Session Invalidation: Verify token's pwdSig matches current password hash signature
        const userEmailKey = (foundUser.email || '').toLowerCase();
        const currentHash = devUserPasswordHashes.get(userEmailKey);
        if (currentHash && decoded.pwdSig !== undefined) {
          const expectedSig = computeDevPasswordSig(currentHash);
          const tokenSig = decoded.pwdSig;
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
              error: { status: 401, body: { success: false, error: 'Unauthorized: Session invalidated or password was changed. Please log in again.' } },
            };
          }
        }

        // Session Invalidation: Check for critical role change
        if (decoded.role && foundUser.role && decoded.role !== foundUser.role) {
          return {
            error: { status: 401, body: { success: false, error: 'Unauthorized: Session invalidated due to account role change. Please log in again.' } },
          };
        }

        // Account status enforcement: Inactive or suspended accounts cannot authenticate
        if (foundUser.status === 'inactive' || foundUser.status === 'suspended' || foundUser.is_active === 0) {
          return {
            error: { status: 403, body: { success: false, error: 'Forbidden: Account has been deactivated or suspended.' } },
          };
        }

        // RBAC Security: Role is strictly derived from the verified user record, never from client claims
        const role = foundUser.role || 'customer';
        const isPrivileged = isDevAdminRole(role);
        const now = Math.floor(Date.now() / 1000);

        if (isPrivileged) {
          const authTime = decoded.authTime || decoded.iat || now;
          if (now - authTime > ADMIN_SESSION_ABSOLUTE_TIMEOUT_SECONDS) {
            return {
              error: { status: 401, body: { success: false, error: 'Unauthorized: Session expired. Maximum session duration reached. Please log in again.' } },
            };
          }

          const lastActivity = decoded.lastActivity || decoded.iat || now;
          if (now - lastActivity > ADMIN_SESSION_IDLE_TIMEOUT_SECONDS) {
            return {
              error: { status: 401, body: { success: false, error: 'Unauthorized: Admin session expired due to 30 minutes of inactivity. Please log in again.' } },
            };
          }

          // Sliding session refresh for active, non-passive admin requests
          const isPassive =
            req.headers['x-background-poll'] === 'true' ||
            req.headers['x-passive-probe'] === 'true';

          const isMutating = req.method !== 'GET' && req.method !== 'HEAD';
          const targetRes = req.res;
          if (targetRes && !isPassive && (now - lastActivity >= ADMIN_SESSION_REFRESH_THROTTLE_SECONDS || isMutating)) {
            const remainingAbsolute = (authTime + ADMIN_SESSION_ABSOLUTE_TIMEOUT_SECONDS) - now;
            if (remainingAbsolute > 0) {
              const slideSeconds = Math.min(ADMIN_SESSION_IDLE_TIMEOUT_SECONDS, remainingAbsolute);
              const refreshedToken = signDevSessionToken({
                userId: foundUser.id,
                email: foundUser.email,
                role: foundUser.role,
                pwdSig: decoded.pwdSig,
                authTime,
                lastActivity: now,
              }, slideSeconds);
              targetRes.setHeader('Set-Cookie', buildDevAuthCookieHelper(req, refreshedToken, slideSeconds));
            }
          }
        }

        const rawPermissions = (foundUser as any).permissions_json || foundUser.permissions;
        const granularPermissions = resolveUserPermissions(role, rawPermissions);
        const legacyPermissions = generateLegacyPermissionFlags(granularPermissions);

        return {
          auth: {
            user: foundUser,
            role,
            permissions: legacyPermissions,
            granularPermissions,
          },
        };
    } catch {
      return {
        error: { status: 401, body: { success: false, error: 'Unauthorized: Invalid authentication session.' } },
      };
    }

    return {
      error: { status: 401, body: { success: false, error: 'Unauthorized: Invalid authentication session.' } },
    };
  };

  const hasDevPermission = (
    auth: { role: string; user?: any; permissions?: any; granularPermissions?: Record<string, boolean> },
    permission: PermissionKey | string
  ): boolean => {
    if (auth.role === 'super_admin') return true;
    if (auth.role === 'customer') return false;
    const permStr = String(permission);
    if (isSuperAdminOnlyPermission(permStr as any)) return false;

    // Cross-alias check for sensitive financial permissions
    if (permStr === 'product.buying_price' || permStr === 'product.view_buying_price') {
      return Boolean(auth.granularPermissions?.['product.view_buying_price'] || auth.granularPermissions?.['product.buying_price']);
    }
    if (permStr === 'report.profit' || permStr === 'product.view_profit') {
      return Boolean(auth.granularPermissions?.['report.profit'] || auth.granularPermissions?.['product.view_profit']);
    }

    if (auth.granularPermissions && auth.granularPermissions[permStr] === true) {
      return true;
    }
    // Backward compatibility with legacy flags
    if (auth.permissions) {
      if (permStr.startsWith('order.') && auth.permissions.canManageOrders) return true;
      if (permStr.startsWith('product.') && auth.permissions.canManageProducts) {
        if (
          permStr === 'product.view_buying_price' ||
          permStr === 'product.buying_price' ||
          permStr === 'product.view_profit' ||
          permStr === 'product.manage_buying_price'
        ) return false;
        return true;
      }
      if (permStr.startsWith('category.') && auth.permissions.canManageCategories) return true;
      if (permStr.startsWith('user.') && auth.permissions.canManageAccounts) return true;
      if (permStr.startsWith('customer.') && auth.permissions.canManageAccounts) return true;
      if (permStr.startsWith('settings.') && permStr !== 'settings.manage' && auth.permissions.canManageSettings) {
        return true;
      }
    }
    return false;
  };

  const requireDevPermission = (
    authResult: DevAuthResult,
    permKey: PermissionKey | string
  ): { status: number; body: { success: boolean; error: string; requiredPermission?: string } } | null => {
    if (authResult.error) {
      return authResult.error;
    }
    const auth = authResult.auth!;
    if (auth.role === 'super_admin') {
      return null;
    }
    if (auth.role === 'customer') {
      return {
        status: 403,
        body: {
          success: false,
          error: 'Forbidden: Customers do not have administrative privileges.',
          requiredPermission: permKey,
        },
      };
    }
    if (hasDevPermission(auth, permKey)) {
      return null;
    }
    return {
      status: 403,
      body: {
        success: false,
        error: `Forbidden: You do not have the "${permKey}" permission required to perform this action.`,
        requiredPermission: permKey,
      },
    };
  };

  const sendDevError = (res: any, err: { status: number; body: { success: boolean; error: string; requiredPermission?: string } }) => {
    let finalStatus = err.status;
    let safeBody = { ...err.body };

    // 1. Strip raw stack traces, SQL queries, and exception objects unconditionally
    if ('stack' in safeBody) {
      console.error('[Dev Server Technical Stack Logged Safely]:', (safeBody as any).stack);
      delete (safeBody as any).stack;
    }
    if ('sql' in safeBody) {
      console.error('[Dev Server SQL Query Logged Safely]:', (safeBody as any).sql);
      delete (safeBody as any).sql;
    }
    if ('exception' in safeBody) {
      console.error('[Dev Server Exception Logged Safely]:', (safeBody as any).exception);
      delete (safeBody as any).exception;
    }

    // 2. Review 503 responses:
    if (finalStatus === 503) {
      const isHealthCheck = (safeBody as any).status === 'error' && Object.keys(safeBody).length === 1;
      if (!isHealthCheck) {
        console.error('[Dev 503 Converted to Safe 500 Internal Error]:', safeBody.error || safeBody);
        finalStatus = 500;
        safeBody = {
          success: false,
          error: 'Internal server error.',
        };
      }
    }

    // 3. For 500 responses: Ensure generic safe response
    if (finalStatus >= 500) {
      const isSafeOrderErrorMessage =
        safeBody.error === 'Unable to place the order right now. Please try again.';

      if (safeBody.error && safeBody.error !== 'Internal server error.' && !isSafeOrderErrorMessage) {
        console.error('[Dev Server Internal Error Logged Safely]:', safeBody.error);
      }

      if (!isSafeOrderErrorMessage) {
        safeBody = {
          success: false,
          error: 'Internal server error.',
        };
      }
    } else {
      // 4. Defense-in-depth for 4xx responses: Intercept any accidental SQL, D1 driver, or filesystem leaks
      const errStr = typeof safeBody.error === 'string' ? safeBody.error : '';
      const isLeaking =
        /sqlite|d1_error|no such table|syntax error|table |column |foreign key|prepare|bind|database disk|file not found|\/app\/|\/src\/|\.ts:\d+|\.js:\d+|admin_secret|token|credential|api[_-]?key/i.test(errStr);
      if (isLeaking) {
        console.error('[Dev Server Internal Leak Intercepted & Masked Safely]:', errStr);
        safeBody = {
          success: false,
          error: 'Invalid request.',
        };
      }
    }

    let serialized = JSON.stringify(safeBody);
    const FORBIDDEN_LEAK_REGEX = /sqlite|d1_error|no such table|syntax error|at\s+[a-zA-Z0-9_$.<>]+\s+\(|(?:\/src\/|\/app\/|\.env\b|node_modules|ADMIN_SECRET|COURIER_WEBHOOK_SECRET|STEADFAST_API_KEY|RESEND_API_KEY|DEV_ADMIN_PASSWORD|auth_secret)/i;

    if (finalStatus >= 400 && FORBIDDEN_LEAK_REGEX.test(serialized)) {
      if (safeBody.error === 'Malformed JSON payload. Please provide valid JSON.') {
        // Safe validation error
      } else {
        console.error('[CRITICAL Dev Leak Prevented & Masked to 500]:', serialized);
        finalStatus = 500;
        safeBody = {
          success: false,
          error: 'Internal server error.',
        };
        serialized = JSON.stringify(safeBody);
      }
    }

    res.statusCode = finalStatus;
    res.setHeader('Content-Type', 'application/json');
    return res.end(serialized);
  };

  interface SafeDevLogContext {
    route: string;
    method: string;
    userId?: string;
    orderId?: string;
    orderNumber?: string;
    action?: string;
    error?: any;
    extra?: Record<string, any>;
  }

  const logDevServerError = (ctx: SafeDevLogContext) => {
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
  };

  const formatDevUserResponse = (u: any): any => {
    if (!u) return null;
    const role = u.role || 'customer';
    if (role === 'super_admin') {
      const granular = resolveUserPermissions('super_admin', null);
      return {
        ...u,
        role,
        permissions: {
          ...generateLegacyPermissionFlags(granular),
          ...granular,
        },
      };
    }
    if (role === 'customer') {
      return {
        ...u,
        role,
        permissions: undefined,
      };
    }
    const rawPermissions = (u as any).permissions_json || u.permissions;
    const granular = resolveUserPermissions(role, rawPermissions);
    const legacy = generateLegacyPermissionFlags(granular);
    return {
      ...u,
      role,
      permissions: {
        ...legacy,
        ...granular,
      },
    };
  };

  const maskDevCourierWebhooks = (webhooks: any[]): any[] => {
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
  };

  const maskDevSettings = (settings: any, isAuthenticatedAdmin: boolean, canViewCourierCredentials: boolean = false) => {
    if (!isAuthenticatedAdmin) {
      const {
        steadfastApiKey,
        steadfastSecretKey,
        courierWebhooks,
        ...safeSettings
      } = settings;
      return safeSettings;
    }
    const safeAdminSettings = { ...settings };
    if (canViewCourierCredentials) {
      const hasConfigured = Boolean(
        process.env.STEADFAST_API_KEY ||
        (settings.steadfastApiKey && settings.steadfastApiKey !== '')
      );
      safeAdminSettings.steadfastApiKey = hasConfigured ? '••••••••' : '';
      safeAdminSettings.steadfastSecretKey = hasConfigured ? '••••••••' : '';
      if (Array.isArray(settings.courierWebhooks)) {
        safeAdminSettings.courierWebhooks = maskDevCourierWebhooks(settings.courierWebhooks);
      }
    } else {
      delete safeAdminSettings.steadfastApiKey;
      delete safeAdminSettings.steadfastSecretKey;
      delete safeAdminSettings.courierWebhooks;
    }
    return safeAdminSettings;
  };

  const checkIsSuperAdmin = (req: any): boolean => {
    const auth = requireDevAuth(req);
    return Boolean(auth.auth && auth.auth.role === 'super_admin');
  };

  const checkIsAdmin = (req: any): boolean => {
    const auth = requireDevAuth(req);
    return Boolean(auth.auth && (auth.auth.role === 'super_admin' || auth.auth.role === 'admin' || auth.auth.role === 'sub_admin'));
  };

  const isDevBuyingPriceOrCostKey = (key: string): boolean => {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return (
      norm === 'buyingprice' ||
      norm === 'buyingcost' ||
      norm === 'purchaseprice' ||
      norm === 'purchasecost' ||
      norm === 'costprice' ||
      norm === 'productcost' ||
      norm === 'unitcost' ||
      norm === 'totalcost' ||
      norm === 'buyingpricesnapshot' ||
      norm === 'suppliercost' ||
      norm === 'supplierprice' ||
      norm === 'wholesaleprice' ||
      norm === 'wholesalecost' ||
      norm === 'itemcost'
    );
  };

  const isDevProfitKey = (key: string): boolean => {
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return (
      norm === 'profit' ||
      norm === 'unitprofit' ||
      norm === 'unitgrossprofit' ||
      norm === 'unitnetprofit' ||
      norm === 'grossprofit' ||
      norm === 'netprofit' ||
      norm === 'profitmargin' ||
      norm === 'grossmargin' ||
      norm === 'netmargin' ||
      norm === 'totalprofit' ||
      norm === 'totalgrossprofit' ||
      norm === 'productgrossprofit' ||
      norm === 'productcost' ||
      norm === 'averageprofitperorder'
    );
  };

  const deepSanitizeDevCostAndProfit = (
    data: any,
    options: { isSuperAdmin?: boolean; canViewBuyingPrice?: boolean; canViewProfit?: boolean } | boolean
  ): any => {
    const isSuper = typeof options === 'boolean' ? options : Boolean(options.isSuperAdmin);
    const canBuying = typeof options === 'boolean' ? options : Boolean(options.isSuperAdmin || options.canViewBuyingPrice);
    const canProfit = typeof options === 'boolean' ? options : Boolean(options.isSuperAdmin || options.canViewProfit);

    if (isSuper || (canBuying && canProfit)) {
      return data;
    }

    const scrub = (val: any, seen: WeakSet<object> = new WeakSet()): any => {
      if (val === null || val === undefined) return val;
      if (typeof val !== 'object') {
        if (typeof val === 'string') {
          if ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']'))) {
            try {
              const parsed = JSON.parse(val);
              if (parsed && typeof parsed === 'object') {
                const sanitized = scrub(parsed, seen);
                return JSON.stringify(sanitized);
              }
            } catch {}
          }
        }
        return val;
      }

      if (val instanceof Date || val instanceof RegExp) return val;
      if (seen.has(val)) return val;
      seen.add(val);

      if (Array.isArray(val)) {
        return val.map((item) => scrub(item, seen));
      }

      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(val)) {
        if (!canBuying && isDevBuyingPriceOrCostKey(key)) {
          continue;
        }
        if (!canProfit && isDevProfitKey(key)) {
          continue;
        }
        result[key] = scrub(value, seen);
      }
      return result;
    };

    return scrub(data);
  };

  const sanitizeDevProduct = (
    p: any,
    options: { isSuperAdmin?: boolean; canViewBuyingPrice?: boolean; canViewProfit?: boolean } | boolean
  ) => {
    const isSuper = typeof options === 'boolean' ? options : Boolean(options.isSuperAdmin);
    const canBuying = typeof options === 'boolean' ? options : Boolean(options.isSuperAdmin || options.canViewBuyingPrice);
    const canProfit = typeof options === 'boolean' ? options : Boolean(options.isSuperAdmin || options.canViewProfit);

    const price = Number(p.price) || 0;
    const rawBp = p.buyingPrice != null ? p.buyingPrice : (p.buying_price != null ? p.buying_price : null);
    const buyingPrice = rawBp != null && !isNaN(Number(rawBp)) ? Number(rawBp) : undefined;
    const unitProfit = buyingPrice !== undefined ? Math.max(0, price - buyingPrice) : undefined;

    const result = { ...p };
    if (canBuying && buyingPrice !== undefined) {
      result.buyingPrice = buyingPrice;
    } else {
      delete result.buyingPrice;
      delete result.buying_price;
    }
    if (canProfit && unitProfit !== undefined) {
      result.unitProfit = unitProfit;
    } else {
      delete result.unitProfit;
      delete result.unit_profit;
    }
    return deepSanitizeDevCostAndProfit(result, { isSuperAdmin: isSuper, canViewBuyingPrice: canBuying, canViewProfit: canProfit });
  };

  const sanitizeDevOrder = (
    o: any,
    options: { isSuperAdmin?: boolean; canViewBuyingPrice?: boolean; canViewProfit?: boolean } | boolean
  ) => {
    const isSuper = typeof options === 'boolean' ? options : Boolean(options.isSuperAdmin);
    const canBuying = typeof options === 'boolean' ? options : Boolean(options.isSuperAdmin || options.canViewBuyingPrice);
    const canProfit = typeof options === 'boolean' ? options : Boolean(options.isSuperAdmin || options.canViewProfit);

    const safeItems = (o.items || []).map((it: any) => {
      const safeProduct = sanitizeDevProduct(it.product || {}, options);
      const itemResult = { ...it, product: safeProduct };
      if (canBuying && it.buyingPriceSnapshot != null) {
        itemResult.buyingPriceSnapshot = Number(it.buyingPriceSnapshot);
      } else {
        delete itemResult.buyingPriceSnapshot;
        delete itemResult.buying_price_snapshot;
      }
      if (canProfit) {
        if (it.productCost != null) itemResult.productCost = Number(it.productCost);
        if (it.productGrossProfit != null) itemResult.productGrossProfit = Number(it.productGrossProfit);
      } else {
        delete itemResult.productCost;
        delete itemResult.product_cost;
        delete itemResult.productGrossProfit;
        delete itemResult.product_gross_profit;
      }
      return itemResult;
    });

    const safeOrder = { ...o, items: safeItems };
    if (canProfit) {
      if (o.totalCost != null) safeOrder.totalCost = Number(o.totalCost);
      if (o.totalGrossProfit != null) safeOrder.totalGrossProfit = Number(o.totalGrossProfit);
    } else {
      delete safeOrder.totalCost;
      delete safeOrder.total_cost;
      delete safeOrder.totalGrossProfit;
      delete safeOrder.total_gross_profit;
      delete safeOrder.netProfit;
      delete safeOrder.net_profit;
      delete safeOrder.totalProfit;
      delete safeOrder.total_profit;
      delete safeOrder.profit;
      delete safeOrder.grossProfit;
      delete safeOrder.gross_profit;
      delete safeOrder.profitMargin;
      delete safeOrder.profit_margin;
    }
    return deepSanitizeDevCostAndProfit(safeOrder, { isSuperAdmin: isSuper, canViewBuyingPrice: canBuying, canViewProfit: canProfit });
  };

  const sanitizeDevOrderForPublicTracking = (order: any) => {
    const cleanPhone = (order.customer?.phone || '').replace(/\D/g, '');
    const maskedPhone =
      cleanPhone.length >= 11
        ? `${cleanPhone.slice(0, 3)}****${cleanPhone.slice(-4)}`
        : cleanPhone.length > 4
        ? `${cleanPhone.slice(0, 2)}****${cleanPhone.slice(-2)}`
        : '****';

    const nameParts = (order.customer?.fullName || '').trim().split(/\s+/);
    const maskedName =
      nameParts
        .filter(Boolean)
        .map((part: string) => (part.length > 1 ? `${part[0]}***` : part))
        .join(' ') || 'Customer';

    const district = order.customer?.district || 'Bangladesh';
    const maskedAddress = `***, ${district}`;

    const safeItems = (order.items || []).map((item: any) => ({
      product: {
        title: item.product?.title || 'Product',
        imageUrl: item.product?.imageUrl || '',
        price: Number(item.product?.price || 0),
      },
      quantity: Number(item.quantity || 1),
      selectedSize: item.selectedSize || undefined,
      selectedColor: item.selectedColor || undefined,
      totalPrice: Number((item.product?.price || 0) * (item.quantity || 1)),
    }));

    return {
      id: order.orderNumber,
      orderNumber: order.orderNumber,
      shippingStatus: order.shippingStatus,
      deliveryStatus: order.deliveryStatus || order.shippingStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customer: {
        fullName: maskedName,
        phone: maskedPhone,
        district,
        deliveryZone: order.customer?.deliveryZone || 'inside_dhaka',
        fullAddress: maskedAddress,
      },
      courierBooking: order.courierBooking
        ? {
            provider: order.courierBooking.provider,
            waybillId: order.courierBooking.waybillId,
            trackingUrl: order.courierBooking.trackingUrl,
            status: order.courierBooking.status,
          }
        : undefined,
      courierStatus: order.courierStatus,
      courierWaybill: order.courierWaybill,
      items: safeItems,
      subtotal: Number(order.subtotal || 0),
      deliveryFee: Number(order.deliveryFee || 0),
      totalAmount: Number(order.totalAmount || 0),
    };
  };

  return {
    name: 'local-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          (req as any).res = res;
          const url = new URL(req.url || '/', 'http://localhost');
          const method = (req.method || 'GET').toUpperCase();

          const simulateHeader = req.headers['x-test-simulate'];
          if (simulateHeader === 'db-error') {
            throw new Error('D1_ERROR: SQLITE_ERROR: no such table: test_table at /src/server/db.ts:42');
          }
          if (simulateHeader === 'unexpected-error') {
            throw new Error('TypeError: Cannot read properties of undefined (reading "execute") at /src/server/router.ts:88');
          }

        // Technical Webhook: Prevent 404 if a webhook destination is sent to the root or generic API path
        if (
          method === 'POST' &&
          (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/api' || url.pathname === '/api/')
        ) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            status: 200,
            message: 'Webhook payload received and acknowledged successfully at root listener.',
            receivedAt: new Date().toISOString(),
          }));
        }

        // Technical SEO: Serve robots.txt during local development
        if (url.pathname === '/robots.txt') {
          res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.statusCode = 200;
          return res.end(ROBOTS_TXT_CONTENT);
        }

        // Technical SEO: Dynamic sitemap.xml generated from current catalog
        if (url.pathname === '/sitemap.xml') {
          res.setHeader('Content-Type', 'application/xml; charset=UTF-8');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.statusCode = 200;
          return res.end(generateSitemapXml(devCategories, devProducts));
        }

        // Protect private routes from search engine indexing
        if (
          url.pathname === '/admin' ||
          url.pathname.startsWith('/admin/') ||
          url.pathname === '/account' ||
          url.pathname.startsWith('/account/') ||
          url.pathname === '/checkout'
        ) {
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        }

        // Technical SEO: Check for invalid or deleted products to avoid soft 404s
        if (!req.url?.startsWith('/api/') && (url.searchParams.has('product') || url.searchParams.has('p') || url.pathname.startsWith('/product/'))) {
          const prodParam = (
            url.searchParams.get('product') ||
            url.searchParams.get('p') ||
            url.pathname.replace(/^\/product\//, '').replace(/\/$/, '')
          ).trim();

          if (prodParam) {
            const foundProduct = devProducts.find(
              (p) => p.id === prodParam || p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') === prodParam
            );

            if (!foundProduct || (foundProduct as any).status === 'inactive' || (foundProduct as any).isDeleted) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/html; charset=UTF-8');
              res.setHeader('X-Robots-Tag', 'noindex, follow');
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              return res.end(
                generate404Html('Product Not Found', `The product "${prodParam}" was not found or has been removed.`)
              );
            }

            // Graceful migration from old ?product= URL to canonical /product/:id (301 Permanent Redirect)
            if (url.searchParams.has('product') || url.searchParams.has('p')) {
              res.statusCode = 301;
              res.setHeader('Location', `/product/${encodeURIComponent(foundProduct.id)}`);
              return res.end();
            }
          }
        }

        // Technical SEO: Check for invalid categories
        if (!req.url?.startsWith('/api/') && (url.searchParams.has('category') || url.searchParams.has('cat') || url.pathname.startsWith('/category/'))) {
          const catParam = (
            url.searchParams.get('category') ||
            url.searchParams.get('cat') ||
            url.pathname.replace(/^\/category\//, '').replace(/\/$/, '')
          ).trim();

          if (catParam) {
            const foundCat = devCategories.find(
              (c) => c.slug?.toLowerCase() === catParam.toLowerCase() || c.id === catParam
            );

            if (!foundCat) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/html; charset=UTF-8');
              res.setHeader('X-Robots-Tag', 'noindex, follow');
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              return res.end(generate404Html('Category Not Found', `The category "${catParam}" was not found.`));
            }

            // Graceful migration from old ?category= query URLs to canonical /category/:slug route (301 Permanent Redirect)
            if (url.searchParams.has('category') || url.searchParams.has('cat')) {
              res.writeHead(301, {
                Location: `/category/${encodeURIComponent(foundCat.slug || foundCat.id)}`,
              });
              return res.end();
            }
          }
        }

        if (
          !req.url?.startsWith('/api/') &&
          req.url !== '/api' &&
          !req.url?.startsWith('/webhooks') &&
          !(method === 'POST' && (req.url === '/' || req.url === '/index.html'))
        ) {
          const pathname = url.pathname;
          const VALID_SPA_PATHS = new Set(['/', '/admin', '/reset-password', '/tracking', '/account', '/checkout', '/cart']);
          const isKnownSpa = VALID_SPA_PATHS.has(pathname) || pathname.startsWith('/admin/');
          const isVitePath =
            pathname.startsWith('/@') ||
            pathname.startsWith('/src/') ||
            pathname.startsWith('/node_modules/') ||
            pathname.startsWith('/assets/') ||
            pathname.startsWith('/public/') ||
            /\.[a-zA-Z0-9]{2,5}$/.test(pathname);

          if (
            !isKnownSpa &&
            !isVitePath &&
            !pathname.startsWith('/product/') &&
            !pathname.startsWith('/category/') &&
            !url.searchParams.has('product') &&
            !url.searchParams.has('p') &&
            !url.searchParams.has('category') &&
            !url.searchParams.has('cat')
          ) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/html; charset=UTF-8');
            res.setHeader('X-Robots-Tag', 'noindex, follow');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.end(
              generate404Html('Page Not Found', `The page "${pathname}" could not be found on Rongdhonu Trade.`)
            );
          }
          return next();
        }

        const reqOrigin = (req.headers['origin'] || '') as string;
        const reqHost = (req.headers['x-forwarded-host'] || req.headers['host'] || 'localhost:3000') as string;
        const forwardedProto = ((req.headers['x-forwarded-proto'] || '') as string).toLowerCase();
        const isHttps =
          forwardedProto.includes('https') ||
          Boolean((req.socket as any)?.encrypted) ||
          reqOrigin.startsWith('https://') ||
          reqHost.endsWith('.run.app');

        // Environment-aware CORS verification in dev middleware
        const primaryProductionOrigin = (process.env.PRODUCTION_ORIGIN || 'https://rongdhonutrade.com').trim().replace(/\/+$/, '');
        const devAllowedOrigins = new Set<string>([
          primaryProductionOrigin,
          'https://rongdhonutrade.com',
          'https://www.rongdhonutrade.com',
        ]);
        if (process.env.ALLOWED_ORIGINS) {
          process.env.ALLOWED_ORIGINS.split(',').forEach((o) => {
            const trimmed = o.trim().replace(/\/+$/, '');
            if (trimmed) devAllowedOrigins.add(trimmed);
          });
        }

        let isOriginAllowed = false;
        let devCorsOrigin = '';
        if (reqOrigin) {
          if (devAllowedOrigins.has(reqOrigin)) {
            isOriginAllowed = true;
            devCorsOrigin = reqOrigin;
          } else {
            try {
              const parsed = new URL(reqOrigin);
              if (
                parsed.hostname === 'localhost' ||
                parsed.hostname === '127.0.0.1' ||
                parsed.hostname === '0.0.0.0' ||
                parsed.hostname.endsWith('.run.app')
              ) {
                isOriginAllowed = true;
                devCorsOrigin = reqOrigin;
              }
            } catch {}
          }
        }

        const buildDevAuthCookie = (token: string, maxAgeSeconds: number): string => {
          return buildDevAuthCookieHelper(req, token, maxAgeSeconds);
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Vary', 'Origin');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

        if (isOriginAllowed && devCorsOrigin) {
          res.setHeader('Access-Control-Allow-Origin', devCorsOrigin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Cache-Control, X-Webhook-Signature, X-Webhook-Secret, X-Signature, X-Timestamp, Api-Key, Secret-Key');
        }

        if (method === 'OPTIONS') {
          if (reqOrigin && !isOriginAllowed) {
            res.statusCode = 403;
            return res.end(JSON.stringify({ success: false, error: 'Forbidden: Origin not allowed by CORS policy.' }));
          }
          res.statusCode = 204;
          return res.end();
        }

        // Strict CSRF and Origin Validation on mutating requests
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
          const isWebhook = url.pathname.startsWith('/api/courier/webhook') || url.pathname.startsWith('/api/steadfast/webhook');
          if (!isWebhook) {
            if (reqOrigin && !isOriginAllowed) {
              res.statusCode = 403;
              return res.end(JSON.stringify({ success: false, error: 'Forbidden: Cross-origin mutation rejected by CSRF policy.' }));
            }
            const secFetchSite = ((req.headers['sec-fetch-site'] || '') as string).toLowerCase();
            if (secFetchSite === 'cross-site' && !isOriginAllowed) {
              res.statusCode = 403;
              return res.end(JSON.stringify({ success: false, error: 'Forbidden: Cross-site request rejected by CSRF policy.' }));
            }
          }
        }

        // Helper to read JSON request body
        const readBody = (callback: (body: any) => void) => {
          let raw = '';
          req.on('data', (chunk) => { raw += chunk; });
          req.on('end', () => {
            let parsed: any;
            if (raw && raw.trim()) {
              try {
                parsed = JSON.parse(raw);
              } catch {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: false,
                  error: 'Malformed JSON payload. Please provide valid JSON.',
                }));
              }
            } else {
              parsed = {};
            }
            callback(parsed ?? {});
          });
        };

        const readRawBody = (callback: (raw: string, body: any, isMalformedJson?: boolean) => void) => {
          let raw = '';
          req.on('data', (chunk) => { raw += chunk; });
          req.on('end', () => {
            let parsed = {};
            let isMalformed = false;
            if (raw && raw.trim()) {
              try {
                parsed = JSON.parse(raw);
              } catch {
                isMalformed = true;
              }
            }
            callback(raw, parsed, isMalformed);
          });
        };

        // GET /api/health (Minimal public health check)
        if (url.pathname === '/api/health' || url.pathname === '/api/status') {
          res.statusCode = 200;
          return res.end(JSON.stringify({
            status: 'ok',
          }));
        }

        // GET /api/admin/health (Protected dev admin diagnostics)
        if (url.pathname === '/api/admin/health' || url.pathname === '/api/admin/diagnostics') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          res.statusCode = 200;
          return res.end(JSON.stringify({
            status: 'ok',
            database: 'ok',
            ordersCount: devOrders.length,
            timestamp: new Date().toISOString(),
          }));
        }

        // AUTHENTICATION ROUTES (Development D1 Emulation)
        if (url.pathname === '/api/auth/login' && method === 'POST') {
          return readBody(async (body) => {
            const identifier = (body.usernameOrEmail || body.email || body.username || '').trim().toLowerCase();
            const password = (body.password || '').trim();

            if (!identifier) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, error: 'Email/Username is required.' }));
            }

            const isSuperAdminIdentifier =
              identifier === 'admin' ||
              identifier === 'superadmin' ||
              devSuperAdminEmails.includes(identifier);

            let foundUser = devUsers.find(
              (u) =>
                u.email?.toLowerCase() === identifier ||
                u.id.toLowerCase() === identifier
            );
            if (!foundUser && isSuperAdminIdentifier) {
              const targetEmail = identifier.includes('@') ? identifier : devSuperAdminEmails[0];
              foundUser = devUsers.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase()) || devSuperAdminAccounts[0];
            }

            let isPasswordValid = false;
            const lookupKey = foundUser?.email?.toLowerCase() || identifier.toLowerCase();
            const storedHash =
              devUserPasswordHashes.get(identifier.toLowerCase()) ||
              devUserPasswordHashes.get(lookupKey) ||
              (isSuperAdminIdentifier ? devUserPasswordHashes.get(devSuperAdminEmails[0]) : null);

            if (storedHash) {
              isPasswordValid = await verifyPassword(password, storedHash);
            }

            if (!isPasswordValid || !foundUser) {
              res.statusCode = 401;
              return res.end(JSON.stringify({ success: false, error: 'Invalid email/username or password.' }));
            }

            // Account status enforcement: Inactive or suspended accounts cannot authenticate
            if (foundUser.status === 'inactive' || foundUser.status === 'suspended' || foundUser.is_active === 0) {
              res.statusCode = 403;
              return res.end(JSON.stringify({ success: false, error: 'Forbidden: Account has been deactivated or suspended.' }));
            }

            const isPrivileged = isDevAdminRole(foundUser.role);
            const now = Math.floor(Date.now() / 1000);
            const sessionDuration = isPrivileged ? ADMIN_SESSION_IDLE_TIMEOUT_SECONDS : CUSTOMER_SESSION_EXPIRATION_SECONDS;
            const currentHash = devUserPasswordHashes.get(foundUser.email?.toLowerCase()) || storedHash || '';
            const sessionToken = signDevSessionToken({
              userId: foundUser.id,
              email: foundUser.email || identifier,
              role: foundUser.role || 'super_admin',
              pwdSig: computeDevPasswordSig(currentHash),
              ...(isPrivileged ? { authTime: now, lastActivity: now } : {}),
            }, sessionDuration);
            res.setHeader('Set-Cookie', buildDevAuthCookie(sessionToken, sessionDuration));
            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              message: 'Authentication successful',
              user: formatDevUserResponse(foundUser),
              token: sessionToken,
            }));
          });
        }

        if (url.pathname === '/api/auth/me' && method === 'GET') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, user: formatDevUserResponse(authResult.auth!.user) }));
        }

        if (url.pathname === '/api/auth/register' && method === 'POST') {
          return readBody(async (body) => {
            const clientIp = getDevClientIp(req);
            const name = (body.name || '').trim();
            const email = (body.email || '').toLowerCase().trim();
            const password = (body.password || '').trim();
            const phone = (body.phone || '').trim();

            const regIpKey = `reg:ip:${clientIp}`;
            const regIpSuccessKey = `reg:ip:success:${clientIp}`;
            const regEmailKey = email ? `reg:email:${email}` : `reg:empty-email:${clientIp}`;

            if (
              !checkDevRateLimit(regIpKey, 10, 900) ||
              !checkDevRateLimit(regIpSuccessKey, 5, 3600) ||
              !checkDevRateLimit(regEmailKey, 5, 900)
            ) {
              res.statusCode = 429;
              res.setHeader('Retry-After', '900');
              return res.end(JSON.stringify({
                success: false,
                error: 'Too many registration requests. Please wait a few minutes before trying again.',
              }));
            }

            // Immediately record the attempt against both IP and Email
            recordDevRateAttempt(regIpKey, 900);
            if (email) recordDevRateAttempt(regEmailKey, 900);

            if (!name) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, error: 'Full name is required.' }));
            }
            if (!email || !email.includes('@')) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, error: 'Valid email address is required.' }));
            }
            if (!password || password.length < 6) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, error: 'Password must be at least 6 characters long.' }));
            }

            const existing = devUsers.find((u) => u.email.toLowerCase() === email);
            if (existing) {
              res.statusCode = 409;
              return res.end(JSON.stringify({ success: false, error: 'An account with this email address already exists. Please log in.' }));
            }

            const newCustomer = {
              id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name,
              email,
              role: 'customer',
              permissions: null,
              phone,
              createdAt: new Date().toISOString(),
            };

            devUsers.push(newCustomer);
            const hashedCust = await hashPassword(password);
            devUserPasswordHashes.set(email.toLowerCase(), hashedCust);

            // Record successful registration
            recordDevRateAttempt(regIpSuccessKey, 3600);

            const sessionToken = signDevSessionToken({
              userId: newCustomer.id,
              email: newCustomer.email,
              role: 'customer',
              pwdSig: computeDevPasswordSig(hashedCust),
            });
            res.setHeader('Set-Cookie', buildDevAuthCookie(sessionToken, 7 * 86400));

            res.statusCode = 201;
            return res.end(JSON.stringify({
              success: true,
              message: 'Account registered successfully.',
              user: newCustomer,
              token: sessionToken,
            }));
          });
        }

        if (url.pathname === '/api/auth/change-password' && method === 'POST') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);

          return readBody(async (body) => {
            const newPassword = (body.newPassword || '').trim();
            const currentPassword = (body.currentPassword || body.oldPassword || '').trim();

            if (!newPassword || newPassword.length < 6) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, error: 'New password must be at least 6 characters long.' }));
            }

            const targetUser = authResult.auth!.user;
            const targetEmail = (targetUser?.email || devSuperAdminEmails[0]).toLowerCase();
            const currentExpected =
              devUserPasswordHashes.get(targetEmail) ||
              (targetUser?.role === 'super_admin' ? devUserPasswordHashes.get(devSuperAdminEmails[0]) : undefined);
            const isMatch = currentExpected
              ? await verifyPassword(currentPassword, currentExpected)
              : false;

            if (!isMatch) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, error: 'Current password does not match. Please verify and try again.' }));
            }

            // Invalidate old password and set new PBKDF2 hashed password
            const newHashed = await hashPassword(newPassword);
            devUserPasswordHashes.set(targetEmail, newHashed);
            if (targetUser?.role === 'super_admin' || devSuperAdminEmails.includes(targetEmail)) {
              devSuperAdminEmails.forEach((email) => {
                devUserPasswordHashes.set(email, newHashed);
              });
              devUserPasswordHashes.set('admin', newHashed);
              devUserPasswordHashes.set('superadmin', newHashed);
            }

            const isPrivileged = isDevAdminRole(targetUser?.role);
            const now = Math.floor(Date.now() / 1000);
            const sessionDuration = isPrivileged ? ADMIN_SESSION_IDLE_TIMEOUT_SECONDS : CUSTOMER_SESSION_EXPIRATION_SECONDS;

            const freshToken = signDevSessionToken({
              userId: targetUser?.id || devSuperAdminAccounts[0]?.id || 'dev-super-admin-1',
              email: targetUser?.email || targetEmail,
              role: targetUser?.role || 'super_admin',
              pwdSig: computeDevPasswordSig(newHashed),
              ...(isPrivileged ? { authTime: authResult.auth?.user?.authTime || now, lastActivity: now } : {}),
            }, sessionDuration);
            res.setHeader('Set-Cookie', buildDevAuthCookie(freshToken, sessionDuration));
            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              message: 'Password updated successfully.',
              token: freshToken,
            }));
          });
        }

        if (url.pathname === '/api/auth/forgot-password' && method === 'POST') {
          return readBody(async (body) => {
            const rawEmail = String(body?.email || '').trim().toLowerCase();
            if (!rawEmail || !rawEmail.includes('@') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                status: 'INVALID_EMAIL',
                message: 'Please enter a valid email address.',
              }));
            }

            const clientIp = getDevClientIp(req);

            const ipRateKey = `pwd-reset-ip:${clientIp}`;
            const emailRateKey = `pwd-reset-email:${rawEmail}`;
            const comboRateKey = `pwd-reset:${clientIp}:${rawEmail}`;

            if (
              !checkDevRateLimit(ipRateKey, 10, 900) ||
              !checkDevRateLimit(emailRateKey, 5, 900) ||
              !checkDevRateLimit(comboRateKey, 5, 900)
            ) {
              res.statusCode = 429;
              return res.end(JSON.stringify({
                success: false,
                status: 'RATE_LIMITED',
                message: 'Too many password reset requests. Please try again later.',
              }));
            }

            recordDevRateAttempt(ipRateKey, 900);
            recordDevRateAttempt(emailRateKey, 900);
            recordDevRateAttempt(comboRateKey, 900);

            const startTime = Date.now();
            const found = devUsers.find((u) => String(u.email || '').trim().toLowerCase() === rawEmail);

            const genericSuccess = {
              success: true,
              status: 'RESET_EMAIL_SENT',
              message: 'If the account exists, password reset instructions have been sent.',
            };

            if (!found || !found.email) {
              // Case 2 — Account does NOT exist: Perform matched dummy operations to eliminate timing differences
              for (const [, existingToken] of devPasswordResetTokens.entries()) {
                if (existingToken.userId === '__dummy__' && existingToken.usedAt == null) {
                  existingToken.usedAt = Date.now();
                }
              }
              const dummyRawToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
              const dummyHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dummyRawToken));
              const dummyTokenHash = bufferToHex(dummyHashBuf);
              void dummyTokenHash;
            } else {
              // Case 1 — Account exists
              // Invalidate any previous unused reset tokens for this user
              for (const [, existingToken] of devPasswordResetTokens.entries()) {
                if (existingToken.userId === found.id && existingToken.usedAt == null) {
                  existingToken.usedAt = Date.now();
                }
              }

              const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
              const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
              const tokenHash = bufferToHex(hashBuf);
              const expiresAt = Date.now() + 60 * 60 * 1000;
              const id = `prt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

              devPasswordResetTokens.set(tokenHash, {
                id,
                userId: found.id,
                tokenHash,
                expiresAt,
                usedAt: null,
                createdAt: Date.now(),
              });

              let rawAppUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
              if (rawAppUrl && !rawAppUrl.startsWith('http://') && !rawAppUrl.startsWith('https://')) {
                rawAppUrl = `https://${rawAppUrl}`;
              }
              const baseUrl = rawAppUrl || 'https://rongdhonutrade.com';
              const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
              const resendApiKey = (process.env.RESEND_API_KEY || '').trim();

              if (resendApiKey) {
                // Send in the background asynchronously without blocking or delaying the HTTP response
                void (async () => {
                  try {
                    const rawFrom = (process.env.RESEND_FROM_EMAIL || '').trim() || 'support@rongdhonutrade.com';
                    const fromEmail = rawFrom.includes('<') ? rawFrom : `Rongodhonu Trade <${rawFrom}>`;
                    const resendRes = await fetch('https://api.resend.com/emails', {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${resendApiKey}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        from: fromEmail,
                        to: [found.email],
                        subject: 'Reset your Rongodhonu Trade password',
                        html: `<p>Click here to reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
                        text: `Reset your Rongodhonu Trade password:\n${resetUrl}\nExpires in 60 minutes.`,
                      }),
                    });
                    if (!resendRes.ok) {
                      console.error('[Auth Diagnostics] resend_failure: Resend API returned non-2xx status');
                    }
                  } catch {
                    console.error('[Auth Diagnostics] resend_failure: Resend Network Error');
                  }
                })();
              }
            }

            // Equalize response timing across existing and non-existing accounts
            const TARGET_RESET_TIME_MS = 100;
            const elapsed = Date.now() - startTime;
            const remainingDelay = TARGET_RESET_TIME_MS - elapsed;
            if (remainingDelay > 0) {
              await new Promise((resolve) => setTimeout(resolve, remainingDelay));
            }

            res.statusCode = 200;
            return res.end(JSON.stringify(genericSuccess));
          });
        }

        if (url.pathname === '/api/auth/reset-password' && method === 'POST') {
          return readBody(async (body) => {
            const rawToken = String(body?.token || '').trim();
            const newPassword = String(body?.newPassword || '').trim();

            if (!rawToken) {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                status: 'INVALID_TOKEN',
                message: 'Password reset token is required.',
                error: 'Password reset token is required.',
              }));
            }
            if (!newPassword || newPassword.length < 6) {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                status: 'INVALID_PASSWORD',
                message: 'New password must be at least 6 characters long.',
                error: 'New password must be at least 6 characters long.',
              }));
            }

            const forwardedFor = req.headers['x-forwarded-for'];
            const clientIp = (
              (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0] : '') ||
              req.headers['cf-connecting-ip'] ||
              req.socket?.remoteAddress ||
              'default-ip'
            ).toString().trim();
            const verifyRateKey = `pwd-reset-verify:${clientIp}`;
            if (!checkDevRateLimit(verifyRateKey, 10, 900)) {
              res.statusCode = 429;
              return res.end(JSON.stringify({
                success: false,
                status: 'RATE_LIMITED',
                message: 'Too many password reset attempts. Please try again later.',
                error: 'Too many password reset attempts. Please try again later.',
              }));
            }

            const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
            const tokenHash = bufferToHex(hashBuf);
            const tokenRecord = devPasswordResetTokens.get(tokenHash);
            const now = Date.now();

            // Atomic token claim: verifies valid, unused, and unexpired token, claiming it immediately
            if (!tokenRecord || tokenRecord.usedAt != null || tokenRecord.expiresAt <= now) {
              recordDevRateAttempt(verifyRateKey, 900);
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                status: 'INVALID_TOKEN',
                message: 'Invalid or expired password reset link. Please request a new one.',
                error: 'Invalid or expired password reset link. Please request a new one.',
              }));
            }

            const targetUser = devUsers.find((u) => u.id === tokenRecord.userId);
            if (!targetUser) {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                status: 'INVALID_TOKEN',
                message: 'Invalid or expired password reset link. Please request a new one.',
                error: 'Invalid or expired password reset link. Please request a new one.',
              }));
            }

            // Atomically mark token as used prior to modifying credentials
            tokenRecord.usedAt = now;
            const newHashed = await hashPassword(newPassword);
            devUserPasswordHashes.set(targetUser.email.toLowerCase(), newHashed);
            if (targetUser.role === 'super_admin' || devSuperAdminEmails.includes(targetUser.email?.toLowerCase())) {
              devSuperAdminEmails.forEach((email) => {
                devUserPasswordHashes.set(email, newHashed);
              });
              devUserPasswordHashes.set('admin', newHashed);
              devUserPasswordHashes.set('superadmin', newHashed);
            }

            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              status: 'PASSWORD_RESET_SUCCESS',
              message: 'Your password has been successfully reset. You can now log in with your new password.',
            }));
          });
        }


        if ((url.pathname === '/api/auth/logout' || url.pathname === '/api/admin/logout') && method === 'POST') {
          res.setHeader('Set-Cookie', buildDevAuthCookie('', 0));
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, message: 'Logged out successfully.' }));
        }

        // ==========================================
        // PERMISSION MANAGEMENT & METADATA ROUTES
        // ==========================================
        if (url.pathname === '/api/admin/permissions/metadata' && method === 'GET') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          if (authResult.auth!.role === 'customer') {
            return sendDevError(res, {
              status: 403,
              body: { success: false, error: 'Forbidden: Customers cannot view permission metadata.' },
            });
          }
          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            metadata: PERMISSIONS_METADATA,
            keys: PERMISSION_KEYS,
            superAdminOnly: Array.from(SUPER_ADMIN_ONLY_PERMISSIONS),
          }));
        }

        const devPermGetMatch = url.pathname.match(/^\/api\/(?:admin\/)?(?:users\/([^/]+)\/permissions|permissions\/([^/]+))\/?$/);
        if (devPermGetMatch && method === 'GET') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);

          const targetUserId = decodeURIComponent(devPermGetMatch[1] || devPermGetMatch[2]);
          const isSelf = authResult.auth!.user.id === targetUserId;
          const canView = isSelf || authResult.auth!.role === 'super_admin' || hasDevPermission(authResult.auth!, 'permission.manage') || hasDevPermission(authResult.auth!, 'user.view');

          if (!canView) {
            return sendDevError(res, {
              status: 403,
              body: { success: false, error: 'Forbidden: Insufficient permissions to view user permissions.' },
            });
          }

          const targetUser = devUsers.find((u) => u.id === targetUserId);
          if (!targetUser) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ success: false, error: 'User not found.' }));
          }

          const effectivePermissions = resolveUserPermissions(targetUser.role, targetUser.permissions_json || targetUser.permissions);
          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            userId: targetUserId,
            role: targetUser.role,
            permissions: effectivePermissions,
          }));
        }

        if (devPermGetMatch && method !== 'GET') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);

          // ONLY super_admin can modify permissions
          if (authResult.auth!.role !== 'super_admin') {
            return sendDevError(res, {
              status: 403,
              body: { success: false, error: 'Forbidden: Only Super Administrator can modify permissions.' },
            });
          }

          if (method !== 'PUT' && method !== 'PATCH') {
            res.statusCode = 405;
            return res.end(JSON.stringify({ success: false, error: 'Method not allowed.' }));
          }

          const targetUserId = decodeURIComponent(devPermGetMatch[1] || devPermGetMatch[2]);
          const targetIdx = devUsers.findIndex((u) => u.id === targetUserId);
          if (targetIdx < 0) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ success: false, error: 'Target user not found.' }));
          }

          const targetUser = devUsers[targetIdx];
          if (targetUser.role === 'super_admin' || devSuperAdminEmails.includes(targetUser.email?.toLowerCase())) {
            return sendDevError(res, {
              status: 403,
              body: { success: false, error: 'Forbidden: Super Administrator permissions cannot be modified.' },
            });
          }

          if (targetUser.role !== 'admin' && targetUser.role !== 'sub_admin') {
            return sendDevError(res, {
              status: 403,
              body: { success: false, error: 'Forbidden: Target user must have role "admin" or "sub_admin" to configure admin permissions.' },
            });
          }

          return readBody((body) => {
            const rawPermissions = body?.permissions || body?.user_permissions || body?.permissions_json || body;
            const permissionsInput = normalizePermissionsInput(rawPermissions);
            if (!permissionsInput || typeof permissionsInput !== 'object') {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, error: 'Invalid permissions payload: expected a permissions object or array.' }));
            }

            for (const [key, val] of Object.entries(permissionsInput)) {
              if (!isValidPermissionKey(key)) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: `Bad Request: Unknown permission key "${key}".` }));
              }
              if (Boolean(val) && isSuperAdminOnlyPermission(key)) {
                return sendDevError(res, {
                  status: 403,
                  body: { success: false, error: `Forbidden: Permission "${key}" is permanently Super Admin-only and cannot be granted to ${targetUser.role}.` },
                });
              }
            }

            let existingPermissions: Record<string, boolean> = {};
            if (targetUser.permissions_json) {
              try { existingPermissions = JSON.parse(targetUser.permissions_json); } catch {}
            } else if (targetUser.permissions && typeof targetUser.permissions === 'object') {
              existingPermissions = { ...targetUser.permissions };
            }

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

            devUsers[targetIdx] = {
              ...devUsers[targetIdx],
              permissions_json: JSON.stringify(updatedPermissions),
              permissions: generateLegacyPermissionFlags(updatedPermissions),
            };

            devAuditLogs.unshift({
              id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              timestamp: new Date().toISOString(),
              actorId: authResult.auth!.user.id,
              actorEmail: authResult.auth!.user.email,
              actorRole: authResult.auth!.role,
              action: 'permission.update',
              targetId: targetUserId,
              targetType: 'user',
              details: { changedPermissions: permissionsInput },
            });

            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              message: `Permissions updated successfully for user "${targetUser.name}".`,
              permissions: resolveUserPermissions(targetUser.role, updatedPermissions),
              user: devUsers[targetIdx],
            }));
          });
        }

        // ROLE MANAGEMENT ROUTE (Super Admin Only)
        const devRoleMatch = url.pathname.match(/^\/api\/(?:admin\/)?(?:users\/([^/]+)\/role|roles\/([^/]+))\/?$/);
        if (devRoleMatch) {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);

          // ONLY super_admin can modify roles
          if (authResult.auth!.role !== 'super_admin') {
            return sendDevError(res, {
              status: 403,
              body: { success: false, error: 'Forbidden: Only Super Administrator can modify user roles.' },
            });
          }

          const targetUserId = decodeURIComponent(devRoleMatch[1] || devRoleMatch[2]);
          const targetIdx = devUsers.findIndex((u) => u.id === targetUserId);
          if (targetIdx < 0) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ success: false, error: 'Target user not found.' }));
          }

          const targetUser = devUsers[targetIdx];
          const isTargetSuper = targetUser.role === 'super_admin' || devSuperAdminEmails.includes(targetUser.email?.toLowerCase());

          if (method === 'GET') {
            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              userId: targetUserId,
              role: targetUser.role,
            }));
          }

          if (method !== 'PUT' && method !== 'PATCH' && method !== 'POST') {
            res.statusCode = 405;
            return res.end(JSON.stringify({ success: false, error: 'Method not allowed.' }));
          }

          return readBody((body) => {
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
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                error: `Invalid role "${requestedRole}". Allowed roles are: admin, sub_admin, customer.`,
              }));
            }

            if (isTargetSuper && requestedRole !== 'super_admin') {
              return sendDevError(res, {
                status: 403,
                body: { success: false, error: 'Forbidden: Super Administrator role cannot be modified.' },
              });
            }

            devUsers[targetIdx] = {
              ...devUsers[targetIdx],
              role: requestedRole,
              ...(requestedRole === 'customer' ? { permissions: undefined, permissions_json: null } : {}),
            };

            devAuditLogs.unshift({
              id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              timestamp: new Date().toISOString(),
              actorId: authResult.auth!.user.id,
              actorEmail: authResult.auth!.user.email,
              actorRole: authResult.auth!.role,
              action: 'user.role_update',
              targetId: targetUserId,
              targetType: 'user',
              details: { previousRole: targetUser.role, newRole: requestedRole },
            });

            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              message: `User role updated successfully for "${targetUser.name}".`,
              user: devUsers[targetIdx],
            }));
          });
        }

        // AUDIT LOGS ROUTE
        if (url.pathname === '/api/admin/audit-logs' && method === 'GET') {
          const authResult = requireDevAuth(req);
          const permErr = requireDevPermission(authResult, 'audit_log.view');
          if (permErr) return sendDevError(res, permErr);

          const pageParam = url.searchParams.get('page');
          const limitParam = url.searchParams.get('limit');
          const offsetParam = url.searchParams.get('offset');

          const DEFAULT_LIMIT = 50;
          const MAX_LIMIT = 200;

          let limit = DEFAULT_LIMIT;
          if (limitParam !== null) {
            const parsed = parseInt(limitParam, 10);
            if (!isNaN(parsed)) {
              limit = Math.min(MAX_LIMIT, Math.max(1, parsed));
            }
          }

          let page = 1;
          let offset = 0;
          if (pageParam !== null) {
            const parsedPage = parseInt(pageParam, 10);
            if (!isNaN(parsedPage) && parsedPage >= 1) {
              page = parsedPage;
              offset = (page - 1) * limit;
            }
          } else if (offsetParam !== null) {
            const parsedOffset = parseInt(offsetParam, 10);
            if (!isNaN(parsedOffset) && parsedOffset >= 0) {
              offset = parsedOffset;
              page = Math.floor(offset / limit) + 1;
            }
          }

          // Ensure devAuditLogs are sorted newest first
          const sorted = [...devAuditLogs].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
          const total = sorted.length;
          const totalPages = Math.ceil(total / limit) || 1;
          const pagedLogs = sorted.slice(offset, offset + limit);

          const isSuperAdmin = authResult.auth?.role === 'super_admin';
          const canViewBuyingPrice = Boolean(
            authResult.auth &&
            (isSuperAdmin || hasDevPermission(authResult.auth, 'product.view_buying_price') || hasDevPermission(authResult.auth, 'product.buying_price'))
          );
          const canViewProfit = Boolean(
            authResult.auth &&
            (isSuperAdmin || hasDevPermission(authResult.auth, 'product.view_profit') || hasDevPermission(authResult.auth, 'report.profit'))
          );

          const safeLogs = pagedLogs.map((log) => {
            const sanitizedLog: any = deepSanitizeDevCostAndProfit(log, { isSuperAdmin, canViewBuyingPrice, canViewProfit });
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

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            count: safeLogs.length,
            total,
            page,
            limit,
            totalPages,
            logs: safeLogs,
          }));
        }

        // 0. OPTIMIZED PUBLIC HOMEPAGE CONSOLIDATED ROUTE
        if (url.pathname === '/api/store/homepage' && (method === 'GET' || method === 'HEAD')) {
          const safeSettings = maskDevSettings(devSettings, false, false);
          const activeSliders = [...devSliders]
            .filter((s: any) => s.isActive !== false && s.is_active !== 0 && s.status !== 'inactive')
            .sort((a: any, b: any) => (Number(a.sort_order ?? a.sortOrder ?? 0) - Number(b.sort_order ?? b.sortOrder ?? 0)));

          const categoryProducts: Record<string, any[]> = {};
          const collectedMap = new Map<string, any>();

          devCategories.forEach((cat: any) => {
            const catProds = devProducts
              .filter((p: any) => p.status !== 'inactive' && !p.isDeleted && p.categoryId === cat.id)
              .slice(0, 6)
              .map((p: any) => sanitizeDevProduct(p, false));
            categoryProducts[cat.id] = catProds;
            catProds.forEach((p: any) => collectedMap.set(p.id, p));
          });

          const rawFeatured = devProducts
            .filter((p: any) => p.status !== 'inactive' && !p.isDeleted && (p.featured || p.isFeatured));
          rawFeatured.sort((a: any, b: any) => {
            const orderA = Number(a.featuredSortOrder) || 0;
            const orderB = Number(b.featuredSortOrder) || 0;
            if (orderA > 0 && orderB > 0) return orderA - orderB;
            if (orderA > 0) return -1;
            if (orderB > 0) return 1;
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          });
          const featuredProducts = rawFeatured
            .slice(0, 8)
            .map((p: any) => sanitizeDevProduct(p, false));

          featuredProducts.forEach((p: any) => {
            if (!collectedMap.has(p.id)) {
              collectedMap.set(p.id, p);
            }
          });

          const uniqueProducts = Array.from(collectedMap.values());

          res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=30');
          res.setHeader('Vary', 'Origin, Accept-Encoding');
          res.statusCode = 200;
          return res.end(
            JSON.stringify({
              success: true,
              settings: safeSettings,
              categories: devCategories,
              slides: activeSliders,
              categoryProducts,
              featuredProducts,
              products: uniqueProducts,
            })
          );
        }

        // 1. PRODUCTS
        if (url.pathname === '/api/products') {
          if (method === 'GET') {
            const authResult = requireDevAuth(req);
            const auth = authResult.auth;
            const isSuperAdmin = auth?.role === 'super_admin';
            const isStaff = Boolean(auth && (auth.role === 'admin' || auth.role === 'sub_admin' || auth.role === 'staff' || isSuperAdmin));
            const canViewBuyingPrice = Boolean(auth && (isSuperAdmin || hasDevPermission(auth, 'product.view_buying_price')));
            const canViewProfit = Boolean(auth && (isSuperAdmin || hasDevPermission(auth, 'product.view_profit')));
            const canManageProducts = Boolean(
              auth &&
              (isSuperAdmin ||
                hasDevPermission(auth, 'product.create') ||
                hasDevPermission(auth, 'product.update') ||
                hasDevPermission(auth, 'product.view'))
            );
            const isPrivileged = isSuperAdmin || isStaff || canViewBuyingPrice || canViewProfit || canManageProducts;
            const includeInactive = Boolean(isPrivileged && (url.searchParams.get('includeInactive') === 'true' || url.searchParams.get('all') === 'true'));

            const cat = url.searchParams.get('category');
            const search = (url.searchParams.get('search') || '').trim().toLowerCase();
            const featuredParam = url.searchParams.get('featured');
            const pageParam = url.searchParams.get('page');
            const limitParam = url.searchParams.get('limit');
            const sortBy = url.searchParams.get('sortBy');

            let list = [...devProducts];
            if (!includeInactive) {
              list = list.filter((p) => p.status !== 'inactive' && !p.isDeleted);
            }
            if (cat && cat !== 'all') {
              const targetCategory = devCategories.find((c) => c.id === cat || c.slug === cat);
              const targetCatId = targetCategory ? targetCategory.id : cat;
              list = list.filter((p) => p.categoryId === targetCatId || p.categoryId === cat);
            }
            if (featuredParam !== null) {
              const isFeat = featuredParam === 'true' || featuredParam === '1';
              list = list.filter((p) => Boolean(p.featured) === isFeat);
            }
            if (search) {
              const tokens = search.split(/\s+/).filter(Boolean);
              list = list.filter((p) => {
                const title = (p.title || '').toLowerCase();
                const desc = (p.description || '').toLowerCase();
                const sku = (p.sku || '').toLowerCase();
                return tokens.every((t) => title.includes(t) || desc.includes(t) || sku.includes(t));
              });
            }
            if (sortBy === 'price-asc') list.sort((a, b) => (a.price || 0) - (b.price || 0));
            else if (sortBy === 'price-desc') list.sort((a, b) => (b.price || 0) - (a.price || 0));
            else if (sortBy === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
            else if (sortBy === 'featured') list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
            else list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

            const total = list.length;
            const DEFAULT_PUBLIC_PAGE = 1;
            const DEFAULT_PUBLIC_LIMIT = 24;
            const MAX_PUBLIC_LIMIT = 48;
            const MAX_ADMIN_LIMIT = 500;

            let pagedList = list;
            let page = 1;
            let limit = list.length;
            let totalPages = 1;

            if (isPrivileged) {
              if (pageParam === null && limitParam === null) {
                // Admin dashboard fetching all products
                page = 1;
                limit = list.length;
                totalPages = 1;
                pagedList = list;
              } else {
                page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
                const parsedLimit = limitParam ? parseInt(limitParam, 10) : 100;
                limit = Math.min(MAX_ADMIN_LIMIT, Math.max(1, isNaN(parsedLimit) ? 100 : parsedLimit));
                totalPages = Math.ceil(total / limit) || 1;
                const offset = (page - 1) * limit;
                pagedList = list.slice(offset, offset + limit);
              }
            } else {
              // Public storefront request: safe default page=1, limit=24, hard cap at 48
              page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : DEFAULT_PUBLIC_PAGE;
              const parsedLimit = limitParam ? parseInt(limitParam, 10) : DEFAULT_PUBLIC_LIMIT;
              const requestedLimit = isNaN(parsedLimit) ? DEFAULT_PUBLIC_LIMIT : parsedLimit;
              limit = Math.min(MAX_PUBLIC_LIMIT, Math.max(1, requestedLimit));
              totalPages = Math.ceil(total / limit) || 1;
              const offset = (page - 1) * limit;
              pagedList = list.slice(offset, offset + limit);
            }

            const sanitized = pagedList.map((p) => sanitizeDevProduct(p, { isSuperAdmin, canViewBuyingPrice, canViewProfit }));
            const cacheControl = isPrivileged
              ? 'no-store, no-cache, must-revalidate, max-age=0'
              : (search ? 'public, max-age=15, s-maxage=30, stale-while-revalidate=15' : 'public, max-age=30, s-maxage=60, stale-while-revalidate=30');
            res.setHeader('Cache-Control', cacheControl);
            res.setHeader('Vary', 'Origin, Cookie, Authorization, Accept-Encoding');
            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              count: sanitized.length,
              total,
              page,
              limit,
              totalPages,
              products: sanitized,
            }));
          }
          if (method === 'POST') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'product.create');
            if (permErr) return sendDevError(res, permErr);

            return readBody((body) => {
              const isSuper = authResult.auth!.role === 'super_admin';
              const canManageBuyingPrice = isSuper || hasDevPermission(authResult.auth!, 'product.manage_buying_price');
              const canViewBuyingPrice = isSuper || hasDevPermission(authResult.auth!, 'product.view_buying_price');
              const canViewProfit = isSuper || hasDevPermission(authResult.auth!, 'product.view_profit');
              const product = body.product || body;
              const price = Number(product.price) || 0;
              const rawInputBp = product.buyingPrice !== undefined && product.buyingPrice !== null
                ? product.buyingPrice
                : (product.buying_price !== undefined && product.buying_price !== null ? product.buying_price : null);
              const buyingPrice = canManageBuyingPrice
                ? (rawInputBp !== null && rawInputBp !== '' && !isNaN(Number(rawInputBp)) ? Math.max(0, Number(rawInputBp)) : 0)
                : 0;

              const newProd = {
                id: product.id || `prod-${Date.now()}`,
                title: product.title || product.name || 'Product',
                price,
                originalPrice: product.originalPrice ?? product.oldPrice,
                buyingPrice,
                categoryId: product.categoryId || product.category || 'cat-mens-accessories',
                description: product.description || '',
                imageUrl: product.imageUrl || (Array.isArray(product.images) ? product.images[0] : '') || '',
                images: Array.isArray(product.images) ? product.images : [product.imageUrl].filter(Boolean),
                stock: Number(product.stock) || 0,
                featured: Boolean(product.featured),
                rating: Number(product.rating) || 5.0,
                reviewsCount: Number(product.reviewsCount) || 0,
                specs: product.specs || [],
                sizes: product.sizes || [],
                colors: product.colors || [],
                sku: product.sku || undefined,
                videoUrl: product.videoUrl || product.youtubeUrl || undefined,
                createdAt: product.createdAt || new Date().toISOString(),
              };
              devProducts.unshift(newProd);
              res.statusCode = 201;
              return res.end(JSON.stringify({
                success: true,
                product: sanitizeDevProduct(newProd, { isSuperAdmin: isSuper, canViewBuyingPrice, canViewProfit }),
              }));
            });
          }
        }

        const featMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/featured$/);
        if (featMatch) {
          const id = decodeURIComponent(featMatch[1]);
          const authResult = requireDevAuth(req);
          if (method === 'PUT' || method === 'PATCH') {
            const permErr = requireDevPermission(authResult, 'product.update');
            if (permErr) return sendDevError(res, permErr);

            return readBody((body) => {
              const idx = devProducts.findIndex((p) => p.id === id);
              if (idx === -1) {
                res.statusCode = 404;
                return res.end(JSON.stringify({ success: false, error: 'Product not found' }));
              }
              const isFeat = body.isFeatured !== undefined ? Boolean(body.isFeatured) : Boolean(body.featured);
              const sortOrd = body.featuredSortOrder !== undefined
                ? Number(body.featuredSortOrder)
                : (body.sortOrder !== undefined ? Number(body.sortOrder) : (devProducts[idx].featuredSortOrder || 0));

              devProducts[idx] = {
                ...devProducts[idx],
                featured: isFeat,
                featuredSortOrder: sortOrd,
                updatedAt: new Date().toISOString(),
              };

              const isSuperRole = authResult.auth!.role === 'super_admin';
              const canViewBuying = isSuperRole || hasDevPermission(authResult.auth!, 'product.view_buying_price');
              const canViewProf = isSuperRole || hasDevPermission(authResult.auth!, 'product.view_profit');

              res.statusCode = 200;
              return res.end(JSON.stringify({
                success: true,
                product: sanitizeDevProduct(devProducts[idx], { isSuperAdmin: isSuperRole, canViewBuyingPrice: canViewBuying, canViewProfit: canViewProf }),
              }));
            });
          }
        }

        const prodMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
        if (prodMatch) {
          const id = decodeURIComponent(prodMatch[1]);
          const authResult = requireDevAuth(req);
          const auth = authResult.auth;
          const isSuperAdmin = auth?.role === 'super_admin';
          const canViewBuyingPrice = Boolean(auth && (isSuperAdmin || hasDevPermission(auth, 'product.view_buying_price')));
          const canViewProfit = Boolean(auth && (isSuperAdmin || hasDevPermission(auth, 'product.view_profit')));
          const isPrivileged = Boolean(
            auth &&
            (isSuperAdmin ||
              canViewBuyingPrice ||
              canViewProfit ||
              hasDevPermission(auth, 'product.create') ||
              hasDevPermission(auth, 'product.update'))
          );

          if (method === 'GET') {
            const found = devProducts.find((p) => p.id === id);
            const singleCacheControl = isPrivileged
              ? 'no-store, no-cache, must-revalidate, max-age=0'
              : 'public, max-age=15, s-maxage=45, stale-while-revalidate=30';
            res.setHeader('Cache-Control', singleCacheControl);
            res.setHeader('Vary', 'Origin, Cookie, Authorization, Accept-Encoding');
            res.statusCode = found ? 200 : 404;
            return res.end(JSON.stringify(found ? {
              success: true,
              product: sanitizeDevProduct(found, { isSuperAdmin, canViewBuyingPrice, canViewProfit }),
            } : { success: false, error: 'Not found' }));
          }
          if (method === 'PUT' || method === 'PATCH') {
            const permErr = requireDevPermission(authResult, 'product.update');
            if (permErr) return sendDevError(res, permErr);

            return readBody((body) => {
              const isSuperRole = authResult.auth!.role === 'super_admin';
              const canManageBuying = isSuperRole || hasDevPermission(authResult.auth!, 'product.manage_buying_price');
              const canViewBuying = isSuperRole || hasDevPermission(authResult.auth!, 'product.view_buying_price');
              const canViewProf = isSuperRole || hasDevPermission(authResult.auth!, 'product.view_profit');
              const updates = body.updates || body.product || body;
              const idx = devProducts.findIndex((p) => p.id === id);
              if (idx >= 0) {
                if (!canManageBuying) {
                  delete updates.buyingPrice;
                  delete updates.buying_price;
                } else if (updates.buyingPrice !== undefined || updates.buying_price !== undefined) {
                  const bVal = updates.buyingPrice !== undefined ? updates.buyingPrice : updates.buying_price;
                  if (bVal !== null && bVal !== '' && !isNaN(Number(bVal))) {
                    updates.buyingPrice = Math.max(0, Number(bVal));
                  }
                }
                if ('videoUrl' in updates) {
                  updates.videoUrl = updates.videoUrl ? String(updates.videoUrl).trim() : undefined;
                }
                devProducts[idx] = { ...devProducts[idx], ...updates };
                res.statusCode = 200;
                return res.end(JSON.stringify({
                  success: true,
                  product: sanitizeDevProduct(devProducts[idx], { isSuperAdmin: isSuperRole, canViewBuyingPrice: canViewBuying, canViewProfit: canViewProf }),
                }));
              }
              res.statusCode = 404;
              return res.end(JSON.stringify({ success: false, error: 'Not found' }));
            });
          }
          if (method === 'DELETE') {
            const permErr = requireDevPermission(authResult, 'product.delete');
            if (permErr) return sendDevError(res, permErr);

            devProducts = devProducts.filter((p) => p.id !== id);
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, message: 'Deleted' }));
          }
        }

        // 2. CATEGORIES
        if (url.pathname === '/api/categories') {
          if (method === 'GET') {
            res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=120');
            res.setHeader('Vary', 'Origin, Accept-Encoding');
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, count: devCategories.length, categories: devCategories }));
          }
          if (method === 'POST') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'category.manage');
            if (permErr) return sendDevError(res, permErr);

            return readBody((body) => {
              const cat = body.category || body;
              const newCat = {
                id: cat.id || `cat-${Date.now()}`,
                name: cat.name || 'New Category',
                slug: cat.slug || cat.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `cat-${Date.now()}`,
                iconName: cat.iconName || 'Tag',
                description: cat.description || '',
              };
              devCategories.push(newCat);
              res.statusCode = 201;
              return res.end(JSON.stringify({ success: true, category: newCat }));
            });
          }
        }

        const catMatch = url.pathname.match(/^\/api\/categories\/([^/]+)$/);
        if (catMatch) {
          const id = decodeURIComponent(catMatch[1]);
          if (method === 'PUT' || method === 'PATCH') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'category.manage');
            if (permErr) return sendDevError(res, permErr);

            return readBody((body) => {
              const updates = body.updates || body.category || body;
              const idx = devCategories.findIndex((c) => c.id === id || c.slug === id);
              if (idx >= 0) {
                devCategories[idx] = { ...devCategories[idx], ...updates };
                res.statusCode = 200;
                return res.end(JSON.stringify({ success: true, category: devCategories[idx] }));
              }
              res.statusCode = 404;
              return res.end(JSON.stringify({ success: false, error: 'Not found' }));
            });
          }
          if (method === 'DELETE') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'category.manage');
            if (permErr) return sendDevError(res, permErr);

            devCategories = devCategories.filter((c) => c.id !== id && c.slug !== id);
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, message: 'Deleted' }));
          }
        }

        // 3. SLIDERS
        if (url.pathname === '/api/sliders/order' || url.pathname === '/api/admin/sliders/order') {
          if (method === 'PUT' || method === 'POST') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'slider.manage');
            if (permErr) return sendDevError(res, permErr);

            return readBody((body) => {
              const items = Array.isArray(body) ? body : (body.slides || body.sliders || body.order || []);
              if (!Array.isArray(items) || items.length === 0) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, error: 'Non-empty array expected for slider ordering' }));
              }

              const rawIds = items.map((it: any) => (typeof it === 'string' ? it : it.id)).filter(Boolean);
              const uniqueIds = Array.from(new Set(rawIds));
              if (uniqueIds.length !== items.length) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, error: 'Duplicate slide IDs detected in ordering request' }));
              }

              for (const id of uniqueIds) {
                if (!devSliders.some((s) => s.id === id)) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: false, error: `Slide not found with ID: ${id}` }));
                }
              }

              // Reorder devSliders according to uniqueIds
              const orderMap = new Map<string, number>();
              uniqueIds.forEach((id, idx) => orderMap.set(id, idx + 1));
              let nextOrder = uniqueIds.length + 1;
              devSliders.forEach((s) => {
                if (!orderMap.has(s.id)) {
                  orderMap.set(s.id, nextOrder++);
                }
              });

              devSliders.forEach((s) => {
                const so = orderMap.get(s.id) || 1;
                s.sort_order = so;
                s.sortOrder = so;
              });

              devSliders.sort((a, b) => (Number(a.sort_order ?? a.sortOrder ?? 0) - Number(b.sort_order ?? b.sortOrder ?? 0)));

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: true,
                count: devSliders.length,
                sliders: devSliders,
                message: 'Slider ordering updated successfully'
              }));
            });
          }
        }

        if (url.pathname === '/api/sliders') {
          if (method === 'GET') {
            res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=60');
            res.setHeader('Vary', 'Origin, Accept-Encoding');
            devSliders.sort((a, b) => (Number(a.sort_order ?? a.sortOrder ?? 0) - Number(b.sort_order ?? b.sortOrder ?? 0)));
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, count: devSliders.length, sliders: devSliders }));
          }
          if (method === 'POST') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'slider.manage');
            if (permErr) return sendDevError(res, permErr);

            return readBody((body) => {
              const sl = body.slide || body;
              const nextOrder = devSliders.length > 0
                ? Math.max(...devSliders.map((s) => Number(s.sort_order ?? s.sortOrder ?? 0))) + 1
                : 1;
              const newSl = {
                id: sl.id || `slide-${Date.now()}`,
                sort_order: sl.sort_order ?? sl.sortOrder ?? nextOrder,
                sortOrder: sl.sort_order ?? sl.sortOrder ?? nextOrder,
                isActive: sl.isActive !== undefined ? Boolean(sl.isActive) : true,
                ...sl
              };
              devSliders.push(newSl);
              devSliders.sort((a, b) => (Number(a.sort_order ?? a.sortOrder ?? 0) - Number(b.sort_order ?? b.sortOrder ?? 0)));
              res.statusCode = 201;
              return res.end(JSON.stringify({ success: true, slider: newSl }));
            });
          }
        }

        const slMatch = url.pathname.match(/^\/api\/sliders\/([^/]+)$/);
        if (slMatch && slMatch[1] !== 'order') {
          const id = decodeURIComponent(slMatch[1]);
          if (method === 'PUT' || method === 'PATCH') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'slider.manage');
            if (permErr) return sendDevError(res, permErr);

            return readBody((body) => {
              const updates = body.updates || body.slide || body;
              const idx = devSliders.findIndex((s) => s.id === id);
              if (idx >= 0) {
                devSliders[idx] = {
                  ...devSliders[idx],
                  ...updates,
                  sort_order: updates.sort_order ?? updates.sortOrder ?? devSliders[idx].sort_order,
                  sortOrder: updates.sort_order ?? updates.sortOrder ?? devSliders[idx].sortOrder,
                  isActive: updates.isActive !== undefined ? Boolean(updates.isActive) : (updates.is_active !== undefined ? Boolean(Number(updates.is_active)) : (devSliders[idx].isActive ?? true)),
                };
                devSliders.sort((a, b) => (Number(a.sort_order ?? a.sortOrder ?? 0) - Number(b.sort_order ?? b.sortOrder ?? 0)));
                res.statusCode = 200;
                return res.end(JSON.stringify({ success: true, slider: devSliders[idx] }));
              }
              res.statusCode = 404;
              return res.end(JSON.stringify({ success: false, error: 'Not found' }));
            });
          }
          if (method === 'DELETE') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'slider.manage');
            if (permErr) return sendDevError(res, permErr);

            devSliders = devSliders.filter((s) => s.id !== id);
            devSliders.forEach((s, idx) => {
              s.sort_order = idx + 1;
              s.sortOrder = idx + 1;
            });
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, message: 'Deleted' }));
          }
        }

        // 4. SETTINGS
        if (url.pathname === '/api/settings') {
          if (method === 'GET') {
            const authResult = requireDevAuth(req);
            const isAdmin = Boolean(authResult.auth && (authResult.auth.role === 'super_admin' || authResult.auth.role === 'admin' || authResult.auth.role === 'sub_admin'));
            const canViewCourier = Boolean(authResult.auth && (authResult.auth.role === 'super_admin' || hasDevPermission(authResult.auth, 'courier.configure') || hasDevPermission(authResult.auth, 'settings.manage')));
            const cacheControl = authResult.auth
              ? 'no-store, no-cache, must-revalidate, max-age=0'
              : 'public, max-age=30, s-maxage=60, stale-while-revalidate=30';
            res.setHeader('Cache-Control', cacheControl);
            res.setHeader('Vary', 'Origin, Cookie, Authorization, Accept-Encoding');
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, settings: maskDevSettings(devSettings, isAdmin, canViewCourier) }));
          }
          if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'settings.manage');
            if (permErr) return sendDevError(res, permErr);

            return readBody((body) => {
              const updates = body.settings || body;
              if (updates && typeof updates === 'object') {
                const updatedAnnouncement = updates.topBarAnnouncementText !== undefined
                  ? updates.topBarAnnouncementText
                  : (updates.announcementText !== undefined ? updates.announcementText : undefined);

                // Courier credentials must NEVER be persisted into store settings
                delete updates.steadfastApiKey;
                delete updates.steadfastSecretKey;
                if (Array.isArray(updates.courierWebhooks)) {
                  const existingMap = new Map<string, string>();
                  for (const w of devCourierWebhooks) {
                    if (w.id && w.secret) existingMap.set(w.id, w.secret);
                  }
                  updates.courierWebhooks = updates.courierWebhooks.map((w: any) => {
                    let secret = w.secret;
                    if (secret === '••••••••' || (typeof secret === 'string' && secret.startsWith('****')) || (secret === undefined && w.hasSecret)) {
                      secret = existingMap.get(w.id) || undefined;
                    }
                    return {
                      ...w,
                      secret: secret ? String(secret).trim() : undefined,
                    };
                  });
                  devCourierWebhooks = updates.courierWebhooks;
                }

                devSettings = {
                  ...devSettings,
                  ...updates,
                  ...(updatedAnnouncement !== undefined ? {
                    topBarAnnouncementText: updatedAnnouncement,
                    announcementText: updatedAnnouncement,
                  } : {}),
                  dbblBank: updates.dbblBank !== undefined ? {
                    ...(devSettings.dbblBank || {}),
                    ...updates.dbblBank,
                  } : devSettings.dbblBank,
                  footer: updates.footer !== undefined ? {
                    ...(devSettings.footer || {}),
                    ...updates.footer,
                    ...(Array.isArray(updates.footer.courierPartners) ? { courierPartners: [...updates.footer.courierPartners] } : {}),
                    ...(Array.isArray(updates.footer.acceptedPayments) ? { acceptedPayments: [...updates.footer.acceptedPayments] } : {}),
                  } : devSettings.footer,
                  blockedPhoneNumbers: updates.blockedPhoneNumbers !== undefined ? (
                    Array.isArray(updates.blockedPhoneNumbers) ? [...updates.blockedPhoneNumbers] : []
                  ) : devSettings.blockedPhoneNumbers,
                };

                // Persist settings to disk so they survive dev server restarts and project reloads
                try {
                  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(devSettings, null, 2), 'utf-8');
                } catch {}
              }
              const canViewCourier = Boolean(
                authResult.auth && (
                  authResult.auth.role === 'super_admin' ||
                  hasDevPermission(authResult.auth, 'courier.configure') ||
                  hasDevPermission(authResult.auth, 'settings.manage')
                )
              );

              res.statusCode = 200;
              return res.end(JSON.stringify({
                success: true,
                message: 'Website settings saved to database!',
                settings: maskDevSettings(devSettings, true, canViewCourier),
              }));
            });
          }
        }

        // 5. COUPONS
        if (url.pathname === '/api/coupons') {
          if (method === 'GET') {
            const authResult = requireDevAuth(req);
            const hasCouponView = Boolean(authResult.auth && (authResult.auth.role === 'super_admin' || hasDevPermission(authResult.auth, 'coupon.view')));
            const list = hasCouponView ? devCoupons : devCoupons.filter((c) => c.isActive);
            const cacheControl = authResult.auth
              ? 'no-store, no-cache, must-revalidate, max-age=0'
              : 'public, max-age=30, s-maxage=60, stale-while-revalidate=30';
            res.setHeader('Cache-Control', cacheControl);
            res.setHeader('Vary', 'Origin, Cookie, Authorization, Accept-Encoding');
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, coupons: list }));
          }
          if (method === 'POST') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'coupon.manage');
            if (permErr) return sendDevError(res, permErr);

            return readBody((body) => {
              const c = body?.coupon || body || {};
              const code = String(c.code || '').trim();
              if (!code) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, error: 'Coupon code is required.' }));
              }
              const idx = devCoupons.findIndex((item) => item.code.toUpperCase() === code.toUpperCase());
              if (idx >= 0) devCoupons[idx] = c;
              else devCoupons.push(c);
              res.statusCode = 201;
              return res.end(JSON.stringify({ success: true, coupon: c }));
            });
          }
        }

        const couponMatch = url.pathname.match(/^\/api\/coupons\/([^/]+)$/);
        if (couponMatch) {
          const code = decodeURIComponent(couponMatch[1]).toUpperCase();
          if (method === 'PUT' || method === 'PATCH') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'coupon.manage');
            if (permErr) return sendDevError(res, permErr);

            return readBody((body) => {
              const updates = body.updates || body.coupon || body;
              const idx = devCoupons.findIndex((c) => c.code.toUpperCase() === code);
              if (idx >= 0) {
                devCoupons[idx] = { ...devCoupons[idx], ...updates };
                res.statusCode = 200;
                return res.end(JSON.stringify({ success: true, coupon: devCoupons[idx] }));
              }
              res.statusCode = 404;
              return res.end(JSON.stringify({ success: false, error: 'Coupon not found' }));
            });
          }
          if (method === 'DELETE') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'coupon.manage');
            if (permErr) return sendDevError(res, permErr);

            devCoupons = devCoupons.filter((c) => c.code.toUpperCase() !== code);
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, message: 'Coupon deleted' }));
          }
        }

        // 6. REVIEWS
        if (url.pathname === '/api/reviews') {
          if (method === 'GET') {
            const productId = url.searchParams.get('productId') || undefined;
            const filteredReviews = productId ? devReviews.filter((r) => r.productId === productId) : devReviews;
            res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=30');
            res.setHeader('Vary', 'Origin');
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, count: filteredReviews.length, reviews: filteredReviews }));
          }
          if (method === 'POST') {
            const clientIp = ((req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1') as string).trim();
            const reviewIpKey = `rev-ip:${clientIp}`;

            // 1. IP-based rate limiting (max 5 reviews per 10 minutes)
            if (!checkDevRateLimit(reviewIpKey, 5, 600)) {
              res.statusCode = 429;
              return res.end(JSON.stringify({
                success: false,
                error: 'Too many reviews submitted from your connection. Please wait a few minutes before submitting another.',
              }));
            }

            return readBody((body) => {
              const r = body.review || body;
              const productId = String(r.productId || '').trim();
              const authorName = String(r.authorName || r.author || '').trim();
              const comment = String(r.comment || '').trim();
              const rating = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5)));

              if (!productId || !authorName || !comment) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'Product, author name, and comment are required.' }));
              }

              if (authorName.length < 2 || authorName.length > 60) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'Author name must be between 2 and 60 characters.' }));
              }

              if (comment.length < 3 || comment.length > 1000) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'Review comment must be between 3 and 1000 characters.' }));
              }

              // 2. Per-product throttling (max 2 reviews per product per IP per 10 minutes)
              const prodThrottleKey = `rev-prod:${clientIp}:${productId}`;
              if (!checkDevRateLimit(prodThrottleKey, 2, 600)) {
                res.statusCode = 429;
                return res.end(JSON.stringify({
                  success: false,
                  error: 'You have recently reviewed this product. Please wait before submitting another review.',
                }));
              }

              // 3. Duplicate submission protection
              const isDuplicate = devReviews.some((rev) => rev.productId === productId && rev.comment === comment);
              if (isDuplicate) {
                res.statusCode = 409;
                return res.end(JSON.stringify({
                  success: false,
                  error: 'A review with identical content has already been submitted for this product.',
                }));
              }

              recordDevRateAttempt(reviewIpKey, 600);
              recordDevRateAttempt(prodThrottleKey, 600);

              const newR = {
                id: r.id || `rev-${Date.now()}`,
                productId,
                authorName,
                rating,
                comment,
                verifiedPurchase: r.verifiedPurchase !== false,
                createdAt: r.createdAt || new Date().toISOString(),
              };
              devReviews.unshift(newR);
              res.statusCode = 201;
              return res.end(JSON.stringify({ success: true, review: newR }));
            });
          }
        }

        // 7. USERS
        if (url.pathname === '/api/users' || url.pathname === '/api/users/' || url.pathname === '/api/admin/users' || url.pathname === '/api/admin/users/') {
          if (method === 'GET') {
            const authResult = requireDevAuth(req);
            if (authResult.error) return sendDevError(res, authResult.error);

            const hasUserView = hasDevPermission(authResult.auth!, 'user.view');
            const hasCustView = hasDevPermission(authResult.auth!, 'customer.view');

            if (!hasUserView && !hasCustView) {
              return sendDevError(res, {
                status: 403,
                body: { success: false, error: 'Forbidden: Insufficient permissions to view users.' },
              });
            }

            if (!hasUserView && hasCustView) {
              const customersOnly = devUsers.filter((u) => u.role === 'customer');
              res.statusCode = 200;
              return res.end(JSON.stringify({ success: true, count: customersOnly.length, users: customersOnly }));
            }

            const isSuper = authResult.auth!.role === 'super_admin';
            const usersToReturn = isSuper
              ? devUsers
              : devUsers.filter((u) => u.role !== 'super_admin' && !devSuperAdminEmails.includes(u.email?.toLowerCase()));

            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, count: usersToReturn.length, users: usersToReturn.map(formatDevUserResponse) }));
          }
          if (method === 'POST') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'user.manage');
            if (permErr) return sendDevError(res, permErr);

            return readBody(async (body) => {
              const u = body.user || body;
              if (u.role === 'super_admin' && authResult.auth!.role !== 'super_admin') {
                return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Only Super Administrator can create a Super Admin account.' } });
              }
              if (authResult.auth!.role !== 'super_admin' && (detectPrivilegeEscalationAttempt(body) || u.role !== undefined || u.permissions || u.permissions_json)) {
                return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Only Super Administrator can configure account roles or permissions.' } });
              }
              const { password: rawPassword, ...restUser } = u;
              const newU = { id: u.id || `user-${Date.now()}`, ...restUser, createdAt: new Date().toISOString() };
              if (rawPassword && String(rawPassword).trim() && newU.email) {
                const hashed = await hashPassword(String(rawPassword).trim());
                devUserPasswordHashes.set(String(newU.email).toLowerCase().trim(), hashed);
              }
              devUsers.push(newU);
              res.statusCode = 201;
              return res.end(JSON.stringify({ success: true, user: formatDevUserResponse(newU) }));
            });
          }
        }

        const devUserMatch = url.pathname.match(/^\/api\/(?:admin\/)?users\/([^/]+)\/?$/);
        if (devUserMatch) {
          const usrId = decodeURIComponent(devUserMatch[1]);
          if (method === 'PUT' || method === 'PATCH') {
            const authResult = requireDevAuth(req);
            if (authResult.error) return sendDevError(res, authResult.error);

            return readBody(async (body) => {
              const isSelf = authResult.auth!.user.id === usrId;
              const updates = body.updates || body.user || body || {};

              const hasDirectRole = Object.prototype.hasOwnProperty.call(body || {}, 'role');
              const hasDirectPerm = Object.prototype.hasOwnProperty.call(body || {}, 'permissions');

              if (authResult.auth!.role !== 'super_admin' && (hasDirectRole || hasDirectPerm || detectPrivilegeEscalationAttempt(body))) {
                return sendDevError(res, {
                  status: 403,
                  body: { success: false, error: 'Forbidden: Only Super Administrator can modify account roles or permissions.' },
                });
              }

              if (isSelf && authResult.auth!.role !== 'super_admin') {
                delete updates.role;
                delete updates.permissions;
                delete updates.permissions_json;
              }

              // Strict Privilege Escalation Protection:
              // Non-super_admin accounts can NEVER modify roles or permissions for any account.
              if (authResult.auth!.role !== 'super_admin') {
                const hasRoleField = updates.role !== undefined || body.role !== undefined;
                const hasPermissionField =
                  updates.permissions !== undefined ||
                  body.permissions !== undefined ||
                  updates.permissions_json !== undefined ||
                  body.permissions_json !== undefined;

                if (hasRoleField || hasPermissionField || detectPrivilegeEscalationAttempt(body) || detectPrivilegeEscalationAttempt(updates)) {
                  return sendDevError(res, {
                    status: 403,
                    body: { success: false, error: 'Forbidden: Only Super Administrator can modify account roles or permissions.' },
                  });
                }
              }

              if (!isSelf && authResult.auth!.role !== 'super_admin') {
                const permErr = requireDevPermission(authResult, 'user.manage');
                if (permErr) return sendDevError(res, permErr);
              }

              const idx = devUsers.findIndex((u) => u.id === usrId);
              if (idx < 0) {
                res.statusCode = 404;
                return res.end(JSON.stringify({ success: false, error: 'User not found' }));
              }
              const targetUser = devUsers[idx];
              const isTargetSuper = targetUser.role === 'super_admin' || devSuperAdminEmails.includes(targetUser.email?.toLowerCase());
              if (isTargetSuper && authResult.auth!.role !== 'super_admin') {
                return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Super Administrator account cannot be modified by other users.' } });
              }

              // Privilege escalation & tamper protection: Normal Admin/Sub Admin can NEVER modify another Admin/Sub Admin
              if (!isSelf && targetUser.role !== 'customer' && authResult.auth!.role !== 'super_admin') {
                return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Only Super Administrator can modify administrative accounts.' } });
              }

              delete updates.id;
              delete updates.createdAt;
              delete updates.updatedAt;

              if (isTargetSuper && updates.role && updates.role !== 'super_admin') {
                return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Super Administrator role cannot be modified.' } });
              }

              const isChangingEmail = Boolean(updates.email && updates.email.toLowerCase().trim() !== targetUser.email.toLowerCase().trim());
              const isChangingPassword = Boolean(updates.password && String(updates.password).trim());

              // Security Control: Self-service password or email modification strictly requires current password verification
              if (isSelf && (isChangingEmail || isChangingPassword)) {
                const currentPassword = String(body.currentPassword || body.current_password || body.oldPassword || '').trim();
                if (!currentPassword) {
                  return sendDevError(res, { status: 400, body: { success: false, error: 'Current password confirmation is required to change your email or password.' } });
                }
                const storedHash = devUserPasswordHashes.get(targetUser.email.toLowerCase());
                if (!storedHash) {
                  return sendDevError(res, { status: 400, body: { success: false, error: 'Unable to verify credentials.' } });
                }
                const isMatch = await verifyPassword(currentPassword, storedHash);
                if (!isMatch) {
                  return sendDevError(res, { status: 400, body: { success: false, error: 'Current password does not match. Please verify and try again.' } });
                }
              }

              if (isChangingPassword) {
                const plainPw = String(updates.password).trim();
                if (plainPw.length < 6) {
                  return sendDevError(res, { status: 400, body: { success: false, error: 'New password must be at least 6 characters long.' } });
                }
                const newHashed = await hashPassword(plainPw);
                delete updates.password; // NEVER store plaintext!
                devUserPasswordHashes.set(targetUser.email.toLowerCase(), newHashed);
              }

              if (isChangingEmail) {
                const cleanEmail = String(updates.email).toLowerCase().trim();
                if (!cleanEmail || !cleanEmail.includes('@') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
                  return sendDevError(res, { status: 400, body: { success: false, error: 'Please enter a valid email address.' } });
                }
                const emailExists = devUsers.some((u) => u.id !== usrId && u.email?.toLowerCase().trim() === cleanEmail);
                if (emailExists) {
                  return sendDevError(res, { status: 400, body: { success: false, error: 'This email address is already in use by another account.' } });
                }
                // Migrate password hash to new email
                const existingHash = devUserPasswordHashes.get(targetUser.email.toLowerCase());
                if (existingHash) {
                  devUserPasswordHashes.set(cleanEmail, existingHash);
                  devUserPasswordHashes.delete(targetUser.email.toLowerCase());
                }
                updates.email = cleanEmail;
              }

              if (updates.role === 'super_admin' && authResult.auth!.role !== 'super_admin') {
                return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Cannot promote account to Super Administrator.' } });
              }
              if (updates.role === 'customer') {
                delete devUsers[idx].permissions;
                delete devUsers[idx].permissions_json;
                delete updates.permissions;
                delete updates.permissions_json;
              }

              devUsers[idx] = {
                ...devUsers[idx],
                ...updates,
                ...(updates.role === 'customer' ? { permissions: undefined, permissions_json: null } : {}),
              };

              // If self updated password or email, issue fresh session token with updated pwdSig so session continues
              if (isSelf && (isChangingPassword || isChangingEmail)) {
                const freshHash = devUserPasswordHashes.get(devUsers[idx].email.toLowerCase());
                const freshSig = freshHash ? computeDevPasswordSig(freshHash) : '';
                const isPrivileged = isDevAdminRole(devUsers[idx].role);
                const now = Math.floor(Date.now() / 1000);
                const sessionDuration = isPrivileged ? ADMIN_SESSION_IDLE_TIMEOUT_SECONDS : CUSTOMER_SESSION_EXPIRATION_SECONDS;
                const freshToken = signDevSessionToken({
                  userId: devUsers[idx].id,
                  email: devUsers[idx].email,
                  role: devUsers[idx].role,
                  pwdSig: freshSig,
                  ...(isPrivileged ? { authTime: now, lastActivity: now } : {}),
                }, sessionDuration);
                res.setHeader('Set-Cookie', buildDevAuthCookie(freshToken, sessionDuration));
              }

              res.statusCode = 200;
              return res.end(JSON.stringify({ success: true, user: formatDevUserResponse(devUsers[idx]) }));
            });
          }
          if (method === 'DELETE') {
            const authResult = requireDevAuth(req);
            if (authResult.error) return sendDevError(res, authResult.error);

            const targetUser = devUsers.find((u) => u.id === usrId || u.email?.toLowerCase() === usrId.toLowerCase());
            if (!targetUser) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ success: false, error: 'User account not found in database.' }));
            }
            if (targetUser.role === 'super_admin' || devSuperAdminEmails.includes(targetUser.email?.toLowerCase())) {
              return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Super Administrator accounts cannot be deleted.' } });
            }

            if (authResult.auth!.user.id === targetUser.id || authResult.auth!.user.email?.toLowerCase().trim() === targetUser.email.toLowerCase().trim()) {
              return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: You cannot delete your own logged-in account.' } });
            }

            if (targetUser.role !== 'customer' && authResult.auth!.role !== 'super_admin') {
              return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Only a Super Administrator can delete administrative accounts.' } });
            }

            if (targetUser.role === 'customer') {
              const canDeleteCust = authResult.auth!.role === 'super_admin' || hasDevPermission(authResult.auth!, 'customer.delete') || hasDevPermission(authResult.auth!, 'user.delete');
              if (!canDeleteCust) {
                return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Insufficient permissions to delete customer accounts.' } });
              }
            }

            devUsers = devUsers.filter((u) => u.id !== targetUser.id && u.email?.toLowerCase() !== targetUser.email?.toLowerCase());
            devUserPasswordHashes.delete(targetUser.email.toLowerCase());

            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, message: `Account for ${targetUser.email} has been permanently deleted.` }));
          }
        }

        const devUserResetMatch = url.pathname.match(/^\/api\/(?:admin\/)?users\/([^/]+)\/reset-password\/?$/);
        if (devUserResetMatch && method === 'POST') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);

          const targetId = decodeURIComponent(devUserResetMatch[1]);
          const targetUser = devUsers.find((u) => u.id === targetId || u.email.toLowerCase() === targetId.toLowerCase());
          if (!targetUser) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ success: false, error: 'User not found' }));
          }

          const isTargetSuper = targetUser.role === 'super_admin' || devSuperAdminEmails.includes(targetUser.email?.toLowerCase());
          if (isTargetSuper) {
            const isSuperAdminRequester = authResult.auth!.role === 'super_admin';
            const isSelf = authResult.auth!.user.id === targetUser.id;
            if (!isSuperAdminRequester || !isSelf) {
              return sendDevError(res, {
                status: 403,
                body: { success: false, error: 'Forbidden: Only the authenticated Super Administrator can reset their own Super Admin password.' },
              });
            }
          } else {
            if (authResult.auth!.role === 'customer') {
              return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Customers cannot reset user passwords.' } });
            }

            const isSelf = authResult.auth!.user.id === targetUser.id;

            // Privilege protection: Non-super_admin can NEVER reset password for other administrative accounts (admin / sub_admin)
            if (!isSelf && targetUser.role !== 'customer' && authResult.auth!.role !== 'super_admin') {
              return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Only Super Administrator can reset administrative account passwords.' } });
            }

            const canManageUsers = hasDevPermission(authResult.auth!, 'user.manage');
            const canManageCust = targetUser.role === 'customer' && (hasDevPermission(authResult.auth!, 'customer.manage') || hasDevPermission(authResult.auth!, 'user.manage'));

            if (!isSelf && !canManageUsers && !canManageCust) {
              return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Insufficient permissions to reset this user password.' } });
            }
          }

          return readBody(async (body) => {
            const newPassword = (body.newPassword || body.password || '').trim();
            if (!newPassword || newPassword.length < 6) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, error: 'New password must be at least 6 characters long.' }));
            }

            const newHashed = await hashPassword(newPassword);
            devUserPasswordHashes.set(targetUser.email.toLowerCase(), newHashed);
            if (isTargetSuper) {
              devSuperAdminEmails.forEach((email) => {
                devUserPasswordHashes.set(email, newHashed);
              });
              devUserPasswordHashes.set('admin', newHashed);
              devUserPasswordHashes.set('superadmin', newHashed);
            }

            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              message: `Password for ${targetUser.email} has been reset successfully.`,
            }));
          });
        }

        // 8. ORDERS
        if (url.pathname === '/api/orders' && method === 'GET') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);

          const canView = authResult.auth!.role === 'super_admin' || hasDevPermission(authResult.auth!, 'order.view') || hasDevPermission(authResult.auth!, 'order.manage');
          if (!canView) {
            return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Insufficient permissions to view orders.', requiredPermission: 'order.view' } });
          }

          const isSuper = authResult.auth!.role === 'super_admin';
          const canViewBuyingPrice = isSuper || hasDevPermission(authResult.auth!, 'product.view_buying_price');
          const canViewProfit = isSuper || hasDevPermission(authResult.auth!, 'report.profit') || hasDevPermission(authResult.auth!, 'product.view_profit');

          // Parse and strictly clamp pagination parameters (Default: 25, Max: 100)
          const rawPage = parseInt(url.searchParams.get('page') || '1', 10);
          const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

          const rawLimit = parseInt(url.searchParams.get('limit') || '25', 10);
          const limit =
            Number.isFinite(rawLimit) && rawLimit >= 1
              ? Math.min(100, Math.floor(rawLimit))
              : 25;

          const rawStatus = (url.searchParams.get('status') || '').trim();
          const rawPayment = (url.searchParams.get('payment') || '').trim();
          const rawSearch = (url.searchParams.get('search') || '').trim().toLowerCase();
          const rawSort = (url.searchParams.get('sortBy') || url.searchParams.get('sort') || 'newest').trim().toLowerCase();

          const matchStatusType = (o: any) => {
            const ship = String(o.shippingStatus || (o as any).status || '').toLowerCase();
            const cour = String(o.courierStatus || '').toLowerCase();
            return {
              isPending: ship === 'pending' || ship === 'processing' || cour.includes('pending') || cour.includes('pickup'),
              isProcessing: ship === 'processing',
              isShipped: ship === 'shipped' || cour.includes('ship') || cour.includes('transit'),
              isDelivered: ship === 'delivered' || cour.includes('deliver'),
              isCancelled: ship === 'cancelled' || cour.includes('cancel') || cour.includes('return'),
            };
          };

          // Compute overall summary stats before filtering
          let pendingCount = 0;
          let shippedCount = 0;
          let deliveredCount = 0;
          let cancelledCount = 0;
          let unverifiedDbblCount = 0;
          let totalRevenue = 0;
          let totalDeliveryValue = 0;
          let cancelledOrdersValue = 0;
          let cancelledProductsValue = 0;

          for (const ord of devOrders) {
            const st = matchStatusType(ord);
            if (st.isPending) pendingCount++;
            if (st.isShipped) shippedCount++;
            if (st.isDelivered) deliveredCount++;
            if (st.isCancelled) {
              cancelledCount++;
              cancelledOrdersValue += Number(ord.totalAmount) || 0;
              const itemsVal = Array.isArray(ord.items) && ord.items.length > 0
                ? ord.items.reduce((s: number, it: any) => s + ((Number(it.product?.price) || 0) * (Number(it.quantity) || 1)), 0)
                : (Number(ord.subtotal) || Math.max(0, (Number(ord.totalAmount) || 0) - (Number(ord.deliveryFee) || 0)));
              cancelledProductsValue += itemsVal;
            }
            if (String(ord.paymentMethod || '').toLowerCase() === 'dbbl' && String(ord.paymentStatus || '').toUpperCase() !== 'PAID') {
              unverifiedDbblCount++;
            }
            totalRevenue += Number(ord.totalAmount) || 0;
            totalDeliveryValue += Number(ord.deliveryFee) || 0;
          }

          // Server-side filtering
          const filtered = devOrders.filter((ord) => {
            if (rawStatus && rawStatus.toLowerCase() !== 'all') {
              const sk = rawStatus.toLowerCase();
              const st = matchStatusType(ord);
              if (sk === 'pending' && !st.isPending) return false;
              else if (sk === 'processing' && !st.isProcessing) return false;
              else if (sk === 'shipped' && !st.isShipped) return false;
              else if (sk === 'delivered' && !st.isDelivered) return false;
              else if (sk === 'cancelled' && !st.isCancelled) return false;
              else if (!['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(sk)) {
                if (String(ord.shippingStatus || '').toLowerCase() !== sk) return false;
              }
            }

            if (rawPayment && rawPayment.toLowerCase() !== 'all') {
              const isPaid = String(ord.paymentStatus || '').toUpperCase() === 'PAID';
              const pMethod = String(ord.paymentMethod || '').toLowerCase();
              if (rawPayment.toUpperCase() === 'PAID' && !isPaid) return false;
              if (rawPayment.toUpperCase() === 'DUE' && isPaid) return false;
              if (rawPayment.toLowerCase() === 'dbbl' && pMethod !== 'dbbl') return false;
              if (rawPayment.toLowerCase() === 'cod' && pMethod !== 'cod') return false;
            }

            if (rawSearch) {
              const numMatch = String(ord.orderNumber || '').toLowerCase().includes(rawSearch);
              const nameMatch = String(ord.customer?.fullName || '').toLowerCase().includes(rawSearch);
              const phoneMatch = String(ord.customer?.phone || '').toLowerCase().includes(rawSearch);
              const addrMatch = String(ord.customer?.fullAddress || '').toLowerCase().includes(rawSearch);
              const distMatch = String(ord.customer?.district || '').toLowerCase().includes(rawSearch);
              const trxMatch = String(ord.transactionId || ord.dbblDetails?.transactionId || '').toLowerCase().includes(rawSearch);
              const waybillMatch = String(ord.courierWaybill || ord.courierBooking?.waybillId || '').toLowerCase().includes(rawSearch);
              const cidMatch = String(ord.consignmentId || ord.courierBooking?.consignmentId || '').toLowerCase().includes(rawSearch);
              if (!numMatch && !nameMatch && !phoneMatch && !addrMatch && !distMatch && !trxMatch && !waybillMatch && !cidMatch) {
                return false;
              }
            }

            return true;
          });

          // Server-side sorting
          filtered.sort((a, b) => {
            if (rawSort === 'oldest' || rawSort === 'date-asc' || rawSort === 'created_asc') {
              return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
            }
            if (rawSort === 'amount-desc' || rawSort === 'total-desc') {
              const diff = (Number(b.totalAmount) || 0) - (Number(a.totalAmount) || 0);
              return diff !== 0 ? diff : new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            }
            if (rawSort === 'amount-asc' || rawSort === 'total-asc') {
              const diff = (Number(a.totalAmount) || 0) - (Number(b.totalAmount) || 0);
              return diff !== 0 ? diff : new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            }
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          });

          const total = filtered.length;
          const totalPages = Math.max(1, Math.ceil(total / limit));
          const offset = (page - 1) * limit;
          const pagedOrders = filtered
            .slice(offset, offset + limit)
            .map((o) => sanitizeDevOrder(o, { isSuperAdmin: isSuper, canViewBuyingPrice, canViewProfit }));

          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            count: pagedOrders.length,
            total,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            summary: {
              totalAll: devOrders.length,
              pendingCount,
              shippedCount,
              deliveredCount,
              cancelledCount,
              unverifiedDbblCount,
              totalRevenue,
              totalDeliveryValue,
              cancelledOrdersValue,
              cancelledProductsValue,
            },
            orders: pagedOrders,
          }));
        }

        if (url.pathname === '/api/orders' && method === 'POST') {
          return readBody((body) => {
            try {
              const rawOrder = body.order || body;

              if (!rawOrder?.customer?.fullName || !rawOrder?.customer?.phone || !rawOrder?.customer?.fullAddress) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'Customer full name, phone number, and delivery address are required.' }));
              }

              const cleanPhone = (rawOrder.customer?.phone || '').replace(/\D/g, '');
              if (cleanPhone.length < 11) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'A valid 11-digit Bangladeshi contact phone number is required.' }));
              }

              if (!Array.isArray(rawOrder.items) || rawOrder.items.length === 0) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'Order must contain at least one item.' }));
              }

              // Authoritative server-side cost and gross profit calculation
              let totalCost = 0;
              const verifiedItems = rawOrder.items.map((it: any) => {
                const prodId = it.product?.id || it.productId || it.id;
                const prod = devProducts.find((p) => p.id === prodId);
                const qty = Number(it.quantity) || 1;
                const buyingPrice = prod?.buyingPrice != null ? Number(prod.buyingPrice) : Math.round((Number(prod?.price || it.product?.price || it.price || 0) * 0.6));
                const sellingPrice = Number(prod?.price || it.product?.price || it.price || 0);
                const itemCost = buyingPrice * qty;
                const itemRev = sellingPrice * qty;
                const itemGrossProfit = itemRev - itemCost;
                totalCost += itemCost;
                return {
                  ...it,
                  quantity: qty,
                  buyingPriceSnapshot: buyingPrice,
                  sellingPriceSnapshot: sellingPrice,
                  productCost: itemCost,
                  productGrossProfit: itemGrossProfit,
                  product: prod ? { ...prod, buyingPrice: undefined, unitProfit: undefined } : (it.product || { id: prodId, title: it.title, price: sellingPrice }),
                };
              });

              const totalGrossProfit = Math.max(0, (Number(rawOrder.subtotal) || 0) - totalCost);

              // Anti-Spam check
              if (devSettings.blockedPhoneNumbers && Array.isArray(devSettings.blockedPhoneNumbers)) {
                const isBlocked = devSettings.blockedPhoneNumbers.some((p: string) => {
                  const cleanP = (p || '').replace(/\D/g, '');
                  return cleanP && (cleanPhone === cleanP || cleanPhone.endsWith(cleanP));
                });
                if (isBlocked) {
                  res.statusCode = 403;
                  return res.end(JSON.stringify({ success: false, error: 'Order submission restricted for this contact number.' }));
                }
              }

              const idempotencyKey = ((req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || rawOrder.idempotencyKey || '') as string).trim();
              if (idempotencyKey) {
                const cached = devOrderIdempotencyMap.get(idempotencyKey);
                if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
                  res.statusCode = 200;
                  return res.end(JSON.stringify({ success: true, order: sanitizeDevOrder(cached.order, false), idempotent: true }));
                }
              }

              const clientIp = getDevClientIp(req);
              const timeOffsetMs = Number(req.headers['x-test-timestamp-offset']) || 0;
              const orderRateCheck = checkAndConsumeOrderRateLimitDev(clientIp, 4, 600, timeOffsetMs);
              if (!orderRateCheck.allowed) {
                res.statusCode = 429;
                res.setHeader('Retry-After', String(orderRateCheck.remainingSeconds || 600));
                return res.end(
                  JSON.stringify({
                    success: false,
                    error: 'Too many orders. Please try again later.',
                  })
                );
              }

              // Verify stock availability for all items before placing order
              for (const it of verifiedItems) {
                const prodId = it.product?.id || it.productId || it.id;
                const prod = devProducts.find((p) => p.id === prodId);
                if (!prod) {
                  rollbackOrderRateLimitDev(clientIp);
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ success: false, error: `Product "${it.product?.title || it.title || prodId}" not found.` }));
                }
                if (prod.stock < it.quantity) {
                  rollbackOrderRateLimitDev(clientIp);
                  res.statusCode = 400;
                  return res.end(
                    JSON.stringify({
                      success: false,
                      error: `One or more items in your cart sold out during checkout. Insufficient stock for "${prod.title}".`,
                    })
                  );
                }
              }

              const freshOrderId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
              const freshOrderNum = `RT-${new Date().getFullYear()}-${10000000 + Math.floor(Math.random() * 90000000)}`;

              // Force initial payment & shipping status: prevent client spoofing
              const paymentMethod = rawOrder.paymentMethod === 'dbbl' ? 'dbbl' : 'COD';
              const paymentStatus = paymentMethod === 'dbbl' ? 'Unverified' : 'Pending';
              const shippingStatus = 'Pending';

              const order = {
                ...rawOrder,
                id: freshOrderId,
                orderNumber: freshOrderNum,
                items: verifiedItems,
                paymentMethod,
                paymentStatus,
                shippingStatus,
                totalCost,
                totalGrossProfit,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };

              // Deduct stock in devProducts atomically (all items guaranteed to have stock)
              for (const it of verifiedItems) {
                const prod = devProducts.find((p) => p.id === it.product?.id);
                if (prod) {
                  prod.stock = Math.max(0, prod.stock - it.quantity);
                }
              }

              devOrders.unshift(order);
              if (idempotencyKey) {
                devOrderIdempotencyMap.set(idempotencyKey, { order, timestamp: Date.now() });
              }

              res.statusCode = 201;
              return res.end(JSON.stringify({ success: true, order: sanitizeDevOrder(order, false), message: 'Order saved in dev memory store' }));
            } catch (err: any) {
              const clientIp = getDevClientIp(req);
              rollbackOrderRateLimitDev(clientIp);
              logDevServerError({
                route: '/api/orders',
                method: 'POST',
                error: err,
                extra: { clientIp },
              });
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
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: errMsg }));
              }
              res.statusCode = 500;
              return res.end(JSON.stringify({ success: false, error: 'Unable to place the order right now. Please try again.' }));
            }
          });
        }

        const match = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
        if (match) {
          const id = decodeURIComponent(match[1]);

          if (method === 'GET') {
            const authResult = requireDevAuth(req);
            const auth = authResult.auth;
            const isSuperAdmin = auth?.role === 'super_admin';
            const canViewStaff = Boolean(auth && (isSuperAdmin || hasDevPermission(auth, 'order.view') || hasDevPermission(auth, 'order.manage')));

            // 1. Authenticated admin access
            if (canViewStaff) {
              const found = devOrders.find((o) => o.id === id || o.orderNumber === id);
              if (!found) {
                res.statusCode = 404;
                return res.end(JSON.stringify({ success: false, error: 'Order not found' }));
              }
              const canViewBuyingPrice = Boolean(auth && (isSuperAdmin || hasDevPermission(auth, 'product.view_buying_price')));
              const canViewProfit = Boolean(auth && (isSuperAdmin || hasDevPermission(auth, 'report.profit') || hasDevPermission(auth, 'product.view_profit')));
              res.statusCode = 200;
              return res.end(JSON.stringify({ success: true, order: sanitizeDevOrder(found, { isSuperAdmin, canViewBuyingPrice, canViewProfit }) }));
            }

            // 2. Authenticated customer viewing own order
            if (auth && auth.user) {
              const found = devOrders.find((o) => o.id === id || o.orderNumber === id);
              if (
                found &&
                ((found.userId && auth.user.id === found.userId) ||
                  (found.userEmail && auth.user.email?.toLowerCase() === found.userEmail.toLowerCase()))
              ) {
                res.statusCode = 200;
                return res.end(JSON.stringify({ success: true, order: sanitizeDevOrder(found, false) }));
              }
            }

            // 3. Public order tracking with strict rate limiting and privacy controls
            const clientIp = getDevClientIp(req);
            const cdKey = `track_cd:${clientIp}`;
            const failKey = `track_fail:${clientIp}`;
            const volKey = `track_vol:${clientIp}`;
            const tgtKey = `track_ord:${id.toLowerCase()}`;

            // Cooldown check from repeated failures
            const cdEntry = devRateLimits.get(cdKey);
            if (cdEntry && cdEntry.resetAt > Date.now()) {
              const rem = Math.ceil((cdEntry.resetAt - Date.now()) / 1000);
              res.statusCode = 429;
              res.setHeader('Retry-After', String(rem));
              return res.end(JSON.stringify({
                success: false,
                error: `Too many failed tracking attempts. Please wait ${rem} seconds before trying again.`,
                isRateLimited: true,
                retryAfter: rem,
              }));
            }

            // General request volume check (both successful and failed lookups)
            if (!checkDevRateLimit(volKey, 15, 60)) {
              const volEntry = devRateLimits.get(volKey);
              const rem = volEntry ? Math.ceil((volEntry.resetAt - Date.now()) / 1000) : 60;
              res.statusCode = 429;
              res.setHeader('Retry-After', String(rem));
              return res.end(JSON.stringify({
                success: false,
                error: 'Too many tracking requests. Please slow down and try again later.',
                isRateLimited: true,
                retryAfter: rem,
              }));
            }

            // Verify required parameters (both order number AND phone number required)
            const verifyPhone = (url.searchParams.get('phone') || '').replace(/\D/g, '');
            if (!verifyPhone || verifyPhone.length < 11) {
              recordDevRateAttempt(volKey, 60);
              recordDevRateAttempt(failKey, 300);
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                error: 'Both Order Number and valid 11-digit contact number are required for order tracking.',
              }));
            }

            // Target order brute-force check
            if (!checkDevRateLimit(tgtKey, 10, 300)) {
              const tgtEntry = devRateLimits.get(tgtKey);
              const rem = tgtEntry ? Math.ceil((tgtEntry.resetAt - Date.now()) / 1000) : 300;
              res.statusCode = 429;
              res.setHeader('Retry-After', String(rem));
              return res.end(JSON.stringify({
                success: false,
                error: 'Too many lookup attempts for this order. Please try again later.',
                isRateLimited: true,
                retryAfter: rem,
              }));
            }

            // Record request attempt
            recordDevRateAttempt(volKey, 60);
            recordDevRateAttempt(tgtKey, 300);

            // Look up order in memory
            const found = devOrders.find((o) => o.id === id || o.orderNumber === id);
            const cleanOrderPhone = (found?.customer?.phone || '').replace(/\D/g, '');
            const isMatch = Boolean(found && cleanOrderPhone.length >= 11 && cleanOrderPhone.endsWith(verifyPhone.slice(-11)));

            if (!isMatch) {
              recordDevRateAttempt(failKey, 300);
              const failEntry = devRateLimits.get(failKey);
              if (failEntry && failEntry.count >= 5) {
                devRateLimits.set(cdKey, { count: 1, resetAt: Date.now() + 300 * 1000 });
              }
              // Anti-enumeration: exact same response whether order does not exist or phone is mismatched
              res.statusCode = 404;
              return res.end(JSON.stringify({
                success: false,
                error: 'Order not found or contact number does not match.',
              }));
            }

            // On success, clear consecutive failures
            devRateLimits.delete(failKey);

            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              order: sanitizeDevOrderForPublicTracking(found),
            }));
          }

          if (method === 'PATCH' || method === 'PUT') {
            const authResult = requireDevAuth(req);
            if (authResult.error) return sendDevError(res, authResult.error);

            return readBody((body) => {
              const isSuperRole = authResult.auth!.role === 'super_admin';
              const updates = body.updates || body;
              const updateKeys = Object.keys(updates);

              const isCancellation = (updates.orderStatus === 'Cancelled' || updates.shippingStatus === 'Cancelled') &&
                updateKeys.every((k) => ['orderStatus', 'shippingStatus', 'notes', 'cancellationReason', 'updatedAt'].includes(k));

              const isStatusOnly = updateKeys.every((k) =>
                ['shippingStatus', 'courierStatus', 'paymentStatus', 'courierWaybill', 'consignmentId', 'lastCourierSync', 'updatedAt'].includes(k)
              );

              if (isCancellation) {
                if (!hasDevPermission(authResult.auth!, 'order.cancel') && !hasDevPermission(authResult.auth!, 'order.manage') && !isSuperRole) {
                  return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Order cancellation permission required.', requiredPermission: 'order.cancel' } });
                }
              } else if (isStatusOnly) {
                if (!hasDevPermission(authResult.auth!, 'order.status_change') && !hasDevPermission(authResult.auth!, 'order.manage') && !isSuperRole) {
                  return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Order status change permission required.', requiredPermission: 'order.status_change' } });
                }
              } else {
                const permErr = requireDevPermission(authResult, 'order.manage');
                if (permErr) return sendDevError(res, permErr);
              }

              const idx = devOrders.findIndex((o) => o.id === id || o.orderNumber === id);
              if (idx >= 0) {
                const old = devOrders[idx];
                devOrders[idx] = { ...devOrders[idx], ...updates };

                // Handle stock restoration on cancellation
                if (updates.shippingStatus === 'Cancelled' && old.shippingStatus !== 'Cancelled') {
                  if (Array.isArray(old.items)) {
                    for (const it of old.items) {
                      if (it?.product?.id) {
                        const prod = devProducts.find((p) => p.id === it.product.id);
                        if (prod) prod.stock = prod.stock + it.quantity;
                      }
                    }
                  }
                }

                // Handle uncancelled (reactivating cancelled order)
                if (old.shippingStatus === 'Cancelled' && updates.shippingStatus && updates.shippingStatus !== 'Cancelled') {
                  if (Array.isArray(old.items)) {
                    for (const it of old.items) {
                      if (it?.product?.id) {
                        const prod = devProducts.find((p) => p.id === it.product.id);
                        if (prod) prod.stock = Math.max(0, prod.stock - it.quantity);
                      }
                    }
                  }
                }

                const canViewBuying = isSuperRole || hasDevPermission(authResult.auth!, 'product.view_buying_price');
                const canViewProf = isSuperRole || hasDevPermission(authResult.auth!, 'report.profit') || hasDevPermission(authResult.auth!, 'product.view_profit');

                res.statusCode = 200;
                return res.end(JSON.stringify({
                  success: true,
                  order: sanitizeDevOrder(devOrders[idx], { isSuperAdmin: isSuperRole, canViewBuyingPrice: canViewBuying, canViewProfit: canViewProf }),
                }));
              }
              res.statusCode = 404;
              return res.end(JSON.stringify({ success: false, error: 'Order not found' }));
            });
          }

          if (method === 'DELETE') {
            const authResult = requireDevAuth(req);
            const permErr = requireDevPermission(authResult, 'order.delete');
            if (permErr) return sendDevError(res, permErr);

            const target = devOrders.find((o) => o.id === id || o.orderNumber === id);
            if (target && target.shippingStatus !== 'Cancelled' && target.shippingStatus !== 'Delivered') {
              if (Array.isArray(target.items)) {
                for (const it of target.items) {
                  if (it?.product?.id) {
                    const prod = devProducts.find((p) => p.id === it.product.id);
                    if (prod) prod.stock = prod.stock + it.quantity;
                  }
                }
              }
            }
            devOrders = devOrders.filter((o) => o.id !== id && o.orderNumber !== id);
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, message: 'Order deleted' }));
          }
        }

        // 9. MEDIA UPLOAD (DEV MODE)
        if (url.pathname === '/api/upload' && method === 'POST') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          if (authResult.auth?.role === 'customer') {
            res.statusCode = 403;
            return res.end(JSON.stringify({ success: false, error: 'Forbidden: Customers cannot upload media.' }));
          }

          // Per-user upload rate limit (server-verified identity)
          const userId = authResult.auth?.user?.id || authResult.auth?.user?.email || 'dev-user';
          const burstKey = `upload_burst:user:${userId}`;
          const hourKey = `upload_hour:user:${userId}`;

          if (!checkDevRateLimit(burstKey, 10, 60)) {
            const entry = devRateLimits.get(burstKey);
            const retrySecs = entry ? Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000)) : 60;
            res.statusCode = 429;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Retry-After', String(retrySecs));
            res.setHeader('X-RateLimit-Limit', '10');
            res.setHeader('X-RateLimit-Remaining', '0');
            return res.end(JSON.stringify({
              success: false,
              error: 'Upload rate limit exceeded. Please wait a moment before uploading more images.',
              retryAfter: retrySecs,
            }));
          }

          if (!checkDevRateLimit(hourKey, 60, 3600)) {
            const entry = devRateLimits.get(hourKey);
            const retrySecs = entry ? Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000)) : 3600;
            res.statusCode = 429;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Retry-After', String(retrySecs));
            res.setHeader('X-RateLimit-Limit', '60');
            res.setHeader('X-RateLimit-Remaining', '0');
            return res.end(JSON.stringify({
              success: false,
              error: 'Hourly upload limit reached. Please wait before uploading more images.',
              retryAfter: retrySecs,
            }));
          }

          const contentLength = parseInt((req.headers['content-length'] || '0') as string, 10);
          if (contentLength > MAX_IMAGE_SIZE_BYTES) {
            res.statusCode = 413;
            return res.end(JSON.stringify({ success: false, error: 'File size exceeds maximum allowed 10MB limit.' }));
          }

          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          return req.on('end', async () => {
            try {
              const fullBuffer = Buffer.concat(chunks);
              const contentType = req.headers['content-type'] || '';
              let fileBuffer = fullBuffer;

              if (contentType.includes('application/json')) {
                let parsed: any;
                try {
                  parsed = JSON.parse(fullBuffer.toString('utf-8'));
                } catch {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({
                    success: false,
                    error: 'Malformed JSON payload. Please provide valid JSON.',
                  }));
                }
                const dataUrl = parsed?.dataUrl || parsed?.image || parsed?.url;
                if (!dataUrl || typeof dataUrl !== 'string') {
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ success: false, error: 'Expected dataUrl in JSON body' }));
                }
                const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (matches) {
                  fileBuffer = Buffer.from(matches[2], 'base64');
                } else {
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ success: false, error: 'Invalid data URL format' }));
                }
              } else if (contentType.includes('multipart/form-data')) {
                const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
                const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : null;
                if (boundary) {
                  const boundaryBuf = Buffer.from(`--${boundary}`);
                  const headerEndBuf = Buffer.from('\r\n\r\n');
                  const headerIdx = fullBuffer.indexOf(headerEndBuf);
                  if (headerIdx !== -1) {
                    const endIdx = fullBuffer.lastIndexOf(boundaryBuf);
                    if (endIdx > headerIdx + 4) {
                      fileBuffer = fullBuffer.subarray(headerIdx + 4, endIdx - 2);
                    } else {
                      fileBuffer = fullBuffer.subarray(headerIdx + 4);
                    }
                  }
                }
              }

              if (!fileBuffer || fileBuffer.length === 0) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'File is empty' }));
              }

              // Validate authoritative magic bytes and content integrity
              const validation = validateImageBuffer(fileBuffer);
              if (!validation.valid || !validation.mime || !validation.extension) {
                recordDevRateAttempt(burstKey, 60);
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: false,
                  error: validation.error || 'Invalid or unsupported image file.',
                }));
              }

              const verifiedMime = validation.mime;
              const key = generateSafeMediaKey(validation.extension);
              devMedia.set(key, { buffer: fileBuffer, contentType: verifiedMime });

              // Pre-generate standard responsive variants (240, 360, 480, 720, 1080)
              try {
                const sharpModule = await import('sharp');
                const sharp = (sharpModule as any).default || sharpModule;
                const baseKeyWithoutExt = key.replace(/\.[^.]+$/, '');
                const standardWidths = [240, 360, 480, 720, 1080];
                for (const w of standardWidths) {
                  const webpBuf = await sharp(fileBuffer).resize(w, null, { withoutEnlargement: true, fit: 'inside' }).webp({ quality: 82 }).toBuffer();
                  devMedia.set(`${baseKeyWithoutExt}_w${w}.webp`, { buffer: webpBuf, contentType: 'image/webp' });
                }
              } catch (e) {
                console.warn('Dev variant pre-generation error:', e);
              }

              // Record successful upload in per-user rate limiters
              recordDevRateAttempt(burstKey, 60);
              recordDevRateAttempt(hourKey, 3600);

              const mediaUrl = `/api/media/${key}`;
              res.statusCode = 200;
              return res.end(JSON.stringify({
                success: true,
                url: mediaUrl,
                key,
                size: fileBuffer.length,
                contentType: verifiedMime,
                format: validation.format,
              }));
            } catch (err: any) {
              console.error('Upload error:', err);
              res.statusCode = 500;
              return res.end(JSON.stringify({ success: false, error: 'Internal server error.' }));
            }
          });
        }

        const mediaMatch = url.pathname.match(/^\/api\/media\/([^/]+)$/);
        if (mediaMatch && method === 'GET') {
          const rawKey = decodeURIComponent(mediaMatch[1]);
          if (!isValidMediaKey(rawKey)) {
            res.statusCode = 400;
            return res.end('Invalid media asset key');
          }
          const key = rawKey;
          const widthParam = url.searchParams.get('w') || url.searchParams.get('width');
          const targetWidth = widthParam ? parseInt(widthParam, 10) : null;
          const qualityParam = url.searchParams.get('q') || url.searchParams.get('quality');
          const targetQuality = qualityParam ? Math.min(Math.max(parseInt(qualityParam, 10), 50), 95) : 82;

          // 1. Fast path: check for pre-generated variant in devMedia
          const baseKeyWithoutExt = key.replace(/\.[^.]+$/, '');
          const standardWidths = [240, 360, 480, 720, 1080];
          const matchedWidth = targetWidth
            ? (standardWidths.find((sw) => sw >= targetWidth) || 1080)
            : null;

          if (targetWidth && targetWidth > 0) {
            const candidateKeys = Array.from(new Set([
              `${baseKeyWithoutExt}_w${targetWidth}.webp`,
              ...(matchedWidth ? [`${baseKeyWithoutExt}_w${matchedWidth}.webp`] : []),
              ...standardWidths
                .slice()
                .sort((a, b) => Math.abs(a - targetWidth) - Math.abs(b - targetWidth))
                .map((w) => `${baseKeyWithoutExt}_w${w}.webp`),
            ]));

            for (const varKey of candidateKeys) {
              const variantItem = devMedia.get(varKey);
              if (variantItem) {
                const headers = getSafeMediaHeaders('image/webp');
                for (const [hName, hVal] of Object.entries(headers)) {
                  res.setHeader(hName, hVal);
                }
                res.setHeader('Content-Length', String(variantItem.buffer.length));
                res.statusCode = 200;
                return res.end(variantItem.buffer);
              }
            }
          }

          const item = devMedia.get(key);
          if (item) {
            if (targetWidth && targetWidth > 0 && targetWidth <= 2400) {
              try {
                const sharpModule = await import('sharp');
                const sharp = (sharpModule as any).default || sharpModule;
                const accept = (req.headers['accept'] || '') as string;
                const wantsWebp = accept.includes('image/webp') || item.contentType !== 'image/gif';

                const effectiveWidth = matchedWidth || targetWidth;
                let pipeline = sharp(item.buffer).resize(effectiveWidth, null, {
                  withoutEnlargement: true,
                  fit: 'inside',
                });

                if (wantsWebp) {
                  const webpBuffer = await pipeline.webp({ quality: targetQuality }).toBuffer();
                  devMedia.set(`${baseKeyWithoutExt}_w${effectiveWidth}.webp`, { buffer: webpBuffer, contentType: 'image/webp' });
                  const headers = getSafeMediaHeaders('image/webp');
                  for (const [hName, hVal] of Object.entries(headers)) {
                    res.setHeader(hName, hVal);
                  }
                  res.setHeader('Content-Length', String(webpBuffer.length));
                  res.statusCode = 200;
                  return res.end(webpBuffer);
                } else {
                  const resizedBuffer = await pipeline.toBuffer();
                  const headers = getSafeMediaHeaders(item.contentType);
                  for (const [hName, hVal] of Object.entries(headers)) {
                    res.setHeader(hName, hVal);
                  }
                  res.setHeader('Content-Length', String(resizedBuffer.length));
                  res.statusCode = 200;
                  return res.end(resizedBuffer);
                }
              } catch (resizeErr) {
                console.warn('Dev image resizing fallback to original:', resizeErr);
              }
            }

            const headers = getSafeMediaHeaders(item.contentType);
            for (const [hName, hVal] of Object.entries(headers)) {
              res.setHeader(hName, hVal);
            }
            res.statusCode = 200;
            return res.end(item.buffer);
          }
          res.statusCode = 404;
          return res.end('Media asset not found');
        }

        // Courier endpoints in dev
        if (url.pathname === '/api/admin/courier/credentials/status' && method === 'GET') {
          const authResult = requireDevAuth(req);
          const permErr = requireDevPermission(authResult, 'courier.configure');
          if (permErr) return sendDevError(res, permErr);

          const hasWorkerApiKey = Boolean(process.env.STEADFAST_API_KEY && process.env.STEADFAST_API_KEY.trim().length > 0);
          const hasWorkerSecretKey = Boolean(process.env.STEADFAST_SECRET_KEY && process.env.STEADFAST_SECRET_KEY.trim().length > 0);
          const hasWorkerWebhookSecret = Boolean(process.env.COURIER_WEBHOOK_SECRET && process.env.COURIER_WEBHOOK_SECRET.trim().length > 0);
          const hasLegacyApiKey = Boolean(devSettings.steadfastApiKey && devSettings.steadfastApiKey.trim().length > 0);
          const hasLegacySecretKey = Boolean(devSettings.steadfastSecretKey && devSettings.steadfastSecretKey.trim().length > 0);

          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            workerSecretsConfigured: {
              apiKey: hasWorkerApiKey,
              secretKey: hasWorkerSecretKey,
              webhookSecret: hasWorkerWebhookSecret,
            },
            legacyD1Credentials: {
              detected: hasLegacyApiKey || hasLegacySecretKey,
              hasApiKey: hasLegacyApiKey,
              hasSecretKey: hasLegacySecretKey,
            },
            migrationSafe: hasWorkerApiKey && hasWorkerSecretKey,
            instructions: 'Configure Cloudflare Worker Secrets: npx wrangler secret put STEADFAST_API_KEY and npx wrangler secret put STEADFAST_SECRET_KEY. Then trigger cleanup via POST /api/admin/courier/cleanup-legacy-credentials.',
          }));
        }

        if (url.pathname === '/api/admin/courier/cleanup-legacy-credentials' && method === 'POST') {
          const authResult = requireDevAuth(req);
          const permErr = requireDevPermission(authResult, 'settings.manage');
          if (permErr) return sendDevError(res, permErr);

          delete devSettings.steadfastApiKey;
          delete devSettings.steadfastSecretKey;

          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            cleaned: true,
            message: 'Legacy courier credentials were safely removed from settings.',
          }));
        }

        if (url.pathname === '/api/courier/steadfast/test' && method === 'POST') {
          const authResult = requireDevAuth(req);
          const permErr = requireDevPermission(authResult, 'courier.configure');
          if (permErr) return sendDevError(res, permErr);

          return readBody(async (body) => {
            const apiKey = (body?.apiKey || process.env.STEADFAST_API_KEY || '').trim();
            const secretKey = (body?.secretKey || process.env.STEADFAST_SECRET_KEY || '').trim();
            const baseUrl = body?.baseUrl;

            if (apiKey && secretKey) {
              try {
                const callResult = await callSteadfastApi('get_balance', { apiKey, secretKey, baseUrl });
                const sfData = callResult.data || {};

                if (callResult.ok && (sfData.status === 200 || sfData.current_balance !== undefined || sfData.balance !== undefined)) {
                  res.statusCode = 200;
                  return res.end(JSON.stringify({
                    success: true,
                    message: 'Connected successfully to Steadfast Courier API! (200 OK)',
                    current_balance: sfData.current_balance ?? sfData.balance ?? 0,
                    data: sfData,
                  }));
                }
                res.statusCode = 400;
                return res.end(JSON.stringify({
                  success: false,
                  error: callResult.error || sfData.message || 'Failed to connect to Steadfast API',
                  data: sfData,
                }));
              } catch (e: any) {
                console.error('Steadfast test error:', e);
                res.statusCode = 500;
                return res.end(JSON.stringify({ success: false, error: 'Internal server error.' }));
              }
            }

            res.statusCode = 400;
            return res.end(JSON.stringify({
              success: false,
              error: 'Steadfast Courier API credentials are not configured in Worker secrets or provided in request.',
            }));
          });
        }

        if (url.pathname === '/api/courier/dispatch' && method === 'POST') {
          const authResult = requireDevAuth(req);
          const permErr = requireDevPermission(authResult, 'courier.booking');
          if (permErr) return sendDevError(res, permErr);

          return readBody(async (body) => {
            const courierParam = body?.courier || {};
            const courierCode = String(courierParam.code || courierParam.name || body?.courierCode || body?.parcelData?.courier || 'Steadfast').toLowerCase();
            const isSteadfast = courierCode.includes('steadfast');
            const courierName = courierParam.name || (isSteadfast ? 'Steadfast Courier' : (courierParam.code || 'Courier'));

            const order = body?.order;
            if (!order || (!order.id && !order.orderNumber)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ success: false, error: 'Order details are required for courier dispatch.' }));
            }

            const parcelData = body?.parcelData || {};
            const rawAddress = (parcelData.recipient_address || order.customer?.fullAddress || '').trim();
            const rawArea = (parcelData.area || '').trim();
            const rawDistrict = (parcelData.district || order.customer?.district || '').trim();
            const addressParts: string[] = [rawAddress];
            if (rawArea && !rawAddress.toLowerCase().includes(rawArea.toLowerCase())) {
              addressParts.push(rawArea);
            }
            if (rawDistrict && !rawAddress.toLowerCase().includes(rawDistrict.toLowerCase())) {
              addressParts.push(rawDistrict);
            }
            const combinedAddress = addressParts.filter(Boolean).join(', ').substring(0, 250);

            let itemDescription = (parcelData.item_description || '').trim();
            let totalLot = parcelData.total_lot != null ? Number(parcelData.total_lot) : 0;
            if (!itemDescription && Array.isArray(order.items) && order.items.length > 0) {
              itemDescription = order.items.map((it: any) => `${it.product?.title || 'Product'} x ${it.quantity}`).join(', ');
            }
            if (!totalLot && Array.isArray(order.items)) {
              totalLot = order.items.reduce((sum: number, it: any) => sum + (it.quantity || 1), 0);
            }

            let codAmount: number;
            if (parcelData.cod_amount !== undefined && parcelData.cod_amount !== null) {
              codAmount = Number(parcelData.cod_amount);
            } else {
              const isPrepaid = order.paymentStatus === 'PAID' || order.paymentStatus === 'Paid';
              codAmount = isPrepaid ? 0 : Number(order.totalAmount) || 0;
            }

            const recipientPhone = (parcelData.recipient_phone || order.customer?.phone || '').replace(/[^0-9]/g, '');

            if (isSteadfast) {
              const apiKey = (process.env.STEADFAST_API_KEY || '').trim();
              const secretKey = (process.env.STEADFAST_SECRET_KEY || '').trim();

              if (!apiKey || !secretKey) {
                res.statusCode = 400;
                return res.end(JSON.stringify({
                  success: false,
                  error: 'Steadfast Courier API credentials are not configured in Worker secrets.',
                }));
              }

              try {
                const sfPayload: Record<string, any> = {
                  invoice: String(parcelData.invoice || order.orderNumber),
                  recipient_name: String(parcelData.recipient_name || order.customer?.fullName).trim(),
                  recipient_phone: recipientPhone,
                  recipient_address: combinedAddress,
                  cod_amount: codAmount,
                  delivery_type: parcelData.delivery_type === 1 ? 1 : 0,
                };

                if (parcelData.alternative_phone) {
                  const alt = String(parcelData.alternative_phone).replace(/[^0-9]/g, '');
                  if (alt) sfPayload.alternative_phone = alt;
                }
                if (parcelData.recipient_email) {
                  sfPayload.recipient_email = String(parcelData.recipient_email).trim();
                }
                const note = (parcelData.note || order.customer?.notes || `Order #${order.orderNumber} - Rongdhonu Trade`).trim();
                if (note) sfPayload.note = note;
                if (itemDescription) sfPayload.item_description = itemDescription.substring(0, 200);
                if (totalLot > 0) sfPayload.total_lot = totalLot;
                if (parcelData.weight != null && Number(parcelData.weight) > 0) {
                  sfPayload.weight = Number(parcelData.weight);
                }

                const sfResult = await callSteadfastApi('create_order', { apiKey, secretKey, baseUrl: courierParam.baseUrl }, {
                  method: 'POST',
                  body: sfPayload,
                });
                const sfData = sfResult.data || {};

                if (sfResult.ok && (sfData.status === 200 || sfData.consignment)) {
                  const consignment = sfData.consignment || sfData;
                  const trackingCode = (consignment.tracking_code || '').trim();
                  const consignmentId = String(consignment.consignment_id || consignment.id || '').trim();

                  if (!trackingCode || !consignmentId) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({
                      success: false,
                      error: 'Steadfast booking failed: API response did not contain a valid tracking code or consignment ID. Order remains unbooked.',
                    }));
                  }

                  const targetOrder = devOrders.find((o) => o.id === order.id || o.orderNumber === order.orderNumber);
                  if (targetOrder) {
                    targetOrder.shippingStatus = 'Shipped';
                    targetOrder.courierName = courierName || 'Steadfast';
                    targetOrder.courierWaybill = trackingCode;
                    targetOrder.consignmentId = consignmentId;
                    targetOrder.courierStatus = 'In Transit';
                    targetOrder.courierBooking = {
                      provider: courierName || 'Steadfast',
                      waybillId: trackingCode,
                      consignmentId,
                      trackingUrl: `https://steadfast.com.bd/t/${trackingCode}`,
                      bookedAt: new Date().toISOString(),
                    };
                  }

                  res.statusCode = 200;
                  return res.end(JSON.stringify({
                    success: true,
                    tracking_code: trackingCode,
                    consignment_id: consignmentId,
                    message: `Order dispatched to ${courierName} successfully!`,
                    data: sfData,
                  }));
                }

                const errorDetail = sfResult.error || sfData.message || (sfData.errors ? JSON.stringify(sfData.errors) : 'Steadfast API rejected order creation');
                res.statusCode = 400;
                return res.end(JSON.stringify({
                  success: false,
                  error: errorDetail,
                  data: sfData,
                }));
              } catch (e: any) {
                console.error('Courier proxy request error:', e);
                res.statusCode = 500;
                return res.end(JSON.stringify({ success: false, error: 'Internal server error.' }));
              }
            }

            // Non-Steadfast Couriers (Pathao, RedX, Paperfly, or custom courier)
            const apiKey = (courierParam.apiKey || body?.apiKey || parcelData.apiKey || '').trim();
            const secretKey = (courierParam.secretKey || body?.secretKey || parcelData.secretKey || '').trim();
            const baseUrl = (courierParam.baseUrl || body?.baseUrl || parcelData.baseUrl || '').trim();
            const trackingPattern = (courierParam.trackingUrlPattern || '').trim() || 'https://steadfast.com.bd/t/{trackingCode}';

            if (!apiKey) {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                error: `${courierName} API credentials are not configured. Please enter API Key or configure it in Courier APIs tab.`,
              }));
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
                    recipient_name: String(parcelData.recipient_name || order.customer?.fullName).trim(),
                    recipient_phone: recipientPhone,
                    recipient_address: combinedAddress,
                    cod_amount: codAmount,
                    note: parcelData.note || order.customer?.notes || `Order #${order.orderNumber}`,
                    weight: Number(parcelData.weight) || 0.5,
                    items_count: totalLot || 1,
                  }),
                  signal: AbortSignal.timeout(10000),
                });

                if (response.ok) {
                  const data: any = await response.json().catch(() => ({}));
                  trackingCode = data.tracking_code || data.trackingCode || data.consignment_id || data.id || '';
                  consignmentId = String(data.consignment_id || data.consignmentId || data.id || '');
                } else if (response.status === 401 || response.status === 403) {
                  const data: any = await response.json().catch(() => ({}));
                  res.statusCode = 400;
                  return res.end(JSON.stringify({
                    success: false,
                    error: data.message || `Invalid API credentials for ${courierName}. Please check API Key and Secret.`,
                  }));
                }
              } catch {
                // Network timeout or mock base URL fallback
              }
            }

            if (!trackingCode || !consignmentId) {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                error: `Courier booking failed: ${courierName} did not return a valid tracking code or consignment ID. Order remains in Pending state.`,
              }));
            }

            const trackingUrl = trackingPattern.includes('{trackingCode}')
              ? trackingPattern.replace('{trackingCode}', trackingCode)
              : `${trackingPattern}/${trackingCode}`;

            const targetOrder = devOrders.find((o) => o.id === order.id || o.orderNumber === order.orderNumber);
            if (targetOrder) {
              targetOrder.shippingStatus = 'Shipped';
              targetOrder.courierName = courierName;
              targetOrder.courierWaybill = trackingCode;
              targetOrder.consignmentId = consignmentId;
              targetOrder.courierStatus = 'In Transit';
              targetOrder.courierBooking = {
                provider: courierName,
                waybillId: trackingCode,
                consignmentId,
                trackingUrl,
                bookedAt: new Date().toISOString(),
              };
            }

            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              tracking_code: trackingCode,
              consignment_id: consignmentId,
              message: `Order dispatched to ${courierName} successfully!`,
            }));
          });
        }

        const devCourierStatusMatch = url.pathname.match(/^\/api\/courier\/status\/([^/]+)$/);
        if (devCourierStatusMatch && method === 'GET') {
          const cid = decodeURIComponent(devCourierStatusMatch[1]);
          const authResult = requireDevAuth(req);
          const hasTrackingPerm = !authResult.error && authResult.auth && (authResult.auth.role === 'super_admin' || hasDevPermission(authResult.auth, 'courier.tracking'));

          if (!hasTrackingPerm) {
            const verifyPhone = (url.searchParams.get('phone') || '').replace(/\D/g, '');
            const foundOrder = devOrders.find((o) => o.consignmentId === cid || o.courierWaybill === cid);
            const orderPhone = foundOrder?.customer?.phone ? foundOrder.customer.phone.replace(/\D/g, '') : '';
            if (!foundOrder || verifyPhone.length < 11 || !orderPhone.endsWith(verifyPhone.slice(-11))) {
              res.statusCode = 403;
              return res.end(JSON.stringify({ success: false, error: 'Forbidden: Insufficient permissions to view courier tracking.', requiredPermission: 'courier.tracking' }));
            }
          }

          const apiKey = (process.env.STEADFAST_API_KEY || '').trim();
          const secretKey = (process.env.STEADFAST_SECRET_KEY || '').trim();
          if (!apiKey || !secretKey) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ success: false, error: 'Steadfast Courier API credentials are not configured in Worker secrets.' }));
          }

          try {
            const sfResult = await callSteadfastApi(`status_by_cid/${cid}`, { apiKey, secretKey });
            if (sfResult.ok) {
              res.statusCode = 200;
              return res.end(JSON.stringify({ success: true, data: sfResult.data }));
            }
            res.statusCode = 400;
            return res.end(JSON.stringify({ success: false, error: sfResult.error || 'Failed to query Steadfast API' }));
          } catch (e: any) {
            console.error('Steadfast status error:', e);
            res.statusCode = 500;
            return res.end(JSON.stringify({ success: false, error: 'Internal server error.' }));
          }
        }

        if (url.pathname === '/api/courier/sync' && method === 'POST') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          const canSync = authResult.auth!.role === 'super_admin' || hasDevPermission(authResult.auth!, 'courier.status_sync');
          if (!canSync) {
            return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Courier status sync permission required.', requiredPermission: 'courier.status_sync' } });
          }

          const activeOrders = devOrders.filter(
            (o) => (o.consignmentId || o.courierWaybill) && o.shippingStatus !== 'Delivered' && o.shippingStatus !== 'Cancelled'
          );

          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            totalChecked: activeOrders.length,
            updatedCount: 0,
            message: `Courier synchronization complete. Checked ${activeOrders.length} active orders.`,
          }));
        }

        const devSyncSingleMatch = url.pathname.match(/^\/api\/courier\/sync\/([^/]+)$/);
        if (devSyncSingleMatch && method === 'POST') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          const canSync = authResult.auth!.role === 'super_admin' || hasDevPermission(authResult.auth!, 'courier.status_sync');
          if (!canSync) {
            return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Courier status sync permission required.', requiredPermission: 'courier.status_sync' } });
          }

          const ordId = decodeURIComponent(devSyncSingleMatch[1]);
          const found = devOrders.find((o) => o.id === ordId || o.orderNumber === ordId);
          if (!found) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ success: false, error: 'Order not found' }));
          }

          const isSuper = authResult.auth!.role === 'super_admin';
          const canViewBuyingPrice = isSuper || hasDevPermission(authResult.auth!, 'product.view_buying_price');
          const canViewProfit = isSuper || hasDevPermission(authResult.auth!, 'report.profit') || hasDevPermission(authResult.auth!, 'product.view_profit');

          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            order: sanitizeDevOrder(found, { isSuperAdmin: isSuper, canViewBuyingPrice, canViewProfit }),
            message: `Order #${found.orderNumber} status checked.`,
          }));
        }

        // INCOMING COURIER WEBHOOK LISTENER (DEV MODE)
        // Handles: /api/webhook, /api/webhooks, /api/webhook/steadfast, /api/courier/webhook/steadfast, /api/courier/webhook, /api/webhook/courier, /api/webhooks/courier-added
        const normalizedDevWebhookPath = url.pathname.replace(/\/+$/, '');
        const isAdminDevCourierWebhooksEndpoint =
          normalizedDevWebhookPath === '/api/courier/webhooks' ||
          normalizedDevWebhookPath === '/api/courier/webhooks/test' ||
          normalizedDevWebhookPath === '/api/courier/webhooks/trigger';

        const isIncomingCourierWebhook =
          !isAdminDevCourierWebhooksEndpoint &&
          (normalizedDevWebhookPath === '/api/webhook' ||
            normalizedDevWebhookPath === '/api/webhooks' ||
            normalizedDevWebhookPath === '/api/webhook/steadfast' ||
            normalizedDevWebhookPath === '/api/courier/webhook/steadfast' ||
            normalizedDevWebhookPath === '/api/courier/webhook' ||
            normalizedDevWebhookPath === '/api/courier/webhooks/listener' ||
            normalizedDevWebhookPath === '/api/webhook/courier' ||
            normalizedDevWebhookPath.startsWith('/api/webhook/') ||
            normalizedDevWebhookPath.startsWith('/api/courier/webhook/'));

        if (isIncomingCourierWebhook) {
          if (method === 'GET') {
            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              status: 'active',
              endpoint: url.pathname,
              service: 'Steadfast Courier Webhook Listener (Dev)',
              message: 'Courier webhook receiver is active and ready to process delivery status updates and courier events.',
              timestamp: new Date().toISOString(),
            }));
          }

          if (method === 'POST') {
            return readRawBody(async (rawBody, body, isMalformedJson) => {
              if (isMalformedJson) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  success: false,
                  error: 'Malformed JSON payload. Please provide valid JSON.',
                }));
              }

              // Webhook authentication check before parsing or modifying orders
              const authResult = await verifyCourierWebhookAuth(
                {
                  rawBody,
                  headers: req.headers,
                  url: req.url,
                },
                process.env as any,
                devSettings
              );

              if (!authResult.authenticated) {
                res.statusCode = authResult.status || 401;
                return res.end(JSON.stringify({
                  success: false,
                  error: authResult.error || 'Unauthorized: Courier webhook authentication failed.',
                }));
              }

              const nowIso = new Date().toISOString();

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
                res.statusCode = 200;
                return res.end(JSON.stringify({
                  success: true,
                  status: 200,
                  message: 'Webhook received',
                  event: body?.event || body?.notification_type || body?.action || 'test_acknowledged',
                  courier: body?.courier?.name || body?.courier?.code || 'steadfast',
                  receivedAt: nowIso,
                }));
              }

              // Webhook Replay Protection: Fingerprint deduplication strictly for real order delivery updates
              const timestampHeader = (
                req.headers['x-webhook-timestamp'] ||
                req.headers['x-timestamp'] ||
                req.headers['x-signature-timestamp'] ||
                req.headers['x-req-timestamp'] ||
                req.headers['x-steadfast-timestamp'] ||
                req.headers['timestamp'] ||
                req.headers['date'] ||
                sfData?.timestamp ||
                sfData?.provider_updated_at ||
                sfData?.updated_at ||
                sfData?.created_at ||
                ''
              ) as string;

              const sigOrSecret = (
                req.headers['x-steadfast-signature'] ||
                req.headers['x-webhook-signature'] ||
                req.headers['x-signature'] ||
                req.headers['x-hub-signature-256'] ||
                req.headers['x-signature-sha256'] ||
                req.headers['x-webhook-secret'] ||
                req.headers['secret-key'] ||
                String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') ||
                ''
              ) as string;

              const fingerprint = await computeWebhookFingerprint(rawBody, timestampHeader, sigOrSecret);
              const { isReplay } = checkAndRecordDevWebhookReplay(fingerprint, 600);
              if (isReplay) {
                res.statusCode = 409;
                return res.end(JSON.stringify({
                  success: false,
                  error: 'Webhook replay rejected: This webhook request has already been processed.',
                }));
              }

              let matchedOrder = null;
              if (invoice) {
                const cleanInv = String(invoice).replace(/^#/, '');
                matchedOrder = devOrders.find(
                  (o) => o.id === invoice || o.orderNumber === cleanInv || String(o.orderNumber) === String(invoice)
                );
              }
              if (!matchedOrder && consignmentId) {
                matchedOrder = devOrders.find(
                  (o) => String(o.consignmentId) === String(consignmentId) || String(o.courierBooking?.consignmentId) === String(consignmentId)
                );
              }
              if (!matchedOrder && trackingCode) {
                matchedOrder = devOrders.find(
                  (o) => String(o.courierWaybill) === String(trackingCode) || String(o.courierBooking?.waybillId) === String(trackingCode)
                );
              }

              if (matchedOrder && rawStatus) {
                const normalized = normalizeSteadfastStatus(rawStatus);
                matchedOrder.courierStatus = normalized.courierStatus;
                matchedOrder.shippingStatus = normalized.shippingStatus;
                matchedOrder.lastCourierSync = nowIso;
                if (normalized.isDelivered && matchedOrder.paymentStatus !== 'PAID' && matchedOrder.paymentStatus !== 'Paid') {
                  matchedOrder.paymentStatus = 'Paid';
                }
              }

              res.statusCode = 200;
              return res.end(JSON.stringify({
                success: true,
                status: 200,
                message: matchedOrder
                  ? `Order #${matchedOrder.orderNumber} status updated to "${matchedOrder.courierStatus}" via Steadfast webhook.`
                  : 'Webhook payload received and acknowledged.',
                receivedAt: nowIso,
              }));
            });
          }
        }

        // Helper to resolve development target webhook URLs to localhost port 3000
        function resolveDevTargetUrl(raw: string): string {
          const clean = (raw || '').trim();
          if (!clean) return 'http://127.0.0.1:3000/api/webhook/courier';
          if (clean.startsWith('/')) {
            const sub = clean.replace(/\/+$/, '');
            if (sub === '' || sub === '/' || sub === '/api' || sub === '/webhooks' || sub === '/api/webhooks') {
              return 'http://127.0.0.1:3000/api/webhook/courier';
            }
            return `http://127.0.0.1:3000${clean}`;
          }
          try {
            const parsed = new URL(clean);
            const host = parsed.hostname.toLowerCase();
            if (
              host === 'rongdhonutrade.com' ||
              host === 'www.rongdhonutrade.com' ||
              host.includes('ais-dev') ||
              host.includes('ais-pre') ||
              host.includes('run.app') ||
              host === 'localhost' ||
              host === '127.0.0.1' ||
              host === '0.0.0.0'
            ) {
              const subPath = parsed.pathname.replace(/\/+$/, '') || '/';
              if (
                subPath === '/' ||
                subPath === '' ||
                subPath === '/index.html' ||
                subPath === '/api' ||
                subPath === '/webhooks'
              ) {
                return `http://127.0.0.1:3000/api/webhook/courier${parsed.search}`;
              }
              return `http://127.0.0.1:3000${parsed.pathname}${parsed.search}`;
            }
          } catch {}
          return clean;
        }

        // COURIER WEBHOOKS (DEV MODE)
        if (url.pathname === '/api/courier/webhooks' && method === 'GET') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          const canManage = authResult.auth!.role === 'super_admin' || hasDevPermission(authResult.auth!, 'courier.configure') || hasDevPermission(authResult.auth!, 'settings.manage');
          if (!canManage) {
            return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Courier configuration permission required.' } });
          }

          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            webhooks: maskDevCourierWebhooks(devCourierWebhooks),
          }));
        }

        if (url.pathname === '/api/courier/webhooks' && method === 'POST') {
          return readBody((body) => {
            // If incoming body is a direct webhook dispatch/ping rather than saving settings:
            if (body && !Array.isArray(body.webhooks) && (body.event || body.ping || body.courier)) {
              res.statusCode = 200;
              return res.end(JSON.stringify({
                success: true,
                status: 200,
                message: 'Courier webhook payload received and acknowledged.',
                receivedAt: new Date().toISOString(),
              }));
            }

            const authResult = requireDevAuth(req);
            if (authResult.error) return sendDevError(res, authResult.error);
            const canManage = authResult.auth!.role === 'super_admin' || hasDevPermission(authResult.auth!, 'courier.configure') || hasDevPermission(authResult.auth!, 'settings.manage');
            if (!canManage) {
              return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Courier configuration permission required.' } });
            }

            const incoming = Array.isArray(body?.webhooks) ? body.webhooks : [];
            const existingMap = new Map<string, string>();
            for (const w of devCourierWebhooks) {
              if (w.id && w.secret) existingMap.set(w.id, w.secret);
            }
            const list = incoming.map((w: any) => {
              let secret = w.secret;
              if (secret === '••••••••' || (typeof secret === 'string' && secret.startsWith('****')) || (secret === undefined && w.hasSecret)) {
                secret = existingMap.get(w.id) || undefined;
              }
              return {
                ...w,
                secret: secret ? String(secret).trim() : undefined,
              };
            });

            devCourierWebhooks = list;
            devSettings.courierWebhooks = list;
            try {
              fs.writeFileSync(SETTINGS_FILE, JSON.stringify(devSettings, null, 2), 'utf-8');
            } catch {}

            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              webhooks: maskDevCourierWebhooks(devCourierWebhooks),
              message: 'Courier webhooks saved successfully.',
            }));
          });
        }

        if ((url.pathname === '/api/courier/webhooks' || url.pathname.startsWith('/api/courier/webhooks/')) && method === 'DELETE') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          const canManage = authResult.auth!.role === 'super_admin' || hasDevPermission(authResult.auth!, 'courier.configure') || hasDevPermission(authResult.auth!, 'settings.manage');
          if (!canManage) {
            return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Courier configuration permission required.' } });
          }

          const targetId = url.pathname.startsWith('/api/courier/webhooks/')
            ? url.pathname.replace('/api/courier/webhooks/', '').trim()
            : '';

          return readBody((body) => {
            const idToDelete = targetId || body?.id;
            devCourierWebhooks = idToDelete ? devCourierWebhooks.filter((w: any) => w.id !== idToDelete) : [];
            devSettings.courierWebhooks = devCourierWebhooks;
            try {
              fs.writeFileSync(SETTINGS_FILE, JSON.stringify(devSettings, null, 2), 'utf-8');
            } catch {}

            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              webhooks: maskDevCourierWebhooks(devCourierWebhooks),
              message: 'Courier webhook deleted successfully.',
            }));
          });
        }

        if (url.pathname === '/api/courier/webhooks/test' && method === 'POST') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          const canManage = authResult.auth!.role === 'super_admin' || hasDevPermission(authResult.auth!, 'courier.configure') || hasDevPermission(authResult.auth!, 'settings.manage');
          if (!canManage) {
            return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Courier configuration permission required.' } });
          }

          return readBody(async (body) => {
            const rawTargetUrl = (body?.url || '').trim();
            const secret = (body?.secret || '').trim();
            const eventName = body?.event || 'courier.added';

            // SSRF Protection
            const validation = validateWebhookDestination(rawTargetUrl, 'http://127.0.0.1:3000');
            if (!validation.valid) {
              res.statusCode = 400;
              return res.end(JSON.stringify({
                success: false,
                error: validation.error || 'Invalid or restricted webhook URL.',
              }));
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
                siteName: devSettings.siteName || 'Rongdhonu Trade',
                currency: devSettings.currencySymbol || '৳',
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
            const effectiveTestSecret = secret || (process.env.COURIER_WEBHOOK_SECRET || process.env.STEADFAST_SECRET_KEY || '').trim();
            if (effectiveTestSecret) {
              headers['X-Webhook-Secret'] = effectiveTestSecret;
              const sig = await computeHmacSha256Hex(effectiveTestSecret, serializedTestPayload);
              headers['X-Webhook-Signature'] = sig;
              headers['X-Signature'] = `sha256=${sig}`;
            }

            // Safe internal receiver dispatch
            if (validation.isInternalReceiver) {
              const localUrl = `http://127.0.0.1:3000${validation.internalPath || '/api/webhook/courier'}`;
              try {
                const resp = await fetch(localUrl, {
                  method: 'POST',
                  headers,
                  body: serializedTestPayload,
                });
                const latencyMs = Date.now() - start;
                const respText = await resp.text().catch(() => '');
                res.statusCode = 200;
                return res.end(JSON.stringify({
                  success: resp.ok,
                  status: resp.status,
                  latencyMs,
                  responsePreview: respText.slice(0, 500) || (resp.ok ? 'OK' : `HTTP ${resp.status}`),
                  message: resp.ok
                    ? `Webhook test delivered successfully with HTTP ${resp.status} (${latencyMs}ms)`
                    : `Endpoint responded with HTTP ${resp.status}`,
                }));
              } catch {
                res.statusCode = 200;
                return res.end(JSON.stringify({
                  success: false,
                  status: 500,
                  latencyMs: Date.now() - start,
                  error: 'Internal webhook execution failed.',
                  responsePreview: 'Delivery error',
                  message: 'Internal webhook execution failed.',
                }));
              }
            }

            // External dispatch via hardened SSRF-safe fetch
            const fetchResult = await safeFetchWebhook({
              url: validation.normalizedUrl!,
              headers,
              body: serializedTestPayload,
              timeoutMs: 5000,
              maxRedirects: 3,
              maxResponseBytes: 1024,
            });

            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: fetchResult.success,
              status: fetchResult.status,
              latencyMs: fetchResult.latencyMs,
              responsePreview: fetchResult.responsePreview,
              message: fetchResult.message,
            }));
          });
        }

        if (url.pathname === '/api/courier/webhooks/trigger' && method === 'POST') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);

          return readBody(async (body) => {
            const event = body?.event || 'courier.added';
            const courier = body?.courier || {};
            const configuredWebhooks = Array.isArray(body?.webhooks) ? body.webhooks : devCourierWebhooks;

            const activeWebhooks = configuredWebhooks.filter(
              (w: any) => w.isActive && (w.events?.includes(event) || w.events?.includes('*') || !w.events || w.events.length === 0)
            );

            const targetList: { url: string; secret?: string; webhookId?: string; name: string }[] = [];
            for (const w of activeWebhooks) {
              if (w.url && typeof w.url === 'string' && w.url.trim()) {
                targetList.push({ url: w.url.trim(), secret: w.secret, webhookId: w.id, name: w.name });
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
                siteName: devSettings.siteName || 'Rongdhonu Trade',
                currency: devSettings.currencySymbol || '৳',
              },
            };

            const results = await Promise.all(
              targetList.map(async (t) => {
                const start = Date.now();
                const validation = validateWebhookDestination(t.url, 'http://127.0.0.1:3000');
                if (!validation.valid) {
                  return {
                    url: t.url,
                    name: t.name,
                    webhookId: t.webhookId,
                    success: false,
                    status: 0,
                    durationMs: 0,
                    error: validation.error || 'Destination URL failed SSRF check.',
                    responsePreview: 'Blocked by SSRF filter',
                  };
                }

                const headers: Record<string, string> = {
                  'Content-Type': 'application/json',
                  'User-Agent': 'RongdhonuTrade-Webhook/1.0',
                  'X-Webhook-Event': event,
                  'X-Webhook-Timestamp': new Date().toISOString(),
                };
                const serializedPayload = JSON.stringify(payload);
                const effectiveTriggerSecret = t.secret || (process.env.COURIER_WEBHOOK_SECRET || process.env.STEADFAST_SECRET_KEY || '').trim();
                if (effectiveTriggerSecret) {
                  headers['X-Webhook-Secret'] = effectiveTriggerSecret;
                  const sig = await computeHmacSha256Hex(effectiveTriggerSecret, serializedPayload);
                  headers['X-Webhook-Signature'] = sig;
                  headers['X-Signature'] = `sha256=${sig}`;
                }

                if (validation.isInternalReceiver) {
                  const localUrl = `http://127.0.0.1:3000${validation.internalPath || '/api/webhook/courier'}`;
                  try {
                    const resp = await fetch(localUrl, {
                      method: 'POST',
                      headers,
                      body: serializedPayload,
                    });
                    const durationMs = Date.now() - start;
                    const respText = await resp.text().catch(() => '');

                    const logEntry = {
                      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                      webhookId: t.webhookId,
                      webhookUrl: t.url,
                      event,
                      timestamp: new Date().toISOString(),
                      status: resp.ok ? 'success' : 'failed',
                      httpStatus: resp.status,
                      latencyMs: durationMs,
                      responsePreview: respText.slice(0, 300),
                      courierName: courier.name,
                      payload,
                    };
                    devCourierWebhookLogs.unshift(logEntry);
                    if (devCourierWebhookLogs.length > 100) devCourierWebhookLogs.pop();

                    return {
                      url: t.url,
                      name: t.name,
                      webhookId: t.webhookId,
                      success: resp.ok,
                      status: resp.status,
                      durationMs,
                      responsePreview: respText.slice(0, 300),
                    };
                  } catch {
                    return {
                      url: t.url,
                      name: t.name,
                      webhookId: t.webhookId,
                      success: false,
                      status: 500,
                      durationMs: Date.now() - start,
                      error: 'Internal webhook execution error',
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

                const logEntry = {
                  id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  webhookId: t.webhookId,
                  webhookUrl: t.url,
                  event,
                  timestamp: new Date().toISOString(),
                  status: fetchResult.success ? 'success' : 'failed',
                  httpStatus: fetchResult.status,
                  latencyMs: fetchResult.latencyMs,
                  responsePreview: fetchResult.responsePreview,
                  courierName: courier.name,
                  payload,
                };
                devCourierWebhookLogs.unshift(logEntry);
                if (devCourierWebhookLogs.length > 100) devCourierWebhookLogs.pop();

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

            res.statusCode = 200;
            return res.end(JSON.stringify({
              success: true,
              dispatchedCount: results.length,
              results,
            }));
          });
        }

        if (url.pathname === '/api/courier/webhooks/logs' && method === 'GET') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          const canManage = authResult.auth!.role === 'super_admin' || hasDevPermission(authResult.auth!, 'courier.configure') || hasDevPermission(authResult.auth!, 'settings.manage');
          if (!canManage) {
            return sendDevError(res, { status: 403, body: { success: false, error: 'Forbidden: Courier configuration permission required.' } });
          }

          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            logs: devCourierWebhookLogs,
          }));
        }

        // 10. PROFIT ANALYTICS (DEV MODE - SUPER ADMIN ONLY)
        if ((url.pathname === '/api/analytics/profit' || url.pathname === '/api/admin/profit-analytics') && method === 'GET') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          const permErr = requireDevPermission(authResult, 'report.profit');
          if (permErr) return sendDevError(res, permErr);

          const period = url.searchParams.get('period') || 'today';
          const startDate = url.searchParams.get('startDate');
          const endDate = url.searchParams.get('endDate');

          const now = new Date();
          const todayStr = now.toISOString().slice(0, 10);
          const currentMonthStr = now.toISOString().slice(0, 7);
          const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

          const matchesPeriod = (dateStr: string) => {
            if (!dateStr) return false;
            const ymd = dateStr.slice(0, 10);
            const ym = dateStr.slice(0, 7);
            if (period === 'today') {
              const target = startDate || todayStr;
              return ymd === target;
            }
            if (period === 'previous_month') {
              return ym === prevMonthStr;
            }
            if (period === 'month') {
              const target = startDate ? startDate.slice(0, 7) : currentMonthStr;
              return ym === target;
            }
            // custom
            const s = startDate || '1970-01-01';
            const e = endDate || '2099-12-31';
            return ymd >= s && ymd <= e;
          };

          const matchedOrders = devOrders.filter((o) => matchesPeriod(o.createdAt));
          let totalOrders = matchedOrders.length;
          let completedOrders = 0;
          let cancelledOrders = 0;
          let returnedOrders = 0;
          let totalRevenue = 0;
          let totalProductCost = 0;
          let productsSold = 0;

          for (const o of matchedOrders) {
            const isCancelled =
              o.shippingStatus === 'Cancelled' ||
              o.paymentStatus === 'REFUNDED' ||
              o.courierStatus === 'Returned / Cancelled';

            if (isCancelled) {
              cancelledOrders++;
              if (o.courierStatus === 'Returned / Cancelled' || o.paymentStatus === 'REFUNDED') {
                returnedOrders++;
              }
              continue;
            }

            if (o.shippingStatus === 'Delivered') {
              completedOrders++;
            }

            const rev = Number(o.subtotal) || 0;
            totalRevenue += rev;

            let cost = Number(o.totalCost) || 0;
            if (cost === 0 && Array.isArray(o.items)) {
              cost = o.items.reduce(
                (sum: number, it: any) =>
                  sum +
                  (Number(it.productCost) ||
                    (Number(it.buyingPriceSnapshot || it.product?.buyingPrice || 0) * (Number(it.quantity) || 1))),
                0
              );
            }
            totalProductCost += cost;

            if (Array.isArray(o.items)) {
              for (const it of o.items) {
                productsSold += Number(it.quantity) || 1;
              }
            }
          }

          const grossProfit = totalRevenue - totalProductCost;
          const activeOrdersCount = totalOrders - cancelledOrders;
          const averageOrderValue = activeOrdersCount > 0 ? Math.round(totalRevenue / activeOrdersCount) : 0;
          const averageProfitPerOrder = activeOrdersCount > 0 ? Math.round(grossProfit / activeOrdersCount) : 0;

          const matchedExpenses = devExpenses.filter((exp) => matchesPeriod(exp.date));
          let totalExpenses = 0;
          const expenseBreakdown = {
            facebookAds: 0,
            courier: 0,
            paymentGateway: 0,
            other: 0,
          };

          for (const exp of matchedExpenses) {
            const amt = Number(exp.amount) || 0;
            totalExpenses += amt;
            if (exp.expenseType === 'facebook_ads') expenseBreakdown.facebookAds += amt;
            else if (exp.expenseType === 'courier') expenseBreakdown.courier += amt;
            else if (exp.expenseType === 'payment_gateway') expenseBreakdown.paymentGateway += amt;
            else expenseBreakdown.other += amt;
          }

          const netProfit = grossProfit - totalExpenses;

          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            summary: {
              period: period === 'previous_month' ? 'month' : period,
              startDate: startDate || undefined,
              endDate: endDate || undefined,
              revenue: totalRevenue,
              productCost: totalProductCost,
              grossProfit,
              expenses: totalExpenses,
              netProfit,
              totalOrders,
              completedOrders,
              cancelledOrders,
              returnedOrders,
              productsSold,
              averageOrderValue,
              averageProfitPerOrder,
              expenseBreakdown,
            },
          }));
        }

        // 11. EXPENSES (DEV MODE - SUPER ADMIN ONLY)
        if (url.pathname === '/api/expenses') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          const permErr = requireDevPermission(authResult, 'report.financial');
          if (permErr) return sendDevError(res, permErr);

          if (method === 'GET') {
            const startDate = url.searchParams.get('startDate');
            const endDate = url.searchParams.get('endDate');
            const expenseType = url.searchParams.get('expenseType');

            let list = devExpenses;
            if (startDate) list = list.filter((e) => e.date >= startDate);
            if (endDate) list = list.filter((e) => e.date <= endDate);
            if (expenseType && expenseType !== 'all') list = list.filter((e) => e.expenseType === expenseType);

            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, count: list.length, expenses: list }));
          }

          if (method === 'POST') {
            return readBody((body) => {
              const exp = body.expense || body;
              const amount = Number(exp.amount);
              if (isNaN(amount) || amount < 0) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'Expense amount must be a positive number.' }));
              }
              if (!exp.expenseType) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ success: false, error: 'Expense type is required.' }));
              }

              const newExp = {
                id: exp.id || `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                expenseType: exp.expenseType || 'other',
                amount,
                date: exp.date || new Date().toISOString().slice(0, 10),
                note: exp.note ? String(exp.note).trim() : undefined,
                createdAt: new Date().toISOString(),
                createdBy: authResult.auth?.user?.email || 'admin',
              };
              devExpenses.unshift(newExp);

              res.statusCode = 201;
              return res.end(JSON.stringify({ success: true, expense: newExp, message: 'Expense recorded successfully.' }));
            });
          }
        }

        const expMatch = url.pathname.match(/^\/api\/expenses\/([^/]+)$/);
        if (expMatch && method === 'DELETE') {
          const authResult = requireDevAuth(req);
          if (authResult.error) return sendDevError(res, authResult.error);
          const permErr = requireDevPermission(authResult, 'report.financial');
          if (permErr) return sendDevError(res, permErr);

          const id = decodeURIComponent(expMatch[1]);
          devExpenses = devExpenses.filter((e) => e.id !== id);
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, message: `Expense "${id}" deleted.` }));
        }

        if (url.pathname.startsWith('/api/')) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 404;
          return res.end(JSON.stringify({ success: false, error: 'Endpoint not found' }));
        }

        next();
      } catch (err: any) {
        console.error('[Dev Server Unhandled Exception Logged Safely]:', err);
        return sendDevError(res, { status: 500, body: { success: false, error: 'Internal server error.' } });
      }
    });
  },
    transformIndexHtml(html: string, ctx: any) {
      try {
        const reqUrl = ctx.originalUrl || ctx.url || '';
        const parsedUrl = new URL(reqUrl, 'http://localhost:3000');
        const prodParam = (
          parsedUrl.searchParams.get('product') ||
          parsedUrl.searchParams.get('p') ||
          (parsedUrl.pathname.startsWith('/product/') ? parsedUrl.pathname.replace(/^\/product\//, '').replace(/\/$/, '') : '')
        ).trim();

        if (prodParam) {
          const foundProduct = devProducts.find(
            (p) => p.id === prodParam || p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') === prodParam
          );
          if (foundProduct && (foundProduct as any).status !== 'inactive' && !(foundProduct as any).isDeleted) {
            const cat = devCategories.find((c) => c.id === foundProduct.categoryId);
            return injectProductSEOIntoHtml(html, foundProduct, cat?.name, devSettings.siteName || DEFAULT_SITE_NAME);
          }
        }

        const catParam = (
          parsedUrl.searchParams.get('category') ||
          parsedUrl.searchParams.get('cat') ||
          (parsedUrl.pathname.startsWith('/category/') ? parsedUrl.pathname.replace(/^\/category\//, '').replace(/\/$/, '') : '')
        ).trim();

        if (catParam) {
          const foundCat = devCategories.find(
            (c) => c.slug?.toLowerCase() === catParam.toLowerCase() || c.id === catParam
          );
          if (foundCat) {
            return injectCategorySEOIntoHtml(html, foundCat, devSettings.siteName || DEFAULT_SITE_NAME);
          }
        }
      } catch (err) {
        console.error('Error in transformIndexHtml SEO injection:', err);
      }
      return html;
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), { ...localApiDevPlugin(), apply: 'serve' }],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/lucide-react/')) {
              return 'vendor-icons';
            }
            if (id.includes('pixelTracking')) {
              return 'pixel-tracking';
            }
            if (id.includes('bangladeshAreas')) {
              return 'bangladesh-areas';
            }
            if (id.includes('seedData')) {
              return 'seed-data';
            }
            if (id.includes('utils/seo')) {
              return 'seo-engine';
            }
            if (id.includes('src/services/')) {
              return 'store-services';
            }
          },
        },
      },
    },
  };
});
