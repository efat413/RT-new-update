import { UserAccount } from '../types';

const API_BASE = '/api';

export type AuthUnauthorizedListener = (details: { url: string; error?: string }) => void;
const unauthorizedListeners = new Set<AuthUnauthorizedListener>();

export function onAuthUnauthorized(listener: AuthUnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

/**
 * Completely purges all legacy browser storage tokens and caches.
 * Ensures the browser CANNOT read or store any authentication tokens.
 */
export function purgeLegacyTokens(includeUserSession: boolean = false): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.toLowerCase().includes('token') || (k.toLowerCase().includes('auth') && k !== 'rongdhonu_admin_auth_v1'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });

    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && (k.toLowerCase().includes('token') || k.toLowerCase().includes('auth'))) {
        sessionKeysToRemove.push(k);
      }
    }
    sessionKeysToRemove.forEach((k) => {
      try { sessionStorage.removeItem(k); } catch {}
    });

    localStorage.removeItem('rongdhonu_current_user_v2');
    localStorage.removeItem('rongdhonu_super_admin_pwd');

    if (includeUserSession) {
      localStorage.removeItem('rongdhonu_admin_auth_v1');
      localStorage.removeItem('rongdhonu_current_user');
    }
  } catch {}
}

// Automatically purge any stale legacy tokens from storage on script execution
purgeLegacyTokens();

export function isSessionUnauthorizedError(status: number, errorMsg?: string): boolean {
  if (status !== 401) return false;
  const msg = (errorMsg || '').toLowerCase();
  if (
    msg.includes('current password') ||
    msg.includes('password does not match') ||
    msg.includes('invalid email/username or password') ||
    msg.includes('invalid credentials')
  ) {
    return false;
  }
  return true;
}

export function notifyAuthUnauthorized(details: { url: string; error?: string }): void {
  purgeLegacyTokens(true);

  // Notify registered listeners (e.g. StoreContext)
  unauthorizedListeners.forEach((listener) => {
    try {
      listener(details);
    } catch (e) {
      console.error('Error in onAuthUnauthorized listener:', e);
    }
  });

  // Dispatch custom window event for decoupled listeners
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rongdhonu_auth_unauthorized', { detail: details }));
  }
}

/**
 * Deprecated compatibility stubs for legacy call sites.
 * Security Hardening: The browser does NOT store or read the authentication token.
 * All authentication relies exclusively on the HttpOnly cookie.
 */
export function getAuthToken(): string | null {
  return null;
}
export function setAuthToken(_token: string | null): void {
  // No-op: Browser storage of auth token is completely removed.
}
export function removeAuthToken(): void {
  purgeLegacyTokens();
}

let activeMePromise: Promise<{ success: boolean; user?: UserAccount; status?: number; error?: string }> | null = null;
let cachedMeResult: {
  data: { success: boolean; user?: UserAccount; status?: number; error?: string };
  timestamp: number;
} | null = null;

const ME_CACHE_TTL_MS = 30 * 1000; // 30 seconds safe session cache

export const authApi = {
  clearCache(): void {
    cachedMeResult = null;
  },

  /**
   * Logs in a user or admin using email/username and password.
   * Authentication token is securely managed exclusively via HttpOnly cookie.
   * Raw token is NEVER returned in the JSON payload or stored in localStorage/sessionStorage.
   */
  async login(
    usernameOrEmail: string,
    password: string
  ): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
    cachedMeResult = null;
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        body: JSON.stringify({ usernameOrEmail, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || `Login failed (HTTP ${res.status})`,
        };
      }

      return {
        success: true,
        user: data.user,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error during login',
      };
    }
  },

  /**
   * Registers a new customer account.
   * Authentication token is securely set as an HttpOnly cookie and never exposed in JSON.
   */
  async register(data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<{ success: boolean; user?: UserAccount; error?: string }> {
    cachedMeResult = null;
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        body: JSON.stringify(data),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok || !resData.success) {
        return {
          success: false,
          error: resData.error || `Registration failed (HTTP ${res.status})`,
        };
      }

      cachedMeResult = {
        data: { success: true, status: res.status, user: resData.user },
        timestamp: Date.now(),
      };

      return {
        success: true,
        user: resData.user,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error during registration',
      };
    }
  },

  /**
   * Fetches the current authenticated user from the server using the HttpOnly cookie.
   * Does NOT require or send an Authorization header.
   */
  async me(options?: { force?: boolean }): Promise<{ success: boolean; user?: UserAccount; status?: number; error?: string }> {
    if (!options?.force && cachedMeResult && (Date.now() - cachedMeResult.timestamp < ME_CACHE_TTL_MS)) {
      return cachedMeResult.data;
    }

    if (activeMePromise) {
      return activeMePromise;
    }

    activeMePromise = (async () => {
      try {
        const effectiveUrl = typeof window === 'undefined'
          ? `http://localhost:3000${API_BASE}/auth/me`
          : `${API_BASE}/auth/me`;

        const res = await fetch(effectiveUrl, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          const errorMsg = data.error || `HTTP ${res.status}: Failed to authenticate session`;
          const failResult = { success: false, status: res.status, error: errorMsg };
          cachedMeResult = { data: failResult, timestamp: Date.now() };
          return failResult;
        }

        const successResult = { success: true, status: res.status, user: data.user };
        cachedMeResult = { data: successResult, timestamp: Date.now() };
        return successResult;
      } catch (err: any) {
        return { success: false, error: err?.message || 'Network error fetching user' };
      } finally {
        activeMePromise = null;
      }
    })();

    return activeMePromise;
  },

  /**
   * Updates user password on the server.
   * Authentication is verified via HttpOnly cookie; rotated cookie is set by server.
   */
  async changePassword(
    newPassword: string,
    oldPassword?: string
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    cachedMeResult = null;
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPassword, oldPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || data.message || 'Failed to change password';
        if (isSessionUnauthorizedError(res.status, errorMsg)) {
          notifyAuthUnauthorized({ url: `${API_BASE}/auth/change-password`, error: errorMsg });
        }
        return { success: false, error: errorMsg, message: errorMsg };
      }

      return { success: true, message: data.message || 'Password changed successfully' };
    } catch (err: any) {
      const msg = err?.message || 'Network error changing password';
      return { success: false, error: msg, message: msg };
    }
  },

  async forgotPassword(
    email: string
  ): Promise<{ success: boolean; status?: string; message: string; error?: string }> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await res.json().catch(() => ({}));
      const status = typeof data.status === 'string' ? data.status : undefined;

      if (res.status === 429 || status === 'RATE_LIMITED') {
        const msg = 'Too many password reset requests. Please try again later.';
        return {
          success: false,
          status: 'RATE_LIMITED',
          error: msg,
          message: msg,
        };
      }

      if (res.status === 400 || status === 'INVALID_EMAIL') {
        const msg = 'Please enter a valid email address.';
        return {
          success: false,
          status: 'INVALID_EMAIL',
          error: msg,
          message: msg,
        };
      }

      if (!res.ok || data.success === false) {
        const msg = 'Unable to process password reset request right now. Please try again later.';
        return {
          success: false,
          status: status || 'ERROR',
          error: msg,
          message: msg,
        };
      }

      return {
        success: true,
        status: status || 'RESET_EMAIL_SENT',
        message: data.message || 'If the account exists, password reset instructions have been sent.',
      };
    } catch {
      const msg = 'Network error. Please check your connection and try again.';
      return {
        success: false,
        status: 'NETWORK_ERROR',
        error: msg,
        message: msg,
      };
    }
  },

  async resetPassword(
    token: string,
    newPassword: string
  ): Promise<{ success: boolean; status?: string; message: string; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json().catch(() => ({}));
      const status = typeof data.status === 'string' ? data.status : undefined;

      if (res.status === 429 || status === 'RATE_LIMITED') {
        const msg = 'Too many password reset attempts. Please try again later.';
        return {
          success: false,
          status: 'RATE_LIMITED',
          error: msg,
          message: msg,
        };
      }

      if (!res.ok || !data.success) {
        let msg = 'Invalid or expired password reset link. Please request a new one.';
        if (status === 'TOKEN_ALREADY_USED') {
          msg = 'This password reset link has already been used. Please request a new one.';
        } else if (status === 'TOKEN_EXPIRED') {
          msg = 'This password reset link has expired (valid for 60 minutes). Please request a new one.';
        } else if (status === 'INVALID_PASSWORD') {
          msg = 'New password must be at least 6 characters long.';
        }
        return {
          success: false,
          status: status || 'INVALID_TOKEN',
          error: msg,
          message: msg,
        };
      }

      return {
        success: true,
        status: status || 'PASSWORD_RESET_SUCCESS',
        message: 'Your password has been successfully reset. You can now log in with your new password.',
      };
    } catch {
      const msg = 'Network error communicating with the server. Please try again.';
      return {
        success: false,
        status: 'NETWORK_ERROR',
        error: msg,
        message: msg,
      };
    }
  },

  /**
   * Logs out the user by calling server logout (clearing HttpOnly cookie)
   * and clearing in-memory client state.
   */
  async logout(): Promise<void> {
    purgeLegacyTokens(true);
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}
  },
};
