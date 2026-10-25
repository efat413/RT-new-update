import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isExternalImageUrl } from '../src/server/imageSecurity';
import {
  insertProduct,
  updateProductInD1,
  insertSlider,
  updateSliderInD1,
  updateStoreSettingsInD1,
} from '../src/server/db';

describe('Device-Upload Only Image Security & URL Elimination', () => {
  let mockProducts: Map<string, any>;
  let mockSliders: Map<string, any>;
  let mockSettings: any;
  let mockDb: any;

  beforeEach(() => {
    mockProducts = new Map();
    mockSliders = new Map();
    mockSettings = {
      id: 1,
      site_name: 'Rongdhonu Trade',
      logo_url: '/api/media/logo-initial',
      favicon_url: '/api/media/favicon-initial',
      banner_url: '/api/media/banner-initial',
      dbbl_bank_json: JSON.stringify({
        accountName: 'Rongdhonu',
        accountNumber: '123',
        branchName: 'Dhaka',
        routingNumber: '090',
        qrCodeUrl: '/api/media/qr-initial',
      }),
    };

    const createStmt = (query: string, bindings: any[] = []) => ({
      bind: (...args: any[]) => createStmt(query, args),
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
              { name: 'video_url' },
              { name: 'rating' },
              { name: 'reviews_count' },
              { name: 'status' },
              { name: 'created_at' },
              { name: 'updated_at' },
              { name: 'order_index' },
              { name: 'active' },
            ],
          };
        }
        return { results: [] };
      },
      first: async () => {
        if (query.includes('FROM products WHERE id = ?')) {
          const id = bindings[0];
          return mockProducts.get(id) || null;
        }
        if (query.includes('FROM products WHERE slug = ?')) {
          return null; // unique slug
        }
        if (query.includes('FROM sliders WHERE id = ?')) {
          const id = bindings[0];
          return mockSliders.get(id) || null;
        }
        if (query.includes('FROM store_settings')) {
          return {
            id: 'default',
            settings_json: JSON.stringify({
              siteName: 'Rongdhonu Trade',
              logoUrl: '/api/media/logo-initial',
              faviconUrl: '/api/media/favicon-initial',
              bannerUrl: '/api/media/banner-initial',
              dbblBank: {
                accountName: 'Rongdhonu',
                accountNumber: '123',
                branchName: 'Dhaka',
                routingNumber: '090',
                qrCodeUrl: '/api/media/qr-initial',
              },
            }),
          };
        }
        return null;
      },
      run: async () => {
        if (query.includes('INSERT INTO products')) {
          const id = bindings[0];
          const row: any = {
            id,
            title: 'Test Watch',
            price: 1500,
            category_id: 'cat-1',
            description: 'Premium Watch',
            image_url: bindings.find((b) => typeof b === 'string' && (b.startsWith('/api/media/') || b.startsWith('data:'))) || '/api/media/watch-cover-uuid',
            images_json: JSON.stringify(['/api/media/watch-cover-uuid']),
            stock: 10,
            status: 'active',
            video_url: bindings.find((b) => typeof b === 'string' && b.includes('youtube.com')) || null,
          };
          mockProducts.set(id, row);
        }
        if (query.includes('INSERT INTO sliders')) {
          const id = bindings[0];
          const img = bindings.find((b) => typeof b === 'string' && (b.startsWith('/api/media/') || b.startsWith('data:'))) || '/api/media/banner-slide-uuid';
          const row = {
            id,
            image_url: img,
            title: bindings[1] || 'Uploaded Promo',
            order_index: 0,
            active: 1,
          };
          mockSliders.set(id, row);
        }
        return { success: true };
      },
    });

    mockDb = {
      prepare: vi.fn((query: string) => createStmt(query)),
      batch: vi.fn(async (statements: any[]) => {
        for (const s of statements) {
          await s.run();
        }
        return statements.map(() => ({ success: true }));
      }),
    };
  });

  describe('isExternalImageUrl utility', () => {
    it('detects external HTTP and HTTPS image URLs correctly', () => {
      expect(isExternalImageUrl('https://images.unsplash.com/photo-123')).toBe(true);
      expect(isExternalImageUrl('http://external-site.com/image.png')).toBe(true);
      expect(isExternalImageUrl('https://cdn.shopify.com/files/sample.jpg?v=1')).toBe(true);
      expect(isExternalImageUrl('https://i.pinimg.com/originals/logo.png')).toBe(true);
    });

    it('allows null, undefined, and empty values without false positives', () => {
      expect(isExternalImageUrl(null)).toBe(false);
      expect(isExternalImageUrl(undefined)).toBe(false);
      expect(isExternalImageUrl('')).toBe(false);
      expect(isExternalImageUrl('   ')).toBe(false);
    });

    it('allows valid data URLs produced by client device upload', () => {
      expect(isExternalImageUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=')).toBe(false);
      expect(isExternalImageUrl('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD')).toBe(false);
      expect(isExternalImageUrl('data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAE=')).toBe(false);
      expect(isExternalImageUrl('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3C/svg%3E')).toBe(false);
    });

    it('allows valid internal media paths and asset routes', () => {
      expect(isExternalImageUrl('/api/media/f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(false);
      expect(isExternalImageUrl('/api/reviews/images/rev-asset-123')).toBe(false);
      expect(isExternalImageUrl('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(false);
      expect(isExternalImageUrl('/screenshot.png')).toBe(false);
    });
  });

  describe('Product API & D1 Database Enforcement', () => {
    it('rejects external cover imageUrl when creating a product', async () => {
      await expect(
        insertProduct(mockDb, {
          name: 'Test Watch',
          price: 1500,
          categoryId: 'cat-1',
          description: 'Premium Watch',
          imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30',
        })
      ).rejects.toThrow(/External image URLs are not supported/);
    });

    it('rejects external gallery image URLs when creating a product', async () => {
      await expect(
        insertProduct(mockDb, {
          name: 'Test Watch',
          price: 1500,
          categoryId: 'cat-1',
          description: 'Premium Watch',
          imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=',
          images: [
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=',
            'https://external-cdn.com/gallery2.jpg',
          ],
        })
      ).rejects.toThrow(/External image URLs are not supported in product gallery/);
    });

    it('accepts valid device uploads and internal media references for new products', async () => {
      const prod = await insertProduct(mockDb, {
        name: 'Test Watch',
        price: 1500,
        categoryId: 'cat-1',
        description: 'Premium Watch',
        imageUrl: '/api/media/watch-cover-uuid',
        images: ['/api/media/watch-cover-uuid'],
      });
      expect(prod).toBeDefined();
      expect(prod.imageUrl).toBe('/api/media/watch-cover-uuid');
    });

    it('preserves and accepts YouTube video URLs without rejection', async () => {
      const prod = await insertProduct(mockDb, {
        name: 'Video Product',
        price: 2500,
        categoryId: 'cat-1',
        description: 'Product with YouTube showcase video',
        imageUrl: '/api/media/cover-video-product',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });
      expect(prod).toBeDefined();
      expect(prod.videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('rejects external image URLs on product updates', async () => {
      mockProducts.set('p-100', {
        id: 'p-100',
        title: 'Old Watch',
        price: 1000,
        image_url: '/api/media/old-image',
        category_id: 'cat-1',
        description: 'Desc',
        images_json: '[]',
      });

      await expect(
        updateProductInD1(mockDb, 'p-100', {
          imageUrl: 'https://images.unsplash.com/photo-new',
        })
      ).rejects.toThrow(/External image URLs are not supported/);
    });

    it('preserves existing product image if unmodified during update', async () => {
      mockProducts.set('p-100', {
        id: 'p-100',
        title: 'Old Watch',
        price: 1000,
        image_url: 'https://legacy-domain.com/historic-image.jpg',
        category_id: 'cat-1',
        description: 'Desc',
        images_json: '[]',
      });

      const updated = await updateProductInD1(mockDb, 'p-100', {
        title: 'Updated Watch Name',
        price: 1200,
        imageUrl: 'https://legacy-domain.com/historic-image.jpg',
      });
      expect(updated).toBeDefined();
    });
  });

  describe('Slider API & D1 Database Enforcement', () => {
    it('rejects external image URLs when creating a slider', async () => {
      await expect(
        insertSlider(mockDb, {
          title: 'Promo Banner',
          imageUrl: 'https://images.unsplash.com/photo-banner',
        })
      ).rejects.toThrow(/External image URLs are not supported for slides/);
    });

    it('accepts uploaded media and data URLs for sliders', async () => {
      const sl = await insertSlider(mockDb, {
        title: 'Uploaded Promo',
        imageUrl: '/api/media/banner-slide-uuid',
      });
      expect(sl).toBeDefined();
      expect(sl.imageUrl).toBe('/api/media/banner-slide-uuid');
    });

    it('rejects external image URLs when updating a slider', async () => {
      mockSliders.set('sl-1', {
        id: 'sl-1',
        title: 'Existing Slide',
        image_url: '/api/media/existing-slide',
      });

      await expect(
        updateSliderInD1(mockDb, 'sl-1', {
          imageUrl: 'https://cdn.example.com/slide.jpg',
        })
      ).rejects.toThrow(/External image URLs are not supported for slides/);
    });
  });

  describe('Store Settings API Enforcement', () => {
    it('rejects external image URLs for logo, favicon, banner, and bank QR code', async () => {
      await expect(
        updateStoreSettingsInD1(mockDb, {
          logoUrl: 'https://external.com/logo.png',
        })
      ).rejects.toThrow(/External image URLs are not supported for website logo/);

      await expect(
        updateStoreSettingsInD1(mockDb, {
          faviconUrl: 'https://external.com/favicon.ico',
        })
      ).rejects.toThrow(/External image URLs are not supported for website favicon/);

      await expect(
        updateStoreSettingsInD1(mockDb, {
          bannerUrl: 'https://external.com/banner.jpg',
        })
      ).rejects.toThrow(/External image URLs are not supported for promotional banner/);

      await expect(
        updateStoreSettingsInD1(mockDb, {
          dbblBank: {
            bankName: 'DBBL',
            accountHolderName: 'Rongdhonu',
            accountNumber: '123',
            branchName: 'Dhaka',
            routingNumber: '090',
            qrCodeUrl: 'https://external.com/qr.png',
            instructions: '',
          },
        })
      ).rejects.toThrow(/External image URLs are not supported for payment QR code/);
    });

    it('accepts internal uploaded media references for store settings', async () => {
      const updated = await updateStoreSettingsInD1(mockDb, {
        logoUrl: '/api/media/new-logo-uuid',
        faviconUrl: '/api/media/new-fav-uuid',
        bannerUrl: 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAE=',
        dbblBank: {
          bankName: 'DBBL',
          accountHolderName: 'Rongdhonu',
          accountNumber: '123',
          branchName: 'Dhaka',
          routingNumber: '090',
          qrCodeUrl: '/api/media/new-qr-uuid',
          instructions: '',
        },
      });
      expect(updated).toBeDefined();
    });
  });
});
