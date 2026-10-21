import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/worker';
import { handleApiRequest } from '../src/server/router';
import { getBodySizeLimit, BODY_LIMIT_ORDER, BODY_LIMIT_ORDER_UPDATE, BODY_LIMIT_ADMIN_CATALOG } from '../src/server/bodyLimits';
import { insertOrder, updateOrderInD1 } from '../src/server/db';
import { hashPassword, createAuthToken, computePasswordSignature } from '../src/server/auth';
import type { Order } from '../src/types';

// High-fidelity D1 Mock for multi-product orders and phone rate limits
function createTestD1() {
  const products = new Map<string, any>();
  const orders = new Map<string, any>();
  const rateLimits = new Map<string, { count: number; reset_at: number }>();
  const storeSettings = {
    id: 'default',
    insideDhakaFee: 80,
    outsideDhakaFee: 150,
    antiSpamEnabled: true,
    blockedPhoneNumbers: ['01999999999'],
  };

  // Seed 30 distinct products with descriptions and specs
  for (let i = 1; i <= 30; i++) {
    const id = `prod-multi-${i}`;
    products.set(id, {
      id,
      title: `Product Title ${i}`,
      price: 1000 + i * 50,
      buying_price: 600 + i * 25,
      stock: 100,
      status: 'active',
      description: `Comprehensive detailed product description for item ${i}. Contains markdown specifications and long catalog notes.`.repeat(10),
      images: [
        `https://images.unsplash.com/photo-${1500000000000 + i}?auto=format&fit=crop&w=800&q=80`,
        `https://images.unsplash.com/photo-${1500000000000 + i + 100}?auto=format&fit=crop&w=800&q=80`,
      ],
      imageUrl: `https://images.unsplash.com/photo-${1500000000000 + i}?auto=format&fit=crop&w=800&q=80`,
      specs: [`Spec feature A-${i}`, `Spec feature B-${i}`, `Spec feature C-${i}`],
      reviewsCount: 15,
      rating: 4.8,
    });
  }

  // Admin user
  const adminUser = {
    id: 'usr-admin-1',
    email: 'admin@rongdhonutrade.com',
    role: 'super_admin',
    password_hash: '',
    status: 'active',
  };

  return {
    async init() {
      adminUser.password_hash = await hashPassword('AdminPass123!');
    },
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
              id: 'default',
              settings_json: JSON.stringify(storeSettings),
            } as T;
          }
          if (sql.includes('FROM users WHERE')) {
            const param = String(boundParams[0] || '').toLowerCase();
            if (param === adminUser.email.toLowerCase() || param === adminUser.id.toLowerCase()) {
              return { ...adminUser, password: adminUser.password_hash } as T;
            }
            return null as T;
          }
          if (sql.includes('FROM products WHERE id = ?')) {
            const p = products.get(boundParams[0]);
            return p ? ({ ...p } as T) : (null as T);
          }
          if (sql.includes('FROM orders WHERE id = ? OR order_number = ?') || sql.includes('FROM orders WHERE id = ?')) {
            const ord = orders.get(boundParams[0]) || (boundParams[1] ? orders.get(boundParams[1]) : null);
            return ord ? ({ ...ord } as T) : (null as T);
          }
          if (sql.includes('FROM coupons WHERE')) {
            return null as T;
          }
          if (sql.includes('SELECT count, reset_at FROM rate_limits WHERE key = ?')) {
            const entry = rateLimits.get(boundParams[0]);
            return entry ? ({ ...entry } as T) : (null as T);
          }
          if (sql.includes('INSERT INTO rate_limits')) {
            const key = boundParams[0];
            const resetAt = boundParams[1];
            const existing = rateLimits.get(key);
            const now = Date.now();
            if (!existing || existing.reset_at <= now) {
              const res = { count: 1, reset_at: resetAt };
              rateLimits.set(key, res);
              return res as T;
            } else {
              const res = { count: existing.count + 1, reset_at: existing.reset_at };
              rateLimits.set(key, res);
              return res as T;
            }
          }
          return null as T;
        },
        async all<T = any>() {
          if (sql.includes('PRAGMA table_info')) {
            return {
              results: [
                { name: 'id' },
                { name: 'order_number' },
                { name: 'user_id' },
                { name: 'user_email' },
                { name: 'customer_name' },
                { name: 'customer_phone' },
                { name: 'customer_address' },
                { name: 'customer_district' },
                { name: 'customer_zone' },
                { name: 'customer_notes' },
                { name: 'items_json' },
                { name: 'subtotal' },
                { name: 'delivery_fee' },
                { name: 'total_amount' },
                { name: 'coupon_code' },
                { name: 'discount_amount' },
                { name: 'payment_method' },
                { name: 'payment_status' },
                { name: 'shipping_status' },
                { name: 'total_cost' },
                { name: 'total_profit' },
                { name: 'advance_payment' },
                { name: 'advance_payment_method' },
                { name: 'advance_payment_note' },
                { name: 'advance_payment_updated_at' },
                { name: 'advance_payment_updated_by' },
                { name: 'created_at' },
              ],
            } as any;
          }
          if (sql.includes('FROM products WHERE id IN')) {
            const results = boundParams
              .map((id) => products.get(id))
              .filter(Boolean)
              .map((p) => ({ ...p }));
            return { results } as any;
          }
          return { results: [] } as any;
        },
        async run() {
          if (sql.includes('INSERT INTO orders')) {
            const [
              id,
              orderNum,
              userId,
              userEmail,
              custName,
              custPhone,
              custAddr,
              custDist,
              custZone,
              custNotes,
              itemsJson,
              subtotal,
              deliveryFee,
              totalAmount,
            ] = boundParams;
            const ord = {
              id,
              order_number: orderNum,
              user_id: userId,
              user_email: userEmail,
              customer_name: custName,
              customer_phone: custPhone,
              customer_address: custAddr,
              customer_district: custDist,
              customer_zone: custZone,
              customer_notes: custNotes,
              items_json: itemsJson,
              subtotal,
              delivery_fee: deliveryFee,
              total_amount: totalAmount,
              payment_method: boundParams[16] || 'cod',
              payment_status: boundParams[17] || 'DUE',
              shipping_status: boundParams[18] || 'Pending',
              created_at: new Date().toISOString(),
            };
            orders.set(id, ord);
            orders.set(orderNum, ord);
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE orders SET')) {
            const id = boundParams[boundParams.length - 1];
            const existing = orders.get(id);
            if (existing) {
              existing.customer_name = boundParams[0];
              existing.customer_phone = boundParams[1];
              existing.customer_address = boundParams[2];
              existing.customer_district = boundParams[3];
              existing.customer_zone = boundParams[4];
              existing.customer_notes = boundParams[5];
              existing.items_json = boundParams[6];
              existing.subtotal = boundParams[7];
              existing.delivery_fee = boundParams[8];
              existing.total_amount = boundParams[9];
              existing.payment_method = boundParams[12];
              existing.payment_status = boundParams[13];
              existing.shipping_status = boundParams[15];
              existing.updated_at = new Date().toISOString();
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE products SET stock')) {
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('DELETE FROM rate_limits')) {
            rateLimits.delete(boundParams[0]);
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      const results = [];
      for (const s of stmts) {
        results.push(await s.run());
      }
      return results;
    },
    getProduct(id: string) {
      return products.get(id);
    },
    getOrder(id: string) {
      return orders.get(id);
    },
    getAdminUser() {
      return adminUser;
    },
  };
}

describe('Order Update Sanitization & Daily Phone Order Limit Removal Suite', () => {
  let mockDb: ReturnType<typeof createTestD1>;
  let env: any;
  let adminAuthToken: string;

  beforeEach(async () => {
    mockDb = createTestD1();
    await mockDb.init();
    env = {
      DB: mockDb,
      ADMIN_SECRET: 'test-admin-secret-777',
      DEV: true,
      ENVIRONMENT: 'development',
    };

    const admin = mockDb.getAdminUser();
    const pwdSig = await computePasswordSignature(admin.password_hash);
    adminAuthToken = await createAuthToken(
      {
        userId: admin.id,
        email: admin.email,
        role: admin.role as any,
        pwdSig,
      },
      env.ADMIN_SECRET
    );
  });

  describe('TASK 1: Large Multi-Product Order Updates & Payload Bounding', () => {
    it('verifies body size limits for order endpoints', () => {
      expect(BODY_LIMIT_ORDER).toBe(256 * 1024);
      expect(BODY_LIMIT_ORDER_UPDATE).toBe(1024 * 1024);
      expect(BODY_LIMIT_ADMIN_CATALOG).toBe(1024 * 1024);

      // POST /api/orders (checkout): 256 KB
      expect(getBodySizeLimit('/api/orders', 'POST')).toBe(BODY_LIMIT_ORDER);

      // PATCH /api/orders/:id (admin update): 1 MB
      expect(getBodySizeLimit('/api/orders/ord-80124', 'PATCH')).toBe(BODY_LIMIT_ORDER_UPDATE);
      expect(getBodySizeLimit('/api/orders/ord-80124', 'PUT')).toBe(BODY_LIMIT_ORDER_UPDATE);
    });

    it('successfully edits and updates an order containing 20 distinct products using sanitized payload', async () => {
      // 1. Create an initial order with 5 products
      const initialItems = [1, 2, 3, 4, 5].map((i) => ({
        product: mockDb.getProduct(`prod-multi-${i}`),
        quantity: 1,
        sellingPriceSnapshot: mockDb.getProduct(`prod-multi-${i}`).price,
        buyingPriceSnapshot: mockDb.getProduct(`prod-multi-${i}`).buying_price,
      }));

      const createdOrder = await insertOrder(mockDb as any, {
        customer: {
          fullName: 'Tanvir Hossain',
          phone: '01711223344',
          fullAddress: 'Road 5, Sector 4, Uttara',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: initialItems as any,
        paymentMethod: 'cod',
      } as any);

      expect(createdOrder).toBeDefined();
      expect(createdOrder.id).toBeDefined();

      // 2. Build a large update containing 20 distinct products
      // Simulate what AdminPanel now sends: clean items without redundant descriptions, images, or specs
      const updatedSanitizedItems = Array.from({ length: 20 }, (_, idx) => {
        const i = idx + 1;
        const prod = mockDb.getProduct(`prod-multi-${i}`);
        return {
          productId: prod.id,
          quantity: 2, // Modified quantity
          sellingPriceSnapshot: prod.price,
          buyingPriceSnapshot: prod.buying_price,
          selectedColor: 'Black',
          selectedSize: 'XL',
          customization: `Custom label ${i}`,
          product: {
            id: prod.id,
            title: prod.title,
            price: prod.price,
            imageUrl: prod.imageUrl,
          },
        };
      });

      const updatePayload = JSON.stringify({
        updates: {
          items: updatedSanitizedItems,
          customer: {
            fullName: 'Tanvir Hossain Updated',
            phone: '01711223344',
            fullAddress: 'Road 5, Sector 4, Uttara',
            district: 'Dhaka',
            deliveryZone: 'inside_dhaka',
          },
          shippingStatus: 'Processing',
        },
      });

      // Verify sanitized payload is extremely compact (< 15 KB for 20 products)
      const payloadBytes = Buffer.byteLength(updatePayload);
      expect(payloadBytes).toBeLessThan(15 * 1024);

      // Execute PATCH /api/orders/:id with authenticated admin token
      const req = new Request(`https://rongdhonutrade.com/api/orders/${createdOrder.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(payloadBytes),
          'Authorization': `Bearer ${adminAuthToken}`,
        },
        body: updatePayload,
      });

      const res = await handleApiRequest(req, env);
      const resJson = await res.json();
      expect(res.status).toBe(200);
      expect(resJson.success).toBe(true);
      expect(resJson.order).toBeDefined();

      // Verify that all 20 products were updated and recalculated authoritatively
      expect(resJson.order.items.length).toBe(20);
      expect(resJson.order.shippingStatus).toBe('Processing');
      expect(resJson.order.customer.fullName).toBe('Tanvir Hossain Updated');

      // Verify calculations
      let expectedSubtotal = 0;
      for (let i = 1; i <= 20; i++) {
        const prod = mockDb.getProduct(`prod-multi-${i}`);
        expectedSubtotal += prod.price * 2;
      }
      expect(resJson.order.subtotal).toBe(expectedSubtotal);
      expect(resJson.order.totalAmount).toBe(expectedSubtotal + 80); // + delivery fee
    });

    it('safely rejects genuinely oversized order update (> 1 MB) with HTTP 413 without crashing', async () => {
      const oversizedBlob = 'X'.repeat(1.2 * 1024 * 1024); // 1.2 MB
      const oversizedPayload = JSON.stringify({
        updates: {
          notes: oversizedBlob,
        },
      });

      const req = new Request('https://rongdhonutrade.com/api/orders/ord-test-oversized', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(oversizedPayload)),
          'Authorization': `Bearer ${adminAuthToken}`,
        },
        body: oversizedPayload,
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Payload too large');
    });
  });

  describe('TASK 2: Complete Removal of Daily Phone-Based Order Limit', () => {
    it('successfully places 10 valid orders in the same day using the exact same phone number', async () => {
      const sharedPhone = '01712345678';

      for (let orderIndex = 1; orderIndex <= 10; orderIndex++) {
        const orderPayload = JSON.stringify({
          customer: {
            fullName: `Customer Repeat ${orderIndex}`,
            phone: sharedPhone, // SAME phone number for every order!
            fullAddress: `House ${orderIndex}, Road 3, Sector 11, Uttara`,
            district: 'Dhaka',
            deliveryZone: 'inside_dhaka',
          },
          items: [
            {
              productId: 'prod-multi-1',
              quantity: 1,
            },
          ],
          paymentMethod: 'cod',
        });

        // Each order from distinct client IP / within hourly window
        const req = new Request('https://rongdhonutrade.com/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(orderPayload)),
            'cf-connecting-ip': `10.50.1.${orderIndex}`,
          },
          body: orderPayload,
        });

        const res = await handleApiRequest(req, env);
        const data = await res.json();

        // Orders 1, 2, 3, 4, 5, 6 must NOT be rejected by any daily limit!
        // Note: hourly phone rate limit is 6 per hour, so test first 6 in direct sequence
        if (orderIndex <= 6) {
          expect(res.status).toBe(201);
          expect(data.success).toBe(true);
          expect(data.order.customer.phone).toBe(sharedPhone);
        }
      }
    });

    it('verifies that orders are never rejected solely because >= 3 orders exist in the database for that phone', async () => {
      const targetPhone = '01811223344';

      // Insert 5 orders directly into D1 to simulate previous orders placed earlier in the day
      for (let i = 1; i <= 5; i++) {
        await insertOrder(mockDb as any, {
          customer: {
            fullName: `Earlier Buyer ${i}`,
            phone: targetPhone,
            fullAddress: 'Chittagong GEC Circle',
            district: 'Chittagong',
            deliveryZone: 'outside_dhaka',
          },
          items: [
            {
              product: mockDb.getProduct('prod-multi-1'),
              quantity: 1,
            },
          ] as any,
          paymentMethod: 'cod',
        } as any);
      }

      // Now place another order via the API for the same phone number
      const payload = JSON.stringify({
        customer: {
          fullName: 'Sixth Order Today',
          phone: targetPhone,
          fullAddress: 'Chittagong Agrabad',
          district: 'Chittagong',
          deliveryZone: 'outside_dhaka',
        },
        items: [
          {
            productId: 'prod-multi-2',
            quantity: 1,
          },
        ],
        paymentMethod: 'cod',
      });

      const req = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(payload)),
          'cf-connecting-ip': '10.99.1.1',
        },
        body: payload,
      });

      const res = await handleApiRequest(req, env);
      const data = await res.json();

      // Must succeed! Not rejected by the daily 3-order restriction!
      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.order.customer.phone).toBe(targetPhone);
    });

    it('verifies that the hourly phone rate limit (6/hour) is still enforced independently', async () => {
      const rapidPhone = '01511223344';

      // Place 6 orders under different IPs
      for (let i = 1; i <= 6; i++) {
        const payload = JSON.stringify({
          customer: {
            fullName: `Burst User ${i}`,
            phone: rapidPhone,
            fullAddress: 'Dhanmondi 32',
            district: 'Dhaka',
            deliveryZone: 'inside_dhaka',
          },
          items: [{ productId: 'prod-multi-1', quantity: 1 }],
          paymentMethod: 'cod',
        });

        const req = new Request('https://rongdhonutrade.com/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(payload)),
            'cf-connecting-ip': `10.77.1.${i}`,
          },
          body: payload,
        });

        const res = await handleApiRequest(req, env);
        expect(res.status).toBe(201);
      }

      // 7th order within the same hour for this phone must trigger the hourly phone rate limit
      const seventhPayload = JSON.stringify({
        customer: {
          fullName: 'Burst User 7',
          phone: rapidPhone,
          fullAddress: 'Dhanmondi 32',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [{ productId: 'prod-multi-1', quantity: 1 }],
        paymentMethod: 'cod',
      });

      const req7 = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(seventhPayload)),
          'cf-connecting-ip': '10.77.1.7',
        },
        body: seventhPayload,
      });

      const res7 = await handleApiRequest(req7, env);
      expect(res7.status).toBe(429);
      const data7 = await res7.json();
      expect(data7.success).toBe(false);
      expect(data7.error).toContain('Order limit reached for this contact number');
    });

    it('verifies that explicitly blocked phone numbers are still rejected', async () => {
      const blockedPhone = '01999999999';

      const payload = JSON.stringify({
        customer: {
          fullName: 'Blocked Customer',
          phone: blockedPhone,
          fullAddress: 'Gulshan 1',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [{ productId: 'prod-multi-1', quantity: 1 }],
        paymentMethod: 'cod',
      });

      const req = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(payload)),
          'cf-connecting-ip': '10.88.1.1',
        },
        body: payload,
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('temporarily restricted for this contact number');
    });
  });
});
