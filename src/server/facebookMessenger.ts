import { Env } from './types';
import { computeHmacSha256Hex, timingSafeEqualString } from './webhookAuth';

export type MetaMessageTag = 'NONE' | 'POST_PURCHASE_UPDATE' | 'CONFIRMED_EVENT_UPDATE' | 'ACCOUNT_UPDATE';

export interface FacebookConfigStatus {
  hasPageAccessToken: boolean;
  hasAppSecret: boolean;
  hasPageId: boolean;
  hasWebhookVerifyToken: boolean;
  pageId: string | null;
  isConfigured: boolean;
  missingRequirements: string[];
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

/**
 * Returns the non-sensitive configuration and security readiness status of the Meta Messenger integration.
 * Protects secrets: tokens and secrets are never returned in plaintext.
 */
export function getFacebookConfigStatus(env: Env): FacebookConfigStatus {
  const hasPageAccessToken = Boolean(env.FB_PAGE_ACCESS_TOKEN && env.FB_PAGE_ACCESS_TOKEN.trim().length > 10);
  const hasAppSecret = Boolean(env.FB_APP_SECRET && env.FB_APP_SECRET.trim().length > 10);
  const hasPageId = Boolean(env.FB_PAGE_ID && env.FB_PAGE_ID.trim().length > 0);
  const hasWebhookVerifyToken = Boolean(env.FB_WEBHOOK_VERIFY_TOKEN && env.FB_WEBHOOK_VERIFY_TOKEN.trim().length > 5);

  const missingRequirements: string[] = [];
  if (!hasPageAccessToken) {
    missingRequirements.push('Set FB_PAGE_ACCESS_TOKEN secret via: npx wrangler secret put FB_PAGE_ACCESS_TOKEN');
  }
  if (!hasAppSecret) {
    missingRequirements.push('Set FB_APP_SECRET secret via: npx wrangler secret put FB_APP_SECRET');
  }
  if (!hasPageId) {
    missingRequirements.push('Set FB_PAGE_ID secret/var via: npx wrangler secret put FB_PAGE_ID');
  }
  if (!hasWebhookVerifyToken) {
    missingRequirements.push('Set FB_WEBHOOK_VERIFY_TOKEN secret via: npx wrangler secret put FB_WEBHOOK_VERIFY_TOKEN');
  }

  const isConfigured = hasPageAccessToken && hasAppSecret && hasPageId;

  return {
    hasPageAccessToken,
    hasAppSecret,
    hasPageId,
    hasWebhookVerifyToken,
    pageId: env.FB_PAGE_ID ? String(env.FB_PAGE_ID).trim() : null,
    isConfigured,
    missingRequirements,
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

  // 3. Worker Secret Availability Check
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

  // 4. Build Meta Graph API Payload
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

  // 5. Secure Outbound Request to Meta Graph API
  const metaGraphEndpoint = 'https://graph.facebook.com/v21.0/me/messages';

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
 * Validates Meta Page Connection health using Graph API /me endpoint.
 */
export async function testMetaConnection(env: Env): Promise<{
  success: boolean;
  status: number;
  pageId?: string;
  pageName?: string;
  category?: string;
  error?: string;
}> {
  const token = (env.FB_PAGE_ACCESS_TOKEN || '').trim();
  if (!token) {
    return {
      success: false,
      status: 503,
      error: 'FB_PAGE_ACCESS_TOKEN is not configured.',
    };
  }

  try {
    const resp = await fetch('https://graph.facebook.com/v21.0/me?fields=id,name,category,link', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data: any = await resp.json().catch(() => ({}));
    if (resp.ok && data.id) {
      return {
        success: true,
        status: 200,
        pageId: data.id,
        pageName: data.name,
        category: data.category,
      };
    }

    return {
      success: false,
      status: resp.status,
      error: data.error?.message || 'Meta connection test failed.',
    };
  } catch (err: any) {
    return {
      success: false,
      status: 502,
      error: `Network error connecting to Meta: ${err.message}`,
    };
  }
}
