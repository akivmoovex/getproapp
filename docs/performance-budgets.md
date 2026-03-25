# Performance budgets — GetPro public routes

**Purpose:** Lightweight guardrails so **future UI work** does not accidentally regress LCP, CLS, INP, or bundle weight. This is **documentation-first** — not a CI gate — and aligns with the actual Express + EJS app.

**How this fits with other docs:**

| Doc | Role |
|-----|------|
| **`docs/lighthouse-checklist.md`** | **How to measure** — Lighthouse workflow, route checks, run log template. |
| **`docs/performance-optimization-notes.md`** | **What was found / fixed** — historical pass, server tuning, file list. |
| **`docs/route-asset-inventory.md`** | **Impact map** — templates, partials, CSS/JS per route; “if I change X, what’s affected?” |
| **`docs/performance-aware-development-rules.md`** | **PR checklist** — when a change is perf-sensitive, red flags, pre-merge checks. |
| **`docs/performance-budgets.md` (this file)** | **Guardrails for future changes** — what “good” looks like per route before you ship. |

**When to use:** Planning a PR that touches `views/index.ejs`, `views/directory.ejs`, `views/company.ejs`, `public/styles.css`, `public/design-system.css`, `public/scripts.js`, or shared partials. Start with **`docs/performance-aware-development-rules.md`** if unsure whether perf review applies.

---

## 1. Global budgets (all public routes)

These apply everywhere unless a route section below overrides.

### 1.1 CSS

- **Single public bundle:** Pages load `/styles.css` (imports `theme.css` + `design-system.css` + components). **Red flag:** large, one-off **page-only** rules that duplicate tokens or fight the design system.
- **Prefer:** token-based utilities (`--space-*`, `--flash-*`, `.form-step`, `.input-field`, `.state-block`) and shared partials.
- **Avoid:** adding hundreds of lines of **scoped overrides** for one route without a Lighthouse spot-check.

### 1.2 JS (`public/scripts.js`)

- **Rule:** New behavior must **not** run on every page unless it is truly global (nav drawer, lead form).
- **Pattern:** Guard with DOM presence (`#wf-region-m3-root`, `[data-avatar-hue]`, `.pro-refine-search-fab[data-refine-target]`, `#lead_form`, etc.) — same idea as the current `DOMContentLoaded` block.
- **Red flag:** new `querySelectorAll` over the whole document on every page for one route.

### 1.3 Images (general)

- **Rule:** Any **content** image above the fold needs **`width` and `height`** (or a **CSS `aspect-ratio`** on a wrapper) and must not be **`loading="lazy"`** if it is the **LCP** (hero, company logo when present).
- **Hero / LCP:** Prefer **`fetchpriority="high"`** + **`decoding="async"`** where the team already applied them (`views/index.ejs`, `views/company.ejs` logo).

### 1.4 Core Web Vitals (lab-friendly targets)

These are **guardrails**, not SLA guarantees. Rerun Lighthouse per `docs/lighthouse-checklist.md` if you change above-the-fold assets or global JS/CSS.

| Metric | Green (good) | Investigate |
|--------|----------------|-------------|
| **LCP** (mobile sim.) | ≤ 2.5s typical | &gt; 3.0s or LCP element changed unexpectedly |
| **CLS** | ≤ 0.05 ideal | &gt; 0.1 |
| **INP** | feels smooth | noticeable lag on nav / lead / FAB |

---

## 2. Route budgets

### 2.1 Homepage (`/`)

**Templates / assets:** `views/index.ejs`, hero under `.pro-home-hero`, `partials/pro_search_form.ejs`, `partials/site_header.ejs`, `partials/app_navigation.ejs`, `public/scripts.js` (region + global home gate when `#wf-region-m3-root` exists).

| Category | Budget / rule |
|----------|-------------------|
| **LCP** | **One** primary candidate: hero image `.pro-home-hero-photo` inside `.pro-home-hero-media` (`<picture>` + preload in `<head>`). **Do not** lazy-load hero. **Do not** add a second heavy image competing above the search panel without a perf review. |
| **Images (ATF)** | **≤ 1 eager** raster image (the hero). Article/guide thumbs **below** hero sections: **lazy** + dimensions (pattern already in `index.ejs` for content thumbnails). |
| **Preload** | Keep `<link rel="preload" as="image" …>` in sync with hero `srcset` / `sizes` if hero sources change. |
| **CSS** | Avoid new **global** rules that only apply to homepage unless folded into existing `wf-home-*` / `pro-home-*` blocks. |
| **JS** | Region picker + `initGlobalTenantSearchOpensRegion` only when `#wf-region-m3-root` exists. **No** new unguarded homepage-only init in `scripts.js` without a guard. |
| **DOM / ATF** | Hero + search + panel: **don’t** add another full-width image/iframe section **above** “Leading categories” without review. |
| **CWV** | **LCP:** hero + preload. **CLS:** hero/search panel stable. **INP:** search + region trigger. |

**Optional threshold:** Adding **more than one** new **above-the-fold** section (hero viewport) → **Lighthouse homepage run** required before merge.

---

### 2.2 Directory results (`/directory`)

**Templates / assets:** `views/directory.ejs`, `partials/pro_search_form.ejs`, `partials/directory_company_cards.ejs`, `partials/refine_search_fab.ejs`, `public/scripts.js` (avatar hue, refine FAB when DOM present).

| Category | Budget / rule |
|----------|-------------------|
| **LCP** | Usually **text** (toolbar + first card title). **No** large decorative raster above results. **Do not** introduce lazy-loaded “hero” images in the toolbar. |
| **Images** | Cards use **initials avatars** (no remote images in default card). **If** you add logos/thumbnails: **fixed box** + `width`/`height` or `aspect-ratio` (directory cards already use fixed `--layout-dim-112` for media). |
| **CSS** | Prefer extending `.pro-directory-*` / `.pro-directory-card__*` instead of duplicating card layout. |
| **JS** | **No** new always-on init for directory-only features without guards (`[data-avatar-hue]`, FAB selector). **Avoid** large new bundles for filters — prefer SSR + small progressive enhancement. |
| **DOM / ATF** | Toolbar + first **~6–12** cards are visible quickly on mobile — **no** unbounded “chips” or banners that push layout. **Red flag:** huge HTML in empty state when results exist. |
| **CWV** | **CLS:** toolbar + card grid stable. **INP:** search submit, refine FAB. **TBT:** long lists = more DOM; avoid extra main-thread work per card. |

---

### 2.3 Directory — no results (optional)

**When:** `companies.length === 0` — `directory-empty-callback.js` **only** then (`views/directory.ejs`).

| Category | Budget / rule |
|----------|-------------------|
| **JS** | +1 **deferred** script (`directory-empty-callback.js`). **Don’t** load it on non-empty results. |
| **CLS** | Callback / loading / success **state blocks** (`state-block`, `.status-message`) must not **collapse** the layout; follow existing patterns in `partials/directory_empty_state.ejs`. |

---

### 2.4 Company mini-site / profile (`/{subdomain}`)

**Templates / assets:** `views/company.ejs`, `public/scripts.js` (`#lead_form`, `setLeadStatus`), carousel + QR blocks.

| Category | Budget / rule |
|----------|-------------------|
| **LCP** | **With logo:** `.pro-company-profile__logo` is likely LCP — **no** `loading="lazy"`**,** **`fetchpriority="high"`**, **`width`/`height`**, **`decoding="async"`**. **Without logo:** text/heading — don’t add a heavy raster above the fold without review. |
| **Images** | **Gallery:** first slide **eager**; rest **lazy** + dimensions; wrapper has **`aspect-ratio: 3/2`** (`.pro-company-carousel__img-wrap`). **QR:** **`loading="lazy"`** + **`decoding="async"`** (below-the-fold in aside). |
| **CLS** | **`#lead_status`:** keep reserved space (`.pro-company-profile__lead-status` + `min-height` in `public/styles.css`). **Do not** remove min-height without replacing with another CLS strategy. |
| **CSS** | Avoid large one-off overrides on `.pro-company-profile__*` that fight carousel or lead card layout. |
| **JS** | Lead submit only when `#lead_form` exists. **No** new global listeners for company-only UI. |
| **CWV** | **LCP:** logo vs. text. **CLS:** lead block + carousel. **INP:** lead submit, carousel buttons. |

---

### 2.5 Join page (`/join`) — optional

**Templates / assets:** `views/join.ejs`, `public/join.js` (early exit if `#join-wizard` missing).

| Category | Budget / rule |
|----------|-------------------|
| **JS** | **`join.js` only on join** — **do not** add to global layout. **Do not** remove the early `return` guard without a replacement safety. |
| **Budget** | Wizard steps = **high INP** risk — avoid new heavy synchronous work on step transitions; prefer existing patterns. |

---

## 3. Practical thresholds (summary)

| Threshold | Rule |
|-----------|------|
| **Eager images ATF** | **≤ 1** on homepage (hero). Company: **≤ 1** eager logo when shown; gallery slide 1 may be eager. |
| **Lazy** | Below-the-fold / non-LCP: **lazy** + dimensions (QR, gallery slides 2+, article thumbs). |
| **Layout shift** | **No** new status/flash block without **reserved space** or known height. |
| **JS on all pages** | **No** new `DOMContentLoaded` work without **guard** or **defer** + route check. |
| **CSS growth** | Prefer **design tokens**; **suspicious** if a single PR adds **&gt; ~300 lines** to `public/styles.css` for one page without shared abstraction. |
| **New ATF homepage section** | **&gt; 1** new section in hero viewport → **Lighthouse** required. |

*(Sizes in KB are intentionally omitted — they go stale in CI-less workflows; use network panel + Lighthouse when in doubt.)*

---

## 4. PR / change review checklist (quick)

Before merging UI that touches public surfaces:

- [ ] **New above-the-fold image?** If yes: `width`/`height` or `aspect-ratio`? Still LCP? (no lazy on LCP)
- [ ] **Likely LCP** still **eager** and **discoverable early** (hero preload on home; logo priority on company)?
- [ ] **New JS** on **every** page, or **guarded** / **route-only** script?
- [ ] **Duplicate CSS** or huge page-specific overrides? Can it use **tokens** / **shared components**?
- [ ] **Status / callback / empty-state** blocks: could they **shift** layout? (CLS)
- [ ] **Could this affect LCP, CLS, or INP?** If yes → run Lighthouse for **homepage / directory / company** per `docs/lighthouse-checklist.md` (at least the routes you changed).

**Exceptions:** Product may require a hero redesign or a new widget — **document the exception** in the PR (why budget was relaxed, what was measured).

---

## 5. When budgets are exceeded — what to do next

1. **Run Lighthouse** (mobile) on the affected URL(s); compare to last saved baseline in `docs/lighthouse-checklist.md` run template.
2. **Network:** Check total transfer for **CSS/JS**; look for unexpected **new** scripts or duplicate requests.
3. **Reduce:** Defer non-critical images, tighten guards in `scripts.js`, move one-off CSS into shared tokens, split **only** if you add a build step later.
4. **Document** in `docs/performance-optimization-notes.md` (what regressed, what was done) — keeps history for the next pass.

---

## 6. Lightweight enforcement (optional, no heavy CI)

- Add **“Perf checklist”** to your PR template (copy section 4).
- **Rerun Lighthouse** when touching: hero, logo, lead form, directory cards, global `scripts.js`, or `styles.css` import chain.
- **Exception process:** one sentence in PR + a Lighthouse screenshot or PSI link.

---

## 7. Related files (implementation map)

| Concern | Location |
|---------|------------|
| Homepage hero + preload | `views/index.ejs` |
| Directory shell, conditional callback script | `views/directory.ejs` |
| Company profile, lead, gallery, QR | `views/company.ejs` |
| Global CSS | `public/styles.css`, `public/design-system.css`, `public/theme.css` |
| Global public JS | `public/scripts.js` |
| Join only | `public/join.js`, `views/join.ejs` |
| Cache-bust query | `server.js` → `stylesVersion` |

---

## 8. Links

- **PR rules & checklist:** [`docs/performance-aware-development-rules.md`](performance-aware-development-rules.md)  
- **Measure:** [`docs/lighthouse-checklist.md`](lighthouse-checklist.md)  
- **Impact map (templates / JS per route):** [`docs/route-asset-inventory.md`](route-asset-inventory.md)  
- **History / fixes / server:** [`docs/performance-optimization-notes.md`](performance-optimization-notes.md)  
- **UI system:** [`docs/DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)
