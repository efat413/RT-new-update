import { Env } from './types';
import { computeHmacSha256Hex, timingSafeEqualString } from './webhookAuth';

export type MetaMessageTag = 'NONE' | 'POST_PURCHASE_UPDATE' | 'CONFIRMED_EVENT_UPDATE' | 'ACCOUNT_UPDATE';

export interface FacebookConfigStatus {
  hasPageAccessToken: boolean;
  hasAppSecret: boolean;
  hasPageId: boolean;
  hasWebhookVerifyToken: boolean;
  pageId: string | null;
  pageName?: string | null;
  isConfigured: boolean;
  isOutboundReady: boolean;
  isWebhookReady: boolean;
  missingRequirements: string[];
  outboundMissingRequirements: string[];
  webhookMissingRequirements: string[];
  permissionsNeeded: string[];
  policyNotes: string[];
}

export interface SendMetaMessageParams {
  recipientPsid: string;
  text: string;
  tag?: MetaMessageTag;
  isWithin24Hours?: boolean;
  recipientName?: string;
  orderNumber?: string;
}

export interface SendMetaMessageResult {
  success: boolean;
  status: number;
  messageId?: string;
  recipientId?: string;
  error?: string;
  policyBlocked?: boolean;
  notConfigured?: boolean;
  rawResponse?: any;
}

export interface MetaWebhookEvent {
  senderId: string;
  recipientId: string;
  timestamp: number;
  type: 'delivery' | 'read' | 'message' | 'optin' | 'other';
  watermark?: number;
  mids?: string[];
  text?: string;
}

interface PageVerificationCacheEntry {
  pageId: string;
  pageName: string;
  verifiedAt: number;
}
const pageVerificationCache = new Map<string, PageVerificationCacheEntry>();

export function clearMetaPageVerificationCache(): void {
  pageVerificationCache.clear();
}

/**
 * Returns the non-sensitive configuration and security readiness status of the Meta Messenger integration.
 * Protects secrets: tokens and secrets are never returned in plaintext.
 * Distinguishes outbound messaging readiness from optional inbound webhook readiness.
 */
export function getFacebookConfigStatus(env: Env): FacebookConfigStatus {
  const hasPageAccessToken = Boolean(env.FB_PAGE_ACCESS_TOKEN && env.FB_PAGE_ACCESS_TOKEN.trim().length > 10);
  const hasAppSecret = Boolean(env.FB_APP_SECRET && env.FB_APP_SECRET.trim().length > 10);
  const hasPageId = Boolean(env.FB_PAGE_ID && env.FB_PAGE_ID.trim().length > 0);
  const hasWebhookVerifyToken = Boolean(env.FB_WEBHOOK_VERIFY_TOKEN && env.FB_WEBHOOK_VERIFY_TOKEN.trim().length > 5);

  const outboundMissingRequirements: string[] = [];
  if (!hasPageAccessToken) {
    outboundMissingRequirements.push('Set FB_PAGE_ACCESS_TOKEN secret via: npx wrangler secret put FB_PAGE_ACCESS_TOKEN');
  }
  if (!hasPageId) {
    outboundMissingRequirements.push('Set FB_PAGE_ID secret/var via: npx wrangler secret put FB_PAGE_ID');
  }

  const webhookMissingRequirements: string[] = [];
  if (!hasAppSecret) {
    webhookMissingRequirements.push('Set FB_APP_SECRET secret (optional, for webhook signature verification) via: npx wrangler secret put FB_APP_SECRET');
  }
  if (!hasWebhookVerifyToken) {
    webhookMissingRequirements.push('Set FB_WEBHOOK_VERIFY_TOKEN secret (optional, for webhook challenge handshake) via: npx wrangler secret put FB_WEBHOOK_VERIFY_TOKEN');
  }

  const isOutboundReady = hasPageAccessToken && hasPageId;
  const isWebhookReady = hasAppSecret && hasWebhookVerifyToken;

  // Outbound readiness is authoritative for outbound broadcasting
  const isConfigured = isOutboundReady;

  // Combined missing requirements
  const missingRequirements: string[] = [...outboundMissingRequirements, ...webhookMissingRequirements];

  const pageId = env.FB_PAGE_ID ? String(env.FB_PAGE_ID).trim() : null;
  const verified = env.FB_PAGE_ACCESS_TOKEN ? pageVerificationCache.get(env.FB_PAGE_ACCESS_TOKEN.trim()) : undefined;

  return {
    hasPageAccessToken,
    hasAppSecret,
    hasPageId,
    hasWebhookVerifyToken,
    pageId,
    pageName: verified?.pageName || null,
    isConfigured,
    isOutboundReady,
    isWebhookReady,
    missingRequirements,
    outboundMissingRequirements,
    webhookMissingRequirements,
    permissionsNeeded: [
      'pages_messaging (Required to send and receive Messenger messages)',
      'pages_manage_metadata (Required to subscribe webhooks to Facebook Page)',
      'pages_read_engagement (Required to read conversation context and delivery)',
    ],
    policyNotes: [
      'Meta Standard 24-Hour Messaging Window: Messages sent outside 24h must use approved Message Tags.',
      'Approved Tags: POST_PURCHASE_UPDATE, CONFIRMED_EVENT_UPDATE, ACCOUNT_UPDATE.',
      'Promotional or marketing content is strictly prohibited under Message Tags by Meta Platform Policy.',
      'Delivery receipts (watermarks) are verified exclusively through incoming Meta Webhook events.',
    ],
  };
}

/**
 * Dispatches a message to Meta Graph API Send API (v21.0).
 * Strictly enforces Meta 24-Hour Policy and Message Tags.
 * Validates FB_PAGE_ACCESS_TOKEN and FB_PAGE_ID to ensure messages are not sent from/to the wrong Page.
 */
export async function sendMetaMessengerMessage(
  params: SendMetaMessageParams,
  env: Env
): Promise<SendMetaMessageResult> {
  const psid = (params.recipientPsid || '').trim();
  const text = (params.text || '').trim();
  const tag = params.tag || 'NONE';
  const isWithin24 = params.isWithin24Hours !== false; // defaults to true if omitted

  // 1. Input Validation
  if (!psid) {
    return {
      success: false,
      status: 400,
      error: 'Invalid recipient: Facebook Page-Scoped ID (PSID) is required.',
    };
  }

  if (!text) {
    return {
      success: false,
      status: 400,
      error: 'Invalid payload: Message text cannot be empty.',
    };
  }

  if (text.length > 2000) {
    return {
      success: false,
      status: 400,
      error: 'Message length exceeds Meta Send API limit of 2,000 characters.',
    };
  }

  // 2. Meta Messaging Policy Enforcement: 24-Hour Rule
  if (!isWithin24 && tag === 'NONE') {
    return {
      success: false,
      status: 403,
      policyBlocked: true,
      error:
        'Meta Policy Guard: Cannot send standard messages to recipients outside the 24-hour messaging window without an approved Message Tag (e.g. POST_PURCHASE_UPDATE).',
    };
  }

  // 3. Worker Secret Availability Check: Page Access Token
  const accessToken = (env.FB_PAGE_ACCESS_TOKEN || '').trim();
  if (!accessToken) {
    return {
      success: false,
      status: 503,
      notConfigured: true,
      error:
        'Meta API credentials not configured. FB_PAGE_ACCESS_TOKEN must be set as a Cloudflare Worker secret before real dispatching can occur.',
    };
  }

  // 4. Cloudflare Worker Page ID Check: Authoritative Page ID must be configured
  const configuredPageId = env.FB_PAGE_ID ? String(env.FB_PAGE_ID).trim() : '';
  if (!configuredPageId) {
    return {
      success: false,
      status: 503,
      notConfigured: true,
      error:
        'Facebook Page ID not configured. FB_PAGE_ID must be set in Cloudflare Worker environment before sending messages.',
    };
  }

  // 5. Page ID Mismatch Guard: Prevent sending from the wrong Page
  let verifiedPage = pageVerificationCache.get(accessToken);
  const now = Date.now();
  if (!verifiedPage || now - verifiedPage.verifiedAt > 5 * 60 * 1000) {
    try {
      const verifyResp = await fetch('https://graph.facebook.com/v21.0/me?fields=id,name', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const verifyData: any = await verifyResp.json().catch(() => ({}));
      if (verifyResp.ok && verifyData?.id) {
        verifiedPage = {
          pageId: verifyData.id,
          pageName: verifyData.name || '',
          verifiedAt: now,
        };
        pageVerificationCache.set(accessToken, verifiedPage);
      } else if (verifyData?.error) {
        return {
          success: false,
          status: verifyResp.status === 401 ? 401 : 502,
          error: `Meta Authentication Error: ${verifyData.error.message || 'Invalid or expired Page Access Token.'}`,
        };
      }
    } catch {
      // In case of transient network verification issue, let the endpoint call proceed
    }
  }

  if (verifiedPage && verifiedPage.pageId !== configuredPageId) {
    return {
      success: false,
      status: 409,
      error: `Facebook Page ID mismatch: Configured FB_PAGE_ID (${configuredPageId}) does not match authenticated Page ID (${verifiedPage.pageId} - "${verifiedPage.pageName}"). Sending blocked to prevent messaging from the wrong Page.`,
    };
  }

  // 6. Build Meta Graph API Payload
  const requestBody: Record<string, any> = {
    recipient: {
      id: psid,
    },
    message: {
      text,
    },
  };

  if (tag !== 'NONE') {
    requestBody.messaging_type = 'MESSAGE_TAG';
    requestBody.tag = tag;
  } else {
    requestBody.messaging_type = 'RESPONSE';
  }

  // 7. Secure Outbound Request to Meta Graph API
  const metaGraphEndpoint = `https://graph.facebook.com/v21.0/${encodeURIComponent(configuredPageId || 'me')}/messages`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const resp = await fetch(metaGraphEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'RongdhonuTrade-FacebookBroadcaster/1.0',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data: any = await resp.json().catch(() => ({}));

    if (resp.ok && data.message_id) {
      return {
        success: true,
        status: 200,
        messageId: data.message_id,
        recipientId: data.recipient_id || psid,
      };
    }

    // Parse Meta API Error
    const metaError = data.error || {};
    const errCode = metaError.code;
    const errSubcode = metaError.error_subcode;
    let friendlyMessage = metaError.message || `Meta Graph API returned HTTP ${resp.status}`;

    if (errCode === 10 || errSubcode === 2018028) {
      friendlyMessage = `Meta Policy Restriction: Recipient is outside allowed messaging window (Subcode ${errSubcode}).`;
    } else if (errCode === 190) {
      friendlyMessage = 'Meta Authentication Error: Page Access Token is expired, invalid, or lacks required permissions.';
    } else if (errCode === 613) {
      friendlyMessage = 'Meta Rate Limit: Graph API call limit reached for this Page. Delay pacing will back off.';
    } else if (errCode === 100) {
      friendlyMessage = `Meta Validation Error: ${metaError.message || 'Invalid parameters.'}`;
    }

    return {
      success: false,
      status: resp.status >= 400 && resp.status < 500 ? resp.status : 502,
      error: friendlyMessage,
      rawResponse: {
        code: errCode,
        subcode: errSubcode,
        type: metaError.type,
      },
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        success: false,
        status: 504,
        error: 'Timeout connecting to Meta Graph API (10s exceeded).',
      };
    }
    return {
      success: false,
      status: 502,
      error: `Network error connecting to Meta Graph API: ${err.message || 'Connection failed'}`,
    };
  }
}

/**
 * Handles GET /api/webhooks/facebook for Meta Webhook subscription handshake.
 */
export function handleMetaWebhookHandshake(url: URL, env: Env): Response {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expectedToken = (env.FB_WEBHOOK_VERIFY_TOKEN || '').trim();

  if (!expectedToken) {
    return new Response('Webhook verify token is not configured on server.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (mode === 'subscribe' && token && timingSafeEqualString(token, expectedToken)) {
    return new Response(challenge || '', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=UTF-8',
        'Cache-Control': 'no-store, no-cache',
      },
    });
  }

  return new Response('Forbidden: Verification token mismatch.', {
    status: 403,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/**
 * Verifies and parses incoming POST /api/webhooks/facebook payloads from Meta.
 */
export async function handleMetaWebhookEvent(
  request: Request,
  rawBody: string,
  env: Env
): Promise<{ success: boolean; status: number; events?: MetaWebhookEvent[]; error?: string }> {
  const appSecret = (env.FB_APP_SECRET || '').trim();

  // 1. Signature Verification
  if (!appSecret) {
    return {
      success: false,
      status: 503,
      error: 'FB_APP_SECRET is not configured on server. Cannot verify webhook signature.',
    };
  }

  const sigHeader = request.headers.get('x-hub-signature-256') || '';
  if (!sigHeader.startsWith('sha256=')) {
    return {
      success: false,
      status: 401,
      error: 'Missing or malformed x-hub-signature-256 header.',
    };
  }

  const providedHash = sigHeader.slice(7).trim();
  const calculatedHash = await computeHmacSha256Hex(appSecret, rawBody);

  if (!timingSafeEqualString(providedHash, calculatedHash)) {
    return {
      success: false,
      status: 401,
      error: 'Invalid webhook signature. Payload integrity check failed.',
    };
  }

  // 2. Parse Payload Events
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return {
      success: false,
      status: 400,
      error: 'Invalid JSON payload.',
    };
  }

  const extractedEvents: MetaWebhookEvent[] = [];

  if (payload.object === 'page' && Array.isArray(payload.entry)) {
    for (const entry of payload.entry) {
      if (Array.isArray(entry.messaging)) {
        for (const item of entry.messaging) {
          const senderId = item.sender?.id || '';
          const recipientId = item.recipient?.id || '';
          const timestamp = item.timestamp || Date.now();

          if (item.delivery) {
            extractedEvents.push({
              senderId,
              recipientId,
              timestamp,
              type: 'delivery',
              watermark: item.delivery.watermark,
              mids: item.delivery.mids,
            });
          } else if (item.read) {
            extractedEvents.push({
              senderId,
              recipientId,
              timestamp,
              type: 'read',
              watermark: item.read.watermark,
            });
          } else if (item.message) {
            extractedEvents.push({
              senderId,
              recipientId,
              timestamp,
              type: 'message',
              mids: [item.message.mid],
              text: item.message.text,
            });
          } else if (item.optin) {
            extractedEvents.push({
              senderId,
              recipientId,
              timestamp,
              type: 'optin',
            });
          }
        }
      }
    }
  }

  return {
    success: true,
    status: 200,
    events: extractedEvents,
  };
}

/**
 * Classifies Meta Graph API errors into distinct categories and user-friendly diagnostics.
 * Prevents secret leakage: raw requests, headers, or tokens are never included.
 */
export function classifyMetaGraphError(
  metaError: any,
  httpStatus: number
): {
  category: 'invalid_token' | 'expired_token' | 'insufficient_permissions' | 'page_mismatch' | 'invalid_request' | 'rate_limited' | 'network_error' | 'meta_service_error' | 'unknown';
  userMessage: string;
  code?: number;
  subcode?: number;
  type?: string;
  fbtraceId?: string;
} {
  const code = Number(metaError?.code) || 0;
  const subcode = Number(metaError?.error_subcode) || 0;
  const type = String(metaError?.type || '');
  const rawMsg = String(metaError?.message || '').trim();
  const fbtraceId = metaError?.fbtrace_id ? String(metaError.fbtrace_id) : undefined;
  const detail = rawMsg ? `: ${rawMsg}` : '';

  // 1. Expired or Invalid Token (Code 190)
  if (code === 190) {
    if (subcode === 463 || rawMsg.toLowerCase().includes('expired')) {
      return {
        category: 'expired_token',
        userMessage: `Meta Authentication Error: Facebook Page Access Token has expired${detail}. Please generate a fresh Page Access Token in Meta App Dashboard.`,
        code,
        subcode,
        type,
        fbtraceId,
      };
    }
    if (subcode === 467 || rawMsg.toLowerCase().includes('invalidated') || rawMsg.toLowerCase().includes('revoked')) {
      return {
        category: 'invalid_token',
        userMessage: `Meta Authentication Error: Facebook Page Access Token was invalidated or revoked${detail}. Please re-authenticate and update FB_PAGE_ACCESS_TOKEN.`,
        code,
        subcode,
        type,
        fbtraceId,
      };
    }
    return {
      category: 'invalid_token',
      userMessage: `Meta Authentication Error: Invalid Facebook Page Access Token${detail}.`,
      code,
      subcode,
      type,
      fbtraceId,
    };
  }

  // 2. Insufficient Permissions (Code 200, 10, 298, or permission message)
  if (
    code === 200 ||
    code === 10 ||
    code === 298 ||
    rawMsg.toLowerCase().includes('permission') ||
    rawMsg.toLowerCase().includes('scope') ||
    rawMsg.toLowerCase().includes('access denied')
  ) {
    return {
      category: 'insufficient_permissions',
      userMessage: `Meta Permission Error: Token lacks required Page permissions${detail}. Ensure the Page Access Token has pages_messaging, pages_read_engagement, and pages_manage_metadata.`,
      code,
      subcode,
      type,
      fbtraceId,
    };
  }

  // 3. Invalid Request / Unsupported field / Bad parameter (Code 100)
  if (code === 100) {
    return {
      category: 'invalid_request',
      userMessage: `Meta API Error: Invalid request or unsupported field${detail}. The verification endpoint queries minimal supported Page fields (id, name).`,
      code,
      subcode,
      type,
      fbtraceId,
    };
  }

  // 4. Rate Limited (Code 613, 4, 17)
  if (code === 613 || code === 4 || code === 17 || rawMsg.toLowerCase().includes('rate limit')) {
    return {
      category: 'rate_limited',
      userMessage: `Meta Rate Limit Exceeded: Calls to Meta Graph API have reached the rate limit for this Page or App${detail}. Please wait a few moments before trying again.`,
      code,
      subcode,
      type,
      fbtraceId,
    };
  }

  // 5. Meta Service Error (Code 1, 2, or 5xx)
  if (code === 1 || code === 2 || httpStatus >= 500) {
    return {
      category: 'meta_service_error',
      userMessage: `Meta Service Error: Temporary Meta platform error${detail}. Please retry shortly.`,
      code,
      subcode,
      type,
      fbtraceId,
    };
  }

  return {
    category: 'unknown',
    userMessage: rawMsg ? `Meta Graph API error (HTTP ${httpStatus}): ${rawMsg}` : `Meta Graph API returned HTTP ${httpStatus}.`,
    code: code || undefined,
    subcode: subcode || undefined,
    type: type || undefined,
    fbtraceId,
  };
}

/**
 * Validates Meta Page Connection health using Graph API /me endpoint with minimal fields (id, name).
 * Eliminates optional/deprecated fields like category, link that cause 'Invalid request' (#100) errors in Graph API v21.0.
 * Safely classifies errors and logs diagnostics without leaking credentials.
 */
export async function testMetaConnection(env: Env): Promise<{
  success: boolean;
  status: number;
  pageId?: string;
  pageName?: string;
  category?: string;
  error?: string;
  errorCategory?: string;
  errorCode?: number;
  errorSubcode?: number;
  errorType?: string;
  mismatch?: boolean;
  diagnostics?: {
    category: string;
    code?: number;
    subcode?: number;
    type?: string;
    fbtraceId?: string;
  };
}> {
  const token = (env.FB_PAGE_ACCESS_TOKEN || '').trim();
  if (!token) {
    return {
      success: false,
      status: 503,
      errorCategory: 'missing_credentials',
      error: 'FB_PAGE_ACCESS_TOKEN is not configured. Please set the FB_PAGE_ACCESS_TOKEN Cloudflare Worker secret.',
    };
  }

  const configuredPageId = env.FB_PAGE_ID ? String(env.FB_PAGE_ID).trim() : null;

  try {
    // 1. Primary verification request: Minimal universal Page fields (id, name)
    let resp = await fetch('https://graph.facebook.com/v21.0/me?fields=id,name', {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'RongdhonuTrade-FacebookBroadcaster/1.0',
      },
    });

    let data: any = await resp.json().catch(() => ({}));

    // If /me returns an error and configuredPageId is available, fallback to querying the Page object directly
    if (!resp.ok && configuredPageId && data?.error?.code === 100) {
      try {
        const pageResp = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(configuredPageId)}?fields=id,name`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'RongdhonuTrade-FacebookBroadcaster/1.0',
          },
        });
        const pageData: any = await pageResp.json().catch(() => ({}));
        if (pageResp.ok && pageData.id) {
          resp = pageResp;
          data = pageData;
        }
      } catch {}
    }

    if (resp.ok && data.id) {
      // Cache verified page credentials for token
      pageVerificationCache.set(token, {
        pageId: data.id,
        pageName: data.name || '',
        verifiedAt: Date.now(),
      });

      // 1. Missing Page ID: Report clear configuration error without a fake ID
      if (!configuredPageId) {
        return {
          success: false,
          status: 400,
          pageId: data.id,
          pageName: data.name,
          errorCategory: 'page_unconfigured',
          error: `Facebook Page ID is not configured. Authenticated as "${data.name}" (ID: ${data.id}), but FB_PAGE_ID is missing from the environment. Please configure FB_PAGE_ID=${data.id}.`,
        };
      }

      // 2. Page ID mismatch: Block sending and report the mismatch
      if (configuredPageId !== data.id) {
        return {
          success: false,
          status: 409,
          mismatch: true,
          pageId: data.id,
          pageName: data.name,
          errorCategory: 'page_mismatch',
          error: `Facebook Page ID mismatch: Configured FB_PAGE_ID (${configuredPageId}) does not match authenticated Page ID (${data.id} - "${data.name}"). Sending blocked to prevent messaging from the wrong Page.`,
        };
      }

      // 3. Fully valid connection with matching Page ID
      return {
        success: true,
        status: 200,
        pageId: data.id,
        pageName: data.name,
      };
    }

    // Inspect HTTP status and Meta error response
    const metaError = data.error || {};
    const classification = classifyMetaGraphError(metaError, resp.status);

    // Safely log diagnostic on server without leaking credentials
    console.error('[Meta Connection Test Diagnostic]:', {
      httpStatus: resp.status,
      category: classification.category,
      code: classification.code,
      subcode: classification.subcode,
      type: classification.type,
      message: metaError.message,
      fbtraceId: classification.fbtraceId,
    });

    return {
      success: false,
      status: resp.status >= 400 && resp.status < 500 ? resp.status : 502,
      error: classification.userMessage,
      errorCategory: classification.category,
      errorCode: classification.code,
      errorSubcode: classification.subcode,
      errorType: classification.type,
      diagnostics: {
        category: classification.category,
        code: classification.code,
        subcode: classification.subcode,
        type: classification.type,
        fbtraceId: classification.fbtraceId,
      },
    };
  } catch (err: any) {
    console.error('[Meta Connection Test Network Error]:', err?.message || err);
    return {
      success: false,
      status: 502,
      errorCategory: 'network_error',
      error: `Network error connecting to Meta Graph API: ${err.message || 'Connection failed'}`,
      diagnostics: {
        category: 'network_error',
      },
    };
  }
}
