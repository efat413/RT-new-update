import React, { ComponentType, LazyExoticComponent } from 'react';

export interface LazyWithRetryOptions {
  /** Maximum number of auto-reload attempts for chunk failures before giving up (default: 2) */
  maxRetries?: number;
  /** Storage key to track reload attempts in sessionStorage (default: 'chunk_retry_' + componentName) */
  storageKey?: string;
  /** Time window in milliseconds for retry counts to stay active (default: 15000 ms) */
  windowMs?: number;
}

/**
 * Checks whether an error represents a JavaScript chunk or dynamic import failure.
 * Covers Chrome, Firefox, Safari/WebKit, Edge, Vite, and Cloudflare asset 404s.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg = (typeof error === 'string' ? error : (error as any)?.message || String(error)).toLowerCase();
  const name = String((error as any)?.name || '').toLowerCase();

  return (
    name === 'chunkloaderror' ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('unable to load script') ||
    msg.includes('error resolving module specifier') ||
    (msg.includes('load failed') && !msg.includes('network request failed'))
  );
}

/**
 * Creates a React.lazy component wrapped in a bounded, loop-safe retry mechanism.
 * 
 * Guarantees:
 * 1. On successful import, automatically removes any retry flags from sessionStorage.
 * 2. On chunk-load failure, attempts a bounded page reload (default: max 2 attempts).
 * 3. Never enters an infinite reload loop if an asset remains genuinely missing.
 * 4. Resets cleanly so subsequent genuine failures in the same tab can recover.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentFactory: () => Promise<{ default: T } | T>,
  componentName: string = 'component',
  options: LazyWithRetryOptions = {}
): LazyExoticComponent<T> {
  const maxRetries = options.maxRetries ?? 2;
  const storageKey = options.storageKey || `chunk_retry_${componentName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  const windowMs = options.windowMs ?? 15000;

  // Primary lazy component loader with bounded reload retry
  return React.lazy(async () => {
    try {
      const module = await componentFactory();

      // On successful module import: Clean up retry counter so future failures can also recover
      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          window.sessionStorage.removeItem(storageKey);
          // Also remove legacy single-boolean keys if present
          if (componentName === 'AdminPanel') {
            window.sessionStorage.removeItem('chunk_retry_admin');
          }
        } catch {}
      }

      // Normalization: Support both `{ default: Component }` and direct `{ Component }`
      if (module && typeof module === 'object' && 'default' in module) {
        return module as { default: T };
      }
      return { default: module as T };
    } catch (err: any) {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const isChunkErr = isChunkLoadError(err);

        try {
          const raw = window.sessionStorage.getItem(storageKey);
          let record: { count: number; timestamp: number } = { count: 0, timestamp: 0 };

          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') {
                record = parsed;
              }
            } catch {
              // Backward-compatible parse for legacy 'true' string
              record = { count: 1, timestamp: Date.now() };
            }
          }

          const now = Date.now();
          const isWithinWindow = now - record.timestamp < windowMs;
          const currentCount = isWithinWindow ? record.count : 0;

          if (isChunkErr && currentCount < maxRetries) {
            const nextCount = currentCount + 1;
            window.sessionStorage.setItem(
              storageKey,
              JSON.stringify({ count: nextCount, timestamp: now })
            );

            // Log sanitized diagnostic for developers without exposing credentials or PII
            console.warn(
              `[lazyWithRetry] Detected chunk loading error for "${componentName}" (attempt ${nextCount}/${maxRetries}). Initiating loop-safe page reload...`
            );

            // Trigger clean reload
            window.location.reload();
            // Return a pending promise so React does not synchronously throw to ErrorBoundary before reload completes
            return new Promise<{ default: T }>(() => {});
          } else if (currentCount >= maxRetries) {
            console.error(
              `[lazyWithRetry] Maximum chunk retries (${maxRetries}) reached for "${componentName}". Rendering fallback boundary.`
            );
          }
        } catch (storageErr) {
          console.warn('[lazyWithRetry] sessionStorage access error:', storageErr);
        }
      }

      // Re-throw if non-chunk error or max retries exceeded
      throw err;
    }
  });
}
