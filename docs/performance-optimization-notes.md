# Performance & Lighthouse optimization notes

This document records a practical performance pass for the GetPro SSR app (Express + EJS), focused on Core Web Vitals–friendly, low-risk changes. It complements `docs/DESIGN_SYSTEM.md` (UI).

**Docs:** **`docs/performance-aware-development-rules.md`** — PR checklist for perf-sensitive UI changes. **`docs/lighthouse-checklist.md`** — how to measure (Lighthouse workflow, run log). **`docs/performance-budgets.md`** — route-based budgets. **`docs/route-asset-inventory.md`** — which templates/partials/CSS/JS apply per route. This file — what was found and fixed in the recorded pass(es).

## 1. Issues identified (highest impact)

| Area | Risk | Notes |
|------|------|--------|
| **LCP (homepage)** | High | Hero image is the natural LCP candidate; discovery could start late after render-blocking CSS. |
| **LCP (company profile)** | Medium | When a logo exists, it competes with headline for LCP; previously `loading="lazy"` delayed the logo. |
| **FCP** | Medium | Large unified `styles.css` remains render-blocking (expected for a single-bundle setup without a build split). |
| **CLS (lead form)** | Medium | `#lead_status` gained text without reserved height → layout could shift when messages appear. |
| **JS on every page** | Medium | `scripts.js` ran all initializers on every page; several only apply to directory, home region modal, or lead form. |
| **Join bundle** | Low | `join.js` is only loaded on `/join`, but an early guard prevents accidental inclusion from throwing. |
| **Images** | Mixed | Many images already had `width`/`height` or `aspect-ratio` (carousel, directory avatars); QR and gallery benefited from explicit `decoding` / `loading`. |
| **Caching** | Ops | Static assets use `?v=<%= stylesVersion %>` in templates; configure long cache + immutable at the CDN/server for `/styles.css`, `/scripts.js`, `/public/*` with query versioning. |

## 2. Fixes implemented

- **Homepage (`views/index.ejs`):** Added `<link rel="preload" as="image">` for the hero WebP with `imagesrcset` / `imagesizes` matching the `<picture>` to start LCP image fetch earlier (alongside existing `fetchpriority="high"` on the `<img>`).
- **Company profile (`views/company.ejs`):** Logo uses `fetchpriority="high"` and `decoding="async"` (removed lazy-loading on the hero logo so it can contribute to LCP when present). Gallery slides use `decoding="async"`. QR image uses `loading="lazy"` and `decoding="async"` (typically below the fold in the aside).
- **`public/scripts.js`:** `DOMContentLoaded` handlers are guarded: region picker + global home region gate only run if `#wf-region-m3-root` exists; directory avatar hue only if `[data-avatar-hue]` exists; refine FAB only if `.pro-refine-search-fab[data-refine-target]` exists. Lead form and app nav behavior unchanged.
- **`public/join.js`:** Early exit if `#join-wizard` is missing (defensive if the script is ever included elsewhere).
- **`public/styles.css`:** `#lead_status` (`.pro-company-profile__lead-status.form-status-message`) gets `min-height: 3em` and `box-sizing: border-box` to reduce CLS when status text appears.
- **`server.js`:** `stylesVersion` default bumped to `20260325-perf-pass` for cache busting.

## 3. Existing strengths (already in good shape)

- Homepage hero: `width`/`height`, `fetchpriority="high"`, `decoding="async"`, responsive `srcset` + AVIF/WebP.
- Directory cards: fixed avatar tile size (`--layout-dim-112`) → stable layout without waiting for images (initials-only).
- Company carousel: `aspect-ratio: 3 / 2` on `.pro-company-carousel__img-wrap`.
- Directory: `directory-empty-callback.js` only included when there are zero results.

## 4. Remaining opportunities (defer / measure first)

- **CSS splitting:** Extract critical above-the-fold CSS or split admin vs public bundles — requires a build step or careful manual maintenance; not done here.
- **JS splitting:** Route-specific chunks for join/autocomplete — would need bundling or additional entrypoints.
- **Font subsetting / `font-display`:** Audit `theme.css` / `@font-face` for Inter (or system stack) and ensure `font-display: swap` where applicable.
- **Third-party logos:** External `logo_url` images cannot be preconnected; consider image proxy or size limits in admin.
- **List virtualization:** Very long directory result lists could use windowing — larger product change.
- **Dead CSS removal:** Only remove rules after grep/usage verification per selector; avoid bulk deletes.

## 5. Hostinger / server recommendations

These are deployment-side and do not require code changes:

1. **Compression:** Enable **Brotli** (preferred) or **Gzip** for `text/html`, `text/css`, `application/javascript`, `application/json`, SVG.
2. **Static assets:** For files under `/public` served with fingerprint query (`?v=...`), use **long `Cache-Control: max-age`** (e.g. 1 year) and **`immutable`**. HTML responses should stay **short cache** or `no-cache` as appropriate for SSR.
3. **HTTPS and HTTP/2 or HTTP/3:** Lets Hostinger handle multiplexing and TLS; no app change.
4. **Images:** Keep serving optimized AVIF/WebP from `/public/images`; consider **WebP/AVIF** for any user-uploaded paths if you add uploads later.
5. **ETags / conditional requests:** Let Express/static middleware emit validators; CDN can respect them.

## 6. What to measure next (Lighthouse)

Use **`docs/lighthouse-checklist.md`** for:

- Step-by-step **mobile + desktop** workflow  
- **Route-specific** checks (homepage, directory, company mini-site `/{subdomain}`, optional no-results + join)  
- **LCP / Network** verification (hero preload, company logo behavior)  
- **Regression thresholds** and a **copy-paste run log template**  

Quick reminder: compare before/after on the **same environment**; in the **Performance** / **Network** panels, confirm the homepage hero request starts early after preload (waterfall).

## 7. Files touched in this pass

- `views/index.ejs` — hero preload link  
- `views/company.ejs` — logo, gallery, QR image attributes  
- `public/scripts.js` — guarded `DOMContentLoaded` inits  
- `public/join.js` — early return guard  
- `public/styles.css` — lead status min-height  
- `server.js` — `stylesVersion`  
- `docs/performance-optimization-notes.md` — this file  
- `docs/lighthouse-checklist.md` — Lighthouse QA playbook and run template  
- `docs/performance-budgets.md` — route performance budgets and PR review checklist  
- `docs/route-asset-inventory.md` — route → templates / partials / CSS / JS map  
- `docs/performance-aware-development-rules.md` — PR checklist for perf-sensitive changes  
- `docs/android-ui-mapping.md` — web DS → Android M3/Compose mapping (first pass)  

No frontend framework added; SSR and routes unchanged.
