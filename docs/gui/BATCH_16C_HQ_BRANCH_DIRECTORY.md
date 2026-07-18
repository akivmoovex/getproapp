# Batch 16C — HQ Branch directory & selector

**Date:** 2026-07-18  
**Scope:** HQ Admin `/hq/branches` registry presentation + shared `branch-selector` chrome. **Member oversight not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 62), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_16B_HQ_DASHBOARD.md`](./BATCH_16B_HQ_DASHBOARD.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop registry | `52-hq-branch-registry-desktop` | `1a1aaecd09d34357886aa0b1028e539a` |
| Mobile registry | `52-hq-branch-registry-mobile` | `2f154dfcd0e045938a60ae3c147b240a` |

Markers: `data-bb-hq-branches="1"`, `data-bb-stitch-branches="52-hq-branch-registry"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/hq/branches.ejs` | Stitch registry chrome: search, type chips, desktop table, mobile cards, empty/no-results, selector panel |
| `views/blessboard/v5/partials/branch-selector.ejs` | Active pill; role/status on empty; same `/hq/branches/:key` open path |
| `src/blessboard/http/hqAdminRoutes.js` | Pass existing `q` / `type` query locals only (no new DB query) |
| `public/blessboard/v5/hq-admin.css` | Registry layout (`?v=31`) |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-hq-shell.test.js` | Registry, search/filter, selector, no-fabrication assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Registry structure + CSS cache bump |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 62 Batch 16C note |
| `docs/gui/BATCH_16C_HQ_BRANCH_DIRECTORY.md` | This document |

**Unchanged:** branch list service, open/redirect authorization (`/hq/branches/:key`), church scoping, CSRF, sessions, create/delete/billing routes (none added).

## 3. Visible branch fields

| Field | Source | Notes |
|-------|--------|-------|
| Display name | `branch.displayName` | Table + cards + selector |
| Type | `branch.branchType` | HQ / Branch pill |
| Key | `branch.key` | Public branch key only |
| Primary | `branch.isPrimary` | Optional Primary pill |
| Status | Active | Listed rows are active-only (inactive remain hidden) |
| Active count | `activeBranchCount` | Live church total (unfiltered) |

**Never shown:** UUIDs, member counts, pastor/admin names, locations, last-report dates, health/performance scores.

## 4. Selector behavior

| Behavior | Detail |
|----------|--------|
| Route | Unchanged `GET /hq/branches/:key` → church ownership check → `/branch-admin` when authorized |
| List source | Same church-scoped active `branches` array (filter applies to selector too) |
| Empty | `data-bb-empty="branches"` when church has no active branches |
| No results | Registry shows `data-bb-empty="branch-no-results"`; selector not rendered for empty filter set |

## 5. Search / filters (presentation only)

| Control | Param | Scope |
|---------|-------|-------|
| Search | `?q=` | Name or key substring on already-loaded active list |
| Type chips | `?type=hq\|branch` | Filters `branchType` in memory |

No additional repository queries.

## 6. Omitted Stitch actions / metrics

- New Branch Registry / create
- Quick Export / Add Member
- Region filters and fabricated “124 branches”
- Member / Pending Growth KPIs
- Pastor, location, last report columns
- Needs Attention / Pending growth statuses not backed by V5 data
- Monitoring / summarize analytics actions
- Billing / provisioning

## 7. Desktop / mobile

| Width | Behavior |
|-------|----------|
| &lt;900px | Mobile cards; table hidden |
| ≥900px | Desktop table; cards hidden |
| Filter bar | Stacks on narrow; grid ≥700px |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:hq-shell` | **9/9 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **61/61 pass** |
| `npx stylelint public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 9. Suggested commit message

```
Polish HQ branch registry and selector without inventing metrics.
```
