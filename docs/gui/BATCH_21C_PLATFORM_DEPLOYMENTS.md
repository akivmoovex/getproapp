# Batch 21C — Platform Admin Deployments Directory

**Date:** 2026-07-18
**Scope:** Platform Admin `/admin/deployments` directory only. **Deployment Detail not started in this batch.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 80), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_21B_PLATFORM_DOMAIN_DETAIL.md`](./BATCH_21B_PLATFORM_DOMAIN_DETAIL.md)

## 1. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/deployments.ejs` | Directory: env/status badges, product/host, table/cards, empty + unavailable ops |
| `public/blessboard/v5/platform-admin.css` | Directory layout (shell cache `platform-admin.css?v=23`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache |
| `src/platform/services/listPlatformDeployments.js` | Live safe list + `PLATFORM_DEPLOYMENT_CODE` identity |
| `src/platform/repositories/platformAdminRepository.js` | `listDeploymentsSafe` (safe columns only) |
| `src/platform/http/platformAdminRoutes.js` | `GET /admin/deployments` |
| `src/platform/http/platformAdminNav.js` | Deployments nav item |
| `tests/blessboard-platform-admin-shell.test.js` | Directory render, env/status, secrets exclusion, authz |
| `tests/blessboard-v5-a11y-structure.test.js` | Structure + safe SQL field assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 80 |
| `docs/gui/BATCH_21C_PLATFORM_DEPLOYMENTS.md` | This document |

**Unchanged:** Domain resolution, tenant routing, sessions, authorization gates, `PLATFORM_DEPLOYMENT_CODE` identity rules. Deployment Detail UI not modified in this batch.

**This pass:** Verified against Stitch 68 (Support / Monitoring → deployments directory). No further code edits required on branch `V5`.

## 2. Stitch IDs

Stitch titles describe Support / Monitoring; V5 maps them to the deployments directory (existing product route). Fabricated health/ticket chrome is unavailable.

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `68-platform-support-monitoring-desktop` | `74cbe4a015754137ad414222f3941ef2` |
| Mobile | `68-platform-support-monitoring-mobile` | `9f40042097d7471db1f5628fbb0d27d8` |

Markers: `data-bb-stitch-deployments="68-platform-support-monitoring"`, `data-bb-pa-deployments-directory="1"`.

## 3. Safe fields shown

| Field | Source | Presentation |
|-------|--------|--------------|
| Deployment code | `deployment_code` | Code + “This process” when matches runtime |
| Product | `application_code` | BlessBoard / GetPro / NGO / Platform label |
| Release | `release_version` | Text |
| Host | `canonical_domain` | Canonical host |
| Environment | `environment_code` | Badge (production / preproduction / shared / testing) |
| Status | `status` | Badge (active / inactive / retired) |
| Jobs | `jobs_enabled` | Enabled / Disabled |
| DB access | `database_access_mode` | Read/write / Read-only |

Live summary: registry count, active count, current process code. Empty catalogue: `data-bb-pa-empty="deployments"`. Unavailable ops panel: `data-bb-pa-deploy-unavailable="1"`.

## 4. Secrets excluded

Never selected or rendered: `session_cookie_name`, `DATABASE_URL`, `SESSION_SECRET`, passwords, credentials, connection strings, private tokens, env-var dumps.

SQL whitelist in `listDeploymentsSafe`: `deployment_code`, `application_code`, `release_version`, `canonical_domain`, `environment_code`, `status`, `jobs_enabled`, `database_access_mode` only.

## 5. Omitted operations

Deploy, restart, rollback, environment-variable editing, log streaming, Force Sync, ticket queues, fabricated health meters.

## 6. Tests

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` (directory render, env/status badges, secrets exclusion, hq 403) | **12/12 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex-token warnings only) |
| `git diff --check` | **clean** |

## 7. Suggested commit message

```
Polish platform-admin deployments directory with safe metadata and environment badges.
```
