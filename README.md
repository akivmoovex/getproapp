# GetPro (getproapp.org)

Node + Express directory app using SQLite via `better-sqlite3`.

## Git / CI deployment (Hostinger Node.js, etc.)

This app is **Express**: it starts with `node server.js` from the **repository root**. There is **no** framework bundle folder (no `dist/`, `.next`, or `out/` from a static export).

| Panel field | What to use |
|-------------|-------------|
| **Root / App directory** | Repo root (often `.` or left blank) |
| **Install** | `npm ci` or `npm install` |
| **Build** | `npm run build` — in this repo that runs `build-search-lists` only. If your host runs install separately, a build-only step of `npm run build` is enough. |
| **Output / Publish directory** | **Leave empty**, **none**, **`.`**, or the option your UI labels **null / no output** for backend-only apps. **Do not** set `dist`, `build`, `out`, or `.next` — those paths do not exist here and will break deploy. |
| **Start** | `npm start` |

Some UIs fail when **Output directory** points at a missing folder or when they expect a SPA build. For a **server-only** Node app, the fix is usually to **clear** that field or set output to **null / none / root** per the provider’s Express template — not a static export path.

## Hostinger: `zm.getproapp.org` / `il.getproapp.org` show “You’re all set to go”

That page is **not** from this Node app. DNS is working, but the subdomain is still bound to a **default static vhost** (empty `public_html/zm`, etc.) instead of your **Node.js** process.

### Hostinger support: File Manager, `public_html/il`, and `index.html`

Support often says: open **File Manager**, you’ll see **`public_html/il/`** (or `zm/`), upload site files, or set the subdomain’s **document root** to **use `public_html`** (same as the main site) so it isn’t pointed at `public_html/il/`.

That guidance is for **classic static / PHP** sites (an `index.html` or `index.php` in that folder). **This GetPro app is different:** it is **Express (Node)**. It does **not** serve your real pages from `public_html/il/` and you should **not** try to “fix” subdomains by copying an `index.html` there unless you intentionally want a tiny static stub.

**What you actually need:** requests to `zm.getproapp.org` and `il.getproapp.org` must hit the **same Node.js process** as `getproapp.org`. In **hPanel → Node.js** (your deployed app), add **`zm.getproapp.org`** and **`il.getproapp.org`** under **Domains** / **Application URL** (wording varies). If you instead only have a **separate “subdomain website”** that created `public_html/il` with no files, you’ll keep seeing the placeholder until that hostname is tied to **Node**, not to an empty static root.

Using **“document root = `public_html`”** for the subdomain can align static routing with the main site, but **only** helps if your plan ultimately **proxies** that host to your Node app (many setups still need the Node app’s domain list as above). When in doubt, confirm with Hostinger that **`il` and `zm` hostnames are routed to your Node application**, not only to an Apache document root.

**Fix (conceptually the same on all panels):** In **hPanel**, open your **Node.js** application and add **`zm.getproapp.org`** and **`il.getproapp.org`** as **domains** that run **this same app** as the apex domain — not as separate “subdomain websites” with their own document root. Wording varies (“Domains”, “Application URL”, “Attach domain”). Until both hosts proxy to Node with the **`Host`** header preserved, you will keep seeing Hostinger’s placeholder.

**After traffic hits Node**, the app maps hosts using `BASE_DOMAIN`:

| Host | Tenant |
|------|--------|
| `getproapp.org`, `www.getproapp.org` | Zambia UI + region picker |
| `zm.getproapp.org` | Zambia (`tenant_id` 1) |
| `il.getproapp.org` | Israel (`tenant_id` 2) |
| `bw.getproapp.org` | Botswana (`tenant_id` 3) |
| `zw.getproapp.org` | Zimbabwe (`tenant_id` 4) |
| `za.getproapp.org` | South Africa (`tenant_id` 5) |
| `na.getproapp.org` | Namibia (`tenant_id` 6) |

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

**Multi-tenant data:** Categories, companies, leads, and admin access are scoped by **`tenant_id`**. New tenants created in **Super admin** (`/admin/super`) get a **copy of tenant 1’s categories** as a starting point (no companies until you add them).

### Admin roles & tenant stages

**Roles** (stored on `admin_users.role`):

| Role | Access |
|------|--------|
| `super_admin` | Full tenant list, create tenants, set **stage**, scope to any tenant, manage users when scoped. |
| `tenant_manager` | Same tenant: edit directory + **create** other tenant users (manager / editor / viewer). |
| `tenant_editor` | Same tenant: categories, companies, leads (read/write). |
| `tenant_viewer` | Same tenant: **dashboard + leads only** (reports); cannot edit directory data. |

**First boot user:** `ADMIN_USERNAME` (default `admin`) + **`ADMIN_PASSWORD`** (required). Role defaults to **`super_admin`** with `tenant_id` **null**. To seed a tenant-scoped user instead, set e.g. `ADMIN_ROLE=tenant_editor` and **`ADMIN_TENANT_ID=1`**.

**Tenant stages** (`tenants.stage`): `PartnerCollection`, `Enabled`, `Disabled`. Only **`Enabled`** tenants appear in the public **region / country** UI and receive normal traffic on **`{slug}.BASE_DOMAIN`**. Other stages hide the country from the picker and the app responds with **503** on that platform host until enabled.

**Super admin UI:** After login, open **`/admin/super`** to create tenants, change stages, and **set tenant scope** before using Categories / Companies / Users for that tenant.

**Public admin entry:** The home menu links to **`/getpro-admin`**, which shows username, password, **Login**, and **Cancel** (same credentials as `/admin/login`). Company-marketing subdomains redirect to **`zm.{BASE_DOMAIN}/getpro-admin`**.

**Data model:** See [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) for which **tenants** exist by default and which **tables** are scoped by `tenant_id`.

**Built-in demo users** (password `1234`, created once if missing): `tenantmanager` (`tenant_manager`, Zambia) and `superadmin` (`super_admin`). Disable seeding in production with **`SEED_BUILTIN_USERS=0`**.

**CSS cache bust:** Set **`GETPRO_STYLES_V`** (or rely on the default in code) so all templates use one `stylesVersion` for `/styles.css?v=…`.

Home and directory search use autocomplete lists in `public/data/search-lists.json` (professional services + Zambia places). Regenerate with:

```bash
npm run build-search-lists
```

The server reads `public/data/search-lists.json` **on every directory request** (no restart). After you change that file or run `npm run build-search-lists`, **hard refresh** the site or bump the `?v=` on `LIST_URL` in `public/autocomplete.js` so the browser loads the updated JSON for autocomplete.

The animated “typing” hint is set with `data-watermark-text` on the `.pro-ac` blocks in `views/index.ejs` and `views/directory.ejs` (demo only; real options come from `search-lists.json`).

## Environment

**Common variables:** `ADMIN_PASSWORD` (required), `SESSION_SECRET`, `NODE_ENV`, `BASE_DOMAIN`, `PORT`, `HOST`, `SQLITE_PATH`, `SESSION_DIR`, `GETPRO_EMAIL`, `GETPRO_ADDRESS`, `CALL_CENTER_PHONE`, `GETPRO_STYLES_V`, `SEED_BUILTIN_USERS` (`0` to skip demo admin seeding).

**Production:** set `BASE_DOMAIN=getproapp.org` (and `PUBLIC_SCHEME=https` if needed). Optional: `DEBUG_HOST=1` temporarily for `/healthz` and `/api/debug/host`; `ISRAEL_COMING_SOON=true` to lock Israel to coming-soon; `TRUST_PROXY=0` only if Node is exposed directly without a reverse proxy (Hostinger usually needs the default trust proxy). On hosts that don’t deploy `.env`, set the same keys in the panel’s environment variables.

Default SQLite path is **`data/getpro.sqlite`**. Point `SQLITE_PATH` at your file if you keep the database elsewhere.
