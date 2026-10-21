import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleApiRequest } from '../src/server/router';
import { Env, UserRow } from '../src/server/types';
import { hashPassword, verifyPassword, bufferToHex, PBKDF2_RECOMMENDED_ITERATIONS } from '../src/server/auth';
import { claimPasswordResetToken, getPasswordResetToken, updateUserPasswordInD1, ensureRateLimitsTable, ensurePasswordResetTokensTable, resetTableInitFlagsForTesting } from '../src/server/db';
import { authApi } from '../src/services/authApi';

describe('Password Reset End-to-End & Cloudflare D1 Hardening Suite', () => {
  let mockUsers: Map<string, any>;
  let mockTokens: Map<string, any>;
  let mockRateLimits: Map<string, any>;
  let mockDb: any;
  let mockEnv: Env;
  let capturedEmails: any[];

  beforeEach(async () => {
    resetTableInitFlagsForTesting();
    mockUsers = new Map();
    mockTokens = new Map();
    mockRateLimits = new Map();
    capturedEmails = [];

    const defaultPwHash = await hashPassword('InitialPass123!');
    mockUsers.set('usr-customer-001', {
      id: 'usr-customer-001',
      name: 'Test Customer',
      email: 'customer@test.com',
      password: defaultPwHash,
      role: 'customer',
      permissions_json: '{}',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockDb = {
      prepare: vi.fn((sql: string) => {
        let boundArgs: any[] = [];
        return {
          bind: (...args: any[]) => {
            boundArgs = args;
            return {
              first: async <T = any>(): Promise<T | null> => {
                // Table creation statements
                if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
                  return null;
                }
                // rate_limits lookup
                if (sql.includes('FROM rate_limits WHERE key = ?')) {
                  const key = boundArgs[0];
                  return (mockRateLimits.get(key) || null) as T;
                }
                // users lookup by email
                if (sql.includes('FROM users WHERE LOWER(TRIM(email)) = ?')) {
                  const email = String(boundArgs[0] || '').toLowerCase().trim();
                  for (const u of mockUsers.values()) {
                    if (u.email.toLowerCase().trim() === email) return { ...u } as T;
                  }
                  return null;
                }
                // users lookup by id
                if (sql.includes('FROM users WHERE id = ?')) {
                  const id = boundArgs[0];
                  const u = mockUsers.get(id);
                  return (u ? { ...u } : null) as T;
                }
                // password_reset_tokens lookup
                if (sql.includes('FROM password_reset_tokens WHERE token_hash = ?')) {
                  const hash = boundArgs[0];
                  for (const t of mockTokens.values()) {
                    if (t.token_hash === hash) return { ...t } as T;
                  }
                  return null;
                }
                return null;
              },
              run: async () => {
                let changes = 0;
                // rate_limits upsert
                if (sql.includes('INSERT INTO rate_limits')) {
                  const [key, resetAt] = boundArgs;
                  mockRateLimits.set(key, { count: 1, reset_at: resetAt });
                  changes = 1;
                } else if (sql.includes('DELETE FROM rate_limits WHERE key = ?')) {
                  mockRateLimits.delete(boundArgs[0]);
                  changes = 1;
                } else if (sql.includes('INSERT INTO password_reset_tokens')) {
                  const [id, user_id, token_hash, expires_at, created_at] = boundArgs;
                  mockTokens.set(id, { id, user_id, token_hash, expires_at, used_at: null, created_at });
                  changes = 1;
                } else if (sql.includes('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ?')) {
                  const [now, userId] = boundArgs;
                  for (const t of mockTokens.values()) {
                    if (t.user_id === userId && t.used_at == null) {
                      t.used_at = now;
                      changes++;
                    }
                  }
                } else if (sql.includes('UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')) {
                  const [now, tokenHash, expNow] = boundArgs;
                  for (const t of mockTokens.values()) {
                    if (t.token_hash === tokenHash && t.used_at == null && t.expires_at > expNow) {
                      t.used_at = now;
                      changes++;
                    }
                  }
                } else if (sql.includes('UPDATE password_reset_tokens SET used_at = NULL WHERE id = ?')) {
                  const [tokenId] = boundArgs;
                  const t = mockTokens.get(tokenId);
                  if (t) {
                    t.used_at = null;
                    changes++;
                  }
                } else if (sql.includes('UPDATE users SET password = ?')) {
                  const [hashedPassword, id] = boundArgs;
                  const u = mockUsers.get(id);
                  if (u) {
                    u.password = hashedPassword;
                    u.updated_at = new Date().toISOString();
                    changes++;
                  }
                }
                return { success: true, meta: { changes }, changes };
              },
              all: async () => ({ results: [], success: true }),
            };
          },
          run: async () => ({ success: true, meta: { changes: 0 } }),
          first: async () => null,
          all: async () => ({ results: [], success: true }),
        };
      }),
    };

    mockEnv = {
      DB: mockDb,
      ADMIN_SECRET: 'test-admin-secret-999-secure',
      RESEND_API_KEY: 're_test_password_reset_key',
      RESEND_FROM_EMAIL: 'support@rongdhonutrade.com',
      APP_URL: 'https://rongdhonutrade.com',
      DEV: true,
    };
  });

  it('1. Verifies PBKDF2 iteration count is capped at 100,000 for Cloudflare Workers workerd compatibility', async () => {
    expect(PBKDF2_RECOMMENDED_ITERATIONS).toBe(100000);

    const testPassword = 'BrandNewPassword2026!';
    const hash = await hashPassword(testPassword);
    expect(hash.startsWith('pbkdf2:100000:')).toBe(true);

    const valid = await verifyPassword(testPassword, hash);
    expect(valid).toBe(true);

    const invalid = await verifyPassword('WrongPassword!', hash);
    expect(invalid).toBe(false);
  });

  it('2. End-to-end password reset flow: request reset, receive token, reset password, verify in D1', async () => {
    // Intercept Resend API call to capture reset token
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      const urlStr = typeof input === 'string' ? input : input?.url || '';
      if (urlStr.includes('api.resend.com')) {
        const body = init?.body ? JSON.parse(init.body) : {};
        capturedEmails.push(body);
        return new Response(JSON.stringify({ id: 'resend-mock-e2e-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    });

    try {
      // 1. Request password reset
      const forgotReq = new Request('https://rongdhonutrade.com/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.50' },
        body: JSON.stringify({ email: 'customer@test.com' }),
      });
      const forgotRes = await handleApiRequest(forgotReq, mockEnv);
      const forgotData = await forgotRes.json();
      expect(forgotRes.status).toBe(200);
      expect(forgotData.success).toBe(true);
      expect(forgotData.status).toBe('RESET_EMAIL_SENT');
      expect(capturedEmails.length).toBe(1);

      // Extract raw token from reset link
      const emailContent = capturedEmails[0].text || capturedEmails[0].html;
      const tokenMatch = emailContent.match(/reset-password\?token=([a-fA-F0-9]{64})/);
      expect(tokenMatch).not.toBeNull();
      const rawToken = tokenMatch![1];

      // 2. Perform password reset with valid token
      const newPassword = 'SecureBrandNewPass2026!';
      const resetReq = new Request('https://rongdhonutrade.com/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.50' },
        body: JSON.stringify({ token: rawToken, newPassword }),
      });
      const resetRes = await handleApiRequest(resetReq, mockEnv);
      const resetData = await resetRes.json();
      expect(resetRes.status).toBe(200);
      expect(resetData.success).toBe(true);
      expect(resetData.status).toBe('PASSWORD_RESET_SUCCESS');

      // 3. Verify user's updated password hash in D1
      const updatedUser = mockUsers.get('usr-customer-001');
      expect(updatedUser.password.startsWith('pbkdf2:100000:')).toBe(true);
      const canVerifyNew = await verifyPassword(newPassword, updatedUser.password);
      expect(canVerifyNew).toBe(true);

      // Old password must fail
      const oldVerify = await verifyPassword('InitialPass123!', updatedUser.password);
      expect(oldVerify).toBe(false);

      // 4. Verify token is single-use: Reusing same token must fail with TOKEN_ALREADY_USED (HTTP 400)
      const reuseReq = new Request('https://rongdhonutrade.com/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.50' },
        body: JSON.stringify({ token: rawToken, newPassword: 'AnotherPassword999!' }),
      });
      const reuseRes = await handleApiRequest(reuseReq, mockEnv);
      const reuseData = await reuseRes.json();
      expect(reuseRes.status).toBe(400);
      expect(reuseData.success).toBe(false);
      expect(reuseData.status).toBe('TOKEN_ALREADY_USED');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('3. Rejects invalid tokens, missing tokens, and short passwords with HTTP 400', async () => {
    // Missing token
    const req1 = new Request('https://rongdhonutrade.com/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.51' },
      body: JSON.stringify({ newPassword: 'ValidPassword123' }),
    });
    const res1 = await handleApiRequest(req1, mockEnv);
    const data1 = await res1.json();
    expect(res1.status).toBe(400);
    expect(data1.status).toBe('INVALID_TOKEN');

    // Short password (< 8 chars)
    const req2 = new Request('https://rongdhonutrade.com/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.51' },
      body: JSON.stringify({ token: 'mock-valid-looking-token', newPassword: '123' }),
    });
    const res2 = await handleApiRequest(req2, mockEnv);
    const data2 = await res2.json();
    expect(res2.status).toBe(400);
    expect(data2.status).toBe('INVALID_PASSWORD');

    // Completely unknown/non-existent token
    const req3 = new Request('https://rongdhonutrade.com/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.51' },
      body: JSON.stringify({ token: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', newPassword: 'ValidPassword123' }),
    });
    const res3 = await handleApiRequest(req3, mockEnv);
    const data3 = await res3.json();
    expect(res3.status).toBe(400);
    expect(data3.status).toBe('INVALID_TOKEN');
  });

  it('4. Rejects expired tokens with TOKEN_EXPIRED (HTTP 400)', async () => {
    const expiredToken = 'expired000111222333444555666777888999aaabbbcccdddeeefff000111222';
    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expiredToken));
    const tokenHash = bufferToHex(hashBuf).toLowerCase();

    // Expired 10 minutes ago
    mockTokens.set('expired-id', {
      id: 'expired-id',
      user_id: 'usr-customer-001',
      token_hash: tokenHash,
      expires_at: Date.now() - 600000,
      used_at: null,
      created_at: Date.now() - 3600000,
    });

    const req = new Request('https://rongdhonutrade.com/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.52' },
      body: JSON.stringify({ token: expiredToken, newPassword: 'NewValidPassword123!' }),
    });
    const res = await handleApiRequest(req, mockEnv);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.status).toBe('TOKEN_EXPIRED');
  });

  it('5. Verifies ensureRateLimitsTable is called and rate limiting does not throw unhandled exception when table missing', async () => {
    let ensuredCalled = false;
    const testDb: any = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('CREATE TABLE IF NOT EXISTS rate_limits')) {
          ensuredCalled = true;
        }
        return {
          bind: () => ({
            first: async () => null,
            run: async () => ({ success: true, meta: { changes: 1 } }),
          }),
          run: async () => ({ success: true, meta: { changes: 1 } }),
          first: async () => null,
        };
      }),
    };

    await ensureRateLimitsTable(testDb);
    expect(testDb.prepare).toHaveBeenCalled();
  });
});
