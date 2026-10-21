import { Order, BlockedIp } from '../types';
import { isSessionUnauthorizedError, notifyAuthUnauthorized, getAuthToken } from './authApi';

export interface OrderSummaryStats {
  totalAll: number;
  pendingCount: number;
  shippedCount: number;
  deliveredCount: number;
  cancelledCount: number;
  unverifiedDbblCount: number;
  totalRevenue: number;
  totalDeliveryValue: number;
  cancelledOrdersValue: number;
  cancelledProductsValue: number;
}

export interface OrderQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  payment?: string;
  sortBy?: 'newest' | 'oldest' | 'amount-desc' | 'amount-asc' | string;
}

export interface OrderApiResponse<T = any> {
  success: boolean;
  message?: string;
  error?: string;
  orders?: Order[];
  order?: Order;
  count?: number;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
  summary?: OrderSummaryStats;
  data?: T;
  code?: string;
  status?: number;
  trackingCode?: string;
  tracking_code?: string;
  consignmentId?: string;
  consignment_id?: string;
}

export interface PaginatedOrdersResponse {
  success: boolean;
  orders: Order[];
  count: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  summary?: OrderSummaryStats;
  error?: string;
}

export interface CourierDispatchDto {
  orderId: string;
  courierProvider: 'steadfast' | 'pathao' | 'redx';
  parcelOverrides?: {
    weight?: number;
    notes?: string;
    deliveryType?: string;
  };
}

const API_BASE = '/api';

function getHeaders(): Record<string, string> {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Client service to communicate with Cloudflare D1 Database via Cloudflare Worker/API.
 * Strongly validates HTTP status, JSON payload, and D1 database responses.
 * Uses pure HttpOnly cookie authentication (credentials: 'include') and Authorization header fallback.
 */
export const orderApi = {
  /**
   * Fetches paginated orders from Cloudflare D1 central database
   */
  async getOrders(params?: string | OrderQueryParams): Promise<PaginatedOrdersResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const query: OrderQueryParams =
      typeof params === 'string' ? { search: params } : params || {};

    try {
      const url = new URL(`${API_BASE}/orders`, window.location.origin);
      if (query.page && query.page > 0) url.searchParams.set('page', String(query.page));
      if (query.limit && query.limit > 0) url.searchParams.set('limit', String(query.limit));
      if (query.search && query.search.trim()) url.searchParams.set('search', query.search.trim());
      if (query.status && query.status !== 'all') url.searchParams.set('status', query.status);
      if (query.payment && query.payment !== 'all') url.searchParams.set('payment', query.payment);
      if (query.sortBy) url.searchParams.set('sortBy', query.sortBy);

      let res = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'include',
        headers: getHeaders(),
        signal: controller.signal,
      });

      // 1 automatic bounded retry on initial 401 to handle auth state propagation race condition
      if (res.status === 401) {
        await new Promise((r) => setTimeout(r, 150));
        try {
          const retryRes = await fetch(url.toString(), {
            method: 'GET',
            credentials: 'include',
            headers: getHeaders(),
            signal: controller.signal,
          });
          if (retryRes.ok) {
            res = retryRes;
          }
        } catch {}
      }

      clearTimeout(timeoutId);

      const data: OrderApiResponse = await res.json().catch(() => ({ success: false }));
      if (!res.ok) {
        const errorMsg = data.error || data.message || 'Failed to fetch orders. Please try again.';
        if (isSessionUnauthorizedError(res.status, errorMsg)) {
          notifyAuthUnauthorized({ url: url.toString(), error: errorMsg });
        }
        throw new Error(errorMsg);
      }

      if (data.success && Array.isArray(data.orders)) {
        const orders = data.orders;
        const limit = Number(data.limit) || query.limit || 25;
        const page = Number(data.page) || query.page || 1;
        const total = data.total !== undefined ? Number(data.total) : orders.length;
        const totalPages = data.totalPages !== undefined ? Number(data.totalPages) : Math.max(1, Math.ceil(total / limit));
        return {
          success: true,
          orders,
          count: orders.length,
          total,
          page,
          limit,
          totalPages,
          hasNextPage: data.hasNextPage !== undefined ? Boolean(data.hasNextPage) : page < totalPages,
          hasPrevPage: data.hasPrevPage !== undefined ? Boolean(data.hasPrevPage) : page > 1,
          summary: data.summary,
        };
      }
      return {
        success: false,
        orders: [],
        count: 0,
        total: 0,
        page: 1,
        limit: query.limit || 25,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
        error: data.error || 'Invalid orders payload returned by server',
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.warn('orderApi.getOrders error:', err?.message || err);
      if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
        return {
          success: false,
          orders: [],
          count: 0,
          total: 0,
          page: 1,
          limit: query.limit || 25,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
          error: 'Request timed out while contacting the server. Please try again.',
        };
      }
      return {
        success: false,
        orders: [],
        count: 0,
        total: 0,
        page: 1,
        limit: query.limit || 25,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
        error: err?.message || 'Network error fetching orders',
      };
    }
  },

  /**
   * Permanently saves a new order to Cloudflare D1 database.
   * Awaits D1 confirmation and returns the canonical inserted order.
   * Supports Idempotency-Key for network retries and duplicate avoidance.
   */
  async createOrder(order: Order, idempotencyKey?: string): Promise<OrderApiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const headers = getHeaders();
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }

      // Defense-in-depth sanitization: strip any heavy catalog metadata or inline Base64 from order body
      const sanitizedOrder = {
        ...order,
        items: (order.items || []).map((it: any) => ({
          productId: it?.productId || it?.product?.id,
          variantId: it?.variantId || undefined,
          quantity: it?.quantity,
          selectedSize: it?.selectedSize || undefined,
          selectedColor: it?.selectedColor || undefined,
          customization: it?.customization || undefined,
          customImage: it?.customImage?.startsWith('data:') ? undefined : it?.customImage,
          product: it?.product ? {
            id: it.product.id,
            title: it.product.title,
          } : undefined,
        })),
        dbblDetails: order.dbblDetails ? {
          ...order.dbblDetails,
          depositSlipUrl: order.dbblDetails.depositSlipUrl?.startsWith('data:')
            ? undefined
            : order.dbblDetails.depositSlipUrl,
        } : undefined,
      };

      const res = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ order: sanitizedOrder, idempotencyKey }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        let errorMsg = data.error || data.message || 'Unable to place the order right now. Please try again.';
        const isIpBlockedOrSecurity =
          res.status === 403 ||
          data.code === 'IP_BLOCKED' ||
          /ip.*(block|blacklist)|blacklisted|forbidden|fraud|security/i.test(errorMsg);

        if (isIpBlockedOrSecurity) {
          // Stealthy, polite, user-friendly message that protects security rules without revealing blacklist
          errorMsg = 'We are currently unable to process your order due to a temporary network issue. Please try again later or contact our support team.';
        } else if (/sqlite|syntax error|d1|table |column |foreign key|prepare|bind|database disk|file not found|\/app\/|\/src\/|\.ts:\d+|\.js:\d+|admin_secret|token|credential|api[_-]?key/i.test(errorMsg)) {
          errorMsg = 'Unable to place the order right now. Please try again.';
        }
        return {
          success: false,
          error: errorMsg,
          code: data.code || (res.status === 403 ? 'IP_BLOCKED' : undefined),
          status: res.status,
        };
      }

      return {
        success: true,
        order: data.order || order,
        message: data.message || 'Order successfully placed',
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('orderApi.createOrder error:', err);
      if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
        return { success: false, error: 'Request timed out while contacting the server. Please try again.' };
      }
      return { success: false, error: 'Unable to place the order right now. Please try again.' };
    }
  },

  /**
   * Updates an existing order in Cloudflare D1 database.
   * Strongly verifies response and returns updated canonical order.
   */
  async updateOrder(orderId: string, updates: Partial<Order>): Promise<OrderApiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ updates }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || data.message || 'Failed to update order. Please try again.';
        if (res.status === 401) {
          notifyAuthUnauthorized({ url: `${API_BASE}/orders/${encodeURIComponent(orderId)}`, error: errorMsg });
        }
        return { success: false, error: errorMsg };
      }

      return {
        success: true,
        order: data.order,
        message: data.message || 'Order successfully updated',
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('orderApi.updateOrder error:', err);
      if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
        return { success: false, error: 'Request timed out while contacting the server. Please try again.' };
      }
      return { success: false, error: err?.message || 'Network error updating order' };
    }
  },

  /**
   * Permanently deletes an order from Cloudflare D1 database.
   */
  async deleteOrder(orderId: string): Promise<OrderApiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || 'Failed to delete order. Please try again.';
        if (res.status === 401) {
          notifyAuthUnauthorized({ url: `${API_BASE}/orders/${encodeURIComponent(orderId)}`, error: errorMsg });
        }
        return { success: false, error: errorMsg };
      }

      return { success: true, message: data.message || 'Order deleted successfully' };
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('orderApi.deleteOrder error:', err);
      if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
        return { success: false, error: 'Request timed out while contacting the server. Please try again.' };
      }
      return { success: false, error: err?.message || 'Network error deleting order' };
    }
  },

  /**
   * Tests Steadfast Courier API connection and fetches balance via secure server-side proxy
   */
  async testSteadfastConnection(credentials?: {
    apiKey?: string;
    secretKey?: string;
    baseUrl?: string;
  }): Promise<{ success: boolean; message: string; balance?: number; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/courier/steadfast/test`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify(credentials || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        return {
          success: true,
          message: data.message || 'Connected successfully to Steadfast Courier API!',
          balance: data.current_balance ?? data.balance,
        };
      }
      const errorMsg = data.error || 'Failed to connect to Steadfast API';
      return {
        success: false,
        message: errorMsg,
        error: data.error,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Network error while testing Steadfast API',
        error: err?.message,
      };
    }
  },

  /**
   * Dispatches parcel via secure server-side proxy with minimal DTO.
   * Strips entire order trees, catalog dumps, image/base64 data, and raw credentials.
   */
  async dispatchCourier(
    dtoOrOrder: CourierDispatchDto | Order | any,
    parcelData?: any,
    courier?: any
  ): Promise<OrderApiResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      // Build strictly minimal DTO: strip full order objects, image trees, and credentials
      let payload: CourierDispatchDto;

      if (dtoOrOrder && typeof dtoOrOrder === 'object' && 'orderId' in dtoOrOrder && 'courierProvider' in dtoOrOrder) {
        payload = {
          orderId: String(dtoOrOrder.orderId).trim(),
          courierProvider: dtoOrOrder.courierProvider,
          parcelOverrides: dtoOrOrder.parcelOverrides
            ? {
                weight: dtoOrOrder.parcelOverrides.weight != null ? Number(dtoOrOrder.parcelOverrides.weight) : undefined,
                notes: dtoOrOrder.parcelOverrides.notes ? String(dtoOrOrder.parcelOverrides.notes).trim() : undefined,
                deliveryType: dtoOrOrder.parcelOverrides.deliveryType ? String(dtoOrOrder.parcelOverrides.deliveryType).trim() : undefined,
              }
            : undefined,
        };
      } else {
        // Backward-compatibility normalization: if passed (order, parcelData, courier)
        const orderId = String(dtoOrOrder?.id || dtoOrOrder?.orderNumber || parcelData?.invoice || '').trim();
        const rawProvider = String(courier?.code || courier?.name || parcelData?.courier || 'steadfast').toLowerCase();
        const courierProvider: 'steadfast' | 'pathao' | 'redx' =
          rawProvider.includes('pathao') ? 'pathao' :
          rawProvider.includes('redx') ? 'redx' : 'steadfast';

        payload = {
          orderId,
          courierProvider,
          parcelOverrides: {
            weight: parcelData?.weight != null ? Number(parcelData.weight) : undefined,
            notes: (parcelData?.note || parcelData?.notes || '').trim() || undefined,
            deliveryType: parcelData?.delivery_type != null ? String(parcelData.delivery_type) : undefined,
          },
        };
      }

      const res = await fetch(`${API_BASE}/courier/dispatch`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || `HTTP ${res.status}: Courier dispatch rejected`;
        if (res.status === 401) {
          notifyAuthUnauthorized({ url: `${API_BASE}/courier/dispatch`, error: errorMsg });
        }
        return {
          success: false,
          error: errorMsg,
        };
      }

      return {
        success: true,
        trackingCode: data.tracking_code || data.trackingCode,
        consignmentId: data.consignment_id || data.consignmentId,
        data: data.data,
        message: data.message,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
        return { success: false, error: 'Request timed out while contacting the server. Please try again.' };
      }
      return { success: false, error: err?.message || 'Network error dispatching courier' };
    }
  },

  /**
   * Tracks customer order delivery status using order number and contact phone number.
   * Leverages server-side privacy filtering and abuse rate limiting.
   */
  async trackOrder(orderNumber: string, phone: string): Promise<{
    success: boolean;
    order?: Order;
    error?: string;
    isRateLimited?: boolean;
    retryAfter?: number;
  }> {
    try {
      const cleanNum = orderNumber.trim();
      const cleanPhone = phone.replace(/\D/g, '');
      const url = `${API_BASE}/orders/${encodeURIComponent(cleanNum)}?phone=${encodeURIComponent(cleanPhone)}`;
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: getHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
        return {
          success: false,
          error: data.error || 'Too many tracking attempts. Please wait before trying again.',
          isRateLimited: true,
          retryAfter,
        };
      }
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || 'Order not found or contact number does not match.',
        };
      }
      return {
        success: true,
        order: data.order,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error while querying order tracking.',
      };
    }
  },

  /**
   * Checks courier parcel tracking status via secure server-side proxy
   */
  async checkCourierStatus(consignmentId: string, phone?: string): Promise<any> {
    try {
      const queryParam = phone ? `?phone=${encodeURIComponent(phone)}` : '';
      const url = `${API_BASE}/courier/status/${encodeURIComponent(consignmentId)}${queryParam}`;
      const res = await fetch(url, {
        credentials: 'include',
        headers: getHeaders(),
      });
      return await res.json().catch(() => ({ success: false }));
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  },

  /**
   * Synchronizes single order courier delivery status from Steadfast and updates D1
   */
  async syncSingleCourierOrder(orderId: string): Promise<{ success: boolean; order?: Order; message?: string; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/courier/sync/${encodeURIComponent(orderId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || `Failed to sync order courier status (HTTP ${res.status})`;
        if (res.status === 401) {
          notifyAuthUnauthorized({ url: `${API_BASE}/courier/sync/${encodeURIComponent(orderId)}`, error: errorMsg });
        }
        return {
          success: false,
          error: errorMsg,
        };
      }
      return {
        success: true,
        order: data.order,
        message: data.message,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error synchronizing courier status',
      };
    }
  },

  /**
   * Synchronizes all active non-final courier orders from Steadfast and updates D1
   */
  async syncAllCourierOrders(): Promise<{ success: boolean; totalChecked?: number; updatedCount?: number; message?: string; errors?: string[]; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/courier/sync`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data.error || `Courier sync failed (HTTP ${res.status})`;
        if (res.status === 401) {
          notifyAuthUnauthorized({ url: `${API_BASE}/courier/sync`, error: errorMsg });
        }
        return {
          success: false,
          error: errorMsg,
        };
      }
      return {
        success: true,
        totalChecked: data.totalChecked,
        updatedCount: data.updatedCount,
        message: data.message,
        errors: data.errors,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error syncing all courier orders',
      };
    }
  },

  /**
   * Downloads filtered order export CSV from Cloudflare D1
   */
  async exportOrders(params: {
    startDate?: string;
    endDate?: string;
    status?: string;
    paymentStatus?: string;
    search?: string;
    orderIds?: string[];
  }): Promise<{ success: boolean; blob?: Blob; filename?: string; error?: string }> {
    try {
      const url = new URL(`${API_BASE}/admin/orders/export`, window.location.origin);
      if (params.startDate) url.searchParams.set('startDate', params.startDate);
      if (params.endDate) url.searchParams.set('endDate', params.endDate);
      if (params.status && params.status !== 'all') url.searchParams.set('status', params.status);
      if (params.paymentStatus && params.paymentStatus !== 'all') url.searchParams.set('paymentStatus', params.paymentStatus);
      if (params.search && params.search.trim()) url.searchParams.set('search', params.search.trim());
      if (params.orderIds && params.orderIds.length > 0) {
        url.searchParams.set('orderIds', params.orderIds.join(','));
      }

      const res = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'include',
        headers: getHeaders(),
      });

      if (!res.ok) {
        let errMessage = `Export failed with HTTP ${res.status}`;
        try {
          const errData = await res.json();
          errMessage = errData.error || errData.message || errMessage;
        } catch {}
        if (res.status === 401) {
          notifyAuthUnauthorized({ url: url.toString(), error: errMessage });
        }
        return { success: false, error: errMessage };
      }

      const blob = await res.blob();
      let filename = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
      const disposition = res.headers.get('Content-Disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename=["']?([^"';]+)["']?/);
        if (match && match[1]) filename = match[1];
      }

      return { success: true, blob, filename };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error while exporting orders' };
    }
  },

  async getBlockedIps(): Promise<{ success: boolean; count?: number; blockedIps?: BlockedIp[]; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/admin/blocked-ips`, {
        method: 'GET',
        credentials: 'include',
        headers: getHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) notifyAuthUnauthorized({ url: `${API_BASE}/admin/blocked-ips`, error: data.error });
        return { success: false, error: data.error || 'Failed to fetch blocked IPs.' };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error while fetching blocked IPs.' };
    }
  },

  async blockIp(ip: string, reason?: string): Promise<{ success: boolean; message?: string; blockedIp?: BlockedIp; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/admin/blocked-ips`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ ip, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) notifyAuthUnauthorized({ url: `${API_BASE}/admin/blocked-ips`, error: data.error });
        return { success: false, error: data.error || 'Failed to block IP address.' };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error while blocking IP.' };
    }
  },

  async unblockIp(ipOrId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/admin/blocked-ips?ip=${encodeURIComponent(ipOrId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) notifyAuthUnauthorized({ url: `${API_BASE}/admin/blocked-ips`, error: data.error });
        return { success: false, error: data.error || 'Failed to unblock IP address.' };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error while unblocking IP.' };
    }
  },
};

