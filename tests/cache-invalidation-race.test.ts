import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  storeHomepageApi,
  productsApi,
  categoriesApi,
  slidersApi,
  settingsApi,
  invalidateStoreCaches,
  getCacheGeneration,
  HomepageData,
} from '../src/services/storeApi';

describe('In-Flight Cache Race Conditions & Generation Version Guard in storeApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateStoreCaches();
  });

  it('1. Increments cacheGeneration and clears caches on successful mutations', async () => {
    const initialGen = getCacheGeneration();

    // Mock fetch for successful category creation
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        category: { id: 'cat-new', name: 'New Category', slug: 'new-cat' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const createdCat = await categoriesApi.create({ name: 'New Category' });
    expect(createdCat.id).toBe('cat-new');

    const nextGen = getCacheGeneration();
    expect(nextGen).toBe(initialGen + 1);

    // Mock fetch for successful product creation
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        product: { id: 'prod-new', title: 'New Product', price: 500 },
      }),
    });

    const createdProd = await productsApi.create({ title: 'New Product' });
    expect(createdProd.id).toBe('prod-new');
    expect(getCacheGeneration()).toBe(nextGen + 1);
  });

  it('2. Does NOT increment cacheGeneration or clear cache on failed / rejected mutations (No-Op)', async () => {
    // Populate cache first
    const mockHp: HomepageData = {
      settings: { siteName: 'Rongdhonu Trade' } as any,
      categories: [{ id: 'cat-1', name: 'Electronics' }] as any,
      slides: [],
      categoryProducts: {},
      products: [],
    };

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        ...mockHp,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const hpRes = await storeHomepageApi.getHomepage();
    expect(hpRes.success).toBe(true);
    expect(storeHomepageApi.getCached()).not.toBeNull();

    const genBeforeFailedMutation = getCacheGeneration();

    // Mock a 500 error on product update
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        error: 'Database error',
      }),
    });

    await expect(productsApi.update('prod-1', { title: 'Failing Update' })).rejects.toThrow();

    // Generation must NOT be incremented on failed mutation
    expect(getCacheGeneration()).toBe(genBeforeFailedMutation);
    // Cache must remain intact
    expect(storeHomepageApi.getCached()).not.toBeNull();
  });

  it('3. Discards slow in-flight GET responses if a mutation succeeds before fetch completes (Race Prevention)', async () => {
    let resolveStaleHomepage: (value: any) => void;
    const staleHomepagePromise = new Promise((resolve) => {
      resolveStaleHomepage = resolve;
    });

    const staleHpPayload: HomepageData = {
      settings: { siteName: 'Old Stale Store' } as any,
      categories: [{ id: 'cat-old', name: 'Old Stale Cat' }] as any,
      slides: [],
      categoryProducts: {},
      products: [{ id: 'p-old', title: 'Stale Product' }] as any,
    };

    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      // 1. In-flight GET /api/store/homepage
      if (url.includes('/api/store/homepage')) {
        return staleHomepagePromise;
      }
      // 2. Product mutation
      if (options?.method === 'PUT' && url.includes('/api/products/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            product: { id: 'p-1', title: 'Fresh Updated Title' },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const initialGen = getCacheGeneration();

    // Start slow in-flight homepage fetch (captures requestGen = initialGen)
    const inFlightGetPromise = storeHomepageApi.getHomepage();

    // While GET is still in flight, an admin performs a product mutation
    const updateResult = await productsApi.update('p-1', { title: 'Fresh Updated Title' });
    expect(updateResult.title).toBe('Fresh Updated Title');

    // Mutation succeeded: generation incremented, cache invalidated
    expect(getCacheGeneration()).toBe(initialGen + 1);
    expect(storeHomepageApi.getCached()).toBeNull();

    // Now slow in-flight GET response finally resolves
    resolveStaleHomepage!({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        ...staleHpPayload,
      }),
    });

    const getResult = await inFlightGetPromise;
    expect(getResult.success).toBe(true);

    // CRITICAL ASSERTION:
    // Stale payload must NOT repopulate the in-memory cache because requestGen !== cacheGeneration
    expect(storeHomepageApi.getCached()).toBeNull();
  });

  it('4. Successfully repopulates cache when in-flight request generation matches current generation', async () => {
    const mockHpPayload: HomepageData = {
      settings: { siteName: 'Current Store' } as any,
      categories: [{ id: 'cat-1', name: 'Electronics' }] as any,
      slides: [],
      categoryProducts: {},
      products: [],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        ...mockHpPayload,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await storeHomepageApi.getHomepage();
    expect(res.success).toBe(true);

    // No mutation happened while in flight -> cache must be populated
    const cached = storeHomepageApi.getCached();
    expect(cached).not.toBeNull();
    expect(cached?.settings.siteName).toBe('Current Store');
  });
});
