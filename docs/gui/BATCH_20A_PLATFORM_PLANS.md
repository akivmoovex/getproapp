# Batch 20A — Platform Admin Plans Directory

**Date:** 2026-07-18  
**Scope:** Platform Admin `/admin/plans` directory presentation only. **Subscriptions not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 78), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_19E_PLATFORM_PLANS.md`](./BATCH_19E_PLATFORM_PLANS.md), [`BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `66-platform-plans-limits-desktop` | `4d0f59ac6acf4fcc9e1e0ed746abb5fd` |
| Mobile | `66-platform-plans-limits-mobile` | `b5953809962f4e0a8eae4ea96aa4575a` |

Marker: `data-bb-stitch-plans="66-platform-plans-limits"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/plans.ejs` | Directory: active cards, desktop table + mobile cards, inactive/legacy section |
| `public/blessboard/v5/platform-admin.css` | Directory layout (`?v=13`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump |
| `src/platform/repositories/entitlementRepository.js` | `listPlansForProduct` (all statuses) |
| `src/platform/services/listPlatformPlansCatalogue.js` | `includeInactive` for directory; present status/legacy flags |
| `src/platform/http/platformAdminRoutes.js` | Plans GET uses `includeInactive: true` |
| `tests/blessboard-platform-admin-shell.test.js` | Directory markers, mapping, inactive visibility, plans authz |
| `tests/blessboard-v5-a11y-structure.test.js` | Directory structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 78 Batch 20A note |
| `docs/gui/BATCH_20A_PLATFORM_PLANS.md` | This document |

**Unchanged:** Org-detail assign/override POSTs, active-only assignability, entitlement resolution, seed `plan_key` values, billing catalogues, plan creation (still absent).

## 3. Plans shown

| `plan_key` | `display_name` | Status | Directory treatment |
|------------|----------------|--------|---------------------|
| `free` | Foundation | active | Active package card + directory row |
| `growth` | Growth | active | Active package card + directory row |
| `professional` | Network | active | Active package card + directory row |
| `partner` | Partner (legacy) | inactive | Directory + inactive/legacy section only |

Source: live `platform.plans` (+ `plan_features`) for product `blessboard`.

## 4. Display names versus persisted keys

| Public name | Persisted key | Notes |
|-------------|---------------|-------|
| Foundation | `free` | Mapped via catalogue `display_name` |
| Growth | `growth` | Same key |
| Network | `professional` | Mapped via catalogue `display_name` |
| Partner (legacy) | `partner` | Inactive; Legacy badge; not assignable |

Keys are shown as read-only codes. No rename.

## 5. Legacy-plan handling

- Inactive rows listed with **Inactive** + **Legacy** chips.
- Operator copy: retained for existing subscriptions; not offered as new assignments.
- Seed migration prose is **not** shown in the UI.
- Assign CTAs appear only on **active** package cards.
- Org-detail plan dropdown still uses active-only catalogue (`includeInactive` default false).
- `assignOrganizationPlan` still rejects non-active plans.

## 6. Omissions (intentional)

| Stitch / product expectation | Treatment |
|------------------------------|-----------|
| Create Custom Tier / plan create | Omitted (no route) |
| Price columns / Stitch `$` KPIs | Omitted (no price columns in DB) |
| Subscription health meters | Omitted |
| Subscriptions area | Not started |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **11/11 pass** |
| `npm run test:blessboard:a11y-structure` | **77/77 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 8. Migration still required

Yes — Phase B in [`BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md) to align persisted `plan_key` values to `foundation` / `growth` / `network`. **Not performed in this batch.**

## 9. Suggested commit message

```
Polish platform-admin plans directory with active/legacy catalogue rows from platform.plans.
```
