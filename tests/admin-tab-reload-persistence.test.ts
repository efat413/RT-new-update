import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Admin Panel Tab Reload & Direct Section Loading', () => {
  it('1. Verifies index.html specifies <base href="/" /> for correct nested URL asset resolution', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
    expect(indexHtml).toContain('<base href="/" />');
  });

  it('2. Verifies vite.config.ts configures base: "/"', () => {
    const viteConfig = fs.readFileSync(path.resolve(__dirname, '../vite.config.ts'), 'utf-8');
    expect(viteConfig).toContain("base: '/',");
  });

  it('3. Verifies VALID_ADMIN_TABS in AdminProvider contains all 12 modules including broadcaster and reviews', () => {
    const adminProviderSource = fs.readFileSync(
      path.resolve(__dirname, '../src/context/AdminProvider.tsx'),
      'utf-8'
    );
    const requiredModules = [
      'overview',
      'profit',
      'orders',
      'products',
      'categories',
      'slides',
      'couriers',
      'settings',
      'users',
      'pixels',
      'broadcaster',
      'vouchers',
      'debug',
      'reviews',
    ];

    for (const mod of requiredModules) {
      expect(adminProviderSource).toContain(`'${mod}'`);
    }
  });

  it('4. Verifies App.tsx renders AdminLoadingFallback while isAuthInitializing is true on admin routes', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf-8');
    expect(appSource).toContain('if (isAuthInitializing) {\n      return <AdminLoadingFallback />;\n    }');
    expect(appSource).toContain('if (!isAuthInitializing && !isAdminLoggedIn) {\n      return null;\n    }');
  });

  it('5. Verifies resilient lazy-loading retry logic eliminates premature "Admin Panel Unavailable" error boundaries', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf-8');
    expect(appSource).toContain('lazyWithRetry');
    expect(appSource).toContain('const AdminPanel = lazyWithRetry(');
  });
});
