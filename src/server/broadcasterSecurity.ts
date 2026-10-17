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
  error?: string;
}

/**
 * Validates a Page Access Token using the official Meta Graph API:
 * GET https://graph.facebook.com/v21.0/me?fields=id,name,category
 * 
 * Verifies:
 * 1. Token is active and recognized by Meta.
 * 2. Token strictly belongs to the intended Page ID (rejects arbitrary or mismatched IDs).
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

  const endpoint = `https://graph.facebook.com/v21.0/me?fields=id,name,category&access_token=${encodeURIComponent(cleanToken)}`;

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
      const errMsg =
        errJson?.error?.message ||
        `Meta Graph API returned HTTP ${res.status} (${res.statusText})`;
      return {
        valid: false,
        pageId: cleanExpectedPageId,
        error: `Meta Token Validation Failed: ${errMsg}`,
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

    return {
      valid: true,
      pageId: resolvedPageId,
      pageName: resolvedPageName,
      category: resolvedCategory,
      permissions: ['pages_messaging', 'pages_read_engagement'],
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
 * Enforces finite, non-negative numbers and ensures maxDelay >= minDelay.
 */
export function validateDelayConfig(
  minSec: any,
  maxSec: any,
  maxAllowedCeiling: number = MAX_SAFE_DELAY_SECONDS
): { valid: boolean; min: number; max: number; error?: string } {
  if (minSec === undefined || minSec === null || minSec === '') {
    minSec = DEFAULT_MIN_DELAY_SEC;
  }
  if (maxSec === undefined || maxSec === null || maxSec === '') {
    maxSec = DEFAULT_MAX_DELAY_SEC;
  }
  const min = Number(minSec);
  const max = Number(maxSec);

  if (!Number.isFinite(min) || min < 0) {
    return { valid: false, min: DEFAULT_MIN_DELAY_SEC, max: DEFAULT_MAX_DELAY_SEC, error: 'Min Delay must be a finite non-negative number of seconds.' };
  }
  if (!Number.isFinite(max) || max < 0) {
    return { valid: false, min: DEFAULT_MIN_DELAY_SEC, max: DEFAULT_MAX_DELAY_SEC, error: 'Max Delay must be a finite non-negative number of seconds.' };
  }
  if (max < min) {
    return { valid: false, min, max, error: `Max Delay (${max}s) cannot be less than Min Delay (${min}s).` };
  }
  if (max > maxAllowedCeiling) {
    return {
      valid: false,
      min,
      max,
      error: `Max Delay exceeds the safe ceiling of ${maxAllowedCeiling} seconds.`,
    };
  }

  return { valid: true, min, max };
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
