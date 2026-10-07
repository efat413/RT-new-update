# Dependency & Build Reproducibility Audit Report
**Target Application:** Rongdhonu Trade (রঙধনু ট্রেড)  
**Date:** October 7, 2026  
**Status:** ✅ RESOLVED, LOCKED & ACCURATELY AUDITED

---

## 1. Executive Summary

A rigorous audit of repository dependency management and build reproducibility was conducted to resolve prior discrepancies:
- **Verified Discrepancy Resolved:** The repository previously lacked `package-lock.json`, causing `npm ci` to fail with `npm error code EUSAGE` / `ENOLOCK` in CI/CD (`.github/workflows/deploy.yml`) and preventing local deterministic reproducibility.
- **Action Taken:** Generated the authoritative `package-lock.json` (Lockfile Version 3) using `npm i --package-lock-only`, perfectly anchoring the exact dependencies declared in `package.json` without introducing unrequested, breaking major package upgrades.
- **Clean Installation (`npm ci`):** Executed `npm ci` cleanly. All 87 dependency nodes were resolved and installed deterministically in 14s.
- **Production Audit (`npm audit --omit=dev`):** **0 vulnerabilities** found in production runtime dependencies.
- **Development Audit (`npm audit`):** Identified **3 high-severity vulnerability advisories** residing exclusively in the dev-dependency tree (`node_modules/miniflare/node_modules/sharp`, pulled transitively by dev-dependency `wrangler`).
- **Policy Enforcement:** Per user instructions, packages are **not** upgraded unnecessarily or with breaking changes (`wrangler@4.15.2` major downgrade/reconfiguration) simply to alter audit text. The real audit results are accurately recorded and documented below.

---

## 2. Dependency Tree Status

### Environment
- **Node.js:** `v22.23.2`
- **npm:** `10.9.8`
- **Lockfile Format:** Lockfile Version 3 (`package-lock.json`, 33.9 KB)

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
| `sharp` | `^0.35.5` | `0.35.5` | Top-level image optimization utility |
| `tailwindcss` | `^4.1.14` | `4.3.3` | Tailwind CSS v4 framework |
| `tsx` | `^4.21.0` | `4.23.15` | TypeScript verification test runner |
| `typescript` | `~5.8.2` | `5.8.3` | Static type checker (`tsc --noEmit`) |
| `vite` | `^8.3.2` | `8.3.3` | Development dev-server and frontend asset bundler |
| `wrangler` | `^4.137.0` | `4.148.0` | Cloudflare Workers CLI tool |

### Dependency Graph Totals
- **Total Packages Audited:** 87
- **Production Packages:** 39
- **Development Packages:** 40
- **Optional Packages:** 19
- **Peer Packages:** 0

---

## 3. Package-Lock Status & CI Verification

- **State Prior to Resolution:** Missing `package-lock.json`.
- **Generation Command:** `npm i --package-lock-only`
- **Verification Commands Executed:**
  ```bash
  npm ci
  ```
  *Output:* `added 87 packages, and audited 88 packages in 14s` (Clean zero-error exit).
- **CI/CD Alignment:** `.github/workflows/deploy.yml` runs `npm ci` on both the `validate` and `deploy` jobs; with `package-lock.json` committed, automated builds are now deterministic and reproducible.

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
*Conclusion:* The production runtime bundle deployed to users and Cloudflare Workers contains **0 vulnerabilities**.

---

### 2. Full Audit (Including Development Tooling)
```bash
npm audit
```
**Actual Output:**
```
# npm audit report

sharp  <0.35.5
Severity: high
sharp : Vulnerability in librsvg dependency CVE-2026-96889 - https://github.com/advisories/GHSA-wq5f-xc86-pv6w
fix available via `npm audit fix --force`
Will install wrangler@4.15.2, which is a breaking change
node_modules/miniflare/node_modules/sharp
  miniflare  <=0.0.0-fec45ed61 || >=4.20250508.3
  Depends on vulnerable versions of sharp
  node_modules/miniflare
    wrangler  <=0.0.0-7ae5dd357 || >=4.16.0
    Depends on vulnerable versions of miniflare
    node_modules/wrangler

3 high severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force
```

### 3. Machine-Readable JSON Audit Metadata
From `npm audit --json`:
```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {
    "sharp": {
      "name": "sharp",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1241331,
          "name": "sharp",
          "dependency": "sharp",
          "title": "sharp : Vulnerability in librsvg dependency CVE-2026-96889",
          "url": "https://github.com/advisories/GHSA-wq5f-xc86-pv6w",
          "severity": "high",
          "cwe": ["CWE-416", "CWE-1395"],
          "range": "<0.35.5"
        }
      ],
      "effects": ["miniflare"],
      "range": "<0.35.5>",
      "nodes": ["node_modules/miniflare/node_modules/sharp"]
    },
    "miniflare": {
      "name": "miniflare",
      "severity": "high",
      "isDirect": false,
      "via": ["sharp"],
      "effects": ["wrangler"],
      "nodes": ["node_modules/miniflare"]
    },
    "wrangler": {
      "name": "wrangler",
      "severity": "high",
      "isDirect": true,
      "via": ["miniflare"],
      "effects": [],
      "nodes": ["node_modules/wrangler"]
    }
  },
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 0,
      "high": 3,
      "critical": 0,
      "total": 3
    },
    "dependencies": {
      "prod": 39,
      "dev": 40,
      "optional": 19,
      "total": 87
    }
  }
}
```

---

## 5. Detailed Vulnerability Inventory (Dev-Only)

| Package | Severity | Advisory / CVE | Dependency Path | Fix Availability | Impact Analysis |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `sharp` (`0.35.4`) | **High** | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) (CVE-2026-96889) | `wrangler` &rarr; `miniflare` &rarr; `sharp` | Available only via breaking change (`wrangler@4.15.2` downgrade via `npm audit fix --force`) | Transitive dev dependency inside local Miniflare emulation. Not exposed to production storefront visitors, customer sessions, or live Cloudflare Worker runtime. |
| `miniflare` | **High** | Propagated via `sharp` | `wrangler` &rarr; `miniflare` | Requires breaking downgrade of wrangler | Dev CLI only |
| `wrangler` | **High** | Propagated via `miniflare` | Direct devDependency `wrangler` (`4.148.0`) | Requires breaking downgrade to `4.15.2` | Dev/build CLI only |

*Note on Direct `sharp`:* Direct `devDependencies["sharp"]` is at `^0.35.5` (locked at `0.35.5`), which is patched. The advisory stems solely from Miniflare's pinned internal child dependency `sharp@0.35.4`.

Per change discipline, we do not force a breaking downgrade (`wrangler@4.15.2`) which would break modern Cloudflare Workers compatibility.

---

## 6. Build & Quality Verification

1. **Clean Installation:** `npm ci` &rarr; Successfully installed in 14s.
2. **TypeScript Compilation:** `npm run lint` (`tsc --noEmit`) &rarr; 0 errors.
3. **Vite Production Asset Build:** `npm run build` &rarr; 1725 modules transformed, built in 1.36s.
4. **RBAC & Security Test Suites:**
   - `npx tsx scripts/verify-legacy-permission-audit.ts` &rarr; Passed (all 5 test groups).
   - `npx tsx scripts/verify-settings-authorization-hardening.ts` &rarr; Passed (all 5 test groups).
   - `npx tsx scripts/verify-part3a-rbac.ts` &rarr; Passed.
   - `npx tsx scripts/verify-admin-permission-escalation.ts` &rarr; Passed.

---

## 7. Current Repository State Summary

* **`package-lock.json` present:** Yes (Lockfile v3, fully committed).
* **Deterministic builds (`npm ci`):** Verified and functioning.
* **Production runtime vulnerabilities:** **0** (`npm audit --omit=dev`).
* **Development tooling vulnerabilities:** **3 High** (in dev CLI tool `wrangler` &rarr; `miniflare` &rarr; `sharp <0.35.5`).
