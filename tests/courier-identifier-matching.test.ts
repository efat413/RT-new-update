import { describe, it, expect, vi } from 'vitest';
import { findOrderByCourierIdentifier } from '../src/server/db';
import { handleApiRequest } from '../src/server/router';
import { computeHmacSha256Hex } from '../src/server/webhookAuth';
import type { OrderRow } from '../src/server/types';

function createMockOrderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: overrides.id || 'ord-' + Math.random().toString(36).slice(2, 9),
    order_number: overrides.order_number || 'RT-2026-0001',
    user_id: null,
    user_email: null,
    customer_name: 'Test Customer',
    customer_phone: '01712345678',
    customer_address: 'Dhaka, Bangladesh',
    customer_district: 'Dhaka',
    customer_zone: 'inside_dhaka',
    customer_notes: null,
    items_json: JSON.stringify([{ id: 'prod-1', title: 'Product 1', price: 100, quantity: 1 }]),
    subtotal: 100,
    delivery_fee: 60,
    total_amount: 160,
    coupon_code: null,
    discount_amount: 0,
    payment_method: 'COD',
    payment_status: 'Pending',
    transaction_id: null,
    shipping_status: 'Processing',
    courier_name: 'Steadfast',
    courier_waybill: overrides.courier_waybill !== undefined ? overrides.courier_waybill : null,
    consignment_id: overrides.consignment_id !== undefined ? overrides.consignment_id : null,
    courier_status: overrides.courier_status || 'in_review',
    courier_booking_json: null,
    dbbl_details_json: null,
    card_details_json: null,
    last_courier_sync: null,
    total_cost: null,
    total_profit: null,
    advance_payment: 0,
    advance_payment_method: null,
    advance_payment_note: null,
    advance_payment_updated_at: null,
    advance_payment_updated_by: null,
    created_at: '2026-10-10T00:00:00.000Z',
    updated_at: '2026-10-10T00:00:00.000Z',
  };
}

class InMemoryD1Database {
  public rows: OrderRow[] = [];
  public mutations: { query: string; bindings: any[] }[] = [];

  constructor(initialRows: OrderRow[] = []) {
    this.rows = [...initialRows];
  }

  prepare(query: string) {
    const self = this;
    let boundArgs: any[] = [];

    const stmt = {
      bind(...args: any[]) {
        boundArgs = args;
        return stmt;
      },
      async all<T = any>() {
        const qUpper = query.trim().toUpperCase();

        if (qUpper.startsWith('SELECT COLUMN_NAME') || qUpper.startsWith('PRAGMA TABLE_INFO')) {
          return {
            results: [
              { name: 'id' },
              { name: 'order_number' },
              { name: 'consignment_id' },
              { name: 'courier_waybill' },
              { name: 'shipping_status' },
              { name: 'courier_status' },
              { name: 'payment_status' },
            ] as unknown as T[],
          };
        }

        if (qUpper.startsWith('SELECT * FROM ORDERS')) {
          let matched: OrderRow[] = [];

          if (qUpper.includes('WHERE ID = ? OR ORDER_NUMBER = ? OR ORDER_NUMBER = ?')) {
            const [arg1, arg2, arg3] = boundArgs;
            matched = self.rows.filter(
              (r) => r.id === arg1 || r.order_number === arg2 || r.order_number === arg3
            );
          } else if (qUpper.includes('WHERE CONSIGNMENT_ID = ?')) {
            const [arg1] = boundArgs;
            matched = self.rows.filter((r) => r.consignment_id === arg1);
          } else if (qUpper.includes('WHERE COURIER_WAYBILL = ?')) {
            const [arg1] = boundArgs;
            matched = self.rows.filter((r) => r.courier_waybill === arg1);
          } else if (qUpper.includes('WHERE ID = ? OR ORDER_NUMBER = ?')) {
            const [arg1, arg2] = boundArgs;
            matched = self.rows.filter((r) => r.id === arg1 || r.order_number === arg2);
          } else {
            matched = [...self.rows];
          }

          if (qUpper.includes('LIMIT 2')) {
            matched = matched.slice(0, 2);
          } else if (qUpper.includes('LIMIT 1')) {
            matched = matched.slice(0, 1);
          }

          return { results: matched as unknown as T[] };
        }

        return { results: [] as T[] };
      },
      async first<T = any>() {
        const res = await stmt.all<T>();
        return res.results && res.results.length > 0 ? res.results[0] : null;
      },
      async run() {
        self.mutations.push({ query, bindings: boundArgs });
        const qUpper = query.trim().toUpperCase();

        if (qUpper.startsWith('INSERT INTO WEBHOOK_REPLAYS')) {
          return { success: true, meta: { changes: 1, rows_written: 1 } };
        }

        if (qUpper.startsWith('DELETE FROM WEBHOOK_REPLAYS')) {
          return { success: true, meta: { changes: 0 } };
        }

        if (qUpper.startsWith('UPDATE ORDERS SET')) {
          // Track updates
          const id = boundArgs[boundArgs.length - 1];
          const row = self.rows.find((r) => r.id === id);
          if (row) {
            row.updated_at = new Date().toISOString();
          }
          return { success: true, meta: { changes: 1 } };
        }

        return { success: true, meta: { changes: 1 } };
      },
    };

    return stmt;
  }
}

describe('Courier Identifier Matching & Ambiguity Hardening', () => {
  describe('1. Exact Equality vs Substring False-Matching (123 vs 1234 vs X123Y)', () => {
    it('accurately matches exact ID "123" and never cross-matches "1234" or "X123Y"', async () => {
      const orderA = createMockOrderRow({
        id: 'ord-123',
        order_number: 'RT-001',
        consignment_id: '123',
        courier_waybill: 'WB-123',
      });
      const orderB = createMockOrderRow({
        id: 'ord-1234',
        order_number: 'RT-002',
        consignment_id: '1234',
        courier_waybill: 'WB-1234',
      });
      const orderC = createMockOrderRow({
        id: 'ord-X123Y',
        order_number: 'RT-003',
        consignment_id: 'X123Y',
        courier_waybill: 'WB-X123Y',
      });

      const db = new InMemoryD1Database([orderA, orderB, orderC]) as any;

      // Querying "123" must match ONLY orderA
      const res123 = await findOrderByCourierIdentifier(db, { consignmentId: '123' });
      expect(res123.status).toBe('found');
      expect(res123.order?.id).toBe('ord-123');

      // Querying "1234" must match ONLY orderB
      const res1234 = await findOrderByCourierIdentifier(db, { consignmentId: '1234' });
      expect(res1234.status).toBe('found');
      expect(res1234.order?.id).toBe('ord-1234');

      // Querying "X123Y" must match ONLY orderC
      const resX123Y = await findOrderByCourierIdentifier(db, { consignmentId: 'X123Y' });
      expect(resX123Y.status).toBe('found');
      expect(resX123Y.order?.id).toBe('ord-X123Y');
    });

    it('returns not_found when querying "123" if only "1234" and "X123Y" exist (no wildcard leakage)', async () => {
      // Legacy LIKE '%123%' implementation falsely matched 1234 or X123Y!
      const orderB = createMockOrderRow({
        id: 'ord-1234',
        order_number: 'RT-002',
        consignment_id: '1234',
        courier_waybill: 'WB-1234',
      });
      const orderC = createMockOrderRow({
        id: 'ord-X123Y',
        order_number: 'RT-003',
        consignment_id: 'X123Y',
        courier_waybill: 'WB-X123Y',
      });

      const db = new InMemoryD1Database([orderB, orderC]) as any;

      const result = await findOrderByCourierIdentifier(db, { consignmentId: '123' });
      expect(result.status).toBe('not_found');
      expect(result.order).toBeNull();
    });

    it('never cross-matches courier waybill codes with substring overlap', async () => {
      const orderB = createMockOrderRow({
        id: 'ord-b',
        order_number: 'RT-B',
        courier_waybill: 'SF1234',
      });
      const orderC = createMockOrderRow({
        id: 'ord-c',
        order_number: 'RT-C',
        courier_waybill: 'XSF123Y',
      });

      const db = new InMemoryD1Database([orderB, orderC]) as any;

      // Searching for '123' or 'SF123' must return not_found, never SF1234 or XSF123Y
      const res1 = await findOrderByCourierIdentifier(db, { trackingCode: '123' });
      expect(res1.status).toBe('not_found');

      const res2 = await findOrderByCourierIdentifier(db, { trackingCode: 'SF123' });
      expect(res2.status).toBe('not_found');

      const resExact = await findOrderByCourierIdentifier(db, { trackingCode: 'SF1234' });
      expect(resExact.status).toBe('found');
      expect(resExact.order?.id).toBe('ord-b');
    });
  });

  describe('2. Deterministic Precedence: Invoice > Consignment ID > Tracking Code', () => {
    it('prioritizes Invoice/Order Number over conflicting Consignment ID', async () => {
      const orderA = createMockOrderRow({
        id: 'ord-a',
        order_number: 'INV-1001',
        consignment_id: 'CID-AAA',
      });
      const orderB = createMockOrderRow({
        id: 'ord-b',
        order_number: 'INV-2002',
        consignment_id: 'CID-BBB',
      });

      const db = new InMemoryD1Database([orderA, orderB]) as any;

      // Webhook payload provides invoice for orderA, but consignmentId for orderB
      const result = await findOrderByCourierIdentifier(db, {
        invoice: 'INV-1001',
        consignmentId: 'CID-BBB',
      });

      // Tier 1 (Invoice) MUST take precedence and return orderA
      expect(result.status).toBe('found');
      expect(result.order?.id).toBe('ord-a');
      expect(result.order?.orderNumber).toBe('INV-1001');
    });

    it('falls back to Consignment ID if Invoice is not found, prioritizing it over Tracking Code', async () => {
      const orderB = createMockOrderRow({
        id: 'ord-b',
        order_number: 'INV-2002',
        consignment_id: 'CID-222',
        courier_waybill: 'WB-222',
      });
      const orderC = createMockOrderRow({
        id: 'ord-c',
        order_number: 'INV-3003',
        consignment_id: 'CID-333',
        courier_waybill: 'WB-333',
      });

      const db = new InMemoryD1Database([orderB, orderC]) as any;

      // Invoice is unknown, but consignmentId matches orderB, and trackingCode matches orderC
      const result = await findOrderByCourierIdentifier(db, {
        invoice: 'NON_EXISTENT_INV',
        consignmentId: 'CID-222',
        trackingCode: 'WB-333',
      });

      // Tier 2 (Consignment ID) must take precedence over Tier 3 (Tracking Code)
      expect(result.status).toBe('found');
      expect(result.order?.id).toBe('ord-b');
    });

    it('falls back to Tracking Code when both Invoice and Consignment ID are unknown or absent', async () => {
      const orderC = createMockOrderRow({
        id: 'ord-c',
        order_number: 'INV-3003',
        courier_waybill: 'WB-999',
      });

      const db = new InMemoryD1Database([orderC]) as any;

      const result = await findOrderByCourierIdentifier(db, {
        invoice: 'UNKNOWN',
        consignmentId: 'UNKNOWN_CID',
        trackingCode: 'WB-999',
      });

      expect(result.status).toBe('found');
      expect(result.order?.id).toBe('ord-c');
    });
  });

  describe('3. Explicit Ambiguity Abort & Legacy Duplicate Collision Prevention', () => {
    it('returns status="ambiguous" when multiple orders share the same consignment_id', async () => {
      const duplicate1 = createMockOrderRow({
        id: 'ord-dup-1',
        order_number: 'RT-101',
        consignment_id: 'SF-COLLISION-99',
      });
      const duplicate2 = createMockOrderRow({
        id: 'ord-dup-2',
        order_number: 'RT-102',
        consignment_id: 'SF-COLLISION-99',
      });

      const db = new InMemoryD1Database([duplicate1, duplicate2]) as any;

      const result = await findOrderByCourierIdentifier(db, {
        consignmentId: 'SF-COLLISION-99',
      });

      expect(result.status).toBe('ambiguous');
      expect(result.order).toBeNull();
      if (result.status === 'ambiguous') {
        expect(result.matchedBy).toBe('consignment_id');
        expect(result.count).toBe(2);
        expect(result.identifier).toBe('SF-COLLISION-99');
        expect(result.error).toContain('Ambiguous order match');
      }
    });

    it('returns status="ambiguous" when multiple records match an invoice identifier', async () => {
      const duplicate1 = createMockOrderRow({
        id: 'ORD-SAME-ID',
        order_number: 'RT-001',
      });
      const duplicate2 = createMockOrderRow({
        id: 'ORD-OTHER',
        order_number: 'ORD-SAME-ID',
      });

      const db = new InMemoryD1Database([duplicate1, duplicate2]) as any;

      const result = await findOrderByCourierIdentifier(db, {
        invoice: 'ORD-SAME-ID',
      });

      expect(result.status).toBe('ambiguous');
      expect(result.order).toBeNull();
      if (result.status === 'ambiguous') {
        expect(result.matchedBy).toBe('invoice');
        expect(result.count).toBe(2);
      }
    });

    it('returns status="ambiguous" when multiple orders share the same tracking waybill code', async () => {
      const duplicate1 = createMockOrderRow({
        id: 'ord-w1',
        order_number: 'RT-W1',
        courier_waybill: 'WAYBILL-CONFLICT-77',
      });
      const duplicate2 = createMockOrderRow({
        id: 'ord-w2',
        order_number: 'RT-W2',
        courier_waybill: 'WAYBILL-CONFLICT-77',
      });

      const db = new InMemoryD1Database([duplicate1, duplicate2]) as any;

      const result = await findOrderByCourierIdentifier(db, {
        trackingCode: 'WAYBILL-CONFLICT-77',
      });

      expect(result.status).toBe('ambiguous');
      expect(result.order).toBeNull();
      if (result.status === 'ambiguous') {
        expect(result.matchedBy).toBe('courier_waybill');
        expect(result.count).toBe(2);
      }
    });
  });

  describe('4. Input Normalization & Unknown Identifiers', () => {
    it('normalizes invoice by trimming and stripping leading "#" without losing ID content', async () => {
      const order = createMockOrderRow({
        id: 'ord-hash',
        order_number: 'RT-2026-999',
      });

      const db = new InMemoryD1Database([order]) as any;

      const result = await findOrderByCourierIdentifier(db, {
        invoice: '  #RT-2026-999  ',
      });

      expect(result.status).toBe('found');
      expect(result.order?.id).toBe('ord-hash');
    });

    it('normalizes numeric consignment IDs cleanly to string', async () => {
      const order = createMockOrderRow({
        id: 'ord-num',
        consignment_id: '987654321',
      });

      const db = new InMemoryD1Database([order]) as any;

      const result = await findOrderByCourierIdentifier(db, {
        consignmentId: 987654321,
      });

      expect(result.status).toBe('found');
      expect(result.order?.id).toBe('ord-num');
    });

    it('returns not_found when all identifiers are empty strings or missing', async () => {
      const db = new InMemoryD1Database([]) as any;

      const resEmpty = await findOrderByCourierIdentifier(db, {});
      expect(resEmpty.status).toBe('not_found');

      const resBlank = await findOrderByCourierIdentifier(db, {
        invoice: '   ',
        consignmentId: '',
        trackingCode: undefined,
      });
      expect(resBlank.status).toBe('not_found');
    });
  });

  describe('5. Webhook Caller Integration: Guarantee No State Mutation on Ambiguous or Not-Found', () => {
    const webhookSecret = 'test-courier-webhook-secret-xyz';

    async function makeWebhookRequest(payload: any) {
      const rawBody = JSON.stringify(payload);
      const timestamp = Date.now().toString();
      const sig = await computeHmacSha256Hex(webhookSecret, `${timestamp}.${rawBody}`);

      return new Request('https://rongdhonutrade.com/api/webhook/steadfast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': webhookSecret,
          'X-Webhook-Timestamp': timestamp,
          'X-Webhook-Signature': `sha256=${sig}`,
        },
        body: rawBody,
      });
    }

    it('aborts with 409 Conflict and ZERO mutations when webhook encounters ambiguous orders', async () => {
      const dup1 = createMockOrderRow({
        id: 'ord-m1',
        order_number: 'RT-M1',
        consignment_id: 'CID-AMBIGUOUS',
        courier_status: 'in_review',
      });
      const dup2 = createMockOrderRow({
        id: 'ord-m2',
        order_number: 'RT-M2',
        consignment_id: 'CID-AMBIGUOUS',
        courier_status: 'in_review',
      });

      const db = new InMemoryD1Database([dup1, dup2]);
      const mockEnv = {
        DB: db as any,
        COURIER_WEBHOOK_SECRET: webhookSecret,
      };

      const req = await makeWebhookRequest({
        consignment_id: 'CID-AMBIGUOUS',
        status: 'delivered',
      });

      const res = await handleApiRequest(req, mockEnv);
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.status).toBe('ambiguous');
      expect(json.error).toContain('Ambiguous order match');

      // VERIFY ZERO STATE MUTATIONS
      const updateMutations = db.mutations.filter((m) => m.query.toUpperCase().includes('UPDATE ORDERS'));
      expect(updateMutations.length).toBe(0);
      expect(dup1.courier_status).toBe('in_review');
      expect(dup2.courier_status).toBe('in_review');
    });

    it('returns 200 acknowledgment with ZERO mutations when webhook encounters unknown order', async () => {
      const existing = createMockOrderRow({
        id: 'ord-existing',
        order_number: 'RT-EX',
        consignment_id: '1234',
        courier_status: 'in_review',
      });

      const db = new InMemoryD1Database([existing]);
      const mockEnv = {
        DB: db as any,
        COURIER_WEBHOOK_SECRET: webhookSecret,
      };

      // Querying '123' must NOT match '1234'
      const req = await makeWebhookRequest({
        consignment_id: '123',
        status: 'delivered',
      });

      const res = await handleApiRequest(req, mockEnv);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain('No matching order found');

      // ZERO state mutations on the existing order
      const updateMutations = db.mutations.filter((m) => m.query.toUpperCase().includes('UPDATE ORDERS'));
      expect(updateMutations.length).toBe(0);
      expect(existing.courier_status).toBe('in_review');
    });

    it('mutates ONLY the uniquely matched order upon verified webhook delivery update', async () => {
      const targetOrder = createMockOrderRow({
        id: 'ord-target',
        order_number: 'RT-TARGET',
        consignment_id: 'SF-MATCH-99',
        courier_status: 'in_review',
        shipping_status: 'Processing',
      });

      const db = new InMemoryD1Database([targetOrder]);
      const mockEnv = {
        DB: db as any,
        COURIER_WEBHOOK_SECRET: webhookSecret,
      };

      const req = await makeWebhookRequest({
        consignment_id: 'SF-MATCH-99',
        status: 'delivered',
      });

      const res = await handleApiRequest(req, mockEnv);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.orderId).toBe('ord-target');
      expect(json.courierStatus).toBe('Delivered');

      // VERIFY MUTATION OCCURRED ON TARGET ORDER
      const updateMutations = db.mutations.filter((m) => m.query.toUpperCase().includes('UPDATE ORDERS'));
      expect(updateMutations.length).toBe(1);
    });
  });
});
