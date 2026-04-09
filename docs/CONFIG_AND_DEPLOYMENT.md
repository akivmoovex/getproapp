# Configuration and deployment

This document lists **runtime environment variables** for the GetPro Node server, **development vs production** behavior, and **Hostinger** notes.

## Production policy (Hostinger)

1. **Use panel environment variables only.** Set variables under **Website → Settings & Redeploy** (or **Advanced → Environment variables**). Production runs with **`NODE_ENV=production`** and **does not load a `.env` file** from the app directory (`src/startup/bootstrap.js`).
2. **Do not rely on** committing or uploading a `.env` file for production — deployment or workers may not see it consistently.
3. **Every Node / LiteSpeed worker** must receive the same variables from the host. If some workers lack `DATABASE_URL`, fix Hostinger configuration; do not depend on file-based fallback in production.
4. **Local development:** copy `.env.example` to `.env` and set values; with `NODE_ENV` not equal to `production`, the app **merges** `.env` into `process.env` for convenience.

## Required in production (`NODE_ENV=production`)

| Variable | Notes |
|----------|--------|
| **DATABASE_URL** or **GETPRO_DATABASE_URL** | PostgreSQL URI — app exits if both missing. |
| **SESSION_SECRET** | Non-empty; long random string. Checked at startup (see `productionEnvGate.js`). |
| **BASE_DOMAIN** | Apex domain without scheme (e.g. `getproapp.org`). Required for correct regional routing — checked at startup. |

**Strongly recommended:** **PUBLIC_SCHEME** (defaults to `https` in code if unset), **ADMIN_PASSWORD** (first admin bootstrap), **GETPRO_PG_SSL** (e.g. `no-verify` for Supabase), **TRUST_PROXY** (`1` behind reverse proxy).

## Environment files in the repo

| File | Purpose |
|------|---------|
| `.env.example` | Template for local use |
| `.env.development.example` | Suggested dev/staging values |
| `.env.production.example` | Suggested production values (reference only — set real values in Hostinger) |

Real `.env` files are **gitignored**. Never commit secrets.

## Core variables (summary)

| Variable | Required prod | Notes |
|----------|---------------|--------|
| **DATABASE_URL** / **GETPRO_DATABASE_URL** | Yes | Prefer `DATABASE_URL` |
| **GETPRO_PG_SSL** | Optional | `strict` \| `no-verify` \| `off` |
| **NODE_ENV** | Set `production` on live sites | Controls dotenv, cookies, checks |
| **BASE_DOMAIN** | **Yes** (enforced when production) | No `https://` |
| **PUBLIC_SCHEME** | Optional | Defaults to `https` |
| **SESSION_SECRET** | **Yes** (enforced when production) | |
| **ADMIN_PASSWORD** | For admin bootstrap | Warned if missing (`productionStartupChecks.js`) |
| **GETPRO_SKIP_DOTENV** | Optional | Force skip `.env` even in dev (e.g. tests) |

### Branding

**GETPRO_PRODUCT_NAME**, **GETPRO_PRODUCT_NAME_GETPRO**, **GETPRO_PUBLIC_TAGLINE** — see `src/platform/branding.js`. **APP_BRAND** is not read by Node (panel label only).

### Other variables

See `README.md` and `.env.example` for **GETPRO_STYLES_V**, **GETPRO_USE_BUILD_ASSETS**, seeds, **ISRAEL_COMING_SOON**, intake/OTP, etc.

## NODE_ENV: development vs production

| `NODE_ENV=production` | Not production |
|------------------------|----------------|
| No `.env` file merge | `.env` merged from app root (unless `GETPRO_SKIP_DOTENV=1`) |
| `SESSION_SECRET`, `BASE_DOMAIN` enforced at startup | Defaults / dev session secret allowed |

## Build and start

- **`npm run build`** — Vite + search lists; needed for `public/build/*` in production if using hashed assets.
- **`npm start`** — `node server.js` (Hostinger **START_COMMAND**).

## Related code

- `src/startup/bootstrap.js` — when dotenv runs
- `src/startup/productionEnvGate.js` — production required vars + diagnostics
- `src/db/pg/pool.js` — Postgres URL and SSL
- `src/startup/productionStartupChecks.js` — additional production warnings
