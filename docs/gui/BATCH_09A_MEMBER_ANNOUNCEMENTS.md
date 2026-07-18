# Batch 09A — Member Announcements

**Date:** 2026-07-18
**Scope:** Member `/member/announcements` list + detail presentation only. **Events not started.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 28), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_08C_MEMBER_PROFILE.md`](./BATCH_08C_MEMBER_PROFILE.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Announcements | `16-member-announcements-desktop` | `63a9e6139ffd41f19b6b6d2f090f0199` |
| Mobile Announcements | `16-member-announcements-mobile` | `d7074e7cfd7048c98abb960826673c01` |

Detail has **no dedicated Stitch pair**; presentation follows list hierarchy (chips, body, action, attachments, mark-read).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/announcements/member-list.ejs` | Filters, search, featured/pinned/unread, empty + no-results |
| `views/blessboard/v5/announcements/member-detail.ejs` | Detail chrome; attachment render guards; action link preserved |
| `src/blessboard/http/announcementMemberRoutes.js` | Presentation filter/search over already-visible items |
| `public/blessboard/v5/member-portal.css` | Announcement toolbar/list/detail (`?v=12`) |
| `views/blessboard/v5/partials/member-shell-start.ejs` | CSS cache bump only |
| `tests/blessboard-announcements.test.js` | GUI filter / no-results / anti-metric assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Announcements structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 28 note (Batch 09A) |
| `docs/gui/BATCH_09A_MEMBER_ANNOUNCEMENTS.md` | This document |

**Unchanged:** audience SQL (`members` only), read-tracking service, mark-read CSRF POST, attachment media join, media public delivery auth at `/_bb/media/:id`.

## 3. Data behavior

| Concern | Behavior |
|---------|----------|
| Source | `listMemberAnnouncements` / `getMemberAnnouncement` — published + `audience_key=members` + branch scope |
| Unread count | Counted from full authorized list (not invented delivery totals) |
| Filters | `?filter=all\|unread\|pinned\|featured` over visible items only |
| Search | `?q=` substring on title/body of already-visible items (max 100 chars) |
| Featured strip | Shown when filter is `all` and no `q`; uses real `isFeatured` |
| Pagination | Repo limit/offset unchanged; **no** fabricated “Showing X of Y” UI |
| Omitted Stitch | Branch/HQ/Major Event category tabs, activity tables, delivery rate widgets |

## 4. Attachment handling

| Rule | Implementation |
|------|----------------|
| Render only when valid | UUID `mediaAssetId` + `mediaStatus` absent or `active` |
| Link | `/_bb/media/:mediaAssetId` (existing public media route; tenant + public visibility enforced server-side) |
| Unauthorized / inactive | Omitted from detail HTML |
| Action links | Still require both `actionUrl` and `actionLabel`; `rel="noopener noreferrer"` + `target="_blank"` |

## 5. Responsive status

| Width | Behavior |
|-------|----------|
| ≤699px | Horizontal filter scroll; search submit full-width; stacked cards |
| ≥900px | Toolbar row (filters + search); multi-column featured cards |

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:announcements` | **16/16 pass** (audience, read/unread, attachments, route/render, CSRF) |
| `npm run test:blessboard:a11y-structure` | **35/35 pass** |
| `npx stylelint public/blessboard/v5/member-portal.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 7. Suggested commit message

```
Polish member announcements list and detail to Stitch layout.
```
