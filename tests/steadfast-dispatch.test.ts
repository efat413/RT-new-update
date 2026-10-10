import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateCourierApiDestination } from '../src/server/ssrf';
import { dispatchOrderToSteadfast } from '../src/server/courier';
import { updateOrderInD1 } from '../src/server/db';

describe('Steadfast Booking & Dispatch Regression Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. URL Destination Validator', () => {
    it('accepts canonical base URL and trailing slash', () => {
      const canonical = validateCourierApiDestination('https://portal.packzy.com/api/v1', { courierType: 'steadfast' });
      expect(canonical.valid).toBe(true);
      expect(canonical.normalizedUrl).toBe('https://portal.packzy.com/api/v1');

      const trailing = validateCourierApiDestination('https://portal.packzy.com/api/v1/', { courierType: 'steadfast' });
      expect(trailing.valid).toBe(true);
      expect(trailing.normalizedUrl).toBe('https://portal.packzy.com/api/v1');
    });

    it('accepts nested API paths without rejection', () => {
      const fullPath = validateCourierApiDestination('https://portal.packzy.com/api/v1/create_order', { courierType: 'steadfast' });
      expect(fullPath.valid).toBe(true);
      expect(fullPath.normalizedUrl).toBe('https://portal.packzy.com/api/v1');

      const relativePath = validateCourierApiDestination('/create_order', { courierType: 'steadfast' });
      expect(relativePath.valid).toBe(true);
      expect(relativePath.normalizedUrl).toBe('https://portal.packzy.com/api/v1');
    });

    it('blocks spoofed domains and localhost (SSRF protection)', () => {
      const spoofed = validateCourierApiDestination('https://portal.packzy.com.attacker.com', { courierType: 'steadfast' });
      expect(spoofed.valid).toBe(false);

      const localhost = validateCourierApiDestination('http://localhost:8080', { courierType: 'steadfast' });
      expect(localhost.valid).toBe(false);
    });
  });

  describe('2. Mocked Dispatch & D1 Consignment Mapping', () => {
    it('maps COD amount correctly and parses consignment_id response into D1', async () => {
      // Mock global fetch for Steadfast gateway
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 200,
          message: 'Order created successfully',
          consignment: {
            consignment_id: 123456,
            tracking_code: 'TRK-987654',
          },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      // Order with advance payment: Total 2000, Advance 500 -> COD = 1500 (Total - Advance)
      const totalAmount = 2000;
      const advancePayment = 500;
      const expectedCod = totalAmount - advancePayment;

      const payload = {
        invoice: 'ORD-1001',
        recipient_name: 'Test Customer',
        recipient_phone: '01712345678',
        recipient_address: 'Mirpur, Dhaka',
        cod_amount: expectedCod,
        delivery_type: 0,
      };

      const dispatchResult = await dispatchOrderToSteadfast(payload, {
        apiKey: 'test-api-key',
        secretKey: 'test-secret-key',
        baseUrl: 'https://portal.packzy.com/api/v1',
      });

      expect(dispatchResult.ok).toBe(true);
      expect(dispatchResult.data.consignment.consignment_id).toBe(123456);
      expect(dispatchResult.data.consignment.tracking_code).toBe('TRK-987654');

      // Verify COD was accurately dispatched in payload
      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentBody.cod_amount).toBe(1500);

      // In-memory mock database state for D1
      const initialRow: any = {
        id: 'order-1',
        order_number: 'ORD-1001',
        customer_json: JSON.stringify({ fullName: 'Test Customer', phone: '01712345678', fullAddress: 'Mirpur, Dhaka' }),
        items_json: JSON.stringify([]),
        total_amount: 2000,
        subtotal: 2000,
        delivery_fee: 0,
        discount_amount: 0,
        advance_payment: 500,
        customer_due: 1500,
        due_amount: 1500,
        payment_status: 'PARTIAL',
        shipping_status: 'Processing',
        created_at: new Date().toISOString(),
      };

      let storedRow: any = { ...initialRow };

      const mockDb: any = {
        prepare: (query: string) => {
          const stmt: any = {
            bind: (...args: any[]) => ({
              ...stmt,
              first: async () => storedRow,
              run: async () => {
                if (query.includes('UPDATE orders SET')) {
                  storedRow = {
                    ...storedRow,
                    consignment_id: String(dispatchResult.data.consignment.consignment_id),
                    courier_waybill: dispatchResult.data.consignment.tracking_code,
                    shipping_status: 'Shipped',
                  };
                }
                return { success: true };
              },
            }),
            all: async () => ({
              success: true,
              results: query.includes('table_info')
                ? [{ name: 'id' }, { name: 'consignment_id' }, { name: 'courier_waybill' }]
                : [],
            }),
            first: async () => storedRow,
            run: async () => ({ success: true }),
          };
          return stmt;
        },
      };

      // Persist consignment details to D1
      const consignmentId = String(dispatchResult.data.consignment.consignment_id);
      const trackingCode = dispatchResult.data.consignment.tracking_code;

      const updatedOrder = await updateOrderInD1(mockDb, 'order-1', {
        consignmentId,
        courierWaybill: trackingCode,
        courierStatus: 'In Transit',
        shippingStatus: 'Shipped',
      });

      expect(updatedOrder.consignmentId).toBe('123456');
      expect(updatedOrder.courierWaybill).toBe('TRK-987654');
      expect(updatedOrder.shippingStatus).toBe('Shipped');
      expect(storedRow.consignment_id).toBe('123456');
    });

    it('prevents duplicate booking if order already has an active consignment_id or non-terminal courier_status', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      // Order with existing consignment_id
      const resWithCid = await dispatchOrderToSteadfast(
        { invoice: 'ORD-1002' },
        { apiKey: 'key', secretKey: 'secret' },
        { order: { id: 'order-2', consignment_id: '999888', total_amount: 1000 } }
      );

      expect(resWithCid.ok).toBe(false);
      expect(resWithCid.status).toBe(409);
      expect(resWithCid.error).toContain('Duplicate booking prevented');
      expect(mockFetch).not.toHaveBeenCalled();

      // Order with active courier status
      const resWithActiveStatus = await dispatchOrderToSteadfast(
        { invoice: 'ORD-1003' },
        { apiKey: 'key', secretKey: 'secret' },
        { order: { id: 'order-3', courier_status: 'In Transit', total_amount: 1000 } }
      );

      expect(resWithActiveStatus.ok).toBe(false);
      expect(resWithActiveStatus.status).toBe(409);
      expect(resWithActiveStatus.error).toContain('Duplicate booking prevented');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('computes COD amount as Math.max(0, total_amount - advance_payment)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 200,
          consignment: { consignment_id: 111, tracking_code: 'TRK-111' },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const payload: any = { invoice: 'ORD-1004' };
      await dispatchOrderToSteadfast(
        payload,
        { apiKey: 'key', secretKey: 'secret' },
        { order: { id: 'order-4', total_amount: 3000, advance_payment: 1000 } }
      );

      expect(payload.cod_amount).toBe(2000);
      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentBody.cod_amount).toBe(2000);
    });
  });
});

