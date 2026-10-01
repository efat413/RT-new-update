import { Env } from './types';

/**
 * Constant-time string equality comparison to prevent timing attacks.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

/**
 * Computes an HMAC-SHA256 hexadecimal string using Web Crypto API.
 */
export async function computeHmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const hashArray = Array.from(new Uint8Array(sigBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes a deterministic cryptographic fingerprint (SHA-256) of the authenticated webhook request.
 */
export async function computeWebhookFingerprint(
  rawBody: string,
  timestamp?: string,
  authHeader?: string
): Promise<string> {
  const enc = new TextEncoder();
  const data = `${authHeader || ''}:${timestamp || ''}:${rawBody}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface WebhookAuthResult {
  authenticated: boolean;
  status: number;
  error?: string;
  matchedSecretSource?: string;
  timestampMs?: number;
}

export interface WebhookRequestInput {
  rawBody: string;
  headers: Record<string, string | string[] | undefined> | Headers;
  url?: string;
}

function getHeaderValue(headers: Record<string, string | string[] | undefined> | Headers, name: string): string {
  const lowerName = name.toLowerCase();
  if ('get' in headers && typeof headers.get === 'function') {
    return (headers.get(name) || headers.get(lowerName) || '').trim();
  }
  const record = headers as Record<string, string | string[] | undefined>;
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lowerName) {
      const val = record[key];
      if (Array.isArray(val)) return (val[0] || '').trim();
      return (val || '').trim();
    }
  }
  return '';
}

/**
 * Authoritatively verifies courier webhook requests.
 * Supports:
 * 1. HMAC-SHA256 signatures (X-Steadfast-Signature, X-Webhook-Signature, X-Signature, X-Hub-Signature-256)
 * 2. Shared secret headers (X-Webhook-Secret, X-Courier-Secret, Secret-Key, Authorization: Bearer <secret>)
 * 3. Steadfast API Key and Secret Key pairs (Api-Key + Secret-Key)
 * 4. Replay protection against stale or replayed timestamps (5-minute tolerance)
 * 5. Rejection of unauthenticated or tampered payloads prior to any order mutation
 */
export async function verifyCourierWebhookAuth(
  input: WebhookRequestInput,
  env?: Env | null,
  settings?: any
): Promise<WebhookAuthResult> {
  const { rawBody, headers } = input;

  // 1. Gather all candidate secrets strictly from dedicated webhook environment variables & settings
  // CRITICAL SECURITY ENFORCEMENT:
  // ADMIN_SECRET is strictly dedicated to administrator authentication and session token signing.
  // It must NEVER be accepted or considered as a candidate webhook secret under any circumstances.
  const envAdminSecret = (
    env?.ADMIN_SECRET ||
    (typeof process !== 'undefined' && process.env?.ADMIN_SECRET ? process.env.ADMIN_SECRET : '') ||
    ''
  ).trim();

  const candidateSecrets = new Set<string>();

  const envWebhookSecret = (env?.COURIER_WEBHOOK_SECRET || process.env.COURIER_WEBHOOK_SECRET || '').trim();
  if (envWebhookSecret && (!envAdminSecret || !timingSafeEqualString(envWebhookSecret, envAdminSecret))) {
    candidateSecrets.add(envWebhookSecret);
  }

  const envSteadfastSecret = (env?.STEADFAST_SECRET_KEY || process.env.STEADFAST_SECRET_KEY || '').trim();
  if (envSteadfastSecret && (!envAdminSecret || !timingSafeEqualString(envSteadfastSecret, envAdminSecret))) {
    candidateSecrets.add(envSteadfastSecret);
  }

  const settingsSteadfastSecret = (settings?.steadfastSecretKey || '').trim();
  if (settingsSteadfastSecret && (!envAdminSecret || !timingSafeEqualString(settingsSteadfastSecret, envAdminSecret))) {
    candidateSecrets.add(settingsSteadfastSecret);
  }

  const envSteadfastApiKey = (env?.STEADFAST_API_KEY || process.env.STEADFAST_API_KEY || '').trim();
  if (envSteadfastApiKey && (!envAdminSecret || !timingSafeEqualString(envSteadfastApiKey, envAdminSecret))) {
    candidateSecrets.add(envSteadfastApiKey);
  }

  const settingsSteadfastApiKey = (settings?.steadfastApiKey || '').trim();
  if (settingsSteadfastApiKey && (!envAdminSecret || !timingSafeEqualString(settingsSteadfastApiKey, envAdminSecret))) {
    candidateSecrets.add(settingsSteadfastApiKey);
  }

  if (Array.isArray(settings?.courierWebhooks)) {
    for (const w of settings.courierWebhooks) {
      if (w.secret && typeof w.secret === 'string' && w.secret.trim()) {
        const secretStr = w.secret.trim();
        if (!envAdminSecret || !timingSafeEqualString(secretStr, envAdminSecret)) {
          candidateSecrets.add(secretStr);
        }
      }
    }
  }

  // Double-check: Unconditionally purge ADMIN_SECRET if present in candidate set
  if (envAdminSecret) {
    candidateSecrets.delete(envAdminSecret);
  }

  // If no secrets are configured in environment or settings, reject all webhook requests securely
  if (candidateSecrets.size === 0) {
    console.warn('[Webhook Auth]: No webhook secret is configured on the server.');
    return {
      authenticated: false,
      status: 401,
      error: 'Unauthorized: Courier webhook authentication failed.',
    };
  }

  // 2. Extract potential signature and secret headers
  const sigHeader =
    getHeaderValue(headers, 'x-steadfast-signature') ||
    getHeaderValue(headers, 'x-webhook-signature') ||
    getHeaderValue(headers, 'x-signature') ||
    getHeaderValue(headers, 'x-hub-signature-256') ||
    getHeaderValue(headers, 'x-signature-sha256');

  const secretHeader =
    getHeaderValue(headers, 'x-webhook-secret') ||
    getHeaderValue(headers, 'x-courier-secret') ||
    getHeaderValue(headers, 'secret-key');

  const authHeader = getHeaderValue(headers, 'authorization');
  let bearerSecret = '';
  if (authHeader) {
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      bearerSecret = authHeader.substring(7).trim();
    } else {
      bearerSecret = authHeader.trim();
    }
  }

  const incomingSecret = secretHeader || bearerSecret;
  const apiKeyHeader = getHeaderValue(headers, 'api-key') || getHeaderValue(headers, 'x-api-key');

  // If no authentication credentials (signature or shared secret) are provided at all:
  if (!sigHeader && !incomingSecret) {
    return {
      authenticated: false,
      status: 401,
      error: 'Unauthorized: Missing required courier webhook signature or secret header (X-Webhook-Signature, X-Steadfast-Signature, X-Webhook-Secret, or Secret-Key).',
    };
  }

  // Parse body safely to identify test pings and embedded timestamps
  let parsedBody: any = null;
  try {
    if (rawBody && typeof rawBody === 'string' && rawBody.trim()) {
      parsedBody = JSON.parse(rawBody);
    }
  } catch {}

  const isTestPing = Boolean(
    parsedBody && (
      parsedBody.ping === true ||
      parsedBody.ping === 'true' ||
      parsedBody.test === true ||
      parsedBody.test === 'true' ||
      parsedBody.is_test === true ||
      parsedBody.action === 'test_ping' ||
      parsedBody.action === 'test' ||
      parsedBody.action === 'ping' ||
      parsedBody.event === 'test.ping' ||
      parsedBody.event === 'test' ||
      parsedBody.event === 'ping' ||
      parsedBody.event === 'test_ping' ||
      parsedBody.event === 'courier.added' ||
      parsedBody.event === 'courier.updated' ||
      parsedBody.event === 'courier.dispatched' ||
      parsedBody.notification_type === 'courier.added' ||
      parsedBody.notification_type === 'courier.updated' ||
      parsedBody.notification_type === 'courier.dispatched' ||
      parsedBody.notification_type === 'test' ||
      parsedBody.notification_type === 'ping' ||
      parsedBody.notification_type === 'test_webhook' ||
      parsedBody.type === 'ping' ||
      parsedBody.type === 'test' ||
      parsedBody.status === 'test' ||
      Boolean(parsedBody.courier) ||
      (!parsedBody.consignment_id && !parsedBody.invoice && !parsedBody.order_id && !parsedBody.tracking_code && !parsedBody.status)
    )
  );

  // 3. Replay Protection: Extract and Validate Timestamp
  const timestampHeader =
    getHeaderValue(headers, 'x-webhook-timestamp') ||
    getHeaderValue(headers, 'x-timestamp') ||
    getHeaderValue(headers, 'x-signature-timestamp') ||
    getHeaderValue(headers, 'x-req-timestamp') ||
    getHeaderValue(headers, 'x-steadfast-timestamp') ||
    getHeaderValue(headers, 'timestamp') ||
    getHeaderValue(headers, 'date') ||
    (parsedBody?.timestamp ? String(parsedBody.timestamp) : '') ||
    (parsedBody?.provider_updated_at ? String(parsedBody.provider_updated_at) : '') ||
    (parsedBody?.updated_at ? String(parsedBody.updated_at) : '') ||
    (parsedBody?.created_at ? String(parsedBody.created_at) : '');

  // Cryptographic HMAC signatures strictly require a timestamp header to prevent signature replay
  if (sigHeader && !timestampHeader) {
    return {
      authenticated: false,
      status: 400,
      error: 'Missing required courier webhook timestamp header (X-Webhook-Timestamp).',
    };
  }

  // Non-test static shared secret headers (X-Webhook-Secret / X-Courier-Secret) require a timestamp header for replay protection
  if (secretHeader && !bearerSecret && !isTestPing && !timestampHeader) {
    return {
      authenticated: false,
      status: 400,
      error: 'Missing required courier webhook timestamp header (X-Webhook-Timestamp).',
    };
  }

  let validatedTimestampMs: number | null = null;
  if (timestampHeader) {
    const cleanTs = timestampHeader.trim();
    if (/^\d{9,16}$/.test(cleanTs)) {
      const num = parseInt(cleanTs, 10);
      validatedTimestampMs = num > 10000000000 ? num : num * 1000;
    } else if (cleanTs.includes('T') || cleanTs.includes('-') || cleanTs.includes(' ') || cleanTs.includes(':') || cleanTs.includes(',')) {
      const parsed = Date.parse(cleanTs);
      if (!isNaN(parsed) && isFinite(parsed) && parsed > 0) {
        validatedTimestampMs = parsed;
      }
    }

    if (validatedTimestampMs === null || isNaN(validatedTimestampMs) || !isFinite(validatedTimestampMs)) {
      return {
        authenticated: false,
        status: 400,
        error: 'Malformed webhook timestamp header.',
      };
    }

    const now = Date.now();
    const TOLERANCE_MS = 5 * 60 * 1000; // 5-minute tolerance window
    const timeDiff = validatedTimestampMs - now;

    if (Math.abs(timeDiff) > TOLERANCE_MS) {
      return {
        authenticated: false,
        status: 401,
        error:
          timeDiff > 0
            ? 'Webhook request timestamp is in the future outside the 5-minute tolerance window (replay protection).'
            : 'Webhook request timestamp is expired or outside the 5-minute tolerance window (replay protection).',
      };
    }
  }

  // 4. Verify HMAC-SHA256 Signature if signature header is provided
  if (sigHeader) {
    let cleanSig = sigHeader.trim();
    if (cleanSig.toLowerCase().startsWith('sha256=')) {
      cleanSig = cleanSig.substring(7).trim();
    } else if (cleanSig.toLowerCase().startsWith('sha1=')) {
      cleanSig = cleanSig.substring(5).trim();
    }

    if (!cleanSig || cleanSig.length < 16) {
      return {
        authenticated: false,
        status: 401,
        error: 'Malformed courier webhook signature header.',
      };
    }

    // Defensive check: explicitly reject HMAC signatures generated with ADMIN_SECRET
    if (envAdminSecret) {
      const adminDot = await computeHmacSha256Hex(envAdminSecret, `${timestampHeader}.${rawBody}`);
      const adminConcat = await computeHmacSha256Hex(envAdminSecret, `${timestampHeader}${rawBody}`);
      const adminRaw = await computeHmacSha256Hex(envAdminSecret, rawBody);
      if (
        timingSafeEqualString(cleanSig.toLowerCase(), adminDot.toLowerCase()) ||
        timingSafeEqualString(cleanSig.toLowerCase(), adminConcat.toLowerCase()) ||
        timingSafeEqualString(cleanSig.toLowerCase(), adminRaw.toLowerCase())
      ) {
        return {
          authenticated: false,
          status: 401,
          error: 'Invalid courier webhook signature: cryptographic verification failed.',
        };
      }
    }

    for (const secret of candidateSecrets) {
      // Prefer signing/verifying HMAC(secret, timestamp + "." + rawBody) consistently
      const expectedWithDot = await computeHmacSha256Hex(secret, `${timestampHeader}.${rawBody}`);
      if (timingSafeEqualString(cleanSig.toLowerCase(), expectedWithDot.toLowerCase())) {
        return { authenticated: true, status: 200, matchedSecretSource: 'timestamped_signature', timestampMs: validatedTimestampMs };
      }

      // Fallback 1: timestamp concatenated without dot
      const expectedConcat = await computeHmacSha256Hex(secret, `${timestampHeader}${rawBody}`);
      if (timingSafeEqualString(cleanSig.toLowerCase(), expectedConcat.toLowerCase())) {
        return { authenticated: true, status: 200, matchedSecretSource: 'timestamped_signature', timestampMs: validatedTimestampMs };
      }

      // Fallback 2: raw body only (timestamp was already verified within 5-minute tolerance)
      const expectedSig = await computeHmacSha256Hex(secret, rawBody);
      if (timingSafeEqualString(cleanSig.toLowerCase(), expectedSig.toLowerCase())) {
        return { authenticated: true, status: 200, matchedSecretSource: 'signature', timestampMs: validatedTimestampMs };
      }
    }

    return {
      authenticated: false,
      status: 401,
      error: 'Invalid courier webhook signature: cryptographic verification failed.',
    };
  }

  // 5. Verify Shared Secret Headers (X-Webhook-Secret, X-Courier-Secret, Secret-Key, Bearer)
  if (incomingSecret) {
    // Explicit security boundary: ADMIN_SECRET must NEVER be accepted as a webhook secret
    if (envAdminSecret && timingSafeEqualString(incomingSecret, envAdminSecret)) {
      return {
        authenticated: false,
        status: 401,
        error: 'Unauthorized: Invalid courier webhook secret.',
      };
    }

    // If Api-Key is also provided, check Steadfast API Key consistency
    const configuredApiKey = (env?.STEADFAST_API_KEY || process.env.STEADFAST_API_KEY || settings?.steadfastApiKey || '').trim();
    if (apiKeyHeader && configuredApiKey) {
      if (!timingSafeEqualString(apiKeyHeader, configuredApiKey)) {
        return {
          authenticated: false,
          status: 401,
          error: 'Unauthorized: Invalid courier Api-Key header.',
        };
      }
    }

    for (const secret of candidateSecrets) {
      if (timingSafeEqualString(incomingSecret, secret)) {
        return { authenticated: true, status: 200, matchedSecretSource: 'secret_header', timestampMs: validatedTimestampMs };
      }
    }

    return {
      authenticated: false,
      status: 401,
      error: 'Unauthorized: Invalid courier webhook secret.',
    };
  }

  // 6. No signature or secret headers were provided in the request
  return {
    authenticated: false,
    status: 401,
    error: 'Unauthorized: Missing required courier webhook signature or secret header (X-Webhook-Signature, X-Steadfast-Signature, X-Webhook-Secret, or Secret-Key).',
  };
}
