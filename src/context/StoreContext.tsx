import React, { createContext, useContext, useMemo } from 'react';
import { AuthProvider, useAuth, AuthContextType } from './AuthContext';
import { CartProvider, useCart, CartContextType } from './CartContext';
import { StorefrontProvider, useStorefront, StorefrontContextType } from './StorefrontContext';
import { useAdmin, AdminContextType } from './AdminContextDefinition';
import {
  Product,
  Category,
  CartItem,
  Order,
  StoreSettings,
  CourierProvider,
  CourierBooking,
  ShippingStatus,
  CarouselSlide,
  CourierApiConfig,
  UserAccount,
  UserRole,
  AdminPermissions,
  ProductReview,
  Coupon,
  ToastNotificationData,
  PixelEventLog,
  TrackingUserData,
  Expense,
  ExpenseType,
  ProfitAnalyticsSummary,
  CourierWebhookConfig,
  CourierWebhookLog,
} from '../types';

export type StoreContextType = StorefrontContextType &
  CartContextType &
  AuthContextType &
  AdminContextType;

/**
 * Composite StoreProvider
 * Wraps the storefront in AuthProvider, CartProvider, and StorefrontProvider.
 * Notice: AdminProvider is intentionally omitted from the initial storefront bundle!
 * It is dynamically mounted inside AdminPanel on demand, completely separating heavy
 * administrative, courier, analytics, and seed logic from the customer bundle.
 */
export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      <CartProvider>
        <StorefrontProvider>
          {children}
        </StorefrontProvider>
      </CartProvider>
    </AuthProvider>
  );
};

// Fallback no-op admin stubs when outside AdminProvider
const defaultAdminStubs: AdminContextType = {
  adminActiveTab: 'overview',
  setAdminActiveTab: () => {},
  adminSettingsSection: '',
  setAdminSettingsSection: () => {},
  openAdminSettingsSection: () => {},

  // Product CRUD
  addProduct: async () => ({ success: false, error: 'Admin context not loaded' }),
  updateProduct: async () => ({ success: false, error: 'Admin context not loaded' }),
  deleteProduct: async () => ({ success: false, error: 'Admin context not loaded' }),
  increaseStock: async () => {},
  adjustProductRating: async () => {},
  toggleProductFeatured: async () => ({ success: false, error: 'Admin context not loaded' }),
  loadAdminAllProducts: async () => {},

  // Category CRUD
  addCategory: async () => ({ success: false, error: 'Admin context not loaded' }),
  updateCategory: async () => ({ success: false, error: 'Admin context not loaded' }),
  deleteCategory: async () => ({ success: false, error: 'Admin context not loaded' }),

  // Order Management & Courier
  orders: [],
  setOrders: () => {},
  updateOrderStatus: async () => ({ success: false, error: 'Admin context not loaded' }),
  updateOrder: () => {},
  verifyAndMarkPaid: () => {},
  deleteOrder: () => {},
  bookCourier: async () => ({} as any),
  bookWithCourier: async () => ({ success: false, message: 'Admin context not loaded' }),
  bookWithSteadfast: async () => ({ success: false, message: 'Admin context not loaded' }),
  syncCourierStatus: async () => ({ success: false, message: 'Admin context not loaded' }),
  syncAllCourierStatuses: async () => ({ success: false, message: 'Admin context not loaded', updatedCount: 0 }),
  cancelCourierBooking: () => {},
  blockPhoneNumber: () => {},
  unblockPhoneNumber: () => {},

  // Courier Configs
  courierConfigs: [],
  addCourierConfig: (cfg) => ({ ...cfg, id: 'stub' }),
  updateCourierConfig: () => {},
  deleteCourierConfig: () => {},
  resetCourierConfigs: () => {},

  // Courier Webhooks
  courierWebhooks: [],
  courierWebhookLogs: [],
  addCourierWebhook: async (wh) => ({ ...wh, id: 'stub', createdAt: new Date().toISOString() }),
  updateCourierWebhook: async () => {},
  deleteCourierWebhook: async () => {},
  testCourierWebhook: async () => ({ success: false, error: 'Admin context not loaded' }),
  triggerCourierWebhooks: async () => ({ success: false, dispatchedCount: 0, results: [] }),
  clearCourierWebhookLogs: () => {},

  // Slides
  addSlide: async () => ({ success: false, error: 'Admin context not loaded' }),
  updateSlide: async () => ({ success: false, error: 'Admin context not loaded' }),
  deleteSlide: async () => ({ success: false, error: 'Admin context not loaded' }),
  resetSlides: () => {},
  reorderSlides: async () => ({ success: false, error: 'Admin context not loaded' }),

  // Settings & Seed
  updateSettings: async () => ({ success: false, error: 'Admin context not loaded' }),
  resetToDefaultSeed: () => {},

  // Users
  users: [],
  setUsers: () => {},
  fetchUsers: async () => [],
  deleteUser: async () => ({ success: false, message: 'Admin context not loaded' }),
  deleteCustomer: async () => ({ success: false, message: 'Admin context not loaded' }),
  resetCustomerPassword: async () => ({ success: false, message: 'Admin context not loaded' }),
  updateUserRoleAndPermissions: () => ({ success: false, message: 'Admin context not loaded' }),

  // Vouchers
  addCoupon: () => ({ success: false, message: 'Admin context not loaded' }),
  updateCoupon: () => ({ success: false, message: 'Admin context not loaded' }),
  deleteCoupon: () => {},
  toggleCouponActive: () => {},

  // Profit & Analytics
  profitSummary: null,
  fetchProfitAnalytics: async () => null,
  expenses: [],
  fetchExpenses: async () => {},
  addExpense: async () => false,
  deleteExpense: async () => false,

  // Orders Pagination & Filters
  isOrdersLoading: false,
  refreshOrders: async () => {},
  orderPage: 1,
  setOrderPage: () => {},
  orderPageSize: 25,
  setOrderPageSize: () => {},
  orderTotalCount: 0,
  orderTotalPages: 1,
  orderSummary: null,
  orderQueryFilters: { status: 'all', payment: 'all', search: '', sortBy: 'newest' },
  setOrderQueryFilters: () => {},
};

/**
 * Universal Context Facade
 * Provides 100% backward-compatible access for existing consumers of `useStore()`.
 * Automatically merges Storefront, Cart, Auth, and Admin contexts based on the current scope.
 */
export const useStore = (): StoreContextType => {
  const auth = useAuth();
  const cart = useCart();
  const storefront = useStorefront();
  const admin = useAdmin();

  return useMemo<StoreContextType>(() => {
    if (admin) {
      return {
        ...storefront,
        ...cart,
        ...auth,
        ...admin,
        orders: admin.orders, // Ensure admin paginated orders take precedence in admin scope
      };
    }

    return {
      ...defaultAdminStubs,
      ...storefront,
      ...cart,
      ...auth,
      orders: storefront.orders, // Storefront orders (recent/customer orders) for customer scope
    };
  }, [auth, cart, storefront, admin]);
};

// Export individual domain hooks for modular adoption
export { useAuth, useCart, useStorefront, useAdmin };
