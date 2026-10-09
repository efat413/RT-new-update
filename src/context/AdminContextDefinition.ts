import React, { createContext, useContext } from 'react';
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
import { OrderQueryParams, OrderSummaryStats } from '../services/orderApi';

export interface AdminContextType {
  adminActiveTab: string;
  setAdminActiveTab: (tab: string) => void;
  adminSettingsSection: string;
  setAdminSettingsSection: (section: string) => void;
  openAdminSettingsSection: (section?: string) => void;

  // Products
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => Promise<{ success: boolean; product?: Product; error?: string }>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<{ success: boolean; product?: Product; error?: string }>;
  deleteProduct: (id: string) => Promise<{ success: boolean; error?: string }>;
  increaseStock: (productId: string, amount: number) => Promise<void>;
  toggleProductFeatured: (productId: string, isFeatured?: boolean, sortOrder?: number) => Promise<{ success: boolean; error?: string }>;
  loadAdminAllProducts: () => Promise<void>;

  // Categories
  addCategory: (category: Omit<Category, 'id' | 'slug'>) => Promise<{ success: boolean; category?: Category; error?: string }>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<{ success: boolean; category?: Category; error?: string }>;
  deleteCategory: (id: string) => Promise<{ success: boolean; error?: string }>;

  // Orders & Courier
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  updateOrderStatus: (orderId: string, status: ShippingStatus) => Promise<{ success: boolean; error?: string }>;
  updateOrder: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; order?: Order; error?: string } | void> | void;
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
  syncCourierStatus: (orderId: string) => Promise<{ success: boolean; message: string; updatedStatus?: string }>;
  syncAllCourierStatuses: () => Promise<{ success: boolean; message: string; updatedCount: number }>;
  cancelCourierBooking: (orderId: string) => void;
  blockPhoneNumber: (phone: string) => void;
  unblockPhoneNumber: (phone: string) => void;

  // Courier Configs
  courierConfigs: CourierApiConfig[];
  addCourierConfig: (config: Omit<CourierApiConfig, 'id'>) => CourierApiConfig;
  updateCourierConfig: (id: string, updates: Partial<CourierApiConfig>) => void;
  deleteCourierConfig: (id: string) => void;
  resetCourierConfigs: () => void;

  // Courier Webhooks
  courierWebhooks: CourierWebhookConfig[];
  courierWebhookLogs: CourierWebhookLog[];
  addCourierWebhook: (webhook: Omit<CourierWebhookConfig, 'id' | 'createdAt'>) => Promise<CourierWebhookConfig>;
  updateCourierWebhook: (id: string, updates: Partial<CourierWebhookConfig>) => Promise<void>;
  deleteCourierWebhook: (id: string) => Promise<void>;
  testCourierWebhook: (params: { url: string; secret?: string; webhookId?: string; event?: string; courier?: any }) => Promise<{ success: boolean; status?: number; latencyMs?: number; responsePreview?: string; error?: string }>;
  triggerCourierWebhooks: (event: string, courier: any) => Promise<{ success: boolean; dispatchedCount: number; results: any[] }>;
  clearCourierWebhookLogs: () => void;

  // Slides
  addSlide: (slide: Omit<CarouselSlide, 'id'>) => Promise<{ success: boolean; slider?: CarouselSlide; error?: string }>;
  updateSlide: (id: string, updates: Partial<CarouselSlide>) => Promise<{ success: boolean; slider?: CarouselSlide; error?: string }>;
  deleteSlide: (id: string) => Promise<{ success: boolean; error?: string }>;
  resetSlides: () => Promise<void> | void;
  reorderSlides: (orderedItems: Array<{ id: string; sort_order?: number; sortOrder?: number } | string>) => Promise<{ success: boolean; sliders?: CarouselSlide[]; error?: string }>;

  // Settings & Seed
  updateSettings: (newSettings: Partial<StoreSettings>) => Promise<{ success: boolean; settings?: StoreSettings; error?: string }>;
  resetToDefaultSeed: () => void;

  // Users
  users: UserAccount[];
  setUsers: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  fetchUsers: () => Promise<UserAccount[]>;
  deleteUser: (userId: string) => Promise<{ success: boolean; message?: string }>;
  deleteCustomer: (targetUser: UserAccount | string) => Promise<{ success: boolean; message?: string }>;
  resetCustomerPassword: (emailOrId: string, newPassword: string) => Promise<{ success: boolean; message?: string }> | { success: boolean; message?: string };
  updateUserRoleAndPermissions: (userIdOrEmail: string, role: UserRole, permissions: AdminPermissions) => { success: boolean; message?: string };

  // Vouchers (CRUD)
  addCoupon: (newCoupon: Coupon) => { success: boolean; message: string };
  updateCoupon: (code: string, updated: Partial<Coupon>) => { success: boolean; message: string };
  deleteCoupon: (code: string) => void;
  toggleCouponActive: (code: string) => void;

  // Profit & Analytics
  profitSummary: ProfitAnalyticsSummary | null;
  fetchProfitAnalytics: (period?: 'today' | 'month' | 'previous_month' | 'custom', params?: { startDate?: string; endDate?: string }) => Promise<ProfitAnalyticsSummary | null>;
  expenses: Expense[];
  fetchExpenses: (filter?: { startDate?: string; endDate?: string; expenseType?: string }) => Promise<void>;
  addExpense: (expense: { expenseType: ExpenseType; amount: number; date: string; note?: string }) => Promise<boolean>;
  deleteExpense: (id: string) => Promise<boolean>;

  // Pagination & Filters
  isOrdersLoading: boolean;
  refreshOrders: (overrideParams?: OrderQueryParams) => Promise<void>;
  orderPage: number;
  setOrderPage: React.Dispatch<React.SetStateAction<number>>;
  orderPageSize: number;
  setOrderPageSize: React.Dispatch<React.SetStateAction<number>>;
  orderTotalCount: number;
  orderTotalPages: number;
  orderSummary: OrderSummaryStats | null;
  orderQueryFilters: { status: string; payment: string; search: string; sortBy: string };
  setOrderQueryFilters: React.Dispatch<React.SetStateAction<{ status: string; payment: string; search: string; sortBy: string }>>;
}

export const AdminContext = createContext<AdminContextType | null>(null);

export const useAdmin = () => useContext(AdminContext);
