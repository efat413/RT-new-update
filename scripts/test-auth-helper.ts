/**
 * Shared test authentication helpers for all test & verification scripts.
 * 
 * Authenticates exclusively via legitimate channels:
 * - Real API endpoints: POST /api/auth/login, POST /api/auth/register
 * - Cryptographically signed HMAC-SHA256 JWTs using the authoritative secret
 * 
 * Insecure dev-jwt-* token fallbacks are strictly banned.
 */

import nodeCrypto from 'crypto';

export const TEST_BASE_URL = 'http://localhost:3000';

/**
 * Resolves the signing secret for testing.
 */
export function getTestSecret(): string {
  return process.env.ADMIN_SECRET || 'dev-secret-test-shared-999';
}

/**
 * Creates a cryptographically signed HMAC-SHA256 JWT with 3 parts.
 * Follows RFC 7519 / RFC 7515 standard HS256 JWT structure expected by verifyAuthToken.
 */
export function createSignedTestToken(
  payload: {
    userId: string;
    email: string;
    role: string;
    pwdSig?: string;
    permissions?: Record<string, boolean>;
    exp?: number;
  },
  secret: string = getTestSecret(),
  expiresInSeconds: number = 7 * 86400
): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = payload.exp
    ? Math.floor(payload.exp > 10000000000 ? payload.exp / 1000 : payload.exp)
    : now + expiresInSeconds;
  const fullPayload = { ...payload, iat: now, exp };
  const header = { alg: 'HS256', typ: 'JWT' };
  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const message = `${b64Header}.${b64Payload}`;
  const sig = nodeCrypto.createHmac('sha256', secret).update(message).digest('base64url');
  return `${message}.${sig}`;
}

/**
 * Logs in via POST /api/auth/login with given credentials and returns the authentic session token.
 */
export async function loginAndGetToken(
  usernameOrEmail: string,
  password: string,
  baseUrl: string = TEST_BASE_URL
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail, password }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Login failed for ${usernameOrEmail} (HTTP ${res.status}): ${errText}`);
  }
  const data = await res.json();
  if (!data.token) {
    throw new Error(`Login succeeded for ${usernameOrEmail} but no token was returned`);
  }
  return data.token;
}

/**
 * Obtains a legitimate Super Admin session token.
 */
export async function getTestAdminToken(
  baseUrl: string = TEST_BASE_URL,
  emailOrUsername: string = 'dev-superadmin@local.test'
): Promise<string> {
  const password = process.env.DEV_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin';
  return loginAndGetToken(emailOrUsername, password, baseUrl);
}

/**
 * Obtains a legitimate Sub-Admin (Staff) session token.
 */
export async function getTestStaffToken(
  baseUrl: string = TEST_BASE_URL,
  email: string = 'staff@rongdhonutrade.com'
): Promise<string> {
  const password = process.env.DEV_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin';
  return loginAndGetToken(email, password, baseUrl);
}

/**
 * Obtains a legitimate Customer session token.
 * If the customer is not registered yet, registers them first via POST /api/auth/register.
 */
export async function getTestCustomerToken(
  baseUrl: string = TEST_BASE_URL,
  email: string = 'customer@gmail.com',
  password: string = 'admin'
): Promise<string> {
  try {
    return await loginAndGetToken(email, password, baseUrl);
  } catch {
    try {
      return await loginAndGetToken(email, 'password123', baseUrl);
    } catch {
      // Attempt registration
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Customer',
          email,
          password,
          phone: '01711111111',
        }),
      });
      if (regRes.ok) {
        const regData = await regRes.json();
        if (regData.token) return regData.token;
      }
      // Retry login
      return await loginAndGetToken(email, password, baseUrl);
    }
  }
}
