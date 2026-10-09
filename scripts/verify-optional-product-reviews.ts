/**
 * Automated Verification Suite for Product Reviews & Ratings (Zero and Optional Reviews)
 */

import { createSignedTestToken } from './test-auth-helper';

async function runTests() {
  console.log('--- STARTING PRODUCT REVIEW & RATING VERIFICATION ---');
  const baseUrl = 'http://127.0.0.1:3000';

  const token = createSignedTestToken({
    userId: 'dev-super-admin-1',
    email: 'dev-superadmin@local.test',
    role: 'super_admin',
    permissions: {
      canManageProducts: true,
      'product.create': true,
      'product.update': true,
      'product.view': true,
      'product.delete': true,
    },
  });

  // Helper headers for dev admin auth
  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // TEST 1: Create product with Rating = 5.0, Reviews = 0
  console.log('\n[TEST 1] Creating product with Rating = 5.0, Reviews = 0...');
  const res1 = await fetch(`${baseUrl}/api/products`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      product: {
        title: 'Zero Review Test Product',
        price: 999,
        stock: 10,
        rating: 5.0,
        reviewsCount: 0,
        description: 'Testing 0 review creation',
      },
    }),
  });
  const data1 = await res1.json();
  if (!res1.ok || !data1.success || data1.product.reviewsCount !== 0) {
    throw new Error(`TEST 1 FAILED: Expected reviewsCount=0, got ${JSON.stringify(data1)}`);
  }
  console.log(`✅ TEST 1 PASSED: Product created with reviewsCount = ${data1.product.reviewsCount} (id: ${data1.product.id})`);
  const prod1Id = data1.product.id;

  // TEST 2: Create product with Rating = 4.8, Reviews = 25
  console.log('\n[TEST 2] Creating product with Rating = 4.8, Reviews = 25...');
  const res2 = await fetch(`${baseUrl}/api/products`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      product: {
        title: '25 Review Test Product',
        price: 1200,
        stock: 15,
        rating: 4.8,
        reviewsCount: 25,
        description: 'Testing 25 reviews creation',
      },
    }),
  });
  const data2 = await res2.json();
  if (!res2.ok || !data2.success || data2.product.reviewsCount !== 25) {
    throw new Error(`TEST 2 FAILED: Expected reviewsCount=25, got ${JSON.stringify(data2)}`);
  }
  console.log(`✅ TEST 2 PASSED: Product created with reviewsCount = ${data2.product.reviewsCount} (id: ${data2.product.id})`);
  const prod2Id = data2.product.id;

  // TEST 3: Create product and leave review field empty / undefined
  console.log('\n[TEST 3] Creating product with empty/undefined reviewsCount...');
  const res3 = await fetch(`${baseUrl}/api/products`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      product: {
        title: 'Empty Review Test Product',
        price: 750,
        stock: 5,
        rating: 5.0,
        // reviewsCount omitted
        description: 'Testing omitted review field defaults to 0',
      },
    }),
  });
  const data3 = await res3.json();
  if (!res3.ok || !data3.success || data3.product.reviewsCount !== 0) {
    throw new Error(`TEST 3 FAILED: Expected reviewsCount=0, got ${JSON.stringify(data3)}`);
  }
  console.log(`✅ TEST 3 PASSED: Product created with reviewsCount = ${data3.product.reviewsCount}`);

  // TEST 4: Edit product currently having 0 reviews, saving without changes
  console.log('\n[TEST 4] Editing 0-review product, keeping reviewsCount = 0...');
  const res4 = await fetch(`${baseUrl}/api/products/${prod1Id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      updates: {
        reviewsCount: 0,
        title: 'Zero Review Test Product (Updated)',
      },
    }),
  });
  const data4 = await res4.json();
  if (!res4.ok || !data4.success || data4.product.reviewsCount !== 0) {
    throw new Error(`TEST 4 FAILED: Expected reviewsCount=0, got ${JSON.stringify(data4)}`);
  }
  console.log(`✅ TEST 4 PASSED: reviewsCount preserved as ${data4.product.reviewsCount}`);

  // TEST 5: Edit product having 25 reviews without changing review count
  console.log('\n[TEST 5] Editing 25-review product, preserving reviewsCount = 25...');
  const res5 = await fetch(`${baseUrl}/api/products/${prod2Id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      updates: {
        reviewsCount: 25,
        title: '25 Review Test Product (Updated)',
      },
    }),
  });
  const data5 = await res5.json();
  if (!res5.ok || !data5.success || data5.product.reviewsCount !== 25) {
    throw new Error(`TEST 5 FAILED: Expected reviewsCount=25, got ${JSON.stringify(data5)}`);
  }
  console.log(`✅ TEST 5 PASSED: reviewsCount preserved as ${data5.product.reviewsCount}`);

  // TEST 6: Product updates API with Rating = 4.5 and Reviews = 0
  console.log('\n[TEST 6] Testing product updates API to rating=4.5, reviewsCount=0...');
  const res6 = await fetch(`${baseUrl}/api/products/${prod2Id}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      updates: {
        rating: 4.5,
        reviewsCount: 0,
      },
    }),
  });
  const data6 = await res6.json();
  if (!res6.ok || !data6.success || data6.product.reviewsCount !== 0 || data6.product.rating !== 4.5) {
    throw new Error(`TEST 6 FAILED: Expected reviewsCount=0, rating=4.5, got ${JSON.stringify(data6)}`);
  }
  console.log(`✅ TEST 6 PASSED: Product updates API saved reviewsCount = ${data6.product.reviewsCount}, rating = ${data6.product.rating}`);

  // TEST 7 & 8: Fetch single product from public GET /api/products/:id
  console.log('\n[TEST 7 & 8] Fetching 0-review product as public user...');
  const res7 = await fetch(`${baseUrl}/api/products/${prod1Id}`);
  const data7 = await res7.json();
  if (!res7.ok || !data7.success || data7.product.reviewsCount !== 0) {
    throw new Error(`TEST 7/8 FAILED: Expected public product reviewsCount=0, got ${JSON.stringify(data7)}`);
  }
  console.log(`✅ TEST 7 & 8 PASSED: Public product API returns reviewsCount = ${data7.product.reviewsCount} (never forced to 1)`);

  // TEST 9: Existing products with actual reviews
  console.log('\n[TEST 9] Checking existing product with reviews...');
  const res9 = await fetch(`${baseUrl}/api/products`);
  const data9 = await res9.json();
  const prodWithReviews = data9.products.find((p: any) => p.reviewsCount > 0);
  if (!prodWithReviews) {
    throw new Error('TEST 9 FAILED: Could not find any product with reviewsCount > 0');
  }
  console.log(`✅ TEST 9 PASSED: Existing product "${prodWithReviews.title}" has reviewsCount = ${prodWithReviews.reviewsCount}`);

  // TEST 10: Refresh/re-fetch product after update
  console.log('\n[TEST 10] Reloading product after multiple updates...');
  const res10 = await fetch(`${baseUrl}/api/products/${prod2Id}`);
  const data10 = await res10.json();
  if (!res10.ok || !data10.success || data10.product.reviewsCount !== 0) {
    throw new Error(`TEST 10 FAILED: Expected reviewsCount=0, got ${JSON.stringify(data10)}`);
  }
  console.log(`✅ TEST 10 PASSED: Product re-fetched cleanly with reviewsCount = ${data10.product.reviewsCount}`);

  console.log('\n========================================');
  console.log('🎉 ALL 10 TESTS PASSED SUCCESSFULLY!');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
