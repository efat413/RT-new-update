import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { UserAccount, UserRole, AdminPermissions } from '../types';
import { adminApi, AdminApiResponse } from '../services/adminApi';
import { setAuthToken, removeAuthToken, getAuthToken, authApi } from '../services/authApi';
import { STORAGE_KEYS } from './storageKeys';
import { hasUserPermission } from '../utils/permissions';
import type { PermissionKey } from '../server/permissions';

export type AdminSessionStatus = 'unauthenticated' | 'authenticating' | 'authenticated' | 'expired';

export interface AdminAuthContextType {
  adminUser: UserAccount | null;
  isAdminAuthenticated: boolean;
  isAdminAuthInitializing: boolean;
  adminAuthError: string | null;
  sessionStatus: AdminSessionStatus;
  adminLogin: (usernameOrEmail: string, password: string) => Promise<{ success: boolean; message?: string; user?: UserAccount }>;
  adminLogout: (reason?: string) => void;
  verifyAdminSession: (force?: boolean) => Promise<UserAccount | null>;
  hasPermission: (permission: PermissionKey | keyof AdminPermissions | string) => boolean;
  can: (permission: PermissionKey | keyof AdminPermissions | string) => boolean;
  clearAdminError: () => void;
}

export const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes continuous inactivity
const ACTIVITY_THROTTLE_MS = 3000; // 3 seconds write throttle
const ADMIN_ACTIVITY_KEY = STORAGE_KEYS.ADMIN_LAST_ACTIVITY;

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Authoritative admin identity state
  const [adminUser, setAdminUser] = useState<UserAccount | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed &&
          (parsed.role === 'admin' || parsed.role === 'super_admin' || parsed.role === 'sub_admin')
        ) {
          return parsed;
        }
      }
    } catch {}
    return null;
  });

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const isAuthFlag = localStorage.getItem(STORAGE_KEYS.ADMIN_AUTH) === 'true';
      const token = getAuthToken();
      return Boolean(isAuthFlag && token);
    } catch {
      return false;
    }
  });

  const [isAdminAuthInitializing, setIsAdminAuthInitializing] = useState<boolean>(true);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<AdminSessionStatus>('unauthenticated');

  const isMountedRef = useRef<boolean>(true);
  const lastActivityRef = useRef<number>(Date.now());
  const isVerifyingRef = useRef<boolean>(false);

  const clearAdminError = useCallback(() => {
    setAdminAuthError(null);
  }, []);

  /**
   * Deterministic Authoritative Session Verification
   * Guarantees:
   * - Bypasses stale cached 401s via force=true.
   * - Sets isAuthenticated strictly when server verifies privileged admin role.
   * - Does NOT invalidate session on transient network or 5xx drops.
   */
  const verifyAdminSession = useCallback(async (force = false): Promise<UserAccount | null> => {
    if (isVerifyingRef.current) return adminUser;
    isVerifyingRef.current = true;

    try {
      // Clear legacy poisoned me cache if forced
      if (force) {
        authApi.clearCache();
      }

      const res = await adminApi.verifySession({ force });

      if (res.success && res.user) {
        const role = res.user.role;
        const isPrivileged = role === 'admin' || role === 'super_admin' || role === 'sub_admin';

        if (isPrivileged) {
          if (isMountedRef.current) {
            setAdminUser(res.user);
            setIsAdminAuthenticated(true);
            setSessionStatus('authenticated');
            setAdminAuthError(null);
          }
          try {
            localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
            localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(res.user));
            localStorage.setItem(ADMIN_ACTIVITY_KEY, Date.now().toString());
          } catch {}
          return res.user;
        }
      }

      // If genuine 401 / session expired
      if (res.status === 401) {
        if (isMountedRef.current) {
          setAdminUser(null);
          setIsAdminAuthenticated(false);
          setSessionStatus('expired');
        }
        try {
          localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
          localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        } catch {}
        return null;
      }

      // If transient network or 500 drop: Preserve local valid state if present, do NOT invalidate!
      return adminUser;
    } catch (err) {
      console.warn('[AdminAuth] Verification network drop:', err);
      return adminUser;
    } finally {
      isVerifyingRef.current = false;
      if (isMountedRef.current) {
        setIsAdminAuthInitializing(false);
      }
    }
  }, [adminUser]);

  /**
   * Deterministic Post-Login Initialization
   * Sequence strictly:
   * 1. Authenticate credentials via /api/admin/login
   * 2. Commit session/token synchronously to state & storage
   * 3. Authoritatively verify session
   * 4. Publish authenticated admin state to unblock protected queries
   */
  const adminLogin = useCallback(async (
    usernameOrEmail: string,
    password: string
  ): Promise<{ success: boolean; message?: string; user?: UserAccount }> => {
    const trimmedInput = usernameOrEmail.trim();
    const trimmedPassword = password.trim();

    if (!trimmedInput || !trimmedPassword) {
      setAdminAuthError('Please enter both email/username and password.');
      return { success: false, message: 'Please enter both email/username and password.' };
    }

    setSessionStatus('authenticating');
    setIsAdminAuthInitializing(true);
    setAdminAuthError(null);

    try {
      // 1. Authenticate credentials
      const apiRes = await adminApi.login(trimmedInput, trimmedPassword);

      if (!apiRes.success || !apiRes.user) {
        const errorMsg = apiRes.error || 'Invalid credentials. Check your admin email/username and password.';
        setSessionStatus('unauthenticated');
        setIsAdminAuthInitializing(false);
        setAdminAuthError(errorMsg);
        return { success: false, message: errorMsg };
      }

      const role = apiRes.user.role;
      const isPrivileged = role === 'admin' || role === 'super_admin' || role === 'sub_admin';

      if (!isPrivileged) {
        const errorMsg = 'Access Denied: Account does not possess administrative privileges.';
        setSessionStatus('unauthenticated');
        setIsAdminAuthInitializing(false);
        setAdminAuthError(errorMsg);
        return { success: false, message: errorMsg };
      }

      // 2. Commit session/token synchronously
      if (apiRes.token) {
        setAuthToken(apiRes.token);
      }

      try {
        localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(apiRes.user));
        localStorage.setItem(ADMIN_ACTIVITY_KEY, Date.now().toString());
      } catch {}

      // 3. Authoritatively verify authenticated admin session
      const verified = await verifyAdminSession(true);
      const activeUser = verified || apiRes.user;

      // 4. Authoritatively transition to authenticated state
      lastActivityRef.current = Date.now();
      setAdminUser(activeUser);
      setIsAdminAuthenticated(true);
      setSessionStatus('authenticated');
      setIsAdminAuthInitializing(false);
      setAdminAuthError(null);

      return { success: true, user: activeUser };
    } catch (err: any) {
      const errorMsg = err?.message || 'Authentication error. Please verify network connection.';
      setSessionStatus('unauthenticated');
      setIsAdminAuthInitializing(false);
      setAdminAuthError(errorMsg);
      return { success: false, message: errorMsg };
    }
  }, [verifyAdminSession]);

  /**
   * Clean Administrator Logout
   * Dispatches server invalidation, purges local credentials, and sets cleanly unauthenticated state.
   */
  const adminLogout = useCallback((reason?: string) => {
    try {
      localStorage.removeItem(ADMIN_ACTIVITY_KEY);
      localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    } catch {}

    adminApi.logout().catch(() => {});
    removeAuthToken();

    setAdminUser(null);
    setIsAdminAuthenticated(false);
    setIsAdminAuthInitializing(false);
    setSessionStatus(reason === 'timeout' ? 'expired' : 'unauthenticated');

    if (reason === 'timeout') {
      setAdminAuthError('You have been automatically logged out due to 30 minutes of inactivity. Please log in again.');
    } else if (reason) {
      setAdminAuthError(reason);
    } else {
      setAdminAuthError(null);
    }
  }, []);

  // --- Initial Mount Session Check ---
  useEffect(() => {
    isMountedRef.current = true;
    verifyAdminSession(true);

    return () => {
      isMountedRef.current = false;
    };
  }, [verifyAdminSession]);

  // --- INACTIVITY AUTO-LOGOUT (30 MINUTES CONTINUOUS INACTIVITY) ---
  useEffect(() => {
    if (!isAdminAuthenticated) return;

    let lastRecorded = Date.now();
    lastActivityRef.current = lastRecorded;
    try {
      localStorage.setItem(ADMIN_ACTIVITY_KEY, lastRecorded.toString());
    } catch {}

    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastRecorded > ACTIVITY_THROTTLE_MS) {
        lastRecorded = now;
        lastActivityRef.current = now;
        try {
          localStorage.setItem(ADMIN_ACTIVITY_KEY, now.toString());
        } catch {}
      }
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'pointerdown'];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });

    const interval = setInterval(() => {
      let lastActivityTime = lastRecorded;
      try {
        const stored = localStorage.getItem(ADMIN_ACTIVITY_KEY);
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (!isNaN(parsed)) {
            lastActivityTime = Math.max(lastActivityTime, parsed);
          }
        }
      } catch {}

      if (Date.now() - lastActivityTime >= INACTIVITY_TIMEOUT_MS) {
        // 30 minutes of inactivity reached!
        adminLogout('timeout');
      }
    }, 10000);

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === ADMIN_ACTIVITY_KEY && e.newValue) {
        const val = parseInt(e.newValue, 10);
        if (!isNaN(val)) {
          lastRecorded = Math.max(lastRecorded, val);
          lastActivityRef.current = lastRecorded;
        }
      } else if (e.key === STORAGE_KEYS.ADMIN_AUTH && e.newValue === null) {
        adminLogout();
      }
    };

    window.addEventListener('storage', handleStorageEvent);

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserActivity);
      });
      window.removeEventListener('storage', handleStorageEvent);
      clearInterval(interval);
    };
  }, [isAdminAuthenticated, adminLogout]);

  const hasPermission = useCallback(
    (permissionKey: PermissionKey | keyof AdminPermissions | string): boolean => {
      return hasUserPermission(adminUser, permissionKey);
    },
    [adminUser]
  );

  const contextValue: AdminAuthContextType = {
    adminUser,
    isAdminAuthenticated,
    isAdminAuthInitializing,
    adminAuthError,
    sessionStatus,
    adminLogin,
    adminLogout,
    verifyAdminSession,
    hasPermission,
    can: hasPermission,
    clearAdminError,
  };

  return (
    <AdminAuthContext.Provider value={contextValue}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = (): AdminAuthContextType => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};
