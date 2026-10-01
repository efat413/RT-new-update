import React, { useState } from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import { Header } from './components/Header';
import { HeroCarousel } from './components/HeroCarousel';
import { ProductCard } from './components/ProductCard';
import { ToastNotification } from './components/ToastNotification';
import { Footer } from './components/Footer';
import { CategoryProductCarousel } from './components/CategoryProductCarousel';
import { FeaturedProductsCarousel } from './components/FeaturedProductsCarousel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { formatWhatsAppLink } from './utils/phone';
import { DEFAULT_SITE_NAME } from './utils/seo';
import {
  Sparkles,
  SlidersHorizontal,
  Phone,
  MessageCircle,
  Package,
  Tag,
  ChevronDown,
  ShoppingCart,
  Share2,
  RefreshCw,
  LayoutGrid,
  Watch,
  Headphones,
  Gift,
} from 'lucide-react';

// Code-splitting: Lazy-load route pages
// Storefront visitors do NOT download heavy admin, product detail, or category listing chunks during initial load
const AdminPanel = React.lazy(() =>
  import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel }))
);
const ResetPasswordPage = React.lazy(() =>
  import('./components/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage }))
);
const ProductDetailView = React.lazy(() =>
  import('./components/ProductDetailView').then((m) => ({ default: m.ProductDetailView }))
);
const CategoryListingView = React.lazy(() =>
  import('./components/CategoryListingView').then((m) => ({ default: m.CategoryListingView }))
);

// Code-splitting: Lazy-load global modal and drawer components
// Heavy modal/drawer chunks are loaded on demand only when opened by the user,
// drastically reducing initial JavaScript bundle size and homepage parse time.
const CartDrawer = React.lazy(() =>
  import('./components/CartDrawer').then((m) => ({ default: m.CartDrawer }))
);
const WishlistDrawer = React.lazy(() =>
  import('./components/WishlistDrawer').then((m) => ({ default: m.WishlistDrawer }))
);
const QuickViewModal = React.lazy(() =>
  import('./components/QuickViewModal').then((m) => ({ default: m.QuickViewModal }))
);
const ProductVideoModal = React.lazy(() =>
  import('./components/ProductVideoModal').then((m) => ({ default: m.ProductVideoModal }))
);
const OrderSuccessModal = React.lazy(() =>
  import('./components/OrderSuccessModal').then((m) => ({ default: m.OrderSuccessModal }))
);
const AuthModal = React.lazy(() =>
  import('./components/AuthModal').then((m) => ({ default: m.AuthModal }))
);
const UserAccountModal = React.lazy(() =>
  import('./components/UserAccountModal').then((m) => ({ default: m.UserAccountModal }))
);

// Unified, on-demand global modal container with individual Suspense boundaries and ErrorBoundaries
const GlobalModals: React.FC = () => {
  const {
    products,
    isCartOpen,
    isWishlistOpen,
    isAuthModalOpen,
    isUserAccountModalOpen,
    setIsUserAccountModalOpen,
    quickViewProduct,
    setQuickViewProduct,
    videoModalProduct,
    setVideoModalProduct,
    videoModalMode,
    recentSuccessOrder,
    setRecentSuccessOrder,
  } = useStore();

  return (
    <>
      {isCartOpen && (
        <ErrorBoundary compact fallbackTitle="Cart Unavailable" fallbackMessage="Could not load cart drawer.">
          <React.Suspense fallback={null}>
            <CartDrawer />
          </React.Suspense>
        </ErrorBoundary>
      )}
      {isWishlistOpen && (
        <ErrorBoundary compact fallbackTitle="Wishlist Unavailable" fallbackMessage="Could not load wishlist.">
          <React.Suspense fallback={null}>
            <WishlistDrawer />
          </React.Suspense>
        </ErrorBoundary>
      )}
      {isUserAccountModalOpen && (
        <ErrorBoundary compact fallbackTitle="Account Unavailable" fallbackMessage="Could not load user account.">
          <React.Suspense fallback={null}>
            <UserAccountModal
              isOpen={isUserAccountModalOpen}
              onClose={() => setIsUserAccountModalOpen(false)}
            />
          </React.Suspense>
        </ErrorBoundary>
      )}
      {quickViewProduct && (
        <ErrorBoundary compact fallbackTitle="Preview Unavailable" fallbackMessage="Could not load product preview.">
          <React.Suspense fallback={null}>
            <QuickViewModal
              product={quickViewProduct}
              onClose={() => setQuickViewProduct(null)}
            />
          </React.Suspense>
        </ErrorBoundary>
      )}
      {videoModalProduct && (
        <ErrorBoundary compact fallbackTitle="Video Unavailable" fallbackMessage="Could not load video player.">
          <React.Suspense fallback={null}>
            <ProductVideoModal
              isOpen={Boolean(videoModalProduct)}
              onClose={() => setVideoModalProduct(null)}
              product={
                (videoModalProduct && products.find((p) => p.id === videoModalProduct.id)) ||
                videoModalProduct
              }
              initialMode={videoModalMode}
              onEnterFloatingMode={() => setQuickViewProduct(null)}
            />
          </React.Suspense>
        </ErrorBoundary>
      )}
      {recentSuccessOrder && (
        <ErrorBoundary compact fallbackTitle="Order Details Unavailable" fallbackMessage="Could not load order details.">
          <React.Suspense fallback={null}>
            <OrderSuccessModal
              order={recentSuccessOrder}
              onClose={() => setRecentSuccessOrder(null)}
            />
          </React.Suspense>
        </ErrorBoundary>
      )}
      {isAuthModalOpen && (
        <ErrorBoundary compact fallbackTitle="Auth Unavailable" fallbackMessage="Could not load login form.">
          <React.Suspense fallback={null}>
            <AuthModal />
          </React.Suspense>
        </ErrorBoundary>
      )}
    </>
  );
};

const AdminLoadingFallback: React.FC = () => (
  <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 selection:bg-rose-500 selection:text-white">
    <div className="text-center space-y-4">
      <div className="w-12 h-12 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto" />
      <div className="text-sm font-semibold tracking-wide text-slate-300">Loading Admin Dashboard...</div>
      <div className="text-xs text-slate-500">Securing workspace session & permissions</div>
    </div>
  </div>
);

const PageLoadingFallback: React.FC = () => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="w-10 h-10 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
  </div>
);

const ProductDetailLoadingFallback: React.FC = () => (
  <div className="py-6 sm:py-10 space-y-8 animate-pulse">
    <div className="flex items-center gap-2">
      <div className="h-4 w-20 bg-slate-200 rounded-md" />
      <span className="text-slate-300">/</span>
      <div className="h-4 w-28 bg-slate-200 rounded-md" />
      <span className="text-slate-300">/</span>
      <div className="h-4 w-40 bg-slate-200 rounded-md" />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
      <div className="space-y-4">
        <div className="w-full aspect-square rounded-3xl bg-slate-200 shadow-xs" />
        <div className="grid grid-cols-4 gap-3">
          <div className="aspect-square rounded-2xl bg-slate-200" />
          <div className="aspect-square rounded-2xl bg-slate-200" />
          <div className="aspect-square rounded-2xl bg-slate-200" />
          <div className="aspect-square rounded-2xl bg-slate-200" />
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <div className="h-4 w-24 bg-rose-100 rounded-full" />
          <div className="h-8 w-4/5 bg-slate-200 rounded-xl" />
          <div className="h-4 w-1/3 bg-slate-200 rounded-md" />
        </div>
        <div className="h-10 w-44 bg-slate-200 rounded-xl" />
        <div className="h-20 w-full bg-slate-200/80 rounded-2xl" />
        <div className="space-y-3 pt-4 border-t border-slate-200">
          <div className="h-12 w-full bg-slate-300 rounded-xl" />
          <div className="h-12 w-full bg-rose-200 rounded-xl" />
        </div>
      </div>
    </div>
  </div>
);

const CategoryListingLoadingFallback: React.FC = () => (
  <div className="py-6 space-y-6 animate-pulse">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-slate-200 rounded-xl" />
        <div className="h-4 w-32 bg-slate-200 rounded-md" />
      </div>
      <div className="h-9 w-40 bg-slate-200 rounded-xl" />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
      {Array.from({ length: 8 }).map((_, idx) => (
        <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 space-y-3 shadow-xs">
          <div className="w-full aspect-square rounded-xl bg-slate-100" />
          <div className="h-3 w-16 bg-slate-100 rounded-full" />
          <div className="h-4 w-4/5 bg-slate-100 rounded" />
          <div className="h-4 w-24 bg-slate-100 rounded" />
          <div className="h-8 w-full bg-slate-100 rounded-xl" />
        </div>
      ))}
    </div>
  </div>
);

const getCategoryIcon = (iconName?: string) => {
  switch (iconName?.toLowerCase()) {
    case 'watch':
      return Watch;
    case 'headphones':
      return Headphones;
    case 'gift':
      return Gift;
    default:
      return Tag;
  }
};

const StoreContent: React.FC = () => {
  const {
    products,
    categories,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    currentView,
    selectedProductId,
    settings,
    currentUser,
    isAdminLoggedIn,
    cartCount,
    cartSubtotal,
    setIsCartOpen,
    copyCategoryLink,
    isStoreInitializing,
    isStoreError,
    retryStoreInit,
    homepageCategoryProducts,
    categoryListingProducts,
    categoryPage,
    setCategoryPage,
    categoryTotalPages,
    categoryTotalProducts,
    isCategoryLoading,
    categorySortBy,
    setCategorySortBy,
    featuredProducts,
  } = useStore();

  const [invalidNotice, setInvalidNotice] = useState<string | null>(null);
  const [homeCategoryFilter, setHomeCategoryFilter] = useState<string>('all');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStoreInitializing) return; // Wait until D1 store data is loaded
    const params = new URLSearchParams(window.location.search);
    let cat = params.get('category') || params.get('cat');

    if (!cat && window.location.pathname.startsWith('/category/')) {
      cat = decodeURIComponent(window.location.pathname.replace(/^\/category\//, '').replace(/\/$/, '')).trim();
    }

    if (cat && categories.length > 0) {
      if (cat.toLowerCase() === 'featured') {
        setInvalidNotice(null);
        return;
      }
      const found = categories.some((c) => c.slug.toLowerCase() === cat.toLowerCase() || c.id === cat);
      if (!found) {
        setInvalidNotice(`The category "${cat}" was not found.`);
        return;
      }
    }

    setInvalidNotice(null);
  }, [categories, isStoreInitializing]);

  if (currentView === 'reset-password' || (typeof window !== 'undefined' && window.location.pathname === '/reset-password')) {
    return (
      <>
        <ErrorBoundary fallbackTitle="Password Reset Unavailable" fallbackMessage="Could not load the password reset form. Please try again.">
          <React.Suspense fallback={<PageLoadingFallback />}>
            <ResetPasswordPage />
          </React.Suspense>
        </ErrorBoundary>
        <GlobalModals />
        <ToastNotification />
      </>
    );
  }

  if (currentView === 'admin') {
    return (
      <>
        <ErrorBoundary fallbackTitle="Admin Panel Unavailable" fallbackMessage="Could not load the administrative dashboard. Please reload or try again.">
          <React.Suspense fallback={<AdminLoadingFallback />}>
            <AdminPanel />
          </React.Suspense>
        </ErrorBoundary>
        <GlobalModals />
        <ToastNotification />
      </>
    );
  }

  // Single Product Route (/product/:id)
  const isProductRoute =
    currentView === 'product' ||
    (typeof window !== 'undefined' && window.location.pathname.startsWith('/product/'));
  const currentProductId =
    selectedProductId ||
    (typeof window !== 'undefined' && window.location.pathname.startsWith('/product/')
      ? decodeURIComponent(window.location.pathname.replace(/^\/product\//, '').replace(/\/$/, '')).trim()
      : null);

  if (isProductRoute && currentProductId) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
        <div>
          <Header />
          <main className="max-w-7xl mx-auto px-4 sm:px-6">
            <ErrorBoundary fallbackTitle="Product Details Unavailable" fallbackMessage="Could not load this product. Please return to the homepage or try again.">
              <React.Suspense fallback={<ProductDetailLoadingFallback />}>
                <ProductDetailView productId={currentProductId} />
              </React.Suspense>
            </ErrorBoundary>
          </main>
        </div>
        <Footer />
        <GlobalModals />
        <ToastNotification />
      </div>
    );
  }

  // 1. Clean Production Skeleton State: NEVER render demo products or preview content while loading D1
  if (isStoreInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
        <div>
          <Header />

          <main className="max-w-7xl mx-auto px-4 sm:px-6">
            {/* Hero Banner Skeleton */}
            <div
              className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl bg-slate-200 animate-pulse shadow-xs mt-4"
              style={{ aspectRatio: settings?.sliderAspectRatio || '1200 / 480', minHeight: '160px' }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 animate-pulse" />
              <div className="absolute bottom-6 left-6 sm:bottom-10 sm:left-10 space-y-3 z-10">
                <div className="h-4 sm:h-5 w-28 sm:w-36 rounded-full bg-slate-300 animate-pulse" />
                <div className="h-6 sm:h-9 w-48 sm:w-80 rounded-xl bg-slate-300 animate-pulse" />
                <div className="h-3.5 sm:h-4 w-36 sm:w-60 rounded-md bg-slate-300/70 animate-pulse" />
              </div>
            </div>

            {/* Category Dropdown Filter Skeleton */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 sm:py-4">
              <div className="flex items-center gap-2.5">
                <div className="h-5 w-20 rounded-md bg-slate-200 animate-pulse" />
                <div className="h-9 sm:h-10 w-48 sm:w-56 rounded-xl bg-slate-200 animate-pulse" />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="h-8 w-14 rounded-xl bg-slate-200 animate-pulse shrink-0" />
                <div className="h-8 w-28 rounded-xl bg-slate-200 animate-pulse shrink-0" />
                <div className="h-8 w-32 rounded-xl bg-slate-200 animate-pulse shrink-0" />
                <div className="h-8 w-28 rounded-xl bg-slate-200 animate-pulse shrink-0" />
              </div>
            </div>

            {/* Product Feed Section Skeleton */}
            <section id="products-feed-section" className="pt-6 pb-12">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 mb-6">
                <div className="space-y-2">
                  <div className="h-7 w-48 rounded-xl bg-slate-200 animate-pulse" />
                  <div className="h-3.5 w-64 rounded-md bg-slate-200/70 animate-pulse" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-32 rounded-xl bg-slate-200 animate-pulse" />
                  <div className="h-8 w-28 rounded-xl bg-slate-200 animate-pulse" />
                </div>
              </div>

              {/* Grid Skeletons */}
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 space-y-3 shadow-xs overflow-hidden"
                  >
                    <div className="w-full aspect-square rounded-xl bg-slate-100 animate-pulse" />
                    <div className="h-3 w-16 rounded-full bg-slate-100 animate-pulse" />
                    <div className="h-4 w-4/5 rounded bg-slate-100 animate-pulse" />
                    <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
                    <div className="h-8 w-full rounded-xl bg-slate-100 animate-pulse" />
                  </div>
                ))}
              </div>
            </section>
          </main>
        </div>

        <Footer />
        <GlobalModals />
        <ToastNotification />
      </div>
    );
  }

  // 2. Production Database Error / Offline State: NEVER fallback to seed products
  if (isStoreError && products.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
        <div>
          <Header />

          <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-16">
            <div className="max-w-md mx-auto py-16 px-6 text-center space-y-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto text-rose-500">
                <Package className="w-8 h-8" />
              </div>
              <h2 className="font-display font-extrabold text-xl text-slate-800">Connection Error</h2>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                We're currently having trouble loading the live product catalog. Please verify your internet connection and try again.
              </p>
              <button
                type="button"
                onClick={retryStoreInit}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Loading Store</span>
              </button>
            </div>
          </main>
        </div>

        <Footer />
        <GlobalModals />
        <ToastNotification />
      </div>
    );
  }

  const activeCategoryObj = categories.find((c) => c.id === selectedCategory || c.slug === selectedCategory);
  const supportWhatsAppNumber = settings.footer?.supportWhatsApp || settings.phone || '';
  const floatingWhatsAppHref = formatWhatsAppLink(
    supportWhatsAppNumber,
    `Hello ${settings.siteName || 'Rongdhonu Trade'}! I have an inquiry regarding your products.`
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
      <div>
        <Header />

        <main className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Top Hero Banner Carousel (shown only on homepage when no search or category is active) */}
          {!searchQuery && !selectedCategory && <HeroCarousel />}

          {/* 404 Not Found Notification Banner */}
          {invalidNotice && (
            <div className="mt-4 mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-sm">404 - Item Not Found</p>
                  <p className="text-xs text-amber-700">{invalidNotice} Browse our active products below.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInvalidNotice(null);
                  window.history.replaceState({}, '', '/');
                }}
                className="self-start sm:self-auto text-xs font-bold text-amber-850 hover:text-amber-950 px-3 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Category Dropdown Filter Bar directly below homepage slider/banner */}
          {!searchQuery && !selectedCategory && categories.length > 0 && (
            <div
              id="homepage-category-selector"
              className="mt-4 sm:mt-5 mb-2 sm:mb-4 bg-white/80 backdrop-blur-xs p-2.5 sm:p-3 rounded-2xl border border-slate-200/90 shadow-2xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Category Dropdown Filter */}
                <div className="flex items-center gap-2.5">
                  <label
                    htmlFor="homepage-category-dropdown"
                    className="text-xs sm:text-sm font-extrabold text-slate-800 whitespace-nowrap flex items-center gap-1.5"
                  >
                    <Tag className="w-4 h-4 text-rose-500" />
                    <span>Category:</span>
                  </label>
                  <div className="relative min-w-[200px] sm:min-w-[230px]">
                    <select
                      id="homepage-category-dropdown"
                      value={homeCategoryFilter}
                      onChange={(e) => setHomeCategoryFilter(e.target.value)}
                      className="w-full appearance-none pl-3.5 pr-9 py-2 sm:py-2.5 bg-white border border-slate-300 hover:border-slate-400 focus:border-rose-500 rounded-xl text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 shadow-2xs cursor-pointer transition-all"
                    >
                      <option value="all">All Categories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Quick-select Category Pills */}
                <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => setHomeCategoryFilter('all')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 active:scale-95 shrink-0 cursor-pointer shadow-2xs ${
                      homeCategoryFilter === 'all'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
                    }`}
                    aria-pressed={homeCategoryFilter === 'all'}
                  >
                    <LayoutGrid
                      className={`w-3.5 h-3.5 ${
                        homeCategoryFilter === 'all' ? 'text-rose-400' : 'text-slate-400'
                      }`}
                    />
                    <span>All</span>
                  </button>

                  {categories.map((cat) => {
                    const isSelected = homeCategoryFilter === cat.id;
                    const IconComp = getCategoryIcon(cat.iconName);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setHomeCategoryFilter(isSelected ? 'all' : cat.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 active:scale-95 shrink-0 cursor-pointer shadow-2xs ${
                          isSelected
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
                        }`}
                        aria-pressed={isSelected}
                      >
                        <IconComp
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isSelected ? 'text-rose-400' : 'text-slate-400'
                          }`}
                        />
                        <span>{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* If viewing a specific category or searching, show separate CategoryListingView with server-side pagination */}
          {selectedCategory || searchQuery.trim() ? (
            <section id="products-feed-section">
              <ErrorBoundary
                fallbackTitle="Category Unavailable"
                fallbackMessage="Could not load product collection. Click dismiss or return home."
              >
                <React.Suspense fallback={<CategoryListingLoadingFallback />}>
                  <CategoryListingView
                    category={activeCategoryObj || null}
                    categories={categories}
                    searchQuery={searchQuery}
                    products={categoryListingProducts}
                    isLoading={isCategoryLoading}
                    totalProducts={categoryTotalProducts}
                    currentPage={categoryPage}
                    totalPages={categoryTotalPages}
                    limit={24}
                    sortBy={categorySortBy}
                    isFeaturedListing={selectedCategory === 'featured'}
                    onPageChange={(page) => setCategoryPage(page)}
                    onSortChange={(sort) => setCategorySortBy(sort)}
                    onCategoryChange={(catId) => setSelectedCategory(catId)}
                    onBackToHome={() => {
                      setSelectedCategory(null);
                      setSearchQuery('');
                      if (window.location.pathname !== '/' || window.location.search) {
                        window.history.pushState({}, '', '/');
                      }
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onShareCategory={copyCategoryLink}
                    siteName={settings?.siteName}
                  />
                </React.Suspense>
              </ErrorBoundary>
            </section>
          ) : (
            /* Homepage: Lightweight category sections with recycling carousels */
            <section id="products-feed-section" className="pt-2 pb-12">
              {/* Featured Products Carousel - Bounded to 6-8 items, lazy loaded, deterministic sort */}
              {homeCategoryFilter === 'all' && featuredProducts && featuredProducts.length > 0 && (
                <FeaturedProductsCarousel
                  products={featuredProducts}
                  onViewAll={() => {
                    setSelectedCategory('featured');
                    window.history.pushState({}, '', '/featured');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              )}

              <div className="space-y-2 sm:space-y-4">
                {(homeCategoryFilter === 'all'
                  ? categories
                  : categories.filter((c) => c.id === homeCategoryFilter)
                ).map((cat, idx) => {
                  const catProducts =
                    homepageCategoryProducts[cat.id] && homepageCategoryProducts[cat.id].length > 0
                      ? homepageCategoryProducts[cat.id]
                      : products.filter((p) => p.categoryId === cat.id).slice(0, 6);

                  if (!catProducts || catProducts.length === 0) return null;

                  return (
                    <CategoryProductCarousel
                      key={cat.id}
                      category={cat}
                      products={catProducts}
                      onViewAll={(category) => {
                        setSelectedCategory(category.id);
                        const categoryUrl = `/category/${category.slug || category.id}`;
                        window.history.pushState({}, '', categoryUrl);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      priorityFirst={idx === 0 || homeCategoryFilter !== 'all'}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Floating Mobile Cart Option (accessible while browsing on mobile) */}
      {cartCount > 0 && (
        <button
          id="floating-mobile-cart-btn"
          onClick={() => setIsCartOpen(true)}
          className="sm:hidden fixed bottom-20 right-5 z-30 px-3.5 py-2.5 rounded-full bg-slate-900 hover:bg-black text-white shadow-2xl active:scale-95 transition-all flex items-center gap-2 border border-slate-700/80 font-bold text-xs animate-in slide-in-from-bottom-3 duration-200"
          aria-label={`Cart ৳ ${cartSubtotal.toLocaleString()}`}
        >
          <div className="relative" aria-hidden="true">
            <ShoppingCart className="w-4 h-4 text-rose-400" />
            <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white font-mono text-[9px] font-extrabold flex items-center justify-center shadow-xs">
              {cartCount}
            </span>
          </div>
          <span className="font-mono">Cart ৳ {cartSubtotal.toLocaleString()}</span>
        </button>
      )}

      {/* Floating WhatsApp Action Button */}
      {supportWhatsAppNumber && (
        <a
          id="floating-whatsapp-btn"
          href={floatingWhatsAppHref}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-5 sm:right-6 z-30 p-3.5 rounded-full bg-emerald-500 text-white shadow-xl hover:bg-emerald-600 active:scale-95 transition-all duration-200 flex items-center justify-center group hover:pr-5 gap-2"
          aria-label="Chat on WhatsApp"
        >
          <MessageCircle className="w-6 h-6" aria-hidden="true" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 text-xs font-bold">
            Chat on WhatsApp
          </span>
        </a>
      )}

      {/* Footer */}
      <Footer />

      {/* Interactive Global Modals & Drawers */}
      <GlobalModals />
      <ToastNotification />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <StoreContent />
      </StoreProvider>
    </ErrorBoundary>
  );
}
