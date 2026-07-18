# Batch 09B — Member Events

**Date:** 2026-07-18
**Scope:** Member `/member/events` list + detail presentation only. **Ministries not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 29), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_09A_MEMBER_ANNOUNCEMENTS.md`](./BATCH_09A_MEMBER_ANNOUNCEMENTS.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Events | `17-member-events-calendar-desktop` | `9a52685310ce4231bd9767ee3257c906` |
| Mobile Events | `17-member-events-calendar-mobile` | `a4dc4a494cc54143b76671bd89cdaa69` |

**Product note:** Stitch titles say “calendar”; V5 remains a **list** UI (no month grid, no calendar sync).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/participation/member-events.ejs` | Filters, search, upcoming/past sections, empty states |
| `views/blessboard/v5/participation/partials/member-event-card.ejs` | Shared card (date badge, venue, capacity, status) |
| `views/blessboard/v5/participation/member-event-detail.ejs` | Stitch marker only (register/cancel unchanged) |
| `src/blessboard/http/participationMemberRoutes.js` | Presentation partition/filter/search over visible events |
| `public/blessboard/v5/member-portal.css` | Event card / past / toolbar chrome (`?v=13`) |
| `views/blessboard/v5/partials/member-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-participation.test.js` | Visibility, filters, date-order, anti-calendar assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Events structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 29 note (Batch 09B) |
| `docs/gui/BATCH_09B_MEMBER_EVENTS.md` | This document |

**Unchanged:** `listMemberEvents` / `registerForEvent` / `cancelEventRegistration`, CSRF, capacity enforcement, branch visibility SQL.

## 3. Data fields (real V5 only)

| Field | Use |
|-------|-----|
| `title` | Card / detail heading |
| `summary` | Card excerpt |
| `startsAt` / `endsAt` | Formatted with `timezone` when present |
| `timezone` | `toLocaleString` / `toLocaleDateString` option |
| `location` | Venue line |
| `capacity` / `registeredCount` / `spotsRemaining` | Capacity chips only when capacity set |
| `registration` | Registered chip + strip; cancel on detail |

## 4. Registration behavior

| Action | Where | Notes |
|--------|-------|-------|
| Register | Detail `POST /member/events/:id/register` | Only when not registered and not full |
| Cancel | Detail modal → `POST …/cancel` | CSRF required |
| List CTAs | “View details” / “Manage registration” | Link to detail only — no list POST |

## 5. Filters / ordering

| Filter | Behavior |
|--------|----------|
| `all` | Registered strip + upcoming + past |
| `upcoming` | `startsAt >= now`, ascending |
| `past` | `startsAt < now`, descending |
| `registered` | Items with active registration |
| `q` | Substring on title / summary / location (visible set only) |

Repo list remains `ORDER BY starts_at ASC` (past before upcoming in the full catalog).

## 6. Omitted Stitch / unsupported actions

- Calendar month grid / Calendar View toggle
- Calendar sync (Google/Apple)
- Tickets / payment
- Ministry category filters (Youth / Worship / …)
- Fabricated attendee counts (`+120`)
- Share buttons

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:participation` | **11/11 pass** (visibility, registration, date-order, CSRF, auth) |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **36/36 pass** |
| `npx stylelint public/blessboard/v5/member-portal.css` | **0 errors** |
| `git diff --check` | **clean** |

## 8. Suggested commit message

```
Polish member events list with upcoming/past filters and real registration.
```
