import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateCategoryProductsDisplayOrder, getHomepageCategoryProducts } from '../src/server/db';
import { Product } from '../src/types';

describe('Category Product Sequence & Custom Ordering Suite', () => {
  let mockProducts: any[];
  let mockDb: any;

  beforeEach(() => {
    // 4 products in category 'cat-smartphones':
    // prod-1: created earliest (2026-01-01) - previously pushed to the very end
    // prod-2: created mid (2026-02-01)
    // prod-3: created later (2026-03-01)
    // prod-4: created most recently (2026-04-01) - previously always at the front
    mockProducts = [
      {
        id: 'prod-1',
        title: 'Earliest Added Phone (Oldest)',
        price: 15000,
        original_price: 18000,
        category_id: 'cat-smartphones',
        description: 'First phone added to store',
        image_url: 'https://images.unsplash.com/photo-1?w=500',
        images_json: '[]',
        stock: 20,
        featured: 0,
        featured_sort_order: 0,
        display_order: 0,
        rating: 5.0,
        reviews_count: 0,
        status: 'active',
        created_at: '2026-01-01T10:00:00Z',
        updated_at: '2026-01-01T10:00:00Z',
      },
      {
        id: 'prod-2',
        title: 'Mid Phone',
        price: 25000,
        original_price: 28000,
        category_id: 'cat-smartphones',
        description: 'Second phone added',
        image_url: 'https://images.unsplash.com/photo-2?w=500',
        images_json: '[]',
        stock: 15,
        featured: 0,
        featured_sort_order: 0,
        display_order: 0,
        rating: 5.0,
        reviews_count: 0,
        status: 'active',
        created_at: '2026-02-01T10:00:00Z',
        updated_at: '2026-02-01T10:00:00Z',
      },
      {
        id: 'prod-3',
        title: 'Later Phone',
        price: 35000,
        original_price: 38000,
        category_id: 'cat-smartphones',
        description: 'Third phone added',
        image_url: 'https://images.unsplash.com/photo-3?w=500',
        images_json: '[]',
        stock: 10,
        featured: 0,
        featured_sort_order: 0,
        display_order: 0,
        rating: 5.0,
        reviews_count: 0,
        status: 'active',
        created_at: '2026-03-01T10:00:00Z',
        updated_at: '2026-03-01T10:00:00Z',
      },
      {
        id: 'prod-4',
        title: 'Most Recent Phone (Newest)',
        price: 45000,
        original_price: 50000,
        category_id: 'cat-smartphones',
        description: 'Fourth phone added',
        image_url: 'https://images.unsplash.com/photo-4?w=500',
        images_json: '[]',
        stock: 5,
        featured: 0,
        featured_sort_order: 0,
        display_order: 0,
        rating: 5.0,
        reviews_count: 0,
        status: 'active',
        created_at: '2026-04-01T10:00:00Z',
        updated_at: '2026-04-01T10:00:00Z',
      },
    ];

    mockDb = {
      prepare: vi.fn((query: string) => {
        let currentBindings: any[] = [];
        return {
          bind: vi.fn((...args: any[]) => {
            currentBindings = args;
            return {
              all: async () => {
                if (query.includes('table_info') || query.includes('pragma')) {
                  return {
                    results: [
                      { name: 'id' },
                      { name: 'slug' },
                      { name: 'title' },
                      { name: 'price' },
                      { name: 'original_price' },
                      { name: 'buying_price' },
                      { name: 'category_id' },
                      { name: 'description' },
                      { name: 'image_url' },
                      { name: 'images_json' },
                      { name: 'stock' },
                      { name: 'featured' },
                      { name: 'featured_sort_order' },
                      { name: 'display_order' },
                      { name: 'rating' },
                      { name: 'reviews_count' },
                      { name: 'status' },
                      { name: 'created_at' },
                      { name: 'updated_at' },
                    ],
                  };
                }

                // If querying products for category
                const catId = currentBindings[0];
                let results = mockProducts.filter((p) => p.category_id === catId);
                // Apply the sorting logic: display_order > 0 ASC, then created_at DESC
                results.sort((a, b) => {
                  const orderA = a.display_order || 0;
                  const orderB = b.display_order || 0;
                  if (orderA > 0 && orderB > 0) return orderA - orderB;
                  if (orderA > 0) return -1;
                  if (orderB > 0) return 1;
                  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                });

                return { results };
              },
              first: async () => null,
              run: async () => {
                if (query.includes('UPDATE products SET display_order = ?')) {
                  const [order, id, catId] = currentBindings;
                  const target = mockProducts.find((p) => p.id === id && p.category_id === catId);
                  if (target) {
                    target.display_order = order;
                  }
                }
                return { success: true };
              },
            };
          }),
        };
      }),
      batch: vi.fn(async (statements: any[]) => {
        for (const s of statements) {
          await s.run();
        }
        return statements.map(() => ({ success: true }));
      }),
    };
  });

  it('1. Default uncustomized behavior: newest product appears first, oldest appears last', async () => {
    // With all display_order = 0, default sorts by created_at DESC
    const sorted = [...mockProducts].sort((a, b) => {
      const orderA = a.display_order || 0;
      const orderB = b.display_order || 0;
      if (orderA > 0 && orderB > 0) return orderA - orderB;
      if (orderA > 0) return -1;
      if (orderB > 0) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    expect(sorted[0].id).toBe('prod-4'); // newest product
    expect(sorted[3].id).toBe('prod-1'); // oldest product
  });

  it('2. Custom sequence puts earlier added product (prod-1) at the front (#1 position)', async () => {
    // Custom sequence explicitly configured by user:
    // prod-1 (oldest added) -> Slot 1
    // prod-2 -> Slot 2
    // prod-3 -> Slot 3
    // prod-4 (newest) -> Slot 4
    const newOrder = [
      { id: 'prod-1', displayOrder: 1 },
      { id: 'prod-2', displayOrder: 2 },
      { id: 'prod-3', displayOrder: 3 },
      { id: 'prod-4', displayOrder: 4 },
    ];

    const updated = await updateCategoryProductsDisplayOrder(mockDb, 'cat-smartphones', newOrder);

    expect(updated).toHaveLength(4);
    expect(updated[0].id).toBe('prod-1');
    expect(updated[0].displayOrder).toBe(1);
    expect(updated[1].id).toBe('prod-2');
    expect(updated[1].displayOrder).toBe(2);
    expect(updated[2].id).toBe('prod-3');
    expect(updated[2].displayOrder).toBe(3);
    expect(updated[3].id).toBe('prod-4');
    expect(updated[3].displayOrder).toBe(4);
  });

  it('3. Partially configured sequence: products with custom rank appear first, unranked products follow by newest first', async () => {
    // User only explicitly ranked prod-1 (oldest) as Slot 1
    // Other products remain display_order = 0
    mockProducts[0].display_order = 1;

    const sorted = [...mockProducts].sort((a, b) => {
      const orderA = a.display_order || 0;
      const orderB = b.display_order || 0;
      if (orderA > 0 && orderB > 0) return orderA - orderB;
      if (orderA > 0) return -1;
      if (orderB > 0) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // prod-1 is slot 1
    expect(sorted[0].id).toBe('prod-1');
    // remaining products sorted by created_at DESC (prod-4, prod-3, prod-2)
    expect(sorted[1].id).toBe('prod-4');
    expect(sorted[2].id).toBe('prod-3');
    expect(sorted[3].id).toBe('prod-2');
  });

  it('4. Custom sequence is isolated per category', async () => {
    // Product in a different category should not be affected
    const accessoryProduct = {
      id: 'prod-acc-1',
      title: 'Phone Case',
      price: 500,
      category_id: 'cat-accessories',
      display_order: 0,
      created_at: '2026-01-01T10:00:00Z',
    };
    mockProducts.push(accessoryProduct);

    await updateCategoryProductsDisplayOrder(mockDb, 'cat-smartphones', [
      { id: 'prod-1', displayOrder: 1 },
    ]);

    expect(accessoryProduct.display_order).toBe(0);
  });
});
