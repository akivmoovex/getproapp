# Batch 05B — Tenant public Sermons & Resources

**Date:** 2026-07-18  
**Scope:** Tenant public `/sermons` only. Shell untouched except CSS cache bump. **Contact not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 18), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_05A_EVENTS.md`](./BATCH_05A_EVENTS.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Sermons | `06-public-sermons-desktop-v2 (Populated)` | `4f4995dc4ec84354ac80ed022a767ef3` |
| Mobile Sermons | `06-public-sermons-mobile-v2 (Populated)` | `96b380d4e47649c1bd7f05cabe9c3a1d` |
| Desktop empty (ref) | `06-public-sermons-desktop-v2 (Empty)` | `0c7262cdda4547739ec0c1fa5128fb51` |

Obsolete IDs **not** used: sermons-resources base (`ebe20757…`, `5902746f…`).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/public/sermons.ejs` | Hero eyebrows, featured + recent list/cards, accessible media/resource labels, empty state |
| `public/blessboard/v5/tenant-public.css` | Sermons hero; featured play (mobile); desktop grid; mobile list rows |
| `src/blessboard/http/renderTenantPublicPage.js` | `sermonResourceKind` for download vs resource labels |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `cssHref` `?v=22` only |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Default CSS href `?v=22` (cache bump only) |
| `tests/blessboard-public-pages.test.js` | Sermons render, ordering, publication, media links, empty |
| `tests/blessboard-v5-a11y-structure.test.js` | Sermons structure + omitted series/archive |
| `docs/gui/BATCH_05B_SERMONS.md` | This document |

**Unchanged:** Sermons route, `listPublishedSermons` / `mapSermon` / `safeExternalUrl`, hostname resolution, auth, Events markup, Contact interiors.

## 3. Data fields used

| Surface | Fields |
|---------|--------|
| Hero / intro | First published page section: `heading`, `bodyText`, `mediaUrl` |
| Sermons | Published `entities[]`: `title`, `speakerName`, `preachedAt`, `summary`, `mediaUrl`, `resourceUrl` |
| Featured | Newest published sermon (`preached_at DESC`) |
| Date | `formatDate(preachedAt)` when present |
| Empty | `showEmptyState`, `emptyHeadline`, `emptyMessage` |
| Brand fallback | `pageTitle` / “Sermons & Resources” when no intro heading |

Speaker, date, summary, and media/resource actions render **only when present** (and URLs pass `safeExternalUrl`).

## 4. Media sources and fallbacks

| Case | Treatment |
|------|-----------|
| `mediaUrl` (safe HTTPS) | External link only — no iframe/embed. Kind via `sermonMediaKind`: audio → Listen; video → Watch; else Watch or Listen |
| `resourceUrl` (safe HTTPS) | Kind via `sermonResourceKind`: PDF/office → Download notes; else Resources |
| Unsafe `javascript:` / `data:` / etc. | Stripped by `safeExternalUrl` — never rendered |
| Sermon thumbnail | No `imageUrl` in schema — mesh icon fallback (`role="img"`, `aria-label` = title) |
| Featured backdrop | Violet gradient panel (no stock Stitch photo hotlinked) |
| Intro section media | CMS `mediaUrl` when present |

## 5. Ordering and publication

| Rule | Behavior |
|------|----------|
| Published only | Draft / archived never listed |
| Ordering | Repository `preached_at DESC, created_at DESC` |
| Featured | First in that ordered list (newest) |

## 6. Omitted actions / empty behavior

| Item | Behavior |
|------|----------|
| Category chips (All Messages / The Gospel / …) | Omitted (no category schema) |
| Series / scripture / duration badges | Omitted (no schema) |
| View Archive / View Past Series | Omitted |
| Notify Me / Coming Soon series teaser | Omitted |
| Dual Watch + Listen when only one URL | Single CTA from `mediaUrl` kind |
| Fabricated thumbnails / speakers / files | Never invented |
| No published sermons (+ no sections) | Split empty + “No sermons published” + Contact / View Events |

## 7. Intentional deviations from Stitch

1. **Nav** — full V5 CMS nav vs Stitch short mock nav (shell).  
2. **Featured hero photo** — gradient panel; sermon records have no thumbnail field.  
3. **No series / scripture / duration** — fields do not exist in V5.  
4. **No filter chips / archive / Notify Me**.  
5. **Mobile bottom-tab / FAB / podcasts FAB** — omitted (drawer shell).  
6. **Primary** — Sacred Modernity `#6C5CE7` + Hanken Grotesk.

## 8. Responsive status

| Width | Notes |
|-------|-------|
| 320px | Existing overflow guards; card `min-width: 0` |
| 375px | Sermons eyebrow; Latest Release; featured play control; horizontal list rows |
| 768px | Teaching Library eyebrow; Featured Sermon; text media CTA; 2-col cards with media strip |
| 900px+ | Shell desktop nav; sermon grid up to 3-col |
| 1440px | Max width + gutter token |

## 9. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **29/29 pass** (render, publication, ordering, media links, empty) |
| `npm run test:blessboard:a11y-structure` | **27/27 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 10. Remaining gaps

1. Series, scripture, duration, and thumbnail need schema before Stitch card parity.  
2. Category filters need a sermon category field.  
3. Contact page interior is **Batch 06 / next** — not this batch.

## 11. Suggested commit message

```
Align tenant public Sermons with canonical Stitch desktop and mobile.
```
