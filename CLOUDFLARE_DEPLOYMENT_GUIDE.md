# Cloudflare & D1 Deployment Guide — Rongdhonu Trade

All necessary production files for your website and Cloudflare D1 integration have been prepared and tested.

## 🗄️ Cloudflare Configuration
- **Worker Name**: `rongdhonutrade` (matches Cloudflare Workers Builds CI)
- **Database Name**: `rongdhonu-db`
- **Database ID**: `3276795d-5593-42c0-8e14-947f3ab1172b`
- **Binding Name**: `DB` (accessed via `env.DB`)

All shared e-commerce data (Products, Categories, Orders, Stock, Sliders, and Store Settings) is managed directly through Cloudflare D1 as the single source of truth across all devices and browsers.

---

## 🚀 How to Deploy & Apply D1 Database Migrations

### Step 1: Apply D1 Migrations to Production Database
Run the official Cloudflare D1 migrations command to create all tables (`products`, `categories`, `orders`, `sliders`, `store_settings`, `coupons`, `reviews`, `users`) and seed the initial catalog idempotently:

```bash
# Apply migrations to the production Cloudflare D1 database:
npx wrangler d1 migrations apply rongdhonu-db --remote

# Or run the npm script:
npm run d1:migrate
```

### Step 2: Build & Deploy
#### Option A: Automated Git CI (Cloudflare Workers Builds)
1. Commit and push this repository to your connected GitHub/GitLab repository.
2. Cloudflare Workers Builds automatically builds (`npm run build`) and deploys the Worker named `rt`.
3. In Cloudflare Dashboard: **Workers & Pages > Overview > rt > Settings > Bindings**:
   - Ensure D1 Database binding is bound:
     - Variable name: `DB`
     - D1 Database: `rongdhonu-db` (`3276795d-5593-42c0-8e14-947f3ab1172b`)

#### Option B: Deploy with Wrangler CLI
```bash
# 1. Authenticate with your Cloudflare Account:
npx wrangler login

# 2. Apply migrations to production D1 database:
npx wrangler d1 migrations apply rongdhonu-db --remote

# 3. Build & Deploy Worker:
npm run deploy
```

---

## 🔍 Troubleshooting: Error 10181 ("database not found")
If Cloudflare reports `D1 binding 'DB' references database '3276795d-5593-42c0-8e14-947f3ab1172b' which was not found [code: 10181]`:
1. **Account Isolation**: Cloudflare D1 databases are account-scoped. If you have more than one Cloudflare account (e.g. personal vs company, or multiple email logins), the D1 database `3276795d-5593-42c0-8e14-947f3ab1172b` was created in Account A, but the Worker `rt` / CI Token is deploying to Account B.
2. **Resolution**:
   - Run `npx wrangler d1 list` to verify which account ID owns `rongdhonu-db`.
   - Ensure the CI deployment API token (`CLOUDFLARE_API_TOKEN`) or Workers Builds project is created under that exact same Cloudflare account.
   - Alternatively, add `"account_id": "<YOUR_ACCOUNT_ID>"` in `wrangler.json` to lock the deployment to the correct account.

---

## 🔧 Troubleshooting: "This project is disconnected from your Git account"
If your Cloudflare build fails with:
```
This project is disconnected from your Git account, this may cause deployments to fail. Refer to https://developers.cloudflare.com/pages/platform/git-integration/#this-project-is-disconnected-from-your-git-account-this-may-cause-deployments-to-fail
```

### Solution 1: Re-authorize Cloudflare Pages on GitHub (Recommended)
1. **GitHub App Permissions**:
   - Open **GitHub** > click your avatar in the top-right > **Settings**.
   - In the left sidebar, click **Applications** > **Installed GitHub Apps**.
   - Find **Cloudflare Pages** and click **Configure**.
   - Under **Repository access**, ensure your repository is selected and access is granted. Click **Save**.
2. **Cloudflare Dashboard Reconnection**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages**.
   - Select your project (`rt`).
   - Go to **Settings** > **Builds & deployments** > **Source**.
   - Click **Reconnect** or **Manage Git Connection** and re-link your GitHub repository and default branch (`main`).
   - Go to the **Deployments** tab and click **Retry deployment**.

### Solution 2: Direct Deploy with Wrangler (Bypasses Git webhook)
Deploy directly from your terminal or command line without relying on the GitHub OAuth webhook:
```bash
# 1. Login to Cloudflare:
npx wrangler login

# 2. Deploy directly:
npm run deploy
```

---

## 🚚 Steadfast Courier API Integration: Secure Worker Secrets Architecture

For production security and compliance, all courier API credentials are strictly isolated on the server and must **never** be stored in client browser storage or public D1 database records.

Production Steadfast credentials must be configured exclusively as encrypted **Cloudflare Worker Secrets**:
- `STEADFAST_API_KEY`: Merchant API Key from the Steadfast Merchant Portal
- `STEADFAST_SECRET_KEY`: Merchant Secret Key from the Steadfast Merchant Portal
- `COURIER_WEBHOOK_SECRET`: Secret key used for authenticating incoming delivery webhook notifications and HMAC signatures

### Step 1: Configure Cloudflare Worker Secrets
Using Wrangler CLI:
```bash
# 1. (REQUIRED) Admin Authentication Secret:
npx wrangler secret put ADMIN_SECRET

# 2. Steadfast Courier API Key:
npx wrangler secret put STEADFAST_API_KEY

# 3. Steadfast Courier Secret Key:
npx wrangler secret put STEADFAST_SECRET_KEY

# 4. Courier Webhook Signature Verification Secret:
npx wrangler secret put COURIER_WEBHOOK_SECRET
```

Or via the Cloudflare Dashboard:
1. Open **Workers & Pages** &rarr; select **rt** &rarr; **Settings** &rarr; **Variables and Secrets**.
2. Click **Add** under **Environment Variables / Secrets** (select **Secret** type):
   - `ADMIN_SECRET`
   - `STEADFAST_API_KEY`
   - `STEADFAST_SECRET_KEY`
   - `COURIER_WEBHOOK_SECRET`
3. Click **Deploy**.

---

### Step 2: Legacy D1 Database Credentials Migration & Cleanup

If you have an existing D1 database where credentials were previously saved in `store_settings`:
1. **Verify Worker Secrets**: Confirm `STEADFAST_API_KEY` and `STEADFAST_SECRET_KEY` are provisioned in Cloudflare.
2. **Check Status**: In the Admin Portal &rarr; Couriers tab, or via `GET /api/admin/courier/credentials/status`.
3. **Execute Safe Cleanup**:
   - Run the automated admin cleanup: `POST /api/admin/courier/cleanup-legacy-credentials`
   - Or apply migration 0014: `npx wrangler d1 migrations apply rongdhonu-db --remote`
4. The cleanup removes `steadfastApiKey` and `steadfastSecretKey` from D1 `settings_json` while preserving all other store branding and preferences.

---

## ⚡ Optimizing Cloudflare "Initializing build environment..."

Cloudflare Pages and Cloudflare Workers Builds initialize a containerized environment before running the build command. The following optimizations have been configured to make this initialization fast, deterministic, and reliable:

1. **`.node-version` & `.nvmrc`**:
   - Pinned to `22` to match `package.json` `"engines": { "node": ">=20.0.0" }`.
   - Prevents Cloudflare from defaulting to older Node versions or spending time resolving dynamic versions.

2. **`package-lock.json`**:
   - Generated a deterministic dependency tree.
   - Allows Cloudflare and CI to install packages via `npm ci` without recalculating dependency trees on every build.

3. **`.npmrc` (CI Build Optimization)**:
   - Configured with `progress=false`, `audit=false`, `fund=false`, and `prefer-offline=true`.
   - Disables terminal progress bars and security audits during automated container builds, significantly speeding up package extraction.

4. **`wrangler.json` Build Scope**:
   - Configured `"build.watch_dir": "src"` to prevent unnecessary triggers and isolate build monitoring to the application source code.



