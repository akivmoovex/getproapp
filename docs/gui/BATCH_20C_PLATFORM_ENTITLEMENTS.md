# Batch 20C — Platform Admin Entitlements

**Date:** 2026-07-18  
**Scope:** Platform Admin organization entitlements presentation (effective set + override form). **Plan-key migration not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 77 / 78a), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_20B_PLATFORM_SUBSCRIPTIONS.md`](./BATCH_20B_PLATFORM_SUBSCRIPTIONS.md)

## 1. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/organization-detail.ejs` | Entitlement groups (limits/capabilities), enabled/disabled states, plan vs override lists, allowlisted override form |
| `public/blessboard/v5/platform-admin.css` | Entitlements layout (shell cache `platform-admin.css?v=23`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache |
| `src/platform/services/platformAdminEntitlements.js` | Present `planInherited` separately from `overrides`; usage from live counters |
| `src/platform/http/platformAdminRoutes.js` | Org detail GET + `POST …/entitlement-override` (fields/CSRF preserved) |
| `tests/blessboard-platform-admin-shell.test.js` | Render, inheritance/override, invalid key, CSRF/confirm, hq 403 |
| `tests/blessboard-v5-a11y-structure.test.js` | Structure + CSS version |
| `tests/platform-entitlements.test.js` | Evaluation, override, limit enforcement (unchanged calc) |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 77 Batch 20C notes |
| `docs/gui/BATCH_20C_PLATFORM_ENTITLEMENTS.md` | This document |

**Unchanged:** `entitlementService` evaluation/enforcement; branch/staff/user limit calculations; override POST field names (`feature_key`, `feature_kind`, `boolean_value`, `limit_value`, `reason`, `confirm_override`); CSRF; allowlisted `FEATURE_KEYS`; persisted `plan_key` values.

**This pass:** Verified against Stitch 66 (Access Control chrome) + org-detail shell 65. No further code edits required on branch `V5`.

## 2. Stitch IDs

No dedicated Entitlements Stitch pair. Adapted from plans/limits Access Control cues on the org-detail frame.

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop (entitlement chrome) | `66-platform-plans-limits-desktop` | `4d0f59ac6acf4fcc9e1e0ed746abb5fd` |
| Mobile (entitlement chrome) | `66-platform-plans-limits-mobile` | `b5953809962f4e0a8eae4ea96aa4575a` |
| Org shell desktop | `65-platform-branch-tenants-desktop` | `10f1dceb6d694563aaf152ecaedac3d3` |
| Org shell mobile | `65-platform-branch-tenants-mobile` | `6633fa49f7b9420a8c1705f1e43c9efb` |

Markers: `data-bb-stitch-entitlements="66-platform-plans-limits"`, `data-bb-pa-org-entitlements="1"`, `data-bb-pa-org-overrides="1"`.

## 3. Entitlement sources

| Source | Marker | Meaning |
|--------|--------|---------|
| Inherited from plan | `data-bb-feature-source="plan"` / `data-bb-entitlement-source="plan"` | Effective value from assigned plan features |
| Organization override | `data-bb-feature-source="override"` / `data-bb-entitlement-source="override"` | Active org override wins |

**V5 keys only** (from `FEATURE_KEYS`):

| Kind | Keys |
|------|------|
| Capacity limits | `max_branches`, `max_users`, `max_staff_accounts` |
| Capability flags | `basic_reports`, `advanced_reports`, `custom_domain`, `custom_email` |

Marketing capabilities and free-form keys are not shown or accepted.

## 4. Editable / read-only states

| Surface | Mode |
|---------|------|
| Usage vs limits | Read-only (existing counts/limits; calc unchanged) |
| Capacity limits group | Read-only effective values + source chip |
| Capability flags group | Read-only Enabled/Disabled + source chip |
| Inherited / override lists | Read-only separation where `source` supports it |
| Override form | Editable (allowlisted keys + reason + CSRF + `confirm_override`) |
| Plan assign form | Editable (subscription section; unchanged) |

## 5. Tests

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` (render, inheritance/override, CSRF/validation, authz) | **12/12 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:platform:entitlements` (limit enforcement + override) | **10/10 pass** |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex-token warnings only) |
| `git diff --check` | **clean** |

## 6. Suggested commit message

```
Polish platform-admin entitlements with plan inheritance, overrides, and capability states.
```
