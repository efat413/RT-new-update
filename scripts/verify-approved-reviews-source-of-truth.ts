/**
 * Comprehensive verification for Approved Reviews as the Single Source of Truth
 */

import { generateProductSchema } from '../src/utils/seo';
import { Product, ProductReview } from '../src/types';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    failed++;
  }
}

async function runVerification() {
  console.log('========================================================');
  console.log('VERIFYING APPROVED REVIEWS AS SINGLE SOURCE OF TRUTH');
  console.log('========================================================\n');

  // --- STEP 1 & 2: Verify Codebase Removals ---
  console.log('--- SECTION 1: Obsolete Code & Control Removal ---');
  const adminPanelSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminPanel.tsx'), 'utf-8');
  assert(!adminPanelSrc.includes('Product Review Rating Controls'), '1.1 "Product Review Rating Controls" UI removed from AdminPanel.tsx');
  assert(!adminPanelSrc.includes('adjustProductRating'), '1.2 "adjustProductRating" removed from AdminPanel.tsx');
  assert(!adminPanelSrc.includes('ratingModalProduct'), '1.3 "ratingModalProduct" state removed from AdminPanel.tsx');
  assert(!adminPanelSrc.includes('openRatingAdjustmentModal'), '1.4 "openRatingAdjustmentModal" removed from AdminPanel.tsx');

  const adminDefSrc = fs.readFileSync(path.join(process.cwd(), 'src/context/AdminContextDefinition.ts'), 'utf-8');
  assert(!adminDefSrc.includes('adjustProductRating'), '1.5 "adjustProductRating" removed from AdminContextDefinition.ts');

  const adminProvSrc = fs.readFileSync(path.join(process.cwd(), 'src/context/AdminProvider.tsx'), 'utf-8');
  assert(!adminProvSrc.includes('adjustProductRating'), '1.6 "adjustProductRating" removed from AdminProvider.tsx');

  const storeCtxSrc = fs.readFileSync(path.join(process.cwd(), 'src/context/StoreContext.tsx'), 'utf-8');
  assert(!storeCtxSrc.includes('adjustProductRating'), '1.7 "adjustProductRating" removed from StoreContext.tsx');

  // --- SECTION 2: SEO AggregateRating Integrity ---
  console.log('\n--- SECTION 2: SEO Schema AggregateRating Validation ---');

  const testProductNoReviews: Product = {
    id: 'prod-test-01',
    title: 'Test Wallet',
    price: 1500,
    categoryId: 'cat-mens-accessories',
    description: 'A test wallet without reviews',
    imageUrl: 'https://example.com/img.jpg',
    stock: 10,
    featured: false,
    rating: 0,
    reviewsCount: 0,
    createdAt: new Date().toISOString(),
  };

  const schemaNoRevs = generateProductSchema(testProductNoReviews, 'Accessories', 'Rongodhonu Trade', []);
  assert(!schemaNoRevs.aggregateRating, '2.1 No AggregateRating emitted when reviews list is empty');

  const testReviewsWithPendingOnly: ProductReview[] = [
    {
      id: 'rev-pending-1',
      productId: 'prod-test-01',
      authorName: 'Customer A',
      rating: 5,
      comment: 'Pending review',
      createdAt: new Date().toISOString(),
      status: 'pending',
    },
    {
      id: 'rev-rejected-1',
      productId: 'prod-test-01',
      authorName: 'Customer B',
      rating: 1,
      comment: 'Rejected review',
      createdAt: new Date().toISOString(),
      status: 'rejected',
    },
  ];

  const schemaPendingOnly = generateProductSchema(testProductNoReviews, 'Accessories', 'Rongodhonu Trade', testReviewsWithPendingOnly);
  assert(!schemaPendingOnly.aggregateRating, '2.2 Pending/rejected reviews NEVER emit AggregateRating schema');

  const testReviewsApproved: ProductReview[] = [
    {
      id: 'rev-app-1',
      productId: 'prod-test-01',
      authorName: 'Customer 1',
      rating: 5,
      comment: 'Great product',
      createdAt: new Date().toISOString(),
      status: 'approved',
    },
    {
      id: 'rev-app-2',
      productId: 'prod-test-01',
      authorName: 'Customer 2',
      rating: 4,
      comment: 'Good product',
      createdAt: new Date().toISOString(),
      status: 'approved',
    },
    {
      id: 'rev-pending-2',
      productId: 'prod-test-01',
      authorName: 'Pending Customer',
      rating: 1,
      comment: 'Pending low review',
      createdAt: new Date().toISOString(),
      status: 'pending',
    },
  ];

  const schemaWithApproved = generateProductSchema(testProductNoReviews, 'Accessories', 'Rongodhonu Trade', testReviewsApproved);
  assert(Boolean(schemaWithApproved.aggregateRating), '2.3 AggregateRating correctly emitted when approved reviews exist');
  assert(schemaWithApproved.aggregateRating?.reviewCount === 2, '2.4 reviewCount strictly counts approved reviews (2, pending ignored)');
  assert(schemaWithApproved.aggregateRating?.ratingValue === '4.5', '2.5 ratingValue strictly calculates avg of approved reviews (4.5)');

  // --- SECTION 3: D1 Migration Check ---
  console.log('\n--- SECTION 3: Migration Check ---');
  const migrationPath = path.join(process.cwd(), 'migrations/0023_approved_reviews_source_of_truth.sql');
  assert(fs.existsSync(migrationPath), '3.1 Migration 0023_approved_reviews_source_of_truth.sql exists');
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  assert(migrationSql.includes("status = 'approved'"), '3.2 Migration recalculates products.rating and products.reviews_count strictly from approved reviews');

  // --- SECTION 4: Storefront & Detail Views ---
  console.log('\n--- SECTION 4: Storefront & Detail Component Verification ---');
  const prodCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ProductCard.tsx'), 'utf-8');
  assert(prodCardSrc.includes("status === 'approved'"), '4.1 ProductCard strictly filters for approved reviews');

  const prodDetailSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ProductDetailView.tsx'), 'utf-8');
  assert(prodDetailSrc.includes("status === 'approved'"), '4.2 ProductDetailView strictly filters for approved reviews');
  assert(!prodDetailSrc.includes('Math.max(backendReviewsCount, productReviews.length)'), '4.3 ProductDetailView removed backendReviewsCount fallback');

  const quickViewSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/QuickViewModal.tsx'), 'utf-8');
  assert(quickViewSrc.includes("status === 'approved'"), '4.4 QuickViewModal strictly filters for approved reviews');
  assert(!quickViewSrc.includes('Math.max(backendReviewsCount, productReviews.length)'), '4.5 QuickViewModal removed backendReviewsCount fallback');

  console.log('\n========================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
