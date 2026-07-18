# Batch 11A — Branch admin shared shell

**Date:** 2026-07-18  
**Scope:** Shared Branch Admin shell only (desktop sidebar, mobile header/drawer/bottom tabs, branch identity + role status, active nav, page area, footer/Powered by GetPro, keyboard/a11y). **Branch Dashboard content not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 37, 93), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`MEMBER_PORTAL_PARITY_AUDIT.md`](./MEMBER_PORTAL_PARITY_AUDIT.md)

## 1. Canonical Stitch screen IDs (shell reference)

Shell chrome is taken from the Branch Admin Dashboard pair (no standalone shell board). Prefer `25-*` over obsolete `04-*`:

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop shell frame | `25-branch-admin-dashboard-desktop` | `001d1a0235a14f47b456bb092a012f7c` |
| Mobile shell frame | `25-branch-admin-dashboard-mobile` | `615f1f4eabd645c4a6840349edb17cd1` |

Supporting tokens: Visual System / Sacred Modernity via `head-design-system`, Shared UI States, Powered by GetPro partial.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | Stitch marker, role badge, dialog drawer (`inert`/close/identity/Powered by GetPro), Account icon, `aria-label` menu toggle, page area, `tabindex="-1"` main |
| `views/blessboard/v5/partials/branch-admin-shell-end.ejs` | Close page area; bottom tabs + desktop footer; JS cache bump |
| `public/blessboard/v5/branch-admin.css` | Drawer head/footer, page container, focus-visible, bottom-tab ellipsis, 320px guards (`?v=11`) |
| `tests/blessboard-branch-admin-shell.test.js` | Shell chrome + a11y marker assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Branch shell parity checks (drawer/dialog/footer/CSS) |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 93 IDs + Batch 11A note |
| `docs/gui/BATCH_11A_BRANCH_ADMIN_SHELL.md` | This document |

**Unchanged:** branch-admin authentication, authorization, branch scoping, sessions, CSRF, routes, queries, role assignment, individual page bodies (except shell adoption via existing includes), nav model (`branchAdminNav.js` — Reports remains dashboard placeholder only, not a nav link).

## 3. Shell behavior

| Surface | Behavior |
|---------|----------|
| Desktop sidebar (≥900px) | Brand, church/branch context, role status badge (`data-bb-branch-role`), full enabled nav, displayName identity when present, Sign out + CSRF, Powered by GetPro |
| Mobile header (<900px) | Sticky header, brand mark, church · branch context, Account icon (`/branch-admin/account`), Menu toggle (`aria-label="Open menu"`) |
| Mobile drawer | `role="dialog"` + `aria-modal` + `inert` when closed; close control; identity + role; full enabled nav; Sign out; drawer Powered by GetPro |
| Mobile bottom tabs | Dashboard, Registrations, Members, Announcements, Account (`BRANCH_ADMIN_MOBILE_TABS`) |
| Main / page area | `#bb-ba-main` landmark + `.bb-ba-page` (`data-bb-page-area`) for module titles/actions |
| Active nav | `is-active` + `aria-current="page"` on sidebar, drawer, and tabs |
| Skip link | Focus-visible skip to `#bb-ba-main` |
| Keyboard | Escape closes drawer; focus returns to toggle; focus trap via shared `shell-nav.js` |

## 4. Desktop / mobile status

| Width | Status |
|-------|--------|
| 320px | Overflow guards; compact context; tighter bottom tabs |
| 375–899px | Header + drawer + bottom tabs |
| ≥900px | Sticky sidebar; header/tabs/drawer hidden; footer Powered by GetPro |

## 5. Authorization confirmation

- No session, CSRF, authorization gate, or controller/query changes in this batch.
- Nav remains enabled implemented routes only — no `/branch-admin/reports`, no Support link.
- Logout remains `POST /branch-admin/logout` with `_csrf`.
- Existing shell tests still assert wrong-branch / wrong-church **403**, inactive user/role rejection, and no fabricated dashboard metrics.
- Church/branch labels and role text come from existing shell locals only (no invented alerts or counts).

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:branch-admin-shell` | **12/12 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **41/41 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 7. Intentional deviations / remaining gaps

1. Brand lockup is **BlessBoard** (+ church/branch context), not Stitch “GetPro Church” as primary wordmark.
2. No Reports or Support nav items (Reports is disabled dashboard tile only; Support has no V5 route).
3. Mobile uses drawer + bottom tabs (Stitch bottom nav present; drawer for full nav).
4. Branch Dashboard **content** / metrics UI deferred (Batch 11B+); current dashboard still explicitly empty of fabricated counts.
5. Nav includes V5 modules Stitch sidebar may omit — product-complete enabled set only.

## 8. Suggested commit message

```
Polish branch-admin shared shell to Stitch chrome without changing auth.
```
