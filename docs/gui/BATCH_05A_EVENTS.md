# Batch 05A — Tenant public Events

**Date:** 2026-07-18  
**Scope:** Tenant public `/events` only. Shell untouched except CSS cache bump. **Sermons not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 17), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_04B_MINISTRIES.md`](./BATCH_04B_MINISTRIES.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Events | `05-public-events-desktop-v2 (Populated)` | `6f618576f0304982bd239bfe04946e72` |
| Mobile Events | `05-public-events-mobile-v2 (Populated)` | `f58c416cbbd545429258d963b3a15b60` |
| Desktop empty (ref) | `05-public-events-desktop-v2 (Empty)` | `6c3a2b460ac54e6a88336af9085e8c38` |

Obsolete IDs **not** used: calendar variants (`84b91938…`, `25677650…`, `0a38bd5b…`, `26db8f19…`).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/public/events.ejs` | Hero eyebrows, featured + upcoming list, accessible date/image fallbacks, empty state |
| `public/blessboard/v5/tenant-public.css` | Events hero/cards; mobile date-led list rows |
| `src/blessboard/http/loadTenantPublicPageModel.js` | `cssHref` `?v=21` only |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | Default CSS href `?v=21` (cache bump only) |
| `tests/blessboard-public-pages.test.js` | Events render, ordering, publication, empty |
| `tests/blessboard-v5-a11y-structure.test.js` | Events structure + omitted filters/archive |
| `docs/gui/BATCH_05A_EVENTS.md` | This document |

**Unchanged:** Events route, `preparePublicEvents` / `formatEventParts` / `mapEvent` / `safeExternalUrl`, hostname resolution, auth, Sermons markup.

## 3. Data fields used

| Surface | Fields |
|---------|--------|
| Hero / intro | First published page section: `heading`, `bodyText`, `mediaUrl` |
| Events | Published upcoming `entities[]`: `title`, `summary`, `startsAt`, `endsAt`, `timezone`, `location`, `registrationUrl`, `imageUrl` |
| Featured | First upcoming event by `startsAt` ASC (after `preparePublicEvents`) |
| Date chrome | `formatEventParts(startsAt, timezone, endsAt)` → day / month / weekday / time / timeRange |
| Empty | `showEmptyState`, `emptyHeadline`, `emptyMessage` |
| Brand fallback | `pageTitle` / “Gather with Us” when no intro heading |

## 4. Date behavior

| Rule | Behavior |
|------|----------|
| Published only | Draft / cancelled never listed |
| Upcoming only | `preparePublicEvents` keeps events until `endsAt` (else `startsAt`) ≥ now |
| Ordering | ASC by `startsAt` |
| Timezone-safe | `formatEventParts` uses event `timezone` |
| Past | Omitted from public list (no past archive UI) |

## 5. Registration / omitted actions

| Item | Behavior |
|------|----------|
| Register CTA | Only when `safeExternalUrl(registrationUrl)` is non-null |
| No registration URL | Contact for Details / Contact Church → `/contact` |
| Category filters (All Events / Conferences / Youth / Music) | Omitted (no category schema) |
| View Past Events / Past Events Archive | Omitted |
| Remind Me / Get Access / Share / fabricated attendance | Omitted |
| Empty fabricated chips (Weekly Worship / Cell Groups) | Omitted |
| Calendar Stitch UI | Not implemented — list/featured only |

## 6. Intentional deviations from Stitch

1. **Nav** — full V5 CMS nav vs Stitch short mock nav (shell).  
2. **No category filter chips** — flat upcoming list.  
3. **No past-events archive** — product model is upcoming-only.  
4. **No calendar grid** — calendar Stitch frames are obsolete for V5.  
5. **Mobile bottom-tab / FAB** — omitted (drawer shell).  
6. **Primary** — Sacred Modernity `#6C5CE7` + Hanken Grotesk.

## 7. Responsive status

| Width | Notes |
|-------|-------|
| 320px | Existing overflow guards; card `min-width: 0` |
| 375px | Events eyebrow; featured stacked; upcoming as date-led horizontal rows |
| 768px | Community Calendar eyebrow; featured two-column; event cards 2-col |
| 900px+ | Shell desktop nav; event grid denser |
| 1440px | Max width + gutter token |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **28/28 pass** (route/render, ordering, publication, empty) |
| `npm run test:blessboard:a11y-structure` | **26/26 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 9. Remaining gaps

1. Category filters need an event category field before Stitch chip parity.  
2. Past archive / calendar views are intentional product omissions.  
3. Sermons page interior is **Batch 05B / next** — not this batch.

## 10. Suggested commit message

```
Align tenant public Events with canonical Stitch desktop and mobile.
```
