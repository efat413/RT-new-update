# Security Policy & Implementation Standards

This document specifies the security requirements, architectural boundaries, and coding standards for **Rongdhonu Trade (RT-Slide / RTBFF)**. All developers and AI coding agents working on this codebase must adhere strictly to these policies.

---

## 1. Authentication

- **Server-Side Enforcement:** Authentication is strictly validated on every request within Cloudflare Workers / the backend API (`src/server/router.ts`, `src/server/auth.ts`).
- **Never Trust Frontend State:** Client-side React state, UI cookies, or boolean flags (`isAdminLoggedIn`, `currentUser`) exist solely for view rendering and must never be treated as proof of identity or authorization.
- **No `localStorage` Authorization:** Tokens or roles in browser storage (`localStorage`, `sessionStorage`) must never authorize backend actions. Critical session tokens are delivered via `HttpOnly`, `Secure`, `SameSite=Lax` cookies (with `Authorization: Bearer` header support for API consumers).
- **Secure Password Hashing:** All user passwords must use the native PBKDF2-HMAC-SHA256 implementation (`hashPassword()` in `src/server/auth.ts`) with a cryptographically random 16-byte salt and at least 100,000 iterations (`pbkdf2:100000:<saltHex>:<hashHex>`). Verification must use constant-time byte comparison (`verifyPassword()`).
- **No Secret Exposure:** Never return plaintext passwords, password hashes, reset tokens, session signing keys, or server secrets (`ADMIN_SECRET`, `JWT_SECRET`, `COURIER_WEBHOOK_SECRET`) in API responses or public client bundles.

---

## 2. Session Security

- **Signed Tokens:** Authentication tokens are cryptographically signed using HMAC-SHA256 (`createAuthToken()` in `src/server/auth.ts`) with `ADMIN_SECRET` from worker environment variables. In production, missing secrets trigger immediate fail-closed behavior.
- **Session Expiry & Revocation:** Tokens carry an explicit expiration timestamp (`exp`). In addition, tokens incorporate a 32-character hexadecimal password signature (`pwdSig`, representing 128 bits derived via `computePasswordSignature()` from the first 16 bytes of the SHA-256 digest of the password hash). Modifying a user's password or revoking credentials immediately invalidates all prior issued tokens across all devices (legacy 16-character prefix signatures are unconditionally rejected).
- **No Authentication Bypasses:** Protected API routes must invoke `requireAuth(request, env)`. Never introduce bypass flags, debug backdoors, or default unauthenticated admin fallbacks in production endpoints.

---

## 3. RBAC / Permissions

- **Authoritative Authorization:** Role-based access control (`super_admin`, `admin`, `staff`, `customer`) and granular permissions (`order.view`, `order.manage`, `product.create`, `product.edit`, `product.delete`, `settings.manage`, `user.manage`, `profit.view`, `buying_price.view`, etc.) are resolved and enforced on the server via `requirePermission()` and `hasPermission()` in `src/server/permissions.ts`.
- **Super Admin Boundary:**
  - Super Admin privileges and identities are bound server-side (`SUPER_ADMIN_EMAILS` / `SUPER_ADMIN_USER_IDS`).
  - Sensitive administrative capabilities (managing role permissions, granting financial visibility, creating or modifying other administrators) are strictly restricted to Super Admins.
  - Sub-admins and staff cannot self-elevate permissions or alter Super Admin accounts.
- **Financial Privacy Protection:**
  - `buyingPrice`, product acquisition cost, and gross/net profit figures must never be exposed to public customers or unauthorized staff.
  - The server explicitly strips financial attributes through `sanitizeProductForRole()` and `sanitizeOrderForRole()` in `src/server/db.ts` prior to returning JSON responses.
- **Frontend Independence:** Never permit the frontend to dictate whether a user can perform an action. Every mutation endpoint must independently check user permissions against the authoritative database record.

---

## 4. D1 Database Security

- **Parameterized Statements:** All Cloudflare D1 queries must use parameterized bindings (`env.DB.prepare('... WHERE col = ?').bind(val)`).
- **No SQL String Concatenation:** Never concatenate user input, identifiers, or search strings directly into SQL strings.
- **Field Whitelisting:** Select only required columns or filter sensitive fields (`password`, `password_reset_token`, internal timestamps) before returning rows to the client.
- **Authoritative Single Source of Truth:** Cloudflare D1 remains the authoritative source for products, stock levels, orders, vouchers, user accounts, and audit records. In-memory states and mock objects are restricted to isolated local development plugins.

---

## 5. API Security

- **Strict Input Validation:** All API endpoints must sanitize and validate request payloads, field types, string lengths, and email formats (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).
- **Identifier Validation:** IDs passed via query parameters or path segments must be verified and sanitized.
- **Information Leakage Prevention:** Never expose server stack traces, SQL syntax errors, database driver exceptions, or internal file paths to API clients.
- **Safe Error Responses:** Unhandled exceptions must return generic responses (e.g., `{ success: false, error: "Internal server error." }`) with HTTP 500 status codes. Detailed debug errors must be retained exclusively in server-side logs (`console.error`).

---

## 6. Courier & Webhook Security

- **Secret Confidentiality:** Courier API secrets, integration keys, and webhook shared secrets must never be returned in unauthenticated API endpoints. Administrative inspection routes (such as `GET /api/courier/webhooks`) require authentication and permissions (`courier.configure` or `settings.manage`) and must mask secrets (`••••••••`).
- **Inbound Webhook Verification:** Incoming courier webhooks (`/api/webhook`, `/api/webhook/steadfast`, `/api/webhook/courier`) must verify signatures using HMAC-SHA256 hex signatures or configured bearer secrets via `verifyCourierWebhookAuth()` in `src/server/webhookAuth.ts`.
- **Replay & Timestamp Protection:** Inbound webhooks must validate request timestamps where supported to prevent replay attacks.
- **SSRF Protection for Outgoing Webhooks:** Outgoing webhook test and dispatch endpoints must validate destination URLs using `validateWebhookDestination()` in `src/server/ssrf.ts`. Private IP blocks (RFC 1918), loopback (`127.0.0.1`), link-local (`169.254.x.x`), and internal cloud metadata services must be actively blocked.

---

## 7. Upload & Media Security

- **Content & Magic-Byte Validation:** Upload endpoints (`/api/media/upload`, `src/server/imageSecurity.ts`) must inspect the binary header (magic bytes) to verify actual image formats (JPEG, PNG, WebP, GIF) rather than relying on the client's `Content-Type` header or file extension alone.
- **Size Limits & Key Sanitization:** Upload sizes are strictly capped by `MAX_IMAGE_SIZE_BYTES` (5 MB). Media keys are generated server-side using secure random tokens (`generateSafeMediaKey()`) to eliminate path traversal vulnerabilities (`../`).
- **Safe Serving Headers:** Media delivery routes must return strict headers (`X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`, and appropriate `Cache-Control`).

---

## 8. Password Reset System

- **Token Generation & Storage:** Password reset tokens must be generated using cryptographically strong random bytes (32 bytes / 64 hex characters via `crypto.getRandomValues`).
- **Hashed in Storage:** Plaintext reset tokens must never be saved to the database. Only the SHA-256 hash of the token is stored in the `password_reset_tokens` table.
- **Short Lifetime & Single-Use:** Tokens carry a 60-minute expiration window (`expiresAt = Date.now() + 60 * 60 * 1000` in `src/server/router.ts`), matching the email notification and client messaging, while the token verification attempt rate-limiter operates on a 15-minute sliding window (900 seconds). Tokens are marked as used (`used_at`) immediately upon successful password change to enforce single-use invalidation.
- **Anti-Enumeration Timing Protection:** The `POST /api/auth/forgot-password` endpoint must return the exact same generic success message (`RESET_EMAIL_SENT`) regardless of whether the email address exists in the system. When an account is not found, the server must execute dummy cryptographic operations and dummy D1 queries to equalize response latency.
- **Rate Limiting:** Sliding-window rate limiting is enforced on password reset requests across client IP (`pwd-reset-ip`), target email (`pwd-reset-email`), and IP-email tuples.

---

## 9. XSS & Client-Side Input Security

- **No Dangerous HTML Injection:** Never render raw user strings with `dangerouslySetInnerHTML` unless explicitly sanitized through dedicated sanitizers.
- **Component Escaping:** Rely on standard React JSX escaping for all dynamic user inputs, reviews, customer names, and addresses.
- **Description Formatting:** Structured or rich descriptions (e.g., `FormattedDescription.tsx`) must parse safe tags/tokens without executing arbitrary JavaScript or unsafe HTML attributes.

---

## 10. CSRF & CORS Policies

- **Origin Verification:** CORS headers are restricted to known trusted domains (`ALLOWED_ORIGINS`, `PRODUCTION_ORIGIN`) and configured via `getSecurityHeaders()` in `src/server/securityHeaders.ts`.
- **No Wildcard CORS:** Never use `Access-Control-Allow-Origin: *` for authenticated endpoints or administrative routes.
- **Standard Security Headers:** The application must serve:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

## 11. Error Handling

- **Sanitized Client Messages:** Never expose raw internal exceptions (`err.message`) to production clients unless the error originates from a safe, explicit business validation check.
- **Server-Side Telemetry:** Record full technical error details, stack traces, and request contexts to server logs for debugging and auditing.

---

## 12. Product & Order Integrity

- **Server-Authoritative Pricing:** Product prices, category assignments, discount computations, voucher validation, and shipping fees must be calculated and verified on the server.
- **Never Trust Client Totals:** Orders submitted via `/api/orders` must recalculate subtotal, voucher discounts, shipping fees, and grand totals from authoritative D1 product records. Client-provided prices or totals must be ignored or strictly validated against database records.
- **Order State Transitions:** Courier status updates, payment confirmations, and cancellations must validate legitimate status lifecycles to prevent unauthorized state transitions.

---

## 13. Performance Safety

- **Security Trumps Optimization:** Never bypass authentication, permission checks, or input sanitization to optimize response times.
- **No Sensitive Over-Fetching:** Do not bundle internal, private, or administrative data into public APIs merely to save an HTTP round-trip.
- **Consolidated Public Endpoints:** Public initial data loads should use consolidated endpoints (e.g., `/api/store/homepage`) that serve only sanitized, public-safe data.

---

## 14. Change Policy for Developers & AI Agents

Before modifying any security-sensitive file:
1. **Inspect Existing Code First:** Review current checks in `src/server/router.ts`, `src/server/auth.ts`, `src/server/permissions.ts`, and `src/server/db.ts`.
2. **Preserve Established Hardening:** Never remove or weaken existing defenses (e.g., masking secrets, rate limiting, SSRF checks, or timing equalization).
3. **Minimal Safe Edits:** Make targeted, minimal modifications rather than sweeping rewrites.
4. **Run Verification:** Execute relevant verification test scripts before committing changes.
5. **No Architectural Regressions:** Do not replace Worker-level authorization checks with client-side flags.

---

## 15. Security Verification Test Suite

The project includes an automated TypeScript verification suite located in the `/scripts` directory. Run these scripts via `npx tsx scripts/<script-name>.ts` to validate security controls:

| Verification Script | Scope & Validated Controls |
|---|---|
| `scripts/verify-security-hardening.ts` | Server security headers, magic-byte upload validation, rate limiting, and password hashing |
| `scripts/verify-auth-security-fixes.ts` | Authentication barriers, token signature verification, and self-service password checks |
| `scripts/verify-courier-webhook-security.ts` | Courier webhook authorization, secret masking, HMAC validation, and SSRF destination blocking |
| `scripts/verify-password-reset-system.ts` | Reset token generation, SHA-256 storage hashing, single-use invalidation, and timing equalization |
| `scripts/verify-part3a-rbac.ts` | Role hierarchy enforcement, Super Admin protections, and administrative boundary tests |
| `scripts/verify-part3b1-permissions.ts` | Granular permission resolution and API endpoint permission enforcement |
| `scripts/verify-profit-system.ts` | Verification that `buyingPrice` and profit margins are stripped for unauthorized users |
| `scripts/verify-upload-rate-limit.ts` | Media upload file size constraints, magic byte verification, and sliding-window rate limits |
| `scripts/verify-health-and-tracking-privacy.ts` | Public tracking endpoints privacy (no PII leakage) and health endpoint checks |
| `scripts/verify-regression-audit.ts` | Full regression audit across all previously resolved security findings |

---

*This policy is strictly enforced. Any pull request or automated change violating these rules must be rejected.*
