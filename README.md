# GetPro (getproapp.org)

Node + Express directory app: **PostgreSQL is required** (`DATABASE_URL` or `GETPRO_DATABASE_URL`). Application data and **sessions** use the same Postgres pool (`connect-pg-simple`, table `public.session`). **`better-sqlite3` is not a dependency** (it existed only for removed SQLite tooling). There is **no hybrid SQLite/Postgres runtime** and **`npm run rebuild-sqlite`** does not exist. See **`docs/SQLITE_RUNTIME_CUTOVER.md`**.

## Git / CI deployment (Hostinger Node.js, etc.)

This app is **Express**: it starts with `npm start` (`node server.js`) from the **repository root**. `package.json` sets `"main": "server.js"` and `"start": "node server.js"` so hosts that run `npm start` need **no** custom entry file. There is **no** framework bundle folder (no `dist/`, `.next`, or `out/` from a static export).

| Panel field | What to use |
|-------------|-------------|
| **Root / App directory** | Repo root (often `.` or left blank) |
| **Entry file / Startup file** | **Leave unset / default** if the host runs **`npm start`** (recommended). The process entry is **`server.js`** via `package.json` `main` + `start`. Only set a startup file explicitly if your panel requires it — use **`server.js`**. |
| **Install** | `npm ci` or `npm install` |
| **Build** | `npm run build` — runs `build:assets` (Vite → `public/build/`) then `build-search-lists`. Production should run at least `npm run build:assets` before `npm start` so hashed CSS/JS and `asset-map.json` exist. If your host runs install separately, use `npm run build` or `npm run build:assets` as the build step. |
| **Output / Publish directory** | **Leave empty**, **none**, **`.`**, or the option your UI labels **null / no output** for backend-only apps. **Do not** set `dist`, `build`, `out`, or `.next` — those paths do not exist here and will break deploy. |
| **Start** | `npm start` (runs `node server.js`) |

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
| `getproapp.org`, `www.getproapp.org` | Apex UI (often **`global`** tenant when enabled) + region picker |
| `global.getproapp.org` | Global (`tenant_id` **1**) — apex marketing when enabled |
| `demo.getproapp.org` | Demo / staging (`tenant_id` **2**), `Enabled` by default (not shown in region picker) |
| `il.getproapp.org` | Israel (`tenant_id` **3**) |
| `zm.getproapp.org` | Zambia (`tenant_id` **4**) |
| `zw.getproapp.org` | Zimbabwe (`tenant_id` **5**) |
| `bw.getproapp.org` | Botswana (`tenant_id` **6**) |
| `za.getproapp.org` | South Africa (`tenant_id` **7**), `Disabled` by default |
| `na.getproapp.org` | Namibia (`tenant_id` **8**) |

**Required env (production):** `BASE_DOMAIN=getproapp.org` (no `https://`), `PUBLIC_SCHEME=https`, `NODE_ENV=production`. Issue **SSL** for `zm` and `il` hostnames.

**Quick check:** set `DEBUG_HOST=1` in the panel, redeploy, then open:

- `https://zm.getproapp.org/healthz` — with `DEBUG_HOST=1`, JSON includes `resolvedHost` (expect `zm.getproapp.org`) and `baseDomain`; without it you only get `{ "ok": true }`.
- `https://zm.getproapp.org/api/debug/host` — should show `"subdomain":"zm"` and matching `resolvedHost`.

If you still get **Hostinger’s HTML** (not JSON), the request **never reaches Node** — fix the panel (same Node app for `zm` / `il`) or remove the extra “subdomain website” that only serves static files.

If you get **JSON** but `resolvedHost` is wrong (e.g. `127.0.0.1` or an internal name), the reverse proxy is not forwarding the public hostname. This app defaults to **`trust proxy` (hop count 1)** so `X-Forwarded-Host` is honored when the proxy sets it. Do **not** set `TRUST_PROXY=0` behind Hostinger unless you know you need it.

**Israel “coming soon” only:** set `ISRAEL_COMING_SOON=true` to show the static coming-soon page on `il.*` and block Israel-only API paths. Omit it (default) for the same directory/join experience as Zambia (separate `tenant_id` data).

## Local development

Create a `.env` file in the project root (this file is gitignored). Example:

```bash
# Required
ADMIN_PASSWORD=your-secure-password
DATABASE_URL=postgresql://...   # or GETPRO_DATABASE_URL

# Recommended
NODE_ENV=development
SESSION_SECRET=use-a-long-random-string-in-production
BASE_DOMAIN=

npm install
npm start
```

**Database:** The server **exits** if **`DATABASE_URL` / `GETPRO_DATABASE_URL`** is unset. Apply **`db/postgres/000_full_schema.sql`** (and follow-ups) to Postgres; application access is via **`src/db/pg/*`**. There is **no** SQLite database opened on Express startup — **`src/db/index.js`** is a guard/stub. **SQLite → Postgres bulk copy scripts are not shipped** in this repo (retired; **`docs/SQLITE_TO_PG_DATA_MIGRATION.md`** is historical only). An optional local **`data/getpro.sqlite`** file is **not** used by the server; see **`data/README.md`**.

**PostgreSQL / Supabase:** **`docs/SUPABASE_ENV.md`**. Verify pool: **`npm run test:pg`**. After schema apply, optional: **`npm run test:pg:repos`**. SQL layout: **`db/postgres/`** (`db/postgres/README.md`). Prisma is not used.

**Callbacks (`callback_interests`):** Runtime uses PostgreSQL when the DB URL is set. **`docs/SUPABASE_SLICE1_CALLBACKS.md`**, **`docs/SUPABASE_MIGRATION_BACKLOG.md`**.

**Admin UI:** Layout tokens and patterns for grids, cards, tables, and modals are documented in [`docs/ADMIN_UI.md`](docs/ADMIN_UI.md).

**Design system:** Global tokens live in [`public/theme.css`](public/theme.css) (imported by [`public/styles.css`](public/styles.css)). Overview: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md). Material Design 3 details: [`docs/MATERIAL_DESIGN_3.md`](docs/MATERIAL_DESIGN_3.md). **Mobile screen roles** (launcher / results / profile / support): [`docs/MOBILE_SCREEN_INVENTORY.md`](docs/MOBILE_SCREEN_INVENTORY.md).

**URLs:** The marketing site defaults to **`https://getproapp.org`** (apex). **Zambia** (ISO alpha-2 **`zm`**) uses **`https://zm.getproapp.org`**. **Israel** uses **`https://il.getproapp.org`**. The apex home shows a **Region** control (globe) to open those sites — **unless** the visitor’s country is **Zambia** (see below). Legacy paths **`/zm/…`** and **`/il/…`** redirect to **`zm.*`** and **`il.*`**. The old host **`zam.getproapp.org`** redirects to **`zm.getproapp.org`**. Configure **DNS** (and SSL) for `zm` and `il` (and wildcard `*.getproapp.org` if you use company subdomains).

**Apex + Zambia visitors:** If **`CF-IPCountry`** is **`ZM`** (Cloudflare passes this to the origin), the apex host serves the **Zambia** tenant home (same content as **`zm.{BASE_DOMAIN}`**), with links pointing at the regional host. For local testing without Cloudflare, set **`GETPRO_FORCE_CLIENT_COUNTRY=ZM`**. Other regions are unchanged; only **`zm`** enforces a national phone format (**0** + **9** digits).

**Multi-tenant data:** Categories, companies, leads, and admin access are scoped by **`tenant_id`**. Super admin can **create, edit, and delete** regions (except **global**). For historical SQLite migration behavior around non-canonical tenants, see **`docs/DATA_MODEL.md`** and **Git history** for deleted **`src/db/migrations/`** (not present on current branches; not run by **`server.js`**).

### Admin roles & tenant stages

**Roles** (stored on `admin_users.role`):

| Role | Access |
|------|--------|
| `super_admin` | Full region list, **create / edit / delete** regions (except global), set **stage** (enable/disable traffic), scope to any region, manage users when scoped. |
| `tenant_manager` | Same tenant: edit directory + **create** other tenant users (manager / editor / viewer). |
| `tenant_editor` | Same tenant: categories, companies, leads (read/write). |
| `tenant_viewer` | Same tenant: **dashboard + leads only** (reports); cannot edit directory data. |

**First boot user:** `ADMIN_USERNAME` (default `admin`) + **`ADMIN_PASSWORD`** (required). Role defaults to **`super_admin`** with `tenant_id` **null**. To seed a tenant-scoped user instead, set e.g. `ADMIN_ROLE=tenant_editor` and **`ADMIN_TENANT_ID=4`** (Zambia).

**Tenant stages** (`tenants.stage`): `PartnerCollection`, `Enabled`, `Disabled`. Only **`Enabled`** tenants appear in the public **region / country** UI and receive normal traffic on **`{slug}.BASE_DOMAIN`**. Other stages hide the country from the picker and the app responds with **503** on that platform host until enabled.

**Super admin UI:** After login, open **`/admin/super`** to **add** a region (**New region**), **edit** or **delete** (non-global), change **stages** (enable/disable), and **set tenant scope** before using Professions / Companies / Cities / Leads for that region.

**Super admin default region:** On login, scope is **`demo`** first (sample listings), then **`global`**, then **`zm`**, so Professions and Companies show data without manual switching. Override with **`GETPRO_SUPER_ADMIN_DEFAULT_TENANT_SLUG`** (e.g. `zm` or `global`). The admin header shows **Directory data: …** with a link to change region. Existing sessions keep the old scope until you **log out and back in** or use **Act as region** on **`/admin/super`**.

**Public admin entry:** The home menu links to **`/getpro-admin`**, which shows username, password, **Login**, and **Cancel** (same credentials as `/admin/login`). Company-marketing subdomains redirect to **`zm.{BASE_DOMAIN}/getpro-admin`**.

**Data model:** See [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) for which **tenants** exist by default and which **tables** are scoped by `tenant_id`. The **`global`** tenant powers the **apex** home when enabled; super admins default to that tenant scope on login when it is `Enabled`.

**All tenants (reference):** Open the Super admin screen (`/admin/super`) — the table lists **ID**, **Name**, **Short** (subdomain slug), **stage**, and actions. Join / callback APIs require a **`tenantId`** from the page (and `tenantSlug` must match) so data is never stored under the wrong region.

**Join “Call me”:** Saves `name`, `phone`, and `interest_label` (`Potential Partner`) into **`callback_interests`** with the **`tenant_id`** of the Join page you’re on; admin **Leads** shows that tenant’s rows only.

**Built-in demo users** (password `1234`, created once if missing): `tenantmanager` (`tenant_manager`, Zambia) and `superadmin` (`super_admin`). Disable seeding in production with **`SEED_BUILTIN_USERS=0`**.

**Demo tenant managers** (`martin`, `faith`, `daisy`, password `1234`, `tenant_manager` on **Demo** + **Zambia**): idempotently upserted on boot via `src/seeds/seedManagerUsers.js`. Disable with **`SEED_MANAGER_USERS=0`** in production if you do not want these accounts.

**CSS cache bust:** Set **`GETPRO_STYLES_V`** (or rely on the default in code) so all templates use one `stylesVersion` for `/styles.css?v=…`.

Home and directory search use autocomplete lists in `public/data/search-lists.json` (professional services + Zambia places). Regenerate with:

```bash
npm run build-search-lists
```

The server reads `public/data/search-lists.json` **on every directory request** (no restart). After you change that file or run `npm run build-search-lists`, **hard refresh** the site or bump the `?v=` on `LIST_URL` in `public/autocomplete.js` so the browser loads the updated JSON for autocomplete.

The animated “typing” hint is set with `data-watermark-text` on the `.pro-ac` blocks in `views/index.ejs` and `views/directory.ejs` (demo only; real options come from `search-lists.json`).

## Environment

**Common variables:** `ADMIN_PASSWORD` (required), **`DATABASE_URL` or `GETPRO_DATABASE_URL` (required)** — `SESSION_SECRET`, `NODE_ENV`, `BASE_DOMAIN`, `PORT`, `HOST`, `GETPRO_EMAIL`, `GETPRO_ADDRESS`, `CALL_CENTER_PHONE`, `GETPRO_STYLES_V`, `SEED_BUILTIN_USERS` (`0` to skip demo admin seeding), `SEED_MANAGER_USERS` (`0` to skip martin/faith/daisy multi-tenant seed), **`GETPRO_SUPER_ADMIN_DEFAULT_TENANT_SLUG`**, **`GETPRO_PG_POOL_MAX`**, **`GETPRO_PG_IDLE_MS`**, **`GETPRO_PG_CONNECT_TIMEOUT_MS`**.

**Production:** set `BASE_DOMAIN=getproapp.org` (and `PUBLIC_SCHEME=https` if needed). Optional: `DEBUG_HOST=1` temporarily for `/healthz` and `/api/debug/host`; `ISRAEL_COMING_SOON=true` to lock Israel to coming-soon; `TRUST_PROXY=0` only if Node is exposed directly without a reverse proxy (Hostinger usually needs the default trust proxy). On hosts that don’t deploy `.env`, set the same keys in the panel’s environment variables.

**Regional tenant lock:** Legacy SQLite migration **`04-tenant-defaults-and-demo-companies`** (removed from tree; see **Git history**) applied when **replaying** old migrations on a `.sqlite` file, not when starting **`server.js`**. In production, manage tenant **stage** in **Super admin** (and Postgres data).

**Super admin — all users:** Open **`/admin/super/users`** to list **Global & Zambia** accounts and **all** admin users across tenants, with create / edit / delete / enable / disable and password change. Passwords are never stored in plain text (only bcrypt hashes).
