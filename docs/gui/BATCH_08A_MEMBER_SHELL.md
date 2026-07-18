# Batch 08A — Member portal shared shell

**Date:** 2026-07-18
**Scope:** Shared member shell only (desktop sidebar, mobile header, drawer, bottom tabs, identity, landmarks). **Dashboard and Profile content not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 26, 92), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`TENANT_PUBLIC_PARITY_AUDIT.md`](./TENANT_PUBLIC_PARITY_AUDIT.md)

## 1. Canonical Stitch screen IDs (shell reference)

Shell chrome is taken from the Member Dashboard pair (no standalone shell board):

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop shell frame | `14-member-dashboard-desktop` | `4207a5a6a8ac4464b2b899695bbc7c78` |
| Mobile shell frame | `14-member-dashboard-mobile` | `b315a9d1288b4454bcc37f79c25c5e10` |

Supporting tokens: Visual System `c8d8352b…`, Shared UI States `b61a1ea8…`, Powered by GetPro `503ff0d7…`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/partials/member-shell-start.ejs` | Sidebar identity, verified badge, drawer dialog/inert/close, profile icon, page area, skip/main landmarks |
| `views/blessboard/v5/partials/member-shell-end.ejs` | Bottom tabs + footer Powered by GetPro; JS bump |
| `public/blessboard/v5/member-portal.css` | Shell chrome styles (`?v=9`) |
| `public/blessboard/v5/member-portal.js` | Version bump reference only (`?v=4`) |
| `public/blessboard/v5/shell-nav.js` | Toggle `inert` when drawer opens/closes |
| `src/blessboard/http/memberPortalNav.js` | Nav label/icon `Dashboard` (route `/member` unchanged) |
| `src/blessboard/http/memberShellLocals.js` | Default page title “Dashboard” |
| `tests/blessboard-member-portal.test.js` | Shell chrome assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Member drawer/a11y + shell-nav inert |
| `docs/gui/BATCH_08A_MEMBER_SHELL.md` | This document |

**Unchanged:** member auth/authorization gates, sessions, CSRF issuance, route handlers, queries, Dashboard/Profile page bodies, unimplemented prayer/notifications links.

## 3. Shell behavior

| Surface | Behavior |
|---------|----------|
| Desktop sidebar (≥900px) | Brand, church/branch context, Verified member badge, full implemented nav, optional displayName identity, Sign out + CSRF, Powered by GetPro |
| Mobile header (<900px) | Sticky header, brand mark, church context, Profile icon (`/member/profile`), Menu toggle |
| Mobile drawer | Dialog + `aria-modal` + `inert` when closed; close control; identity; full nav; Sign out |
| Mobile bottom tabs | Home/Dashboard, Announcements, Events, Ministries, Profile (existing `PORTAL_MOBILE_TABS`) |
| Main / page area | `#bb-mp-main` landmark + `.bb-mp-page` container for module page titles |
| Active nav | `is-active` + `aria-current="page"` on sidebar, drawer, and tabs |
| Skip link | Focus-visible skip to `#bb-mp-main` |

## 4. Desktop / mobile status

| Width | Status |
|-------|--------|
| 320px | Overflow guards; compact brand/context |
| 375–899px | Header + drawer + bottom tabs |
| ≥900px | Sticky sidebar; header/tabs/drawer hidden; footer Powered by GetPro |

## 5. Backend behavior confirmation

- No session, CSRF, authorization, or controller/query changes.
- Nav still filtered to `enabled` + `nav` items only — no prayer / notifications routes.
- Logout remains `POST /member/logout` with `_csrf`.
- `displayName` shown only when already available from member access / session (no invented metrics).

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:member-portal` | **15/15 pass** (shell + member authorization gates) |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **32/32 pass** |
| `npx stylelint public/blessboard/v5/member-portal.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 7. Intentional deviations / remaining gaps

1. Brand lockup is **BlessBoard** (+ church context), not Stitch “GetPro Church” as primary wordmark.
2. No notifications icon (no V5 route).
3. No prayer nav item (route MISSING).
4. Mobile uses drawer + bottom tabs (Stitch bottom nav present; drawer for full nav).
5. Dashboard / Profile **content** still pending Batches 08B+.
6. Nav includes V5 modules Stitch sidebar may omit (Forms, Announcements, Profile) — product-complete implemented set only.

## 8. Suggested commit message

```
Polish member portal shared shell to Stitch chrome without changing auth.
```
