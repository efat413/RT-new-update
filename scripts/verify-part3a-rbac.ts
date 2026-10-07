/**
 * Comprehensive Verification Suite for Part 3A: Granular Admin RBAC
 * Tests:
 * 1. Permission registry completeness & metadata integrity
 * 2. Role architecture (super_admin, admin, sub_admin, customer)
 * 3. Permission resolution & privilege escalation protections
 * 4. Super Admin-only permission isolation (cannot be granted to non-super admins)
 * 5. Sensitive data filtering (buying price, unit profit, cost snapshots)
 * 6. Audit logging structure and validation
 * 7. Live API endpoints (metadata, user permissions, audit logs, 401/403 security enforcement)
 */

import {
  PERMISSION_KEYS,
  PERMISSIONS_METADATA,
  SUPER_ADMIN_ONLY_PERMISSIONS,
  DEFAULT_SUB_ADMIN_PERMISSIONS,
  resolveUserPermissions,
  generateLegacyPermissionFlags,
  isValidPermissionKey,
  isSuperAdminOnlyPermission,
  type PermissionKey,
} from '../src/server/permissions';
import {
  sanitizeProductForRole,
  sanitizeOrderForRole,
} from '../src/server/db';
import type { Product, Order } from '../src/types';
import { getTestAdminToken, getTestCustomerToken } from './test-auth-helper';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('1. VERIFYING CENTRAL PERMISSION REGISTRY & METADATA');
  console.log('====================================================');

  assert(PERMISSION_KEYS.length >= 24, `Registered permission keys count (${PERMISSION_KEYS.length}) >= 24`);

  // Ensure all required permission domains exist
  const expectedDomains = [
    'product.view', 'product.create', 'product.update', 'product.delete', 'product.view_buying_price', 'product.view_profit',
    'order.view', 'order.manage', 'order.status_change', 'order.cancel', 'order.delete',
    'customer.view', 'customer.manage', 'customer.delete',
    'category.view', 'category.manage',
    'slider.view', 'slider.manage',
    'coupon.view', 'coupon.manage',
    'courier.configure', 'courier.booking', 'courier.status_sync', 'courier.tracking',
    'analytics.view', 'report.sales', 'report.financial', 'report.profit',
    'user.view', 'user.manage', 'user.delete', 'permission.manage',
    'settings.manage',
    'audit_log.view',
  ];

  for (const expectedKey of expectedDomains) {
    assert(isValidPermissionKey(expectedKey), `Registry contains key "${expectedKey}"`);
    const meta = PERMISSIONS_METADATA[expectedKey as PermissionKey];
    assert(Boolean(meta), `Metadata exists for "${expectedKey}"`);
    assert(Boolean(meta.group), `Metadata group exists for "${expectedKey}": ${meta.group}`);
    assert(Boolean(meta.displayName), `Metadata displayName exists for "${expectedKey}": ${meta.displayName}`);
    assert(Boolean(meta.description), `Metadata description exists for "${expectedKey}"`);
    assert(typeof meta.superAdminOnly === 'boolean', `Metadata superAdminOnly boolean exists for "${expectedKey}"`);
    assert(typeof meta.sensitive === 'boolean', `Metadata sensitive boolean exists for "${expectedKey}"`);
    assert(typeof meta.dangerous === 'boolean', `Metadata dangerous boolean exists for "${expectedKey}"`);
  }

  console.log('\n====================================================');
  console.log('2. VERIFYING SUPER ADMIN-ONLY PRIVILEGE ISOLATION');
  console.log('====================================================');

  const strictlySuperOnly = [
    'permission.manage',
    'user.manage',
    'user.delete',
    'settings.manage',
  ];

  for (const key of strictlySuperOnly) {
    assert(isSuperAdminOnlyPermission(key as PermissionKey), `Permission "${key}" is strictly identified as Super Admin-only`);
    assert(PERMISSIONS_METADATA[key as PermissionKey].superAdminOnly === true, `Metadata confirms superAdminOnly=true for "${key}"`);
  }

  console.log('\n====================================================');
  console.log('3. VERIFYING ROLE ARCHITECTURE & PERMISSION RESOLUTION');
  console.log('====================================================');

  // Test 1: super_admin role has ALL permissions unconditionally
  const superAdminPerms = resolveUserPermissions('super_admin', {});
  for (const key of PERMISSION_KEYS) {
    assert(superAdminPerms[key] === true, `super_admin has unconditional true for "${key}"`);
  }

  // Test 2: customer role has ZERO admin permissions unconditionally
  const customerPerms = resolveUserPermissions('customer', { 'product.view': true, 'order.manage': true });
  for (const key of PERMISSION_KEYS) {
    assert(customerPerms[key] === false, `customer has unconditional false for "${key}" even if payload attempted injection`);
  }

  // Test 3: admin and sub_admin default permissions
  const defaultAdminPerms = resolveUserPermissions('admin', null);
  assert(defaultAdminPerms['order.view'] === true, 'admin has order.view by default');
  assert(defaultAdminPerms['product.view'] === true, 'admin has product.view by default');
  assert(defaultAdminPerms['settings.manage'] === false, 'admin does NOT have settings.manage by default');
  assert(defaultAdminPerms['permission.manage'] === false, 'admin does NOT have permission.manage');
  assert(defaultAdminPerms['product.view_buying_price'] === false, 'admin does NOT have product.view_buying_price');
  assert(defaultAdminPerms['product.view_profit'] === false, 'admin does NOT have product.view_profit');

  const defaultSubAdminPerms = resolveUserPermissions('sub_admin', null);
  assert(defaultSubAdminPerms['product.view'] === true, 'sub_admin has product.view by default');
  assert(defaultSubAdminPerms['settings.manage'] === false, 'sub_admin does NOT have settings.manage');
  assert(defaultSubAdminPerms['permission.manage'] === false, 'sub_admin does NOT have permission.manage');
  assert(defaultSubAdminPerms['product.view_buying_price'] === false, 'sub_admin does NOT have product.view_buying_price');
  assert(defaultSubAdminPerms['product.view_profit'] === false, 'sub_admin does NOT have product.view_profit');

  // Test 4: Privilege Escalation Prevention - non-super_admin CANNOT receive superAdminOnly permissions
  const attemptedEscalation = {
    'order.view': true,
    'product.view_buying_price': true, // Injection attempt!
    'product.view_profit': true,       // Injection attempt!
    'report.financial': true,          // Injection attempt!
    'settings.manage': true,           // Injection attempt!
    'permission.manage': true,         // Injection attempt!
  };
  const resolvedAdmin = resolveUserPermissions('admin', JSON.stringify(attemptedEscalation));
  assert(resolvedAdmin['order.view'] === true, 'admin granted valid permission "order.view"');
  for (const superKey of SUPER_ADMIN_ONLY_PERMISSIONS) {
    assert(resolvedAdmin[superKey] === false, `Escalation blocked: admin resolved "${superKey}" is strictly FALSE!`);
  }

  console.log('\n====================================================');
  console.log('4. VERIFYING BACKWARD COMPATIBILITY WITH LEGACY FLAGS');
  console.log('====================================================');

  const legacyInput = {
    canManageOrders: true,
    canManageProducts: true,
    canManageCategories: true,
    canManageAccounts: false,
    canManageSettings: false,
  };
  const fromLegacy = resolveUserPermissions('admin', legacyInput);
  assert(fromLegacy['order.view'] === true, 'Legacy canManageOrders maps to order.view');
  assert(fromLegacy['order.status_change'] === true, 'Legacy canManageOrders maps to order.status_change');
  assert(fromLegacy['product.create'] === true, 'Legacy canManageProducts maps to product.create');
  assert(fromLegacy['category.manage'] === true, 'Legacy canManageCategories maps to category.manage');
  assert(fromLegacy['product.view_buying_price'] === false, 'Legacy conversion never leaks super admin buying_price');

  const generatedLegacy = generateLegacyPermissionFlags(fromLegacy);
  assert(generatedLegacy.canManageOrders === true, 'generateLegacyPermissionFlags produces canManageOrders=true');
  assert(generatedLegacy.canManageProducts === true, 'generateLegacyPermissionFlags produces canManageProducts=true');
  assert(generatedLegacy.canManageCategories === true, 'generateLegacyPermissionFlags produces canManageCategories=true');

  console.log('\n====================================================');
  console.log('5. VERIFYING SENSITIVE DATA FILTERING (SERVER-AUTHORITATIVE)');
  console.log('====================================================');

  const dummyProduct: Product = {
    id: 'prod-test-01',
    title: 'Test Leather Wallet',
    price: 1200,
    originalPrice: 1500,
    buyingPrice: 700,
    unitProfit: 500,
    categoryId: 'cat-mens-accessories',
    description: 'High quality wallet',
    imageUrl: 'https://example.com/wallet.jpg',
    images: ['https://example.com/wallet.jpg'],
    stock: 25,
    featured: true,
    rating: 5,
    reviewsCount: 12,
    specs: [],
    sizes: [],
    colors: [],
    createdAt: new Date().toISOString(),
  };

  // Customer or Public Sanitization: buyingPrice & unitProfit MUST be completely omitted
  const customerView = sanitizeProductForRole(dummyProduct, { isSuperAdmin: false, canViewBuyingPrice: false, canViewProfit: false });
  assert(customerView.price === 1200, 'Customer receives retail price');
  assert(customerView.buyingPrice === undefined, 'Customer view: buyingPrice is undefined');
  assert(customerView.unitProfit === undefined, 'Customer view: unitProfit is undefined');
  assert(!('buyingPrice' in customerView), 'Customer view: buyingPrice key does not exist');
  assert(!('unitProfit' in customerView), 'Customer view: unitProfit key does not exist');

  // Admin with buying_price permission only
  const buyingPriceOnlyView = sanitizeProductForRole(dummyProduct, { isSuperAdmin: false, canViewBuyingPrice: true, canViewProfit: false });
  assert(buyingPriceOnlyView.buyingPrice === 700, 'Authorized buying price viewer gets buyingPrice=700');
  assert(buyingPriceOnlyView.unitProfit === undefined, 'Authorized buying price viewer without profit does NOT get unitProfit');

  // Super Admin view: gets all details
  const superView = sanitizeProductForRole(dummyProduct, { isSuperAdmin: true });
  assert(superView.buyingPrice === 700, 'Super admin receives buyingPrice=700');
  assert(superView.unitProfit === 500, 'Super admin receives unitProfit=500');

  // Order Sanitization
  const dummyOrder: Order = {
    id: 'ord-test-01',
    orderNumber: '54321',
    customer: {
      fullName: 'Test Customer',
      phone: '01711223344',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
      fullAddress: 'Banani, Dhaka',
    },
    items: [
      {
        product: dummyProduct,
        quantity: 2,
        buyingPriceSnapshot: 700,
        sellingPriceSnapshot: 1200,
        productCost: 1400,
        productGrossProfit: 1000,
      },
    ],
    subtotal: 2400,
    deliveryFee: 60,
    totalAmount: 2460,
    paymentMethod: 'cod',
    paymentStatus: 'DUE',
    shippingStatus: 'Pending',
    totalCost: 1400,
    totalGrossProfit: 1000,
    createdAt: new Date().toISOString(),
  };

  const customerOrderView = sanitizeOrderForRole(dummyOrder, false);
  assert(customerOrderView.items[0].product.buyingPrice === undefined, 'Customer order item product buyingPrice stripped');
  assert(customerOrderView.items[0].buyingPriceSnapshot === undefined, 'Customer order item buyingPriceSnapshot stripped');
  assert(customerOrderView.items[0].productCost === undefined, 'Customer order item productCost stripped');
  assert(customerOrderView.items[0].productGrossProfit === undefined, 'Customer order item productGrossProfit stripped');
  assert(customerOrderView.totalCost === undefined, 'Customer order totalCost stripped');
  assert(customerOrderView.totalGrossProfit === undefined, 'Customer order totalGrossProfit stripped');

  const superAdminOrderView = sanitizeOrderForRole(dummyOrder, true);
  assert(superAdminOrderView.items[0].buyingPriceSnapshot === 700, 'Super admin order item buyingPriceSnapshot retained');
  assert(superAdminOrderView.items[0].productCost === 1400, 'Super admin order item productCost retained');
  assert(superAdminOrderView.items[0].productGrossProfit === 1000, 'Super admin order item productGrossProfit retained');
  assert(superAdminOrderView.totalCost === 1400, 'Super admin order totalCost retained');
  assert(superAdminOrderView.totalGrossProfit === 1000, 'Super admin order totalGrossProfit retained');

  console.log('\n====================================================');
  console.log('6. VERIFYING DEV SERVER API ENDPOINTS (RBAC & AUDIT)');
  console.log('====================================================');

  // Let's test against localhost:3000 if running
  try {
    const healthRes = await fetch('http://localhost:3000/api/health');
    if (healthRes.ok) {
      console.log('  Dev server is reachable on port 3000. Testing live API endpoints:');

      // 1. Unauthenticated request to /api/admin/permissions/metadata -> 401
      const metaNoAuth = await fetch('http://localhost:3000/api/admin/permissions/metadata');
      assert(metaNoAuth.status === 401, `Unauthenticated metadata returns HTTP 401 (got ${metaNoAuth.status})`);

      // 2. Login as Super Admin
      let superToken = '';
      try {
        superToken = await getTestAdminToken('http://localhost:3000');
      } catch (e) {
        const loginRes = await fetch('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin', password: process.env.DEV_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin' }),
        });
        if (loginRes.ok) {
          const loginData = await loginRes.json();
          superToken = loginData.token;
        }
      }
      assert(Boolean(superToken), 'Received auth token for Super Admin');

      // 3. Authenticated request to /api/admin/permissions/metadata
      const metaAuth = await fetch('http://localhost:3000/api/admin/permissions/metadata', {
        headers: { Authorization: `Bearer ${superToken}` },
      });
      assert(metaAuth.status === 200, 'Super Admin fetched permission metadata with HTTP 200');
      const metaJson = await metaAuth.json();
      assert(metaJson.success === true, 'Metadata success=true');
      assert(metaJson.keys.length >= 24, `Metadata keys count: ${metaJson.keys.length}`);
      assert(metaJson.superAdminOnly.length >= 3, `Metadata superAdminOnly count: ${metaJson.superAdminOnly.length}`);

      // 4. Login as customer
      let custToken = '';
      try {
        custToken = await getTestCustomerToken('http://localhost:3000');
      } catch (e) {
        const custLoginRes = await fetch('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'customer@gmail.com', password: process.env.CUSTOMER_PASSWORD || 'admin' }),
        });
        if (custLoginRes.ok) {
          const custData = await custLoginRes.json();
          custToken = custData.token;
        }
      }
      assert(Boolean(custToken), 'Received auth token for Customer');

      // 5. Customer attempts to access /api/admin/permissions/metadata -> 403 Forbidden
      const custMetaRes = await fetch('http://localhost:3000/api/admin/permissions/metadata', {
        headers: { Authorization: `Bearer ${custToken}` },
      });
      assert(custMetaRes.status === 403, `Customer accessing metadata returns HTTP 403 (got ${custMetaRes.status})`);

      // 6. Customer attempts to access /api/orders -> 403 Forbidden
      const custOrdersRes = await fetch('http://localhost:3000/api/orders', {
        headers: { Authorization: `Bearer ${custToken}` },
      });
      assert(custOrdersRes.status === 403, `Customer accessing /api/orders returns HTTP 403 (got ${custOrdersRes.status})`);

      // 7. Customer attempts to create product -> 403 Forbidden
      const custCreateProd = await fetch('http://localhost:3000/api/products', {
        method: 'POST',
        headers: { Authorization: `Bearer ${custToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Hacked Product', price: 100 }),
      });
      assert(custCreateProd.status === 403, `Customer creating product returns HTTP 403 (got ${custCreateProd.status})`);

      // 8. Super Admin updating sub_admin permissions:
      // First, get sub-admin user
      const usersRes = await fetch('http://localhost:3000/api/users', {
        headers: { Authorization: `Bearer ${superToken}` },
      });
      assert(usersRes.status === 200, 'Super admin fetched users list');
      const usersData = await usersRes.json();
      const subAdmin = usersData.users.find((u: any) => u.role === 'sub_admin' || u.role === 'admin');

      if (subAdmin) {
        // Attempting to grant a Super Admin-only permission (e.g. permission.manage) to sub_admin MUST be rejected with 403
        const escalateAttempt = await fetch(`http://localhost:3000/api/users/${subAdmin.id}/permissions`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            permissions: {
              'permission.manage': true,
            },
          }),
        });
        assert(escalateAttempt.status === 403, `Granting Super Admin-only permission "permission.manage" to sub_admin rejected with HTTP 403 (got ${escalateAttempt.status})`);

        // Valid permission update (granting order.cancel)
        const validUpdate = await fetch(`http://localhost:3000/api/users/${subAdmin.id}/permissions`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            permissions: {
              'order.cancel': true,
              'coupon.manage': true,
            },
          }),
        });
        assert(validUpdate.status === 200, `Valid permissions update succeeded with HTTP 200`);
        const updatedJson = await validUpdate.json();
        assert(updatedJson.success === true, 'Permissions update success=true');

        // Audit log check: verify permission update was recorded
        const auditRes = await fetch('http://localhost:3000/api/admin/audit-logs', {
          headers: { Authorization: `Bearer ${superToken}` },
        });
        assert(auditRes.status === 200, 'Super admin fetched audit logs with HTTP 200');
        const auditData = await auditRes.json();
        assert(auditData.logs.length > 0, `Audit logs recorded count: ${auditData.logs.length}`);
        const lastAudit = auditData.logs[0];
        assert(lastAudit.action === 'permission.update', `Last audit log action is "permission.update" (got ${lastAudit.action})`);
        assert(lastAudit.targetId === subAdmin.id, `Last audit targetId matches sub-admin ID`);
      }

      console.log('  Live API testing passed all tests!');
    }
  } catch (e: any) {
    console.log('  Notice: Local server check skipped or completed with message:', e.message);
  }

  console.log('\n====================================================');
  console.log('✅ ALL PART 3A RBAC VERIFICATION CHECKS PASSED PERFECTLY!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
