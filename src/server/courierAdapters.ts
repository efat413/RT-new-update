import { Env } from './types';
import { Order } from '../types';
import {
  validateCourierApiDestination,
  safeFetchCourierApi,
} from './ssrf';
import {
  dispatchOrderToSteadfast,
  normalizeSteadfastStatus,
} from './courier';

export type CourierProvider = 'steadfast' | 'pathao' | 'redx';

export interface ParcelOverrides {
  weight?: number;
  notes?: string;
  deliveryType?: string;
  district?: string;
  address?: string;
  recipient_name?: string;
  recipient_phone?: string;
}

export interface CourierAdapterResult {
  ok: boolean;
  status: number;
  trackingCode?: string;
  consignmentId?: string;
  trackingUrl?: string;
  courierName: string;
  error?: string;
  data?: any;
}

/**
 * Normalizes provider name string to canonical 'steadfast' | 'pathao' | 'redx'
 */
export function normalizeCourierProvider(raw?: string): CourierProvider {
  const clean = (raw || '').toLowerCase().trim();
  if (clean.includes('pathao')) return 'pathao';
  if (clean.includes('redx')) return 'redx';
  return 'steadfast';
}

/**
 * Formats a clean 11-digit Bangladeshi recipient mobile phone number
 */
export function formatRecipientPhone(phone?: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.startsWith('01')) {
    return digits;
  }
  if (digits.length === 13 && digits.startsWith('8801')) {
    return digits.slice(2);
  }
  return digits;
}

/**
 * Derives combined recipient address string from authoritative order data and optional overrides
 */
export function deriveRecipientAddress(customer: Order['customer'], overrides?: ParcelOverrides): string {
  const rawAddress = (overrides?.address || customer?.fullAddress || customer?.district || overrides?.district || '').trim();
  const rawDistrict = (overrides?.district || customer?.district || '').trim();
  const parts: string[] = [rawAddress];
  if (rawDistrict && !rawAddress.toLowerCase().includes(rawDistrict.toLowerCase())) {
    parts.push(rawDistrict);
  }
  return parts.filter(Boolean).join(', ').substring(0, 250);
}

/**
 * Derives concise item description summary and total item lot quantity
 */
export function deriveOrderItemsSummary(items?: Order['items']): { itemDescription: string; totalLot: number } {
  const arr = Array.isArray(items) ? items : [];
  let totalLot = 0;
  const descriptions: string[] = [];

  for (const it of arr) {
    const qty = Math.max(1, Math.round(Number(it?.quantity) || 1));
    totalLot += qty;
    const title = it?.product?.title || 'Product';
    descriptions.push(`${title} x ${qty}`);
  }

  const itemDescription = descriptions.slice(0, 5).join(', ').substring(0, 200) || 'E-commerce Goods';
  return { itemDescription, totalLot: Math.max(1, totalLot) };
}

/**
 * Dispatches order to Steadfast Courier using server-authoritative state
 */
export async function dispatchSteadfastAdapter(
  order: Order,
  codAmount: number,
  overrides: ParcelOverrides | undefined,
  env: Env,
  settings?: any
): Promise<CourierAdapterResult> {
  const apiKey = (env.STEADFAST_API_KEY || '').trim();
  const secretKey = (env.STEADFAST_SECRET_KEY || '').trim();

  if (!apiKey || !secretKey) {
    return {
      ok: false,
      status: 400,
      courierName: 'Steadfast Courier',
      error: 'Steadfast Courier API credentials are not configured in Worker secrets.',
    };
  }

  const phone = formatRecipientPhone(overrides?.recipient_phone || order.customer.phone);
  const address = deriveRecipientAddress(order.customer, overrides);
  const recipientName = String(overrides?.recipient_name || order.customer.fullName || 'Customer').trim();
  const { itemDescription, totalLot } = deriveOrderItemsSummary(order.items);

  let deliveryType = 0;
  if (overrides?.deliveryType === '1' || overrides?.deliveryType === 'express' || overrides?.deliveryType === 'next_day') {
    deliveryType = 1;
  }

  const payload: Record<string, any> = {
    invoice: String(order.orderNumber),
    recipient_name: recipientName,
    recipient_phone: phone,
    recipient_address: address,
    cod_amount: codAmount,
    delivery_type: deliveryType,
    note: (overrides?.notes || order.customer.notes || `Order #${order.orderNumber} - Rongdhonu Trade`).trim(),
    item_description: itemDescription,
    total_lot: totalLot,
  };

  if (overrides?.weight != null && Number(overrides.weight) > 0) {
    payload.weight = Number(overrides.weight);
  }

  const sfResult = await dispatchOrderToSteadfast(payload, {
    apiKey,
    secretKey,
    baseUrl: env.STEADFAST_BASE_URL,
    order,
  });

  const sfData = sfResult.data || {};
  if (sfResult.ok && (sfData.status === 200 || sfData.consignment)) {
    const consignment = sfData.consignment || sfData;
    const trackingCode = String(consignment.tracking_code || '').trim();
    const consignmentId = String(consignment.consignment_id || consignment.id || '').trim();

    if (!trackingCode || !consignmentId) {
      return {
        ok: false,
        status: 400,
        courierName: 'Steadfast Courier',
        error: 'Steadfast booking failed: Upstream API did not return a valid tracking code or consignment ID.',
      };
    }

    return {
      ok: true,
      status: 200,
      trackingCode,
      consignmentId,
      trackingUrl: `https://steadfast.com.bd/t/${trackingCode}`,
      courierName: 'Steadfast Courier',
      data: sfData,
    };
  }

  const rawDetail =
    sfResult.error ||
    sfData.message ||
    (sfData.errors ? (typeof sfData.errors === 'string' ? sfData.errors : JSON.stringify(sfData.errors)) : 'Steadfast dispatch rejected.');
  const errorMsg =
    typeof rawDetail === 'string' && rawDetail.length < 300 && !/secret|key|token|password|stack|\.ts/i.test(rawDetail)
      ? rawDetail
      : 'Steadfast dispatch rejected. Please verify order details.';

  return {
    ok: false,
    status: sfResult.status || 400,
    courierName: 'Steadfast Courier',
    error: errorMsg,
    data: sfData,
  };
}

/**
 * Dispatches order to Pathao Courier using server-authoritative state
 */
export async function dispatchPathaoAdapter(
  order: Order,
  codAmount: number,
  overrides: ParcelOverrides | undefined,
  env: Env,
  settings?: any
): Promise<CourierAdapterResult> {
  const chosenConfig = (settings?.courierConfigs || []).find(
    (c: any) => (c.code || '').toLowerCase().includes('pathao') || (c.name || '').toLowerCase().includes('pathao')
  );

  const token = (
    env.PATHAO_API_KEY ||
    env.PATHAO_TOKEN ||
    env.PATHAO_SECRET_KEY ||
    chosenConfig?.apiKey ||
    chosenConfig?.secretKey ||
    ''
  ).trim();

  if (!token) {
    return {
      ok: false,
      status: 400,
      courierName: 'Pathao Courier',
      error: 'Pathao Courier API credentials are not configured in Worker secrets.',
    };
  }

  const rawBase = (env.PATHAO_BASE_URL || chosenConfig?.baseUrl || 'https://api-hermes.pathao.com/aladdin/api/v1').trim();
  const val = validateCourierApiDestination(rawBase, { courierType: 'pathao' });
  if (!val.valid) {
    return {
      ok: false,
      status: 400,
      courierName: 'Pathao Courier',
      error: val.error || 'Invalid Pathao gateway destination.',
    };
  }

  const cleanBase = val.normalizedUrl!.replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/orders') ? cleanBase : `${cleanBase}/orders`;

  const phone = formatRecipientPhone(overrides?.recipient_phone || order.customer.phone);
  const address = deriveRecipientAddress(order.customer, overrides);
  const recipientName = String(overrides?.recipient_name || order.customer.fullName || 'Customer').trim();
  const { itemDescription, totalLot } = deriveOrderItemsSummary(order.items);

  let deliveryType = 48; // standard delivery
  if (overrides?.deliveryType === '1' || overrides?.deliveryType === 'express' || overrides?.deliveryType === '12') {
    deliveryType = 12; // on-demand delivery
  }

  const payload: Record<string, any> = {
    merchant_order_id: String(order.orderNumber),
    recipient_name: recipientName,
    recipient_phone: phone,
    recipient_address: address,
    delivery_type: deliveryType,
    item_type: 2, // 2 = Parcel
    special_instruction: (overrides?.notes || order.customer.notes || `Order #${order.orderNumber}`).trim(),
    item_quantity: totalLot,
    item_weight: Math.max(0.1, Number(overrides?.weight) || 0.5),
    amount_to_collect: codAmount,
    item_description: itemDescription,
  };

  try {
    const fetchResult = await safeFetchCourierApi({
      url: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      timeoutMs: 15000,
      courierType: 'pathao',
      maxRedirects: 2,
    });

    const resData: any = fetchResult.data || {};

    if (fetchResult.ok && (fetchResult.status === 200 || fetchResult.status === 201 || resData.code === 200)) {
      const dataObj = resData.data || resData;
      const consignmentId = String(dataObj.consignment_id || dataObj.id || '').trim();
      const trackingCode = String(dataObj.tracking_code || dataObj.consignment_id || consignmentId).trim();

      if (!consignmentId) {
        return {
          ok: false,
          status: 400,
          courierName: 'Pathao Courier',
          error: 'Pathao booking failed: Upstream API did not return a valid consignment ID.',
        };
      }

      return {
        ok: true,
        status: 200,
        consignmentId,
        trackingCode: trackingCode || consignmentId,
        trackingUrl: `https://merchant.pathao.com/tracking?consignment_id=${trackingCode || consignmentId}`,
        courierName: 'Pathao Courier',
        data: resData,
      };
    }

    if (fetchResult.status === 401 || fetchResult.status === 403) {
      return {
        ok: false,
        status: 401,
        courierName: 'Pathao Courier',
        error: 'Invalid Pathao API credentials. Please check Pathao API access token.',
      };
    }

    const rawMsg = resData.message || (resData.errors ? JSON.stringify(resData.errors) : fetchResult.error || `Pathao returned HTTP ${fetchResult.status}`);
    const clientMsg = typeof rawMsg === 'string' && rawMsg.length < 300 && !/secret|key|token|password/i.test(rawMsg)
      ? rawMsg
      : 'Pathao booking rejected.';

    return {
      ok: false,
      status: fetchResult.status || 400,
      courierName: 'Pathao Courier',
      error: clientMsg,
      data: resData,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      courierName: 'Pathao Courier',
      error: 'Network connection failed while contacting Pathao API.',
    };
  }
}

/**
 * Dispatches order to RedX Logistics using server-authoritative state
 */
export async function dispatchRedxAdapter(
  order: Order,
  codAmount: number,
  overrides: ParcelOverrides | undefined,
  env: Env,
  settings?: any
): Promise<CourierAdapterResult> {
  const chosenConfig = (settings?.courierConfigs || []).find(
    (c: any) => (c.code || '').toLowerCase().includes('redx') || (c.name || '').toLowerCase().includes('redx')
  );

  const token = (
    env.REDX_API_KEY ||
    env.REDX_TOKEN ||
    env.REDX_SECRET_KEY ||
    chosenConfig?.apiKey ||
    chosenConfig?.secretKey ||
    ''
  ).trim();

  if (!token) {
    return {
      ok: false,
      status: 400,
      courierName: 'RedX Logistics',
      error: 'RedX Logistics API credentials are not configured in Worker secrets.',
    };
  }

  const rawBase = (env.REDX_BASE_URL || chosenConfig?.baseUrl || 'https://openapi.redx.com.bd/v1.0.0-beta').trim();
  const val = validateCourierApiDestination(rawBase, { courierType: 'redx' });
  if (!val.valid) {
    return {
      ok: false,
      status: 400,
      courierName: 'RedX Logistics',
      error: val.error || 'Invalid RedX gateway destination.',
    };
  }

  const cleanBase = val.normalizedUrl!.replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/parcels') ? cleanBase : `${cleanBase}/parcels`;

  const phone = formatRecipientPhone(overrides?.recipient_phone || order.customer.phone);
  const address = deriveRecipientAddress(order.customer, overrides);
  const recipientName = String(overrides?.recipient_name || order.customer.fullName || 'Customer').trim();
  const deliveryArea = String(overrides?.district || order.customer.district || 'Dhaka').trim();
  const weightInGrams = Math.max(500, Math.round((Number(overrides?.weight) || 0.5) * 1000));

  const payload: Record<string, any> = {
    customer_name: recipientName,
    customer_phone: phone,
    delivery_area: deliveryArea,
    customer_address: address,
    merchant_invoice_id: String(order.orderNumber),
    cash_collection_amount: codAmount,
    parcel_weight: weightInGrams,
    instruction: (overrides?.notes || order.customer.notes || `Order #${order.orderNumber}`).trim(),
    value: Number(order.totalAmount || codAmount),
  };

  try {
    const bearer = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    const fetchResult = await safeFetchCourierApi({
      url: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'API-ACCESS-TOKEN': bearer,
        'Authorization': bearer,
      },
      body: JSON.stringify(payload),
      timeoutMs: 15000,
      courierType: 'redx',
      maxRedirects: 2,
    });

    const resData: any = fetchResult.data || {};

    if (fetchResult.ok && (fetchResult.status === 200 || fetchResult.status === 201 || resData.tracking_id || resData.parcel_id)) {
      const trackingCode = String(resData.tracking_id || resData.parcel_id || resData.data?.tracking_id || '').trim();
      const consignmentId = String(resData.parcel_id || resData.tracking_id || resData.data?.parcel_id || trackingCode).trim();

      if (!trackingCode && !consignmentId) {
        return {
          ok: false,
          status: 400,
          courierName: 'RedX Logistics',
          error: 'RedX booking failed: Upstream API did not return a valid tracking ID.',
        };
      }

      const effectiveCode = trackingCode || consignmentId;
      return {
        ok: true,
        status: 200,
        consignmentId: consignmentId || effectiveCode,
        trackingCode: effectiveCode,
        trackingUrl: `https://redx.com.bd/track/${effectiveCode}`,
        courierName: 'RedX Logistics',
        data: resData,
      };
    }

    if (fetchResult.status === 401 || fetchResult.status === 403) {
      return {
        ok: false,
        status: 401,
        courierName: 'RedX Logistics',
        error: 'Invalid RedX API credentials. Please check RedX API token.',
      };
    }

    const rawMsg = resData.message || (resData.errors ? JSON.stringify(resData.errors) : fetchResult.error || `RedX returned HTTP ${fetchResult.status}`);
    const clientMsg = typeof rawMsg === 'string' && rawMsg.length < 300 && !/secret|key|token|password/i.test(rawMsg)
      ? rawMsg
      : 'RedX booking rejected.';

    return {
      ok: false,
      status: fetchResult.status || 400,
      courierName: 'RedX Logistics',
      error: clientMsg,
      data: resData,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      courierName: 'RedX Logistics',
      error: 'Network connection failed while contacting RedX API.',
    };
  }
}

/**
 * Authoritative dispatcher dispatching to third-party courier provider
 */
export async function dispatchViaCourierProvider(
  provider: CourierProvider,
  order: Order,
  codAmount: number,
  overrides: ParcelOverrides | undefined,
  env: Env,
  settings?: any
): Promise<CourierAdapterResult> {
  switch (provider) {
    case 'pathao':
      return dispatchPathaoAdapter(order, codAmount, overrides, env, settings);
    case 'redx':
      return dispatchRedxAdapter(order, codAmount, overrides, env, settings);
    case 'steadfast':
    default:
      return dispatchSteadfastAdapter(order, codAmount, overrides, env, settings);
  }
}
