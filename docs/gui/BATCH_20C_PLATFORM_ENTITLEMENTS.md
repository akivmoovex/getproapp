# Batch 20C — Platform Admin Entitlements

**Date:** 2026-07-18  
**Scope:** Platform Admin organization entitlements presentation (effective set + override form). **Pricing-key migration not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 77 / 78a), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_20B_PLATFORM_SUBSCRIPTIONS.md`](./BATCH_20B_PLATFORM_SUBSCRIPTIONS.md)

## 1. Canonical Stitch screen IDs

No dedicated Entitlements Stitch pair. Adapted from plans/limits Access Control cues + org-detail frame.

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop (entitlement chrome) | `66-platform-plans-limits-desktop` | `4d0f59ac6acf4fcc9e1e0ed746abb5fd` |
| Mobile (entitlement chrome) | `66-platform-plans-limits-mobile` | `b5953809962f4e0a8eae4ea96aa4575a` |
| Org shell | `65-platform-branch-tenants-desktop` | `10f1dceb6d694563aaf152ecaedac3d3` |
| Org shell | `65-platform-branch-tenants-mobile` | `6633fa49f7b9420a8c1705f1e43c9efb` |

Markers: `data-bb-stitch-entitlements="66-platform-plans-limits"`, `data-bb-pa-org-entitlements="1"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/organization-detail.ejs` | Entitlements groups, enabled/disabled, plan vs override, polished override form |
| `views/blessboard/v5/platform-admin/subscriptions.ejs` | Configure links → `#pa-org-subscription` |
| `public/blessboard/v5/platform-admin.css` | Entitlements layout (`?v=15`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump |
| `src/platform/services/platformAdminEntitlements.js` | Present `planInherited` separately from `overrides` |
| `src/platform/http/platformAdminRoutes.js` | Plan flash anchors → `#pa-org-subscription` |
| `tests/blessboard-platform-admin-shell.test.js` | Rendering, inheritance/override, invalid key, authz |
| `tests/blessboard-v5-a11y-structure.test.js` | Structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 77 / 78a Batch 20C notes |
| `docs/gui/BATCH_20C_PLATFORM_ENTITLEMENTS.md` | This document |

**Unchanged:** Entitlement evaluation/enforcement (`entitlementService`), usage/limit calculations, override POST fields (`feature_key`, `feature_kind`, `boolean_value`, `limit_value`, `reason`, `confirm_override`), CSRF, allowlisted `FEATURE_KEYS`, plan_key values.

## 3. Entitlement sources

| Source | Marker | Meaning |
|--------|--------|---------|
| Inherited from plan | `data-bb-feature-source="plan"` / `data-bb-entitlement-source="plan"` | Effective value from assigned plan features |
| Organization override | `data-bb-feature-source="override"` / `data-bb-entitlement-source="override"` | Active org override wins |

Keys shown (V5 only): `max_branches`, `max_users`, `max_staff_accounts`, `basic_reports`, `advanced_reports`, `custom_domain`, `custom_email`.

## 4. Editable / read-only states

| Surface | Mode |
|---------|------|
| Usage vs limits | Read-only (existing counts/limits) |
| Capacity limits group | Read-only effective values |
| Capability flags group | Read-only Enabled/Disabled |
| Inherited / override lists | Read-only |
| Override form | Editable (allowlisted keys + CSRF + confirmation) |
| Plan assign form | Editable (unchanged; subscription section) |

## 5. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **11/11 pass** |
| `npm run test:blessboard:a11y-structure` | **78/78 pass** |
| `node --test tests/platform-entitlements.test.js` | **10/10 pass** (aligned to Foundation `max_branches=1`) |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 6. Suggested commit message

```
Polish platform-admin entitlements with plan inheritance, overrides, and capability states.
```
