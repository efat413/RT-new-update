import { StoreSettings, TrackingUserData, PixelEventLog } from '../types';

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
    ttq?: any;
    TiktokAnalyticsObject?: string;
    dataLayer?: any[];
  }
}

const PIXEL_LOGS_KEY = 'rongdhonu_pixel_logs_v1';
const MAX_LOGS = 40;

// ============================================================================
// 1. HIGH-ACCURACY CRYPTOGRAPHIC SHA-256 HASHING (Standard Bitwise Algorithm)
// ============================================================================

/**
 * Pure synchronous SHA-256 implementation conforming exactly to FIPS 180-4.
 * Guarantees zero-delay, synchronous hashing for immediate analytics triggers
 * without dropping user match data even before promises resolve.
 */
export function sha256Sync(ascii: string): string {
  if (!ascii) return '';

  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i: number, j: number;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isPrime: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isPrime[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isPrime[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  hash.length = 8;
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  for (i = 0; i < words[lengthProperty]; i += 16) {
    const w = words.slice(i, i + 16);
    const oldHash = hash.slice(0);
    for (j = 0; j < 64; j++) {
      const w15 = w[j - 15] || 0;
      const w2 = w[j - 2] || 0;
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[j] = j < 16 ? w[j] || 0 : ((w[j - 16] + s0 + w[j - 7] + s1) | 0);

      const s0_maj = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const t2 = (s0_maj + maj) | 0;

      const s1_ch = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const t1 = (hash[7] + s1_ch + ch + k[j] + w[j]) | 0;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + t1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (t1 + t2) | 0;
    }
    for (j = 0; j < 8; j++) {
      hash[j] = (hash[j] + oldHash[j]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

// ============================================================================
// 2. DATA SANITIZATION & ADVANCED MATCHING PREPARATION
// ============================================================================

/**
 * Sanitizes and normalizes email according to Meta & TikTok Advanced Matching specs:
 * 1. Trim leading/trailing whitespace
 * 2. Convert to lowercase
 */
export function sanitizeEmail(rawEmail?: string): string {
  if (!rawEmail) return '';
  return rawEmail.trim().toLowerCase();
}

/**
 * Sanitizes and normalizes phone numbers specifically for Bangladeshi numbers:
 * Converts '01712345678' -> '8801712345678' (E.164 without leading plus for Meta/TikTok hashing)
 * Strips all spaces, dashes, parentheses.
 */
export function sanitizeBangladeshPhone(rawPhone?: string): string {
  if (!rawPhone) return '';
  let digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('01') && digits.length === 11) {
    digits = '88' + digits;
  } else if (digits.startsWith('8801') && digits.length === 13) {
    // Already in 8801XXXXXXXXX format
  }
  return digits;
}

export interface HashedUserData {
  em?: string; // Hashed email
  ph?: string; // Hashed phone
  fn?: string; // Hashed first name
  ln?: string; // Hashed last name
  ct?: string; // Hashed city
  country?: string; // 'bd'
  external_id?: string;
  rawEmailPreview?: string;
  rawPhonePreview?: string;
}

/**
 * Prepares hashed user identifiers for Meta Advanced Matching & TikTok identify.
 */
export function prepareHashedUserData(userData?: TrackingUserData): HashedUserData | null {
  if (!userData) return null;

  const sanitizedEmail = sanitizeEmail(userData.email);
  const sanitizedPhone = sanitizeBangladeshPhone(userData.phone);

  const nameParts = (userData.fullName || '').trim().split(/\s+/);
  const firstName = userData.firstName || nameParts[0] || '';
  const lastName = userData.lastName || nameParts.slice(1).join(' ') || '';

  const hashed: HashedUserData = {
    country: 'bd',
  };

  let hasAnyData = false;

  if (sanitizedEmail) {
    hashed.em = sha256Sync(sanitizedEmail);
    hashed.rawEmailPreview = sanitizedEmail;
    hasAnyData = true;
  }

  if (sanitizedPhone) {
    hashed.ph = sha256Sync(sanitizedPhone);
    hashed.rawPhonePreview = sanitizedPhone;
    hasAnyData = true;
  }

  if (firstName) {
    hashed.fn = sha256Sync(firstName.toLowerCase().trim());
    hasAnyData = true;
  }

  if (lastName) {
    hashed.ln = sha256Sync(lastName.toLowerCase().trim());
    hasAnyData = true;
  }

  if (userData.district) {
    hashed.ct = sha256Sync(userData.district.toLowerCase().trim());
    hasAnyData = true;
  }

  return hasAnyData ? hashed : null;
}

// ============================================================================
// 3. DYNAMIC SDK INJECTION ENGINE (Zero Duplicate Scripts)
// ============================================================================

let currentLoadedMetaId: string | null = null;
let currentLoadedTikTokId: string | null = null;
let currentLoadedGtmId: string | null = null;

/**
 * Initializes or updates Meta (Facebook) Pixel SDK.
 */
export function initMetaPixel(pixelId: string, testEventCode?: string, hashedUser?: HashedUserData | null): boolean {
  if (typeof window === 'undefined' || !pixelId) return false;

  const cleanId = pixelId.trim();
  if (!cleanId) return false;

  // 1. Inject base snippet once if not already present
  if (!window.fbq) {
    (function(f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
      if (f.fbq) return;
      n = f.fbq = function() {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.id = 'rongdhonu-meta-pixel-script';
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      if (s && s.parentNode) {
        s.parentNode.insertBefore(t, s);
      } else {
        b.head.appendChild(t);
      }
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  }

  // 2. Initialize pixel with Advanced Matching parameters if available
  try {
    const initParams: Record<string, string> = {};
    if (hashedUser?.em) initParams.em = hashedUser.em;
    if (hashedUser?.ph) initParams.ph = hashedUser.ph;
    if (hashedUser?.fn) initParams.fn = hashedUser.fn;
    if (hashedUser?.ln) initParams.ln = hashedUser.ln;
    if (hashedUser?.ct) initParams.ct = hashedUser.ct;
    if (hashedUser?.country) initParams.country = hashedUser.country;

    if (currentLoadedMetaId !== cleanId) {
      window.fbq('init', cleanId, Object.keys(initParams).length > 0 ? initParams : undefined);
      currentLoadedMetaId = cleanId;
      // Authoritative PageView fired once upon successful SDK initialization
      window.fbq('track', 'PageView');
    } else if (Object.keys(initParams).length > 0) {
      // Re-feed user properties when user logs in or enters checkout
      window.fbq('setUserProperties', cleanId, initParams);
    }

    // Set test event code if provided for Meta Events Manager Test Events
    if (testEventCode?.trim()) {
      window.fbq('set', 'testEventCode', testEventCode.trim());
    }

    return true;
  } catch (err) {
    console.error('[Rongdhonu Pixels] Meta Pixel Init Error:', err);
    return false;
  }
}

/**
 * Initializes or updates TikTok Pixel SDK.
 */
export function initTikTokPixel(pixelId: string, testEventCode?: string, hashedUser?: HashedUserData | null): boolean {
  if (typeof window === 'undefined' || !pixelId) return false;

  const cleanId = pixelId.trim();
  if (!cleanId) return false;

  // 1. Inject base snippet if not present
  if (!window.ttq) {
    (function(w: any, d: any, t: any) {
      w.TiktokAnalyticsObject = t;
      const ttq = (w[t] = w[t] || []);
      ttq.methods = [
        'page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready',
        'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'
      ];
      ttq.setAndDefer = function(tMethod: any, eMethod: any) {
        tMethod[eMethod] = function() {
          tMethod.push([eMethod].concat(Array.prototype.slice.call(arguments, 0)));
        };
      };
      for (let i = 0; i < ttq.methods.length; i++) {
        ttq.setAndDefer(ttq, ttq.methods[i]);
      }
      ttq.instance = function(tInst: any) {
        const eInst = ttq._i[tInst] || [];
        for (let n = 0; n < ttq.methods.length; n++) {
          ttq.setAndDefer(eInst, ttq.methods[n]);
        }
        return eInst;
      };
      ttq.load = function(eId: any, nOpt: any) {
        const r = 'https://analytics.tiktok.com/i18n/pixel/events.js';
        ttq._i = ttq._i || {};
        ttq._i[eId] = [];
        ttq._i[eId]._u = r;
        ttq._t = ttq._t || {};
        ttq._t[eId] = +new Date();
        ttq._o = ttq._o || {};
        ttq._o[eId] = nOpt || {};
        const s = document.createElement('script');
        s.type = 'text/javascript';
        s.async = true;
        s.id = 'rongdhonu-tiktok-pixel-script';
        s.src = r + '?sdkid=' + eId + '&lib=' + t;
        const first = document.getElementsByTagName('script')[0];
        if (first && first.parentNode) {
          first.parentNode.insertBefore(s, first);
        } else {
          document.head.appendChild(s);
        }
      };
    })(window, document, 'ttq');
  }

  // 2. Load the specific pixel ID
  try {
    if (currentLoadedTikTokId !== cleanId) {
      window.ttq.load(cleanId);
      currentLoadedTikTokId = cleanId;
    }

    // Identify user data for higher match quality
    if (hashedUser && (hashedUser.em || hashedUser.ph)) {
      window.ttq.identify({
        email: hashedUser.em,
        phone_number: hashedUser.ph,
      });
    }

    return true;
  } catch (err) {
    console.error('[Rongdhonu Pixels] TikTok Pixel Init Error:', err);
    return false;
  }
}

/**
 * Initializes or updates Google Tag Manager (GTM) Container.
 */
export function initGtm(gtmId: string): boolean {
  if (typeof window === 'undefined' || !gtmId) return false;

  let cleanId = gtmId.trim().toUpperCase();
  if (cleanId && !cleanId.startsWith('GTM-') && /^[A-Z0-9]+$/.test(cleanId)) {
    cleanId = `GTM-${cleanId}`;
  }
  if (!cleanId) return false;

  window.dataLayer = window.dataLayer || [];

  if (currentLoadedGtmId !== cleanId) {
    const existingScript = document.getElementById('rongdhonu-gtm-script');
    if (existingScript && existingScript.parentNode) {
      existingScript.parentNode.removeChild(existingScript);
    }

    // Google Tag Manager standard asynchronous bootstrap loader
    (function(w: any, d: Document, s: string, l: string, i: string) {
      w[l] = w[l] || [];
      w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      const f = d.getElementsByTagName(s)[0];
      const j = d.createElement(s) as HTMLScriptElement;
      const dl = l !== 'dataLayer' ? `&l=${l}` : '';
      j.id = 'rongdhonu-gtm-script';
      j.async = true;
      j.src = `https://www.googletagmanager.com/gtm.js?id=${i}${dl}`;
      if (f && f.parentNode) {
        f.parentNode.insertBefore(j, f);
      } else {
        d.head.appendChild(j);
      }
    })(window, document, 'script', 'dataLayer', cleanId);

    // GTM noscript iframe support
    if (document.body) {
      const existingNoScript = document.getElementById('rongdhonu-gtm-noscript');
      if (existingNoScript && existingNoScript.parentNode) {
        existingNoScript.parentNode.removeChild(existingNoScript);
      }
      const noscript = document.createElement('noscript');
      noscript.id = 'rongdhonu-gtm-noscript';
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.googletagmanager.com/ns.html?id=${cleanId}`;
      iframe.height = '0';
      iframe.width = '0';
      iframe.style.display = 'none';
      iframe.style.visibility = 'hidden';
      noscript.appendChild(iframe);
      document.body.insertBefore(noscript, document.body.firstChild);
    }

    currentLoadedGtmId = cleanId;
  }

  return true;
}

/**
 * Sync all active pixel SDKs based on StoreSettings.
 */
export function syncPixelScripts(settings: StoreSettings, currentUserData?: TrackingUserData | null): void {
  if (typeof window === 'undefined') return;

  if (settings.trackingEnabled === false) {
    if (settings.trackingDebugMode) {
      console.log('[Rongdhonu Pixels] Master tracking is DISABLED in Store Settings.');
    }
    return;
  }

  const hashedUser = settings.advancedMatchingEnabled !== false ? prepareHashedUserData(currentUserData || undefined) : null;

  if (settings.fbPixelId) {
    initMetaPixel(settings.fbPixelId, settings.fbTestEventCode, hashedUser);
  }

  if (settings.tiktokPixelId) {
    initTikTokPixel(settings.tiktokPixelId, settings.tiktokTestEventCode, hashedUser);
  }

  if (settings.gtmId) {
    initGtm(settings.gtmId);
  }
}

// ============================================================================
// 4. EVENT LOGGING & PERSISTENCE
// ============================================================================

export function getStoredPixelLogs(): PixelEventLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PIXEL_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePixelLog(log: PixelEventLog): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getStoredPixelLogs();
    const updated = [log, ...existing].slice(0, MAX_LOGS);
    localStorage.setItem(PIXEL_LOGS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('rongdhonu_pixel_log_update', { detail: log }));
  } catch (err) {
    console.error('[Rongdhonu Pixels] Log save error:', err);
  }
}

export function clearStoredPixelLogs(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PIXEL_LOGS_KEY);
    window.dispatchEvent(new CustomEvent('rongdhonu_pixel_log_update', { detail: null }));
  } catch (err) {
    console.error('[Rongdhonu Pixels] Log clear error:', err);
  }
}

// ============================================================================
// 5. HIGH-ACCURACY SOCIAL EVENT SYNCHRONIZATION
// ============================================================================

export interface TrackEventOptions {
  eventName: 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase' | 'Search' | 'AddToWishlist' | 'Contact' | string;
  params?: Record<string, any>;
  userData?: TrackingUserData | null;
  settings?: StoreSettings;
}

function getStoredOrFallbackSettings(): StoreSettings {
  try {
    const saved = localStorage.getItem('rongdhonu_settings_v1') || localStorage.getItem('rongdhonu_settings');
    if (saved) return JSON.parse(saved);
  } catch {}
  return {
    siteName: 'Rongdhonu Trade',
    currencySymbol: '৳',
    trackingEnabled: true,
    advancedMatchingEnabled: true,
    trackingDebugMode: false,
  } as StoreSettings;
}

/**
 * Universal Event Dispatcher: Syncs across Meta Pixel, TikTok Pixel, and GTM dataLayer
 * with standardized Bangladeshi Taka currency (BDT) and optional SHA-256 Advanced Matching.
 */
export function trackSocialEvent(
  optionsOrEventName: TrackEventOptions | string,
  maybeParams?: Record<string, any>,
  maybeUserData?: TrackingUserData | null,
  maybeSettings?: StoreSettings
): PixelEventLog {
  let eventName: string;
  let params: Record<string, any>;
  let userData: TrackingUserData | null | undefined;
  let settings: StoreSettings;

  if (typeof optionsOrEventName === 'string') {
    eventName = optionsOrEventName;
    params = maybeParams || {};
    userData = maybeUserData;
    settings = maybeSettings || getStoredOrFallbackSettings();
  } else {
    eventName = optionsOrEventName.eventName;
    params = optionsOrEventName.params || {};
    userData = optionsOrEventName.userData;
    settings = optionsOrEventName.settings || getStoredOrFallbackSettings();
  }

  const isEnabled = settings.trackingEnabled !== false;
  const isDebug = settings.trackingDebugMode === true;
  const platformsReached: ('meta' | 'tiktok' | 'gtm')[] = [];

  // 1. Prepare Advanced Matching User Data
  let hashedUser: HashedUserData | null = null;
  let userDataSummary = '';

  if (settings.advancedMatchingEnabled !== false && userData) {
    hashedUser = prepareHashedUserData(userData);
    if (hashedUser) {
      const summaryItems: string[] = [];
      if (hashedUser.em) summaryItems.push(`Email (${hashedUser.rawEmailPreview || '***'})`);
      if (hashedUser.ph) summaryItems.push(`Phone (${hashedUser.rawPhonePreview || '***'})`);
      if (hashedUser.fn) summaryItems.push('First Name');
      userDataSummary = summaryItems.join(', ');
    }
  }

  // Guarantee BDT currency standard
  const standardParams: Record<string, any> = {
    ...params,
    currency: params.currency || 'BDT',
  };

  if (!isEnabled) {
    if (isDebug) {
      console.log(`[Rongdhonu Pixels] Skipped ${eventName} (Tracking disabled)`);
    }
    const skippedLog: PixelEventLog = {
      id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toLocaleTimeString(),
      eventName,
      platforms: [],
      status: 'skipped',
      hasUserData: !!userDataSummary,
      userDataSummary,
      value: standardParams.value,
      currency: standardParams.currency,
      payload: standardParams,
    };
    savePixelLog(skippedLog);
    return skippedLog;
  }

  // 2. Meta (Facebook) Pixel Dispatch
  if (settings.fbPixelId) {
    try {
      initMetaPixel(settings.fbPixelId, settings.fbTestEventCode, hashedUser);
      if (window.fbq) {
        if (eventName === 'PageView') {
          window.fbq('track', 'PageView');
        } else {
          window.fbq('track', eventName, standardParams);
        }
        platformsReached.push('meta');
      }
    } catch (err) {
      console.error('[Rongdhonu Pixels] Meta dispatch error:', err);
    }
  }

  // 3. TikTok Pixel Dispatch
  if (settings.tiktokPixelId) {
    try {
      initTikTokPixel(settings.tiktokPixelId, settings.tiktokTestEventCode, hashedUser);
      if (window.ttq) {
        if (eventName === 'PageView') {
          window.ttq.page();
          platformsReached.push('tiktok');
        } else {
          // Map to TikTok standard event names
          let ttEvent = eventName;
          if (eventName === 'Purchase') ttEvent = 'CompletePayment';

          const ttParams: Record<string, any> = {
            content_type: standardParams.content_type || 'product',
            value: standardParams.value,
            currency: standardParams.currency || 'BDT',
          };

          if (standardParams.contents) {
            ttParams.contents = standardParams.contents;
          } else if (standardParams.content_ids) {
            ttParams.contents = (standardParams.content_ids as string[]).map((id) => ({
              content_id: id,
              content_name: standardParams.content_name || 'Product',
              price: standardParams.value,
              quantity: standardParams.quantity || 1,
            }));
          }

          window.ttq.track(ttEvent, ttParams);
          platformsReached.push('tiktok');
        }
      }
    } catch (err) {
      console.error('[Rongdhonu Pixels] TikTok dispatch error:', err);
    }
  }

  // 4. Google Tag Manager (GTM) dataLayer Push
  if (settings.gtmId) {
    try {
      initGtm(settings.gtmId);
      if (window.dataLayer) {
        const gtmPayload: Record<string, any> = {
          event: eventName,
          ecommerce: {
            currency: standardParams.currency,
            value: standardParams.value,
            items: standardParams.contents || standardParams.content_ids,
          },
        };
        if (hashedUser) {
          gtmPayload.user_data = {
            sha256_email: hashedUser.em,
            sha256_phone_number: hashedUser.ph,
          };
        }
        window.dataLayer.push(gtmPayload);
        platformsReached.push('gtm');
      }
    } catch (err) {
      console.error('[Rongdhonu Pixels] GTM dispatch error:', err);
    }
  }

  // 5. Console Debug Logging (when enabled)
  if (isDebug) {
    console.groupCollapsed(
      `%c[Rongdhonu Pixels] 🎯 ${eventName} %c${platformsReached.join(', ').toUpperCase() || 'NO TARGETS'}`,
      'color: #0284c7; font-weight: bold;',
      'color: #10b981; font-weight: bold;'
    );
    console.log('Platforms:', platformsReached);
    console.log('Payload:', standardParams);
    if (hashedUser) {
      console.log('Advanced Matching (Hashed):', hashedUser);
    }
    console.groupEnd();
  }

  // 6. Record in Event Activity Log
  const eventLog: PixelEventLog = {
    id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toLocaleTimeString(),
    eventName,
    platforms: platformsReached,
    status: platformsReached.length > 0 ? 'success' : 'queued',
    hasUserData: !!userDataSummary,
    userDataSummary,
    value: standardParams.value,
    currency: standardParams.currency,
    payload: standardParams,
  };

  savePixelLog(eventLog);
  return eventLog;
}
