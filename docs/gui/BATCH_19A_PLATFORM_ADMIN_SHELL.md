# Batch 19A — Platform Admin shared shell

**Date:** 2026-07-18  
**Scope:** Shared Platform Admin shell only. **Do not start dashboard or organization directory content.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 74, 96), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_16A_HQ_SHELL.md`](./BATCH_16A_HQ_SHELL.md), [`HQ_ADMIN_PARITY_AUDIT.md`](./HQ_ADMIN_PARITY_AUDIT.md)

## 1. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | Stitch shell marker, platform identity + live deployment code, role badge, dark ops sidebar, dialog drawer (`inert`/close/identity/logout/Powered by GetPro), Account + Open menu, `.bb-pa-page` area, `tabindex="-1"` main; `platform-admin.css?v=22` |
| `views/blessboard/v5/partials/platform-admin-shell-end.ejs` | Close page area; sticky mobile bottom tabs (Home/Orgs/Plans/Account); desktop footer Powered by GetPro; drawer bind via `shell-nav.js` |
| `public/blessboard/v5/platform-admin.css` | Stitch 62 dark ops chrome (`#283236`), cool page `#f1fbff`, page-head/action area, responsive content container, sticky bottom tabs, focus-visible, 320px guards |
| `src/platform/http/platformAdminShellLocals.js` | Surface live `deploymentCode` for shell identity only (no inventing) |
| `src/platform/http/platformAdminNav.js` | Enabled V5 routes only (no Tenants/Tickets/Health/Users) |
| `tests/blessboard-platform-admin-shell.test.js` | Shell chrome, a11y landmarks, authz/CSRF preserved, no fabricated health/tickets/Tenants nav |
| `tests/blessboard-v5-a11y-structure.test.js` | Platform shell parity + bottom-tab CSS |
| `docs/gui/STITCH_SCREEN_MAP.md` | Orders 74 / 96 Batch 19A notes |
| `docs/gui/BATCH_19A_PLATFORM_ADMIN_SHELL.md` | This document |

**Unchanged this batch:** Platform authz gates, sessions, CSRF, apex-only host gate, routes, database access, plan/override POSTs, dashboard/organization page bodies (shell includes only).

**This pass:** Verified against canonical Stitch 62 desktop/mobile via MCP; no further shell code edits required — implementation already matches Batch 19A scope on branch `V5`.

## 2. Stitch IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop shell frame | `62-platform-admin-dashboard-desktop` | `36c4708b025b4e7eaeab9ed508603b03` |
| Mobile shell frame | `62-platform-admin-dashboard-mobile` | `513dd5cc58c74b21bd7ee8d106dfac55` |

Marker: `data-bb-stitch-shell="62-platform-admin-dashboard"`.

Stitch HTML identity label is “GetPro Church Admin / Super Admin Portal”; V5 uses BlessBoard mark + “Platform administration” + live `PLATFORM_DEPLOYMENT_CODE` (product identity, not Moovex demo copy).

## 3. Shell behavior

| Surface | Behavior |
|---------|----------|
| Desktop sidebar (≥900px) | BlessBoard mark, Platform administration + live deployment code, platform-admin role badge (`data-bb-pa-role`), enabled nav with `aria-current`, user identity, CSRF Sign out, Powered by GetPro |
| Mobile header (<900px) | Sticky header, brand mark, Platform admin · deployment, Account (`/admin/account`), Menu (`aria-label="Open menu"`) |
| Mobile drawer | `role="dialog"` + `aria-modal` + `inert` when closed; identity + full enabled nav; Sign out; drawer Powered by GetPro |
| Mobile bottom tabs | Home, Orgs, Plans, Account (enabled V5 routes only) |
| Page area | `#bb-pa-main` + `.bb-pa-page` (`data-bb-page-area`) hosts page-header/actions and module content |
| Page header/actions | Shared `.bb-pa-page-head` / `--split` / `__actions` utilities for content pages |
| Active nav | `is-active` + `aria-current="page"` on sidebar, drawer, tabs |
| Keyboard / landmarks | Skip → `#bb-pa-main`; Escape closes drawer; focus returns to toggle; Tab cycle via `shell-nav.js`; `aside` / `nav` / `main` / `footer` |

**Omitted from Stitch chrome (intentional):** Tenants / Users / Tickets / Logs / Health top-level nav, global search, fabricated “System Status: Optimal”, Export / New Organization actions, FAB, support-chat FAB, Moovex footer metadata. No links to missing routes (e.g. `/admin/organizations/new`).

## 4. Responsive status

| Width | Status |
|-------|--------|
| 320px | Overflow guards; compact header; tighter bottom tabs; menu label hidden |
| 375–899px | Header + drawer + bottom tabs; content container padded for safe area |
| ≥900px | Sticky dark sidebar; header/tabs/drawer hidden; footer Powered by GetPro; centered main ≤72rem |

Breakpoints follow V5 portal convention (**900px** shell switch), not literal Stitch canvas widths.

## 5. Authorization confirmation

- No auth, session, CSRF, route, or database-access changes in this batch.
- Logout remains `POST /admin/logout` with `_csrf`.
- Non–platform-admin roles still **403**; unauthenticated → `/login`.
- Tenant hosts still cannot serve `/admin/*` (apex-only).
- Deployment identity shown only from `getPlatformDeploymentCode` (live `PLATFORM_DEPLOYMENT_CODE`).
- No create-org, tickets, health scores, system alerts, or fabricated platform metrics in the shell.

## 6. Tests

| Command | Result |
|---------|--------|
| `npm run test:blessboard:platform-admin-shell` | **12/12 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** |
| `npx stylelint public/blessboard/v5/platform-admin.css` | **0 errors** (hex-token warnings only) |
| `git diff --check` | **clean** |

## 7. Remaining gaps

1. **Dashboard body content** — out of Batch 19A scope (Stitch 62 metrics/widgets; later batches may polish separately).
2. **Organization directory / detail** — out of shell scope.
3. **Stitch Tenants / Users / Tickets / Logs / Health** — omitted intentionally (no V5 routes; Deployments covers registry).
4. **Create organization** Stitch pair — still MISSING (no UI route).
5. **Account** — functional; no dedicated Stitch pair (`STITCH_MISSING`).
6. **Stitch mobile** uses bottom tabs without hamburger; V5 adds Account + Menu drawer for full enabled nav (a11y parity with other admin shells).

## 8. Suggested commit message

```
Polish platform-admin shared shell to Stitch 62 chrome without inventing ops metrics.
```
