# Batch 13A — Branch admin announcements list

**Date:** 2026-07-18  
**Scope:** Branch Admin `/branch-admin/announcements` **list presentation only**. Creation, editing, preview, and publish chrome not started.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 47), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_12D_BRANCH_MEMBER_DETAIL.md`](./BATCH_12D_BRANCH_MEMBER_DETAIL.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `35-branch-announcements-management-desktop` | `65941542c13048edb2c62bccd01ddcea` |
| Mobile | `35-branch-announcements-management-mobile` | `daa416025c704a5693b295ef3139af89` |

Marker: `data-bb-stitch-announcements="35-branch-announcements-management"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/announcements/admin-list.ejs` | Stitch heading, filters/chips, desktop table, mobile cards, empty/no-results |
| `public/blessboard/v5/branch-admin.css` | List layout (`?v=19`) |
| `public/blessboard/v5/hq-admin.css` | Shared list styles for HQ mount of same template (`?v=15`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-announcements.test.js` | List markers, scope privacy, no fabricated metrics |
| `tests/blessboard-v5-a11y-structure.test.js` | List structure + responsive CSS assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 47 Batch 13A note |
| `docs/gui/BATCH_13A_BRANCH_ANNOUNCEMENTS_LIST.md` | This document |

**Unchanged:** `GET` list handler / `listAdminAnnouncements`, create/edit/publish/archive routes, CSRF, branch/church scoping, query params (`q`, `status`, `audience`, `page`), form/detail/preview/publish views.

## 3. Fields and statuses displayed

| Field | Source | Notes |
|-------|--------|-------|
| Title | `item.title` | Link to detail |
| Message snippet | `item.body` | Truncated |
| Audience | `item.audiences` | Members / Admins labels only |
| Source | `item.branchId` | Branch vs Church-wide |
| Published | `item.publishedAt` | Formatted when present |
| Status | `item.status` | draft / published / archived badges |
| Pinned / Featured | `item.isPinned`, `item.isFeatured` | Chips when true |
| Attachment count | `item.attachments.length` | Real count only when attachments exist |
| List total | `total` | Real filtered total — not Stitch sample counts |

## 4. Filters and actions preserved

| Control | Param / href | Notes |
|---------|--------------|-------|
| Search | `q` | Existing |
| Status select + chips | `status` | draft / published / archived + All |
| Audience select + chips | `audience` | members / admins + All |
| Clear | `basePath` | Clears all filters |
| Pagination | `page` | Previous/Next when `totalPages > 1` |
| Create announcement | `basePath/new` | Existing CTA only — create form not polished |
| Open | `basePath/:id` | Desktop + mobile |

No bulk actions. No edit entry points added on this list batch.

## 5. Unsupported elements omitted

- Active Today / Scheduled metric cards
- Announcement Insights (Total Views, Engagement %)
- Admin Tip / schedule strategy panel
- Public / Leaders audience chips (V5: members / admins only)
- Date Range / More Filters
- Scheduled status (not in V5)
- List delivery / read / engagement columns (detail retains real delivery summary)
- Bulk select / overflow menus
- Create/edit/preview/publish screen polish

## 6. Responsive status

| Viewport | Behavior |
|----------|----------|
| `<900px` | Mobile cards (`data-bb-ann-cards`); table hidden; chips scroll horizontally |
| `≥900px` | Desktop table (`data-bb-ann-table`); cards hidden; chips wrap |

Reuses completed Branch Admin shell (sidebar / drawer / bottom tabs).

## 7. Empty states

| State | Marker | When |
|-------|--------|------|
| Catalog empty | `data-bb-ann-empty="catalog"` | No rows, no active filter |
| No results | `data-bb-ann-empty="no-results"` | No rows with active `q` / `status` / `audience` |

## 8. Backend / authorization confirmation

- Still uses `listAdminAnnouncements` with authorized church + branch (or HQ church-wide / branch-scoped) scope.
- Cross-campus and foreign-tenant access remain gated by existing routes/services.
- Publication-state filters use real `status` values only.
- No new queries, metrics, schema, or auth changes.

## 9. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:announcements` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **49/49 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 10. Remaining gaps

1. Announcement preview / detail Stitch polish deferred (Batch 13B covered create/edit).
2. No schedule/publish-later product model.
3. Detail delivery summary unchanged (not part of list batch).

## 11. Suggested commit message

```
Polish branch-admin announcements list to Stitch table and mobile cards.
```
