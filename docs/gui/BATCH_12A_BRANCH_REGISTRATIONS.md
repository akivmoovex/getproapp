# Batch 12A — Branch admin registration queue

**Date:** 2026-07-18  
**Scope:** Branch Admin `/branch-admin/registrations` list presentation only. **Registration detail and Members not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 38), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_11D_BRANCH_ADMIN_SETTINGS.md`](./BATCH_11D_BRANCH_ADMIN_SETTINGS.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop queue | `26-branch-member-verification-queue-desktop` | `87fe9bb70b79434e88b91e0fd877d238` |
| Mobile queue | `26-branch-member-verification-queue-mobile` | `d352ed076bbe4fabb1ad6f5ef66c0a25` |

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/branch-admin/registrations.ejs` | Stitch queue chrome: filters/chips, desktop table, mobile cards, empty/no-results, checklist |
| `public/blessboard/v5/branch-admin.css` | Queue layout (`?v=15`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-member-registration.test.js` | Queue markers, no-fabrication, no-results assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Queue structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 38 Batch 12A note |
| `docs/gui/BATCH_12A_BRANCH_REGISTRATIONS.md` | This document |

**Unchanged:** list/approve/reject/review routes, CSRF, branch scoping, pagination/query params (`q`, `status`, `page`), service queries, registration detail, Members pages.

## 3. Filters preserved

| Control | Param | Notes |
|---------|-------|-------|
| Search | `q` | Name, email, or phone (existing) |
| Status select | `status` | submitted / under_review / approved / rejected / withdrawn |
| Status chips | `status` | Same values + All; preserves `q` when switching |
| Clear | — | Link back to `/branch-admin/registrations` |
| Pagination | `page` | Previous/Next when `totalPages > 1` |

## 4. Actions preserved

| Action | Behavior |
|--------|----------|
| Review | Link to `/branch-admin/registrations/:id` (desktop + mobile) |
| Approve / Reject | Remain on detail routes (not invented on the queue) |

No bulk select, export, or inline approve/reject forms on the list.

## 5. Mobile treatment

| Surface | Behavior |
|---------|----------|
| `<900px` | Card list (`data-bb-reg-cards`); table hidden |
| `≥900px` | Desktop table (`data-bb-reg-table`); cards hidden |
| Status chips | Horizontal scroll on narrow viewports; wrap on desktop |

Mobile does **not** rely on a horizontally scrolling data table.

## 6. Stitch items omitted / unavailable

- Summary metric cards (Pending / Today’s Subs / High Priority / Approved Today)
- Export List
- Bulk row checkboxes
- Date-range chips (All Time / Today / …) — not supported by V5 list API
- Source tags (Web App / QR Scan), Priority Guest, ministry assignment lines
- Inline approve/reject icons (decisions stay on detail with CSRF modals)
- FAB filter button (filter form + chips cover this)

## 7. Empty states

| State | Marker | When |
|-------|--------|------|
| Catalog empty | `data-bb-reg-empty="catalog"` | No rows and no active filter |
| No results | `data-bb-reg-empty="no-results"` | No rows with `q` and/or `status` |

## 8. Backend confirmation

- Still uses `listMemberRegistrations` with hostname `churchId` + `branchId` scope.
- No new queries, metrics, or schema fields.
- Approval/rejection/CSRF behavior unchanged on existing POST routes.

## 9. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:member-registration` | **14/14 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **45/45 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css` | **0 errors** (73 hex warnings only) |
| `git diff --check` | **clean** |

## 10. Remaining gaps

1. Registration detail Stitch polish deferred (Batch 12B+).
2. Members directory not started.
3. Queue does not show Stitch sample ministry/source metadata (not in list DTO).
4. Pending-only count badge uses real `total` for the current filter — not fabricated “12 Pending”.

## 11. Suggested commit message

```
Polish branch-admin registration queue to Stitch list and mobile cards.
```
