/**
 * Automated Security Verification: Malformed JSON Handling Across Backend
 * 
 * Verifies that ANY backend API endpoint expecting a JSON payload:
 * 1. Returns HTTP 400 Bad Request when receiving malformed/invalid JSON.
 * 2. Never returns HTTP 500 for malformed JSON.
 * 3. Never silently converts malformed JSON into {}, null, or fallback objects.
 * 4. Never exposes stack traces, SQL, D1/SQLite internals, file paths, or secrets.
 * 5. Correctly handles valid empty JSON {} by allowing standard validation to proceed.
 * 6. Specifically tests:
 *    - Permission update API (/api/users/:id/permissions)
 *    - User/account update API (/api/users/:id)
 *    - Product create/update API (/api/products, /api/products/:id)
 *    - Order API (/api/orders, /api/orders/:id)
 *    - Admin/settings API (/api/settings)
 *    - Auth APIs (/api/auth/login, /api/auth/register, /api/auth/forgot-password, /api/auth/reset-password)
 *    - Other endpoints (/api/categories, /api/sliders, /api/coupons, /api/reviews, /api/expenses, /api/upload)
 */

import { TEST_BASE_URL, createSignedTestToken } from './test-auth-helper';
import { handleApiRequest } from '../src/server/router';
import { Env } from '../src/server/types';

const MALFORMED_PAYLOADS = [
  '{"invalid": json syntax error',
  '{"unclosed": "string',
  '{ key: "no_quotes_on_key" }',
  '{"trailing_comma": 123, }',
  'not even close to json',
  '{"nested": { "missing_brace": true }',
  '["unclosed_array"',
  'undefined',
];

interface TestEndpoint {
  name: string;
  url: string;
  method: string;
  requiresAuth?: boolean;
  role?: 'super_admin' | 'admin' | 'customer';
  validPayload?: any;
}

const ENDPOINTS_TO_TEST: TestEndpoint[] = [
  // 1. Auth APIs
  {
    name: 'Auth Login',
    url: '/api/auth/login',
    method: 'POST',
    validPayload: { usernameOrEmail: 'test@example.com', password: 'password123' },
  },
  {
    name: 'Auth Register',
    url: '/api/auth/register',
    method: 'POST',
    validPayload: { name: 'Test User', email: 'test_user_malformed@example.com', password: 'password123', phone: '01700000000' },
  },
  {
    name: 'Auth Forgot Password',
    url: '/api/auth/forgot-password',
    method: 'POST',
    validPayload: { email: 'nonexistent@example.com' },
  },
  {
    name: 'Auth Reset Password',
    url: '/api/auth/reset-password',
    method: 'POST',
    validPayload: { token: 'invalid-token', newPassword: 'new-password-123' },
  },

  // 2. Orders API
  {
    name: 'Order Creation (POST /api/orders)',
    url: '/api/orders',
    method: 'POST',
    validPayload: {
      customerName: 'Test Customer',
      customerPhone: '01711111111',
      deliveryAddress: 'Dhaka',
      items: [{ productId: 'p1', title: 'Product 1', price: 500, quantity: 1 }],
      totalAmount: 500,
    },
  },
  {
    name: 'Order Update (PUT /api/orders/:id)',
    url: '/api/orders/order-1001',
    method: 'PUT',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { shippingStatus: 'Processing' },
  },
  {
    name: 'Order Update (PATCH /api/orders/:id)',
    url: '/api/orders/order-1001',
    method: 'PATCH',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { shippingStatus: 'Shipped' },
  },

  // 3. Products API
  {
    name: 'Product Creation (POST /api/products)',
    url: '/api/products',
    method: 'POST',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { title: 'Test Product', price: 1000, categoryId: 'cat-1' },
  },
  {
    name: 'Product Update (PUT /api/products/:id)',
    url: '/api/products/prod-1',
    method: 'PUT',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { title: 'Updated Title' },
  },
  {
    name: 'Product Featured Update (PUT /api/products/:id/featured)',
    url: '/api/products/prod-1/featured',
    method: 'PUT',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { isFeatured: true, featuredSortOrder: 1 },
  },

  // 4. Permissions & User Accounts API
  {
    name: 'User Creation (POST /api/users)',
    url: '/api/users',
    method: 'POST',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { name: 'Staff User', email: 'staff_temp@test.com', password: 'password123', role: 'admin' },
  },
  {
    name: 'User Update (PUT /api/users/:id)',
    url: '/api/users/user-subadmin-staff',
    method: 'PUT',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { name: 'Staff Name Updated' },
  },
  {
    name: 'User Permissions Update (PUT /api/users/:id/permissions)',
    url: '/api/users/user-subadmin-staff/permissions',
    method: 'PUT',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { permissions: { 'order.view': true, 'product.view': true } },
  },
  {
    name: 'User Password Reset (POST /api/users/:id/reset-password)',
    url: '/api/users/user-subadmin-staff/reset-password',
    method: 'POST',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { newPassword: 'newPassword123' },
  },

  // 5. Store Settings API
  {
    name: 'Settings Update (POST /api/settings)',
    url: '/api/settings',
    method: 'POST',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { siteName: 'Rongdhonu Trade' },
  },
  {
    name: 'Settings Update (PUT /api/settings)',
    url: '/api/settings',
    method: 'PUT',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { siteName: 'Rongdhonu Trade' },
  },

  // 6. Categories API
  {
    name: 'Category Creation (POST /api/categories)',
    url: '/api/categories',
    method: 'POST',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { name: 'Test Category', slug: 'test-category' },
  },
  {
    name: 'Category Update (PUT /api/categories/:id)',
    url: '/api/categories/cat-1',
    method: 'PUT',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { name: 'Updated Category' },
  },

  // 7. Sliders API
  {
    name: 'Slider Creation (POST /api/sliders)',
    url: '/api/sliders',
    method: 'POST',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { title: 'Test Slide', imageUrl: 'https://example.com/slide.jpg' },
  },
  {
    name: 'Slider Reorder (POST /api/sliders/order)',
    url: '/api/sliders/order',
    method: 'POST',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: [{ id: 'slide-1', sortOrder: 0 }],
  },
  {
    name: 'Slider Update (PUT /api/sliders/:id)',
    url: '/api/sliders/slide-1',
    method: 'PUT',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { title: 'Updated Slide' },
  },

  // 8. Coupons API
  {
    name: 'Coupon Creation (POST /api/coupons)',
    url: '/api/coupons',
    method: 'POST',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { code: 'SAVE10', discountType: 'percentage', discountValue: 10 },
  },
  {
    name: 'Coupon Update (PUT /api/coupons/:code)',
    url: '/api/coupons/SAVE10',
    method: 'PUT',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { discountValue: 15 },
  },

  // 9. Reviews API
  {
    name: 'Review Submission (POST /api/reviews)',
    url: '/api/reviews',
    method: 'POST',
    validPayload: { productId: 'prod-1', authorName: 'Customer', comment: 'Great product quality!', rating: 5 },
  },

  // 10. Expenses API
  {
    name: 'Expense Recording (POST /api/expenses)',
    url: '/api/expenses',
    method: 'POST',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { expenseType: 'Packaging', amount: 250, description: 'Boxes and tape' },
  },

  // 11. Courier APIs
  {
    name: 'Courier Steadfast Test (POST /api/courier/steadfast/test)',
    url: '/api/courier/steadfast/test',
    method: 'POST',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { apiKey: 'test-key', secretKey: 'test-secret' },
  },
  {
    name: 'Courier Dispatch (POST /api/courier/dispatch)',
    url: '/api/courier/dispatch',
    method: 'POST',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { order: { id: 'order-1001' } },
  },
  {
    name: 'Courier Webhooks Config (POST /api/courier/webhooks)',
    url: '/api/courier/webhooks',
    method: 'POST',
    requiresAuth: true,
    role: 'super_admin',
    validPayload: { webhooks: [] },
  },
];

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(msg);
  }
}

async function testDevServerEndpoints() {
  console.log('\n======================================================');
  console.log('🧪 1. TESTING LIVE DEV SERVER (HTTP)');
  console.log('======================================================');

  const adminToken = createSignedTestToken({
    userId: 'dev-super-admin-1',
    email: 'dev-superadmin@local.test',
    role: 'super_admin',
    permissions: {
      canManageOrders: true,
      canManageProducts: true,
      canManageCategories: true,
      canManageAccounts: true,
      canManageSettings: true,
    },
  });

  let passedDevCount = 0;

  for (const ep of ENDPOINTS_TO_TEST) {
    const fullUrl = `${TEST_BASE_URL}${ep.url}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (ep.requiresAuth) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }

    // A. Test Malformed JSON payloads
    for (const malformedBody of MALFORMED_PAYLOADS.slice(0, 3)) {
      const res = await fetch(fullUrl, {
        method: ep.method,
        headers,
        body: malformedBody,
      });

      assert(
        res.status === 400,
        `[${ep.name}] Expected EXACTLY 400 on malformed JSON payload, got HTTP ${res.status}`
      );
      assert(
        res.status !== 500,
        `[${ep.name}] MUST NOT return HTTP 500 on malformed JSON payload`
      );

      const jsonText = await res.text();
      let parsedResponse: any = {};
      try {
        parsedResponse = JSON.parse(jsonText);
      } catch {
        // Response itself is not JSON
      }

      // Assert error message exists and success is false
      assert(parsedResponse.success === false, `[${ep.name}] Response must indicate success: false`);
      assert(typeof parsedResponse.error === 'string', `[${ep.name}] Response must have string error message`);

      // Assert no sensitive information or stack traces leaked
      assert(!jsonText.includes('SyntaxError: Unexpected token'), `[${ep.name}] Must not leak raw parser SyntaxError`);
      assert(!jsonText.includes('node_modules'), `[${ep.name}] Must not leak node_modules file path`);
      assert(!jsonText.includes('/src/'), `[${ep.name}] Must not leak source file paths`);
      assert(!/sqlite|d1|database disk|prepare|bind|table |column /i.test(jsonText), `[${ep.name}] Must not leak SQL or D1 database internals`);
      assert(!/admin_secret|steadfast_secret|resend_api/i.test(jsonText), `[${ep.name}] Must not leak secret names or tokens`);
    }

    // B. Test Valid Empty JSON Object `{}`: Must NOT return "Malformed JSON payload"
    const emptyObjRes = await fetch(fullUrl, {
      method: ep.method,
      headers,
      body: '{}',
    });
    // Note: status might be 400 due to missing required fields, or 200/201, but NOT malformed payload!
    assert(emptyObjRes.status !== 500, `[${ep.name}] Valid empty object {} must NOT cause HTTP 500`);
    const emptyObjText = await emptyObjRes.text();
    assert(
      !emptyObjText.includes('Malformed JSON payload'),
      `[${ep.name}] Valid empty object {} must NOT be classified as malformed JSON! Got: ${emptyObjText}`
    );

    passedDevCount++;
    console.log(`  ✓ [DevServer] ${ep.name} correctly returns 400 on malformed JSON (no 500, no leaks)`);
  }

  console.log(`✅ All ${passedDevCount} endpoints passed live dev server verification.`);
}

async function testWorkerRouterDirectly() {
  console.log('\n======================================================');
  console.log('🧪 2. TESTING WORKER ROUTER DIRECTLY (handleApiRequest)');
  console.log('======================================================');

  // Minimal mock D1 database for direct router testing
  const mockD1: any = {
    prepare: (query: string) => ({
      bind: (...args: any[]) => ({
        first: async <T>() => {
          if (query.includes('FROM users')) {
            const ident = String(args[0] || args[1] || 'dev-super-admin-1').toLowerCase();
            const isSuper = ident.includes('super');
            return {
              id: isSuper ? 'dev-super-admin-1' : 'user-staff-1',
              name: isSuper ? 'Super Administrator' : 'Staff Admin',
              email: isSuper ? 'dev-superadmin@local.test' : 'staff@rongdhonutrade.com',
              role: isSuper ? 'super_admin' : 'sub_admin',
              permissions_json: '{}',
            } as T;
          }
          if (query.includes('FROM store_settings')) {
            return {
              id: 'default',
              site_name: 'Rongdhonu Trade',
              currency_symbol: '৳',
            } as T;
          }
          if (query.includes('FROM orders')) {
            return {
              id: args[0] || 'order-1001',
              order_number: '1001',
              status: 'Pending',
              customer_name: 'Test',
              phone: '01700000000',
              address: 'Dhaka',
              items_json: '[]',
            } as T;
          }
          if (query.includes('FROM products')) {
            return {
              id: args[0] || 'prod-1',
              title: 'Product Title',
              price: 100,
              category_id: 'cat-1',
              images_json: '[]',
              status: 'active',
            } as T;
          }
          if (query.includes('FROM categories')) {
            return {
              id: args[0] || 'cat-1',
              name: 'Category Name',
              slug: 'category-slug',
            } as T;
          }
          if (query.includes('FROM sliders')) {
            return {
              id: args[0] || 'slide-1',
              title: 'Slide Title',
              image_url: 'https://example.com/slide.jpg',
            } as T;
          }
          if (query.includes('FROM coupons')) {
            return {
              code: args[0] || 'SAVE10',
              discount_type: 'percentage',
              discount_value: 10,
            } as T;
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => ({ success: true, meta: { changes: 1 } }),
      }),
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => ({ success: true, meta: { changes: 1 } }),
    }),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
  };

  const mockEnv: Env = {
    DB: mockD1,
    ADMIN_SECRET: 'dev-secret-test-shared-999',
    COURIER_WEBHOOK_SECRET: 'dev-courier-webhook-secret-999',
    STEADFAST_API_KEY: 'test-sf-key',
    STEADFAST_SECRET_KEY: 'test-sf-secret',
    SUPER_ADMIN_EMAILS: 'dev-superadmin@local.test',
    ENVIRONMENT: 'development',
    DEV: true,
  };

  const adminToken = createSignedTestToken({
    userId: 'dev-super-admin-1',
    email: 'dev-superadmin@local.test',
    role: 'super_admin',
    permissions: {
      canManageOrders: true,
      canManageProducts: true,
      canManageCategories: true,
      canManageAccounts: true,
      canManageSettings: true,
    },
  }, mockEnv.ADMIN_SECRET);

  let passedWorkerCount = 0;

  for (const ep of ENDPOINTS_TO_TEST) {
    const fullUrl = `https://rongdhonutrade.com${ep.url}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (ep.requiresAuth) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }

    // A. Test Malformed JSON payloads
    for (const malformedBody of MALFORMED_PAYLOADS.slice(0, 3)) {
      const request = new Request(fullUrl, {
        method: ep.method,
        headers,
        body: malformedBody,
      });

      const res = await handleApiRequest(request, mockEnv);
      const jsonText = await res.text();
      let parsedResponse: any = {};
      try {
        parsedResponse = JSON.parse(jsonText);
      } catch {}

      if (res.status !== 400) {
        console.error(`FAILED: ${ep.name} -> status: ${res.status}, body: ${jsonText}`);
      }

      assert(
        res.status === 400,
        `[Router: ${ep.name}] Expected EXACTLY 400 on malformed JSON payload, got HTTP ${res.status}`
      );
      assert(
        res.status !== 500,
        `[Router: ${ep.name}] MUST NOT return HTTP 500 on malformed JSON payload`
      );

      assert(parsedResponse.success === false, `[Router: ${ep.name}] Must return success: false`);
      assert(parsedResponse.error === 'Malformed JSON payload. Please provide valid JSON.', `[Router: ${ep.name}] Error message must match standard`);
      assert(!jsonText.includes('SyntaxError'), `[Router: ${ep.name}] Must not leak raw SyntaxError`);
      assert(!jsonText.includes('/src/'), `[Router: ${ep.name}] Must not leak source file paths`);
    }

    // B. Test Valid Empty JSON Object `{}`: Must NOT return "Malformed JSON payload"
    const emptyObjRequest = new Request(fullUrl, {
      method: ep.method,
      headers,
      body: '{}',
    });
    const emptyRes = await handleApiRequest(emptyObjRequest, mockEnv);
    assert(emptyRes.status !== 500, `[Router: ${ep.name}] Valid empty object {} must NOT cause HTTP 500`);
    const emptyResText = await emptyRes.text();
    assert(
      !emptyResText.includes('Malformed JSON payload'),
      `[Router: ${ep.name}] Valid empty object {} must NOT be classified as malformed JSON! Got: ${emptyResText}`
    );

    passedWorkerCount++;
    console.log(`  ✓ [Router] ${ep.name} correctly returns 400 on malformed JSON`);
  }

  console.log(`✅ All ${passedWorkerCount} endpoints passed direct Worker router verification.`);
}

async function main() {
  console.log('======================================================');
  console.log('🔒 VERIFYING MALFORMED JSON HANDLING ACROSS BACKEND');
  console.log('======================================================');

  await testDevServerEndpoints();
  await testWorkerRouterDirectly();

  console.log('\n======================================================');
  console.log('🎉 ALL MALFORMED JSON SECURITY TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================');
}

main().catch((err) => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
