# Batch 08B — Member Dashboard

**Date:** 2026-07-18
**Scope:** Member `/member` dashboard presentation only. **Profile not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 26), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_08A_MEMBER_SHELL.md`](./BATCH_08A_MEMBER_SHELL.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Dashboard | `14-member-dashboard-desktop` | `4207a5a6a8ac4464b2b899695bbc7c78` |
| Mobile Dashboard | `14-member-dashboard-mobile` | `b315a9d1288b4454bcc37f79c25c5e10` |

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/member/dashboard.ejs` | Welcome hero, quick actions, events/ministries/announcements previews, empty states, module grid |
| `src/blessboard/http/memberPortalRoutes.js` | Soft-load existing list services for previews; quick-action model |
| `public/blessboard/v5/member-portal.css` | Dashboard chrome (`?v=10`) |
| `views/blessboard/v5/partials/member-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-member-portal.test.js` | Dashboard / empty-state / omitted-metric assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Dashboard structure assertions |
| `docs/gui/BATCH_08B_MEMBER_DASHBOARD.md` | This document |

**Unchanged:** auth gates, CSRF, sessions, service query shapes, Profile pages, unimplemented prayer/check-in/directory routes.

## 3. Data sources (existing V5 only)

| Surface | Source | Notes |
|---------|--------|-------|
| Welcome name / church / branch | Shell locals (`displayName`, tenant names) | No invented identity |
| Quick actions | Static implemented route list | Prayer disabled |
| Upcoming events preview | `listMemberEvents` (existing) | Upcoming `startsAt` only; max 3; no capacity/attendance counts |
| Ministries preview | `listMemberMinistries` (existing) | Max 3; membership badge only when present |
| Announcements preview | `listMemberAnnouncements` (existing, `limit: 3`) | Title/excerpt only; no unread count strip |
| Module cards | `PORTAL_MODULES` | Prayer remains disabled |

Service failures soft-fail to empty previews (dashboard still 200).

## 4. Quick actions

| Action | Href | Status |
|--------|------|--------|
| Giving | `/member/giving` | Enabled |
| Ministries | `/member/ministries` | Enabled |
| Events | `/member/events` | Enabled |
| Prayer request | — | Disabled (“Not enabled yet”) |

Hero CTAs: View events · Announcements.

## 5. Omitted Stitch metrics / actions

- Attendance / registered counts / spots remaining
- Fabricated unread announcement totals on the dashboard
- Check-in quick action
- Member Directory CTA
- View Calendar (events stay list)
- Notifications bell
- Prayer as a live route

## 6. Responsive status

| Width | Behavior |
|-------|----------|
| 320–374px | Stacked hero CTAs; 2-col quick actions; compact empty states |
| 375–699px | Same; hero gradient card |
| ≥700px | 4-col quick actions; 2-col ministry/announcement cards |
| ≥900px | Member shell sidebar; main padding from shell |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:member-portal` | **16/16 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **33/33 pass** |
| `npx stylelint public/blessboard/v5/member-portal.css` | **0 errors** |
| `git diff --check` | **clean** |

## 8. Suggested commit message

```
Polish member dashboard to Stitch layout using live previews only.
```
