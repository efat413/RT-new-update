import React, { ComponentType, LazyExoticComponent } from 'react';

export interface LazyWithRetryOptions {
  /** Maximum number of auto-reload attempts for persistent chunk failures before rendering boundary (default: 2) */
  maxRetries?: number;
  /** Storage key to track reload attempts in sessionStorage (default: 'chunk_retry_' + componentName) */
  storageKey?: string;
  /** Time window in milliseconds for reload retry counts to stay active (default: 20000 ms) */
  windowMs?: number;
  /** In-memory retry attempts before initiating page reload (default: 2) */
  inMemoryRetries?: number;
}

/**
 * Checks whether an error represents a JavaScript chunk, dynamic import, or asset delivery failure.
 * Covers Chrome, Firefox, Safari/WebKit, Edge, Vite, and Cloudflare asset 404s/MIME-type HTML responses.
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
    msg.includes("unexpected token '<'") ||
    msg.includes("expected expression, got '<'") ||
    msg.includes('failed to load module script') ||
    msg.includes('mime type') ||
    msg.includes('strict mime type') ||
    msg.includes('script error') ||
    (msg.includes('load failed') && !msg.includes('network request failed'))
  );
}

/**
 * Creates a React.lazy component wrapped in a robust, dual-tier recovery mechanism:
 * 
 * 1. Tier 1 (In-Memory Retry): Immediately retries the dynamic import in-memory (up to 2 times)
 *    to transparently absorb transient latency, server compile delay, or network blips without
 *    any disruption to the user or unnecessary page reloads.
 * 2. Tier 2 (Loop-Safe Page Reload): If in-memory retries fail because assets changed after a
 *    new deployment, initiates a bounded page reload (max 2 attempts) to fetch fresh HTML shells.
 * 3. Self-Clearing State: Automatically cleans up sessionStorage counters immediately on success
 *    and on manual user retry so subsequent genuine failures in the session can recover cleanly.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentFactory: () => Promise<{ default: T } | T>,
  componentName: string = 'component',
  options: LazyWithRetryOptions = {}
): LazyExoticComponent<T> {
  const maxRetries = options.maxRetries ?? 2;
  const inMemoryRetries = options.inMemoryRetries ?? 2;
  const storageKey = options.storageKey || `chunk_retry_${componentName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  const windowMs = options.windowMs ?? 20000;

  return React.lazy(async () => {
    let lastError: any = null;

    // Tier 1: In-memory retry loop
    for (let attempt = 0; attempt <= inMemoryRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 150ms, 300ms
          await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
        }

        const module = await componentFactory();

        // Successful import: Clean up retry counters
        if (typeof window !== 'undefined' && window.sessionStorage) {
          try {
            window.sessionStorage.removeItem(storageKey);
            if (componentName === 'AdminPanel') {
              window.sessionStorage.removeItem('chunk_retry_admin');
              window.sessionStorage.removeItem('chunk_retry_adminpanel');
            }
          } catch {}
        }

        if (module && typeof module === 'object' && 'default' in module) {
          return module as { default: T };
        }
        return { default: module as T };
      } catch (err: any) {
        lastError = err;
        // If it's not a chunk loading error (e.g. application runtime bug), do not retry in-memory
        if (!isChunkLoadError(err)) {
          throw err;
        }
      }
    }

    // Tier 2: Persistent chunk failure after in-memory retries (e.g. stale deployment hashes)
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const isChunkErr = isChunkLoadError(lastError);

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

          console.warn(
            `[lazyWithRetry] Stale chunk detected for "${componentName}" after in-memory retries (attempt ${nextCount}/${maxRetries}). Initiating loop-safe page reload...`
          );

          window.location.reload();
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

    throw lastError;
  });
}
