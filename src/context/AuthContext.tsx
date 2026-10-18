import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { UserAccount, UserRole, AdminPermissions, MIN_PASSWORD_LENGTH } from '../types';
import { authApi, onAuthUnauthorized, setAuthToken, removeAuthToken } from '../services/authApi';
import { usersApi } from '../services/storeApi';
import { hasUserPermission } from '../utils/permissions';
import type { PermissionKey } from '../server/permissions';
import { STORAGE_KEYS } from './storageKeys';

export interface AuthContextType {
  currentUser: UserAccount | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserAccount | null>>;
  isAdminLoggedIn: boolean;
  isAuthInitializing: boolean;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  authModalMode: 'login' | 'signup' | 'forgot-password';
  setAuthModalMode: (mode: 'login' | 'signup' | 'forgot-password') => void;
  verifySession?: (force?: boolean) => Promise<UserAccount | null>;
  loginUser: (emailOrUsername: string, password: string) => Promise<{ success: boolean; message?: string; user?: UserAccount }>;
  registerUser: (data: { name: string; email: string; password: string; phone?: string; role?: UserRole }) => Promise<{ success: boolean; message?: string; user?: UserAccount }>;
  logout: () => void;
  adminLogin: (username: string, password: string) => Promise<boolean>;
  adminLogout: () => void;
  hasPermission: (permission: PermissionKey | keyof AdminPermissions | string) => boolean;
  can: (permission: PermissionKey | keyof AdminPermissions | string) => boolean;
  updateCurrentUserProfile: (updatedData: Partial<UserAccount>) => { success: boolean; message: string };
  changeSuperAdminPassword: (newPassword: string, currentPassword?: string) => Promise<{ success: boolean; message: string }>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to determine if immediate authoritative auth verification is critical
function isImmediateAuthRequired(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const path = window.location.pathname;
    if (path.startsWith('/admin') || path === '/reset-password') return true;
    if (
      localStorage.getItem(STORAGE_KEYS.CURRENT_USER) ||
      localStorage.getItem(STORAGE_KEYS.ADMIN_AUTH) === 'true'
    ) {
      return true;
    }
  } catch {}
  return false;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Authoritative State: Identity and role are strictly resolved from server session (/api/auth/me)
  // Frontend localStorage provides instant layout preservation while background revalidation executes.
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && parsed.id) {
          return parsed;
        }
      }
    } catch {}
    return null;
  });

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.ADMIN_AUTH) === 'true';
    } catch {
      return false;
    }
  });

  // Only initialize in pending auth state if the visitor actually has a stored session or is on /admin
  // Anonymous storefront visitors start with isAuthInitializing: false immediately to unblock FCP / LCP!
  const [isAuthInitializing, setIsAuthInitializing] = useState<boolean>(() => {
    return isImmediateAuthRequired();
  });

  const hadActiveSessionRef = useRef<boolean>(false);
  const hasInitializedAuthRef = useRef<boolean>(false);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup' | 'forgot-password'>('login');

  const persistCurrentUserToStorage = (user: UserAccount | null) => {
    try {
      if (user) {
        const json = JSON.stringify(user);
        if (localStorage.getItem(STORAGE_KEYS.CURRENT_USER) !== json) {
          localStorage.setItem(STORAGE_KEYS.CURRENT_USER, json);
        }
        if (localStorage.getItem('rongdhonu_current_user_v2')) {
          localStorage.removeItem('rongdhonu_current_user_v2');
        }
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        if (localStorage.getItem('rongdhonu_current_user_v2')) {
          localStorage.removeItem('rongdhonu_current_user_v2');
        }
      }
    } catch {}
  };

  const persistAdminAuthToStorage = (isAdmin: boolean) => {
    try {
      if (isAdmin) {
        if (localStorage.getItem(STORAGE_KEYS.ADMIN_AUTH) !== 'true') {
          localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
        }
      } else {
        localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
      }
    } catch {}
  };

  // Authoritative server session verification via /api/auth/me
  const verifySession = useCallback(async (force = false): Promise<UserAccount | null> => {
    try {
      const res = await authApi.me({ force });
      if (res.success && res.user) {
        hadActiveSessionRef.current = true;
        setCurrentUser(res.user);
        const isPrivileged =
          res.user.role === 'admin' ||
          res.user.role === 'super_admin' ||
          res.user.role === 'sub_admin';

        setIsAdminLoggedIn(isPrivileged);
        persistAdminAuthToStorage(isPrivileged);
        persistCurrentUserToStorage(res.user);
        return res.user;
      } else {
        hadActiveSessionRef.current = false;
        setCurrentUser(null);
        setIsAdminLoggedIn(false);
        persistAdminAuthToStorage(false);
        persistCurrentUserToStorage(null);
        return null;
      }
    } catch {
      hadActiveSessionRef.current = false;
      setCurrentUser(null);
      setIsAdminLoggedIn(false);
      return null;
    } finally {
      setIsAuthInitializing(false);
    }
  }, []);

  // Smart Session Verification Orchestration:
  // - Immediate for returning users or /admin visitors
  // - Deferred to idle time (or user interaction) for anonymous storefront visitors
  useEffect(() => {
    if (hasInitializedAuthRef.current) return;

    if (isImmediateAuthRequired()) {
      hasInitializedAuthRef.current = true;
      verifySession();
      return;
    }

    // Anonymous visitor: Defer session discovery to browser idle time so it NEVER
    // blocks the initial homepage network requests, TTFB, or LCP.
    let cancelIdle: (() => void) | null = null;
    const scheduleDeferredCheck = () => {
      if (hasInitializedAuthRef.current) return;
      hasInitializedAuthRef.current = true;
      verifySession();
    };

    if (typeof window !== 'undefined') {
      if ('requestIdleCallback' in window) {
        const id = (window as any).requestIdleCallback(scheduleDeferredCheck, { timeout: 4000 });
        cancelIdle = () => (window as any).cancelIdleCallback(id);
      } else {
        const timer = setTimeout(scheduleDeferredCheck, 3500);
        cancelIdle = () => clearTimeout(timer);
      }
    }

    return () => {
      if (cancelIdle) cancelIdle();
    };
  }, [verifySession]);

  // On-demand session verification when user explicitly opens the authentication modal
  useEffect(() => {
    if (isAuthModalOpen && !hasInitializedAuthRef.current) {
      hasInitializedAuthRef.current = true;
      verifySession();
    }
  }, [isAuthModalOpen, verifySession]);

  // 401 Unauthorized Event Synchronization
  useEffect(() => {
    const unsubscribe = onAuthUnauthorized(() => {
      hadActiveSessionRef.current = false;
      setCurrentUser(null);
      setIsAdminLoggedIn(false);
      persistAdminAuthToStorage(false);
      persistCurrentUserToStorage(null);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const loginUser = useCallback(async (
    emailOrUsername: string,
    password: string
  ): Promise<{ success: boolean; message?: string; user?: UserAccount }> => {
    const trimmedInput = emailOrUsername.trim();
    const trimmedPassword = password.trim();

    if (!trimmedInput || !trimmedPassword) {
      return { success: false, message: 'Please enter both email/username and password.' };
    }

    try {
      const apiRes = await authApi.login(trimmedInput, trimmedPassword);
      if (apiRes.success && apiRes.user) {
        hadActiveSessionRef.current = true;
        const isPrivileged =
          apiRes.user.role === 'admin' ||
          apiRes.user.role === 'super_admin' ||
          apiRes.user.role === 'sub_admin';

        // Synchronously persist auth token and storage before publishing state to eliminate race condition
        if (apiRes.token) {
          setAuthToken(apiRes.token);
        }
        persistAdminAuthToStorage(isPrivileged);
        persistCurrentUserToStorage(apiRes.user);

        setIsAuthInitializing(false);
        setCurrentUser(apiRes.user);
        setIsAdminLoggedIn(isPrivileged);

        return { success: true, user: apiRes.user };
      }

      return {
        success: false,
        message: apiRes.error || 'Invalid email/username or password. Please verify and try again.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Authentication request failed. Please check network connection.',
      };
    }
  }, []);

  const registerUser = useCallback(async (data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role?: UserRole;
  }): Promise<{ success: boolean; message?: string; user?: UserAccount }> => {
    const trimmedName = data.name.trim();
    const trimmedEmail = data.email.trim().toLowerCase();
    const trimmedPassword = data.password.trim();

    if (!trimmedName) {
      return { success: false, message: 'Please enter your full name.' };
    }

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      return { success: false, message: 'Please provide a valid email address.' };
    }

    if (!trimmedPassword || trimmedPassword.length < MIN_PASSWORD_LENGTH) {
      return { success: false, message: 'Password must be at least 8 characters long.' };
    }

    try {
      const regRes = await authApi.register({
        name: trimmedName,
        email: trimmedEmail,
        password: trimmedPassword,
        phone: data.phone?.trim() || '',
      });

      if (regRes.success && regRes.user) {
        hadActiveSessionRef.current = true;
        if (regRes.token) {
          setAuthToken(regRes.token);
        }
        persistAdminAuthToStorage(false);
        persistCurrentUserToStorage(regRes.user);

        setIsAuthInitializing(false);
        setCurrentUser(regRes.user);
        setIsAdminLoggedIn(false);
        return { success: true, user: regRes.user };
      }

      return {
        success: false,
        message: regRes.error || 'Registration failed. Please try again.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Network error during registration.',
      };
    }
  }, []);

  const logout = useCallback(() => {
    hadActiveSessionRef.current = false;
    removeAuthToken();
    authApi.logout();
    setCurrentUser(null);
    setIsAdminLoggedIn(false);
    setIsAuthInitializing(false);
    persistAdminAuthToStorage(false);
    persistCurrentUserToStorage(null);
  }, []);

  const adminLogin = useCallback(async (usernameOrEmail: string, password: string): Promise<boolean> => {
    setIsAuthInitializing(true);
    const trimmedInput = usernameOrEmail.trim();
    const trimmedPassword = password.trim();

    if (!trimmedInput || !trimmedPassword) {
      setIsAuthInitializing(false);
      return false;
    }

    try {
      const apiRes = await authApi.adminLogin(trimmedInput, trimmedPassword);
      if (apiRes.success && apiRes.user) {
        hadActiveSessionRef.current = true;
        const isPrivileged =
          apiRes.user.role === 'admin' ||
          apiRes.user.role === 'super_admin' ||
          apiRes.user.role === 'sub_admin';

        if (apiRes.token) {
          setAuthToken(apiRes.token);
        }
        persistAdminAuthToStorage(isPrivileged);
        persistCurrentUserToStorage(apiRes.user);

        setIsAuthInitializing(false);
        setCurrentUser(apiRes.user);
        setIsAdminLoggedIn(isPrivileged);
        return isPrivileged;
      }
    } catch {}

    const res = await loginUser(trimmedInput, trimmedPassword);
    if (res.success && res.user) {
      const isPrivileged =
        res.user.role === 'admin' ||
        res.user.role === 'super_admin' ||
        res.user.role === 'sub_admin';
      if (isPrivileged) {
        persistAdminAuthToStorage(true);
        setIsAdminLoggedIn(true);
        setIsAuthInitializing(false);
        return true;
      }
    }
    setIsAuthInitializing(false);
    return false;
  }, [loginUser]);

  const adminLogout = useCallback(() => {
    logout();
  }, [logout]);

  const hasPermission = useCallback((permissionKey: PermissionKey | keyof AdminPermissions | string): boolean => {
    return hasUserPermission(currentUser, permissionKey);
  }, [currentUser]);

  const can = hasPermission;

  const updateCurrentUserProfile = useCallback((updatedData: Partial<UserAccount>) => {
    if (!currentUser) {
      return { success: false, message: 'No user is currently logged in' };
    }

    const updatedUser: UserAccount = {
      ...currentUser,
      ...updatedData,
      id: currentUser.id,
      role: currentUser.role,
      permissions: currentUser.permissions,
      createdAt: currentUser.createdAt,
    };

    setCurrentUser(updatedUser);
    persistCurrentUserToStorage(updatedUser);

    usersApi.update(currentUser.id, updatedUser).catch(console.error);

    return { success: true, message: 'Profile updated successfully' };
  }, [currentUser]);

  const changeSuperAdminPassword = useCallback(async (
    newPassword: string,
    currentPassword?: string
  ): Promise<{ success: boolean; message: string }> => {
    const trimmedNew = newPassword.trim();
    if (!trimmedNew || trimmedNew.length < MIN_PASSWORD_LENGTH) {
      return { success: false, message: 'New password must be at least 8 characters long.' };
    }

    if (!currentPassword || !currentPassword.trim()) {
      return { success: false, message: 'Current password is required to verify identity.' };
    }

    try {
      const res = await authApi.changePassword(trimmedNew, currentPassword.trim());
      if (!res.success) {
        return { success: false, message: res.error || 'Failed to update password.' };
      }

      try {
        localStorage.removeItem('rongdhonu_super_admin_pwd');
      } catch {}

      return { success: true, message: 'Super Admin password changed successfully!' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to update password on server.' };
    }
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    currentUser,
    setCurrentUser,
    isAdminLoggedIn,
    isAuthInitializing,
    isAuthModalOpen,
    setIsAuthModalOpen,
    authModalMode,
    setAuthModalMode,
    verifySession,
    loginUser,
    registerUser,
    logout,
    adminLogin,
    adminLogout,
    hasPermission,
    can,
    updateCurrentUserProfile,
    changeSuperAdminPassword,
  }), [
    currentUser,
    isAdminLoggedIn,
    isAuthInitializing,
    isAuthModalOpen,
    authModalMode,
    verifySession,
    loginUser,
    registerUser,
    logout,
    adminLogin,
    adminLogout,
    hasPermission,
    can,
    updateCurrentUserProfile,
    changeSuperAdminPassword,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
