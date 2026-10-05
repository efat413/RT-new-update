import assert from 'assert';
import { handleApiRequest } from '../src/server/router';
import { Env } from '../src/server/types';
import { getTestStaffToken } from './test-auth-helper';

const BASE_URL = 'http://localhost:3000';

const FORBIDDEN_WORDS = [
  'SQLITE',
  'D1_ERROR',
  'no such table',
  'syntax error',
  '/src/',
  '/app/',
  '.env',
  'ADMIN_SECRET',
  'COURIER_WEBHOOK_SECRET',
  'STEADFAST_API_KEY',
  'STEADFAST_SECRET_KEY',
  'RESEND_API_KEY',
  'DEV_ADMIN_PASSWORD',
  'dev-secret-test-shared-999',
  'dev-courier-webhook-secret-999',
];

function assertNoLeaks(text: string, contextDescription: string) {
  for (const forbidden of FORBIDDEN_WORDS) {
    assert(
      !text.toLowerCase().includes(forbidden.toLowerCase()),
      `[LEAK DETECTED] in ${contextDescription}: Response body contained forbidden string "${forbidden}". Body: ${text.slice(0, 300)}`
    );
  }
  // Check for stack trace patterns
  assert(
    !/at\s+[a-zA-Z0-9_$.<>]+\s+\([^)]+:[0-9]+:[0-9]+\)/i.test(text),
    `[STACK TRACE DETECTED] in ${contextDescription}: Response body contained stack trace. Body: ${text.slice(0, 300)}`
  );
  assert(
    !/\b(ReferenceError|TypeError|RangeError|SyntaxError):\s+/i.test(text),
    `[EXCEPTION TYPE DETECTED] in ${contextDescription}: Response body contained internal JS exception. Body: ${text.slice(0, 300)}`
  );
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING HARDENED BACKEND ERROR HANDLING TEST SUITE');
  console.log('====================================================');

  // Verify server is reachable
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert(healthRes.status === 200, `Health check must return 200 (got ${healthRes.status})`);
  console.log('✓ Health check passed (HTTP 200)');

  // 1. Validation errors return 400 with safe client message
  console.log('\n[Test 1] Input validation errors return HTTP 400 with safe client message');
  const emptyOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order: {
        customer: { fullName: '', phone: '', fullAddress: '' },
      },
    }),
  });
  assert(emptyOrderRes.status === 400, `Empty customer returns 400 (got ${emptyOrderRes.status})`);
  const emptyOrderText = await emptyOrderRes.text();
  assertNoLeaks(emptyOrderText, 'Input validation 400');
  const emptyOrderData = JSON.parse(emptyOrderText);
  assert(emptyOrderData.success === false, 'success is false');
  assert(typeof emptyOrderData.error === 'string', 'error message exists');
  console.log(`  ✓ 400 returned: "${emptyOrderData.error}"`);

  // 2. Short / invalid phone number returns 400 with safe message
  console.log('\n[Test 2] Invalid Bangladeshi phone number returns HTTP 400');
  const shortPhoneRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order: {
        customer: { fullName: 'Test Customer', phone: '01700', fullAddress: 'Dhaka' },
        items: [{ product: { id: 'prod-1', title: 'Test', price: 100 }, quantity: 1 }],
      },
    }),
  });
  assert(shortPhoneRes.status === 400, `Invalid phone returns 400 (got ${shortPhoneRes.status})`);
  const shortPhoneText = await shortPhoneRes.text();
  assertNoLeaks(shortPhoneText, 'Invalid phone 400');
  const shortPhoneData = JSON.parse(shortPhoneText);
  assert(shortPhoneData.error.includes('contact phone number') || shortPhoneData.error.includes('contact number'), 'Phone validation error returned');
  console.log(`  ✓ 400 returned: "${shortPhoneData.error}"`);

  // 3. Order with empty items returns 400 with safe message
  console.log('\n[Test 3] Order with empty items returns HTTP 400');
  const noItemsRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order: {
        customer: { fullName: 'Test Customer', phone: '01711223344', fullAddress: 'Dhaka' },
        items: [],
      },
    }),
  });
  assert(noItemsRes.status === 400, `No items returns 400 (got ${noItemsRes.status})`);
  const noItemsText = await noItemsRes.text();
  assertNoLeaks(noItemsText, 'No items 400');
  const noItemsData = JSON.parse(noItemsText);
  assert(noItemsData.error === 'Order must contain at least one item.', `Expected "Order must contain at least one item." (got "${noItemsData.error}")`);
  console.log(`  ✓ 400 returned: "${noItemsData.error}"`);

  // 4. Missing Resource returns 404
  console.log('\n[Test 4] Non-existent resource returns HTTP 404');
  const notFoundRes = await fetch(`${BASE_URL}/api/products/non-existent-product-id-9999`);
  assert(notFoundRes.status === 404, `Missing product returns 404 (got ${notFoundRes.status})`);
  const notFoundText = await notFoundRes.text();
  assertNoLeaks(notFoundText, 'Missing product 404');
  const notFoundData = JSON.parse(notFoundText);
  assert(notFoundData.error === 'Not found' || notFoundData.error === 'Product not found', `404 error returned (got "${notFoundData.error}")`);
  console.log(`  ✓ 404 returned: "${notFoundData.error}"`);

  const notFoundEndpointRes = await fetch(`${BASE_URL}/api/non-existent-endpoint-xyz`);
  assert(notFoundEndpointRes.status === 404, `Missing endpoint returns 404 (got ${notFoundEndpointRes.status})`);
  const notFoundEndpointText = await notFoundEndpointRes.text();
  assertNoLeaks(notFoundEndpointText, 'Missing endpoint 404');
  const notFoundEndpointData = JSON.parse(notFoundEndpointText);
  assert(notFoundEndpointData.error === 'Endpoint not found', `Expected "Endpoint not found" (got "${notFoundEndpointData.error}")`);
  console.log(`  ✓ 404 endpoint returned: "${notFoundEndpointData.error}"`);

  // 5. Unauthenticated returns 401
  console.log('\n[Test 5] Missing / Invalid authentication returns HTTP 401');
  const unauthRes = await fetch(`${BASE_URL}/api/admin/profit-analytics`);
  assert(unauthRes.status === 401, `Missing auth returns 401 (got ${unauthRes.status})`);
  const unauthText = await unauthRes.text();
  assertNoLeaks(unauthText, 'Unauthenticated 401');
  const unauthData = JSON.parse(unauthText);
  assert(unauthData.success === false, 'success is false');
  console.log(`  ✓ 401 returned on missing auth: "${unauthData.error}"`);

  const invalidTokenRes = await fetch(`${BASE_URL}/api/admin/profit-analytics`, {
    headers: { Authorization: 'Bearer invalid.bogus.jwt.token' },
  });
  assert(invalidTokenRes.status === 401, `Invalid token returns 401 (got ${invalidTokenRes.status})`);
  const invalidTokenText = await invalidTokenRes.text();
  assertNoLeaks(invalidTokenText, 'Invalid token 401');
  const invalidTokenData = JSON.parse(invalidTokenText);
  assert(invalidTokenData.success === false, 'success is false');
  console.log(`  ✓ 401 returned on invalid token: "${invalidTokenData.error}"`);

  // 6. Authenticated without required permission returns 403
  console.log('\n[Test 6] Authenticated user without required permission returns HTTP 403');
  // Log in as staff (sub_admin without report.profit permission)
  const staffToken = await getTestStaffToken(BASE_URL);
  const forbiddenRes = await fetch(`${BASE_URL}/api/admin/profit-analytics`, {
    headers: {
      Authorization: `Bearer ${staffToken}`,
      Cookie: `auth_token=${staffToken}`,
    },
  });
  assert(forbiddenRes.status === 403, `Forbidden returns 403 (got ${forbiddenRes.status})`);
  const forbiddenText = await forbiddenRes.text();
  assertNoLeaks(forbiddenText, 'Forbidden 403');
  const forbiddenData = JSON.parse(forbiddenText);
  assert(forbiddenData.success === false, 'success is false');
  assert(forbiddenData.error.includes('Forbidden'), 'Error explains forbidden action');
  console.log(`  ✓ 403 returned on unauthorized permission: "${forbiddenData.error}"`);

  // 7. Malformed JSON returns 400 without syntax error leaks
  console.log('\n[Test 7] Malformed JSON payload returns HTTP 400 with safe message (no syntax error leak)');
  const malformedJsonRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"invalid": json syntax error without quotes',
  });
  assert(malformedJsonRes.status === 400, `Expected HTTP 400 for malformed JSON, got ${malformedJsonRes.status}`);
  const malformedText = await malformedJsonRes.text();
  assertNoLeaks(malformedText, 'Malformed JSON 400');
  const malformedData = JSON.parse(malformedText);
  assert(malformedData.success === false, 'success is false');
  assert(malformedData.error === 'Malformed JSON payload. Please provide valid JSON.', `Safe error returned (got "${malformedData.error}")`);
  console.log(`  ✓ 400 returned for malformed JSON: "${malformedData.error}"`);

  // 8. SQL injection strings handled without raw SQL or database leaks
  console.log('\n[Test 8] SQL injection attempt handled safely without internal leaks');
  const sqliRes = await fetch(`${BASE_URL}/api/products?search=' OR 1=1; DROP TABLE orders;--`);
  assert(sqliRes.status === 200 || sqliRes.status === 400, `SQLi query handled safely (got ${sqliRes.status})`);
  const sqliText = await sqliRes.text();
  assertNoLeaks(sqliText, 'SQL injection attempt');
  console.log('  ✓ SQL injection query handled cleanly without raw database leakage');

  // 9. Simulated Database Error returns HTTP 500 with generic safe response
  console.log('\n[Test 9] Triggered Database Error returns HTTP 500 with generic safe response');
  const dbErrorRes = await fetch(`${BASE_URL}/api/orders`, {
    headers: { 'x-test-simulate': 'db-error' },
  });
  assert(dbErrorRes.status === 500, `Expected HTTP 500 for database error, got ${dbErrorRes.status}`);
  const dbErrorText = await dbErrorRes.text();
  assertNoLeaks(dbErrorText, 'Simulated database error 500');
  const dbErrorData = JSON.parse(dbErrorText);
  assert(dbErrorData.success === false, 'success is false');
  assert(dbErrorData.error === 'Internal server error.', `Expected "Internal server error." (got "${dbErrorData.error}")`);
  console.log(`  ✓ HTTP 500 returned for database error: "${dbErrorData.error}"`);

  // 10. Simulated Unexpected Exception returns HTTP 500 with generic safe response
  console.log('\n[Test 10] Triggered Unexpected Exception returns HTTP 500 with generic safe response');
  const unhandledRes = await fetch(`${BASE_URL}/api/orders`, {
    headers: { 'x-test-simulate': 'unexpected-error' },
  });
  assert(unhandledRes.status === 500, `Expected HTTP 500 for unexpected error, got ${unhandledRes.status}`);
  const unhandledText = await unhandledRes.text();
  assertNoLeaks(unhandledText, 'Simulated unexpected exception 500');
  const unhandledData = JSON.parse(unhandledText);
  assert(unhandledData.success === false, 'success is false');
  assert(unhandledData.error === 'Internal server error.', `Expected "Internal server error." (got "${unhandledData.error}")`);
  console.log(`  ✓ HTTP 500 returned for unexpected exception: "${unhandledData.error}"`);

  // 11. Worker handleApiRequest unit tests with failing D1 binding
  console.log('\n[Test 11] Cloudflare Worker handleApiRequest directly tested with failing D1 database');
  const mockFailingEnv: Env = {
    DB: {
      prepare: () => {
        throw new Error('D1_ERROR: SQLITE_CORRUPT: database disk image is malformed at /src/server/db.ts:100');
      },
      batch: async () => {
        throw new Error('D1_ERROR: SQLITE_BUSY: database is locked');
      },
      exec: async () => {
        throw new Error('D1_ERROR: no such table: orders');
      },
      dump: async () => new ArrayBuffer(0),
    } as any,
    ADMIN_SECRET: 'dev-secret-test-shared-999',
    COURIER_WEBHOOK_SECRET: 'dev-courier-webhook-secret-999',
  };

  const req = new Request('https://rongdhonutrade.com/api/products', { method: 'GET' });
  const workerResp = await handleApiRequest(req, mockFailingEnv);
  assert(workerResp.status === 500, `Worker must return HTTP 500 on D1 failure (got ${workerResp.status})`);
  const workerText = await workerResp.text();
  assertNoLeaks(workerText, 'Direct Worker failing D1 test');
  const workerData = JSON.parse(workerText);
  assert(workerData.success === false, 'success is false');
  assert(workerData.error === 'Internal server error.', `Expected "Internal server error." (got "${workerData.error}")`);
  console.log(`  ✓ Cloudflare Worker returned HTTP 500 with: "${workerData.error}"`);

  // 12. Worker handleApiRequest directly tested with missing D1 binding (!env.DB)
  console.log('\n[Test 12] Cloudflare Worker handleApiRequest tested with missing D1 binding (!env.DB)');
  const mockMissingDbEnv: Env = {
    ADMIN_SECRET: 'dev-secret-test-shared-999',
    COURIER_WEBHOOK_SECRET: 'dev-courier-webhook-secret-999',
  };
  const reqMissingDb = new Request('https://rongdhonutrade.com/api/products', { method: 'GET' });
  const missingDbResp = await handleApiRequest(reqMissingDb, mockMissingDbEnv);
  assert(missingDbResp.status === 500, `Worker must return HTTP 500 on missing DB binding (got ${missingDbResp.status})`);
  const missingDbText = await missingDbResp.text();
  assertNoLeaks(missingDbText, 'Direct Worker missing D1 binding test');
  const missingDbData = JSON.parse(missingDbText);
  assert(missingDbData.success === false, 'success is false');
  assert(missingDbData.error === 'Internal server error.', `Expected "Internal server error." (got "${missingDbData.error}")`);
  console.log(`  ✓ Cloudflare Worker returned HTTP 500 with: "${missingDbData.error}"`);

  console.log('\n====================================================');
  console.log('✅ ALL HARDENED BACKEND ERROR HANDLING TESTS PASSED!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

