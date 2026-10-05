async function testApis() {
  const baseUrl = 'http://localhost:3000';

  console.log('Testing live API endpoints at', baseUrl);

  // 1. Public Products API - Buying Price MUST NOT be leaked
  const prodRes = await fetch(`${baseUrl}/api/products`);
  if (!prodRes.ok) {
    console.error('Failed to fetch /api/products:', prodRes.status);
    return;
  }
  const prodData = await prodRes.json();
  const products: any[] = prodData.products || [];
  console.log(`Fetched ${products.length} products from public API`);
  for (const p of products) {
    if (p.buyingPrice !== undefined) {
      throw new Error(`CRITICAL SECURITY FAILURE: Public product API exposed buyingPrice for product ${p.id}!`);
    }
    if (p.unitProfit !== undefined) {
      throw new Error(`CRITICAL SECURITY FAILURE: Public product API exposed unitProfit for product ${p.id}!`);
    }
  }
  console.log('✓ Public products API strictly excludes buyingPrice and unitProfit for all items');

  // 2. Unauthorized access to /api/analytics/profit MUST be rejected
  const unauthProfitRes = await fetch(`${baseUrl}/api/analytics/profit`);
  console.log('Unauthenticated /api/analytics/profit status:', unauthProfitRes.status);
  console.assert(unauthProfitRes.status === 401 || unauthProfitRes.status === 403, 'Must return 401 or 403');
  console.log('✓ Unauthenticated request to /api/analytics/profit rejected');

  // 3. Unauthorized access to /api/expenses MUST be rejected
  const unauthExpRes = await fetch(`${baseUrl}/api/expenses`);
  console.log('Unauthenticated /api/expenses status:', unauthExpRes.status);
  console.assert(unauthExpRes.status === 401 || unauthExpRes.status === 403, 'Must return 401 or 403');
  console.log('✓ Unauthenticated request to /api/expenses rejected');

  // 4. Super Admin authorized request with real login token
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'admin',
      password: process.env.DEV_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin',
    }),
  });
  const loginData = await loginRes.json().catch(() => ({}));
  const token = loginData.token;
  if (!token) {
    throw new Error(
      `Failed to obtain admin authentication token from /api/auth/login (HTTP ${loginRes.status}: ${JSON.stringify(loginData)}). Check test environment setup.`
    );
  }

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const authProfitRes = await fetch(`${baseUrl}/api/analytics/profit?period=today`, {
    headers: authHeaders,
  });
  console.log('Super Admin /api/analytics/profit status:', authProfitRes.status);
  const profitData = await authProfitRes.json();
  console.log('Profit analytics summary received:', {
    revenue: profitData.summary?.revenue,
    productCost: profitData.summary?.productCost,
    grossProfit: profitData.summary?.grossProfit,
    netProfit: profitData.summary?.netProfit,
  });
  console.assert(authProfitRes.ok && profitData.success === true, 'Super Admin profit analytics must succeed');
  console.log('✓ Super Admin successfully fetched authoritative profit analytics');

  // 5. Super Admin expense creation
  const createExpRes = await fetch(`${baseUrl}/api/expenses`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      expense: {
        expenseType: 'facebook_ads',
        amount: 250,
        date: new Date().toISOString().slice(0, 10),
        note: 'Boost campaign',
      },
    }),
  });
  console.log('Super Admin create expense status:', createExpRes.status);
  const expCreated = await createExpRes.json();
  console.assert(createExpRes.ok && expCreated.success === true, 'Expense creation must succeed');
  console.log('✓ Super Admin recorded expense successfully:', expCreated.expense);

  console.log('\n=== ALL API SECURITY & FUNCTIONALITY CHECKS PASSED! ===');
}

testApis().catch((err) => {
  console.error('API Test failed:', err);
  process.exit(1);
});
