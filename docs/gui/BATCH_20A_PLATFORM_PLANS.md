# Batch 20A — Platform Admin Plans Directory

**Date:** 2026-07-18  
**Scope:** Platform Admin `/admin/plans` directory presentation only. **Subscriptions not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 78), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_19D_PLATFORM_ORGANIZATION_DETAIL.md`](./BATCH_19D_PLATFORM_ORGANIZATION_DETAIL.md), [`BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md)

## 1. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/plans.ejs` | Directory: active cards, desktop table + mobile cards, inactive/legacy section; Foundation/Growth/Network via `displayName`; persisted keys read-only |
| `public/blessboard/v5/platform-admin.css` | Plans directory layout (shell cache `platform-admin.css?v=23`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache |
| `src/platform/repositories/entitlementRepository.js` | `listPlansForProduct` (all statuses) |
| `src/platform/services/listPlatformPlansCatalogue.js` | `includeInactive` for directory; `isActive` / `isLegacy` presentation |
| `src/platform/http/platformAdminRoutes.js` | Plans GET uses `includeInactive: true` |
| `tests/blessboard-platform-admin-shell.test.js` | Render, display-name mapping, active/inactive/legacy, authz, no price/create chrome |
| `tests/blessboard-v5-a11y-structure.test.js` | Directory structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 78 Batch 20A note |
| `docs/gui/BATCH_20A_PLATFORM_PLANS.md` | This document |

**Unchanged:** Org-detail assign/override POSTs, active-only assignability, entitlement resolution logic, seed `plan_key` values, billing catalogues, plan creation (absent), schema/migrations.

**This pass:** Verified against Stitch 66 + pricing decision approved packages. No further code edits required on branch `V5`.

## 2. Stitch IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `66-platform-plans-limits-desktop` | `4d0f59ac6acf4fcc9e1e0ed746abb5fd` |
| Mobile | `66-platform-plans-limits-mobile` | `b5953809962f4e0a8eae4ea96aa4575a` |

Marker: `data-bb-stitch-plans="66-platform-plans-limits"`.

## 3. Plans displayed

| `plan_key` (persisted) | `display_name` (public) | Status | Directory treatment |
|------------------------|-------------------------|--------|---------------------|
| `free` | Foundation | active | Active package card + catalogue directory |
| `growth` | Growth | active | Active package card + catalogue directory |
| `professional` | Network | active | Active package card + catalogue directory |
| `partner` | Partner (legacy) | inactive | Catalogue directory + Inactive & legacy section |

Source: live `platform.plans` (+ `plan_features`) for product `blessboard` only. Entitlement summaries from stored feature rows (limits/booleans). No invented prices.

## 4. Display names versus persisted keys

| Public name | Persisted key | Notes |
|-------------|---------------|-------|
| Foundation | `free` | Safe display via catalogue `display_name` |
| Growth | `growth` | Same key |
| Network | `professional` | Safe display via catalogue `display_name` |
| Partner (legacy) | `partner` | Inactive; Legacy badge; not assignable |

Keys remain visible as read-only codes. **No rename or delete.**

## 5. Legacy-plan treatment

- Inactive rows use **Inactive** + **Legacy** chips (`data-bb-plan-legacy-badge`).
- Dedicated “Inactive & legacy” section for non-active catalogue rows.
- Operator copy: retained for existing subscriptions; not offered as new assignments.
- Migration internals (`Phase B`, `plan_key migration`, rename prose) are **not** shown in the UI.
- Active cards link to Organizations for assignment; org-detail dropdown stays active-only.
- `assignOrganizationPlan` still rejects non-active plans (entitlement logic unchanged).

## 6. Tests

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` (render, display-name mapping, active/inactive/legacy visibility, apex authz) | **12/12 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex-token warnings only) |
| `git diff --check` | **clean** |

## 7. Migration still required

**Yes.** Phase B in [`BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md) to align persisted `plan_key` values to `foundation` / `growth` / `network`. **Not performed in this batch.**

## 8. Suggested commit message

```
Polish platform-admin plans directory with active/legacy catalogue rows from platform.plans.
```
