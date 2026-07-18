# Batch 20B — Platform Admin Subscriptions

**Date:** 2026-07-18  
**Scope:** Platform Admin subscription directory + organization subscription-configuration presentation. **Entitlements override polish not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 78a), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_20A_PLATFORM_PLANS.md`](./BATCH_20A_PLATFORM_PLANS.md), [`BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md)

## 1. Canonical Stitch screen IDs

No dedicated Subscriptions Stitch pair exists. Batch 20B adapts the plans/limits frames (subscription-health area → live subscription directory).

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `66-platform-plans-limits-desktop` | `4d0f59ac6acf4fcc9e1e0ed746abb5fd` |
| Mobile | `66-platform-plans-limits-mobile` | `b5953809962f4e0a8eae4ea96aa4575a` |

Markers: `data-bb-stitch-subscriptions="66-platform-plans-limits"`, `data-bb-pa-subscription-config="1"` (org detail).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/subscriptions.ejs` | New directory: filters, desktop table + mobile cards, org links |
| `views/blessboard/v5/platform-admin/organization-detail.ejs` | Subscription configuration labeling + starts/ends; plan form preserved |
| `public/blessboard/v5/platform-admin.css` | Subscriptions layout (`?v=14`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump |
| `src/platform/http/platformAdminNav.js` | Subscriptions nav item |
| `src/platform/http/platformAdminShellLocals.js` | Title map |
| `src/platform/http/platformAdminRoutes.js` | `GET /admin/subscriptions` |
| `src/platform/repositories/platformAdminRepository.js` | Subscription directory SQL |
| `src/platform/services/listPlatformSubscriptions.js` | List service |
| `src/platform/services/platformAdminEntitlements.js` | Expose subscription starts/ends on org view |
| `tests/blessboard-platform-admin-shell.test.js` | Directory, mapping, scope, authz, assign |
| `tests/blessboard-v5-a11y-structure.test.js` | Structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 78a |
| `docs/gui/BATCH_20B_PLATFORM_SUBSCRIPTIONS.md` | This document |

**Unchanged:** `POST …/plan` and `POST …/entitlement-override` field names, CSRF, confirmation, redirects; plan_key values; billing runtime.

## 3. Subscription fields shown

| Field | Source | Notes |
|-------|--------|-------|
| Organization key / display name | `organizations` join | Link to org detail `#pa-org-entitlements` |
| Plan display name / key | `plans.display_name` / `plan_key` | Foundation/Growth/Network mapping via display_name |
| Subscription status | `organization_subscriptions.status` | Status chip |
| Product | `product_key` | BlessBoard label |
| Starts / ends | `starts_at` / `ends_at` | Configuration window only — not billing dates |
| Notes | omitted in list | Available on assignment form only |

## 4. Plan mapping

| Display name | Persisted `plan_key` |
|--------------|----------------------|
| Foundation | `free` |
| Growth | `growth` |
| Network | `professional` |

Assignment still posts `plan_key` and requires `confirm_plan_change=1` + CSRF.

## 5. Omitted billing features

Checkout, invoices, payments, refunds, balances, MRR, Stripe, automated billing, fabricated payment states.

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **11/11 pass** |
| `npm run test:blessboard:a11y-structure` | **78/78 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 7. Suggested commit message

```
Add platform-admin subscription directory with live rows and preserved plan assignment.
```
