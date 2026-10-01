# Inventory Concurrency & Stock Atomicity Audit Report
**Target Application:** Rongdhonu Trade (রঙধনু ট্রেড)  
**Date:** September 30, 2026  
**Status:** ✅ RESOLVED & VERIFIED

---

## 1. Executive Summary & Root Cause Analysis

### The Issue
Previously, product stock deductions were performed with:
```sql
UPDATE products
SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND stock >= ?
```
While this prevented individual queries from directly setting negative stock, it resulted in `changes = 0` when stock was insufficient. In a batch execution (`db.batch([orderInsertStmt, ...stockStatements])`):
1. The `orders` insertion succeeded, but one or more stock statements had `changes = 0`.
2. D1 / SQLite did not abort the transaction automatically, requiring subsequent application-level JavaScript queries to manually delete the inserted order and iteratively run individual `UPDATE products SET stock = stock + ?` restoration queries.
3. If concurrent requests or worker interrupts occurred during this window, stock or order records could become desynchronized.
4. During order cancellation (`updateOrderInD1`), status updates and stock restorations were executed as separate non-atomic queries without conditional status guards. Two concurrent cancellation requests could both see `existing.shippingStatus !== 'Cancelled'` and restore stock twice, artificially inflating inventory.
5. In order deletion (`deleteOrderFromD1`), stock restoration and order deletion were executed sequentially rather than in a single atomic batch.

---

## 2. Technical Hardening Architecture

### A. Engine-Level Triggers & Atomic Abort on Deduction
1. **Trigger Guards (`schema.sql` & `migrations/0013_atomic_inventory_guards.sql`):**
   ```sql
   CREATE TRIGGER IF NOT EXISTS trg_prevent_negative_stock
   BEFORE UPDATE OF stock ON products
   FOR EACH ROW
   WHEN NEW.stock < 0
   BEGIN
     SELECT RAISE(ABORT, 'INSUFFICIENT_STOCK: Product stock cannot be negative');
   END;

   CREATE TRIGGER IF NOT EXISTS trg_prevent_negative_stock_insert
   BEFORE INSERT ON products
   FOR EACH ROW
   WHEN NEW.stock < 0
   BEGIN
     SELECT RAISE(ABORT, 'INSUFFICIENT_STOCK: Product stock cannot be negative');
   END;
   ```
2. **Conditional Stock Deduction with Atomic Tripwire:**
   ```sql
   UPDATE products
   SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE -1 END,
       updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   ```
   - When sufficient stock is available (`stock >= ?`): stock is decremented cleanly.
   - When stock is insufficient (`stock < ?`): stock is set to `-1`, which immediately triggers `trg_prevent_negative_stock`.
   - SQLite raises `ABORT` with `'INSUFFICIENT_STOCK'`.
   - Cloudflare D1 automatically rolls back the **entire batch transaction** (`orderInsertStmt` and all item stock deductions) with zero manual cleanup required.
3. **Defense-in-Depth Single-Batch Rollback:**
   - If any unexpected condition results in `changes < 1` without a database abort, all rollback actions (deleting the order and reverting stock) execute in a **single atomic batch** (`db.batch(rollbackStatements)`).

### B. Atomic Order Cancellation & Restoration Deduplication
1. **Conditional State Transition:**
   ```sql
   UPDATE orders
   SET shipping_status = 'Cancelled', updated_at = CURRENT_TIMESTAMP
   WHERE id = ? AND shipping_status != 'Cancelled'
   ```
2. **Deduplication Guard:**
   - The query returns `changes: 1` **only for the first request** that transitions the order from an active state to `Cancelled`.
   - If two or more cancellation requests arrive concurrently or sequentially:
     - Request 1 receives `changes: 1` and restores stock in an atomic batch.
     - Request 2 receives `changes: 0` and **does NOT restore stock**.
   - Duplicate cancellation requests return the cancelled order idempotently without inflating stock.
3. **Safe Order Re-Activation:**
   - When an order transitions from `Cancelled` back to active, it verifies and re-deducts stock with the negative stock protection trigger. If stock is unavailable, the order is reverted to `Cancelled`.

### C. Atomic Deletion with Restoration
In `deleteOrderFromD1`, uncancelled order stock restoration and order deletion are combined into a single atomic batch:
```typescript
await db.batch([...restoreStmts, deleteStmt]);
```
Ensuring that order deletion and stock restoration either both succeed or both fail together.

### D. Multi-Tier Idempotency
- Replay requests with the same `Idempotency-Key` are resolved before rate limits or stock deduction, returning the existing order with `idempotent: true` and zero stock modification.

---

## 3. Exact Files Modified

1. **`schema.sql`**
   - Added `trg_prevent_negative_stock` and `trg_prevent_negative_stock_insert` database triggers preventing negative stock.
2. **`migrations/0013_atomic_inventory_guards.sql`**
   - Created safe, idempotent migration ensuring triggers exist in remote and local D1 environments.
3. **`src/server/db.ts`**
   - Updated `createOrderInD1` to use `CASE WHEN stock >= ? THEN stock - ? ELSE -1 END` for atomic transaction abort.
   - Replaced iterative rollback loops with single atomic `db.batch(rollbackStatements)`.
   - Hardened `updateOrderInD1` with atomic conditional transition `WHERE id = ? AND shipping_status != 'Cancelled'`, guaranteeing stock is restored exactly once.
   - Combined stock restoration and order deletion into a single atomic batch in `deleteOrderFromD1`.
4. **`vite.config.ts`**
   - Added pre-order stock verification before deduction in local dev server.
   - Hardened dev server order cancellation to prevent duplicate stock restoration.
   - Prioritized idempotency key resolution before burst rate limits.
5. **`scripts/verify-inventory-concurrency.ts`**
   - Created comprehensive verification test suite covering normal orders, insufficient stock, concurrent race conditions, idempotency, cancellation, and duplicate cancellation.

---

## 4. Tests Executed & Results

Executed test suite: `npx tsx scripts/verify-inventory-concurrency.ts`

```
================================================================
STARTING INVENTORY CONCURRENCY & STOCK ATOMICITY VERIFICATION
================================================================

--- PART A: D1 ENGINE-LEVEL ATOMICITY & TRIGGER UNIT TESTS ---
✅ [PASS] A.1 Test product starts with exactly 1 unit of stock
✅ [PASS] A.2 First concurrent order successfully claims the last available unit (stock 1 -> 0)
✅ [PASS] A.3 Product stock is now exactly 0
✅ [PASS] A.4 Second concurrent order hits INSUFFICIENT_STOCK trigger and rolls back entire batch
✅ [PASS] A.5 Stock remains exactly 0 and NEVER drops below 0

--- PART B: LIVE HTTP SERVER ENDPOINT CONCURRENCY TESTS ---
✅ [PASS] B.1 Target product (Premium Leather Wallet) found with initial stock: 24
✅ [PASS] B.2 Normal order placement succeeds with HTTP 201
✅ [PASS] B.3 Product stock decreased by exactly 1 (24 -> 23)
✅ [PASS] B.4 Order with insufficient stock is rejected with HTTP 400 Bad Request
✅ [PASS] B.5 Failed excess order did NOT consume stock (stock intact)
✅ [PASS] B.6 Repeated request with Idempotency-Key returns existing order without deducting stock again (stock: 22)
✅ [PASS] B.7 Order cancellation restores stock exactly once (+1, from 22 to 23)
✅ [PASS] B.8 Duplicate cancellation does NOT restore stock a second time (stock remains 23)
✅ [PASS] B.9 Stock is accurately restored to initial baseline (24)

--- PART C: CONCURRENT ORDER RACE FOR LAST UNIT ---
✅ [PASS] C.1 Product stock verified at exactly 1 unit before concurrent race
✅ [PASS] C.2 Concurrent race for last unit: Exactly 1 order succeeded (201), exactly 1 was rejected (400) [success: 1, rejected: 1]
✅ [PASS] C.3 Product stock after concurrent race is exactly 0 (not negative: 0)
✅ [PASS] C.4 Product stock safely reset to original baseline (24)

================================================================
FINAL RESULT: 18 PASSED, 0 FAILED
================================================================
```

All existing regression suites also re-verified with 100% pass rates:
- `npx tsx scripts/verify-audit-log-performance.ts` → **11 PASSED, 0 FAILED**
- `npx tsx scripts/verify-product-api-performance.ts` → **13 PASSED, 0 FAILED**
- `npx tsx scripts/verify-courier-webhook-atomicity.ts` → **14 PASSED, 0 FAILED**
- `npx tsx scripts/verify-courier-webhook-security.ts` → **17 PASSED, 0 FAILED**
- TypeScript check (`npm run lint`) → **0 errors**
- Applet compilation (`npm run build`) → **Build succeeded**
