import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Check,
  X,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Search,
  Package,
  ShoppingBag,
  Users,
  User,
  UserMinus,
  UserCheck,
  FolderTree,
  Sliders,
  Tag,
  Truck,
  BarChart3,
  Settings,
  FileText,
  Save,
  Info,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { STORAGE_KEYS } from '../../context/storageKeys';
import { usersApi } from '../../services/storeApi';
import {
  PERMISSION_KEYS,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  PERMISSIONS_METADATA,
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_SUB_ADMIN_PERMISSIONS,
  type PermissionKey,
} from '../../server/permissions';
import { type UserAccount, type UserRole } from '../../types';

interface PermissionManagementModalProps {
  targetUser: UserAccount | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess?: (updatedUser: UserAccount) => void;
}

interface PermissionGroupDefinition {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
  keys: PermissionKey[];
}

const PERMISSION_GROUPS: PermissionGroupDefinition[] = [
  {
    id: 'product',
    name: 'Product Management',
    icon: Package,
    description: 'Catalog browsing, adding, updating, and deleting products',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    keys: [
      'product.view',
      'product.create',
      'product.update',
      'product.delete',
      'product.view_buying_price',
      'product.manage_buying_price',
      'product.view_profit',
    ],
  },
  {
    id: 'order',
    name: 'Order Management',
    icon: ShoppingBag,
    description: 'Order lookup, editing delivery details, status progression, cancellation',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    keys: [
      'order.view',
      'order.manage',
      'order.status_change',
      'order.cancel',
      'order.delete',
      'orders.view_ip',
      'orders.block_ip',
    ],
  },
  {
    id: 'customer',
    name: 'Customer Management',
    icon: Users,
    description: 'Customer contact information, address records, and profile management',
    color: 'text-cyan-600 bg-cyan-50 border-cyan-200',
    keys: [
      'customer.view',
      'customer.manage',
      'customer.delete',
    ],
  },
  {
    id: 'category',
    name: 'Category Management',
    icon: FolderTree,
    description: 'Taxonomy, product categories, and catalog hierarchy',
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    keys: [
      'category.view',
      'category.manage',
    ],
  },
  {
    id: 'slider',
    name: 'Banner / Slider Management',
    icon: Sliders,
    description: 'Homepage promotional hero carousel banners and campaign slides',
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    keys: [
      'slider.view',
      'slider.manage',
    ],
  },
  {
    id: 'coupon',
    name: 'Coupon Management',
    icon: Tag,
    description: 'Promotional discount vouchers, minimum spend criteria, and activation',
    color: 'text-pink-600 bg-pink-50 border-pink-200',
    keys: [
      'coupon.view',
      'coupon.manage',
    ],
  },
  {
    id: 'courier',
    name: 'Courier Integration',
    icon: Truck,
    description: 'Steadfast courier API configuration, parcel booking, and live tracking',
    color: 'text-teal-600 bg-teal-50 border-teal-200',
    keys: [
      'courier.configure',
      'courier.booking',
      'courier.status_sync',
      'courier.tracking',
    ],
  },
  {
    id: 'analytics',
    name: 'Reports / Analytics',
    icon: BarChart3,
    description: 'Store traffic, sales volume turnover, financial breakdown, and profit',
    color: 'text-violet-600 bg-violet-50 border-violet-200',
    keys: [
      'analytics.view',
      'report.sales',
      'report.financial',
      'report.profit',
    ],
  },
  {
    id: 'settings',
    name: 'Store Settings',
    icon: Settings,
    description: 'Store credentials, banking channels, anti-spam, and policies',
    color: 'text-rose-600 bg-rose-50 border-rose-200',
    keys: [
      'settings.manage',
    ],
  },
  {
    id: 'user',
    name: 'User / Admin Management',
    icon: Shield,
    description: 'Admin roster viewing, staff account management, and RBAC control',
    color: 'text-purple-600 bg-purple-50 border-purple-200',
    keys: [
      'user.view',
      'user.manage',
      'user.delete',
      'permission.manage',
    ],
  },
  {
    id: 'audit',
    name: 'Security & Audit Logs',
    icon: FileText,
    description: 'System event logs, dispatch audit trails, and permission update tracking',
    color: 'text-slate-600 bg-slate-100 border-slate-300',
    keys: [
      'audit_log.view',
    ],
  },
];

export const PermissionManagementModal: React.FC<PermissionManagementModalProps> = ({
  targetUser,
  isOpen,
  onClose,
  onSaveSuccess,
}) => {
  const { currentUser, setCurrentUser, hasPermission, showNotification, users, setUsers } = useStore();

  type ManageableRole = 'admin' | 'sub_admin' | 'customer';

  const [permissionsState, setPermissionsState] = useState<Record<string, boolean>>({});
  const [initialPermissionsState, setInitialPermissionsState] = useState<Record<string, boolean>>({});
  const [selectedRole, setSelectedRole] = useState<ManageableRole>('sub_admin');
  const [initialRole, setInitialRole] = useState<ManageableRole>('sub_admin');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [showConfirmSave, setShowConfirmSave] = useState<boolean>(false);
  const [showConfirmConvertToCustomer, setShowConfirmConvertToCustomer] = useState<boolean>(false);
  const [showUnsavedDiscardModal, setShowUnsavedDiscardModal] = useState<boolean>(false);

  // Authoritative Super Admin check
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const canManageRbac = isSuperAdmin && hasPermission('permission.manage');

  // Prevent modifying Super Admin accounts through ordinary permission editing
  const isTargetSuperAdmin =
    targetUser && targetUser.role === 'super_admin';

  // Load fresh permissions from server whenever targetUser or isOpen changes
  useEffect(() => {
    if (!isOpen || !targetUser || !canManageRbac || isTargetSuperAdmin) {
      return;
    }

    let isMounted = true;
    const fetchFreshPermissions = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const res = await usersApi.getPermissions(targetUser.id);
        if (isMounted) {
          const freshPerms: Record<string, boolean> = { ...(res.permissions || {}) };
          // Enforce super_admin_only permissions strictly false for display
          SUPER_ADMIN_ONLY_PERMISSIONS.forEach((k) => {
            freshPerms[k] = false;
          });

          setPermissionsState(freshPerms);
          setInitialPermissionsState(freshPerms);

          const validRole: ManageableRole =
            res.role === 'admin' ? 'admin' : res.role === 'customer' ? 'customer' : 'sub_admin';
          setSelectedRole(validRole);
          setInitialRole(validRole);
        }
      } catch (err: any) {
        if (isMounted) {
          // Graceful fallback to user.permissions if offline or mock
          const fallbackPerms: Record<string, boolean> = {
            ...((targetUser.permissions as any) || {}),
          };
          SUPER_ADMIN_ONLY_PERMISSIONS.forEach((k) => {
            fallbackPerms[k] = false;
          });
          setPermissionsState(fallbackPerms);
          setInitialPermissionsState(fallbackPerms);

          const fallbackRole: ManageableRole =
            targetUser.role === 'admin' ? 'admin' : targetUser.role === 'customer' ? 'customer' : 'sub_admin';
          setSelectedRole(fallbackRole);
          setInitialRole(fallbackRole);
          setErrorMessage(err?.message || 'Notice: Displaying cached permissions.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchFreshPermissions();
  }, [isOpen, targetUser?.id, canManageRbac, isTargetSuperAdmin]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (selectedRole !== initialRole) return true;
    if (selectedRole === 'customer') return false;
    for (const key of PERMISSION_KEYS) {
      if (SUPER_ADMIN_ONLY_PERMISSIONS.has(key)) continue;
      const current = Boolean(permissionsState[key]);
      const initial = Boolean(initialPermissionsState[key]);
      if (current !== initial) return true;
    }
    return false;
  }, [permissionsState, initialPermissionsState, selectedRole, initialRole]);

  // Handle closing with unsaved changes guard
  const handleAttemptClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedDiscardModal(true);
    } else {
      onClose();
    }
  };

  const handleForceClose = () => {
    setShowUnsavedDiscardModal(false);
    onClose();
  };

  // Toggle individual permission checkbox
  const togglePermission = (key: PermissionKey) => {
    if (selectedRole === 'customer') {
      return; // Locked while role is Customer
    }
    if (SUPER_ADMIN_ONLY_PERMISSIONS.has(key)) {
      return; // Locked permanently
    }
    setPermissionsState((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Apply default presets
  const applyPreset = (preset: 'admin' | 'sub_admin' | 'customer' | 'all' | 'clear') => {
    const next: Record<string, boolean> = {};

    if (preset === 'admin') {
      setSelectedRole('admin');
      Object.assign(next, DEFAULT_ADMIN_PERMISSIONS);
    } else if (preset === 'sub_admin') {
      setSelectedRole('sub_admin');
      Object.assign(next, DEFAULT_SUB_ADMIN_PERMISSIONS);
    } else if (preset === 'customer') {
      setSelectedRole('customer');
      PERMISSION_KEYS.forEach((k) => {
        next[k] = false;
      });
    } else if (preset === 'all') {
      if (selectedRole === 'customer') {
        setSelectedRole('sub_admin');
      }
      PERMISSION_KEYS.forEach((k) => {
        if (!SUPER_ADMIN_ONLY_PERMISSIONS.has(k)) {
          next[k] = true;
        }
      });
    } else if (preset === 'clear') {
      PERMISSION_KEYS.forEach((k) => {
        next[k] = false;
      });
    }

    // Always guarantee Super Admin-only permissions remain strictly false
    SUPER_ADMIN_ONLY_PERMISSIONS.forEach((k) => {
      next[k] = false;
    });

    setPermissionsState(next);
  };

  // Dedicated handler: Convert Admin/Sub-Admin into a regular Customer and revoke admin access
  const handleConvertToCustomer = async () => {
    if (!targetUser) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      // 1. Update user role to 'customer' and clear permissions on backend
      await usersApi.update(targetUser.id, {
        role: 'customer',
        permissions: null as any,
      });

      const updatedUserAccount: UserAccount = {
        ...targetUser,
        role: 'customer',
        permissions: undefined,
      };

      if (typeof setUsers === 'function') {
        setUsers((prevUsers) => {
          const baseList = Array.isArray(prevUsers) && prevUsers.length > 0 ? prevUsers : (users || []);
          return baseList.map((u) => (u.id === targetUser.id ? updatedUserAccount : u));
        });
      }

      // Sync active session if the edited user is the current user
      if (currentUser && currentUser.id === targetUser.id && typeof setCurrentUser === 'function') {
        setCurrentUser(updatedUserAccount);
      }

      // Persist to local storage
      try {
        const savedRaw = localStorage.getItem('rongdhonu_users_v2') || localStorage.getItem('rongdhonu_users');
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          if (Array.isArray(parsed)) {
            const nextList = parsed.map((u: any) => (u.id === targetUser.id ? updatedUserAccount : u));
            localStorage.setItem('rongdhonu_users_v2', JSON.stringify(nextList));
            localStorage.setItem('rongdhonu_users', JSON.stringify(nextList));
          }
        }
      } catch {}

      showNotification(
        'success',
        'Access Removed & Converted to Customer 👤',
        `Successfully removed administrative access for ${targetUser.name} and converted account to Customer.`
      );

      setShowConfirmConvertToCustomer(false);
      setShowConfirmSave(false);
      if (typeof onSaveSuccess === 'function') {
        try {
          onSaveSuccess(updatedUserAccount);
        } catch (callbackErr) {
          console.error('onSaveSuccess callback error:', callbackErr);
        }
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to convert user to Customer.');
      setShowConfirmConvertToCustomer(false);
      setShowConfirmSave(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Perform Save to backend API
  const handleConfirmSave = async () => {
    if (!targetUser) return;

    // If role is customer, delegate to handleConvertToCustomer
    if (selectedRole === 'customer') {
      return handleConvertToCustomer();
    }

    setIsSaving(true);
    setErrorMessage(null);

    // Sanitize payload: strip any super_admin_only permissions before sending
    const sanitizedPayload: Record<string, boolean> = {};
    for (const key of PERMISSION_KEYS) {
      if (!SUPER_ADMIN_ONLY_PERMISSIONS.has(key)) {
        sanitizedPayload[key] = Boolean(permissionsState[key]);
      }
    }

    try {
      // 1. If role changed, update role via usersApi.update first
      if (selectedRole !== targetUser.role) {
        await usersApi.update(targetUser.id, { role: selectedRole });
      }

      // 2. Call the server permission API
      const result = await usersApi.updatePermissions(targetUser.id, sanitizedPayload);

      // 3. Update local user list in StoreContext
      const updatedUserAccount: UserAccount = {
        ...targetUser,
        role: selectedRole,
        permissions: result.permissions || {
          ...sanitizedPayload,
          canManageOrders: Boolean(sanitizedPayload['order.manage'] || sanitizedPayload['order.status_change']),
          canManageProducts: Boolean(sanitizedPayload['product.create'] || sanitizedPayload['product.update']),
          canManageCategories: Boolean(sanitizedPayload['category.manage']),
          canManageAccounts: Boolean(sanitizedPayload['user.view'] || sanitizedPayload['customer.manage']),
          canManageSettings: false, // Super Admin only
        },
      };

      if (typeof setUsers === 'function') {
        setUsers((prevUsers) => {
          const baseList = Array.isArray(prevUsers) && prevUsers.length > 0 ? prevUsers : (users || []);
          return baseList.map((u) => (u.id === targetUser.id ? updatedUserAccount : u));
        });
      }

      // Sync currentUser if the edited user is the currently logged-in administrator
      if (currentUser && currentUser.id === targetUser.id && typeof setCurrentUser === 'function') {
        setCurrentUser(updatedUserAccount);
      }

      // Also persist to localStorage for consistent client session data
      try {
        const savedRaw = localStorage.getItem(STORAGE_KEYS.USERS) || localStorage.getItem('rongdhonu_users_v2');
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          if (Array.isArray(parsed)) {
            const nextList = parsed.map((u: any) => (u.id === targetUser.id ? updatedUserAccount : u));
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(nextList));
            if (localStorage.getItem('rongdhonu_users_v2')) {
              localStorage.removeItem('rongdhonu_users_v2');
            }
          }
        }
      } catch {}

      showNotification(
        'success',
        'Permissions Saved 🛡️',
        `Updated granular access permissions for ${targetUser.name} (${selectedRole.toUpperCase()}).`
      );

      setShowConfirmSave(false);
      if (typeof onSaveSuccess === 'function') {
        try {
          onSaveSuccess(updatedUserAccount);
        } catch (callbackErr) {
          console.error('onSaveSuccess callback error:', callbackErr);
        }
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save permissions. Server returned an error.');
      setShowConfirmSave(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !targetUser) {
    return null;
  }

  // Access denied guard for non-Super Admins
  if (!canManageRbac) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
        <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-red-200 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-800">Access Denied</h3>
            <p className="text-xs text-slate-500 mt-1">
              Only Master Super Administrators are authorized to view or configure granular RBAC permissions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Guard against editing Super Admin accounts
  if (isTargetSuperAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
        <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-amber-200 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-800">Super Admin Protected</h3>
            <p className="text-xs text-slate-600 mt-1">
              <strong>{targetUser.name}</strong> ({targetUser.email}) is a Master Super Administrator. Super Admin accounts maintain permanent, unconditional full authority and cannot be modified through ordinary permission editing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black transition-colors cursor-pointer"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    );
  }

  // Count active permissions (excluding super admin only)
  const activeCount = Object.keys(permissionsState).filter(
    (k) => permissionsState[k] && !SUPER_ADMIN_ONLY_PERMISSIONS.has(k as any)
  ).length;

  const totalConfigurableCount = PERMISSION_KEYS.filter(
    (k) => !SUPER_ADMIN_ONLY_PERMISSIONS.has(k)
  ).length;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
          {/* Header Accent Bar */}
          <div className="h-2 w-full bg-linear-to-r from-purple-600 via-indigo-600 to-rose-500 shrink-0" />

          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display font-bold text-base sm:text-lg text-slate-800">
                    Granular Permission Management
                  </h3>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                    RBAC Control
                  </span>
                  {hasUnsavedChanges && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                      Unsaved Changes
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Configure individual module capabilities for <strong>{targetUser.name}</strong> ({targetUser.email})
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAttemptClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Snapshot & Role Selection Toolbar */}
          <div className="px-4 sm:px-6 py-3.5 bg-slate-100/70 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
              <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-slate-400 font-medium">User:</span>
                <span className="font-bold text-slate-800">{targetUser.name}</span>
                <span className="text-slate-400 font-mono text-[11px]">({targetUser.email})</span>
              </div>

              <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-slate-400 font-medium">Role:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    id="role-btn-sub-admin"
                    onClick={() => {
                      setSelectedRole('sub_admin');
                      if (initialRole === 'sub_admin') {
                        setPermissionsState(initialPermissionsState);
                      } else {
                        applyPreset('sub_admin');
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedRole === 'sub_admin'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Sub Admin
                  </button>
                  <button
                    type="button"
                    id="role-btn-admin"
                    onClick={() => {
                      setSelectedRole('admin');
                      if (initialRole === 'admin') {
                        setPermissionsState(initialPermissionsState);
                      } else {
                        applyPreset('admin');
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedRole === 'admin'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Admin
                  </button>
                  <button
                    type="button"
                    id="role-btn-customer"
                    onClick={() => {
                      setSelectedRole('customer');
                      applyPreset('clear');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      selectedRole === 'customer'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    title="Convert to regular Customer without admin dashboard access"
                  >
                    <User className="w-3 h-3" />
                    <span>Customer</span>
                  </button>
                </div>
              </div>

              <span className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border ${
                selectedRole === 'customer'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'text-slate-500 bg-white border-slate-200'
              }`}>
                {selectedRole === 'customer' ? '0 Permissions (Customer Role)' : `${activeCount} of ${totalConfigurableCount} Active`}
              </span>
            </div>

            {/* Quick Action Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => applyPreset('admin')}
                className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                title="Apply standard Full Admin preset"
              >
                Admin Preset
              </button>
              <button
                type="button"
                onClick={() => applyPreset('sub_admin')}
                className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                title="Apply standard Sub-Admin preset"
              >
                Sub-Admin Preset
              </button>
              <button
                type="button"
                onClick={() => applyPreset('all')}
                disabled={selectedRole === 'customer'}
                className="px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200 transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                title="Grant all configurable permissions"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => applyPreset('clear')}
                className="px-2.5 py-1 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                title="Revoke all configurable permissions"
              >
                Clear
              </button>
              {(targetUser.role === 'admin' || targetUser.role === 'sub_admin') && (
                <button
                  type="button"
                  id="convert-to-customer-quick-btn"
                  onClick={() => setShowConfirmConvertToCustomer(true)}
                  className="px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Remove all administrative access and convert to Customer"
                >
                  <UserMinus className="w-3.5 h-3.5 text-amber-600" />
                  <span>Convert to Customer</span>
                </button>
              )}
            </div>
          </div>

          {/* Search Filter Bar */}
          <div className="px-4 sm:px-6 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
            <div className="relative w-full max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter permissions by name, key, or category..."
                className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Checked = Enabled</span>
              <span className="mx-1 text-slate-300">|</span>
              <span className="w-2 h-2 rounded-full bg-slate-300" />
              <span>Unchecked = Denied</span>
            </div>
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div className="m-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 shrink-0">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-semibold">{errorMessage}</span>
            </div>
          )}

          {/* Scrollable Permissions Body */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
            {/* Customer Role Access Revocation Notice */}
            {selectedRole === 'customer' && (
              <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300 flex items-start gap-3 shadow-2xs">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                  <UserMinus className="w-5 h-5" />
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-amber-900 text-sm">
                      Account Role Set to Customer (Access Revocation)
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-800 border border-amber-300">
                      No Admin Access
                    </span>
                  </div>
                  <p className="text-amber-800 leading-relaxed">
                    Storefront Customers have no access to the Admin Dashboard or any management modules. Saving will revoke all administrative permissions for <strong>{targetUser.name}</strong> ({targetUser.email}).
                  </p>
                  <p className="text-amber-700 text-[11px] font-medium">
                    Their user profile, shipping addresses, and shopping history will remain intact. You can restore admin access at any time by selecting Sub Admin or Admin above.
                  </p>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500 font-medium">Fetching authoritative permissions from database...</p>
              </div>
            ) : (
              PERMISSION_GROUPS.map((group) => {
                const GroupIcon = group.icon;

                // Filter keys if search is active
                const filteredKeys = group.keys.filter((key) => {
                  if (!searchFilter.trim()) return true;
                  const query = searchFilter.toLowerCase().trim();
                  const meta = PERMISSIONS_METADATA[key];
                  return (
                    key.toLowerCase().includes(query) ||
                    group.name.toLowerCase().includes(query) ||
                    (meta && meta.displayName.toLowerCase().includes(query)) ||
                    (meta && meta.description.toLowerCase().includes(query))
                  );
                });

                if (filteredKeys.length === 0) {
                  return null;
                }

                return (
                  <div
                    key={group.id}
                    className="p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-slate-50/50 space-y-3"
                  >
                    {/* Group Title */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-xl border ${group.color}`}>
                          <GroupIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-800">{group.name}</h4>
                          <p className="text-[11px] text-slate-500">{group.description}</p>
                        </div>
                      </div>
                    </div>

                    {/* Permissions Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                      {filteredKeys.map((key) => {
                        const meta = PERMISSIONS_METADATA[key];
                        const isLocked = SUPER_ADMIN_ONLY_PERMISSIONS.has(key);
                        const isChecked = isLocked ? false : Boolean(permissionsState[key]);
                        const isDisabled = isLocked || selectedRole === 'customer';

                        return (
                          <label
                            key={key}
                            id={`permission-row-${key}`}
                            className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition-all ${
                              isLocked
                                ? 'bg-slate-100/70 border-slate-200 text-slate-400 cursor-not-allowed opacity-80'
                                : selectedRole === 'customer'
                                ? 'bg-slate-100/50 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                                : isChecked
                                ? 'bg-purple-50/70 border-purple-300/80 shadow-2xs cursor-pointer hover:bg-purple-50'
                                : 'bg-white border-slate-200/90 hover:border-slate-300 cursor-pointer hover:bg-slate-50/50'
                            }`}
                          >
                            <div className="space-y-1 pr-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-xs font-bold ${isChecked && !isLocked && selectedRole !== 'customer' ? 'text-purple-950' : 'text-slate-800'}`}>
                                  {meta?.displayName || key}
                                </span>
                                <code className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-600">
                                  {key}
                                </code>
                                {isLocked && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                    <Lock className="w-3 h-3 text-amber-600" />
                                    <span>Super Admin Only</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 leading-tight">
                                {isLocked
                                  ? 'Permanently restricted to Master Super Administrator.'
                                  : selectedRole === 'customer'
                                  ? 'Disabled for Customer role (No admin privileges).'
                                  : meta?.description || 'Grant operational access for this feature.'}
                              </p>
                            </div>

                            <div className="shrink-0 pt-0.5">
                              {isLocked ? (
                                <div
                                  className="w-5 h-5 rounded-md bg-slate-200 flex items-center justify-center text-slate-400 border border-slate-300"
                                  title="Locked: Super Admin only"
                                >
                                  <Lock className="w-3 h-3" />
                                </div>
                              ) : (
                                <input
                                  type="checkbox"
                                  id={`checkbox-${key}`}
                                  checked={isChecked}
                                  disabled={isDisabled}
                                  onChange={() => togglePermission(key)}
                                  className={`w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 ${
                                    isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                                  }`}
                                />
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Modal Footer / Save Buttons */}
          <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <Info className="w-4 h-4 text-purple-600 shrink-0" />
              <span>
                {selectedRole === 'customer' ? (
                  <>Saving will remove all administrative capabilities and sign out active admin sessions for <strong>{targetUser.name}</strong>.</>
                ) : (
                  <>Changes apply immediately to <strong>{targetUser.name}</strong> upon their next API request or session refresh.</>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {(targetUser.role === 'admin' || targetUser.role === 'sub_admin') && selectedRole !== 'customer' && (
                <button
                  type="button"
                  id="footer-revoke-access-btn"
                  disabled={isSaving || isLoading}
                  onClick={() => setShowConfirmConvertToCustomer(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs border border-amber-300 transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                  title="Remove all administrative access and convert to Customer"
                >
                  <UserMinus className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden sm:inline">Remove Access & </span>Convert to Customer
                </button>
              )}

              <button
                type="button"
                onClick={handleAttemptClose}
                disabled={isSaving}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                id="save-permissions-btn"
                disabled={isSaving || isLoading}
                onClick={() => setShowConfirmSave(true)}
                className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs hover:shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${
                  selectedRole === 'customer'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{selectedRole === 'customer' ? 'Converting...' : 'Saving Permissions...'}</span>
                  </>
                ) : selectedRole === 'customer' ? (
                  <>
                    <UserMinus className="w-4 h-4" />
                    <span>Revoke Access & Save as Customer</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Permissions</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal Before Saving */}
      {showConfirmSave && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-purple-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${
              selectedRole === 'customer' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
            }`}>
              {selectedRole === 'customer' ? <UserMinus className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-base text-slate-800">
                {selectedRole === 'customer' ? 'Confirm Conversion to Customer?' : 'Confirm Permission Updates?'}
              </h3>
              <p className="text-xs text-slate-600">
                {selectedRole === 'customer'
                  ? `Revoke all administrative access for ${targetUser.name} and convert account to Customer?`
                  : `Save ${activeCount} active granular permissions for ${targetUser.name} as ${selectedRole.toUpperCase()}?`}
              </p>
            </div>

            <div className={`p-3 rounded-xl border text-xs space-y-1 text-left ${
              selectedRole === 'customer' ? 'bg-amber-50/70 border-amber-200 text-amber-900' : 'bg-purple-50/60 border-purple-200 text-purple-900'
            }`}>
              <div className="flex justify-between font-medium">
                <span>Target Account:</span>
                <span className="font-bold">{targetUser.name}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Account Email:</span>
                <span className="font-mono">{targetUser.email}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Configured Role:</span>
                <span className={`font-bold uppercase text-[10px] px-1.5 py-0.5 rounded ${
                  selectedRole === 'customer' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-purple-200 text-purple-900'
                }`}>
                  {selectedRole}
                </span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Administrative Access:</span>
                <span className="font-bold">
                  {selectedRole === 'customer' ? 'None (Revoked)' : `${activeCount} granted`}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmSave(false)}
                disabled={isSaving}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Review Again
              </button>

              <button
                type="button"
                id="confirm-save-permissions-btn"
                disabled={isSaving}
                onClick={handleConfirmSave}
                className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50 text-white ${
                  selectedRole === 'customer' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : selectedRole === 'customer' ? (
                  <span>Yes, Convert to Customer</span>
                ) : (
                  <span>Yes, Save Now</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal Specifically for Revoking Access & Converting to Customer */}
      {showConfirmConvertToCustomer && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-amber-300 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <UserMinus className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-base text-slate-800">
                Remove Access & Convert to Customer?
              </h3>
              <p className="text-xs text-slate-600">
                Are you sure you want to revoke all administrative access for <strong>{targetUser.name}</strong> and convert them into a regular storefront Customer?
              </p>
            </div>

            <div className="p-3.5 bg-amber-50/70 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1.5 text-left">
              <div className="flex justify-between font-medium">
                <span className="text-slate-500">Target User:</span>
                <span className="font-bold text-slate-800">{targetUser.name}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-slate-500">Email Address:</span>
                <span className="font-mono text-slate-800">{targetUser.email}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-slate-500">Current Role:</span>
                <span className="font-bold uppercase text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                  {targetUser.role}
                </span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-slate-500">New Role:</span>
                <span className="font-bold uppercase text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                  Customer
                </span>
              </div>
              <div className="pt-1.5 border-t border-amber-200/80 text-[11px] text-amber-800 space-y-0.5">
                <p className="font-semibold">⚠️ Consequences:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-amber-700">
                  <li>All admin panel login privileges and modular permissions will be permanently revoked.</li>
                  <li>Active admin management sessions will be terminated.</li>
                  <li>Account will become a standard storefront shopping and order account.</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmConvertToCustomer(false)}
                disabled={isSaving}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                id="confirm-convert-customer-btn"
                disabled={isSaving}
                onClick={handleConvertToCustomer}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <UserMinus className="w-4 h-4" />
                    <span>Yes, Convert to Customer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Discard Warning */}
      {showUnsavedDiscardModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-amber-200 text-center space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-base text-slate-800">
                Discard Unsaved Changes?
              </h3>
              <p className="text-xs text-slate-500">
                You have modified permission settings for <strong>{targetUser.name}</strong>. If you close now, your unsaved changes will be lost.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUnsavedDiscardModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Keep Editing
              </button>

              <button
                type="button"
                onClick={handleForceClose}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Discard & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
