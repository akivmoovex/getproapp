# Batch 21B — Platform Admin Domain Detail

**Date:** 2026-07-18  
**Scope:** Platform Admin `/admin/domains/:hostname` detail + confirmed status / organization assignment. **Deployments not started in this batch.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_21A_PLATFORM_DOMAINS.md`](./BATCH_21A_PLATFORM_DOMAINS.md)

## 1. Canonical Stitch screen IDs

No dedicated Domain Detail Stitch pair. Adapted from Settings DNS / hostname chrome (same pair as Domains Directory).

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `67-platform-settings-desktop` | `30e3856782bd41b6bf14402e1e535cbd` |
| Mobile | `67-platform-settings-mobile` | `efb0fd24f1184968be79083974dcd092` |

Marker: `data-bb-stitch-domain-detail="67-platform-settings"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/domain-detail.ejs` | New detail: summary, operational vs verification, org + status forms |
| `views/blessboard/v5/platform-admin/domains.ejs` | Directory links to detail |
| `public/blessboard/v5/platform-admin.css` | Detail layout (`?v=18`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump |
| `src/platform/services/platformAdminDomains.js` | Detail + status/org mutations (deployment-scoped) |
| `src/platform/http/platformAdminRoutes.js` | GET detail + POST status + POST organization |
| `tests/blessboard-platform-admin-shell.test.js` | Detail rendering, CSRF, status, org assignment, authz |
| `tests/blessboard-v5-a11y-structure.test.js` | Structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Domain detail row |
| `docs/gui/BATCH_21B_PLATFORM_DOMAIN_DETAIL.md` | This document |

**Unchanged:** `resolveHostname`, tenant routing, session model, provisioning CLI create path, deployments UI polish batch.

## 3. Fields shown

| Field | Mode |
|-------|------|
| Hostname, type, product, deployment, primary | Read-only |
| Created / updated timestamps | Read-only |
| Operational status (`active` / `inactive` / `retired`) | Editable when domain `deployment_id` matches current deployment |
| DNS ownership verification (`verified_at`) | Read-only — clearly separated from operational status |
| Organization key / display name | Editable assignment when mutable |

## 4. Actions

| Action | Support | Notes |
|--------|---------|-------|
| Create domain | **Not supported** (CLI provisioning only) | Unavailable panel |
| Update operational status | Supported | CSRF + `confirm_status=1` + deployment match |
| Assign organization | Supported | CSRF + `confirm_organization=1` + enrolment check for tenant types |
| DNS / SSL / redirects / verify jobs | Omitted | Unavailable panel |

## 5. Security

- Apex + `platform_admin` gate preserved.
- CSRF validated on both POSTs.
- Confirmation checkboxes required.
- Mutations only when `domains.deployment_id === PLATFORM_DEPLOYMENT_CODE`.
- Tenant types require active BlessBoard enrolment for the target organization.
- Never renders UUIDs, session cookies, `DATABASE_URL`, or resolver internals.

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **12/12 pass** |
| `npm run test:blessboard:a11y-structure` | **82/82 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 7. Suggested commit message

```
Add platform-admin domain detail with CSRF status and organization assignment.
```
