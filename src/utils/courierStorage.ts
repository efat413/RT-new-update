import { CourierApiConfig } from '../types';

export const ALLOWED_COURIER_METADATA_KEYS = new Set([
  'id',
  'name',
  'code',
  'baseUrl',
  'trackingUrlPattern',
  'isActive',
  'triggerWebhookOnAdd',
]);

export const FORBIDDEN_CREDENTIAL_KEYS = [
  'apiKey',
  'secretKey',
  'steadfastApiKey',
  'steadfastSecretKey',
  'webhookSecret',
  'secret',
  'authorization',
  'token',
  'password',
  'COURIER_WEBHOOK_SECRET',
];

/**
 * Strips all credential fields and retains only non-sensitive metadata for CourierApiConfig.
 * Strictly enforces Requirement D: id, name, code, baseUrl, trackingUrlPattern, isActive, triggerWebhookOnAdd.
 */
export function sanitizeCourierConfig(raw: any): CourierApiConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `courier-${Date.now()}`,
      name: 'Courier',
      code: 'courier',
      baseUrl: '',
      trackingUrlPattern: '',
      isActive: false,
      triggerWebhookOnAdd: false,
    };
  }

  const sanitized: CourierApiConfig = {
    id: String(raw.id || `courier-${Date.now()}`),
    name: String(raw.name || ''),
    code: String(raw.code || ''),
    baseUrl: raw.baseUrl ? String(raw.baseUrl).trim() : undefined,
    trackingUrlPattern: String(raw.trackingUrlPattern || ''),
    isActive: Boolean(raw.isActive),
    triggerWebhookOnAdd: raw.triggerWebhookOnAdd !== undefined ? Boolean(raw.triggerWebhookOnAdd) : true,
  };

  // Strictly ensure no credentials or unauthorized fields exist
  for (const forbidden of FORBIDDEN_CREDENTIAL_KEYS) {
    delete (sanitized as any)[forbidden];
  }

  return sanitized;
}

/**
 * Sanitizes an array of courier configs, ensuring zero credential fields are present.
 */
export function sanitizeCourierConfigs(configs: any[]): CourierApiConfig[] {
  if (!Array.isArray(configs)) return [];
  return configs.map(sanitizeCourierConfig);
}

/**
 * Strips all sensitive credentials from any raw settings object before browser persistence.
 */
export function sanitizeSettingsForBrowserStorage(settings: any): any {
  if (!settings || typeof settings !== 'object') return settings;
  const copy = { ...settings };
  delete copy.steadfastApiKey;
  delete copy.steadfastSecretKey;
  delete copy.webhookSecret;
  delete copy.secret;
  return copy;
}

/**
 * Sanitizes courier webhooks before browser persistence (removes secret fields).
 */
export function sanitizeWebhooksForBrowserStorage(webhooks: any[]): any[] {
  if (!Array.isArray(webhooks)) return [];
  return webhooks.map((w) => {
    if (!w || typeof w !== 'object') return w;
    const copy = { ...w };
    delete copy.secret;
    delete copy.webhookSecret;
    return copy;
  });
}

/**
 * Scans all browser localStorage and sessionStorage, stripping and purging all credentials.
 * Ensures:
 * 1. courierConfigs contains no apiKey or secretKey.
 * 2. settings contains no steadfastApiKey or steadfastSecretKey.
 * 3. courierWebhooks contains no secret or webhookSecret.
 * 4. Any orphan keys with credential names are removed.
 */
export function sanitizeAllBrowserStorage(): void {
  if (typeof window === 'undefined') return;

  const storageTargets: Storage[] = [];
  try {
    if (window.localStorage) storageTargets.push(window.localStorage);
  } catch {}
  try {
    if (window.sessionStorage) storageTargets.push(window.sessionStorage);
  } catch {}

  for (const storage of storageTargets) {
    try {
      // 1. Sanitize courier configurations
      const courierKeys = ['rongdhonu_couriers_v1', 'rongdhonu_couriers'];
      for (const k of courierKeys) {
        const raw = storage.getItem(k);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const sanitized = sanitizeCourierConfigs(Array.isArray(parsed) ? parsed : []);
            storage.setItem(k, JSON.stringify(sanitized));
          } catch {
            storage.removeItem(k);
          }
        }
      }

      // 2. Sanitize settings
      const settingsKeys = ['rongdhonu_settings_v1', 'rongdhonu_settings'];
      for (const k of settingsKeys) {
        const raw = storage.getItem(k);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const sanitized = sanitizeSettingsForBrowserStorage(parsed);
            storage.setItem(k, JSON.stringify(sanitized));
          } catch {}
        }
      }

      // 3. Sanitize courier webhooks
      const webhookKeys = ['rongdhonu_courier_webhooks_v1', 'rongdhonu_courier_webhooks'];
      for (const k of webhookKeys) {
        const raw = storage.getItem(k);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const sanitized = sanitizeWebhooksForBrowserStorage(parsed);
            storage.setItem(k, JSON.stringify(sanitized));
          } catch {}
        }
      }

      // 4. Purge any orphan storage entries containing credential patterns
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && (/steadfast.*key|apiKey|secretKey|courier.*secret|webhook.*secret/i.test(key))) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        storage.removeItem(key);
      }
    } catch (e) {
      console.warn('Browser storage sanitization warning:', e);
    }
  }
}
