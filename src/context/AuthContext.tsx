import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { UserAccount, UserRole, AdminPermissions } from '../types';
import { authApi, onAuthUnauthorized } from '../services/authApi';
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved =
        localStorage.getItem(STORAGE_KEYS.CURRENT_USER) ||
        localStorage.getItem('rongdhonu_current_user') ||
        localStorage.getItem('rongdhonu_current_user_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(false);
  const [isAuthInitializing, setIsAuthInitializing] = useState<boolean>(true);
  const hadActiveSessionRef = useRef<boolean>(false);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup' | 'forgot-password'>('login');

  // Verify server session via /api/auth/me on startup
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      setIsAuthInitializing(true);

      try {
        const res = await authApi.me();
        if (isMounted) {
          if (res.success && res.user) {
            hadActiveSessionRef.current = true;
            setCurrentUser(res.user);
            const isPrivileged =
              res.user.role === 'admin' ||
              res.user.role === 'super_admin' ||
              res.user.role === 'sub_admin';

            setIsAdminLoggedIn(isPrivileged);
            try {
              if (isPrivileged) {
                localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
              } else {
                localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
              }
              localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(res.user));
            } catch {}
          } else {
            hadActiveSessionRef.current = false;
            setCurrentUser(null);
            setIsAdminLoggedIn(false);
            try {
              localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
              localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
              localStorage.removeItem('rongdhonu_current_user');
              localStorage.removeItem('rongdhonu_current_user_v2');
              localStorage.setItem('rongdhonu_admin_auth_v1', 'false');
            } catch {}
          }
        }
      } catch {
        if (isMounted) {
          hadActiveSessionRef.current = false;
          setCurrentUser(null);
          setIsAdminLoggedIn(false);
        }
      } finally {
        if (isMounted) {
          setIsAuthInitializing(false);
        }
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // 401 Unauthorized Event Synchronization
  useEffect(() => {
    const unsubscribe = onAuthUnauthorized(() => {
      hadActiveSessionRef.current = false;
      setCurrentUser(null);
      setIsAdminLoggedIn(false);
      try {
        localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        localStorage.removeItem('rongdhonu_current_user');
        localStorage.removeItem('rongdhonu_current_user_v2');
        localStorage.setItem('rongdhonu_admin_auth_v1', 'false');
      } catch {}
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
        setCurrentUser(apiRes.user);
        const isPrivileged =
          apiRes.user.role === 'admin' ||
          apiRes.user.role === 'super_admin' ||
          apiRes.user.role === 'sub_admin';

        if (isPrivileged) {
          setIsAdminLoggedIn(true);
          try {
            localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
          } catch {}
        } else {
          setIsAdminLoggedIn(false);
        }

        try {
          localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(apiRes.user));
          localStorage.setItem('rongdhonu_current_user', JSON.stringify(apiRes.user));
        } catch {}

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

    if (!trimmedPassword || trimmedPassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters.' };
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
        setCurrentUser(regRes.user);
        setIsAdminLoggedIn(false);
        try {
          localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(regRes.user));
          localStorage.setItem('rongdhonu_current_user', JSON.stringify(regRes.user));
        } catch {}
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
    authApi.logout();
    setCurrentUser(null);
    setIsAdminLoggedIn(false);
    try {
      localStorage.removeItem('rongdhonu_current_user');
      localStorage.removeItem('rongdhonu_current_user_v2');
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
      localStorage.setItem('rongdhonu_admin_auth_v1', 'false');
    } catch (e) {
      console.error('Error on logout', e);
    }
  }, []);

  const adminLogin = useCallback(async (usernameOrEmail: string, password: string): Promise<boolean> => {
    const res = await loginUser(usernameOrEmail, password);
    if (res.success && res.user) {
      const isPrivileged =
        res.user.role === 'admin' ||
        res.user.role === 'super_admin' ||
        res.user.role === 'sub_admin';
      if (isPrivileged) {
        setIsAdminLoggedIn(true);
        try {
          localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
        } catch (e) {
          console.error(e);
        }
        return true;
      }
    }
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
    try {
      localStorage.setItem('rongdhonu_current_user', JSON.stringify(updatedUser));
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedUser));
    } catch (e) {
      console.error('Error saving updated current user', e);
    }

    usersApi.update(currentUser.id, updatedUser).catch(console.error);

    return { success: true, message: 'Profile updated successfully' };
  }, [currentUser]);

  const changeSuperAdminPassword = useCallback(async (
    newPassword: string,
    currentPassword?: string
  ): Promise<{ success: boolean; message: string }> => {
    const trimmedNew = newPassword.trim();
    if (!trimmedNew || trimmedNew.length < 6) {
      return { success: false, message: 'New password must be at least 6 characters long.' };
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
