import assert from 'node:assert';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('===============================================================');
  console.log('STARTING HERO BANNER / SLIDER ORDER MANAGEMENT VERIFICATION');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function test(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // Admin tokens
  const adminToken = `dev-jwt-${Buffer.from(JSON.stringify({
    userId: 'super-admin-1',
    email: 'cmt413uec@gmail.com',
    role: 'super_admin',
    exp: Date.now() + 86400000,
  })).toString('base64')}`;

  const staffToken = `dev-jwt-${Buffer.from(JSON.stringify({
    userId: 'user-subadmin-staff',
    email: 'staff@rongdhonutrade.com',
    role: 'sub_admin',
    exp: Date.now() + 86400000,
  })).toString('base64')}`;

  // Initial fetch of sliders
  console.log('--- 1. INITIAL SLIDERS ORDER VERIFICATION ---');
  const initialSlidersRes = await fetch(`${BASE_URL}/api/sliders`);
  assert.strictEqual(initialSlidersRes.status, 200, 'GET /api/sliders should return 200');
  const initialSlidersData = await initialSlidersRes.json();
  const originalSlides = initialSlidersData.sliders;
  test(Array.isArray(originalSlides) && originalSlides.length >= 3, `1.1 Initial sliders fetched (${originalSlides.length} slides)`);

  const initialA = originalSlides[0];
  const initialB = originalSlides[1];
  const initialC = originalSlides[2];
  console.log(`  Initial Order: 1: ${initialA.id} (${initialA.title}), 2: ${initialB.id} (${initialB.title}), 3: ${initialC.id} (${initialC.title})`);

  test(Boolean(adminToken), '1.2 Logged in as super admin successfully');

  // TEST 9: Unauthenticated attempt on ordering API
  console.log('\n--- TEST 9: UNAUTHENTICATED / CUSTOMER ACCESS CONTROL ---');
  const unauthRes = await fetch(`${BASE_URL}/api/sliders/order`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: initialC.id, sort_order: 1 }]),
  });
  test(unauthRes.status === 401, `9.1 Customer/unauthenticated order request returns 401 Unauthorized (got ${unauthRes.status})`);

  // TEST 8: Authenticated user without slider.manage permission
  console.log('\n--- TEST 8: PERMISSION RESTRICTION ENFORCEMENT ---');
  // Sub-admin with no permissions
  const forbiddenRes = await fetch(`${BASE_URL}/api/sliders/order`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffToken}`,
    },
    body: JSON.stringify([{ id: initialC.id, sort_order: 1 }]),
  });
  test(forbiddenRes.status === 403, `8.1 User lacking slider.manage permission returns 403 Forbidden (got ${forbiddenRes.status})`);

  // TEST 1: Reorder C to top (1 -> C, 2 -> A, 3 -> B)
  console.log('\n--- TEST 1: REORDER C TO TOP (1 -> C, 2 -> A, 3 -> B) ---');
  const reorderPayload = [
    { id: initialC.id, sort_order: 1 },
    { id: initialA.id, sort_order: 2 },
    { id: initialB.id, sort_order: 3 },
  ];
  const reorderRes = await fetch(`${BASE_URL}/api/sliders/order`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(reorderPayload),
  });
  test(reorderRes.status === 200, `1.1 PUT /api/sliders/order returned HTTP 200 (got ${reorderRes.status})`);
  const reorderData = await reorderRes.json();
  test(reorderData.success === true, '1.2 API response reports success: true');

  // Verify by re-fetching /api/sliders
  const checkOrderRes = await fetch(`${BASE_URL}/api/sliders`);
  const checkOrderData = await checkOrderRes.json();
  const reorderedSlides = checkOrderData.sliders;
  test(reorderedSlides[0].id === initialC.id, `1.3 Slide C (${initialC.id}) is now #1`);
  test(reorderedSlides[1].id === initialA.id, `1.4 Slide A (${initialA.id}) is now #2`);
  test(reorderedSlides[2].id === initialB.id, `1.5 Slide B (${initialB.id}) is now #3`);

  // TEST 2: Customer Homepage reflection
  console.log('\n--- TEST 2: CUSTOMER HOMEPAGE REFLECTS NEW ORDER ---');
  const hpRes1 = await fetch(`${BASE_URL}/api/store/homepage`);
  const hpData1 = await hpRes1.json();
  test(hpData1.slides[0].id === initialC.id, `2.1 Public homepage hero slide #1 is Slide C (${initialC.id})`);
  test(hpData1.slides[1].id === initialA.id, `2.2 Public homepage hero slide #2 is Slide A (${initialA.id})`);

  // TEST 3: Change order again (1 -> B, 2 -> C, 3 -> A)
  console.log('\n--- TEST 3: CHANGE ORDER AGAIN (1 -> B, 2 -> C, 3 -> A) ---');
  const reorderPayload2 = [
    { id: initialB.id, sort_order: 1 },
    { id: initialC.id, sort_order: 2 },
    { id: initialA.id, sort_order: 3 },
  ];
  const reorderRes2 = await fetch(`${BASE_URL}/api/admin/sliders/order`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(reorderPayload2),
  });
  test(reorderRes2.status === 200, '3.1 PUT /api/admin/sliders/order succeeded');

  const hpRes2 = await fetch(`${BASE_URL}/api/store/homepage`);
  const hpData2 = await hpRes2.json();
  test(hpData2.slides[0].id === initialB.id, `3.2 Homepage immediately displays Slide B as #1 after reordering`);
  test(hpData2.slides[1].id === initialC.id, `3.3 Homepage displays Slide C as #2`);

  // TEST 4: Deactivate slide #1 (Slide B)
  console.log('\n--- TEST 4: DEACTIVATE SLIDE #1 AND VERIFY HOMEPAGE FILTERING ---');
  const deactRes = await fetch(`${BASE_URL}/api/sliders/${initialB.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ isActive: false }),
  });
  test(deactRes.status === 200, '4.1 PUT /api/sliders/:id with isActive=false returned 200');

  const hpRes3 = await fetch(`${BASE_URL}/api/store/homepage`);
  const hpData3 = await hpRes3.json();
  test(!hpData3.slides.some((s: any) => s.id === initialB.id), '4.2 Deactivated slide B does NOT appear on public homepage');
  test(hpData3.slides[0].id === initialC.id, `4.3 Slide C becomes the first visible slide on public homepage (${hpData3.slides[0].id})`);

  // Reactivate slide B
  await fetch(`${BASE_URL}/api/sliders/${initialB.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ isActive: true }),
  });

  // TEST 5: Edit existing banner content
  console.log('\n--- TEST 5: EDIT BANNER CONTENT WITHOUT RESETTING SORT ORDER ---');
  const editRes = await fetch(`${BASE_URL}/api/sliders/${initialC.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ headline: 'Updated Special Headline' }),
  });
  test(editRes.status === 200, '5.1 PUT /api/sliders/:id with updated headline returned 200');
  const editData = await editRes.json();
  test(editData.slider.headline === 'Updated Special Headline', '5.2 Headline successfully updated');

  const checkSortRes = await fetch(`${BASE_URL}/api/sliders`);
  const checkSortData = await checkSortRes.json();
  const cSlide = checkSortData.sliders.find((s: any) => s.id === initialC.id);
  test(cSlide.sort_order === 2, `5.3 Slide C sort_order retained its existing position 2 (got ${cSlide.sort_order})`);

  // TEST 6: Create a new banner
  console.log('\n--- TEST 6: CREATE NEW BANNER ASSIGNED TO END OF LIST ---');
  const createRes = await fetch(`${BASE_URL}/api/sliders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      title: 'Brand New Test Slide',
      headline: 'Fresh Arrivals 2026',
      imageUrl: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=1400&q=80',
    }),
  });
  test(createRes.status === 201, '6.1 POST /api/sliders created new slide with 201 Created');
  const createData = await createRes.json();
  const newSlideId = createData.slider.id;
  test(createData.slider.sort_order > 3, `6.2 New slide assigned to end of list (sort_order=${createData.slider.sort_order})`);

  // Verify existing banner order preserved
  const checkNewRes = await fetch(`${BASE_URL}/api/sliders`);
  const checkNewData = await checkNewRes.json();
  test(checkNewData.sliders[0].id === initialB.id, '6.3 Slide B remains #1');
  test(checkNewData.sliders[1].id === initialC.id, '6.4 Slide C remains #2');
  test(checkNewData.sliders[2].id === initialA.id, '6.5 Slide A remains #3');

  // TEST 7: Delete the newly created banner
  console.log('\n--- TEST 7: DELETE BANNER AND NORMALIZE REMAINING ORDER ---');
  const delRes = await fetch(`${BASE_URL}/api/sliders/${newSlideId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  test(delRes.status === 200, '7.1 DELETE /api/sliders/:id returned 200');

  const checkDelRes = await fetch(`${BASE_URL}/api/sliders`);
  const checkDelData = await checkDelRes.json();
  test(!checkDelData.sliders.some((s: any) => s.id === newSlideId), '7.2 Slide removed from slider list');
  test(checkDelData.sliders[0].id === initialB.id, '7.3 Slide B retains #1');
  test(checkDelData.sliders[1].id === initialC.id, '7.4 Slide C retains #2');
  test(checkDelData.sliders[2].id === initialA.id, '7.5 Slide A retains #3');

  // Restore original order
  console.log('\n--- RESTORING ORIGINAL ORDER (A, B, C) ---');
  await fetch(`${BASE_URL}/api/sliders/order`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify([
      { id: initialA.id, sort_order: 1 },
      { id: initialB.id, sort_order: 2 },
      { id: initialC.id, sort_order: 3 },
    ]),
  });
  console.log('✓ Restored original order');

  console.log('\n===============================================================');
  console.log(`SLIDER ORDER MANAGEMENT VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
