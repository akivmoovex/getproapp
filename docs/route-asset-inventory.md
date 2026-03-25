# Route asset inventory (GetPro public)

**Purpose:** Fast **impact map**: which templates, partials, CSS, and JS touch each main route — so you can answer *“If I change X, what breaks or what should I retest?”*

**Related docs:**

| Doc | Use |
|-----|-----|
| **`docs/performance-aware-development-rules.md`** | **PR checklist** — when perf review applies, red flags. |
| **`docs/performance-budgets.md`** | Guardrails (what not to break). |
| **`docs/lighthouse-checklist.md`** | How to measure after changes. |
| **`docs/performance-optimization-notes.md`** | Past fixes and server notes. |
| **`docs/route-asset-inventory.md` (this file)** | **What files power each route** and what actually runs at runtime. |
| **`docs/clean-architecture.md`** | **How the repo is actually structured** (no fictional `controllers/` tree). |
| **`docs/route-ownership-matrix.md`** | **Route → handler → template → LCP → risk** for main public URLs. |

**CSS chain (all public pages):** `views` link **`/styles.css?v=…`** → imports **`public/theme.css`** → **`public/design-system.css`** → **`public/m3-modal.css`** → rest of **`public/styles.css`**. One bundle; no per-route CSS file.

---

## 1. Homepage (`/`)

**Router:** `src/routes/public.js` → `res.render("index", …)`.

| Layer | Items |
|-------|--------|
| **Entry template** | `views/index.ejs` |
| **Partials** | `partials/seo_meta`, `partials/site_header` (region picker trigger when applicable), `partials/app_navigation`, `partials/pro_search_form` (variant `home`), optional **M3 region modal** (`#wf-region-m3-root` when `showRegionPickerUi`), `partials/site_footer` |
| **CSS** | Full public bundle. Above-the-fold: `wf-home-*`, `pro-home-hero*`, `app-layout`, `pro-home-search*`, header/nav |
| **JS** | **`/scripts.js`** (defer): lead form **not** on home unless a stray `#lead_form` (there isn’t). **Region:** `initRegionPicker` + `initGlobalTenantSearchOpensRegion` run **only if** `document.getElementById("wf-region-m3-root")` exists. **Directory-only inits** skipped (no `[data-avatar-hue]`, no refine FAB on typical home). **`initAppNavDrawer`** always if nav DOM exists. **`/autocomplete.js`** loaded lazily via **`partials/autocomplete_defer_bootstrap`** (focus / intersection / idle — not blocking first paint) |
| **Key assets / LCP** | Hero **`<picture>`** → `.pro-home-hero-photo`: `/images/hero/home-hero-*.webp` / AVIF; **`<link rel="preload" as="image" …>`** in `<head>`; `fetchpriority="high"` on `<img>` |

**Performance-sensitive areas:** Hero **LCP**; preload + `srcset` alignment; region modal weight; **ATF** search + hero panel **CLS**.

**If you change this, check:**

| Change | Check |
|--------|--------|
| Hero / preload / `pro-home-hero-*` | LCP, Network waterfall, `docs/performance-budgets.md` §2.1 |
| New ATF section | CLS, Lighthouse homepage |
| `site_header` / `app_navigation` | Layout, INP (drawer), all tenants |
| `scripts.js` global path | Guards still correct for home vs directory |

---

## 2. Directory (`/directory`)

**Router:** `src/routes/public.js` → `res.render("directory", …)`.

| Layer | Items |
|-------|--------|
| **Entry template** | `views/directory.ejs` |
| **Partials** | `partials/seo_meta`, `partials/site_header`, `partials/app_navigation`, `partials/pro_search_form` (variant `directory`), `partials/refine_search_fab`, **either** `partials/directory_company_cards` **or** `partials/directory_empty_state`, `partials/site_footer` |
| **CSS** | Full bundle. **Directory:** `.pro-directory-toolbar`, `.pro-directory-card*`, `.pro-directory-results*`, empty-state / `pro-directory-empty*` |
| **JS** | **`/scripts.js`**: **`initDirectoryAvatarHue`** only if **`[data-avatar-hue]`** (cards). **`initRefineSearchFab`** only if **`.pro-refine-search-fab[data-refine-target]`**. Region block only if **`#wf-region-m3-root`** on this template (directory may omit region modal — then those inits no-op). **`initAppNavDrawer`**. **`autocomplete_defer_bootstrap`** → **`/autocomplete.js`** for search fields. **No** `company-profile.js` |
| **Key assets / LCP** | Usually **text** (toolbar + first card). Cards: **initials** in fixed-size media (`.pro-directory-card__media` — **no** remote card images by default) |

**Performance-sensitive areas:** Toolbar + **card list DOM**; **avatar hue** inline styles from JS; **autocomplete** lazy load; **no-results** path adds **`directory-empty-callback.js`** and heavier empty UI.

**If you change this, check:**

| Change | Check |
|--------|--------|
| `directory_company_cards` | CLS, DOM count, `data-avatar-hue` behavior |
| Toolbar / `pro_search_form` | INP, autocomplete boot |
| `directory_empty_state` | CLS for callback/state blocks; extra script only when zero results |
| Filters / query params | SSR output only — no extra bundle unless you add one |

### 2a. Category browse (`/category/:slug`)

**Router:** `src/routes/public.js` → `res.render("category", …)`.

Same **asset pattern** as §2: **`views/category.ejs`**, search form id **`category-toolbar`**, **`partials/refine_search_fab`** with matching anchor, cards or empty state, **`/scripts.js`** + lazy autocomplete. **Details:** `docs/route-ownership-matrix.md` (`/category/:categorySlug`).

---

## 3. Directory — no results (same URL, zero companies)

**Condition:** `(companies \|\| []).length === 0` in `views/directory.ejs`.

| Layer | Extra vs §2 |
|-------|----------------|
| **Partials** | `partials/directory_empty_state` (+ may include `partials/components/loading_block`, `state_block` patterns inside) |
| **JS** | **`/directory-empty-callback.js`** (defer) **in addition to** `scripts.js` |
| **Runtime** | Callback form submit → fetch `/api/callback-interest`; loading/success **state** UI |

**If you change this, check:** CLS when success panel shows; **do not** load `directory-empty-callback.js` on non-empty results.

---

## 4. Company mini-site (`/{subdomain}`) and directory profile (`/company/:id`)

**Router:** `src/routes/public.js` — mini-site is `/{subdomain}` on the regional host; **`/company/:id`** uses the same **`renderCompanyPage`** → **`views/company.ejs`** (same asset stack below).

| Layer | Items |
|-------|--------|
| **Entry template** | `views/company.ejs` |
| **Partials** | `partials/seo_meta`, `partials/site_header`, `partials/app_navigation`, `partials/site_footer`; optional JSON-LD in head |
| **CSS** | Full bundle. **Heavy:** `.pro-company-profile*`, carousel, lead card, sticky CTA |
| **JS** | **`/scripts.js`**: **`#lead_form`** → `submitLeadForm` / `setLeadStatus` on **`#lead_status`**. **Guards:** region/refine/avatar same as other pages — typically **no** region root, **no** directory cards. **`/company-profile.js`**: carousel (`[data-company-carousel]`), QR copy, **dist bars** `data-width-pct`, sticky CTA related behavior — only runs behaviors for **present** DOM nodes |
| **Key assets / LCP** | **`logo_url`:** `.pro-company-profile__logo` — **eager**, `fetchpriority="high"`, dimensions. **Gallery:** first slide eager, rest lazy; **`.pro-company-carousel__img-wrap`** `aspect-ratio`. **QR:** `loading="lazy"` |

**Performance-sensitive areas:** **Logo LCP**; **`#lead_status`** + **min-height** (CLS); carousel + **company-profile.js**; QR below fold.

**If you change this, check:**

| Change | Check |
|--------|--------|
| Logo / hero header | LCP, lazy/fetchpriority |
| Lead form / `#lead_status` | CLS, `scripts.js` |
| Gallery / carousel | Lazy slides 2+, `company-profile.js` |
| QR block | Stays lazy; copy button |

---

## 5. Join (`/join`) — lighter

**Router:** `src/routes/public.js` → `res.render("join", …)`.

| Layer | Items |
|-------|--------|
| **Entry template** | `views/join.ejs` |
| **Partials** | `partials/seo_meta`, `partials/brand_lockup_getpro`, … (wizard shell in file) |
| **CSS** | Full bundle + join-specific classes in `styles.css` |
| **JS** | **`/autocomplete.js`** (defer) for wizard fields; **`/join.js`** (defer) — **early exit** if **`#join-wizard`** missing. **`/scripts.js` is not** included on this template |
| **Key assets** | Wizard UI; **no** homepage hero preload |

**If you change this, check:** INP on steps; **do not** add `join.js` to global layout.

---

## 6. `public/scripts.js` — what runs where (summary)

| Init | Runs when |
|------|------------|
| `submitLeadForm` / `#lead_form` | **Company** (and any page that includes the form) |
| `initRegionPicker` + `initGlobalTenantSearchOpensRegion` | **`#wf-region-m3-root`** in DOM (e.g. some homepages) |
| `initDirectoryAvatarHue` | **`[data-avatar-hue]`** (directory cards) |
| `initRefineSearchFab` | **`.pro-refine-search-fab[data-refine-target]`** (directory **or** category browse) |
| `initAppNavDrawer` | **`#wf-app-nav-toggle`** etc. (pages with app layout nav) |

All wired from **one** `DOMContentLoaded` listener — **guards** prevent useless work; see `docs/performance-optimization-notes.md`.

---

## 7. Quick “if I touch file X” matrix

| File | Affects |
|------|---------|
| `views/index.ejs` | **/** only |
| `views/directory.ejs` | **`/directory`** only |
| `views/category.ejs` | **`/category/:slug`** only |
| `views/company.ejs` | **`/company/:id`** and **`/{miniSiteSlug}`** mini-site (same template) |
| `partials/site_header.ejs`, `app_navigation.ejs` | **All** public pages using them |
| `partials/pro_search_form.ejs` | **Home + directory + category** (variants) |
| `partials/directory_company_cards.ejs` | **Directory** or **category** (has results) |
| `partials/directory_empty_state.ejs` | **Directory** (no results) **or** **category** (no listings; `emptyStateMode: 'category'`) |
| `public/styles.css` / `design-system.css` / `theme.css` | **Global** (import chain) |
| `public/scripts.js` | **Every page** that includes the script — **scope** of *work* is guarded |
| `public/autocomplete.js` | Loaded **lazily** where bootstrap is included (home, directory, …) |
| `public/directory-empty-callback.js` | **Directory no-results** only |
| `public/company-profile.js` | **`/company/:id`** and **`/{miniSiteSlug}`** (same template) |
| `public/join.js` | **`/join`** only |
| `server.js` `stylesVersion` | Cache bust for **all** `?v=` assets |

---

## 8. Links

- Architecture (actual layout) → [`clean-architecture.md`](clean-architecture.md)  
- Route matrix (LCP / risk) → [`route-ownership-matrix.md`](route-ownership-matrix.md)  
- PR rules → [`performance-aware-development-rules.md`](performance-aware-development-rules.md)  
- Budgets → [`performance-budgets.md`](performance-budgets.md)  
- Lighthouse → [`lighthouse-checklist.md`](lighthouse-checklist.md)  
- History → [`performance-optimization-notes.md`](performance-optimization-notes.md)
