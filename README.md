# GetPro (getproapp.org)

Node + Express directory app using SQLite via `better-sqlite3`.

## Hostinger: `zm.getproapp.org` / `il.getproapp.org` show “You’re all set to go”

That page is **not** from this Node app. DNS is working, but the subdomain is still bound to a **default static vhost** (empty `public_html/zm`, etc.) instead of your **Node.js** process.

**Fix (conceptually the same on all panels):** In **hPanel**, open your **Node.js** application and add **`zm.getproapp.org`** and **`il.getproapp.org`** as **domains** that run **this same app** as the apex domain — not as separate “subdomain websites” with their own document root. Wording varies (“Domains”, “Application URL”, “Attach domain”). Until both hosts proxy to Node with the **`Host`** header preserved, you will keep seeing Hostinger’s placeholder.

**After traffic hits Node**, the app maps hosts using `BASE_DOMAIN`:

| Host | Tenant |
|------|--------|
| `getproapp.org`, `www.getproapp.org` | Zambia UI + region picker (links to `zm` / `il` URLs) |
| `zm.getproapp.org` | Zambia (`tenant_id` 1) |
| `il.getproapp.org` | Israel (`tenant_id` 2) |

**Required env (production):** `BASE_DOMAIN=getproapp.org` (no `https://`), `PUBLIC_SCHEME=https`, `NODE_ENV=production`. Issue **SSL** for `zm` and `il` hostnames.

**Quick check:** set `DEBUG_HOST=1` in the panel, redeploy, then open:

- `https://zm.getproapp.org/healthz` — with `DEBUG_HOST=1`, JSON includes `resolvedHost` (expect `zm.getproapp.org`) and `baseDomain`; without it you only get `{ "ok": true }`.
- `https://zm.getproapp.org/api/debug/host` — should show `"subdomain":"zm"` and matching `resolvedHost`.

If you still get **Hostinger’s HTML** (not JSON), the request **never reaches Node** — fix the panel (same Node app for `zm` / `il`) or remove the extra “subdomain website” that only serves static files.

If you get **JSON** but `resolvedHost` is wrong (e.g. `127.0.0.1` or an internal name), the reverse proxy is not forwarding the public hostname. This app defaults to **`trust proxy` (hop count 1)** so `X-Forwarded-Host` is honored when the proxy sets it. Do **not** set `TRUST_PROXY=0` behind Hostinger unless you know you need it.

**Israel “coming soon” only:** set `ISRAEL_COMING_SOON=true` to show the static coming-soon page on `il.*` and block Israel-only API paths. Omit it (default) for the same directory/join experience as Zambia (separate `tenant_id` data).

## Hostinger / Linux: `invalid ELF header` on `better_sqlite3.node`

That error means the **native addon was built for another OS** (e.g. macOS/Windows) and was deployed to **Linux**. Common causes:

1. **`node_modules` was uploaded or committed** from your laptop — don’t do that.
2. The host ran **no install** on Linux, or an old `node_modules` folder overwrote a good one.

**Fix:**

1. Ensure **`node_modules` is not in Git** (see `.gitignore`) and not in your deployment ZIP/FTP upload.
2. On Hostinger, use a **build/install step on the server** (or their CI) so dependencies install **on Linux**:
   - Typical build command: `npm install` or `npm ci`
   - If a bad binary is still there, run once: `npm run rebuild-sqlite` (or `npm rebuild better-sqlite3`).
3. Redeploy so **`npm install` runs on Hostinger’s Linux environment** after upload.

`better-sqlite3` includes a platform-specific `.node` file; it must match the server OS and Node version.

## Local development

Create a `.env` file in the project root (this file is gitignored). Example:

```bash
# Required for first boot
ADMIN_PASSWORD=your-secure-password

# Recommended
NODE_ENV=development
SESSION_SECRET=use-a-long-random-string-in-production
BASE_DOMAIN=

npm install
npm start
```

**URLs:** The marketing site defaults to **`https://getproapp.org`** (apex). **Zambia** (ISO alpha-2 **`zm`**) uses **`https://zm.getproapp.org`**. **Israel** uses **`https://il.getproapp.org`**. The apex home shows a **Region** control (globe) to open those sites. Legacy paths **`/zm/…`** and **`/il/…`** redirect to **`zm.*`** and **`il.*`**. The old host **`zam.getproapp.org`** redirects to **`zm.getproapp.org`**. Configure **DNS** (and SSL) for `zm` and `il` (and wildcard `*.getproapp.org` if you use company subdomains).

**Multi-tenant data:** Categories, companies, leads, and admin access are scoped by **`tenant_id`** (Zambia `1`, Israel `2`). Each admin user has a **`tenant_id`**; the dashboard only shows data for that tenant. Set **`ADMIN_TENANT_ID`** (default `1`) when creating the first admin user. For an Israel-only admin, use **`ADMIN_TENANT_ID=2`** with a distinct **`ADMIN_USERNAME`**.

Home and directory search use autocomplete lists in `public/data/search-lists.json` (professional services + Zambia places). Regenerate with:

```bash
npm run build-search-lists
```

The server reads `public/data/search-lists.json` **on every directory request** (no restart). After you change that file or run `npm run build-search-lists`, **hard refresh** the site or bump the `?v=` on `LIST_URL` in `public/autocomplete.js` so the browser loads the updated JSON for autocomplete.

The animated “typing” hint is set with `data-watermark-text` on the `.pro-ac` blocks in `views/index.ejs` and `views/directory.ejs` (demo only; real options come from `search-lists.json`).

## Environment

**Common variables:** `ADMIN_PASSWORD` (required), `SESSION_SECRET`, `NODE_ENV`, `BASE_DOMAIN`, `PORT`, `HOST`, `SQLITE_PATH`, `SESSION_DIR`, `GETPRO_EMAIL`, `GETPRO_ADDRESS`, `CALL_CENTER_PHONE`, plus legacy `PRO_ONLINE_*` / `NETRA_*` if needed.

**Production:** set `BASE_DOMAIN=getproapp.org` (and `PUBLIC_SCHEME=https` if needed). Optional: `DEBUG_HOST=1` temporarily for `/healthz` and `/api/debug/host`; `ISRAEL_COMING_SOON=true` to lock Israel to coming-soon; `TRUST_PROXY=0` only if Node is exposed directly without a reverse proxy (Hostinger usually needs the default trust proxy). On hosts that don’t deploy `.env`, set the same keys in the panel’s environment variables.

If you used the old default database file, either rename `data/pronline.sqlite` to `data/getpro.sqlite` or set `SQLITE_PATH` to the old path.
