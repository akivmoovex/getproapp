# Clean architecture — GetPro web (as implemented)

**Purpose:** Describe how the Express + EJS app is **actually** structured so docs match the repo. This is **not** a mandate to introduce new folders (for example there is **no** `src/controllers/` tree).

**Related:** `docs/route-ownership-matrix.md` (route → template → JS), `docs/route-asset-inventory.md` (asset impact map), `docs/performance-aware-development-rules.md`.

---

## 1. Principles (aligned with the product narrative)

| Principle | How it shows up in code |
|-----------|-------------------------|
| **Server-first rendering** | `server.js` sets `view engine` to `ejs`; public HTML is produced with `res.render(...)`. |
| **Progressive enhancement** | Global `public/scripts.js` uses **DOM presence guards**; route-only bundles (`join.js`, `company-profile.js`, `directory-empty-callback.js`) load only where templates include them. Autocomplete loads lazily via `partials/autocomplete_defer_bootstrap`. |
| **Explicit route ownership** | Public HTTP routes live in **`src/routes/public.js`** (plus **`server.js`** for cross-cutting host/legacy behavior). See `docs/route-ownership-matrix.md`. |
| **Performance-aware development** | Single CSS bundle with query versioning; perf docs and `PERF` / `PERF WARNING` comments at high-risk spots. |
| **Safe modification paths** | Prefer changing a route’s template or a guarded partial over altering global behavior in `scripts.js` without guards. |

---

## 2. Where code lives (real layout)

There is **no** separate `controllers/` directory. The codebase uses:

| Area | Location | Role |
|------|----------|------|
| HTTP app entry | `server.js` | Express app, middleware order, mounts `/api`, `/admin`, public router, host/tenant behavior. |
| Public routes | `src/routes/public.js` | Router factory `module.exports = function publicRoutes({ db })` returning **`{ router, renderCompanyHome }`**. |
| Admin / API | `src/routes/admin.js`, `src/routes/api.js` | Mounted before the catch-all public router. |
| Domain / page helpers | `src/*.js` at repo root under `src/` (e.g. `companyPageRender.js`, `companyProfile.js`, `seoPublic.js`, `tenants.js`, …) | Called from route modules; not split into a formal “use case” layer. |
| Views | `views/*.ejs`, `views/partials/*.ejs` | Templates and shared partials. |
| Static assets | `public/` | `styles.css` (imports design system), `scripts.js`, route-specific JS, images. |

**Narrative vs reality:** A “clean” layering doc might name *routes → controllers → services*. Here, **route handlers and render orchestration live in `src/routes/public.js`**, with **helpers in `src/` modules**. That is intentional and stable; renaming to `controllers/` would be churn unless the team decides otherwise.

---

## 3. Request flow (simplified)

1. **Middleware** (`server.js`): sessions, subdomain / tenant attachment, legacy redirects, enabled-tenant gate, `regionChoices` on `res.locals`.
2. **Public router** (`app.use("/", publicModule.router)`): matches paths like `/`, `/directory`, `/category/:categorySlug`, `/company/:id`, `/join`, `/:miniSiteSlug`, content routes, `sitemap.xml`, `robots.txt`, etc.
3. **Render:** `res.render(viewName, locals)` with shared partials (`seo_meta`, `site_header`, `app_navigation`, …).

---

## 4. Host-aware and redirect behavior (must know before editing URLs)

Implemented in **`server.js`** (not only in `public.js`):

- **`BASE_DOMAIN` / `PUBLIC_SCHEME`:** Regional hosts like `zm.{BASE}` and path prefixes (`/zm`, `/il`, …) may **301** to the canonical tenant host pattern.
- **Legacy company subdomains** (non–platform-tenant): `GET /` on that host may **301** to `{scheme}://{tenant}.{base}/{companySubdomain}` or render via **`renderCompanyHome`** when base domain is unset.
- **Platform tenant vs company:** `req.isPlatformTenant` distinguishes tenant rows from company marketing subdomains.
- **Tenant stage:** Non-`ENABLED` tenants can receive **503** before the public router runs.

**Implication:** “Mini-site” URLs are not only `/{slug}` on a tenant host; legacy hosts and redirects also exist. See `docs/route-ownership-matrix.md` for the **`/:miniSiteSlug`** row.

---

## 5. Public route families (actual)

| Family | Example | Template(s) | Notes |
|--------|---------|-------------|--------|
| Home | `/` | `views/index.ejs` | Optional region modal (`#wf-region-m3-root`). |
| Directory | `/directory` | `views/directory.ejs` | Query params for search; empty state may load `directory-empty-callback.js`. |
| Category browse | `/category/:categorySlug` | `views/category.ejs` | Same card/empty patterns as directory; toolbar `formId` is `category-toolbar`. |
| Company (canonical) | `/company/:id` | `views/company.ejs` | Shared with mini-site rendering. |
| Join | `/join` | `views/join.ejs` | `join.js` only here. |
| Mini-site | `/{miniSiteSlug}` | `views/company.ejs` | **After** reserved segments (`directory`, `join`, `company`, …); same `renderCompanyPage` as `/company/:id`. |
| Content | `/articles`, `/guides`, `/answers`, … | Content templates | See `src/routes/public.js`. |

---

## 6. Where the narrative matches vs diverges

| Topic | Match | Diverge |
|-------|--------|---------|
| Server-first + EJS | Yes | — |
| Progressive enhancement + guarded JS | Yes | `scripts.js` remains one file with guards (no mandatory route chunks). |
| Explicit routes | Yes | Handlers are **`public.js`**, not a `controllers/` package. |
| “Thin controllers” | Partially | Some logic is **inline** in `public.js`; heavier bits are in **`src/` helpers**. |
| Simple five-route diagram | Conceptually | Production has **redirects**, **content routes**, **healthz**, **getpro-admin**, etc. |

---

## 7. Change discipline

1. Prefer **documentation + small diffs** over folder renames.
2. Touching **`public/scripts.js`** or **shared partials** → read `docs/route-asset-inventory.md` and `docs/performance-budgets.md`.
3. Touching **tenant/host URLs** → read **`server.js`** order and env vars.

---

## 8. References

- Route ownership detail: **`docs/route-ownership-matrix.md`**
- Asset / LCP map: **`docs/route-asset-inventory.md`**
- Perf PR rules: **`docs/performance-aware-development-rules.md`**
- Android conceptual map: **`docs/android-ui-mapping.md`**
