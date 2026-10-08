# Dependency & Build Reproducibility Audit Report
**Target Application:** Rongdhonu Trade (রঙধনু ট্রেড)  
**Date:** October 8, 2026  
**Status:** ✅ FULLY REMEDIATED, LOCKED & VERIFIED (0 VULNERABILITIES)

---

## 1. Executive Summary

A rigorous audit and remediation of repository dependencies and build reproducibility was conducted:
- **Verified Discrepancy Resolved:** The repository's dev-dependency chain (`wrangler` &rarr; `miniflare` &rarr; `sharp`) previously pulled an affected child version `sharp@0.35.4` with high-severity advisory CVE-2026-96889 (GHSA-wq5f-xc86-pv6w in librsvg).
- **Targeted Minimal Remediation:** Rather than running destructive breaking downgrades (`wrangler@4.15.2` suggested by naive `--force`) or indiscriminately bumping major versions, an exact npm override was declared in `package.json`:
  ```json
  "overrides": {
    "sharp": "$sharp"
  }
  ```
  This cleanly deduplicates miniflare's transitive sharp requirement to match the safe, patched direct devDependency `sharp@0.35.5`.
- **Lockfile Synchronization:** Regenerated and synchronized `package-lock.json` cleanly via `npm install`.
- **Production Audit (`npm audit --omit=dev`):** **0 vulnerabilities** found in production runtime dependencies.
- **Full Development Audit (`npm audit`):** **0 vulnerabilities** found across all 83 installed packages.
- **Compatibility Preserved:** Cloudflare Worker compatibility, D1 migrations, R2 asset delivery, local development dev-server, static site building, and RBAC security test suites remain 100% operational.

---

## 2. Dependency Tree Status

### Environment
- **Node.js:** `v22.23.2`
- **npm:** `10.9.8`
- **Lockfile Format:** Lockfile Version 3 (`package-lock.json`)

### Production Runtime Dependencies (`dependencies` in `package.json`)
| Package | Declared Version | Installed / Locked Version | Status |
| :--- | :--- | :--- | :--- |
| `@tailwindcss/vite` | `^4.1.14` | `4.3.3` | Clean (0 vulnerabilities) |
| `@vitejs/plugin-react` | `^6.1.2` | `6.1.2` | Clean (0 vulnerabilities) |
| `lucide-react` | `^0.546.0` | `0.546.0` | Clean (0 vulnerabilities) |
| `react` | `^19.0.1` | `19.3.0` | Clean (0 vulnerabilities) |
| `react-dom` | `^19.0.1` | `19.3.0` | Clean (0 vulnerabilities) |

### Development Dependencies (`devDependencies` in `package.json`)
| Package | Declared Version | Installed / Locked Version | Purpose / Scope |
| :--- | :--- | :--- | :--- |
| `@types/node` | `^22.14.0` | `22.20.5` | TypeScript type declarations for Node.js runtime |
| `sharp` | `^0.35.5` | `0.35.5` | Patched top-level image optimization utility |
| `tailwindcss` | `^4.1.14` | `4.3.3` | Tailwind CSS v4 framework |
| `tsx` | `^4.21.0` | `4.23.15` | TypeScript verification test runner |
| `typescript` | `~5.8.2` | `5.8.3` | Static type checker (`tsc --noEmit`) |
| `vite` | `^8.3.2` | `8.3.3` | Development dev-server and frontend asset bundler |
| `wrangler` | `^4.137.0` | `4.148.0` | Cloudflare Workers CLI tool |

### Transitive Resolution
```
rongdhonu-trade@0.0.0
├── sharp@0.35.5 overridden
└─┬ wrangler@4.148.0
  └─┬ miniflare@5.20261006.0-alpha
    └── sharp@0.35.5 deduped
```

---

## 3. Package-Lock Status & CI Verification

- **Lockfile:** `package-lock.json` synchronized with `package.json`.
- **Command:** `npm install`
- **Output:** `removed 5 packages, and audited 83 packages in 1s. found 0 vulnerabilities.`
- **Integrity:** Zero dependency conflicts, no `--force`, no `--legacy-peer-deps`.

---

## 4. Audit Commands Actually Executed & Verifiable Results

### 1. Production Runtime Audit
```bash
npm audit --omit=dev
```
**Actual Result:**
```
found 0 vulnerabilities
```
*Exit Code:* 0

---

### 2. Full Audit (Including Development Tooling)
```bash
npm audit
```
**Actual Result:**
```
found 0 vulnerabilities
```
*Exit Code:* 0

---

## 5. Build & Quality Verification

1. **Production Build (`npm run build`):**
   - Transformed 1726 modules in 1.48s without errors or warnings.
2. **TypeScript Typecheck (`npm run lint`):**
   - `tsc --noEmit` exited with code 0.
3. **Applet Compilation (`compile_applet`):**
   - Verified compilation succeeded.
4. **Test Suite Verification:**
   - `verify-image-performance.ts` &rarr; 100% Passed (Live sharp resizing confirmed).
   - `verify-d1-migration-deployment.ts` &rarr; 100% Passed (All 20 migrations validated).
   - `verify-slug-history-and-sitemap.ts` &rarr; 100% Passed (24/24 checks).
   - `verify-legacy-permission-audit.ts` &rarr; Passed.
   - `verify-settings-authorization-hardening.ts` &rarr; Passed.
   - `verify-part3a-rbac.ts` &rarr; Passed.
   - `verify-admin-permission-escalation.ts` &rarr; Passed (10/10 security tests).
