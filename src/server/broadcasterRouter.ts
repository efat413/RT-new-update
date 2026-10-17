/**
 * Facebook Broadcaster API Router
 * Dispatches endpoints for:
 * - Secure Page Access Token configuration & Meta Graph API validation
 * - Configurable delay validation (Min Delay, Max Delay)
 * - Persistent Campaign Job State Engine (real server-side Pause, Resume, Stop)
 * - Scan & Filter with multi-stage pre-deduplication
 * - Atomic batch dispatch with template variations and delay jitter
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
  resolvePageAccessToken,
  BroadcasterDeliveryStatus,
} from './broadcasterService';
import {
  encryptToken,
  redactToken,
  validateMetaPageToken,
  validateDelayConfig,
  parseMessageTemplates,
} from './broadcasterSecurity';
import { runConcurrentBroadcasterQueue } from './broadcasterWorker';
import {
  ensureBroadcasterDeliveriesTable,
  getBroadcasterConfig,
  saveBroadcasterConfig,
  getBroadcasterCampaignJob,
  setBroadcasterJobStatus,
  getActiveRunningBroadcasterJob,
  insertAuditLogInD1,
} from './db';
import { getAuthSecret } from './auth';

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

export interface BroadcasterAuthContext {
  id: string;
  email: string;
  role: string;
  ipAddress?: string;
}

export async function handleBroadcasterApiRequest(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string> = {},
  authContext?: BroadcasterAuthContext
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

  // Safe encryption secret resolution
  const encryptionSecret = getAuthSecret(env);

  try {
    // ==============================================================
    // 1. GET /api/broadcaster/config - Retrieve Configuration & Redacted Token
    // ==============================================================
    if (path === '/api/broadcaster/config' && method === 'GET') {
      const pageId = url.searchParams.get('pageId') || '104829105829104';
      const config = await getBroadcasterConfig(db, pageId);

      // Check if environment variable secret is also set
      const hasEnvToken = Boolean(env.FB_PAGE_ACCESS_TOKEN && env.FB_PAGE_ACCESS_TOKEN.trim());
      const effectiveTokenPreview = config?.token_preview || (hasEnvToken ? redactToken(env.FB_PAGE_ACCESS_TOKEN) : 'unconfigured');

      return jsonResponse(
        {
          success: true,
          config: {
            pageId: config?.page_id || pageId,
            tokenPreview: effectiveTokenPreview,
            tokenStatus: config?.token_status || (hasEnvToken ? 'active' : 'unconfigured'),
            minDelaySec: config?.min_delay_sec != null ? Number(config.min_delay_sec) : 2,
            maxDelaySec: config?.max_delay_sec != null ? Number(config.max_delay_sec) : 5,
            defaultMessageTemplates: config?.default_message_templates || null,
            verifiedAt: config?.verified_at || null,
            hasServerSecret: Boolean(hasEnvToken || config?.encrypted_access_token),
          },
        },
        200,
        corsHeaders
      );
    }

    // ==============================================================
    // 2. POST /api/broadcaster/config - Save Encrypted Token & Delays
    // ==============================================================
    if (path === '/api/broadcaster/config' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pageId = String((body as any)?.pageId || '104829105829104').trim();
      const rawToken = (body as any)?.pageAccessToken ? String((body as any).pageAccessToken).trim() : undefined;
      const minDelaySec = (body as any)?.minDelaySec;
      const maxDelaySec = (body as any)?.maxDelaySec;
      const defaultTemplates = (body as any)?.defaultMessageTemplates ? String((body as any).defaultMessageTemplates).trim() : undefined;

      // Validate delay inputs
      const delayValidation = validateDelayConfig(minDelaySec ?? 2, maxDelaySec ?? 5);
      if (!delayValidation.valid) {
        return jsonResponse({ success: false, error: delayValidation.error }, 400, corsHeaders);
      }

      let encryptedToken: string | undefined;
      let tokenPreview: string | undefined;
      let tokenStatus: string | undefined;

      if (rawToken) {
        // Enforce basic Meta token sanity check
        if (!/^EA[A-Za-z0-9_\-]+$/.test(rawToken) && rawToken !== 'EAAG_MOCK_TOKEN' && !rawToken.startsWith('EAAG_TEST_TOKEN')) {
          return jsonResponse(
            { success: false, error: 'Invalid Meta Page Access Token format (expected string starting with EAA...).' },
            400,
            corsHeaders
          );
        }

        encryptedToken = await encryptToken(rawToken, encryptionSecret);
        tokenPreview = redactToken(rawToken);
        tokenStatus = 'configured';
      }

      await saveBroadcasterConfig(db, {
        page_id: pageId,
        encrypted_access_token: encryptedToken,
        token_preview: tokenPreview,
        token_status: tokenStatus,
        min_delay_sec: delayValidation.min,
        max_delay_sec: delayValidation.max,
        default_message_templates: defaultTemplates,
      });

      // Audit Log
      try {
        await insertAuditLogInD1(db, {
          action: 'SETTINGS_UPDATE',
          targetType: 'settings',
          targetId: `broadcaster-config-${pageId}`,
          details: {
            setting: 'facebook_broadcaster_config',
            pageId,
            tokenConfigured: Boolean(rawToken),
            minDelaySec: delayValidation.min,
            maxDelaySec: delayValidation.max,
          },
          actorId: authContext?.id,
          actorEmail: authContext?.email,
          actorRole: authContext?.role,
          ipAddress: authContext?.ipAddress,
        });
      } catch {}

      return jsonResponse(
        {
          success: true,
          message: 'Broadcaster configuration saved securely.',
          tokenPreview: tokenPreview || 'unchanged',
          minDelaySec: delayValidation.min,
          maxDelaySec: delayValidation.max,
        },
        200,
        corsHeaders
      );
    }

    // ==============================================================
    // 3. POST /api/broadcaster/verify-token - Meta Graph API Token Validation
    // ==============================================================
    if (path === '/api/broadcaster/verify-token' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pageId = String((body as any)?.pageId || '').trim();
      let token = (body as any)?.pageAccessToken ? String((body as any).pageAccessToken).trim() : undefined;

      if (!pageId) {
        return jsonResponse({ success: false, error: 'pageId is required for token verification.' }, 400, corsHeaders);
      }

      // If token not provided in body, resolve securely from D1 or environment
      if (!token) {
        token = await resolvePageAccessToken(db, pageId, undefined, encryptionSecret);
        if (!token && env.FB_PAGE_ACCESS_TOKEN) {
          token = env.FB_PAGE_ACCESS_TOKEN.trim();
        }
      }

      if (!token) {
        return jsonResponse(
          { success: false, error: 'No Page Access Token found. Please enter or save a token first.' },
          400,
          corsHeaders
        );
      }

      // Perform Graph API validation
      const validationResult = await validateMetaPageToken({
        token,
        expectedPageId: pageId,
      });

      if (validationResult.valid) {
        await saveBroadcasterConfig(db, {
          page_id: pageId,
          token_status: 'verified',
          verified_at: new Date().toISOString(),
        });

        // Audit Log
        try {
          await insertAuditLogInD1(db, {
            action: 'SETTINGS_UPDATE',
            targetType: 'settings',
            targetId: `broadcaster-token-${pageId}`,
            details: {
              action: 'verify_meta_page_token',
              pageId,
              pageName: validationResult.pageName,
              valid: true,
            },
            actorId: authContext?.id,
            actorEmail: authContext?.email,
            actorRole: authContext?.role,
            ipAddress: authContext?.ipAddress,
          });
        } catch {}
      }

      return jsonResponse(
        {
          success: validationResult.valid,
          validation: validationResult,
        },
        validationResult.valid ? 200 : 400,
        corsHeaders
      );
    }

    // ==============================================================
    // 4. GET /api/broadcaster/job-status - Persistent Campaign Job State
    // ==============================================================
    if (path === '/api/broadcaster/job-status' && method === 'GET') {
      const campaignId = url.searchParams.get('campaignId') || undefined;
      const pageId = url.searchParams.get('pageId') || undefined;

      let job = null;
      if (campaignId) {
        job = await getBroadcasterCampaignJob(db, campaignId);
      } else if (pageId) {
        job = await getActiveRunningBroadcasterJob(db, pageId);
      }

      return jsonResponse({ success: true, job }, 200, corsHeaders);
    }

    // ==============================================================
    // 5. POST /api/broadcaster/pause - Pause Campaign at Safe Checkpoint
    // ==============================================================
    if (path === '/api/broadcaster/pause' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const campaignId = String((body as any)?.campaignId || '').trim();

      if (!campaignId) {
        return jsonResponse({ success: false, error: 'campaignId is required to pause campaign.' }, 400, corsHeaders);
      }

      await setBroadcasterJobStatus(db, campaignId, 'PAUSED', 'Paused by admin');

      try {
        await insertAuditLogInD1(db, {
          action: 'SETTINGS_UPDATE',
          targetType: 'settings',
          targetId: `broadcaster-job-${campaignId}`,
          details: { action: 'pause_broadcaster_campaign', campaignId },
          actorId: authContext?.id,
          actorEmail: authContext?.email,
          actorRole: authContext?.role,
          ipAddress: authContext?.ipAddress,
        });
      } catch {}

      return jsonResponse({ success: true, message: `Campaign "${campaignId}" paused at safe checkpoint.` }, 200, corsHeaders);
    }

    // ==============================================================
    // 6. POST /api/broadcaster/resume - Resume Paused Campaign
    // ==============================================================
    if (path === '/api/broadcaster/resume' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const campaignId = String((body as any)?.campaignId || '').trim();

      if (!campaignId) {
        return jsonResponse({ success: false, error: 'campaignId is required to resume campaign.' }, 400, corsHeaders);
      }

      await setBroadcasterJobStatus(db, campaignId, 'RUNNING', 'Resumed by admin');

      try {
        await insertAuditLogInD1(db, {
          action: 'SETTINGS_UPDATE',
          targetType: 'settings',
          targetId: `broadcaster-job-${campaignId}`,
          details: { action: 'resume_broadcaster_campaign', campaignId },
          actorId: authContext?.id,
          actorEmail: authContext?.email,
          actorRole: authContext?.role,
          ipAddress: authContext?.ipAddress,
        });
      } catch {}

      return jsonResponse({ success: true, message: `Campaign "${campaignId}" resumed.` }, 200, corsHeaders);
    }

    // ==============================================================
    // 7. POST /api/broadcaster/stop - Terminate Campaign Safely
    // ==============================================================
    if (path === '/api/broadcaster/stop' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const campaignId = String((body as any)?.campaignId || '').trim();

      if (!campaignId) {
        return jsonResponse({ success: false, error: 'campaignId is required to stop campaign.' }, 400, corsHeaders);
      }

      await setBroadcasterJobStatus(db, campaignId, 'STOPPED', 'Terminated by admin');

      try {
        await insertAuditLogInD1(db, {
          action: 'SETTINGS_UPDATE',
          targetType: 'settings',
          targetId: `broadcaster-job-${campaignId}`,
          details: { action: 'stop_broadcaster_campaign', campaignId },
          actorId: authContext?.id,
          actorEmail: authContext?.email,
          actorRole: authContext?.role,
          ipAddress: authContext?.ipAddress,
        });
      } catch {}

      return jsonResponse({ success: true, message: `Campaign "${campaignId}" stopped successfully.` }, 200, corsHeaders);
    }

    // ==============================================================
    // 8. GET /api/broadcaster/stats - Counter Statistics
    // ==============================================================
    if (path === '/api/broadcaster/stats' && method === 'GET') {
      const pageId = url.searchParams.get('pageId') || undefined;
      const stats = await getBroadcasterSummaryStats(db, pageId);
      return jsonResponse({ success: true, stats }, 200, corsHeaders);
    }

    // ==============================================================
    // 9. GET /api/broadcaster/history - Delivery Ledger Query
    // ==============================================================
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

    // ==============================================================
    // 10. POST /api/broadcaster/scan-and-filter - Pre-Filter & Dedup Audience
    // ==============================================================
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

    // ==============================================================
    // 11. POST /api/broadcaster/dispatch - Atomic Batch Dispatch
    // ==============================================================
    if (path === '/api/broadcaster/dispatch' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pageId = String((body as any)?.pageId || '').trim();
      const campaignId = String((body as any)?.campaignId || 'campaign-default').trim();
      const messageText = String((body as any)?.messageText || (body as any)?.messageTemplates || '').trim();
      const recipients = Array.isArray((body as any)?.recipients) ? (body as any).recipients : [];
      const pageAccessToken = (body as any)?.pageAccessToken;
      const minDelaySec = (body as any)?.minDelaySec;
      const maxDelaySec = (body as any)?.maxDelaySec;
      const metaApiEndpoint = (body as any)?.metaApiEndpoint;
      const timeoutMs = (body as any)?.timeoutMs;

      if (!pageId) {
        return jsonResponse({ success: false, error: 'pageId is required for broadcast dispatch.' }, 400, corsHeaders);
      }
      if (!messageText) {
        return jsonResponse({ success: false, error: 'messageText is required for broadcast dispatch.' }, 400, corsHeaders);
      }

      // Concurrency Lock: Prevent multiple simultaneous campaigns on the same Page
      const activeRunningJob = await getActiveRunningBroadcasterJob(db, pageId);
      if (activeRunningJob && activeRunningJob.campaign_id !== campaignId) {
        return jsonResponse(
          {
            success: false,
            error: `Another broadcast campaign ("${activeRunningJob.campaign_id}") is currently RUNNING on this Page. Please wait or stop the running campaign first.`,
            runningCampaignId: activeRunningJob.campaign_id,
          },
          409,
          corsHeaders
        );
      }

      const dispatchResult = await dispatchBroadcasterBatch(db, {
        pageId,
        campaignId,
        messageText,
        recipients,
        pageAccessToken,
        minDelaySec,
        maxDelaySec,
        metaApiEndpoint,
        timeoutMs,
        encryptionSecret,
      });

      // Audit Log
      try {
        await insertAuditLogInD1(db, {
          action: 'SETTINGS_UPDATE',
          targetType: 'settings',
          targetId: `broadcaster-dispatch-${campaignId}`,
          details: {
            action: 'broadcast_dispatch',
            campaignId,
            pageId,
            totalProcessed: dispatchResult.totalProcessed,
            deliveredCount: dispatchResult.deliveredCount,
            ambiguousCount: dispatchResult.ambiguousCount,
            failedCount: dispatchResult.failedCount,
            skippedCount: dispatchResult.skippedCount,
          },
          actorId: authContext?.id,
          actorEmail: authContext?.email,
          actorRole: authContext?.role,
          ipAddress: authContext?.ipAddress,
        });
      } catch {}

      return jsonResponse({ success: true, ...dispatchResult }, 200, corsHeaders);
    }

    // ==============================================================
    // 12. POST /api/broadcaster/dispatch-concurrent - Concurrent Queue Testing
    // ==============================================================
    if (path === '/api/broadcaster/dispatch-concurrent' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pageId = String((body as any)?.pageId || '').trim();
      const campaignId = String((body as any)?.campaignId || 'campaign-concurrent').trim();
      const messageText = String((body as any)?.messageText || 'Test concurrent dispatch').trim();
      const recipients = Array.isArray((body as any)?.recipients) ? (body as any).recipients : [];
      const workerCount = parseInt(String((body as any)?.workerCount || '3'), 10);
      const minDelaySec = (body as any)?.minDelaySec;
      const maxDelaySec = (body as any)?.maxDelaySec;
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
          minDelaySec,
          maxDelaySec,
          metaApiEndpoint,
          timeoutMs,
        },
      });

      return jsonResponse({ success: true, ...concurrentResult }, 200, corsHeaders);
    }

    // ==============================================================
    // 13. POST /api/broadcaster/reset-memory - Safe Ephemeral Memory Reset
    // ==============================================================
    if (path === '/api/broadcaster/reset-memory' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pageId = (body as any)?.pageId ? String((body as any).pageId).trim() : undefined;

      const resetResult = await resetBroadcasterEphemeralMemory(db, pageId);

      try {
        await insertAuditLogInD1(db, {
          action: 'SETTINGS_UPDATE',
          targetType: 'settings',
          targetId: `broadcaster-reset-ephemeral`,
          details: {
            action: 'reset_ephemeral_memory',
            pageId,
            clearedEphemeralRows: resetResult.clearedEphemeralRows,
            permanentLedgerRowsProtected: resetResult.permanentLedgerRowsProtected,
          },
          actorId: authContext?.id,
          actorEmail: authContext?.email,
          actorRole: authContext?.role,
          ipAddress: authContext?.ipAddress,
        });
      } catch {}

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
