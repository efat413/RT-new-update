/**
 * Authoritative production security headers for Rongdhonu Trade.
 * Formulated to strictly permit Meta Pixel, TikTok Pixel, Google Analytics/GTM,
 * Steadfast Courier API, and YouTube embeds without security weakening.
 */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'sha256-AjqrFSwlY5H5Xu7BDNjDp96JBtKMjTBx0PeEEAXqxn0=' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://analytics.tiktok.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://images.unsplash.com https://i.pinimg.com https://img.youtube.com https://api.qrserver.com https://www.facebook.com https://connect.facebook.net https://analytics.tiktok.com https://*.tiktok.com https://www.google-analytics.com https://www.googletagmanager.com",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://connect.facebook.net https://www.facebook.com https://analytics.tiktok.com https://*.tiktok.com https://portal.packzy.com https://steadfast.com.bd",
  "frame-src 'self' https://www.googletagmanager.com https://www.youtube.com https://www.youtube-nocookie.com",
  "frame-ancestors 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

export function getSecurityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

export function applySecurityHeaders(headers: Headers | Record<string, string>): Headers {
  const result = headers instanceof Headers ? new Headers(headers) : new Headers();
  if (!(headers instanceof Headers)) {
    for (const [k, v] of Object.entries(headers)) {
      result.set(k, v);
    }
  }

  const sec = getSecurityHeaders();
  for (const [k, v] of Object.entries(sec)) {
    if (!result.has(k)) {
      result.set(k, v);
    }
  }
  return result;
}
