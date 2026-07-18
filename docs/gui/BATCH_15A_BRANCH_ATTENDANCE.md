# Batch 15A — Branch admin attendance

**Date:** 2026-07-18  
**Scope:** Branch Admin **attendance tracker list, create/edit form, and record detail presentation only**. Giving not started.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 49–50), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_14C_BRANCH_SERMONS_ADMIN.md`](./BATCH_14C_BRANCH_SERMONS_ADMIN.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop tracker | `36-branch-attendance-tracker-desktop` | `d351ae0e154f44cd827314e415c0633e` |
| Mobile tracker | `36-branch-attendance-tracker-mobile` | `5ea15ec1eb9f4fceac664903c1778091` |
| Desktop detail | `37-branch-attendance-record-detail-desktop` | `12e5e7d87c894b059c437a4b38753514` |
| Mobile detail | `37-branch-attendance-record-detail-mobile` | `18a7d7a77b724653a42882743fb8a736` |

Markers: `data-bb-stitch-attendance="36-branch-attendance-tracker"`, `data-bb-stitch-attendance-form="36-branch-attendance-tracker"`, `data-bb-stitch-attendance-detail="37-branch-attendance-record-detail"`.

Stitch shows trend chips (+12%), 30-day averages, pending-draft KPIs, and mobile event promos; V5 shows **backend monthly aggregates and event rows only**.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/attendance/admin-list.ejs` | Tracker chrome: summary cards, chips, desktop table + mobile cards, empty states, unavailable notes |
| `views/blessboard/v5/attendance/admin-form.ejs` | Meeting details section; preserve title/type/date/time POST fields |
| `views/blessboard/v5/attendance/admin-detail.ejs` | Detail header, lifecycle, totals, entry empty state, flash partials |
| `public/blessboard/v5/branch-admin.css` | Attendance layout (`?v=27`) |
| `public/blessboard/v5/hq-admin.css` | Shared attendance styles (`?v=23`) |
| Shell partials | CSS cache bumps |
| `tests/blessboard-attendance.test.js` | Stitch markers, no fabricated trends, form/detail fields |
| `tests/blessboard-v5-a11y-structure.test.js` | Attendance structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Orders 49–50 notes |
| `docs/gui/BATCH_15A_BRANCH_ATTENDANCE.md` | This document |

**Unchanged:** `attendanceService` create/update/entry/submit/approve/archive, monthly summary SQL, CSRF, branch scoping, routes and field names.

## 3. Metrics shown (backend-supplied only)

| Metric | Source |
|--------|--------|
| Monthly grand total | `summary.grandTotal` (submitted / approved / archived) |
| Category monthly totals | `summary.byBranch` / `churchTotals` (`adults`, `youth`, `children`, `first_time_visitors`, plus volunteers/other in list) |
| Per-event total / category counts | `event.totalCount` and `event.entries[]` |
| Event count per category (list footnote) | `row.eventCount` from summary |

## 4. Unsupported analytics omitted

| Omitted | Reason |
|---------|--------|
| +12% / trend arrows | Not supplied by backend |
| Last 30 days average / Average Sunday | Not supplied |
| Pending drafts KPI | Not a summary field; would invent a count |
| Individual member attendance / QR / biometric | Not in V5 product |
| Offline sync / mobile event promo banners | Not supported |
| Pagination Previous/Next beyond bounded list | List remains service-bounded |

## 5. Actions preserved

| Action | Method / path |
|--------|----------------|
| List + filters | `GET …/attendance?month&status&event_type` |
| Create draft | `POST …/attendance` (`title`, `event_type`, `event_date`, `event_at`, `_csrf`) |
| Edit metadata | `POST …/attendance/:id/edit` |
| Upsert category count | `POST …/attendance/:id/entries` |
| Submit | `POST …/attendance/:id/submit` |
| HQ approve / archive | existing HQ POSTs |

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:attendance` | **8/8 pass** |
| `npm run test:blessboard:a11y-structure` | **56/56 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 7. Suggested commit message

```
Polish branch-admin attendance tracker and detail to Stitch aggregate chrome.
```
