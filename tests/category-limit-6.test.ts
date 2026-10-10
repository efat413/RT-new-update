import { describe, it, expect, vi } from 'vitest';
import { getHomepageCategoryProducts, getHomepageProducts } from '../src/server/db';
import { D1Database } from '../src/server/types';

describe('Strict D1 SQL Limit 6 per Homepage Category Validation', () => {
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

  function createMockD1Database(
    categoryProductRows: Record<string, any[]>,
    options?: { shouldFailWindowQuery?: boolean }
  ) {
    const preparedStatements: Array<{ query: string; bindings: any[] }> = [];

    const mockDb: D1Database = {
      prepare: vi.fn().mockImplementation((query: string) => {
        let currentBindings: any[] = [];
        const stmt = {
          bind: vi.fn().mockImplementation((...args: any[]) => {
            currentBindings = args;
            preparedStatements.push({ query, bindings: args });
            return stmt;
          }),
          all: vi.fn().mockImplementation(async () => {
            if (options?.shouldFailWindowQuery && query.includes('RankedProducts')) {
              throw new Error('SQLite window function error: unrecognized token');
            }

            if (query.includes('featured = 1')) {
              return { success: true, results: [] };
            }

            if (query.includes('RankedProducts')) {
              const results: any[] = [];
              for (const [, prods] of Object.entries(categoryProductRows)) {
                results.push(...prods.slice(0, 6));
              }
              return { success: true, results };
            }

            if (query.includes('sub.category_id = p.category_id')) {
              const results: any[] = [];
              for (const [, prods] of Object.entries(categoryProductRows)) {
                results.push(...prods.slice(0, 6));
              }
              return { success: true, results };
            }

            return { success: true, results: [] };
          }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
        return stmt;
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

    return { mockDb, preparedStatements };
  }

  it('1. Category with 0 products returns empty array []', async () => {
    const { mockDb } = createMockD1Database({ 'cat-empty': [] });
    const result = await getHomepageCategoryProducts(mockDb, ['cat-empty'], 6);

    expect(result['cat-empty']).toBeDefined();
    expect(result['cat-empty']).toEqual([]);
  });

  it('2. Category with 1 product returns exactly 1 product', async () => {
    const productsCat1 = [createMockProductRow('prod-1', 'cat-1', 'Product 1')];
    const { mockDb } = createMockD1Database({ 'cat-1': productsCat1 });
    const result = await getHomepageCategoryProducts(mockDb, ['cat-1'], 6);

    expect(result['cat-1']).toHaveLength(1);
    expect(result['cat-1'][0].id).toBe('prod-1');
  });

  it('3. Category with 5 products returns exactly 5 products', async () => {
    const productsCat5 = Array.from({ length: 5 }, (_, i) =>
      createMockProductRow(`prod-${i + 1}`, 'cat-5', `Product ${i + 1}`)
    );
    const { mockDb } = createMockD1Database({ 'cat-5': productsCat5 });
    const result = await getHomepageCategoryProducts(mockDb, ['cat-5'], 6);

    expect(result['cat-5']).toHaveLength(5);
    expect(result['cat-5'].map((p) => p.id)).toEqual([
      'prod-1',
      'prod-2',
      'prod-3',
      'prod-4',
      'prod-5',
    ]);
  });

  it('4. Category with 6 products returns exactly 6 products', async () => {
    const productsCat6 = Array.from({ length: 6 }, (_, i) =>
      createMockProductRow(`prod-${i + 1}`, 'cat-6', `Product ${i + 1}`)
    );
    const { mockDb } = createMockD1Database({ 'cat-6': productsCat6 });
    const result = await getHomepageCategoryProducts(mockDb, ['cat-6'], 6);

    expect(result['cat-6']).toHaveLength(6);
    expect(result['cat-6'].map((p) => p.id)).toEqual([
      'prod-1',
      'prod-2',
      'prod-3',
      'prod-4',
      'prod-5',
      'prod-6',
    ]);
  });

  it('5. Category with >6 products (>10 products) strictly capped at 6 at the query/mock level', async () => {
    const productsCat12 = Array.from({ length: 12 }, (_, i) =>
      createMockProductRow(`prod-${i + 1}`, 'cat-12', `Product ${i + 1}`)
    );
    const { mockDb, preparedStatements } = createMockD1Database({ 'cat-12': productsCat12 });
    const result = await getHomepageCategoryProducts(mockDb, ['cat-12'], 6);

    expect(result['cat-12']).toHaveLength(6);
    expect(result['cat-12'].map((p) => p.id)).toEqual([
      'prod-1',
      'prod-2',
      'prod-3',
      'prod-4',
      'prod-5',
      'prod-6',
    ]);

    // Inspect prepared SQL and bound parameters
    const windowCall = preparedStatements.find((call) => call.query.includes('RankedProducts'));
    expect(windowCall).toBeDefined();
    expect(windowCall?.query).toContain('row_num <= ?');
    expect(windowCall?.query).toContain("status = 'active' OR status = 'published'");
    expect(windowCall?.bindings).toContain(6);
    expect(windowCall?.bindings).toEqual(['cat-12', 6]);
  });

  it('6. Fallback branch triggers when window query fails, asserting fallback SQL structure and bound parameter [6]', async () => {
    const productsCat10 = Array.from({ length: 10 }, (_, i) =>
      createMockProductRow(`prod-${i + 1}`, 'cat-fallback', `Product ${i + 1}`)
    );

    const { mockDb, preparedStatements } = createMockD1Database(
      { 'cat-fallback': productsCat10 },
      { shouldFailWindowQuery: true }
    );

    const result = await getHomepageCategoryProducts(mockDb, ['cat-fallback'], 6);

    expect(result['cat-fallback']).toHaveLength(6);
    expect(result['cat-fallback'].map((p) => p.id)).toEqual([
      'prod-1',
      'prod-2',
      'prod-3',
      'prod-4',
      'prod-5',
      'prod-6',
    ]);

    // Verify fallback query executed
    const fallbackCall = preparedStatements.find((call) =>
      call.query.includes('sub.category_id = p.category_id')
    );
    expect(fallbackCall).toBeDefined();
    expect(fallbackCall?.query).toContain('LIMIT ?');
    expect(fallbackCall?.query).toContain("sub.status = 'active' OR sub.status = 'published'");
    expect(fallbackCall?.bindings).toEqual(['cat-fallback', 6]);
  });

  it('7. getHomepageProducts batches categories and binds limit [6] for window query', async () => {
    const productsCat1 = Array.from({ length: 8 }, (_, i) =>
      createMockProductRow(`prod-c1-${i + 1}`, 'cat-1', `Cat1 Prod ${i + 1}`)
    );
    const { mockDb, preparedStatements } = createMockD1Database({ 'cat-1': productsCat1 });

    const result = await getHomepageProducts(mockDb, ['cat-1'], { perCategoryLimit: 6, featuredLimit: 8 });

    expect(result.categoryProducts['cat-1']).toHaveLength(6);
    const windowCall = preparedStatements.find((call) => call.query.includes('RankedProducts'));
    expect(windowCall).toBeDefined();
    expect(windowCall?.query).toContain('row_num <= ?');
    expect(windowCall?.bindings).toContain(6);
  });
});
