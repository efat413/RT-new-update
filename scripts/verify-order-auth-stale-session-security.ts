import assert from 'assert';
import {
  TEST_BASE_URL,
  getTestSecret,
  createSignedTestToken,
  loginAndGetToken,
  getTestCustomerToken,
  getTestAdminToken,
} from './test-auth-helper';

async function runSecuritySuite() {
  console.log('================================================================');
  console.log('🔒 ORDER API STALE & INVALID SESSION SECURITY VERIFICATION SUITE');
  console.log('================================================================');

  const secret = getTestSecret();
  let testSeq = 100;
  const productCatalog = [
    { id: 'prod-charger-08', title: '65W GaN Fast Charger', price: 1200 },
    { id: 'prod-tws-05', title: 'ANC Wireless Earbuds', price: 2100 },
    { id: 'prod-mouse-09b', title: 'Ergonomic Silent Mouse', price: 950 },
    { id: 'prod-sunglasses-04c', title: 'Polarized Aviator Sunglasses', price: 1450 },
  ];

  const makeOrderPayload = (overrides: Record<string, any> = {}, phoneSuffix?: string) => {
    testSeq++;
    const phone = phoneSuffix || `01712${String(testSeq).padStart(6, '0')}`;
    const prod = productCatalog[testSeq % productCatalog.length];
    const { customer: customerOverrides, ...restOverrides } = overrides;
    return {
      order: {
        ...restOverrides,
        customer: {
          fullName: 'Security Test Customer',
          phone,
          fullAddress: 'House 5, Road 2, Sector 1, Uttara',
          district: 'Dhaka',
          deliveryZone: 'inside_dhaka',
          ...(customerOverrides || {}),
        },
        items: [{ quantity: 1, product: prod }],
        subtotal: prod.price,
        deliveryFee: 60,
        totalAmount: prod.price + 60,
        paymentMethod: 'COD',
      },
    };
  };

  // -------------------------------------------------------------------------
  // TEST A: Valid active session → order creation succeeds
  // -------------------------------------------------------------------------
  console.log('\n--- TEST A: Valid Active Session Order Creation ---');
  const validCustomerEmail = `valid-cust-${Date.now()}@test.com`;
  const validCustomerPassword = 'SecurePassword123!';
  
  // Register a real customer
  const regRes = await fetch(`${TEST_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': '10.0.1.1',
    },
    body: JSON.stringify({
      name: 'Valid Customer',
      email: validCustomerEmail,
      password: validCustomerPassword,
      phone: '01711223344',
    }),
  });
  const regData = await regRes.json();
  assert(regRes.status === 201 && regData.token, 'Customer registration succeeded with token');
  const activeToken = regData.token;

  const validOrderRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`,
      'cf-connecting-ip': '10.0.1.2',
    },
    body: JSON.stringify(makeOrderPayload()),
  });
  const validOrderData = await validOrderRes.json();
  if (validOrderRes.status !== 201) {
    console.error('Test A failed with response:', validOrderData);
  }
  assert.strictEqual(validOrderRes.status, 201, `Expected 201, got ${validOrderRes.status}`);
  assert.strictEqual(validOrderData.success, true, 'Expected success: true');
  assert.strictEqual(validOrderData.order.userEmail, validCustomerEmail, 'Order bound to authenticated user email');
  assert.strictEqual(validOrderData.order.customer.email, validCustomerEmail, 'Customer info synced with user email');
  console.log('✅ [PASS] Test A: Valid active session successfully created order with bound identity');

  // -------------------------------------------------------------------------
  // TEST B: Expired session → 401 Unauthorized
  // -------------------------------------------------------------------------
  console.log('\n--- TEST B: Expired Session Token Rejection ---');
  const now = Math.floor(Date.now() / 1000);
  const expiredToken = createSignedTestToken(
    {
      userId: 'test-expired-user',
      email: 'expired@test.com',
      role: 'customer',
      exp: now - 3600, // Expired 1 hour ago
    },
    secret
  );

  const expiredOrderRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${expiredToken}`,
      'cf-connecting-ip': '10.0.2.1',
    },
    body: JSON.stringify(makeOrderPayload()),
  });
  const expiredOrderData = await expiredOrderRes.json();
  assert.strictEqual(expiredOrderRes.status, 401, `Expected 401 for expired token, got ${expiredOrderRes.status}`);
  assert.strictEqual(expiredOrderData.success, false, 'Expected success: false for expired token');
  assert(
    expiredOrderData.error.toLowerCase().includes('expired') || expiredOrderData.error.toLowerCase().includes('unauthorized'),
    `Expected expired session error message, got: ${expiredOrderData.error}`
  );
  console.log('✅ [PASS] Test B: Expired session token rejected with 401 Unauthorized');

  // Also test expired cookie
  const expiredCookieRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `auth_token=${encodeURIComponent(expiredToken)}`,
      'cf-connecting-ip': '10.0.2.2',
    },
    body: JSON.stringify(makeOrderPayload()),
  });
  assert.strictEqual(expiredCookieRes.status, 401, `Expected 401 for expired cookie, got ${expiredCookieRes.status}`);
  console.log('✅ [PASS] Test B: Expired session via HttpOnly cookie rejected with 401 Unauthorized');

  // -------------------------------------------------------------------------
  // TEST C: Invalid signature → 401 Unauthorized
  // -------------------------------------------------------------------------
  console.log('\n--- TEST C: Invalid Signature Token Rejection ---');
  const tamperedToken = createSignedTestToken(
    {
      userId: 'test-tampered-user',
      email: 'tampered@test.com',
      role: 'customer',
    },
    'completely-wrong-secret-key-123456789'
  );

  const tamperedOrderRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tamperedToken}`,
      'cf-connecting-ip': '10.0.3.1',
    },
    body: JSON.stringify(makeOrderPayload()),
  });
  const tamperedOrderData = await tamperedOrderRes.json();
  assert.strictEqual(tamperedOrderRes.status, 401, `Expected 401 for tampered signature, got ${tamperedOrderRes.status}`);
  assert.strictEqual(tamperedOrderData.success, false, 'Expected success: false for tampered signature');
  console.log('✅ [PASS] Test C: Invalid signature token rejected with 401 Unauthorized');

  // -------------------------------------------------------------------------
  // TEST D: Password-changed/stale session → Rejected (401)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST D: Password-Changed Stale Session Rejection ---');
  const pwdChangeEmail = `pwd-change-${Date.now()}@test.com`;
  const originalPassword = 'OriginalPassword123!';
  const updatedPassword = 'NewSecretPassword456!';

  // 1. Register user
  const regUserRes = await fetch(`${TEST_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': '10.0.4.1',
    },
    body: JSON.stringify({
      name: 'Password Change User',
      email: pwdChangeEmail,
      password: originalPassword,
      phone: '01719988776',
    }),
  });
  const regUserData = await regUserRes.json();
  assert(regUserRes.status === 201 && regUserData.token, 'User registered successfully');
  const staleSessionToken = regUserData.token;

  // 2. Change password using legitimate endpoint
  const changePwdRes = await fetch(`${TEST_BASE_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${staleSessionToken}`,
      'cf-connecting-ip': '10.0.4.2',
    },
    body: JSON.stringify({
      currentPassword: originalPassword,
      newPassword: updatedPassword,
    }),
  });
  const changePwdData = await changePwdRes.json();
  assert(changePwdRes.status === 200 && changePwdData.success, 'Password changed successfully');

  // 3. Attempt to place order using the OLD/STALE session token
  const staleOrderRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${staleSessionToken}`,
      'cf-connecting-ip': '10.0.4.3',
    },
    body: JSON.stringify(makeOrderPayload()),
  });
  const staleOrderData = await staleOrderRes.json();
  assert.strictEqual(staleOrderRes.status, 401, `Expected 401 for stale session, got ${staleOrderRes.status}`);
  assert.strictEqual(staleOrderData.success, false, 'Expected success: false for stale session');
  assert(
    staleOrderData.error.toLowerCase().includes('invalidated') || staleOrderData.error.toLowerCase().includes('password was changed'),
    `Expected session invalidated message, got: ${staleOrderData.error}`
  );
  console.log('✅ [PASS] Test D: Stale session token after password change rejected with 401 Unauthorized');

  // 4. Verify fresh login with new password succeeds and can create orders
  const freshLoginToken = await loginAndGetToken(pwdChangeEmail, updatedPassword);
  const freshOrderRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshLoginToken}`,
      'cf-connecting-ip': '10.0.4.4',
    },
    body: JSON.stringify(makeOrderPayload()),
  });
  const freshOrderData = await freshOrderRes.json();
  assert.strictEqual(freshOrderRes.status, 201, `Expected 201 with fresh token, got ${freshOrderRes.status}`);
  assert.strictEqual(freshOrderData.success, true, 'Fresh session placed order successfully');
  console.log('✅ [PASS] Test D: Fresh session after password change placed order successfully');

  // -------------------------------------------------------------------------
  // TEST E: Disabled/inactive account → Rejected (403)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST E: Disabled/Inactive Account Rejection ---');
  const disabledEmail = `disabled-cust-${Date.now()}@test.com`;
  
  // Register user
  const regDisabledRes = await fetch(`${TEST_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': '10.0.5.1',
    },
    body: JSON.stringify({
      name: 'Disabled User',
      email: disabledEmail,
      password: 'SamplePassword123!',
      phone: '01719911223',
    }),
  });
  const regDisabledData = await regDisabledRes.json();
  assert(regDisabledRes.status === 201, 'Disabled user registered');
  const disabledUserToken = regDisabledData.token;
  const disabledUserId = regDisabledData.user.id;

  // Deactivate the user using admin account
  const adminToken = await getTestAdminToken();
  const deactivateRes = await fetch(`${TEST_BASE_URL}/api/admin/users/${disabledUserId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
      'cf-connecting-ip': '10.0.5.2',
    },
    body: JSON.stringify({
      status: 'inactive',
    }),
  });
  assert(deactivateRes.status === 200, `Admin deactivated user (status: ${deactivateRes.status})`);

  // Attempt to place order using the disabled user's token
  const disabledOrderRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${disabledUserToken}`,
      'cf-connecting-ip': '10.0.5.3',
    },
    body: JSON.stringify(makeOrderPayload()),
  });
  const disabledOrderData = await disabledOrderRes.json();
  assert.strictEqual(disabledOrderRes.status, 403, `Expected 403 for inactive user, got ${disabledOrderRes.status}`);
  assert.strictEqual(disabledOrderData.success, false, 'Expected success: false for inactive user');
  assert(
    disabledOrderData.error.toLowerCase().includes('deactivated') || disabledOrderData.error.toLowerCase().includes('forbidden'),
    `Expected deactivated account message, got: ${disabledOrderData.error}`
  );
  console.log('✅ [PASS] Test E: Disabled/inactive account rejected with 403 Forbidden');

  // -------------------------------------------------------------------------
  // TEST F: Customer cannot create order as another user (impersonation prevention)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST F: Customer Impersonation Prevention ---');
  const impersonatePayload = makeOrderPayload({
    userId: 'target-victim-user-id-999',
    userEmail: 'victim@targetcompany.com',
    customerId: 'victim-cust-id',
    customer: {
      fullName: 'Attacker Impersonator',
      phone: '01855667788',
      fullAddress: 'Dhanmondi, Dhaka',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
      userId: 'target-victim-user-id-999',
      customerId: 'victim-cust-id',
      email: 'victim@targetcompany.com',
    },
  });

  const impersonateRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshLoginToken}`,
      'cf-connecting-ip': '10.0.6.1',
    },
    body: JSON.stringify(impersonatePayload),
  });
  const impersonateData = await impersonateRes.json();
  assert.strictEqual(impersonateRes.status, 201, 'Order created');
  assert.strictEqual(impersonateData.order.userEmail, pwdChangeEmail, 'Order bound to authenticated user, NOT victim email');
  assert.strictEqual(impersonateData.order.customer.email, pwdChangeEmail, 'Customer email synced with authenticated user');
  assert.notStrictEqual(impersonateData.order.userId, 'target-victim-user-id-999', 'Spoofed userId was NOT accepted');
  assert.notStrictEqual(impersonateData.order.customer?.userId, 'target-victim-user-id-999', 'Spoofed customer.userId was NOT accepted');
  console.log('✅ [PASS] Test F: Authenticated user cannot spoof another user ID or email');

  // -------------------------------------------------------------------------
  // TEST G: Customer cannot elevate or change role via request body
  // -------------------------------------------------------------------------
  console.log('\n--- TEST G: Role Injection Prevention ---');
  const roleInjectionPayload = makeOrderPayload({
    role: 'super_admin',
    userRole: 'super_admin',
    customerId: 'admin-1',
    customer: {
      role: 'super_admin',
      userRole: 'super_admin',
    },
  });

  const roleRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshLoginToken}`,
      'cf-connecting-ip': '10.0.7.1',
    },
    body: JSON.stringify(roleInjectionPayload),
  });
  const roleData = await roleRes.json();
  assert.strictEqual(roleRes.status, 201, 'Order placed');
  assert(!roleData.order.role, 'Injected role is stripped from order');
  assert(!roleData.order.userRole, 'Injected userRole is stripped from order');
  assert(!roleData.order.customer?.role, 'Injected role is stripped from customer');

  // Check the authenticated user's profile to confirm their role remained customer
  const meRes = await fetch(`${TEST_BASE_URL}/api/auth/me`, {
    headers: {
      'Authorization': `Bearer ${freshLoginToken}`,
      'cf-connecting-ip': '10.0.7.2',
    },
  });
  const meData = await meRes.json();
  assert.strictEqual(meData.user.role, 'customer', 'User role remained customer (no privilege escalation)');
  console.log('✅ [PASS] Test G: Request body role injection stripped and user role remained customer');

  // -------------------------------------------------------------------------
  // TEST H: Existing legitimate order flow works (Guest & Admin)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST H: Existing Legitimate Order Flow Verification ---');
  // 1. Guest order without token
  const guestPayload = makeOrderPayload({
    userId: 'spoofed-id',
    customerId: 'spoofed-cust',
    role: 'admin',
    customer: {
      fullName: 'Legitimate Guest Buyer',
      phone: '01912345678',
      fullAddress: 'Banani 11, Dhaka',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
      userId: 'spoofed-id',
    },
  });

  const guestRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': '10.0.8.1',
    },
    body: JSON.stringify(guestPayload),
  });
  const guestData = await guestRes.json();
  assert.strictEqual(guestRes.status, 201, 'Guest order created successfully');
  assert(!guestData.order.userId, 'Guest order userId is strictly undefined');
  assert(!guestData.order.userEmail, 'Guest order userEmail is strictly undefined');
  assert(!guestData.order.role, 'Guest order role is strictly undefined');
  assert(!guestData.order.customer?.userId, 'Guest customer.userId is strictly undefined');
  console.log('✅ [PASS] Test H.1: Legitimate guest order succeeds with stripped spoofed fields');

  // 2. Admin placed order
  const adminOrderPayload = makeOrderPayload({
    customer: {
      fullName: 'Admin Assisted Customer',
      phone: '01511223344',
      fullAddress: 'Gulshan 2, Dhaka',
      district: 'Dhaka',
      deliveryZone: 'inside_dhaka',
    },
  });
  const adminOrderRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
      'cf-connecting-ip': '10.0.8.2',
    },
    body: JSON.stringify(adminOrderPayload),
  });
  const adminOrderData = await adminOrderRes.json();
  assert.strictEqual(adminOrderRes.status, 201, 'Admin placed order created successfully');
  console.log('✅ [PASS] Test H.2: Admin order placement functionality preserved');

  // 3. Admin order listing functionality
  const adminListRes = await fetch(`${TEST_BASE_URL}/api/orders`, {
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'cf-connecting-ip': '10.0.8.3',
    },
  });
  const adminListData = await adminListRes.json();
  assert.strictEqual(adminListRes.status, 200, 'Admin can list orders');
  assert(Array.isArray(adminListData.orders), 'Orders returned as array');
  console.log('✅ [PASS] Test H.3: Admin order management endpoints preserved and functional');

  console.log('\n================================================================');
  console.log('🎉 ALL SECURITY REQUIREMENTS (A through H) VERIFIED SUCCESSFULLY!');
  console.log('================================================================');
}

runSecuritySuite().catch((err) => {
  console.error('❌ Security verification failed:', err);
  process.exit(1);
});
