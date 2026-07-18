# Batch 19E — Platform Admin Plans & Limits

**Date:** 2026-07-18  
**Scope:** Platform Admin `/admin/plans` presentation only. **Settings / deployments polish not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 78), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_19D_PLATFORM_ORGANIZATION_DETAIL.md`](./BATCH_19D_PLATFORM_ORGANIZATION_DETAIL.md), [`BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md)

## 1. Canonical Stitch screen IDs

Stitch titles use Moovex / Free / Professional framing; V5 maps them to the live BlessBoard catalogue with approved public package names.

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `66-platform-plans-limits-desktop` | `4d0f59ac6acf4fcc9e1e0ed746abb5fd` |
| Mobile | `66-platform-plans-limits-mobile` | `b5953809962f4e0a8eae4ea96aa4575a` |

Marker: `data-bb-stitch-plans="66-platform-plans-limits"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/plans.ejs` | Stitch-adapted catalogue cards, guidance notes, org assign CTAs; display names + plan keys |
| `public/blessboard/v5/platform-admin.css` | Plans layout (`?v=12`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-platform-admin-shell.test.js` | Plans markers, Foundation/Growth/Network, no-fabrication |
| `tests/blessboard-v5-a11y-structure.test.js` | Plans structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 78 Batch 19E note |
| `docs/gui/BATCH_19E_PLATFORM_PLANS.md` | This document |

**Unchanged:** `listPlatformPlansCatalogue`, GET `/admin/plans` handler, plan/feature repository queries, org detail assign/override POSTs, authz, sessions, CSRF, seed `plan_key` values, billing catalogues.

## 3. Data shown (existing locals only)

| Field | Source | Notes |
|-------|--------|-------|
| Display name | `plan.displayName` | Foundation / Growth / Network from catalogue |
| Plan key | `plan.planKey` | Persisted codes (`free`, `growth`, `professional`) — not renamed |
| Description | `plan.description` | Catalogue text only |
| Features | `plan.features[]` | Keys, kinds, boolean/limit values |

## 4. Actions preserved / omitted

| Action | Treatment |
|--------|-----------|
| Link to organizations | Present — assignment remains on org detail |
| Create Custom Tier | Omitted (no route) |
| Configure Parameters | Omitted (no plan-edit route) |
| Subscription health KPIs | Unavailable note only |

## 5. Sensitive / invented fields excluded

Never rendered: org/plan UUIDs, `$` Stitch prices as KPI chrome, paid/free tenant counts, conversion, MRR, churn, API throughput, uptime SLA, tenant-slot meters, secrets.

## 6. Mobile treatment

| Width | Behavior |
|-------|----------|
| `<900px` | Single-column plan cards + stacked guidance notes |
| `≥900px` | Two-column plan grid; three-column notes |
| `≥1200px` | Three-column plan grid |
| `320px` | Compact cards; no horizontal overflow |

## 7. Omissions (intentional)

| Stitch expectation | Treatment |
|--------------------|-----------|
| Free / Professional titles | Mapped to Foundation / Growth / Network via `displayName` |
| Create Custom Tier | Omitted |
| Paid/Free tenant + conversion bar | Omitted |
| Usage meters / Core Infrastructure SLA | Omitted |
| Mobile FREE/ENTERPRISE toggle | Omitted — show all active catalogue cards |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **11/11 pass** |
| `npm run test:blessboard:a11y-structure` | **77/77 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 9. Remaining gaps

1. Settings DNS page polish deferred.
2. Deployments / support Stitch tickets still PLACEHOLDER.
3. Account page remains STITCH_MISSING.
4. `plan_key` rename migration remains out of scope (see pricing decision Phase B).

## 10. Suggested commit message

```
Polish platform-admin plans catalogue to Stitch 66 with Foundation/Growth/Network labels.
```
