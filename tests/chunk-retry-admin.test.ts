import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { isChunkLoadError, lazyWithRetry } from '../src/utils/lazyWithRetry';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

describe('Admin Panel Chunk Loading & Recovery Architecture', () => {
  let mockSessionStorage: Record<string, string> = {};
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSessionStorage = {};
    reloadMock = vi.fn();

    const mockStorage = {
      getItem: vi.fn((key: string) => mockSessionStorage[key] || null),
      setItem: vi.fn((key: string, val: string) => {
        mockSessionStorage[key] = String(val);
      }),
      removeItem: vi.fn((key: string) => {
        delete mockSessionStorage[key];
      }),
      clear: vi.fn(() => {
        mockSessionStorage = {};
      }),
      get length() {
        return Object.keys(mockSessionStorage).length;
      },
      key: vi.fn((idx: number) => Object.keys(mockSessionStorage)[idx] || null),
    };

    const mockWindow = {
      sessionStorage: mockStorage,
      location: {
        reload: reloadMock,
        pathname: '/admin',
        href: 'http://localhost:3000/admin',
      },
    };

    vi.stubGlobal('sessionStorage', mockStorage);
    vi.stubGlobal('window', mockWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('isChunkLoadError cross-browser classification', () => {
    it('correctly classifies Chrome/Vite chunk load failures', () => {
      const err = new TypeError('Failed to fetch dynamically imported module: http://localhost:3000/assets/AdminPanel-a1b2c3.js');
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('correctly classifies Firefox lowercase chunk load errors', () => {
      const err = new Error('error loading dynamically imported module: https://rongdhonutrade.com/assets/AdminPanel-x9y8z7.js');
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('correctly classifies Safari/WebKit script import failures', () => {
      const err = new TypeError('Importing a module script failed.');
      expect(isChunkLoadError(err)).toBe(true);
      const err2 = new TypeError('Load failed');
      expect(isChunkLoadError(err2)).toBe(true);
    });

    it('correctly classifies Webpack/Rollup style chunk errors', () => {
      const err = new Error('Loading chunk 14 failed.');
      (err as any).name = 'ChunkLoadError';
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('correctly classifies CSS chunk failures', () => {
      const err = new Error('Loading CSS chunk AdminPanel failed.');
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('rejects regular application runtime errors', () => {
      expect(isChunkLoadError(new TypeError("Cannot read properties of null (reading 'map')"))).toBe(false);
      expect(isChunkLoadError(new Error('Network request failed: 500 Internal Server Error'))).toBe(false);
      expect(isChunkLoadError(new Error('Validation error: Invalid price'))).toBe(false);
      expect(isChunkLoadError(null)).toBe(false);
      expect(isChunkLoadError(undefined)).toBe(false);
    });
  });

  describe('lazyWithRetry dynamic loader behavior', () => {
    it('clears sessionStorage retry keys on successful module resolution', async () => {
      // Simulate previously set retry flag
      mockSessionStorage['chunk_retry_admin'] = 'true';
      mockSessionStorage['chunk_retry_adminpanel'] = JSON.stringify({ count: 1, timestamp: Date.now() });

      const DummyComponent: React.FC = () => null;
      const factory = vi.fn().mockResolvedValue({ AdminPanel: DummyComponent, default: DummyComponent });

      const LazyComp = lazyWithRetry(factory, 'AdminPanel');

      // Execute factory by reading _payload._result (standard React.lazy contract)
      const payload = (LazyComp as any)._payload;
      const loadFn = payload?._result || (LazyComp as any)._init;
      
      let loadedModule: any;
      if (typeof loadFn === 'function') {
        loadedModule = await loadFn(payload);
      } else {
        // Direct factory call if React internal signature differs
        loadedModule = await factory();
      }

      expect(factory).toHaveBeenCalledTimes(1);
      // Verify legacy and component keys are cleaned up
      expect(mockSessionStorage['chunk_retry_admin']).toBeUndefined();
      expect(mockSessionStorage['chunk_retry_adminpanel']).toBeUndefined();
    });

    it('initiates bounded reload on first chunk failure and records attempt count', async () => {
      const chunkErr = new TypeError('Failed to fetch dynamically imported module: /assets/AdminPanel-old.js');
      const factory = vi.fn().mockRejectedValue(chunkErr);

      const LazyComp = lazyWithRetry(factory, 'AdminPanel', { maxRetries: 2 });
      const payload = (LazyComp as any)._payload;
      const loadFn = payload?._result || (LazyComp as any)._init;

      if (typeof loadFn === 'function') {
        // Trigger load
        loadFn(payload);
      }

      // Allow async catch block to execute
      await new Promise((r) => setTimeout(r, 10));

      expect(reloadMock).toHaveBeenCalledTimes(1);
      const saved = JSON.parse(mockSessionStorage['chunk_retry_adminpanel'] || '{}');
      expect(saved.count).toBe(1);
      expect(typeof saved.timestamp).toBe('number');
    });

    it('stops reloading and throws safely after reaching maxRetries (prevents infinite loops)', async () => {
      // Seed sessionStorage with max attempts already reached
      mockSessionStorage['chunk_retry_adminpanel'] = JSON.stringify({
        count: 2,
        timestamp: Date.now(),
      });

      const chunkErr = new TypeError('Failed to fetch dynamically imported module: /assets/AdminPanel-old.js');
      const factory = vi.fn().mockRejectedValue(chunkErr);

      const LazyComp = lazyWithRetry(factory, 'AdminPanel', { maxRetries: 2 });
      const payload = (LazyComp as any)._payload;
      const loadFn = payload?._result || (LazyComp as any)._init;

      let caughtError: any = null;
      if (typeof loadFn === 'function') {
        try {
          await loadFn(payload);
        } catch (e) {
          caughtError = e;
        }
      }

      // Did NOT reload again
      expect(reloadMock).not.toHaveBeenCalled();
      // Error was safely passed through to be caught by ErrorBoundary
      expect(caughtError).toBe(chunkErr);
    });

    it('allows fresh recovery on subsequent failures after a previous load succeeded', async () => {
      // 1. First failure -> triggers reload 1
      const chunkErr = new TypeError('Failed to fetch dynamically imported module: /assets/AdminPanel-old.js');
      let factory = vi.fn().mockRejectedValue(chunkErr);

      let LazyComp = lazyWithRetry(factory, 'AdminPanel');
      let loadFn = (LazyComp as any)._payload?._result || (LazyComp as any)._init;
      if (typeof loadFn === 'function') {
        loadFn((LazyComp as any)._payload);
      }
      await new Promise((r) => setTimeout(r, 10));
      expect(reloadMock).toHaveBeenCalledTimes(1);

      // 2. Next load succeeds -> clears storage
      const DummyComponent: React.FC = () => null;
      factory = vi.fn().mockResolvedValue({ default: DummyComponent });
      LazyComp = lazyWithRetry(factory, 'AdminPanel');
      loadFn = (LazyComp as any)._payload?._result || (LazyComp as any)._init;
      if (typeof loadFn === 'function') {
        await loadFn((LazyComp as any)._payload);
      }
      expect(mockSessionStorage['chunk_retry_adminpanel']).toBeUndefined();

      // 3. Much later, another deployment causes a new chunk failure -> CAN reload again!
      reloadMock.mockClear();
      factory = vi.fn().mockRejectedValue(new TypeError('Failed to fetch dynamically imported module: /assets/AdminPanel-new.js'));
      LazyComp = lazyWithRetry(factory, 'AdminPanel');
      loadFn = (LazyComp as any)._payload?._result || (LazyComp as any)._init;
      if (typeof loadFn === 'function') {
        loadFn((LazyComp as any)._payload);
      }
      await new Promise((r) => setTimeout(r, 10));
      // Proves recovery is NOT blocked by a permanently stuck flag!
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('throws non-chunk errors immediately without triggering page reload', async () => {
      const runtimeErr = new ReferenceError('someVariable is not defined');
      const factory = vi.fn().mockRejectedValue(runtimeErr);

      const LazyComp = lazyWithRetry(factory, 'AdminPanel');
      const loadFn = (LazyComp as any)._payload?._result || (LazyComp as any)._init;

      let caughtError: any = null;
      if (typeof loadFn === 'function') {
        try {
          await loadFn((LazyComp as any)._payload);
        } catch (e) {
          caughtError = e;
        }
      }

      expect(reloadMock).not.toHaveBeenCalled();
      expect(caughtError).toBe(runtimeErr);
    });
  });

  describe('ErrorBoundary chunk error diagnostics and retry handling', () => {
    it('cleans up sessionStorage chunk retry keys when user clicks retry on chunk error', () => {
      mockSessionStorage['chunk_retry_admin'] = 'true';
      mockSessionStorage['chunk_retry_adminpanel'] = '{"count":2}';

      const boundary = new ErrorBoundary({ children: null });
      boundary.state = {
        hasError: true,
        error: new TypeError('Failed to fetch dynamically imported module: /assets/AdminPanel-old.js'),
      };

      boundary.handleRetry();

      expect(mockSessionStorage['chunk_retry_admin']).toBeUndefined();
      expect(mockSessionStorage['chunk_retry_adminpanel']).toBeUndefined();
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('resets state and triggers onReset callback for non-chunk errors', () => {
      const onResetMock = vi.fn();
      const boundary = new ErrorBoundary({ children: null, onReset: onResetMock });
      boundary.setState = vi.fn(function (partial: any) {
        boundary.state = {
          ...boundary.state,
          ...(typeof partial === 'function' ? partial(boundary.state) : partial),
        };
      });
      boundary.state = {
        hasError: true,
        error: new Error('Temporary state calculation error'),
      };

      boundary.handleRetry();

      expect(reloadMock).not.toHaveBeenCalled();
      expect(boundary.state.hasError).toBe(false);
      expect(boundary.state.error).toBeNull();
      expect(onResetMock).toHaveBeenCalledTimes(1);
    });

    it('redacts sensitive bearer tokens in console error diagnostics', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const boundary = new ErrorBoundary({ children: null });

      const leakyError = new Error('Auth failure with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret token');
      boundary.componentDidCatch(leakyError, { componentStack: 'in AdminPanel\n in App' });

      expect(consoleSpy).toHaveBeenCalled();
      const loggedCall = consoleSpy.mock.calls[0];
      const loggedMessage = loggedCall[1];
      expect(loggedMessage).toContain('Bearer [REDACTED]');
      expect(loggedMessage).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret');
    });
  });
});
