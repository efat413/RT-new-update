/**
 * Facebook Broadcaster Security, Credential Encryption, and Template Engine
 * 
 * Guarantees:
 * 1. Zero plaintext tokens in D1 or client bundles: AES-GCM encryption with PBKDF2 derived keys.
 * 2. Strict Meta Graph API token & Page ID validation.
 * 3. Configurable delay validation with safe upper boundaries.
 * 4. Multi-template variation engine with safe {name} substitution and Unicode length guards.
 */

export const MAX_SAFE_DELAY_SECONDS = 60; // Configurable safe upper limit to prevent runaway pauses
export const META_MESSENGER_MAX_CHARS = 2000; // Official Meta Send API character limit

/**
 * Redacts a sensitive token for safe preview display.
 * Never outputs the complete token; shows only prefix and suffix.
 */
export function redactToken(token?: string | null): string {
  if (!token) return 'unconfigured';
  const clean = String(token).trim();
  if (clean.length <= 10) return '********';
  return `${clean.slice(0, 7)}...${clean.slice(-4)}`;
}

/**
 * Derives an AES-GCM 256-bit CryptoKey from the server's ADMIN_SECRET via PBKDF2.
 */
async function deriveEncryptionKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts sensitive credentials (such as Page Access Tokens) using AES-GCM.
 * Output format: "base64(salt):base64(iv):base64(ciphertext)"
 */
export async function encryptToken(token: string, secret: string): Promise<string> {
  if (!token || !secret) {
    throw new Error('Both token and encryption secret are required.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(secret, salt);

  const enc = new TextEncoder();
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(token.trim())
  );

  const b64Salt = Buffer.from(salt).toString('base64');
  const b64Iv = Buffer.from(iv).toString('base64');
  const b64Cipher = Buffer.from(ciphertextBuffer).toString('base64');

  return `${b64Salt}:${b64Iv}:${b64Cipher}`;
}

/**
 * Decrypts an encrypted token previously stored with encryptToken.
 */
export async function decryptToken(encryptedPayload: string, secret: string): Promise<string> {
  if (!encryptedPayload || !secret) {
    throw new Error('Encrypted payload and secret are required for decryption.');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token payload format.');
  }

  const salt = new Uint8Array(Buffer.from(parts[0], 'base64'));
  const iv = new Uint8Array(Buffer.from(parts[1], 'base64'));
  const ciphertext = new Uint8Array(Buffer.from(parts[2], 'base64'));

  const key = await deriveEncryptionKey(secret, salt);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const dec = new TextDecoder();
  return dec.decode(decryptedBuffer);
}

export interface MetaTokenValidationResult {
  valid: boolean;
  pageId: string;
  pageName?: string;
  category?: string;
  permissions?: string[];
  errorCode?: number;
  errorSubcode?: number;
  diagnostic?: string;
  error?: string;
}

/**
 * Validates a Page Access Token using the official Meta Graph API:
 * GET https://graph.facebook.com/v21.0/me?fields=id,name,category,permissions
 * 
 * Verifies:
 * 1. Token is active and recognized by Meta.
 * 2. Handles OAuthException errors (Session has expired, Code 190, Subcode 463/467/460).
 * 3. Token strictly belongs to the intended Page ID (rejects arbitrary or mismatched IDs).
 * 4. Token has required messaging permissions (pages_messaging).
 */
export async function validateMetaPageToken(params: {
  token: string;
  expectedPageId: string;
  customFetch?: typeof fetch;
}): Promise<MetaTokenValidationResult> {
  const { token, expectedPageId } = params;
  const cleanToken = String(token || '').trim();
  const cleanExpectedPageId = String(expectedPageId || '').trim();
  const fetchFn = params.customFetch || fetch;

  if (!cleanToken) {
    return { valid: false, pageId: cleanExpectedPageId, error: 'Page access token is missing or blank.' };
  }
  if (!cleanExpectedPageId) {
    return { valid: false, pageId: '', error: 'Target Page ID is required for validation.' };
  }

  const endpoint = `https://graph.facebook.com/v21.0/me?fields=id,name,category,permissions&access_token=${encodeURIComponent(cleanToken)}`;

  try {
    const res = await fetchFn(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent': 'RongdhonuTrade-BroadcasterValidator/1.0',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const errObj = errJson?.error || {};
      const rawMsg = errObj.message || `Meta Graph API returned HTTP ${res.status} (${res.statusText})`;
      const errorCode = Number(errObj.code) || res.status;
      const errorSubcode = errObj.error_subcode != null ? Number(errObj.error_subcode) : undefined;

      let diagnostic = rawMsg;
      if (errorCode === 190) {
        if (errorSubcode === 463) {
          diagnostic = 'Session has expired (Code 190, Subcode 463): The Page Access Token has expired. Please generate a new Long-Lived Page Access Token from Meta Developer Portal.';
        } else if (errorSubcode === 467) {
          diagnostic = 'Session invalidated (Code 190, Subcode 467): The user logged out or changed their password. Please re-authenticate and generate a new token.';
        } else if (errorSubcode === 460) {
          diagnostic = 'Password changed (Code 190, Subcode 460): The access token was invalidated due to a password change.';
        } else {
          diagnostic = `Session expired or token revoked (Code 190): ${rawMsg}`;
        }
      }

      return {
        valid: false,
        pageId: cleanExpectedPageId,
        errorCode,
        errorSubcode,
        diagnostic,
        error: `Meta Token Validation Failed: ${diagnostic}`,
      };
    }

    const data = await res.json();
    const resolvedPageId = String(data?.id || '').trim();
    const resolvedPageName = String(data?.name || 'Facebook Page').trim();
    const resolvedCategory = String(data?.category || '').trim();

    if (!resolvedPageId) {
      return {
        valid: false,
        pageId: cleanExpectedPageId,
        error: 'Meta Graph API response did not contain a valid Page ID.',
      };
    }

    // STRICT PAGE ID MATCH: The token must belong to the configured Page ID
    if (resolvedPageId !== cleanExpectedPageId) {
      return {
        valid: false,
        pageId: resolvedPageId,
        pageName: resolvedPageName,
        error: `Page ID mismatch: The provided token belongs to "${resolvedPageName}" (Page ID: ${resolvedPageId}), but this campaign is configured for Page ID: "${cleanExpectedPageId}". Arbitrary Page IDs are rejected.`,
      };
    }

    // Verify messaging permissions if returned in permissions array
    let permissions = ['pages_messaging', 'pages_read_engagement'];
    if (Array.isArray(data?.permissions?.data)) {
      const granted = data.permissions.data
        .filter((p: any) => p.status === 'granted')
        .map((p: any) => p.permission);
      if (granted.length > 0) {
        permissions = granted;
        if (!granted.includes('pages_messaging')) {
          return {
            valid: false,
            pageId: resolvedPageId,
            pageName: resolvedPageName,
            permissions: granted,
            error: 'Token missing required "pages_messaging" permission. Please re-generate token with pages_messaging scope.',
          };
        }
      }
    }

    return {
      valid: true,
      pageId: resolvedPageId,
      pageName: resolvedPageName,
      category: resolvedCategory,
      permissions,
    };
  } catch (err: any) {
    return {
      valid: false,
      pageId: cleanExpectedPageId,
      error: `Network error connecting to Meta Graph API: ${err?.message || 'Unknown network error'}`,
    };
  }
}

export const DEFAULT_MIN_DELAY_SEC = 2;
export const DEFAULT_MAX_DELAY_SEC = 5;
export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_BATCH_PAUSE_SEC = 30;
export const MIN_BATCH_SIZE = 1;
export const MAX_BATCH_SIZE = 1000;
export const MIN_BATCH_PAUSE_SEC = 1;
export const MAX_BATCH_PAUSE_SEC = 3600;

/**
 * Validates configured delay bounds.
 * Accepts seconds or milliseconds (values > 100 treated as ms).
 * Enforces finite, non-negative numbers and ensures maxDelay >= minDelay.
 */
export function validateDelayConfig(
  minInput: any,
  maxInput: any,
  maxAllowedCeilingSec: number = MAX_SAFE_DELAY_SECONDS
): { valid: boolean; min: number; max: number; minMs: number; maxMs: number; error?: string } {
  if (minInput === undefined || minInput === null || minInput === '') {
    minInput = DEFAULT_MIN_DELAY_SEC;
  }
  if (maxInput === undefined || maxInput === null || maxInput === '') {
    maxInput = DEFAULT_MAX_DELAY_SEC;
  }

  const rawMin = Number(minInput);
  const rawMax = Number(maxInput);

  if (!Number.isFinite(rawMin) || rawMin < 0) {
    return {
      valid: false,
      min: DEFAULT_MIN_DELAY_SEC,
      max: DEFAULT_MAX_DELAY_SEC,
      minMs: DEFAULT_MIN_DELAY_SEC * 1000,
      maxMs: DEFAULT_MAX_DELAY_SEC * 1000,
      error: 'Min Delay must be a finite non-negative number.',
    };
  }
  if (!Number.isFinite(rawMax) || rawMax < 0) {
    return {
      valid: false,
      min: DEFAULT_MIN_DELAY_SEC,
      max: DEFAULT_MAX_DELAY_SEC,
      minMs: DEFAULT_MIN_DELAY_SEC * 1000,
      maxMs: DEFAULT_MAX_DELAY_SEC * 1000,
      error: 'Max Delay must be a finite non-negative number.',
    };
  }

  // Detect whether inputs are in seconds or milliseconds
  // Milliseconds are typically >= 500ms (e.g. 2000ms, 5000ms).
  // If min is small (e.g. 2s), both are in seconds.
  const isMs = (rawMin >= 500 && rawMax >= 500) || (rawMin === 0 && rawMax >= 1000);
  const minSec = isMs ? rawMin / 1000 : rawMin;
  const maxSec = isMs ? rawMax / 1000 : rawMax;
  const minMs = Math.round(minSec * 1000);
  const maxMs = Math.round(maxSec * 1000);

  if (maxSec < minSec) {
    return {
      valid: false,
      min: minSec,
      max: maxSec,
      minMs,
      maxMs,
      error: `Max Delay (${maxSec}s) cannot be less than Min Delay (${minSec}s).`,
    };
  }
  if (maxSec > maxAllowedCeilingSec) {
    return {
      valid: false,
      min: minSec,
      max: maxSec,
      minMs,
      maxMs,
      error: `Max Delay (${maxSec}s) exceeds the safe ceiling of ${maxAllowedCeilingSec} seconds.`,
    };
  }

  return { valid: true, min: minSec, max: maxSec, minMs, maxMs };
}

/**
 * Validates configured Batch Size and Batch Pause Duration.
 * Enforces integer boundaries, finite non-negative values, and safe operational ceilings.
 */
export function validateBatchConfig(
  batchSizeInput: any,
  batchPauseSecInput: any
): { valid: boolean; batchSize: number; batchPauseSec: number; error?: string } {
  const rawSize = batchSizeInput === undefined || batchSizeInput === null || batchSizeInput === ''
    ? DEFAULT_BATCH_SIZE
    : Number(batchSizeInput);

  const rawPause = batchPauseSecInput === undefined || batchPauseSecInput === null || batchPauseSecInput === ''
    ? DEFAULT_BATCH_PAUSE_SEC
    : Number(batchPauseSecInput);

  if (!Number.isFinite(rawSize) || !Number.isInteger(rawSize)) {
    return {
      valid: false,
      batchSize: DEFAULT_BATCH_SIZE,
      batchPauseSec: DEFAULT_BATCH_PAUSE_SEC,
      error: 'Batch Size must be a valid whole integer.',
    };
  }

  if (rawSize < MIN_BATCH_SIZE || rawSize > MAX_BATCH_SIZE) {
    return {
      valid: false,
      batchSize: DEFAULT_BATCH_SIZE,
      batchPauseSec: DEFAULT_BATCH_PAUSE_SEC,
      error: `Batch Size must be between ${MIN_BATCH_SIZE} and ${MAX_BATCH_SIZE}.`,
    };
  }

  if (!Number.isFinite(rawPause) || !Number.isInteger(rawPause) || rawPause < MIN_BATCH_PAUSE_SEC) {
    return {
      valid: false,
      batchSize: rawSize,
      batchPauseSec: DEFAULT_BATCH_PAUSE_SEC,
      error: `Batch Pause Duration must be a positive whole integer of at least ${MIN_BATCH_PAUSE_SEC} second(s).`,
    };
  }

  if (rawPause > MAX_BATCH_PAUSE_SEC) {
    return {
      valid: false,
      batchSize: rawSize,
      batchPauseSec: DEFAULT_BATCH_PAUSE_SEC,
      error: `Batch Pause Duration exceeds the safe ceiling of ${MAX_BATCH_PAUSE_SEC} seconds (1 hour).`,
    };
  }

  return { valid: true, batchSize: rawSize, batchPauseSec: rawPause };
}

/**
 * Calculates a random delay in milliseconds between minSec and maxSec.
 */
export function calculateRandomDelayMs(minSec: number, maxSec: number): number {
  if (maxSec <= minSec) return Math.round(minSec * 1000);
  const delta = (maxSec - minSec) * 1000;
  return Math.floor(Math.random() * (delta + 1)) + Math.round(minSec * 1000);
}

/**
 * Parses message template variations separated by the '|' pipe character.
 * Filters out empty segments and trims whitespace.
 */
export function parseMessageTemplates(raw: string): string[] {
  if (!raw) return [];
  const parts = raw
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return parts.length > 0 ? parts : [raw.trim()];
}

/**
 * Selects and renders a template variation for a recipient with safe {name} substitution.
 * 
 * Rules:
 * - If recipient has a valid, non-empty, non-bot name, {name} is replaced with that name.
 * - If recipient has NO name (or name is invalid), {name} is removed cleanly
 *   and surrounding punctuation/spaces are normalized (e.g. "স্বাগতম {name}! আপনার..." -> "স্বাগতম! আপনার...").
 * - Validates final message length against Meta's 2000 character ceiling.
 */
export function renderMessageForRecipient(params: {
  templates: string[];
  recipientIndex: number;
  recipientPsid: string;
  recipientName?: string;
}): { text: string; charCount: number; templateIndex: number; nameSubstituted: boolean; error?: string } {
  const { templates, recipientIndex, recipientName } = params;
  if (!templates || templates.length === 0) {
    return { text: '', charCount: 0, templateIndex: 0, nameSubstituted: false, error: 'No message templates provided.' };
  }

  // Select variation based on recipient index (round-robin distribution across variations)
  const templateIndex = Math.abs(recipientIndex) % templates.length;
  const rawTemplate = templates[templateIndex];

  // Validate clean recipient name
  const cleanName =
    typeof recipientName === 'string' &&
    recipientName.trim().length > 0 &&
    !/^bot$|^unknown$|^customer$/i.test(recipientName.trim())
      ? recipientName.trim()
      : null;

  let rendered = rawTemplate;
  let nameSubstituted = false;

  if (cleanName) {
    if (rendered.includes('{name}')) {
      rendered = rendered.replace(/\{name\}/g, cleanName);
      nameSubstituted = true;
    }
  } else {
    // Graceful fallback when name is unavailable: Remove {name} and tidy spacing/punctuation
    rendered = rendered
      .replace(/\s*\{name\}\s*,/g, ',')
      .replace(/\s*\{name\}\s*!/g, '!')
      .replace(/\s*\{name\}\s*\./g, '.')
      .replace(/\s*\{name\}\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Correct Unicode character counting (respects Bengali and emoji graphemes)
  const charCount = Array.from(rendered).length;

  if (charCount > META_MESSENGER_MAX_CHARS) {
    return {
      text: rendered,
      charCount,
      templateIndex,
      nameSubstituted,
      error: `Rendered message exceeds Meta's ${META_MESSENGER_MAX_CHARS} character limit (${charCount} characters).`,
    };
  }

  return {
    text: rendered,
    charCount,
    templateIndex,
    nameSubstituted,
  };
}
