import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/worker';
import { handleApiRequest } from '../src/server/router';
import { orderApi, CourierDispatchDto } from '../src/services/orderApi';
import {
  dispatchViaCourierProvider,
  dispatchSteadfastAdapter,
  dispatchPathaoAdapter,
  dispatchRedxAdapter,
  normalizeCourierProvider,
  formatRecipientPhone,
  deriveRecipientAddress,
  deriveOrderItemsSummary,
} from '../src/server/courierAdapters';
import { BODY_LIMIT_COURIER_DISPATCH } from '../src/server/bodyLimits';
import { createAuthToken } from '../src/server/auth';
import { Order } from '../src/types';

// In-memory mock D1 database constructor
function createMockD1Database(initialOrders: Map<string, any> = new Map()): any {
  const orders = new Map(initialOrders);
  const users = new Map<string, any>([
    [
      'admin@rongdhonutrade.com',
      {
        id: 'usr-admin-1',
        email: 'admin@rongdhonutrade.com',
        role: 'admin',
        permissions_json: JSON.stringify({ 'courier.booking': true, 'order.manage': true }),
        password: null,
      },
    ],
    [
      'staff@rongdhonutrade.com',
      {
        id: 'usr-staff-1',
        email: 'staff@rongdhonutrade.com',
        role: 'sub_admin',
        permissions_json: JSON.stringify({ 'courier.booking': false, 'product.view': true }),
        password: null,
      },
    ],
  ]);

  return {
    _orders: orders,
    _users: users,
    prepare(sql: string) {
      let boundParams: any[] = [];
      const stmt = {
        bind(...params: any[]) {
          boundParams = params;
          return stmt;
        },
        async first<T = any>() {
          if (sql.includes('SELECT 1 as alive')) return { alive: 1 } as T;
          if (sql.includes('FROM store_settings WHERE id = "default"')) {
            return {
              settings_json: JSON.stringify({
                insideDhakaFee: 80,
                outsideDhakaFee: 150,
                steadfastApiKey: 'default-sf-key',
                steadfastSecretKey: 'default-sf-secret',
                courierConfigs: [
                  { id: 'courier-steadfast', code: 'Steadfast', name: 'Steadfast Courier', isActive: true },
                  { id: 'courier-pathao', code: 'Pathao', name: 'Pathao Courier', isActive: true, apiKey: 'mock-pathao-token' },
                  { id: 'courier-redx', code: 'RedX', name: 'RedX Logistics', isActive: true, apiKey: 'mock-redx-token' },
                ],
              }),
            } as T;
          }
          if (sql.includes('FROM users WHERE')) {
            const lookup = boundParams[0];
            for (const u of users.values()) {
              if (u.email === lookup || u.id === lookup) return ({ ...u }) as T;
            }
            return null as T;
          }
          if (sql.includes('FROM orders WHERE id = ? OR order_number = ?')) {
            const ord = orders.get(boundParams[0]) || orders.get(boundParams[1]);
            return ord ? ({ ...ord } as T) : (null as T);
          }
          if (sql.includes('SELECT * FROM orders WHERE id = ?')) {
            const ord = orders.get(boundParams[0]);
            return ord ? ({ ...ord } as T) : (null as T);
          }
          return null as T;
        },
        async all<T = any>() {
          if (sql.includes('PRAGMA table_info')) {
            return {
              results: [
                { name: 'id' },
                { name: 'order_number' },
                { name: 'consignment_id' },
                { name: 'courier_waybill' },
                { name: 'shipping_status' },
                { name: 'courier_status' },
                { name: 'total_amount' },
                { name: 'advance_payment' },
              ],
            } as any;
          }
          return { results: [] } as any;
        },
        async run() {
          if (sql.includes('UPDATE orders SET')) {
            const orderId = boundParams[boundParams.length - 1];
            const existing = orders.get(orderId);
            if (existing) {
              orders.set(orderId, {
                ...existing,
                consignment_id: boundParams[12] ?? existing.consignment_id,
                courier_waybill: boundParams[11] ?? existing.courier_waybill,
                shipping_status: boundParams[9] ?? existing.shipping_status,
                courier_status: boundParams[13] ?? existing.courier_status,
                courier_booking_json: boundParams[14] ?? existing.courier_booking_json,
              });
            }
          }
          return { success: true };
        },
      };
      return stmt;
    },
  };
}

describe('Courier Dispatch Minimal DTO & Server-Authoritative Architecture', () => {
  const TEST_AUTH_SECRET = 'secure-admin-session-auth-token-key-32b-min';
  let validAdminToken: string;
  let restrictedStaffToken: string;
  let mockEnv: any;
  let mockDb: any;

  beforeEach(async () => {
    vi.restoreAllMocks();

    validAdminToken = await createAuthToken(
      {
        userId: 'usr-admin-1',
        email: 'admin@rongdhonutrade.com',
        role: 'admin',
        authTime: Math.floor(Date.now() / 1000),
      },
      TEST_AUTH_SECRET,
      3600
    );

    restrictedStaffToken = await createAuthToken(
      {
        userId: 'usr-staff-1',
        email: 'staff@rongdhonutrade.com',
        role: 'sub_admin',
        authTime: Math.floor(Date.now() / 1000),
      },
      TEST_AUTH_SECRET,
      3600
    );

    const initialOrderRow = {
      id: 'ord-1001',
      order_number: 'ORD-1001',
      customer_name: 'Tanvir Hossain',
      customer_phone: '01712345678',
      customer_address: 'House 42, Road 7, Sector 3, Uttara',
      customer_district: 'Dhaka',
      items_json: JSON.stringify([
        {
          product: { id: 'prod-1', title: 'Premium Cotton Panjabi', price: 1800 },
          quantity: 2,
          sellingPriceSnapshot: 1800,
        },
      ]),
      subtotal: 3600,
      delivery_fee: 100,
      total_amount: 3700,
      discount_amount: 0,
      advance_payment: 1000,
      customer_due: 2700,
      due_amount: 2700,
      payment_status: 'PARTIAL',
      payment_method: 'cod',
      shipping_status: 'Processing',
      consignment_id: null,
      courier_waybill: null,
      courier_status: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const initialOrderMap = new Map<string, any>([
      ['ord-1001', initialOrderRow],
      ['ORD-1001', initialOrderRow],
    ]);

    mockDb = createMockD1Database(initialOrderMap);

    mockEnv = {
      DB: mockDb,
      ADMIN_SECRET: TEST_AUTH_SECRET,
      JWT_SECRET: TEST_AUTH_SECRET,
      DEV: true,
      STEADFAST_API_KEY: 'test-sf-key',
      STEADFAST_SECRET_KEY: 'test-sf-secret',
      PATHAO_API_KEY: 'test-pathao-token',
      REDX_API_KEY: 'test-redx-token',
    };
  });

  describe('Phase 1: Frontend Client Refactor (Minimal DTO & Secret Stripping)', () => {
    it('dispatches strictly minimal DTO and does NOT serialize order tree, images, or credentials', async () => {
      let interceptedBody: any = null;

      const mockFetch = vi.fn().mockImplementation((url: string, opts: any) => {
        if (url.includes('/api/courier/dispatch')) {
          interceptedBody = JSON.parse(opts.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              tracking_code: 'TRK-SF-1001',
              consignment_id: 'CID-SF-1001',
              message: 'Dispatched successfully',
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      vi.stubGlobal('fetch', mockFetch);

      const minimalDto: CourierDispatchDto = {
        orderId: 'ord-1001',
        courierProvider: 'steadfast',
        parcelOverrides: {
          weight: 1.2,
          notes: 'Deliver before 5 PM',
          deliveryType: '0',
        },
      };

      const result = await orderApi.dispatchCourier(minimalDto);

      expect(result.success).toBe(true);
      expect(result.trackingCode).toBe('TRK-SF-1001');
      expect(result.consignmentId).toBe('CID-SF-1001');

      // Verify the wire body sent across the network:
      expect(interceptedBody).toBeDefined();
      expect(interceptedBody.orderId).toBe('ord-1001');
      expect(interceptedBody.courierProvider).toBe('steadfast');
      expect(interceptedBody.parcelOverrides.weight).toBe(1.2);
      expect(interceptedBody.parcelOverrides.notes).toBe('Deliver before 5 PM');

      // Regression checks: ensure zero bloated properties
      expect(interceptedBody.order).toBeUndefined();
      expect(interceptedBody.items).toBeUndefined();
      expect(interceptedBody.customer).toBeUndefined();
      expect(interceptedBody.apiKey).toBeUndefined();
      expect(interceptedBody.secretKey).toBeUndefined();
      expect(interceptedBody.courier).toBeUndefined();
    });

    it('backward compatibility: strips large order objects and credentials even if passed legacy signature', async () => {
      let interceptedBody: any = null;

      const mockFetch = vi.fn().mockImplementation((url: string, opts: any) => {
        interceptedBody = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            tracking_code: 'TRK-SF-1002',
            consignment_id: 'CID-SF-1002',
          }),
        });
      });

      vi.stubGlobal('fetch', mockFetch);

      // Bloated legacy caller passing full order with huge base64 images and credentials
      const bloatedOrder: any = {
        id: 'ord-1002',
        orderNumber: 'ORD-1002',
        items: [
          { product: { id: 'p1', title: 'T-Shirt', images: ['data:image/png;base64,' + 'A'.repeat(50000)] } },
        ],
        dbblDetails: { depositSlipUrl: 'data:image/jpeg;base64,' + 'B'.repeat(50000) },
      };

      const legacyParcelData = {
        weight: 2.0,
        note: 'Fragile handling',
        apiKey: 'leaked-client-api-key',
        secretKey: 'leaked-client-secret',
      };

      const legacyCourierConfig = {
        code: 'steadfast',
        apiKey: 'courier-tab-key',
      };

      await orderApi.dispatchCourier(bloatedOrder, legacyParcelData, legacyCourierConfig);

      expect(interceptedBody.orderId).toBe('ord-1002');
      expect(interceptedBody.courierProvider).toBe('steadfast');
      expect(interceptedBody.parcelOverrides.weight).toBe(2.0);
      expect(interceptedBody.parcelOverrides.notes).toBe('Fragile handling');

      // Crucial security & payload checks:
      expect(interceptedBody.order).toBeUndefined();
      expect(interceptedBody.apiKey).toBeUndefined();
      expect(interceptedBody.secretKey).toBeUndefined();
      expect(interceptedBody.dbblDetails).toBeUndefined();
      expect(JSON.stringify(interceptedBody).length).toBeLessThan(500);
    });
  });

  describe('Phase 2 & 3: Server-Authoritative D1 Resolution & Body Size Limits (413/400)', () => {
    it('rejects oversized request body with HTTP 413 Payload Too Large', async () => {
      // 20 KB payload (exceeds 16 KB BODY_LIMIT_COURIER_DISPATCH)
      const oversizedPayload = JSON.stringify({
        orderId: 'ord-1001',
        courierProvider: 'steadfast',
        bloat: 'X'.repeat(20 * 1024),
      });

      const request = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validAdminToken}`,
          'Content-Length': String(oversizedPayload.length),
        },
        body: oversizedPayload,
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(413);
      const data = await response.json();
      expect(data.error).toContain('Payload too large');
    });

    it('rejects malformed JSON body with HTTP 400 Bad Request', async () => {
      const malformedPayload = '{"orderId": "ord-1001", broken json...';

      const request = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validAdminToken}`,
          'Content-Length': String(malformedPayload.length),
        },
        body: malformedPayload,
      });

      const response = await handleApiRequest(request, mockEnv);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('enforces RBAC and rejects unauthorized users without courier dispatch permission (403)', async () => {
      const validPayload = JSON.stringify({
        orderId: 'ord-1001',
        courierProvider: 'steadfast',
      });

      const request = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${restrictedStaffToken}`,
          'Content-Length': String(validPayload.length),
        },
        body: validPayload,
      });

      const response = await handleApiRequest(request, mockEnv);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain('Forbidden');
    });

    it('returns 404 when orderId does not exist in D1 database', async () => {
      const payload = JSON.stringify({
        orderId: 'nonexistent-order-999',
        courierProvider: 'steadfast',
      });

      const request = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validAdminToken}`,
        },
        body: payload,
      });

      const response = await handleApiRequest(request, mockEnv);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('not found in database');
    });

    it('prevents duplicate dispatch / double booking (409 Conflict)', async () => {
      // Modify order in D1 to simulate existing consignment
      const row = mockDb._orders.get('ord-1001');
      mockDb._orders.set('ord-1001', {
        ...row,
        consignment_id: 'EXISTING-CID-999',
        courier_waybill: 'TRK-999',
      });

      const payload = JSON.stringify({
        orderId: 'ord-1001',
        courierProvider: 'steadfast',
      });

      const request = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validAdminToken}`,
        },
        body: payload,
      });

      const response = await handleApiRequest(request, mockEnv);

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toContain('Duplicate dispatch prevented');
      expect(data.error).toContain('EXISTING-CID-999');
    });

    it('calculates server-authoritative net COD amount subtracting advance payments', async () => {
      // Order: Subtotal 3600 + Delivery Fee 100 = Total 3700. Advance Payment = 1000.
      // Net COD must be exactly 3700 - 1000 = 2700.
      let capturedUpstreamBody: any = null;

      const mockFetch = vi.fn().mockImplementation((url: string, opts: any) => {
        if (url.includes('create_order')) {
          capturedUpstreamBody = JSON.parse(opts.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              status: 200,
              consignment: {
                consignment_id: 'SF-1001-NEW',
                tracking_code: 'TRK-SF-1001',
              },
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      vi.stubGlobal('fetch', mockFetch);

      const payload = JSON.stringify({
        orderId: 'ord-1001',
        courierProvider: 'steadfast',
      });

      const request = new Request('https://rongdhonutrade.com/api/courier/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${validAdminToken}`,
        },
        body: payload,
      });

      const response = await handleApiRequest(request, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.cod_amount).toBe(2700);
      expect(data.advancePayment).toBe(1000);
      expect(data.totalAmount).toBe(3700);
      expect(capturedUpstreamBody.cod_amount).toBe(2700);
    });
  });

  describe('Phase 4: Provider Mapping Parity (Steadfast, Pathao, RedX)', () => {
    it('maps authoritative order state to exact Steadfast schema', async () => {
      let upstreamPayload: any = null;
      let upstreamHeaders: any = null;

      const mockFetch = vi.fn().mockImplementation((url: string, opts: any) => {
        upstreamPayload = JSON.parse(opts.body);
        upstreamHeaders = opts.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 200,
            consignment: {
              consignment_id: 888777,
              tracking_code: 'TRK-SF-888',
            },
          }),
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const order: Order = {
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        customer: {
          fullName: 'Rahim Khan',
          phone: '01812345678',
          fullAddress: 'Road 1, Dhanmondi',
          district: 'Dhaka',
        },
        items: [{ product: { id: 'p1', title: 'Watch' } as any, quantity: 1 }],
        subtotal: 1500,
        totalAmount: 1500,
        advancePayment: 500,
      } as any;

      const res = await dispatchSteadfastAdapter(
        order,
        1000,
        { weight: 0.8, notes: 'Call on arrival', deliveryType: '0' },
        mockEnv
      );

      expect(res.ok).toBe(true);
      expect(res.consignmentId).toBe('888777');
      expect(res.trackingCode).toBe('TRK-SF-888');
      expect(upstreamPayload.invoice).toBe('ORD-1001');
      expect(upstreamPayload.recipient_name).toBe('Rahim Khan');
      expect(upstreamPayload.recipient_phone).toBe('01812345678');
      expect(upstreamPayload.cod_amount).toBe(1000);
      expect(upstreamPayload.weight).toBe(0.8);
      expect(upstreamHeaders['Api-Key']).toBe('test-sf-key');
      expect(upstreamHeaders['Secret-Key']).toBe('test-sf-secret');
    });

    it('maps authoritative order state to exact Pathao Merchant schema', async () => {
      let upstreamPayload: any = null;
      let upstreamHeaders: any = null;

      const mockFetch = vi.fn().mockImplementation((url: string, opts: any) => {
        upstreamPayload = JSON.parse(opts.body);
        upstreamHeaders = opts.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            type: 'success',
            code: 200,
            data: {
              consignment_id: 'PT-999888',
              order_status: 'Pending',
            },
          }),
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const order: Order = {
        id: 'ord-2',
        orderNumber: 'ORD-2002',
        customer: {
          fullName: 'Sultana Begum',
          phone: '01912345678',
          fullAddress: 'Mirpur 10, Dhaka',
          district: 'Dhaka',
        },
        items: [{ product: { id: 'p2', title: 'Silk Saree' } as any, quantity: 1 }],
        subtotal: 4500,
        totalAmount: 4500,
        advancePayment: 0,
      } as any;

      const res = await dispatchPathaoAdapter(
        order,
        4500,
        { weight: 1.5, notes: 'Handle with care', deliveryType: 'express' },
        mockEnv
      );

      expect(res.ok).toBe(true);
      expect(res.consignmentId).toBe('PT-999888');
      expect(upstreamPayload.merchant_order_id).toBe('ORD-2002');
      expect(upstreamPayload.recipient_name).toBe('Sultana Begum');
      expect(upstreamPayload.recipient_phone).toBe('01912345678');
      expect(upstreamPayload.amount_to_collect).toBe(4500);
      expect(upstreamPayload.delivery_type).toBe(12); // express -> 12
      expect(upstreamPayload.item_type).toBe(2);
      expect(upstreamPayload.item_weight).toBe(1.5);
      expect(upstreamHeaders['Authorization']).toBe('Bearer test-pathao-token');
    });

    it('maps authoritative order state to exact RedX Logistics schema', async () => {
      let upstreamPayload: any = null;
      let upstreamHeaders: any = null;

      const mockFetch = vi.fn().mockImplementation((url: string, opts: any) => {
        upstreamPayload = JSON.parse(opts.body);
        upstreamHeaders = opts.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            tracking_id: 'REDX-333222',
            message: 'Parcel created',
          }),
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const order: Order = {
        id: 'ord-3',
        orderNumber: 'ORD-3003',
        customer: {
          fullName: 'Kamal Hasan',
          phone: '01612345678',
          fullAddress: 'Banani, Block B',
          district: 'Dhaka',
        },
        items: [{ product: { id: 'p3', title: 'Running Shoes' } as any, quantity: 1 }],
        subtotal: 2800,
        totalAmount: 2800,
        advancePayment: 800,
      } as any;

      const res = await dispatchRedxAdapter(
        order,
        2000,
        { weight: 1.0, notes: 'Deliver in afternoon' },
        mockEnv
      );

      expect(res.ok).toBe(true);
      expect(res.consignmentId).toBe('REDX-333222');
      expect(res.trackingCode).toBe('REDX-333222');
      expect(upstreamPayload.merchant_invoice_id).toBe('ORD-3003');
      expect(upstreamPayload.customer_name).toBe('Kamal Hasan');
      expect(upstreamPayload.customer_phone).toBe('01612345678');
      expect(upstreamPayload.cash_collection_amount).toBe(2000);
      expect(upstreamPayload.parcel_weight).toBe(1000); // 1.0 kg -> 1000 grams
      expect(upstreamHeaders['API-ACCESS-TOKEN']).toBe('Bearer test-redx-token');
    });

    it('gracefully handles upstream 401/403/500 failures without leaking secrets', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          message: 'Unauthorized: Secret key is invalid. api_key=test-sf-key',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const order: Order = {
        id: 'ord-fail',
        orderNumber: 'ORD-FAIL',
        customer: { fullName: 'Test', phone: '01700000000', fullAddress: 'Dhaka' },
        items: [],
      } as any;

      const res = await dispatchSteadfastAdapter(order, 500, undefined, mockEnv);

      expect(res.ok).toBe(false);
      expect(res.status).toBe(401);
      // Secrets must never be leaked
      expect(res.error).not.toContain('test-sf-key');
    });
  });
});
