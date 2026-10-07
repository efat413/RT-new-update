# Authentication & Authorization Security Audit Report

**Target:** RTBFF (Rongdhonu Trade) — Cloudflare Workers Backend  
**Audit Date:** 2026-09-30  
**Scope:** Re-verification of previously reported security vulnerabilities, authentication mechanisms, session management, RBAC boundaries, webhook trust verification, error handling, and API resilience.  
**Files Audited:** `src/worker.ts`, `src/server/router.ts`, `src/server/auth.ts`, `src/server/permissions.ts`, `src/server/db.ts`, `src/server/webhookAuth.ts`, `src/server/ssrf.ts`, `src/server/imageSecurity.ts`, `src/server/types.ts`, `schema.sql`, `migrations/*.sql`.  
**Method:** Line-by-line source code inspection of all route handlers, authentication middleware, password signature derivations, timing defenses, and error response dispatchers.

---

## Executive Summary & Audit Matrix

| # | Finding Description | Original Severity | Current Status | Current Security Risk |
|---|---|---|---|---|
| 1 | Courier webhook secret disclosure via `GET /api/courier/webhooks` | **Critical** | **FIXED** | None. Route requires auth + permissions; secrets masked (`••••••••`). |
| 2 | Self-service account update (`PUT /api/users/:id`) bypassed password confirmation | **Medium** | **FIXED** | None. Explicit `currentPassword` verification required for self email/password changes. |
| 3 | Session-invalidation signature (`pwdSig`) had only 8 bits of entropy | **Low-Medium** | **FIXED** | None. Upgraded to 128-bit SHA-256 password hash digest (`computePasswordSignature`). |
| 4 | Timing side-channel on `/api/auth/forgot-password` allowed account enumeration | **Medium** | **FIXED** | None. Dummy D1 queries, subtle crypto hashing, background email dispatch via `ctx.waitUntil`, and target delay equalization. |
| 5 | Internal API exceptions and stack traces exposed to clients | **Medium** | **FIXED** | None. `jsonResponse` automatically intercepts status ≥ 500 errors, logs internally, and serves sanitized generic messages. |
| 6 | Identity lookup in `getUserByEmailOrUsername` matches on non-unique `name` column | **Low (Informational)** | **FIXED** | None. Query hardened to match exclusively on unique `email` or primary key `id`. Non-unique display names strictly excluded. |

---

## Detailed Findings & Re-Verification

### 1. Courier Webhook Secret Disclosure
- **Status:** **FIXED**
- **Original Issue:** The `GET /api/courier/webhooks` endpoint had no `requireAuth` barrier and returned the unredacted `CourierWebhookConfig[]` array, including the plaintext `secret` field. An unauthenticated attacker could exfiltrate the secret and forge inbound courier delivery or payment events (e.g. marking COD orders as `Paid` / `Delivered`).
- **Current Implementation:**
  - `requireAuth(request, env)` is strictly enforced on `GET /api/courier/webhooks`.
  - Authorized access requires `auth.role === 'super_admin'`, `courier.configure`, or `settings.manage` permissions; otherwise, an HTTP 403 Forbidden is returned.
  - The endpoint sanitizes and masks all webhook secrets before serializing the response:
    ```typescript
    const webhooks = (existingSettings.courierWebhooks || []).map((w: any) => ({
      ...w,
      secret: w.secret ? '••••••••' : undefined,
    }));
    return jsonResponse({ success: true, webhooks });
    ```
- **Evidence / File Location:** `src/server/router.ts`, lines 4394–4413.
- **Remaining Risk:** None. Courier secrets are neither accessible anonymously nor exposed in plaintext to authorized administrators via read endpoints.
- **Recommended Next Action:** Maintain existing automated regression test (`scripts/verify-courier-webhook-security.ts`).

---

### 2. Password/Email Change Without Current Password Confirmation
- **Status:** **FIXED**
- **Original Issue:** In `PUT/PATCH /api/users/:id`, when an authenticated user updated their own record (`isSelf`), the handler passed `updates.password` and `updates.email` directly to `updateUserInD1` without verifying the account's existing password. If an attacker obtained a temporary session, they could silently rotate credentials to permanently hijack the account.
- **Current Implementation:**
  - The endpoint explicitly checks if a self-updating user is changing their email or password:
    ```typescript
    if (isSelf && (isChangingEmail || isChangingPassword)) {
      const currentPassword = String(
        body.currentPassword || body.current_password || body.oldPassword || ''
      ).trim();
      if (!currentPassword) {
        return jsonResponse(
          { success: false, error: 'Current password confirmation is required to change your email or password.' },
          400
        );
      }
      const isCurrentValid = await verifyPassword(currentPassword, auth!.dbUser.password || '');
      if (!isCurrentValid) {
        return jsonResponse(
          { success: false, error: 'Current password does not match. Please verify and try again.' },
          400
        );
      }
    }
    ```
  - Enforces minimum password length (≥ 6 characters) and validates email formatting prior to executing updates.
  - Generates a fresh session token with an updated password signature (`pwdSig`) so the current valid session remains active while invalidating older sessions.
- **Evidence / File Location:** `src/server/router.ts`, lines 2976–3010.
- **Remaining Risk:** None. The re-authentication barrier prevents unauthorized session persistence.
- **Recommended Next Action:** Maintain coverage in `scripts/verify-auth-security-fixes.ts`.

---

### 3. Weak Session-Invalidation Password Signature (`pwdSig`)
- **Status:** **FIXED**
- **Original Issue:** Token creation originally used `(userRow.password || '').slice(0, 16)`. Because PBKDF2 hashes begin with the 14-character prefix `pbkdf2:100000:`, this slice captured only 2 hex characters of the salt (8 bits of entropy), yielding a 1-in-256 (~0.39%) chance of collision where an old revoked session token remained valid after a password change.
- **Current Implementation:**
  - Dedicated cryptographic helper function `computePasswordSignature()` computes a Web Crypto SHA-256 digest of the complete password hash:
    ```typescript
    export async function computePasswordSignature(passwordHash: string): Promise<string> {
      if (!passwordHash) return '';
      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passwordHash));
      return bufferToHex(hashBuf).slice(0, 32);
    }
    ```
  - Yields 32 hexadecimal characters (128 bits of cryptographic entropy).
  - Validated on token issuance across login, registration, password change, and profile update, and verified on incoming requests in `requireAuth`:
    ```typescript
    if (dbUser.password && tokenUser.pwdSig) {
      const currentSig = await computePasswordSignature(dbUser.password);
      if (tokenUser.pwdSig !== currentSig) {
        return { errorResponse: jsonResponse({ success: false, error: 'Session invalidated or password was changed.' }, 401) };
      }
    }
    ```
- **Evidence / File Location:** `src/server/auth.ts`, lines 193–201; `src/server/router.ts`, lines 595–605.
- **Remaining Risk:** None. Probability of signature collision upon password rotation is reduced to $2^{-128}$, providing deterministic session invalidation.
- **Recommended Next Action:** Retain test assertions in `scripts/verify-auth-security-fixes.ts`.

---

### 4. Password Reset Timing & Account Enumeration
- **Status:** **FIXED**
- **Original Issue:** In `POST /api/auth/forgot-password`, requests for nonexistent emails executed a single fast local hash and returned immediately, whereas requests for registered emails performed D1 writes and awaited an outbound HTTP call to Resend (`api.resend.com`). The latency difference allowed attackers to enumerate valid user and administrator emails.
- **Current Implementation:**
  - **Multi-layer Rate Limiting:** Enforces sliding-window rate limits on IP (`pwd-reset-ip`), target email (`pwd-reset-email`), and IP-email combination.
  - **Balanced Dummy Execution:** When an email does not exist in D1, the handler generates a dummy 32-byte cryptographic token, computes a SHA-256 digest, executes a dummy D1 update query (`UPDATE password_reset_tokens SET used_at = ? WHERE user_id = '__dummy_nonexistent_user__'`), and performs a dummy D1 select query.
  - **Asynchronous Email Dispatch:** Outbound email sending to Resend is wrapped and dispatched asynchronously in the background via `ctx.waitUntil(emailPromise)`, ensuring external network latency never blocks the HTTP response.
  - **Timing Equalization Delay:** Incorporates an active timer (`TARGET_RESET_TIME_MS = 100`) to guarantee uniform response time across both branches.
  - Both branches return the identical response:
    ```json
    {
      "success": true,
      "status": "RESET_EMAIL_SENT",
      "message": "If the account exists, password reset instructions have been sent."
    }
    ```
- **Evidence / File Location:** `src/server/router.ts`, lines 1362–1440.
- **Remaining Risk:** None. Response payloads, database latency, and network calls are equalized.
- **Recommended Next Action:** Maintain coverage in `scripts/verify-password-reset-system.ts`.

---

### 5. API Error & Internal Exception Leakage
- **Status:** **FIXED**
- **Original Issue:** Catch blocks in older endpoint revisions returned `err.message` directly in 500 JSON responses, potentially leaking database schema details, file system paths, or Cloudflare driver internals.
- **Current Implementation:**
  - Centralized response builder `jsonResponse` automatically intercepts status codes ≥ 500:
    ```typescript
    function jsonResponse(data: any, status = 200, customHeaders: Record<string, string> = {}): Response {
      let payload = data;
      if (status >= 500 && data && typeof data === 'object') {
        if (data.error && typeof data.error === 'string') {
          console.error('[Server Internal Error Logged Safely]:', data.error);
          payload = {
            ...data,
            error: 'Internal server error.',
          };
        }
      }
      return new Response(JSON.stringify(payload), { status, headers: { ... } });
    }
    ```
  - Unhandled exceptions caught at the Cloudflare Worker root in `src/worker.ts` return a sanitized generic error object (`{ success: false, error: 'Internal server error.' }`).
  - Technical error details and stack traces are logged exclusively to server stderr (`console.error`).
- **Evidence / File Location:** `src/server/router.ts`, lines 255–267; `src/worker.ts`, lines 67–76.
- **Remaining Risk:** None. Internal exception messages are masked from API clients.
- **Recommended Next Action:** Retain error masking in all custom route handlers.

---

### 6. Identity Lookup Matches on Non-Unique `name` Column
- **Status:** **FIXED**
- **Original Issue:** In `schema.sql`, the `users.name` column does not have a `UNIQUE` constraint. In `src/server/db.ts`, `getUserByEmailOrUsername` previously queried:
  ```sql
  SELECT * FROM users WHERE LOWER(TRIM(email)) = ? OR LOWER(TRIM(name)) = ? OR id = ? LIMIT 1
  ```
  If multiple accounts shared the same display name, `LIMIT 1` selected the earliest created row matching that display name, creating account selection ambiguity if someone attempted login using a non-email display name.
- **Current Implementation:**
  - `getUserByEmailOrUsername` in `src/server/db.ts` was hardened to query strictly and exclusively by unique database fields (`email` and `id`):
    ```sql
    SELECT * FROM users WHERE LOWER(TRIM(email)) = ? OR id = ? LIMIT 1
    ```
  - Display names (`name` column) are strictly excluded from authentication identity lookups.
  - Development server authentication in `vite.config.ts` was synchronized to eliminate display name resolution.
  - Password verification via constant-time PBKDF2 comparison still occurs immediately following identity resolution; non-existent accounts trigger dummy PBKDF2 verification (`DUMMY_HASH`) to prevent timing enumeration.
  - Failed logins return a safe generic message (`'Invalid email or password.'`).
- **Evidence / File Location:** `src/server/db.ts`, lines 1358–1366; `src/server/router.ts`, lines 1140–1188; `vite.config.ts`, lines 895–905.
- **Remaining Risk:** None. Ambiguity is eliminated because `email` is enforced `UNIQUE` and `id` is `PRIMARY KEY`. Existing users log in seamlessly using their registered email address or user ID.
- **Recommended Next Action:** Maintain coverage in `scripts/verify-auth-security-fixes.ts`.

---

## Verified Secure Baseline

The following architectural security controls were re-verified and remain robust:
1. **Password Hashing:** Native PBKDF2-HMAC-SHA256 with 100,000 iterations, 16-byte random salt, and constant-time string comparison (`src/server/auth.ts`). Plaintext passwords cannot be authenticated.
2. **Authentication Signing Secret:** `getAuthSecret()` fails closed in production when `ADMIN_SECRET` is unset.
3. **RBAC & Super Admin Isolation:** `SUPER_ADMIN_EMAILS` server-side check prevents unauthorized privilege escalation; sensitive permissions (`permission.manage`, `user.manage`, `user.delete`) cannot be granted to non-super-admins.
4. **Financial Data Sanitization:** `buyingPrice`, `unitProfit`, and profit margin attributes are stripped server-side (`src/server/db.ts`) unless the caller holds explicit authorization.
5. **SSRF Mitigation:** Outbound webhook requests validate destination hostnames and IPs via `validateWebhookDestination()` (`src/server/ssrf.ts`), rejecting private IP ranges (RFC 1918), loopback, link-local, and cloud metadata IPs.
6. **SQL Injection Defense:** All queries use parameterized statements (`env.DB.prepare().bind()`).
7. **Media Upload Hardening:** `src/server/imageSecurity.ts` validates binary magic bytes, caps file size at 5 MB, and generates randomized media keys to prevent path traversal.

---

## Current Security Status

### Confirmed Fixed Issues
- [x] **Finding 1:** Courier webhook secrets leaking over unauthenticated `GET /api/courier/webhooks` (**FIXED** — authentication enforced, permissions checked, secrets masked).
- [x] **Finding 2:** Account modification via `PUT /api/users/:id` without current password (**FIXED** — `currentPassword` required and verified).
- [x] **Finding 3:** Insufficient entropy in session invalidation `pwdSig` (**FIXED** — 128-bit SHA-256 hash digest implemented; legacy 16-character fallback removed).
- [x] **Finding 4:** Timing side-channel and account enumeration on password reset (**FIXED** — asynchronous Resend dispatch, dummy DB queries, and uniform delay equalization).
- [x] **Finding 5:** API error leakage (**FIXED** — centralized response helper intercepts 500 errors and masks raw messages).
- [x] **Finding 6:** Identity lookup using non-unique `name` column (**FIXED** — identity lookup strictly restricted to unique `email` and primary key `id`).
- [x] **Finding 7:** Store settings authorization bypass risk (**FIXED** — `settings.manage` added to authoritative `SUPER_ADMIN_ONLY_PERMISSIONS`).
- [x] **Finding 8:** Legacy permission alias security (**FIXED** — explicit mapping table and normalized key security prevent privilege escalation).

### Pending & Production-Dependent Verification
- While all local code implementation and automated test suites have passed, end-to-end production operations remain **NEEDS LIVE VERIFICATION** until executed against live Cloudflare infrastructure, real remote D1 databases, and third-party APIs.

### Items Requiring Production Verification (NEEDS LIVE VERIFICATION)
1. **Environment Variables & Secrets:** Confirm `ADMIN_SECRET`, `COURIER_WEBHOOK_SECRET`, `SUPER_ADMIN_EMAILS`, and `RESEND_API_KEY` are configured as Cloudflare Worker Secrets in production.
2. **Resend Domain Verification:** Verify that `RESEND_FROM_EMAIL` has active SPF, DKIM, and DMARC DNS records configured on the sending domain.
3. **Database Migration Verification:** Ensure all 20 D1 migrations (`0001` through `0020_advance_payment.sql`) have been applied to the production Cloudflare D1 instance via `npx wrangler d1 migrations apply rongdhonu-db --remote`.
4. **Live Courier Inbound Webhooks:** Validate HMAC-SHA256 signature processing against live Steadfast webhook transmissions.
