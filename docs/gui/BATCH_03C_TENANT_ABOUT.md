# Batch 03C — Tenant public About

**Date:** 2026-07-18  
**Scope:** Tenant public `/about` only. Shell untouched except CSS cache bump. **Home unchanged. Leadership not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 14), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_03B_TENANT_HOME.md`](./BATCH_03B_TENANT_HOME.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop About | `02-public-about-desktop-v3 (Populated)` | `44492f6abbe849d0a8a89303ce83129b` |
| Mobile About | `02-public-about-mobile-v3 (Populated)` | `3f0b8a5c30544d9495064df8d5f9e62e` |

Obsolete IDs **not** used: base `02-public-about-*`, `02-public-about-sample-desktop`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/public/about.ejs` | Hero eyebrows/CTAs, story collage, purpose/values bands, split empty, responsive join CTAs |
| `public/blessboard/v5/tenant-public.css` | About hero/story/purpose/values/join layout + mobile card join |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `cssHref` `?v=18` only |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Default CSS href `?v=18` (cache bump only) |
| `tests/blessboard-public-pages.test.js` | About render + empty/publication assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | About structure + no fabricated widgets |
| `docs/gui/BATCH_03C_TENANT_ABOUT.md` | This document |

**Unchanged:** About route, publication queries, hostname resolution, auth, Home markup, shell chrome behavior.

## 3. Data fields used

| Surface | Fields |
|---------|--------|
| Hero | First `hero` section (or first published section): `heading`, `bodyText`, `mediaUrl` |
| Story | Sections whose key/type/heading match `story` / `history`: `heading`, `bodyText`, `mediaUrl` (up to 2 media for collage) |
| Mission / vision | First matching `mission` / `vision` section each: `heading`, `bodyText`, `mediaUrl` |
| Values | Sections matching `value`: `heading`, `bodyText` |
| Generic body | Remaining published sections: `heading`, `bodyText`, `mediaUrl` |
| Empty | `showEmptyState`, `emptyHeadline`, `emptyMessage` |
| Join band | `publicName`; `/contact`, `/register`, `loginHref` → `/login` |
| Brand fallback | `pageTitle` / `publicName` when no hero heading |

No new entity queries on About.

## 4. Image sources

| Usage | Source | Origin |
|-------|--------|--------|
| Hero / story / section media | CMS `mediaUrl` via `safeExternalUrl` | Tenant published content only |
| Missing CMS media | CSS mesh fallback (`.bb-tp-page-hero__fallback`) | Local CSS — not stock sanctuary photos |
| Stitch `lh3.googleusercontent.com` assets | Inspected for composition only | Not hotlinked |

## 5. Empty-state / omission behavior

| When | UI |
|------|----|
| No published sections | Hero still renders; split `bb-tp-empty` with Contact / Register; Join band remains |
| Missing mission / vision / values / story | That band omitted cleanly |
| Never shown | Fabricated stats bar, “Watch Our Story”, community-impact grid, annual-report download, invented history/mission/quotations |

## 6. Intentional deviations from Stitch

1. **Nav** — full V5 CMS nav (8 routes) vs Stitch short mock nav (shell).  
2. **Stats bar / floating “1,200+”** — omitted (fabricated metrics).  
3. **Watch Our Story** — omitted (no video/product route).  
4. **Community Impact / annual report** — omitted (no schema).  
5. **Learn More about our Faith** — omitted (no faith-detail route).  
6. **Hero secondary CTA** — Register (supported) instead of Watch Our Story.  
7. **Join CTAs** — desktop Plan Your Visit + Register; mobile Member Login + Register Now (Stitch mobile).  
8. **Mobile bottom-tab / FAB** — omitted (drawer shell from Batch 03A).  
9. **Primary** — Sacred Modernity `#6C5CE7` + Hanken Grotesk (not Stitch Inter / alternate violet).  
10. **“Our Purpose” / “Core Values”** — structural chrome only when matching published sections exist; titles/bodies never invented.

## 7. Responsive status

| Width | Notes |
|-------|-------|
| 320px | Existing overflow guards; full-width CTAs under 360px |
| 375px | Identity eyebrow; violet title; stacked hero image; rounded join card; Member Login / Register Now |
| 768px | About Us eyebrow + Get Connected / Register; two-column story; asymmetric purpose pair |
| 900px+ | Shell desktop nav (unchanged) |
| 1440px | Max width + gutter token |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **25/25 pass** (route/render + publication visibility + about empty) |
| `npm run test:blessboard:a11y-structure` | **23/23 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 9. Remaining gaps

1. About cannot mirror Stitch impact stats / video without product-backed fields.  
2. Mission/vision/values layouts appear only when published keys/types/headings match.  
3. Mobile Stitch bottom nav remains intentionally unimplemented.  
4. Leadership page interior is **Batch 04 / next** — not this batch.

## 10. Suggested commit message

```
Align tenant public About with populated Stitch desktop and mobile.
```
