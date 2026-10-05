/**
 * Server-Side Authentication & Password Hashing for Rongdhonu Trade
 * Built using native Web Crypto API (SubtleCrypto) supported by Cloudflare Workers & Node.js.
 */

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  pwdSig?: string;
  iat?: number;
  exp: number; // Unix timestamp in seconds
  authTime?: number; // Absolute initial login timestamp in seconds
  lastActivity?: number; // Timestamp in seconds of last verified user-initiated activity
}

export const ADMIN_SESSION_IDLE_TIMEOUT_SECONDS = 30 * 60; // 30 minutes idle timeout
export const ADMIN_SESSION_ABSOLUTE_TIMEOUT_SECONDS = 12 * 3600; // 12 hours absolute maximum session lifetime
export const CUSTOMER_SESSION_EXPIRATION_SECONDS = 7 * 24 * 3600; // 7 days for non-admin customer accounts
export const ADMIN_SESSION_REFRESH_THROTTLE_SECONDS = 60; // 60-second sliding refresh throttle window

export function isAdminRole(role?: string | null): boolean {
  if (!role) return false;
  return role === 'super_admin' || role === 'admin' || role === 'sub_admin';
}

let devFallbackSecret: string | null = null;
function getDevFallbackSecret(): string {
  if (!devFallbackSecret) {
    if (typeof process !== 'undefined' && process.env?.ADMIN_SECRET && process.env.ADMIN_SECRET.trim()) {
      devFallbackSecret = process.env.ADMIN_SECRET.trim();
    } else {
      devFallbackSecret = 'dev-secret-test-shared-999';
    }
  }
  return devFallbackSecret;
}

/**
 * Resolves the authentication signing secret strictly from the environment.
 * PRODUCTION:
 * - ADMIN_SECRET must be provided as a Cloudflare Worker Secret.
 * - If ADMIN_SECRET is missing, authentication fails closed immediately.
 * - Never uses D1 store_settings, never generates a runtime fallback secret,
 *   and never uses hardcoded or global fallback secrets in production.
 *
 * DEVELOPMENT:
 * - Development-only fallback is explicitly restricted to local dev / test runtimes.
 */
export function getAuthSecret(env?: { ADMIN_SECRET?: string; JWT_SECRET?: string; DB?: any; DEV?: boolean }): string {
  const isDev = Boolean(
    env?.DEV === true ||
    (typeof process !== 'undefined' && process.env && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'))
  );

  // In production: ADMIN_SECRET must be provided as a Cloudflare Worker Secret
  if (!isDev) {
    if (env?.ADMIN_SECRET && env.ADMIN_SECRET.trim()) {
      return env.ADMIN_SECRET.trim();
    }
    // Fail closed in production: Never use D1, runtime randoms, or silent fallbacks
    throw new Error('SERVER_CONFIGURATION_ERROR: Cloudflare Worker secret ADMIN_SECRET is required in production but not configured.');
  }

  // Development-only resolution: strictly for local dev/testing
  if (env?.ADMIN_SECRET && env.ADMIN_SECRET.trim()) {
    return env.ADMIN_SECRET.trim();
  }
  if (typeof process !== 'undefined' && process.env?.ADMIN_SECRET && process.env.ADMIN_SECRET.trim()) {
    return process.env.ADMIN_SECRET.trim();
  }
  return getDevFallbackSecret();
}

/**
 * Asynchronously resolves the authentication signing secret.
 * Production environments strictly require ADMIN_SECRET and fail closed if missing.
 */
export async function resolveAuthSecret(env?: { ADMIN_SECRET?: string; JWT_SECRET?: string; DB?: any; DEV?: boolean }): Promise<string> {
  return getAuthSecret(env);
}

const PBKDF2_ITERATIONS = 100000;

export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Hashes a plaintext password using PBKDF2-HMAC-SHA256 with a random salt.
 * Returns formatted string: pbkdf2:100000:<saltHex>:<hashHex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltHex = bufferToHex(salt.buffer);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hashHex = bufferToHex(derivedBits);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
}

/**
 * Verifies a plaintext password against a stored hash (or handles legacy upgrade).
 */
export async function verifyPassword(password: string, storedHashOrPassword: string): Promise<boolean> {
  if (!storedHashOrPassword) return false;

  // Handle standard PBKDF2 format
  if (storedHashOrPassword.startsWith('pbkdf2:')) {
    const parts = storedHashOrPassword.split(':');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const saltHex = parts[2];
    const expectedHashHex = parts[3];

    const salt = hexToBuffer(saltHex);
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const actualHashHex = bufferToHex(derivedBits);
    // Constant-time comparison
    if (actualHashHex.length !== expectedHashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < actualHashHex.length; i++) {
      diff |= actualHashHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
    }
    return diff === 0;
  }

  // Plaintext password comparison completely removed for security hardening
  // All production credentials must strictly use PBKDF2 format: pbkdf2:<iterations>:<saltHex>:<hashHex>
  return false;
}

/**
 * Checks if a stored password is in legacy plaintext format rather than PBKDF2.
 * Used for offline migration strategies and auditing.
 */
export function isLegacyPlaintextPassword(storedHashOrPassword: string): boolean {
  return Boolean(storedHashOrPassword && !storedHashOrPassword.startsWith('pbkdf2:'));
}

/**
 * Computes a cryptographically secure 256-bit password signature (digest)
 * for session invalidation.
 */
export async function computePasswordSignature(passwordHash: string): Promise<string> {
  if (!passwordHash) return '';
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passwordHash));
  return bufferToHex(hashBuf).slice(0, 32);
}

/**
 * Creates an HMAC-SHA256 signed JWT-like authorization token.
 */
export async function createAuthToken(
  payload: Omit<TokenPayload, 'exp' | 'iat'>,
  secret: string,
  expiresInSeconds: number = 7 * 24 * 3600 // 7 days
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInSeconds;
  const fullPayload: TokenPayload = { ...payload, iat: now, exp };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const message = `${encodedHeader}.${encodedPayload}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const encodedSignature = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${message}.${encodedSignature}`;
}

async function verifyTokenSignature(
  token: string,
  secret: string
): Promise<TokenPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    // Verify JWT header specifies HS256 algorithm and JWT type
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    if (!header || header.alg !== 'HS256' || (header.typ && header.typ !== 'JWT')) {
      return null;
    }

    const message = `${encodedHeader}.${encodedPayload}`;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = Uint8Array.from(
      base64UrlDecode(encodedSignature),
      (c) => c.charCodeAt(0)
    );

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      enc.encode(message)
    );

    if (!isValid) return null;

    const payload: TokenPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    // JWT expiration validation: token must have a valid exp number and cannot be expired
    if (!payload.exp || typeof payload.exp !== 'number' || isNaN(payload.exp) || payload.exp <= now) {
      return null; // Expired or missing/invalid exp
    }

    // Defense-in-depth: Strictly enforce 30-minute idle and 12-hour absolute timeout for admin roles
    if (isAdminRole(payload.role)) {
      const authTime = typeof payload.authTime === 'number' ? payload.authTime : (typeof payload.iat === 'number' ? payload.iat : null);
      const lastActivity = typeof payload.lastActivity === 'number' ? payload.lastActivity : (typeof payload.iat === 'number' ? payload.iat : null);
      if (authTime === null || lastActivity === null) {
        return null; // Admin tokens strictly require valid session timestamps
      }
      if (now - authTime > ADMIN_SESSION_ABSOLUTE_TIMEOUT_SECONDS) {
        return null; // Absolute maximum session lifetime reached
      }
      if (now - lastActivity > ADMIN_SESSION_IDLE_TIMEOUT_SECONDS) {
        return null; // 30-minute continuous inactivity timeout reached
      }
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Verifies and parses an HMAC-SHA256 auth token.
 * Validates strictly against the authoritative Worker secret.
 * Production environments strictly use only the configured ADMIN_SECRET.
 * Fails closed without D1 or runtime fallback secrets.
 *
 * CRITICAL SECURITY GUARANTEE:
 * Development-only tokens (such as `dev-jwt-*`) are strictly rejected in all server paths.
 * Production authentication MUST ALWAYS use full cryptographic HMAC-SHA256 signature verification.
 * Under NO circumstances can any request header, query parameter, cookie, or payload
 * bypass cryptographic signature verification or activate unverified development tokens.
 */
export async function verifyAuthToken(
  token: string,
  secret: string,
  _env?: { DB?: any }
): Promise<TokenPayload | null> {
  if (!token || typeof token !== 'string') return null;

  const trimmedToken = token.trim();

  // Strict check: Instantly reject any development token prefixes or non-JWT formats
  if (
    trimmedToken.startsWith('dev-jwt-') ||
    trimmedToken.startsWith('dev-') ||
    trimmedToken.startsWith('mock-') ||
    !trimmedToken.includes('.')
  ) {
    return null;
  }

  // Must have exactly 3 dot-separated Base64Url parts (Header.Payload.Signature)
  const parts = trimmedToken.split('.');
  if (parts.length !== 3) {
    return null;
  }

  return verifyTokenSignature(trimmedToken, secret);
}
