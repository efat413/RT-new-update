import { describe, it, expect } from 'vitest';
import { normalizeAndValidatePhone } from '../src/utils/phone';
import { handleApiRequest } from '../src/server/router';
import { hashPassword } from '../src/server/auth';

function createPhoneTestD1(blockedPhoneNumbers: string[] = ['01700000000']) {
  const orders = new Map<string, any>();
  const products = new Map<string, any>();
  const storeSettings = {
    id: 'default',
    insideDhakaFee: 80,
    outsideDhakaFee: 150,
    antiSpamEnabled: true,
    blockedPhoneNumbers,
  };

  products.set('prod-phone-1', {
    id: 'prod-phone-1',
    title: 'Test Phone Product',
    price: 1200,
    buying_price: 700,
    stock: 50,
    status: 'active',
  });

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
          if (sql.includes('FROM store_settings')) {
            return {
              id: 'default',
              settings_json: JSON.stringify(storeSettings),
            } as T;
          }
          if (sql.includes('FROM users WHERE')) {
            return { ...adminUser, password: adminUser.password_hash } as T;
          }
          if (sql.includes('FROM products WHERE id = ?')) {
            const p = products.get(boundParams[0]);
            return (p || null) as T;
          }
          if (sql.includes('FROM orders WHERE id = ?') || sql.includes('FROM orders WHERE id =')) {
            const ord = orders.get(boundParams[0]);
            return (ord || null) as T;
          }
          return null as T;
        },
        async all<T = any>() {
          if (sql.includes('FROM products WHERE id IN')) {
            return { results: Array.from(products.values()) } as { results: T[] };
          }
          return { results: [] } as { results: T[] };
        },
        async run() {
          if (sql.includes('INSERT INTO store_settings') || sql.includes('UPDATE store_settings')) {
            try {
              const parsed = JSON.parse(boundParams[1]);
              Object.assign(storeSettings, parsed);
            } catch {}
          }
          if (sql.includes('INSERT INTO orders')) {
            orders.set(boundParams[0], {
              id: boundParams[0],
              order_number: boundParams[1] || 'RT-TEST-001',
              customer_name: boundParams[2] || 'Customer',
              customer_phone: boundParams[3] || '01812345678',
              total_amount: boundParams[6] || 1280,
              payment_status: 'Pending',
              shipping_status: 'Processing',
              items_json: JSON.stringify([
                {
                  product: products.get('prod-phone-1'),
                  quantity: 1,
                  buyingPriceSnapshot: 700,
                  productCost: 700,
                  productGrossProfit: 500,
                },
              ]),
              created_at: new Date().toISOString(),
            });
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      const results = [];
      for (const stmt of stmts) {
        results.push(await stmt.run());
      }
      return results;
    },
  };
}

describe('Phone Blacklist Management & Enforcement Suite', () => {
  describe('1. Phone Number Normalization & Validation Logic', () => {
    it('normalizes standard 11-digit Bangladeshi mobile numbers', () => {
      const res = normalizeAndValidatePhone('01712345678');
      expect(res.isValid).toBe(true);
      expect(res.normalized).toBe('01712345678');
      expect(res.error).toBeUndefined();
    });

    it('strips +880 and 880 prefixes correctly', () => {
      const res1 = normalizeAndValidatePhone('+8801712345678');
      expect(res1.isValid).toBe(true);
      expect(res1.normalized).toBe('01712345678');

      const res2 = normalizeAndValidatePhone('8801812345678');
      expect(res2.isValid).toBe(true);
      expect(res2.normalized).toBe('01812345678');
    });

    it('strips punctuation, dashes, and whitespace', () => {
      const res = normalizeAndValidatePhone(' +880 1912-345 678 ');
      expect(res.isValid).toBe(true);
      expect(res.normalized).toBe('01912345678');
    });

    it('rejects invalid or unsupported operator prefixes', () => {
      const res = normalizeAndValidatePhone('01212345678');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Invalid Bangladeshi operator prefix');
    });

    it('rejects numbers with length other than 11 digits', () => {
      const shortRes = normalizeAndValidatePhone('01712345');
      expect(shortRes.isValid).toBe(false);
      expect(shortRes.error).toContain('11 digits');

      const longRes = normalizeAndValidatePhone('0171234567899');
      expect(longRes.isValid).toBe(false);
      expect(longRes.error).toContain('11 digits');
    });

    it('rejects empty or non-digit inputs', () => {
      const emptyRes = normalizeAndValidatePhone('');
      expect(emptyRes.isValid).toBe(false);
      expect(emptyRes.error).toBeDefined();

      const nonDigitRes = normalizeAndValidatePhone('abcdef');
      expect(nonDigitRes.isValid).toBe(false);
      expect(nonDigitRes.error).toBeDefined();
    });
  });

  describe('2. Worker D1 Settings & Blocked Phone Enforcement', () => {
    it('enforces order submission rejection when customer phone matches blocked list in D1', async () => {
      const db = createPhoneTestD1(['01700000000']);
      await db.init();
      const env = {
        ADMIN_SECRET: 'test-admin-secret',
        DB: db as any,
      };

      const payload = JSON.stringify({
        customer: {
          fullName: 'Fraudster User',
          phone: '+8801700000000',
          fullAddress: 'Banani 11',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [{ productId: 'prod-phone-1', quantity: 1 }],
        paymentMethod: 'cod',
      });

      const req = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(payload)),
          'cf-connecting-ip': '192.0.2.1',
        },
        body: payload,
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('temporarily restricted for this contact number');
    });

    it('allows order submission when customer phone is not in blocked list', async () => {
      const db = createPhoneTestD1(['01700000000']);
      await db.init();
      const env = {
        ADMIN_SECRET: 'test-admin-secret',
        DB: db as any,
      };

      const payload = JSON.stringify({
        customer: {
          fullName: 'Legitimate Customer',
          phone: '01812345678',
          fullAddress: 'Uttara Sector 3',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [{ productId: 'prod-phone-1', quantity: 1 }],
        paymentMethod: 'cod',
      });

      const req = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(payload)),
          'cf-connecting-ip': '192.0.2.2',
        },
        body: payload,
      });

      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.order).toBeDefined();
    });
  });
});
