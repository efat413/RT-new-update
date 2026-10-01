# Courier Webhook Replay & Idempotency Security Fix Report
**Target Application:** Rongdhonu Trade (রঙধনু ট্রেড)  
**Date:** September 30, 2026  
**Status:** ✅ RESOLVED & VERIFIED

---

## 1. Executive Summary & Root Cause Analysis

### The Vulnerability
Previously, courier webhook replay protection in `src/server/db.ts` utilized a two-step "check-then-insert" pattern:
1. `SELECT fingerprint FROM webhook_replays WHERE fingerprint = ? AND expires_at > ?`
2. If `existing` is null:
   `INSERT OR REPLACE INTO webhook_replays (fingerprint, created_at, expires_at) VALUES (?, ?, ?)`
3. Process incoming courier webhook.

### The Race Condition
Because Step 1 (`SELECT`) and Step 2 (`INSERT OR REPLACE`) were executed as separate non-atomic operations:
- Two identical webhook requests arriving nearly simultaneously (such as network duplicate replays, courier retry bursts, or replay attacks) would both execute the initial `SELECT` before either request executed its `INSERT`.
- Both queries found no existing record.
- Both requests executed `INSERT OR REPLACE` and proceeded to process the payload and update order state.
- This broke the idempotency invariant and allowed duplicate processing of webhook payloads.

---

## 2. Atomicity & Idempotency Approach

To eliminate the race condition completely, webhook replay protection was refactored to be **strictly atomic**:

1. **Database-Level Primary Key Constraint:**
   - The `webhook_replays` table defines `fingerprint TEXT PRIMARY KEY`.
   - SQLite / Cloudflare D1 natively enforces that no two rows can have the same primary key.

2. **Atomic Single-Operation Claim:**
   - Instead of checking before inserting, `checkAndRecordWebhookFingerprint` attempts an immediate `INSERT INTO webhook_replays (fingerprint, created_at, expires_at) VALUES (?, ?, ?)`.
   - The database engine atomically determines the winner:
     - **First / Winning Request:** The row is inserted (`changes === 1`). Returns `{ isReplay: false }`. Webhook processing proceeds.
     - **Concurrent / Duplicate Request:** The database engine immediately blocks the insert with a `UNIQUE` / `PRIMARY KEY` constraint violation (`SQLITE_CONSTRAINT` / `D1_ERROR: UNIQUE constraint failed`).
   - The constraint violation is caught safely and recognized as a duplicate/replay attempt, returning `{ isReplay: true }`.
   - The router rejects the request immediately with `HTTP 409 Conflict` before any order lookup, state mutation, or audit log insertion occurs.

3. **Opportunistic TTL Cleanup (Preventing Unbounded Table Growth):**
   - Before registering new entries, expired fingerprints (`expires_at < now`) are pruned via `DELETE FROM webhook_replays WHERE expires_at < ?`.
   - With a 600-second (10-minute) TTL, and a 300-second (5-minute) webhook timestamp expiration tolerance window, records are safely retained during the valid replay window and subsequently pruned to keep table size minimal.

4. **Preserved Cryptographic Validations:**
   - **HMAC-SHA256 Signatures:** Verified with timing-safe comparisons (`timingSafeEqualString`) across all configured secrets.
   - **Timestamp Expiry:** Webhooks older than 5 minutes are rejected (`HTTP 401`) prior to fingerprint evaluation.
   - **Malformed Timestamps:** Non-numeric or unparseable timestamps return `HTTP 400 Bad Request`.
   - **Steadfast Order Status Synchronization:** Real courier status updates (e.g., `in_review`, `delivered`, `cancelled`) continue to execute properly for authenticated first-time requests.

---

## 3. Database Schema & Migration Verification

The database table `webhook_replays` was reviewed in `migrations/0011_webhook_replays.sql` and `schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS webhook_replays (
  fingerprint TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_replays_expires ON webhook_replays(expires_at);
```
- `fingerprint TEXT PRIMARY KEY` provides the necessary unique constraint for atomic conflict detection.
- `idx_webhook_replays_expires` provides high-efficiency indexing for the opportunistic TTL cleanup queries.

---

## 4. Exact Files Modified

1. **`src/server/db.ts`**
   - Refactored `checkAndRecordWebhookFingerprint`:
     - Removed non-atomic `SELECT` followed by `INSERT OR REPLACE`.
     - Added atomic `INSERT INTO webhook_replays` with catch-based constraint collision detection.
     - Suppressed warning logs for expected constraint conflicts to protect server log hygiene.

2. **`vite.config.ts`**
   - Added `checkAndRecordDevWebhookReplay` helper function to provide atomic in-memory fingerprint registration for the local development server.
   - Wired `/api/webhook/steadfast` and other courier webhook paths to use `checkAndRecordDevWebhookReplay`.

3. **`scripts/verify-courier-webhook-atomicity.ts`**
   - Created comprehensive verification test suite covering D1 atomic constraints, concurrency races, live HTTP endpoints, and Steadfast status updates.

4. **`scripts/verify-final-hardening.ts`**
   - Updated with concurrent race condition test `2.4b`.

5. **`WEBHOOK_SECURITY_FIX_REPORT.md`**
   - Documented root cause, atomicity design, test results, and production deployment instructions.

---

## 5. Automated Tests Executed & Results

Executed test suite: `npx tsx scripts/verify-courier-webhook-atomicity.ts`

```
================================================================
STARTING COURIER WEBHOOK ATOMIC REPLAY & IDEMPOTENCY VERIFICATION
================================================================

--- PART A: D1 DATABASE ATOMIC REGISTRATION UNIT TESTS ---
✅ [PASS] A.1 First registration with valid fingerprint succeeds (isReplay: false)
✅ [PASS] A.2 Sequential duplicate with same fingerprint conflicts on PRIMARY KEY (isReplay: true)
✅ [PASS] A.3 Concurrent duplicate registration: Exactly 1 registered (1), 9 rejected as replays (9)
✅ [PASS] A.4 Different valid fingerprint succeeds independently (isReplay: false)
✅ [PASS] A.5 Expired fingerprint cleaned up by TTL and safely re-registered (no unbounded growth)

--- PART B: LIVE DEV SERVER WEBHOOK ENDPOINT TESTS ---
✅ [PASS] B.1 Valid courier webhook with timestamp and signature is ACCEPTED (HTTP 200)
✅ [PASS] B.2 Webhook with invalid signature is REJECTED (HTTP 401)
✅ [PASS] B.3 Webhook with stale timestamp is REJECTED (HTTP 401 Replay Protection)
✅ [PASS] B.4 Same webhook request replayed sequentially is REJECTED (HTTP 409 Conflict)
✅ [PASS] B.5 Concurrent duplicate webhooks: Exactly 1 processed (HTTP 200), 5 rejected as duplicate (HTTP 409) [counts: 200=1, 409=5]
✅ [PASS] B.6 Different valid webhook request is ACCEPTED (HTTP 200)
✅ [PASS] B.7 Webhook with malformed timestamp header is REJECTED (HTTP 400 Bad Request)

--- PART C: STEADFAST STATUS UPDATE INTEGRATION ---
✅ [PASS] C.1 Legitimate Steadfast webhook status update processes successfully (HTTP 200)
✅ [PASS] C.2 Immediate replay of Steadfast status update is blocked with HTTP 409 Conflict

================================================================
FINAL RESULT: 14 PASSED, 0 FAILED
================================================================
```

Also verified full existing courier test suite:
- `npx tsx scripts/verify-courier-webhook-security.ts` → **17 PASSED, 0 FAILED**
- Type check: `npm run lint` (`tsc --noEmit`) → **0 errors**
- Build verification: `npm run build` → **Build succeeded**

---

## 6. Live Production Verification (Cloudflare D1)

When deploying to Cloudflare Workers / D1 production:
1. Apply migrations to remote D1:
   ```bash
   npm run d1:migrate
   ```
2. Deploy the Worker:
   ```bash
   npm run deploy
   ```
3. Test against live webhook URL with signed payloads:
   - Ensure `COURIER_WEBHOOK_SECRET` and `STEADFAST_SECRET_KEY` are configured in Cloudflare environment secrets.
   - Send test webhook with timestamp and signature; confirm `HTTP 200`.
   - Send immediate duplicate request; confirm `HTTP 409 Conflict`.
