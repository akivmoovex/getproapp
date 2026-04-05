# Route ownership matrix — public web (GetPro)

**Purpose:** Single place to see **route → handler → template → JS → LCP / risk** for the main public flows. Aligns with the real code in `server.js` and `src/routes/public.js`.

**Related:** `docs/clean-architecture.md`, `docs/route-asset-inventory.md`, `docs/performance-budgets.md`.

**Legend — edit risk:** **Low** = template-only or guarded CSS; **Medium** = shared partial or `scripts.js` guards; **High** = tenant/host rules or global bundle behavior.

---

## `/` (homepage)

| Field | Value |
|-------|--------|
| **Route** | `GET /` |
| **Handler / module** | `src/routes/public.js` → `router.get("/")` (tenant-bound); **`server.js`** may redirect legacy company subdomain `GET /` before the router. |
| **Template** | `views/index.ejs` |
| **Main partials** | `partials/seo_meta`, `partials/site_header`, `partials/app_navigation`, `partials/pro_search_form` (variant `home`), optional `partials` region M3 root `#wf-region-m3-root`, `partials/site_footer` |
| **JS entrypoints** | `/scripts.js` (defer); lazy `/autocomplete.js` via `partials/autocomplete_defer_bootstrap` |
| **Critical / LCP region** | Hero `<picture>` `.pro-home-hero-photo`; `<link rel="preload" as="image">` in `<head>` must match `srcset` |
| **Desktop notes** | “Desktop-only” blocks use `home-page__desktop-only`; hero + search stay primary ATF |
| **Mobile notes** | Search in hero; region modal when `showRegionPickerUi`; use `viewport-fit=cover` + CSS `env(safe-area-inset-*)` |
| **Performance-sensitive notes** | Do not lazy-load hero; avoid extra blocking scripts in `<head>` |
| **Edit risk** | **Medium** (hero/LCP + global nav partials) |
| **Validation checklist** | [ ] Hero preload matches image `srcset` [ ] Region modal only when root exists [ ] No unguarded `scripts.js` work for home |

---

## `/directory`

| Field | Value |
|-------|--------|
| **Route** | `GET /directory` |
| **Handler / module** | `src/routes/public.js` → `router.get("/directory")` |
| **Template** | `views/directory.ejs` |
| **Main partials** | `partials/seo_meta`, `partials/site_header`, `partials/app_navigation`, `partials/pro_search_form` (variant `directory`, default `formId` **`directory-toolbar`**), `partials/refine_search_fab`, `partials/directory_company_cards` **or** `partials/directory_empty_state`, `partials/site_footer` |
| **JS entrypoints** | `/scripts.js`; lazy autocomplete; **if zero results:** `/directory-empty-callback.js` |
| **Critical / LCP region** | Toolbar + first card row (text/initials); not hero |
| **Desktop notes** | Refine FAB scrolls to `#directory-toolbar` (the search `<form>` id) |
| **Mobile notes** | FAB fixed corner; ensure no horizontal overflow on toolbar; empty state “Jump to search” → `#directory-toolbar` |
| **Performance-sensitive notes** | Do not load `directory-empty-callback.js` when results &gt; 0; avatar hue only when `[data-avatar-hue]` exists |
| **Edit risk** | **Medium** |
| **Validation checklist** | [ ] Refine FAB `data-refine-target` matches form id [ ] Empty state only on zero results [ ] Guards in `scripts.js` still match DOM |

---

## `/category/:categorySlug`

| Field | Value |
|-------|--------|
| **Route** | `GET /category/:categorySlug` |
| **Handler / module** | `src/routes/public.js` → `router.get("/category/:categorySlug")` |
| **Template** | `views/category.ejs` (not `directory.ejs`) |
| **Main partials** | Same family as directory: search form with **`formId: 'category-toolbar'`**, `partials/refine_search_fab` (`toolbarAnchorId: 'category-toolbar'`), cards or `partials/directory_empty_state` with `emptyStateMode: 'category'`, `partials/site_footer` |
| **JS entrypoints** | Same as `/directory`: `/scripts.js`, lazy autocomplete; optional `directory-empty-callback.js` if no listings |
| **Critical / LCP region** | Toolbar + first card (same as directory) |
| **Desktop notes** | Category filter visible in toolbar (`showCategoryFilter: true`) |
| **Mobile notes** | Same FAB/anchor pattern with **`#category-toolbar`** |
| **Performance-sensitive notes** | Same bundle rules as directory |
| **Edit risk** | **Medium** |
| **Validation checklist** | [ ] 404 uses `not_found` when slug unknown [ ] Empty state chips and “Jump to search” use `category-toolbar` id |

---

## `/company/:id`

| Field | Value |
|-------|--------|
| **Route** | `GET /company/:id` |
| **Handler / module** | `src/routes/public.js` → `router.get("/company/:id")` → `renderCompanyPage` → `buildCompanyPageLocals` (`src/companies/companyPageRender.js`) |
| **Template** | `views/company.ejs` |
| **Main partials** | `partials/seo_meta`, `partials/site_header`, `partials/app_navigation`, `partials/site_footer`; profile sections in-template |
| **JS entrypoints** | `/scripts.js` (lead form `#lead_form`); `/company-profile.js` (carousel, QR copy, bars) |
| **Critical / LCP region** | Logo `.pro-company-profile__logo` when present (`fetchpriority="high"`); do not lazy-load logo |
| **Desktop notes** | Primary column + aside `Contact`; lead form in main column |
| **Mobile notes** | **Sticky bottom CTA** (`.pro-company-sticky-cta`) for Call/WhatsApp when applicable; aside contact above fold in typical layout |
| **Performance-sensitive notes** | `#lead_status` min-height for CLS; gallery slides 2+ lazy |
| **Edit risk** | **Medium** (lead API + shared scripts) |
| **Validation checklist** | [ ] Lead POST still `/api/leads` [ ] `company-profile.js` only with template [ ] Logo LCP rules preserved |

---

## `/join`

| Field | Value |
|-------|--------|
| **Route** | `GET /join` |
| **Handler / module** | `src/routes/public.js` → `router.get("/join")` |
| **Template** | `views/join.ejs` |
| **Main partials** | `partials/seo_meta`, `partials/brand_lockup_getpro`, wizard panels in-file |
| **JS entrypoints** | `/autocomplete.js` + `/join.js` (defer); **`public/join.js`** exits early if `#join-wizard` missing — **no** `/scripts.js` on this page |
| **Critical / LCP region** | Lightweight hero text; no homepage hero preload |
| **Desktop notes** | Tiles + wizard frame; no app nav drawer unless partials add it |
| **Mobile notes** | Full-width tiles; step actions at bottom of step |
| **Performance-sensitive notes** | Do not add `join.js` to global layout |
| **Edit risk** | **Low–Medium** |
| **Validation checklist** | [ ] Wizard hidden until “Get Started” [ ] Autocomplete for join loads only as wired in `join.ejs` |

---

## `/:miniSiteSlug` (company mini-site on tenant host)

| Field | Value |
|-------|--------|
| **Route** | `GET /:miniSiteSlug` (last registered in `public.js`; **reserved** first segments — see `MINI_SITE_RESERVED_SEGMENTS` in `src/routes/public.js`) |
| **Handler / module** | `src/routes/public.js` → `router.get("/:miniSiteSlug")` → `renderCompanyPage` (same template/data path as `/company/:id`). **`server.js`:** legacy host → may **301** to `{tenant}.{base}/{subdomain}`; **`renderCompanyHome`** for bare company subdomain when applicable. |
| **Template** | `views/company.ejs` (same as `/company/:id`) |
| **Main partials** | Same as company profile row above |
| **JS entrypoints** | `/scripts.js` + `/company-profile.js` |
| **Critical / LCP region** | Same as `/company/:id` |
| **Desktop notes** | Breadcrumb / “Mini-site” pill reflects product |
| **Mobile notes** | Same sticky CTA + contact patterns |
| **Performance-sensitive notes** | Same as company page |
| **Edit risk** | **High** (route order + reserved segments + collision with content slugs) |
| **Validation checklist** | [ ] New top-level paths added to reserved set if needed [ ] Mini-site slug resolves to `companies.subdomain` for tenant [ ] **Not safely verified in CI** — validate manually on tenant host with seed data |

**Constraint:** End-to-end verification requires a resolved **tenant** (`req.tenant`), **ENABLED** stage, and a **company** row with matching `subdomain`. Local smoke tests depend on `BASE_DOMAIN`, DB seed, and Host header.

---

## Global validation (any change touching these routes)

- [ ] No horizontal overflow on narrow viewports for touched templates  
- [ ] `public/scripts.js` additions remain behind DOM guards  
- [ ] No new render-blocking scripts in `<head>` without perf review  
- [ ] `docs/route-asset-inventory.md` updated if asset chain changes  
