# Batch 21B — Platform Admin Deployments

**Date:** 2026-07-18  
**Scope:** Platform Admin `/admin/deployments` presentation only. Stitch Support/Monitoring mapped to the live deployment registry.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 80), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_21A_PLATFORM_DOMAINS_SETTINGS.md`](./BATCH_21A_PLATFORM_DOMAINS_SETTINGS.md)

## 1. Canonical Stitch screen IDs

Stitch titles describe support tickets and live infrastructure health; V5 maps them to the **deployment registry** (existing product route). Fabricated health/ticket chrome is unavailable.

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `68-platform-support-monitoring-desktop` | `74cbe4a015754137ad414222f3941ef2` |
| Mobile | `68-platform-support-monitoring-mobile` | `9f40042097d7471db1f5628fbb0d27d8` |

Marker: `data-bb-stitch-deployments="68-platform-support-monitoring"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/deployments.ejs` | Registry summary cards, desktop table + mobile cards, unavailable panels |
| `public/blessboard/v5/platform-admin.css` | Deployments layout (`?v=16`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump (shared with 21A) |
| `tests/blessboard-platform-admin-shell.test.js` | Deployments markers, authz, no-fabrication |
| `tests/blessboard-v5-a11y-structure.test.js` | Deployments structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 80 Batch 21B note |
| `docs/gui/BATCH_21B_PLATFORM_DEPLOYMENTS.md` | This document |

**Unchanged:** `listPlatformDeployments`, `listDeploymentsSafe` columns, `PLATFORM_DEPLOYMENT_CODE` identity, domain resolution, tenant routing, sessions, authorization. No POST routes.

## 3. Data shown (existing locals only)

| Field | Source | Notes |
|-------|--------|-------|
| `deploymentCode` | `platform.deployments` | Live identity |
| `applicationCode` | same | |
| `releaseVersion` | same | |
| `canonicalDomain` | same | Domain ownership cue only |
| `environmentCode` | same | |
| `status` | same | Active / Inactive / Retired chips |
| `jobsEnabled` | same | Enabled / Disabled |
| `databaseAccessMode` | same | |
| `currentDeploymentCode` | `getPlatformDeploymentCode` | “This process” highlight |

Live summary counts: registered total, active-status count, current process code.

## 4. Omissions (intentional)

| Stitch expectation | Treatment |
|--------------------|-----------|
| Force Sync / Export Reports | Unavailable panel |
| Storage / error-rate / uptime KPIs | Unavailable summary cards (`—`) |
| Support ticket queue | Unavailable summary card |
| Live error stream / failed jobs | Unavailable panel |
| Retire / delete / cutover | Unavailable — no destructive controls |
| Session cookie names / secrets | Never rendered |

## 5. Mobile treatment

| Width | Behavior |
|-------|----------|
| `<900px` | Deployment cards; stacked summary |
| `≥900px` | Table + three-column summary; unavailable lists two-column |

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **11/11 pass** |
| `npm run test:blessboard:a11y-structure` | **80/80 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 7. Suggested commit message

```
Polish platform-admin deployments registry to Stitch 68 without inventing health or tickets.
```
