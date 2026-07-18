# Batch 21B — Platform Admin Domain Detail

**Date:** 2026-07-18
**Scope:** Platform Admin `/admin/domains/:hostname` detail + confirmed status / organization assignment. **Deployments not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 78c), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_21A_PLATFORM_DOMAINS.md`](./BATCH_21A_PLATFORM_DOMAINS.md)

## 1. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/domain-detail.ejs` | Summary, operational vs verification, org + status forms, unavailable ops |
| `views/blessboard/v5/platform-admin/domains.ejs` | Directory links to detail |
| `public/blessboard/v5/platform-admin.css` | Detail layout (shell cache `platform-admin.css?v=23`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache |
| `src/platform/services/platformAdminDomains.js` | Detail + status/org mutations (deployment-scoped) |
| `src/platform/http/platformAdminRoutes.js` | GET detail + POST status + POST organization |
| `tests/blessboard-platform-admin-shell.test.js` | Detail render, CSRF, status, org assignment, secrets exclusion, authz |
| `tests/blessboard-v5-a11y-structure.test.js` | Structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 78c |
| `docs/gui/BATCH_21B_PLATFORM_DOMAIN_DETAIL.md` | This document |

**Unchanged:** `resolveHostname`, tenant routing, sessions, authorization, provisioning CLI create path. Deployments UI not modified.

**This pass:** Verified against Stitch 67. No further code edits required on branch `V5`.

## 2. Stitch IDs

No dedicated Domain Detail Stitch pair. Adapted from Settings (same pair as Domains Directory).

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `67-platform-settings-desktop` | `30e3856782bd41b6bf14402e1e535cbd` |
| Mobile | `67-platform-settings-mobile` | `efb0fd24f1184968be79083974dcd092` |

Marker: `data-bb-stitch-domain-detail="67-platform-settings"`.

## 3. Fields / actions

| Field / action | Mode | Notes |
|----------------|------|-------|
| Hostname, type, product, deployment, primary, created/updated | Read-only | Existing `platform.domains` columns only |
| Operational status (`active` / `inactive` / `retired`) | Editable when deployment-scoped | CSRF + `confirm_status=1` |
| DNS ownership verification (`verified_at`) | Read-only | Clearly separated from operational status |
| Organization assignment | Editable when deployment-scoped | CSRF + `confirm_organization=1`; enrolment check for tenant types |
| Create domain | Not supported in UI | Unavailable panel — CLI provisioning only |

Operational vs verification markers: `data-bb-domain-state="operational"` / `"verification"`.

## 4. Omitted automation

Automated DNS lookup/writes, SSL / certificate issuance, hostname redirects, verification jobs that set `verified_at`, Buy Domain / Force Verify.

## 5. Security confirmation

- Apex + `platform_admin` gate preserved.
- CSRF validated on both POSTs (`error=csrf` on failure).
- Confirmation checkboxes required (`confirm_status` / `confirm_organization`).
- Mutations only when `domains.deployment_id === PLATFORM_DEPLOYMENT_CODE`.
- Tenant types require active BlessBoard enrolment for the target organization.
- Never renders organization UUIDs, session cookies, `DATABASE_URL`, tokens, hashes, or resolver internals.

## 6. Tests

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` (detail render, status/org CSRF/confirm, secrets exclusion, hq 403) | **12/12 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex-token warnings only) |
| `git diff --check` | **clean** |

## 7. Suggested commit message

```
Add platform-admin domain detail with CSRF status and organization assignment.
```
