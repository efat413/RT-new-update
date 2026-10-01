import {
  Product,
  Category,
  CarouselSlide,
  StoreSettings,
  Coupon,
  ProductReview,
  UserAccount,
  Expense,
  ExpenseType,
  ProfitAnalyticsSummary,
  CourierWebhookConfig,
  CourierWebhookLog,
} from '../types';
import { isSessionUnauthorizedError, notifyAuthUnauthorized } from './authApi';

const API_BASE = '/api';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function apiRequest<T>(url: string, options?: RequestInit, timeoutMs = 45000): Promise<{ success: boolean; data?: T; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isMutation = options?.method && options.method.toUpperCase() !== 'GET' && options.method.toUpperCase() !== 'HEAD';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(isMutation ? { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } : {}),
      ...(options?.headers as Record<string, string> || {}),
    };

    const effectiveUrl = typeof window === 'undefined' && url.startsWith('/')
      ? `http://localhost:3000${url}`
      : url;

    const res = await fetch(effectiveUrl, {
      ...options,
      credentials: 'include',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorMsg = json.error || json.message || `HTTP ${res.status}: ${res.statusText}`;
      if (isSessionUnauthorizedError(res.status, errorMsg)) {
        // Authenticated request rejected with 401: Cookie is invalid, expired, or revoked
        notifyAuthUnauthorized({ url, error: errorMsg });
      }
      return {
        success: false,
        error: errorMsg,
      };
    }
    if (json && json.success === false && json.error) {
      return {
        success: false,
        error: json.error,
      };
    }
    return {
      success: true,
      data: json as T,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
      return {
        success: false,
        error: 'Request timed out while contacting the server. Please try again.',
      };
    }
    return {
      success: false,
      error: err?.message || 'Network error communicating with Cloudflare D1',
    };
  }
}

// ==========================================
// 0. OPTIMIZED HOMEPAGE API
// ==========================================
export interface HomepageData {
  settings: StoreSettings;
  categories: Category[];
  slides: CarouselSlide[];
  categoryProducts: Record<string, Product[]>;
  featuredProducts?: Product[];
  products: Product[];
}

let activeHomepagePromise: Promise<{
  success: boolean;
  data?: HomepageData;
  error?: string;
}> | null = null;

export const storeHomepageApi = {
  async getHomepage(): Promise<{
    success: boolean;
    data?: HomepageData;
    error?: string;
  }> {
    if (activeHomepagePromise) {
      return activeHomepagePromise;
    }

    activeHomepagePromise = (async () => {
      try {
        const res = await apiRequest<{
          success: boolean;
          settings: StoreSettings;
          categories: Category[];
          slides: CarouselSlide[];
          categoryProducts: Record<string, Product[]>;
          featuredProducts?: Product[];
          products: Product[];
        }>(`${API_BASE}/store/homepage`);

        if (res.success && res.data) {
          return {
            success: true,
            data: {
              settings: res.data.settings,
              categories: res.data.categories,
              slides: res.data.slides,
              categoryProducts: res.data.categoryProducts,
              featuredProducts: res.data.featuredProducts,
              products: res.data.products,
            },
          };
        }
        return {
          success: false,
          error: res.error || 'Failed to fetch homepage data',
        };
      } finally {
        activeHomepagePromise = null;
      }
    })();

    return activeHomepagePromise;
  },
};

// ==========================================
// 1. PRODUCTS API
// ==========================================
export const productsApi = {
  async getAll(params?: {
    category?: string;
    search?: string;
    featured?: boolean;
    page?: number;
    limit?: number;
    sortBy?: 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest';
  }): Promise<Product[]> {
    const url = new URL(`${API_BASE}/products`, window.location.origin);
    if (params?.category) url.searchParams.set('category', params.category);
    if (params?.search) url.searchParams.set('search', params.search);
    if (params?.featured !== undefined) url.searchParams.set('featured', String(params.featured));
    if (params?.page !== undefined) url.searchParams.set('page', String(params.page));
    if (params?.limit !== undefined) url.searchParams.set('limit', String(params.limit));
    if (params?.sortBy) url.searchParams.set('sortBy', params.sortBy);

    const res = await apiRequest<{ success: boolean; products: Product[] }>(url.toString());
    if (res.success && res.data && Array.isArray(res.data.products)) {
      return res.data.products;
    }
    throw new Error(res.error || 'Failed to fetch products from D1');
  },

  async getHomepageCategoryProducts(categoryIdOrSlug: string, limit = 6): Promise<Product[]> {
    const url = new URL(`${API_BASE}/products`, window.location.origin);
    url.searchParams.set('category', categoryIdOrSlug);
    url.searchParams.set('page', '1');
    url.searchParams.set('limit', String(limit));
    const res = await apiRequest<{ success: boolean; products: Product[] }>(url.toString());
    if (res.success && res.data && Array.isArray(res.data.products)) {
      return res.data.products;
    }
    return [];
  },

  async getPaginated(params?: {
    category?: string;
    search?: string;
    featured?: boolean;
    page?: number;
    limit?: number;
    sortBy?: 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest';
  }): Promise<{ products: Product[]; total: number; page: number; limit: number; totalPages: number }> {
    const url = new URL(`${API_BASE}/products`, window.location.origin);
    if (params?.category) url.searchParams.set('category', params.category);
    if (params?.search) url.searchParams.set('search', params.search);
    if (params?.featured !== undefined) url.searchParams.set('featured', String(params.featured));
    url.searchParams.set('page', String(params?.page || 1));
    url.searchParams.set('limit', String(params?.limit || 24));
    if (params?.sortBy) url.searchParams.set('sortBy', params.sortBy);

    const res = await apiRequest<{ success: boolean; products: Product[]; total: number; page: number; limit: number; totalPages: number }>(url.toString());
    if (res.success && res.data) {
      const products = Array.isArray(res.data.products)
        ? res.data.products
        : Array.isArray(res.data)
        ? (res.data as any)
        : [];
      const total = Number(res.data.total) >= 0 ? Number(res.data.total) : products.length;
      const page = Number(res.data.page) || Number(params?.page) || 1;
      const limit = Number(res.data.limit) || Number(params?.limit) || 24;
      const totalPages = Number(res.data.totalPages) || Math.ceil(total / limit) || 1;
      return { products, total, page, limit, totalPages };
    }
    throw new Error(res.error || 'Failed to fetch paginated products from D1');
  },

  async getById(id: string): Promise<Product | null> {
    const res = await apiRequest<{ success: boolean; product: Product }>(
      `${API_BASE}/products/${encodeURIComponent(id)}`
    );
    return res.success && res.data && res.data.product ? res.data.product : null;
  },

  async create(product: Partial<Product>): Promise<Product> {
    const res = await apiRequest<{ success: boolean; product: Product }>(`${API_BASE}/products`, {
      method: 'POST',
      body: JSON.stringify(product),
    });
    if (!res.success || !res.data?.product) {
      throw new Error(res.error || 'Failed to create product in D1');
    }
    return res.data.product;
  },

  async update(id: string, updates: Partial<Product>): Promise<Product> {
    const res = await apiRequest<{ success: boolean; product: Product }>(
      `${API_BASE}/products/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    );
    if (!res.success || !res.data?.product) {
      throw new Error(res.error || 'Failed to update product in D1');
    }
    return res.data.product;
  },

  async setFeatured(id: string, isFeatured: boolean, featuredSortOrder?: number): Promise<Product> {
    const res = await apiRequest<{ success: boolean; product: Product }>(
      `${API_BASE}/products/${encodeURIComponent(id)}/featured`,
      {
        method: 'PUT',
        body: JSON.stringify({ isFeatured, featuredSortOrder }),
      }
    );
    if (!res.success || !res.data?.product) {
      throw new Error(res.error || 'Failed to update featured status in D1');
    }
    return res.data.product;
  },

  async delete(id: string): Promise<boolean> {
    const res = await apiRequest<{ success: boolean }>(`${API_BASE}/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete product from D1');
    }
    return true;
  },
};

// ==========================================
// 2. CATEGORIES API
// ==========================================
export const categoriesApi = {
  async getAll(): Promise<Category[]> {
    const res = await apiRequest<{ success: boolean; categories: Category[] }>(`${API_BASE}/categories`);
    if (res.success && res.data && Array.isArray(res.data.categories)) {
      return res.data.categories;
    }
    throw new Error(res.error || 'Failed to fetch categories from D1');
  },

  async create(category: Partial<Category>): Promise<Category> {
    const res = await apiRequest<{ success: boolean; category: Category }>(`${API_BASE}/categories`, {
      method: 'POST',
      body: JSON.stringify(category),
    });
    if (!res.success || !res.data?.category) {
      throw new Error(res.error || 'Failed to create category in D1');
    }
    return res.data.category;
  },

  async update(id: string, updates: Partial<Category>): Promise<Category> {
    const res = await apiRequest<{ success: boolean; category: Category }>(
      `${API_BASE}/categories/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    );
    if (!res.success || !res.data?.category) {
      throw new Error(res.error || 'Failed to update category in D1');
    }
    return res.data.category;
  },

  async delete(id: string): Promise<boolean> {
    const res = await apiRequest<{ success: boolean }>(`${API_BASE}/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete category from D1');
    }
    return true;
  },
};

// ==========================================
// 3. SLIDERS API
// ==========================================
export const slidersApi = {
  async getAll(): Promise<CarouselSlide[]> {
    const res = await apiRequest<{ success: boolean; sliders: CarouselSlide[] }>(`${API_BASE}/sliders`);
    if (res.success && res.data && Array.isArray(res.data.sliders)) {
      return res.data.sliders;
    }
    throw new Error(res.error || 'Failed to fetch sliders from D1');
  },

  async create(slider: Partial<CarouselSlide>): Promise<CarouselSlide> {
    const res = await apiRequest<{ success: boolean; slider: CarouselSlide }>(`${API_BASE}/sliders`, {
      method: 'POST',
      body: JSON.stringify(slider),
    });
    if (!res.success || !res.data?.slider) {
      throw new Error(res.error || 'Failed to create slider in D1');
    }
    return res.data.slider;
  },

  async update(id: string, updates: Partial<CarouselSlide>): Promise<CarouselSlide> {
    const res = await apiRequest<{ success: boolean; slider: CarouselSlide }>(
      `${API_BASE}/sliders/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    );
    if (!res.success || !res.data?.slider) {
      throw new Error(res.error || 'Failed to update slider in D1');
    }
    return res.data.slider;
  },

  async delete(id: string): Promise<boolean> {
    const res = await apiRequest<{ success: boolean }>(`${API_BASE}/sliders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete slider from D1');
    }
    return true;
  },
};

// ==========================================
// 4. STORE SETTINGS API
// ==========================================
export const settingsApi = {
  async get(): Promise<StoreSettings> {
    let res = await apiRequest<any>(`${API_BASE}/settings`);
    if (!res.success) {
      // Retry once after 250ms for dev server restart resilience
      await new Promise((r) => setTimeout(r, 250));
      res = await apiRequest<any>(`${API_BASE}/settings`);
    }

    if (res.success && res.data) {
      const candidate = res.data.settings || (res.data.siteName ? res.data : null);
      if (candidate && typeof candidate === 'object') {
        return candidate as StoreSettings;
      }
    }
    throw new Error(res.error || 'Failed to fetch settings from D1');
  },

  async update(settings: Partial<StoreSettings>): Promise<StoreSettings> {
    const res = await apiRequest<any>(`${API_BASE}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    if (res.success && res.data) {
      const candidate = res.data.settings || (res.data.siteName ? res.data : null);
      if (candidate && typeof candidate === 'object') {
        return candidate as StoreSettings;
      }
    }
    throw new Error(res.error || 'Failed to update settings in D1');
  },
};

// ==========================================
// 5. COUPONS API
// ==========================================
export const couponsApi = {
  async getAll(): Promise<Coupon[]> {
    const res = await apiRequest<{ success: boolean; coupons: Coupon[] }>(`${API_BASE}/coupons`);
    if (res.success && res.data && Array.isArray(res.data.coupons)) {
      return res.data.coupons;
    }
    throw new Error(res.error || 'Failed to fetch coupons from D1');
  },

  async create(coupon: Coupon): Promise<Coupon> {
    const res = await apiRequest<{ success: boolean; coupon: Coupon }>(`${API_BASE}/coupons`, {
      method: 'POST',
      body: JSON.stringify(coupon),
    });
    if (!res.success || !res.data?.coupon) {
      throw new Error(res.error || 'Failed to create coupon in D1');
    }
    return res.data.coupon;
  },

  async update(code: string, updates: Partial<Coupon>): Promise<Coupon> {
    const res = await apiRequest<{ success: boolean; coupon: Coupon }>(
      `${API_BASE}/coupons/${encodeURIComponent(code)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    );
    if (!res.success || !res.data?.coupon) {
      throw new Error(res.error || 'Failed to update coupon in D1');
    }
    return res.data.coupon;
  },

  async delete(code: string): Promise<boolean> {
    const res = await apiRequest<{ success: boolean }>(`${API_BASE}/coupons/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete coupon from D1');
    }
    return true;
  },
};

// ==========================================
// 6. REVIEWS API
// ==========================================
export const reviewsApi = {
  async getAll(productId?: string): Promise<ProductReview[]> {
    const url = new URL(`${API_BASE}/reviews`, window.location.origin);
    if (productId) url.searchParams.set('productId', productId);

    const res = await apiRequest<{ success: boolean; reviews: ProductReview[] }>(url.toString());
    if (res.success && res.data && Array.isArray(res.data.reviews)) {
      return res.data.reviews;
    }
    throw new Error(res.error || 'Failed to fetch reviews from D1');
  },

  async create(review: Partial<ProductReview>): Promise<ProductReview> {
    const res = await apiRequest<{ success: boolean; review: ProductReview }>(`${API_BASE}/reviews`, {
      method: 'POST',
      body: JSON.stringify(review),
    });
    if (!res.success || !res.data?.review) {
      throw new Error(res.error || 'Failed to create review in D1');
    }
    return res.data.review;
  },

  async delete(id: string): Promise<boolean> {
    const res = await apiRequest<{ success: boolean }>(`${API_BASE}/reviews/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete review from D1');
    }
    return true;
  },
};

// ==========================================
// 7. USERS API
// ==========================================
export const usersApi = {
  async getAll(): Promise<UserAccount[]> {
    const res = await apiRequest<{ success: boolean; users: UserAccount[] }>(`${API_BASE}/users`);
    if (res.success && res.data && Array.isArray(res.data.users)) {
      return res.data.users;
    }
    throw new Error(res.error || 'Failed to fetch users from D1');
  },

  async create(user: Partial<UserAccount>): Promise<UserAccount> {
    const res = await apiRequest<{ success: boolean; user: UserAccount }>(`${API_BASE}/users`, {
      method: 'POST',
      body: JSON.stringify(user),
    });
    if (!res.success || !res.data?.user) {
      throw new Error(res.error || 'Failed to create user in D1');
    }
    return res.data.user;
  },

  async update(id: string, updates: Partial<UserAccount>): Promise<UserAccount> {
    const res = await apiRequest<{ success: boolean; user: UserAccount }>(
      `${API_BASE}/users/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    );
    if (!res.success || !res.data?.user) {
      throw new Error(res.error || 'Failed to update user in D1');
    }
    return res.data.user;
  },

  async delete(id: string): Promise<boolean> {
    const res = await apiRequest<{ success: boolean }>(`${API_BASE}/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete user from D1');
    }
    return true;
  },

  async getPermissions(
    userId: string
  ): Promise<{ success: boolean; userId: string; role: string; permissions: Record<string, boolean> }> {
    const res = await apiRequest<{ success: boolean; userId: string; role: string; permissions: Record<string, boolean> }>(
      `${API_BASE}/users/${encodeURIComponent(userId)}/permissions`
    );
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Failed to fetch user permissions from server');
    }
    return res.data;
  },

  async updatePermissions(
    userId: string,
    permissions: Record<string, boolean>
  ): Promise<{ success: boolean; message?: string; permissions?: Record<string, boolean>; user?: UserAccount }> {
    const res = await apiRequest<{ success: boolean; message?: string; permissions?: Record<string, boolean>; user?: UserAccount }>(
      `${API_BASE}/users/${encodeURIComponent(userId)}/permissions`,
      {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      }
    );
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Failed to update user permissions in database');
    }
    return res.data;
  },

  async resetPassword(
    userId: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await apiRequest<{ success: boolean; message: string }>(
      `${API_BASE}/users/${encodeURIComponent(userId)}/reset-password`,
      {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      }
    );
    if (!res.success) {
      throw new Error(res.error || 'Failed to reset user password in database');
    }
    return res.data || { success: true, message: 'Password reset successfully' };
  },
};

// ==========================================
// 8. MEDIA UPLOAD API (R2 & D1 STORED)
// ==========================================
export const uploadApi = {
  async upload(file: File): Promise<{ success: boolean; url?: string; key?: string; error?: string }> {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        const errorMsg = json.error || `Upload failed with status HTTP ${res.status}`;
        if (res.status === 401) {
          notifyAuthUnauthorized({ url: `${API_BASE}/upload`, error: errorMsg });
        }
        return {
          success: false,
          error: errorMsg,
        };
      }

      return {
        success: true,
        url: json.url,
        key: json.key,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error during media upload',
      };
    }
  },
};

// ==========================================
// 9. PROFIT & FINANCIAL ANALYTICS API (SUPER ADMIN ONLY)
// ==========================================
export const profitAnalyticsApi = {
  async getSummary(params?: {
    period?: 'today' | 'month' | 'previous_month' | 'custom';
    startDate?: string;
    endDate?: string;
  }): Promise<ProfitAnalyticsSummary> {
    const url = new URL(`${API_BASE}/analytics/profit`, window.location.origin);
    if (params?.period) url.searchParams.set('period', params.period);
    if (params?.startDate) url.searchParams.set('startDate', params.startDate);
    if (params?.endDate) url.searchParams.set('endDate', params.endDate);

    const res = await apiRequest<{ success: boolean; summary: ProfitAnalyticsSummary }>(url.toString());
    if (res.success && res.data?.summary) {
      return res.data.summary;
    }
    throw new Error(res.error || 'Failed to fetch profit analytics from server');
  },
};

// ==========================================
// 10. EXPENSES API (SUPER ADMIN ONLY)
// ==========================================
export const expensesApi = {
  async getAll(params?: { startDate?: string; endDate?: string; expenseType?: string }): Promise<Expense[]> {
    const url = new URL(`${API_BASE}/expenses`, window.location.origin);
    if (params?.startDate) url.searchParams.set('startDate', params.startDate);
    if (params?.endDate) url.searchParams.set('endDate', params.endDate);
    if (params?.expenseType && params.expenseType !== 'all') url.searchParams.set('expenseType', params.expenseType);

    const res = await apiRequest<{ success: boolean; expenses: Expense[] }>(url.toString());
    if (res.success && res.data && Array.isArray(res.data.expenses)) {
      return res.data.expenses;
    }
    throw new Error(res.error || 'Failed to fetch expenses from server');
  },

  async create(expense: { expenseType: ExpenseType; amount: number; date: string; note?: string }): Promise<Expense> {
    const res = await apiRequest<{ success: boolean; expense: Expense; message?: string }>(`${API_BASE}/expenses`, {
      method: 'POST',
      body: JSON.stringify({ expense }),
    });
    if (!res.success || !res.data?.expense) {
      throw new Error(res.error || 'Failed to save expense');
    }
    return res.data.expense;
  },

  async delete(id: string): Promise<boolean> {
    const res = await apiRequest<{ success: boolean }>(`${API_BASE}/expenses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete expense');
    }
    return true;
  },
};

// ==========================================
// 11. COURIER WEBHOOKS API
// ==========================================
export const courierWebhooksApi = {
  async getAll(): Promise<CourierWebhookConfig[]> {
    const res = await apiRequest<{ success: boolean; webhooks: CourierWebhookConfig[] }>(`${API_BASE}/courier/webhooks`);
    if (res.success && Array.isArray(res.data?.webhooks)) {
      return res.data.webhooks;
    }
    return [];
  },

  async saveAll(webhooks: CourierWebhookConfig[]): Promise<boolean> {
    const res = await apiRequest<{ success: boolean }>(`${API_BASE}/courier/webhooks`, {
      method: 'POST',
      body: JSON.stringify({ webhooks }),
    });
    return Boolean(res.success);
  },

  async test(params: {
    url: string;
    secret?: string;
    webhookId?: string;
    event?: string;
    courier?: any;
    payload?: any;
  }): Promise<{ success: boolean; status?: number; latencyMs?: number; responsePreview?: string; error?: string }> {
    const res = await apiRequest<{
      success: boolean;
      status?: number;
      latencyMs?: number;
      responsePreview?: string;
      error?: string;
    }>(`${API_BASE}/courier/webhooks/test`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (res.success && res.data) {
      return res.data;
    }
    return {
      success: false,
      error: res.error || 'Webhook test request failed',
    };
  },

  async trigger(
    event: string,
    courier: any,
    options?: {
      targetUrl?: string;
      secret?: string;
      webhooks?: CourierWebhookConfig[];
    }
  ): Promise<{ success: boolean; dispatchedCount: number; results: any[]; error?: string }> {
    const res = await apiRequest<{
      success: boolean;
      dispatchedCount: number;
      results: any[];
      error?: string;
    }>(`${API_BASE}/courier/webhooks/trigger`, {
      method: 'POST',
      body: JSON.stringify({
        event,
        courier,
        targetUrl: options?.targetUrl,
        secret: options?.secret,
        webhooks: options?.webhooks,
      }),
    });
    if (res.success && res.data) {
      return res.data;
    }
    return {
      success: false,
      dispatchedCount: 0,
      results: [],
      error: res.error || 'Failed to trigger webhooks',
    };
  },

  async getLogs(): Promise<CourierWebhookLog[]> {
    const res = await apiRequest<{ success: boolean; logs: CourierWebhookLog[] }>(`${API_BASE}/courier/webhooks/logs`);
    if (res.success && Array.isArray(res.data?.logs)) {
      return res.data.logs;
    }
    return [];
  },
};


