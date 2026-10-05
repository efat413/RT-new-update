import { createSignedTestToken, TEST_BASE_URL } from './test-auth-helper';

const BASE_URL = TEST_BASE_URL;

// Canonical and alias forbidden keys from user security specification
const FORBIDDEN_ALIASES = [
  'buying_price',
  'buyingPrice',
  'purchase_price',
  'purchasePrice',
  'cost_price',
  'costPrice',
  'product_cost',
  'productCost',
  'unit_cost',
  'unitCost',
  'profit',
  'unit_profit',
  'unitProfit',
  'gross_profit',
  'grossProfit',
  'net_profit',
  'netProfit',
  'profit_margin',
  'profitMargin',
  'total_cost',
  'totalCost',
  'total_profit',
  'totalProfit',
  'buyingPriceSnapshot',
  'buying_price_snapshot',
  'productGrossProfit',
  'product_gross_profit',
  'totalGrossProfit',
  'total_gross_profit',
  'supplierCost',
  'supplier_cost',
  'wholesalePrice',
  'wholesale_price',
  'itemCost',
  'item_cost',
  'averageProfitPerOrder',
  'average_profit_per_order',
];

/**
 * Recursively inspects the entire JSON payload for any forbidden sensitive cost/profit field.
 */
function findForbiddenKeysInJson(json: any, path: string = ''): string[] {
  const leaks: string[] = [];
  if (json === null || json === undefined) return leaks;

  if (typeof json === 'object') {
    if (Array.isArray(json)) {
      json.forEach((item, idx) => {
        leaks.push(...findForbiddenKeysInJson(item, `${path}[${idx}]`));
      });
    } else {
      for (const [key, value] of Object.entries(json)) {
        const currentPath = path ? `${path}.${key}` : key;
        const norm = key.toLowerCase().replace(/[^a-z0-9]/g, '');

        if (
          norm === 'buyingprice' ||
          norm === 'buyingcost' ||
          norm === 'purchaseprice' ||
          norm === 'purchasecost' ||
          norm === 'costprice' ||
          norm === 'productcost' ||
          norm === 'unitcost' ||
          norm === 'totalcost' ||
          norm === 'buyingpricesnapshot' ||
          norm === 'suppliercost' ||
          norm === 'wholesaleprice' ||
          norm === 'itemcost' ||
          norm === 'profit' ||
          norm === 'unitprofit' ||
          norm === 'unitgrossprofit' ||
          norm === 'unitnetprofit' ||
          norm === 'grossprofit' ||
          norm === 'netprofit' ||
          norm === 'profitmargin' ||
          norm === 'grossmargin' ||
          norm === 'netmargin' ||
          norm === 'totalprofit' ||
          norm === 'totalgrossprofit' ||
          norm === 'productgrossprofit' ||
          norm === 'averageprofitperorder'
        ) {
          leaks.push(`${currentPath} (value: ${JSON.stringify(value)})`);
        }

        if (
          typeof value === 'string' &&
          ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']')))
        ) {
          try {
            const parsed = JSON.parse(value);
            leaks.push(...findForbiddenKeysInJson(parsed, `${currentPath}[JSON]`));
          } catch {}
        } else {
          leaks.push(...findForbiddenKeysInJson(value, currentPath));
        }
      }
    }
  }
  return leaks;
}

interface TestUser {
  name: string;
  role: string;
  email: string;
  userId: string;
  isAuthorized: boolean;
  token: string;
}

async function runAudit() {
  console.log('================================================================');
  console.log('🔒 BACKEND SECURITY AUDIT: BUYING PRICE & PROFIT PRIVACY HARDENING');
  console.log('================================================================\n');

  // Set up tokens for the 4 required user personas
  const users: TestUser[] = [
    {
      name: 'Customer',
      role: 'customer',
      email: 'customer@local.test',
      userId: 'test-customer-1',
      isAuthorized: false,
      token: createSignedTestToken({
        userId: 'test-customer-1',
        email: 'customer@local.test',
        role: 'customer',
      }),
    },
    {
      name: 'Admin without permission',
      role: 'admin',
      email: 'updater@local.test',
      userId: 'test-user-update-only',
      isAuthorized: false,
      token: createSignedTestToken({
        userId: 'test-user-update-only',
        email: 'updater@local.test',
        role: 'admin',
        permissions: {
          'product.view': true,
          'product.update': true,
          'order.view': true,
          'audit_log.view': true,
          'product.view_buying_price': false,
          'product.manage_buying_price': false,
          'product.buying_price': false,
          'product.view_profit': false,
          'report.profit': false,
          'report.financial': false,
        },
      }),
    },
    {
      name: 'Sub Admin without permission',
      role: 'sub_admin',
      email: 'staff@rongdhonutrade.com',
      userId: 'user-subadmin-staff',
      isAuthorized: false,
      token: createSignedTestToken({
        userId: 'user-subadmin-staff',
        email: 'staff@rongdhonutrade.com',
        role: 'sub_admin',
        permissions: {
          'product.view': true,
          'order.view': true,
          'audit_log.view': true,
        },
      }),
    },
    {
      name: 'Authorized Super Admin',
      role: 'super_admin',
      email: 'dev-superadmin@local.test',
      userId: 'dev-super-admin-1',
      isAuthorized: true,
      token: createSignedTestToken({
        userId: 'dev-super-admin-1',
        email: 'dev-superadmin@local.test',
        role: 'super_admin',
      }),
    },
  ];

  let totalEndpointsTested = 0;
  let totalAssertionsPassed = 0;
  const failureReports: string[] = [];

  // 1. Fetch reference product ID and order ID for detail API testing
  const superAdminToken = users.find((u) => u.isAuthorized)!.token;
  const prodListRes = await fetch(`${BASE_URL}/api/products`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const prodListData = await prodListRes.json();
  const sampleProductId = prodListData.products?.[0]?.id || 'prod-1';

  const orderListRes = await fetch(`${BASE_URL}/api/orders`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const orderListData = await orderListRes.json();
  const sampleOrderId = orderListData.orders?.[0]?.id || orderListData.orders?.[0]?.orderNumber || 'ord-1';

  console.log(`Using sample product ID: ${sampleProductId}`);
  console.log(`Using sample order ID: ${sampleOrderId}\n`);

  // Endpoints to test across all roles
  const endpointsToTest = [
    { name: 'Storefront Homepage API', method: 'GET', url: `${BASE_URL}/api/store/homepage` },
    { name: 'Product List API', method: 'GET', url: `${BASE_URL}/api/products` },
    { name: 'Product Search & Filter API', method: 'GET', url: `${BASE_URL}/api/products?search=smart&category=all` },
    { name: 'Product Detail API', method: 'GET', url: `${BASE_URL}/api/products/${sampleProductId}` },
    { name: 'Orders List API', method: 'GET', url: `${BASE_URL}/api/orders` },
    { name: 'Orders Search & Filter API', method: 'GET', url: `${BASE_URL}/api/orders?search=RT` },
    { name: 'Orders Detail API', method: 'GET', url: `${BASE_URL}/api/orders/${sampleOrderId}` },
    { name: 'Admin Audit Logs API', method: 'GET', url: `${BASE_URL}/api/admin/audit-logs` },
    { name: 'Analytics Profit Report API', method: 'GET', url: `${BASE_URL}/api/analytics/profit?period=today` },
    { name: 'Admin Profit Analytics API', method: 'GET', url: `${BASE_URL}/api/admin/profit-analytics?period=today` },
    { name: 'Expenses Financial API', method: 'GET', url: `${BASE_URL}/api/expenses` },
  ];

  for (const user of users) {
    console.log(`----------------------------------------------------------------`);
    console.log(`Testing Role: ${user.name} (Authorized: ${user.isAuthorized})`);
    console.log(`----------------------------------------------------------------`);

    for (const ep of endpointsToTest) {
      totalEndpointsTested++;
      try {
        const res = await fetch(ep.url, {
          method: ep.method,
          headers: {
            Authorization: `Bearer ${user.token}`,
            Accept: 'application/json',
          },
        });

        const status = res.status;
        const text = await res.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          // Non-JSON response
        }

        if (!user.isAuthorized) {
          // UNAUTHORIZED CHECK:
          // The response MUST NOT contain any sensitive field anywhere in the payload
          if (json) {
            const leaks = findForbiddenKeysInJson(json);
            if (leaks.length > 0) {
              const msg = `❌ LEAK DETECTED in [${user.name}] -> ${ep.name} (${ep.url}): Leaked keys: ${leaks.join(', ')}`;
              failureReports.push(msg);
              console.error(msg);
            } else {
              totalAssertionsPassed++;
              console.log(`  ✅ [${user.name}] ${ep.name} (HTTP ${status}): Sanitized (0 leaks)`);
            }
          } else {
            totalAssertionsPassed++;
            console.log(`  ✅ [${user.name}] ${ep.name} (HTTP ${status}): Non-JSON response safe`);
          }
        } else {
          // AUTHORIZED CHECK (Super Admin):
          // Super Admin MUST have legitimate access to buyingPrice and profit where applicable
          if (ep.name === 'Product Detail API' && json?.product) {
            if (json.product.buyingPrice !== undefined) {
              totalAssertionsPassed++;
              console.log(`  ✅ [${user.name}] ${ep.name}: buyingPrice legitimately accessible (${json.product.buyingPrice})`);
            } else {
              failureReports.push(`❌ [${user.name}] ${ep.name}: Expected buyingPrice to be accessible for Super Admin!`);
            }
          } else if (ep.name === 'Orders Detail API' && json?.order) {
            if (json.order.totalCost !== undefined || json.order.totalGrossProfit !== undefined) {
              totalAssertionsPassed++;
              console.log(`  ✅ [${user.name}] ${ep.name}: totalCost / totalGrossProfit legitimately accessible (${json.order.totalCost} / ${json.order.totalGrossProfit})`);
            } else {
              failureReports.push(`❌ [${user.name}] ${ep.name}: Expected totalCost/profit to be accessible for Super Admin!`);
            }
          } else if (ep.name === 'Analytics Profit Report API') {
            if (status === 200 && json?.summary?.grossProfit !== undefined) {
              totalAssertionsPassed++;
              console.log(`  ✅ [${user.name}] ${ep.name}: Profit analytics report legitimately accessible (grossProfit: ${json.summary.grossProfit})`);
            } else {
              failureReports.push(`❌ [${user.name}] ${ep.name}: Expected profit analytics HTTP 200 for Super Admin!`);
            }
          } else {
            totalAssertionsPassed++;
            console.log(`  ✅ [${user.name}] ${ep.name} (HTTP ${status}): Valid response`);
          }
        }
      } catch (err: any) {
        failureReports.push(`❌ Error testing ${ep.name} for ${user.name}: ${err.message}`);
        console.error(`  ❌ Error: ${err.message}`);
      }
    }
    console.log('');
  }

  // Also test unauthenticated / guest request
  console.log(`----------------------------------------------------------------`);
  console.log(`Testing Role: Guest (Unauthenticated Storefront Visitor)`);
  console.log(`----------------------------------------------------------------`);
  const publicEndpoints = [
    { name: 'Public Homepage API', url: `${BASE_URL}/api/store/homepage` },
    { name: 'Public Products List API', url: `${BASE_URL}/api/products` },
    { name: 'Public Product Detail API', url: `${BASE_URL}/api/products/${sampleProductId}` },
    { name: 'Public Product Search API', url: `${BASE_URL}/api/products?search=clock` },
  ];

  for (const ep of publicEndpoints) {
    totalEndpointsTested++;
    const res = await fetch(ep.url, { headers: { Accept: 'application/json' } });
    const json = await res.json();
    const leaks = findForbiddenKeysInJson(json);
    if (leaks.length > 0) {
      const msg = `❌ LEAK DETECTED in [Guest] -> ${ep.name}: Leaked keys: ${leaks.join(', ')}`;
      failureReports.push(msg);
      console.error(msg);
    } else {
      totalAssertionsPassed++;
      console.log(`  ✅ [Guest] ${ep.name} (HTTP ${res.status}): Sanitized (0 leaks)`);
    }
  }

  // ----------------------------------------------------------------
  // MUTATION TESTS (Order Placement & Product Creation/Update Responses)
  // ----------------------------------------------------------------
  console.log(`----------------------------------------------------------------`);
  console.log(`Testing Mutation Endpoints (POST /api/orders, POST /api/products, PUT /api/products/:id)`);
  console.log(`----------------------------------------------------------------`);

  // 1. Order submission as Customer (must return sanitized order without cost/profit)
  totalEndpointsTested++;
  const customerToken = users.find((u) => u.name === 'Customer')!.token;
  const orderPayload = {
    order: {
      customer: {
        fullName: 'Test Customer',
        phone: '01712345678',
        district: 'Dhaka',
        deliveryZone: 'inside_dhaka',
        fullAddress: 'House 12, Road 4, Sector 7, Uttara, Dhaka',
      },
      items: [
        {
          product: { id: sampleProductId, title: 'Sample Product', price: 1000 },
          quantity: 2,
        },
      ],
      subtotal: 2000,
      deliveryFee: 60,
      totalAmount: 2060,
      paymentMethod: 'cod',
    },
  };

  const orderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify(orderPayload),
  });
  const orderJson = await orderRes.json();
  const orderLeaks = findForbiddenKeysInJson(orderJson);
  if (orderLeaks.length > 0) {
    const msg = `❌ LEAK DETECTED in POST /api/orders response: ${orderLeaks.join(', ')}`;
    failureReports.push(msg);
    console.error(msg);
  } else {
    totalAssertionsPassed++;
    console.log(`  ✅ POST /api/orders response: Sanitized (0 leaks)`);
  }

  // 2. Product creation as Admin without manage_buying_price permission
  totalEndpointsTested++;
  const unprivAdminToken = users.find((u) => u.name === 'Admin without permission')!.token;
  const newProdPayload = {
    product: {
      title: 'Privileged Probe Product',
      price: 1500,
      buyingPrice: 800, // Unauthorized attempt to set buyingPrice
      stock: 10,
      categoryId: 'cat-mens-accessories',
    },
  };
  const createProdRes = await fetch(`${BASE_URL}/api/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${unprivAdminToken}`,
    },
    body: JSON.stringify(newProdPayload),
  });
  const createProdJson = await createProdRes.json();
  const createProdLeaks = findForbiddenKeysInJson(createProdJson);
  if (createProdLeaks.length > 0) {
    const msg = `❌ LEAK DETECTED in POST /api/products response: ${createProdLeaks.join(', ')}`;
    failureReports.push(msg);
    console.error(msg);
  } else {
    totalAssertionsPassed++;
    console.log(`  ✅ POST /api/products response: Sanitized (0 leaks)`);
  }

  // 3. Product update as Admin without manage_buying_price permission
  totalEndpointsTested++;
  const createdProdId = createProdJson.product?.id || sampleProductId;
  const updateProdRes = await fetch(`${BASE_URL}/api/products/${createdProdId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${unprivAdminToken}`,
    },
    body: JSON.stringify({
      updates: {
        title: 'Privileged Probe Product Updated',
        buyingPrice: 900, // Unauthorized attempt to update buyingPrice
      },
    }),
  });
  const updateProdJson = await updateProdRes.json();
  const updateProdLeaks = findForbiddenKeysInJson(updateProdJson);
  if (updateProdLeaks.length > 0) {
    const msg = `❌ LEAK DETECTED in PUT /api/products/:id response: ${updateProdLeaks.join(', ')}`;
    failureReports.push(msg);
    console.error(msg);
  } else {
    totalAssertionsPassed++;
    console.log(`  ✅ PUT /api/products/:id response: Sanitized (0 leaks)`);
  }

  console.log('\n================================================================');
  console.log('AUDIT SUMMARY');
  console.log('================================================================');
  console.log(`Total Endpoints Evaluated: ${totalEndpointsTested}`);
  console.log(`Total Assertions Passed: ${totalAssertionsPassed}`);
  console.log(`Failures: ${failureReports.length}`);

  if (failureReports.length > 0) {
    console.error('\nFAILURE DETAILS:');
    failureReports.forEach((f) => console.error(f));
    process.exit(1);
  } else {
    console.log('\n🎉 ALL PRIVACY HARDENING TESTS PASSED! ZERO SENSITIVE DATA LEAKS DETECTED.');
    process.exit(0);
  }
}

runAudit().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
