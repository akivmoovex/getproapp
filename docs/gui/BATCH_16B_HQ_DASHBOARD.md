# Batch 16B — HQ Admin Dashboard

**Date:** 2026-07-18  
**Scope:** HQ Admin `/hq` dashboard presentation only. **Branch oversight / registry polish not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 61), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_16A_HQ_SHELL.md`](./BATCH_16A_HQ_SHELL.md), [`BATCH_11B_BRANCH_ADMIN_DASHBOARD.md`](./BATCH_11B_BRANCH_ADMIN_DASHBOARD.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Dashboard | `51-hq-dashboard-desktop` | `538c8f4f1a844930ac058428bf390a76` |
| Mobile Dashboard | `51-hq-dashboard-mobile` | `c67eda7682de428d985416074f606fcf` |

Markers: `data-bb-hq-dashboard="1"`, `data-bb-stitch-dashboard="51-hq-dashboard"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/hq/dashboard.ejs` | Stitch heading, live/unavailable summary cards, notices, branch overview selector, attention/activity/trends empty states, desktop + mobile quick actions |
| `public/blessboard/v5/hq-admin.css` | Dashboard layout/chrome (`?v=30`) |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-hq-shell.test.js` | Dashboard section + no-fabrication + active-only selector assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Dashboard structure assertions + CSS cache bump |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 61 Batch 16B note |
| `docs/gui/BATCH_16B_HQ_DASHBOARD.md` | This document |

**Unchanged:** `/hq` route handler locals/queries, auth gates, CSRF, sessions, church scoping, branch open/redirect logic, shell chrome (aside from CSS bump), `/hq/branches` page body.

## 3. Data locals used (existing route only)

| Local | Use |
|-------|-----|
| `churchDisplayName` | Heading + lede |
| `hqBranchDisplayName` | Headquarters line when present |
| `displayName` | Welcome first name |
| `roleLabel` | Signed-in role line |
| `branches` | Page-scoped `branch-selector` list |
| `activeBranchCount` | Live “Active branches” card value |

No new controller locals, metrics services, or dashboard queries.

## 4. Metrics shown

| Card | Value shown | Notes |
|------|-------------|-------|
| Active branches | `activeBranchCount` (live) | Links to `/hq/branches` |
| Active members | `—` unavailable | Links to `/hq/members` |
| Reporting status (desktop) | `—` unavailable | Links to `/hq/reports` |
| Pending reports (mobile) | `—` unavailable | Links to `/hq/reports` |

## 5. Stitch metrics / panels omitted (neutral unavailable)

| Stitch expectation | Treatment |
|--------------------|-----------|
| Fabricated member totals (4,250 / 8.4k) | Unavailable card |
| Growth deltas (+12%, +4%, 18.2% YTD) | Omitted |
| Reporting submitted/overdue counts | Unavailable card + empty “needing attention” |
| Giving summary chart (ZMW) | Empty trends panel → `/hq/giving` |
| Attendance trend / union-wide growth | Empty trends panel → `/hq/attendance` |
| Branches needing attention rows | Empty state (no health scores) |
| Recent HQ activity feed / broadcasts | Empty state → `/hq/audit` |
| Quick Export / New Branch Registry create | Omitted (no create-branch route) |
| Broadcast quick action | Omitted (no `/hq/broadcast`) |
| Daily/Weekly/Monthly period toggles | Omitted |

## 6. Quick-action routes

### Desktop (violet panel)

| Action | Href |
|--------|------|
| Branch registry | `/hq/branches` |
| Registrations | `/hq/registrations` |
| Reports | `/hq/reports` |
| Audit trail | `/hq/audit` |

### Mobile (icon row)

| Action | Href |
|--------|------|
| Branches | `/hq/branches` |
| Members | `/hq/members` |
| Reports | `/hq/reports` |
| Announce | `/hq/announcements` |

Hero CTA: Open branch registry → `/hq/branches`.

## 7. Branch-selector treatment

- Remains page content inside Branch overview panel (not shell chrome).
- Active branches only; open path unchanged.
- Empty selector copy still available when the list is empty; inactive campus branches are hidden from the list.

## 8. Desktop / mobile differences

| Width | Behavior |
|-------|----------|
| 320px | Compact quick-action labels; tighter stats |
| 375–899px | Mobile pending-reports card; quick navigation icons; stacked panels |
| ≥900px | Reporting-status card; two-column layout with violet quick-actions aside; mobile quick icons hidden |

## 9. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:hq-shell` | **8/8 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **60/60 pass** |
| `npx stylelint public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 10. Remaining gaps

1. Member / reporting cards stay unavailable until a future batch wires **existing** list/count services without inventing Stitch sample numbers.
2. Activity / attention / trends have no V5 dashboard feed — empty states only.
3. Branch creation and Broadcast remain out of scope (no routes).
4. Branch registry / oversight page polish deferred (not this batch).

## 11. Suggested commit message

```
Polish HQ dashboard to Stitch layout without inventing metrics.
```
