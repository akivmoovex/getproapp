# Batch 04B — Tenant public Ministries

**Date:** 2026-07-18  
**Scope:** Tenant public `/ministries` only. Shell untouched except CSS cache bump. **Events not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 16), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_04A_LEADERSHIP.md`](./BATCH_04A_LEADERSHIP.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Ministries | `04-public-ministries-desktop-v4 (Populated)` | `f146cdccadb34ff3bd8b0b75a0450d15` |
| Mobile Ministries | `04-public-ministries-mobile-v4 (Populated)` | `d2fd7ecc586541d3beb5d0d3bed98d56` |

Obsolete IDs **not** used: ministries v3 (`67fdba76…`, `ba2fbcfd…`).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/public/ministries.ejs` | Hero eyebrows/CTAs, featured + list/grid cards, accessible fallbacks, empty + involve CTA |
| `public/blessboard/v5/tenant-public.css` | Ministries hero/cards/mobile list + CTA card |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `cssHref` `?v=20` only |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Default CSS href `?v=20` (cache bump only) |
| `tests/blessboard-public-pages.test.js` | Ministries render, publication, empty |
| `tests/blessboard-v5-a11y-structure.test.js` | Ministries structure + omitted actions |
| `docs/gui/BATCH_04B_MINISTRIES.md` | This document |

**Unchanged:** Ministries route, ministry queries (`sort_order` ASC, published only), hostname resolution, auth, Leadership markup, Events interiors.

## 3. Data fields used

| Surface | Fields |
|---------|--------|
| Hero / intro | First published page section: `heading`, `bodyText`, `mediaUrl` |
| Ministries | Published `entities[]`: `name`, `summary` / `description`, `meetingDay`, `imageUrl` |
| Featured | First published ministry by `sort_order` |
| Empty | `showEmptyState`, `emptyHeadline`, `emptyMessage` |
| CTAs | `/contact`, `/events`, `/register`; `publicName` in involve band |
| Brand fallback | `pageTitle` / “Our Ministries” when no intro heading |

`contactEmail` remains mapped in the model but is **not rendered** on public cards (avoids per-ministry leader-contact actions; visitors use `/contact`).

## 4. Image sources and fallbacks

| Case | Treatment |
|------|-----------|
| Ministry with approved `imageUrl` | Safe CMS media URL; `alt` = `name` |
| Ministry without image | Material `groups` icon on mesh fallback with `role="img"` + `aria-label` = `name` |
| Intro section media | CMS `mediaUrl` when present |
| Stitch remote assets | Inspected for composition only — not hotlinked |

## 5. Omitted actions / empty behavior

| Item | Behavior |
|------|----------|
| Learn More / Join Team / View Schedule / Volunteer / Download | Omitted |
| Category filter chips (“All Ministries”, Children, Youth…) | Omitted (no category schema) |
| Fabricated stats (500+, Global Missions…) | Omitted |
| Sample ministries | Never invented |
| No published ministries | Split empty + “Update in progress” + Contact / Register; involve CTA remains |
| Meeting info | Shown only when `meetingDay` is present |

## 6. Intentional deviations from Stitch

1. **Nav** — full V5 CMS nav vs Stitch short mock nav (shell).  
2. **Hero secondary CTA** — View Events → `/events` (Stitch “View Schedule” unsupported).  
3. **Join a Ministry** → `/contact` (supported), not per-card Join Team.  
4. **Involve band** — Contact Us + Register (not Contact Pastoral Team / Register to Join wording).  
5. **No category filters** — flat published list.  
6. **Mobile bottom-tab / FAB** — omitted (drawer shell).  
7. **Primary** — Sacred Modernity `#6C5CE7` + Hanken Grotesk.

## 7. Responsive status

| Width | Notes |
|-------|-------|
| 320px | Existing overflow guards; card `min-width: 0` / `overflow-wrap` |
| 375px | Our Community eyebrow; featured stacked; other cards horizontal list; rounded involve CTA |
| 768px | Our Impact eyebrow; 2-col cards; featured spans full width |
| 900px+ | Shell desktop nav; ministry grid up to 3-col |
| 1440px | Max width + gutter token |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **27/27 pass** (render, publication, empty) |
| `npm run test:blessboard:a11y-structure` | **25/25 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 9. Remaining gaps

1. Category chips need a ministry category field before Stitch filter parity.  
2. Per-ministry schedule/detail routes do not exist in V5.  
3. Events page interior is **Batch 05 / next** — not this batch.

## 10. Suggested commit message

```
Align tenant public Ministries with canonical Stitch desktop and mobile.
```
