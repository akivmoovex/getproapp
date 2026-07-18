# Batch 11C — Branch admin Account

**Date:** 2026-07-18  
**Scope:** Branch Admin `/branch-admin/account` presentation only. **Settings not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 58), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_11A_BRANCH_ADMIN_SHELL.md`](./BATCH_11A_BRANCH_ADMIN_SHELL.md), [`BATCH_11B_BRANCH_ADMIN_DASHBOARD.md`](./BATCH_11B_BRANCH_ADMIN_DASHBOARD.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Dedicated Account desktop | — | **STITCH_MISSING** (no MCP inventory pair) |
| Dedicated Account mobile | — | **STITCH_MISSING** |
| Supporting visual reference | BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` |
| Shell frame (unchanged) | `25-branch-admin-dashboard-desktop` / `mobile` | `001d1a0235a14f47b456bb092a012f7c` / `615f1f4eabd645c4a6840349edb17cd1` |

Composition follows Sacred Modernity + apex Account identity chrome (Batch 02 pattern) inside the completed Branch Admin shell.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/branch-admin/account.ejs` | Identity summary, role badge, church/branch context cards, account information list, CSRF logout |
| `public/blessboard/v5/branch-admin.css` | Account chrome (`?v=13`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-branch-admin-shell.test.js` | Account render + security/omission assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Account structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 58 Batch 11C note |
| `docs/gui/BATCH_11C_BRANCH_ADMIN_ACCOUNT.md` | This document |

**Unchanged:** Account route handler, auth gates, CSRF validation, logout POST behavior, sessions, branch scoping, Settings pages, dashboard content.

## 3. Account fields displayed

| Field | Source local | Surface |
|-------|--------------|---------|
| Display name | `displayName` | Identity heading + info list |
| Role badge / role | `roleLabel` | Badge + info list |
| Church | `churchDisplayName` | Context card + info list + lede |
| Branch | `branchDisplayName` | Context card + info list + lede |
| Initials avatar | Derived from `displayName` | Presentation only (no upload) |

## 4. Unsupported items omitted

- Profile editing / save forms
- Avatar upload
- Password change
- Notification settings
- Billing / plan surfaces
- Email (not in existing shell locals; not queried)
- Internal IDs, session tokens, CSRF secrets in copy, user status codes
- V4 “Account & security” password workflow

## 5. Security confirmation

- Route remains `GET /branch-admin/account` behind existing `gateAccess` (tenant role gate).
- Logout remains `POST /branch-admin/logout` with `_csrf`.
- No new queries; no IDs rendered.
- Tests assert absence of user/church/branch UUIDs and unsupported security UI.

## 6. Desktop / mobile

| Width | Behavior |
|-------|----------|
| 320px | Compact identity/context padding; overflow-wrap on names |
| 375–699px | Stacked context cards; stacked info rows |
| ≥700px | 2-col church/branch context; label/value info rows |
| ≥900px | Branch Admin shell sidebar (unchanged) |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:branch-admin-shell` | **12/12 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **43/43 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css` | **0 errors** (64 hex warnings only) |
| `git diff --check` | **clean** |

## 8. Remaining gaps

1. No dedicated Stitch Account desktop/mobile pair to match pixel-for-pixel.
2. Sign-in email not shown (not passed by shell locals; intentionally omitted vs inventing a query).
3. Settings page deferred (Batch 11D+).

## 9. Suggested commit message

```
Polish branch-admin account identity chrome without exposing session metadata.
```
