/**
 * Dedicated Admin API Client Service for Rongdhonu Trade
 * Strictly separated from customer/storefront operations.
 *
 * Guarantees:
 * 1. Synchronous Authorization Bearer token attachment alongside HttpOnly credentials ('include').
 * 2. Unconditional cache-busting headers ('Cache-Control: no-cache, no-store, must-revalidate')
 *    preventing Cloudflare Edge or browser from caching 401 responses or stale data.
 * 3. Clear separation of Genuine 401 (Session Expired) from Transient 5xx / Network Drops.
 */

import { UserAccount, Order, ProfitAnalyticsSummary, CourierApiConfig } from '../types';
import { getAuthToken, setAuthToken, removeAuthToken, isSessionUnauthorizedError } from './authApi';

const API_BASE = '/api';

export interface AdminApiResponse<T = any> {
  success: boolean;
  data?: T;
  user?: UserAccount;
  token?: string;
  error?: string;
  message?: string;
  status: number;
  isSessionExpired?: boolean;
  isTransientError?: boolean;
}

function getAdminHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...customHeaders,
  };
}

export const adminApi = {
  /**
   * Authenticates administrative credentials against the server.
   * Target endpoint: /api/admin/login (fallback: /api/auth/login)
   */
  async login(
    usernameOrEmail: string,
    password: string
  ): Promise<AdminApiResponse<UserAccount>> {
    const trimmedInput = usernameOrEmail.trim();
    const trimmedPassword = password.trim();

    if (!trimmedInput || !trimmedPassword) {
      return {
        success: false,
        error: 'Email or username and password are required.',
        status: 400,
      };
    }

    try {
      let res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        credentials: 'include',
        headers: getAdminHeaders(),
        body: JSON.stringify({ usernameOrEmail: trimmedInput, password: trimmedPassword }),
      });

      // Fallback to /api/auth/login if /api/admin/login route is not reachable
      if (res.status === 404) {
        res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          credentials: 'include',
          headers: getAdminHeaders(),
          body: JSON.stringify({ usernameOrEmail: trimmedInput, password: trimmedPassword }),
        });
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || `Login failed (HTTP ${res.status})`,
          status: res.status,
          isSessionExpired: false,
        };
      }

      const token = data.token;
      if (token) {
        setAuthToken(token);
      }

      return {
        success: true,
        user: data.user,
        token: data.token,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error during admin authentication.',
        status: 0,
        isTransientError: true,
      };
    }
  },

  /**
   * Logs out the active administrator, clearing server session cookie and client tokens.
   */
  async logout(): Promise<void> {
    removeAuthToken();
    try {
      await fetch(`${API_BASE}/admin/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: getAdminHeaders(),
      }).catch(async () => {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          headers: getAdminHeaders(),
        }).catch(() => {});
      });
    } catch {}
  },

  /**
   * Authoritatively verifies the current admin session with /api/auth/me.
   * Disables caching and forces fresh server round-trip.
   */
  async verifySession(options?: { force?: boolean }): Promise<AdminApiResponse<UserAccount>> {
    try {
      const res = await fetch(`${API_BASE}/auth/me?_t=${Date.now()}`, {
        method: 'GET',
        credentials: 'include',
        headers: getAdminHeaders(),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        const isExpired = res.status === 401;
        return {
          success: false,
          error: data.error || `Session verification failed (HTTP ${res.status})`,
          status: res.status,
          isSessionExpired: isExpired,
          isTransientError: res.status >= 500,
        };
      }

      return {
        success: true,
        user: data.user,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error during session verification.',
        status: 0,
        isTransientError: true,
      };
    }
  },

  /**
   * Fetches admin dashboard summary statistics with safe error handling.
   */
  async getDashboardSummary(): Promise<AdminApiResponse<any>> {
    try {
      const res = await fetch(`${API_BASE}/orders?page=1&limit=1&summaryOnly=true&_t=${Date.now()}`, {
        method: 'GET',
        credentials: 'include',
        headers: getAdminHeaders(),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || `HTTP ${res.status}`,
          status: res.status,
          isSessionExpired: res.status === 401,
          isTransientError: res.status >= 500,
        };
      }

      return {
        success: true,
        data: data.summary,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error fetching summary.',
        status: 0,
        isTransientError: true,
      };
    }
  },

  /**
   * Fetches admin audit logs with role and session verification.
   */
  async getAuditLogs(params?: { page?: number; limit?: number; action?: string }): Promise<AdminApiResponse<any>> {
    try {
      const query = new URLSearchParams();
      if (params?.page) query.set('page', String(params.page));
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.action) query.set('action', params.action);

      const res = await fetch(`${API_BASE}/admin/audit-logs?${query.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers: getAdminHeaders(),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || `HTTP ${res.status}`,
          status: res.status,
          isSessionExpired: res.status === 401,
          isTransientError: res.status >= 500,
        };
      }

      return {
        success: true,
        data,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error fetching audit logs.',
        status: 0,
        isTransientError: true,
      };
    }
  },
};
