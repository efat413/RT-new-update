import { describe, it, expect, beforeEach } from 'vitest';
import { updateOrderInD1, insertOrder } from '../src/server/db';
import { Order, CartItem, Product } from '../src/types';

/**
 * High-fidelity in-memory Cloudflare D1 simulation with
 * SQLite batch transaction isolation, negative stock trigger abortion,
 * and rollback guarantees.
 */
class MockD1Database {
  public products: Map<string, any> = new Map();
  public orders: Map<string, any> = new Map();
  public storeSettings: any = {
    id: 'default',
    insideDhakaFee: 80,
    outsideDhakaFee: 150,
  };

  constructor() {
    this.reset();
  }

  reset() {
    this.products.clear();
    this.orders.clear();

    // Seed test products
    this.products.set('prod-watch-01', {
      id: 'prod-watch-01',
      title: 'Minimalist Steel Watch',
      price: 2000,
      buying_price: 1200,
      stock: 10,
      status: 'active',
      category_id: 'cat-mens',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    this.products.set('prod-wallet-01', {
      id: 'prod-wallet-01',
      title: 'Classic Leather Wallet',
      price: 1000,
      buying_price: 500,
      stock: 5,
      status: 'active',
      category_id: 'cat-mens',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    this.products.set('prod-limited-01', {
      id: 'prod-limited-01',
      title: 'Limited Edition Ring',
      price: 3000,
      buying_price: 1800,
      stock: 1,
      status: 'active',
      category_id: 'cat-jewelry',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    this.products.set('prod-inactive-01', {
      id: 'prod-inactive-01',
      title: 'Discontinued Vintage Bracelet',
      price: 1500,
      buying_price: 800,
      stock: 10,
      status: 'inactive',
      category_id: 'cat-jewelry',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  prepare(query: string) {
    const q = query.trim();
    let boundArgs: any[] = [];

    const stmt = {
      bind: (...args: any[]) => {
        boundArgs = args;
        return stmt;
      },
      first: async <T = any>() => {
        if (q.startsWith('SELECT * FROM store_settings') || q.startsWith('SELECT id, settings_json')) {
          return {
            id: 'default',
            settings_json: JSON.stringify(this.storeSettings),
            updated_at: new Date().toISOString(),
          } as T;
        }
        if (q.startsWith('SELECT * FROM coupons')) {
          return null as T;
        }
        if (q.includes('FROM products WHERE id = ?')) {
          const p = this.products.get(boundArgs[0]);
          return p ? ({ ...p } as T) : (null as T);
        }
        if (q.includes('FROM orders WHERE id = ?') || q.includes('FROM orders WHERE id = ? OR order_number = ?')) {
          const o = this.orders.get(boundArgs[0]);
          return o ? ({ ...o } as T) : (null as T);
        }
        if (q.includes('SELECT name FROM sqlite_master')) {
          return { name: 'products' } as T;
        }
        if (q.includes('COUNT(*) as count FROM orders')) {
          return { count: 0 } as T;
        }
        return null as T;
      },
      all: async <T = any>() => {
        if (q.includes('PRAGMA table_info')) {
          return {
            results: [
              { name: 'id' },
              { name: 'title' },
              { name: 'price' },
              { name: 'buying_price' },
              { name: 'stock' },
              { name: 'status' },
              { name: 'category_id' },
              { name: 'advance_payment' },
              { name: 'advance_payment_method' },
              { name: 'advance_payment_note' },
              { name: 'advance_payment_updated_at' },
              { name: 'advance_payment_updated_by' },
              { name: 'total_cost' },
              { name: 'total_profit' },
            ],
          } as any;
        }
        if (q.includes('FROM products WHERE id IN')) {
          const results = boundArgs
            .map((id) => this.products.get(id))
            .filter(Boolean)
            .map((p) => ({ ...p }));
          return { results } as any;
        }
        return { results: [] } as any;
      },
      run: async (undoStack?: Array<() => void>) => {
        // Concurrency guard: status transitions
        if (q.includes("UPDATE orders SET shipping_status = 'Cancelled'") && q.includes("shipping_status != 'Cancelled'")) {
          const id = boundArgs[0];
          const order = this.orders.get(id);
          if (!order) return { success: false, error: 'Order not found', meta: { changes: 0 } };
          if (order.shipping_status === 'Cancelled') {
            return { success: true, meta: { changes: 0 } };
          }
          const prevStatus = order.shipping_status;
          if (undoStack) undoStack.push(() => { order.shipping_status = prevStatus; });
          order.shipping_status = 'Cancelled';
          return { success: true, meta: { changes: 1 } };
        }

        if (q.startsWith("UPDATE orders SET shipping_status = 'Cancelled' WHERE id = ?")) {
          const id = boundArgs[0];
          const order = this.orders.get(id);
          if (order) {
            const prevStatus = order.shipping_status;
            if (undoStack) undoStack.push(() => { order.shipping_status = prevStatus; });
            order.shipping_status = 'Cancelled';
          }
          return { success: true, meta: { changes: 1 } };
        }

        if (q.includes('UPDATE orders SET shipping_status = ?') && q.includes("shipping_status = 'Cancelled'")) {
          const [newStatus, id] = boundArgs;
          const order = this.orders.get(id);
          if (!order) return { success: false, error: 'Order not found', meta: { changes: 0 } };
          if (order.shipping_status !== 'Cancelled') {
            return { success: true, meta: { changes: 0 } };
          }
          const prevStatus = order.shipping_status;
          if (undoStack) undoStack.push(() => { order.shipping_status = prevStatus; });
          order.shipping_status = newStatus;
          return { success: true, meta: { changes: 1 } };
        }

        // Guarded stock deduction simulating SQLite trigger trg_prevent_negative_stock
        if (q.includes('UPDATE products SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE -1 END')) {
          const [minQty, deductQty, prodId] = boundArgs;
          const prod = this.products.get(prodId);
          if (!prod) return { success: false, error: 'Product not found', meta: { changes: 0 } };
          const resultingStock = prod.stock >= minQty ? prod.stock - deductQty : -1;
          if (resultingStock < 0) {
            return {
              success: false,
              error: 'INSUFFICIENT_STOCK: Product stock cannot be negative (ABORT triggered by trg_prevent_negative_stock)',
              meta: { changes: 0 },
            };
          }
          const prevStock = prod.stock;
          if (undoStack) undoStack.push(() => { prod.stock = prevStock; });
          prod.stock = resultingStock;
          return { success: true, meta: { changes: 1 } };
        }

        // Stock restoration
        if (q.includes('UPDATE products SET stock = stock + ?')) {
          const [addQty, prodId] = boundArgs;
          const prod = this.products.get(prodId);
          if (prod) {
            const prevStock = prod.stock;
            if (undoStack) undoStack.push(() => { prod.stock = prevStock; });
            prod.stock += addQty;
          }
          return { success: true, meta: { changes: 1 } };
        }

        // Order update
        if (q.startsWith('UPDATE orders SET')) {
          const id = boundArgs[boundArgs.length - 1];
          const order = this.orders.get(id);
          if (!order) return { success: false, error: 'Order not found', meta: { changes: 0 } };

          const prevOrder = { ...order };
          if (undoStack) undoStack.push(() => { Object.assign(order, prevOrder); });

          order.customer_name = boundArgs[0];
          order.customer_phone = boundArgs[1];
          order.customer_address = boundArgs[2];
          order.customer_district = boundArgs[3];
          order.customer_zone = boundArgs[4];
          order.customer_notes = boundArgs[5];
          order.items_json = boundArgs[6];
          order.subtotal = boundArgs[7];
          order.delivery_fee = boundArgs[8];
          order.total_amount = boundArgs[9];
          order.coupon_code = boundArgs[10];
          order.discount_amount = boundArgs[11];
          order.payment_method = boundArgs[12];
          order.payment_status = boundArgs[13];
          order.transaction_id = boundArgs[14];
          order.shipping_status = boundArgs[15];
          order.total_cost = boundArgs[24];
          order.total_profit = boundArgs[25];
          order.advance_payment = boundArgs[26];
          return { success: true, meta: { changes: 1 } };
        }

        // Order insert
        if (q.startsWith('INSERT INTO orders')) {
          const orderId = boundArgs[0];
          if (undoStack) undoStack.push(() => { this.orders.delete(orderId); });
          this.orders.set(orderId, {
            id: orderId,
            order_number: boundArgs[1],
            user_id: boundArgs[2],
            user_email: boundArgs[3],
            customer_name: boundArgs[4],
            customer_phone: boundArgs[5],
            customer_address: boundArgs[6],
            customer_district: boundArgs[7],
            customer_zone: boundArgs[8],
            customer_notes: boundArgs[9],
            items_json: boundArgs[10],
            subtotal: boundArgs[11],
            delivery_fee: boundArgs[12],
            total_amount: boundArgs[13],
            coupon_code: boundArgs[14],
            discount_amount: boundArgs[15],
            payment_method: boundArgs[16],
            payment_status: boundArgs[17],
            shipping_status: boundArgs[19],
            total_cost: boundArgs[28],
            total_profit: boundArgs[29],
            advance_payment: boundArgs[30],
            created_at: boundArgs[35],
          });
          return { success: true, meta: { changes: 1 } };
        }

        return { success: true, meta: { changes: 1 } };
      },
    };

    return stmt;
  }

  async batch(statements: any[]) {
    // Record undo operations specifically for mutations within this batch transaction
    const undoStack: Array<() => void> = [];

    const results = [];
    for (const s of statements) {
      // Capture pre-mutation state if statement mutates products or orders
      const res = await s.run(undoStack);
      if (!res.success) {
        // Rollback only the mutations performed by this transaction
        while (undoStack.length > 0) {
          const undo = undoStack.pop();
          if (undo) undo();
        }
        return [{ success: false, error: res.error, meta: { changes: 0 } }];
      }
      results.push(res);
    }
    return results;
  }
}

describe('Order-Edit Inventory Consistency & Concurrency Test Suite', () => {
  let db: MockD1Database;

  beforeEach(() => {
    db = new MockD1Database();
  });

  // Helper to create a baseline active order
  async function createInitialOrder(items: CartItem[]): Promise<Order> {
    const orderPayload: any = {
      id: 'ord-test-base',
      orderNumber: 'RT-2026-10000001',
      customer: {
        fullName: 'Rahim Ahmed',
        phone: '01711223344',
        fullAddress: 'Dhanmondi 32, Dhaka',
        deliveryZone: 'inside_dhaka',
      },
      items,
      subtotal: items.reduce((s, it) => s + (it.product.price * it.quantity), 0),
      deliveryFee: 80,
      totalAmount: items.reduce((s, it) => s + (it.product.price * it.quantity), 0) + 80,
      paymentMethod: 'COD',
      paymentStatus: 'Pending',
      shippingStatus: 'Processing',
      advancePayment: 0,
      customerDue: items.reduce((s, it) => s + (it.product.price * it.quantity), 0) + 80,
    };
    return await insertOrder(db as any, orderPayload);
  }

  describe('1. Quantity Delta Adjustments (Increase & Decrease)', () => {
    it('accurately deducts additional stock when quantity is increased', async () => {
      // Setup: Product stock is 10. Initial order claims 2 units -> stock becomes 8.
      const initialItem: CartItem = {
        product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000, buyingPrice: 1200 } as Product,
        quantity: 2,
      };
      const order = await createInitialOrder([initialItem]);
      expect(db.products.get('prod-watch-01').stock).toBe(8);

      // Admin increases quantity from 2 to 5 (delta = +3)
      const updatedItems: CartItem[] = [
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000, buyingPrice: 1200 } as Product,
          quantity: 5,
        },
      ];

      const updated = await updateOrderInD1(db as any, order.id, { items: updatedItems });

      // Verifications:
      // Stock: 8 - 3 = 5
      expect(db.products.get('prod-watch-01').stock).toBe(5);
      expect(updated.items[0].quantity).toBe(5);
    });

    it('accurately restores surplus stock when quantity is decreased', async () => {
      // Setup: Product stock is 10. Initial order claims 5 units -> stock becomes 5.
      const initialItem: CartItem = {
        product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000, buyingPrice: 1200 } as Product,
        quantity: 5,
      };
      const order = await createInitialOrder([initialItem]);
      expect(db.products.get('prod-watch-01').stock).toBe(5);

      // Admin decreases quantity from 5 to 2 (delta = -3)
      const updatedItems: CartItem[] = [
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000, buyingPrice: 1200 } as Product,
          quantity: 2,
        },
      ];

      const updated = await updateOrderInD1(db as any, order.id, { items: updatedItems });

      // Verifications:
      // Stock: 5 + 3 = 8
      expect(db.products.get('prod-watch-01').stock).toBe(8);
      expect(updated.items[0].quantity).toBe(2);
    });
  });

  describe('2. Item Replacement & Removal', () => {
    it('restores stock when an item is removed from an order', async () => {
      // Order with two products: Watch (qty 2, initial stock 10 -> 8), Wallet (qty 1, initial stock 5 -> 4)
      const items: CartItem[] = [
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000, buyingPrice: 1200 } as Product,
          quantity: 2,
        },
        {
          product: { id: 'prod-wallet-01', title: 'Classic Leather Wallet', price: 1000, buyingPrice: 500 } as Product,
          quantity: 1,
        },
      ];
      const order = await createInitialOrder(items);
      expect(db.products.get('prod-watch-01').stock).toBe(8);
      expect(db.products.get('prod-wallet-01').stock).toBe(4);

      // Admin removes the wallet from the order
      const updatedItems = [items[0]]; // Watch only
      const updated = await updateOrderInD1(db as any, order.id, { items: updatedItems });

      // Wallet stock restored: 4 + 1 = 5. Watch stock unchanged: 8.
      expect(db.products.get('prod-wallet-01').stock).toBe(5);
      expect(db.products.get('prod-watch-01').stock).toBe(8);
      expect(updated.items.length).toBe(1);
    });

    it('atomically swaps products: restores old item stock and claims new item stock', async () => {
      // Initial order with Watch (qty 2, stock 10 -> 8)
      const order = await createInitialOrder([
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
          quantity: 2,
        },
      ]);
      expect(db.products.get('prod-watch-01').stock).toBe(8);
      expect(db.products.get('prod-wallet-01').stock).toBe(5);

      // Admin replaces Watch (qty 2) with Wallet (qty 3)
      const updatedItems: CartItem[] = [
        {
          product: { id: 'prod-wallet-01', title: 'Classic Leather Wallet', price: 1000 } as Product,
          quantity: 3,
        },
      ];
      await updateOrderInD1(db as any, order.id, { items: updatedItems });

      // Watch restored: 8 + 2 = 10. Wallet deducted: 5 - 3 = 2.
      expect(db.products.get('prod-watch-01').stock).toBe(10);
      expect(db.products.get('prod-wallet-01').stock).toBe(2);
    });
  });

  describe('3. Deduplication & Aggregation Across Lines', () => {
    it('aggregates quantities for duplicate product lines and avoids multiple SQL deductions', async () => {
      // Order created with duplicate lines: Watch line 1 (qty 2), Watch line 2 (qty 3)
      // Total requested = 5. Initial stock = 10 -> expected stock = 5.
      const duplicateLines: CartItem[] = [
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
          quantity: 2,
          selectedSize: 'M',
        },
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
          quantity: 3,
          selectedSize: 'L',
        },
      ];

      const order = await createInitialOrder(duplicateLines);
      expect(db.products.get('prod-watch-01').stock).toBe(5);

      // Now admin edits the order with two lines of Watch: line 1 (qty 4), line 2 (qty 2) -> total 6
      // Delta: 6 - 5 = +1. Expected stock: 5 - 1 = 4.
      const editedLines: CartItem[] = [
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
          quantity: 4,
          selectedSize: 'M',
        },
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
          quantity: 2,
          selectedSize: 'L',
        },
      ];

      const updated = await updateOrderInD1(db as any, order.id, { items: editedLines });
      expect(db.products.get('prod-watch-01').stock).toBe(4);
      expect(updated.items.length).toBe(2);
    });
  });

  describe('4. Order Lifecycle (Cancellation & Reactivation)', () => {
    it('restores all reserved items to inventory on order cancellation', async () => {
      const order = await createInitialOrder([
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
          quantity: 3,
        },
      ]);
      expect(db.products.get('prod-watch-01').stock).toBe(7);

      const cancelled = await updateOrderInD1(db as any, order.id, { shippingStatus: 'Cancelled' });
      expect(cancelled.shippingStatus).toBe('Cancelled');
      // Stock restored: 7 + 3 = 10
      expect(db.products.get('prod-watch-01').stock).toBe(10);
    });

    it('is idempotent: duplicate cancellation does not double-restore stock', async () => {
      const order = await createInitialOrder([
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
          quantity: 3,
        },
      ]);
      expect(db.products.get('prod-watch-01').stock).toBe(7);

      // First cancellation
      await updateOrderInD1(db as any, order.id, { shippingStatus: 'Cancelled' });
      expect(db.products.get('prod-watch-01').stock).toBe(10);

      // Second cancellation
      await updateOrderInD1(db as any, order.id, { shippingStatus: 'Cancelled' });
      // Stock remains exactly 10, not 13!
      expect(db.products.get('prod-watch-01').stock).toBe(10);
    });

    it('re-deducts reserved items when a cancelled order is reactivated', async () => {
      const order = await createInitialOrder([
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
          quantity: 4,
        },
      ]);
      expect(db.products.get('prod-watch-01').stock).toBe(6);

      // Cancel order
      await updateOrderInD1(db as any, order.id, { shippingStatus: 'Cancelled' });
      expect(db.products.get('prod-watch-01').stock).toBe(10);

      // Reactivate order
      const reactivated = await updateOrderInD1(db as any, order.id, { shippingStatus: 'Processing' });
      expect(reactivated.shippingStatus).toBe('Processing');
      // Stock re-deducted: 10 - 4 = 6
      expect(db.products.get('prod-watch-01').stock).toBe(6);
    });

    it('does not alter stock when editing non-inventory fields of a cancelled order', async () => {
      const order = await createInitialOrder([
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
          quantity: 2,
        },
      ]);
      await updateOrderInD1(db as any, order.id, { shippingStatus: 'Cancelled' });
      expect(db.products.get('prod-watch-01').stock).toBe(10);

      // Admin updates customer address on cancelled order
      await updateOrderInD1(db as any, order.id, {
        customer: { fullAddress: 'Updated Address, Dhaka' } as any,
      });

      // Stock should remain 10
      expect(db.products.get('prod-watch-01').stock).toBe(10);
    });
  });

  describe('5. Out-of-Stock Guard & Atomic Batch Rollback', () => {
    it('aborts edit and rolls back completely when requested quantity exceeds available stock', async () => {
      // Limited product starts with stock = 1
      const order = await createInitialOrder([
        {
          product: { id: 'prod-limited-01', title: 'Limited Edition Ring', price: 3000 } as Product,
          quantity: 1,
        },
      ]);
      // After order creation, stock is 0
      expect(db.products.get('prod-limited-01').stock).toBe(0);

      // Admin attempts to increase quantity from 1 to 2 (delta = +1, but available stock is 0)
      const editPromise = updateOrderInD1(db as any, order.id, {
        items: [
          {
            product: { id: 'prod-limited-01', title: 'Limited Edition Ring', price: 3000 } as Product,
            quantity: 2,
          },
        ],
      });

      await expect(editPromise).rejects.toThrow('INSUFFICIENT_STOCK');

      // Verifications:
      // Stock remained at 0 (did NOT become negative -1)
      expect(db.products.get('prod-limited-01').stock).toBe(0);

      // Persisted order remained unchanged with quantity 1
      const persisted = db.orders.get(order.id);
      const itemsInDb = JSON.parse(persisted.items_json);
      expect(itemsInDb[0].quantity).toBe(1);
    });

    it('aborts multi-item edit atomically without partial deductions if any item has insufficient stock', async () => {
      // Order with 1 Watch (stock 10 -> 9). Limited ring has stock 1.
      const order = await createInitialOrder([
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
          quantity: 1,
        },
      ]);
      expect(db.products.get('prod-watch-01').stock).toBe(9);
      expect(db.products.get('prod-limited-01').stock).toBe(1);

      // Admin tries to add 2 Watches (delta +2, available 9: OK) AND 5 Limited Rings (delta +5, available 1: INSUFFICIENT)
      const editPromise = updateOrderInD1(db as any, order.id, {
        items: [
          {
            product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
            quantity: 3, // +2
          },
          {
            product: { id: 'prod-limited-01', title: 'Limited Edition Ring', price: 3000 } as Product,
            quantity: 5, // +5 (fails!)
          },
        ],
      });

      await expect(editPromise).rejects.toThrow('INSUFFICIENT_STOCK');

      // Atomic transaction rollback: Watch stock was NOT decremented by 2! It must remain 9!
      expect(db.products.get('prod-watch-01').stock).toBe(9);
      expect(db.products.get('prod-limited-01').stock).toBe(1);
    });

    it('aborts reactivation of a cancelled order if items are no longer available in stock', async () => {
      // Order claims the 1 available Limited Ring (stock 1 -> 0)
      const order = await createInitialOrder([
        {
          product: { id: 'prod-limited-01', title: 'Limited Edition Ring', price: 3000 } as Product,
          quantity: 1,
        },
      ]);
      expect(db.products.get('prod-limited-01').stock).toBe(0);

      // Order is cancelled (stock 0 -> 1)
      await updateOrderInD1(db as any, order.id, { shippingStatus: 'Cancelled' });
      expect(db.products.get('prod-limited-01').stock).toBe(1);

      // Another order comes in and buys the ring (stock 1 -> 0)
      db.products.get('prod-limited-01').stock = 0;

      // Admin tries to un-cancel/reactivate the first order
      const reactivatePromise = updateOrderInD1(db as any, order.id, { shippingStatus: 'Processing' });
      await expect(reactivatePromise).rejects.toThrow('INSUFFICIENT_STOCK');

      // Status must revert back to Cancelled
      expect(db.orders.get(order.id).shipping_status).toBe('Cancelled');
      expect(db.products.get('prod-limited-01').stock).toBe(0);
    });
  });

  describe('6. Quantity and Product Integrity Validation', () => {
    it('rejects invalid quantities (0, negative, floats, NaN, infinity)', async () => {
      const order = await createInitialOrder([
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
          quantity: 1,
        },
      ]);

      // 0 quantity
      await expect(
        updateOrderInD1(db as any, order.id, {
          items: [{ product: { id: 'prod-watch-01' } as any, quantity: 0 }],
        })
      ).rejects.toThrow('Invalid item quantity');

      // Negative quantity
      await expect(
        updateOrderInD1(db as any, order.id, {
          items: [{ product: { id: 'prod-watch-01' } as any, quantity: -2 }],
        })
      ).rejects.toThrow('Invalid item quantity');

      // Fractional float quantity
      await expect(
        updateOrderInD1(db as any, order.id, {
          items: [{ product: { id: 'prod-watch-01' } as any, quantity: 1.5 }],
        })
      ).rejects.toThrow('Invalid item quantity');

      // NaN
      await expect(
        updateOrderInD1(db as any, order.id, {
          items: [{ product: { id: 'prod-watch-01' } as any, quantity: NaN }],
        })
      ).rejects.toThrow('Invalid item quantity');

      // Infinity
      await expect(
        updateOrderInD1(db as any, order.id, {
          items: [{ product: { id: 'prod-watch-01' } as any, quantity: Infinity }],
        })
      ).rejects.toThrow('Invalid item quantity');
    });

    it('rejects order insertion with inactive product', async () => {
      await expect(
        insertOrder(db as any, {
          id: 'ord-inactive-test',
          customer: {
            fullName: 'Test User',
            phone: '01711223344',
            fullAddress: 'Dhaka',
            deliveryZone: 'inside_dhaka',
          },
          items: [
            {
              product: { id: 'prod-inactive-01', title: 'Discontinued Vintage Bracelet', price: 1500 } as any,
              quantity: 1,
            },
          ],
        } as any)
      ).rejects.toThrow('inactive or unavailable');
    });
  });

  describe('7. Concurrency & Race Condition Simulation', () => {
    it('prevents double-spending when two concurrent edits race for the last remaining unit', async () => {
      // Limited Ring has 1 unit in stock.
      // Order A has 1 unit of Watch. Order B has 1 unit of Watch.
      // Both attempt to edit their orders to replace Watch with the Limited Ring concurrently.
      const orderA = await createInitialOrder([
        {
          product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
          quantity: 1,
        },
      ]);
      const orderB = await insertOrder(db as any, {
        id: 'ord-test-b',
        customer: {
          fullName: 'Karim Ullah',
          phone: '01811223344',
          fullAddress: 'Uttara, Dhaka',
          deliveryZone: 'inside_dhaka',
        },
        items: [
          {
            product: { id: 'prod-watch-01', title: 'Minimalist Steel Watch', price: 2000 } as Product,
            quantity: 1,
          },
        ],
        subtotal: 2000,
        deliveryFee: 80,
        totalAmount: 2080,
        paymentMethod: 'COD',
        shippingStatus: 'Processing',
      } as any);

      expect(db.products.get('prod-limited-01').stock).toBe(1);

      // Race: Both A and B try to claim the 1 unit of Limited Ring
      const reqA = updateOrderInD1(db as any, orderA.id, {
        items: [{ product: { id: 'prod-limited-01', title: 'Limited Edition Ring', price: 3000 } as Product, quantity: 1 }],
      });
      const reqB = updateOrderInD1(db as any, orderB.id, {
        items: [{ product: { id: 'prod-limited-01', title: 'Limited Edition Ring', price: 3000 } as Product, quantity: 1 }],
      });

      const results = await Promise.allSettled([reqA, reqB]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly ONE request must succeed, and exactly ONE must fail
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Final stock must be exactly 0 (never negative)
      expect(db.products.get('prod-limited-01').stock).toBe(0);
    });
  });
});
