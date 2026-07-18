# Batch 19D — Platform Admin Organization Detail

**Date:** 2026-07-18  
**Scope:** Platform Admin `/admin/organizations/:organizationKey` presentation only. **Plans catalogue page not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 77), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_19C_PLATFORM_ORGANIZATIONS.md`](./BATCH_19C_PLATFORM_ORGANIZATIONS.md)

## 1. Canonical Stitch screen IDs

Stitch titles describe a multi-tenant “branch tenants” browser; V5 maps them to **organization detail** (existing product route). Layout cues adapted; fabricated cross-tenant KPIs omitted.

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `65-platform-branch-tenants-desktop` | `10f1dceb6d694563aaf152ecaedac3d3` |
| Mobile | `65-platform-branch-tenants-mobile` | `6633fa49f7b9420a8c1705f1e43c9efb` |

Marker: `data-bb-stitch-organization-detail="65-platform-branch-tenants"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/organization-detail.ejs` | Stitch-adapted detail: summary, catalogue/church, domains, branches (table+cards), entitlements RO vs editable plan/override forms |
| `public/blessboard/v5/platform-admin.css` | Detail layout (`?v=11`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-platform-admin-shell.test.js` | Detail markers, RO/edit labels, CSRF form targets, sensitive-data exclusion |
| `tests/blessboard-v5-a11y-structure.test.js` | Detail structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 77 Batch 19D note |
| `docs/gui/BATCH_19D_PLATFORM_ORGANIZATION_DETAIL.md` | This document |

**Unchanged:** GET detail handler, POST `/plan` + `/entitlement-override` (field names, confirmation, CSRF, redirects), authz, sessions, list/detail services, Plans page.

## 3. Data shown (existing locals only)

| Section | Fields | Mode |
|---------|--------|------|
| Summary | `organizationKey`, `organizationStatus`, `activeBranchCount` | Read-only |
| Catalogue & church | `displayName`, `dataEnvironment`, `enrolmentStatus`, `canonicalHostname`, `deploymentCode`, `churchKey`, `churchStatus` | Read-only |
| Domains | `hostname`, `domainType`, `status`, `deploymentCode`, `isPrimary`, `isVerified` | Read-only |
| Branches | `key`, `displayName`, `branchType`, `status`, `isPrimary`, `countryCode` | Read-only |
| Entitlements summary | plan key/name, subscription status/active, features table, usage vs limits | Read-only |
| Assign plan form | `plan_key`, `notes`, `confirm_plan_change`, CSRF | Editable |
| Override form | `feature_key`, `feature_kind`, `boolean_value`, `limit_value`, `reason`, `confirm_override`, CSRF | Editable |

## 4. Actions preserved

| Action | Target | Notes |
|--------|--------|-------|
| Assign plan | `POST …/plan` | Requires `confirm_plan_change=1` + CSRF |
| Entitlement override | `POST …/entitlement-override` | Requires `confirm_override=1`, reason, CSRF |
| Back to directory | `GET /admin/organizations` | Breadcrumb |

No org-status suspend UI, deletion, provisioning, DNS verify, export, or impersonation.

## 5. Sensitive fields excluded

Never rendered: org/church/branch UUIDs, passwords, session tokens, `DATABASE_URL`, connection strings, secrets, payment amounts, fabricated member/health/cloud metrics.

## 6. Mobile treatment

| Width | Behavior |
|-------|----------|
| `<900px` | Domain + branch cards; stacked layout |
| `≥900px` | Tables; two-column main + sticky entitlements aside |
| 320px | Compact summary cards |

## 7. Omissions (intentional)

| Stitch expectation | Treatment |
|--------------------|-----------|
| Export CSV / New Branch | Omitted (no routes) |
| Cross-tenant branch browser KPIs | Adapted to single-org summary |
| Member totals / system health / cloud usage charts | Omitted |
| Payment / price invention | Omitted |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **11/11 pass** |
| `npm run test:blessboard:a11y-structure` | **76/76 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 9. Remaining gaps

1. No dedicated org-status change POST (catalogue status remains read-only).
2. Plans catalogue page polish deferred.
3. Stitch multi-tenant list UX is not a separate V5 route.

## 10. Suggested commit message

```
Polish platform-admin organization detail to Stitch 65 without inventing tenant metrics.
```
