import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFirstAvailableVariantOption } from '../src/utils/productVariants';
import { deriveRecipientAddress, ParcelOverrides } from '../src/server/courierAdapters';
import { handleApiRequest } from '../src/server/router';
import { Order, Product } from '../src/types';
import { createAuthToken } from '../src/server/auth';

describe('1. District / City Optionality & Courier Dispatch Flow', () => {
  describe('Customer Address & District Derivation', () => {
    it('derives recipient address gracefully when district is omitted by customer', () => {
      const customer = {
        fullName: 'Tanvir Ahmed',
        phone: '01712345678',
        fullAddress: 'House 12, Road 4, Sector 7, Uttara',
        deliveryZone: 'inside_dhaka' as const,
      };

      const derivedWithoutDistrict = deriveRecipientAddress(customer);
      expect(derivedWithoutDistrict).toBe('House 12, Road 4, Sector 7, Uttara');
      expect(derivedWithoutDistrict).not.toContain('undefined');
    });

    it('derives recipient address with district when set by customer or admin', () => {
      const customer = {
        fullName: 'Tanvir Ahmed',
        phone: '01712345678',
        fullAddress: 'House 12, Road 4, Sector 7, Uttara',
        district: 'Dhaka',
        deliveryZone: 'inside_dhaka' as const,
      };

      const derivedWithDistrict = deriveRecipientAddress(customer);
      expect(derivedWithDistrict).toBe('House 12, Road 4, Sector 7, Uttara, Dhaka');
    });

    it('uses admin overrides to supply district when customer omitted it during checkout', () => {
      const customer = {
        fullName: 'Kabir Hasan',
        phone: '01812345678',
        fullAddress: 'Station Road, GEC Circle',
        deliveryZone: 'outside_dhaka' as const,
      };

      const overrides: ParcelOverrides = {
        district: 'Chattogram',
      };

      const derived = deriveRecipientAddress(customer, overrides);
      expect(derived).toBe('Station Road, GEC Circle, Chattogram');
    });

    it('does not duplicate district name if fullAddress already includes it', () => {
      const customer = {
        fullName: 'Salimullah',
        phone: '01912345678',
        fullAddress: 'Zindabazar, Sylhet',
        district: 'Sylhet',
        deliveryZone: 'outside_dhaka' as const,
      };

      const derived = deriveRecipientAddress(customer);
      expect(derived).toBe('Zindabazar, Sylhet');
    });
  });

  describe('Backend Order Creation Without District', () => {
    const orders = new Map<string, any>();
    const products = new Map<string, any>([
      [
        'p-test-1',
        {
          id: 'p-test-1',
          price: 1000,
          stock: 10,
          title: 'Test Item',
          buying_price: 600,
          status: 'active',
        },
      ],
    ]);

    const mockEnv: any = {
      ADMIN_SECRET: 'test-admin-secret-999',
      DB: {
        prepare(sql: string) {
          let boundParams: any[] = [];
          const stmt = {
            bind(...params: any[]) {
              boundParams = params;
              return stmt;
            },
            async first() {
              if (sql.includes('SELECT 1 as alive')) return { alive: 1 };
              if (sql.includes('FROM store_settings')) return { settings_json: JSON.stringify({ insideDhakaFee: 80, outsideDhakaFee: 150 }) };
              if (sql.includes('FROM rate_limits')) return null;
              if (sql.includes('FROM blocked_ips')) return null;
              if (sql.includes('FROM ip_blocks')) return null;
              if (sql.includes('FROM order_idempotency')) return null;
              if (sql.includes('FROM products WHERE id = ?')) {
                return products.get(boundParams[0]) || null;
              }
              if (sql.includes('FROM orders WHERE id = ? OR order_number = ?') || sql.includes('FROM orders WHERE id = ?')) {
                const ord = orders.get(boundParams[0]) || orders.get(boundParams[1]);
                return ord || null;
              }
              return null;
            },
            async all() {
              if (sql.includes('FROM products WHERE id IN')) {
                const results = boundParams.map((id) => products.get(id)).filter(Boolean);
                return { results };
              }
              return { results: [] };
            },
            async run() {
              if (sql.includes('INSERT INTO orders')) {
                const id = boundParams[0];
                const orderNum = boundParams[1];
                const ord = {
                  id,
                  order_number: orderNum,
                  customer_name: boundParams[4],
                  customer_phone: boundParams[5],
                  customer_address: boundParams[6],
                  customer_district: boundParams[7] || null,
                  customer_zone: boundParams[8],
                  items_json: boundParams[10],
                  subtotal: boundParams[11],
                  delivery_fee: boundParams[12],
                  total_amount: boundParams[13],
                  created_at: new Date().toISOString(),
                };
                orders.set(id, ord);
                orders.set(orderNum, ord);
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
          return stmt;
        },
        async batch(stmts: any[]) {
          for (const s of stmts) {
            await s.run();
          }
          return stmts.map(() => ({ success: true, meta: { changes: 1 } }));
        },
      },
    };

    it('accepts order submission when customer district is empty or undefined', async () => {
      const orderPayload = {
        customer: {
          fullName: 'Sabbir Rahman',
          phone: '01799887766',
          fullAddress: 'House 5, Road 2, Mirpur 10',
          deliveryZone: 'inside_dhaka',
          // district is omitted
        },
        items: [
          {
            productId: 'p-test-1',
            quantity: 1,
            product: { id: 'p-test-1', title: 'Test Item', price: 1000 },
          },
        ],
        subtotal: 1000,
        deliveryFee: 80,
        totalAmount: 1080,
        paymentMethod: 'cod',
      };

      const req = new Request('https://rongdhonutrade.com/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '198.51.100.10',
        },
        body: JSON.stringify(orderPayload),
      });

      const res = await handleApiRequest(req, mockEnv);
      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.order).toBeDefined();
    });
  });
});

describe('2. Color and Size — Select First Available Option by Default', () => {
  it('selects first available color and size when valid options exist', () => {
    const colors = ['Obsidian Black|#000000', 'Silver|#94a3b8', 'Rose Gold|#fb7185'];
    const sizes = ['38mm', '40mm', '42mm', '44mm'];

    const defaultColor = getFirstAvailableVariantOption(colors, 10);
    const defaultSize = getFirstAvailableVariantOption(sizes, 10);

    expect(defaultColor).toBe('Obsidian Black|#000000');
    expect(defaultSize).toBe('38mm');
  });

  it('does not select anything and returns undefined if product is out of stock (stock <= 0)', () => {
    const colors = ['Jet Black|#000000', 'Brown|#78350f'];
    const sizes = ['32', '34', '36'];

    const defaultColor = getFirstAvailableVariantOption(colors, 0);
    const defaultSize = getFirstAvailableVariantOption(sizes, 0);

    expect(defaultColor).toBeUndefined();
    expect(defaultSize).toBeUndefined();
  });

  it('skips out-of-stock or unavailable options and picks the next available option', () => {
    const colors = ['Crimson (Out of stock)', 'Forest Green|#15803d', 'Navy Blue|#1e3a8a'];
    const sizes = ['S (Sold Out)', 'M (Unavailable)', 'L', 'XL'];

    const defaultColor = getFirstAvailableVariantOption(colors, 5);
    const defaultSize = getFirstAvailableVariantOption(sizes, 5);

    expect(defaultColor).toBe('Forest Green|#15803d');
    expect(defaultSize).toBe('L');
  });

  it('returns undefined and does not invent phantom values if product has no variants', () => {
    const noColors: string[] = [];
    const undefinedSizes = undefined;

    const defaultColor = getFirstAvailableVariantOption(noColors, 15);
    const defaultSize = getFirstAvailableVariantOption(undefinedSizes, 15);

    expect(defaultColor).toBeUndefined();
    expect(defaultSize).toBeUndefined();
  });

  it('preserves customer selection when they choose a different option', () => {
    const colors = ['Obsidian Black|#000000', 'Silver|#94a3b8', 'Rose Gold|#fb7185'];
    const firstDefault = getFirstAvailableVariantOption(colors, 10);
    expect(firstDefault).toBe('Obsidian Black|#000000');

    // Customer manually selects Silver
    const customerSelectedColor = 'Silver|#94a3b8';

    // State update resolver function: keeps existing choice if it is in product.colors
    const resolveColorState = (current: string | undefined, productColors: string[], stock: number) => {
      if (current && productColors.includes(current)) {
        return current;
      }
      return getFirstAvailableVariantOption(productColors, stock);
    };

    const persisted = resolveColorState(customerSelectedColor, colors, 10);
    expect(persisted).toBe('Silver|#94a3b8');
    expect(persisted).not.toBe(firstDefault);
  });
});
