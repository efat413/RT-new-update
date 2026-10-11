import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/worker';
import { handleApiRequest } from '../src/server/router';
import { getBodySizeLimit, BODY_LIMIT_ORDER } from '../src/server/bodyLimits';

// Helper to construct a mock Cloudflare D1 database for order testing
function createMockD1ForOrderTests(): any {
  const products = new Map<string, any>([
    [
      'prod-watch-1',
      {
        id: 'prod-watch-1',
        title: 'Minimalist Premium Watch',
        price: 3200,
        buying_price: 1800,
        stock: 25,
        status: 'active',
      },
    ],
    [
      'prod-headphone-1',
      {
        id: 'prod-headphone-1',
        title: 'Wireless Studio Headphones',
        price: 4500,
        buying_price: 2700,
        stock: 10,
        status: 'active',
      },
    ],
  ]);

  const orders = new Map<string, any>();
  const idempotencyMap = new Map<string, any>();
  const mediaAssets = new Map<string, any>();

  return {
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
                antiSpamEnabled: false,
              }),
            } as T;
          }
          if (sql.includes('FROM products WHERE id = ?')) {
            const prod = products.get(boundParams[0]);
            return prod ? ({ ...prod } as T) : (null as T);
          }
          if (sql.includes('FROM coupons WHERE UPPER(code) = ?')) {
            if (boundParams[0] === 'SAVE500') {
              return {
                code: 'SAVE500',
                discount_type: 'fixed',
                discount_value: 500,
                min_spend: 2000,
                is_active: 1,
              } as T;
            }
            return null as T;
          }
          if (sql.includes('SELECT response_json, created_at FROM order_idempotency WHERE key = ?')) {
            const entry = idempotencyMap.get(boundParams[0]);
            return entry ? ({ ...entry } as T) : (null as T);
          }
          if (sql.includes('FROM orders WHERE id = ? OR order_number = ?')) {
            const ord = orders.get(boundParams[0]) || orders.get(boundParams[1]);
            return ord ? ({ ...ord } as T) : (null as T);
          }
          if (sql.includes('FROM orders WHERE customer_phone LIKE ?')) {
            return { count: 0 } as T;
          }
          return null as T;
        },
        async all<T = any>() {
          if (sql.includes('FROM products WHERE id IN')) {
            const results = boundParams
              .map((id) => products.get(id))
              .filter(Boolean)
              .map((p) => ({ ...p }));
            return { results } as any;
          }
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
                { name: 'created_at' },
              ],
            } as any;
          }
          return { results: [] } as any;
        },
        async run() {
          if (sql.includes('INSERT INTO orders')) {
            const id = boundParams[0];
            const orderNum = boundParams[1];
            const itemsJson = boundParams[10];
            const subtotal = boundParams[11];
            const deliveryFee = boundParams[12];
            const totalAmount = boundParams[13];
            const dbblDetailsJson = boundParams[25];
            const ord = {
              id,
              order_number: orderNum,
              items_json: itemsJson,
              subtotal,
              delivery_fee: deliveryFee,
              total_amount: totalAmount,
              dbbl_details_json: dbblDetailsJson,
              created_at: new Date().toISOString(),
            };
            orders.set(id, ord);
            orders.set(orderNum, ord);
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO order_idempotency')) {
            idempotencyMap.set(boundParams[0], {
              response_json: boundParams[3],
              created_at: boundParams[4],
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE products SET stock')) {
            const qty = boundParams[0];
            const prodId = boundParams[2];
            const prod = products.get(prodId);
            if (prod) {
              if (prod.stock >= qty) {
                prod.stock -= qty;
                return { success: true, meta: { changes: 1 } };
              } else {
                return { success: false, error: 'Insufficient stock' };
              }
            }
          }
          if (sql.includes('INSERT OR REPLACE INTO media_assets')) {
            mediaAssets.set(boundParams[0], {
              id: boundParams[0],
              contentType: boundParams[1],
              data: boundParams[2],
            });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch(statements: any[]) {
      const results: any[] = [];
      for (const s of statements) {
        const res = await s.run();
        results.push(res);
      }
      return results;
    },
    getProduct(id: string) {
      return products.get(id);
    },
  };
}

describe('Order Payload Optimization, Dedicated Upload & 256 KB Bounded Limits Suite', () => {
  let mockD1: ReturnType<typeof createMockD1ForOrderTests>;
  let env: any;

  beforeEach(() => {
    mockD1 = createMockD1ForOrderTests();
    env = {
      DB: mockD1,
      DEV: true,
      ENVIRONMENT: 'development',
    };
  });

  describe('1. Bounded Route Limits & Synchronization', () => {
    it('synchronizes explicit 256 KB bounded limit for order checkout across worker and bodyLimits', () => {
      expect(BODY_LIMIT_ORDER).toBe(256 * 1024);
      expect(BODY_LIMIT_ORDER).toBe(262144);
      expect(getBodySizeLimit('/api/orders', 'POST')).toBe(BODY_LIMIT_ORDER);
      expect(getBodySizeLimit('/api/orders/recalculate', 'POST')).toBe(BODY_LIMIT_ORDER);
    });

    it('maintains strict isolation for auth and webhook endpoints without widening', () => {
      expect(getBodySizeLimit('/api/auth/login', 'POST')).toBe(64 * 1024);
      expect(getBodySizeLimit('/api/admin/login', 'POST')).toBe(64 * 1024);
      expect(getBodySizeLimit('/api/webhook', 'POST')).toBe(64 * 1024);
    });

    it('rejects oversized order request (> 256 KB) via worker pre-parse Content-Length guard with HTTP 413', async () => {
      const oversizedNotes = 'Z'.repeat(270 * 1024); // 270 KB payload exceeding 256 KB
      const payload = JSON.stringify({
        customer: { fullName: 'Tanvir Hossain', phone: '01711111111', fullAddress: 'Uttara, Dhaka', district: 'Dhaka', deliveryZone: 'inside_dhaka' },
        items: [{ productId: 'prod-watch-1', quantity: 1 }],
        notes: oversizedNotes,
      });

      const req = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(payload)),
        },
        body: payload,
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Payload too large');
    });

    it('rejects oversized order stream (> 256 KB) via handleApiRequest without worker OOM crash', async () => {
      const oversizedData = 'W'.repeat(280 * 1024); // 280 KB
      const payload = JSON.stringify({
        customer: { fullName: 'Tanvir Hossain', phone: '01711111111', fullAddress: 'Uttara, Dhaka', district: 'Dhaka', deliveryZone: 'inside_dhaka' },
        items: [{ productId: 'prod-watch-1', quantity: 1 }],
        customization: oversizedData,
      });

      const req = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(payload)),
        },
        body: payload,
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Payload too large');
    });
  });

  describe('2. Sanitized Frontend Payload Checkout (No Catalog Bloat)', () => {
    it('successfully processes checkout transmitting only productId, quantity, and customer choices', async () => {
      // Sanitized checkout body: ~400 bytes instead of 100+ KB
      const compactPayload = JSON.stringify({
        customer: {
          fullName: 'Rahim Chowdhury',
          phone: '01712345678',
          fullAddress: 'Road 4, Sector 11, Uttara',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [
          {
            productId: 'prod-watch-1',
            quantity: 2,
            selectedColor: 'Matte Black',
            selectedSize: '42mm',
          },
        ],
        paymentMethod: 'cod',
      });

      const req = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(compactPayload)),
          'cf-connecting-ip': '10.20.1.1',
        },
        body: compactPayload,
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.order).toBeDefined();

      // Verify that server retrieved catalog details from D1
      expect(data.order.items[0].product.title).toBe('Minimalist Premium Watch');
      // 3200 * 2 = 6400 + 80 delivery fee = 6480
      expect(data.order.subtotal).toBe(6400);
      expect(data.order.deliveryFee).toBe(80);
      expect(data.order.totalAmount).toBe(6480);
      // Stock deducted atomically in D1: 25 - 2 = 23
      expect(mockD1.getProduct('prod-watch-1').stock).toBe(23);
    });

    it('processes multi-item checkout with text customizations within explicit bound', async () => {
      const customizedPayload = JSON.stringify({
        customer: {
          fullName: 'Sadia Islam',
          phone: '01819283746',
          fullAddress: 'Mirpur DOHS, Road 2, House 10',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [
          {
            productId: 'prod-watch-1',
            quantity: 1,
            selectedColor: 'Silver',
            selectedSize: '38mm',
            customization: 'Engraving: For my beloved father on his 60th birthday',
          },
          {
            productId: 'prod-headphone-1',
            quantity: 1,
            selectedColor: 'Midnight Blue',
            customization: 'Gift wrapping with gold ribbon and birthday card',
          },
        ],
        notes: 'Please call before delivery to ensure someone is home.',
        paymentMethod: 'cod',
      });

      const req = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(customizedPayload)),
          'cf-connecting-ip': '10.20.1.2',
        },
        body: customizedPayload,
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      // Watch: 3200, Headphones: 4500 -> Subtotal: 7700 + 80 = 7780
      expect(data.order.subtotal).toBe(7700);
      expect(data.order.totalAmount).toBe(7780);
    });
  });

  describe('3. Decoupled Image Upload & Validated Media References', () => {
    it('allows guest/customer upload of payment deposit slip to /api/upload and returns media reference', async () => {
      // 1x1 valid PNG
      const VALID_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const uploadPayload = JSON.stringify({
        purpose: 'deposit_slip',
        dataUrl: `data:image/png;base64,${VALID_PNG_BASE64}`,
      });

      const uploadReq = new Request('https://rongdhonutrade.com/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(uploadPayload)),
          'cf-connecting-ip': '10.20.1.3',
        },
        body: uploadPayload,
      });

      const uploadRes = await handleApiRequest(uploadReq, env);
      const uploadData = await uploadRes.json();
      if (uploadRes.status !== 200) {
        console.error('UPLOAD ERROR:', uploadData);
      }
      expect(uploadRes.status).toBe(200);
      expect(uploadData.success).toBe(true);
      expect(uploadData.url).toMatch(/^\/api\/media\/[a-zA-Z0-9_\-.]+/);
      expect(uploadData.key).toBeDefined();

      // Now checkout using the validated media reference (tiny URL string)
      const orderPayload = JSON.stringify({
        customer: {
          fullName: 'Zubair Ahmed',
          phone: '01511223344',
          fullAddress: 'Dhanmondi 27',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [{ productId: 'prod-watch-1', quantity: 1 }],
        paymentMethod: 'dbbl',
        transactionId: 'NEXUS-987654321',
        dbblDetails: {
          senderBank: 'NexusPay App',
          senderAccountOrPhone: '01511223344',
          transactionId: 'NEXUS-987654321',
          depositSlipUrl: uploadData.url, // Validated media reference!
        },
      });

      const orderReq = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(orderPayload)),
          'cf-connecting-ip': '10.20.1.3',
        },
        body: orderPayload,
      });

      const orderRes = await handleApiRequest(orderReq, env);
      expect(orderRes.status).toBe(201);
      const orderData = await orderRes.json();
      expect(orderData.success).toBe(true);
      expect(orderData.order.dbblDetails.depositSlipUrl).toBe(uploadData.url);
    });

    it('rejects order with inline Base64 data URLs to prevent body bloat and force decoupled upload', async () => {
      const inlineBase64Slip = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

      const orderPayload = JSON.stringify({
        customer: {
          fullName: 'Malicious Slip Submitter',
          phone: '01700112233',
          fullAddress: 'Gulshan 2',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [{ productId: 'prod-watch-1', quantity: 1 }],
        paymentMethod: 'dbbl',
        transactionId: 'TRX-111111',
        dbblDetails: {
          senderBank: 'NexusPay App',
          senderAccountOrPhone: '01700112233',
          transactionId: 'TRX-111111',
          depositSlipUrl: inlineBase64Slip, // Forbidded inline Base64!
        },
      });

      const orderReq = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(orderPayload)),
          'cf-connecting-ip': '10.20.1.4',
        },
        body: orderPayload,
      });

      const orderRes = await handleApiRequest(orderReq, env);
      expect(orderRes.status).toBe(400);
      const orderData = await orderRes.json();
      expect(orderData.success).toBe(false);
      expect(orderData.error).toContain('Inline Base64 images are not permitted in order payloads');
    });
  });

  describe('4. Server-Authoritative Financial Derivation & Tamper Resistance', () => {
    it('completely ignores client-forged totalAmount, subtotal, and deliveryFee and derives from D1', async () => {
      // Client attempts to forge totalAmount to 1 BDT and subtotal to 1 BDT
      const tamperedPayload = JSON.stringify({
        customer: {
          fullName: 'Attacker Customer',
          phone: '01799887766',
          fullAddress: 'Banani',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [
          {
            productId: 'prod-headphone-1',
            quantity: 1,
            // Client claims price is 10 BDT
            price: 10,
            sellingPriceSnapshot: 10,
            buyingPriceSnapshot: 1,
            productCost: 1,
            productGrossProfit: 9,
          },
        ],
        subtotal: 10, // Forged
        deliveryFee: 0, // Forged
        totalAmount: 10, // Forged!
        discountAmount: 1000, // Forged
        paymentMethod: 'cod',
      });

      const req = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(tamperedPayload)),
          'cf-connecting-ip': '10.20.1.5',
        },
        body: tamperedPayload,
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Server authoritative recalculation:
      // Product price is 4500 (D1), deliveryFee is 80 (inside Dhaka) -> totalAmount is 4580
      expect(data.order.subtotal).toBe(4500); // NOT 10!
      expect(data.order.deliveryFee).toBe(80); // NOT 0!
      expect(data.order.totalAmount).toBe(4580); // NOT 10!
      expect(data.order.discountAmount).toBe(0); // Forged discount discarded without valid coupon
    });

    it('strictly forces advancePayment = 0 for guest/customer order creation', async () => {
      // Unauthenticated customer attempts to claim advancePayment = 4000
      const payload = JSON.stringify({
        customer: {
          fullName: 'Sneaky Customer',
          phone: '01755443322',
          fullAddress: 'Chittagong',
          district: 'Chittagong',
          deliveryZone: 'outside_dhaka',
        },
        items: [{ productId: 'prod-watch-1', quantity: 1 }],
        advancePayment: 3000, // Client attempts to claim advance payment was made
        advance_payment: 3000,
        paymentMethod: 'cod',
      });

      const req = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(payload)),
          'cf-connecting-ip': '10.20.1.6',
        },
        body: payload,
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      // Must be stripped to 0
      expect(data.order.advancePayment).toBe(0);
    });
  });

  describe('5. Inventory Atomicity & Idempotency Enforcement', () => {
    it('executes atomic stock deduction and rejects order when quantity exceeds available stock', async () => {
      const stock = mockD1.getProduct('prod-headphone-1').stock; // 10

      const excessivePayload = JSON.stringify({
        customer: {
          fullName: 'Bulk Buyer',
          phone: '01611223344',
          fullAddress: 'Motijheel',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [{ productId: 'prod-headphone-1', quantity: stock + 5 }], // 15 > 10
        paymentMethod: 'cod',
      });

      const req = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(excessivePayload)),
          'cf-connecting-ip': '10.20.1.7',
        },
        body: excessivePayload,
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Insufficient stock');
      // Stock remains unchanged
      expect(mockD1.getProduct('prod-headphone-1').stock).toBe(10);
    });

    it('enforces idempotency key to prevent double order submissions and double stock deductions', async () => {
      const initialStock = mockD1.getProduct('prod-watch-1').stock;
      const idempotencyKey = 'idem-unique-key-99998888';

      const orderPayload = JSON.stringify({
        customer: {
          fullName: 'Idempotent Customer',
          phone: '01733445566',
          fullAddress: 'Bashundhara R/A',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [{ productId: 'prod-watch-1', quantity: 2 }],
        paymentMethod: 'cod',
      });

      // Request 1
      const req1 = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(orderPayload)),
          'Idempotency-Key': idempotencyKey,
          'cf-connecting-ip': '10.20.1.8',
        },
        body: orderPayload,
      });

      const res1 = await handleApiRequest(req1, env);
      expect(res1.status).toBe(201);
      const data1 = await res1.json();
      expect(data1.success).toBe(true);
      const orderNumber1 = data1.order.orderNumber;
      expect(mockD1.getProduct('prod-watch-1').stock).toBe(initialStock - 2);

      // Request 2 (Network retry with identical Idempotency-Key)
      const req2 = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(orderPayload)),
          'Idempotency-Key': idempotencyKey,
          'cf-connecting-ip': '10.20.1.8',
        },
        body: orderPayload,
      });

      const res2 = await handleApiRequest(req2, env);
      expect(res2.status).toBe(200); // 200 Cached Idempotent response
      const data2 = await res2.json();
      expect(data2.success).toBe(true);
      expect(data2.idempotent).toBe(true);
      expect(data2.order.orderNumber).toBe(orderNumber1);

      // Crucial: Stock must NOT have been deducted a second time!
      expect(mockD1.getProduct('prod-watch-1').stock).toBe(initialStock - 2);
    });
  });
});
