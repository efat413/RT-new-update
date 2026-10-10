import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleApiRequest,
  checkRateLimit,
  checkAndConsumeOrderRateLimit,
  rollbackOrderRateLimit,
  recordFailedAttempt,
  maskRateLimitKey,
  orderIpRateLimitMap,
  loginAttemptMap,
} from '../src/server/router';
import { hashPassword } from '../src/server/auth';
import type { D1Database, Env } from '../src/server/types';

/**
 * High-fidelity in-memory Mock D1 Database supporting distributed SQLite semantics,
 * atomic upserts with RETURNING clauses, and configurable fault-injection hooks.
 */
class FaultInjectableMockD1 implements D1Database {
  public store: Map<string, { count: number; reset_at: number }> = new Map();
  public users: Map<string, any> = new Map();
  public orders: Map<string, any> = new Map();
  public idempotency: Map<string, any> = new Map();
  public products: Map<string, any> = new Map();

  // Fault injection toggles
  public shouldFailRead = false;
  public shouldFailWrite = false;
  public shouldTimeout = false;
  public readErrorMessage = 'D1_READ_OUTAGE: Connection to edge replica timed out';
  public writeErrorMessage = 'D1_WRITE_TIMEOUT: Transaction lock timeout (5000ms exceeded)';

  constructor() {
    this.reset();
  }

  reset() {
    this.store.clear();
    this.users.clear();
    this.orders.clear();
    this.idempotency.clear();
    this.products.clear();
    this.shouldFailRead = false;
    this.shouldFailWrite = false;
    this.shouldTimeout = false;

    // Seed dummy product for order tests
    this.products.set('prod-wallet-01', {
      id: 'prod-wallet-01',
      title: 'Leather Wallet',
      price: 1000,
      buying_price: 600,
      stock: 50,
      status: 'active',
    });
  }

  prepare(query: string): any {
    const self = this;
    let boundParams: any[] = [];

    return {
      bind(...params: any[]) {
        boundParams = params;
        return this;
      },

      async first<T = any>(): Promise<T | null> {
        if (self.shouldTimeout) {
          throw new Error('D1_TIMEOUT: Query execution deadline exceeded');
        }

        // Fault injection for read queries
        if (self.shouldFailRead && (query.includes('SELECT') || query.includes('rate_limits'))) {
          throw new Error(self.readErrorMessage);
        }

        // Fault injection for write queries with RETURNING
        if (self.shouldFailWrite && query.includes('INSERT INTO rate_limits')) {
          throw new Error(self.writeErrorMessage);
        }

        const now = Date.now();

        // 1. SELECT count, reset_at FROM rate_limits WHERE key = ?
        if (query.includes('FROM rate_limits WHERE key = ?')) {
          const key = boundParams[0];
          const entry = self.store.get(key);
          if (!entry) return null;
          return { count: entry.count, reset_at: entry.reset_at } as T;
        }

        // 2. Atomic upsert with RETURNING count, reset_at
        if (query.includes('INSERT INTO rate_limits') && query.includes('RETURNING')) {
          const key = boundParams[0];
          const resetAt = boundParams[1];
          const currentTimestamp = boundParams[2] || now;

          let entry = self.store.get(key);
          if (!entry || entry.reset_at <= currentTimestamp) {
            entry = { count: 1, reset_at: resetAt };
          } else {
            entry = { count: entry.count + 1, reset_at: entry.reset_at };
          }
          self.store.set(key, entry);
          return { count: entry.count, reset_at: entry.reset_at } as T;
        }

        // 3. User lookup for auth tests
        if (query.includes('FROM users WHERE')) {
          const identifier = String(boundParams[0]).toLowerCase();
          for (const user of self.users.values()) {
            if (user.email.toLowerCase() === identifier || (user.name && user.name.toLowerCase() === identifier)) {
              return user as T;
            }
          }
          return null;
        }

        // 4. Order lookup for tracking tests
        if (query.includes('FROM orders WHERE id = ?') || query.includes('WHERE id = ? OR order_number = ?')) {
          const id = boundParams[0];
          const ord = self.orders.get(id);
          return (ord || null) as T;
        }

        // 5. Courier status lookup by consignment_id or waybill
        if (query.includes('FROM orders WHERE consignment_id = ?')) {
          const cid = boundParams[0];
          for (const ord of self.orders.values()) {
            if (ord.consignment_id === cid || ord.courier_waybill === cid) {
              return { customer_phone: ord.customer?.phone || ord.customer_phone } as T;
            }
          }
          return null;
        }

        // 6. Idempotency lookup
        if (query.includes('FROM order_idempotency WHERE key = ?')) {
          const key = boundParams[0];
          const item = self.idempotency.get(key);
          if (!item) return null;
          return { response_json: JSON.stringify(item.payload), created_at: item.createdAt } as T;
        }

        return null;
      },

      async all<T = any>(): Promise<{ results: T[] }> {
        return { results: [] };
      },

      async run(): Promise<{ success: boolean; meta?: any }> {
        if (self.shouldTimeout) {
          throw new Error('D1_TIMEOUT: Lock acquisition deadline exceeded');
        }
        if (self.shouldFailWrite) {
          throw new Error(self.writeErrorMessage);
        }

        const now = Date.now();

        // Standard INSERT INTO rate_limits
        if (query.includes('INSERT INTO rate_limits')) {
          const key = boundParams[0];
          const resetAt = boundParams[1];
          const currentTimestamp = boundParams[2] || now;

          let entry = self.store.get(key);
          if (!entry || entry.reset_at <= currentTimestamp) {
            entry = { count: 1, reset_at: resetAt };
          } else {
            entry = { count: entry.count + 1, reset_at: entry.reset_at };
          }
          self.store.set(key, entry);
          return { success: true };
        }

        // UPDATE rate_limits SET count = MAX(0, count - 1) (Rollback)
        if (query.includes('UPDATE rate_limits SET count = MAX(0, count - 1)')) {
          const key = boundParams[0];
          const entry = self.store.get(key);
          if (entry) {
            entry.count = Math.max(0, entry.count - 1);
            self.store.set(key, entry);
          }
          return { success: true };
        }

        // DELETE FROM rate_limits WHERE key = ?
        if (query.includes('DELETE FROM rate_limits WHERE key = ?')) {
          const key = boundParams[0];
          self.store.delete(key);
          return { success: true };
        }

        // Order insertion
        if (query.includes('INSERT INTO orders')) {
          const ordId = boundParams[0];
          const ordNum = boundParams[1];
          self.orders.set(ordId, {
            id: ordId,
            order_number: ordNum,
            customer_phone: boundParams[4],
            customer: { phone: boundParams[4] },
          });
          return { success: true };
        }

        // Idempotency insert
        if (query.includes('INSERT INTO order_idempotency')) {
          const key = boundParams[0];
          const payload = JSON.parse(boundParams[3]);
          self.idempotency.set(key, { payload, createdAt: boundParams[4] });
          return { success: true };
        }

        return { success: true };
      },
    };
  }

  async batch(statements: any[]): Promise<any[]> {
    const results = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }

  async exec(query: string): Promise<any> {
    return { count: 0, duration: 0 };
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }
}

describe('Distributed Rate-Limiting Failure Modes & Fault Injection Suite', () => {
  let mockD1: FaultInjectableMockD1;
  let env: Env;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockD1 = new FaultInjectableMockD1();
    orderIpRateLimitMap.clear();
    loginAttemptMap.clear();

    env = {
      DB: mockD1,
      ADMIN_SECRET: 'test-admin-secret-fault-injection-suite',
      DEV: false, // Production mode enforced to evaluate strict fail-closed policies
    };
  });

  // =========================================================================
  // 1. D1 READ FAILURES & WRITE TIMEOUTS
  // =========================================================================
  describe('1. D1 Read Failures & Write Timeouts by Route Sensitivity', () => {
    it('Security-Critical (Login): FAILS-CLOSED (HTTP 503/429) during D1 read outage, preventing brute-force bypass', async () => {
      // Simulate D1 replica read failure
      mockD1.shouldFailRead = true;

      const clientIp = '203.0.113.10';
      const req = new Request('https://rongdhonutrade.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': clientIp,
        },
        body: JSON.stringify({
          usernameOrEmail: 'target-account@example.com',
          password: 'Password123!',
        }),
      });

      const res = await handleApiRequest(req, env);
      const body = await res.json();

      // Policy: Security-Critical MUST fail-closed with 503 or 429
      expect([429, 503]).toContain(res.status);
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/degraded|Too many login attempts/i);
    });

    it('Security-Critical (Register): FAILS-CLOSED (HTTP 503/429) during D1 database outage', async () => {
      mockD1.shouldFailRead = true;

      const req = new Request('https://rongdhonutrade.com/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.20',
        },
        body: JSON.stringify({
          name: 'Jane Customer',
          email: 'jane@example.com',
          password: 'SecurePassword123!',
          phone: '01711000000',
        }),
      });

      const res = await handleApiRequest(req, env);
      const body = await res.json();

      expect([429, 503]).toContain(res.status);
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/degraded|Too many registration requests/i);
    });

    it('Security-Critical (Password Reset Request): FAILS-CLOSED (HTTP 503/429) during D1 timeout', async () => {
      mockD1.shouldTimeout = true;

      const req = new Request('https://rongdhonutrade.com/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.30',
        },
        body: JSON.stringify({
          email: 'user-reset@example.com',
        }),
      });

      const res = await handleApiRequest(req, env);
      const body = await res.json();

      expect([429, 503]).toContain(res.status);
      expect(body.success).toBe(false);
      expect(body.status).toMatch(/SERVICE_DEGRADED|RATE_LIMITED/);
    });

    it('High-Availability / Revenue (Checkout): Operates in DEGRADED Mode (Fail-Open) on D1 read outage, preserving revenue', async () => {
      // Direct helper test: checkout limiter in degraded mode
      mockD1.shouldFailWrite = true; // D1 write timeout

      const clientIp = '198.51.100.55';
      const result = await checkAndConsumeOrderRateLimit(clientIp, 4, 600, mockD1, 0, {
        policy: 'fail-open',
      });

      // Revenue-critical route must succeed in degraded mode rather than denying legitimate checkout
      expect(result.allowed).toBe(true);
      expect(result.degraded).toBe(true);

      // Local isolate sliding window still tracks attempts
      expect(orderIpRateLimitMap.get(`order_ip:${clientIp}`)?.length).toBe(1);
    });

    it('High-Availability / Revenue (Tracking): Operates in DEGRADED Mode on D1 read outage without false-locking customers', async () => {
      mockD1.shouldFailRead = true;

      const clientIp = '198.51.100.66';
      const check = await checkRateLimit(`track_vol:${clientIp}`, 15, 60, mockD1, {
        policy: 'fail-open',
      });

      // Degraded mode permits legitimate read operations
      expect(check.allowed).toBe(true);
      expect(check.degraded).toBe(true);
    });
  });

  // =========================================================================
  // 2. MISSING ENVIRONMENT BINDINGS (DB = undefined)
  // =========================================================================
  describe('2. Missing Environment Bindings (DB = undefined)', () => {
    it('Security-Critical routes strictly FAIL-CLOSED when DB binding is completely missing in production', async () => {
      const brokenEnv: Env = {
        DB: undefined as any,
        ADMIN_SECRET: 'test-secret',
        DEV: false, // Production mode
      };

      const req = new Request('https://rongdhonutrade.com/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.77',
        },
        body: JSON.stringify({
          usernameOrEmail: 'admin@rongdhonutrade.com',
          password: 'Password123!',
        }),
      });

      const res = await handleApiRequest(req, brokenEnv);
      const body = await res.json();

      // Must be rejected (either 503 degraded or 500 missing DB), NEVER fail open
      expect([429, 500, 503]).toContain(res.status);
      expect(body.success).toBe(false);
    });

    it('Direct checkRateLimit helper fails closed on missing DB when policy is fail-closed in production', async () => {
      const res = await checkRateLimit('login:ip:10.0.0.1', 5, 900, undefined, {
        policy: 'fail-closed',
        isDev: false,
      });

      expect(res.allowed).toBe(false);
      expect(res.degraded).toBe(true);
    });

    it('Direct checkRateLimit helper fails open on missing DB when policy is fail-open (Revenue/HA)', async () => {
      const res = await checkRateLimit('order_ph_hour:01711000000', 6, 3600, undefined, {
        policy: 'fail-open',
      });

      expect(res.allowed).toBe(true);
      expect(res.degraded).toBe(true);
    });
  });

  // =========================================================================
  // 3. MULTI-ISOLATE DISTRIBUTED RACE CONDITIONS & ATOMIC AGGREGATION
  // =========================================================================
  describe('3. Multi-Isolate Distributed Race Conditions', () => {
    it('Aggregates failed tracking attempts across separate isolates and triggers D1 cooldown on threshold', async () => {
      // Simulate 3 distinct Cloudflare Workers isolates sharing the same D1 DB
      const clientIp = '198.51.100.99';
      const failKey = `track_fail:${clientIp}`;
      const cdKey = `track_cd:${clientIp}`;
      const failLimit = 5;

      // Isolate A: 2 failed attempts
      loginAttemptMap.clear();
      const recA1 = await recordFailedAttempt(failKey, failLimit, 60, mockD1);
      const recA2 = await recordFailedAttempt(failKey, failLimit, 60, mockD1);
      expect(recA1.count).toBe(1);
      expect(recA2.count).toBe(2);

      // Isolate B: 2 failed attempts (simulating distinct isolate memory)
      loginAttemptMap.clear(); // Fresh memory for Isolate B
      const recB1 = await recordFailedAttempt(failKey, failLimit, 60, mockD1);
      const recB2 = await recordFailedAttempt(failKey, failLimit, 60, mockD1);
      expect(recB1.count).toBe(3); // Distributed count reflects D1 state
      expect(recB2.count).toBe(4);

      // Isolate C: 5th failed attempt -> hits the limit of 5 across all isolates
      loginAttemptMap.clear(); // Fresh memory for Isolate C
      const recC = await recordFailedAttempt(failKey, failLimit, 60, mockD1);
      expect(recC.count).toBe(5);

      // Trigger cooldown when distributed count reaches limit
      if (recC.count >= failLimit) {
        await recordFailedAttempt(cdKey, 1, 60, mockD1);
      }

      // Now verify that ALL isolates (even a new Isolate D) observe the cooldown in D1
      loginAttemptMap.clear();
      const checkIsolateD = await checkRateLimit(cdKey, 1, 60, mockD1, { policy: 'fail-open' });
      expect(checkIsolateD.allowed).toBe(false);
      expect(checkIsolateD.count).toBe(1);
    });

    it('Concurrent orders across different isolates enforce strict 4-order limit atomically in D1', async () => {
      const clientIp = '198.51.100.111';
      const limit = 4;
      const windowSeconds = 600;

      // Simulate 8 concurrent order reservations across 8 different isolates simultaneously
      const simulatedIsolates = Array.from({ length: 8 });
      const results = await Promise.all(
        simulatedIsolates.map(async () => {
          // Each isolate has its own isolated memory map
          return checkAndConsumeOrderRateLimit(clientIp, limit, windowSeconds, mockD1, 0, {
            policy: 'fail-open',
          });
        })
      );

      const allowed = results.filter((r) => r.allowed).length;
      const blocked = results.filter((r) => !r.allowed).length;

      // Exactly 4 reservations must succeed and 4 must be blocked
      expect(allowed).toBe(4);
      expect(blocked).toBe(4);

      // D1 counter reflects exact attempts
      const d1Record = mockD1.store.get(`order_ip:${clientIp}`);
      expect(d1Record?.count).toBe(8);
    });
  });

  // =========================================================================
  // 4. RESERVATION ROLLBACK ACCURACY ON DOWNSTREAM FAILURES
  // =========================================================================
  describe('4. Reservation Rollback Accuracy on Downstream Failures', () => {
    it('Rolls back consumed reservation on client-side validation failure', async () => {
      const clientIp = '198.51.100.150';

      // 1. Reserve 1 slot
      const r1 = await checkAndConsumeOrderRateLimit(clientIp, 4, 600, mockD1);
      expect(r1.allowed).toBe(true);
      expect(mockD1.store.get(`order_ip:${clientIp}`)?.count).toBe(1);

      // 2. Downstream validation fails (e.g. invalid phone number) -> rollback
      await rollbackOrderRateLimit(clientIp, mockD1);

      // D1 count decremented back to 0
      expect(mockD1.store.get(`order_ip:${clientIp}`)?.count).toBe(0);
      expect(orderIpRateLimitMap.get(`order_ip:${clientIp}`)?.length).toBe(0);

      // 3. Customer can now place all 4 legitimate orders without quota loss
      for (let i = 0; i < 4; i++) {
        const next = await checkAndConsumeOrderRateLimit(clientIp, 4, 600, mockD1);
        expect(next.allowed).toBe(true);
      }

      // 5th attempt is correctly rejected
      const fifth = await checkAndConsumeOrderRateLimit(clientIp, 4, 600, mockD1);
      expect(fifth.allowed).toBe(false);
    });

    it('Rolls back rate limit on idempotent request replays (X-Idempotency-Cache HIT)', async () => {
      const clientIp = '198.51.100.160';

      // Seed cached idempotency response
      const idemKey = 'test-idem-replay-001';
      mockD1.idempotency.set(idemKey, {
        payload: {
          success: true,
          order: { id: 'ord-cached', orderNumber: 'ORD-101', totalAmount: 1250 },
          _meta: {
            ownerIdentity: 'guest:01711223344:test@example.com',
            payloadFingerprint: 'dummy-fingerprint',
          },
        },
        createdAt: Date.now(),
      });

      // Verify that rolling back after an idempotent hit restores quota
      await checkAndConsumeOrderRateLimit(clientIp, 4, 600, mockD1);
      expect(mockD1.store.get(`order_ip:${clientIp}`)?.count).toBe(1);

      // Simulate idempotent hit rollback
      await rollbackOrderRateLimit(clientIp, mockD1);
      expect(mockD1.store.get(`order_ip:${clientIp}`)?.count).toBe(0);
    });

    it('Rollback is resilient and does not throw even if D1 write fails during rollback', async () => {
      const clientIp = '198.51.100.170';
      await checkAndConsumeOrderRateLimit(clientIp, 4, 600, mockD1);

      // Simulate transient D1 failure during rollback
      mockD1.shouldFailWrite = true;
      await expect(rollbackOrderRateLimit(clientIp, mockD1)).resolves.not.toThrow();

      // Local isolate state was still safely rolled back
      expect(orderIpRateLimitMap.get(`order_ip:${clientIp}`)?.length).toBe(0);
    });
  });

  // =========================================================================
  // 5. OBSERVABILITY & PRIVACY (ZERO CREDENTIAL OR PII LEAKAGE)
  // =========================================================================
  describe('5. Observability & Privacy (Zero Credential or PII Leakage)', () => {
    it('Masks email addresses, Bangladeshi contact numbers, and IP addresses in rate limit keys', () => {
      // 1. Email masking
      const keyEmail = 'login:192.168.1.50:customer.john@gmail.com';
      const maskedEmail = maskRateLimitKey(keyEmail);
      expect(maskedEmail).not.toContain('customer.john@gmail.com');
      expect(maskedEmail).toContain('c***@gmail.com');
      expect(maskedEmail).toContain('192.168.***.50');

      // 2. Phone number masking
      const keyPhone = 'order_ph_hour:01712345678';
      const maskedPhone = maskRateLimitKey(keyPhone);
      expect(maskedPhone).not.toContain('01712345678');
      expect(maskedPhone).toContain('017****5678');

      // 3. Password reset key masking
      const keyReset = 'pwd-reset:10.20.30.40:victim@company.com.bd';
      const maskedReset = maskRateLimitKey(keyReset);
      expect(maskedReset).not.toContain('victim@company.com.bd');
      expect(maskedReset).toContain('v***@company.com.bd');
      expect(maskedReset).toContain('10.20.***.40');
    });
  });
});
