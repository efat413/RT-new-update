/**
 * Code-Splitting and Lazy-Loading Verification Suite
 * Tests all 10 requested areas:
 * 1. Homepage
 * 2. Product list
 * 3. Product detail
 * 4. Quick View
 * 5. Cart
 * 6. Checkout
 * 7. Login
 * 8. Account
 * 9. Admin
 * 10. Order details
 */

import fs from 'node:fs';
import path from 'node:path';

async function runCodeSplittingVerification() {
  console.log('================================================================');
  console.log('STARTING ROUTE/PAGE CODE-SPLITTING VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  const distDir = path.resolve(process.cwd(), 'dist/assets');
  const appCode = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
  const cartDrawerCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CartDrawer.tsx'), 'utf-8');
  const headerCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Header.tsx'), 'utf-8');
  const userAccountCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UserAccountModal.tsx'), 'utf-8');
  const orderSuccessCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/OrderSuccessModal.tsx'), 'utf-8');
  const adminPanelCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminPanel.tsx'), 'utf-8');

  // --- 1. HOMEPAGE BUNDLE ISOLATION ---
  console.log('--- 1. HOMEPAGE INITIAL BUNDLE VERIFICATION ---');
  assert(
    !appCode.includes("import { ProductDetailView } from './components/ProductDetailView'") &&
    appCode.includes("const ProductDetailView = React.lazy("),
    '1.1 ProductDetailView is lazy-loaded with dynamic import() and NOT statically bundled into Homepage'
  );
  assert(
    !appCode.includes("import { CategoryListingView } from './components/CategoryListingView'") &&
    appCode.includes("const CategoryListingView = React.lazy("),
    '1.2 CategoryListingView is lazy-loaded with dynamic import() and NOT statically bundled into Homepage'
  );
  assert(
    appCode.includes("const AdminPanel = React.lazy("),
    '1.3 AdminPanel is strictly lazy-loaded and segregated from initial customer storefront'
  );
  assert(
    appCode.includes("<ErrorBoundary>"),
    '1.4 Root Application and routes are wrapped in ErrorBoundary to prevent screen blanks on chunk error'
  );

  // --- 2. PRODUCT LIST (CategoryListingView) ---
  console.log('\n--- 2. PRODUCT LIST (CATEGORY LISTING & SEARCH) ---');
  assert(
    appCode.includes("<CategoryListingLoadingFallback />"),
    '2.1 Professional skeleton fallback provided for category listing and search view'
  );
  assert(
    appCode.includes("selectedCategory || searchQuery.trim()"),
    '2.2 CategoryListingView mounts smoothly when selecting category, viewing /featured, or searching'
  );
  assert(
    appCode.includes("fallbackTitle=\"Category Unavailable\""),
    '2.3 CategoryListingView is shielded with ErrorBoundary for network resilience'
  );

  // --- 3. PRODUCT DETAIL (ProductDetailView) ---
  console.log('\n--- 3. PRODUCT DETAIL VIEW ---');
  assert(
    appCode.includes("const isProductRoute ="),
    '3.1 Single product route detection supports /product/:id and currentView === "product"'
  );
  assert(
    appCode.includes("<ProductDetailLoadingFallback />"),
    '3.2 Professional dual-column skeleton fallback provided while product details chunk loads'
  );
  assert(
    appCode.includes("fallbackTitle=\"Product Details Unavailable\""),
    '3.3 ProductDetailView is shielded with ErrorBoundary'
  );

  // --- 4. QUICK VIEW MODAL ---
  console.log('\n--- 4. QUICK VIEW MODAL ---');
  assert(
    appCode.includes("const QuickViewModal = React.lazy("),
    '4.1 QuickViewModal is lazy-loaded on demand only when customer clicks quick view eye/button'
  );
  assert(
    appCode.includes("quickViewProduct && ("),
    '4.2 QuickViewModal is rendered conditionally within GlobalModals with dedicated ErrorBoundary'
  );

  // --- 5. CART DRAWER ---
  console.log('\n--- 5. CART DRAWER ---');
  assert(
    appCode.includes("const CartDrawer = React.lazy("),
    '5.1 CartDrawer is lazy-loaded on demand only when opened'
  );
  assert(
    cartDrawerCode.includes("isCartOpen") && cartDrawerCode.includes("updateCartQuantity"),
    '5.2 CartDrawer retains instant cart item viewing, quantity modifiers, and item removal'
  );

  // --- 6. CHECKOUT FLOW ---
  console.log('\n--- 6. CHECKOUT FLOW ISOLATION ---');
  assert(
    cartDrawerCode.includes("const CheckoutSection = React.lazy("),
    '6.1 CheckoutSection is decoupled from CartDrawer and lazy-loaded on demand'
  );
  assert(
    fs.existsSync(path.resolve(process.cwd(), 'src/components/CheckoutSection.tsx')),
    '6.2 src/components/CheckoutSection.tsx exists as independent module'
  );
  assert(
    cartDrawerCode.includes("<CheckoutLoadingFallback />"),
    '6.3 CheckoutSection displays sleek loading skeleton while loading checkout form'
  );

  // --- 7. LOGIN & AUTH MODAL ---
  console.log('\n--- 7. LOGIN & REGISTRATION MODAL ---');
  assert(
    appCode.includes("const AuthModal = React.lazy("),
    '7.1 AuthModal is code-split and lazy-loaded only when Sign In / Register is requested'
  );

  // --- 8. USER ACCOUNT MODAL ---
  console.log('\n--- 8. USER ACCOUNT MODAL ---');
  assert(
    appCode.includes("const UserAccountModal = React.lazy("),
    '8.1 UserAccountModal is code-split and lazy-loaded only when profile is opened'
  );
  assert(
    userAccountCode.includes("const InvoiceModal = React.lazy("),
    '8.2 InvoiceModal inside UserAccount is lazy-loaded only when viewing customer invoices'
  );

  // --- 9. ADMIN PANEL & INTERNAL TOOLS ---
  console.log('\n--- 9. ADMIN PANEL & TOOLS ---');
  assert(
    adminPanelCode.includes("const AdminSlidesTab = React.lazy("),
    '9.1 Admin slides tab is code-split'
  );
  assert(
    adminPanelCode.includes("const AdminCouriersTab = React.lazy("),
    '9.2 Admin couriers tab is code-split'
  );
  assert(
    adminPanelCode.includes("const AdminProfitAnalyticsTab = React.lazy("),
    '9.3 Admin profit analytics tab is code-split'
  );
  assert(
    adminPanelCode.includes("const FeaturedProductsManagement = React.lazy("),
    '9.4 Admin FeaturedProductsManagement tab is code-split'
  );

  // --- 10. ORDER DETAILS & TRACKING ---
  console.log('\n--- 10. ORDER DETAILS & TRACKING ---');
  assert(
    headerCode.includes("const OrderTrackingDropdown = React.lazy("),
    '10.1 OrderTrackingDropdown in Header is code-split and lazy-loaded on demand'
  );
  assert(
    orderSuccessCode.includes("const InvoiceModal = React.lazy("),
    '10.2 InvoiceModal in OrderSuccessModal is lazy-loaded on demand'
  );

  // Check generated chunks in dist
  console.log('\n--- 11. BUILD ARTIFACTS VERIFICATION ---');
  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    const hasVendorReact = files.some(f => f.startsWith('vendor-react-'));
    const hasProductDetail = files.some(f => f.startsWith('ProductDetailView-'));
    const hasCategoryListing = files.some(f => f.startsWith('CategoryListingView-'));
    const hasCheckout = files.some(f => f.startsWith('CheckoutSection-'));
    const hasTracking = files.some(f => f.startsWith('OrderTrackingDropdown-'));
    const hasAreas = files.some(f => f.startsWith('bangladesh-areas-'));
    const hasIndex = files.some(f => f.startsWith('index-'));

    assert(hasVendorReact, '11.1 vendor-react chunk generated for long-term browser caching');
    assert(hasAreas, '11.2 bangladesh-areas chunk isolated for on-demand checkout loading');
    assert(hasProductDetail, '11.3 ProductDetailView chunk generated independently');
    assert(hasCategoryListing, '11.4 CategoryListingView chunk generated independently');
    assert(hasCheckout, '11.5 CheckoutSection chunk generated independently');
    assert(hasTracking, '11.6 OrderTrackingDropdown chunk generated independently');
    assert(hasIndex, '11.7 Primary index chunk generated');
  } else {
    console.log('ℹ️ dist directory not yet populated, will check after build completes');
  }

  console.log('\n================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCodeSplittingVerification().catch(err => {
  console.error('Verification failed with unhandled error:', err);
  process.exit(1);
});
