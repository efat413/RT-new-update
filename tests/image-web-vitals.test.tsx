import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { HeroCarousel } from '../src/components/HeroCarousel';
import { ProductCard } from '../src/components/ProductCard';
import { Product } from '../src/types';

// Mock StoreContext
vi.mock('../src/context/StoreContext', () => ({
  useStore: () => ({
    slides: [
      {
        id: 'slide-1',
        title: 'Hero Slide 1',
        headline: 'Special Collection',
        subtext: 'Up to 50% off',
        tag: 'New',
        discountBadge: '50% OFF',
        categoryId: 'cat-1',
        imageUrl: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=1200&q=80',
        isActive: true,
      },
      {
        id: 'slide-2',
        title: 'Hero Slide 2',
        headline: 'Summer Deals',
        subtext: 'Trending styles',
        tag: 'Hot',
        discountBadge: '30% OFF',
        categoryId: 'cat-2',
        imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80',
        isActive: true,
      },
    ],
    settings: {
      siteName: 'Rongdhonu Trade',
      sliderAspectRatio: '1200 / 480',
      bannerFitMode: 'cover',
    },
    navigateToCategory: vi.fn(),
    categories: [{ id: 'cat-1', name: 'Electronics', slug: 'electronics' }],
    wishlist: [],
    toggleWishlist: vi.fn(),
    copyProductLink: vi.fn(),
    getProductUrl: (p: any) => `/product/${p.slug || p.id}`,
    getCategoryUrl: (c: any) => `/category/${c.slug || c.id}`,
    setSelectedCategory: vi.fn(),
    setCurrentView: vi.fn(),
    setSelectedProductId: vi.fn(),
    loadProductById: vi.fn(),
    addToCart: vi.fn(),
    quickBuy: vi.fn(),
    setQuickViewProduct: vi.fn(),
    reviews: [],
  }),
}));

const mockProduct: Product = {
  id: 'prod-1',
  slug: 'prod-1-slug',
  title: 'Premium Wireless Earbuds',
  price: 2500,
  originalPrice: 3500,
  stock: 15,
  categoryId: 'cat-1',
  imageUrl: 'https://images.unsplash.com/photo-earbuds?auto=format&fit=crop&w=600&q=80',
  description: 'High quality sound',
  images: [
    'https://images.unsplash.com/photo-earbuds?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-earbuds-2?auto=format&fit=crop&w=600&q=80',
  ],
  featured: true,
  rating: 4.8,
  reviewsCount: 12,
  status: 'active',
  createdAt: '2026-03-01T00:00:00.000Z',
};

describe('Phase 6: Image Core Web Vitals & Render Validation', () => {
  it('1. Verifies first hero image contains fetchpriority="high" and does NOT contain loading="lazy"', () => {
    const html = renderToString(<HeroCarousel />);

    // First hero image contains fetchpriority="high" (case-insensitive in HTML/DOM)
    expect(html).toMatch(/fetchpriority="high"/i);
    expect(html).toContain('loading="eager"');
    expect(html).toContain('decoding="sync"');

    // Hero LCP image must never be lazily loaded
    expect(html).not.toContain('loading="lazy"');
  });

  it('2. Verifies grid product cards contain loading="lazy" and explicit aspect-ratio container', () => {
    const html = renderToString(<ProductCard product={mockProduct} priority={false} />);

    // Enforce lazy loading and async decoding for catalog/grid items
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');

    // Enforce CLS elimination via explicit aspect-square / aspect-ratio container
    expect(html).toContain('aspect-square');
  });
});
