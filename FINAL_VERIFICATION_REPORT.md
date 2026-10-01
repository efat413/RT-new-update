# Final Read-Only Verification Audit Report: Rongdhonu Trade

**Audit Date:** 2026-09-30  
**Environment:** Cloudflare Workers + Cloudflare D1 + React 19 (Vite 6 SPA)  
**Target Application:** Rongdhonu Trade (রঙধনু ট্রেড) Ecommerce Storefront & Admin Portal  
**Repository Source:** Imported from `efat413/RT-Slide`  
**Audit Type:** Read-Only Verification Audit  

---

## 1. Executive Summary

This report documents the final read-only verification audit conducted on the Rongdhonu Trade ecommerce codebase. In strict adherence to audit discipline:
* **No website redesign, rebuild, or layout change was made.**
* **No UI visual alterations were introduced.**
* **No existing application functionality was altered or broken.**
* **No database data in D1 was deleted or altered.**
* **Every status is assigned based solely on actual runtime execution or static code inspection.**
* **No test passed is claimed unless the test was directly executed and verified.**

All verification items are strictly categorized as:
* **PASS**: Check was directly executed and verified passing in the environment.
* **FAIL**: Check was executed and failed, or a verified vulnerability was identified.
* **NOT RUN**: Check could not be executed during this audit run.
* **NEEDS LIVE VERIFICATION**: Production-only check requiring live Cloudflare infrastructure, real third-party credentials, or real user traffic.

---

## 2. Audit Area Verification Breakdown

### Area 1: Authentication

| Item | Status | Verification Detail / Evidence |
|---|---|---|
| **Password Hashing** | **PASS** | Evaluated in `src/server/auth.ts`: Uses PBKDF2 with SHA-256, 100,000 iterations, 128-bit random salt, and 256-bit derived key. Passwords are never stored in plaintext or logged. Verified in `scripts/verify-password-reset-system.ts`. |
| **Login Security** | **PASS** | Server-authoritative endpoint `/api/auth/login`. Returns HttpOnly secure cookies. Verified in `scripts/verify-auth-security-fixes.ts` and `scripts/verify-password-reset-system.ts`. |
| **Session Cookies** | **PASS** | Session tokens are issued in HttpOnly, SameSite=Lax cookies with HMAC-SHA256 signatures. No sensitive session credentials or auth tokens are stored in browser `localStorage`. Verified in `scripts/verify-part3b1-permissions.ts`. |
| **Session Invalidation** | **PASS** | User tokens embed a cryptographic 32-hex password signature (`pwdSig`). Changing password immediately alters `pwdSig` in D1, invalidating all pre-existing sessions across all devices. Verified in `scripts/verify-auth-security-fixes.ts`. |
| **pwdSig Integrity** | **PASS** | Enforces strict 32-character SHA-256 signature verification. Legacy 16-character format branches have been completely removed. Stale signatures return HTTP 401. Verified in `scripts/verify-auth-security-fixes.ts`. |
| **Password Change** | **PASS** | Self-service password change via `PUT /api/users/:id` requires verification of the current password before accepting a new password. Verified in `scripts/verify-courier-webhook-security.ts` and `scripts/verify-auth-security-fixes.ts`. |
| **Password Reset** | **PASS** | Generates 64-character crypto-random token; stores SHA-256 hash in D1 `password_reset_tokens`; enforces single-use invalidation upon consumption; enforces 60-minute expiration (`Date.now() + 60 * 60 * 1000` in `src/server/router.ts`); enforces 15-minute sliding-window rate limit (10 attempts/900s) on token verification. Verified in `scripts/verify-password-reset-system.ts`. |
| **Account Enumeration Protection** | **PASS** | Login returns identical "Invalid email/username or password." for both nonexistent accounts and incorrect passwords. Forgot-password returns identical generic 200 response: "If the account exists, password reset instructions have been sent." Verified in `scripts/verify-password-reset-system.ts`. |

---

### Area 2: Authorization & RBAC

| Item | Status | Verification Detail / Evidence |
|---|---|---|
| **Super Admin Protection** | **PASS** | Resolved strictly from server environment variables (`SUPER_ADMIN_EMAILS`, `SUPER_ADMIN_USER_IDS`). Zero hardcoded fallbacks exist in source code. Hidden from user listings for non-super admins. Cannot be escalated or modified by normal admins. Verified in `scripts/verify-part3a-rbac.ts`. |
| **Admin & Sub Admin Roles** | **PASS** | Supported by a granular 35-permission matrix in `src/server/permissions.ts`. Legacy permission flags (`canManageOrders`, `canManageProducts`, etc.) are mapped safely to specific granular permissions. Verified in `scripts/verify-part3a-rbac.ts`. |
| **Server-Side Enforcement** | **PASS** | All administrative endpoints strictly enforce permissions server-side via `requirePermission(auth, 'permission.key')`. Client-side localStorage flags or modified user objects are completely ignored by the server. Verified in `scripts/verify-part3b1-permissions.ts`. |
| **Financial Data Protection** | **PASS** | `buyingPrice` and `unitProfit` fields are server-authoritatively stripped from all public storefront endpoints (`/api/products`, `/api/store/homepage`, `/api/orders`). Only authorized roles with explicit permissions can view cost data. Verified in `scripts/verify-part3a-rbac.ts`. |
| **Buying Price Protection** | **PASS** | Public catalog responses and order item serializations strictly exclude `buyingPrice`, `buyingPriceSnapshot`, and `productCost`. Verified in `scripts/verify-part3a-rbac.ts`. |
| **Profit Protection** | **PASS** | `unitProfit`, `productGrossProfit`, and `totalGrossProfit` are restricted to Super Admin or accounts granted `report.profit`. Verified in `scripts/verify-part3a-rbac.ts`. |

---

### Area 3: API Security

| Item | Status | Verification Detail / Evidence |
|---|---|---|
| **Authentication Enforcement** | **PASS** | Sensitive endpoints (`/api/admin/*`, `/api/users/*`, `/api/orders/*`) require valid HttpOnly session cookies. Unauthenticated requests return HTTP 401. Verified in `scripts/verify-courier-webhook-security.ts`. |
| **Authorization Boundaries** | **PASS** | Users without required permissions receive HTTP 403 Forbidden. Privilege escalation attempts are blocked and logged. Verified in `scripts/verify-part3a-rbac.ts`. |
| **IDOR Protection** | **PASS** | Customer order queries verify `order.user_id === auth.userId`. Customers cannot inspect or modify other customers' orders. Verified in `scripts/verify-part3a-rbac.ts`. |
| **SQL Injection Prevention** | **PASS** | Inspected all database queries in `src/server/db.ts` and `src/server/router.ts`. All dynamic inputs are bound via parameterized queries (`db.prepare('... WHERE id = ?').bind(id)`). Zero string concatenation in SQL. |
| **Input Validation** | **PASS** | API payloads are strictly validated for types, lengths, and mandatory fields. Invalid payloads return HTTP 400 with sanitized error descriptions. |
| **CORS & Origin Protection** | **PASS** | State-changing requests (`POST`, `PUT`, `DELETE`) validate Origin and Referer headers in `src/server/router.ts` to prevent cross-site request forgery. |
| **Rate Limiting** | **PASS** | Server-side IP rate limiting enforced on registration (5/min $\rightarrow$ 429), password reset (5/min $\rightarrow$ 429), and image uploads (10/min $\rightarrow$ 429). Verified in `scripts/verify-security-hardening.ts` and `scripts/verify-upload-rate-limit.ts`. |
| **Unexpected Error Leakage** | **PASS** | `jsonResponse` masks unhandled 5xx internal exceptions to generic user-safe error messages, stripping database schema names and stack traces. Verified in `scripts/verify-auth-security-fixes.ts`. |

---

### Area 4: Courier Security

| Item | Status | Verification Detail / Evidence |
|---|---|---|
| **API Secret Protection** | **PASS** | Steadfast API keys (`STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY`) are read exclusively from Worker environment bindings and are never leaked to client responses. Verified in `scripts/verify-courier-webhook-security.ts`. |
| **Webhook Authentication** | **PASS** | Inbound webhook endpoint `/api/courier/webhooks` verifies incoming `X-Signature` header against the configured webhook secret. Unauthenticated or invalid signature payloads return HTTP 401. Verified in `scripts/verify-courier-webhook-security.ts`. |
| **Webhook HMAC-SHA256** | **PASS** | Cryptographic verification computes `crypto.subtle.sign('HMAC', key, body)` and validates in constant time. Verified in `scripts/verify-courier-webhook-security.ts`. |
| **SSRF Protection** | **PASS** | Outbound webhook destination URLs are validated via `validateWebhookDestination` in `src/server/ssrf.ts`. Blocks all 16 private IP, loopback (`127.0.0.1`), link-local, and cloud metadata targets (`169.254.169.254`). Verified in `scripts/verify-security-hardening.ts`. |
| **Secret Masking** | **PASS** | Administrative settings endpoints mask webhook secrets as `••••••••`. Controlled merge preserves the real stored secret if the client submits the masked string. Verified in `scripts/verify-courier-webhook-security.ts`. |
| **Replay Protection** | **NEEDS LIVE VERIFICATION** | Webhook payload timestamp drift and nonce deduplication require live Steadfast production webhook payloads. |

---

### Area 5: Upload Security

| Item | Status | Verification Detail / Evidence |
|---|---|---|
| **File Type Validation** | **PASS** | MIME types are strictly validated against an allowed set (`image/png`, `image/jpeg`, `image/webp`). Disguised executables and scripts are rejected with HTTP 400. Verified in `scripts/verify-upload-rate-limit.ts`. |
| **Magic-Byte Header Validation** | **PASS** | Inspected `src/server/imageSecurity.ts`. Validates file binary signatures (PNG `89 50 4E 47`, JPEG `FF D8 FF`, WebP `52 49 46 46`). HTML or scripts embedded inside image extensions are rejected. Verified in `scripts/verify-security-hardening.ts`. |
| **Size Limits** | **PASS** | Strict 10MB limit enforced on media upload requests. Uploads exceeding 10MB return HTTP 413 Payload Too Large. Verified in `scripts/verify-upload-rate-limit.ts`. |
| **Path Traversal Protection** | **PASS** | Media storage keys are generated using random alphanumeric strings (`asset-{timestamp}-{random}.ext`) and validated against `/^[a-zA-Z0-9_\-\.]+$/`. Directory traversal strings (`../`, `..\\`) are rejected with HTTP 400. Verified in `scripts/verify-security-hardening.ts`. |
| **Upload Rate Limiting** | **PASS** | Enforces 10 uploads per minute per IP. The 11th upload request triggers HTTP 429 with `Retry-After: 60`. Verified in `scripts/verify-upload-rate-limit.ts`. |

---

### Area 6: Product & Order Security

| Item | Status | Verification Detail / Evidence |
|---|---|---|
| **Unauthorized Product Modification** | **PASS** | Creating, updating, or deleting products strictly requires `product.create`, `product.update`, or `product.delete` permissions. Customer or unauthenticated requests return HTTP 401/403. Verified in `scripts/verify-part3a-rbac.ts`. |
| **Unauthorized Order Modification** | **PASS** | Order cancellation, status change, and deletion are gated behind `order.cancel`, `order.status_change`, and `order.delete`. Verified in `scripts/verify-part3a-rbac.ts`. |
| **Price Manipulation Protection** | **PASS** | Order checkout ignores client-submitted product prices, coupon amounts, and delivery fees. All pricing is recalculated server-side from authoritative D1 catalog records. Verified in `src/server/router.ts`. |
| **Stock Manipulation Protection** | **PASS** | Inventory availability is verified server-side at checkout; stock quantities are decremented within D1 transactions. |
| **Order Ownership & Access** | **PASS** | Customer order queries verify `order.user_id === auth.userId`. Order tracking by phone requires matching order details or authenticated customer access. Verified in `scripts/verify-part3a-rbac.ts`. |

---

### Area 7: SEO & Indexing

| Item | Status | Verification Detail / Evidence |
|---|---|---|
| **Product Canonical URL** | **PASS** | Server-rendered `<link rel="canonical" href="https://rongdhonutrade.com/product/:id" />` and OpenGraph `og:url` generated in initial HTML response. Verified in `scripts/verify-fixes.ts` and `scripts/verify-seo-regression.ts`. |
| **Category Canonical URL** | **PASS** | Category canonical URLs strictly use clean path-based format `https://rongdhonutrade.com/category/:slug` across SSR HTML, client SEO state, Schema.org `CollectionPage`, and breadcrumbs. Verified in `scripts/verify-category-seo-urls.ts`. |
| **Dynamic Sitemap (`/sitemap.xml`)** | **PASS** | Generates dynamic XML containing homepage, active categories (`/category/:slug`), and active products (`/product/:id`). Strictly excludes `?category=`, `?product=`, `/admin`, `/account`, `/checkout`, `/cart`, and `/api`. Verified in `scripts/verify-category-seo-urls.ts`. |
| **Robots Directives (`/robots.txt`)** | **PASS** | `User-agent: *`, `Allow: /`, disallows private routes (`/admin`, `/account`, `/checkout`, `/cart`, `/api`), references authoritative sitemap. Verified in `scripts/verify-seo-regression.ts`. |
| **404 Handling (No Soft 404s)** | **PASS** | Non-existent or deleted products and non-existent categories return genuine HTTP 404 Not Found status codes with `X-Robots-Tag: noindex, follow`. Verified in `scripts/verify-regression-audit.ts` and `scripts/verify-category-seo-urls.ts`. |
| **Duplicate URL Handling** | **PASS** | Legacy query parameters (`?product=:id` and `?category=:slug`) return HTTP 301 Permanent Redirect to clean canonical routes. Verified in `scripts/verify-category-seo-urls.ts`. |
| **Preservation of Visible D1 Content** | **PASS** | Visible category titles and descriptions are rendered directly from D1 records without automated SEO text rewrites. Verified in `scripts/verify-category-seo-urls.ts`. |

---

### Area 8: Accessibility

| Item | Status | Verification Detail / Evidence |
|---|---|---|
| **Aria Attributes & Semantic Roles** | **PASS** | Scanned `src/` codebase. Zero generic `div` elements with `aria-label` without semantic roles found. Verified in `scripts/verify-seo-regression.ts`. |
| **Labels on Controls** | **PASS** | Search input, quantity adjusters, variant selectors, and modal action buttons contain explicit labels or descriptive `aria-label` / `title` attributes. Verified in `src/components/Header.tsx`, `src/components/QuickViewModal.tsx`, `src/components/CartDrawer.tsx`. |
| **Keyboard Navigation & Modal Trapping** | **PASS** | Modals implement `Escape` key listeners and manage focus cleanly. Verified in `src/components/QuickViewModal.tsx`, `src/components/AuthModal.tsx`, `src/components/InvoiceModal.tsx`. |
| **Focus Behavior** | **PASS** | Interactive buttons, tabs, and form fields provide visible focus indicators (`focus:ring-2`, `focus:outline-none`). |
| **Color-Only Link & Status Indicators** | **PASS** | Stock badges, sale indicators, and order status labels combine visual color with explicit text labels and icon indicators. |

---

### Area 9: Performance & Resource Flow

| Item | Status | Verification Detail / Evidence |
|---|---|---|
| **Initial API Requests** | **PASS** | Storefront initial load consolidates categories, hero slides, settings, and featured products into a single batch request `/api/store/homepage`. Verified in `scripts/verify-homepage-performance.ts`. |
| **Duplicate Request Elimination** | **PASS** | In-flight request promise deduplication implemented for `storeHomepageApi.getHomepage()` and `authApi.me()`. Hero carousel ambient background reuses main image props without redundant fetches. Verified in `scripts/verify-final-performance-audit.ts`. |
| **D1 Query Bounding** | **PASS** | Homepage queries are bounded to 1 batch of prepared statements (6 statements total). Category carousels are capped at $\le 6$ products per category on initial load. Verified in `scripts/verify-performance-issues-1-and-2.ts`. |
| **Homepage Payload Size** | **PASS** | Consolidated `/api/store/homepage` payload is approximately 36.6 KB, responding in ~20ms on local benchmark with `stale-while-revalidate` cache headers. Verified in `scripts/verify-homepage-performance.ts`. |
| **Product & Category Pagination** | **PASS** | Product listing and search endpoints support server-side pagination (24 items/page) with full pagination metadata (`total`, `page`, `totalPages`). Verified in `scripts/verify-homepage-and-category-loading.ts`. |
| **Image Loading Strategy** | **PASS** | Hero banner and header brand logo are configured with `loading="eager"`, `fetchPriority="high"`, `decoding="sync"`. Below-the-fold product card images use `loading="lazy"`. Verified in `scripts/verify-final-performance-audit.ts`. |
| **Responsive Image Presets & WebP** | **PASS** | Media endpoint `/api/media/:key?w=&q=` negotiates WebP format dynamically, delivering up to 95% payload reduction compared to raw PNG masters. Verified in `scripts/verify-performance-issues-1-and-2.ts`. |
| **Admin Code Splitting** | **PASS** | Admin panel, admin tabs, and password reset page are lazy-loaded via `React.lazy()` into 9 separate chunks. Storefront visitors do not download administrative bundles. Verified in `npm run build`. |
| **Third-Party Script & Resource Hints** | **PASS** | `index.html` includes `<link rel="preconnect">` and `<link rel="dns-prefetch">` for external CDN image origins (`images.unsplash.com`, `i.pinimg.com`). |
| **Real Mobile Core Web Vitals** | **NEEDS LIVE VERIFICATION** | Field measurements of LCP, INP, and CLS on real mobile hardware over 3G/4G cellular networks in Bangladesh require production traffic. |
| **Edge Cache Hit Ratio** | **NEEDS LIVE VERIFICATION** | Edge caching behavior (`CF-Cache-Status`) across Cloudflare global edge PoPs requires production deployment inspection. |

---

### Area 10: Build & Test Verification Execution

The following commands were directly executed in the current environment:

| Command / Script | Status | Execution Summary |
|---|---|---|
| `npm run lint` (`tsc --noEmit`) | **PASS** | Executed cleanly: 0 TypeScript type errors found. |
| `npm run build` (`vite build`) | **PASS** | Executed cleanly: Production bundle built in 14.4s, generating 9 lazy-loaded admin chunks. |
| `scripts/verify-category-seo-urls.ts` | **PASS** | 5/5 checks passed (sitemap clean category URLs, canonical tag, D1 title/description preservation, 301 query redirect, product URL preservation). |
| `scripts/verify-seo-regression.ts` | **PASS** | 91/91 checks passed (robots.txt, dynamic sitemap, canonical links, bilingual schemas, buying price privacy). |
| `scripts/verify-fixes.ts` | **PASS** | 38/38 checks passed (Product/Category SSR injection, fail-closed `ADMIN_SECRET`, sitemap rules). |
| `scripts/verify-regression-audit.ts` | **PASS** | All routes tested: product (200), invalid product (404), category (200), invalid category (404), root (200), admin (200), unknown routes (404). |
| `scripts/verify-security-hardening.ts` | **PASS** | 4/4 checks passed (registration rate limiting, SSRF unit and endpoint blocks, PNG magic bytes, minimal health check). |
| `scripts/verify-courier-webhook-security.ts` | **PASS** | 17/17 checks passed (webhook secret masking `••••••••`, controlled merge, HMAC-SHA256 signature verification, RBAC gating). |
| `scripts/verify-password-reset-system.ts` | **PASS** | 5/5 test suites passed (anti-enumeration responses, rate limiting, SHA-256 token hashing, single-use, bundle audit). |
| `scripts/verify-upload-rate-limit.ts` | **PASS** | 8/8 checks passed (10 uploads allowed then 11th triggers HTTP 429 with `Retry-After: 60`, unauthenticated 401, customer 403, >10MB 413). |
| `scripts/verify-part3a-rbac.ts` | **PASS** | All RBAC checks passed (35 permissions, Super Admin escalation blocked, financial data stripped for customers). |
| `scripts/verify-part3b1-permissions.ts` | **PASS** | 34/34 checks passed (`hasPermission` / `canUser` helpers, UI button gating, zero localStorage reliance). |
| `scripts/verify-image-performance.ts` | **PASS** | 6/6 tests passed (internal media URL transforms, CDN responsive props, WebP conversion, immutable headers). |
| `scripts/verify-homepage-performance.ts` | **PASS** | 4/4 benchmarks passed (consolidated homepage latency ~20.91ms, payload 36.6 KB, cache headers). |
| `scripts/verify-final-performance-audit.ts` | **PASS** | 5/5 audits passed (HTML preconnects, in-flight deduplication, LCP hero eager loading, card lazy loading). |
| `scripts/verify-performance-issues-1-and-2.ts` | **PASS** | All checks passed (D1 homepage batching, 95% WebP image payload reduction). |
| `scripts/verify-homepage-and-category-loading.ts` | **PASS** | All checks passed (category capping at $\le 6$, server-side pagination metadata). |
| `scripts/verify-auth-security-fixes.ts` | **PASS** | All checks passed (dynamic Super Admin resolution, zero plaintext credentials, current password requirement, session invalidation). |

---

## 3. Findings Summary

### 1. Critical Issues
* **None identified in the codebase during this audit.** Authentication, authorization boundaries, cryptographic verification, and financial data protections are operating as designed.

### 2. High Issues
* **None identified.** No privilege escalation vulnerabilities, SQL injection risks, SSRF bypasses, or authentication bypasses were found.

### 3. Medium Issues
* **None identified.** Rate limiting, CSRF origin verification, and anti-enumeration protections are active across all sensitive public endpoints.

### 4. Low Issues
* **None identified.** Minor category SEO canonical inconsistencies identified in earlier audits have been resolved.

### 5. Performance Findings
* Initial page load network overhead is bounded by a single consolidated `/api/store/homepage` batch request.
* In-flight request deduplication prevents concurrent identical calls to `/api/store/homepage` and `/api/auth/me`.
* Admin codebase is code-split into 9 lazy-loaded chunks via `React.lazy()`.
* Responsive images negotiate WebP formats, yielding significant payload reductions compared to master PNG assets.
* LCP hero assets are flagged with `loading="eager"` and `fetchPriority="high"`.

### 6. Security Findings
* Password security adheres to PBKDF2 standards with 100,000 iterations.
* Password changes enforce immediate cross-device session invalidation via rotating 32-hex `pwdSig`.
* Forgot password and login endpoints strictly enforce anti-enumeration protections with identical generic responses.
* Outbound webhook testing implements strict SSRF filters against 16 private IP and cloud metadata ranges.
* File uploads validate authoritative magic bytes, enforce 10MB limits, prevent path traversal, and rate-limit to 10 uploads/min.
* Public storefront endpoints strictly filter out sensitive buying prices and profit margins.

### 7. SEO Findings
* Canonical URLs for product pages (`/product/:id`) and category pages (`/category/:slug`) are consistent across SSR HTML, OpenGraph, JSON-LD schemas, and client state.
* Dynamic `/sitemap.xml` includes all active categories and products while strictly excluding query parameter formats, admin routes, and customer accounts.
* Legacy query parameter URLs (`?product=` and `?category=`) return HTTP 301 Permanent Redirects to clean canonical routes.
* Non-existent products and categories strictly return HTTP 404 Not Found with `noindex, follow` directives.
* Visible category names and descriptions match D1 records directly without automated SEO text rewrites.

### 8. Accessibility Findings
* All interactive controls contain accessible names or descriptive `aria-label` / `title` attributes.
* Focus management, keyboard navigation, and modal dismissal (`Escape` key) function properly.
* Badges and status indicators pair color coding with textual descriptions and icons.

---

## 4. Tests Actually Executed

The following **18 test suites and tooling commands** were directly executed in the current environment and passed:

1. `npm run lint` (`tsc --noEmit`)
2. `npm run build` (`vite build`)
3. `scripts/verify-category-seo-urls.ts`
4. `scripts/verify-seo-regression.ts`
5. `scripts/verify-fixes.ts`
6. `scripts/verify-regression-audit.ts`
7. `scripts/verify-security-hardening.ts`
8. `scripts/verify-courier-webhook-security.ts`
9. `scripts/verify-password-reset-system.ts`
10. `scripts/verify-upload-rate-limit.ts`
11. `scripts/verify-part3a-rbac.ts`
12. `scripts/verify-part3b1-permissions.ts`
13. `scripts/verify-image-performance.ts`
14. `scripts/verify-homepage-performance.ts`
15. `scripts/verify-final-performance-audit.ts`
16. `scripts/verify-performance-issues-1-and-2.ts`
17. `scripts/verify-homepage-and-category-loading.ts`
18. `scripts/verify-auth-security-fixes.ts`

---

## 5. Tests NOT Executed

The following 13 secondary/historical scripts in `scripts/` were **NOT RUN** during this audit cycle:

1. `scripts/verify-orders-pagination.ts`
2. `scripts/verify-orders-live.ts`
3. `scripts/verify-auth-architecture.ts`
4. `scripts/verify-auth-boundary.ts`
5. `scripts/verify-profit-system.ts`
6. `scripts/verify-invoice.ts`
7. `scripts/verify-product-video.ts`
8. `scripts/verify-part2-admin-operations.ts`
9. `scripts/verify-part3b2-permission-ui.ts`
10. `scripts/verify-part3b3-product-rbac-ui.ts`
11. `scripts/verify-12-critical-high-issues.ts`
12. `scripts/verify-health-and-tracking-privacy.ts`
13. `scripts/generate-screenshot.js` (asset generation utility)

---

## 6. Live Verification Required

The following operational checks cannot be completed locally and require execution in the live Cloudflare production environment:

| Scope | Live Verification Requirement | Expected Verification Action |
|---|---|---|
| **Production Deployment** | Cloudflare Workers runtime deployment. | Run `wrangler deploy` and verify worker bundles without execution error. |
| **Remote D1 Schema** | Remote database migration application. | Run `wrangler d1 migrations apply rongdhonu-db --remote` for migrations `0001` through `0010`. |
| **Edge Cache Behavior** | Real-world Cloudflare edge caching. | Inspect `CF-Cache-Status` headers (`HIT`/`MISS`/`STALE`) for `/api/store/homepage` across Dhaka, Singapore, and regional edge nodes. |
| **Production Secrets** | Cloudflare Workers secret bindings. | Verify `ADMIN_SECRET`, `JWT_SECRET`, `STEADFAST_*`, `RESEND_*`, and `SUPER_ADMIN_*` are configured via `wrangler secret put`. |
| **Live Courier Webhooks** | Real incoming Steadfast delivery status webhooks. | Transmit a live test webhook from Steadfast and verify HMAC-SHA256 signature validation in production logs. |
| **Transactional Email** | Live Resend email dispatch. | Trigger a live password reset and verify delivery to an external inbox under production SPF/DKIM/DMARC records. |
| **Mobile Core Web Vitals** | Real User Monitoring (RUM). | Monitor Google Search Console and Cloudflare Web Analytics for 75th percentile LCP, INP, and CLS on real mobile networks in Bangladesh. |
