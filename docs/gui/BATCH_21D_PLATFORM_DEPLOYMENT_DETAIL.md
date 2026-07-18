# Batch 21D — Platform Admin Deployment Detail

**Date:** 2026-07-18  
**Scope:** Platform Admin `/admin/deployments/:deploymentCode` safe detail + diagnostics presentation only. **Platform parity audit not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 80 / 80a), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_21C_PLATFORM_DEPLOYMENTS.md`](./BATCH_21C_PLATFORM_DEPLOYMENTS.md)

## 1. Canonical Stitch screen IDs

No dedicated Deployment Detail Stitch pair. Adapted from Support / Monitoring (same pair as Deployments Directory).

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `68-platform-support-monitoring-desktop` | `74cbe4a015754137ad414222f3941ef2` |
| Mobile | `68-platform-support-monitoring-mobile` | `9f40042097d7471db1f5628fbb0d27d8` |

Markers: `data-bb-stitch-deployment-detail="68-platform-support-monitoring"`, `data-bb-pa-deployment-detail="1"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/deployment-detail.ejs` | New: summary, environment, products, domains, safe diagnostics, unavailable ops |
| `views/blessboard/v5/platform-admin/deployments.ejs` | Directory links to detail; removed “detail not started” unavailable item |
| `src/platform/services/getPlatformDeploymentDetail.js` | Detail + diagnostics from live safe fields + `PLATFORM_DEPLOYMENT_CODE` |
| `src/platform/repositories/platformAdminRepository.js` | `findDeploymentSafeByCode`, `listDomainsForDeploymentSafe`, `findProductSafeByKey` |
| `src/platform/http/platformAdminRoutes.js` | `GET /admin/deployments/:deploymentCode` |
| `public/blessboard/v5/platform-admin.css` | Detail + diagnostic layout (`?v=20`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-platform-admin-shell.test.js` | Detail render, identity, authz, secrets exclusion |
| `tests/blessboard-v5-a11y-structure.test.js` | Detail structure + CSS v20 |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 80a + directory note |
| `docs/gui/BATCH_21D_PLATFORM_DEPLOYMENT_DETAIL.md` | This document |

**Unchanged:** Domain resolution, tenant routing, sessions, authorization gates, provisioning identity rules. No POST routes on deployment detail. Platform parity audit not started.

## 3. Safe fields shown

| Section | Fields |
|---------|--------|
| Summary | `deploymentCode`, `releaseVersion`, `canonicalDomain`, `jobsEnabled`, `databaseAccessMode`, `status`, “This process” when codes match |
| Environment | `environmentCode` + current process code (read-only) |
| Products | Application product from `application_code` → `platform.products`; distinct products from deployment domains |
| Domains | Hostname, type, product, organization key, status, verified — from `platform.domains` for this `deployment_id` |
| Diagnostics | Pass/fail/unavailable list (see below) |

## 4. Safe diagnostics

| Key | Pass / fail when | Otherwise |
|-----|------------------|-----------|
| `canonical_host` | Canonical domain present / missing | — |
| `deployment_status` | Status is `active` / not | — |
| `product_link` | `platform.products` row for application code / missing | — |
| `domains_registered` | ≥1 domain / none | — |
| `runtime_identity` | Current process matches `PLATFORM_DEPLOYMENT_CODE` | Unavailable when identity missing or viewing another deployment |
| `log_access`, `env_editing`, `process_control`, `health_metrics` | — | Always unavailable |

## 5. Secrets / sensitive data excluded

Never selected or rendered: `session_cookie_name`, `DATABASE_URL`, `SESSION_SECRET`, passwords, credentials, connection strings, transfer tokens, hashes, env dumps, log tails.

## 6. Omitted operations

Environment-variable editing, deploy / restart / rollback, log access, secret display, Force Sync, fabricated health/ticket meters.

## 7. Empty / unavailable states

| State | Behaviour |
|-------|-----------|
| Unknown code | 404 controlled |
| Invalid code | 400 controlled |
| Lookup error | 503 controlled |
| Empty products / domains | `data-bb-pa-empty="deploy-products"` / `deploy-domains` |
| Unsupported checks | `data-bb-pa-diag-state="unavailable"` |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | Pass (12/12) — detail render, identity highlight, hq 403, 404/400, secrets exclusion |
| `npm run test:blessboard:a11y-structure` | Pass (83/83) — detail markers, diagnostics, safe SQL, CSS v20 |
| `npx stylelint public/blessboard/v5/platform-admin.css` | Pass (0 errors; existing hex-token warnings only) |
| `git diff --check` (changed files) | Pass |

Coverage notes: deployment detail rendering; sensitive-data exclusion; deployment identity (`PLATFORM_DEPLOYMENT_CODE` / this-process); platform-admin authorization; accessibility structure; empty product/domain markers; unavailable diagnostics.

## 9. Suggested commit message

```
Add safe platform-admin deployment detail with catalogue diagnostics.
```
