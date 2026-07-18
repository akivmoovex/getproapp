# Batch 14B — Branch admin events management

**Date:** 2026-07-18  
**Scope:** Branch Admin (shared content-admin) **events list + filters + inline create/edit presentation only**. Sermons not started.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 44), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_14A_BRANCH_MINISTRIES_ADMIN.md`](./BATCH_14A_BRANCH_MINISTRIES_ADMIN.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `32-branch-events-management-desktop` | `ad136a0e8f0f41aa8c88c59c77df5455` |
| Mobile | `32-branch-events-management-mobile` | `112d23ce9441492cb5edc1c6ef1d5250` |

Markers: `data-bb-events-admin="1"`, `data-bb-stitch-events="32-branch-events-management"`.

Stitch shows roster buttons, registration avatars/counts, and ministry category filters; V5 implements the **existing event entity list + forms** with card chrome — real event fields only.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/content-admin/entities.ejs` | Events management header, search, upcoming/past + status filters, card grid, empty states, create/edit |
| `views/blessboard/v5/content-admin/entity-fields.ejs` | Event details/schedule/registration/media/publication sections; ISO datetime display |
| `src/blessboard/http/contentAdminRoutes.js` | Pass optional `when` query local for upcoming/past presentation filter |
| `public/blessboard/v5/branch-admin.css` | Event card layout (`?v=25`) |
| `public/blessboard/v5/hq-admin.css` | Shared event card styles (`?v=21`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-content-admin.test.js` | Events list/editor, create/update/publish, dates, CSRF, scope |
| `tests/blessboard-v5-a11y-structure.test.js` | Events structure assertions; shell `?v=25` / `?v=21` |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 44 PARTIAL |
| `docs/gui/BATCH_14B_BRANCH_EVENTS_ADMIN.md` | This document |

**Unchanged:** `createEvent` / `updateEvent` services, CSRF, optimistic concurrency, publish confirmation, media upload, scoping/authz. Capacity remains unexposed in the form. Sermons not started.

## 3. Data fields and actions

### List — `GET …/events`

| Control | Param | Notes |
|---------|-------|-------|
| Search | `q` | Filters loaded items by title/summary/location/timezone/registration URL |
| Schedule | `when` | `upcoming` / `past` / all (compares `startsAt` to now) |
| Status | `status` | `draft` / `published` / `cancelled` / `archived` |
| Preview | link | Existing `…/preview/events` |
| Create event | anchor | `#bb-ca-entity-create` (+ dashed create card) |

### Create / update — `POST …/events`

| Control | Name | Notes |
|---------|------|-------|
| CSRF | `_csrf` | Required |
| Action | `action` | `create` / `update` |
| Optimistic lock | `expected_updated_at` | Update only |
| Item id | `item_id` | Update only |
| Title / summary | `title`, `summary` | Existing |
| Schedule | `starts_at`, `ends_at`, `timezone` | ISO datetime strings; timezone required |
| Location | `location` | Existing |
| Registration | `registration_url` | HTTPS only (existing validation) |
| Media | `image_url` | HTTPS or uploaded via existing media picker |
| Status | `status` | `draft` / `published` / `cancelled` / `archived` |
| Publish confirm | `confirm_publish` | Required when status is `published` |

## 4. Unsupported / omitted

| Omitted | Reason |
|---------|--------|
| Manage roster | No V5 route |
| Registration totals / attendee avatars | Fabricated in Stitch |
| Ticketing / payments | Not in V5 product |
| Recurring events / calendar sync | Not supported |
| Capacity UI | Schema/service support exists but not in existing admin form fields — left unexposed |
| Ministry category filter | Not on event DTO |
| Sermons polish | Explicitly out of scope for 14B |

## 5. Responsive status

| Viewport | Behavior |
|----------|----------|
| `<700px` | Single-column event cards |
| `≥700px` | Two-column card grid |
| `≥1100px` | Three-column card grid |
| All | Upcoming/past + status chips; stacked filters on narrow viewports |

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:content-admin` | **13/13 pass** |
| `npm run test:blessboard:a11y-structure` | **54/54 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 7. Remaining gaps

1. Capacity field remains service-backed but not in the branch-admin form.
2. Sermons / leadership entity Stitch polish not started.
3. Stitch “All Ministries” category filter has no V5 event→ministry link.

## 8. Suggested commit message

```
Polish branch-admin events management to Stitch card list and editor chrome.
```
