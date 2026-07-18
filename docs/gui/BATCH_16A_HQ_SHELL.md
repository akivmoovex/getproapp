# Batch 16A — HQ Admin shared shell

**Date:** 2026-07-18  
**Scope:** Shared HQ Admin shell only. **HQ Dashboard content not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 61, 95), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_11A_BRANCH_ADMIN_SHELL.md`](./BATCH_11A_BRANCH_ADMIN_SHELL.md)

## 1. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/partials/hq-shell-start.ejs` | Stitch shell marker, church/HQ identity, role badge, light sidebar, dialog drawer (`inert`/close/identity/logout/Powered by GetPro), Account + Open menu, `.bb-hq-page` area, `tabindex="-1"` main; `hq-admin.css?v=29` |
| `views/blessboard/v5/partials/hq-shell-end.ejs` | Close page area; mobile bottom tabs; desktop footer Powered by GetPro; JS cache bump |
| `public/blessboard/v5/hq-admin.css` | Sacred Modernity shell chrome (light sidebar/drawer), page-head/action area, responsive content container, branch-selector content styles, focus-visible, 320px guards |
| `views/blessboard/v5/partials/branch-selector.ejs` | Unchanged logic; remains page-scoped include |
| `tests/blessboard-hq-shell.test.js` | Shell chrome, a11y, branch-selector page placement, no fabricated metrics |
| `tests/blessboard-v5-a11y-structure.test.js` | HQ shell parity + CSS cache bump |
| `docs/gui/STITCH_SCREEN_MAP.md` | Orders 61 / 95 Batch 16A notes |
| `docs/gui/BATCH_16A_HQ_SHELL.md` | This document |

**Unchanged:** HQ authz gates, sessions, CSRF, church scoping, branch open/redirect logic, `hqAdminNav.js` enabled routes only, individual HQ page bodies (except existing shell includes).

## 2. Stitch IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop shell frame | `51-hq-dashboard-desktop` | `538c8f4f1a844930ac058428bf390a76` |
| Mobile shell frame | `51-hq-dashboard-mobile` | `c67eda7682de428d985416074f606fcf` |

Marker: `data-bb-stitch-shell="51-hq-dashboard"`.

## 3. Shell behavior

| Surface | Behavior |
|---------|----------|
| Desktop sidebar (≥900px) | BlessBoard mark, church + HQ branch labels, HQ role badge (`data-bb-hq-role`), enabled nav with `aria-current`, user identity, CSRF Sign out, Powered by GetPro |
| Mobile header (<900px) | Sticky header, brand mark, church · HQ context, Account (`/hq/account`), Menu (`aria-label="Open menu"`) |
| Mobile drawer | `role="dialog"` + `aria-modal` + `inert` when closed; identity + full enabled nav; Sign out; drawer Powered by GetPro |
| Mobile bottom tabs | Dashboard, Branches, Reports, Account |
| Page area | `#bb-hq-main` + `.bb-hq-page` (`data-bb-page-area`) hosts page-header/actions and module content |
| Active nav | `is-active` + `aria-current="page"` on sidebar, drawer, tabs |
| Keyboard | Skip → main; Escape closes drawer; focus returns to toggle; Tab cycle via `shell-nav.js` |

**Omitted from Stitch chrome:** Broadcast, Permission/Roles, Organization Templates (no V5 routes). No invented alerts or metrics in the shell.

## 4. Branch-selector treatment

| Rule | Implementation |
|------|----------------|
| Placement | **Page content** inside `.bb-hq-page` (dashboard + branch registry), not sidebar/header chrome |
| Logic | Unchanged — `branch-selector.ejs` still links `/hq/branches/:key`; open/redirect authorization untouched |
| Visibility | Empty state when no active branches; active keys/display names only (no UUIDs) |
| Shell relationship | Shell provides responsive content container + shared styles; Branches nav remains the shell entry to registry |

## 5. Responsive status

| Width | Status |
|-------|--------|
| 320px | Overflow guards; compact header; tighter bottom tabs; menu label hidden |
| 375–899px | Header + drawer + bottom tabs; branch-selector cards stack |
| ≥900px | Sticky light sidebar; header/tabs/drawer hidden; footer Powered by GetPro; centered main ≤64rem |

## 6. Authorization confirmation

- No auth, session, CSRF, or church-scope gate changes.
- Logout remains `POST /hq/logout` with `_csrf`.
- Platform admin may access HQ; branch-only admin receives **403**.
- Cross-church branch keys rejected; inactive branches **404**.
- No Broadcast/Roles/Templates nav invented.
- Branch selection open path unchanged (`/hq/branches/:key` → branch-admin when authorized).

## 7. Tests

| Command | Result |
|---------|--------|
| `npm run test:blessboard:hq-shell` | **7/7 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **59/59 pass** |
| `npx stylelint public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` (changed files) | **clean** |

## 8. Suggested commit message

```
Polish HQ admin shared shell to Stitch chrome without changing auth.
```
