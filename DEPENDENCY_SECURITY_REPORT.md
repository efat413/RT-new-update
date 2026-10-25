# Dependency & Security Reconciliation Audit Report
**Target Application:** Rongdhonu Trade (রঙধনু ট্রেড)  
**Date:** October 25, 2026  
**Status:** ⚠️ RECONCILED WITH SOURCE CODE & ARTIFACT CONSTRAINTS

---

## 1. Executive Summary

A comprehensive reconciliation audit was performed to align dependency security documentation with the actual Rongdhonu Trade source code and environment constraints:

- **Lockfile & Reproducibility Status:** `package-lock.json` is **absent** from the repository. Per project constraints, creating `package-lock.json` is strictly restricted.
- **Dependency Overrides Inspection:** `package.json` contains **no** `"overrides"` or `"resolutions"` field. Previous claims of a `"sharp": "$sharp"` override were unverified against the source and have been corrected.
- **Automated `npm audit` Execution Status:** Direct execution of `npm audit` and `npm audit --omit=dev` was attempted against the local environment on October 25, 2026. In npm v10, the audit command requires an existing lockfile (`package-lock.json` or `npm-shrinkwrap.json`) to construct the virtual dependency tree. Both commands exited with code 1 (`ENOLOCK`). Consequently, automated remote registry audits are marked **NOT RUN (BLOCKED BY ENOLOCK / LOCKFILE ABSENCE)**.
- **Runtime Scope Separation:**
  - **Production Dependencies (5 packages):** UI styling and React runtime components (`@tailwindcss/vite`, `@vitejs/plugin-react`, `lucide-react`, `react`, `react-dom`). In Cloudflare Workers edge deployment (`src/worker.ts`), zero external runtime npm dependencies are executed; the worker relies exclusively on native standard Web APIs (`crypto.subtle`, `Response`, `Request`, `URL`) and Cloudflare bindings (`D1Database`).
  - **Development Dependencies (8 packages):** Tooling for compilation, type checking, development API proxying, and testing (`@types/node`, `sharp`, `tailwindcss`, `tsx`, `typescript`, `vite`, `vitest`, `wrangler`).
- **Verifiable Local Quality Checks:** Source compilation (`npm run lint`), asset building (`npm run build`), applet compilation (`compile_applet`), and the Vitest test suite (`vitest run` — 29 test files, 329 tests) all pass cleanly.

---

## 2. Dependency Inventory & Verification Matrix

### Runtime Environment
- **Node.js:** Node.js 22 runtime
- **npm:** npm 10.x
- **Lockfile:** None (`package-lock.json` absent; creation restricted)
- **Configuration (.npmrc):** `package-lock=true`, `audit=true`, `fund=false`, `update-notifier=false`, `progress=false`

### Production Runtime Dependencies (`dependencies` in `package.json`)
| Package | Declared Version | Source Role | Audit Verification Status |
| :--- | :--- | :--- | :--- |
| `@tailwindcss/vite` | `^4.1.14` | Vite Tailwind integration plugin | NOT RUN (Requires lockfile) |
| `@vitejs/plugin-react` | `^6.1.2` | React Fast Refresh & JSX transform | NOT RUN (Requires lockfile) |
| `lucide-react` | `^0.546.0` | UI icon components | NOT RUN (Requires lockfile) |
| `react` | `^19.0.1` | Core React library | NOT RUN (Requires lockfile) |
| `react-dom` | `^19.0.1` | DOM renderer for React | NOT RUN (Requires lockfile) |

### Development Dependencies (`devDependencies` in `package.json`)
| Package | Declared Version | Purpose / Scope | Audit Verification Status |
| :--- | :--- | :--- | :--- |
| `@types/node` | `^22.14.0` | TypeScript definitions for Node.js | NOT RUN (Requires lockfile) |
| `sharp` | `^0.35.5` | Top-level image optimization utility | NOT RUN (Requires lockfile) |
| `tailwindcss` | `^4.1.14` | Utility-first CSS framework | NOT RUN (Requires lockfile) |
| `tsx` | `^4.21.0` | TypeScript execution runner for test scripts | NOT RUN (Requires lockfile) |
| `typescript` | `~5.8.2` | Static type checker (`tsc --noEmit`) | NOT RUN (Requires lockfile) |
| `vite` | `^8.3.2` | Development server and asset bundler | NOT RUN (Requires lockfile) |
| `vitest` | `^5.0.3` | Unit and integration test runner | NOT RUN (Requires lockfile) |
| `wrangler` | `^4.137.0` | Cloudflare Workers & D1 CLI tool | NOT RUN (Requires lockfile) |

### Overrides Status
- Declared in `package.json`: **None** (empty / omitted)
- Previous documentation claimed: `"overrides": { "sharp": "$sharp" }` &rarr; **RECONCILED: Removed unsupported claim**.

---

## 3. Actual Audit Commands & Execution Log

### 1. Production Runtime Audit Command
```bash
npm audit --omit=dev
```
- **Execution Date:** October 25, 2026
- **Exit Code:** `1`
- **Actual Output:**
```text
npm error code ENOLOCK
npm error audit This command requires an existing lockfile.
npm error audit Try creating one first with: npm i --package-lock-only
npm error audit Original error: loadVirtual requires existing shrinkwrap file
```
- **Classification:** **NOT RUN (BLOCKED BY ENOLOCK)**
- **Reason:** In the absence of `package-lock.json`, npm cannot resolve the dependency tree against the registry security advisory database. Creating a lockfile was intentionally avoided to comply with repository restrictions.

---

### 2. Full Development Audit Command
```bash
npm audit
```
- **Execution Date:** October 25, 2026
- **Exit Code:** `1`
- **Actual Output:**
```text
npm error code ENOLOCK
npm error audit This command requires an existing lockfile.
npm error audit Try creating one first with: npm i --package-lock-only
npm error audit Original error: loadVirtual requires existing shrinkwrap file
```
- **Classification:** **NOT RUN (BLOCKED BY ENOLOCK)**
- **Reason:** Requires `package-lock.json`. Per instructions, `npm audit fix` was NOT run, packages were NOT modified, and lockfiles were NOT created.

---

## 4. Verifiable Build, Quality & Security Results

All locally verifiable build and test operations were directly executed and passed:

1. **TypeScript Typecheck (`npm run lint`):**
   - Command: `tsc --noEmit`
   - Exit Code: `0`
   - Result: 0 compilation errors across client, server, and test code.

2. **Frontend Production Build (`npm run build`):**
   - Command: `VITE_CONFIG_NATIVE_IGNORE_WARNING=true vite build`
   - Exit Code: `0`
   - Result: Built distribution bundle in `dist/` with code splitting.

3. **Application Compilation (`compile_applet`):**
   - Result: Build succeeded.

4. **Automated Unit & Integration Test Suite (`npm test` / `vitest run`):**
   - Command: `vitest run`
   - Result: **29 test files passed, 329 tests passed (0 failures)**.

5. **D1 Schema Verification (`node verify-schema.js`):**
   - Result: All 31 migration files dynamically discovered; 22 tables, 59 indexes, 2 triggers, and constraints validated.
