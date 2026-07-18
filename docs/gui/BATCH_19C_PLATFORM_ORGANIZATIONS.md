# Batch 19C — Platform Admin Organization Directory

**Date:** 2026-07-18  
**Scope:** Platform Admin `/admin/organizations` directory presentation only. **Organization detail not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 75), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_19B_PLATFORM_DASHBOARD.md`](./BATCH_19B_PLATFORM_DASHBOARD.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop directory | `63-platform-church-organizations-desktop` | `18da9665bc674d2dbd249cbbb269d58d` |
| Mobile directory | `63-platform-church-organizations-mobile` | `db6b741d99e34d10b01496a83de5072a` |

Marker: `data-bb-stitch-organizations="63-platform-church-organizations"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/organizations.ejs` | Stitch “Organization Governance” heading, key-prefix filter, desktop table + mobile cards, status badges, empty/no-results, pagination; live directory total badge |
| `public/blessboard/v5/platform-admin.css` | Directory layout (`?v=10`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-platform-admin-shell.test.js` | Directory markers, search/no-results, no-fabrication |
| `tests/blessboard-v5-a11y-structure.test.js` | Directory structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 75 Batch 19C note |
| `docs/gui/BATCH_19C_PLATFORM_ORGANIZATIONS.md` | This document |

**Unchanged:** `listPlatformOrganizations`, GET `/admin/organizations` handler, query params (`q`, `page`, `limit`), apex/platform-admin authz, CSRF/sessions, organization detail page, create-org (still absent).

## 3. Visible fields (directory rows)

| Field | Source | Notes |
|-------|--------|-------|
| Display name | `displayName` | Link to detail |
| Organization key | `organizationKey` | Public key only — no org UUID |
| Environment | `dataEnvironment` | |
| Organization status | `organizationStatus` | Status chip |
| Enrolment status | `enrolmentStatus` | Chip when present |
| Canonical hostname | `canonicalHostname` | |
| Church key / status | `churchKey`, `churchStatus` | When linked |
| Active branches | `activeBranchCount` | Live count |
| Deployment | `deploymentCode` | Live identity |
| Directory total | `total` | Header badge + pager |

## 4. Filters preserved

| Control | Param | Notes |
|---------|-------|-------|
| Key prefix search | `q` | Indexed `organization_key` prefix only (existing) |
| Rows per page | `limit` | 10 / 25 / 50 / 100 (existing allowlist) |
| Clear | — | Drops `q`, keeps `limit` |
| Pagination | `page` | Previous/Next; preserves `q` + `limit` |

No new status/plan/premium query params (not supported by the list service).

## 5. Mobile treatment

| Width | Behavior |
|-------|----------|
| `<900px` | Card list (`data-bb-org-cards`); table hidden |
| `≥900px` | Desktop table (`data-bb-org-table`); cards hidden |
| 320px | Tighter card padding; compact total badge |

## 6. Empty / no-results

| State | Marker | Copy |
|-------|--------|------|
| Empty catalogue | `data-bb-pa-empty="catalog"` | No organizations yet → dashboard |
| No filter matches | `data-bb-pa-empty="no-results"` | No matching organizations → clear filter |

## 7. Omissions (intentional)

| Stitch expectation | Treatment |
|--------------------|-----------|
| Create New Organization | Omitted (no route) |
| KPI strip (1,284 / MRR / pending verifications) | Omitted — live `total` badge only |
| View chips All / Premium / Archived | Omitted (Premium inventable; status filter not in list API) |
| Country, HQ Admin, Plan, Created date | Omitted (not in DTO) |
| Edit / Export / Print | Omitted |
| Fabricated branch/tenant/health scores on cards | Live `activeBranchCount` only |
| Internal DB ids | Never rendered |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **11/11 pass** |
| `npm run test:blessboard:a11y-structure` | **75/75 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 9. Remaining gaps

1. Status / plan filter chips need a future list-service param before they can match Stitch View chips safely.
2. Organization detail polish deferred (Batch 19D+).
3. Create-organization UI remains MISSING.

## 10. Suggested commit message

```
Polish platform-admin organization directory to Stitch 63 without inventing metrics.
```
