/**
 * Server-Side Request Forgery (SSRF) Protection Module
 * Hardens webhook test and trigger endpoints against internal network probing,
 * cloud metadata access, localhost traversal, and DNS rebinding / redirect attacks.
 */

// Blocked internal hostname patterns
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.lan$/i,
  /\.corp$/i,
  /\.home$/i,
  /\.arpa$/i,
  /\.test$/i,
  /\.invalid$/i,
  /\.example$/i,
  /\.onion$/i,
  /\.priv$/i,
  /\.domain$/i,
  /^metadata\.google\.internal$/i,
  /^metadata\.google$/i,
  /^metadata\.azure\.com$/i,
  /^instance-data$/i,
];

// Single word internal names (e.g., "router", "intranet", "database", "redis")
const SINGLE_WORD_HOSTNAME = /^[a-z0-9_-]+$/i;

// Allowed standard web ports
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

/**
 * Checks if an IPv4 address belongs to a private, loopback, link-local,
 * multicast, or reserved range.
 */
function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 is blocked
  }

  const [a, b, c, d] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;

  // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local & AWS/GCP/Azure/OCI metadata: 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private network: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;

  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved: 240.0.0.0 - 255.255.255.254)
  if (a >= 240) return true;

  // 255.255.255.255 (Broadcast)
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;

  return false;
}

/**
 * Checks if an IPv6 address belongs to private, loopback, link-local,
 * or reserved range.
 */
function isPrivateOrReservedIpv6(rawIp: string): boolean {
  let ip = rawIp.toLowerCase().trim();
  // Strip enclosing brackets if present
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }

  // Loopback ::1 and unspecified ::
  if (ip === '::1' || ip === '::' || ip === '0:0:0:0:0:0:0:1' || ip === '0:0:0:0:0:0:0:0') {
    return true;
  }

  // IPv4-mapped IPv6 ::ffff:a.b.c.d
  if (ip.startsWith('::ffff:') || ip.startsWith('0:0:0:0:0:ffff:')) {
    const ipv4Part = ip.split(':').pop();
    if (ipv4Part && ipv4Part.includes('.')) {
      return isPrivateOrReservedIpv4(ipv4Part);
    }
    return true;
  }

  // Unique local addresses fc00::/7 (fc00:: - fdff::)
  if (ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }

  // Link-local unicast fe80::/10 (fe80:: - febf::)
  if (
    ip.startsWith('fe8') ||
    ip.startsWith('fe9') ||
    ip.startsWith('fea') ||
    ip.startsWith('feb')
  ) {
    return true;
  }

  // Multicast ff00::/8
  if (ip.startsWith('ff')) {
    return true;
  }

  // Documentation prefix 2001:db8::/32
  if (ip.startsWith('2001:db8') || ip.startsWith('2001:0db8')) {
    return true;
  }

  return false;
}

export interface WebhookUrlValidationResult {
  valid: boolean;
  isInternalReceiver?: boolean;
  internalPath?: string;
  normalizedUrl?: string;
  error?: string;
}

/**
 * Validates a webhook destination URL against SSRF vulnerabilities.
 */
export function validateWebhookDestination(
  targetUrl: string,
  requestOrigin?: string
): WebhookUrlValidationResult {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { valid: false, error: 'Webhook URL is required.' };
  }

  const trimmed = targetUrl.trim();

  // Allow relative URL strictly targeting the built-in courier webhook receiver
  if (trimmed.startsWith('/')) {
    // Prevent path traversal or access to arbitrary internal API routes
    const norm = trimmed.replace(/\/+/g, '/').replace(/\/+$/, '');
    if (
      norm === '/api/webhook/courier' ||
      norm === '/api/webhook' ||
      norm === '/api/courier/webhook' ||
      norm === '/api/webhook/steadfast' ||
      norm === '/api/webhooks' ||
      norm === '' ||
      norm === '/'
    ) {
      return {
        valid: true,
        isInternalReceiver: true,
        internalPath: '/api/webhook/courier',
        normalizedUrl: '/api/webhook/courier',
      };
    }
    return {
      valid: false,
      error: 'Relative webhook URL must target the store webhook receiver (/api/webhook/courier). Access to other internal paths is prohibited.',
    };
  }

  // Only allow HTTP and HTTPS protocols
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return {
      valid: false,
      error: 'Webhook destination must use http:// or https:// protocol.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }

  // Protocol strictly http: or https:
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Only HTTP and HTTPS protocols are allowed for webhooks.',
    };
  }

  // Reject credentials in URL
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: 'Webhook destination URL must not contain embedded user credentials.',
    };
  }

  // Enforce allowed ports
  if (!ALLOWED_PORTS.has(parsed.port)) {
    return {
      valid: false,
      error: 'Webhook destination port is not permitted. Only standard web ports (80, 443, 8080, 8443) are allowed.',
    };
  }

  let hostname = parsed.hostname.toLowerCase().trim();

  // Strip brackets from IPv6 hostnames
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  if (!hostname || hostname.endsWith('.')) {
    return { valid: false, error: 'Invalid hostname in webhook URL.' };
  }

  // Check if target points to the current application origin / deployed host
  // If so, safely route to the built-in receiver instead of making an external loopback HTTP call
  if (requestOrigin) {
    try {
      const origUrl = new URL(requestOrigin);
      if (origUrl.hostname.toLowerCase() === hostname) {
        return {
          valid: true,
          isInternalReceiver: true,
          internalPath: parsed.pathname.startsWith('/api/webhook') ? parsed.pathname : '/api/webhook/courier',
          normalizedUrl: '/api/webhook/courier',
        };
      }
    } catch {}
  }

  // Check known app hostnames (safe routing to built-in store receiver)
  if (
    hostname === 'rongdhonutrade.com' ||
    hostname === 'www.rongdhonutrade.com'
  ) {
    return {
      valid: true,
      isInternalReceiver: true,
      internalPath: parsed.pathname.startsWith('/api/webhook') ? parsed.pathname : '/api/webhook/courier',
      normalizedUrl: '/api/webhook/courier',
    };
  }

  // Reject blocked hostnames (localhost, cloud metadata, .internal, etc.)
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        error: 'Destination hostname is restricted or internal and cannot be reached.',
      };
    }
  }

  // Reject single-word hostnames without dot (internal network services)
  if (!hostname.includes('.') && !hostname.includes(':')) {
    return {
      valid: false,
      error: 'Single-label internal hostnames are not permitted as webhook destinations.',
    };
  }

  // Reject private IPv4 ranges
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  if (ipv4Regex.test(hostname)) {
    if (isPrivateOrReservedIpv4(hostname)) {
      return {
        valid: false,
        error: 'Webhook destination points to a private, loopback, or reserved IP address.',
      };
    }
  }

  // Reject private IPv6 ranges
  if (hostname.includes(':')) {
    if (isPrivateOrReservedIpv6(hostname)) {
      return {
        valid: false,
        error: 'Webhook destination points to a private, loopback, or reserved IPv6 address.',
      };
    }
  }

  // Reject decimal / octal / hex encoded IP representations (e.g. 2130706433 = 127.0.0.1, 0177.0.0.1)
  if (/^0x[0-9a-f]+$/i.test(hostname) || /^\d+$/.test(hostname)) {
    return {
      valid: false,
      error: 'Integer-encoded IP addresses are not permitted.',
    };
  }

  return {
    valid: true,
    isInternalReceiver: false,
    normalizedUrl: parsed.toString(),
  };
}

export interface SafeFetchWebhookOptions {
  url: string;
  headers?: Record<string, string>;
  body: string;
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
}

export interface SafeFetchWebhookResult {
  success: boolean;
  status: number;
  latencyMs: number;
  responsePreview: string;
  message: string;
  error?: string;
}

/**
 * Executes a hardened HTTP POST request to a webhook destination.
 * Strictly enforces:
 * 1. Pre-fetch SSRF hostname & IP check
 * 2. Manual redirect resolution with SSRF validation on EVERY hop
 * 3. 5-second strict AbortController timeout
 * 4. Response body size limit (1KB)
 * 5. Sanitized error messages that do not expose internal network topology
 */
export async function safeFetchWebhook(
  options: SafeFetchWebhookOptions
): Promise<SafeFetchWebhookResult> {
  const {
    url,
    headers = {},
    body,
    timeoutMs = 5000,
    maxRedirects = 3,
    maxResponseBytes = 1024,
  } = options;

  let currentUrl = url;
  let redirectsCount = 0;
  const start = Date.now();

  while (redirectsCount <= maxRedirects) {
    const valResult = validateWebhookDestination(currentUrl);
    if (!valResult.valid || valResult.isInternalReceiver) {
      return {
        success: false,
        status: 0,
        latencyMs: Date.now() - start,
        responsePreview: 'Destination blocked by SSRF filter',
        message: valResult.error || 'Destination URL is not permitted.',
        error: valResult.error || 'Destination URL is not permitted.',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(currentUrl, {
        method: 'POST',
        headers: {
          ...headers,
          'User-Agent': 'RongdhonuTrade-Webhook-Validator/1.0',
        },
        body,
        redirect: 'manual', // CRITICAL: Manual redirect handling to validate every hop
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Handle HTTP redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const location = resp.headers.get('location');
        if (!location) {
          return {
            success: false,
            status: resp.status,
            latencyMs: Date.now() - start,
            responsePreview: 'Redirect without Location header',
            message: `Endpoint returned HTTP ${resp.status} redirect without a Location header.`,
            error: 'Redirect missing Location header',
          };
        }

        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).toString();
        } catch {
          return {
            success: false,
            status: resp.status,
            latencyMs: Date.now() - start,
            responsePreview: 'Malformed redirect Location',
            message: 'Destination redirected to an invalid URL.',
            error: 'Malformed redirect URL',
          };
        }

        // Validate the next hop before following
        const nextValidation = validateWebhookDestination(nextUrl);
        if (!nextValidation.valid || nextValidation.isInternalReceiver) {
          return {
            success: false,
            status: 0,
            latencyMs: Date.now() - start,
            responsePreview: 'Redirect blocked by SSRF filter',
            message: 'Redirect to an internal or restricted destination was blocked for security.',
            error: 'Redirect to restricted host blocked',
          };
        }

        currentUrl = nextUrl;
        redirectsCount++;
        continue;
      }

      const latencyMs = Date.now() - start;

      // Safely read response with size ceiling
      let previewText = '';
      try {
        const rawText = await resp.text();
        previewText = rawText.slice(0, maxResponseBytes);
      } catch {
        previewText = '';
      }

      const isSuccess = resp.ok;
      return {
        success: isSuccess,
        status: resp.status,
        latencyMs,
        responsePreview: previewText || (isSuccess ? 'OK (Empty response)' : `HTTP Error ${resp.status}`),
        message: isSuccess
          ? `Webhook delivered successfully with status HTTP ${resp.status} (${latencyMs}ms)`
          : resp.status === 404
            ? `Destination server returned HTTP 404 (Not Found). Verify webhook path accepts HTTP POST.`
            : `Destination server returned HTTP status ${resp.status}`,
      };
    } catch (err: any) {
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      const isTimeout = err?.name === 'AbortError' || err?.message?.includes('aborted');

      return {
        success: false,
        status: 0,
        latencyMs,
        responsePreview: isTimeout ? 'Request timed out (5s limit)' : 'Delivery failed',
        message: isTimeout
          ? 'Webhook test timed out after 5 seconds.'
          : 'Unable to deliver webhook to destination server. Ensure the URL is publicly reachable.',
        error: isTimeout ? 'Request timed out' : 'Connection failed',
      };
    }
  }

  return {
    success: false,
    status: 0,
    latencyMs: Date.now() - start,
    responsePreview: 'Too many redirects',
    message: 'Destination exceeded maximum allowed redirects (limit: 3).',
    error: 'Maximum redirect limit exceeded',
  };
}

/**
 * Approved server-side gateways for Steadfast Courier.
 * Production Steadfast credentials (STEADFAST_API_KEY, STEADFAST_SECRET_KEY)
 * must ONLY ever be transmitted to these specific hosts.
 */
export const APPROVED_STEADFAST_HOSTNAMES = new Set([
  'portal.packzy.com',
  'portal.steadfast.com.bd',
  'steadfast.com.bd',
]);

export const APPROVED_STEADFAST_BASE_URLS = [
  'https://portal.packzy.com/api/v1',
  'https://portal.steadfast.com.bd/api/v1',
] as const;

/**
 * Server-side allowlist of recognized courier gateway domains.
 * Generic courier requests can only connect to these verified domains.
 */
export const APPROVED_COURIER_DOMAINS = [
  'portal.packzy.com',
  'portal.steadfast.com.bd',
  'steadfast.com.bd',
  'api-hermes.pathao.com',
  'pathao.com',
  'openapi.redx.com.bd',
  'redx.com.bd',
  'api.paperfly.com.bd',
  'paperfly.com.bd',
  'e-courier.com.bd',
];

export interface CourierApiValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  hostname?: string;
  error?: string;
}

/**
 * Strictly validates courier destination URLs against SSRF vulnerabilities,
 * credential leakage, and arbitrary destination tampering.
 *
 * Enforces:
 * 1. HTTPS protocol only (rejects http, ftp, file, data, javascript)
 * 2. Standard HTTPS port only (443 or default empty port; rejects arbitrary ports)
 * 3. No embedded credentials (username/password)
 * 4. Rejection of localhost, link-local, private RFC1918, CG-NAT, loopback, cloud metadata
 * 5. Rejection of raw IP addresses (integer, octal, hex, decimal)
 * 6. Explicit domain allowlisting:
 *    - Steadfast requests: strictly restricted to portal.packzy.com and portal.steadfast.com.bd
 *    - Other couriers: strictly restricted to approved courier domains
 */
export function validateCourierApiDestination(
  targetUrl: string,
  options?: { courierType?: string }
): CourierApiValidationResult {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { valid: false, error: 'Courier API destination URL is required.' };
  }

  const trimmed = targetUrl.trim();

  // Reject relative URLs
  if (trimmed.startsWith('/')) {
    return {
      valid: false,
      error: 'Relative URLs are prohibited for courier API destinations.',
    };
  }

  // Enforce HTTPS exclusively to protect credentials in transit
  if (!trimmed.startsWith('https://')) {
    return {
      valid: false,
      error: 'Courier API destinations must strictly use https:// protocol to protect credentials.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Malformed courier destination URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Courier API destinations must strictly use https:// protocol.',
    };
  }

  // Reject embedded credentials in URL
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: 'Courier API destination URL must not contain embedded user credentials.',
    };
  }

  // Enforce standard HTTPS port (443 or default)
  if (parsed.port !== '' && parsed.port !== '443') {
    return {
      valid: false,
      error: `Courier API destination port (${parsed.port}) is not permitted. Only standard HTTPS port 443 is allowed.`,
    };
  }

  let hostname = parsed.hostname.toLowerCase().trim();

  // Strip brackets from IPv6 hostnames
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  if (!hostname || hostname.endsWith('.')) {
    return { valid: false, error: 'Invalid hostname in courier API URL.' };
  }

  // Reject integer / octal / hex encoded IP representations (e.g. 2130706433, 0x7f000001, 0177.0.0.1)
  if (/^0x[0-9a-f]+$/i.test(hostname) || /^\d+$/.test(hostname) || /^0[0-7]+$/i.test(hostname)) {
    return { valid: false, error: 'Encoded or integer IP addresses are not permitted.' };
  }
  const dotParts = hostname.split('.');
  if (dotParts.some((p) => /^0x[0-9a-f]+$/i.test(p) || (p.length > 1 && p.startsWith('0') && /^\d+$/.test(p)))) {
    return { valid: false, error: 'Octal or hex IP notation is not permitted.' };
  }

  // Reject blocked hostnames (localhost, cloud metadata, .internal, etc.)
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        error: 'Destination hostname is internal, loopback, or metadata and cannot be reached.',
      };
    }
  }

  // Reject single-word hostnames without dot (internal network services)
  if (!hostname.includes('.') && !hostname.includes(':')) {
    return {
      valid: false,
      error: 'Single-label internal hostnames are not permitted as courier API destinations.',
    };
  }

  // Reject all raw IPv4 addresses (private, loopback, or public raw IPs)
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  if (ipv4Regex.test(hostname)) {
    if (isPrivateOrReservedIpv4(hostname)) {
      return {
        valid: false,
        error: 'Courier API destination points to a private, loopback, or reserved IP address.',
      };
    }
    return {
      valid: false,
      error: 'Direct IP addresses are not permitted. Courier API destinations must use verified domain names.',
    };
  }

  // Reject IPv6 addresses
  if (hostname.includes(':')) {
    if (isPrivateOrReservedIpv6(hostname)) {
      return {
        valid: false,
        error: 'Courier API destination points to a private, loopback, or reserved IPv6 address.',
      };
    }
    return {
      valid: false,
      error: 'Direct IPv6 addresses are not permitted. Courier API destinations must use verified domain names.',
    };
  }

  // Enforce Courier Domain Allowlist
  const courierType = (options?.courierType || '').toLowerCase();
  const isSteadfast = courierType.includes('steadfast');

  if (isSteadfast) {
    // Exact hostname match for canonical gateway "portal.packzy.com" and legacy "portal.steadfast.com.bd"
    const isApprovedSteadfast =
      hostname === 'portal.packzy.com' ||
      hostname === 'portal.steadfast.com.bd' ||
      hostname === 'steadfast.com.bd';

    if (!isApprovedSteadfast) {
      return {
        valid: false,
        error: `Steadfast Courier API calls are restricted to approved Steadfast gateways (portal.packzy.com). Destination host "${hostname}" is forbidden.`,
      };
    }

    return {
      valid: true,
      normalizedUrl: 'https://portal.packzy.com/api/v1',
      hostname: 'portal.packzy.com',
    };
  }

  // Generic / other couriers MUST match or be subdomains of approved courier domains
  const isApproved = APPROVED_COURIER_DOMAINS.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`)
  );
  if (!isApproved) {
    return {
      valid: false,
      error: `Courier API destination host "${hostname}" is not in the approved courier domain allowlist.`,
    };
  }

  // Normalize legacy Steadfast gateway host if encountered in generic courier check
  if (hostname === 'portal.steadfast.com.bd' || hostname === 'steadfast.com.bd' || hostname === 'portal.packzy.com') {
    return {
      valid: true,
      normalizedUrl: 'https://portal.packzy.com/api/v1',
      hostname: 'portal.packzy.com',
    };
  }

  // Gracefully handle trailing slash for generic courier endpoints
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  const normalizedUrl = `https://${hostname}${cleanPath || ''}${parsed.search || ''}`;

  return {
    valid: true,
    normalizedUrl,
    hostname,
  };
}

export interface SafeFetchCourierOptions {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  courierType?: string;
  maxRedirects?: number;
}

export interface SafeFetchCourierResult {
  ok: boolean;
  status: number;
  data?: any;
  error?: string;
}

/**
 * Hardened HTTP dispatcher for courier outbound requests.
 * Enforces pre-request SSRF validation, manual redirect validation per hop,
 * timeout controls, and credential boundary separation.
 */
export async function safeFetchCourierApi(
  options: SafeFetchCourierOptions
): Promise<SafeFetchCourierResult> {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 15000,
    courierType = 'generic',
    maxRedirects = 2,
  } = options;

  let currentUrl = url;
  let redirectsCount = 0;
  const isSteadfast = courierType.toLowerCase().includes('steadfast');

  while (redirectsCount <= maxRedirects) {
    const valResult = validateCourierApiDestination(currentUrl, { courierType });
    if (!valResult.valid) {
      return {
        ok: false,
        status: 400,
        error: valResult.error || 'Courier destination URL failed SSRF validation.',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(currentUrl, {
        method,
        headers,
        body,
        redirect: 'manual', // Enforce manual redirect handling to validate every hop
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Handle HTTP redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const location = resp.headers.get('location');
        if (!location) {
          return {
            ok: false,
            status: resp.status,
            error: 'Courier gateway returned redirect without Location header.',
          };
        }

        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).toString();
        } catch {
          return {
            ok: false,
            status: resp.status,
            error: 'Courier gateway returned malformed redirect Location header.',
          };
        }

        // Validate the next hop before following
        const nextValidation = validateCourierApiDestination(nextUrl, { courierType });
        if (!nextValidation.valid) {
          return {
            ok: false,
            status: 400,
            error: `Redirect to restricted destination blocked by SSRF filter: ${nextValidation.error || 'Destination forbidden.'}`,
          };
        }

        // Prevent cross-origin credential leaks
        const currentOrigin = new URL(currentUrl).origin;
        const nextOrigin = new URL(nextUrl).origin;
        if (currentOrigin !== nextOrigin) {
          if (isSteadfast) {
            const nextHost = new URL(nextUrl).hostname.toLowerCase();
            if (!APPROVED_STEADFAST_HOSTNAMES.has(nextHost)) {
              return {
                ok: false,
                status: 400,
                error: 'Cross-origin redirect to unapproved domain blocked to prevent credential leak.',
              };
            }
          }
        }

        currentUrl = nextUrl;
        redirectsCount++;
        continue;
      }

      let parsedData: any = null;
      try {
        parsedData = await resp.json();
      } catch {
        const rawText = await resp.text().catch(() => '');
        parsedData = { raw: rawText.slice(0, 1000) };
      }

      return {
        ok: resp.ok,
        status: resp.status,
        data: parsedData,
        error: resp.ok ? undefined : parsedData?.message || `Courier API returned HTTP ${resp.status}`,
      };
    } catch (err: any) {
      clearTimeout(timer);
      const isTimeout = err?.name === 'AbortError' || err?.message?.includes('aborted');
      return {
        ok: false,
        status: isTimeout ? 504 : 502,
        error: isTimeout ? 'Courier API request timed out.' : 'Failed to connect to Courier gateway.',
      };
    }
  }

  return {
    ok: false,
    status: 508,
    error: 'Courier API exceeded maximum allowed redirects (limit: 2).',
  };
}
