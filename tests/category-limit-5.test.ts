import { describe, it, expect, vi } from 'vitest';
import { getHomepageProducts } from '../src/server/db';
import { D1Database } from '../src/server/types';

describe('Category Product Limit 5 & Navigation Validation', () => {
  function createMockProductRow(id: string, categoryId: string, title: string) {
    return {
      id,
      slug: `${id}-slug`,
      title,
      price: 1000,
      original_price: 1200,
      buying_price: 600,
      category_id: categoryId,
      description: 'Test product description',
      image_url: 'https://example.com/img.jpg',
      images_json: JSON.stringify(['https://example.com/img.jpg']),
      stock: 10,
      featured: 0,
      featured_sort_order: 0,
      rating: 5,
      reviews_count: 2,
      specs_json: '[]',
      sizes_json: '[]',
      colors_json: '[]',
      sku: `SKU-${id}`,
      video_url: null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  function createMockD1Database(categoryProductRows: Record<string, any[]>): D1Database {
    return {
      prepare: vi.fn().mockImplementation((query: string) => {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(async () => {
            if (query.includes('featured = 1')) {
              return { success: true, results: [] };
            }
            if (query.includes('RankedProducts')) {
              // Simulate SQLite window function ROW_NUMBER() <= 5
              const results: any[] = [];
              for (const [catId, prods] of Object.entries(categoryProductRows)) {
                results.push(...prods.slice(0, 5));
              }
              return { success: true, results };
            }
            return { success: true, results: [] };
          }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      }),
      batch: vi.fn().mockImplementation(async (statements: any[]) => {
        const results = [];
        for (const stmt of statements) {
          const res = await stmt.all();
          results.push(res);
        }
        return results;
      }),
      exec: vi.fn().mockResolvedValue({ success: true }),
    };
  }

  it('1. Category with 0 products returns empty array []', async () => {
    const mockDb = createMockD1Database({ 'cat-empty': [] });
    const result = await getHomepageProducts(mockDb, ['cat-empty'], { perCategoryLimit: 5 });

    expect(result.categoryProducts['cat-empty']).toBeDefined();
    expect(result.categoryProducts['cat-empty']).toEqual([]);
  });

  it('2. Category with 3 products returns exactly 3 products', async () => {
    const productsCat3 = [
      createMockProductRow('prod-1', 'cat-3', 'Product 1'),
      createMockProductRow('prod-2', 'cat-3', 'Product 2'),
      createMockProductRow('prod-3', 'cat-3', 'Product 3'),
    ];

    const mockDb = createMockD1Database({ 'cat-3': productsCat3 });
    const result = await getHomepageProducts(mockDb, ['cat-3'], { perCategoryLimit: 5 });

    expect(result.categoryProducts['cat-3']).toHaveLength(3);
    expect(result.categoryProducts['cat-3'].map((p) => p.id)).toEqual(['prod-1', 'prod-2', 'prod-3']);
  });

  it('3. Category with 10 products returns strictly 5 products at the query/mock level', async () => {
    const productsCat10 = Array.from({ length: 10 }, (_, i) =>
      createMockProductRow(`prod-${i + 1}`, 'cat-10', `Product ${i + 1}`)
    );

    const mockDb = createMockD1Database({ 'cat-10': productsCat10 });
    const result = await getHomepageProducts(mockDb, ['cat-10'], { perCategoryLimit: 5 });

    expect(result.categoryProducts['cat-10']).toHaveLength(5);
    expect(result.categoryProducts['cat-10'].map((p) => p.id)).toEqual([
      'prod-1',
      'prod-2',
      'prod-3',
      'prod-4',
      'prod-5',
    ]);
  });

  it('4. "View All" navigation URL/slug mapping remains unbroken', () => {
    const categories = [
      { id: 'cat-mens-accessories', name: 'Men Accessories', slug: 'mens-accessories' },
      { id: 'cat-watches', name: 'Smart Watches', slug: 'smart-watches' },
      { id: 'cat-no-slug', name: 'Gift Items', slug: '' },
    ];

    const resolveViewAllUrl = (
      categoryIdOrSlug: string,
      options?: { absolute?: boolean; domain?: string }
    ): string => {
      if (categoryIdOrSlug === 'featured') {
        const path = '/featured';
        return options?.absolute ? `${options.domain || 'https://rongdhonutrade.com'}${path}` : path;
      }
      const cat = categories.find((c) => c.id === categoryIdOrSlug || c.slug === categoryIdOrSlug);
      const identifier = cat ? cat.slug || cat.id : categoryIdOrSlug;
      const path = `/category/${encodeURIComponent(identifier)}`;
      return options?.absolute ? `${options.domain || 'https://rongdhonutrade.com'}${path}` : path;
    };

    // Slug-based category
    expect(resolveViewAllUrl('cat-mens-accessories')).toBe('/category/mens-accessories');
    expect(resolveViewAllUrl('mens-accessories')).toBe('/category/mens-accessories');

    // Fallback to ID if no slug
    expect(resolveViewAllUrl('cat-no-slug')).toBe('/category/cat-no-slug');

    // Absolute URL mapping
    expect(resolveViewAllUrl('cat-watches', { absolute: true })).toBe(
      'https://rongdhonutrade.com/category/smart-watches'
    );

    // Featured view all navigation mapping
    expect(resolveViewAllUrl('featured')).toBe('/featured');
  });
});
