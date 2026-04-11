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

## Admin > DB Tools Environment Policy

**Admin → DB tools** (“Create test data” / “Clear seeded data”) are **restricted by environment**. They are designed to **prevent accidental data manipulation** on live production and are controlled via **`NODE_ENV`** and **explicit fixture flags** (see `src/admin/dbFixturesEnv.js`).

| Environment | Domain | DB tools status | Notes |
|-------------|--------|-----------------|-------|
| Test / Demo | pronline.org | Allowed only when explicitly enabled | Requires both fixture flags if `NODE_ENV=production` |
| Production | getproapp.org | Always blocked by default | Never enable fixture flags in real production |

**Demo / test hosts (e.g. pronline.org):** DB tools can be enabled in either of these ways:

- Use **`NODE_ENV` not equal to `production`** (e.g. `development`), **or**
- Set **`NODE_ENV=production`** and **both** of the following to exactly **`1`**:
  - `GETPRO_ALLOW_DB_FIXTURES=1`
  - `GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION=1`

**Real production (getproapp.org):** DB tools must **remain disabled**. Do **not** set:

- `GETPRO_ALLOW_DB_FIXTURES`
- `GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION`

**Safety:** DB tools are **super-admin only**, **tenant-scoped**, and limited to **tracked seeded data** (`seed_runs` / `seed_run_items`). They are **not** intended for use on live production customer data. See **`.env.development.example`** / **`.env.production.example`** for host-specific guidance.

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

**GETPRO_PRODUCT_NAME**, **GETPRO_PRODUCT_NAME_GETPRO**, **GETPRO_PUBLIC_TAGLINE** — see `src/platform/branding.js`. **GETPRO_HTML_DATA_BRAND** (`getpro` \| `proonline`) sets the default visible lockup line and theme tokens; optional alias **APP_BRAND** (same values). Omitted: client `gp-brand` / default styling applies.

### Other variables

See `README.md` and `.env.example` for **GETPRO_STYLES_V**, **GETPRO_USE_BUILD_ASSETS**, seeds, **ISRAEL_COMING_SOON**, intake/OTP, etc.

## NODE_ENV: development vs production

| `NODE_ENV=production` | Not production |
|------------------------|----------------|
| No `.env` file merge | `.env` merged from app root (unless `GETPRO_SKIP_DOTENV=1`) |
| `SESSION_SECRET`, `BASE_DOMAIN` enforced at startup | Defaults / dev session secret allowed |

## Build and start

- **`npm run build`** — Vite + search lists; needed for `public/build/*` in production if using hashed assets.
- **`npm start`** — `node index.js` (loads `server.js`; Hostinger **START_COMMAND**).

## Related code

- `src/admin/dbFixturesEnv.js` — Admin → DB tools enabled/disabled (see **Admin > DB Tools Environment Policy** above)
- `src/startup/bootstrap.js` — when dotenv runs; production may merge **`.env.production`** from well-known paths when host env is incomplete (see file header and logs — exact paths depend on deployment home directory)
- `src/startup/productionEnvGate.js` — production required vars + diagnostics
- `src/db/pg/pool.js` — Postgres URL and SSL
- `src/startup/productionStartupChecks.js` — additional production warnings
- Field Agent moderation (tables, CRM linkage): **`docs/field-agent-moderation.md`**
