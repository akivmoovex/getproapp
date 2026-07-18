# Batch 03B — Tenant public Home

**Date:** 2026-07-18  
**Scope:** Tenant public `/` (Home) only. Shell untouched except CSS cache bump. **About not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 13), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_03A_TENANT_PUBLIC_SHELL.md`](./BATCH_03A_TENANT_PUBLIC_SHELL.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Home | `01-public-home-desktop-v2 (Refined)` | `ead45db5be774baa9454412262096ffc` |
| Mobile Home | `01-public-home-mobile-v2 (Refined)` | `89177588fbf8405dbebd5747c38e19ce` |

Obsolete IDs **not** used: base `01-public-home-*` copies without v2 Refined.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/public/home.ejs` | Hero hierarchy, responsive CTAs/eyebrows, split empty state, section media cards, member band |
| `public/blessboard/v5/tenant-public.css` | Home hero/mobile centered layout, square media frame, shortcuts, member card, reduced-motion |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `cssHref` `?v=17` only |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Default CSS href `?v=17` (cache bump only) |
| `tests/blessboard-public-pages.test.js` | Home CTA / empty assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Home structure + no fabricated widgets |
| `docs/gui/BATCH_03B_TENANT_HOME.md` | This document |

**Unchanged:** Home route, publication queries, hostname resolution, auth, About markup, shell chrome behavior.

## 3. Data fields used

| Surface | Fields |
|---------|--------|
| Hero | First `hero` section (or first published section): `heading`, `bodyText`, `mediaUrl` |
| Body | Remaining published `sections[]` (`sectionKey`, `heading`, `bodyText`, `mediaUrl`) |
| Empty | `showEmptyState`, `emptyHeadline`, `emptyMessage` |
| Member band | `loginHref` → `/login`; Register → `/register` |
| Brand fallback | `pageTitle` / `publicName` when no hero heading |

No new entity queries on Home (events/ministries/sermons remain route shortcuts only).

## 4. Image sources

| Usage | Source | Origin |
|-------|--------|--------|
| Hero / section media | CMS `mediaUrl` via `safeExternalUrl` | Tenant published content only |
| Missing CMS media | CSS mesh fallback (`.bb-tp-hero__fallback`) | Local CSS — not stock sanctuary photos |
| Stitch `lh3.googleusercontent.com` assets | Inspected for composition only | Not hotlinked |

## 5. Empty-state behavior

| When | UI |
|------|----|
| No published sections | Hero still renders (`publicName` / page title); split `bb-tp-empty` with Contact / About; Explore shortcuts + member band remain |
| Never shown | Fabricated announcements, service times, prayer form, member-count overlay, demo ministry cards, testimonials |

## 6. Intentional deviations from Stitch

1. **Nav** — full V5 CMS nav (8 routes) vs Stitch short mock nav (shell).  
2. **Announcements / Service Times / Need Prayer / Digital Resources** — omitted; no product-backed Home widgets without inventing data.  
3. **Floating “1.2k+ members”** — omitted (fabricated metric).  
4. **Explore shortcuts** — real routes stand in for Stitch demo ministry/announcement widgets.  
5. **CTA mapping** — “Join a Service” / “Join Our Next Service” → `/events`; Giving → `/giving`; Explore Ministries → `/ministries`.  
6. **Mobile bottom-tab / FAB** — omitted (drawer shell from Batch 03A).  
7. **Primary** — Sacred Modernity `#6C5CE7` + Hanken Grotesk (not Stitch Inter / alternate violet).  
8. **Hero title accent** — trailing two words of live heading get violet accent (Stitch treatment) without inventing Stitch demo copy.

## 7. Responsive status

| Width | Notes |
|-------|-------|
| 320px | Existing overflow guards; hero CTAs full-width; brand ellipsis |
| 375px | Centered mobile hero; visual hidden; stacked CTAs; rounded member card |
| 768px | Two-column hero; desktop eyebrow + Join a Service / Giving; shortcuts 2-col; section media side-by-side |
| 900px+ | Shell desktop nav (unchanged) |
| 1440px | Max width + gutter token |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **24/24 pass** (route/render + publication visibility) |
| `npm run test:blessboard:a11y-structure` | **22/22 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 9. Remaining gaps

1. Home cannot mirror Stitch announcements / service-times / prayer without published entities or schema.  
2. Tenant-uploaded logo still blocked (no schema field) — shell brand mark unchanged.  
3. Mobile Stitch bottom nav remains intentionally unimplemented.  
4. About page interior is **Batch 03C / next** — not this batch.

## 10. Suggested commit message

```
Align tenant public Home with refined Stitch desktop and mobile.
```
