import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Product,
  Category,
  Order,
  CourierProvider,
  ShippingStatus,
  StoreSettings,
  CarouselSlide,
  CourierApiConfig,
  UserAccount,
  UserRole,
  AdminPermissions,
  ProfitAnalyticsSummary,
  Expense,
  ExpenseType,
  CourierWebhookConfig,
  CourierWebhookLog,
  CourierBooking,
  Coupon,
} from '../types';
import { AdminContext, AdminContextType } from './AdminContextDefinition';
import { useStorefront } from './StorefrontContext';
import { useAuth } from './AuthContext';
import { useCart } from './CartContext';
import { STORAGE_KEYS } from './storageKeys';
import {
  DEFAULT_STORE_SETTINGS,
  DEFAULT_COURIER_CONFIGS,
} from '../data/defaultSettings';
import {
  sanitizeCourierConfig,
  sanitizeCourierConfigs,
  sanitizeSettingsForBrowserStorage,
  sanitizeAllBrowserStorage,
} from '../utils/courierStorage';
import { orderApi, OrderQueryParams, OrderSummaryStats } from '../services/orderApi';
import {
  productsApi,
  categoriesApi,
  slidersApi,
  settingsApi,
  couponsApi,
  usersApi,
  profitAnalyticsApi,
  expensesApi,
  courierWebhooksApi,
  storeHomepageApi,
} from '../services/storeApi';

export const SUPER_ADMIN_PERMISSIONS: AdminPermissions = {
  canManageOrders: true,
  canManageProducts: true,
  canManageCategories: true,
  canManageAccounts: true,
  canManageSettings: true,
};

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    products,
    setProducts,
    categories,
    setCategories,
    slides,
    setSlides,
    settings,
    setSettings,
    coupons,
    setCoupons,
    setFeaturedProducts,
    setHomepageCategoryProducts,
    setCategoryListingProducts,
    setQuickViewProduct,
    setSingleProduct,
    setVideoModalProduct,
    showNotification,
    refreshProductsByIds,
    setSelectedCategory,
    setCurrentView,
  } = useStorefront();

  const {
    currentUser,
    setCurrentUser,
    hasPermission,
    isAdminLoggedIn,
    isAuthInitializing,
    logout,
    setIsAdminLoggedIn,
  } = useAuth();

  const { setCart } = useCart();

  // Admin Navigation Tabs & Section
  const [adminActiveTab, setAdminActiveTab] = useState<string>('overview');
  const [adminSettingsSection, setAdminSettingsSection] = useState<string>('all');

  const openAdminSettingsSection = useCallback((section: string = 'footer') => {
    setAdminActiveTab('settings');
    setAdminSettingsSection(section);
    setCurrentView('admin');
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
  }, [setCurrentView, showNotification]);

  // Admin Server-Side Paginated Orders State
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
  const lastMutationTimestampRef = useRef<number>(0);

  const refreshOrders = useCallback(async (overrideParams?: OrderQueryParams) => {
    if (!isAdminLoggedIn || isAuthInitializing) return;
    const canFetchOrders =
      hasPermission('order.view') ||
      hasPermission('order.manage') ||
      hasPermission('canManageOrders');
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
  }, [isAdminLoggedIn, isAuthInitializing, hasPermission]);

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

  // Load complete catalog when switching to admin view
  const loadAdminAllProducts = useCallback(async () => {
    try {
      const all = await productsApi.getAll();
      if (Array.isArray(all)) {
        setProducts(all);
      }
    } catch (err) {
      console.warn('Admin products fetch error:', err);
    }
  }, [setProducts]);

  useEffect(() => {
    if (isAdminLoggedIn) {
      loadAdminAllProducts();
    }
  }, [isAdminLoggedIn, loadAdminAllProducts]);

  // Courier Configs
  const [courierConfigs, setCourierConfigs] = useState<CourierApiConfig[]>(() => {
    try {
      let saved = localStorage.getItem(STORAGE_KEYS.COURIERS);
      if (!saved) {
        const legacy = localStorage.getItem('rongdhonu_couriers');
        if (legacy) {
          saved = legacy;
          localStorage.removeItem('rongdhonu_couriers');
        }
      }
      if (saved) {
        const parsed = JSON.parse(saved);
        const sanitized = sanitizeCourierConfigs(Array.isArray(parsed) ? parsed : DEFAULT_COURIER_CONFIGS);
        const sanitizedJson = JSON.stringify(sanitized);
        if (sanitizedJson !== saved) {
          localStorage.setItem(STORAGE_KEYS.COURIERS, sanitizedJson);
        }
        return sanitized;
      }
      const initialSanitized = sanitizeCourierConfigs(DEFAULT_COURIER_CONFIGS);
      localStorage.setItem(STORAGE_KEYS.COURIERS, JSON.stringify(initialSanitized));
      return initialSanitized;
    } catch {
      return sanitizeCourierConfigs(DEFAULT_COURIER_CONFIGS);
    }
  });

  const [courierWebhooks, setCourierWebhooks] = useState<CourierWebhookConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.COURIER_WEBHOOKS);
      return saved ? JSON.parse(saved) : (settings.courierWebhooks || []);
    } catch {
      return settings.courierWebhooks || [];
    }
  });

  const [courierWebhookLogs, setCourierWebhookLogs] = useState<CourierWebhookLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.COURIER_WEBHOOK_LOGS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Admin Users
  const [users, setUsers] = useState<UserAccount[]>(() => {
    try {
      let saved = localStorage.getItem(STORAGE_KEYS.USERS);
      if (!saved) {
        const legacy = localStorage.getItem('rongdhonu_users_v2');
        if (legacy) {
          saved = legacy;
          localStorage.setItem(STORAGE_KEYS.USERS, legacy);
          localStorage.removeItem('rongdhonu_users_v2');
        }
      }
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return [];
    } catch {
      return [];
    }
  });

  const fetchUsers = useCallback(async (): Promise<UserAccount[]> => {
    if (!isAdminLoggedIn || isAuthInitializing) return [];
    try {
      const fetched = await usersApi.getAll();
      if (Array.isArray(fetched)) {
        setUsers(fetched);
        try {
          localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(fetched));
        } catch {}
        return fetched;
      }
      return [];
    } catch (err: any) {
      console.warn('Failed to fetch users from D1:', err?.message || err);
      return [];
    }
  }, [isAdminLoggedIn, isAuthInitializing]);

  useEffect(() => {
    if (isAdminLoggedIn && !isAuthInitializing) {
      fetchUsers();
    }
  }, [isAdminLoggedIn, isAuthInitializing, fetchUsers]);

  // Financial & Profit Analytics
  const [profitSummary, setProfitSummary] = useState<ProfitAnalyticsSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const fetchProfitAnalytics = useCallback(async (
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
  }, []);

  const fetchExpenses = useCallback(async (filter?: { startDate?: string; endDate?: string; expenseType?: string }): Promise<void> => {
    try {
      const list = await expensesApi.getAll(filter);
      if (Array.isArray(list)) {
        setExpenses(list);
      }
    } catch (err: any) {
      console.warn('Expenses fetch error:', err?.message || err);
    }
  }, []);

  const addExpense = useCallback(async (expense: {
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
  }, [fetchProfitAnalytics, showNotification]);

  const deleteExpense = useCallback(async (id: string): Promise<boolean> => {
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
  }, [fetchProfitAnalytics, showNotification]);

  // Product CRUD
  const addProduct = useCallback(async (
    productData: Omit<Product, 'id' | 'createdAt'>
  ): Promise<{ success: boolean; product?: Product; error?: string }> => {
    try {
      const canonical = await productsApi.create(productData);
      const mergedCanonical: Product = {
        ...canonical,
        buyingPrice: canonical.buyingPrice ?? productData.buyingPrice,
        unitProfit: canonical.unitProfit ?? (
          (canonical.buyingPrice ?? productData.buyingPrice) != null
            ? Math.max(0, canonical.price - Number(canonical.buyingPrice ?? productData.buyingPrice))
            : undefined
        ),
      };
      setProducts((prev) => [mergedCanonical, ...prev.filter((p) => p.id !== mergedCanonical.id)]);
      showNotification('success', 'Product Created in D1', `"${mergedCanonical.title}" has been saved to the D1 database.`);
      return { success: true, product: mergedCanonical };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to create product in D1 database';
      console.error('D1 addProduct error:', err);
      showNotification('error', 'Product Creation Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  }, [setProducts, showNotification]);

  const updateProduct = useCallback(async (
    id: string,
    updates: Partial<Product>
  ): Promise<{ success: boolean; product?: Product; error?: string }> => {
    try {
      const canonical = await productsApi.update(id, updates);
      const mergedCanonical: Product = {
        ...canonical,
        buyingPrice: canonical.buyingPrice ?? updates.buyingPrice,
        unitProfit: canonical.unitProfit ?? (
          (canonical.buyingPrice ?? updates.buyingPrice) != null
            ? Math.max(0, canonical.price - Number(canonical.buyingPrice ?? updates.buyingPrice))
            : undefined
        ),
      };
      setProducts((prev) => prev.map((prod) => (prod.id === id ? mergedCanonical : prod)));
      setFeaturedProducts((prev) =>
        mergedCanonical.featured
          ? prev.some((p) => p.id === id)
            ? prev.map((p) => (p.id === id ? mergedCanonical : p))
            : [...prev, mergedCanonical]
          : prev.filter((p) => p.id !== id)
      );
      setSingleProduct((prev) => (prev && prev.id === id ? mergedCanonical : prev));
      setQuickViewProduct((prev) => (prev && prev.id === id ? mergedCanonical : prev));
      setVideoModalProduct((prev) => {
        if (!prev || prev.id !== id) return prev;
        return mergedCanonical.videoUrl && mergedCanonical.videoUrl.trim() ? mergedCanonical : null;
      });
      if (typeof setCart === 'function') {
        setCart((prev) =>
          prev.map((item) => (item.product.id === id ? { ...item, product: mergedCanonical } : item))
        );
      }
      showNotification('success', 'Product Updated in D1', `"${mergedCanonical.title}" has been updated in the D1 database.`);
      return { success: true, product: mergedCanonical };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to update product in D1 database';
      console.error('D1 updateProduct error:', err);
      try {
        const fresh = await productsApi.getById(id);
        if (fresh) setProducts((prev) => prev.map((p) => (p.id === id ? fresh : p)));
      } catch {}
      showNotification('error', 'Update Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  }, [setCart, setFeaturedProducts, setProducts, setQuickViewProduct, setSingleProduct, setVideoModalProduct, showNotification]);

  const toggleProductFeatured = useCallback(async (
    productId: string,
    isFeatured?: boolean,
    sortOrder?: number
  ): Promise<{ success: boolean; error?: string }> => {
    const target = products.find((p) => p.id === productId);
    const newFeatured = isFeatured !== undefined ? isFeatured : !target?.featured;
    try {
      const canonical = await productsApi.setFeatured(productId, newFeatured, sortOrder);
      setProducts((prev) => prev.map((prod) => (prod.id === productId ? canonical : prod)));
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
      setCategoryListingProducts((prev) => prev.map((p) => (p.id === productId ? canonical : p)));
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
      showNotification('error', 'Featured Update Failed', errorMsg, 5000);
      return { success: false, error: errorMsg };
    }
  }, [products, setCategoryListingProducts, setFeaturedProducts, setHomepageCategoryProducts, setProducts, setQuickViewProduct, setSingleProduct, showNotification]);

  const deleteProduct = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await productsApi.delete(id);
      setProducts((prev) => prev.filter((prod) => prod.id !== id));
      setFeaturedProducts((prev) => prev.filter((prod) => prod.id !== id));
      setSingleProduct((prev) => (prev && prev.id === id ? null : prev));
      setQuickViewProduct((prev) => (prev && prev.id === id ? null : prev));
      setVideoModalProduct((prev) => (prev && prev.id === id ? null : prev));
      setCategoryListingProducts((prev) => prev.filter((p) => p.id !== id));
      setHomepageCategoryProducts((prev) => {
        let changed = false;
        const next: Record<string, Product[]> = {};
        for (const [k, list] of Object.entries(prev) as [string, Product[]][]) {
          const filtered = list.filter((p) => p.id !== id);
          if (filtered.length !== list.length) changed = true;
          next[k] = filtered;
        }
        return changed ? next : prev;
      });
      if (typeof setCart === 'function') {
        setCart((prev) => prev.filter((item) => item.product.id !== id));
      }
      if (typeof showNotification === 'function') {
        showNotification('info', 'Product Deleted', 'Product removed from D1 catalog.');
      }
      return { success: true };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to delete product from D1 database';
      if (typeof refreshProductsByIds === 'function') {
        refreshProductsByIds([id]).catch(() => {});
      }
      if (typeof showNotification === 'function') {
        showNotification('error', 'Deletion Failed', errorMsg, 6000);
      }
      return { success: false, error: errorMsg };
    }
  }, [
    refreshProductsByIds,
    setCart,
    setCategoryListingProducts,
    setFeaturedProducts,
    setHomepageCategoryProducts,
    setProducts,
    setQuickViewProduct,
    setSingleProduct,
    setVideoModalProduct,
    showNotification,
  ]);

  const increaseStock = useCallback(async (productId: string, amount: number): Promise<void> => {
    const current = products.find((p) => p.id === productId);
    if (!current) return;
    const newStock = Math.max(0, current.stock + amount);
    try {
      const canonical = await productsApi.update(productId, { stock: newStock });
      setProducts((prev) => prev.map((prod) => (prod.id === productId ? canonical : prod)));
      showNotification('success', 'Stock Updated', `Stock for "${canonical.title}" updated in D1.`);
    } catch (err: any) {
      showNotification('error', 'Stock Update Failed', err?.message || 'Failed to update stock in D1');
    }
  }, [products, setProducts, showNotification]);

  const adjustProductRating = useCallback(async (productId: string, rating: number, reviewsCount?: number): Promise<void> => {
    const clampedRating = Math.max(1, Math.min(5, Number(rating.toFixed(1))));
    try {
      const canonical = await productsApi.update(productId, {
        rating: clampedRating,
        ...(reviewsCount !== undefined ? { reviewsCount } : {}),
      });
      setProducts((prev) => prev.map((prod) => (prod.id === productId ? canonical : prod)));
      showNotification('success', 'Rating Updated', 'Product rating score updated in D1 database.');
    } catch (err: any) {
      showNotification('error', 'Rating Update Failed', err?.message || 'Failed to update rating in D1');
    }
  }, [setProducts, showNotification]);

  // Category CRUD
  const addCategory = useCallback(async (
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
      showNotification('error', 'Category Creation Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  }, [setCategories, showNotification]);

  const updateCategory = useCallback(async (
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
      showNotification('error', 'Category Update Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  }, [setCategories, showNotification]);

  const deleteCategory = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await categoriesApi.delete(id);
      setCategories((prev) => prev.filter((cat) => cat.id !== id));
      showNotification('info', 'Category Deleted', 'Category removed from D1.');
      return { success: true };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to delete category from D1';
      showNotification('error', 'Category Deletion Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  }, [setCategories, showNotification]);

  // Slides
  const addSlide = useCallback(async (
    slideData: Omit<CarouselSlide, 'id'>
  ): Promise<{ success: boolean; slider?: CarouselSlide; error?: string }> => {
    try {
      const canonical = await slidersApi.create(slideData);
      setSlides((prev) => [...prev.filter((s) => s.id !== canonical.id), canonical]);
      showNotification('success', 'Slide Added in D1', 'New carousel banner slide added to D1.');
      return { success: true, slider: canonical };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to add slide to D1 database';
      showNotification('error', 'Slide Creation Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  }, [setSlides, showNotification]);

  const updateSlide = useCallback(async (
    id: string,
    updates: Partial<CarouselSlide>
  ): Promise<{ success: boolean; slider?: CarouselSlide; error?: string }> => {
    try {
      const canonical = await slidersApi.update(id, updates);
      setSlides((prev) => prev.map((s) => (s.id === id ? canonical : s)));
      showNotification('success', 'Slide Updated in D1', 'Slide has been updated in D1 database.');
      return { success: true, slider: canonical };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to update slide in D1 database';
      showNotification('error', 'Slide Update Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  }, [setSlides, showNotification]);

  const deleteSlide = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await slidersApi.delete(id);
      setSlides((prev) => prev.filter((s) => s.id !== id));
      showNotification('info', 'Slide Removed', 'Slide has been deleted from D1.');
      return { success: true };
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to delete slide from D1';
      showNotification('error', 'Slide Deletion Failed', errorMsg, 6000);
      return { success: false, error: errorMsg };
    }
  }, [setSlides, showNotification]);

  const resetSlides = useCallback(async () => {
    try {
      const fresh = await slidersApi.getAll();
      if (Array.isArray(fresh)) {
        setSlides(fresh);
      }
      showNotification('info', 'Slides Refreshed', 'Slides re-synced with D1 database.');
    } catch (err: any) {
      console.error('D1 resetSlides error:', err);
    }
  }, [setSlides, showNotification]);

  // Courier APIs Config
  const triggerCourierWebhooks = useCallback(async (event: string, courier: any): Promise<{ success: boolean; dispatchedCount: number; results: any[] }> => {
    try {
      const sanitizedCourier = sanitizeCourierConfig(courier);
      const serverRes = await courierWebhooksApi.trigger(event, sanitizedCourier, {
        webhooks: courierWebhooks,
      });
      return serverRes;
    } catch (err) {
      console.warn('triggerCourierWebhooks error:', err);
      return { success: false, dispatchedCount: 0, results: [] };
    }
  }, [courierWebhooks]);

  const addCourierConfig = useCallback((configData: Omit<CourierApiConfig, 'id'>): CourierApiConfig => {
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

    if (configData.triggerWebhookOnAdd !== false) {
      setTimeout(() => {
        triggerCourierWebhooks('courier.added', newConfig).catch(() => {});
      }, 50);
    }

    return newConfig;
  }, [triggerCourierWebhooks]);

  const updateCourierConfig = useCallback((id: string, updates: Partial<CourierApiConfig>) => {
    let sanitizedUpdates = sanitizeCourierConfig(updates);
    if (sanitizedUpdates.baseUrl && sanitizedUpdates.baseUrl.includes('portal.steadfast.com.bd')) {
      sanitizedUpdates.baseUrl = sanitizedUpdates.baseUrl.replace('portal.steadfast.com.bd', 'portal.packzy.com');
    }

    setCourierConfigs((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...sanitizedUpdates } : c))
    );

    const target = courierConfigs.find((c) => c.id === id);
    setTimeout(() => {
      triggerCourierWebhooks('courier.updated', { id, ...target, ...sanitizedUpdates }).catch(() => {});
    }, 50);
  }, [courierConfigs, triggerCourierWebhooks]);

  const deleteCourierConfig = useCallback((id: string) => {
    const target = courierConfigs.find((c) => c.id === id);
    setCourierConfigs((prev) => prev.filter((c) => c.id !== id));
    if (target) {
      setTimeout(() => {
        triggerCourierWebhooks('courier.deleted', { id, name: target.name }).catch(() => {});
      }, 50);
    }
  }, [courierConfigs, triggerCourierWebhooks]);

  const resetCourierConfigs = useCallback(() => {
    setCourierConfigs(DEFAULT_COURIER_CONFIGS);
  }, []);

  // Settings & Seed
  const updateSettings = useCallback(async (newSettings: Partial<StoreSettings>): Promise<{ success: boolean; settings?: StoreSettings; error?: string }> => {
    try {
      const canonical = await settingsApi.update(newSettings);
      setSettings(canonical);
      try {
        const json = JSON.stringify(sanitizeSettingsForBrowserStorage(canonical));
        if (localStorage.getItem(STORAGE_KEYS.SETTINGS) !== json) {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, json);
        }
        if (localStorage.getItem('rongdhonu_settings')) {
          localStorage.removeItem('rongdhonu_settings');
        }
      } catch {}

      showNotification('success', 'Store Settings Saved! ✅', 'Store preferences saved to Cloudflare D1.', 5000);
      return { success: true, settings: canonical };
    } catch (err: any) {
      showNotification('error', 'Settings Save Failed', err?.message || 'Failed to update settings in D1', 6000);
      return { success: false, error: err?.message };
    }
  }, [setSettings, showNotification]);

  // Courier Webhooks
  const addCourierWebhook = useCallback(async (webhookData: Omit<CourierWebhookConfig, 'id' | 'createdAt'>): Promise<CourierWebhookConfig> => {
    const newWebhook: CourierWebhookConfig = {
      ...webhookData,
      id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [...courierWebhooks, newWebhook];
    setCourierWebhooks(updated);

    try {
      await updateSettings({ courierWebhooks: updated });
      await courierWebhooksApi.saveAll(updated).catch(() => {});
      showNotification('success', 'Webhook Added', `Configured "${newWebhook.name}" for courier events.`);
    } catch (err) {
      console.warn('Error syncing webhook to D1:', err);
    }
    return newWebhook;
  }, [courierWebhooks, updateSettings, showNotification]);

  const updateCourierWebhook = useCallback(async (id: string, updates: Partial<CourierWebhookConfig>): Promise<void> => {
    const updated = courierWebhooks.map((w) => (w.id === id ? { ...w, ...updates } : w));
    setCourierWebhooks(updated);
    try {
      await updateSettings({ courierWebhooks: updated });
      await courierWebhooksApi.saveAll(updated).catch(() => {});
      showNotification('success', 'Webhook Updated', 'Webhook configuration saved.');
    } catch (err) {
      console.warn('Error updating webhook in D1:', err);
    }
  }, [courierWebhooks, updateSettings, showNotification]);

  const deleteCourierWebhook = useCallback(async (id: string): Promise<void> => {
    const target = courierWebhooks.find((w) => w.id === id);
    const updated = courierWebhooks.filter((w) => w.id !== id);
    setCourierWebhooks(updated);
    try {
      await updateSettings({ courierWebhooks: updated });
      await courierWebhooksApi.saveAll(updated).catch(() => {});
      showNotification('info', 'Webhook Deleted', `Removed "${target?.name || 'Webhook'}".`);
    } catch (err) {
      console.warn('Error removing webhook in D1:', err);
    }
  }, [courierWebhooks, updateSettings, showNotification]);

  const testCourierWebhook = useCallback(async (params: { url: string; secret?: string; webhookId?: string; event?: string; courier?: any }) => {
    return courierWebhooksApi.test(params);
  }, []);

  const clearCourierWebhookLogs = useCallback(() => {
    setCourierWebhookLogs([]);
    try {
      localStorage.removeItem(STORAGE_KEYS.COURIER_WEBHOOK_LOGS);
    } catch {}
  }, []);

  // Orders Management & Courier Dispatch
  const updateOrderStatus = useCallback(async (orderId: string, status: ShippingStatus): Promise<{ success: boolean; error?: string }> => {
    lastMutationTimestampRef.current = Date.now();
    const target = orders.find((o) => o.id === orderId);

    const res = await orderApi.updateOrder(orderId, { shippingStatus: status });
    if (!res.success) {
      showNotification('error', 'Status Update Failed', res.error || 'Failed to update order status');
      return { success: false, error: res.error };
    }

    const updatedOrder = res.order;
    setOrders((prev) =>
      prev.map((ord) => (ord.id === orderId ? (updatedOrder || { ...ord, shippingStatus: status }) : ord))
    );

    if (status === 'Cancelled' || target?.shippingStatus === 'Cancelled') {
      const affectedIds = target?.items ? target.items.map((it) => it.product.id) : [];
      refreshProductsByIds(affectedIds).catch(console.warn);
    }

    showNotification('success', 'Order Updated Successfully! ✅', `Order #${target?.orderNumber || orderId} status changed to "${status}".`, 3500);
    return { success: true };
  }, [orders, refreshProductsByIds, showNotification]);

  const bookWithCourier = useCallback(async (
    order: Order,
    courierProviderOrId: string,
    parcelData?: any
  ): Promise<{ success: boolean; message: string; trackingCode?: string; consignmentId?: string }> => {
    if (!hasPermission('canManageOrders')) {
      return { success: false, message: 'Access Denied: You do not have permission to manage orders.' };
    }

    const targetCourier = courierConfigs.find(
      (c) =>
        c.id === courierProviderOrId ||
        c.code?.toLowerCase() === courierProviderOrId?.toLowerCase() ||
        c.name?.toLowerCase() === courierProviderOrId?.toLowerCase()
    );
    const isSteadfast = (courierProviderOrId || '').toLowerCase().includes('steadfast') || targetCourier?.code?.toLowerCase().includes('steadfast');
    const courierName = targetCourier?.name || (isSteadfast ? 'Steadfast Courier' : courierProviderOrId || 'Courier');
    const courierCode = targetCourier?.code || (isSteadfast ? 'Steadfast' : courierProviderOrId);

    const recipientName = (parcelData?.recipient_name || order.customer.fullName || '').trim();
    if (!recipientName || recipientName.length < 3) {
      return { success: false, message: 'Recipient Name must contain at least 3 characters.' };
    }

    const rawPhone = (parcelData?.recipient_phone || order.customer.phone || '').trim().replace(/[^0-9]/g, '');
    if (!/^(01[3-9]\d{8})$/.test(rawPhone)) {
      return { success: false, message: 'Recipient Phone must be a valid 11-digit Bangladeshi mobile number.' };
    }

    const recipientAddress = (parcelData?.recipient_address || order.customer.fullAddress || order.customer.district || '').trim();
    if (!recipientAddress || recipientAddress.length < 5) {
      return { success: false, message: 'Delivery Address must contain at least 5 characters.' };
    }

    showNotification('info', `Booking ${courierName}...`, `Connecting to ${courierName} API for order #${order.orderNumber}...`, 4000);

    const effectiveBaseUrl = parcelData?.baseUrl || targetCourier?.baseUrl;
    const effectiveTrackingPattern = parcelData?.trackingUrlPattern || targetCourier?.trackingUrlPattern;

    const courierPayload = {
      id: targetCourier?.id,
      code: courierCode,
      name: courierName,
      baseUrl: effectiveBaseUrl,
      trackingUrlPattern: effectiveTrackingPattern,
    };

    const dispatchRes = await orderApi.dispatchCourier(order, parcelData, courierPayload);
    if (dispatchRes.success && (dispatchRes.trackingCode || dispatchRes.consignmentId)) {
      const trackingCode = dispatchRes.trackingCode || '';
      const consignmentId = dispatchRes.consignmentId || '';
      const pattern = effectiveTrackingPattern || 'https://steadfast.com.bd/t/{trackingCode}';
      const trackingUrl = pattern.includes('{trackingCode}') ? pattern.replace('{trackingCode}', trackingCode) : `${pattern}/${trackingCode}`;

      const booking: CourierBooking = {
        provider: courierName,
        waybillId: trackingCode,
        consignmentId,
        trackingUrl,
        bookedAt: new Date().toISOString(),
      };

      lastMutationTimestampRef.current = Date.now();
      const res = await orderApi.updateOrder(order.id, {
        shippingStatus: 'Shipped',
        courierBooking: booking,
        courierName,
        courierWaybill: trackingCode,
        consignmentId,
        courierStatus: 'In Transit',
      });

      if (res.success && res.order) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? res.order! : o)));
      }

      triggerCourierWebhooks('courier.dispatched', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        courierName,
        trackingCode,
        consignmentId,
        booking,
      }).catch(() => {});

      showNotification('success', 'Courier Booked! 🚚', `Consignment #${consignmentId} created with ${courierName}.`);
      return { success: true, trackingCode, consignmentId, message: `Booked successfully with ${courierName}!` };
    }

    const errorMsg = dispatchRes.error || `Failed to dispatch order with ${courierName}.`;
    showNotification('error', 'Courier Dispatch Failed', errorMsg, 7000);
    return { success: false, message: errorMsg };
  }, [courierConfigs, hasPermission, showNotification, triggerCourierWebhooks]);

  const bookWithSteadfast = useCallback(async (order: Order, parcelData?: any) => {
    return bookWithCourier(order, 'Steadfast', parcelData);
  }, [bookWithCourier]);

  const bookCourier = useCallback(async (orderId: string, provider: CourierProvider, parcelData?: any): Promise<CourierBooking> => {
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
  }, [bookWithCourier, courierConfigs, orders]);

  const cancelCourierBooking = useCallback(async (orderId: string) => {
    lastMutationTimestampRef.current = Date.now();
    const res = await orderApi.updateOrder(orderId, {
      shippingStatus: 'Processing',
      courierBooking: undefined,
    });
    if (res.success && res.order) {
      setOrders((prev) => prev.map((ord) => (ord.id === orderId ? res.order! : ord)));
    }
  }, []);

  const syncCourierStatus = useCallback(async (orderId: string) => {
    const syncRes = await orderApi.syncSingleCourierOrder(orderId);
    if (syncRes.success && syncRes.order) {
      const canonical = syncRes.order;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? canonical : o)));
      return {
        success: true,
        updatedStatus: canonical.courierStatus || canonical.shippingStatus,
        message: syncRes.message || `Courier status synced: "${canonical.courierStatus}".`,
      };
    }
    return { success: false, message: syncRes.error || 'Failed to sync courier delivery status.' };
  }, []);

  const syncAllCourierStatuses = useCallback(async () => {
    const res = await orderApi.syncAllCourierOrders();
    if (res.success) {
      try {
        const freshOrders = await orderApi.getOrders();
        if (freshOrders.success && Array.isArray(freshOrders.orders)) {
          setOrders(freshOrders.orders);
        }
      } catch {}
      return { success: true, message: res.message || 'Successfully synchronized courier orders.', updatedCount: res.updatedCount || 0 };
    }
    return { success: false, message: res.error || 'Courier synchronization failed.', updatedCount: 0 };
  }, []);

  const updateOrder = useCallback(async (orderId: string, updates: Partial<Order>) => {
    lastMutationTimestampRef.current = Date.now();
    const res = await orderApi.updateOrder(orderId, updates);
    if (res.success && res.order) {
      setOrders((prev) => prev.map((ord) => (ord.id === orderId ? res.order! : ord)));
    }
  }, []);

  const verifyAndMarkPaid = useCallback((orderId: string) => {
    updateOrder(orderId, { paymentStatus: 'Paid' });
  }, [updateOrder]);

  const deleteOrder = useCallback(async (orderId: string, restoreStock: boolean = true) => {
    lastMutationTimestampRef.current = Date.now();
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    const res = await orderApi.deleteOrder(orderId);
    if (!res.success) {
      showNotification('error', 'Delete Failed', res.error || 'Failed to delete order from D1');
      return;
    }

    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    if (restoreStock && targetOrder.shippingStatus !== 'Cancelled' && targetOrder.items) {
      const affectedIds = targetOrder.items.map((it) => it.product.id);
      refreshProductsByIds(affectedIds).catch(console.warn);
    }

    showNotification('info', 'Order Deleted', `Order #${targetOrder.orderNumber} deleted.`);
  }, [orders, refreshProductsByIds, showNotification]);

  const blockPhoneNumber = useCallback((phone: string) => {
    const cleanPhone = phone.trim().replace(/[^0-9]/g, '');
    if (!cleanPhone) return;
    setSettings((prev) => {
      const existing = prev.blockedPhoneNumbers || [];
      if (existing.includes(cleanPhone)) return prev;
      const updated = [...existing, cleanPhone];
      settingsApi.update({ blockedPhoneNumbers: updated }).catch(console.error);
      return { ...prev, blockedPhoneNumbers: updated };
    });
    showNotification('warning', 'Phone Number Blocked', `Number ${cleanPhone} has been blocked from placing orders.`);
  }, [setSettings, showNotification]);

  const unblockPhoneNumber = useCallback((phone: string) => {
    const cleanPhone = phone.trim().replace(/[^0-9]/g, '');
    setSettings((prev) => {
      const updated = (prev.blockedPhoneNumbers || []).filter((p) => p !== cleanPhone);
      settingsApi.update({ blockedPhoneNumbers: updated }).catch(console.error);
      return { ...prev, blockedPhoneNumbers: updated };
    });
    showNotification('info', 'Phone Number Unblocked', `Number ${cleanPhone} is now allowed to place orders.`);
  }, [setSettings, showNotification]);

  // Settings & Seed
  const resetToDefaultSeed = useCallback(async () => {
    try {
      const {
        INITIAL_PRODUCTS,
        INITIAL_CATEGORIES,
        INITIAL_ORDERS,
        INITIAL_SETTINGS,
        INITIAL_SLIDES,
        INITIAL_COURIER_CONFIGS,
        INITIAL_USERS,
        INITIAL_COUPONS,
      } = await import('../data/seedData');
      setProducts(INITIAL_PRODUCTS);
      setCategories(INITIAL_CATEGORIES);
      setOrders(INITIAL_ORDERS);
      setSettings(INITIAL_SETTINGS);
      setSlides(INITIAL_SLIDES);
      setCourierConfigs(INITIAL_COURIER_CONFIGS);
      setUsers(INITIAL_USERS);
      setCurrentUser(null);
      setIsAdminLoggedIn(false);
      if (typeof setCart === 'function') {
        setCart([]);
      }
      setCoupons(INITIAL_COUPONS);
      storeHomepageApi.clearCache();
      try {
        localStorage.removeItem('rongdhonu_products');
        localStorage.removeItem('rongdhonu_slides');
        localStorage.removeItem(STORAGE_KEYS.ORDERS);
        localStorage.removeItem(STORAGE_KEYS.SETTINGS);
        localStorage.removeItem(STORAGE_KEYS.CART);
        localStorage.removeItem(STORAGE_KEYS.COURIERS);
        localStorage.removeItem(STORAGE_KEYS.USERS);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
        localStorage.removeItem(STORAGE_KEYS.COUPONS);
      } catch {}
      showNotification('success', 'Reset Complete', 'Store has been reset to default demo seed data.');
    } catch (e) {
      console.error('Failed to load seed data for reset:', e);
    }
  }, [setCart, setCategories, setCoupons, setCurrentUser, setIsAdminLoggedIn, setProducts, setSettings, setSlides, showNotification]);

  // Admin User Management
  const updateUserRoleAndPermissions = useCallback((
    userIdOrEmail: string,
    newRole: UserRole,
    newPermissions: AdminPermissions
  ): { success: boolean; message?: string } => {
    if (!hasPermission('canManageAccounts')) {
      return { success: false, message: 'Access Denied: You do not have permission to modify roles or permissions.' };
    }

    const normalized = userIdOrEmail.toLowerCase().trim();
    const target = users.find((u) => u.id === userIdOrEmail || u.email.toLowerCase().trim() === normalized);
    if (!target) {
      return { success: false, message: 'User account not found.' };
    }
    if (target.role === 'super_admin') {
      return { success: false, message: 'Super Administrator accounts are permanently protected.' };
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
    const newPerms = newRole === 'sub_admin' ? newPermissions : (newRole === 'super_admin' || newRole === 'admin' ? SUPER_ADMIN_PERMISSIONS : undefined);
    usersApi.update(target.id, { role: newRole, permissions: newPerms }).catch(console.error);

    if (currentUser && (currentUser.id === target.id || currentUser.email.toLowerCase().trim() === normalized)) {
      const self = updatedUsers.find((u) => u.id === target.id);
      if (self) {
        setCurrentUser(self);
      }
    }

    return { success: true, message: `Permissions updated successfully for ${target.name}.` };
  }, [currentUser, hasPermission, setCurrentUser, users]);

  const deleteUser = useCallback(async (userIdOrEmail: string): Promise<{ success: boolean; message?: string }> => {
    if (!hasPermission('canManageAccounts') && currentUser?.role !== 'super_admin') {
      return { success: false, message: 'Access Denied: You do not have permission to delete accounts.' };
    }

    const normalized = userIdOrEmail.toLowerCase().trim();
    const target = users.find((u) => u.id === userIdOrEmail || u.email.toLowerCase().trim() === normalized);
    if (!target) {
      return { success: false, message: 'Account not found.' };
    }
    if (target.role === 'super_admin') {
      return { success: false, message: 'Super Administrator accounts cannot be deleted.' };
    }
    if (currentUser?.id === target.id || currentUser?.email?.toLowerCase().trim() === normalized) {
      return { success: false, message: 'You cannot delete your own logged-in account.' };
    }

    try {
      await usersApi.delete(target.id);

      // Immediately update local state
      setUsers((prev) => {
        const updated = prev.filter((u) => u.id !== target.id && u.email.toLowerCase().trim() !== target.email.toLowerCase().trim());
        try {
          localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updated));
        } catch {}
        return updated;
      });

      // Background re-fetch to ensure complete sync with D1
      fetchUsers().catch(() => {});

      showNotification('success', 'Account Deleted', `Account "${target.name}" has been permanently deleted.`);
      return { success: true, message: `Account "${target.name}" deleted successfully.` };
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to delete account from database.';
      showNotification('error', 'Deletion Failed', errMsg);
      return { success: false, message: errMsg };
    }
  }, [currentUser, fetchUsers, hasPermission, showNotification, users]);

  const deleteCustomer = useCallback(async (targetUser: UserAccount | string): Promise<{ success: boolean; message?: string }> => {
    const emailOrId = typeof targetUser === 'string' ? targetUser : targetUser.id || targetUser.email;
    return deleteUser(emailOrId);
  }, [deleteUser]);

  const resetCustomerPassword = useCallback(async (emailOrId: string, newPassword: string) => {
    const trimmedPw = newPassword.trim();
    if (!trimmedPw || trimmedPw.length < 6) {
      return { success: false, message: 'New password must be at least 6 characters long.' };
    }
    const normalized = emailOrId.toLowerCase().trim();
    const target = users.find((u) => u.id === emailOrId || u.email.toLowerCase().trim() === normalized);
    if (!target) {
      return { success: false, message: 'User account not found.' };
    }
    try {
      const res = await usersApi.resetPassword(target.id, trimmedPw);
      return { success: true, message: res.message || `Password for ${target.email} has been reset successfully.` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to reset password on the server.' };
    }
  }, [users]);

  // Admin Vouchers CRUD
  const addCoupon = useCallback((newCoupon: Coupon): { success: boolean; message: string } => {
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
    couponsApi.create(sanitizedCoupon).catch(console.error);
    showNotification('success', 'Voucher Created', `Voucher "${cleanCode}" has been added.`);
    return { success: true, message: 'Voucher created successfully.' };
  }, [coupons, setCoupons, showNotification]);

  const updateCoupon = useCallback((code: string, updated: Partial<Coupon>): { success: boolean; message: string } => {
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
    couponsApi.update(targetCode, updated).catch(console.error);
    showNotification('success', 'Voucher Updated', `Voucher "${targetCode}" settings saved.`);
    return { success: true, message: 'Voucher updated successfully.' };
  }, [coupons, setCoupons, showNotification]);

  const deleteCoupon = useCallback((code: string) => {
    const targetCode = code.trim().toUpperCase();
    setCoupons((prev) => prev.filter((c) => c.code.toUpperCase() !== targetCode));
    couponsApi.delete(targetCode).catch(console.error);
    showNotification('info', 'Voucher Deleted', `Voucher "${targetCode}" has been removed.`);
  }, [setCoupons, showNotification]);

  const toggleCouponActive = useCallback((code: string) => {
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
    couponsApi.update(targetCode, { isActive: newStatus }).catch(console.error);
    showNotification('info', 'Voucher Status Updated', `Voucher "${targetCode}" is now ${newStatus ? 'Active' : 'Disabled'}.`);
  }, [setCoupons, showNotification]);

  const value = useMemo<AdminContextType>(() => ({
    adminActiveTab,
    setAdminActiveTab,
    adminSettingsSection,
    setAdminSettingsSection,
    openAdminSettingsSection,
    addProduct,
    updateProduct,
    deleteProduct,
    increaseStock,
    adjustProductRating,
    toggleProductFeatured,
    loadAdminAllProducts,
    addCategory,
    updateCategory,
    deleteCategory,
    orders,
    setOrders,
    updateOrderStatus,
    updateOrder,
    verifyAndMarkPaid,
    deleteOrder,
    bookCourier,
    bookWithCourier,
    bookWithSteadfast,
    syncCourierStatus,
    syncAllCourierStatuses,
    cancelCourierBooking,
    blockPhoneNumber,
    unblockPhoneNumber,
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
    addSlide,
    updateSlide,
    deleteSlide,
    resetSlides,
    updateSettings,
    resetToDefaultSeed,
    users,
    setUsers,
    fetchUsers,
    deleteUser,
    deleteCustomer,
    resetCustomerPassword,
    updateUserRoleAndPermissions,
    addCoupon,
    updateCoupon,
    deleteCoupon,
    toggleCouponActive,
    profitSummary,
    fetchProfitAnalytics,
    expenses,
    fetchExpenses,
    addExpense,
    deleteExpense,
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
  }), [
    adminActiveTab,
    adminSettingsSection,
    openAdminSettingsSection,
    addProduct,
    updateProduct,
    deleteProduct,
    increaseStock,
    adjustProductRating,
    toggleProductFeatured,
    loadAdminAllProducts,
    addCategory,
    updateCategory,
    deleteCategory,
    orders,
    updateOrderStatus,
    updateOrder,
    verifyAndMarkPaid,
    deleteOrder,
    bookCourier,
    bookWithCourier,
    bookWithSteadfast,
    syncCourierStatus,
    syncAllCourierStatuses,
    cancelCourierBooking,
    blockPhoneNumber,
    unblockPhoneNumber,
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
    addSlide,
    updateSlide,
    deleteSlide,
    resetSlides,
    updateSettings,
    resetToDefaultSeed,
    users,
    fetchUsers,
    deleteUser,
    deleteCustomer,
    resetCustomerPassword,
    updateUserRoleAndPermissions,
    addCoupon,
    updateCoupon,
    deleteCoupon,
    toggleCouponActive,
    profitSummary,
    fetchProfitAnalytics,
    expenses,
    fetchExpenses,
    addExpense,
    deleteExpense,
    isOrdersLoading,
    refreshOrders,
    orderPage,
    orderPageSize,
    orderTotalCount,
    orderTotalPages,
    orderSummary,
    orderQueryFilters,
  ]);

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};
