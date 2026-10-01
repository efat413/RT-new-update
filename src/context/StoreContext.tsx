import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
import {
  syncPixelScripts,
  trackSocialEvent,
  getStoredPixelLogs,
  clearStoredPixelLogs,
  prepareHashedUserData,
} from '../utils/pixelTracking';
import { updateDynamicFavicon } from '../utils/favicon';
import {
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_ORDERS,
  INITIAL_SETTINGS,
  INITIAL_SLIDES,
  INITIAL_COURIER_CONFIGS,
  INITIAL_USERS,
  INITIAL_REVIEWS,
  INITIAL_COUPONS,
} from '../data/seedData';
import {
  sanitizeCourierConfig,
  sanitizeCourierConfigs,
  sanitizeSettingsForBrowserStorage,
  sanitizeWebhooksForBrowserStorage,
  sanitizeAllBrowserStorage,
} from '../utils/courierStorage';
import { orderApi, OrderQueryParams, OrderSummaryStats } from '../services/orderApi';
import {
  productsApi,
  categoriesApi,
  slidersApi,
  settingsApi,
  couponsApi,
  reviewsApi,
  usersApi,
  profitAnalyticsApi,
  expensesApi,
  courierWebhooksApi,
  storeHomepageApi,
} from '../services/storeApi';
import { authApi, onAuthUnauthorized } from '../services/authApi';
import { hasUserPermission, canUser } from '../utils/permissions';
import type { PermissionKey } from '../server/permissions';
import {
  applyClientSEO,
  getCategorySEOData,
  getProductSEOMetadata,
  SITE_DOMAIN,
  DEFAULT_SITE_NAME,
  DEFAULT_BENGALI_BRAND_NAME,
  DEFAULT_HOMEPAGE_TITLE,
  DEFAULT_HOMEPAGE_DESCRIPTION,
  DEFAULT_FALLBACK_IMAGE,
} from '../utils/seo';

export const DEFAULT_SUBADMIN_PERMISSIONS: AdminPermissions = {
  canManageOrders: true,
  canManageProducts: true,
  canManageCategories: true,
  canManageAccounts: false,
  canManageSettings: false,
};

export const SUPER_ADMIN_PERMISSIONS: AdminPermissions = {
  canManageOrders: true,
  canManageProducts: true,
  canManageCategories: true,
  canManageAccounts: true,
  canManageSettings: true,
};

interface StoreContextType {
  // Storefront Data & Initialization
  isStoreInitializing: boolean;
  isStoreError: boolean;
  retryStoreInit: () => void;
  products: Product[];
  categories: Category[];
  orders: Order[];
  settings: StoreSettings;
  cart: CartItem[];
  cartCount: number;
  cartSubtotal: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;

  // User Authentication & Roles (Admins & Regular Users)
  users: UserAccount[];
  setUsers: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  currentUser: UserAccount | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserAccount | null>>;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  authModalMode: 'login' | 'signup' | 'forgot-password';
  setAuthModalMode: (mode: 'login' | 'signup' | 'forgot-password') => void;
  loginUser: (emailOrUsername: string, password: string) => Promise<{ success: boolean; message?: string; user?: UserAccount }>;
  registerUser: (data: { name: string; email: string; password: string; phone?: string; role?: UserRole }) => Promise<{ success: boolean; message?: string; user?: UserAccount }>;
  deleteUser: (userId: string) => { success: boolean; message?: string };
  deleteCustomer: (targetUser: UserAccount | string) => { success: boolean; message?: string };
  resetCustomerPassword: (emailOrId: string, newPassword: string) => Promise<{ success: boolean; message?: string }> | { success: boolean; message?: string };
  updateUserRoleAndPermissions: (
    userIdOrEmail: string,
    role: UserRole,
    permissions: AdminPermissions
  ) => { success: boolean; message?: string };
  hasPermission: (permission: PermissionKey | keyof AdminPermissions | string) => boolean;
  can: (permission: PermissionKey | keyof AdminPermissions | string) => boolean;
  logout: () => void;

  // Navigation & Filtering
  currentView: 'store' | 'admin' | 'tracking' | 'reset-password' | 'product';
  setCurrentView: (view: 'store' | 'admin' | 'tracking' | 'reset-password' | 'product') => void;
  selectedProductId: string | null;
  setSelectedProductId: (id: string | null) => void;
  singleProduct: Product | null;
  setSingleProduct: React.Dispatch<React.SetStateAction<Product | null>>;
  isProductLoading: boolean;
  productNotFound: boolean;
  loadProductById: (id: string) => Promise<Product | null>;
  adminActiveTab: string;
  setAdminActiveTab: (tab: string) => void;
  adminSettingsSection: string;
  setAdminSettingsSection: (section: string) => void;
  openAdminSettingsSection: (section?: string) => void;
  selectedCategory: string | null;
  setSelectedCategory: (catId: string | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  quickViewProduct: Product | null;
  setQuickViewProduct: (prod: Product | null) => void;
  videoModalProduct: Product | null;
  setVideoModalProduct: (prod: Product | null) => void;
  videoModalMode: 'popup' | 'floating';
  setVideoModalMode: (mode: 'popup' | 'floating') => void;
  openProductVideo: (prod: Product, mode?: 'popup' | 'floating') => void;

  // Homepage Limited Category Data & Category Server-Side Pagination
  featuredProducts: Product[];
  toggleProductFeatured: (
    productId: string,
    isFeatured?: boolean,
    sortOrder?: number
  ) => Promise<{ success: boolean; error?: string }>;
  homepageCategoryProducts: Record<string, Product[]>;
  categoryListingProducts: Product[];
  categoryPage: number;
  setCategoryPage: (page: number) => void;
  categoryTotalPages: number;
  categoryTotalProducts: number;
  isCategoryLoading: boolean;
  categorySortBy: 'featured' | 'price-asc' | 'price-desc' | 'rating';
  setCategorySortBy: (sort: 'featured' | 'price-asc' | 'price-desc' | 'rating') => void;
  loadAdminAllProducts: () => Promise<void>;

  // Cart operations
  addToCart: (
    product: Product,
    quantity?: number,
    selectedSize?: string,
    selectedColor?: string,
    openDrawer?: boolean
  ) => void;
  updateCartQuantity: (
    productId: string,
    quantity: number,
    selectedSize?: string,
    selectedColor?: string
  ) => void;
  removeFromCart: (
    productId: string,
    selectedSize?: string,
    selectedColor?: string
  ) => void;
  clearCart: () => void;
  quickBuy: (
    product: Product,
    selectedSize?: string,
    selectedColor?: string
  ) => void;

  // Wishlist (Saved for later)
  wishlist: string[];
  isWishlistOpen: boolean;
  setIsWishlistOpen: (open: boolean) => void;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;

  // User Account & Orders Modal (Global)
  isUserAccountModalOpen: boolean;
  setIsUserAccountModalOpen: (open: boolean) => void;
  userAccountModalTab: 'orders' | 'profile';
  setUserAccountModalTab: (tab: 'orders' | 'profile') => void;
  updateCurrentUserProfile: (updatedData: Partial<UserAccount>) => { success: boolean; message: string };

  // Global Action Confirmation Toast Notification
  notification: ToastNotificationData | null;
  showNotification: (
    type: 'success' | 'info' | 'error' | 'warning',
    title: string,
    message: string,
    duration?: number
  ) => void;
  dismissNotification: () => void;

  // Coupons & Promo Codes
  coupons: Coupon[];
  applyCoupon: (
    code: string,
    subtotal: number,
    deliveryFee: number
  ) => { success: boolean; discountAmount: number; message: string; coupon?: Coupon };
  addCoupon: (newCoupon: Coupon) => { success: boolean; message: string };
  updateCoupon: (code: string, updated: Partial<Coupon>) => { success: boolean; message: string };
  deleteCoupon: (code: string) => void;
  toggleCouponActive: (code: string) => void;

  // Product Reviews & Ratings
  reviews: ProductReview[];
  addProductReview: (review: Omit<ProductReview, 'id' | 'createdAt'>) => void;
  deleteProductReview: (reviewId: string) => void;
  getProductReviews: (productId: string) => ProductReview[];

  // Orders & Checkout
  createOrder: (orderData: {
    userId?: string;
    userEmail?: string;
    customer: Order['customer'];
    items: CartItem[];
    subtotal: number;
    deliveryFee: number;
    totalAmount: number;
    couponCode?: string;
    discountAmount?: number;
    paymentMethod: Order['paymentMethod'];
    paymentStatus: Order['paymentStatus'];
    transactionId?: string;
    dbblDetails?: Order['dbblDetails'];
    cardDetails?: Order['cardDetails'];
  }) => Promise<Order>;
  recentSuccessOrder: Order | null;
  setRecentSuccessOrder: (order: Order | null) => void;
  activePaymentModalOrder: Order | null;
  setActivePaymentModalOrder: (order: Order | null) => void;
  finalizePayment: (orderId: string, transactionId: string) => Promise<void> | void;
  updateCustomerDeliveryInfo: (
    orderId: string,
    info: {
      fullName: string;
      phone: string;
      fullAddress: string;
      district: string;
      deliveryZone: 'inside_dhaka' | 'outside_dhaka';
    }
  ) => Promise<{ success: boolean; message?: string; updatedOrder?: Order }>;
  cancelCustomerOrder: (orderId: string) => Promise<{ success: boolean; message?: string }>;
  isOrdersLoading: boolean;
  refreshOrders: (overrideParams?: OrderQueryParams) => Promise<void>;
  orderPage: number;
  setOrderPage: React.Dispatch<React.SetStateAction<number>>;
  orderPageSize: number;
  setOrderPageSize: React.Dispatch<React.SetStateAction<number>>;
  orderTotalCount: number;
  orderTotalPages: number;
  orderSummary: OrderSummaryStats | null;
  orderQueryFilters: {
    status: string;
    payment: string;
    search: string;
    sortBy: string;
  };
  setOrderQueryFilters: React.Dispatch<
    React.SetStateAction<{
      status: string;
      payment: string;
      search: string;
      sortBy: string;
    }>
  >;

  // Admin Security
  isAdminLoggedIn: boolean;
  isAuthInitializing: boolean;
  adminLogin: (username: string, password: string) => Promise<boolean>;
  adminLogout: () => void;

  // Admin CRUD Products & Stock & Ratings
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => Promise<{ success: boolean; product?: Product; error?: string }>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<{ success: boolean; product?: Product; error?: string }>;
  deleteProduct: (id: string) => Promise<{ success: boolean; error?: string }>;
  increaseStock: (productId: string, amount: number) => Promise<void>;
  adjustProductRating: (productId: string, rating: number, reviewsCount?: number) => Promise<void>;

  // Admin CRUD Categories
  addCategory: (category: Omit<Category, 'id' | 'slug'>) => Promise<{ success: boolean; category?: Category; error?: string }>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<{ success: boolean; category?: Category; error?: string }>;
  deleteCategory: (id: string) => Promise<{ success: boolean; error?: string }>;

  // Admin Orders & Courier
  updateOrderStatus: (orderId: string, status: ShippingStatus) => Promise<{ success: boolean; error?: string }>;
  updateOrder: (orderId: string, updates: Partial<Order>) => Promise<void> | void;
  verifyAndMarkPaid: (orderId: string) => void;
  deleteOrder: (orderId: string, restoreStock?: boolean) => Promise<void> | void;
  bookCourier: (orderId: string, provider: CourierProvider, parcelData?: any) => Promise<CourierBooking>;
  bookWithCourier: (
    order: Order,
    courierProviderOrId: string,
    parcelData?: any
  ) => Promise<{
    success: boolean;
    message: string;
    trackingCode?: string;
    consignmentId?: string;
  }>;
  bookWithSteadfast: (
    order: Order,
    parcelData?: any
  ) => Promise<{
    success: boolean;
    message: string;
    trackingCode?: string;
    consignmentId?: string;
  }>;
  syncCourierStatus: (
    orderId: string
  ) => Promise<{
    success: boolean;
    message: string;
    updatedStatus?: string;
  }>;
  syncAllCourierStatuses: () => Promise<{
    success: boolean;
    message: string;
    updatedCount: number;
  }>;
  cancelCourierBooking: (orderId: string) => void;
  blockPhoneNumber: (phone: string) => void;
  unblockPhoneNumber: (phone: string) => void;

  // Admin Courier APIs Management
  courierConfigs: CourierApiConfig[];
  addCourierConfig: (config: Omit<CourierApiConfig, 'id'>) => CourierApiConfig;
  updateCourierConfig: (id: string, updates: Partial<CourierApiConfig>) => void;
  deleteCourierConfig: (id: string) => void;
  resetCourierConfigs: () => void;

  // Courier Webhooks Management
  courierWebhooks: CourierWebhookConfig[];
  courierWebhookLogs: CourierWebhookLog[];
  addCourierWebhook: (webhook: Omit<CourierWebhookConfig, 'id' | 'createdAt'>) => Promise<CourierWebhookConfig>;
  updateCourierWebhook: (id: string, updates: Partial<CourierWebhookConfig>) => Promise<void>;
  deleteCourierWebhook: (id: string) => Promise<void>;
  testCourierWebhook: (params: { url: string; secret?: string; webhookId?: string; event?: string; courier?: any }) => Promise<{ success: boolean; status?: number; latencyMs?: number; responsePreview?: string; error?: string }>;
  triggerCourierWebhooks: (event: string, courier: any) => Promise<{ success: boolean; dispatchedCount: number; results: any[] }>;
  clearCourierWebhookLogs: () => void;

  // Admin Slides / Carousel Management
  slides: CarouselSlide[];
  addSlide: (slide: Omit<CarouselSlide, 'id'>) => Promise<{ success: boolean; slider?: CarouselSlide; error?: string }>;
  updateSlide: (id: string, updates: Partial<CarouselSlide>) => Promise<{ success: boolean; slider?: CarouselSlide; error?: string }>;
  deleteSlide: (id: string) => Promise<{ success: boolean; error?: string }>;
  resetSlides: () => Promise<void> | void;

  // Admin Settings (Authoritative Cloudflare D1 persistence)
  updateSettings: (newSettings: Partial<StoreSettings>) => Promise<{ success: boolean; settings?: StoreSettings; error?: string }>;
  resetToDefaultSeed: () => void;

  // Super Admin Security
  changeSuperAdminPassword: (newPassword: string, currentPassword?: string) => Promise<{ success: boolean; message: string }>;

  // URL Deep Linking & Social Posting
  getProductUrl: (productId: string, options?: { absolute?: boolean }) => string;
  getCategoryUrl: (categoryIdOrSlug: string, options?: { absolute?: boolean }) => string;
  copyProductLink: (productId: string) => Promise<boolean>;
  copyCategoryLink: (categoryIdOrSlug: string) => Promise<boolean>;

  // Marketing Pixels & Tracking Management
  pixelLogs: PixelEventLog[];
  trackEvent: (
    eventName: 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase' | 'Search' | 'AddToWishlist' | 'Contact' | string,
    params?: Record<string, any>,
    userData?: TrackingUserData
  ) => PixelEventLog;
  fireTestPixelEvent: (type: 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase') => PixelEventLog;
  clearPixelLogs: () => void;
  isMetaActive: boolean;
  isTikTokActive: boolean;
  isGtmActive: boolean;

  // Super Admin Profit & Financial Analytics
  profitSummary: ProfitAnalyticsSummary | null;
  fetchProfitAnalytics: (
    period?: 'today' | 'month' | 'previous_month' | 'custom',
    params?: { startDate?: string; endDate?: string }
  ) => Promise<ProfitAnalyticsSummary | null>;
  expenses: Expense[];
  fetchExpenses: (filter?: { startDate?: string; endDate?: string; expenseType?: string }) => Promise<void>;
  addExpense: (expense: { expenseType: ExpenseType; amount: number; date: string; note?: string }) => Promise<boolean>;
  deleteExpense: (id: string) => Promise<boolean>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const STORAGE_KEYS = {
  ORDERS: 'rongdhonu_orders_v1',
  SETTINGS: 'rongdhonu_settings_v1',
  CART: 'rongdhonu_cart_v1',
  ADMIN_AUTH: 'rongdhonu_admin_auth_v1',
  COURIERS: 'rongdhonu_couriers_v1',
  USERS: 'rongdhonu_users',
  CURRENT_USER: 'rongdhonu_current_user',
  WISHLIST: 'rongdhonu_wishlist',
  REVIEWS: 'rongdhonu_reviews',
  COUPONS: 'rongdhonu_coupons',
  COURIER_WEBHOOKS: 'rongdhonu_courier_webhooks',
  COURIER_WEBHOOK_LOGS: 'rongdhonu_courier_webhook_logs',
};

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Settings State (Temporary bootstrap cache; Cloudflare D1 is immediately fetched and authoritative)
  const [settings, setSettings] = useState<StoreSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS) || localStorage.getItem('rongdhonu_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const effectiveAnnouncement = parsed.topBarAnnouncementText !== undefined && parsed.topBarAnnouncementText !== null
            ? parsed.topBarAnnouncementText
            : (parsed.announcementText !== undefined && parsed.announcementText !== null ? parsed.announcementText : '');

          return {
            ...INITIAL_SETTINGS,
            ...parsed,
            topBarAnnouncementText: effectiveAnnouncement,
            announcementText: effectiveAnnouncement,
            fbPixelId: parsed.fbPixelId !== undefined ? parsed.fbPixelId : (INITIAL_SETTINGS.fbPixelId || ''),
            fbTestEventCode: parsed.fbTestEventCode !== undefined ? parsed.fbTestEventCode : (INITIAL_SETTINGS.fbTestEventCode || ''),
            gtmId: parsed.gtmId !== undefined ? parsed.gtmId : (INITIAL_SETTINGS.gtmId || ''),
            tiktokPixelId: parsed.tiktokPixelId !== undefined ? parsed.tiktokPixelId : (INITIAL_SETTINGS.tiktokPixelId || ''),
            tiktokTestEventCode: parsed.tiktokTestEventCode !== undefined ? parsed.tiktokTestEventCode : (INITIAL_SETTINGS.tiktokTestEventCode || ''),
            dbblBank: parsed.dbblBank ? { ...INITIAL_SETTINGS.dbblBank, ...parsed.dbblBank } : INITIAL_SETTINGS.dbblBank,
            footer: parsed.footer
              ? {
                  ...INITIAL_SETTINGS.footer,
                  ...parsed.footer,
                  warrantyBadgeText:
                    parsed.footer.warrantyBadgeText === '7-Day Return & Replacement Warranty'
                      ? ''
                      : (parsed.footer.warrantyBadgeText || ''),
                }
              : INITIAL_SETTINGS.footer,
            blockedPhoneNumbers: Array.isArray(parsed.blockedPhoneNumbers) ? parsed.blockedPhoneNumbers : (INITIAL_SETTINGS.blockedPhoneNumbers || []),
          };
        }
      }
      return INITIAL_SETTINGS;
    } catch {
      return INITIAL_SETTINGS;
    }
  });

  // 2. Users State (Admins and Customers) with auto pre-seeded accounts
  const [users, setUsers] = useState<UserAccount[]>(() => {
    try {
      const saved = localStorage.getItem('rongdhonu_users') || localStorage.getItem('rongdhonu_users_v2');
      let parsedUsers: UserAccount[] = [];
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsedUsers = parsed;
        }
      }
      if (parsedUsers.length === 0) {
        parsedUsers = [...INITIAL_USERS];
      }

      // Ensure all pre-configured accounts for testing and RBAC verification are included
      INITIAL_USERS.forEach((initU) => {
        if (initU.role !== 'super_admin') {
          const exists = parsedUsers.some(
            (u) => u.email.toLowerCase() === initU.email.toLowerCase() || u.id === initU.id
          );
          if (!exists) {
            parsedUsers.push(initU);
          }
        }
      });

      // Ensure any sub_admin has permissions populated
      parsedUsers = parsedUsers.map((u) => {
        if (u.role === 'sub_admin' && !u.permissions) {
          return { ...u, permissions: DEFAULT_SUBADMIN_PERMISSIONS };
        }
        return u;
      });

      return parsedUsers;
    } catch {
      return INITIAL_USERS;
    }
  });

  // 3. Current Authenticated User (Authoritatively validated with server session)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);

  // Auth Modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup' | 'forgot-password'>('login');

  // Master Store Initialization & DB Loading states
  const [isStoreInitializing, setIsStoreInitializing] = useState<boolean>(true);
  const [isStoreError, setIsStoreError] = useState<boolean>(false);

  // 2. Categories State - Cloudflare D1 is the sole source of truth (empty initial state prevents seed flash)
  const [categories, setCategories] = useState<Category[]>([]);

  // 3. Products State - Cloudflare D1 is the sole source of truth (empty initial state prevents seed flash)
  const [products, setProducts] = useState<Product[]>([]);
  const productsRef = useRef<Product[]>(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // 3b. Limited Homepage Products by Category (recycled in memory, strictly capped at 6 items/category, NO continuous API requests)
  const [homepageCategoryProducts, setHomepageCategoryProducts] = useState<Record<string, Product[]>>({});
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);

  // 3c. Server-Side Paginated Category Listing & Search State (24 items/page)
  const [categoryPage, setCategoryPage] = useState<number>(1);
  const [categorySortBy, setCategorySortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'rating'>('featured');
  const [categoryListingProducts, setCategoryListingProducts] = useState<Product[]>([]);
  const [categoryTotalProducts, setCategoryTotalProducts] = useState<number>(0);
  const [categoryTotalPages, setCategoryTotalPages] = useState<number>(1);
  const [isCategoryLoading, setIsCategoryLoading] = useState<boolean>(false);

  // 4. Orders State - Cloudflare D1 is the single source of truth (Server-side paginated: default 25/page, max 100)
  const [orders, setOrders] = useState<Order[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState<boolean>(true);
  const [orderPage, setOrderPage] = useState<number>(1);
  const [orderPageSize, setOrderPageSize] = useState<number>(25);
  const [orderTotalCount, setOrderTotalCount] = useState<number>(0);
  const [orderTotalPages, setOrderTotalPages] = useState<number>(1);
  const [orderSummary, setOrderSummary] = useState<OrderSummaryStats | null>(null);
  const [orderQueryFilters, setOrderQueryFilters] = useState<{
    status: string;
    payment: string;
    search: string;
    sortBy: string;
  }>({
    status: 'all',
    payment: 'all',
    search: '',
    sortBy: 'newest',
  });
  const orderQueryParamsRef = useRef<OrderQueryParams>({
    page: 1,
    limit: 25,
    status: 'all',
    payment: 'all',
    search: '',
    sortBy: 'newest',
  });
  orderQueryParamsRef.current = {
    page: orderPage,
    limit: orderPageSize,
    status: orderQueryFilters.status,
    payment: orderQueryFilters.payment,
    search: orderQueryFilters.search,
    sortBy: orderQueryFilters.sortBy,
  };
  const isSyncingRef = useRef<boolean>(false);
  const activeSyncPromiseRef = useRef<Promise<void> | null>(null);
  const lastMutationTimestampRef = useRef<number>(0);

  // 5. Cart State (Browser local UI state for active shopper)
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CART);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 6. Slides State - Cloudflare D1 is the sole source of truth (empty initial state prevents seed flash)
  const [slides, setSlides] = useState<CarouselSlide[]>([]);

  // 7. Courier APIs Config State (Strictly sanitized: zero credentials stored in state or localStorage)
  const [courierConfigs, setCourierConfigs] = useState<CourierApiConfig[]>(() => {
    try {
      sanitizeAllBrowserStorage();
      const saved = localStorage.getItem(STORAGE_KEYS.COURIERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        const sanitized = sanitizeCourierConfigs(Array.isArray(parsed) ? parsed : INITIAL_COURIER_CONFIGS);
        localStorage.setItem(STORAGE_KEYS.COURIERS, JSON.stringify(sanitized));
        return sanitized;
      }
      const initialSanitized = sanitizeCourierConfigs(INITIAL_COURIER_CONFIGS);
      localStorage.setItem(STORAGE_KEYS.COURIERS, JSON.stringify(initialSanitized));
      return initialSanitized;
    } catch {
      return sanitizeCourierConfigs(INITIAL_COURIER_CONFIGS);
    }
  });

  // 7b. Courier Webhooks Config State
  const [courierWebhooks, setCourierWebhooks] = useState<CourierWebhookConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.COURIER_WEBHOOKS);
      return saved ? JSON.parse(saved) : (settings.courierWebhooks || []);
    } catch {
      return settings.courierWebhooks || [];
    }
  });

  // 7c. Courier Webhook Delivery Logs
  const [courierWebhookLogs, setCourierWebhookLogs] = useState<CourierWebhookLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.COURIER_WEBHOOK_LOGS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 8. Admin Auth State (Authoritative state strictly derived from verified server session)
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(false);
  const [isAuthInitializing, setIsAuthInitializing] = useState<boolean>(true);
  const hadActiveSessionRef = useRef<boolean>(false);

  // 9. Super Admin Financial & Profit Analytics State
  const [profitSummary, setProfitSummary] = useState<ProfitAnalyticsSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // 7. Navigation & Modals UI state
  const [currentView, _setCurrentView] = useState<'store' | 'admin' | 'tracking' | 'reset-password' | 'product'>('store');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [singleProduct, setSingleProduct] = useState<Product | null>(null);
  const [isProductLoading, setIsProductLoading] = useState<boolean>(false);
  const [productNotFound, setProductNotFound] = useState<boolean>(false);
  const [adminActiveTab, setAdminActiveTab] = useState<string>('overview');
  const [adminSettingsSection, setAdminSettingsSection] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const pathname = window.location.pathname;
      if (pathname === '/reset-password' || pathname === '/admin' || pathname.startsWith('/admin/')) {
        return null;
      }
      if (pathname.startsWith('/category/')) {
        const raw = decodeURIComponent(pathname.replace(/^\/category\//, '').replace(/\/$/, '')).trim();
        return raw || null;
      }
      if (pathname === '/featured') {
        return 'featured';
      }
      const params = new URLSearchParams(window.location.search);
      const cat = params.get('category') || params.get('cat');
      if (cat) return cat.trim();
      if (params.get('featured') === 'true') return 'featured';
    } catch {}
    return null;
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [videoModalProduct, setVideoModalProduct] = useState<Product | null>(null);
  const [videoModalMode, setVideoModalMode] = useState<'popup' | 'floating'>('popup');
  const [activePaymentModalOrder, setActivePaymentModalOrder] = useState<Order | null>(null);

  const openProductVideo = useCallback((prod: Product, mode: 'popup' | 'floating' = 'popup') => {
    setVideoModalMode(mode);
    setVideoModalProduct(prod);
  }, []);
  const [recentSuccessOrder, setRecentSuccessOrder] = useState<Order | null>(null);

  // Global Action Confirmation Notification State
  const [notification, setNotification] = useState<ToastNotificationData | null>(null);

  const showNotification = useCallback((
    type: 'success' | 'info' | 'error' | 'warning',
    title: string,
    message: string,
    duration: number = 5000
  ) => {
    // Safely defer state updates outside of synchronous render cycles
    setTimeout(() => {
      setNotification({
        id: `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type,
        title,
        message,
        duration,
      });
    }, 0);
  }, []);

  const dismissNotification = useCallback(() => {
    // Safely defer state updates outside of synchronous render cycles
    setTimeout(() => {
      setNotification(null);
    }, 0);
  }, []);

  // Quick navigation directly to a specific Admin Settings section (e.g., 'footer', 'general', 'bank')
  const openAdminSettingsSection = (section: string = 'footer') => {
    setAdminActiveTab('settings');
    setAdminSettingsSection(section);
    _setCurrentView('admin');
    const label =
      section === 'footer'
        ? 'Dynamic Footer & WhatsApp Support settings'
        : section === 'general'
        ? 'Header & Store Customization settings'
        : section === 'bank'
        ? 'Bank Account & NexusPay QR settings'
        : section === 'delivery'
        ? 'Delivery Rates settings'
        : `${section} settings`;
    showNotification('info', 'Store Settings Opened', `Navigated to ${label}.`, 3500);
  };

  // Guarded View Switcher
  const setCurrentView = (view: 'store' | 'admin' | 'tracking' | 'reset-password') => {
    _setCurrentView(view);
  };

  // Direct server/D1 product fetcher for the Single Product Page
  const loadProductById = useCallback(async (id: string): Promise<Product | null> => {
    if (!id) return null;
    const cleanId = id.trim();
    // Fast path: Check existing products array for instant initial rendering
    const existing = productsRef.current.find(
      (p) => p.id === cleanId || p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') === cleanId
    );
    if (existing) {
      setSingleProduct(existing);
      setProductNotFound(false);
    } else {
      setIsProductLoading(true);
      setProductNotFound(false);
    }

    try {
      const fetched = await productsApi.getById(cleanId);
      if (fetched && (fetched as any).status !== 'inactive' && !(fetched as any).isDeleted) {
        setSingleProduct(fetched);
        setProductNotFound(false);
        setIsProductLoading(false);
        return fetched;
      } else {
        if (!existing) {
          setSingleProduct(null);
          setProductNotFound(true);
        }
        setIsProductLoading(false);
        return existing || null;
      }
    } catch (err) {
      console.error('Failed to fetch product by id:', err);
      if (!existing) {
        setProductNotFound(true);
        setSingleProduct(null);
      }
      setIsProductLoading(false);
      return existing || null;
    }
  }, []);

  // Targeted Stock Synchronization: Refresh only specific product IDs without downloading the entire catalog
  const refreshProductsByIds = useCallback(async (productIds: string[]) => {
    if (!Array.isArray(productIds) || productIds.length === 0) return;
    const cleanIds = Array.from(new Set(productIds.filter(Boolean)));
    if (cleanIds.length === 0) return;

    try {
      const fetched = await Promise.all(
        cleanIds.map((id) => productsApi.getById(id).catch(() => null))
      );
      const valid = fetched.filter((p): p is Product => p !== null);
      if (valid.length === 0) return;

      const map = new Map(valid.map((p) => [p.id, p]));

      setProducts((prev) => prev.map((p) => map.get(p.id) || p));

      setHomepageCategoryProducts((prev) => {
        let changed = false;
        const next: Record<string, Product[]> = {};
        for (const [catId, prods] of Object.entries(prev)) {
          if (!Array.isArray(prods)) continue;
          next[catId] = prods.map((p: Product) => {
            const fresh = map.get(p.id);
            if (fresh && fresh !== p) {
              changed = true;
              return fresh;
            }
            return p;
          });
        }
        return changed ? next : prev;
      });

      setCategoryListingProducts((prev) => {
        let changed = false;
        const next = prev.map((p) => {
          const fresh = map.get(p.id);
          if (fresh && fresh !== p) {
            changed = true;
            return fresh;
          }
          return p;
        });
        return changed ? next : prev;
      });
    } catch (err) {
      console.warn('Failed to refresh specific products by IDs:', err);
    }
  }, []);

  // Deep link initial URL parser on mount & when products/categories are loaded
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const pathname = window.location.pathname;
      if (pathname === '/reset-password') {
        _setCurrentView('reset-password');
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      let productParam = '';
      if (pathname.startsWith('/product/')) {
        productParam = decodeURIComponent(pathname.replace(/^\/product\//, '').replace(/\/$/, '')).trim();
      } else if (urlParams.has('product') || urlParams.has('p')) {
        productParam = (urlParams.get('product') || urlParams.get('p') || '').trim();
      }

      let categoryParam = urlParams.get('category') || urlParams.get('cat');
      if (!categoryParam && pathname.startsWith('/category/')) {
        categoryParam = decodeURIComponent(pathname.replace(/^\/category\//, '').replace(/\/$/, '')).trim();
      }
      if (!categoryParam && (pathname === '/featured' || urlParams.get('featured') === 'true')) {
        categoryParam = 'featured';
      }

      const searchParam = urlParams.get('search') || urlParams.get('q') || urlParams.get('s');
      const pageParam = urlParams.get('page');

      if (productParam) {
        _setCurrentView('product');
        setSelectedProductId(productParam);
        loadProductById(productParam);
        if (urlParams.has('product') || urlParams.has('p')) {
          const cleanUrl = `/product/${encodeURIComponent(productParam)}`;
          window.history.replaceState({}, '', cleanUrl);
        }
        return;
      }

      if (searchParam && searchParam.trim()) {
        setSearchQuery(searchParam.trim());
        _setCurrentView('store');
      }

      if (categoryParam) {
        if (categoryParam.toLowerCase() === 'featured' || pathname === '/featured') {
          setSelectedCategory('featured');
          _setCurrentView('store');
        } else if (categories.length > 0) {
          const matchedCategory = categories.find(
            (c) => c.slug.toLowerCase() === categoryParam.toLowerCase() || c.id === categoryParam
          );
          if (matchedCategory) {
            setSelectedCategory(matchedCategory.id);
            _setCurrentView('store');
          } else {
            setSelectedCategory(categoryParam);
            _setCurrentView('store');
          }
        } else {
          setSelectedCategory(categoryParam);
          _setCurrentView('store');
        }
      }

      if (pageParam && Number(pageParam) > 1) {
        setCategoryPage(Number(pageParam));
      }
    } catch (e) {
      console.error('Error parsing deep link params', e);
    }
  }, [categories, loadProductById]);

  // Synchronize browser URL query parameters with active product, category, and search query
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);

      const activeProdId = selectedProductId || singleProduct?.id;
      if (currentView === 'product' && activeProdId) {
        url.pathname = `/product/${encodeURIComponent(activeProdId)}`;
        url.searchParams.delete('product');
        url.searchParams.delete('p');
      } else if (currentView !== 'product' && window.location.pathname.startsWith('/product/')) {
        url.pathname = '/';
      }

      if (selectedCategory) {
        const cat = categories.find((c) => c.id === selectedCategory || c.slug === selectedCategory);
        const catSlug = cat?.slug || selectedCategory;
        if (selectedCategory === 'featured' || window.location.pathname === '/featured') {
          url.pathname = '/featured';
          url.searchParams.delete('category');
          url.searchParams.delete('cat');
          url.searchParams.delete('featured');
        } else if (window.location.pathname.startsWith('/category/') || !url.searchParams.has('category')) {
          url.pathname = `/category/${encodeURIComponent(catSlug)}`;
          url.searchParams.delete('category');
          url.searchParams.delete('cat');
        } else {
          url.searchParams.set('category', catSlug);
        }
      } else {
        if (window.location.pathname.startsWith('/category/') || window.location.pathname === '/featured') {
          // If store is still initializing or categories haven't loaded yet, do NOT wipe the category URL!
          if (isStoreInitializing || categories.length === 0) {
            return;
          }
          url.pathname = '/';
        }
        url.searchParams.delete('category');
        url.searchParams.delete('cat');
        url.searchParams.delete('featured');
      }

      if (searchQuery.trim()) {
        url.searchParams.set('search', searchQuery.trim());
      } else {
        url.searchParams.delete('search');
        url.searchParams.delete('q');
        url.searchParams.delete('s');
      }

      if ((selectedCategory || searchQuery.trim()) && categoryPage > 1) {
        url.searchParams.set('page', String(categoryPage));
      } else {
        url.searchParams.delete('page');
      }

      const newRelativePath =
        url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash;
      if (window.location.pathname + window.location.search + window.location.hash !== newRelativePath) {
        window.history.replaceState({}, '', newRelativePath);
      }
    } catch (e) {
      console.error('Error syncing URL params', e);
    }
  }, [currentView, selectedProductId, singleProduct?.id, selectedCategory, searchQuery, categories, categoryPage, isStoreInitializing]);

  // Support native browser back and forward navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      try {
        const pathname = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);

        if (pathname === '/admin' || pathname.startsWith('/admin/')) {
          _setCurrentView('admin');
          return;
        }
        if (pathname === '/reset-password') {
          _setCurrentView('reset-password');
          return;
        }

        let productParam = '';
        if (pathname.startsWith('/product/')) {
          productParam = decodeURIComponent(pathname.replace(/^\/product\//, '').replace(/\/$/, '')).trim();
        } else if (urlParams.has('product') || urlParams.has('p')) {
          productParam = (urlParams.get('product') || urlParams.get('p') || '').trim();
        }

        let categoryParam = urlParams.get('category') || urlParams.get('cat');
        if (!categoryParam && pathname.startsWith('/category/')) {
          categoryParam = decodeURIComponent(pathname.replace(/^\/category\//, '').replace(/\/$/, '')).trim();
        }
        if (!categoryParam && (pathname === '/featured' || urlParams.get('featured') === 'true')) {
          categoryParam = 'featured';
        }

        const searchParam = urlParams.get('search') || urlParams.get('q') || urlParams.get('s');
        const pageParam = urlParams.get('page');

        if (productParam) {
          _setCurrentView('product');
          setSelectedProductId(productParam);
          loadProductById(productParam);
          return;
        }

        setSelectedProductId(null);
        setSingleProduct(null);

        if (searchParam) {
          setSearchQuery(searchParam.trim());
        } else {
          setSearchQuery('');
        }

        if (pageParam && Number(pageParam) > 1) {
          setCategoryPage(Number(pageParam));
        } else {
          setCategoryPage(1);
        }

        if (categoryParam) {
          if (categoryParam.toLowerCase() === 'featured' || pathname === '/featured') {
            setSelectedCategory('featured');
            _setCurrentView('store');
          } else {
            const matchedCategory = categories.find(
              (c) => c.slug.toLowerCase() === categoryParam.toLowerCase() || c.id === categoryParam
            );
            setSelectedCategory(matchedCategory ? matchedCategory.id : categoryParam);
            _setCurrentView('store');
          }
        } else {
          setSelectedCategory(null);
          _setCurrentView('store');
        }
      } catch (e) {
        console.error('Error handling popstate', e);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [products, categories]);

  // Dynamically synchronize browser favicon with uploaded icon or logo
  useEffect(() => {
    const iconUrl = settings.faviconUrl || settings.logoUrl;
    if (iconUrl) {
      updateDynamicFavicon(iconUrl);
    }
  }, [settings.faviconUrl, settings.logoUrl]);

  // Master Technical & On-Page SEO Synchronization
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. If currently viewing admin, do not output public marketing SEO
    if (currentView === 'admin') {
      document.title = `Admin Dashboard | ${settings.siteName || DEFAULT_SITE_NAME}`;
      return;
    }

    // 2. Product View (Single Product page or QuickView modal)
    const activeProd = (currentView === 'product' && singleProduct) ? singleProduct : quickViewProduct;
    if (activeProd) {
      const meta = getProductSEOMetadata(activeProd, settings.siteName);
      const cat = categories.find((c) => c.id === activeProd.categoryId);
      applyClientSEO(
        {
          ...meta,
          category: cat,
          breadcrumbs: [
            { name: 'Home', url: `${SITE_DOMAIN}/` },
            ...(cat
              ? [
                  {
                    name: cat.name,
                    url: `${SITE_DOMAIN}/category/${encodeURIComponent(cat.slug || cat.id)}`,
                  },
                ]
              : []),
            {
              name: activeProd.title,
              url: `${SITE_DOMAIN}/product/${encodeURIComponent(activeProd.id)}`,
            },
          ],
        },
        settings
      );
      return;
    }

    if (currentView === 'product' && productNotFound) {
      applyClientSEO(
        {
          title: `Product Not Found | ${settings.siteName || DEFAULT_SITE_NAME}`,
          description: `The requested product could not be found at ${settings.siteName || DEFAULT_SITE_NAME}. Browse our active collections across Bangladesh.`,
          canonicalUrl: `${SITE_DOMAIN}/`,
          noIndex: true,
        },
        settings
      );
      return;
    }

    // Check if an invalid product deep link is present in URL
    const urlParams = new URLSearchParams(window.location.search);
    const productParam = urlParams.get('product') || urlParams.get('p');
    const categoryParam = urlParams.get('category') || urlParams.get('c');
    if (productParam && products.length > 0) {
      const exists = products.some(
        (p) => p.id === productParam || p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') === productParam
      );
      if (!exists) {
        applyClientSEO(
          {
            title: `Product Not Found | ${settings.siteName || DEFAULT_SITE_NAME}`,
            description: `The requested product could not be found at ${settings.siteName || DEFAULT_SITE_NAME}. Browse our active collections across Bangladesh.`,
            canonicalUrl: `${SITE_DOMAIN}/`,
            noIndex: true,
          },
          settings
        );
        return;
      }
    }

    // 3. Category View
    if (selectedCategory && selectedCategory !== 'featured') {
      const cat = categories.find((c) => c.id === selectedCategory || c.slug === selectedCategory);
      if (cat) {
        const catSeo = getCategorySEOData(cat, settings.siteName);
        applyClientSEO(
          {
            title: catSeo.title,
            description: catSeo.description,
            canonicalUrl: `${SITE_DOMAIN}/category/${encodeURIComponent(cat.slug || cat.id)}`,
            ogType: 'website',
            ogImage: settings.logoUrl || DEFAULT_FALLBACK_IMAGE,
            category: cat,
            breadcrumbs: [
              { name: 'Home', url: `${SITE_DOMAIN}/` },
              {
                name: cat.name,
                url: `${SITE_DOMAIN}/category/${encodeURIComponent(cat.slug || cat.id)}`,
              },
            ],
          },
          settings
        );
        return;
      }
    }

    // Check if viewing Featured products collection (/featured or ?category=featured or ?featured=true)
    if (
      (typeof window !== 'undefined' && window.location.pathname === '/featured') ||
      urlParams.get('featured') === 'true' ||
      selectedCategory === 'featured' ||
      categoryParam?.toLowerCase() === 'featured'
    ) {
      applyClientSEO(
        {
          title: `Featured Products | ${settings.siteName || DEFAULT_SITE_NAME}`,
          description: `Browse our curated collection of featured top-selling and trending products at ${settings.siteName || DEFAULT_SITE_NAME}. Nationwide Cash on Delivery across Bangladesh.`,
          canonicalUrl: `${SITE_DOMAIN}/featured`,
          breadcrumbs: [
            { name: 'Home', url: `${SITE_DOMAIN}/` },
            { name: 'Featured Products', url: `${SITE_DOMAIN}/featured` },
          ],
        },
        settings
      );
      return;
    }

    // Check if an invalid category deep link is present in URL
    if (categoryParam && categoryParam.toLowerCase() !== 'featured' && categories.length > 0) {
      const catExists = categories.some(
        (c) => c.slug.toLowerCase() === categoryParam.toLowerCase() || c.id === categoryParam
      );
      if (!catExists) {
        applyClientSEO(
          {
            title: `Category Not Found | ${settings.siteName || DEFAULT_SITE_NAME}`,
            description: `The requested category could not be found at ${settings.siteName || DEFAULT_SITE_NAME}. Browse our featured products across Bangladesh.`,
            canonicalUrl: `${SITE_DOMAIN}/`,
            noIndex: true,
          },
          settings
        );
        return;
      }
    }

    // 4. Search View
    if (searchQuery.trim()) {
      applyClientSEO(
        {
          title: `Search: "${searchQuery.trim()}" | ${settings.siteName || DEFAULT_SITE_NAME}`,
          description: `Search results for "${searchQuery.trim()}" at ${settings.siteName || DEFAULT_SITE_NAME}. Order online with Cash on Delivery nationwide.`,
          canonicalUrl: `${SITE_DOMAIN}/?search=${encodeURIComponent(searchQuery.trim())}`,
          ogType: 'website',
          ogImage: settings.logoUrl || DEFAULT_FALLBACK_IMAGE,
          noIndex: true,
        },
        settings
      );
      return;
    }

    // 5. Default Homepage SEO
    const currentSiteName = settings.siteName || DEFAULT_SITE_NAME;
    applyClientSEO(
      {
        title:
          currentSiteName === DEFAULT_SITE_NAME
            ? DEFAULT_HOMEPAGE_TITLE
            : `${currentSiteName} | ${DEFAULT_BENGALI_BRAND_NAME} - Online Shopping in Bangladesh`,
        description: DEFAULT_HOMEPAGE_DESCRIPTION,
        canonicalUrl: `${SITE_DOMAIN}/`,
        ogType: 'website',
        ogImage: settings.logoUrl || DEFAULT_FALLBACK_IMAGE,
        breadcrumbs: [{ name: 'Home', url: `${SITE_DOMAIN}/` }],
      },
      settings
    );
  }, [
    quickViewProduct,
    selectedCategory,
    searchQuery,
    categories,
    products,
    currentView,
    settings,
  ]);

  // One-time purge of legacy localStorage keys on startup so they can never overwrite D1 data
  useEffect(() => {
    try {
      localStorage.removeItem('rongdhonu_products');
      localStorage.removeItem('rongdhonu_products_v1');
      localStorage.removeItem('rongdhonu_slides');
      localStorage.removeItem('rongdhonu_slides_v1');
      localStorage.removeItem('rongdhonu_categories_v1');
    } catch {}
  }, []);

  // Master Central Cloudflare D1 Synchronization
  const refreshAllStoreData = useCallback(async (force?: boolean): Promise<void> => {
    if (activeSyncPromiseRef.current && !force) {
      return activeSyncPromiseRef.current;
    }
    isSyncingRef.current = true;

    const syncPromise = (async () => {
      try {
        // 1. Optimized Public Homepage Initial Load: Fetch all essentials in 1 consolidated request!
        // This eliminates N+1 category-product queries and reduces initial network round trips.
        const homepageRes = await storeHomepageApi.getHomepage();

        let freshCategories: Category[] = [];

        if (homepageRes.success && homepageRes.data) {
          const hpData = homepageRes.data;
          if (Array.isArray(hpData.categories)) {
            freshCategories = hpData.categories;
            setCategories(freshCategories);
          }
          if (Array.isArray(hpData.slides)) {
            setSlides(hpData.slides);
          }
          if (hpData.settings) {
            setSettings(hpData.settings);
            try {
              const json = JSON.stringify(sanitizeSettingsForBrowserStorage(hpData.settings));
              localStorage.setItem(STORAGE_KEYS.SETTINGS, json);
              localStorage.setItem('rongdhonu_settings', json);
            } catch {}
          }
          if (hpData.categoryProducts) {
            setHomepageCategoryProducts(hpData.categoryProducts);
          }
          if (Array.isArray(hpData.featuredProducts)) {
            setFeaturedProducts(hpData.featuredProducts);
          }
          const loadedProducts = hpData.products || [];
          setProducts(loadedProducts);
          setQuickViewProduct((prev) => (prev ? loadedProducts.find((p) => p.id === prev.id) || prev : null));
          setIsStoreError(false);
        } else {
          // Fallback to individual endpoints if consolidated endpoint is unavailable
          const [catsRes, sldsRes, sttngsRes] = await Promise.allSettled([
            categoriesApi.getAll(),
            slidersApi.getAll(),
            settingsApi.get(),
          ]);

          if (catsRes.status === 'fulfilled' && Array.isArray(catsRes.value)) {
            freshCategories = catsRes.value;
            setCategories(freshCategories);
          }
          if (sldsRes.status === 'fulfilled' && Array.isArray(sldsRes.value)) {
            setSlides(sldsRes.value);
          }
          if (sttngsRes.status === 'fulfilled' && sttngsRes.value) {
            setSettings(sttngsRes.value);
            try {
              const json = JSON.stringify(sanitizeSettingsForBrowserStorage(sttngsRes.value));
              localStorage.setItem(STORAGE_KEYS.SETTINGS, json);
              localStorage.setItem('rongdhonu_settings', json);
            } catch {}
          }

          try {
            const catMap: Record<string, Product[]> = {};
            const loadedProducts: Product[] = [];
            await Promise.all(
              freshCategories.map(async (c) => {
                try {
                  const catProds = await productsApi.getHomepageCategoryProducts(c.id, 6);
                  catMap[c.id] = catProds;
                  loadedProducts.push(...catProds);
                } catch {
                  catMap[c.id] = [];
                }
              })
            );
            setHomepageCategoryProducts(catMap);
            setProducts(loadedProducts);
            try {
              const featProds = await productsApi.getAll({ featured: true, limit: 8 });
              setFeaturedProducts(featProds);
            } catch {
              setFeaturedProducts([]);
            }
            setIsStoreError(false);
          } catch {
            setIsStoreError(true);
          }
        }
      } catch (e) {
        console.warn('Central store sync warning:', e);
        setIsStoreError(true);
      } finally {
        setIsStoreInitializing(false);
        isSyncingRef.current = false;
        activeSyncPromiseRef.current = null;
      }
    })();

    activeSyncPromiseRef.current = syncPromise;
    return syncPromise;
  }, []);

  // On-demand lazy loaders for non-critical resources (coupons & reviews)
  // These are NOT fetched during initial storefront render, preventing bandwidth competition
  const hasLoadedCouponsRef = useRef<boolean>(false);
  const ensureCouponsLoaded = useCallback(async () => {
    if (hasLoadedCouponsRef.current) return;
    try {
      const cpns = await couponsApi.getAll();
      if (Array.isArray(cpns)) {
        setCoupons(cpns);
        hasLoadedCouponsRef.current = true;
        try { localStorage.setItem(STORAGE_KEYS.COUPONS, JSON.stringify(cpns)); } catch {}
      }
    } catch (err) {
      console.warn('Coupons fetch error:', err);
    }
  }, []);

  const hasLoadedReviewsRef = useRef<boolean>(false);
  const ensureReviewsLoaded = useCallback(async (productId?: string) => {
    if (hasLoadedReviewsRef.current) return;
    try {
      const revs = await reviewsApi.getAll(productId);
      if (Array.isArray(revs)) {
        setReviews(revs);
        hasLoadedReviewsRef.current = true;
        try { localStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(revs)); } catch {}
      }
    } catch (err) {
      console.warn('Reviews fetch error:', err);
    }
  }, []);

  // Admin users are fetched ONLY when admin is logged in and viewing admin panel
  useEffect(() => {
    if (isAdminLoggedIn && currentView === 'admin' && currentUser) {
      const isSuper = currentUser.role === 'super_admin';
      const canFetchUsers =
        isSuper ||
        hasUserPermission(currentUser, 'user.view') ||
        hasUserPermission(currentUser, 'customer.view') ||
        hasUserPermission(currentUser, 'canManageAccounts');

      if (canFetchUsers) {
        usersApi.getAll().then((usrs) => {
          if (Array.isArray(usrs)) {
            setUsers(usrs);
            try {
              localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(usrs));
            } catch {}
          }
        }).catch((err) => {
          console.warn('Admin users fetch error:', err);
        });
      }
    }
  }, [isAdminLoggedIn, currentView, currentUser]);

  const retryStoreInit = useCallback(async () => {
    setIsStoreInitializing(true);
    setIsStoreError(false);
    await refreshAllStoreData();
  }, [refreshAllStoreData]);

  const refreshOrders = useCallback(async (overrideParams?: OrderQueryParams) => {
    if (!isAdminLoggedIn || isAuthInitializing || !currentUser) return;
    const isSuper = currentUser.role === 'super_admin';
    const canFetchOrders =
      isSuper ||
      hasUserPermission(currentUser, 'order.view') ||
      hasUserPermission(currentUser, 'order.manage') ||
      hasUserPermission(currentUser, 'canManageOrders');
    if (!canFetchOrders) return;

    const fetchStart = Date.now();
    try {
      setIsOrdersLoading(true);
      const effectiveParams: OrderQueryParams = {
        ...orderQueryParamsRef.current,
        ...(overrideParams || {}),
      };
      const res = await orderApi.getOrders(effectiveParams);
      if (res.success && Array.isArray(res.orders)) {
        if (fetchStart >= lastMutationTimestampRef.current) {
          setOrders(res.orders);
          setOrderTotalCount(res.total);
          setOrderTotalPages(res.totalPages);
          if (res.summary) {
            setOrderSummary(res.summary);
          }
        }
      } else {
        console.warn('Order sync received non-success response:', res.error);
      }
    } catch (e) {
      console.warn('Order sync error:', e);
    } finally {
      setIsOrdersLoading(false);
    }
  }, [isAdminLoggedIn, isAuthInitializing, currentUser]);

  // Trigger server-side paginated order fetch whenever page, pageSize, or filter/search/sort changes
  useEffect(() => {
    if (!isAdminLoggedIn || isAuthInitializing || !currentUser) return;
    refreshOrders({
      page: orderPage,
      limit: orderPageSize,
      status: orderQueryFilters.status,
      payment: orderQueryFilters.payment,
      search: orderQueryFilters.search,
      sortBy: orderQueryFilters.sortBy,
    });
  }, [
    isAdminLoggedIn,
    isAuthInitializing,
    currentUser,
    orderPage,
    orderPageSize,
    orderQueryFilters.status,
    orderQueryFilters.payment,
    orderQueryFilters.search,
    orderQueryFilters.sortBy,
    refreshOrders,
  ]);

  const loadAdminAllProducts = useCallback(async () => {
    try {
      const all = await productsApi.getAll();
      if (Array.isArray(all)) {
        setProducts(all);
      }
    } catch (err) {
      console.warn('Admin products fetch error:', err);
    }
  }, []);

  // Reset to page 1 whenever category, search query, or sort actually changes
  const prevFilterKeyRef = useRef<string>('');
  useEffect(() => {
    const key = `${selectedCategory || ''}__${searchQuery.trim()}__${categorySortBy}`;
    if (prevFilterKeyRef.current && prevFilterKeyRef.current !== key) {
      setCategoryPage(1);
    }
    prevFilterKeyRef.current = key;
  }, [selectedCategory, searchQuery, categorySortBy]);

  // Server-side paginated product fetch for dedicated Category Listing and Search Views (24 products/page)
  useEffect(() => {
    if (!selectedCategory && !searchQuery.trim()) {
      return;
    }

    let isCancelled = false;
    setIsCategoryLoading(true);

    const isFeaturedCategory = selectedCategory === 'featured';

    const catObj = categories.find((c) => c.id === selectedCategory || c.slug === selectedCategory);
    const categoryParamForApi = isFeaturedCategory
      ? undefined
      : (catObj ? catObj.id : (selectedCategory || undefined));

    productsApi
      .getPaginated({
        category: categoryParamForApi,
        search: searchQuery.trim() || undefined,
        featured: isFeaturedCategory ? true : undefined,
        page: categoryPage,
        limit: 24,
        sortBy: categorySortBy,
      })
      .then((res) => {
        if (!isCancelled) {
          setCategoryListingProducts(res.products);
          setCategoryTotalProducts(res.total);
          setCategoryTotalPages(res.totalPages);
          setIsCategoryLoading(false);

          // Add loaded products into products cache
          setProducts((prev) => {
            const map = new Map<string, Product>();
            prev.forEach((p) => map.set(p.id, p));
            res.products.forEach((p) => map.set(p.id, p));
            return Array.from(map.values());
          });
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn('Failed to fetch paginated products:', err);
          setIsCategoryLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedCategory, searchQuery, categoryPage, categorySortBy, categories]);

  // Load complete catalog when switching to admin view
  useEffect(() => {
    if (isAdminLoggedIn && currentView === 'admin') {
      loadAdminAllProducts();
    }
  }, [isAdminLoggedIn, currentView, loadAdminAllProducts]);

  // Startup Authentication Initialization: Authoritatively verify server session via HttpOnly cookie with /api/auth/me
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

  // 401 Unauthorized Event Synchronization: Clears state immediately when active session token is rejected
  useEffect(() => {
    const unsubscribe = onAuthUnauthorized((detail) => {
      const wasLoggedIn = hadActiveSessionRef.current;
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

      if (wasLoggedIn) {
        const rawErr = detail?.error || '';
        const friendlyMsg =
          !rawErr || rawErr.includes('Authentication required')
            ? 'Your authentication session has expired or is invalid. Please log in again.'
            : rawErr;

        showNotification(
          'error',
          'Session Expired',
          friendlyMsg,
          5000
        );
      }
    });

    return unsubscribe;
  }, [showNotification]);

  // Multi-browser synchronization: Initial load + visibility & focus refresh with throttle
  useEffect(() => {
    refreshAllStoreData();

    // Prevent continuous 7-second store data polling for public visitors.
    // Throttled focus/visibilitychange keeps data fresh without hammering the database.
    let lastRefreshTime = Date.now();

    const throttledRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshTime > 45000) {
        lastRefreshTime = now;
        refreshAllStoreData();
      }
    };

    const handleFocus = () => throttledRefresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        throttledRefresh();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshAllStoreData]);

  // Load promo coupons on-demand when shopper opens the cart drawer
  useEffect(() => {
    if (isCartOpen) {
      ensureCouponsLoaded();
    }
  }, [isCartOpen, ensureCouponsLoaded]);

  // Load reviews on-demand when user visits single product view
  useEffect(() => {
    if (currentView === 'product' || selectedProductId) {
      ensureReviewsLoaded(selectedProductId || undefined);
    }
  }, [currentView, selectedProductId, ensureReviewsLoaded]);

  // Polling interval strictly for active admin viewing orders
  useEffect(() => {
    if (isAdminLoggedIn && currentView === 'admin') {
      const adminOrderInterval = setInterval(refreshOrders, 10000);
      return () => clearInterval(adminOrderInterval);
    }
  }, [isAdminLoggedIn, currentView, refreshOrders]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
    } catch (e) {
      console.error('Error saving cart', e);
    }
  }, [cart]);

  useEffect(() => {
    try {
      const sanitized = sanitizeCourierConfigs(courierConfigs);
      localStorage.setItem(STORAGE_KEYS.COURIERS, JSON.stringify(sanitized));
    } catch (e) {
      console.error('Error saving courier configs', e);
    }
  }, [courierConfigs]);

  useEffect(() => {
    if (Array.isArray(settings.courierWebhooks)) {
      setCourierWebhooks(settings.courierWebhooks);
    }
  }, [settings.courierWebhooks]);

  useEffect(() => {
    try {
      const sanitized = sanitizeWebhooksForBrowserStorage(courierWebhooks);
      localStorage.setItem(STORAGE_KEYS.COURIER_WEBHOOKS, JSON.stringify(sanitized));
    } catch (e) {
      console.error('Error saving courier webhooks', e);
    }
  }, [courierWebhooks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.COURIER_WEBHOOK_LOGS, JSON.stringify(courierWebhookLogs));
    } catch (e) {
      console.error('Error saving courier webhook logs', e);
    }
  }, [courierWebhookLogs]);

  useEffect(() => {
    try {
      const usersJson = JSON.stringify(users);
      localStorage.setItem(STORAGE_KEYS.USERS, usersJson);
      localStorage.setItem('rongdhonu_users', usersJson);
      localStorage.setItem('rongdhonu_users_v2', usersJson);
    } catch (e) {
      console.error('Error saving users', e);
    }
  }, [users]);

  // ============================================================================
  // Marketing Pixels & Advanced Matching System
  // ============================================================================
  const [pixelLogs, setPixelLogs] = useState<PixelEventLog[]>(() => getStoredPixelLogs());

  // Listen to cross-component and utility event dispatches
  useEffect(() => {
    const handleLogUpdate = () => {
      setPixelLogs(getStoredPixelLogs());
    };
    window.addEventListener('rongdhonu_pixel_log_update', handleLogUpdate);
    return () => {
      window.removeEventListener('rongdhonu_pixel_log_update', handleLogUpdate);
    };
  }, []);

  // Sync script injections dynamically whenever pixel IDs or user identity updates
  useEffect(() => {
    syncPixelScripts(
      settings,
      currentUser
        ? {
            email: currentUser.email,
            phone: currentUser.phone,
            fullName: currentUser.name,
            district: currentUser.district,
            deliveryZone: currentUser.deliveryZone,
          }
        : undefined
    );
  }, [
    settings.trackingEnabled,
    settings.fbPixelId,
    settings.fbTestEventCode,
    settings.tiktokPixelId,
    settings.tiktokTestEventCode,
    settings.gtmId,
    settings.advancedMatchingEnabled,
    currentUser?.email,
    currentUser?.phone,
  ]);

  // Universal event tracking dispatcher
  const trackEvent = (
    eventName: 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase' | 'Search' | 'AddToWishlist' | 'Contact' | string,
    params: Record<string, any> = {},
    userData?: TrackingUserData
  ): PixelEventLog => {
    const effectiveUserData =
      userData ||
      (currentUser
        ? {
            email: currentUser.email,
            phone: currentUser.phone,
            fullName: currentUser.name,
            district: currentUser.district,
            deliveryZone: currentUser.deliveryZone,
          }
        : undefined);

    const log = trackSocialEvent({
      eventName,
      params,
      userData: effectiveUserData,
      settings,
    });

    setPixelLogs(getStoredPixelLogs());
    return log;
  };

  // Test event simulator for Admin Panel verification
  const fireTestPixelEvent = (
    type: 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase'
  ): PixelEventLog => {
    const sampleProduct = products[0] || INITIAL_PRODUCTS[0];
    const sampleUser: TrackingUserData = {
      email: currentUser?.email || 'customer@rongdhonutrade.com',
      phone: currentUser?.phone || '01712345678',
      fullName: currentUser?.name || 'Mahmudul Hasan',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
    };

    switch (type) {
      case 'PageView':
        return trackEvent('PageView', { page: currentView, timestamp: new Date().toISOString() }, sampleUser);
      case 'ViewContent':
        return trackEvent(
          'ViewContent',
          {
            content_name: sampleProduct.title,
            content_ids: [sampleProduct.id],
            content_type: 'product',
            value: sampleProduct.price,
            currency: 'BDT',
          },
          sampleUser
        );
      case 'AddToCart':
        return trackEvent(
          'AddToCart',
          {
            content_name: sampleProduct.title,
            content_ids: [sampleProduct.id],
            content_type: 'product',
            value: sampleProduct.price,
            currency: 'BDT',
            quantity: 1,
          },
          sampleUser
        );
      case 'InitiateCheckout':
        return trackEvent(
          'InitiateCheckout',
          {
            content_ids: [sampleProduct.id],
            contents: [
              {
                id: sampleProduct.id,
                name: sampleProduct.title,
                price: sampleProduct.price,
                quantity: 1,
              },
            ],
            num_items: 1,
            value: sampleProduct.price + (settings.insideDhakaFee || 80),
            currency: 'BDT',
          },
          sampleUser
        );
      case 'Purchase':
        const testOrderNum = `RT-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
        return trackEvent(
          'Purchase',
          {
            content_ids: [sampleProduct.id],
            contents: [
              {
                id: sampleProduct.id,
                name: sampleProduct.title,
                price: sampleProduct.price,
                quantity: 1,
              },
            ],
            num_items: 1,
            value: sampleProduct.price + (settings.insideDhakaFee || 80),
            currency: 'BDT',
            transaction_id: testOrderNum,
            order_id: `ord-test-${Date.now()}`,
          },
          sampleUser
        );
    }
  };

  const clearPixelLogs = () => {
    clearStoredPixelLogs();
    setPixelLogs([]);
    showNotification('info', 'Pixel Activity Purged', 'Live event inspector log has been cleared.');
  };

  const isMetaActive = settings.trackingEnabled !== false && !!settings.fbPixelId?.trim();
  const isTikTokActive = settings.trackingEnabled !== false && !!settings.tiktokPixelId?.trim();
  const isGtmActive = settings.trackingEnabled !== false && !!settings.gtmId?.trim();

  // Fire PageView on view transitions
  useEffect(() => {
    trackEvent('PageView', { view: currentView });
  }, [currentView]);

  // Cart Helpers
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);

  const addToCart = (
    product: Product,
    quantity = 1,
    selectedSize?: string,
    selectedColor?: string,
    openDrawer = false
  ) => {
    setCart((prev) => {
      const existing = prev.find(
        (item) =>
          item.product.id === product.id &&
          item.selectedSize === selectedSize &&
          item.selectedColor === selectedColor
      );
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id &&
          item.selectedSize === selectedSize &&
          item.selectedColor === selectedColor
            ? { ...item, quantity: Math.min(product.stock, item.quantity + quantity) }
            : item
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: Math.min(product.stock, quantity),
          selectedSize,
          selectedColor,
        },
      ];
    });

    // Track AddToCart event to Meta, TikTok, and GTM
    trackEvent('AddToCart', {
      content_name: product.title,
      content_ids: [product.id],
      content_type: 'product',
      value: product.price * quantity,
      currency: 'BDT',
      quantity,
    });

    if (openDrawer) {
      setIsCartOpen(true);
    }
  };

  const updateCartQuantity = (
    productId: string,
    quantity: number,
    selectedSize?: string,
    selectedColor?: string
  ) => {
    if (quantity <= 0) {
      removeFromCart(productId, selectedSize, selectedColor);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        const matches =
          item.product.id === productId &&
          (selectedSize === undefined || item.selectedSize === selectedSize) &&
          (selectedColor === undefined || item.selectedColor === selectedColor);
        if (matches) {
          return { ...item, quantity: Math.min(item.product.stock, quantity) };
        }
        return item;
      })
    );
  };

  const removeFromCart = (
    productId: string,
    selectedSize?: string,
    selectedColor?: string
  ) => {
    setCart((prev) =>
      prev.filter((item) => {
        if (item.product.id !== productId) return true;
        if (selectedSize !== undefined && item.selectedSize !== selectedSize) return true;
        if (selectedColor !== undefined && item.selectedColor !== selectedColor) return true;
        return false;
      })
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const quickBuy = (
    product: Product,
    selectedSize?: string,
    selectedColor?: string
  ) => {
    // Add to cart with custom size/color and immediately open Shopping Cart & Checkout drawer
    addToCart(product, 1, selectedSize, selectedColor, true);
    setIsCartOpen(true);
  };

  // Wishlist (Save for later)
  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('rongdhonu_wishlist') || localStorage.getItem(STORAGE_KEYS.WISHLIST);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  useEffect(() => {
    try {
      const data = JSON.stringify(wishlist);
      localStorage.setItem('rongdhonu_wishlist', data);
      localStorage.setItem(STORAGE_KEYS.WISHLIST, data);
    } catch (e) {
      console.error('Error saving wishlist', e);
    }
  }, [wishlist]);

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) => {
      const willAdd = !prev.includes(productId);
      if (willAdd) {
        showNotification(
          'success',
          'Saved to Wishlist',
          'Item added to your saved collection. Open Wishlist to view.'
        );
      } else {
        showNotification(
          'info',
          'Removed from Wishlist',
          'Item removed from your saved collection.'
        );
      }
      return willAdd ? [...prev, productId] : prev.filter((id) => id !== productId);
    });
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);
  const clearWishlist = () => setWishlist([]);

  // User Account & Orders Modal State (Global Top-Level)
  const [isUserAccountModalOpen, setIsUserAccountModalOpen] = useState(false);
  const [userAccountModalTab, setUserAccountModalTab] = useState<'orders' | 'profile'>('orders');

  const updateCurrentUserProfile = (updatedData: Partial<UserAccount>) => {
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
    // Persist to Cloudflare D1
    usersApi.update(currentUser.id, updatedUser).catch(console.error);

    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? updatedUser : u))
    );

    showNotification(
      'success',
      'Profile Updated',
      'Your account profile details have been successfully saved.'
    );

    return { success: true, message: 'Profile updated successfully' };
  };

  // Coupons & Promo Codes
  const [coupons, setCoupons] = useState<Coupon[]>(() => {
    try {
      const saved = localStorage.getItem('rongdhonu_coupons') || localStorage.getItem(STORAGE_KEYS.COUPONS);
      return saved ? JSON.parse(saved) : INITIAL_COUPONS;
    } catch {
      return INITIAL_COUPONS;
    }
  });

  useEffect(() => {
    try {
      const data = JSON.stringify(coupons);
      localStorage.setItem('rongdhonu_coupons', data);
      localStorage.setItem(STORAGE_KEYS.COUPONS, data);
    } catch (e) {
      console.error('Error saving coupons', e);
    }
  }, [coupons]);

  // Load vouchers when admin switches to vouchers tab
  useEffect(() => {
    if (isAdminLoggedIn && currentView === 'admin' && adminActiveTab === 'vouchers') {
      ensureCouponsLoaded();
    }
  }, [isAdminLoggedIn, currentView, adminActiveTab, ensureCouponsLoaded]);

  const applyCoupon = (
    code: string,
    subtotal: number,
    deliveryFee: number
  ): { success: boolean; discountAmount: number; message: string; coupon?: Coupon } => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, discountAmount: 0, message: 'Please enter a coupon code.' };
    }
    const coupon = coupons.find((c) => c.code.toUpperCase() === cleanCode && c.isActive);
    if (!coupon) {
      return { success: false, discountAmount: 0, message: `Promo code "${cleanCode}" is invalid or expired.` };
    }
    if (coupon.minSpend && subtotal < coupon.minSpend) {
      return {
        success: false,
        discountAmount: 0,
        message: `Coupon "${coupon.code}" requires minimum purchase of ৳${coupon.minSpend.toLocaleString()} (Current: ৳${subtotal.toLocaleString()}).`,
      };
    }

    let discount = 0;
    if (coupon.discountType === 'fixed') {
      discount = Math.min(coupon.discountValue, subtotal);
    } else if (coupon.discountType === 'percentage') {
      discount = Math.round((subtotal * coupon.discountValue) / 100);
    } else if (coupon.discountType === 'free_shipping') {
      discount = deliveryFee;
    }

    return {
      success: true,
      discountAmount: discount,
      message: `Coupon "${coupon.code}" applied! You saved ৳${discount.toLocaleString()}.`,
      coupon,
    };
  };

  const addCoupon = (newCoupon: Coupon): { success: boolean; message: string } => {
    const cleanCode = newCoupon.code.trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, message: 'Voucher code is required.' };
    }
    if (coupons.some((c) => c.code.toUpperCase() === cleanCode)) {
      return { success: false, message: `Voucher code "${cleanCode}" already exists.` };
    }
    const sanitizedCoupon: Coupon = {
      ...newCoupon,
      code: cleanCode,
      discountValue: Number(newCoupon.discountValue) || 0,
      minSpend: newCoupon.minSpend ? Number(newCoupon.minSpend) : undefined,
    };
    setCoupons((prev) => [sanitizedCoupon, ...prev]);
    // Persist to Cloudflare D1
    couponsApi.create(sanitizedCoupon).catch(console.error);
    showNotification('success', 'Voucher Created', `Voucher "${cleanCode}" has been added.`);
    return { success: true, message: 'Voucher created successfully.' };
  };

  const updateCoupon = (code: string, updated: Partial<Coupon>): { success: boolean; message: string } => {
    const targetCode = code.trim().toUpperCase();
    const exists = coupons.some((c) => c.code.toUpperCase() === targetCode);
    if (!exists) {
      return { success: false, message: `Voucher "${code}" not found.` };
    }
    setCoupons((prev) =>
      prev.map((c) => {
        if (c.code.toUpperCase() === targetCode) {
          const newCode = updated.code ? updated.code.trim().toUpperCase() : c.code;
          return {
            ...c,
            ...updated,
            code: newCode,
            discountValue: updated.discountValue !== undefined ? Number(updated.discountValue) : c.discountValue,
            minSpend: updated.minSpend !== undefined ? (updated.minSpend ? Number(updated.minSpend) : undefined) : c.minSpend,
          };
        }
        return c;
      })
    );
    // Persist to Cloudflare D1
    couponsApi.update(targetCode, updated).catch(console.error);
    showNotification('success', 'Voucher Updated', `Voucher "${targetCode}" settings saved.`);
    return { success: true, message: 'Voucher updated successfully.' };
  };

  const deleteCoupon = (code: string) => {
    const targetCode = code.trim().toUpperCase();
    setCoupons((prev) => prev.filter((c) => c.code.toUpperCase() !== targetCode));
    // Persist to Cloudflare D1
    couponsApi.delete(targetCode).catch(console.error);
    showNotification('info', 'Voucher Deleted', `Voucher "${targetCode}" has been removed.`);
  };

  const toggleCouponActive = (code: string) => {
    const targetCode = code.trim().toUpperCase();
    let newStatus = false;
    setCoupons((prev) =>
      prev.map((c) => {
        if (c.code.toUpperCase() === targetCode) {
          newStatus = !c.isActive;
          return { ...c, isActive: newStatus };
        }
        return c;
      })
    );
    // Persist to Cloudflare D1
    couponsApi.update(targetCode, { isActive: newStatus }).catch(console.error);
    showNotification(
      'info',
      'Voucher Status Updated',
      `Voucher "${targetCode}" is now ${newStatus ? 'Active' : 'Disabled'}.`
    );
  };

  // Product Reviews & Ratings
  const [reviews, setReviews] = useState<ProductReview[]>(() => {
    try {
      const saved = localStorage.getItem('rongdhonu_reviews') || localStorage.getItem(STORAGE_KEYS.REVIEWS);
      return saved ? JSON.parse(saved) : INITIAL_REVIEWS;
    } catch {
      return INITIAL_REVIEWS;
    }
  });

  useEffect(() => {
    try {
      const data = JSON.stringify(reviews);
      localStorage.setItem('rongdhonu_reviews', data);
      localStorage.setItem(STORAGE_KEYS.REVIEWS, data);
    } catch (e) {
      console.error('Error saving reviews', e);
    }
  }, [reviews]);

  const getProductReviews = (productId: string) => {
    return reviews.filter((r) => r.productId === productId);
  };

  const addProductReview = (reviewData: Omit<ProductReview, 'id' | 'createdAt'>) => {
    const authorName = reviewData.authorName || reviewData.author || 'Customer';
    const newReview: ProductReview = {
      ...reviewData,
      author: authorName,
      authorName: authorName,
      id: `rev-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toISOString(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };
    const updatedReviews = [newReview, ...reviews];
    setReviews(updatedReviews);
    // Persist to Cloudflare D1
    reviewsApi.create(newReview).catch(console.error);

    // Dynamically recalculate product's rating and review count
    const productRevs = updatedReviews.filter((r) => r.productId === reviewData.productId);
    const avgRating =
      productRevs.reduce((acc, r) => acc + r.rating, 0) / productRevs.length;

    setProducts((prev) =>
      prev.map((p) =>
        p.id === reviewData.productId
          ? {
              ...p,
              rating: Number(avgRating.toFixed(1)),
              reviewsCount: Math.max((p.reviewsCount || 0) + 1, productRevs.length),
            }
          : p
      )
    );
  };

  const deleteProductReview = (reviewId: string) => {
    const target = reviews.find((r) => r.id === reviewId);
    if (!target) return;
    const prodId = target.productId;
    const updatedReviews = reviews.filter((r) => r.id !== reviewId);
    setReviews(updatedReviews);

    // Recalculate remaining reviews and average rating
    const remainingForProduct = updatedReviews.filter((r) => r.productId === prodId);
    const avgRating =
      remainingForProduct.length > 0
        ? remainingForProduct.reduce((acc, r) => acc + r.rating, 0) / remainingForProduct.length
        : 5.0;

    setProducts((prev) =>
      prev.map((p) =>
        p.id === prodId
          ? {
              ...p,
              rating: Number(avgRating.toFixed(1)),
              reviewsCount: Math.max(0, Math.max((p.reviewsCount || 1) - 1, remainingForProduct.length)),
            }
          : p
      )
    );

    showNotification(
      'info',
      'Review Removed 🗑️',
      'The customer review has been deleted and rating score has been updated.'
    );
  };

  // Orders - Database-first Cloudflare D1 creation
  const createOrder = async (orderData: {
    userId?: string;
    userEmail?: string;
    customer: Order['customer'];
    items: CartItem[];
    subtotal: number;
    deliveryFee: number;
    totalAmount: number;
    couponCode?: string;
    discountAmount?: number;
    paymentMethod: Order['paymentMethod'];
    paymentStatus: Order['paymentStatus'];
    transactionId?: string;
    dbblDetails?: Order['dbblDetails'];
    cardDetails?: Order['cardDetails'];
  }): Promise<Order> => {
    lastMutationTimestampRef.current = Date.now();

    const randNum = 10000000 + Math.floor(Math.random() * 90000000);
    const idempotencyKey = `idem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const newOrder: Order = {
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      orderNumber: `RT-${new Date().getFullYear()}-${randNum}`,
      userId: orderData.userId,
      userEmail: orderData.userEmail,
      customer: orderData.customer,
      items: orderData.items,
      subtotal: orderData.subtotal,
      deliveryFee: orderData.deliveryFee,
      totalAmount: orderData.totalAmount,
      couponCode: orderData.couponCode,
      discountAmount: orderData.discountAmount,
      paymentMethod: orderData.paymentMethod,
      paymentStatus: orderData.paymentStatus,
      transactionId: orderData.transactionId,
      dbblDetails: orderData.dbblDetails,
      cardDetails: orderData.cardDetails,
      shippingStatus: 'Pending',
      createdAt: new Date().toISOString(),
    };

    // 1. POST order directly to Cloudflare D1 with idempotency key
    const res = await orderApi.createOrder(newOrder, idempotencyKey);

    // 2. Verify D1 response
    if (!res.success) {
      showNotification(
        'error',
        'Order Placement Failed',
        res.error || 'Could not save order to Cloudflare D1 database. Please check your connection and try again.',
        6000
      );
      throw new Error(res.error || 'Failed to save order to Cloudflare D1');
    }

    // 3. Use returned canonical order from D1
    const canonicalOrder: Order = res.order || newOrder;

    // 4. Update React state with canonical D1 order
    setOrders((prev) => [canonicalOrder, ...prev.filter((o) => o.id !== canonicalOrder.id)]);
    clearCart();

    // 5. Targeted D1 product stock synchronization: refresh only ordered products
    const orderedProductIds = canonicalOrder.items.map((it) => it.product.id);
    refreshProductsByIds(orderedProductIds).catch((err) =>
      console.warn('D1 product refresh after order warning:', err)
    );

    // 6. High-Accuracy Purchase Synchronization with Meta, TikTok & GTM dataLayer
    trackEvent(
      'Purchase',
      {
        content_name: canonicalOrder.items.map((it) => it.product.title).join(', '),
        content_ids: canonicalOrder.items.map((it) => it.product.id),
        contents: canonicalOrder.items.map((it) => ({
          id: it.product.id,
          name: it.product.title,
          price: it.product.price,
          quantity: it.quantity,
          item_price: it.product.price,
        })),
        num_items: canonicalOrder.items.reduce((acc, it) => acc + it.quantity, 0),
        value: canonicalOrder.totalAmount,
        currency: 'BDT',
        order_id: canonicalOrder.id,
        transaction_id: canonicalOrder.orderNumber,
        payment_method: canonicalOrder.paymentMethod,
      },
      {
        email: orderData.customer.email || orderData.userEmail || currentUser?.email,
        phone: orderData.customer.phone || currentUser?.phone,
        fullName: orderData.customer.fullName || currentUser?.name,
        district: orderData.customer.district,
        deliveryZone: orderData.customer.deliveryZone,
      }
    );

    // 7. Show success notification ONLY AFTER D1 confirmation
    showNotification(
      'success',
      'Order Placed Successfully! 🎉',
      `Order #${canonicalOrder.orderNumber} for ৳${canonicalOrder.totalAmount.toLocaleString()} has been received! Our team is preparing your package.`,
      6000
    );

    return canonicalOrder;
  };

  const finalizePayment = async (orderId: string, transactionId: string) => {
    lastMutationTimestampRef.current = Date.now();
    const res = await orderApi.updateOrder(orderId, { paymentStatus: 'Paid', transactionId });
    if (res.success && res.order) {
      setOrders((prev) => prev.map((ord) => ord.id === orderId ? res.order! : ord));
      setActivePaymentModalOrder(null);
      showNotification('success', 'Payment Verified ✅', 'Payment has been updated in Cloudflare D1.');
    } else {
      showNotification('error', 'Payment Update Failed', res.error || 'Failed to update payment status in D1.');
    }
  };

  // User & Admin Authentication (Authoritative Cloudflare D1 via PBKDF2)
  const loginUser = async (
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
          _setCurrentView('admin');
        } else {
          setIsAdminLoggedIn(false);
        }

        try {
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
  };

  const registerUser = async (data: {
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
        setUsers((prev) => [regRes.user!, ...prev.filter((u) => u.id !== regRes.user!.id)]);
        setCurrentUser(regRes.user);
        setIsAdminLoggedIn(false);
        _setCurrentView('store');
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
  };

  const hasPermission = (permissionKey: PermissionKey | keyof AdminPermissions | string): boolean => {
    return hasUserPermission(currentUser, permissionKey);
  };
  const can = hasPermission;

  const updateUserRoleAndPermissions = (
    userIdOrEmail: string,
    newRole: UserRole,
    newPermissions: AdminPermissions
  ): { success: boolean; message?: string } => {
    // Check permission
    if (!hasPermission('canManageAccounts')) {
      return {
        success: false,
        message: 'Access Denied: You do not have permission to modify roles or permissions.',
      };
    }

    const normalized = userIdOrEmail.toLowerCase().trim();
    const target = users.find(
      (u) => u.id === userIdOrEmail || u.email.toLowerCase().trim() === normalized
    );
    if (!target) {
      return { success: false, message: 'User account not found.' };
    }

    // Super Admin protection guard: Super Admin accounts cannot have permissions revoked or role demoted
    if (target.role === 'super_admin') {
      return {
        success: false,
        message: 'Super Administrator accounts are permanently protected and cannot have permissions revoked or role demoted.',
      };
    }

    const updatedUsers = users.map((u) => {
      if (u.id === target.id || u.email.toLowerCase().trim() === normalized) {
        return {
          ...u,
          role: newRole,
          permissions:
            newRole === 'sub_admin'
              ? newPermissions
              : newRole === 'super_admin' || newRole === 'admin'
              ? SUPER_ADMIN_PERMISSIONS
              : undefined,
        };
      }
      return u;
    });

    setUsers(updatedUsers);

    // Persist role and permission updates to Cloudflare D1
    const newPerms = newRole === 'sub_admin' ? newPermissions : (newRole === 'super_admin' || newRole === 'admin' ? SUPER_ADMIN_PERMISSIONS : undefined);
    usersApi.update(target.id, { role: newRole, permissions: newPerms }).catch(console.error);

    // If target is currently logged in, sync currentUser
    if (
      currentUser &&
      (currentUser.id === target.id || currentUser.email.toLowerCase().trim() === normalized)
    ) {
      const self = updatedUsers.find((u) => u.id === target.id);
      if (self) {
        setCurrentUser(self);
        try {
          localStorage.setItem('rongdhonu_current_user', JSON.stringify(self));
        } catch (e) {
          console.error(e);
        }
      }
    }

    try {
      const usersJson = JSON.stringify(updatedUsers);
      localStorage.setItem('rongdhonu_users', usersJson);
      localStorage.setItem('rongdhonu_users_v2', usersJson);
      localStorage.setItem(STORAGE_KEYS.USERS, usersJson);
    } catch (e) {
      console.error('Error saving updated users to localStorage', e);
    }

    return {
      success: true,
      message: `Permissions updated successfully for ${target.name} (${newRole.toUpperCase()}).`,
    };
  };

  const deleteUser = (userIdOrEmail: string): { success: boolean; message?: string } => {
    if (!hasPermission('canManageAccounts')) {
      return { success: false, message: 'Access Denied: You do not have permission to delete accounts.' };
    }

    const normalized = userIdOrEmail.toLowerCase().trim();
    const target = users.find(
      (u) => u.id === userIdOrEmail || u.email.toLowerCase().trim() === normalized
    );
    if (!target) {
      return { success: false, message: 'Account not found.' };
    }
    // Protect super admin accounts from deletion
    if (target.role === 'super_admin') {
      return {
        success: false,
        message: 'Super Administrator accounts are permanently protected and cannot be deleted.',
      };
    }

    // Prevent deleting your own currently active account
    if (
      currentUser?.id === target.id ||
      currentUser?.email?.toLowerCase().trim() === normalized
    ) {
      return {
        success: false,
        message: 'You cannot delete your own currently logged-in account.',
      };
    }

    const updatedUsers = users.filter(
      (u) => u.id !== target.id && u.email.toLowerCase().trim() !== target.email.toLowerCase().trim()
    );
    setUsers(updatedUsers);
    // Persist deletion to Cloudflare D1
    usersApi.delete(target.id).catch(console.error);

    try {
      const usersJson = JSON.stringify(updatedUsers);
      localStorage.setItem('rongdhonu_users', usersJson);
      localStorage.setItem('rongdhonu_users_v2', usersJson);
      localStorage.setItem(STORAGE_KEYS.USERS, usersJson);
    } catch (e) {
      console.error('Error saving updated users to localStorage', e);
    }

    if (
      currentUser?.id === target.id ||
      currentUser?.email?.toLowerCase().trim() === target.email.toLowerCase().trim()
    ) {
      logout();
    }
    return { success: true, message: `Customer account "${target.name}" (${target.email}) deleted successfully.` };
  };

  const deleteCustomer = (targetUser: UserAccount | string): { success: boolean; message?: string } => {
    const emailOrId = typeof targetUser === 'string' ? targetUser : targetUser.email || targetUser.id;
    return deleteUser(emailOrId);
  };

  const resetCustomerPassword = async (
    emailOrId: string,
    newPassword: string
  ): Promise<{ success: boolean; message?: string }> => {
    const trimmedPw = newPassword.trim();
    if (!trimmedPw || trimmedPw.length < 6) {
      return { success: false, message: 'New password must be at least 6 characters long.' };
    }
    const normalized = emailOrId.toLowerCase().trim();
    const target = users.find(
      (u) => u.id === emailOrId || u.email.toLowerCase().trim() === normalized
    );
    if (!target) {
      return { success: false, message: 'User account not found.' };
    }
    try {
      const res = await usersApi.resetPassword(target.id, trimmedPw);
      return {
        success: true,
        message: res.message || `Password for ${target.email} has been reset successfully.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Failed to reset password on the server.',
      };
    }
  };

  // Super Admin Password Update (Authoritative Cloudflare D1 PBKDF2)
  const changeSuperAdminPassword = async (
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
      // 1. Authoritative password verification & PBKDF2 hashing in Cloudflare D1
      const res = await authApi.changePassword(trimmedNew, currentPassword.trim());
      if (!res.success) {
        return { success: false, message: res.error || 'Failed to update password.' };
      }

      // 2. Purge all legacy stored passwords from localStorage
      try {
        localStorage.removeItem('rongdhonu_super_admin_pwd');
      } catch {}

      showNotification('success', 'Security Updated 🔒', 'Super Admin password updated in Cloudflare D1.');
      return { success: true, message: 'Super Admin password changed successfully!' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to update password on server.' };
    }
  };

  // URL Deep Linking Helpers for Products and Categories
  const getProductUrl = (productId: string, options?: { absolute?: boolean }): string => {
    const path = `/product/${encodeURIComponent(productId)}`;
    return options?.absolute ? `${SITE_DOMAIN}${path}` : path;
  };

  const getCategoryUrl = (categoryIdOrSlug: string, options?: { absolute?: boolean }): string => {
    const cat = categories.find((c) => c.id === categoryIdOrSlug || c.slug === categoryIdOrSlug);
    const identifier = cat ? cat.slug || cat.id : categoryIdOrSlug;
    const path = `/category/${encodeURIComponent(identifier)}`;
    return options?.absolute ? `${SITE_DOMAIN}${path}` : path;
  };

  const copyProductLink = async (productId: string): Promise<boolean> => {
    const url = getProductUrl(productId, { absolute: true });
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showNotification(
        'success',
        'Product URL Copied! 🔗',
        `Direct link copied: ${url}`
      );
      return true;
    } catch (err) {
      console.error('Failed to copy product link', err);
      showNotification('error', 'Copy Failed', url);
      return false;
    }
  };

  const copyCategoryLink = async (categoryIdOrSlug: string): Promise<boolean> => {
    const url = getCategoryUrl(categoryIdOrSlug, { absolute: true });
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showNotification(
        'success',
        'Category URL Copied! 🔗',
        `Direct link copied: ${url}`
      );
      return true;
    } catch (err) {
      console.error('Failed to copy category link', err);
      showNotification('error', 'Copy Failed', url);
      return false;
    }
  };

  const logout = () => {
    hadActiveSessionRef.current = false;
    authApi.logout();
    setCurrentUser(null);
    setIsAdminLoggedIn(false);
    setCurrentView('store');
    try {
      localStorage.removeItem('rongdhonu_current_user');
      localStorage.removeItem('rongdhonu_current_user_v2');
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
      localStorage.setItem('rongdhonu_admin_auth_v1', 'false');
    } catch (e) {
      console.error('Error on logout', e);
    }
  };

  // Admin Authentication bridge
  const adminLogin = async (usernameOrEmail: string, password: string): Promise<boolean> => {
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
        _setCurrentView('admin');
        return true;
      }
    }
    return false;
  };

  const adminLogout = () => {
    logout();
  };

  // Adjust Product Ratings & Reviews
  const adjustProductRating = async (productId: string, rating: number, reviewsCount?: number): Promise<void> => {
    const clampedRating = Math.max(1, Math.min(5, Number(rating.toFixed(1))));
    try {
      const canonical = await productsApi.update(productId, {
        rating: clampedRating,
        ...(reviewsCount !== undefined ? { reviewsCount } : {}),
      });
      setProducts((prev) => prev.map((prod) => (prod.id === productId ? canonical : prod)));
      showNotification('success', 'Rating Updated', 'Product rating score updated in D1 database.');
    } catch (err: any) {
      console.error('D1 adjustProductRating error:', err);
      showNotification('error', 'Rating Update Failed', err?.message || 'Failed to update rating in D1');
      try {
        const fresh = await productsApi.getById(productId);
        if (fresh) setProducts((prev) => prev.map((p) => (p.id === productId ? fresh : p)));
      } catch {}
    }
  };

  // Admin Product CRUD (Cloudflare D1 is the sole source of truth)
  const addProduct = async (
    productData: Omit<Product, 'id' | 'createdAt'>
  ): Promise<{ success: boolean; product?: Product; error?: string }> => {
    try {
      // 1. Call D1 API (POST /api/products)
      const canonical = await productsApi.create(productData);

      // 2. Only update React state after D1 confirms success
      setProducts((prev) => [canonical, ...prev.filter((p) => p.id !== canonical.id)]);
      showNotification(
        'success',
        'Product Created in D1',
        `"${canonical.title}" has been saved to the D1 database.`
      );
      return { success: true, product: canonical };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to create product in D1 database';
      console.error('D1 addProduct error:', err);
      showNotification('error', 'Product Creation Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  };

  const updateProduct = async (
    id: string,
    updates: Partial<Product>
  ): Promise<{ success: boolean; product?: Product; error?: string }> => {
    try {
      // 1. Call D1 API (PUT /api/products/:id)
      const canonical = await productsApi.update(id, updates);

      // 2. Only update React state after D1 confirms success
      setProducts((prev) =>
        prev.map((prod) => (prod.id === id ? canonical : prod))
      );
      setFeaturedProducts((prev) =>
        canonical.featured
          ? prev.some((p) => p.id === id)
            ? prev.map((p) => (p.id === id ? canonical : p))
            : [...prev, canonical]
          : prev.filter((p) => p.id !== id)
      );
      setQuickViewProduct((prev) => (prev && prev.id === id ? canonical : prev));
      setVideoModalProduct((prev) => {
        if (!prev || prev.id !== id) return prev;
        return canonical.videoUrl && canonical.videoUrl.trim() ? canonical : null;
      });

      // Also update cart if this product is in the cart
      setCart((prev) =>
        prev.map((item) => (item.product.id === id ? { ...item, product: canonical } : item))
      );

      showNotification(
        'success',
        'Product Updated in D1',
        `"${canonical.title}" has been updated in the D1 database.`
      );
      return { success: true, product: canonical };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to update product in D1 database';
      console.error('D1 updateProduct error:', err);

      // Restore previous valid state from D1
      try {
        const fresh = await productsApi.getById(id);
        if (fresh) {
          setProducts((prev) => prev.map((p) => (p.id === id ? fresh : p)));
        }
      } catch {}

      showNotification('error', 'Update Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  };

  const toggleProductFeatured = async (
    productId: string,
    isFeatured?: boolean,
    sortOrder?: number
  ): Promise<{ success: boolean; error?: string }> => {
    const target = products.find((p) => p.id === productId);
    const newFeatured = isFeatured !== undefined ? isFeatured : !(target?.featured);
    try {
      const canonical = await productsApi.setFeatured(productId, newFeatured, sortOrder);

      // 1. Update master products in state
      setProducts((prev) =>
        prev.map((prod) => (prod.id === productId ? canonical : prod))
      );

      // 2. Update featuredProducts list
      setFeaturedProducts((prev) => {
        if (newFeatured) {
          const idx = prev.findIndex((p) => p.id === productId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = canonical;
            return next;
          }
          return [...prev, canonical];
        } else {
          return prev.filter((p) => p.id !== productId);
        }
      });

      // 3. Update homepageCategoryProducts without changing product's original category!
      setHomepageCategoryProducts((prev) => {
        let changed = false;
        const next: Record<string, Product[]> = {};
        for (const [catId, prods] of Object.entries(prev)) {
          if (!Array.isArray(prods)) continue;
          next[catId] = prods.map((p) => {
            if (p.id === productId) {
              changed = true;
              return canonical;
            }
            return p;
          });
        }
        return changed ? next : prev;
      });

      // 4. Update categoryListingProducts if displayed
      setCategoryListingProducts((prev) =>
        prev.map((p) => (p.id === productId ? canonical : p))
      );

      // 5. Update modals if open
      setQuickViewProduct((prev) => (prev?.id === productId ? canonical : prev));
      setSingleProduct((prev) => (prev?.id === productId ? canonical : prev));

      showNotification(
        'success',
        newFeatured ? 'Added to Featured' : 'Removed from Featured',
        `"${canonical.title}" is ${newFeatured ? 'now featured on the homepage' : 'no longer featured on the homepage'}.`
      );
      return { success: true };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to update featured status in D1';
      console.error('toggleProductFeatured error:', err);
      showNotification('error', 'Featured Update Failed', errorMsg, 5000);
      return { success: false, error: errorMsg };
    }
  };

  const deleteProduct = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // 1. Call D1 API (DELETE /api/products/:id)
      await productsApi.delete(id);

      // 2. Only update React state after D1 confirms success
      setProducts((prev) => prev.filter((prod) => prod.id !== id));
      setFeaturedProducts((prev) => prev.filter((prod) => prod.id !== id));
      setCart((prev) => prev.filter((item) => item.product.id !== id));
      showNotification('info', 'Product Deleted', 'Product removed from D1 catalog.');
      return { success: true };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to delete product from D1 database';
      console.error('D1 deleteProduct error:', err);
      // Re-sync specific product to restore valid state
      refreshProductsByIds([id]).catch(() => {});
      showNotification('error', 'Deletion Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  };

  const increaseStock = async (productId: string, amount: number): Promise<void> => {
    const current = products.find((p) => p.id === productId);
    if (!current) return;
    const newStock = Math.max(0, current.stock + amount);
    try {
      const canonical = await productsApi.update(productId, { stock: newStock });
      setProducts((prev) => prev.map((prod) => (prod.id === productId ? canonical : prod)));
      showNotification('success', 'Stock Updated', `Stock for "${canonical.title}" updated in D1.`);
    } catch (err: any) {
      console.error('D1 increaseStock error:', err);
      showNotification('error', 'Stock Update Failed', err?.message || 'Failed to update stock in D1');
    }
  };

  // Admin Category CRUD (Cloudflare D1 is the sole source of truth)
  const addCategory = async (
    catData: Omit<Category, 'id' | 'slug'>
  ): Promise<{ success: boolean; category?: Category; error?: string }> => {
    const slug = catData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const newCat: Partial<Category> = {
      ...catData,
      id: `cat-${Date.now()}`,
      slug: slug || `category-${Date.now()}`,
    };
    try {
      const canonical = await categoriesApi.create(newCat);
      setCategories((prev) => [...prev.filter((c) => c.id !== canonical.id), canonical]);
      showNotification('success', 'Category Created', `Category "${canonical.name}" created in D1.`);
      return { success: true, category: canonical };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to create category in D1';
      console.error('D1 addCategory error:', err);
      showNotification('error', 'Category Creation Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  };

  const updateCategory = async (
    id: string,
    updates: Partial<Category>
  ): Promise<{ success: boolean; category?: Category; error?: string }> => {
    try {
      const canonical = await categoriesApi.update(id, updates);
      setCategories((prev) => prev.map((cat) => (cat.id === id ? canonical : cat)));
      showNotification('success', 'Category Updated', `Category "${canonical.name}" updated in D1.`);
      return { success: true, category: canonical };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to update category in D1';
      console.error('D1 updateCategory error:', err);
      categoriesApi.getAll().then((cats) => { if (Array.isArray(cats)) setCategories(cats); }).catch(() => {});
      showNotification('error', 'Category Update Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  };

  const deleteCategory = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await categoriesApi.delete(id);
      setCategories((prev) => prev.filter((cat) => cat.id !== id));
      if (selectedCategory === id) {
        setSelectedCategory(null);
      }
      showNotification('info', 'Category Deleted', 'Category removed from D1.');
      return { success: true };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to delete category from D1';
      console.error('D1 deleteCategory error:', err);
      categoriesApi.getAll().then((cats) => { if (Array.isArray(cats)) setCategories(cats); }).catch(() => {});
      showNotification('error', 'Category Deletion Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  };

  // Admin Slides / Carousel Management (Cloudflare D1 is the sole source of truth)
  const addSlide = async (
    slideData: Omit<CarouselSlide, 'id'>
  ): Promise<{ success: boolean; slider?: CarouselSlide; error?: string }> => {
    try {
      const canonical = await slidersApi.create(slideData);
      setSlides((prev) => [...prev.filter((s) => s.id !== canonical.id), canonical]);
      showNotification('success', 'Slide Added in D1', 'New carousel banner slide added to D1.');
      return { success: true, slider: canonical };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to add slide to D1 database';
      console.error('D1 addSlide error:', err);
      showNotification('error', 'Slide Creation Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  };

  const updateSlide = async (
    id: string,
    updates: Partial<CarouselSlide>
  ): Promise<{ success: boolean; slider?: CarouselSlide; error?: string }> => {
    try {
      // 1. Call D1 API (PUT /api/sliders/:id)
      const canonical = await slidersApi.update(id, updates);

      // 2. Only update React state after D1 confirms success
      setSlides((prev) =>
        prev.map((s) => (s.id === id ? canonical : s))
      );

      showNotification('success', 'Slide Updated in D1', 'Slide has been updated in D1 database.');
      return { success: true, slider: canonical };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to update slide in D1 database';
      console.error('D1 updateSlide error:', err);

      // Restore previous valid state by re-fetching from D1
      try {
        const freshSliders = await slidersApi.getAll();
        if (Array.isArray(freshSliders)) {
          setSlides(freshSliders);
        }
      } catch {}

      showNotification('error', 'Slide Update Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  };

  const deleteSlide = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await slidersApi.delete(id);
      setSlides((prev) => prev.filter((s) => s.id !== id));
      showNotification('info', 'Slide Removed', 'Slide has been deleted from D1.');
      return { success: true };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to delete slide from D1';
      console.error('D1 deleteSlide error:', err);
      slidersApi.getAll().then((s) => { if (Array.isArray(s)) setSlides(s); }).catch(() => {});
      showNotification('error', 'Slide Deletion Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  };

  const resetSlides = async () => {
    try {
      const fresh = await slidersApi.getAll();
      if (Array.isArray(fresh)) {
        setSlides(fresh);
      }
      showNotification('info', 'Slides Refreshed', 'Slides re-synced with D1 database.');
    } catch (err: any) {
      console.error('D1 resetSlides error:', err);
    }
  };

  // Admin Courier APIs Management (Strictly enforces credential-free client storage)
  const addCourierConfig = (configData: Omit<CourierApiConfig, 'id'>): CourierApiConfig => {
    let sanitizedBaseUrl = configData.baseUrl?.trim() || '';
    if (sanitizedBaseUrl.includes('portal.steadfast.com.bd')) {
      sanitizedBaseUrl = sanitizedBaseUrl.replace('portal.steadfast.com.bd', 'portal.packzy.com');
    }

    const sanitizedData = sanitizeCourierConfig(configData);
    const newConfig: CourierApiConfig = {
      ...sanitizedData,
      baseUrl: sanitizedBaseUrl || sanitizedData.baseUrl,
      id: `courier-${Date.now()}`,
    };
    setCourierConfigs((prev) => [...prev, newConfig]);

    // Automatically fire webhook whenever a courier is added
    if (configData.triggerWebhookOnAdd !== false) {
      setTimeout(() => {
        triggerCourierWebhooks('courier.added', newConfig).catch((err) =>
          console.warn('Courier added webhook notification error:', err)
        );
      }, 50);
    }

    return newConfig;
  };

  const updateCourierConfig = (id: string, updates: Partial<CourierApiConfig>) => {
    let sanitizedUpdates = sanitizeCourierConfig(updates);
    if (sanitizedUpdates.baseUrl && sanitizedUpdates.baseUrl.includes('portal.steadfast.com.bd')) {
      sanitizedUpdates.baseUrl = sanitizedUpdates.baseUrl.replace('portal.steadfast.com.bd', 'portal.packzy.com');
    }

    setCourierConfigs((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...sanitizedUpdates } : c))
    );

    const target = courierConfigs.find((c) => c.id === id);

    // Trigger courier.updated webhook
    setTimeout(() => {
      triggerCourierWebhooks('courier.updated', { id, ...target, ...sanitizedUpdates }).catch((err) =>
        console.warn('Courier updated webhook error:', err)
      );
    }, 50);
  };

  const deleteCourierConfig = (id: string) => {
    const target = courierConfigs.find((c) => c.id === id);
    setCourierConfigs((prev) => prev.filter((c) => c.id !== id));
    if (target) {
      setTimeout(() => {
        triggerCourierWebhooks('courier.deleted', target).catch((err) =>
          console.warn('Courier deleted webhook error:', err)
        );
      }, 50);
    }
  };

  const resetCourierConfigs = () => {
    setCourierConfigs(INITIAL_COURIER_CONFIGS);
    localStorage.removeItem(STORAGE_KEYS.COURIERS);
  };

  // Courier Webhooks Management & Dispatcher
  const triggerCourierWebhooks = async (
    event: string,
    courier: any
  ): Promise<{ success: boolean; dispatchedCount: number; results: any[] }> => {
    // 1. Gather all active webhooks that listen to this event
    const activeWebhooks = courierWebhooks.filter(
      (w) => w.isActive && (w.events.includes(event) || w.events.includes('*') || !w.events || w.events.length === 0)
    );

    // 2. Also check if the courier itself has a custom webhookUrl defined
    const courierDirectWebhook = courier.webhookUrl?.trim();
    const allTargets: { url: string; secret?: string; webhookId?: string; name: string }[] = [];

    for (const w of activeWebhooks) {
      if (w.url && w.url.trim()) {
        allTargets.push({ url: w.url.trim(), secret: w.secret, webhookId: w.id, name: w.name });
      }
    }

    if (courierDirectWebhook && !allTargets.some((t) => t.url === courierDirectWebhook)) {
      allTargets.push({
        url: courierDirectWebhook,
        secret: courier.webhookSecret,
        webhookId: `courier-direct-${courier.id}`,
        name: `${courier.name} Direct Webhook`,
      });
    }

    if (allTargets.length === 0) {
      return { success: true, dispatchedCount: 0, results: [] };
    }

    // Sanitize courier payload for safety (never expose full API key or secret in plaintext)
    const sanitizedCourier = {
      id: courier.id,
      name: courier.name,
      code: courier.code,
      baseUrl: courier.baseUrl,
      trackingUrlPattern: courier.trackingUrlPattern,
      isActive: courier.isActive,
      hasApiKey: Boolean(courier.apiKey),
      hasSecretKey: Boolean(courier.secretKey),
      webhookUrl: courier.webhookUrl,
      createdAt: courier.createdAt || new Date().toISOString(),
    };

    const newLogs: CourierWebhookLog[] = [];
    const results: any[] = [];

    // Try backend proxy dispatcher first to avoid CORS issues
    try {
      const serverRes = await courierWebhooksApi.trigger(event, sanitizedCourier, {
        webhooks: courierWebhooks,
        targetUrl: courierDirectWebhook,
        secret: courier.webhookSecret,
      });

      if (serverRes.success && Array.isArray(serverRes.results) && serverRes.results.length > 0) {
        for (const r of serverRes.results) {
          const logEntry: CourierWebhookLog = {
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            webhookId: r.webhookId,
            webhookUrl: r.url,
            event,
            timestamp: new Date().toISOString(),
            status: r.success ? 'success' : 'failed',
            httpStatus: r.status,
            latencyMs: r.durationMs,
            responsePreview: r.responsePreview || r.error,
            courierName: courier.name,
            payload: {
              event,
              timestamp: new Date().toISOString(),
              courier: sanitizedCourier,
              store: { siteName: settings.siteName, currency: settings.currencySymbol },
            },
          };
          newLogs.push(logEntry);
          results.push(r);
        }
      }
    } catch (e) {
      console.warn('Backend webhook trigger had issues, trying client-side fallback:', e);
    }

    // Fallback: If any target wasn't dispatched by server, dispatch directly from browser
    for (const target of allTargets) {
      if (results.some((r) => r.url === target.url)) continue;

      const start = Date.now();
      try {
        const payload = {
          event,
          action: event === 'courier.added' ? 'courier_created' : event,
          timestamp: new Date().toISOString(),
          courier: sanitizedCourier,
          store: { siteName: settings.siteName, currency: settings.currencySymbol },
        };
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-Timestamp': new Date().toISOString(),
        };
        if (target.secret && target.secret !== '••••••••' && !target.secret.startsWith('****')) {
          headers['X-Webhook-Secret'] = target.secret;
        }

        const res = await fetch(target.url, {
          method: 'POST',
          mode: 'cors',
          headers,
          body: JSON.stringify(payload),
        });

        const durationMs = Date.now() - start;
        const text = await res.text().catch(() => '');

        const logEntry: CourierWebhookLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          webhookId: target.webhookId,
          webhookUrl: target.url,
          event,
          timestamp: new Date().toISOString(),
          status: res.ok ? 'success' : 'failed',
          httpStatus: res.status,
          latencyMs: durationMs,
          responsePreview: text.slice(0, 300),
          courierName: courier.name,
          payload,
        };
        newLogs.push(logEntry);
        results.push({ url: target.url, success: res.ok, status: res.status, durationMs });
      } catch (err: any) {
        const logEntry: CourierWebhookLog = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          webhookId: target.webhookId,
          webhookUrl: target.url,
          event,
          timestamp: new Date().toISOString(),
          status: 'failed',
          httpStatus: 0,
          latencyMs: Date.now() - start,
          responsePreview: err?.message || 'Network / CORS error',
          courierName: courier.name,
          payload: { event, courier: sanitizedCourier },
        };
        newLogs.push(logEntry);
        results.push({ url: target.url, success: false, status: 0, error: err?.message });
      }
    }

    if (newLogs.length > 0) {
      setCourierWebhookLogs((prev) => [...newLogs, ...prev].slice(0, 100));
    }

    const successful = results.filter((r) => r.success).length;
    if (results.length > 0) {
      if (successful === results.length) {
        showNotification(
          'success',
          'Webhook Delivered',
          `Dispatched "${event}" notification to ${results.length} webhook endpoint(s).`
        );
      } else {
        showNotification(
          'warning',
          'Webhook Delivery Notice',
          `${successful}/${results.length} webhooks delivered. Check Webhook Logs.`
        );
      }
    }

    return { success: true, dispatchedCount: results.length, results };
  };

  const addCourierWebhook = async (
    webhookData: Omit<CourierWebhookConfig, 'id' | 'createdAt'>
  ): Promise<CourierWebhookConfig> => {
    const newWebhook: CourierWebhookConfig = {
      ...webhookData,
      id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [...courierWebhooks, newWebhook];
    setCourierWebhooks(updated);

    try {
      await updateSettings({ courierWebhooks: updated });
      showNotification('success', 'Webhook Created', `Configured "${newWebhook.name}" for courier events.`);
    } catch (err) {
      console.warn('Error syncing webhook to D1:', err);
    }
    return newWebhook;
  };

  const updateCourierWebhook = async (id: string, updates: Partial<CourierWebhookConfig>) => {
    const updated = courierWebhooks.map((w) => (w.id === id ? { ...w, ...updates } : w));
    setCourierWebhooks(updated);
    try {
      await updateSettings({ courierWebhooks: updated });
      showNotification('info', 'Webhook Updated', 'Webhook configuration saved.');
    } catch (err) {
      console.warn('Error updating webhook in D1:', err);
    }
  };

  const deleteCourierWebhook = async (id: string) => {
    const target = courierWebhooks.find((w) => w.id === id);
    const updated = courierWebhooks.filter((w) => w.id !== id);
    setCourierWebhooks(updated);
    try {
      await updateSettings({ courierWebhooks: updated });
      showNotification('info', 'Webhook Removed', `Removed "${target?.name || 'Webhook'}".`);
    } catch (err) {
      console.warn('Error removing webhook in D1:', err);
    }
  };

  const testCourierWebhook = async (params: {
    url: string;
    secret?: string;
    webhookId?: string;
    event?: string;
    courier?: any;
  }): Promise<{ success: boolean; status?: number; latencyMs?: number; responsePreview?: string; error?: string }> => {
    const res = await courierWebhooksApi.test(params);
    const logEntry: CourierWebhookLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      webhookUrl: params.url,
      event: params.event || 'test.ping',
      timestamp: new Date().toISOString(),
      status: res.success ? 'success' : 'failed',
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      responsePreview: res.responsePreview || res.error,
      courierName: params.courier?.name || 'Test Courier',
      payload: {
        event: params.event || 'test.ping',
        ping: true,
        timestamp: new Date().toISOString(),
        courier: params.courier,
      },
    };
    setCourierWebhookLogs((prev) => [logEntry, ...prev].slice(0, 100));
    return res;
  };

  const clearCourierWebhookLogs = () => {
    setCourierWebhookLogs([]);
    localStorage.removeItem(STORAGE_KEYS.COURIER_WEBHOOK_LOGS);
    showNotification('info', 'Logs Cleared', 'Courier webhook delivery logs have been cleared.');
  };

  // Admin Order & Courier Management - Database First
  const updateOrderStatus = async (
    orderId: string,
    status: ShippingStatus
  ): Promise<{ success: boolean; error?: string }> => {
    lastMutationTimestampRef.current = Date.now();
    const target = orders.find((o) => o.id === orderId);

    showNotification(
      'info',
      'Saving Status...',
      `Updating order #${target?.orderNumber || orderId} to "${status}" in Cloudflare D1...`,
      2500
    );

    const res = await orderApi.updateOrder(orderId, { shippingStatus: status });

    if (!res.success) {
      showNotification(
        'error',
        'Update Failed',
        res.error || 'Failed to update order status in Cloudflare D1. State preserved.',
        6000
      );
      return { success: false, error: res.error };
    }

    const updatedOrder = res.order;
    setOrders((prev) =>
      prev.map((ord) => (ord.id === orderId ? (updatedOrder || { ...ord, shippingStatus: status }) : ord))
    );

    // If order was cancelled, immediately sync affected products so restored stock is reflected across the app
    if (status === 'Cancelled' || target?.shippingStatus === 'Cancelled') {
      const affectedIds = target?.items ? target.items.map((it) => it.product.id) : [];
      refreshProductsByIds(affectedIds).catch((err) =>
        console.warn('Failed to sync products after cancellation:', err)
      );
    }

    showNotification(
      'success',
      'Order Updated Successfully! ✅',
      `Order #${target?.orderNumber || orderId} status changed to "${status}".`,
      3500
    );

    return { success: true };
  };

  const bookCourier = async (orderId: string, provider: CourierProvider, parcelData?: any): Promise<CourierBooking> => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const res = await bookWithCourier(order, provider, parcelData);
    if (!res.success) {
      throw new Error(res.message);
    }
    const trackingCode = res.trackingCode || '';
    const consignmentId = res.consignmentId || '';
    const courierConfig = courierConfigs.find(
      (c) => c.code.toLowerCase() === provider.toLowerCase() || c.name.toLowerCase() === provider.toLowerCase() || c.id === provider
    );
    const pattern = courierConfig?.trackingUrlPattern || 'https://steadfast.com.bd/t/{trackingCode}';
    const trackingUrl = pattern.includes('{trackingCode}') ? pattern.replace('{trackingCode}', trackingCode) : `${pattern}/${trackingCode}`;

    return {
      provider: courierConfig?.name || provider,
      waybillId: trackingCode,
      consignmentId,
      trackingUrl,
      bookedAt: new Date().toISOString(),
    };
  };

  const bookWithCourier = async (
    order: Order,
    courierProviderOrId: string,
    parcelData?: {
      delivery_type?: number;
      recipient_name?: string;
      recipient_phone?: string;
      alternative_phone?: string;
      recipient_email?: string;
      recipient_address?: string;
      area?: string;
      district?: string;
      cod_amount?: number;
      item_description?: string;
      total_lot?: number;
      weight?: number;
      note?: string;
      apiKey?: string;
      secretKey?: string;
      baseUrl?: string;
      trackingUrlPattern?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    trackingCode?: string;
    consignmentId?: string;
  }> => {
    if (!hasPermission('canManageOrders')) {
      return {
        success: false,
        message: 'Access Denied: You do not have permission to manage orders or book couriers.',
      };
    }

    // Identify target courier from courierConfigs
    const targetCourier = courierConfigs.find(
      (c) =>
        c.id === courierProviderOrId ||
        c.code?.toLowerCase() === courierProviderOrId?.toLowerCase() ||
        c.name?.toLowerCase() === courierProviderOrId?.toLowerCase()
    );
    const isSteadfast = (courierProviderOrId || '').toLowerCase().includes('steadfast') || targetCourier?.code?.toLowerCase().includes('steadfast');
    const courierName = targetCourier?.name || (isSteadfast ? 'Steadfast Courier' : (courierProviderOrId || 'Courier'));
    const courierCode = targetCourier?.code || (isSteadfast ? 'Steadfast' : courierProviderOrId);

    // Strict pre-dispatch validation
    const recipientName = (parcelData?.recipient_name || order.customer.fullName || '').trim();
    if (!recipientName || recipientName.length < 3) {
      return {
        success: false,
        message: 'Courier Booking Failed: Recipient Name must not be empty and must be at least 3 characters.',
      };
    }

    const rawPhone = (parcelData?.recipient_phone || order.customer.phone || '').trim().replace(/[^0-9]/g, '');
    const bdPhoneRegex = /^(01[3-9]\d{8})$/;
    if (!bdPhoneRegex.test(rawPhone)) {
      return {
        success: false,
        message: 'Courier Booking Failed: Recipient Phone must be a valid 11-digit Bangladeshi mobile number (013-019XXXXXXXX).',
      };
    }

    if (parcelData?.alternative_phone) {
      const altPhone = parcelData.alternative_phone.trim().replace(/[^0-9]/g, '');
      if (altPhone && !bdPhoneRegex.test(altPhone)) {
        return {
          success: false,
          message: 'Courier Booking Failed: Alternative Phone must be a valid 11-digit Bangladeshi mobile number.',
        };
      }
    }

    const recipientAddress = (parcelData?.recipient_address || order.customer.fullAddress || order.customer.district || '').trim();
    if (!recipientAddress || recipientAddress.length < 5) {
      return {
        success: false,
        message: 'Courier Booking Failed: Delivery Address must contain at least 5 characters.',
      };
    }

    showNotification(
      'info',
      `Booking ${courierName}...`,
      `Connecting to ${courierName} API for order #${order.orderNumber}...`,
      4000
    );

    // Resolve courier details - server uses Worker secrets for credentials
    const effectiveBaseUrl = parcelData?.baseUrl || targetCourier?.baseUrl;
    const effectiveTrackingPattern = parcelData?.trackingUrlPattern || targetCourier?.trackingUrlPattern;

    const courierPayload = {
      id: targetCourier?.id,
      code: courierCode,
      name: courierName,
      baseUrl: effectiveBaseUrl,
      trackingUrlPattern: effectiveTrackingPattern,
    };

    // Call secure server-side proxy route: never exposes secret keys or accepts credentials from client
    const dispatchRes = await orderApi.dispatchCourier(
      order,
      parcelData,
      courierPayload
    );

    if (dispatchRes.success && (dispatchRes.trackingCode || dispatchRes.consignmentId)) {
      const trackingCode = dispatchRes.trackingCode || '';
      const consignmentId = dispatchRes.consignmentId || '';

      const trackingPattern = effectiveTrackingPattern || (isSteadfast ? 'https://steadfast.com.bd/t/{trackingCode}' : 'https://steadfast.com.bd/t/{trackingCode}');
      const trackingUrl = trackingPattern.includes('{trackingCode}')
        ? trackingPattern.replace('{trackingCode}', trackingCode)
        : `${trackingPattern}/${trackingCode}`;

      const booking: CourierBooking = {
        provider: courierName,
        waybillId: trackingCode,
        consignmentId: consignmentId,
        trackingUrl,
        bookedAt: new Date().toISOString(),
      };

      lastMutationTimestampRef.current = Date.now();
      const res = await orderApi.updateOrder(order.id, {
        shippingStatus: 'Shipped',
        courierBooking: booking,
        courierName: courierName,
        courierWaybill: trackingCode,
        consignmentId: consignmentId,
        courierStatus: 'In Transit',
      });

      if (res.success && res.order) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? res.order! : o)));
      } else {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  shippingStatus: 'Shipped' as ShippingStatus,
                  courierBooking: booking,
                  courierName: courierName,
                  courierWaybill: trackingCode,
                  consignmentId: consignmentId,
                  courierStatus: 'In Transit',
                }
              : o
          )
        );
      }

      // Fire webhook notification for dispatched parcel
      triggerCourierWebhooks('courier.dispatched', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        courierName,
        trackingCode,
        consignmentId,
        booking,
      }).catch(() => {});

      showNotification(
        'success',
        'Courier Booked! 🚚',
        `Consignment #${consignmentId} created with ${courierName} (Tracking: ${trackingCode}).`
      );

      return {
        success: true,
        trackingCode,
        consignmentId,
        message: `Booked successfully with ${courierName}! Consignment ID: ${consignmentId}`,
      };
    }

    // Never generate fake consignment or tracking IDs when courier dispatch fails
    const errorMsg = dispatchRes.error || `Failed to dispatch order with ${courierName}. Please verify credentials in Courier APIs tab.`;
    showNotification('error', 'Courier Dispatch Failed', errorMsg, 7000);
    return {
      success: false,
      message: errorMsg,
    };
  };

  const bookWithSteadfast = async (order: Order, parcelData?: any) => {
    return bookWithCourier(order, 'Steadfast', parcelData);
  };

  const cancelCourierBooking = async (orderId: string) => {
    lastMutationTimestampRef.current = Date.now();
    const res = await orderApi.updateOrder(orderId, {
      shippingStatus: 'Processing',
      courierBooking: undefined,
    });
    if (res.success && res.order) {
      setOrders((prev) => prev.map((ord) => (ord.id === orderId ? res.order! : ord)));
    } else {
      setOrders((prev) =>
        prev.map((ord) =>
          ord.id === orderId
            ? {
                ...ord,
                shippingStatus: 'Processing',
                courierBooking: undefined,
              }
            : ord
        )
      );
    }
  };

  // Sync courier parcel status for a single order (Uses authoritative server-side Steadfast normalization)
  const syncCourierStatus = async (
    orderId: string
  ): Promise<{ success: boolean; message: string; updatedStatus?: string }> => {
    const syncRes = await orderApi.syncSingleCourierOrder(orderId);
    if (syncRes.success && syncRes.order) {
      const canonical = syncRes.order;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? canonical : o)));
      return {
        success: true,
        updatedStatus: canonical.courierStatus || canonical.shippingStatus,
        message: syncRes.message || `Courier status synced: Parcel is now "${canonical.courierStatus}" (${canonical.shippingStatus}).`,
      };
    }

    return {
      success: false,
      message: syncRes.error || 'Failed to sync courier delivery status.',
    };
  };

  // Sync all active courier orders (Reuses the same server synchronization engine as Cloudflare Cron)
  const syncAllCourierStatuses = async (): Promise<{
    success: boolean;
    message: string;
    updatedCount: number;
  }> => {
    const res = await orderApi.syncAllCourierOrders();
    if (res.success) {
      try {
        const freshOrders = await orderApi.getOrders();
        if (freshOrders.success && Array.isArray(freshOrders.orders)) {
          setOrders(freshOrders.orders);
        }
      } catch {}

      return {
        success: true,
        message: res.message || `Successfully synchronized courier orders. Updated: ${res.updatedCount || 0}.`,
        updatedCount: res.updatedCount || 0,
      };
    }

    return {
      success: false,
      message: res.error || 'Courier synchronization failed.',
      updatedCount: 0,
    };
  };

  const updateOrder = async (orderId: string, updates: Partial<Order>) => {
    lastMutationTimestampRef.current = Date.now();
    const res = await orderApi.updateOrder(orderId, updates);
    if (res.success && res.order) {
      const canonical = res.order;
      setOrders((prev) => prev.map((ord) => (ord.id === orderId ? canonical : ord)));
    } else {
      setOrders((prev) =>
        prev.map((ord) => {
          if (ord.id !== orderId) return ord;
          return {
            ...ord,
            ...updates,
            customer: updates.customer ? { ...ord.customer, ...updates.customer } : ord.customer,
            items: updates.items !== undefined ? updates.items : ord.items,
            dbblDetails: updates.dbblDetails !== undefined ? updates.dbblDetails : ord.dbblDetails,
            courierBooking: updates.courierBooking !== undefined ? updates.courierBooking : ord.courierBooking,
          };
        })
      );
    }
  };

  const verifyAndMarkPaid = (orderId: string) => {
    updateOrder(orderId, { paymentStatus: 'PAID' });
  };

  const deleteOrder = async (orderId: string, restoreStock: boolean = true) => {
    lastMutationTimestampRef.current = Date.now();
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    const res = await orderApi.deleteOrder(orderId);
    if (!res.success) {
      showNotification('error', 'Delete Failed', res.error || 'Failed to delete order from Cloudflare D1', 5000);
      return;
    }

    setOrders((prev) => prev.filter((o) => o.id !== orderId));

    if (restoreStock && targetOrder.items) {
      const affectedIds = targetOrder.items.map((it) => it.product.id);
      refreshProductsByIds(affectedIds).catch((err) =>
        console.warn('Failed to sync products after order deletion:', err)
      );
    }

    showNotification('success', 'Order Deleted', `Order #${targetOrder.orderNumber} deleted from D1.`);
  };

  const updateCustomerDeliveryInfo = async (
    orderId: string,
    info: {
      fullName: string;
      phone: string;
      fullAddress: string;
      district: string;
      deliveryZone: 'inside_dhaka' | 'outside_dhaka';
    }
  ): Promise<{ success: boolean; message?: string; updatedOrder?: Order }> => {
    lastMutationTimestampRef.current = Date.now();
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) {
      return { success: false, message: 'Order not found.' };
    }
    if (targetOrder.shippingStatus !== 'Pending') {
      return {
        success: false,
        message: 'Order details can only be edited while in "Pending" status. This order is already in progress.',
      };
    }

    const newFee =
      info.deliveryZone === 'inside_dhaka'
        ? settings.insideDhakaFee || 80
        : settings.outsideDhakaFee || 150;
    const newTotal = targetOrder.subtotal + newFee;

    const res = await orderApi.updateOrder(orderId, {
      deliveryFee: newFee,
      totalAmount: newTotal,
      customer: {
        ...targetOrder.customer,
        fullName: info.fullName.trim(),
        phone: info.phone.trim(),
        fullAddress: info.fullAddress.trim(),
        district: info.district.trim(),
        deliveryZone: info.deliveryZone,
      },
    });

    if (!res.success) {
      return { success: false, message: res.error || 'Failed to update delivery info in Cloudflare D1.' };
    }

    const updatedResult: Order = res.order || {
      ...targetOrder,
      deliveryFee: newFee,
      totalAmount: newTotal,
      customer: {
        ...targetOrder.customer,
        fullName: info.fullName.trim(),
        phone: info.phone.trim(),
        fullAddress: info.fullAddress.trim(),
        district: info.district.trim(),
        deliveryZone: info.deliveryZone,
      },
    };

    setOrders((prev) => prev.map((ord) => (ord.id === orderId ? updatedResult : ord)));

    return {
      success: true,
      message: 'Delivery details updated successfully in D1!',
      updatedOrder: updatedResult,
    };
  };

  const cancelCustomerOrder = async (orderId: string): Promise<{ success: boolean; message?: string }> => {
    lastMutationTimestampRef.current = Date.now();
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) {
      return { success: false, message: 'Order not found.' };
    }
    if (targetOrder.shippingStatus !== 'Pending') {
      return {
        success: false,
        message: 'Only "Pending" orders can be canceled. This order has already been processed or shipped.',
      };
    }

    const res = await orderApi.updateOrder(orderId, { shippingStatus: 'Cancelled' });
    if (!res.success) {
      return { success: false, message: res.error || 'Failed to cancel order in Cloudflare D1.' };
    }

    const updatedOrder = res.order;
    setOrders((prev) =>
      prev.map((ord) => (ord.id === orderId ? (updatedOrder || { ...ord, shippingStatus: 'Cancelled' }) : ord))
    );

    // Sync product stock from D1 for affected products only (restored by D1 on server)
    if (targetOrder.items) {
      const affectedIds = targetOrder.items.map((it) => it.product.id);
      refreshProductsByIds(affectedIds).catch((err) =>
        console.warn('Failed to sync products after customer order cancel:', err)
      );
    }

    return {
      success: true,
      message: `Order #${targetOrder.orderNumber} has been canceled and stock restored in D1.`,
    };
  };

  const blockPhoneNumber = (rawPhone: string) => {
    const clean = rawPhone.replace(/[^0-9]/g, '');
    if (!clean) return;
    setSettings((prev) => {
      const currentList = prev.blockedPhoneNumbers || [];
      if (currentList.includes(clean)) return prev;
      return {
        ...prev,
        blockedPhoneNumbers: [...currentList, clean],
      };
    });
  };

  const unblockPhoneNumber = (rawPhone: string) => {
    const clean = rawPhone.replace(/[^0-9]/g, '');
    if (!clean) return;
    setSettings((prev) => ({
      ...prev,
      blockedPhoneNumbers: (prev.blockedPhoneNumbers || []).filter((p) => p !== clean),
    }));
  };

  // Super Admin Profit & Financial Analytics
  const fetchProfitAnalytics = useCallback(
    async (
      period: 'today' | 'month' | 'previous_month' | 'custom' = 'today',
      params?: { startDate?: string; endDate?: string }
    ): Promise<ProfitAnalyticsSummary | null> => {
      try {
        const summary = await profitAnalyticsApi.getSummary({
          period,
          startDate: params?.startDate,
          endDate: params?.endDate,
        });
        setProfitSummary(summary);
        return summary;
      } catch (err: any) {
        console.warn('Profit analytics fetch error:', err?.message || err);
        return null;
      }
    },
    []
  );

  const fetchExpenses = useCallback(
    async (filter?: { startDate?: string; endDate?: string; expenseType?: string }): Promise<void> => {
      try {
        const list = await expensesApi.getAll(filter);
        if (Array.isArray(list)) {
          setExpenses(list);
        }
      } catch (err: any) {
        console.warn('Expenses fetch error:', err?.message || err);
      }
    },
    []
  );

  const addExpense = async (expense: {
    expenseType: ExpenseType;
    amount: number;
    date: string;
    note?: string;
  }): Promise<boolean> => {
    try {
      const created = await expensesApi.create(expense);
      setExpenses((prev) => [created, ...prev.filter((e) => e.id !== created.id)]);
      showNotification('success', 'Expense Recorded', `৳${created.amount} recorded successfully.`);
      fetchProfitAnalytics('today').catch(() => {});
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Failed to record expense';
      showNotification('error', 'Expense Failed', msg);
      return false;
    }
  };

  const deleteExpense = async (id: string): Promise<boolean> => {
    try {
      await expensesApi.delete(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      showNotification('success', 'Expense Deleted', 'Expense record removed.');
      fetchProfitAnalytics('today').catch(() => {});
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Failed to delete expense';
      showNotification('error', 'Delete Failed', msg);
      return false;
    }
  };

  // Admin Settings (Authoritative Cloudflare D1 persistence)
  const updateSettings = async (
    newSettings: Partial<StoreSettings>
  ): Promise<{ success: boolean; settings?: StoreSettings; error?: string }> => {
    try {
      // Persist to Cloudflare D1 and await canonical server confirmation
      const canonical = await settingsApi.update(newSettings);

      // Update React state with canonical settings returned by D1
      setSettings(canonical);

      // Update optional localStorage cache ONLY after verified D1 persistence
      try {
        const json = JSON.stringify(sanitizeSettingsForBrowserStorage(canonical));
        localStorage.setItem(STORAGE_KEYS.SETTINGS, json);
        localStorage.setItem('rongdhonu_settings', json);
      } catch (e) {
        console.warn('Could not cache settings to localStorage:', e);
      }

      showNotification(
        'success',
        'Store Settings Saved! ✅',
        'Store preferences, dynamic header, footer, WhatsApp hotline, and payment info have been saved to Cloudflare D1.',
        5000
      );

      return { success: true, settings: canonical };
    } catch (err: any) {
      console.error('Failed to persist store settings to Cloudflare D1:', err);
      const errorMsg = err?.message || 'Failed to update settings in D1 database. Previous settings preserved.';
      showNotification('error', 'Settings Save Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  };

  const resetToDefaultSeed = () => {
    setProducts(INITIAL_PRODUCTS);
    setCategories(INITIAL_CATEGORIES);
    setOrders(INITIAL_ORDERS);
    setSettings(INITIAL_SETTINGS);
    setSlides(INITIAL_SLIDES);
    setCourierConfigs(INITIAL_COURIER_CONFIGS);
    setUsers(INITIAL_USERS);
    setCurrentUser(null);
    setIsAdminLoggedIn(false);
    setCart([]);
    setWishlist([]);
    setCoupons(INITIAL_COUPONS);
    setReviews(INITIAL_REVIEWS);
    try {
      localStorage.removeItem('rongdhonu_products');
      localStorage.removeItem('rongdhonu_products_v1');
      localStorage.removeItem('rongdhonu_slides');
      localStorage.removeItem('rongdhonu_slides_v1');
      localStorage.removeItem('rongdhonu_categories_v1');
      localStorage.removeItem(STORAGE_KEYS.ORDERS);
      localStorage.removeItem(STORAGE_KEYS.SETTINGS);
      localStorage.removeItem(STORAGE_KEYS.CART);
      localStorage.removeItem(STORAGE_KEYS.COURIERS);
      localStorage.removeItem(STORAGE_KEYS.USERS);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
      localStorage.removeItem(STORAGE_KEYS.WISHLIST);
      localStorage.removeItem(STORAGE_KEYS.COUPONS);
      localStorage.removeItem(STORAGE_KEYS.REVIEWS);
    } catch {}
  };

  return (
    <StoreContext.Provider
      value={{
        products,
        categories,
        orders,
        settings,
        cart,
        cartCount,
        cartSubtotal,
        isCartOpen,
        setIsCartOpen,
        wishlist,
        isWishlistOpen,
        setIsWishlistOpen,
        toggleWishlist,
        isInWishlist,
        clearWishlist,
        isUserAccountModalOpen,
        setIsUserAccountModalOpen,
        userAccountModalTab,
        setUserAccountModalTab,
        updateCurrentUserProfile,
        notification,
        showNotification,
        dismissNotification,
        coupons,
        applyCoupon,
        addCoupon,
        updateCoupon,
        deleteCoupon,
        toggleCouponActive,
        reviews,
        addProductReview,
        deleteProductReview,
        getProductReviews,
        users,
        setUsers,
        currentUser,
        setCurrentUser,
        isAuthModalOpen,
        setIsAuthModalOpen,
        authModalMode,
        setAuthModalMode,
        loginUser,
        registerUser,
        deleteUser,
        logout,
        currentView,
        setCurrentView,
        selectedProductId,
        setSelectedProductId,
        singleProduct,
        setSingleProduct,
        isProductLoading,
        productNotFound,
        loadProductById,
        adminActiveTab,
        setAdminActiveTab,
        adminSettingsSection,
        setAdminSettingsSection,
        openAdminSettingsSection,
        selectedCategory,
        setSelectedCategory,
        searchQuery,
        setSearchQuery,
        quickViewProduct,
        setQuickViewProduct,
        videoModalProduct,
        setVideoModalProduct,
        videoModalMode,
        setVideoModalMode,
        openProductVideo,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        quickBuy,
        createOrder,
        recentSuccessOrder,
        setRecentSuccessOrder,
        activePaymentModalOrder,
        setActivePaymentModalOrder,
        finalizePayment,
        isOrdersLoading,
        refreshOrders,
        orderPage,
        setOrderPage,
        orderPageSize,
        setOrderPageSize,
        orderTotalCount,
        orderTotalPages,
        orderSummary,
        orderQueryFilters,
        setOrderQueryFilters,
        isAdminLoggedIn,
        isAuthInitializing,
        adminLogin,
        adminLogout,
        addProduct,
        updateProduct,
        deleteProduct,
        increaseStock,
        adjustProductRating,
        addCategory,
        updateCategory,
        deleteCategory,
        updateOrderStatus,
        updateOrder,
        verifyAndMarkPaid,
        deleteOrder,
        deleteCustomer,
        resetCustomerPassword,
        updateUserRoleAndPermissions,
        hasPermission,
        can,
        updateCustomerDeliveryInfo,
        cancelCustomerOrder,
        bookCourier,
        bookWithCourier,
        bookWithSteadfast,
        syncCourierStatus,
        syncAllCourierStatuses,
        cancelCourierBooking,
        blockPhoneNumber,
        unblockPhoneNumber,
        slides,
        addSlide,
        updateSlide,
        deleteSlide,
        resetSlides,
        courierConfigs,
        addCourierConfig,
        updateCourierConfig,
        deleteCourierConfig,
        resetCourierConfigs,
        courierWebhooks,
        courierWebhookLogs,
        addCourierWebhook,
        updateCourierWebhook,
        deleteCourierWebhook,
        testCourierWebhook,
        triggerCourierWebhooks,
        clearCourierWebhookLogs,
        updateSettings,
        resetToDefaultSeed,
        changeSuperAdminPassword,
        getProductUrl,
        getCategoryUrl,
        copyProductLink,
        copyCategoryLink,
        pixelLogs,
        trackEvent,
        fireTestPixelEvent,
        clearPixelLogs,
        isMetaActive,
        isTikTokActive,
        isGtmActive,
        isStoreInitializing,
        isStoreError,
        retryStoreInit,
        profitSummary,
        fetchProfitAnalytics,
        expenses,
        fetchExpenses,
        addExpense,
        deleteExpense,
        homepageCategoryProducts,
        featuredProducts,
        toggleProductFeatured,
        categoryListingProducts,
        categoryPage,
        setCategoryPage,
        categoryTotalPages,
        categoryTotalProducts,
        isCategoryLoading,
        categorySortBy,
        setCategorySortBy,
        loadAdminAllProducts,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
