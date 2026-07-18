# Batch 09C — My Ministries

**Date:** 2026-07-18
**Scope:** Member `/member/ministries` list + detail presentation only. **Resources not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 30), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_09B_MEMBER_EVENTS.md`](./BATCH_09B_MEMBER_EVENTS.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop My Ministries | `18-member-my-ministries-desktop` | `05f9bdca09fd456595a15b963be8092a` |
| Mobile My Ministries | `18-member-my-ministries-mobile` | `53924d7ece3e46e79d84556e56335b6e` |

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/participation/member-ministries.ejs` | Filters, My/Pending/Discover sections, empty states |
| `views/blessboard/v5/participation/partials/member-ministry-card.ejs` | Shared card (status, meeting day, CTAs) |
| `views/blessboard/v5/participation/member-ministry-detail.ejs` | Stitch marker (join/leave/CSRF unchanged) |
| `src/blessboard/http/participationMemberRoutes.js` | Presentation filter/search partition |
| `public/blessboard/v5/member-portal.css` | Ministry grid / pending chrome (`?v=14`) |
| `views/blessboard/v5/partials/member-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-participation.test.js` | Membership/pending GUI assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Ministries structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 30 note (Batch 09C) |
| `docs/gui/BATCH_09C_MEMBER_MINISTRIES.md` | This document |

**Unchanged:** `listMemberMinistries` / `joinMinistry` / `leaveMinistry`, open vs request join policy, CSRF, branch visibility.

## 3. Membership states

| State | Source | UI |
|-------|--------|-----|
| Active | `membership.status === 'active'` | My ministries + Active chip |
| Pending | `membership.status === 'pending'` | Pending requests + Pending chip + review hint |
| None | No open membership | Discover + Open / Request chip from `joinPolicy` |

Filters: `all` | `mine` | `pending` | `discover`. Search `q` over name / summary / meeting day (visible set only).

Active/pending header counts come from the full authorized catalog (not invented).

## 4. Unsupported Stitch elements omitted

- Fabricated leaders / “Ministry Lead” names
- Member counts, “Hours Monthly”, “Member Rating”
- Upcoming assignments / duty roster
- Ministry chat / Message Group / Roster actions
- “View All 24 Ministries” fabricated totals
- Urgent Need / skill-level badges without schema

Real fields used: `name`, `summary`, `description`, `meetingDay`, `contactEmail` (detail), `joinPolicy`, membership status.

## 5. Join / leave behavior (preserved)

| Action | Route | Notes |
|--------|-------|-------|
| Join / request | `POST /member/ministries/:id/join` | Open → active; request → pending |
| Leave / cancel request | `POST …/leave` + confirm modal | CSRF required |
| List | Links to detail only | No list POST |

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:participation` | **11/11 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **37/37 pass** |
| `npx stylelint public/blessboard/v5/member-portal.css` | **0 errors** |
| `git diff --check` | **clean** |

## 7. Suggested commit message

```
Polish member ministries with joined, pending, and discover states.
```
