import fs from 'fs';
import path from 'path';
import { getTestAdminToken } from './test-auth-helper';

async function runFeaturedProductsVerification() {
  const baseUrl = 'http://localhost:3000';
  console.log('====================================================');
  console.log('RUNNING FEATURED PRODUCTS SYSTEM VERIFICATION SUITE');
  console.log('====================================================');

  // 1. Verify Migration 0012 & Schema
  console.log('\n[TEST 1] Verifying Migration 0012 and Schema...');
  const migrationPath = path.resolve('migrations/0012_featured_sort_order.sql');
  if (!fs.existsSync(migrationPath)) {
    throw new Error('Migration 0012_featured_sort_order.sql does not exist!');
  }
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  if (!migrationSql.includes('featured_sort_order') || !migrationSql.includes('idx_products_featured_sort_order')) {
    throw new Error('Migration 0012 does not include required columns and indexes!');
  }
  console.log('✓ Migration 0012_featured_sort_order.sql verified');

  // 2. Verify Homepage Store API (/api/store/homepage)
  console.log('\n[TEST 2] Verifying Homepage Consolidated Endpoint...');
  const hpRes = await fetch(`${baseUrl}/api/store/homepage`);
  if (!hpRes.ok) {
    throw new Error(`Failed to load homepage store API: ${hpRes.status}`);
  }
  const hpData = await hpRes.json();
  if (!hpData.success || !Array.isArray(hpData.featuredProducts)) {
    throw new Error('Homepage response missing featuredProducts array!');
  }
  console.log(`✓ Homepage returned ${hpData.featuredProducts.length} featured products (capped at max 8)`);
  if (hpData.featuredProducts.length > 8) {
    throw new Error(`Homepage featuredProducts exceeded bound of 8: found ${hpData.featuredProducts.length}`);
  }
  // Verify no buyingPrice leaked
  for (const fp of hpData.featuredProducts) {
    if (fp.buyingPrice !== undefined || fp.unitProfit !== undefined) {
      throw new Error(`Security leak: featured product ${fp.id} leaked buyingPrice or unitProfit!`);
    }
  }
  console.log('✓ Homepage featured products securely exclude confidential pricing fields');

  // 3. Verify Unauthorized Protection
  console.log('\n[TEST 3] Verifying Security & Authorization on /api/products/:id/featured...');
  const testProd = hpData.products[0];
  if (!testProd) throw new Error('No products found in database to test with');

  const unauthRes = await fetch(`${baseUrl}/api/products/${testProd.id}/featured`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isFeatured: true }),
  });
  console.log(`Unauthenticated status: ${unauthRes.status}`);
  if (unauthRes.status !== 401 && unauthRes.status !== 403) {
    throw new Error(`Expected 401/403 for unauthenticated request, got ${unauthRes.status}`);
  }
  console.log('✓ Unauthenticated toggle of featured status strictly rejected');

  // 4. Authenticate as Super Admin
  console.log('\n[TEST 4] Authenticating as Admin/Super Admin...');
  const devToken = await getTestAdminToken(baseUrl);

  const authHeaders = {
    'Authorization': `Bearer ${devToken}`,
    'Content-Type': 'application/json',
  };

  // 5. Test Cross-Category Featured Addition
  console.log('\n[TEST 5] Testing Cross-Category Featured Addition & Invariance...');
  // Find two products in DIFFERENT categories
  const allProdsRes = await fetch(`${baseUrl}/api/products?includeInactive=true`, { headers: authHeaders });
  const allProdsData = await allProdsRes.json();
  const allProds: any[] = allProdsData.products || [];

  const prodCatMap = new Map<string, any[]>();
  for (const p of allProds) {
    const list = prodCatMap.get(p.categoryId) || [];
    list.push(p);
    prodCatMap.set(p.categoryId, list);
  }

  const categoryIds = Array.from(prodCatMap.keys());
  if (categoryIds.length < 2) {
    throw new Error('Need at least 2 distinct categories for testing');
  }

  const productA = prodCatMap.get(categoryIds[0])![0];
  const productB = prodCatMap.get(categoryIds[1])![0];
  console.log(`Product A: "${productA.title}" (Category: ${productA.categoryId})`);
  console.log(`Product B: "${productB.title}" (Category: ${productB.categoryId})`);

  // Add Product A to Featured
  const addARes = await fetch(`${baseUrl}/api/products/${productA.id}/featured`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ isFeatured: true, featuredSortOrder: 1 }),
  });
  if (!addARes.ok) throw new Error(`Failed to feature product A: ${addARes.status}`);
  const addAData = await addARes.json();
  console.log('Add Product A result:', addAData.product?.featured, 'Sort order:', addAData.product?.featuredSortOrder);
  if (!addAData.product?.featured) throw new Error('Product A was not marked as featured');
  if (addAData.product?.categoryId !== productA.categoryId) {
    throw new Error('CRITICAL FAILURE: Featuring Product A changed its category!');
  }
  if (addAData.product?.price !== productA.price || addAData.product?.stock !== productA.stock) {
    throw new Error('CRITICAL FAILURE: Featuring Product A modified product price/stock!');
  }

  // Add Product B to Featured
  const addBRes = await fetch(`${baseUrl}/api/products/${productB.id}/featured`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ isFeatured: true, featuredSortOrder: 2 }),
  });
  if (!addBRes.ok) throw new Error(`Failed to feature product B: ${addBRes.status}`);
  const addBData = await addBRes.json();
  console.log('Add Product B result:', addBData.product?.featured, 'Sort order:', addBData.product?.featuredSortOrder);
  if (!addBData.product?.featured) throw new Error('Product B was not marked as featured');
  if (addBData.product?.categoryId !== productB.categoryId) {
    throw new Error('CRITICAL FAILURE: Featuring Product B changed its category!');
  }

  // 6. Verify Deterministic Sorting on Homepage
  console.log('\n[TEST 6] Verifying Homepage Deterministic Ordering...');
  const hpRes2 = await fetch(`${baseUrl}/api/store/homepage`);
  const hpData2 = await hpRes2.json();
  const featList = hpData2.featuredProducts as any[];
  const foundAIdx = featList.findIndex((p) => p.id === productA.id);
  const foundBIdx = featList.findIndex((p) => p.id === productB.id);
  console.log(`Featured positions: A at index ${foundAIdx}, B at index ${foundBIdx}`);
  if (foundAIdx === -1 || foundBIdx === -1) {
    throw new Error('Both products from different categories must appear in homepage featured list');
  }
  if (foundAIdx > foundBIdx) {
    throw new Error('Product A (sort order 1) should appear before Product B (sort order 2)');
  }
  console.log('✓ Products from distinct categories featured simultaneously with deterministic sort order');

  // 7. Verify Server-Side Dedicated Featured Pagination
  console.log('\n[TEST 7] Verifying Dedicated /api/products?featured=true Paginated Query...');
  const pagedFeatRes = await fetch(`${baseUrl}/api/products?featured=true&page=1&limit=24`);
  if (!pagedFeatRes.ok) throw new Error(`Failed to query paginated featured products: ${pagedFeatRes.status}`);
  const pagedFeatData = await pagedFeatRes.json();
  console.log(`Paginated query returned total ${pagedFeatData.total} featured products`);
  for (const fp of pagedFeatData.products) {
    if (!fp.featured) throw new Error(`Product ${fp.id} in featured query does not have featured=true!`);
  }
  console.log('✓ /api/products?featured=true only returns products with featured=1');

  // 8. Test Product Removal from Featured (MUST NOT DELETE PRODUCT)
  console.log('\n[TEST 8] Verifying Product Removal from Featured (Must NOT Delete)...');
  const removeARes = await fetch(`${baseUrl}/api/products/${productA.id}/featured`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ isFeatured: false }),
  });
  if (!removeARes.ok) throw new Error(`Failed to remove product A from featured: ${removeARes.status}`);
  const removeAData = await removeARes.json();
  if (removeAData.product?.featured) throw new Error('Product A is still marked as featured');
  if (removeAData.product?.categoryId !== productA.categoryId) {
    throw new Error('CRITICAL FAILURE: Removing from featured changed product category!');
  }

  // Verify Product A still exists in catalog
  const checkARes = await fetch(`${baseUrl}/api/products/${productA.id}`);
  if (!checkARes.ok) throw new Error('CRITICAL FAILURE: Product A was deleted after removing from featured!');
  const checkAData = await checkARes.json();
  if (!checkAData.product || checkAData.product.id !== productA.id) {
    throw new Error('Product A could not be fetched after unfeaturing!');
  }
  if (checkAData.product.featured) {
    throw new Error('Product A should have featured=false');
  }
  console.log('✓ Product A removed from featured; product preserved completely intact in catalog with original category');

  // Verify Homepage no longer shows Product A as featured
  const hpRes3 = await fetch(`${baseUrl}/api/store/homepage`);
  const hpData3 = await hpRes3.json();
  const foundAAfter = (hpData3.featuredProducts as any[]).some((p) => p.id === productA.id);
  if (foundAAfter) throw new Error('Product A still appears in homepage featured products after unfeaturing');
  console.log('✓ Product A immediately removed from homepage featured section');

  console.log('\n====================================================');
  console.log('ALL FEATURED PRODUCTS VERIFICATION CHECKS PASSED! ✨');
  console.log('====================================================\n');
}

runFeaturedProductsVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
