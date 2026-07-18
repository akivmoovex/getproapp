# Batch 05 — Tenant public Events and Sermons

**Date:** 2026-07-18  
**Scope:** `/events` and `/sermons` only (tenant public shell CSS bump shared)  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_04_LEADERSHIP_MINISTRIES.md`](./BATCH_04_LEADERSHIP_MINISTRIES.md)

## 1. Canonical Stitch screen IDs

| Screen | Desktop | Mobile | Exact titles |
|--------|---------|--------|--------------|
| Events | `6f618576f0304982bd239bfe04946e72` | `f58c416cbbd545429258d963b3a15b60` | `05-public-events-desktop-v2 (Populated)` / `05-public-events-mobile-v2 (Populated)` |
| Events empty | `6c3a2b460ac54e6a88336af9085e8c38` | — | `05-public-events-desktop-v2 (Empty)` |
| Sermons | `4f4995dc4ec84354ac80ed022a767ef3` | `96b380d4e47649c1bd7f05cabe9c3a1d` | `06-public-sermons-desktop-v2 (Populated)` / `06-public-sermons-mobile-v2 (Populated)` |
| Sermons empty | `0c7262cdda4547739ec0c1fa5128fb51` | — | `06-public-sermons-desktop-v2 (Empty)` |

Obsolete IDs **not** used: calendar frames (`84b919…`, `256776…`, `0a38bd…`, `26db8f…`) — V5 product model is list only.

## 2. Files changed

| Area | Path |
|------|------|
| Events | `views/blessboard/v5/public/events.ejs` |
| Sermons | `views/blessboard/v5/public/sermons.ejs` |
| Render helpers | `src/blessboard/http/renderTenantPublicPage.js` (`formatEventParts` endsAt range, `sermonMediaKind`) |
| CSS | `public/blessboard/v5/tenant-public.css` (`?v=13`) |
| Shell default CSS href | `views/blessboard/v5/partials/tenant-public-shell-start.ejs` |
| Model CSS href | `src/blessboard/http/loadTenantPublicPageModel.js` |
| Tests | `tests/blessboard-public-pages.test.js`, `tests/blessboard-v5-a11y-structure.test.js` |
| Doc | `docs/gui/BATCH_05_EVENTS_SERMONS.md` |

**Unchanged:** routes, publication queries, hostname resolution, Leadership/Ministries markup (shell CSS version only). Contact and Giving not started.

## 3. Data sources (real fields only)

| Surface | Fields |
|---------|--------|
| Page intro | Published page sections: `heading`, `bodyText`, `mediaUrl` |
| Events | `title`, `summary`, `startsAt`, `endsAt`, `timezone`, `location`, `registrationUrl` (safe), `imageUrl` (safe) |
| Event ordering | `preparePublicEvents`: upcoming until `endsAt` \|\| `startsAt`; ASC by `startsAt`; past omitted |
| Sermons | `title`, `speakerName`, `preachedAt`, `summary`, `mediaUrl` (safe), `resourceUrl` (safe) |
| Sermon ordering | Repository `preached_at DESC` (featured = newest) |
| Empty | `showEmptyState`, `emptyHeadline`, `emptyMessage` |

## 4. Media and registration handling

| Case | Treatment |
|------|-----------|
| Event `registrationUrl` safe HTTPS | Register CTA with `aria-label="Register for {title}"` |
| Event without registration | Contact for Details / Contact Church → `/contact` |
| Unsafe registration / media / resource | Stripped by `safeExternalUrl` (not rendered) |
| Sermon `mediaUrl` | External link only (no iframe/embed). Label via `sermonMediaKind`: Watch / Listen / Watch or Listen |
| Sermon `resourceUrl` | Resources / Notes with accessible label |
| Event / sermon without image | Mesh/date badge or icon fallback — no Stitch stock photos hotlinked |
| Livestream / calendar / share / remind | Not implemented (no V5 support) |

## 5. Empty states

| Page | UI |
|------|----|
| Events | Split empty card + “No upcoming events” badge + Contact / Home |
| Sermons | Split empty card + “Update in progress” badge + Contact / Events |

Omitted from Stitch empty chrome: Past Events Archive, fabricated Weekly Worship / Cell Groups cards, Notify Me, Coming Soon series teasers.

## 6. Intentional deviations

1. No calendar grid UI (obsolete Stitch frames).  
2. No mobile filter chips (All Events / Conferences / Youth; All Messages / categories) — no category schema.  
3. No View Past Events / View Archive / View Past Series.  
4. No share, remind, favorite, or add-to-calendar actions.  
5. No fabricated livestream / Zoom / duration / scripture / series labels.  
6. Featured sermon uses violet gradient panel (no sermon `imageUrl` in schema; no stock hero photo).  
7. Registration only when safe `registrationUrl` exists — not a generic “Register” on every card.  
8. Mobile bottom-tab chrome omitted (tenant drawer shell).  
9. Sacred Modernity violet + Hanken (not Stitch Inter).

## 7. Responsive status

| Width | Notes |
|-------|-------|
| 375px | Featured stacked; event/sermon cards single column |
| 768px | Featured event two-column; event/sermon grids 2-col |
| 1440px | Event grid 3-col; sermon grid 3-col |
| 320px | Shell overflow guards; card `min-width: 0` / `overflow-wrap` |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **24/24 pass** |
| `npm run test:blessboard:tenant-routing` | **44/44 pass** |
| `npm run test:blessboard:a11y-structure` | **17/17 pass** |
| `npx stylelint public/blessboard/v5/tenant-public.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 9. Remaining gaps

- Event category filters need a category field.  
- Sermon series, scripture, duration, and thumbnail need schema before Stitch parity.  
- Past-events archive would need an explicit product route (currently past events are omitted).  
- Contact / Giving are Batch 6.

## 10. Suggested commit message

```
Polish public events and sermons list UI to Stitch populated pairs.
```
