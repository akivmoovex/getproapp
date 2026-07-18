# Batch 21A — Platform Admin Domains / Settings

**Date:** 2026-07-18  
**Scope:** Platform Admin `/admin/settings` presentation (hostname/DNS patterns + reserved labels) and org-detail Domains cue links. **Deployments polish is Batch 21B.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 79), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_20C_PLATFORM_ENTITLEMENTS.md`](./BATCH_20C_PLATFORM_ENTITLEMENTS.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `67-platform-settings-desktop` | `30e3856782bd41b6bf14402e1e535cbd` |
| Mobile | `67-platform-settings-mobile` | `efb0fd24f1184968be79083974dcd092` |

Markers: `data-bb-stitch-settings="67-platform-settings"`, org domains `data-bb-stitch-org-domains="67-platform-settings"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/settings.ejs` | Stitch-adapted settings: current deployment, DNS pattern, reserved keywords, unavailable panels |
| `views/blessboard/v5/platform-admin/organization-detail.ejs` | Domains section cue + Settings link; no DNS automation |
| `public/blessboard/v5/platform-admin.css` | Settings layout (`?v=16`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-platform-admin-shell.test.js` | Settings markers, authz, no-fabrication |
| `tests/blessboard-v5-a11y-structure.test.js` | Settings structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 79 Batch 21A note |
| `docs/gui/BATCH_21A_PLATFORM_DOMAINS_SETTINGS.md` | This document |

**Unchanged:** `GET /admin/settings` locals (`hostnamePattern`, reserved slug sets, current deployment), hostname resolution (`resolveHostname` / `domainRepository`), tenant routing, sessions, authorization, provisioning CLI.

## 3. Data shown (existing locals only)

| Section | Fields | Mode |
|---------|--------|------|
| Current deployment | `deploymentCode`, `canonicalDomain`, `environmentCode`, `releaseVersion` | Read-only |
| DNS pattern | `hostnamePattern` | Read-only |
| Reserved organization keys | `organizationReserved[]` | Read-only |
| Reserved host labels | `hostReserved[]` | Read-only |
| Org detail Domains | existing domain rows | Read-only (cue only) |

## 4. Omissions (intentional)

| Stitch expectation | Treatment |
|--------------------|-----------|
| Save Changes / Export Logs | Omitted |
| Global branding / logo upload / colors | Unavailable panel |
| MFA / IP allowlist / session timeout / password policy | Unavailable panel |
| Manual failover / vault meters | Unavailable panel |
| DNS & certificate automation / + Add Keyword | Unavailable panel — no POST |
| Mobile “Reset All Platform Settings” | Omitted (destructive) |

## 5. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **11/11 pass** |
| `npm run test:blessboard:a11y-structure` | **80/80 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 6. Suggested commit message

```
Polish platform-admin settings with read-only DNS patterns and reserved hostname labels.
```
