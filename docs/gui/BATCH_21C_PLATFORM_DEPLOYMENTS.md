# Batch 21C — Platform Admin Deployments Directory

**Date:** 2026-07-18  
**Scope:** Platform Admin `/admin/deployments` directory presentation only. **Deployment Detail not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 80), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_21B_PLATFORM_DOMAIN_DETAIL.md`](./BATCH_21B_PLATFORM_DOMAIN_DETAIL.md)

## 1. Canonical Stitch screen IDs

Stitch titles describe Support / Monitoring; V5 maps them to the **deployments directory** (existing product route). Fabricated health/ticket/ops chrome is unavailable.

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `68-platform-support-monitoring-desktop` | `74cbe4a015754137ad414222f3941ef2` |
| Mobile | `68-platform-support-monitoring-mobile` | `9f40042097d7471db1f5628fbb0d27d8` |

Markers: `data-bb-stitch-deployments="68-platform-support-monitoring"`, `data-bb-pa-deployments-directory="1"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/deployments.ejs` | Directory: env/status badges, product/host columns, desktop table + mobile cards, empty + unavailable ops |
| `public/blessboard/v5/platform-admin.css` | Directory polish (`?v=19`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-platform-admin-shell.test.js` | Directory markers, env/status, secrets exclusion, authz |
| `tests/blessboard-v5-a11y-structure.test.js` | Structure + safe SQL field assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 80 Batch 21C note |
| `docs/gui/BATCH_21C_PLATFORM_DEPLOYMENTS.md` | This document |

**Unchanged:** `listPlatformDeployments`, `listDeploymentsSafe` (safe columns only), `PLATFORM_DEPLOYMENT_CODE` identity, domain resolution, tenant routing, sessions, authorization. No Deployment Detail route.

## 3. Safe fields shown (live `platform.deployments`)

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

Live summary: registry count, active count, current process code.

## 4. Secrets / sensitive data excluded

Never selected or rendered: `session_cookie_name`, `DATABASE_URL`, `SESSION_SECRET`, passwords, credentials, connection strings, env-var dumps.

## 5. Omitted operations

Deploy, restart, rollback, environment-variable editing, log streaming, Force Sync, ticket queues, health meters, Deployment Detail.

## 6. Empty / unavailable states

| State | Marker |
|-------|--------|
| Empty catalogue | `data-bb-pa-empty="deployments"` |
| Unavailable ops | `data-bb-pa-deploy-unavailable="1"` + per-op `data-bb-pa-unavailable="…"` |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | Pass (12/12) — directory render, env/status badges, platform-admin authz (hq 403), secrets exclusion, no detail URLs |
| `npm run test:blessboard:a11y-structure` | Pass (82/82) — markers, empty/unavailable, safe SQL columns, no detail/ops copy |
| `npx stylelint public/blessboard/v5/platform-admin.css` | Pass (0 errors; existing hex-token warnings only) |
| `git diff --check` (changed files) | Pass |

Coverage notes: deployment directory rendering; deployment-scope authorization (`requirePlatformAdmin` + hq 403); sensitive-data exclusion; environment/status display; accessibility structure markers; empty catalogue marker; registry lookup unavailable → 503.

## 8. Suggested commit message

```
Polish platform-admin deployments directory with safe metadata and environment badges.
```
