import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Product,
  Category,
  CartItem,
  Order,
  StoreSettings,
  CarouselSlide,
  ProductReview,
  Coupon,
  ToastNotificationData,
  PixelEventLog,
  TrackingUserData,
} from '../types';
import {
  scheduleTrackingSync,
  syncPixelScripts,
  trackSocialEvent,
  getStoredPixelLogs,
  clearStoredPixelLogs,
  prepareHashedUserData,
  getTrackingSources,
} from '../utils/pixelTracking';
import { updateDynamicFavicon } from '../utils/favicon';
import { DEFAULT_STORE_SETTINGS } from '../data/defaultSettings';
import { sanitizeSettingsForBrowserStorage } from '../utils/courierStorage';
import { orderApi } from '../services/orderApi';
import {
  productsApi,
  categoriesApi,
  slidersApi,
  settingsApi,
  couponsApi,
  reviewsApi,
  storeHomepageApi,
} from '../services/storeApi';
import {
  applyClientSEO,
  getProductSEOMetadata,
  SITE_DOMAIN,
  DEFAULT_SITE_NAME,
  DEFAULT_BENGALI_BRAND_NAME,
  DEFAULT_HOMEPAGE_TITLE,
  DEFAULT_HOMEPAGE_DESCRIPTION,
  DEFAULT_FALLBACK_IMAGE,
} from '../utils/seo';
import { STORAGE_KEYS } from './storageKeys';
import { useAuth } from './AuthContext';
import { useCart } from './CartContext';

export interface StorefrontContextType {
  isStoreInitializing: boolean;
  isStoreError: boolean;
  retryStoreInit: () => void;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  categories: Category[];
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  slides: CarouselSlide[];
  setSlides: React.Dispatch<React.SetStateAction<CarouselSlide[]>>;
  settings: StoreSettings;
  setSettings: React.Dispatch<React.SetStateAction<StoreSettings>>;

  currentView: 'store' | 'admin' | 'tracking' | 'reset-password' | 'product';
  setCurrentView: (view: 'store' | 'admin' | 'tracking' | 'reset-password' | 'product') => void;
  selectedProductId: string | null;
  setSelectedProductId: (id: string | null) => void;
  singleProduct: Product | null;
  setSingleProduct: React.Dispatch<React.SetStateAction<Product | null>>;
  isProductLoading: boolean;
  productNotFound: boolean;
  loadProductById: (id: string) => Promise<Product | null>;
  refreshProductsByIds: (productIds: string[]) => Promise<void>;

  selectedCategory: string | null;
  setSelectedCategory: (catId: string | null) => void;
  navigateToCategory: (categoryIdOrSlug: string | null) => void;
  categoryNavSeq: number;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  quickViewProduct: Product | null;
  setQuickViewProduct: (prod: Product | null) => void;
  videoModalProduct: Product | null;
  setVideoModalProduct: (prod: Product | null) => void;
  videoModalMode: 'popup' | 'floating';
  setVideoModalMode: (mode: 'popup' | 'floating') => void;
  openProductVideo: (prod: Product, mode?: 'popup' | 'floating') => void;

  featuredProducts: Product[];
  setFeaturedProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  homepageCategoryProducts: Record<string, Product[]>;
  setHomepageCategoryProducts: React.Dispatch<React.SetStateAction<Record<string, Product[]>>>;
  categoryListingProducts: Product[];
  setCategoryListingProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  categoryPage: number;
  setCategoryPage: (page: number) => void;
  categoryTotalPages: number;
  categoryTotalProducts: number;
  isCategoryLoading: boolean;
  categorySortBy: 'featured' | 'price-asc' | 'price-desc' | 'rating';
  setCategorySortBy: (sort: 'featured' | 'price-asc' | 'price-desc' | 'rating') => void;

  wishlist: string[];
  isWishlistOpen: boolean;
  setIsWishlistOpen: (open: boolean) => void;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;

  isUserAccountModalOpen: boolean;
  setIsUserAccountModalOpen: (open: boolean) => void;
  userAccountModalTab: 'orders' | 'profile';
  setUserAccountModalTab: (tab: 'orders' | 'profile') => void;

  notification: ToastNotificationData | null;
  showNotification: (
    type: 'success' | 'info' | 'error' | 'warning',
    title: string,
    message: string,
    duration?: number
  ) => void;
  dismissNotification: () => void;

  coupons: Coupon[];
  setCoupons: React.Dispatch<React.SetStateAction<Coupon[]>>;
  applyCoupon: (
    code: string,
    subtotal: number,
    deliveryFee: number
  ) => { success: boolean; discountAmount: number; message: string; coupon?: Coupon };

  reviews: ProductReview[];
  setReviews: React.Dispatch<React.SetStateAction<ProductReview[]>>;
  addProductReview: (review: Omit<ProductReview, 'id' | 'createdAt'>) => void;
  deleteProductReview: (reviewId: string) => void;
  getProductReviews: (productId: string) => ProductReview[];

  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  createOrder: (orderData: {
    userId?: string;
    userEmail?: string;
    customer: Order['customer'];
    items: CartItem[];
    subtotal: number;
    deliveryFee: number;
    totalAmount: number;
    couponCode?: string;
    discountAmount?: number;
    paymentMethod: Order['paymentMethod'];
    paymentStatus: Order['paymentStatus'];
    transactionId?: string;
    dbblDetails?: Order['dbblDetails'];
    cardDetails?: Order['cardDetails'];
  }) => Promise<Order>;
  recentSuccessOrder: Order | null;
  setRecentSuccessOrder: (order: Order | null) => void;
  activePaymentModalOrder: Order | null;
  setActivePaymentModalOrder: (order: Order | null) => void;
  finalizePayment: (orderId: string, transactionId: string) => Promise<void> | void;
  updateCustomerDeliveryInfo: (
    orderId: string,
    info: {
      fullName: string;
      phone: string;
      fullAddress: string;
      district: string;
      deliveryZone: 'inside_dhaka' | 'outside_dhaka';
    }
  ) => Promise<{ success: boolean; message?: string; updatedOrder?: Order }>;
  cancelCustomerOrder: (orderId: string) => Promise<{ success: boolean; message?: string }>;

  getProductUrl: (productId: string, options?: { absolute?: boolean }) => string;
  getCategoryUrl: (categoryIdOrSlug: string, options?: { absolute?: boolean }) => string;
  copyProductLink: (productId: string) => Promise<boolean>;
  copyCategoryLink: (categoryIdOrSlug: string) => Promise<boolean>;

  pixelLogs: PixelEventLog[];
  trackEvent: (
    eventName: 'PageView' | 'ViewContent' | 'ProductView' | 'AddToCart' | 'InitiateCheckout' | 'Purchase' | 'Search' | 'AddToWishlist' | 'Contact' | string,
    params?: Record<string, any>,
    userData?: TrackingUserData
  ) => PixelEventLog;
  fireTestPixelEvent: (type: 'PageView' | 'ViewContent' | 'ProductView' | 'AddToCart' | 'InitiateCheckout' | 'Purchase') => PixelEventLog;
  clearPixelLogs: () => void;
  isMetaActive: boolean;
  isTikTokActive: boolean;
  isGtmActive: boolean;
  isGaActive?: boolean;
}

export const StorefrontContext = createContext<StorefrontContextType | undefined>(undefined);

export const StorefrontProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { clearCart } = useCart();

  // Settings State
  const [settings, setSettings] = useState<StoreSettings>(() => {
    try {
      let saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!saved) {
        const legacy = localStorage.getItem('rongdhonu_settings');
        if (legacy) {
          saved = legacy;
          localStorage.setItem(STORAGE_KEYS.SETTINGS, legacy);
          localStorage.removeItem('rongdhonu_settings');
        }
      }
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const effectiveAnnouncement =
            parsed.topBarAnnouncementText !== undefined && parsed.topBarAnnouncementText !== null
              ? parsed.topBarAnnouncementText
              : parsed.announcementText !== undefined && parsed.announcementText !== null
              ? parsed.announcementText
              : '';

          return {
            ...DEFAULT_STORE_SETTINGS,
            ...parsed,
            topBarAnnouncementText: effectiveAnnouncement,
            announcementText: effectiveAnnouncement,
            fbPixelId: parsed.fbPixelId !== undefined ? parsed.fbPixelId : (DEFAULT_STORE_SETTINGS.fbPixelId || ''),
            fbTestEventCode: parsed.fbTestEventCode !== undefined ? parsed.fbTestEventCode : (DEFAULT_STORE_SETTINGS.fbTestEventCode || ''),
            gtmId: parsed.gtmId !== undefined ? parsed.gtmId : (DEFAULT_STORE_SETTINGS.gtmId || ''),
            tiktokPixelId: parsed.tiktokPixelId !== undefined ? parsed.tiktokPixelId : (DEFAULT_STORE_SETTINGS.tiktokPixelId || ''),
            tiktokTestEventCode: parsed.tiktokTestEventCode !== undefined ? parsed.tiktokTestEventCode : (DEFAULT_STORE_SETTINGS.tiktokTestEventCode || ''),
            dbblBank: parsed.dbblBank ? { ...DEFAULT_STORE_SETTINGS.dbblBank, ...parsed.dbblBank } : DEFAULT_STORE_SETTINGS.dbblBank,
            footer: parsed.footer
              ? {
                  ...DEFAULT_STORE_SETTINGS.footer,
                  ...parsed.footer,
                  warrantyBadgeText:
                    parsed.footer.warrantyBadgeText === '7-Day Return & Replacement Warranty'
                      ? ''
                      : parsed.footer.warrantyBadgeText || '',
                }
              : DEFAULT_STORE_SETTINGS.footer,
            blockedPhoneNumbers: Array.isArray(parsed.blockedPhoneNumbers) ? parsed.blockedPhoneNumbers : (DEFAULT_STORE_SETTINGS.blockedPhoneNumbers || []),
          };
        }
      }
      return DEFAULT_STORE_SETTINGS;
    } catch {
      return DEFAULT_STORE_SETTINGS;
    }
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [homepageCategoryProducts, setHomepageCategoryProducts] = useState<Record<string, Product[]>>({});
  const [categoryListingProducts, setCategoryListingProducts] = useState<Product[]>([]);
  const [categoryPage, setCategoryPage] = useState<number>(1);
  const [categoryTotalPages, setCategoryTotalPages] = useState<number>(1);
  const [categoryTotalProducts, setCategoryTotalProducts] = useState<number>(0);
  const [categorySortBy, setCategorySortByState] = useState<'featured' | 'price-asc' | 'price-desc' | 'rating'>('featured');
  const [isCategoryLoading, setIsCategoryLoading] = useState<boolean>(false);

  const setCategorySortBy = useCallback((newSort: 'featured' | 'price-asc' | 'price-desc' | 'rating') => {
    setCategorySortByState((prev) => (prev === newSort ? prev : newSort));
    setCategoryPage((prev) => (prev === 1 ? prev : 1));
  }, []);

  const [isStoreInitializing, setIsStoreInitializing] = useState<boolean>(true);
  const [isStoreError, setIsStoreError] = useState<boolean>(false);

  // Orders State (customer's local/recent orders list for tracking & account)
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ORDERS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const lastSavedOrdersRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const serialized = JSON.stringify(orders);
      if (lastSavedOrdersRef.current === null) {
        lastSavedOrdersRef.current = serialized;
        const currentSaved = localStorage.getItem(STORAGE_KEYS.ORDERS);
        if (currentSaved === serialized) {
          return;
        }
      }
      if (lastSavedOrdersRef.current !== serialized) {
        lastSavedOrdersRef.current = serialized;
        localStorage.setItem(STORAGE_KEYS.ORDERS, serialized);
      }
    } catch (e) {
      console.error('Failed to save orders to localStorage', e);
    }
  }, [orders]);

  // Navigation & Modals UI state
  const [currentView, setCurrentView] = useState<'store' | 'admin' | 'tracking' | 'reset-password' | 'product'>('store');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [singleProduct, setSingleProduct] = useState<Product | null>(null);
  const [isProductLoading, setIsProductLoading] = useState<boolean>(false);
  const [productNotFound, setProductNotFound] = useState<boolean>(false);

  const [selectedCategory, setSelectedCategoryState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const pathname = window.location.pathname;
      if (pathname === '/reset-password' || pathname === '/admin' || pathname.startsWith('/admin/')) {
        return null;
      }
      if (pathname.startsWith('/category/')) {
        const raw = decodeURIComponent(pathname.replace(/^\/category\//, '').replace(/\/$/, '')).trim();
        return raw || null;
      }
      if (pathname === '/featured') {
        return 'featured';
      }
      const params = new URLSearchParams(window.location.search);
      const cat = params.get('category') || params.get('cat');
      if (cat) return cat.trim();
      if (params.get('featured') === 'true') return 'featured';
    } catch {}
    return null;
  });

  const [categoryNavSeq, setCategoryNavSeq] = useState<number>(0);

  const setSelectedCategory = useCallback((catId: string | null) => {
    setSelectedCategoryState((prev) => (prev === catId ? prev : catId));
    setCategoryPage((prev) => (prev === 1 ? prev : 1));
  }, []);

  const navigateToCategory = useCallback((categoryIdOrSlug: string | null) => {
    setSelectedProductId(null);
    setSearchQueryState('');
    setCurrentView('store');

    if (!categoryIdOrSlug) {
      setSelectedCategoryState(null);
      setCategoryPage(1);
      if (typeof window !== 'undefined' && (window.location.pathname !== '/' || window.location.search)) {
        window.history.pushState({}, '', '/');
      }
      setCategoryNavSeq((prev) => prev + 1);
      return;
    }

    if (categoryIdOrSlug === 'featured') {
      setSelectedCategoryState('featured');
      setCategoryPage(1);
      if (typeof window !== 'undefined' && window.location.pathname !== '/featured') {
        window.history.pushState({}, '', '/featured');
      }
      setCategoryNavSeq((prev) => prev + 1);
      return;
    }

    const cat = categories.find(
      (c) => c.id === categoryIdOrSlug || c.slug?.toLowerCase() === categoryIdOrSlug.toLowerCase()
    );
    const targetId = cat ? cat.id : categoryIdOrSlug;
    const targetSlug = cat ? cat.slug || cat.id : categoryIdOrSlug;

    setSelectedCategoryState(targetId);
    setCategoryPage(1);
    if (typeof window !== 'undefined') {
      const targetUrl = `/category/${encodeURIComponent(targetSlug)}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState({}, '', targetUrl);
      }
    }
    setCategoryNavSeq((prev) => prev + 1);
  }, [categories]);

  // Synchronize browser history (popstate) with category navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const pathname = window.location.pathname;
      if (pathname === '/reset-password') {
        setCurrentView('reset-password');
        return;
      }
      if (pathname === '/admin' || pathname.startsWith('/admin/')) {
        setCurrentView('admin');
        return;
      }
      if (pathname.startsWith('/product/')) {
        const prodId = decodeURIComponent(pathname.replace(/^\/product\//, '').replace(/\/$/, '')).trim();
        setSelectedProductId(prodId || null);
        setCurrentView('product');
        return;
      }
      setCurrentView('store');
      setSelectedProductId(null);
      if (pathname.startsWith('/category/')) {
        const raw = decodeURIComponent(pathname.replace(/^\/category\//, '').replace(/\/$/, '')).trim();
        const found = categories.find(
          (c) => c.slug?.toLowerCase() === raw.toLowerCase() || c.id === raw
        );
        setSelectedCategoryState(found ? found.id : raw);
        setCategoryNavSeq((prev) => prev + 1);
      } else if (pathname === '/featured') {
        setSelectedCategoryState('featured');
        setCategoryNavSeq((prev) => prev + 1);
      } else if (pathname === '/') {
        setSelectedCategoryState(null);
        setSearchQueryState('');
        setCategoryNavSeq((prev) => prev + 1);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [categories]);

  const [searchQuery, setSearchQueryState] = useState<string>('');

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState((prev) => (prev === query ? prev : query));
    setCategoryPage((prev) => (prev === 1 ? prev : 1));
  }, []);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [videoModalProduct, setVideoModalProduct] = useState<Product | null>(null);
  const [videoModalMode, setVideoModalMode] = useState<'popup' | 'floating'>('popup');
  const [activePaymentModalOrder, setActivePaymentModalOrder] = useState<Order | null>(null);
  const [recentSuccessOrder, setRecentSuccessOrder] = useState<Order | null>(null);

  const openProductVideo = useCallback((prod: Product, mode: 'popup' | 'floating' = 'popup') => {
    setVideoModalMode(mode);
    setVideoModalProduct(prod);
  }, []);

  // Notifications
  const [notification, setNotification] = useState<ToastNotificationData | null>(null);

  const showNotification = useCallback((
    type: 'success' | 'info' | 'error' | 'warning',
    title: string,
    message: string,
    duration: number = 5000
  ) => {
    setTimeout(() => {
      setNotification({
        id: `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type,
        title,
        message,
        duration,
      });
    }, 0);
  }, []);

  const dismissNotification = useCallback(() => {
    setTimeout(() => {
      setNotification(null);
    }, 0);
  }, []);

  // Wishlist
  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.WISHLIST);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const lastSavedWishlistRef = useRef<string | null>(null);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  useEffect(() => {
    try {
      const serialized = JSON.stringify(wishlist);
      if (lastSavedWishlistRef.current === null) {
        lastSavedWishlistRef.current = serialized;
        const currentSaved = localStorage.getItem(STORAGE_KEYS.WISHLIST);
        if (currentSaved === serialized) {
          return;
        }
      }
      if (lastSavedWishlistRef.current !== serialized) {
        lastSavedWishlistRef.current = serialized;
        localStorage.setItem(STORAGE_KEYS.WISHLIST, serialized);
      }
    } catch (e) {
      console.error('Error saving wishlist', e);
    }
  }, [wishlist]);

  const toggleWishlist = useCallback((productId: string) => {
    if (!productId) return;
    setWishlist((prev) => {
      const exists = prev.includes(productId);
      const updated = exists ? prev.filter((id) => id !== productId) : [...prev, productId];
      if (!exists) {
        const prod = products.find((p) => p.id === productId);
        if (prod) {
          trackSocialEvent('AddToWishlist', {
            content_name: prod.title,
            content_ids: [prod.id],
            content_type: 'product',
            value: prod.price,
            currency: 'BDT',
          });
        }
      }
      return updated;
    });
  }, [products]);

  const isInWishlist = useCallback((productId: string) => {
    return wishlist.includes(productId);
  }, [wishlist]);

  const clearWishlist = useCallback(() => {
    setWishlist((prev) => (prev.length === 0 ? prev : []));
  }, []);

  // User Account Modal
  const [isUserAccountModalOpen, setIsUserAccountModalOpen] = useState(false);
  const [userAccountModalTab, setUserAccountModalTab] = useState<'orders' | 'profile'>('orders');

  // Coupons
  const [coupons, setCoupons] = useState<Coupon[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.COUPONS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const lastSavedCouponsRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const data = JSON.stringify(coupons);
      if (lastSavedCouponsRef.current === null) {
        lastSavedCouponsRef.current = data;
        const currentSaved = localStorage.getItem(STORAGE_KEYS.COUPONS);
        if (currentSaved === data) {
          return;
        }
      }
      if (lastSavedCouponsRef.current !== data) {
        lastSavedCouponsRef.current = data;
        localStorage.setItem(STORAGE_KEYS.COUPONS, data);
      }
    } catch (e) {
      console.error('Error saving coupons', e);
    }
  }, [coupons]);

  const applyCoupon = useCallback((
    code: string,
    subtotal: number,
    deliveryFee: number
  ): { success: boolean; discountAmount: number; message: string; coupon?: Coupon } => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, discountAmount: 0, message: 'Please enter a coupon code.' };
    }
    const coupon = coupons.find((c) => c.code.toUpperCase() === cleanCode && c.isActive);
    if (!coupon) {
      return { success: false, discountAmount: 0, message: `Promo code "${cleanCode}" is invalid or expired.` };
    }
    if (coupon.minSpend && subtotal < coupon.minSpend) {
      return {
        success: false,
        discountAmount: 0,
        message: `Coupon "${coupon.code}" requires minimum purchase of ৳${coupon.minSpend.toLocaleString()} (Current: ৳${subtotal.toLocaleString()}).`,
      };
    }

    let discount = 0;
    if (coupon.discountType === 'fixed') {
      discount = Math.min(coupon.discountValue, subtotal);
    } else if (coupon.discountType === 'percentage') {
      discount = Math.round((subtotal * coupon.discountValue) / 100);
    } else if (coupon.discountType === 'free_shipping') {
      discount = deliveryFee;
    }

    return {
      success: true,
      discountAmount: discount,
      message: `Coupon "${coupon.code}" applied! You saved ৳${discount.toLocaleString()}.`,
      coupon,
    };
  }, [coupons]);

  // Reviews
  const [reviews, setReviews] = useState<ProductReview[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.REVIEWS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const lastSavedReviewsRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const data = JSON.stringify(reviews);
      if (lastSavedReviewsRef.current === null) {
        lastSavedReviewsRef.current = data;
        const currentSaved = localStorage.getItem(STORAGE_KEYS.REVIEWS);
        if (currentSaved === data) {
          return;
        }
      }
      if (lastSavedReviewsRef.current !== data) {
        lastSavedReviewsRef.current = data;
        localStorage.setItem(STORAGE_KEYS.REVIEWS, data);
      }
    } catch (e) {
      console.error('Error saving reviews', e);
    }
  }, [reviews]);

  const getProductReviews = useCallback((productId: string) => {
    return reviews.filter((r) => r.productId === productId);
  }, [reviews]);

  const addProductReview = useCallback((reviewData: Omit<ProductReview, 'id' | 'createdAt'>) => {
    const authorName = reviewData.authorName || reviewData.author || 'Customer';
    const newReview: ProductReview = {
      ...reviewData,
      author: authorName,
      authorName: authorName,
      id: `rev-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toISOString(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };
    const updatedReviews = [newReview, ...reviews];
    setReviews(updatedReviews);
    reviewsApi.create(newReview).catch(console.error);

    const productRevs = updatedReviews.filter((r) => r.productId === reviewData.productId);
    const avgRating = productRevs.reduce((acc, r) => acc + r.rating, 0) / productRevs.length;

    setProducts((prev) =>
      prev.map((p) =>
        p.id === reviewData.productId
          ? {
              ...p,
              rating: Number(avgRating.toFixed(1)),
              reviewsCount: Math.max((p.reviewsCount || 0) + 1, productRevs.length),
            }
          : p
      )
    );
  }, [reviews]);

  const deleteProductReview = useCallback((reviewId: string) => {
    const target = reviews.find((r) => r.id === reviewId);
    if (!target) return;
    const prodId = target.productId;
    const updatedReviews = reviews.filter((r) => r.id !== reviewId);
    setReviews(updatedReviews);

    const remainingForProduct = updatedReviews.filter((r) => r.productId === prodId);
    const avgRating =
      remainingForProduct.length > 0
        ? remainingForProduct.reduce((acc, r) => acc + r.rating, 0) / remainingForProduct.length
        : 5.0;

    setProducts((prev) =>
      prev.map((p) =>
        p.id === prodId
          ? {
              ...p,
              rating: Number(avgRating.toFixed(1)),
              reviewsCount: Math.max(0, Math.max((p.reviewsCount || 1) - 1, remainingForProduct.length)),
            }
          : p
      )
    );

    showNotification(
      'info',
      'Review Removed 🗑️',
      'The customer review has been deleted and rating score has been updated.'
    );
  }, [reviews, showNotification]);

  // Product Loading & Sync
  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;

  const loadProductById = useCallback(async (id: string): Promise<Product | null> => {
    if (!id) return null;
    const cleanId = id.trim();
    const existing = productsRef.current.find(
      (p) => p.id === cleanId || p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') === cleanId
    );
    if (existing) {
      setSingleProduct(existing);
      setProductNotFound(false);
    } else {
      setIsProductLoading(true);
      setProductNotFound(false);
    }

    try {
      const fetched = await productsApi.getById(cleanId);
      if (fetched && (fetched as any).status !== 'inactive' && !(fetched as any).isDeleted) {
        setSingleProduct(fetched);
        setProductNotFound(false);
        setIsProductLoading(false);
        return fetched;
      } else {
        if (!existing) {
          setSingleProduct(null);
          setProductNotFound(true);
        }
        setIsProductLoading(false);
        return existing || null;
      }
    } catch (err) {
      console.error('Failed to fetch product by id:', err);
      if (!existing) {
        setProductNotFound(true);
        setSingleProduct(null);
      }
      setIsProductLoading(false);
      return existing || null;
    }
  }, []);

  const refreshProductsByIds = useCallback(async (productIds: string[]) => {
    if (!Array.isArray(productIds) || productIds.length === 0) return;
    const cleanIds = Array.from(new Set(productIds.filter(Boolean)));
    try {
      const results = await Promise.allSettled(cleanIds.map((id) => productsApi.getById(id)));
      const freshProducts: Product[] = [];
      results.forEach((res) => {
        if (res.status === 'fulfilled' && res.value) {
          freshProducts.push(res.value);
        }
      });
      if (freshProducts.length > 0) {
        const freshMap = new Map<string, Product>();
        freshProducts.forEach((p) => freshMap.set(p.id, p));

        setProducts((prev) => prev.map((p) => freshMap.get(p.id) || p));
        setFeaturedProducts((prev) => prev.map((p) => freshMap.get(p.id) || p));
        setSingleProduct((prev) => (prev && freshMap.has(prev.id) ? freshMap.get(prev.id)! : prev));
        setQuickViewProduct((prev) => (prev && freshMap.has(prev.id) ? freshMap.get(prev.id)! : prev));
      }
    } catch (err) {
      console.warn('refreshProductsByIds error:', err);
    }
  }, []);

  // Public Homepage Initial Load
  const hasInitializedStoreRef = useRef<boolean>(false);
  const isInitializingStoreRef = useRef<boolean>(false);

  const refreshAllStoreData = useCallback(async (force = false): Promise<void> => {
    // Prevent duplicate API requests during initial React render, re-renders, or concurrent effects
    if (isInitializingStoreRef.current) {
      return;
    }
    if (hasInitializedStoreRef.current && !force) {
      return;
    }

    isInitializingStoreRef.current = true;
    try {
      const homepageRes = await storeHomepageApi.getHomepage({ force });

      if (homepageRes.success && homepageRes.data) {
        const hpData = homepageRes.data;
        if (Array.isArray(hpData.categories)) {
          setCategories((prev) => {
            if (
              prev.length === hpData.categories.length &&
              prev.every((c, i) => c.id === hpData.categories[i].id && c.name === hpData.categories[i].name)
            ) {
              return prev;
            }
            return hpData.categories;
          });
        }
        if (Array.isArray(hpData.slides)) {
          setSlides(hpData.slides);
        }
        if (hpData.settings) {
          setSettings((prev) => {
            const jsonPrev = JSON.stringify(prev);
            const jsonNext = JSON.stringify(hpData.settings);
            return jsonPrev === jsonNext ? prev : hpData.settings;
          });
          try {
            const json = JSON.stringify(sanitizeSettingsForBrowserStorage(hpData.settings));
            if (localStorage.getItem(STORAGE_KEYS.SETTINGS) !== json) {
              localStorage.setItem(STORAGE_KEYS.SETTINGS, json);
            }
            if (localStorage.getItem('rongdhonu_settings')) {
              localStorage.removeItem('rongdhonu_settings');
            }
          } catch {}
        }
        if (hpData.categoryProducts) {
          setHomepageCategoryProducts(hpData.categoryProducts);
        }
        if (Array.isArray(hpData.featuredProducts)) {
          setFeaturedProducts(hpData.featuredProducts);
        }
        const loadedProducts = hpData.products || [];
        setProducts(loadedProducts);
        setQuickViewProduct((prev) => (prev ? loadedProducts.find((p) => p.id === prev.id) || prev : null));
        hasInitializedStoreRef.current = true;
        setIsStoreError(false);
      } else {
        // Optimized Fallback: Parallel requests; avoids 1 separate API request per category
        const [catsRes, sldsRes, sttngsRes, prodsRes] = await Promise.allSettled([
          categoriesApi.getAll({ force }),
          slidersApi.getAll({ force }),
          settingsApi.get({ force }),
          productsApi.getAll({ limit: 48 }),
        ]);

        let freshCategories: Category[] = [];
        if (catsRes.status === 'fulfilled' && Array.isArray(catsRes.value)) {
          freshCategories = catsRes.value;
          setCategories((prev) => {
            if (
              prev.length === freshCategories.length &&
              prev.every((c, i) => c.id === freshCategories[i].id && c.name === freshCategories[i].name)
            ) {
              return prev;
            }
            return freshCategories;
          });
        }
        if (sldsRes.status === 'fulfilled' && Array.isArray(sldsRes.value)) {
          setSlides(sldsRes.value);
        }
        if (sttngsRes.status === 'fulfilled' && sttngsRes.value) {
          const freshSettings = sttngsRes.value;
          setSettings((prev) => {
            const jsonPrev = JSON.stringify(prev);
            const jsonNext = JSON.stringify(freshSettings);
            return jsonPrev === jsonNext ? prev : freshSettings;
          });
          try {
            const json = JSON.stringify(sanitizeSettingsForBrowserStorage(freshSettings));
            if (localStorage.getItem(STORAGE_KEYS.SETTINGS) !== json) {
              localStorage.setItem(STORAGE_KEYS.SETTINGS, json);
            }
            if (localStorage.getItem('rongdhonu_settings')) {
              localStorage.removeItem('rongdhonu_settings');
            }
          } catch {}
        }

        const catMap: Record<string, Product[]> = {};
        let loadedProducts: Product[] = [];

        if (prodsRes.status === 'fulfilled' && Array.isArray(prodsRes.value) && prodsRes.value.length > 0) {
          loadedProducts = prodsRes.value;
          for (const c of freshCategories) {
            catMap[c.id] = loadedProducts.filter((p) => p.categoryId === c.id).slice(0, 6);
          }
          const feat = loadedProducts.filter((p) => Boolean(p.featured || (p as any).isFeatured)).slice(0, 8);
          setFeaturedProducts(feat);
          setHomepageCategoryProducts(catMap);
          setProducts(loadedProducts);
        } else {
          // Secondary fallback only if bulk product query failed
          try {
            await Promise.all(
              freshCategories.map(async (c) => {
                try {
                  const catProds = await productsApi.getHomepageCategoryProducts(c.id, 6);
                  catMap[c.id] = catProds;
                  loadedProducts.push(...catProds);
                } catch {
                  catMap[c.id] = [];
                }
              })
            );
            setHomepageCategoryProducts(catMap);
            setProducts(loadedProducts);
          } catch {}
        }
        hasInitializedStoreRef.current = true;
        setIsStoreError(false);
      }
    } catch (e) {
      console.error('Failed to load store data from D1:', e);
      setIsStoreError(true);
      // Safe fallback for business-critical offline resilience:
      // Dynamically load seed data on demand ONLY when remote API is unreachable
      try {
        const {
          INITIAL_PRODUCTS,
          INITIAL_CATEGORIES,
          INITIAL_SLIDES,
          INITIAL_COUPONS,
          INITIAL_REVIEWS,
        } = await import('../data/seedData');
        setProducts((prev) => (prev.length === 0 ? INITIAL_PRODUCTS : prev));
        setCategories((prev) => (prev.length === 0 ? INITIAL_CATEGORIES : prev));
        setSlides((prev) => (prev.length === 0 ? INITIAL_SLIDES : prev));
        setCoupons((prev) => (prev.length === 0 ? INITIAL_COUPONS : prev));
        setReviews((prev) => (prev.length === 0 ? INITIAL_REVIEWS : prev));
      } catch (err) {
        console.warn('Fallback seed data loading notice:', err);
      }
    } finally {
      isInitializingStoreRef.current = false;
      setIsStoreInitializing(false);
    }
  }, []);

  const retryStoreInit = useCallback(() => {
    hasInitializedStoreRef.current = false;
    setIsStoreInitializing(true);
    setIsStoreError(false);
    refreshAllStoreData(true);
  }, [refreshAllStoreData]);

  useEffect(() => {
    refreshAllStoreData();
  }, [refreshAllStoreData]);

  // Server-side paginated product fetch for dedicated Category Listing and Search Views
  useEffect(() => {
    if (!selectedCategory && !searchQuery.trim()) {
      return;
    }

    let isCancelled = false;
    setIsCategoryLoading(true);

    const isFeaturedCategory = selectedCategory === 'featured';
    const catObj = categories.find((c) => c.id === selectedCategory || c.slug === selectedCategory);
    const categoryParamForApi = isFeaturedCategory
      ? undefined
      : (catObj ? catObj.id : (selectedCategory || undefined));

    productsApi
      .getPaginated({
        category: categoryParamForApi,
        search: searchQuery.trim() || undefined,
        featured: isFeaturedCategory ? true : undefined,
        page: categoryPage,
        limit: 24,
        sortBy: categorySortBy,
      })
      .then((res) => {
        if (!isCancelled) {
          setCategoryListingProducts(res.products);
          setCategoryTotalProducts(res.total);
          setCategoryTotalPages(res.totalPages);
          setIsCategoryLoading(false);

          setProducts((prev) => {
            let hasNewOrUpdated = false;
            const map = new Map<string, Product>();
            for (const p of prev) {
              map.set(p.id, p);
            }
            for (const p of res.products) {
              const existing = map.get(p.id);
              if (
                !existing ||
                existing.updatedAt !== p.updatedAt ||
                existing.price !== p.price ||
                existing.stock !== p.stock
              ) {
                hasNewOrUpdated = true;
                map.set(p.id, p);
              }
            }
            if (!hasNewOrUpdated) return prev;
            return Array.from(map.values());
          });
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn('Failed to fetch paginated products:', err);
          setIsCategoryLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedCategory, searchQuery, categoryPage, categorySortBy, categories]);

  // Customer Checkout & Order Creation
  const createOrder = useCallback(async (orderData: {
    userId?: string;
    userEmail?: string;
    customer: Order['customer'];
    items: CartItem[];
    subtotal: number;
    deliveryFee: number;
    totalAmount: number;
    couponCode?: string;
    discountAmount?: number;
    paymentMethod: Order['paymentMethod'];
    paymentStatus: Order['paymentStatus'];
    transactionId?: string;
    dbblDetails?: Order['dbblDetails'];
    cardDetails?: Order['cardDetails'];
  }): Promise<Order> => {
    const randNum = 10000000 + Math.floor(Math.random() * 90000000);
    const idempotencyKey = `idem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const newOrder: Order = {
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      orderNumber: `RT-${new Date().getFullYear()}-${randNum}`,
      userId: orderData.userId,
      userEmail: orderData.userEmail,
      customer: orderData.customer,
      items: orderData.items,
      subtotal: orderData.subtotal,
      deliveryFee: orderData.deliveryFee,
      totalAmount: orderData.totalAmount,
      couponCode: orderData.couponCode,
      discountAmount: orderData.discountAmount,
      paymentMethod: orderData.paymentMethod,
      paymentStatus: orderData.paymentStatus,
      transactionId: orderData.transactionId,
      dbblDetails: orderData.dbblDetails,
      cardDetails: orderData.cardDetails,
      shippingStatus: 'Pending',
      createdAt: new Date().toISOString(),
    };

    const res = await orderApi.createOrder(newOrder, idempotencyKey);
    if (!res.success) {
      const displayError = res.error || 'Unable to place the order right now. Please try again.';
      showNotification(
        'error',
        'Order Placement Failed',
        displayError,
        6000
      );
      throw new Error(displayError);
    }

    const canonicalOrder: Order = res.order || newOrder;
    setOrders((prev) => [canonicalOrder, ...prev.filter((o) => o.id !== canonicalOrder.id)]);
    clearCart();

    const orderedProductIds = canonicalOrder.items.map((it) => it.product.id);
    refreshProductsByIds(orderedProductIds).catch(console.warn);

    try {
      trackSocialEvent(
        'Purchase',
        {
          content_name: canonicalOrder.items.map((it) => it.product.title).join(', '),
          content_ids: canonicalOrder.items.map((it) => it.product.id),
          contents: canonicalOrder.items.map((it) => ({
            id: it.product.id,
            name: it.product.title,
            price: it.product.price,
            quantity: it.quantity,
            item_price: it.product.price,
          })),
          num_items: canonicalOrder.items.reduce((acc, it) => acc + it.quantity, 0),
          value: canonicalOrder.totalAmount,
          currency: 'BDT',
          order_id: canonicalOrder.id,
          transaction_id: canonicalOrder.orderNumber,
          payment_method: canonicalOrder.paymentMethod,
        },
        {
          email: orderData.customer.email || orderData.userEmail || currentUser?.email,
          phone: orderData.customer.phone || currentUser?.phone,
          fullName: orderData.customer.fullName || currentUser?.name,
          district: orderData.customer.district,
          deliveryZone: orderData.customer.deliveryZone,
        }
      );
    } catch {}

    showNotification(
      'success',
      'Order Placed Successfully! 🎉',
      `Order #${canonicalOrder.orderNumber} for ৳${canonicalOrder.totalAmount.toLocaleString()} has been received! Our team is preparing your package.`,
      6000
    );

    return canonicalOrder;
  }, [clearCart, currentUser, refreshProductsByIds, showNotification]);

  const finalizePayment = useCallback(async (orderId: string, transactionId: string) => {
    try {
      const res = await orderApi.updateOrder(orderId, { paymentStatus: 'Paid', transactionId });
      if (res.success && res.order) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, paymentStatus: 'Paid', transactionId } : o))
        );
      }
      showNotification('success', 'Payment Submitted', 'Transaction ID saved for verification.');
    } catch (e: any) {
      showNotification('error', 'Update Failed', e?.message || 'Failed to submit payment details');
    }
  }, [showNotification]);

  const updateCustomerDeliveryInfo = useCallback(async (
    orderId: string,
    info: {
      fullName: string;
      phone: string;
      fullAddress: string;
      district: string;
      deliveryZone: 'inside_dhaka' | 'outside_dhaka';
    }
  ) => {
    try {
      const res = await orderApi.updateOrder(orderId, {
        customer: {
          fullName: info.fullName.trim(),
          phone: info.phone.trim(),
          fullAddress: info.fullAddress.trim(),
          district: info.district.trim(),
          deliveryZone: info.deliveryZone,
        } as any,
      });

      if (res.success && res.order) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, customer: res.order!.customer } : o))
        );
        showNotification('success', 'Delivery Info Updated', 'Your delivery details have been saved.');
        return { success: true, updatedOrder: res.order };
      }
      return { success: false, message: res.error || 'Failed to update delivery info' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Network error' };
    }
  }, [showNotification]);

  const cancelCustomerOrder = useCallback(async (orderId: string) => {
    try {
      const res = await orderApi.updateOrder(orderId, { shippingStatus: 'Cancelled' });
      if (res.success) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, shippingStatus: 'Cancelled' } : o))
        );
        showNotification('info', 'Order Cancelled', 'Your order has been cancelled.');
        return { success: true };
      }
      return { success: false, message: res.error || 'Failed to cancel order' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Network error' };
    }
  }, [showNotification]);

  // URLs & Links
  const getProductUrl = useCallback((productId: string, options?: { absolute?: boolean }): string => {
    const path = `/product/${encodeURIComponent(productId)}`;
    return options?.absolute ? `${SITE_DOMAIN}${path}` : path;
  }, []);

  const getCategoryUrl = useCallback((categoryIdOrSlug: string, options?: { absolute?: boolean }): string => {
    const cat = categories.find((c) => c.id === categoryIdOrSlug || c.slug === categoryIdOrSlug);
    const identifier = cat ? cat.slug || cat.id : categoryIdOrSlug;
    const path = `/category/${encodeURIComponent(identifier)}`;
    return options?.absolute ? `${SITE_DOMAIN}${path}` : path;
  }, [categories]);

  const copyProductLink = useCallback(async (productId: string): Promise<boolean> => {
    const url = getProductUrl(productId, { absolute: true });
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showNotification('success', 'Product Link Copied! 🔗', `Direct link copied: ${url}`);
      return true;
    } catch (err) {
      console.error('Failed to copy product link', err);
      showNotification('error', 'Copy Failed', url);
      return false;
    }
  }, [getProductUrl, showNotification]);

  const copyCategoryLink = useCallback(async (categoryIdOrSlug: string): Promise<boolean> => {
    const url = getCategoryUrl(categoryIdOrSlug, { absolute: true });
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showNotification('success', 'Category URL Copied! 🔗', `Direct link copied: ${url}`);
      return true;
    } catch (err) {
      console.error('Failed to copy category link', err);
      showNotification('error', 'Copy Failed', url);
      return false;
    }
  }, [getCategoryUrl, showNotification]);

  // Pixel Tracking & SEO
  const [pixelLogs, setPixelLogs] = useState<PixelEventLog[]>(() => {
    try {
      return getStoredPixelLogs();
    } catch {
      return [];
    }
  });

  const isMetaActive = Boolean(settings.trackingEnabled && settings.fbPixelId && settings.fbPixelId.trim());
  const isTikTokActive = Boolean(settings.trackingEnabled && settings.tiktokPixelId && settings.tiktokPixelId.trim());
  const isGtmActive = Boolean(settings.trackingEnabled && settings.gtmId && settings.gtmId.trim());
  const isGaActive = Boolean(settings.trackingEnabled && settings.googleAnalyticsId && settings.googleAnalyticsId.trim());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Non-blocking initialization: Execute strictly during idle periods or post-FCP
    const cancelSync = scheduleTrackingSync(
      settings,
      currentUser
        ? {
            email: currentUser.email,
            phone: currentUser.phone,
            fullName: currentUser.name,
            district: currentUser.district,
          }
        : null
    );
    return () => cancelSync();
  }, [
    settings.trackingEnabled,
    settings.fbPixelId,
    settings.fbTestEventCode,
    settings.tiktokPixelId,
    settings.tiktokTestEventCode,
    settings.gtmId,
    settings.googleAnalyticsId,
    settings.advancedMatchingEnabled,
    currentUser?.email,
    currentUser?.phone,
  ]);

  const trackEvent = useCallback((
    eventName: string,
    params?: Record<string, any>,
    userData?: TrackingUserData
  ): PixelEventLog => {
    const log = trackSocialEvent(eventName, params, userData);
    setPixelLogs((prev) => [log, ...prev.slice(0, 99)]);
    return log;
  }, []);

  const fireTestPixelEvent = useCallback((type: 'PageView' | 'ViewContent' | 'ProductView' | 'AddToCart' | 'InitiateCheckout' | 'Purchase'): PixelEventLog => {
    const sampleProduct = products[0] || {
      id: 'prod-test-01',
      title: 'Premium Test Product',
      price: 1250,
      stock: 10,
      categoryId: 'cat-fashion',
      imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30',
      createdAt: new Date().toISOString(),
    };
    const log = trackSocialEvent(type, {
      content_name: sampleProduct.title,
      content_ids: [sampleProduct.id],
      content_type: 'product',
      value: sampleProduct.price,
      currency: 'BDT',
    });
    setPixelLogs((prev) => [log, ...prev.slice(0, 99)]);
    showNotification('success', 'Test Event Fired', `${type} dispatched to Meta, TikTok & GTM/GA pipelines.`);
    return log;
  }, [products, showNotification]);

  const clearPixelLogs = useCallback(() => {
    clearStoredPixelLogs();
    setPixelLogs((prev) => (prev.length === 0 ? prev : []));
    showNotification('info', 'Logs Cleared', 'In-memory and cached pixel event logs have been cleared.');
  }, [showNotification]);

  // Favicon Sync
  useEffect(() => {
    const iconUrl = settings.faviconUrl || settings.logoUrl;
    if (iconUrl) {
      updateDynamicFavicon(iconUrl);
    }
  }, [settings.faviconUrl, settings.logoUrl]);

  // Master Client SEO
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (currentView === 'admin') {
      document.title = `Admin Dashboard | ${settings.siteName || DEFAULT_SITE_NAME}`;
      return;
    }

    const activeProd = currentView === 'product' && singleProduct ? singleProduct : quickViewProduct;
    if (activeProd) {
      const meta = getProductSEOMetadata(activeProd, settings.siteName);
      const cat = categories.find((c) => c.id === activeProd.categoryId);
      applyClientSEO(
        {
          ...meta,
          category: cat,
          breadcrumbs: [
            { name: 'Home', url: `${SITE_DOMAIN}/` },
            ...(cat
              ? [
                  {
                    name: cat.name,
                    url: `${SITE_DOMAIN}/category/${encodeURIComponent(cat.slug || cat.id)}`,
                  },
                ]
              : []),
            {
              name: activeProd.title,
              url: `${SITE_DOMAIN}/product/${encodeURIComponent(activeProd.id)}`,
            },
          ],
        },
        settings
      );
      return;
    }

    if (currentView === 'product' && productNotFound) {
      applyClientSEO(
        {
          title: `Product Not Found | ${settings.siteName || DEFAULT_SITE_NAME}`,
          description: `The requested product could not be found at ${settings.siteName || DEFAULT_SITE_NAME}. Browse our active collections across Bangladesh.`,
          canonicalUrl: `${SITE_DOMAIN}/`,
          noIndex: true,
        },
        settings
      );
      return;
    }

    if (searchQuery.trim()) {
      applyClientSEO(
        {
          title: `Search: "${searchQuery.trim()}" | ${settings.siteName || DEFAULT_SITE_NAME}`,
          description: `Search results for "${searchQuery.trim()}" at ${settings.siteName || DEFAULT_SITE_NAME}. Order online with Cash on Delivery nationwide.`,
          canonicalUrl: `${SITE_DOMAIN}/?search=${encodeURIComponent(searchQuery.trim())}`,
          ogType: 'website',
          ogImage: settings.logoUrl || DEFAULT_FALLBACK_IMAGE,
          noIndex: true,
        },
        settings
      );
      return;
    }

    const currentSiteName = settings.siteName || DEFAULT_SITE_NAME;
    applyClientSEO(
      {
        title:
          currentSiteName === DEFAULT_SITE_NAME
            ? DEFAULT_HOMEPAGE_TITLE
            : `${currentSiteName} | ${DEFAULT_BENGALI_BRAND_NAME} - Online Shopping in Bangladesh`,
        description: DEFAULT_HOMEPAGE_DESCRIPTION,
        canonicalUrl: `${SITE_DOMAIN}/`,
        ogType: 'website',
        ogImage: settings.logoUrl || DEFAULT_FALLBACK_IMAGE,
        breadcrumbs: [{ name: 'Home', url: `${SITE_DOMAIN}/` }],
      },
      settings
    );
  }, [
    quickViewProduct,
    singleProduct,
    productNotFound,
    searchQuery,
    categories,
    currentView,
    settings,
  ]);

  const value = useMemo<StorefrontContextType>(() => ({
    isStoreInitializing,
    isStoreError,
    retryStoreInit,
    products,
    setProducts,
    categories,
    setCategories,
    slides,
    setSlides,
    settings,
    setSettings,
    currentView,
    setCurrentView,
    selectedProductId,
    setSelectedProductId,
    singleProduct,
    setSingleProduct,
    isProductLoading,
    productNotFound,
    loadProductById,
    refreshProductsByIds,
    selectedCategory,
    setSelectedCategory,
    navigateToCategory,
    categoryNavSeq,
    searchQuery,
    setSearchQuery,
    quickViewProduct,
    setQuickViewProduct,
    videoModalProduct,
    setVideoModalProduct,
    videoModalMode,
    setVideoModalMode,
    openProductVideo,
    featuredProducts,
    setFeaturedProducts,
    homepageCategoryProducts,
    setHomepageCategoryProducts,
    categoryListingProducts,
    setCategoryListingProducts,
    categoryPage,
    setCategoryPage,
    categoryTotalPages,
    categoryTotalProducts,
    isCategoryLoading,
    categorySortBy,
    setCategorySortBy,
    wishlist,
    isWishlistOpen,
    setIsWishlistOpen,
    toggleWishlist,
    isInWishlist,
    clearWishlist,
    isUserAccountModalOpen,
    setIsUserAccountModalOpen,
    userAccountModalTab,
    setUserAccountModalTab,
    notification,
    showNotification,
    dismissNotification,
    coupons,
    setCoupons,
    applyCoupon,
    reviews,
    setReviews,
    addProductReview,
    deleteProductReview,
    getProductReviews,
    orders,
    setOrders,
    createOrder,
    recentSuccessOrder,
    setRecentSuccessOrder,
    activePaymentModalOrder,
    setActivePaymentModalOrder,
    finalizePayment,
    updateCustomerDeliveryInfo,
    cancelCustomerOrder,
    getProductUrl,
    getCategoryUrl,
    copyProductLink,
    copyCategoryLink,
    pixelLogs,
    trackEvent,
    fireTestPixelEvent,
    clearPixelLogs,
    isMetaActive,
    isTikTokActive,
    isGtmActive,
    isGaActive,
  }), [
    isStoreInitializing,
    isStoreError,
    retryStoreInit,
    products,
    categories,
    slides,
    settings,
    currentView,
    selectedProductId,
    singleProduct,
    isProductLoading,
    productNotFound,
    loadProductById,
    refreshProductsByIds,
    selectedCategory,
    navigateToCategory,
    categoryNavSeq,
    searchQuery,
    quickViewProduct,
    videoModalProduct,
    videoModalMode,
    openProductVideo,
    featuredProducts,
    homepageCategoryProducts,
    categoryListingProducts,
    categoryPage,
    categoryTotalPages,
    categoryTotalProducts,
    isCategoryLoading,
    categorySortBy,
    wishlist,
    isWishlistOpen,
    toggleWishlist,
    isInWishlist,
    clearWishlist,
    isUserAccountModalOpen,
    userAccountModalTab,
    notification,
    showNotification,
    dismissNotification,
    coupons,
    applyCoupon,
    reviews,
    addProductReview,
    deleteProductReview,
    getProductReviews,
    orders,
    createOrder,
    recentSuccessOrder,
    activePaymentModalOrder,
    finalizePayment,
    updateCustomerDeliveryInfo,
    cancelCustomerOrder,
    getProductUrl,
    getCategoryUrl,
    copyProductLink,
    copyCategoryLink,
    pixelLogs,
    trackEvent,
    fireTestPixelEvent,
    clearPixelLogs,
    isMetaActive,
    isTikTokActive,
    isGtmActive,
    isGaActive,
  ]);

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
};

export const useStorefront = () => {
  const context = useContext(StorefrontContext);
  if (!context) {
    throw new Error('useStorefront must be used within a StorefrontProvider');
  }
  return context;
};
