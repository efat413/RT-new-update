/**
 * Verification Suite for Verified Purchase Spoofing Vulnerability Fix
 * 
 * Tests both the D1 database purchase verification layer (verifyCustomerPurchaseInD1)
 * and the API endpoint layer (POST /api/reviews) across:
 * - Unauthenticated attacker attempting to claim another customer's email
 * - Authenticated purchaser vs authenticated non-purchaser
 * - Client payload attempting to force verifiedPurchase: true
 * - Guest verification with multi-factor proof (orderNumber + phone) vs email alone
 * - Product slug vs product ID resolution
 * - Order cancellation safeguards
 */

import { verifyCustomerPurchaseInD1, insertReview } from '../src/server/db';
import { handleApiRequest } from '../src/server/router';
import { computePasswordSignature } from '../src/server/auth';
import { createSignedTestToken, getTestSecret } from './test-auth-helper';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    failed++;
  }
}

// In-Memory Mock D1 for comprehensive security testing
class MockD1PreparedStatement {
  private sql: string;
  private bindings: any[];
  private storage: MockReviewD1Database;

  constructor(sql: string, storage: MockReviewD1Database, bindings: any[] = []) {
    this.sql = sql;
    this.storage = storage;
    this.bindings = bindings;
  }

  bind(...params: any[]) {
    return new MockD1PreparedStatement(this.sql, this.storage, params);
  }

  async run() {
    return this.storage.executeSql(this.sql, this.bindings);
  }

  async all<T = any>() {
    const res = this.storage.querySql(this.sql, this.bindings);
    return { results: res as T[] };
  }

  async first<T = any>(colName?: string) {
    const res = this.storage.querySql(this.sql, this.bindings);
    if (!res || res.length === 0) return null;
    if (colName) return (res[0] as any)[colName] as T;
    return res[0] as T;
  }
}

class MockReviewD1Database {
  products: any[] = [];
  users: any[] = [];
  orders: any[] = [];
  reviews: any[] = [];
  rateLimits: any[] = [];

  constructor() {
    this.products = [
      {
        id: 'prod-wallet-01',
        slug: 'leather-wallet',
        title: 'Premium Leather Wallet',
        price: 1450,
        status: 'active',
      },
      {
        id: 'prod-watch-01',
        slug: 'quartz-watch',
        title: 'Luxury Quartz Watch',
        price: 2500,
        status: 'active',
      },
    ];

    this.users = [
      {
        id: 'user-alice-101',
        email: 'alice@example.com',
        name: 'Alice Purchaser',
        role: 'customer',
        password: '$2a$12$e6xI14b7eM8Yg5Q/nN0LceKxP0cZ1bF7p2j4u6w8y0z2a4c6e8g0i',
        permissions_json: '{}',
        is_active: 1,
      },
      {
        id: 'user-bob-102',
        email: 'bob@example.com',
        name: 'Bob NonPurchaser',
        role: 'customer',
        password: '$2a$12$e6xI14b7eM8Yg5Q/nN0LceKxP0cZ1bF7p2j4u6w8y0z2a4c6e8g0i',
        permissions_json: '{}',
        is_active: 1,
      },
    ];

    this.orders = [
      {
        id: 'ord-1001',
        order_number: 'ORD-2026-1001',
        user_id: 'user-alice-101',
        user_email: 'alice@example.com',
        customer_name: 'Alice Purchaser',
        customer_phone: '01712345678',
        shipping_status: 'Delivered',
        items_json: JSON.stringify([
          {
            id: 'prod-wallet-01',
            productId: 'prod-wallet-01',
            product: { id: 'prod-wallet-01', slug: 'leather-wallet', title: 'Premium Leather Wallet' },
            quantity: 1,
          },
        ]),
      },
      {
        id: 'ord-1002',
        order_number: 'ORD-2026-1002',
        user_id: null,
        user_email: 'guestvictim@example.com',
        customer_name: 'Guest Customer',
        customer_phone: '01899887766',
        shipping_status: 'Shipped',
        items_json: JSON.stringify([
          {
            id: 'prod-wallet-01',
            productId: 'prod-wallet-01',
            product: { id: 'prod-wallet-01', slug: 'leather-wallet', title: 'Premium Leather Wallet' },
            quantity: 1,
          },
        ]),
      },
      {
        id: 'ord-1003',
        order_number: 'ORD-2026-1003',
        user_id: 'user-alice-101',
        user_email: 'alice@example.com',
        customer_name: 'Alice Purchaser',
        customer_phone: '01712345678',
        shipping_status: 'Cancelled',
        items_json: JSON.stringify([
          {
            id: 'prod-watch-01',
            productId: 'prod-watch-01',
            product: { id: 'prod-watch-01', slug: 'quartz-watch', title: 'Luxury Quartz Watch' },
            quantity: 1,
          },
        ]),
      },
    ];
  }

  prepare(sql: string) {
    return new MockD1PreparedStatement(sql, this);
  }

  querySql(sql: string, bindings: any[] = []): any[] {
    const s = sql.toLowerCase();

    // Check PRAGMA table_info
    if (s.includes('pragma table_info')) {
      return [
        { name: 'id' },
        { name: 'product_id' },
        { name: 'author_name' },
        { name: 'rating' },
        { name: 'comment' },
        { name: 'verified_purchase' },
        { name: 'created_at' },
        { name: 'slug' },
        { name: 'title' },
        { name: 'price' },
        { name: 'status' },
      ];
    }

    // Rate limits table check
    if (s.includes('from rate_limits')) {
      return [];
    }

    // Users lookup
    if (s.includes('from users')) {
      const term = bindings[0];
      return this.users.filter((u) => u.email === term || u.id === term);
    }

    // Products lookup
    if (s.includes('from products')) {
      if (bindings.length >= 1) {
        const idOrSlug = bindings[0];
        return this.products.filter((p) => p.id === idOrSlug || p.slug === idOrSlug);
      }
      return this.products;
    }

    // Reviews lookup
    if (s.includes('from reviews')) {
      if (s.includes('where product_id = ? and comment = ?')) {
        const [pid, c] = bindings;
        return this.reviews.filter((r) => r.product_id === pid && r.comment === c);
      }
      if (s.includes('where id = ?')) {
        return this.reviews.filter((r) => r.id === bindings[0]);
      }
      return this.reviews;
    }

    // Orders lookup in verifyCustomerPurchaseInD1
    if (s.includes('from orders')) {
      return this.orders.filter((ord) => {
        // shipping_status != 'Cancelled'
        if (s.includes("shipping_status != 'cancelled'") && ord.shipping_status === 'Cancelled') {
          return false;
        }

        // Check product item containment
        const prodBinding = bindings[bindings.length - 1]; // e.g. %prod-wallet-01%
        const cleanProd = String(prodBinding).replace(/%/g, '');
        if (!ord.items_json.includes(cleanProd)) {
          return false;
        }

        // Authenticated customer match: user_id = ? OR LOWER(user_email) = ?
        if (s.includes('user_id = ?') || s.includes('lower(user_email) = ?')) {
          const authMatches = bindings.some((b) => {
            const str = String(b).toLowerCase();
            return (ord.user_id && ord.user_id.toLowerCase() === str) ||
                   (ord.user_email && ord.user_email.toLowerCase() === str);
          });
          return authMatches;
        }

        // Guest match: order_number = ? AND customer_phone LIKE ?
        if (s.includes('order_number = ?') && s.includes('customer_phone like ?')) {
          const orderNo = bindings[0];
          const phonePattern = bindings[1].replace(/%/g, '');
          const ordNoMatch = ord.order_number === orderNo;
          const phoneMatch = ord.customer_phone.includes(phonePattern);
          return ordNoMatch && phoneMatch;
        }

        return false;
      });
    }

    return [];
  }

  executeSql(sql: string, bindings: any[] = []): any {
    const s = sql.toLowerCase();

    if (s.includes('insert into reviews')) {
      const [id, product_id, author_name, rating, comment, verified_purchase, created_at] = bindings;
      const newRev = {
        id,
        product_id,
        author_name,
        rating,
        comment,
        verified_purchase,
        created_at,
      };
      this.reviews.push(newRev);
      return { success: true };
    }

    if (s.includes('insert into rate_limits') || s.includes('update rate_limits')) {
      return { success: true };
    }

    return { success: true };
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('VERIFYING VERIFIED PURCHASE SPOOFING SECURITY FIX');
  console.log('========================================================\n');

  const mockDb = new MockReviewD1Database();
  const env: any = {
    DB: mockDb,
    ADMIN_SECRET: getTestSecret(),
  };

  const testPwdHash = '$2a$12$e6xI14b7eM8Yg5Q/nN0LceKxP0cZ1bF7p2j4u6w8y0z2a4c6e8g0i';
  const testPwdSig = await computePasswordSignature(testPwdHash);

  // -------------------------------------------------------------------------
  // TEST 1 — Unauthenticated attacker using another customer's email
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Unauthenticated attacker using victim email ---');
  {
    // Layer 1: Unit level test of verifyCustomerPurchaseInD1
    const unitResult = await verifyCustomerPurchaseInD1(mockDb as any, {
      authenticatedUserId: null,
      authenticatedEmail: null,
      productId: 'prod-wallet-01',
    });
    assert(unitResult === false, '1.1 verifyCustomerPurchaseInD1 rejects unauthenticated request without credentials');

    // Layer 2: API level via handleApiRequest
    const req = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-real-ip': '198.51.100.1',
      },
      body: JSON.stringify({
        productId: 'prod-wallet-01',
        email: 'alice@example.com', // Victim's email who actually made a purchase!
        authorName: 'Attacker Impersonator',
        rating: 5,
        comment: 'Attacker fake review spoofing Alice',
      }),
    });

    const res = await handleApiRequest(req, env);
    const data = await res.json() as any;

    assert(res.status === 201, '1.2 Review creation succeeds as guest review');
    assert(data.success === true, '1.3 Review API returns success: true');
    assert(data.review.verifiedPurchase === false, '1.4 verifiedPurchase is STRICTLY FALSE despite submitting victim email');
  }

  // -------------------------------------------------------------------------
  // TEST 2 — Authenticated user who actually purchased the product
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Authenticated user who legitimately purchased ---');
  {
    // Alice's legitimate session token
    const aliceToken = createSignedTestToken({
      userId: 'user-alice-101',
      email: 'alice@example.com',
      role: 'customer',
      pwdSig: testPwdSig,
    });

    // Layer 1: Unit level
    const unitResult = await verifyCustomerPurchaseInD1(mockDb as any, {
      authenticatedUserId: 'user-alice-101',
      authenticatedEmail: 'alice@example.com',
      productId: 'prod-wallet-01',
    });
    assert(unitResult === true, '2.1 verifyCustomerPurchaseInD1 confirms purchase for authenticated buyer');

    // Layer 2: API level
    const req = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`,
        'x-real-ip': '198.51.100.2',
      },
      body: JSON.stringify({
        productId: 'prod-wallet-01',
        authorName: 'Alice Purchaser',
        rating: 5,
        comment: 'Genuine review from actual verified purchaser Alice',
      }),
    });

    const res = await handleApiRequest(req, env);
    const data = await res.json() as any;

    assert(res.status === 201, '2.2 Authenticated review created');
    assert(data.review.verifiedPurchase === true, '2.3 verifiedPurchase is TRUE for legitimate authenticated purchaser');
  }

  // -------------------------------------------------------------------------
  // TEST 3 — Authenticated user who did NOT purchase the product
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Authenticated user who did NOT purchase the product ---');
  {
    // Bob's legitimate session token (Bob has NO orders)
    const bobToken = createSignedTestToken({
      userId: 'user-bob-102',
      email: 'bob@example.com',
      role: 'customer',
      pwdSig: testPwdSig,
    });

    // Layer 1: Unit level
    const unitResult = await verifyCustomerPurchaseInD1(mockDb as any, {
      authenticatedUserId: 'user-bob-102',
      authenticatedEmail: 'bob@example.com',
      productId: 'prod-wallet-01',
    });
    assert(unitResult === false, '3.1 verifyCustomerPurchaseInD1 returns false for non-purchasing user');

    // Layer 2: API level with Bob passing Alice's email in request body to test spoofing
    const req = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bobToken}`,
        'x-real-ip': '198.51.100.3',
      },
      body: JSON.stringify({
        productId: 'prod-wallet-01',
        email: 'alice@example.com', // Attempting to use Alice's email while logged in as Bob
        authorName: 'Bob User',
        rating: 4,
        comment: 'Bob review attempting to spoof Alice email',
      }),
    });

    const res = await handleApiRequest(req, env);
    const data = await res.json() as any;

    assert(res.status === 201, '3.2 Bob review created');
    assert(data.review.verifiedPurchase === false, '3.3 verifiedPurchase is FALSE (server trusts authenticated identity, not client email)');
  }

  // -------------------------------------------------------------------------
  // TEST 4 — Attacker attempting to pass verifiedPurchase: true in payload
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Client-side manipulation attempt (verifiedPurchase: true) ---');
  {
    const req = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-real-ip': '198.51.100.4',
      },
      body: JSON.stringify({
        productId: 'prod-wallet-01',
        authorName: 'Hacker',
        rating: 5,
        comment: 'Hacker injection payload attempting direct verified badge',
        verifiedPurchase: true, // Malicious client override
        verified_purchase: true,
        verified: true,
      }),
    });

    const res = await handleApiRequest(req, env);
    const data = await res.json() as any;

    assert(res.status === 201, '4.1 Review created');
    assert(data.review.verifiedPurchase === false, '4.2 verifiedPurchase: true in client body is completely IGNORED');
  }

  // -------------------------------------------------------------------------
  // TEST 5 — Guest verification: order number + phone proof vs email alone
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Guest multi-factor order verification ---');
  {
    // Scenario 5a: Guest provides legitimate orderNumber AND exact phone number
    const legitGuestReq = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-real-ip': '198.51.100.5',
      },
      body: JSON.stringify({
        productId: 'prod-wallet-01',
        orderNumber: 'ORD-2026-1002',
        phone: '01899887766',
        authorName: 'Legitimate Guest',
        rating: 5,
        comment: 'Guest review with verified order number and phone',
      }),
    });

    const legitRes = await handleApiRequest(legitGuestReq, env);
    const legitData = await legitRes.json() as any;

    assert(legitRes.status === 201, '5.1 Guest review created');
    assert(legitData.review.verifiedPurchase === true, '5.2 verifiedPurchase is TRUE with valid orderNumber + phone match');

    // Scenario 5b: Attacker provides victim orderNumber but wrong/random phone
    const wrongPhoneReq = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-real-ip': '198.51.100.6',
      },
      body: JSON.stringify({
        productId: 'prod-wallet-01',
        orderNumber: 'ORD-2026-1002',
        phone: '01700000000', // Wrong phone number
        authorName: 'Attacker Guessing Order',
        rating: 5,
        comment: 'Attacker guessing order number with wrong phone',
      }),
    });

    const wrongPhoneRes = await handleApiRequest(wrongPhoneReq, env);
    const wrongPhoneData = await wrongPhoneRes.json() as any;

    assert(wrongPhoneData.review.verifiedPurchase === false, '5.3 verifiedPurchase is FALSE when phone does not match order');

    // Scenario 5c: Attacker provides guest order email alone without orderNumber/phone
    const emailOnlyReq = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-real-ip': '198.51.100.7',
      },
      body: JSON.stringify({
        productId: 'prod-wallet-01',
        email: 'guestvictim@example.com',
        authorName: 'Attacker With Guest Email',
        rating: 5,
        comment: 'Attacker providing guest email without multi-factor credentials',
      }),
    });

    const emailOnlyRes = await handleApiRequest(emailOnlyReq, env);
    const emailOnlyData = await emailOnlyRes.json() as any;

    assert(emailOnlyData.review.verifiedPurchase === false, '5.4 verifiedPurchase is FALSE when guest only provides email');
  }

  // -------------------------------------------------------------------------
  // TEST 6 — Product Slug Resolution in Review Submission
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Product slug resolution during verification ---');
  {
    const aliceToken = createSignedTestToken({
      userId: 'user-alice-101',
      email: 'alice@example.com',
      role: 'customer',
      pwdSig: testPwdSig,
    });

    // Submitting review with SEO slug 'leather-wallet' instead of 'prod-wallet-01'
    const req = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`,
        'x-real-ip': '198.51.100.8',
      },
      body: JSON.stringify({
        productId: 'leather-wallet', // Slug instead of internal id
        authorName: 'Alice Purchaser',
        rating: 5,
        comment: 'Alice reviewing via SEO slug leather-wallet',
      }),
    });

    const res = await handleApiRequest(req, env);
    const data = await res.json() as any;

    assert(res.status === 201, '6.1 Review created when using product slug');
    assert(data.review.productId === 'prod-wallet-01', '6.2 Review resolved to canonical product ID');
    assert(data.review.verifiedPurchase === true, '6.3 verifiedPurchase resolved to TRUE via canonical product match');
  }

  // -------------------------------------------------------------------------
  // TEST 7 — Cancelled orders do NOT qualify as verified purchase
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 7: Cancelled orders do NOT qualify as verified purchase ---');
  {
    // Alice ordered 'prod-watch-01', but that order (ORD-2026-1003) is Cancelled!
    const aliceToken = createSignedTestToken({
      userId: 'user-alice-101',
      email: 'alice@example.com',
      role: 'customer',
      pwdSig: testPwdSig,
    });

    const req = new Request('http://localhost:3000/api/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`,
        'x-real-ip': '198.51.100.9',
      },
      body: JSON.stringify({
        productId: 'prod-watch-01',
        authorName: 'Alice Purchaser',
        rating: 2,
        comment: 'Alice reviewing a watch from a cancelled order',
      }),
    });

    const res = await handleApiRequest(req, env);
    const data = await res.json() as any;

    assert(res.status === 201, '7.1 Review created for cancelled order product');
    assert(data.review.verifiedPurchase === false, '7.2 verifiedPurchase is FALSE for cancelled orders');
  }

  console.log('\n========================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running verification tests:', err);
  process.exit(1);
});
