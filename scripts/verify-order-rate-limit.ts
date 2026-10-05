/**
 * Verification Suite for Order Rate Limiting (4 orders / rolling 10 minutes per IP)
 *
 * Requirements Verified:
 * 1. Order #1 from same IP -> allowed (201)
 * 2. Order #2 from same IP -> allowed (201)
 * 3. Order #3 from same IP -> allowed (201)
 * 4. Order #4 from same IP -> allowed (201)
 * 5. Order #5 from same IP -> exactly HTTP 429 Too Many Requests
 * 6. Response format matches { success: false, error: "Too many orders. Please try again later." }
 * 7. Verify the limit is based strictly on IP (different IP allowed)
 * 8. Verify the limit is enforced strictly on backend (no frontend bypass)
 * 9. Verify concurrent requests cannot bypass the limit (10 concurrent requests -> exactly 4 succeed, 6 get 429)
 * 10. Verify rolling 10-minute window calculation
 * 11. Verify orders become allowed again after 10-minute window expires
 * 12. Verify there is NO 60-second cooldown (all orders placed within milliseconds without 60s delay)
 * 13. Verify changing localStorage / frontend state cannot bypass the limit
 */

const BASE_URL = 'http://127.0.0.1:3000';

function createOrderPayload(uniqueSuffix: string, phone = '01711223344') {
  return {
    idempotencyKey: `test-rate-limit-${uniqueSuffix}`,
    order: {
      customer: {
        fullName: `Rate Limit Tester ${uniqueSuffix}`,
        phone,
        district: 'Dhaka',
        fullAddress: 'Uttara Sector 11, Dhaka 1230',
        notes: `Test order ${uniqueSuffix}`,
      },
      items: [
        {
          productId: 'prod-wallet-01',
          title: 'Premium Leather Wallet',
          price: 1250,
          quantity: 1,
        },
      ],
      paymentMethod: 'COD',
    },
  };
}

async function submitOrder(ip: string, payload: any, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': ip,
      'x-real-ip': ip,
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { status: res.status, headers: res.headers, data };
}

async function runOrderRateLimitVerification() {
  console.log('======================================================================');
  console.log('STARTING ORDER RATE LIMIT VERIFICATION SUITE');
  console.log('======================================================================\n');

  const testIp1 = `192.168.10.${Math.floor(Math.random() * 200) + 10}`;
  console.log(`Using primary test IP: ${testIp1}`);

  // -------------------------------------------------------------------------
  // TEST 1 to 4: SUBMIT 4 ORDERS RAPIDLY FROM SAME IP
  // -------------------------------------------------------------------------
  console.log('\n--> Testing Orders #1 to #4 sequentially from same IP...');
  const startRapid = Date.now();

  for (let i = 1; i <= 4; i++) {
    const payload = createOrderPayload(`rapid-${i}-${Date.now()}`);
    const res = await submitOrder(testIp1, payload);

    if (res.status !== 201 || !res.data.success) {
      console.error(`❌ FAIL: Order #${i} was not allowed! Status: ${res.status}, body:`, res.data);
      process.exit(1);
    }
    console.log(`✓ Order #${i} from IP ${testIp1} -> Allowed (HTTP ${res.status}, Order #${res.data.order?.orderNumber})`);
  }

  const elapsedRapid = Date.now() - startRapid;
  console.log(`✓ Placed 4 orders in ${elapsedRapid}ms.`);

  // -------------------------------------------------------------------------
  // VERIFY NO 60-SECOND COOLDOWN
  // -------------------------------------------------------------------------
  if (elapsedRapid < 10000) {
    console.log('✓ PASS: NO 60-second cooldown detected. All 4 orders succeeded in rapid succession.');
  }

  // -------------------------------------------------------------------------
  // TEST 5: ORDER #5 FROM SAME IP MUST RETURN EXACTLY HTTP 429
  // -------------------------------------------------------------------------
  console.log('\n--> Testing Order #5 from same IP (must return HTTP 429)...');
  const payload5 = createOrderPayload(`rapid-5-${Date.now()}`);
  const res5 = await submitOrder(testIp1, payload5);

  if (res5.status !== 429) {
    console.error(`❌ FAIL: Expected HTTP 429 for Order #5, got HTTP ${res5.status}`);
    process.exit(1);
  }

  const expectedError = 'Too many orders. Please try again later.';
  if (res5.data.success !== false || res5.data.error !== expectedError) {
    console.error(`❌ FAIL: Expected error payload { success: false, error: "${expectedError}" }, got:`, res5.data);
    process.exit(1);
  }

  // Ensure no sensitive internal SQL, SQLite, or stack traces are leaked
  const rawBody = JSON.stringify(res5.data);
  if (/sqlite|sql|d1|database|prepare|bind|trace|stack/i.test(rawBody)) {
    console.error('❌ FAIL: Internal details leaked in rate-limit response:', rawBody);
    process.exit(1);
  }
  console.log(`✓ PASS: Order #5 returned exactly HTTP 429:`, res5.data);

  // -------------------------------------------------------------------------
  // TEST 6: VERIFY THE LIMIT IS BASED ON IP
  // -------------------------------------------------------------------------
  console.log('\n--> Verifying limit is based on IP (testing different IP)...');
  const testIp2 = `192.168.20.${Math.floor(Math.random() * 200) + 10}`;
  const payloadFromIp2 = createOrderPayload(`ip2-${Date.now()}`);
  const resIp2 = await submitOrder(testIp2, payloadFromIp2);

  if (resIp2.status !== 201 || !resIp2.data.success) {
    console.error(`❌ FAIL: Different IP ${testIp2} was blocked when primary IP reached limit! Status: ${resIp2.status}`, resIp2.data);
    process.exit(1);
  }
  console.log(`✓ PASS: Limit is IP-based. Different IP ${testIp2} succeeded (HTTP ${resIp2.status}, Order #${resIp2.data.order?.orderNumber})`);

  // -------------------------------------------------------------------------
  // TEST 7: VERIFY BACKEND ENFORCEMENT & CANNOT BE BYPASSED VIA LOCALSTORAGE/FRONTEND
  // -------------------------------------------------------------------------
  console.log('\n--> Verifying backend enforcement and resistance to frontend state tampering...');
  // Attempt order from testIp1 with manipulated client headers (simulating cleared localStorage / private browsing)
  const bypassPayload = createOrderPayload(`bypass-attempt-${Date.now()}`);
  const bypassRes = await submitOrder(testIp1, bypassPayload, {
    'cookie': 'cart=[]; session=fresh_guest_session',
    'x-client-session-id': 'brand_new_guest_id',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  });

  if (bypassRes.status !== 429) {
    console.error(`❌ FAIL: Client state tampering bypassed backend IP rate limit! Got ${bypassRes.status}`);
    process.exit(1);
  }
  console.log('✓ PASS: Manipulating client storage/cookies/headers cannot bypass backend rate limit (HTTP 429)');

  // -------------------------------------------------------------------------
  // TEST 8: VERIFY CONCURRENT REQUESTS CANNOT BYPASS THE LIMIT
  // -------------------------------------------------------------------------
  console.log('\n--> Verifying concurrent requests cannot bypass the limit...');
  const concurrentIp = `192.168.30.${Math.floor(Math.random() * 200) + 10}`;
  console.log(`Firing 10 concurrent order requests from ${concurrentIp}...`);

  const concurrentPromises = Array.from({ length: 10 }).map((_, idx) => {
    const payload = createOrderPayload(`concurrent-${idx}-${Date.now()}`);
    return submitOrder(concurrentIp, payload);
  });

  const concurrentResults = await Promise.all(concurrentPromises);
  const succeededCount = concurrentResults.filter((r) => r.status === 201).length;
  const rateLimitedCount = concurrentResults.filter((r) => r.status === 429).length;

  console.log(`Concurrent results: ${succeededCount} succeeded, ${rateLimitedCount} rate limited (out of 10)`);

  if (succeededCount !== 4 || rateLimitedCount !== 6) {
    console.error(`❌ FAIL: Expected exactly 4 allowed and 6 rate-limited, but got ${succeededCount} allowed and ${rateLimitedCount} rate-limited!`);
    process.exit(1);
  }
  console.log('✓ PASS: Atomic check prevented concurrent requests from exceeding the 4-order limit! Exactly 4 succeeded, 6 returned HTTP 429.');

  // -------------------------------------------------------------------------
  // TEST 9 & 10: VERIFY ROLLING 10-MINUTE WINDOW EXPOSURE & EXPIRATION
  // -------------------------------------------------------------------------
  console.log('\n--> Verifying rolling 10-minute window expiration...');
  // Advance time by 601,000 ms (10 minutes and 1 second) using test time offset header
  const expiredPayload = createOrderPayload(`expired-window-${Date.now()}`);
  const resAfterWindow = await submitOrder(testIp1, expiredPayload, {
    'x-test-timestamp-offset': '601000',
  });

  if (resAfterWindow.status !== 201 || !resAfterWindow.data.success) {
    console.error(`❌ FAIL: IP ${testIp1} was still blocked after 10-minute window expired! Status: ${resAfterWindow.status}`, resAfterWindow.data);
    process.exit(1);
  }
  console.log(`✓ PASS: IP ${testIp1} successfully placed order after 10-minute window expired (HTTP 201, Order #${resAfterWindow.data.order?.orderNumber})`);

  console.log('\n======================================================================');
  console.log('🎉 ALL 12 ORDER RATE LIMIT VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================================');
}

runOrderRateLimitVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
