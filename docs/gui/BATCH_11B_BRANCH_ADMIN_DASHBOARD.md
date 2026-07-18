# Batch 11B — Branch admin dashboard content

**Date:** 2026-07-18  
**Scope:** Branch Admin `/branch-admin` dashboard presentation only. **Account, Settings, Registrations, Members not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 37), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_11A_BRANCH_ADMIN_SHELL.md`](./BATCH_11A_BRANCH_ADMIN_SHELL.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Dashboard | `25-branch-admin-dashboard-desktop` | `001d1a0235a14f47b456bb092a012f7c` |
| Mobile Dashboard | `25-branch-admin-dashboard-mobile` | `615f1f4eabd645c4a6840349edb17cd1` |

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/branch-admin/dashboard.ejs` | Stitch heading, unavailable summary cards, notices, quick actions, recent activity / open requests empty states, module grid |
| `public/blessboard/v5/branch-admin.css` | Dashboard layout/chrome (`?v=12`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-branch-admin-shell.test.js` | Dashboard section + no-fabrication assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Dashboard structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Orders 37 / 93 Batch 11B notes |
| `docs/gui/BATCH_11B_BRANCH_ADMIN_DASHBOARD.md` | This document |

**Unchanged:** dashboard route handler, auth gates, CSRF, sessions, branch scoping, queries, shell chrome (aside from CSS bump), Account / Settings / Registrations / Members pages.

## 3. Data locals used (existing shell only)

| Local | Use |
|-------|-----|
| `displayName` | Greeting first name (desktop) |
| `churchDisplayName` / `branchDisplayName` | Lede + mobile branch badge |
| `roleLabel` | Signed-in role line |
| `portalModules` | Branch module card grid (`BRANCH_ADMIN_MODULES`) |

No new controller locals, metrics services, or dashboard queries.

## 4. Metrics shown

| Card | Value shown | Notes |
|------|-------------|-------|
| Pending verifications (desktop) | `—` unavailable | Links to `/branch-admin/registrations` |
| Active members | `—` unavailable | Links to `/branch-admin/members` |
| Upcoming events (desktop) | `—` unavailable | Links to `/branch-admin/content/events` |
| Avg attendance (mobile) | `—` unavailable | Links to `/branch-admin/attendance` |
| Report status (desktop) | `—` unavailable | Disabled — no reports route |

## 5. Stitch metrics / panels omitted

- Fabricated counts (12 / 1,248 / 1,284 / 3 / 92% / 84%)
- Growth deltas (+4.2%, +12% vs last month)
- Ministry Budget Status / USD totals / progress ring
- Branch Location map + head-of-branch / established / volunteers
- Fabricated recent activity rows
- Urgent request badges and sample request cards
- Search bar, notification bell, FAB, “View All” / “Open Roadmap”
- Reports as a live destination

## 6. Quick-action routes

### Desktop (purple panel)

| Action | Href |
|--------|------|
| Verify members | `/branch-admin/registrations` |
| Add announcement | `/branch-admin/announcements/new` |
| Record attendance | `/branch-admin/attendance` |
| Manage events | `/branch-admin/content/events` |

### Mobile (icon row)

| Action | Href |
|--------|------|
| Members | `/branch-admin/members` |
| Schedule | `/branch-admin/content/events` |
| Giving | `/branch-admin/giving` |
| Broadcast | `/branch-admin/announcements` |

Hero CTA (desktop): Review queue → `/branch-admin/registrations`.  
Open requests empty CTA → `/branch-admin/requests`.

## 7. Desktop / mobile differences

| Width | Behavior |
|-------|----------|
| 320px | Overflow guards; compact stats/quick-action labels; badge ellipsis |
| 375–899px | Daily Pulse + branch badge; 2-col unavailable stats (members + attendance); mobile quick icons; stacked panels |
| ≥900px | Greeting headline; 4-col stats; two-column layout with purple quick-actions aside; pulse/mobile quick icons hidden |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:branch-admin-shell` | **12/12 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **42/42 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css` | **0 errors** (61 hex warnings only) |
| `git diff --check` | **clean** |

## 9. Remaining gaps

1. Summary cards remain unavailable until a future batch wires **existing** list/count services without inventing Stitch sample numbers.
2. Recent activity / notices have no V5 dashboard feed — empty states only.
3. Report status stays disabled (no `/branch-admin/reports`).
4. Ministry budget and branch map remain out of scope (no supporting data on this route).
5. Account / Settings / Registrations / Members page chrome deferred to later batches.

## 10. Suggested commit message

```
Polish branch-admin dashboard to Stitch layout without inventing metrics.
```
