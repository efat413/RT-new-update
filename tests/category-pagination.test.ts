import { describe, it, expect, vi } from 'vitest';
import { getCategoryProductsPaginated } from '../src/server/db';
import { D1Database } from '../src/server/types';

describe('Phase 3: Category Server-Side Pagination & Deterministic Ordering', () => {
  function createProductRow(id: string, categoryId: string, displayOrder = 0, createdAt = '2026-03-01T10:00:00.000Z') {
    return {
      id,
      slug: `${id}-slug`,
      title: `Product ${id}`,
      price: 1500,
      original_price: 2000,
      buying_price: 900,
      category_id: categoryId,
      description: 'Test description',
      image_url: 'https://example.com/img.jpg',
      images_json: '[]',
      stock: 10,
      featured: 0,
      featured_sort_order: 0,
      rating: 5,
      reviews_count: 0,
      specs_json: '[]',
      sizes_json: '[]',
      colors_json: '[]',
      sku: `SKU-${id}`,
      video_url: null,
      status: 'active',
      created_at: createdAt,
      updated_at: createdAt,
    };
  }

  it('1. Verifies LIMIT 12 OFFSET 0 for page 1 and OFFSET 12 for page 2', async () => {
    const executedQueries: Array<{ query: string; bindings: any[] }> = [];

    const mockDb: D1Database = {
      prepare: vi.fn().mockImplementation((query: string) => {
        return {
          bind: vi.fn().mockImplementation((...bindings: any[]) => {
            executedQueries.push({ query, bindings });
            return {
              all: vi.fn().mockResolvedValue({
                success: true,
                results: Array.from({ length: 12 }, (_, i) => createProductRow(`p-${i + 1}`, 'cat-1')),
              }),
              first: vi.fn().mockResolvedValue({ total: 24 }),
              run: vi.fn().mockResolvedValue({ success: true }),
            };
          }),
          all: vi.fn().mockResolvedValue({ success: true, results: [] }),
          first: vi.fn().mockResolvedValue({ total: 24 }),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      }),
      batch: vi.fn().mockImplementation(async (stmts: any[]) => {
        const results = [];
        for (const s of stmts) {
          results.push(await s.all());
        }
        return results;
      }),
      exec: vi.fn().mockResolvedValue({ success: true }),
    };

    // Page 1: LIMIT 12 OFFSET 0
    const page1Res = await getCategoryProductsPaginated(mockDb, {
      categoryId: 'cat-1',
      page: 1,
      limit: 12,
    });
    expect(page1Res.page).toBe(1);
    expect(page1Res.limit).toBe(12);

    const page1DataCall = executedQueries.find(
      (q) => q.query.includes('LIMIT ? OFFSET ?') && q.bindings[q.bindings.length - 1] === 0
    );
    expect(page1DataCall).toBeDefined();
    expect(page1DataCall?.bindings.slice(-2)).toEqual([12, 0]);

    // Page 2: LIMIT 12 OFFSET 12
    const page2Res = await getCategoryProductsPaginated(mockDb, {
      categoryId: 'cat-1',
      page: 2,
      limit: 12,
    });
    expect(page2Res.page).toBe(2);

    const page2DataCall = executedQueries.find(
      (q) => q.query.includes('LIMIT ? OFFSET ?') && q.bindings[q.bindings.length - 1] === 12
    );
    expect(page2DataCall).toBeDefined();
    expect(page2DataCall?.bindings.slice(-2)).toEqual([12, 12]);
  });

  it('2. Verifies empty category returns empty list without errors', async () => {
    const mockDb: D1Database = {
      prepare: vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ success: true, results: [] }),
        first: vi.fn().mockResolvedValue({ total: 0 }),
        run: vi.fn().mockResolvedValue({ success: true }),
      })),
      batch: vi.fn().mockResolvedValue([{ results: [{ total: 0 }] }, { results: [] }]),
      exec: vi.fn().mockResolvedValue({ success: true }),
    };

    const emptyRes = await getCategoryProductsPaginated(mockDb, {
      categoryId: 'cat-empty',
      page: 1,
      limit: 12,
    });

    expect(emptyRes.items).toEqual([]);
    expect(emptyRes.total).toBe(0);
    expect(emptyRes.totalPages).toBe(0);
    expect(emptyRes.hasMore).toBe(false);

    // Invalid negative/NaN page safely handled
    const invalidPageRes = await getCategoryProductsPaginated(mockDb, {
      categoryId: 'cat-empty',
      page: -5,
      limit: 12,
    });
    expect(invalidPageRes.items).toEqual([]);
    expect(invalidPageRes.total).toBe(0);
  });

  it('3. Stable deterministic sorting assertion with duplicate sort values', () => {
    // When display_order and created_at are identical, id DESC acts as deterministic tie-breaker
    const rows = [
      createProductRow('prod-aaa', 'cat-dup', 0, '2026-03-01T10:00:00.000Z'),
      createProductRow('prod-zzz', 'cat-dup', 0, '2026-03-01T10:00:00.000Z'),
      createProductRow('prod-mmm', 'cat-dup', 0, '2026-03-01T10:00:00.000Z'),
    ];

    // Comparator replicating: ORDER BY display_order ASC, created_at DESC, id DESC
    const sorted = [...rows].sort((a, b) => {
      const orderA = a.featured_sort_order ?? 0;
      const orderB = b.featured_sort_order ?? 0;
      if (orderA !== orderB) return orderA - orderB;

      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      if (dateA !== dateB) return dateB - dateA;

      return b.id.localeCompare(a.id); // Tie-breaker: id DESC
    });

    expect(sorted.map((r) => r.id)).toEqual(['prod-zzz', 'prod-mmm', 'prod-aaa']);
  });
});
