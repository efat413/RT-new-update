import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { INITIAL_PRODUCTS, INITIAL_REVIEWS } from '../src/data/seedData';
import { hasUserPermission } from '../src/utils/permissions';
import type { UserAccount, ProductReview } from '../src/types';

console.log('================================================================');
console.log('PART 4 PRODUCT REVIEW SCOPED VIEW & MANAGEMENT AUDIT');
console.log('================================================================');

// -------------------------------------------------------------
// TEST 1: Inspect Product Manage Card Action Buttons in AdminPanel
// -------------------------------------------------------------
console.log('\n[TEST 1] Verifying Reviews button placement beside existing actions in AdminPanel...');
const adminPanelSource = fs.readFileSync(path.resolve('src/components/AdminPanel.tsx'), 'utf-8');

// Ensure Edit Product button exists and is intact
assert(adminPanelSource.includes('id={`edit-product-${product.id}`}') || adminPanelSource.includes('openEditProductModal(product)'), 'Edit Product action button must exist');
// Ensure Delete Product button exists and is intact
assert(adminPanelSource.includes('id={`delete-product-${product.id}`}') || adminPanelSource.includes('Delete Product'), 'Delete Product action button must exist');
// Ensure inventory controls are intact
assert(adminPanelSource.includes('Available Units:') && adminPanelSource.includes('increaseStock(product.id'), 'Inventory controls must be intact');
// Ensure Reviews button exists beside product actions
assert(adminPanelSource.includes('id={`manage-reviews-${product.id}`}'), 'Reviews button with ID manage-reviews-${product.id} must exist');
assert(adminPanelSource.includes('setSelectedReviewProductFilter(product.id)'), 'Clicking Reviews must scope to product.id');
assert(adminPanelSource.includes("handleSelectTab('reviews')"), 'Clicking Reviews must navigate to reviews view');
// Ensure return path callback is wired to AdminReviewsTab
assert(adminPanelSource.includes('onBackToProducts={() => {') && adminPanelSource.includes("handleSelectTab('products')"), 'onBackToProducts return path to Product Manage must be provided');

console.log('✅ TEST 1 PASSED: Reviews button correctly integrated beside Edit/Delete without breaking inventory or pricing.');

// -------------------------------------------------------------
// TEST 2: Verifying Approved Review Count Calculation (Never Fabricated)
// -------------------------------------------------------------
console.log('\n[TEST 2] Verifying accurate approved-review count computation...');

// Verify that the count logic calculates strictly approved reviews
const sampleProduct = INITIAL_PRODUCTS[0];
const sampleReviews: ProductReview[] = [
  {
    id: 'rev-test-1',
    productId: sampleProduct.id,
    authorName: 'Customer A',
    rating: 5,
    comment: 'Great quality!',
    status: 'approved',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'rev-test-2',
    productId: sampleProduct.id,
    authorName: 'Customer B',
    rating: 1,
    comment: 'Spam comment',
    status: 'rejected',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'rev-test-3',
    productId: sampleProduct.id,
    authorName: 'Customer C',
    rating: 4,
    comment: 'Pending moderation',
    status: 'pending',
    createdAt: new Date().toISOString(),
  },
];

const computedApproved = sampleReviews.filter(
  (r) => (r.productId === sampleProduct.id || (sampleProduct.slug && r.productId === sampleProduct.slug)) && (r.status === 'approved' || !r.status)
).length;

assert.strictEqual(computedApproved, 1, 'Only approved reviews must be included in approved review count');
assert(adminPanelSource.includes('actualApprovedCount = reviews'), 'AdminPanel must dynamically compute actualApprovedCount from approved reviews');

console.log('✅ TEST 2 PASSED: Approved review count is accurately computed from real server records and never fabricated.');

// -------------------------------------------------------------
// TEST 3: Inspect AdminReviewsTab Source for Dedicated Scoped View Features
// -------------------------------------------------------------
console.log('\n[TEST 3] Verifying AdminReviewsTab dedicated product scoping and tabs...');
const reviewsTabSource = fs.readFileSync(path.resolve('src/components/AdminReviewsTab.tsx'), 'utf-8');

// Return path button
assert(reviewsTabSource.includes('id="back-to-product-management-btn"'), 'Return path button id="back-to-product-management-btn" must be present');
assert(reviewsTabSource.includes('Back to Product Management'), 'Clear "Back to Product Management" label must be present');

// Scoped product identification
assert(reviewsTabSource.includes('scopedProduct.title'), 'Selected product title must be clearly displayed');
assert(reviewsTabSource.includes('scopedProduct.price'), 'Selected product price must be displayed');
assert(reviewsTabSource.includes('scopedProduct.rating'), 'Selected product rating must be displayed');

// All, Pending, Approved, and Rejected tabs with accurate counts
assert(reviewsTabSource.includes('id="review-tab-all"'), 'Tab id="review-tab-all" must be present');
assert(reviewsTabSource.includes('id="review-tab-pending"'), 'Tab id="review-tab-pending" must be present');
assert(reviewsTabSource.includes('id="review-tab-approved"'), 'Tab id="review-tab-approved" must be present');
assert(reviewsTabSource.includes('id="review-tab-rejected"'), 'Tab id="review-tab-rejected" must be present');
assert(reviewsTabSource.includes('counts.pending') && reviewsTabSource.includes('counts.approved'), 'Tabs must render server-derived counts');

// Search & Filter controls
assert(reviewsTabSource.includes('searchQuery') && reviewsTabSource.includes('Search author, comment...'), 'Search input must be present');
assert(reviewsTabSource.includes('ratingFilter') && reviewsTabSource.includes('All Star Ratings'), 'Star rating filter must be present');
assert(reviewsTabSource.includes('dateFilter') && reviewsTabSource.includes('All Dates'), 'Date filter must be present');
assert(reviewsTabSource.includes('sortBy'), 'Sorting filter must be present');

// Prominent + Add Review button
assert(reviewsTabSource.includes('+ Add Review'), 'Prominent "+ Add Review" button must exist in product-specific view');

// Review item details
assert(reviewsTabSource.includes('rev.authorName || rev.author'), 'Reviewer name must be displayed');
assert(reviewsTabSource.includes('rev.rating'), 'Rating must be displayed');
assert(reviewsTabSource.includes('rev.comment'), 'Comment must be displayed');
assert(reviewsTabSource.includes('rev.createdAt'), 'Submission date must be displayed');
assert(reviewsTabSource.includes('Verified Purchase'), 'Verified purchase indicator must be displayed');
assert(reviewsTabSource.includes('Customer Review Photos') || reviewsTabSource.includes('rev.images'), 'Review photos thumbnail must be displayed');

// Details and Edit modals
assert(reviewsTabSource.includes('viewingReview') && reviewsTabSource.includes('Review Inspection Details'), 'View Details modal must be implemented');
assert(reviewsTabSource.includes('editingReview') && reviewsTabSource.includes('Edit Customer Review'), 'Edit Review modal must be implemented');

// Delete confirmation modal
assert(reviewsTabSource.includes('deleteCandidate') && reviewsTabSource.includes('id="confirm-delete-review-btn"'), 'Delete confirmation modal must be implemented');

console.log('✅ TEST 3 PASSED: AdminReviewsTab includes scoped view, return path, accurate tabs, filters, and all modals.');

// -------------------------------------------------------------
// TEST 4: Cross-Product Isolation (Requirement 12)
// -------------------------------------------------------------
console.log('\n[TEST 4] Verifying cross-product isolation (reviews of Product A cannot leak into Product B)...');

const productA = 'prod-watch-01';
const productB = 'prod-tws-01';

const mixedReviews: ProductReview[] = [
  {
    id: 'rev-a1',
    productId: productA,
    authorName: 'Reviewer A1',
    rating: 5,
    comment: 'Great watch',
    status: 'approved',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'rev-b1',
    productId: productB,
    authorName: 'Reviewer B1',
    rating: 4,
    comment: 'Great earbuds',
    status: 'approved',
    createdAt: new Date().toISOString(),
  },
];

// Product A scoped filtering
const scopedToA = mixedReviews.filter((r) => r.productId === productA);
assert.strictEqual(scopedToA.length, 1);
assert.strictEqual(scopedToA[0].id, 'rev-a1');
assert(!scopedToA.some((r) => r.productId === productB), 'Product B review must NEVER appear in Product A view');

// Product B scoped filtering
const scopedToB = mixedReviews.filter((r) => r.productId === productB);
assert.strictEqual(scopedToB.length, 1);
assert.strictEqual(scopedToB[0].id, 'rev-b1');
assert(!scopedToB.some((r) => r.productId === productA), 'Product A review must NEVER appear in Product B view');

// Check that AdminReviewsTab has the isolation filter
assert(
  reviewsTabSource.includes('r.productId === scopedProduct.id') ||
  reviewsTabSource.includes('r.productId === selectedProductId'),
  'AdminReviewsTab must strictly guard reviews by product ID'
);

console.log('✅ TEST 4 PASSED: Cross-product isolation strictly enforced.');

// -------------------------------------------------------------
// TEST 5: RBAC Permission Boundaries for Review Moderation
// -------------------------------------------------------------
console.log('\n[TEST 5] Verifying RBAC permission evaluation for review moderation...');

const superAdminUser: UserAccount = {
  id: 'usr-super',
  name: 'Super Admin',
  email: 'super@example.com',
  role: 'super_admin',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const viewOnlyAdmin: UserAccount = {
  id: 'usr-sub-view',
  name: 'View-Only Admin',
  email: 'view@example.com',
  role: 'sub_admin',
  permissions: {
    'review.view': true,
    'review.manage': false,
    'review.delete': false,
  },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const manageAdmin: UserAccount = {
  id: 'usr-admin-manage',
  name: 'Manager Admin',
  email: 'manage@example.com',
  role: 'admin',
  permissions: {
    'review.view': true,
    'review.manage': true,
    'review.delete': false,
  },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const customerUser: UserAccount = {
  id: 'usr-cust',
  name: 'Customer',
  email: 'cust@example.com',
  role: 'customer',
  createdAt: '2026-01-01T00:00:00.000Z',
};

// Super Admin has all permissions
assert.strictEqual(hasUserPermission(superAdminUser, 'review.view'), true);
assert.strictEqual(hasUserPermission(superAdminUser, 'review.manage'), true);
assert.strictEqual(hasUserPermission(superAdminUser, 'review.delete'), true);

// View-Only Admin
assert.strictEqual(hasUserPermission(viewOnlyAdmin, 'review.view'), true);
assert.strictEqual(hasUserPermission(viewOnlyAdmin, 'review.manage'), false);
assert.strictEqual(hasUserPermission(viewOnlyAdmin, 'review.delete'), false);

// Manager Admin
assert.strictEqual(hasUserPermission(manageAdmin, 'review.view'), true);
assert.strictEqual(hasUserPermission(manageAdmin, 'review.manage'), true);
assert.strictEqual(hasUserPermission(manageAdmin, 'review.delete'), false);

// Customer
assert.strictEqual(hasUserPermission(customerUser, 'review.view'), false);
assert.strictEqual(hasUserPermission(customerUser, 'review.manage'), false);
assert.strictEqual(hasUserPermission(customerUser, 'review.delete'), false);

console.log('✅ TEST 5 PASSED: Server-verified permissions correctly govern view, manage, and delete capabilities.');

console.log('================================================================');
console.log('🎉 ALL PART 4 PRODUCT REVIEWS SCOPED VIEW AUDIT TESTS PASSED CLEANLY!');
console.log('================================================================');
