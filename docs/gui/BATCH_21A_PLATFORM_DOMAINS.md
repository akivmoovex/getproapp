# Batch 21A — Platform Admin Domains Directory

**Date:** 2026-07-18  
**Scope:** Platform Admin `/admin/domains` directory only. Domain Detail continues in [`BATCH_21B_PLATFORM_DOMAIN_DETAIL.md`](./BATCH_21B_PLATFORM_DOMAIN_DETAIL.md).  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_20B_PLATFORM_SUBSCRIPTIONS.md`](./BATCH_20B_PLATFORM_SUBSCRIPTIONS.md)

## 1. Canonical Stitch screen IDs

No dedicated Domains Directory Stitch pair exists. Adapted from Settings (DNS / hostname chrome) with directory table/card cues from Organizations / Subscriptions.

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `67-platform-settings-desktop` | `30e3856782bd41b6bf14402e1e535cbd` |
| Mobile | `67-platform-settings-mobile` | `efb0fd24f1184968be79083974dcd092` |

Markers: `data-bb-stitch-domains="67-platform-settings"`, `data-bb-pa-domains-directory="1"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/domains.ejs` | New directory: filters, desktop table + mobile cards, org links, empty/no-results |
| `public/blessboard/v5/platform-admin.css` | Domains directory layout (`?v=17`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump |
| `src/platform/http/platformAdminNav.js` | Domains nav item |
| `src/platform/http/platformAdminShellLocals.js` | Title map |
| `src/platform/http/platformAdminRoutes.js` | `GET /admin/domains` |
| `src/platform/repositories/platformAdminRepository.js` | Domains directory SQL (safe columns only) |
| `src/platform/services/listPlatformDomains.js` | List service + filter normalization |
| `tests/blessboard-platform-admin-shell.test.js` | Rendering, scope, status, authz |
| `tests/blessboard-v5-a11y-structure.test.js` | Structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Domains directory row |
| `docs/gui/BATCH_21A_PLATFORM_DOMAINS.md` | This document |

**Unchanged:** `resolveHostname`, `domainRepository` lookup SQL, tenant routing, sessions, authorization gates, provisioning CLI, org-detail domains list (read-only cue only). No Domain Detail route.

## 3. Visible fields (live `platform.domains` only)

| Field | Source | Notes |
|-------|--------|-------|
| Hostname | `domains.hostname` | Primary label |
| Type | `domains.domain_type` | Apex / Canonical / Custom / Alias |
| Status | `domains.status` | Active / Inactive chips |
| Verified | `domains.verified_at IS NOT NULL` | Verified / Unverified |
| Primary | `domains.is_primary` | Chip when true |
| Organization | `organizations.organization_key` / `display_name` | Link to `/admin/organizations/:key#pa-org-domains` when present |
| Product | `products.product_key` / `display_name` | BlessBoard label |
| Deployment | `domains.deployment_id` | Deployment code text only |

## 4. Status / type / verification handling

| State | Rendering |
|-------|-----------|
| `status=active` | `bb-pa-chip--ok` Active |
| `status=inactive` | `bb-pa-chip--muted` Inactive |
| `domain_type=canonical` (and apex/custom/alias) | Type chip from stored enum only |
| `verified_at` set | Verified chip |
| `verified_at` null | Unverified chip |

Filters: hostname prefix (`q`), organization key prefix (`org`), status, type, verification, page size. Empty catalogue vs no-results states.

## 5. Unsupported automation omitted

DNS lookup, certificate provisioning / TLS issuance, domain purchase, automatic verification, Force Verify, Buy Domain, destructive domain controls, Domain Detail, internal routing secrets (`session_cookie*`, `ResolveHostname`, `expectedDeploymentCode`, UUIDs, `DATABASE_URL`).

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **11/11 pass** |
| `npm run test:blessboard:a11y-structure` | **81/81 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 7. Suggested commit message

```
Add platform-admin domains directory from live platform.domains without DNS automation.
```
