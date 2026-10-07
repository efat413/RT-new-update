/**
 * Central Frontend Permission State & Helper
 * Part 3B-1 of Granular Admin RBAC for Rongdhonu Trade
 *
 * Implements centralized frontend permission evaluation extending Part 3A RBAC.
 * Note: Frontend permissions are only a temporary UI representation of server state.
 * The server remains authoritative for all actions and security boundaries.
 */

import {
  PERMISSION_KEYS,
  type PermissionKey,
  type GranularPermissions,
  type PermissionMetadata,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  isValidPermissionKey,
  isSuperAdminOnlyPermission,
  mapLegacyPermissionsToGranular,
} from '../server/permissions';
import { type UserAccount, type AdminPermissions, type UserRole } from '../types';

export {
  PERMISSION_KEYS,
  type PermissionKey,
  type GranularPermissions,
  type PermissionMetadata,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  isValidPermissionKey,
  isSuperAdminOnlyPermission,
};

/**
 * Evaluates whether an authenticated user has a specific granular or legacy permission.
 *
 * Role behavior:
 * - SUPER_ADMIN: Unconditional full authority (returns true for any permission).
 * - CUSTOMER: No admin permissions (returns false for all admin permissions).
 * - ADMIN / SUB_ADMIN: Evaluates individual server-provided permissions.
 *   - Missing permission: returns false.
 *   - Super Admin-only permissions: strictly returns false for non-super admins.
 *   - Permission exists and is true: returns true.
 *
 * Stale Permission Protection:
 * - When user is null/undefined (e.g. unauthenticated or loading), returns false.
 * - Does not read from or trust localStorage. Only authoritative server-provided state is evaluated.
 */
export function hasUserPermission(
  user: UserAccount | null | undefined,
  permission: PermissionKey | keyof AdminPermissions | string
): boolean {
  if (!user || !user.role) {
    return false;
  }

  // 1. SUPER_ADMIN: Full authority over all features and sensitive operations
  if (user.role === 'super_admin') {
    return true;
  }

  // 2. CUSTOMER: Zero admin permissions
  if (user.role === 'customer') {
    return false;
  }

  // 3. ADMIN & SUB_ADMIN: Strictly evaluated against individual permissions
  if (user.role === 'admin' || user.role === 'sub_admin') {
    const permStr = String(permission);

    // Non-super-admin accounts can NEVER execute Super Admin-only permissions
    if (isSuperAdminOnlyPermission(permStr as any)) {
      return false;
    }

    // Strict Financial Security: Any financial alias or cost/profit query is permanently Super Admin-only
    const normalizedKey = permStr.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      normalizedKey.includes('buyingprice') ||
      normalizedKey.includes('viewbuyingprice') ||
      normalizedKey.includes('managebuyingprice') ||
      normalizedKey.includes('unitprofit') ||
      normalizedKey.includes('viewprofit') ||
      normalizedKey.includes('reportprofit') ||
      normalizedKey.includes('reportfinancial') ||
      normalizedKey.includes('costprice') ||
      normalizedKey.includes('purchaseprice') ||
      normalizedKey.includes('productcost')
    ) {
      return false;
    }

    if (!user.permissions) {
      return false;
    }

    // Direct match on user.permissions
    if (permStr in user.permissions) {
      return Boolean(user.permissions[permStr]);
    }

    // Cross-alias checks for buying price and profit
    if (permStr === 'product.buying_price' || permStr === 'product.view_buying_price') {
      return Boolean(user.permissions['product.view_buying_price'] || user.permissions['product.buying_price']);
    }
    if (permStr === 'report.profit' || permStr === 'product.view_profit') {
      return Boolean(user.permissions['report.profit'] || user.permissions['product.view_profit']);
    }

    // Check granular key against legacy mapping if not directly specified
    if (isValidPermissionKey(permStr)) {
      if (user.permissions[permStr] !== undefined) {
        return Boolean(user.permissions[permStr]);
      }
      const mapped = mapLegacyPermissionsToGranular(user.permissions);
      return Boolean(mapped[permStr as PermissionKey]);
    }

    // Backward compatibility for legacy 5-flag checks
    if (permStr === 'canManageOrders') {
      return Boolean(
        user.permissions.canManageOrders ||
        user.permissions['order.manage'] ||
        user.permissions['order.status_change']
      );
    }
    if (permStr === 'canManageProducts') {
      return Boolean(
        user.permissions.canManageProducts ||
        user.permissions['product.create'] ||
        user.permissions['product.update']
      );
    }
    if (permStr === 'canManageCategories') {
      return Boolean(
        user.permissions.canManageCategories ||
        user.permissions['category.manage']
      );
    }
    if (permStr === 'canManageAccounts') {
      return Boolean(
        user.permissions.canManageAccounts ||
        user.permissions['user.view'] ||
        user.permissions['customer.manage']
      );
    }
    if (permStr === 'canManageSettings') {
      return Boolean(
        user.permissions.canManageSettings ||
        user.permissions['slider.manage'] ||
        user.permissions['coupon.manage'] ||
        user.permissions['courier.configure']
      );
    }

    return false;
  }

  return false;
}

/**
 * Shorthand alias for hasUserPermission (can)
 */
export const canUser = hasUserPermission;
