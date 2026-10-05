/**
 * FINAL COMPREHENSIVE SECURITY VERIFICATION SUITE
 * 
 * Strict verification covering all 8 security domains:
 * 1. Permission Escalation (Customer, Admin, Sub Admin, Super Admin)
 * 2. Authentication (Missing -> 401, Invalid/Expired -> 401, Insufficient -> 403)
 * 3. Not Found (Valid auth on nonexistent resource -> EXACT 404)
 * 4. Malformed JSON (Strictly EXACT 400, rejecting 500 or any other status)
 * 5. Safe Error Handling (Generic 500, no stack trace, SQL, SQLite/D1, paths, secrets)
 * 6. Buying Price / Profit Privacy (Deep recursive inspection, 0 leaks for unauthorized)
 * 7. Dev JWT Security (Strict rejection of dev-jwt-*, no bypass, zero test usage)
 * 8. Strict Assertions (Exact status checks: 400, 401, 403, 404, 500)
 */

import { verifyAuthToken, hashPassword, createAuthToken } from '../src/server/auth';
import { handleApiRequest } from '../src/server/router';
import { Env } from '../src/server/types';

const BASE_URL = 'http://localhost:3000';

// Canonical and alias forbidden keys from user security specification
const FORBIDDEN_COST_PROFIT_ALIASES = [
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
 * Strict Assertion Helper - enforces EXACT status and truthiness
 */
function assertStrict(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ STRICT ASSERTION FAILED: ${message}`);
    throw new Error(`STRICT ASSERTION FAILED: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

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
        } else if (typeof value === 'object' && value !== null) {
          leaks.push(...findForbiddenKeysInJson(value, currentPath));
        }
      }
    }
  }

  return leaks;
}

export async function runComprehensiveVerificationSuite() {
  console.log('================================================================');
  console.log('RUNNING STRICT FINAL SECURITY VERIFICATION SUITE');
  console.log('================================================================\n');

  // Verify Dev Server is reachable
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assertStrict(healthRes.status === 200, `Dev server reachable (HTTP ${healthRes.status})`);

  // ==========================================
  // PREPARATION: OBTAIN LEGITIMATE TOKENS (No dev-jwt tokens)
  // ==========================================
  console.log('\n[SETUP] Authenticating legitimate roles via POST /api/auth/login...');

  // 1. Super Admin
  const superLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin', password: process.env.DEV_ADMIN_PASSWORD || 'admin' }),
  });
  assertStrict(superLoginRes.status === 200, 'Super Admin login returns HTTP 200');
  const superToken = (await superLoginRes.json()).token;
  assertStrict(Boolean(superToken), 'Valid Super Admin token obtained');

  // Fetch users to locate user accounts
  const usersRes = await fetch(`${BASE_URL}/api/users`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  assertStrict(usersRes.status === 200, 'Super Admin fetches users list (HTTP 200)');
  const allUsers = (await usersRes.json()).users || [];

  const superAdmin = allUsers.find((u: any) => u.role === 'super_admin');
  assertStrict(Boolean(superAdmin), `Super Admin account identified: ${superAdmin?.email}`);

  // Customer account
  let customerUser = allUsers.find((u: any) => u.role === 'customer');
  if (!customerUser) {
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Strict Verification Customer',
        email: 'strict-cust@local.test',
        password: 'Password123!',
        phone: '01711999888',
      }),
    });
    customerUser = (await regRes.json()).user;
  }
  // Ensure known customer password
  await fetch(`${BASE_URL}/api/users/${customerUser.id}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: 'Password123!' }),
  });
  const custLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: customerUser.email, password: 'Password123!' }),
  });
  assertStrict(custLoginRes.status === 200, 'Customer login returns HTTP 200');
  const customerToken = (await custLoginRes.json()).token;
  assertStrict(Boolean(customerToken), 'Valid Customer token obtained');

  // Normal Admin account
  let adminUser = allUsers.find((u: any) => u.role === 'admin' && u.id !== superAdmin.id);
  if (!adminUser) {
    const createAdminRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Strict Verification Admin',
        email: 'strict-admin@local.test',
        password: 'Password123!',
        role: 'admin',
        permissions: { 'order.view': true, 'product.view': true },
      }),
    });
    adminUser = (await createAdminRes.json()).user;
  }
  await fetch(`${BASE_URL}/api/users/${adminUser.id}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: 'Password123!' }),
  });
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminUser.email, password: 'Password123!' }),
  });
  assertStrict(adminLoginRes.status === 200, 'Admin login returns HTTP 200');
  const adminToken = (await adminLoginRes.json()).token;
  assertStrict(Boolean(adminToken), 'Valid Admin token obtained');

  // Second Admin account
  let otherAdminUser = allUsers.find((u: any) => u.role === 'admin' && u.id !== adminUser.id && u.id !== superAdmin.id);
  if (!otherAdminUser) {
    const createOtherAdminRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Strict Verification Second Admin',
        email: 'strict-admin2@local.test',
        password: 'Password123!',
        role: 'admin',
        permissions: { 'order.view': true },
      }),
    });
    otherAdminUser = (await createOtherAdminRes.json()).user;
  }

  // Sub Admin account
  let subAdminUser = allUsers.find((u: any) => u.role === 'sub_admin');
  if (!subAdminUser) {
    const createSubAdminRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Strict Verification Sub Admin',
        email: 'strict-subadmin@local.test',
        password: 'Password123!',
        role: 'sub_admin',
        permissions: { 'product.view': true },
      }),
    });
    subAdminUser = (await createSubAdminRes.json()).user;
  }
  await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/reset-password`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: 'Password123!' }),
  });
  const subAdminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: subAdminUser.email, password: 'Password123!' }),
  });
  assertStrict(subAdminLoginRes.status === 200, 'Sub Admin login returns HTTP 200');
  const subAdminToken = (await subAdminLoginRes.json()).token;
  assertStrict(Boolean(subAdminToken), 'Valid Sub Admin token obtained');

  // Sample Product & Order for testing
  const productsListRes = await fetch(`${BASE_URL}/api/products`);
  const productsListJson = await productsListRes.json();
  const sampleProductId = productsListJson.products?.[0]?.id || 'prod-mug-13b';

  const ordersListRes = await fetch(`${BASE_URL}/api/orders`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  const ordersListJson = await ordersListRes.json();
  const sampleOrderId = ordersListJson.orders?.[0]?.id || 'ord-80126';

  // ==========================================
  // 1. PERMISSION ESCALATION
  // ==========================================
  console.log('\n==================================================');
  console.log('1. PERMISSION ESCALATION TESTS');
  console.log('==================================================');

  // Customer:
  // - own permission change -> EXACT 403
  const cEsc1 = await fetch(`${BASE_URL}/api/users/${customerUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_profit': true } }),
  });
  assertStrict(cEsc1.status === 403, `Customer own permission change -> EXACT 403 (got ${cEsc1.status})`);

  // - other-user permission change -> EXACT 403
  const cEsc2 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.manage': true } }),
  });
  assertStrict(cEsc2.status === 403, `Customer other-user permission change -> EXACT 403 (got ${cEsc2.status})`);

  // - self role=super_admin -> EXACT 403
  const cEsc3 = await fetch(`${BASE_URL}/api/users/${customerUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assertStrict(cEsc3.status === 403, `Customer self role=super_admin via user update -> EXACT 403 (got ${cEsc3.status})`);

  const cEsc3b = await fetch(`${BASE_URL}/api/users/${customerUser.id}/role`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assertStrict(cEsc3b.status === 403, `Customer self role=super_admin via role API -> EXACT 403 (got ${cEsc3b.status})`);

  // Admin:
  // - own permission change -> EXACT 403
  const aEsc1 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'product.view_buying_price': true } }),
  });
  assertStrict(aEsc1.status === 403, `Admin own permission change -> EXACT 403 (got ${aEsc1.status})`);

  // - other-user permission change -> EXACT 403
  const aEsc2 = await fetch(`${BASE_URL}/api/users/${otherAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.status_change': true } }),
  });
  assertStrict(aEsc2.status === 403, `Admin other-admin permission change -> EXACT 403 (got ${aEsc2.status})`);

  const aEsc2b = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.view': true } }),
  });
  assertStrict(aEsc2b.status === 403, `Admin sub_admin permission change -> EXACT 403 (got ${aEsc2b.status})`);

  // - self role=super_admin -> EXACT 403
  const aEsc3 = await fetch(`${BASE_URL}/api/users/${adminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assertStrict(aEsc3.status === 403, `Admin self role=super_admin -> EXACT 403 (got ${aEsc3.status})`);

  // - other-user role=super_admin -> EXACT 403
  const aEsc4 = await fetch(`${BASE_URL}/api/users/${otherAdminUser.id}/role`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assertStrict(aEsc4.status === 403, `Admin other-user role=super_admin -> EXACT 403 (got ${aEsc4.status})`);

  // - grant permission.manage -> EXACT 403
  const aEsc5 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'permission.manage': true } }),
  });
  assertStrict(aEsc5.status === 403, `Admin grant permission.manage to self -> EXACT 403 (got ${aEsc5.status})`);

  const aEsc5b = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: ['permission.manage'] }),
  });
  assertStrict(aEsc5b.status === 403, `Admin grant permission.manage to other -> EXACT 403 (got ${aEsc5b.status})`);

  // Sub Admin:
  // - same escalation tests -> EXACT 403
  const saEsc1 = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.manage': true } }),
  });
  assertStrict(saEsc1.status === 403, `Sub Admin own permission change -> EXACT 403 (got ${saEsc1.status})`);

  const saEsc2 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.manage': true } }),
  });
  assertStrict(saEsc2.status === 403, `Sub Admin other-user permission change -> EXACT 403 (got ${saEsc2.status})`);

  const saEsc3 = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assertStrict(saEsc3.status === 403, `Sub Admin self role=super_admin -> EXACT 403 (got ${saEsc3.status})`);

  const saEsc4 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/role`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'super_admin' }),
  });
  assertStrict(saEsc4.status === 403, `Sub Admin other-user role=super_admin -> EXACT 403 (got ${saEsc4.status})`);

  const saEsc5 = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${subAdminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: ['permission.manage'] }),
  });
  assertStrict(saEsc5.status === 403, `Sub Admin grant permission.manage -> EXACT 403 (got ${saEsc5.status})`);

  // Super Admin:
  // - legitimate permission update -> success (EXACT 200)
  const supLeg1 = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/permissions`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      permissions: {
        'order.view': true,
        'order.status_change': true,
      },
    }),
  });
  assertStrict(supLeg1.status === 200, `Super Admin legitimate permission update -> EXACT 200 (got ${supLeg1.status})`);
  const supLeg1Json = await supLeg1.json();
  assertStrict(supLeg1Json.success === true, 'Legitimate permission update success is true');
  assertStrict(supLeg1Json.permissions?.['order.view'] === true, 'Legitimate permission order.view is true');

  // - legitimate role update -> success (EXACT 200) where allowed
  const supLeg2 = await fetch(`${BASE_URL}/api/users/${subAdminUser.id}/role`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'sub_admin' }),
  });
  assertStrict(supLeg2.status === 200, `Super Admin legitimate role update -> EXACT 200 (got ${supLeg2.status})`);
  const supLeg2Json = await supLeg2.json();
  assertStrict(supLeg2Json.success === true, 'Legitimate role update success is true');

  // ==========================================
  // 2. AUTHENTICATION
  // ==========================================
  console.log('\n==================================================');
  console.log('2. AUTHENTICATION TESTS');
  console.log('==================================================');

  // No authentication: -> EXACT 401
  const noAuth1 = await fetch(`${BASE_URL}/api/admin/users`);
  assertStrict(noAuth1.status === 401, `No authentication on /api/admin/users -> EXACT 401 (got ${noAuth1.status})`);

  const noAuth2 = await fetch(`${BASE_URL}/api/users/${adminUser.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Tamper Name' }),
  });
  assertStrict(noAuth2.status === 401, `No authentication on PUT /api/users/:id -> EXACT 401 (got ${noAuth2.status})`);

  const noAuth3 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions: { 'order.view': true } }),
  });
  assertStrict(noAuth3.status === 401, `No authentication on PUT /api/users/:id/permissions -> EXACT 401 (got ${noAuth3.status})`);

  const noAuth4 = await fetch(`${BASE_URL}/api/users/${adminUser.id}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  assertStrict(noAuth4.status === 401, `No authentication on PUT /api/users/:id/role -> EXACT 401 (got ${noAuth4.status})`);

  // Invalid/expired authentication: -> EXACT 401
  const badToken1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiJ9.invalidsig123456';
  const invAuth1 = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${badToken1}` },
  });
  assertStrict(invAuth1.status === 401, `Invalid signature token -> EXACT 401 (got ${invAuth1.status})`);

  const expiredToken = `${adminToken.split('.').slice(0, 2).join('.')}.signature`;
  const invAuth2 = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer not-a-valid-jwt-token-string` },
  });
  assertStrict(invAuth2.status === 401, `Malformed token string -> EXACT 401 (got ${invAuth2.status})`);

  // Authenticated but insufficient permission: -> EXACT 403
  const insPerm1 = await fetch(`${BASE_URL}/api/analytics/profit`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assertStrict(insPerm1.status === 403, `Admin without report.profit accessing profit analytics -> EXACT 403 (got ${insPerm1.status})`);

  const insPerm2 = await fetch(`${BASE_URL}/api/expenses`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assertStrict(insPerm2.status === 403, `Admin without report.financial accessing expenses -> EXACT 403 (got ${insPerm2.status})`);

  const insPerm3 = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  assertStrict(insPerm3.status === 403, `Customer accessing admin audit logs -> EXACT 403 (got ${insPerm3.status})`);

  // ==========================================
  // 3. NOT FOUND
  // ==========================================
  console.log('\n==================================================');
  console.log('3. NOT FOUND TESTS');
  console.log('==================================================');

  // Valid authenticated request for nonexistent resource: -> EXACT 404
  const nfProd = await fetch(`${BASE_URL}/api/products/nonexistent-item-99999`);
  assertStrict(nfProd.status === 404, `Nonexistent product -> EXACT 404 (got ${nfProd.status})`);

  const nfOrder = await fetch(`${BASE_URL}/api/orders/nonexistent-order-99999`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assertStrict(nfOrder.status === 404, `Nonexistent order with valid admin auth -> EXACT 404 (got ${nfOrder.status})`);

  const nfUserPerm = await fetch(`${BASE_URL}/api/users/nonexistent-user-99999/permissions`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  assertStrict(nfUserPerm.status === 404, `Nonexistent user permissions with valid super admin auth -> EXACT 404 (got ${nfUserPerm.status})`);

  const nfUserRole = await fetch(`${BASE_URL}/api/users/nonexistent-user-99999/role`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  assertStrict(nfUserRole.status === 404, `Nonexistent user role with valid super admin auth -> EXACT 404 (got ${nfUserRole.status})`);

  // ==========================================
  // 4. MALFORMED JSON
  // ==========================================
  console.log('\n==================================================');
  console.log('4. MALFORMED JSON TESTS (STRICT status === 400)');
  console.log('==================================================');

  const malformedEndpoints = [
    { name: 'POST /api/orders', url: `${BASE_URL}/api/orders`, method: 'POST', body: '{"permissions":', headers: {} },
    { name: 'POST /api/auth/login', url: `${BASE_URL}/api/auth/login`, method: 'POST', body: 'not-json', headers: {} },
    { name: 'POST /api/auth/register', url: `${BASE_URL}/api/auth/register`, method: 'POST', body: '{"role":', headers: {} },
    { name: 'PUT /api/users/:id', url: `${BASE_URL}/api/users/${adminUser.id}`, method: 'PUT', body: '{"name":', headers: { Authorization: `Bearer ${adminToken}` } },
    { name: 'PUT /api/users/:id/permissions', url: `${BASE_URL}/api/users/${subAdminUser.id}/permissions`, method: 'PUT', body: '{"permissions":', headers: { Authorization: `Bearer ${superToken}` } },
    { name: 'PUT /api/users/:id/role', url: `${BASE_URL}/api/users/${subAdminUser.id}/role`, method: 'PUT', body: '{"role":', headers: { Authorization: `Bearer ${superToken}` } },
    { name: 'POST /api/products', url: `${BASE_URL}/api/products`, method: 'POST', body: '{"name":', headers: { Authorization: `Bearer ${superToken}` } },
    { name: 'PUT /api/products/:id', url: `${BASE_URL}/api/products/${sampleProductId}`, method: 'PUT', body: '{"price":', headers: { Authorization: `Bearer ${superToken}` } },
    { name: 'PUT /api/settings', url: `${BASE_URL}/api/settings`, method: 'PUT', body: '{"siteName":', headers: { Authorization: `Bearer ${superToken}` } },
    { name: 'POST /api/expenses', url: `${BASE_URL}/api/expenses`, method: 'POST', body: '{"amount":', headers: { Authorization: `Bearer ${superToken}` } },
    { name: 'PUT /api/orders/:id', url: `${BASE_URL}/api/orders/${sampleOrderId}`, method: 'PUT', body: '{"status":', headers: { Authorization: `Bearer ${superToken}` } },
  ];

  for (const ep of malformedEndpoints) {
    const res = await fetch(ep.url, {
      method: ep.method,
      headers: { ...ep.headers, 'Content-Type': 'application/json' },
      body: ep.body,
    });
    // Strict assertion: MUST be exactly 400. Not 500, not 400 || 500.
    assertStrict(res.status === 400, `${ep.name} with malformed JSON strictly returns EXACT 400 (got ${res.status})`);
  }

  // ==========================================
  // 5. SAFE ERROR HANDLING
  // ==========================================
  console.log('\n==================================================');
  console.log('5. SAFE ERROR HANDLING TESTS');
  console.log('==================================================');

  // Test Cloudflare Worker router error handling directly by providing an invalid DB environment
  const mockFailingEnv: Env = {
    DB: {
      prepare() {
        throw new Error('FATAL SQLite database corruption in /var/data/users.sqlite: SELECT * FROM users WHERE secret="prod_jwt_secret_999"');
      },
      dump: async () => new ArrayBuffer(0),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    } as any,
    ADMIN_SECRET: 'production_super_secret_jwt_key_should_never_leak',
    STEADFAST_API_KEY: 'production_steadfast_api_key_secret_123',
    STEADFAST_SECRET_KEY: 'production_steadfast_secret_key_456',
  };

  const failingEnvToken = await createAuthToken(
    { userId: superAdmin.id, email: superAdmin.email, role: 'super_admin' },
    mockFailingEnv.ADMIN_SECRET
  );

  const simRequest = new Request('http://localhost:3000/api/users', {
    method: 'GET',
    headers: { Authorization: `Bearer ${failingEnvToken}` },
  });

  const worker500Response = await handleApiRequest(simRequest, mockFailingEnv);
  assertStrict(worker500Response.status === 500, `Simulated unexpected internal error returns HTTP 500 (got ${worker500Response.status})`);
  
  const worker500BodyText = await worker500Response.text();
  console.log(`  ✓ 500 Internal error response body: ${worker500BodyText}`);

  // Strict verification of safe generic 500 body
  assertStrict(!worker500BodyText.includes('stack'), '500 response contains no stack trace');
  assertStrict(!worker500BodyText.includes('SQL') && !worker500BodyText.includes('SELECT'), '500 response contains no SQL');
  assertStrict(!worker500BodyText.includes('SQLite') && !worker500BodyText.includes('sqlite'), '500 response contains no SQLite error');
  assertStrict(!worker500BodyText.includes('D1') && !worker500BodyText.includes('d1'), '500 response contains no D1 error');
  assertStrict(!worker500BodyText.includes('/var/data') && !worker500BodyText.includes('.sqlite'), '500 response contains no file path');
  assertStrict(!worker500BodyText.includes('ADMIN_SECRET') && !worker500BodyText.includes('STEADFAST'), '500 response contains no env variable');
  assertStrict(!worker500BodyText.includes('production_super_secret_jwt_key') && !worker500BodyText.includes('prod_jwt_secret'), '500 response contains no JWT secret');
  assertStrict(!worker500BodyText.includes('production_steadfast_api_key_secret'), '500 response contains no API key');

  // Verify response matches safe generic format
  const parsed500 = JSON.parse(worker500BodyText);
  assertStrict(parsed500.success === false, '500 response success is false');
  assertStrict(parsed500.error === 'Internal server error.', '500 response error is generic "Internal server error."');

  // ==========================================
  // 6. BUYING PRICE / PROFIT PRIVACY
  // ==========================================
  console.log('\n==================================================');
  console.log('6. BUYING PRICE / PROFIT PRIVACY TESTS');
  console.log('==================================================');

  // Customer: buying_price/profit fields MUST NOT appear
  console.log('[Customer Privacy Inspection]');
  const custHomepageRes = await fetch(`${BASE_URL}/api/store/homepage`, { headers: { Authorization: `Bearer ${customerToken}` } });
  const custHomepageJson = await custHomepageRes.json();
  const custHpLeaks = findForbiddenKeysInJson(custHomepageJson);
  assertStrict(custHpLeaks.length === 0, `Customer /api/store/homepage has 0 sensitive leaks (found ${custHpLeaks.length})`);

  const custProductsRes = await fetch(`${BASE_URL}/api/products`, { headers: { Authorization: `Bearer ${customerToken}` } });
  const custProductsJson = await custProductsRes.json();
  const custProdLeaks = findForbiddenKeysInJson(custProductsJson);
  assertStrict(custProdLeaks.length === 0, `Customer /api/products has 0 sensitive leaks (found ${custProdLeaks.length})`);

  const custProdDetailRes = await fetch(`${BASE_URL}/api/products/${sampleProductId}`, { headers: { Authorization: `Bearer ${customerToken}` } });
  const custProdDetailJson = await custProdDetailRes.json();
  const custDetailLeaks = findForbiddenKeysInJson(custProdDetailJson);
  assertStrict(custDetailLeaks.length === 0, `Customer /api/products/:id has 0 sensitive leaks (found ${custDetailLeaks.length})`);

  // Admin without permission: MUST NOT appear
  console.log('[Admin without Permission Privacy Inspection]');
  const adminProductsRes = await fetch(`${BASE_URL}/api/products`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const adminProductsJson = await adminProductsRes.json();
  const adminProdLeaks = findForbiddenKeysInJson(adminProductsJson);
  assertStrict(adminProdLeaks.length === 0, `Admin /api/products has 0 sensitive leaks (found ${adminProdLeaks.length})`);

  const adminProdDetailRes = await fetch(`${BASE_URL}/api/products/${sampleProductId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const adminProdDetailJson = await adminProdDetailRes.json();
  const adminDetailLeaks = findForbiddenKeysInJson(adminProdDetailJson);
  assertStrict(adminDetailLeaks.length === 0, `Admin /api/products/:id has 0 sensitive leaks (found ${adminDetailLeaks.length})`);

  const adminOrdersRes = await fetch(`${BASE_URL}/api/orders`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const adminOrdersJson = await adminOrdersRes.json();
  const adminOrderLeaks = findForbiddenKeysInJson(adminOrdersJson);
  assertStrict(adminOrderLeaks.length === 0, `Admin /api/orders has 0 sensitive leaks (found ${adminOrderLeaks.length})`);

  const adminOrderDetailRes = await fetch(`${BASE_URL}/api/orders/${sampleOrderId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const adminOrderDetailJson = await adminOrderDetailRes.json();
  const adminOrderDetailLeaks = findForbiddenKeysInJson(adminOrderDetailJson);
  assertStrict(adminOrderDetailLeaks.length === 0, `Admin /api/orders/:id has 0 sensitive leaks (found ${adminOrderDetailLeaks.length})`);

  const adminAuditLogsRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, { headers: { Authorization: `Bearer ${adminToken}` } });
  if (adminAuditLogsRes.ok) {
    const adminAuditLogsJson = await adminAuditLogsRes.json();
    const adminAuditLeaks = findForbiddenKeysInJson(adminAuditLogsJson);
    assertStrict(adminAuditLeaks.length === 0, `Admin /api/admin/audit-logs has 0 sensitive leaks (found ${adminAuditLeaks.length})`);
  }

  // Sub Admin without permission: MUST NOT appear
  console.log('[Sub Admin without Permission Privacy Inspection]');
  const subAdminProdRes = await fetch(`${BASE_URL}/api/products`, { headers: { Authorization: `Bearer ${subAdminToken}` } });
  const subAdminProdJson = await subAdminProdRes.json();
  const subAdminProdLeaks = findForbiddenKeysInJson(subAdminProdJson);
  assertStrict(subAdminProdLeaks.length === 0, `Sub Admin /api/products has 0 sensitive leaks (found ${subAdminProdLeaks.length})`);

  const subAdminOrderDetailRes = await fetch(`${BASE_URL}/api/orders/${sampleOrderId}`, { headers: { Authorization: `Bearer ${subAdminToken}` } });
  if (subAdminOrderDetailRes.ok) {
    const subAdminOrderDetailJson = await subAdminOrderDetailRes.json();
    const subAdminOrderDetailLeaks = findForbiddenKeysInJson(subAdminOrderDetailJson);
    assertStrict(subAdminOrderDetailLeaks.length === 0, `Sub Admin /api/orders/:id has 0 sensitive leaks (found ${subAdminOrderDetailLeaks.length})`);
  }

  // Authorized Super Admin: existing legitimate access must continue
  console.log('[Authorized Super Admin Legitimate Access]');
  const superProdDetailRes = await fetch(`${BASE_URL}/api/products/${sampleProductId}`, { headers: { Authorization: `Bearer ${superToken}` } });
  const superProdDetailJson = await superProdDetailRes.json();
  assertStrict(superProdDetailJson.product?.buyingPrice !== undefined, `Super Admin can legitimately view product buyingPrice (${superProdDetailJson.product?.buyingPrice})`);

  const superOrderDetailRes = await fetch(`${BASE_URL}/api/orders/${sampleOrderId}`, { headers: { Authorization: `Bearer ${superToken}` } });
  const superOrderDetailJson = await superOrderDetailRes.json();
  assertStrict(superOrderDetailJson.order?.totalCost !== undefined, `Super Admin can legitimately view order totalCost (${superOrderDetailJson.order?.totalCost})`);

  const superProfitRes = await fetch(`${BASE_URL}/api/analytics/profit`, { headers: { Authorization: `Bearer ${superToken}` } });
  assertStrict(superProfitRes.status === 200, `Super Admin can legitimately access profit report (HTTP ${superProfitRes.status})`);

  // ==========================================
  // 7. DEV JWT SECURITY
  // ==========================================
  console.log('\n==================================================');
  console.log('7. DEV JWT SECURITY TESTS');
  console.log('==================================================');

  // Verify production verifyAuthToken strictly rejects dev-jwt-*
  const directDevJwt1 = await verifyAuthToken('dev-jwt-super-admin-token-12345', 'some-secret');
  assertStrict(directDevJwt1 === null, 'verifyAuthToken strictly returns null for dev-jwt-* token');

  const directDevJwt2 = await verifyAuthToken('dev-admin-plain-token', 'some-secret');
  assertStrict(directDevJwt2 === null, 'verifyAuthToken strictly returns null for dev-* token');

  const directDevJwt3 = await verifyAuthToken('mock-user-token', 'some-secret');
  assertStrict(directDevJwt3 === null, 'verifyAuthToken strictly returns null for mock-* token');

  const directDevJwt4 = await verifyAuthToken('unparsed.token', 'some-secret');
  assertStrict(directDevJwt4 === null, 'verifyAuthToken strictly returns null for non-3-part token');

  // Verify production router handleApiRequest strictly rejects dev-jwt-*
  const prodDevJwtReq = new Request('http://localhost:3000/api/auth/me', {
    headers: { Authorization: 'Bearer dev-jwt-attacker-token-999' },
  });
  const prodDevJwtRes = await handleApiRequest(prodDevJwtReq, {
    DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } as any,
    ADMIN_SECRET: 'test-secret',
  });
  assertStrict(prodDevJwtRes.status === 401, `Production router strictly rejects dev-jwt-* with HTTP 401 (got ${prodDevJwtRes.status})`);
  const prodDevJwtBody = await prodDevJwtRes.json();
  assertStrict(prodDevJwtBody.success === false, 'Production dev-jwt rejection body success is false');

  // Verify live dev server strictly rejects dev-jwt-*
  const liveDevJwtRes1 = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: 'Bearer dev-jwt-super-admin-bypass' },
  });
  assertStrict(liveDevJwtRes1.status === 401, `Live server rejects dev-jwt-* with HTTP 401 (got ${liveDevJwtRes1.status})`);

  const liveDevJwtRes2 = await fetch(`${BASE_URL}/api/settings`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer dev-jwt-admin', 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteName: 'Hacked' }),
  });
  assertStrict(liveDevJwtRes2.status === 401, `Live server rejects dev-jwt-* settings update with HTTP 401 (got ${liveDevJwtRes2.status})`);

  console.log('\n================================================================');
  console.log('🎉 ALL FINAL COMPREHENSIVE SECURITY AUDIT CHECKS PASSED!');
  console.log('================================================================\n');

  return {
    permissionEscalation: 'PASS',
    devJwtFallback: 'PASS',
    malformedJson: 'PASS',
    safeErrorHandling: 'PASS',
    httpStatusCorrectness: 'PASS',
    buyingPriceProfitPrivacy: 'PASS',
    finalSecurityTest: 'PASS',
  };
}

runComprehensiveVerificationSuite().catch((err) => {
  console.error('Final security verification encountered fatal error:', err);
  process.exit(1);
});
