/**
 * Facebook Broadcaster API Router
 * Dispatches endpoints for:
 * - Scan & Filter with multi-stage pre-deduplication
 * - Atomic batch dispatch with Meta Graph API integration
 * - Concurrent queue processing with race-suppression
 * - Permanent delivery history & live stats
 * - Ephemeral scan cache memory reset (permanent ledger protected)
 */

import { Env, D1Database } from './types';
import {
  scanAndFilterRecipients,
  dispatchBroadcasterBatch,
  resetBroadcasterEphemeralMemory,
  getBroadcasterDeliveryHistory,
  getBroadcasterSummaryStats,
  BroadcasterDeliveryStatus,
} from './broadcasterService';
import { runConcurrentBroadcasterQueue } from './broadcasterWorker';
import { ensureBroadcasterDeliveriesTable } from './db';

function jsonResponse(data: any, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...headers,
    },
  });
}

export async function handleBroadcasterApiRequest(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string> = {}
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();

  const db = env.DB as D1Database;
  if (!db) {
    return jsonResponse(
      { success: false, error: 'Database instance (D1) not available in runtime environment.' },
      503,
      corsHeaders
    );
  }

  // Ensure self-healing schema migration is applied
  await ensureBroadcasterDeliveriesTable(db);

  try {
    // 1. GET /api/broadcaster/stats - Counter statistics
    if (path === '/api/broadcaster/stats' && method === 'GET') {
      const pageId = url.searchParams.get('pageId') || undefined;
      const stats = await getBroadcasterSummaryStats(db, pageId);
      return jsonResponse({ success: true, stats }, 200, corsHeaders);
    }

    // 2. GET /api/broadcaster/history - Delivery ledger query
    if (path === '/api/broadcaster/history' && method === 'GET') {
      const pageId = url.searchParams.get('pageId') || undefined;
      const statusParam = (url.searchParams.get('status') || 'ALL').toUpperCase();
      const status = (['QUEUED', 'DELIVERED', 'FAILED', 'AMBIGUOUS'].includes(statusParam)
        ? statusParam
        : 'ALL') as BroadcasterDeliveryStatus | 'ALL';
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      const history = await getBroadcasterDeliveryHistory(db, {
        pageId,
        status,
        limit,
        offset,
      });

      return jsonResponse({ success: true, ...history }, 200, corsHeaders);
    }

    // 3. POST /api/broadcaster/scan-and-filter - Pre-filter & dedup audience
    if (path === '/api/broadcaster/scan-and-filter' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pageId = String((body as any)?.pageId || '').trim();
      const campaignId = String((body as any)?.campaignId || 'campaign-default').trim();
      const recipients = Array.isArray((body as any)?.recipients) ? (body as any).recipients : [];

      if (!pageId) {
        return jsonResponse({ success: false, error: 'pageId is required for recipient scan.' }, 400, corsHeaders);
      }

      const scanResult = await scanAndFilterRecipients(db, {
        pageId,
        campaignId,
        recipients,
      });

      return jsonResponse({ success: true, ...scanResult }, 200, corsHeaders);
    }

    // 4. POST /api/broadcaster/dispatch - Atomic batch dispatch
    if (path === '/api/broadcaster/dispatch' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pageId = String((body as any)?.pageId || '').trim();
      const campaignId = String((body as any)?.campaignId || 'campaign-default').trim();
      const messageText = String((body as any)?.messageText || '').trim();
      const recipients = Array.isArray((body as any)?.recipients) ? (body as any).recipients : [];
      const pageAccessToken = (body as any)?.pageAccessToken || env.FB_PAGE_ACCESS_TOKEN || undefined;
      const metaApiEndpoint = (body as any)?.metaApiEndpoint;
      const timeoutMs = (body as any)?.timeoutMs;

      if (!pageId) {
        return jsonResponse({ success: false, error: 'pageId is required for broadcast dispatch.' }, 400, corsHeaders);
      }
      if (!messageText) {
        return jsonResponse({ success: false, error: 'messageText is required for broadcast dispatch.' }, 400, corsHeaders);
      }

      const dispatchResult = await dispatchBroadcasterBatch(db, {
        pageId,
        campaignId,
        messageText,
        recipients,
        pageAccessToken,
        metaApiEndpoint,
        timeoutMs,
      });

      return jsonResponse({ success: true, ...dispatchResult }, 200, corsHeaders);
    }

    // 5. POST /api/broadcaster/dispatch-concurrent - Concurrent worker queue test/dispatch
    if (path === '/api/broadcaster/dispatch-concurrent' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pageId = String((body as any)?.pageId || '').trim();
      const campaignId = String((body as any)?.campaignId || 'campaign-concurrent').trim();
      const messageText = String((body as any)?.messageText || 'Test concurrent dispatch').trim();
      const recipients = Array.isArray((body as any)?.recipients) ? (body as any).recipients : [];
      const workerCount = parseInt(String((body as any)?.workerCount || '3'), 10);
      const metaApiEndpoint = (body as any)?.metaApiEndpoint;
      const timeoutMs = (body as any)?.timeoutMs;

      if (!pageId) {
        return jsonResponse({ success: false, error: 'pageId is required for concurrent dispatch.' }, 400, corsHeaders);
      }

      const concurrentResult = await runConcurrentBroadcasterQueue(db, {
        pageId,
        campaignId,
        messageText,
        recipients,
        config: {
          workerCount,
          metaApiEndpoint,
          timeoutMs,
        },
      });

      return jsonResponse({ success: true, ...concurrentResult }, 200, corsHeaders);
    }

    // 6. POST /api/broadcaster/reset-memory - Safe Ephemeral Memory Reset
    if (path === '/api/broadcaster/reset-memory' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pageId = (body as any)?.pageId ? String((body as any).pageId).trim() : undefined;

      const resetResult = await resetBroadcasterEphemeralMemory(db, pageId);
      return jsonResponse(resetResult, 200, corsHeaders);
    }

    return jsonResponse({ success: false, error: `Broadcaster route not found: ${method} ${path}` }, 404, corsHeaders);
  } catch (err: any) {
    console.error('[Broadcaster Router Error]:', err);
    return jsonResponse(
      { success: false, error: err?.message || 'Internal server error in broadcaster engine.' },
      500,
      corsHeaders
    );
  }
}
