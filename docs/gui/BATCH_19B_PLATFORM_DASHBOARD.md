# Batch 19B — Platform Admin Dashboard

**Date:** 2026-07-18  
**Scope:** Platform Admin `/admin` dashboard presentation only. **Organizations directory polish not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 74), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_19A_PLATFORM_ADMIN_SHELL.md`](./BATCH_19A_PLATFORM_ADMIN_SHELL.md), [`BATCH_16B_HQ_DASHBOARD.md`](./BATCH_16B_HQ_DASHBOARD.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Dashboard | `62-platform-admin-dashboard-desktop` | `36c4708b025b4e7eaeab9ed508603b03` |
| Mobile Dashboard | `62-platform-admin-dashboard-mobile` | `513dd5cc58c74b21bd7ee8d106dfac55` |

Markers: `data-bb-pa-dashboard="1"`, `data-bb-stitch-dashboard="62-platform-admin-dashboard"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/dashboard.ejs` | Stitch “System Overview” heading, live/unavailable summary cards, deployment notices, directory sample, activity/health empty states, desktop + mobile quick actions |
| `public/blessboard/v5/platform-admin.css` | Dashboard layout/chrome (`?v=9`) |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-platform-admin-shell.test.js` | Dashboard section + no-fabrication + authz/deployment assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Dashboard structure assertions + CSS cache bump |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 74 Batch 19B note |
| `docs/gui/BATCH_19B_PLATFORM_DASHBOARD.md` | This document |

**Unchanged:** `/admin` route handler queries/locals shape, auth gates, CSRF, sessions, apex host gate, shell chrome (aside from CSS bump), Organizations page body, no new queries or calculations.

## 3. Data locals used (existing route only)

| Local | Use |
|-------|-----|
| `totalOrganizations` | Live Organizations card |
| `organizationsWithChurch` | Live BlessBoard churches card |
| `directorySample` | Directory sample list (≤5 from existing list call) |
| `displayName` | Welcome first name |
| `roleLabel` | Signed-in role line |
| `deploymentCode` | Deployment notice + role line (shell local) |

No new controller locals, metrics services, or dashboard queries.

## 4. Metrics shown

| Card | Value shown | Notes |
|------|-------------|-------|
| Organizations | `totalOrganizations` (live) | Links to `/admin/organizations` |
| BlessBoard churches | `organizationsWithChurch` (live) | Links to `/admin/organizations` |
| Branch tenants | `—` unavailable | Links to `/admin/organizations` |
| Paid plans (desktop) | `—` unavailable | Links to `/admin/plans` |
| Open tickets (desktop) | `—` unavailable | Links to `/admin/deployments` |
| System health (mobile) | `—` unavailable | Links to `/admin/deployments` |

## 5. Stitch metrics / panels omitted (neutral unavailable)

| Stitch expectation | Treatment |
|--------------------|-----------|
| Fabricated org totals (124 / 1,284) and growth (+12%) | Live count only; growth omitted |
| Branch tenants / expansion counts | Unavailable card |
| Active members (12.8k / 42.1k) | Omitted (no dashboard local) |
| Paid plans / Enterprise counts / MRR | Unavailable card → Plans catalogue |
| Open tickets / high priority | Unavailable card |
| Platform health API%/DB latency / 99.8% reliability | Empty health panel → Deployments |
| System Status: Optimal | Neutral deployment notice (live code only) |
| Recent activity feed (fake events) | Empty activity panel |
| Top performing orgs table (health/users) | Directory sample keys/names only |
| New Organization / Export Report / FAB | Omitted (no create-org route) |
| Infrastructure Load banner | Omitted |

## 6. Quick-action routes

### Desktop (violet panel)

| Action | Href |
|--------|------|
| Organizations | `/admin/organizations` |
| Plans & limits | `/admin/plans` |
| Deployments | `/admin/deployments` |
| Settings | `/admin/settings` |

### Mobile (Quick governance)

| Action | Href |
|--------|------|
| Orgs | `/admin/organizations` |
| Plans | `/admin/plans` |
| Deploy | `/admin/deployments` |
| Account | `/admin/account` |

Hero CTA: Browse organizations → `/admin/organizations`.

## 7. Desktop / mobile differences

| Width | Behavior |
|-------|----------|
| 320px | Compact quick-action labels; tighter stats |
| 375–899px | System-health card; quick governance icons; stacked panels |
| ≥900px | Paid-plans + open-tickets cards; two-column layout with violet quick-actions aside; mobile quick icons hidden |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **11/11 pass** |
| `npm run test:blessboard:a11y-structure` | **74/74 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 9. Remaining gaps

1. Branch-tenant / plans / tickets / health cards stay unavailable until product exposes **existing** safe aggregates without inventing Stitch sample numbers.
2. Activity feed has no V5 platform event stream — empty state only.
3. Organization creation and export remain out of scope (no routes).
4. Organizations directory / detail polish deferred (not this batch).

## 10. Suggested commit message

```
Polish platform-admin dashboard to Stitch 62 with live counts only.
```
