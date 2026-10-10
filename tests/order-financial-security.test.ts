import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleApiRequest } from '../src/server/router';
import { createAuthToken } from '../src/server/auth';
import type { OrderRow, UserRow } from '../src/server/types';

const TEST_SECRET = 'super-secret-test-key-for-jwt-signing-0123456789';

class MockD1ForFinancialSecurity {
  public users: Map<string, UserRow> = new Map();
  public products: Map<string, any> = new Map();
  public orders: Map<string, any> = new Map();
  public auditLogs: any[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.users.clear();
    this.products.clear();
    this.orders.clear();
    this.auditLogs = [];

    // 1. Super Admin User
    this.users.set('superadmin@test.local', {
      id: 'usr-superadmin',
      name: 'Super Admin',
      email: 'superadmin@test.local',
      role: 'super_admin',
      permissions_json: JSON.stringify({}),
      password: null,
      phone: '01700000000',
      address: 'Dhaka',
      district: 'Dhaka',
      delivery_zone: 'inside_dhaka',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 2. Regular Order Editor (order.manage only, NO pricing/discount/delivery fee permissions)
    this.users.set('editor@test.local', {
      id: 'usr-editor',
      name: 'Order Editor',
      email: 'editor@test.local',
      role: 'admin',
      permissions_json: JSON.stringify({
        'order.view': true,
        'order.manage': true,
        'order.status_change': true,
        'product.view': true,
        'product.manage_buying_price': false,
        'coupon.manage': false,
        'courier.configure': false,
        'settings.manage': false,
        'report.profit': false,
        'product.view_buying_price': false,
        'product.view_profit': false,
      }),
      password: null,
      phone: '01711111111',
      address: 'Dhaka',
      district: 'Dhaka',
      delivery_zone: 'inside_dhaka',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 3. Pricing Manager (order.manage + product.manage_buying_price / settings.manage)
    this.users.set('pricingmgr@test.local', {
      id: 'usr-pricingmgr',
      name: 'Pricing Manager',
      email: 'pricingmgr@test.local',
      role: 'admin',
      permissions_json: JSON.stringify({
        'order.view': true,
        'order.manage': true,
        'product.manage_buying_price': true,
        'product.view_buying_price': true,
        'product.view_profit': true,
        'report.profit': true,
      }),
      password: null,
      phone: '01722222222',
      address: 'Dhaka',
      district: 'Dhaka',
      delivery_zone: 'inside_dhaka',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed products with authoritative prices and wholesale costs
    this.products.set('prod-phone', {
      id: 'prod-phone',
      title: 'Smart Phone X',
      price: 15000,
      buying_price: 11000,
      stock: 50,
      status: 'active',
      category_id: 'cat-tech',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    this.products.set('prod-case', {
      id: 'prod-case',
      title: 'Protective Phone Case',
      price: 500,
      buying_price: 150,
      stock: 100,
      status: 'active',
      category_id: 'cat-acc',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed existing order
    this.orders.set('ord-100', {
      id: 'ord-100',
      order_number: 'RT-2026-0100',
      user_id: null,
      user_email: null,
      customer_name: 'Customer A',
      customer_phone: '01799999999',
      customer_address: 'Banani, Dhaka',
      customer_district: 'Dhaka',
      customer_zone: 'inside_dhaka',
      customer_notes: null,
      items_json: JSON.stringify([
        {
          id: 'prod-phone',
          title: 'Smart Phone X',
          price: 15000,
          quantity: 1,
          sellingPriceSnapshot: 15000,
          buyingPriceSnapshot: 11000,
          productCost: 11000,
          productGrossProfit: 4000,
          product: { id: 'prod-phone', title: 'Smart Phone X', price: 15000 },
        },
      ]),
      subtotal: 15000,
      delivery_fee: 100,
      total_amount: 15100,
      coupon_code: null,
      discount_amount: 0,
      payment_method: 'COD',
      payment_status: 'Pending',
      transaction_id: null,
      shipping_status: 'Processing',
      total_cost: 11000,
      total_profit: 4000,
      advance_payment: 1000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  prepare(query: string) {
    const self = this;
    const q = query.trim();
    let boundArgs: any[] = [];

    const stmt = {
      bind: (...args: any[]) => {
        boundArgs = args;
        return stmt;
      },
      first: async <T = any>() => {
        if (q.includes('FROM users WHERE') && q.includes('LOWER(TRIM(email)) = ? OR id = ?')) {
          const emailOrId = String(boundArgs[0] || '').toLowerCase();
          const user = Array.from(self.users.values()).find(
            (u) => u.email.toLowerCase() === emailOrId || u.id === boundArgs[1]
          );
          return user ? ({ ...user } as T) : null;
        }

        if (q.includes('FROM orders WHERE id = ?') || q.includes('FROM orders WHERE id = ? OR order_number = ?')) {
          const id = boundArgs[0];
          const ord = self.orders.get(id);
          return ord ? ({ ...ord } as T) : null;
        }

        if (q.includes('FROM products WHERE id = ?')) {
          const p = self.products.get(boundArgs[0]);
          return p ? ({ ...p } as T) : null;
        }

        if (q.includes('SELECT name FROM sqlite_master')) {
          return { name: 'orders' } as T;
        }

        return null as T;
      },
      all: async <T = any>() => {
        if (q.includes('PRAGMA table_info')) {
          return {
            results: [
              { name: 'id' },
              { name: 'order_number' },
              { name: 'items_json' },
              { name: 'subtotal' },
              { name: 'delivery_fee' },
              { name: 'total_amount' },
              { name: 'discount_amount' },
              { name: 'total_cost' },
              { name: 'total_profit' },
              { name: 'advance_payment' },
              { name: 'shipping_status' },
              { name: 'payment_status' },
            ],
          } as any;
        }

        if (q.includes('FROM products WHERE id IN')) {
          const results = boundArgs
            .map((id) => self.products.get(id))
            .filter(Boolean)
            .map((p) => ({ ...p }));
          return { results } as any;
        }

        return { results: [] } as any;
      },
      run: async () => {
        const qUpper = q.toUpperCase();
        if (qUpper.startsWith('INSERT INTO AUDIT_LOGS')) {
          self.auditLogs.push({ query: q, bindings: boundArgs });
          return { success: true, meta: { changes: 1 } };
        }

        if (qUpper.startsWith('UPDATE ORDERS SET')) {
          const id = boundArgs[boundArgs.length - 1];
          const ord = self.orders.get(id);
          if (ord) {
            ord.customer_name = boundArgs[0];
            ord.customer_phone = boundArgs[1];
            ord.customer_address = boundArgs[2];
            ord.customer_district = boundArgs[3];
            ord.customer_zone = boundArgs[4];
            ord.customer_notes = boundArgs[5];
            ord.items_json = boundArgs[6];
            ord.subtotal = boundArgs[7];
            ord.delivery_fee = boundArgs[8];
            ord.total_amount = boundArgs[9];
            ord.coupon_code = boundArgs[10];
            ord.discount_amount = boundArgs[11];
            ord.payment_method = boundArgs[12];
            ord.payment_status = boundArgs[13];
            ord.transaction_id = boundArgs[14];
            ord.shipping_status = boundArgs[15];
            ord.total_cost = boundArgs[24];
            ord.total_profit = boundArgs[25];
            ord.advance_payment = boundArgs[26];
          }
          return { success: true, meta: { changes: 1 } };
        }

        return { success: true, meta: { changes: 1 } };
      },
    };

    return stmt;
  }

  async batch(stmts: any[]) {
    const res = [];
    for (const s of stmts) {
      res.push(await s.run());
    }
    return res;
  }
}

function createEnv(db: MockD1ForFinancialSecurity) {
  return {
    DB: db as any,
    ADMIN_SECRET: TEST_SECRET,
    JWT_SECRET: TEST_SECRET,
    DEV: true,
  };
}

async function makeToken(email: string, role: string, userId: string) {
  return createAuthToken(
    { email, role, userId, authTime: Math.floor(Date.now() / 1000) },
    TEST_SECRET,
    3600
  );
}

describe('Order Financial Integrity & Anti-Tampering Security Tests', () => {
  let db: MockD1ForFinancialSecurity;
  let env: any;

  beforeEach(() => {
    db = new MockD1ForFinancialSecurity();
    env = createEnv(db);
  });

  describe('1. Trusted Data Derivation (Buying Cost & Catalog Price)', () => {
    it('always derives base buying cost from persisted D1 database and ignores client forged buying costs', async () => {
      const editorToken = await makeToken('editor@test.local', 'admin', 'usr-editor');
      const req = new Request('http://localhost:3000/api/orders/ord-100', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${editorToken}`,
        },
        body: JSON.stringify({
          updates: {
            items: [
              {
                productId: 'prod-phone',
                quantity: 2,
                // Client attempts to tamper buyingPriceSnapshot to 1 BDT to fabricate massive fake profits
                buyingPriceSnapshot: 1,
                buyingPrice: 1,
                cost: 1,
              },
            ],
          },
        }),
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(200);

      // Verify the persisted order in DB:
      // Authoritative wholesale cost must be derived from prod-phone D1 buying_price (11000 * 2 = 22000)
      const savedOrd = db.orders.get('ord-100');
      expect(savedOrd.total_cost).toBe(22000); // NOT 2 BDT!
      expect(savedOrd.subtotal).toBe(30000); // 15000 * 2
      expect(savedOrd.total_profit).toBe(8000); // 30000 - 22000

      const parsedItems = JSON.parse(savedOrd.items_json);
      expect(parsedItems[0].buyingPriceSnapshot).toBe(11000);
      expect(parsedItems[0].productCost).toBe(22000);
      expect(parsedItems[0].productGrossProfit).toBe(8000);
    });

    it('defaults selling price to persisted D1 product catalog price when not overridden', async () => {
      const editorToken = await makeToken('editor@test.local', 'admin', 'usr-editor');
      const req = new Request('http://localhost:3000/api/orders/ord-100', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${editorToken}`,
        },
        body: JSON.stringify({
          updates: {
            items: [
              {
                productId: 'prod-case',
                quantity: 3,
                // Client does not supply price
              },
            ],
          },
        }),
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(200);

      const savedOrd = db.orders.get('ord-100');
      expect(savedOrd.subtotal).toBe(1500); // 500 * 3
      expect(savedOrd.total_cost).toBe(450); // 150 * 3
      expect(savedOrd.total_profit).toBe(1050); // 1500 - 450
    });
  });

  describe('2. RBAC & Explicit Pricing Overrides', () => {
    it('strictly forbids ordinary order editor from altering unit selling price', async () => {
      const editorToken = await makeToken('editor@test.local', 'admin', 'usr-editor');
      const req = new Request('http://localhost:3000/api/orders/ord-100', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${editorToken}`,
        },
        body: JSON.stringify({
          updates: {
            items: [
              {
                productId: 'prod-phone',
                quantity: 1,
                // Attempt to discount phone price to 5,000 without MANAGE_PRICING
                sellingPriceSnapshot: 5000,
              },
            ],
          },
        }),
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('PRICE_OVERRIDE_FORBIDDEN');
    });

    it('allows authorized Pricing Manager to override unit selling price and writes audit log', async () => {
      const pricingToken = await makeToken('pricingmgr@test.local', 'admin', 'usr-pricingmgr');
      const req = new Request('http://localhost:3000/api/orders/ord-100', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pricingToken}`,
        },
        body: JSON.stringify({
          updates: {
            pricingOverrideReason: 'VIP Special customer discount',
            items: [
              {
                productId: 'prod-phone',
                quantity: 1,
                sellingPriceSnapshot: 14500, // Authorized price adjustment
              },
            ],
          },
        }),
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(200);

      const savedOrd = db.orders.get('ord-100');
      expect(savedOrd.subtotal).toBe(14500);
      expect(savedOrd.total_cost).toBe(11000);
      expect(savedOrd.total_profit).toBe(3500); // 14500 - 11000

      // Verify audit log captured
      const auditLog = db.auditLogs.find((l) => l.query.includes('ORDER_PRICING_OVERRIDE') || l.bindings.includes('ORDER_PRICING_OVERRIDE'));
      expect(auditLog).toBeDefined();
    });

    it('forbids ordinary order editor from adjusting discountAmount', async () => {
      const editorToken = await makeToken('editor@test.local', 'admin', 'usr-editor');
      const req = new Request('http://localhost:3000/api/orders/ord-100', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${editorToken}`,
        },
        body: JSON.stringify({
          updates: {
            discountAmount: 1000,
          },
        }),
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('DISCOUNT_OVERRIDE_FORBIDDEN');
    });

    it('forbids ordinary order editor from adjusting deliveryFee', async () => {
      const editorToken = await makeToken('editor@test.local', 'admin', 'usr-editor');
      const req = new Request('http://localhost:3000/api/orders/ord-100', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${editorToken}`,
        },
        body: JSON.stringify({
          updates: {
            deliveryFee: 0,
          },
        }),
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('DELIVERY_FEE_OVERRIDE_FORBIDDEN');
    });
  });

  describe('3. Monetary Validation & Math Edge Cases', () => {
    it('rejects negative, NaN, or non-finite unit price values', async () => {
      const superToken = await makeToken('superadmin@test.local', 'super_admin', 'usr-superadmin');
      const invalidPrices = [-100, NaN, 'invalid-price', Infinity];

      for (const badPrice of invalidPrices) {
        const req = new Request('http://localhost:3000/api/orders/ord-100', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${superToken}`,
          },
          body: JSON.stringify({
            updates: {
              items: [
                {
                  productId: 'prod-phone',
                  quantity: 1,
                  sellingPriceSnapshot: badPrice,
                },
              ],
            },
          }),
        });

        const res = await handleApiRequest(req, env);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/Invalid item price/);
      }
    });

    it('rejects negative discountAmount or deliveryFee', async () => {
      const superToken = await makeToken('superadmin@test.local', 'super_admin', 'usr-superadmin');

      const req1 = new Request('http://localhost:3000/api/orders/ord-100', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superToken}`,
        },
        body: JSON.stringify({
          updates: {
            discountAmount: -50,
          },
        }),
      });
      const res1 = await handleApiRequest(req1, env);
      expect(res1.status).toBe(400);

      const req2 = new Request('http://localhost:3000/api/orders/ord-100', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superToken}`,
        },
        body: JSON.stringify({
          updates: {
            deliveryFee: -20,
          },
        }),
      });
      const res2 = await handleApiRequest(req2, env);
      expect(res2.status).toBe(400);
    });

    it('atomically recalculates subtotal, delivery fee, discount, total, advance paid, and due balance', async () => {
      const superToken = await makeToken('superadmin@test.local', 'super_admin', 'usr-superadmin');
      const req = new Request('http://localhost:3000/api/orders/ord-100', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superToken}`,
        },
        body: JSON.stringify({
          updates: {
            items: [
              { productId: 'prod-phone', quantity: 1, sellingPriceSnapshot: 14000 },
              { productId: 'prod-case', quantity: 2, sellingPriceSnapshot: 400 },
            ],
            deliveryFee: 120,
            discountAmount: 500,
            advancePayment: 2000,
          },
        }),
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(200);

      // Subtotal = 14000 + (400 * 2) = 14800
      // Delivery = 120
      // Discount = 500
      // Total = 14800 + 120 - 500 = 14420
      // Advance = 2000
      // Due = 14420 - 2000 = 12420
      // Buying cost = 11000 + (150 * 2) = 11300
      // Profit = 14800 - 11300 = 3500
      const saved = db.orders.get('ord-100');
      expect(saved.subtotal).toBe(14800);
      expect(saved.delivery_fee).toBe(120);
      expect(saved.discount_amount).toBe(500);
      expect(saved.total_amount).toBe(14420);
      expect(saved.advance_payment).toBe(2000);
      expect(saved.total_cost).toBe(11300);
      expect(saved.total_profit).toBe(3500);
    });
  });

  describe('4. Data Privacy: Financial Metrics Sanitization', () => {
    it('strips sensitive wholesale cost, profit, and margins from response for users lacking financial visibility', async () => {
      const editorToken = await makeToken('editor@test.local', 'admin', 'usr-editor');
      const req = new Request('http://localhost:3000/api/orders/ord-100', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${editorToken}`,
        },
        body: JSON.stringify({
          updates: {
            customerNotes: 'Deliver between 2 PM and 4 PM',
          },
        }),
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const returnedOrder = data.order;
      // Sensitive profit & cost fields MUST be stripped:
      expect(returnedOrder.totalCost).toBeUndefined();
      expect(returnedOrder.totalGrossProfit).toBeUndefined();
      expect(returnedOrder.netProfit).toBeUndefined();
      expect(returnedOrder.totalProfit).toBeUndefined();

      // Item level buying price & costs stripped
      for (const it of returnedOrder.items) {
        expect(it.buyingPriceSnapshot).toBeUndefined();
        expect(it.productCost).toBeUndefined();
        expect(it.productGrossProfit).toBeUndefined();
        if (it.product) {
          expect(it.product.buyingPrice).toBeUndefined();
        }
      }
    });

    it('includes financial metrics in response for super_admin or users with financial visibility', async () => {
      const superToken = await makeToken('superadmin@test.local', 'super_admin', 'usr-superadmin');
      const req = new Request('http://localhost:3000/api/orders/ord-100', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superToken}`,
        },
        body: JSON.stringify({
          updates: {
            customerNotes: 'Urgent delivery',
          },
        }),
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const returnedOrder = data.order;
      expect(returnedOrder.totalCost).toBe(11000);
      expect(returnedOrder.totalGrossProfit).toBe(4000);

      const firstItem = returnedOrder.items[0];
      expect(firstItem.buyingPriceSnapshot).toBe(11000);
      expect(firstItem.productCost).toBe(11000);
      expect(firstItem.productGrossProfit).toBe(4000);
    });
  });
});
