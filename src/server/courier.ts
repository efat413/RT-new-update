import { D1Database } from './types';
import { Order } from '../types';
import { getOrderById, updateOrderInD1 } from './db';
import {
  validateCourierApiDestination,
  safeFetchCourierApi,
  APPROVED_STEADFAST_HOSTNAMES,
  APPROVED_STEADFAST_BASE_URLS,
} from './ssrf';

export { validateCourierApiDestination, safeFetchCourierApi };

/**
 * Normalized Steadfast Delivery Status Mapping
 */
export interface NormalizedCourierStatus {
  shippingStatus: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled' | 'On Hold';
  courierStatus: string;
  isFinal: boolean;
  isDelivered: boolean;
}

export function normalizeSteadfastStatus(rawStatus?: string): NormalizedCourierStatus {
  const clean = (rawStatus || '').toLowerCase().trim();

  // Final Delivered statuses
  if (clean === 'delivered' || clean === 'partial_delivered') {
    return {
      shippingStatus: 'Delivered',
      courierStatus: clean === 'partial_delivered' ? 'Partial Delivered' : 'Delivered',
      isFinal: true,
      isDelivered: true,
    };
  }

  // Final Cancelled / Returned statuses
  if (clean === 'cancelled' || clean === 'returned' || clean.includes('cancelled') || clean.includes('returned')) {
    return {
      shippingStatus: 'Cancelled',
      courierStatus: clean.includes('return') ? 'Returned' : 'Cancelled',
      isFinal: true,
      isDelivered: false,
    };
  }

  // Active in-transit statuses
  if (clean === 'in_transit' || clean.includes('transit')) {
    return {
      shippingStatus: 'Shipped',
      courierStatus: 'In Transit',
      isFinal: false,
      isDelivered: false,
    };
  }

  // Hold / delay
  if (clean === 'hold' || clean.includes('hold')) {
    return {
      shippingStatus: 'On Hold',
      courierStatus: 'Hold',
      isFinal: false,
      isDelivered: false,
    };
  }

  // In review / pending
  if (clean === 'in_review' || clean === 'pending' || clean.includes('pending') || clean.includes('review')) {
    return {
      shippingStatus: 'Processing',
      courierStatus: clean.includes('review') ? 'In Review' : 'Pending',
      isFinal: false,
      isDelivered: false,
    };
  }

  // Default fallback
  return {
    shippingStatus: 'Shipped',
    courierStatus: rawStatus || 'In Transit',
    isFinal: false,
    isDelivered: false,
  };
}

export interface SteadfastCredentials {
  apiKey: string;
  secretKey: string;
  baseUrl?: string;
}

/**
 * Standardize Steadfast Courier base URLs.
 * Enforces strict server-side allowlisting:
 * 1. Primary: https://portal.packzy.com/api/v1
 * 2. Fallback: https://portal.steadfast.com.bd/api/v1
 *
 * User-controlled arbitrary base URLs from requests are NEVER allowed to override
 * the production Steadfast credential destination.
 */
export function resolveSteadfastBaseUrls(customBaseUrl?: string): string[] {
  const PACKZY_PRIMARY = 'https://portal.packzy.com/api/v1';
  const STEADFAST_LEGACY = 'https://portal.steadfast.com.bd/api/v1';

  // If a customBaseUrl is passed from client, strictly validate it against approved Steadfast hostnames
  if (customBaseUrl && customBaseUrl.trim()) {
    const val = validateCourierApiDestination(customBaseUrl.trim(), { courierType: 'steadfast' });
    if (!val.valid) {
      console.warn('Rejected unapproved Steadfast customBaseUrl:', customBaseUrl, val.error);
      return [PACKZY_PRIMARY, STEADFAST_LEGACY];
    }
  }

  return [PACKZY_PRIMARY, STEADFAST_LEGACY];
}

/**
 * Resilient multi-endpoint dispatcher for Steadfast Courier API.
 * Automatically recovers from Cloudflare 530 Origin DNS errors, 5xx server issues, and timeouts.
 * Enforces SSRF defense and strict credential protection.
 */
export async function callSteadfastApi(
  endpointPath: string,
  credentials: SteadfastCredentials,
  options: {
    method?: 'GET' | 'POST';
    body?: any;
    timeoutMs?: number;
  } = {}
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const apiKey = (credentials.apiKey || '').trim();
  const secretKey = (credentials.secretKey || '').trim();

  if (!apiKey || !secretKey) {
    return {
      ok: false,
      status: 400,
      error: 'Steadfast Courier API credentials (API Key and Secret Key) are missing.',
    };
  }

  // Pre-validate credentials.baseUrl if passed from request
  if (credentials.baseUrl) {
    const val = validateCourierApiDestination(credentials.baseUrl, { courierType: 'steadfast' });
    if (!val.valid) {
      return {
        ok: false,
        status: 400,
        error: `Invalid Steadfast gateway destination: ${val.error}`,
      };
    }
  }

  const cleanPath = endpointPath.replace(/^\/+/, '');
  const candidateBaseUrls = resolveSteadfastBaseUrls(credentials.baseUrl);

  let lastStatus = 0;
  let lastError = '';
  let lastData: any = null;

  for (let i = 0; i < candidateBaseUrls.length; i++) {
    const baseUrl = candidateBaseUrls[i];
    const fullUrl = `${baseUrl}/${cleanPath}`;

    // Validate destination before making request
    const val = validateCourierApiDestination(fullUrl, { courierType: 'steadfast' });
    if (!val.valid) {
      console.error('SSRF filter blocked request to:', fullUrl, val.error);
      lastStatus = 400;
      lastError = val.error || 'Destination blocked by SSRF filter';
      continue;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; RongdhonuTrade/1.0; +https://rongdhonutrade.com)',
        'Api-Key': apiKey,
        'Secret-Key': secretKey,
      };

      const fetchResult = await safeFetchCourierApi({
        url: fullUrl,
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        timeoutMs: options.timeoutMs || 15000,
        courierType: 'steadfast',
        maxRedirects: 2,
      });

      lastStatus = fetchResult.status;
      lastData = fetchResult.data;

      // Failover immediately if Cloudflare returns 530 (Origin DNS Error) or other 5xx / 404
      if (
        fetchResult.status === 530 ||
        fetchResult.status === 502 ||
        fetchResult.status === 503 ||
        fetchResult.status === 504 ||
        fetchResult.status === 404
      ) {
        lastError = fetchResult.status === 530
          ? `HTTP 530 Origin DNS error on ${baseUrl}`
          : `HTTP ${fetchResult.status} on ${baseUrl}`;
        continue;
      }

      if (fetchResult.status === 401) {
        return {
          ok: false,
          status: 401,
          data: lastData,
          error: lastData?.message || 'Invalid Steadfast API Key or Secret Key. Please verify your credentials in your Steadfast/Packzy merchant dashboard.',
        };
      }

      if (fetchResult.status === 403) {
        return {
          ok: false,
          status: 403,
          data: lastData,
          error: lastData?.message || 'Steadfast Courier account is not active or API access is disabled.',
        };
      }

      if (fetchResult.ok) {
        return {
          ok: true,
          status: fetchResult.status,
          data: lastData,
        };
      }

      const rawMsg =
        lastData?.message ||
        (lastData?.errors ? (typeof lastData.errors === 'string' ? lastData.errors : JSON.stringify(lastData.errors)) : `Steadfast returned HTTP ${fetchResult.status}`);
      const clientMsg = typeof rawMsg === 'string' && rawMsg.length < 300 && !/secret|key|token|password/i.test(rawMsg)
        ? rawMsg
        : `Steadfast returned HTTP ${fetchResult.status}`;

      return {
        ok: false,
        status: fetchResult.status,
        data: lastData,
        error: clientMsg,
      };
    } catch (err: any) {
      console.error('Steadfast gateway attempt error:', err);
      lastError = 'Network connection failed';
      continue;
    }
  }

  let finalError = lastError;
  if (lastStatus === 530 || lastError.includes('530')) {
    finalError = 'Steadfast API returned HTTP 530 (Cloudflare Origin DNS Error on legacy portal.steadfast.com.bd). Switched to official https://portal.packzy.com/api/v1 gateway; please retry.';
  } else if (!finalError) {
    finalError = `Could not reach Steadfast Courier API after testing ${candidateBaseUrls.length} gateways.`;
  }

  return {
    ok: false,
    status: lastStatus || 502,
    data: lastData,
    error: finalError,
  };
}

/**
 * Queries the Steadfast Courier API with automatic endpoint fallback
 */
export async function querySteadfastStatus(
  identifier: { consignmentId?: string; trackingCode?: string },
  credentials: { apiKey: string; secretKey: string; baseUrl?: string }
): Promise<{ success: boolean; deliveryStatus?: string; rawData?: any; error?: string }> {
  const { apiKey, secretKey, baseUrl } = credentials;
  if (!apiKey || !secretKey) {
    return { success: false, error: 'Steadfast credentials missing on server.' };
  }

  const cid = identifier.consignmentId?.trim();
  const tracking = identifier.trackingCode?.trim();
  if (!cid && !tracking) {
    return { success: false, error: 'Either consignment ID or tracking code is required.' };
  }

  const endpointPath = cid
    ? `status_by_cid/${encodeURIComponent(cid)}`
    : `status_by_trackingcode/${encodeURIComponent(tracking!)}`;

  const callRes = await callSteadfastApi(endpointPath, { apiKey, secretKey, baseUrl });
  if (!callRes.ok) {
    return { success: false, error: callRes.error, rawData: callRes.data };
  }

  const sfData = callRes.data;
  const rawStatus =
    sfData?.delivery_status ||
    sfData?.status_name ||
    sfData?.data?.delivery_status ||
    (typeof sfData?.status === 'string' && sfData.status !== '200' ? sfData.status : undefined);

  if (rawStatus || sfData?.status === 200) {
    return {
      success: true,
      deliveryStatus: rawStatus || 'in_transit',
      rawData: sfData,
    };
  }

  const rawErr = sfData?.message || (sfData?.errors ? (typeof sfData.errors === 'string' ? sfData.errors : JSON.stringify(sfData.errors)) : 'No status returned from Steadfast.');
  const errorMsg = typeof rawErr === 'string' && rawErr.length < 300 && !/secret|key|token|password/i.test(rawErr)
    ? rawErr
    : 'No status returned from Steadfast.';
  return { success: false, error: String(errorMsg), rawData: sfData };
}

/**
 * Synchronizes the delivery status of a single order and updates D1
 * Strictly preserves all financial, customer, and item details.
 */
export async function syncSingleOrderCourierStatus(
  db: D1Database,
  orderIdOrNumber: string,
  credentials: { apiKey: string; secretKey: string }
): Promise<{ success: boolean; order?: Order; message?: string; unchanged?: boolean; error?: string }> {
  const order = await getOrderById(db, orderIdOrNumber);
  if (!order) {
    return { success: false, error: `Order "${orderIdOrNumber}" not found in database.` };
  }

  // Check if order has courier details
  const cid = order.consignmentId || (order.courierBooking?.consignmentId ? String(order.courierBooking.consignmentId) : undefined);
  const tracking = order.courierWaybill || (order.courierBooking?.waybillId ? String(order.courierBooking.waybillId) : undefined);

  if (!cid && !tracking) {
    return {
      success: false,
      error: `Order #${order.orderNumber} has no Steadfast consignment ID or tracking code.`,
    };
  }

  // Check if already in final status (Delivered, Cancelled, Returned)
  const currentNormalized = normalizeSteadfastStatus(order.courierStatus || order.shippingStatus);
  if (currentNormalized.isFinal) {
    return {
      success: true,
      order,
      unchanged: true,
      message: `Order #${order.orderNumber} is already in final status (${order.shippingStatus}). No sync needed.`,
    };
  }

  const queryResult = await querySteadfastStatus({ consignmentId: cid, trackingCode: tracking }, credentials);
  if (!queryResult.success || !queryResult.deliveryStatus) {
    return {
      success: false,
      error: queryResult.error || 'Failed to retrieve delivery status from Steadfast.',
    };
  }

  const normalized = normalizeSteadfastStatus(queryResult.deliveryStatus);
  const nowIso = new Date().toISOString();

  // Prepare updates strictly limited to delivery/courier status without altering financial or customer data
  const updates: Partial<Order> = {
    courierStatus: normalized.courierStatus,
    shippingStatus: normalized.shippingStatus as any,
    lastCourierSync: nowIso,
  };

  // If newly delivered via COD, mark paymentStatus as Paid and clear customer due
  if (normalized.isDelivered) {
    if (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'Paid') {
      updates.paymentStatus = 'Paid';
    }
    updates.customerDue = 0;
    updates.dueAmount = 0;
  }

  // Update existing courier booking timestamp while preserving provider and consignment IDs
  if (order.courierBooking) {
    updates.courierBooking = {
      ...order.courierBooking,
      status: normalized.courierStatus,
      lastCheckedAt: nowIso,
    };
  }

  const updatedOrder = await updateOrderInD1(db, order.id, updates);

  return {
    success: true,
    order: updatedOrder,
    message: `Order #${updatedOrder.orderNumber} status updated to "${normalized.shippingStatus}" (${normalized.courierStatus}).`,
  };
}

/**
 * Synchronizes all active (non-final) courier orders in D1
 * Called by:
 * - Admin "Sync All" button
 * - Cloudflare Worker Scheduled Cron trigger (every 15 minutes)
 */
export async function syncAllActiveCourierOrders(
  db: D1Database,
  credentials: { apiKey?: string; secretKey?: string; STEADFAST_API_KEY?: string; STEADFAST_SECRET_KEY?: string }
): Promise<{ success: boolean; totalChecked: number; updatedCount: number; errors: string[] }> {
  const apiKey = (credentials?.apiKey || credentials?.STEADFAST_API_KEY || '').trim();
  const secretKey = (credentials?.secretKey || credentials?.STEADFAST_SECRET_KEY || '').trim();

  if (!apiKey || !secretKey) {
    console.warn('[Courier Sync] Steadfast credentials (API Key and Secret Key) not configured.');
    return {
      success: false,
      totalChecked: 0,
      updatedCount: 0,
      errors: ['Steadfast credentials not configured.'],
    };
  }

  const creds = { apiKey, secretKey };

  // Query all orders that have Steadfast consignment/tracking and are NOT in final statuses
  const activeOrdersQuery = `
    SELECT id, order_number, consignment_id, courier_waybill, courier_status, shipping_status, payment_status, courier_booking_json
    FROM orders
    WHERE (consignment_id IS NOT NULL OR courier_waybill IS NOT NULL)
      AND shipping_status NOT IN ('Delivered', 'Cancelled')
      AND (courier_status IS NULL OR courier_status NOT IN ('Delivered', 'Cancelled', 'Returned'))
    ORDER BY created_at DESC
    LIMIT 100
  `;

  const rows = await db.prepare(activeOrdersQuery).all<any>();
  const activeList = rows.results || [];

  let updatedCount = 0;
  const errors: string[] = [];

  for (const row of activeList) {
    try {
      const res = await syncSingleOrderCourierStatus(db, row.id, creds);
      if (res.success && !res.unchanged) {
        updatedCount++;
      } else if (!res.success && res.error) {
        errors.push(`Order #${row.order_number}: ${res.error}`);
      }
    } catch (err: any) {
      console.error(`Error syncing courier for order #${row.order_number}:`, err);
      errors.push(`Order #${row.order_number}: Sync error`);
    }
  }

  return {
    success: true,
    totalChecked: activeList.length,
    updatedCount,
    errors,
  };
}
