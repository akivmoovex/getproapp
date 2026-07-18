# Batch 12C — Branch admin member directory

**Date:** 2026-07-18  
**Scope:** Branch Admin `/branch-admin/members` list presentation only. **Member detail not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 39), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_12B_BRANCH_REGISTRATION_DETAIL.md`](./BATCH_12B_BRANCH_REGISTRATION_DETAIL.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop directory | `28-branch-member-directory-desktop` | `3dae337c97e242049670749c2b1ab09d` |
| Mobile directory | `28-branch-member-directory-mobile` | `e90963b00bcf41368d089053a3a5db07` |

Marker: `data-bb-stitch-members="28-branch-member-directory"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/branch-admin/members.ejs` | Stitch directory: filters/chips, desktop table, mobile cards, empty/no-results |
| `public/blessboard/v5/branch-admin.css` | Directory layout (`?v=17`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-member-registration.test.js` | Directory markers, search/status/no-results, cross-tenant privacy |
| `tests/blessboard-v5-a11y-structure.test.js` | Directory structure + CSS version assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 39 Batch 12C note |
| `docs/gui/BATCH_12C_BRANCH_MEMBERS.md` | This document |

**Unchanged:** `listBranchMembersForManager`, GET `/branch-admin/members` handler, query params (`q`, `status`, `page`), branch scoping, Member Detail (`member-detail.ejs`).

## 3. Visible fields (directory rows)

| Field | Source | Notes |
|-------|--------|-------|
| Legal name | `firstName`, `lastName` | Required display |
| Preferred name | `preferredName` | When present |
| Phone / email | `phoneDisplay`, `emailDisplay` | Display-only |
| Membership | `membershipStatus` | Labelled |
| Account status | `status` | Status chip |
| Primary flag | `isPrimary` | Tiny chip when true |
| Joined (mobile meta) | `joinedAt` / `createdAt` | Card meta only |
| Real total | `total` | Badge + pager meta — not Stitch sample counts |

## 4. Filters preserved

| Control | Param | Notes |
|---------|-------|-------|
| Search | `q` | Name, email, or phone (existing) |
| Status select | `status` | active / pending / inactive / suspended / archived |
| Status chips | `status` | Same values + All; preserves `q` when switching |
| Clear | — | Link back to `/branch-admin/members` |
| Pagination | `page` | Previous/Next when `totalPages > 1` |

No new sort query param (none existed).

## 5. Actions preserved

| Action | Behavior |
|--------|----------|
| View | Link to `/branch-admin/members/:id` (desktop + mobile) |

No bulk select, export, messaging, or add-member FAB.

## 6. Mobile treatment

| Surface | Behavior |
|---------|----------|
| `<900px` | Card list (`data-bb-member-cards`); table hidden |
| `≥900px` | Desktop table (`data-bb-member-table`); cards hidden |
| Status chips | Horizontal scroll on narrow viewports; wrap on desktop |

Mobile does **not** rely on a horizontally scrolling data table.

## 7. Privacy safeguards

- Does not render `churchId`, `branchId`, `email_normalized`, `phone_normalized`, or `user_id`
- Directory uses display contact fields only
- Church UUID asserted absent in HTTP tests
- Cross-tenant directory does not expose another church’s members (e.g. Nora)

## 8. Unsupported Stitch / product chrome omitted

- Fabricated totals (“1,248 Total”, “42 New”) and demographic summaries
- Export CSV / Add Member
- Tag / segment filters (Small Groups, Volunteers, Donors)
- Bulk row checkboxes
- Profile photos / chat actions

## 9. Empty states

| State | Marker | When |
|-------|--------|------|
| Catalog empty | `data-bb-member-empty="catalog"` | No rows and no active filter |
| No results | `data-bb-member-empty="no-results"` | No rows with `q` and/or `status` |

## 10. Backend confirmation

- Still uses `listBranchMembersForManager` with authenticated branch scope.
- No new queries, metrics, or schema fields.
- Member Detail presentation deferred (Batch 12D+).

## 11. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:member-registration` | **15/15 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **47/47 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css` | **0 errors** (79 hex warnings only) |
| `git diff --check` | **clean** |

## 12. Remaining gaps

1. Member Detail Stitch polish not started (order 40 / `27-branch-member-profile-*`).
2. Directory does not show Stitch sample group tags or photos (not in list DTO).
3. Count badge uses real filtered `total` only.

## 13. Suggested commit message

```
Polish branch-admin member directory to Stitch table and mobile cards.
```
