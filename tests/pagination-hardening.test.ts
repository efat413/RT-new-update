import { describe, it, expect, vi } from 'vitest';
import {
  parseSafePagination,
  getCategoryProductsPaginated,
  getPaginatedProducts,
} from '../src/server/db';
import { D1Database } from '../src/server/types';

describe('Pagination Input Sanitization & Boundary Guards (parseSafePagination)', () => {
  describe('1. Sanitizer Function Unit Tests', () => {
    // Valid baseline tests
    it('baseline: page=1, limit=12 produces { page: 1, limit: 12, offset: 0 }', () => {
      const res = parseSafePagination(1, 12);
      expect(res).toEqual({
        page: 1,
        limit: 12,
        offset: 0,
      });
      expect(Number.isSafeInteger(res.offset)).toBe(true);
    });

    it('baseline: page=2, limit=12 produces { page: 2, limit: 12, offset: 12 }', () => {
      const res = parseSafePagination(2, 12);
      expect(res).toEqual({
        page: 2,
        limit: 12,
        offset: 12,
      });
      expect(Number.isSafeInteger(res.offset)).toBe(true);
    });

    it('baseline: string representation page="2", limit="12"', () => {
      const res = parseSafePagination('2', '12');
      expect(res).toEqual({
        page: 2,
        limit: 12,
        offset: 12,
      });
    });

    // Boundary tests: page=0, page=-5, page=NaN, page="abc"
    it('boundary: page=0 normalizes to page=1 with offset=0', () => {
      const res = parseSafePagination(0, 12);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(12);
      expect(res.offset).toBe(0);
    });

    it('boundary: page=-5 normalizes to page=1 with offset=0', () => {
      const res = parseSafePagination(-5, 12);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(12);
      expect(res.offset).toBe(0);
    });

    it('boundary: page=NaN normalizes to page=1 with offset=0', () => {
      const res = parseSafePagination(NaN, 12);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(12);
      expect(res.offset).toBe(0);
    });

    it('boundary: page="abc" normalizes to page=1 with offset=0', () => {
      const res = parseSafePagination('abc', 12);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(12);
      expect(res.offset).toBe(0);
    });

    it('boundary: undefined / null inputs normalize to defaults', () => {
      const res = parseSafePagination(undefined, undefined);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(12);
      expect(res.offset).toBe(0);
    });

    // Overflow tests: page="999999999999999999999999", limit="1e10"
    it('overflow: page="999999999999999999999999" rejects unsafe integer and normalizes to page=1, offset=0', () => {
      const res = parseSafePagination('999999999999999999999999', 12);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(12);
      expect(res.offset).toBe(0);
      expect(Number.isSafeInteger(res.offset)).toBe(true);
    });

    it('overflow: limit="1e10" is clamped strictly to maxLimit=50', () => {
      const res = parseSafePagination(1, '1e10');
      expect(res.page).toBe(1);
      expect(res.limit).toBe(50);
      expect(res.offset).toBe(0);
    });

    it('overflow: page=2, limit="1e10" clamps limit to 50 and computes offset=50', () => {
      const res = parseSafePagination(2, '1e10');
      expect(res.page).toBe(2);
      expect(res.limit).toBe(50);
      expect(res.offset).toBe(50);
    });

    it('float and non-safe integer precision guards', () => {
      const res = parseSafePagination(2.8, 14.9);
      expect(res.page).toBe(2);
      expect(res.limit).toBe(14);
      expect(res.offset).toBe(14);
    });

    it('offset never overflows Number.MAX_SAFE_INTEGER', () => {
      const res = parseSafePagination(Number.MAX_SAFE_INTEGER, 50);
      expect(Number.isSafeInteger(res.offset)).toBe(true);
      expect(res.offset).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
      expect(res.offset).toBeGreaterThanOrEqual(0);
    });
  });

  describe('2. Integration with getCategoryProductsPaginated', () => {
    function createMockDb(executedQueries: Array<{ query: string; bindings: any[] }>): D1Database {
      return {
        prepare: vi.fn().mockImplementation((query: string) => ({
          bind: vi.fn().mockImplementation((...bindings: any[]) => {
            executedQueries.push({ query, bindings });
            return {
              all: vi.fn().mockResolvedValue({
                success: true,
                results: [],
              }),
              first: vi.fn().mockResolvedValue({ total: 100 }),
              run: vi.fn().mockResolvedValue({ success: true }),
            };
          }),
          all: vi.fn().mockResolvedValue({
            success: true,
            results: [{ name: 'id' }, { name: 'display_order' }, { name: 'created_at' }, { name: 'status' }, { name: 'category_id' }],
          }),
          first: vi.fn().mockResolvedValue({ total: 100 }),
          run: vi.fn().mockResolvedValue({ success: true }),
        })),
        batch: vi.fn().mockImplementation(async (stmts: any[]) => {
          const results = [];
          for (const s of stmts) {
            results.push(await s.all());
          }
          return results;
        }),
        exec: vi.fn().mockResolvedValue({ success: true }),
      };
    }

    it('verifies baseline bindings: page=1, limit=12 binds [12, 0]', async () => {
      const executedQueries: Array<{ query: string; bindings: any[] }> = [];
      const mockDb = createMockDb(executedQueries);

      const res = await getCategoryProductsPaginated(mockDb, {
        categoryId: 'cat-test',
        page: 1,
        limit: 12,
      });

      expect(res.page).toBe(1);
      expect(res.limit).toBe(12);

      const dataQuery = executedQueries.find((q) => q.query.includes('LIMIT ? OFFSET ?'));
      expect(dataQuery).toBeDefined();
      expect(dataQuery?.bindings.slice(-2)).toEqual([12, 0]);
    });

    it('verifies baseline bindings: page=2, limit=12 binds [12, 12]', async () => {
      const executedQueries: Array<{ query: string; bindings: any[] }> = [];
      const mockDb = createMockDb(executedQueries);

      const res = await getCategoryProductsPaginated(mockDb, {
        categoryId: 'cat-test',
        page: 2,
        limit: 12,
      });

      expect(res.page).toBe(2);
      expect(res.limit).toBe(12);

      const dataQuery = executedQueries.find((q) => q.query.includes('LIMIT ? OFFSET ?'));
      expect(dataQuery).toBeDefined();
      expect(dataQuery?.bindings.slice(-2)).toEqual([12, 12]);
    });

    it('verifies boundary inputs: page=0 binds [12, 0]', async () => {
      const executedQueries: Array<{ query: string; bindings: any[] }> = [];
      const mockDb = createMockDb(executedQueries);

      const res = await getCategoryProductsPaginated(mockDb, {
        categoryId: 'cat-test',
        page: 0,
        limit: 12,
      });

      expect(res.page).toBe(1);
      const dataQuery = executedQueries.find((q) => q.query.includes('LIMIT ? OFFSET ?'));
      expect(dataQuery?.bindings.slice(-2)).toEqual([12, 0]);
    });

    it('verifies boundary inputs: page=-5 binds [12, 0]', async () => {
      const executedQueries: Array<{ query: string; bindings: any[] }> = [];
      const mockDb = createMockDb(executedQueries);

      const res = await getCategoryProductsPaginated(mockDb, {
        categoryId: 'cat-test',
        page: -5,
        limit: 12,
      });

      expect(res.page).toBe(1);
      const dataQuery = executedQueries.find((q) => q.query.includes('LIMIT ? OFFSET ?'));
      expect(dataQuery?.bindings.slice(-2)).toEqual([12, 0]);
    });

    it('verifies boundary inputs: page=NaN binds [12, 0]', async () => {
      const executedQueries: Array<{ query: string; bindings: any[] }> = [];
      const mockDb = createMockDb(executedQueries);

      const res = await getCategoryProductsPaginated(mockDb, {
        categoryId: 'cat-test',
        page: NaN,
        limit: 12,
      });

      expect(res.page).toBe(1);
      const dataQuery = executedQueries.find((q) => q.query.includes('LIMIT ? OFFSET ?'));
      expect(dataQuery?.bindings.slice(-2)).toEqual([12, 0]);
    });

    it('verifies boundary inputs: page="abc" binds [12, 0]', async () => {
      const executedQueries: Array<{ query: string; bindings: any[] }> = [];
      const mockDb = createMockDb(executedQueries);

      const res = await getCategoryProductsPaginated(mockDb, {
        categoryId: 'cat-test',
        page: 'abc',
        limit: 12,
      });

      expect(res.page).toBe(1);
      const dataQuery = executedQueries.find((q) => q.query.includes('LIMIT ? OFFSET ?'));
      expect(dataQuery?.bindings.slice(-2)).toEqual([12, 0]);
    });

    it('verifies overflow inputs: page="999999999999999999999999" normalizes to page=1, offset=0', async () => {
      const executedQueries: Array<{ query: string; bindings: any[] }> = [];
      const mockDb = createMockDb(executedQueries);

      const res = await getCategoryProductsPaginated(mockDb, {
        categoryId: 'cat-test',
        page: '999999999999999999999999',
        limit: 12,
      });

      expect(res.page).toBe(1);
      const dataQuery = executedQueries.find((q) => q.query.includes('LIMIT ? OFFSET ?'));
      expect(dataQuery?.bindings.slice(-2)).toEqual([12, 0]);
    });

    it('verifies overflow inputs: limit="1e10" clamps to limit=50', async () => {
      const executedQueries: Array<{ query: string; bindings: any[] }> = [];
      const mockDb = createMockDb(executedQueries);

      const res = await getCategoryProductsPaginated(mockDb, {
        categoryId: 'cat-test',
        page: 1,
        limit: '1e10',
      });

      expect(res.limit).toBe(50);
      const dataQuery = executedQueries.find((q) => q.query.includes('LIMIT ? OFFSET ?'));
      expect(dataQuery?.bindings.slice(-2)).toEqual([50, 0]);
    });
  });

  describe('3. Integration with getPaginatedProducts', () => {
    it('verifies parameterized LIMIT ? OFFSET ? binding with sanitized values', async () => {
      const executedQueries: Array<{ query: string; bindings: any[] }> = [];
      const mockDb: D1Database = {
        prepare: vi.fn().mockImplementation((query: string) => ({
          bind: vi.fn().mockImplementation((...bindings: any[]) => {
            executedQueries.push({ query, bindings });
            return {
              all: vi.fn().mockResolvedValue({
                success: true,
                results: [],
              }),
              first: vi.fn().mockResolvedValue({ total: 50 }),
              run: vi.fn().mockResolvedValue({ success: true }),
            };
          }),
          all: vi.fn().mockResolvedValue({
            success: true,
            results: [{ name: 'id' }, { name: 'status' }, { name: 'price' }],
          }),
          first: vi.fn().mockResolvedValue({ total: 50 }),
          run: vi.fn().mockResolvedValue({ success: true }),
        })),
        batch: vi.fn().mockImplementation(async (stmts: any[]) => {
          const results = [];
          for (const s of stmts) {
            results.push(await s.all());
          }
          return results;
        }),
        exec: vi.fn().mockResolvedValue({ success: true }),
      };

      const res = await getPaginatedProducts(mockDb, {
        page: '2' as any,
        limit: '1e10' as any,
      });

      expect(res.page).toBe(2);
      expect(res.limit).toBe(50);

      const dataQuery = executedQueries.find((q) => q.query.includes('LIMIT ? OFFSET ?'));
      expect(dataQuery).toBeDefined();
      expect(dataQuery?.bindings.slice(-2)).toEqual([50, 50]);
    });
  });
});
