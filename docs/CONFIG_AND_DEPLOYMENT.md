# Configuration and deployment

This document lists **runtime environment variables** used by the GetPro Node server, how they behave in **development vs production**, and **Hostinger / LiteSpeed** notes. It does not replace `README.md`; it focuses on config separation for **pronline.org** (dev/staging) vs **getproapp.org** (production).

## Hostinger checklist

1. **Persistent env vars:** Website dashboard → **Settings & Redeploy** (or **Advanced → Environment variables**, depending on plan). Changes usually require **redeploy** or app restart.
2. **Build vs start:** `BUILD_COMMAND` (e.g. `npm run build`) produces `public/build/*`. `START_COMMAND` (e.g. `npm start`) runs `node server.js`.
3. **LiteSpeed / lsnode:** Some worker processes may **not** receive panel-injected variables. If logs show **misconfigured workers** without `DATABASE_URL`, add a **server-only** `.env` file in the **application root next to `server.js`** containing at least `DATABASE_URL`. The app loads that file via `src/startup/bootstrap.js`; dotenv **does not override** variables already set by the host.

## Environment files in the repo

| File | Purpose |
|------|---------|
| `.env.example` | Neutral template; copy to `.env` locally |
| `.env.development.example` | Suggested values for **pronline.org** / dev-staging |
| `.env.production.example` | Suggested values for **getproapp.org** |

Real `.env` files are **gitignored**. Never commit secrets.

## Core variables (audit summary)

| Variable | Used | Required | Typical dev | Typical prod | Notes |
|----------|------|----------|-------------|--------------|-------|
| **DATABASE_URL** | Yes (`src/db/pg/pool.js`, bootstrap) | **Yes** (runtime) | Supabase/dev DB URI | Prod DB URI | Prefer this; `GETPRO_DATABASE_URL` is fallback name only |
| **GETPRO_DATABASE_URL** | Yes | If `DATABASE_URL` unset | Same | Same | Alternate name only |
| **GETPRO_PG_SSL** | Yes (`pool.js`) | Optional | `no-verify` with Supabase | Often `no-verify` | `strict` \| `no-verify` \| `off` |
| **GETPRO_PG_POOL_MAX** / **IDLE** / **CONNECT_TIMEOUT** | Yes (`pool.js`) | Optional | Defaults 10 / 30s / 10s | Tune for traffic | |
| **GETPRO_SKIP_DOTENV** | Yes (`bootstrap.js`) | Optional | `0` | `0` | Set `1` to ignore `.env` file (host-only) |
| **NODE_ENV** | Yes (many files) | **Strongly recommended** | `development` | `production` | Affects cookies, sessions, logging, checks |
| **BASE_DOMAIN** | Yes (host routing, URLs) | **Yes** for multi-tenant hosts | `pronline.org` | `getproapp.org` | No `https://`; lowercase |
| **PUBLIC_SCHEME** | Yes | Optional (default `https`) | `https` | `https` | |
| **PORT** / **HOST** | Yes (`server.js`) | Optional | `3000` / `0.0.0.0` | Panel may set `PORT` | |
| **TRUST_PROXY** | Yes (`server.js`, checks) | Optional | `1` behind proxy | `1` | Required for correct `req.hostname` / `X-Forwarded-Host` |
| **SESSION_SECRET** | Yes (`server.js`) | **Required when `NODE_ENV=production`** | Long random string | Long random string | Fails startup in prod if empty |
| **ADMIN_PASSWORD** | Yes (`src/auth/index.js`, checks) | **Required for first admin user** | Strong password | Strong password | Also checked in `productionStartupChecks.js` |
| **ADMIN_USERNAME** | Yes | Optional | `admin` | Custom | |
| **ADMIN_ROLE** / **ADMIN_TENANT_ID** | Yes (`src/auth/index.js`) | Optional | | | |
| **APP_BRAND** | **Not read by Node** | — | `proonline` (panel) | `getpro` (panel) | Use **GETPRO_PRODUCT_NAME** for UI copy |

### Branding (actual app)

| Variable | Default | Purpose |
|----------|---------|---------|
| **GETPRO_PRODUCT_NAME** | `Pro-online` | Primary product name in UI |
| **GETPRO_PRODUCT_NAME_GETPRO** | `GetPro` | Secondary lockup |
| **GETPRO_PUBLIC_TAGLINE** | `My Trusted Professional` | Tagline |

### Other variables (selected)

- **GETPRO_STYLES_V** — cache-bust query for static assets (`server.js`).
- **GETPRO_USE_BUILD_ASSETS** — force on/off Vite build assets; default follows `NODE_ENV` (`src/platform/assetUrls.js`).
- **GETPRO_MARKETING_OPERATIONS_SLUG** — default `zm` (`src/lib/marketingOperationalUrls.js`).
- **GETPRO_DB_MISSING_EXIT_DELAY_MS** — delay before exit when DB URL missing (`server.js`).
- **GETPRO_DEBUG_ROUTING** / **DEBUG_HOST** / **GETPRO_LOG_HOST_TENANT** — diagnostics.
- **SEED_BUILTIN_USERS** / **SEED_MANAGER_USERS** / **SEED_FIELD_AGENT_USER** — disable seeds with `0`.
- **ISRAEL_COMING_SOON** — gates Israel tenant (`src/tenants/israelComingSoon.js`).
- Intake / OTP: **GETPRO_OTP_PEPPER**, **GETPRO_SMS_***, etc. (`src/intake/clientProjectIntake.js`).

## NODE_ENV: development vs production on pronline.org

The app does **not** tie `NODE_ENV` to a domain. You choose per deployment.

| If `NODE_ENV=production` | If `NODE_ENV=development` |
|----------------------------|---------------------------|
| Secure session cookies, `SESSION_SECRET` enforced, production startup checks, combined access logs | `SESSION_SECRET` may fall back to dev default if unset (unsafe if exposed), verbose dev-style logs possible |
| Stricter behavior for intake OTP in production paths | More permissive logging paths in some modules |

**Risk:** Setting **`NODE_ENV=development`** on a **public** pronline.org host weakens session security and skips some production checks — only do this for **private** staging or with full understanding. For a **public** staging site that should behave like production, use **`NODE_ENV=production`** with **`BASE_DOMAIN=pronline.org`** and separate DB/secrets from production.

## Build and start (package.json)

- **`npm run build`** — `vite build` + `build-search-lists`; required before production if you rely on `/build/*` assets.
- **`npm start`** — `node server.js` (Hostinger **START_COMMAND**).

## Related code

- `src/startup/bootstrap.js` — dotenv path, DB URL provenance logging  
- `src/db/pg/pool.js` — Postgres connection string and SSL  
- `src/startup/productionStartupChecks.js` — production warnings  
- `server.js` — trust proxy, sessions, port, routing  
