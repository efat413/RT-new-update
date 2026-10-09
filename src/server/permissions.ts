/**
 * Central Permission Registry, Metadata, and Authorization Rules
 * Part 3A - Granular Admin RBAC for Rongdhonu Trade
 */

export const PERMISSION_KEYS = [
  // Product Permissions
  'product.view',
  'product.create',
  'product.update',
  'product.delete',
  'product.view_buying_price',
  'product.manage_buying_price',
  'product.buying_price',
  'product.view_profit',

  // Order Permissions
  'order.view',
  'order.manage',
  'order.status_change',
  'order.cancel',
  'order.delete',

  // Customer Permissions
  'customer.view',
  'customer.manage',
  'customer.delete',

  // Category Permissions
  'category.view',
  'category.manage',

  // Slider Permissions
  'slider.view',
  'slider.manage',

  // Coupon Permissions
  'coupon.view',
  'coupon.manage',

  // Review Permissions
  'review.view',
  'review.manage',
  'review.delete',
  'reviews.view',
  'reviews.create',
  'reviews.edit',
  'reviews.approve',
  'reviews.delete',

  // Courier Permissions
  'courier.configure',
  'courier.booking',
  'courier.status_sync',
  'courier.tracking',

  // Analytics & Reports Permissions
  'analytics.view',
  'report.sales',
  'report.financial',
  'report.profit',

  // User / Admin Management Permissions
  'user.view',
  'user.manage',
  'user.delete',
  'permission.manage',

  // Store Settings Permission
  'settings.manage',

  // Audit Log Permission
  'audit_log.view',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type GranularPermissions = Partial<Record<PermissionKey, boolean>>;

export interface PermissionMetadata {
  key: PermissionKey;
  group:
    | 'Product'
    | 'Order'
    | 'Customer'
    | 'Category'
    | 'Slider'
    | 'Coupon'
    | 'Review'
    | 'Courier'
    | 'Analytics / Reports'
    | 'User / Admin'
    | 'Store'
    | 'Audit'
    | 'Financial / Sensitive Data';
  displayName: string;
  description: string;
  superAdminOnly: boolean;
  sensitive: boolean;
  dangerous: boolean;
}

/**
 * Permanently Super Admin-only permissions.
 * Non-super admin accounts can NEVER be granted these permissions,
 * and the backend strictly rejects any attempt to assign or execute them.
 */
export const SUPER_ADMIN_ONLY_PERMISSIONS: ReadonlySet<PermissionKey> = new Set<PermissionKey>([
  'permission.manage',
  'user.manage',
  'user.delete',
  'settings.manage',
  'report.financial',
]);

/**
 * Authoritative Central Metadata Dictionary for all registered permissions
 */
export const PERMISSIONS_METADATA: Record<PermissionKey, PermissionMetadata> = {
  // Product
  'product.view': {
    key: 'product.view',
    group: 'Product',
    displayName: 'View Products',
    description: 'Browse, search, and view catalog product details.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'product.create': {
    key: 'product.create',
    group: 'Product',
    displayName: 'Create Products',
    description: 'Add new products and inventory items to the catalog.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'product.update': {
    key: 'product.update',
    group: 'Product',
    displayName: 'Update Products',
    description: 'Modify product title, description, selling price, images, and stock.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'product.delete': {
    key: 'product.delete',
    group: 'Product',
    displayName: 'Delete Products',
    description: 'Permanently remove products from the catalog.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: true,
  },
  'product.view_buying_price': {
    key: 'product.view_buying_price',
    group: 'Financial / Sensitive Data',
    displayName: 'View Buying Price',
    description: 'Access supplier wholesale buying price on products and orders.',
    superAdminOnly: false,
    sensitive: true,
    dangerous: false,
  },
  'product.manage_buying_price': {
    key: 'product.manage_buying_price',
    group: 'Financial / Sensitive Data',
    displayName: 'Manage Buying Price',
    description: 'Create and update supplier wholesale buying cost on products.',
    superAdminOnly: false,
    sensitive: true,
    dangerous: false,
  },
  'product.buying_price': {
    key: 'product.buying_price',
    group: 'Financial / Sensitive Data',
    displayName: 'Buying / Purchase Cost',
    description: 'Access supplier wholesale buying price and cost on products and orders.',
    superAdminOnly: false,
    sensitive: true,
    dangerous: false,
  },
  'product.view_profit': {
    key: 'product.view_profit',
    group: 'Financial / Sensitive Data',
    displayName: 'View Product Profit',
    description: 'Access unit gross profit and profit margins on individual products.',
    superAdminOnly: false,
    sensitive: true,
    dangerous: false,
  },

  // Order
  'order.view': {
    key: 'order.view',
    group: 'Order',
    displayName: 'View Orders',
    description: 'View customer orders, delivery details, and order history.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'order.manage': {
    key: 'order.manage',
    group: 'Order',
    displayName: 'Order Management',
    description: 'Edit order delivery address, recipient notes, and item quantities.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'order.status_change': {
    key: 'order.status_change',
    group: 'Order',
    displayName: 'Change Order Status',
    description: 'Update order payment status and fulfillment progress.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'order.cancel': {
    key: 'order.cancel',
    group: 'Order',
    displayName: 'Cancel Orders',
    description: 'Mark orders as cancelled and restore stock automatically.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'order.delete': {
    key: 'order.delete',
    group: 'Order',
    displayName: 'Delete Orders',
    description: 'Permanently delete order records from database.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: true,
  },

  // Customer
  'customer.view': {
    key: 'customer.view',
    group: 'Customer',
    displayName: 'View Customers',
    description: 'View customer names, phones, addresses, and order history.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'customer.manage': {
    key: 'customer.manage',
    group: 'Customer',
    displayName: 'Manage Customers',
    description: 'Update customer contact info and delivery preferences.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'customer.delete': {
    key: 'customer.delete',
    group: 'Customer',
    displayName: 'Delete Customers',
    description: 'Permanently delete customer profiles.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: true,
  },

  // Category
  'category.view': {
    key: 'category.view',
    group: 'Category',
    displayName: 'View Categories',
    description: 'Browse product categories and taxonomy.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'category.manage': {
    key: 'category.manage',
    group: 'Category',
    displayName: 'Manage Categories',
    description: 'Create, update, and delete product categories.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },

  // Slider
  'slider.view': {
    key: 'slider.view',
    group: 'Slider',
    displayName: 'View Sliders',
    description: 'View homepage hero carousel slides.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'slider.manage': {
    key: 'slider.manage',
    group: 'Slider',
    displayName: 'Manage Sliders',
    description: 'Create, update, order, and delete hero banner slides.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },

  // Coupon
  'coupon.view': {
    key: 'coupon.view',
    group: 'Coupon',
    displayName: 'View Coupons',
    description: 'View discount coupon codes, rules, and usage.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'coupon.manage': {
    key: 'coupon.manage',
    group: 'Coupon',
    displayName: 'Manage Coupons',
    description: 'Create, edit, toggle, and delete promotional discount vouchers.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },

  // Review
  'review.view': {
    key: 'review.view',
    group: 'Review',
    displayName: 'View Reviews',
    description: 'Browse customer reviews and check moderation queue.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'review.manage': {
    key: 'review.manage',
    group: 'Review',
    displayName: 'Moderate & Create Reviews',
    description: 'Approve, reject, edit customer reviews, or create official reviews.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'review.delete': {
    key: 'review.delete',
    group: 'Review',
    displayName: 'Delete Reviews (Legacy)',
    description: 'Permanently remove reviews from database.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: true,
  },
  'reviews.view': {
    key: 'reviews.view',
    group: 'Review',
    displayName: 'View Reviews',
    description: 'Browse customer reviews, inspect review details, photos, and access moderation queue.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'reviews.create': {
    key: 'reviews.create',
    group: 'Review',
    displayName: 'Create Reviews',
    description: 'Create and submit official staff reviews with custom sources and photos.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'reviews.edit': {
    key: 'reviews.edit',
    group: 'Review',
    displayName: 'Edit Reviews',
    description: 'Edit customer review ratings, comments, author names, photos, and purchase verification.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'reviews.approve': {
    key: 'reviews.approve',
    group: 'Review',
    displayName: 'Approve & Moderate Reviews',
    description: 'Approve, reject, or hold reviews in the moderation queue, and publish reviews directly.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'reviews.delete': {
    key: 'reviews.delete',
    group: 'Review',
    displayName: 'Delete Reviews',
    description: 'Permanently remove customer reviews from the database.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: true,
  },

  // Courier
  'courier.configure': {
    key: 'courier.configure',
    group: 'Courier',
    displayName: 'Configure Courier',
    description: 'Test and configure Steadfast courier API integration.',
    superAdminOnly: false,
    sensitive: true,
    dangerous: false,
  },
  'courier.booking': {
    key: 'courier.booking',
    group: 'Courier',
    displayName: 'Book Courier Parcels',
    description: 'Dispatch parcels and generate waybills via Steadfast Courier API.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'courier.status_sync': {
    key: 'courier.status_sync',
    group: 'Courier',
    displayName: 'Sync Courier Status',
    description: 'Trigger live parcel tracking synchronization with Steadfast portal.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'courier.tracking': {
    key: 'courier.tracking',
    group: 'Courier',
    displayName: 'Track Courier Parcels',
    description: 'Query live parcel tracking details and delivery history.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },

  // Analytics & Reports
  'analytics.view': {
    key: 'analytics.view',
    group: 'Analytics / Reports',
    displayName: 'View Analytics',
    description: 'View general order counts, top selling products, and traffic.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'report.sales': {
    key: 'report.sales',
    group: 'Analytics / Reports',
    displayName: 'View Sales Reports',
    description: 'View total sales volume, order turnover, and revenue trends.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'report.financial': {
    key: 'report.financial',
    group: 'Financial / Sensitive Data',
    displayName: 'View Financial Reports',
    description: 'Access operating expenses, ad spend, and net financial breakdown.',
    superAdminOnly: true,
    sensitive: true,
    dangerous: false,
  },
  'report.profit': {
    key: 'report.profit',
    group: 'Financial / Sensitive Data',
    displayName: 'View Profit Analytics',
    description: 'Access gross profit, product margins, and comprehensive profit reports.',
    superAdminOnly: true,
    sensitive: true,
    dangerous: false,
  },

  // User / Admin
  'user.view': {
    key: 'user.view',
    group: 'User / Admin',
    displayName: 'View Admin Accounts',
    description: 'View list of admin, sub-admin, and staff accounts.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
  'user.manage': {
    key: 'user.manage',
    group: 'User / Admin',
    displayName: 'Manage Admin Accounts',
    description: 'Create, update, and manage admin and staff user accounts.',
    superAdminOnly: true,
    sensitive: true,
    dangerous: true,
  },
  'user.delete': {
    key: 'user.delete',
    group: 'User / Admin',
    displayName: 'Delete Admin Accounts',
    description: 'Permanently delete admin, sub-admin, and staff user accounts.',
    superAdminOnly: true,
    sensitive: true,
    dangerous: true,
  },
  'permission.manage': {
    key: 'permission.manage',
    group: 'User / Admin',
    displayName: 'Manage Permissions',
    description: 'Assign or revoke granular permissions for admin and sub-admin accounts.',
    superAdminOnly: true,
    sensitive: true,
    dangerous: true,
  },

  // Store Settings
  'settings.manage': {
    key: 'settings.manage',
    group: 'Store',
    displayName: 'Manage Store Settings',
    description: 'Update core store settings, payment accounts, brand, and anti-spam.',
    superAdminOnly: true,
    sensitive: true,
    dangerous: true,
  },

  // Audit Log
  'audit_log.view': {
    key: 'audit_log.view',
    group: 'Audit',
    displayName: 'View Audit Logs',
    description: 'Review security audit logs, dispatch logs, and system events.',
    superAdminOnly: false,
    sensitive: false,
    dangerous: false,
  },
};

/**
 * Default permission matrix for Admin 1 (Full operational admin)
 */
export const DEFAULT_ADMIN_1_PERMISSIONS: Readonly<Record<PermissionKey, boolean>> = {
  'product.view': true,
  'product.create': true,
  'product.update': true,
  'product.delete': false,
  'product.view_buying_price': false,
  'product.manage_buying_price': false,
  'product.buying_price': false,
  'product.view_profit': false,

  'order.view': true,
  'order.manage': true,
  'order.status_change': true,
  'order.cancel': true,
  'order.delete': false,

  'customer.view': true,
  'customer.manage': true,
  'customer.delete': false,

  'category.view': true,
  'category.manage': true,

  'slider.view': true,
  'slider.manage': true,

  'coupon.view': true,
  'coupon.manage': true,

  'review.view': true,
  'review.manage': true,
  'review.delete': true,
  'reviews.view': true,
  'reviews.create': true,
  'reviews.edit': true,
  'reviews.approve': true,
  'reviews.delete': true,

  'courier.configure': true,
  'courier.booking': true,
  'courier.status_sync': true,
  'courier.tracking': true,

  'analytics.view': true,
  'report.sales': true,
  'report.financial': false,
  'report.profit': false,

  'user.view': false,
  'user.manage': false,
  'user.delete': false,
  'permission.manage': false,

  'settings.manage': false,
  'audit_log.view': true,
};

export const DEFAULT_ADMIN_PERMISSIONS: Readonly<Record<PermissionKey, boolean>> = DEFAULT_ADMIN_1_PERMISSIONS;

/**
 * Default permission matrix for Admin 2 (Order processing admin)
 */
export const DEFAULT_ADMIN_2_PERMISSIONS: Readonly<Record<PermissionKey, boolean>> = {
  'product.view': true,
  'product.create': false,
  'product.update': false,
  'product.delete': false,
  'product.view_buying_price': false,
  'product.manage_buying_price': false,
  'product.buying_price': false,
  'product.view_profit': false,

  'order.view': true,
  'order.manage': true,
  'order.status_change': true,
  'order.cancel': false,
  'order.delete': false,

  'customer.view': false,
  'customer.manage': false,
  'customer.delete': false,

  'category.view': false,
  'category.manage': false,

  'slider.view': false,
  'slider.manage': false,

  'coupon.view': false,
  'coupon.manage': false,

  'review.view': true,
  'review.manage': false,
  'review.delete': false,
  'reviews.view': true,
  'reviews.create': false,
  'reviews.edit': false,
  'reviews.approve': false,
  'reviews.delete': false,

  'courier.configure': false,
  'courier.booking': true,
  'courier.status_sync': true,
  'courier.tracking': true,

  'analytics.view': false,
  'report.sales': false,
  'report.financial': false,
  'report.profit': false,

  'user.view': false,
  'user.manage': false,
  'user.delete': false,
  'permission.manage': false,

  'settings.manage': false,
  'audit_log.view': false,
};

/**
 * Default permission matrix for Sub Admin
 */
export const DEFAULT_SUB_ADMIN_PERMISSIONS: Readonly<Record<PermissionKey, boolean>> = {
  'product.view': true,
  'product.create': false,
  'product.update': false,
  'product.delete': false,
  'product.view_buying_price': false,
  'product.manage_buying_price': false,
  'product.buying_price': false,
  'product.view_profit': false,

  'order.view': false,
  'order.manage': false,
  'order.status_change': false,
  'order.cancel': false,
  'order.delete': false,

  'customer.view': false,
  'customer.manage': false,
  'customer.delete': false,

  'category.view': false,
  'category.manage': false,

  'slider.view': false,
  'slider.manage': false,

  'coupon.view': false,
  'coupon.manage': false,

  'review.view': false,
  'review.manage': false,
  'review.delete': false,
  'reviews.view': false,
  'reviews.create': false,
  'reviews.edit': false,
  'reviews.approve': false,
  'reviews.delete': false,

  'courier.configure': false,
  'courier.booking': false,
  'courier.status_sync': false,
  'courier.tracking': false,

  'analytics.view': false,
  'report.sales': false,
  'report.financial': false,
  'report.profit': false,

  'user.view': false,
  'user.manage': false,
  'user.delete': false,
  'permission.manage': false,

  'settings.manage': false,
  'audit_log.view': false,
};

/**
 * Type guard for valid permission keys
 */
export function isValidPermissionKey(key: string): key is PermissionKey {
  return PERMISSION_KEYS.includes(key as PermissionKey);
}

/**
 * Checks whether a permission key is strictly Super Admin only
 */
export function isSuperAdminOnlyPermission(key: PermissionKey | string): boolean {
  if (SUPER_ADMIN_ONLY_PERMISSIONS.has(key as PermissionKey)) return true;
  const canonical = getCanonicalPermissionKey(key);
  if (canonical && SUPER_ADMIN_ONLY_PERMISSIONS.has(canonical)) return true;
  return false;
}

/**
 * Explicit Legacy Permission Mapping & Sensitivity Dictionary
 * Part of audit & backward-compatibility guarantee.
 * Maps legacy/deprecated names, camelCase keys, and aliases to their canonical PermissionKey.
 */
export interface LegacyPermissionMapping {
  legacyKey: string;
  canonicalKey: PermissionKey;
  sensitivity: 'super_admin_only' | 'sensitive' | 'operational';
  description: string;
}

export const LEGACY_PERMISSION_MAPPINGS: Record<string, LegacyPermissionMapping> = {
  // 1. Sensitive Financial Aliases
  'product.buying_price': {
    legacyKey: 'product.buying_price',
    canonicalKey: 'product.view_buying_price',
    sensitivity: 'sensitive',
    description: 'Wholesale buying price viewing alias.',
  },
  'buying_price': {
    legacyKey: 'buying_price',
    canonicalKey: 'product.view_buying_price',
    sensitivity: 'sensitive',
    description: 'Shorthand buying price viewing alias.',
  },
  'buyingPrice': {
    legacyKey: 'buyingPrice',
    canonicalKey: 'product.view_buying_price',
    sensitivity: 'sensitive',
    description: 'CamelCase buying price viewing alias.',
  },
  'view_buying_price': {
    legacyKey: 'view_buying_price',
    canonicalKey: 'product.view_buying_price',
    sensitivity: 'sensitive',
    description: 'Shorthand viewing buying price alias.',
  },
  'viewBuyingPrice': {
    legacyKey: 'viewBuyingPrice',
    canonicalKey: 'product.view_buying_price',
    sensitivity: 'sensitive',
    description: 'CamelCase viewing buying price alias.',
  },
  'product.manage_buying_price': {
    legacyKey: 'product.manage_buying_price',
    canonicalKey: 'product.manage_buying_price',
    sensitivity: 'sensitive',
    description: 'Wholesale buying price management authority.',
  },
  'manage_buying_price': {
    legacyKey: 'manage_buying_price',
    canonicalKey: 'product.manage_buying_price',
    sensitivity: 'sensitive',
    description: 'Shorthand buying price management alias.',
  },
  'manageBuyingPrice': {
    legacyKey: 'manageBuyingPrice',
    canonicalKey: 'product.manage_buying_price',
    sensitivity: 'sensitive',
    description: 'CamelCase buying price management alias.',
  },
  'product.view_profit': {
    legacyKey: 'product.view_profit',
    canonicalKey: 'product.view_profit',
    sensitivity: 'sensitive',
    description: 'Unit gross profit and margin access.',
  },
  'report.profit': {
    legacyKey: 'report.profit',
    canonicalKey: 'product.view_profit',
    sensitivity: 'sensitive',
    description: 'Store profit analytics reports.',
  },
  'profit': {
    legacyKey: 'profit',
    canonicalKey: 'product.view_profit',
    sensitivity: 'sensitive',
    description: 'Shorthand profit alias.',
  },
  'unitprofit': {
    legacyKey: 'unitprofit',
    canonicalKey: 'product.view_profit',
    sensitivity: 'sensitive',
    description: 'Shorthand unit profit alias.',
  },
  'unitProfit': {
    legacyKey: 'unitProfit',
    canonicalKey: 'product.view_profit',
    sensitivity: 'sensitive',
    description: 'CamelCase unit profit alias.',
  },
  'view_profit': {
    legacyKey: 'view_profit',
    canonicalKey: 'product.view_profit',
    sensitivity: 'sensitive',
    description: 'Shorthand view profit alias.',
  },
  'viewProfit': {
    legacyKey: 'viewProfit',
    canonicalKey: 'product.view_profit',
    sensitivity: 'sensitive',
    description: 'CamelCase view profit alias.',
  },
  'report_profit': {
    legacyKey: 'report_profit',
    canonicalKey: 'report.profit',
    sensitivity: 'super_admin_only',
    description: 'Snake_case profit report alias.',
  },
  'reportProfit': {
    legacyKey: 'reportProfit',
    canonicalKey: 'report.profit',
    sensitivity: 'super_admin_only',
    description: 'CamelCase profit report alias.',
  },
  'report.financial': {
    legacyKey: 'report.financial',
    canonicalKey: 'report.financial',
    sensitivity: 'super_admin_only',
    description: 'Financial reports and operating expenses.',
  },
  'report_financial': {
    legacyKey: 'report_financial',
    canonicalKey: 'report.financial',
    sensitivity: 'super_admin_only',
    description: 'Snake_case financial report alias.',
  },
  'reportFinancial': {
    legacyKey: 'reportFinancial',
    canonicalKey: 'report.financial',
    sensitivity: 'super_admin_only',
    description: 'CamelCase financial report alias.',
  },
  'analytics.financial': {
    legacyKey: 'analytics.financial',
    canonicalKey: 'report.financial',
    sensitivity: 'super_admin_only',
    description: 'Analytics module financial report alias.',
  },

  // 2. Protected Store Settings Aliases (Super Admin Only)
  'settings.manage': {
    legacyKey: 'settings.manage',
    canonicalKey: 'settings.manage',
    sensitivity: 'super_admin_only',
    description: 'Store settings configuration authority.',
  },
  'manage_settings': {
    legacyKey: 'manage_settings',
    canonicalKey: 'settings.manage',
    sensitivity: 'super_admin_only',
    description: 'Snake_case store settings management alias.',
  },
  'manageSettings': {
    legacyKey: 'manageSettings',
    canonicalKey: 'settings.manage',
    sensitivity: 'super_admin_only',
    description: 'CamelCase store settings management alias.',
  },

  // 3. User & RBAC Management Aliases (Super Admin Only)
  'user.manage': {
    legacyKey: 'user.manage',
    canonicalKey: 'user.manage',
    sensitivity: 'super_admin_only',
    description: 'Admin user creation and management authority.',
  },
  'manage_users': {
    legacyKey: 'manage_users',
    canonicalKey: 'user.manage',
    sensitivity: 'super_admin_only',
    description: 'Snake_case admin user management alias.',
  },
  'manageUsers': {
    legacyKey: 'manageUsers',
    canonicalKey: 'user.manage',
    sensitivity: 'super_admin_only',
    description: 'CamelCase admin user management alias.',
  },
  'user.delete': {
    legacyKey: 'user.delete',
    canonicalKey: 'user.delete',
    sensitivity: 'super_admin_only',
    description: 'Admin user deletion authority.',
  },
  'delete_users': {
    legacyKey: 'delete_users',
    canonicalKey: 'user.delete',
    sensitivity: 'super_admin_only',
    description: 'Snake_case user deletion alias.',
  },
  'deleteUsers': {
    legacyKey: 'deleteUsers',
    canonicalKey: 'user.delete',
    sensitivity: 'super_admin_only',
    description: 'CamelCase user deletion alias.',
  },
  'permission.manage': {
    legacyKey: 'permission.manage',
    canonicalKey: 'permission.manage',
    sensitivity: 'super_admin_only',
    description: 'RBAC permission management authority.',
  },
  'manage_permissions': {
    legacyKey: 'manage_permissions',
    canonicalKey: 'permission.manage',
    sensitivity: 'super_admin_only',
    description: 'Snake_case permission management alias.',
  },
  'managePermissions': {
    legacyKey: 'managePermissions',
    canonicalKey: 'permission.manage',
    sensitivity: 'super_admin_only',
    description: 'CamelCase permission management alias.',
  },

  // 4. Harmless Operational Aliases (Safe Operational RBAC)
  'courier.dispatch': {
    legacyKey: 'courier.dispatch',
    canonicalKey: 'courier.booking',
    sensitivity: 'operational',
    description: 'Legacy alias for courier parcel dispatch/booking.',
  },
  'order.dispatch': {
    legacyKey: 'order.dispatch',
    canonicalKey: 'courier.booking',
    sensitivity: 'operational',
    description: 'Legacy alias for order parcel dispatch/booking.',
  },
  'category.create': {
    legacyKey: 'category.create',
    canonicalKey: 'category.manage',
    sensitivity: 'operational',
    description: 'Legacy alias for category creation.',
  },
  'category.update': {
    legacyKey: 'category.update',
    canonicalKey: 'category.manage',
    sensitivity: 'operational',
    description: 'Legacy alias for category update.',
  },
  'slider.create': {
    legacyKey: 'slider.create',
    canonicalKey: 'slider.manage',
    sensitivity: 'operational',
    description: 'Legacy alias for slider creation.',
  },
  'slider.update': {
    legacyKey: 'slider.update',
    canonicalKey: 'slider.manage',
    sensitivity: 'operational',
    description: 'Legacy alias for slider update.',
  },
  'coupon.create': {
    legacyKey: 'coupon.create',
    canonicalKey: 'coupon.manage',
    sensitivity: 'operational',
    description: 'Legacy alias for coupon creation.',
  },
  'coupon.update': {
    legacyKey: 'coupon.update',
    canonicalKey: 'coupon.manage',
    sensitivity: 'operational',
    description: 'Legacy alias for coupon update.',
  },
  'review.moderate': {
    legacyKey: 'review.moderate',
    canonicalKey: 'reviews.approve',
    sensitivity: 'operational',
    description: 'Review moderation alias.',
  },
  'review.approve': {
    legacyKey: 'review.approve',
    canonicalKey: 'reviews.approve',
    sensitivity: 'operational',
    description: 'Review approval alias.',
  },
  'review.create': {
    legacyKey: 'review.create',
    canonicalKey: 'reviews.create',
    sensitivity: 'operational',
    description: 'Review creation alias.',
  },
  'review.edit': {
    legacyKey: 'review.edit',
    canonicalKey: 'reviews.edit',
    sensitivity: 'operational',
    description: 'Review editing alias.',
  },
  'review.view': {
    legacyKey: 'review.view',
    canonicalKey: 'reviews.view',
    sensitivity: 'operational',
    description: 'Review viewing alias.',
  },
  'review.delete': {
    legacyKey: 'review.delete',
    canonicalKey: 'reviews.delete',
    sensitivity: 'operational',
    description: 'Review deletion alias.',
  },
  'canManageReviews': {
    legacyKey: 'canManageReviews',
    canonicalKey: 'reviews.approve',
    sensitivity: 'operational',
    description: 'Legacy boolean flag for review management.',
  },
  'moderate_reviews': {
    legacyKey: 'moderate_reviews',
    canonicalKey: 'reviews.approve',
    sensitivity: 'operational',
    description: 'Snake_case review moderation alias.',
  },
  'moderateReviews': {
    legacyKey: 'moderateReviews',
    canonicalKey: 'reviews.approve',
    sensitivity: 'operational',
    description: 'CamelCase review moderation alias.',
  },
};

/**
 * Resolves a permission string or alias to its canonical PermissionKey if recognized.
 * If an alias exists in LEGACY_PERMISSION_MAPPINGS, it maps to the canonical key
 * (e.g., 'product.buying_price' -> 'product.view_buying_price').
 */
export function getCanonicalPermissionKey(perm: string): PermissionKey | null {
  const mapping = LEGACY_PERMISSION_MAPPINGS[perm];
  if (mapping) {
    return mapping.canonicalKey;
  }
  if (isValidPermissionKey(perm)) {
    return perm;
  }
  return null;
}

/**
 * Maps legacy 5-flag permissions to granular permissions for backward compatibility.
 * Broad permissions NEVER grant Super Admin-only permissions (buying price, profit, settings, account management).
 */
export function mapLegacyPermissionsToGranular(legacy: Record<string, any>): Record<PermissionKey, boolean> {
  const mapped: Record<PermissionKey, boolean> = { ...DEFAULT_SUB_ADMIN_PERMISSIONS };

  if (legacy.canManageProducts) {
    mapped['product.view'] = true;
    mapped['product.create'] = true;
    mapped['product.update'] = true;
    mapped['product.delete'] = true;
  }

  if (legacy.canManageOrders) {
    mapped['order.view'] = true;
    mapped['order.manage'] = true;
    mapped['order.status_change'] = true;
    mapped['order.cancel'] = true;
    mapped['order.delete'] = true;
    mapped['courier.booking'] = true;
    mapped['courier.status_sync'] = true;
    mapped['courier.tracking'] = true;
  }

  if (legacy.canManageCategories) {
    mapped['category.view'] = true;
    mapped['category.manage'] = true;
  }

  if (legacy.canManageAccounts) {
    mapped['user.view'] = true;
    mapped['customer.view'] = true;
    mapped['customer.manage'] = true;
    // user.manage and user.delete remain false: Super Admin-only!
  }

  if (legacy.canManageSettings) {
    mapped['slider.view'] = true;
    mapped['slider.manage'] = true;
    mapped['coupon.view'] = true;
    mapped['coupon.manage'] = true;
    mapped['courier.configure'] = true;
    // settings.manage remains false: Super Admin-only!
  }

  if (legacy.canManageReviews) {
    mapped['review.view'] = true;
    mapped['review.manage'] = true;
    mapped['review.delete'] = true;
    mapped['reviews.view'] = true;
    mapped['reviews.create'] = true;
    mapped['reviews.edit'] = true;
    mapped['reviews.approve'] = true;
    mapped['reviews.delete'] = true;
  }

  return mapped;
}

/**
 * Resolves the authoritative dictionary of granular permissions for a given user role and stored permissions.
 */
export function resolveUserPermissions(
  role: string,
  rawStoredPermissions: any
): Record<PermissionKey, boolean> {
  // 1. SUPER_ADMIN has full unconditional access to everything
  if (role === 'super_admin') {
    const full: Record<PermissionKey, boolean> = {} as any;
    for (const key of PERMISSION_KEYS) {
      full[key] = true;
    }
    return full;
  }

  // 2. CUSTOMER has zero admin permissions
  if (role === 'customer' || !role) {
    const none: Record<PermissionKey, boolean> = {} as any;
    for (const key of PERMISSION_KEYS) {
      none[key] = false;
    }
    return none;
  }

  // 3. ADMIN or SUB_ADMIN: Access is strictly determined by individual permissions
  let base: Record<PermissionKey, boolean> =
    role === 'admin'
      ? { ...DEFAULT_ADMIN_PERMISSIONS }
      : { ...DEFAULT_SUB_ADMIN_PERMISSIONS };

  let parsed: Record<string, any> = {};
  if (typeof rawStoredPermissions === 'string') {
    try {
      parsed = JSON.parse(rawStoredPermissions);
    } catch {
      parsed = {};
    }
  } else if (rawStoredPermissions && typeof rawStoredPermissions === 'object') {
    parsed = rawStoredPermissions;
  }

  // Check if legacy flags exist
  const hasLegacyFlags =
    'canManageProducts' in parsed ||
    'canManageOrders' in parsed ||
    'canManageCategories' in parsed ||
    'canManageAccounts' in parsed ||
    'canManageSettings' in parsed ||
    'canManageReviews' in parsed;

  if (hasLegacyFlags) {
    base = { ...base, ...mapLegacyPermissionsToGranular(parsed) };
  }

  // Check if legacy aliases exist in parsed
  for (const [rawKey, val] of Object.entries(parsed)) {
    if (!val) continue;
    const mapping = LEGACY_PERMISSION_MAPPINGS[rawKey];
    if (mapping) {
      base[mapping.canonicalKey] = true;
    }
  }

  // Overlay granular keys (e.g. "product.view": true)
  for (const key of PERMISSION_KEYS) {
    if (key in parsed) {
      base[key] = Boolean(parsed[key]);
    }
  }

  // Cross-alias synchronization for buying price & profit
  if ('product.buying_price' in parsed || 'product.view_buying_price' in parsed) {
    const hasBuying = Boolean(parsed['product.buying_price'] || parsed['product.view_buying_price']);
    base['product.view_buying_price'] = hasBuying;
    base['product.buying_price'] = hasBuying;
  }
  if ('report.profit' in parsed || 'product.view_profit' in parsed) {
    const hasProfit = Boolean(parsed['report.profit'] || parsed['product.view_profit']);
    base['report.profit'] = hasProfit;
    base['product.view_profit'] = hasProfit;
  }

  // Cross-alias synchronization for review permissions
  if ('reviews.view' in parsed || 'review.view' in parsed) {
    const hasRevView = Boolean(parsed['reviews.view'] ?? parsed['review.view']);
    base['reviews.view'] = hasRevView;
    base['review.view'] = hasRevView;
  }
  if ('reviews.create' in parsed || 'review.create' in parsed) {
    const hasRevCreate = Boolean(parsed['reviews.create'] ?? parsed['review.create']);
    base['reviews.create'] = hasRevCreate;
  }
  if ('reviews.edit' in parsed || 'review.edit' in parsed) {
    const hasRevEdit = Boolean(parsed['reviews.edit'] ?? parsed['review.edit']);
    base['reviews.edit'] = hasRevEdit;
  }
  if ('reviews.approve' in parsed || 'review.approve' in parsed) {
    const hasRevApprove = Boolean(parsed['reviews.approve'] ?? parsed['review.approve']);
    base['reviews.approve'] = hasRevApprove;
  }
  if ('reviews.delete' in parsed || 'review.delete' in parsed) {
    const hasRevDelete = Boolean(parsed['reviews.delete'] ?? parsed['review.delete']);
    base['reviews.delete'] = hasRevDelete;
    base['review.delete'] = hasRevDelete;
  }
  if ('review.manage' in parsed) {
    const hasManage = Boolean(parsed['review.manage']);
    base['review.manage'] = hasManage;
    if (hasManage) {
      if (!('reviews.view' in parsed)) base['reviews.view'] = true;
      if (!('review.view' in parsed)) base['review.view'] = true;
      if (!('reviews.create' in parsed)) base['reviews.create'] = true;
      if (!('reviews.edit' in parsed)) base['reviews.edit'] = true;
      if (!('reviews.approve' in parsed)) base['reviews.approve'] = true;
    } else {
      if (!('reviews.create' in parsed)) base['reviews.create'] = false;
      if (!('reviews.edit' in parsed)) base['reviews.edit'] = false;
      if (!('reviews.approve' in parsed)) base['reviews.approve'] = false;
    }
  }
  if ('canManageReviews' in parsed) {
    const hasLegacyManage = Boolean(parsed.canManageReviews);
    if (!hasLegacyManage) {
      if (!('review.manage' in parsed)) base['review.manage'] = false;
      if (!('reviews.approve' in parsed)) base['reviews.approve'] = false;
      if (!('reviews.edit' in parsed)) base['reviews.edit'] = false;
      if (!('reviews.create' in parsed)) base['reviews.create'] = false;
    }
  }

  // STRICT PRIVILEGE RESTRICTION:
  // For non-super_admin accounts, Super Admin-only permissions CAN NEVER be true!
  for (const superKey of SUPER_ADMIN_ONLY_PERMISSIONS) {
    base[superKey] = false;
  }

  return base;
}

/**
 * Generates legacy backward-compatible flags from resolved granular permissions
 */
export function generateLegacyPermissionFlags(perms: Record<PermissionKey, boolean>) {
  return {
    canManageOrders: Boolean(perms['order.manage'] || perms['order.status_change']),
    canManageProducts: Boolean(perms['product.create'] || perms['product.update']),
    canManageCategories: Boolean(perms['category.manage']),
    canManageAccounts: Boolean(perms['user.view'] || perms['customer.manage']),
    canManageSettings: Boolean(perms['slider.manage'] || perms['coupon.manage'] || perms['courier.configure']),
    canManageReviews: Boolean(
      perms['reviews.approve'] ||
      perms['reviews.edit'] ||
      perms['review.manage'] ||
      perms['reviews.view'] ||
      perms['review.view']
    ),
  };
}

/**
 * Resolves configured Super Admin emails dynamically from server environment variables.
 * Privileged identities are configured server-side via SUPER_ADMIN_EMAILS.
 * Hardcoded emails, user IDs, and startsWith patterns are strictly removed.
 */
export function getSuperAdminEmails(env?: any): string[] {
  const configured = (
    env?.SUPER_ADMIN_EMAILS ||
    (typeof process !== 'undefined' && process.env ? process.env.SUPER_ADMIN_EMAILS : '') ||
    ''
  ).trim();
  if (!configured) return [];
  return configured.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Resolves configured Super Admin user IDs dynamically from server environment variables.
 * Privileged user IDs are configured server-side via SUPER_ADMIN_USER_IDS.
 */
export function getSuperAdminUserIds(env?: any): string[] {
  const configured = (
    env?.SUPER_ADMIN_USER_IDS ||
    (typeof process !== 'undefined' && process.env ? process.env.SUPER_ADMIN_USER_IDS : '') ||
    ''
  ).trim();
  if (!configured) return [];
  return configured.split(',').map((id: string) => id.trim()).filter(Boolean);
}

export function isSuperAdminEmailServer(email: string | null | undefined, env?: any): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  const list = getSuperAdminEmails(env);
  return list.includes(clean);
}

export function isSuperAdminUserIdServer(userId: string | null | undefined, env?: any): boolean {
  if (!userId) return false;
  const clean = userId.trim();
  const list = getSuperAdminUserIds(env);
  return list.includes(clean);
}

/**
 * Normalized sets for detecting privilege escalation attempts in requests.
 * Covers camelCase, snake_case, alias fields, duplicate fields, and casing variations.
 */
const ROLE_KEYS_NORMALIZED = new Set([
  'role',
  'roles',
  'userrole',
  'userroles',
  'accountrole',
  'accountroles',
  'targetrole',
  'targetroles',
  'newrole',
  'newroles',
  'assignedrole',
  'assignedroles',
]);

const PERMISSION_KEYS_NORMALIZED = new Set([
  'permission',
  'permissions',
  'permissionsjson',
  'userpermission',
  'userpermissions',
  'perm',
  'perms',
  'privilege',
  'privileges',
  'accesscontrol',
  'authority',
  'authorities',
  'grant',
  'grants',
  'scope',
  'scopes',
]);

/**
 * Recursively inspects a request payload to detect any attempt to alter roles or permissions.
 * Checks objects, arrays, nested keys, aliases, and known permission keys.
 */
export function detectPrivilegeEscalationAttempt(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false;

  function scan(obj: any, depth = 0): boolean {
    if (!obj || typeof obj !== 'object' || depth > 6) return false;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (item && typeof item === 'object') {
          if (scan(item, depth + 1)) return true;
        }
      }
      return false;
    }

    for (const [rawKey, val] of Object.entries(obj)) {
      if (val === undefined) continue;
      const normalized = rawKey.toLowerCase().replace(/[-_.]/g, '');

      // Check role keys
      if (ROLE_KEYS_NORMALIZED.has(normalized)) return true;

      // Check permission keys
      if (PERMISSION_KEYS_NORMALIZED.has(normalized)) return true;

      // Check if raw key itself is a registered granular permission
      if (isValidPermissionKey(rawKey)) return true;

      // Check if raw key is a registered legacy permission alias
      if (rawKey in LEGACY_PERMISSION_MAPPINGS) return true;

      // Recursively check nested objects
      if (val && typeof val === 'object') {
        if (scan(val, depth + 1)) return true;
      }
    }

    return false;
  }

  return scan(payload);
}

/**
 * Normalizes permission inputs from various formats:
 * - { permissions: { 'order.view': true } }
 * - { 'order.view': true }
 * - { permissions: ['order.view', 'order.status_change'] }
 * - ['order.view', 'order.status_change']
 * - JSON serialized string
 */
export function normalizePermissionsInput(input: any): Record<string, boolean> | null {
  if (!input) return null;

  let candidate = input;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      if (isValidPermissionKey(candidate)) {
        return { [candidate]: true };
      }
      return null;
    }
  }

  if (typeof candidate !== 'object' || candidate === null) return null;

  if (candidate.permissions && (typeof candidate.permissions === 'object' || typeof candidate.permissions === 'string')) {
    return normalizePermissionsInput(candidate.permissions);
  }

  if (Array.isArray(candidate)) {
    const res: Record<string, boolean> = {};
    for (const item of candidate) {
      if (typeof item === 'string') {
        res[item.trim()] = true;
      }
    }
    return res;
  }

  const res: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(candidate)) {
    if (typeof val === 'boolean') {
      res[key] = val;
    } else if (val === 1 || val === '1' || val === 'true') {
      res[key] = true;
    } else if (val === 0 || val === '0' || val === 'false' || val === null) {
      res[key] = false;
    } else {
      res[key] = Boolean(val);
    }
  }
  return res;
}

