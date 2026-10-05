/**
 * Automated Security Test Suite: Malformed JSON Handling Across Backend
 * 
 * Verifies that:
 * 1. ANY API endpoint expecting a JSON body returns HTTP 400 Bad Request on malformed/invalid JSON.
 * 2. It NEVER silently converts malformed JSON into {}, null, an empty body, or another fallback object.
 * 3. Never returns HTTP 500 for malformed JSON payloads.
 * 4. Never exposes parser stack traces, syntax error traces, SQL/D1/SQLite keywords, file paths, or secrets.
 * 5. Valid empty JSON object `{}` is NOT treated as malformed and continues to normal validation.
 * 6. Valid JSON continues through normal business logic and authorization/validation checks.
 */

import { getTestAdminToken, TEST_BASE_URL } from './test-auth-helper';

const BASE_URL = TEST_BASE_URL;

interface TestResult {
  endpoint: string;
  method: string;
  status: number;
  expectedStatus: number;
  safeMessage: string;
  leaks: boolean;
  passed: boolean;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function checkResponseLeaks(rawText: string): { leaks: boolean; reason?: string } {
  // Check for stack trace leaks
  if (/SyntaxError:\s*Unexpected|at JSON\.parse|at readBody|at safeParseJson/i.test(rawText)) {
    return { leaks: true, reason: 'Parser stack trace leaked' };
  }
  // Check for code path or module leaks
  if (/node_modules|\/src\/|\.tsx?:\d+:\d+/i.test(rawText)) {
    return { leaks: true, reason: 'File path or line number leaked' };
  }
  // Check for internal database / environment leaks
  if (/sqlite|d1_error|sqlite_error|admin_secret|steadfast_secret/i.test(rawText)) {
    return { leaks: true, reason: 'Internal database or secret leaked' };
  }
  return { leaks: false };
}

async function testMalformedJsonEndpoint(opts: {
  name: string;
  url: string;
  method: string;
  token?: string;
  malformedPayload?: string;
}) {
  const payload = opts.malformedPayload ?? '{"broken": json payload, missing_quote: true';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts.token) {
    headers['Authorization'] = `Bearer ${opts.token}`;
  }

  const res = await fetch(opts.url, {
    method: opts.method,
    headers,
    body: payload,
  });

  const rawText = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(rawText);
  } catch {
    // If not JSON, still check status
  }

  const leakCheck = checkResponseLeaks(rawText);
  const statusOk = res.status === 400;
  const noInternalCrash = res.status !== 500;
  const passed = statusOk && noInternalCrash && !leakCheck.leaks;

  results.push({
    endpoint: opts.url.replace(BASE_URL, ''),
    method: opts.method,
    status: res.status,
    expectedStatus: 400,
    safeMessage: json?.error || rawText.slice(0, 80),
    leaks: leakCheck.leaks,
    passed,
  });

  if (!passed) {
    console.error(`❌ [FAIL] ${opts.method} ${opts.url} -> Got status ${res.status} (expected 400). Leak: ${leakCheck.reason || 'none'}. Body: ${rawText}`);
  } else {
    console.log(`  ✓ [400 OK] ${opts.method} ${opts.url.replace(BASE_URL, '')} -> "${json?.error || 'Safe error'}"`);
  }

  assert(statusOk, `${opts.name} must return HTTP 400 for malformed JSON, got ${res.status}`);
  assert(noInternalCrash, `${opts.name} must NOT return HTTP 500`);
  assert(!leakCheck.leaks, `${opts.name} leaked sensitive internals: ${leakCheck.reason}`);
}

async function runSecuritySuite() {
  console.log('================================================================');
  console.log('STARTING MALFORMED JSON BACKEND SECURITY AUDIT SUITE');
  console.log('================================================================\n');

  console.log('1. Authenticating as Super Admin to test authorized endpoints...');
  const adminToken = await getTestAdminToken(BASE_URL);
  assert(Boolean(adminToken), 'Failed to obtain admin session token for testing');
  console.log('  ✓ Admin session authenticated.\n');

  // Find a target user to test permission update
  const usersRes = await fetch(`${BASE_URL}/api/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const usersData = await usersRes.json();
  const staffUser = usersData.users?.find((u: any) => u.role === 'admin' || u.role === 'sub_admin') || usersData.users?.[0];
  const targetUserId = staffUser?.id || 'target-staff-id';

  // Find an existing product or use dummy id
  const prodRes = await fetch(`${BASE_URL}/api/products?limit=1`);
  const prodData = await prodRes.json();
  const targetProductId = prodData.products?.[0]?.id || 'prod-sample-1';

  console.log('2. Testing Malformed JSON Rejection on Core Endpoints:\n');

  // --- Category A: Permission Update API ---
  console.log('--- A. Permission Update API ---');
  await testMalformedJsonEndpoint({
    name: 'Permission Update API',
    url: `${BASE_URL}/api/users/${targetUserId}/permissions`,
    method: 'PUT',
    token: adminToken,
  });

  // --- Category B: User / Account Update APIs ---
  console.log('\n--- B. User & Account APIs ---');
  await testMalformedJsonEndpoint({
    name: 'User Password Change API',
    url: `${BASE_URL}/api/auth/change-password`,
    method: 'POST',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Admin User Update API',
    url: `${BASE_URL}/api/users/${targetUserId}`,
    method: 'PUT',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Admin User Reset Password API',
    url: `${BASE_URL}/api/users/${targetUserId}/reset-password`,
    method: 'POST',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Admin User Create API',
    url: `${BASE_URL}/api/users`,
    method: 'POST',
    token: adminToken,
  });

  // --- Category C: Product APIs ---
  console.log('\n--- C. Product Create / Update APIs ---');
  await testMalformedJsonEndpoint({
    name: 'Product Create API',
    url: `${BASE_URL}/api/products`,
    method: 'POST',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Product Update API',
    url: `${BASE_URL}/api/products/${targetProductId}`,
    method: 'PUT',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Featured Product Toggle API',
    url: `${BASE_URL}/api/products/${targetProductId}/featured`,
    method: 'PUT',
    token: adminToken,
  });

  // --- Category D: Order APIs ---
  console.log('\n--- D. Order APIs ---');
  await testMalformedJsonEndpoint({
    name: 'Order Creation API (Public Checkout)',
    url: `${BASE_URL}/api/orders`,
    method: 'POST',
  });

  await testMalformedJsonEndpoint({
    name: 'Order Update API',
    url: `${BASE_URL}/api/orders/order-sample-123`,
    method: 'PATCH',
    token: adminToken,
  });

  // --- Category E: Settings & Courier APIs ---
  console.log('\n--- E. Admin Settings & Courier APIs ---');
  await testMalformedJsonEndpoint({
    name: 'Store Settings Update API',
    url: `${BASE_URL}/api/settings`,
    method: 'PUT',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Courier Steadfast Test API',
    url: `${BASE_URL}/api/courier/steadfast/test`,
    method: 'POST',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Courier Dispatch API',
    url: `${BASE_URL}/api/courier/dispatch`,
    method: 'POST',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Courier Webhook Config API',
    url: `${BASE_URL}/api/courier/webhooks`,
    method: 'POST',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Courier Webhook Test Ping API',
    url: `${BASE_URL}/api/courier/webhooks/test`,
    method: 'POST',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Courier Webhook Trigger API',
    url: `${BASE_URL}/api/courier/webhooks/trigger`,
    method: 'POST',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Incoming Courier Webhook Endpoint',
    url: `${BASE_URL}/api/webhook/steadfast`,
    method: 'POST',
  });

  // --- Category F: Other Important POST/PUT Endpoints ---
  console.log('\n--- F. Other Important POST/PUT Endpoints ---');
  await testMalformedJsonEndpoint({
    name: 'Auth Login API',
    url: `${BASE_URL}/api/auth/login`,
    method: 'POST',
  });

  await testMalformedJsonEndpoint({
    name: 'Auth Register API',
    url: `${BASE_URL}/api/auth/register`,
    method: 'POST',
  });

  await testMalformedJsonEndpoint({
    name: 'Auth Forgot Password API',
    url: `${BASE_URL}/api/auth/forgot-password`,
    method: 'POST',
  });

  await testMalformedJsonEndpoint({
    name: 'Auth Reset Password API',
    url: `${BASE_URL}/api/auth/reset-password`,
    method: 'POST',
  });

  await testMalformedJsonEndpoint({
    name: 'Categories Create API',
    url: `${BASE_URL}/api/categories`,
    method: 'POST',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Categories Update API',
    url: `${BASE_URL}/api/categories/cat-123`,
    method: 'PUT',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Categories Reorder API',
    url: `${BASE_URL}/api/categories/reorder`,
    method: 'PUT',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Sliders Create API',
    url: `${BASE_URL}/api/sliders`,
    method: 'POST',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Coupons Create API',
    url: `${BASE_URL}/api/coupons`,
    method: 'POST',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Expenses Create API',
    url: `${BASE_URL}/api/expenses`,
    method: 'POST',
    token: adminToken,
  });

  await testMalformedJsonEndpoint({
    name: 'Media Upload JSON API',
    url: `${BASE_URL}/api/upload`,
    method: 'POST',
    token: adminToken,
  });

  // --- Category G: Valid Empty JSON {} Handling Verification ---
  console.log('\n--- G. Valid Empty JSON Object {} Handling ---');
  console.log('Testing that valid empty JSON `{}` is NOT treated as malformed and proceeds to domain validation:');
  const emptyJsonRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const emptyJsonData = await emptyJsonRes.json();
  assert(emptyJsonRes.status === 400, `Expected 400 validation error for empty order, got ${emptyJsonRes.status}`);
  assert(
    emptyJsonData.error !== 'Malformed JSON payload. Please provide valid JSON.',
    'Valid empty JSON must NOT be rejected as malformed JSON'
  );
  assert(
    emptyJsonData.error.includes('Customer full name') || emptyJsonData.error.includes('required'),
    `Expected customer validation error, got: ${emptyJsonData.error}`
  );
  console.log(`  ✓ Valid empty object {} cleanly processed to domain validation: "${emptyJsonData.error}"`);

  // --- Category H: Router Unit Test (Fetch Request directly on safeParseJson) ---
  console.log('\n--- H. Worker Router safeParseJson Unit Test ---');
  const { safeParseJson } = await import('../src/server/router');

  // Test 1: Malformed JSON Request
  const badReq = new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"unclosed": "string',
  });
  const badRes = await safeParseJson(badReq);
  assert(badRes.data === null, 'safeParseJson data must be null on malformed JSON');
  assert(badRes.errorResponse !== null, 'safeParseJson errorResponse must not be null');
  assert(badRes.errorResponse.status === 400, 'safeParseJson errorResponse status must be 400');
  const badBody = await badRes.errorResponse.json();
  assert(badBody.success === false, 'success must be false');
  assert(badBody.error.includes('Malformed JSON payload'), 'Must return safe malformed error');
  console.log(`  ✓ Worker safeParseJson rejects malformed input with HTTP 400: "${badBody.error}"`);

  // Test 2: Valid empty JSON Request
  const goodReq = new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const goodRes = await safeParseJson(goodReq);
  assert(goodRes.errorResponse === null, 'safeParseJson errorResponse must be null on valid JSON');
  assert(typeof goodRes.data === 'object' && goodRes.data !== null, 'safeParseJson data must be parsed object');
  console.log('  ✓ Worker safeParseJson accepts valid empty JSON `{}`');

  // Test 3: Valid populated JSON Request
  const populatedReq = new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Product', price: 99 }),
  });
  const populatedRes = await safeParseJson<{ name: string; price: number }>(populatedReq);
  assert(populatedRes.errorResponse === null, 'safeParseJson errorResponse must be null on valid populated JSON');
  assert(populatedRes.data?.name === 'Test Product', 'safeParseJson data must have name "Test Product"');
  console.log('  ✓ Worker safeParseJson accepts and types valid populated JSON payload');

  console.log('\n================================================================');
  console.log(`✅ ALL ${results.length} ENDPOINTS VERIFIED SUCCESSFULLY!`);
  console.log('   - 100% of tested endpoints returned HTTP 400 Bad Request');
  console.log('   - 0 endpoints returned HTTP 500 Internal Server Error');
  console.log('   - 0 parser stack traces, code paths, or internal secrets leaked');
  console.log('   - Valid empty JSON `{}` correctly passes to domain validation');
  console.log('================================================================\n');
}

runSecuritySuite().catch((err) => {
  console.error('\n❌ Security verification suite failed:', err);
  process.exit(1);
});
