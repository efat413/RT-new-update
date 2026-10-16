import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminApi } from '../src/services/adminApi';
import { setAuthToken, getAuthToken, removeAuthToken, authApi } from '../src/services/authApi';

describe('Admin Auth Lifecycle & Re-Login Resilience', () => {
  beforeEach(() => {
    removeAuthToken();
    authApi.clearCache();
    vi.restoreAllMocks();
  });

  it('adminApi attaches Authorization Bearer and cache-busting headers to protected requests', async () => {
    setAuthToken('test-admin-jwt-token-xyz');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, user: { id: 'admin-1', role: 'super_admin' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await adminApi.verifySession({ force: true });
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1].headers;

    expect(headers['Authorization']).toBe('Bearer test-admin-jwt-token-xyz');
    expect(headers['Cache-Control']).toContain('no-cache');
    expect(headers['Cache-Control']).toContain('no-store');
    expect(callArgs[1].credentials).toBe('include');
  });

  it('adminApi.verifySession classifies 401 as isSessionExpired: true without throwing', async () => {
    setAuthToken('expired-jwt');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: 'Unauthorized: Session expired.' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await adminApi.verifySession({ force: true });
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
    expect(result.isSessionExpired).toBe(true);
    expect(result.isTransientError).toBe(false);
  });

  it('adminApi.verifySession classifies 500 as isTransientError: true without invalidating tokens', async () => {
    setAuthToken('valid-admin-jwt');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: 'Internal server error.' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await adminApi.verifySession();
    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.isTransientError).toBe(true);
    expect(result.isSessionExpired).toBe(false);

    // Verify token remains in storage and was NOT wiped by transient 500
    expect(getAuthToken()).toBe('valid-admin-jwt');
  });

  it('adminApi.login securely stores received token and clears cache', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        user: { id: 'super-admin-id', role: 'super_admin', email: 'admin@rongdhonutrade.com' },
        token: 'newly-issued-admin-jwt-30min',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const loginRes = await adminApi.login('admin', 'admin123');
    expect(loginRes.success).toBe(true);
    expect(loginRes.token).toBe('newly-issued-admin-jwt-30min');
    expect(getAuthToken()).toBe('newly-issued-admin-jwt-30min');
  });

  it('authApi.me does not cache 401 failures, unblocking subsequent re-login', async () => {
    // 1. Initial 401
    const mockFetch401 = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: 'Unauthorized' }),
    });
    vi.stubGlobal('fetch', mockFetch401);

    const firstCheck = await authApi.me();
    expect(firstCheck.success).toBe(false);
    expect(firstCheck.status).toBe(401);

    // 2. Re-login occurs, issuing valid session
    const mockFetch200 = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, user: { id: 'admin-1', role: 'super_admin' } }),
    });
    vi.stubGlobal('fetch', mockFetch200);

    // Calling me() must immediately perform network check instead of returning stale cached 401!
    const secondCheck = await authApi.me();
    expect(secondCheck.success).toBe(true);
    expect(secondCheck.user?.role).toBe('super_admin');
  });
});
