# Batch 21A — Platform Admin Domains Directory

**Date:** 2026-07-18
**Scope:** Platform Admin `/admin/domains` directory only. **Domain Detail not started in this batch.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 78b), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_20C_PLATFORM_ENTITLEMENTS.md`](./BATCH_20C_PLATFORM_ENTITLEMENTS.md)

## 1. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/domains.ejs` | Directory: filters, desktop table + mobile cards, org links, empty/no-results |
| `public/blessboard/v5/platform-admin.css` | Domains layout (shell cache `platform-admin.css?v=23`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache |
| `src/platform/http/platformAdminNav.js` | Domains nav item |
| `src/platform/http/platformAdminShellLocals.js` | Title map |
| `src/platform/http/platformAdminRoutes.js` | `GET /admin/domains` |
| `src/platform/repositories/platformAdminRepository.js` | Domains directory SQL (safe columns only) |
| `src/platform/services/listPlatformDomains.js` | List service + filter normalization |
| `tests/blessboard-platform-admin-shell.test.js` | Render, org/hostname scope, status, no-results, authz |
| `tests/blessboard-v5-a11y-structure.test.js` | Structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 78b |
| `docs/gui/BATCH_21A_PLATFORM_DOMAINS.md` | This document |

**Unchanged:** `resolveHostname`, domain lookup SQL used by routing, tenant sessions, authorization gates, provisioning CLI. Domain Detail UI/routes not modified in this batch.

**This pass:** Verified against Stitch 67 (Settings DNS chrome adapted to directory). No further code edits required on branch `V5`.

## 2. Stitch IDs

No dedicated Domains Directory Stitch pair. Adapted from Settings (DNS / hostname chrome).

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `67-platform-settings-desktop` | `30e3856782bd41b6bf14402e1e535cbd` |
| Mobile | `67-platform-settings-mobile` | `efb0fd24f1184968be79083974dcd092` |

Markers: `data-bb-stitch-domains="67-platform-settings"`, `data-bb-pa-domains-directory="1"`.

## 3. Fields displayed

| Field | Source | Notes |
|-------|--------|-------|
| Hostname | `domains.hostname` | Primary label |
| Type | `domains.domain_type` | Apex / Canonical / Custom / Alias from stored enum |
| Status | `domains.status` | Active / Inactive chips |
| Verified | `domains.verified_at IS NOT NULL` | Verified / Unverified from stored data only |
| Primary | `domains.is_primary` | Chip when true |
| Organization | `organizations.organization_key` / `display_name` | Link to `/admin/organizations/:key#pa-org-domains` |
| Product | `products.display_name` / `product_key` | BlessBoard label |
| Deployment | `domains.deployment_id` | Deployment code text only |
| Directory total | list `total` | Live count badge |

Filters (GET): `q` (hostname prefix), `org`, `status`, `type`, `verified`, `limit`, `page`.

## 4. Status / type / verification handling

| State | Rendering |
|-------|-----------|
| `status=active` | `bb-pa-chip--ok` Active |
| `status=inactive` | `bb-pa-chip--muted` Inactive |
| `domain_type` apex/canonical/custom/alias | Type chip from stored enum only |
| `verified_at` set | Verified chip |
| `verified_at` null | Unverified chip |
| Empty catalogue | `data-bb-pa-empty="domains"` |
| Filtered no-results | `data-bb-pa-empty="no-results"` + Clear filter |

## 5. Unsupported automation omitted

DNS lookup, certificate provisioning / TLS issuance, domain purchase, automatic verification, Force Verify, Buy Domain, destructive domain controls, internal routing secrets (`session_cookie*`, `ResolveHostname`, `expectedDeploymentCode`, organization UUIDs, `DATABASE_URL`).

## 6. Tests

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` (directory render, org/hostname scope, status filter, no-results, hq 403 / anon 303) | **12/12 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex-token warnings only) |
| `git diff --check` | **clean** |

## 7. Suggested commit message

```
Add platform-admin domains directory from live platform.domains without DNS automation.
```
