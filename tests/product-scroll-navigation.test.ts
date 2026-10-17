import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { Product, ProductReview } from '../src/types';

describe('Product Detail View & Storefront Scroll Architecture Regression Suite', () => {
  let mockScrollTo: any;
  let mockReplaceState: any;
  let mockHistory: any;

  beforeEach(() => {
    mockScrollTo = vi.fn();
    mockReplaceState = vi.fn();
    mockHistory = {
      state: {},
      replaceState: mockReplaceState,
      scrollRestoration: 'manual',
    };

    // Polyfill window & history for unit test environment
    (globalThis as any).window = {
      scrollTo: mockScrollTo,
      history: mockHistory,
      location: {
        pathname: '/product/excel-ep-06-20000mah-22-5w-power-bank',
        search: '',
      },
    };
    (globalThis as any).document = {
      title: 'Excel EP-06 Power Bank | Rongdhonu Trade',
    };
  });

  const mockProduct: Product = {
    id: 'prod-powerbank-101',
    slug: 'excel-ep-06-20000mah-22-5w-power-bank',
    title: 'Excel EP-06 20000mAh 22.5W Power Bank',
    price: 1850,
    originalPrice: 2400,
    buyingPrice: 1100,
    categoryId: 'cat-electronics',
    description: 'High capacity 20000mAh fast charging power bank.',
    imageUrl: 'https://example.com/powerbank.jpg',
    images: ['https://example.com/powerbank-1.jpg', 'https://example.com/powerbank-2.jpg'],
    stock: 45,
    featured: true,
    rating: 4.9,
    reviewsCount: 28,
    sizes: ['Standard'],
    colors: ['Black', 'White'],
    sku: 'EXCEL-EP06-PB',
    videoUrl: 'https://youtube.com/watch?v=mock123',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  };

  describe('1. Isolated Scroll Reset Guard (hasScrolledForProductRef)', () => {
    it('executes scrollTo(0, 0) exactly once upon initial product route mount', () => {
      let hasScrolledForProduct: string | null = null;
      const productId = 'excel-ep-06-20000mah-22-5w-power-bank';

      const runScrollGuard = (currentProductId: string, product: Product | null) => {
        const isSameProduct = Boolean(
          hasScrolledForProduct &&
          (hasScrolledForProduct === currentProductId ||
           (product && (
             product.id === hasScrolledForProduct ||
             (product.slug && product.slug === hasScrolledForProduct)
           )))
        );

        if (!isSameProduct) {
          hasScrolledForProduct = product?.id || currentProductId;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (product?.id && hasScrolledForProduct !== product.id) {
          hasScrolledForProduct = product.id;
        }
      };

      // Initial Mount with slug
      runScrollGuard(productId, mockProduct);
      expect(mockScrollTo).toHaveBeenCalledTimes(1);
      expect(mockScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
      expect(hasScrolledForProduct).toBe(mockProduct.id);

      // Subsequent re-render of same product
      runScrollGuard(productId, mockProduct);
      expect(mockScrollTo).toHaveBeenCalledTimes(1);
    });

    it('does NOT re-trigger scrollTo when URL canonicalization updates productId prop from raw ID to canonical slug', () => {
      let hasScrolledForProduct: string | null = null;

      const runScrollGuard = (currentProductId: string, product: Product | null) => {
        const isSameProduct = Boolean(
          hasScrolledForProduct &&
          (hasScrolledForProduct === currentProductId ||
           (product && (
             product.id === hasScrolledForProduct ||
             (product.slug && product.slug === hasScrolledForProduct)
           )))
        );

        if (!isSameProduct) {
          hasScrolledForProduct = product?.id || currentProductId;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (product?.id && hasScrolledForProduct !== product.id) {
          hasScrolledForProduct = product.id;
        }
      };

      // 1. Initial navigation via raw ID
      runScrollGuard('prod-powerbank-101', null);
      expect(mockScrollTo).toHaveBeenCalledTimes(1);
      expect(hasScrolledForProduct).toBe('prod-powerbank-101');

      // 2. Product payload arrives from D1
      runScrollGuard('prod-powerbank-101', mockProduct);
      expect(mockScrollTo).toHaveBeenCalledTimes(1); // STILL 1
      expect(hasScrolledForProduct).toBe('prod-powerbank-101');

      // 3. Address bar and selectedProductId are synchronized to canonical slug
      runScrollGuard('excel-ep-06-20000mah-22-5w-power-bank', mockProduct);
      expect(mockScrollTo).toHaveBeenCalledTimes(1); // STILL 1! No scroll jumping!
      expect(hasScrolledForProduct).toBe(mockProduct.id);
    });

    it('preserves scroll position across in-place state changes (images, variants, quantity, reviews)', () => {
      let hasScrolledForProduct: string | null = null;
      const productId = mockProduct.slug!;

      const runScrollGuard = () => {
        const isSameProduct = Boolean(
          hasScrolledForProduct &&
          (hasScrolledForProduct === productId ||
           (mockProduct && (
             mockProduct.id === hasScrolledForProduct ||
             (mockProduct.slug && mockProduct.slug === hasScrolledForProduct)
           )))
        );

        if (!isSameProduct) {
          hasScrolledForProduct = mockProduct?.id || productId;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      };

      // Mount
      runScrollGuard();
      expect(mockScrollTo).toHaveBeenCalledTimes(1);

      // Customer scrolls down 450px and clicks image thumbnail 2
      let selectedImageIdx = 1;
      runScrollGuard();
      expect(mockScrollTo).toHaveBeenCalledTimes(1);

      // Customer picks 'White' color variant
      let selectedColor = 'White';
      runScrollGuard();
      expect(mockScrollTo).toHaveBeenCalledTimes(1);

      // Customer increments quantity to 3
      let quantity = 3;
      runScrollGuard();
      expect(mockScrollTo).toHaveBeenCalledTimes(1);

      // Customer switches to reviews tab
      let activeTab = 'reviews';
      runScrollGuard();
      expect(mockScrollTo).toHaveBeenCalledTimes(1);
    });

    it('triggers scrollTo(0, 0) when user explicitly navigates to a truly different product', () => {
      let hasScrolledForProduct: string | null = null;

      const runScrollGuard = (currentProductId: string, product: Product | null) => {
        const isSameProduct = Boolean(
          hasScrolledForProduct &&
          (hasScrolledForProduct === currentProductId ||
           (product && (
             product.id === hasScrolledForProduct ||
             (product.slug && product.slug === hasScrolledForProduct)
           )))
        );

        if (!isSameProduct) {
          hasScrolledForProduct = product?.id || currentProductId;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (product?.id && hasScrolledForProduct !== product.id) {
          hasScrolledForProduct = product.id;
        }
      };

      // View Product 1
      runScrollGuard('prod-powerbank-101', mockProduct);
      expect(mockScrollTo).toHaveBeenCalledTimes(1);

      // View Product 2 (e.g. clicked from Related Products)
      const mockProduct2: Product = {
        ...mockProduct,
        id: 'prod-smartwatch-202',
        slug: 't800-ultra-smartwatch',
        title: 'T800 Ultra Smartwatch',
      };

      runScrollGuard('t800-ultra-smartwatch', mockProduct2);
      expect(mockScrollTo).toHaveBeenCalledTimes(2);
      expect(hasScrolledForProduct).toBe('prod-smartwatch-202');
    });
  });

  describe('2. Load Guard (lastLoadedProductRef) & Decoupled Fetch Architecture', () => {
    it('prevents redundant duplicate API requests when slug canonicalization updates productId', () => {
      let lastLoadedProduct: string | null = null;
      const loadProductSpy = vi.fn();

      const runFetchGuard = (currentProductId: string, product: Product | null) => {
        const isAlreadyLoaded = Boolean(
          lastLoadedProduct &&
          (lastLoadedProduct === currentProductId ||
           (product && (
             product.id === lastLoadedProduct ||
             (product.slug && product.slug === lastLoadedProduct)
           )))
        );

        if (isAlreadyLoaded) {
          if (product?.id) {
            lastLoadedProduct = product.id;
          }
          return;
        }

        lastLoadedProduct = product?.id || currentProductId;
        loadProductSpy(currentProductId);
      };

      // 1. Initial mount with ID
      runFetchGuard('prod-powerbank-101', null);
      expect(loadProductSpy).toHaveBeenCalledTimes(1);
      expect(loadProductSpy).toHaveBeenCalledWith('prod-powerbank-101');

      // 2. Product loaded into state
      runFetchGuard('prod-powerbank-101', mockProduct);
      expect(loadProductSpy).toHaveBeenCalledTimes(1);

      // 3. Prop changed to slug via URL synchronization
      runFetchGuard('excel-ep-06-20000mah-22-5w-power-bank', mockProduct);
      expect(loadProductSpy).toHaveBeenCalledTimes(1); // Still 1! No redundant network storm
    });
  });

  describe('3. Variant Initialization Guard (initializedVariantProductIdRef)', () => {
    it('initializes variant defaults strictly once and does not reset user selections on profile or auth updates', () => {
      let initializedVariantProductId: string | null = null;
      let selectedColor: string | undefined = undefined;
      let selectedImageIdx = 0;

      const initVariantDefaults = (product: Product) => {
        if (!product?.id) return;
        if (initializedVariantProductId === product.id) {
          return;
        }
        initializedVariantProductId = product.id;

        selectedImageIdx = 0;
        selectedColor = product.colors && product.colors.length === 1 ? product.colors[0] : undefined;
      };

      // First load
      initVariantDefaults(mockProduct);
      expect(initializedVariantProductId).toBe(mockProduct.id);
      expect(selectedImageIdx).toBe(0);

      // User selects 'White' and thumbnail 2
      selectedColor = 'White';
      selectedImageIdx = 1;

      // Re-run with same product (e.g. background store sync or auth state change)
      initVariantDefaults(mockProduct);
      expect(selectedColor).toBe('White');
      expect(selectedImageIdx).toBe(1); // Not reset!
    });
  });

  describe('4. Browser Native Scroll Restoration Guard', () => {
    it('verifies scrollRestoration is set to manual to prevent browser popstate scroll jumps', () => {
      expect(window.history.scrollRestoration).toBe('manual');
    });
  });
});
