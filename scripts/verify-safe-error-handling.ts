import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('====================================================');
  console.log('STARTING SAFE ERROR HANDLING VERIFICATION SUITE');
  console.log('====================================================');

  // Verify server is reachable
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert(healthRes.status === 200, `Health check must return 200 (got ${healthRes.status})`);
  console.log('✓ Health check passed');

  // 1. Validation errors return 400 with helpful, safe message
  console.log('\n[Test 1] Input validation errors return 400 with safe, helpful message');
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
  const emptyOrderData = await emptyOrderRes.json();
  assert(emptyOrderData.success === false, 'success is false');
  assert(typeof emptyOrderData.error === 'string', 'error message exists');
  assert(!/sqlite|d1|stack|table|column/i.test(emptyOrderData.error), 'No internal leak in 400');
  console.log(`  ✓ 400 returned: "${emptyOrderData.error}"`);

  // 2. Short / invalid phone number returns 400 with safe, helpful message
  console.log('\n[Test 2] Invalid Bangladeshi phone number returns 400');
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
  const shortPhoneData = await shortPhoneRes.json();
  assert(shortPhoneData.error.includes('contact phone number') || shortPhoneData.error.includes('contact number'), 'Phone validation error returned');
  console.log(`  ✓ 400 returned: "${shortPhoneData.error}"`);

  // 3. Order with empty items returns 400 with safe message
  console.log('\n[Test 3] Order with empty items returns 400');
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
  const noItemsData = await noItemsRes.json();
  assert(noItemsData.error === 'Order must contain at least one item.', `Expected "Order must contain at least one item." (got "${noItemsData.error}")`);
  console.log(`  ✓ 400 returned: "${noItemsData.error}"`);

  // 4. Resource Not Found returns 404 with safe message
  console.log('\n[Test 4] Non-existent resource returns 404');
  const notFoundRes = await fetch(`${BASE_URL}/api/products/non-existent-product-id-9999`);
  assert(notFoundRes.status === 404, `Missing product returns 404 (got ${notFoundRes.status})`);
  const notFoundData = await notFoundRes.json();
  assert(notFoundData.error === 'Not found' || notFoundData.error === 'Product not found', `404 error returned (got "${notFoundData.error}")`);
  console.log(`  ✓ 404 returned: "${notFoundData.error}"`);

  // 5. Missing / Invalid Auth returns 401
  console.log('\n[Test 5] Missing / Invalid authentication returns 401');
  const unauthRes = await fetch(`${BASE_URL}/api/admin/profit-analytics`);
  assert(unauthRes.status === 401, `Missing auth returns 401 (got ${unauthRes.status})`);
  const unauthData = await unauthRes.json();
  assert(!/sqlite|d1|stack/i.test(unauthData.error), 'No internal leak in 401');
  console.log(`  ✓ 401 returned: "${unauthData.error}"`);

  // 6. SQL Injection payload in search / filter does NOT trigger raw database crash or leak
  console.log('\n[Test 6] SQL injection attempt handled safely without internal leaks');
  const sqliRes = await fetch(`${BASE_URL}/api/products?search=' OR 1=1; DROP TABLE orders;--`);
  assert(sqliRes.status === 200 || sqliRes.status === 400, `SQLi query handled safely (got ${sqliRes.status})`);
  const sqliText = await sqliRes.text();
  assert(!sqliText.includes('sqlite_error') && !sqliText.includes('syntax error') && !sqliText.includes('DROP TABLE'), 'No SQL error leaked');
  console.log('  ✓ SQL injection strings handled without raw SQL leakage');

  // 7. Malformed JSON returns 400, never 500 or stack trace
  console.log('\n[Test 7] Malformed JSON payload in POST request');
  const malformedJsonRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"invalid": json syntax error',
  });
  assert(
    malformedJsonRes.status === 400,
    `Expected HTTP 400 for malformed JSON, got ${malformedJsonRes.status}`
  );
  const malformedJsonData = await malformedJsonRes.json().catch(() => ({}));
  assert(malformedJsonData.success === false, 'success is false');
  assert(typeof malformedJsonData.error === 'string', 'error message exists');
  assert(!JSON.stringify(malformedJsonData).includes('SyntaxError: Unexpected token'), 'No raw syntax error leaked');
  assert(!JSON.stringify(malformedJsonData).includes('node_modules') && !JSON.stringify(malformedJsonData).includes('/src/'), 'No file path leaked');
  assert(!/sqlite|d1|stack|table|column|secret|token|api_key/i.test(JSON.stringify(malformedJsonData)), 'No internal details leaked');
  console.log(`  ✓ Malformed JSON correctly returned HTTP 400 with safe error: "${malformedJsonData.error}"`);

  console.log('\n====================================================');
  console.log('✅ ALL SAFE ERROR HANDLING TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
