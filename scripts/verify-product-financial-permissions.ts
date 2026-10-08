import { createSignedTestToken, TEST_BASE_URL } from './test-auth-helper';

async function runTests() {
  console.log('--- STARTING VERIFICATION OF PRODUCT FINANCIAL PERMISSION SYSTEM ---');

  const superAdminToken = createSignedTestToken({
    userId: 'dev-super-admin-1',
    email: 'dev-superadmin@local.test',
    role: 'super_admin',
  });

  const adminToken = createSignedTestToken({
    userId: 'test-user-update-only',
    email: 'updater@local.test',
    role: 'admin',
  });

  let passCount = 0;
  let totalCount = 0;

  function assert(condition: boolean, desc: string) {
    totalCount++;
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passCount++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      process.exitCode = 1;
    }
  }

  // -------------------------------------------------------------
  // TEST CASE 1: Super Admin
  // can see/edit Buying Price, Selling Price and Profit
  // -------------------------------------------------------------
  console.log('\n[TEST CASE 1] Super Admin Capabilities');
  {
    const res = await fetch(`${TEST_BASE_URL}/api/products?all=true`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const data = await res.json();
    assert(res.status === 200, 'Super Admin GET /api/products returns 200');
    const firstProd = data.products?.[0];
    assert(firstProd?.buyingPrice !== undefined, 'Super Admin sees buyingPrice in product list');
    assert(firstProd?.unitProfit !== undefined, 'Super Admin sees unitProfit (profit) in product list');

    // Super Admin edit selling price and buying price
    const updateRes = await fetch(`${TEST_BASE_URL}/api/products/${firstProd.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        price: 1550,
        buyingPrice: 850,
      }),
    });
    const updateData = await updateRes.json();
    assert(updateRes.status === 200 && updateData.success === true, 'Super Admin can edit both Selling Price & Buying Price');
    assert(updateData.product?.buyingPrice === 850, 'Super Admin response returns updated buyingPrice');
    assert(updateData.product?.price === 1550, 'Super Admin response returns updated Selling Price');
    assert(updateData.product?.unitProfit === 1550 - 850, 'Super Admin response returns updated unitProfit');
  }

  // -------------------------------------------------------------
  // TEST CASE 2: Admin with product.update only
  // can edit Selling Price, cannot see Buying Price, cannot see Profit
  // -------------------------------------------------------------
  console.log('\n[TEST CASE 2] Admin with product.update only');
  {
    // Super Admin configures admin permissions: product.update ONLY
    const setPermRes = await fetch(`${TEST_BASE_URL}/api/users/test-user-update-only/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        permissions: {
          'product.view': true,
          'product.update': true,
          'product.view_buying_price': false,
          'product.manage_buying_price': false,
          'product.view_profit': false,
        },
      }),
    });
    assert(setPermRes.status === 200, 'Super Admin sets permissions for Admin (product.update only)');

    const res = await fetch(`${TEST_BASE_URL}/api/products?all=true`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json();
    assert(res.status === 200, 'Admin with product.update GET /api/products returns 200');
    const firstProd = data.products?.[0];
    assert(firstProd?.buyingPrice === undefined && (firstProd as any)?.buying_price === undefined, 'Admin cannot see buyingPrice in API response');
    assert(firstProd?.unitProfit === undefined && (firstProd as any)?.profit === undefined, 'Admin cannot see unitProfit in API response');

    // Admin CAN edit selling price
    const updateSellingRes = await fetch(`${TEST_BASE_URL}/api/products/${firstProd.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        price: 1560,
      }),
    });
    const updateSellingData = await updateSellingRes.json();
    assert(updateSellingRes.status === 200 && updateSellingData.success === true, 'Admin with product.update can edit Selling Price');
    assert(updateSellingData.product?.buyingPrice === undefined, 'Product response still scrubs buyingPrice for this admin');
    assert(updateSellingData.product?.unitProfit === undefined, 'Product response still scrubs unitProfit for this admin');

    // Direct API attempt to modify buying price MUST return 403 Forbidden
    const updateBuyingAttemptRes = await fetch(`${TEST_BASE_URL}/api/products/${firstProd.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        buyingPrice: 999,
      }),
    });
    assert(updateBuyingAttemptRes.status === 403, 'Backend directly rejects buying price alteration with HTTP 403 Forbidden');
  }

  // -------------------------------------------------------------
  // TEST CASE 3: Admin with product.view_buying_price only
  // can see Buying Price, cannot edit Buying Price
  // -------------------------------------------------------------
  console.log('\n[TEST CASE 3] Admin with product.view_buying_price only');
  {
    // Super Admin configures admin permissions: product.view_buying_price only
    const setPermRes = await fetch(`${TEST_BASE_URL}/api/users/test-user-update-only/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        permissions: {
          'product.view': true,
          'product.update': true,
          'product.view_buying_price': true,
          'product.manage_buying_price': false,
          'product.view_profit': false,
        },
      }),
    });
    assert(setPermRes.status === 200, 'Super Admin sets permissions for Admin (product.view_buying_price only)');

    const res = await fetch(`${TEST_BASE_URL}/api/products?all=true`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json();
    assert(res.status === 200, 'Admin with view_buying_price GET /api/products returns 200');
    const firstProd = data.products?.[0];
    assert(firstProd?.buyingPrice !== undefined, 'Admin CAN see buyingPrice in API response');
    assert(firstProd?.unitProfit === undefined, 'Admin CANNOT see unitProfit in API response');

    // Attempt to edit buying price MUST return 403 Forbidden
    const editBuyingRes = await fetch(`${TEST_BASE_URL}/api/products/${firstProd.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        buyingPrice: 777,
      }),
    });
    assert(editBuyingRes.status === 403, 'Admin with view-only buying price is rejected with HTTP 403 when attempting edit');
  }

  // -------------------------------------------------------------
  // TEST CASE 4: Admin with product.manage_buying_price + product.view_buying_price
  // can see and edit Buying Price
  // -------------------------------------------------------------
  console.log('\n[TEST CASE 4] Admin with product.manage_buying_price + product.view_buying_price');
  {
    // Super Admin configures admin permissions: manage_buying_price + view_buying_price
    const setPermRes = await fetch(`${TEST_BASE_URL}/api/users/test-user-update-only/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        permissions: {
          'product.view': true,
          'product.update': true,
          'product.view_buying_price': true,
          'product.manage_buying_price': true,
          'product.view_profit': false,
        },
      }),
    });
    assert(setPermRes.status === 200, 'Super Admin sets permissions for Admin (manage_buying_price + view_buying_price)');

    const res = await fetch(`${TEST_BASE_URL}/api/products?all=true`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json();
    const firstProd = data.products?.[0];
    assert(firstProd?.buyingPrice !== undefined, 'Admin with manage_buying_price can see buyingPrice');

    const updateBuyingSuccessRes = await fetch(`${TEST_BASE_URL}/api/products/${firstProd.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        buyingPrice: 888,
      }),
    });
    const updateData = await updateBuyingSuccessRes.json();
    assert(updateBuyingSuccessRes.status === 200 && updateData.success === true, 'Admin with manage_buying_price can successfully modify buying price');
    assert(updateData.product?.buyingPrice === 888, 'Product returned with new buying price 888');
  }

  // -------------------------------------------------------------
  // TEST CASE 5: Admin with NO financial permissions
  // cannot see Buying Price, cannot see Profit, cannot edit Buying Price or financial fields
  // -------------------------------------------------------------
  console.log('\n[TEST CASE 5] Admin with NO financial permissions');
  {
    // Super Admin revokes all financial and update permissions
    const setPermRes = await fetch(`${TEST_BASE_URL}/api/users/test-user-update-only/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        permissions: {
          'product.view': true,
          'product.update': false,
          'product.view_buying_price': false,
          'product.manage_buying_price': false,
          'product.view_profit': false,
        },
      }),
    });
    assert(setPermRes.status === 200, 'Super Admin revokes all financial permissions');

    const res = await fetch(`${TEST_BASE_URL}/api/products?all=true`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json();
    const firstProd = data.products?.[0];
    assert(firstProd?.buyingPrice === undefined, 'Admin with NO financial permissions cannot see buyingPrice');
    assert(firstProd?.unitProfit === undefined, 'Admin with NO financial permissions cannot see unitProfit');

    // Attempt to update buying price
    const editBuyingRes = await fetch(`${TEST_BASE_URL}/api/products/${firstProd.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        buyingPrice: 666,
      }),
    });
    assert(editBuyingRes.status === 403, 'Forbidden 403 when updating buying price without permission');

    // Attempt to update selling price (product.update is false)
    const editSellingRes = await fetch(`${TEST_BASE_URL}/api/products/${firstProd.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        price: 2999,
      }),
    });
    assert(editSellingRes.status === 403, 'Forbidden 403 when updating selling price without product.update permission');
  }

  // -------------------------------------------------------------
  // TEST CASE 6: Direct API security - Non-Super Admin privilege escalation prevention
  // -------------------------------------------------------------
  console.log('\n[TEST CASE 6] Direct API Security & Privilege Escalation Boundary');
  {
    // Normal admin attempting to grant themselves permissions
    const attackRes = await fetch(`${TEST_BASE_URL}/api/users/test-user-update-only/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        permissions: {
          'product.view_buying_price': true,
          'product.manage_buying_price': true,
        },
      }),
    });
    assert(attackRes.status === 403, 'Non-Super Admin cannot modify permissions (HTTP 403 Forbidden)');

    // Normal admin attempting to promote themselves to super_admin
    const roleAttackRes = await fetch(`${TEST_BASE_URL}/api/users/test-user-update-only/role`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        role: 'super_admin',
      }),
    });
    assert(roleAttackRes.status === 403, 'Non-Super Admin cannot modify role (HTTP 403 Forbidden)');
  }

  console.log(`\n==================================================`);
  console.log(`FINAL RESULT: ${passCount}/${totalCount} tests passed.`);
  if (passCount === totalCount) {
    console.log('ALL TESTS PASSED SUCCESSFULLY! 🎯');
  } else {
    console.error('SOME TESTS FAILED.');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running verification:', err);
  process.exit(1);
});
