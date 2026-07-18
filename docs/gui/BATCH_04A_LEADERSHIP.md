# Batch 04A — Tenant public Leadership

**Date:** 2026-07-18  
**Scope:** Tenant public `/leadership` only. Shell untouched except CSS cache bump. **Ministries not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 15), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_03C_TENANT_ABOUT.md`](./BATCH_03C_TENANT_ABOUT.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Leadership | `03-public-leadership-desktop-v2 (Populated)` | `372faa60f8df4983b627db3cb5d35f9d` |
| Mobile Leadership | `03-public-leadership-mobile-v4 (Restored)` | `0f4e816fd64d4592bd3677fbde3b7544` |
| Desktop empty (ref) | `03-public-leadership-desktop-v2 (Empty)` | `5f7b1d44bd454d45a0b72fb76d94bbd0` |

Obsolete IDs **not** used: base `03-public-leadership-*`, duplicate mobile v2 Populated IDs.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/public/leadership.ejs` | Hero eyebrows, featured + grid cards, accessible image fallbacks, empty + serve CTA |
| `public/blessboard/v5/tenant-public.css` | Leadership hero/cards/grid/mobile CTA; desktop portrait cards |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `cssHref` `?v=19` only |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Default CSS href `?v=19` (cache bump only) |
| `tests/blessboard-public-pages.test.js` | Leadership render, order, empty, no invented groups |
| `tests/blessboard-v5-a11y-structure.test.js` | Leadership structure + accessible fallbacks |
| `docs/gui/BATCH_04A_LEADERSHIP.md` | This document |

**Unchanged:** Leadership route, leader queries (`sort_order` ASC, published only), hostname resolution, auth, Ministries markup, About/Home interiors.

## 3. Data fields used

| Surface | Fields |
|---------|--------|
| Hero / intro | First published page section: `heading`, `bodyText`, `mediaUrl` |
| Leaders | Published `entities[]`: `displayName`, `roleTitle`, `biography`, `imageUrl` |
| Featured | First published leader by `sort_order` (no pastor/role inference) |
| Remaining | Subsequent leaders under structural “Ministry Leaders” heading |
| Empty | `showEmptyState`, `emptyHeadline`, `emptyMessage` |
| Serve CTA | `publicName`; `/ministries`, `/contact` |
| Brand fallback | `pageTitle` / “Our Leadership” when no intro heading |

## 4. Image sources and fallbacks

| Case | Treatment |
|------|-----------|
| Leader with approved `imageUrl` | Safe CMS media URL (`safeExternalUrl`); `alt` = `displayName` |
| Leader without photo | Initials avatar (`.bb-tp-avatar`) with `role="img"` + `aria-label` = `displayName` |
| Intro section media | CMS `mediaUrl` when present |
| Stitch remote portraits | Inspected for composition only — not hotlinked |

## 5. Empty-state / omission behavior

| When | UI |
|------|----|
| No published leaders | Split empty + “Update in progress” + Contact / About; serve CTA remains |
| Single published leader | Featured only; no “Ministry Leaders” grid |
| Missing role / bio / photo | That field omitted; initials fallback for photo |
| Never shown | Invented people, Pastoral Team / Elders / Ministry Leads role groups, Contact Pastor, View Profile, Community Led / Live Updates empty chrome |

## 6. Intentional deviations from Stitch

1. **Nav** — full V5 CMS nav vs Stitch short mock nav (shell).  
2. **No Contact Pastor / View Profile** — no leader contact or profile routes.  
3. **No Pastoral Team / Church Elders / Ministry Leads grouping** — flat `sort_order` only; structural “Ministry Leaders” for remaining list.  
4. **Featured group heading** — published `roleTitle` only (never invented “Lead Pastor”).  
5. **Join a Ministry** → `/ministries` (Explore Ministries) + Contact Church.  
6. **Mobile bottom-tab / FAB** — omitted (drawer shell).  
7. **Primary** — Sacred Modernity `#6C5CE7` + Hanken Grotesk.

## 7. Responsive status

| Width | Notes |
|-------|-------|
| 320px | Existing overflow guards; card `min-width: 0` / `overflow-wrap` |
| 375px | Leadership eyebrow; horizontal leader rows; rounded serve CTA card |
| 768px | Faith & Community eyebrow; featured two-column; leader cards portrait 2-col |
| 900px+ | Shell desktop nav; leader grid up to 4-col |
| 1440px | Max width + gutter token |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **26/26 pass** (render, publication, ordering, empty) |
| `npm run test:blessboard:a11y-structure` | **24/24 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 9. Remaining gaps

1. Department/group sections need schema before Stitch Pastoral/Elders/Leads banding.  
2. Empty mobile leadership has no dedicated Stitch empty frame.  
3. Ministries page interior is **Batch 04B / next** — not this batch.

## 10. Suggested commit message

```
Align tenant public Leadership with canonical Stitch desktop and mobile.
```
