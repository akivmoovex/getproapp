# Batch 21D — Platform Admin Deployment Detail

**Date:** 2026-07-18
**Scope:** Platform Admin `/admin/deployments/:deploymentCode` safe detail + diagnostics. **Parity audit not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 80a), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_21C_PLATFORM_DEPLOYMENTS.md`](./BATCH_21C_PLATFORM_DEPLOYMENTS.md)

## 1. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/deployment-detail.ejs` | Summary, environment, products, domains, safe diagnostics, unavailable ops |
| `views/blessboard/v5/platform-admin/deployments.ejs` | Directory links to detail |
| `src/platform/services/getPlatformDeploymentDetail.js` | Detail + diagnostics from live safe fields + `PLATFORM_DEPLOYMENT_CODE` |
| `src/platform/repositories/platformAdminRepository.js` | `findDeploymentSafeByCode`, `listDomainsForDeploymentSafe`, `findProductSafeByKey` |
| `src/platform/http/platformAdminRoutes.js` | `GET /admin/deployments/:deploymentCode` (no POST) |
| `public/blessboard/v5/platform-admin.css` | Detail + diagnostic layout (`platform-admin.css?v=23`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache |
| `tests/blessboard-platform-admin-shell.test.js` | Detail render, identity, authz, secrets exclusion, 404/400 |
| `tests/blessboard-v5-a11y-structure.test.js` | Detail structure |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 80a |
| `docs/gui/BATCH_21D_PLATFORM_DEPLOYMENT_DETAIL.md` | This document |

**Unchanged:** Domain resolution, tenant routing, sessions, authorization gates, provisioning identity rules. No POST routes on deployment detail. Parity audit not started.

**This pass:** Verified against Stitch 68. No further code edits required on branch `V5`.

## 2. Stitch IDs

No dedicated Deployment Detail Stitch pair. Adapted from Support / Monitoring (same pair as Deployments Directory).

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `68-platform-support-monitoring-desktop` | `74cbe4a015754137ad414222f3941ef2` |
| Mobile | `68-platform-support-monitoring-mobile` | `9f40042097d7471db1f5628fbb0d27d8` |

Markers: `data-bb-stitch-deployment-detail="68-platform-support-monitoring"`, `data-bb-pa-deployment-detail="1"`.

## 3. Safe diagnostics

| Key | Pass / fail when | Otherwise |
|-----|------------------|-----------|
| `canonical_host` | Canonical domain present / missing | — |
| `deployment_status` | Status is `active` / not | — |
| `product_link` | `platform.products` row for application code / missing | — |
| `domains_registered` | ≥1 domain / none | — |
| `runtime_identity` | Current process matches `PLATFORM_DEPLOYMENT_CODE` | Unavailable when identity missing or viewing another deployment |
| `log_access`, `env_editing`, `process_control`, `health_metrics` | — | Always unavailable |

Panels: summary, environment, products, domains (from `platform.domains` for this deployment), diagnostics list.

## 4. Excluded fields / operations

Never selected or rendered: `session_cookie_name`, `DATABASE_URL`, `SESSION_SECRET`, passwords, credentials, connection strings, transfer tokens, token hashes, env dumps, log tails.

Omitted: environment-variable editing, deploy / restart / rollback, log access, secret display, Force Sync, fabricated health/ticket meters. No POST forms.

## 5. Tests

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` (detail render, identity highlight, secrets exclusion, 404/400, hq 403) | **12/12 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex-token warnings only) |
| `git diff --check` | **clean** |

## 6. Suggested commit message

```
Add platform-admin deployment detail with safe diagnostics and no process controls.
```
