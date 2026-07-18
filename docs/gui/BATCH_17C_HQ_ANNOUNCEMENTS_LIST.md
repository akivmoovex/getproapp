# Batch 17C — HQ Announcements list & delivery overview

**Date:** 2026-07-18  
**Scope:** HQ Admin `/hq/announcements` (and branch-scoped `/hq/announcements/b/:key`) **list presentation + delivery overview only**. **Announcement editing not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 71), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_17B_HQ_REGISTRATIONS.md`](./BATCH_17B_HQ_REGISTRATIONS.md), [`BATCH_13A_BRANCH_ANNOUNCEMENTS_LIST.md`](./BATCH_13A_BRANCH_ANNOUNCEMENTS_LIST.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `61-hq-broadcast-center-desktop` | `ffa76443af8c4aa4ab97086fc8922b73` |
| Mobile | `61-hq-broadcast-center-mobile` | `b4184b738eca442d8ca9ff3dbd445bec` |

Marker: `data-bb-stitch-announcements="61-hq-broadcast-center"` (plus `data-bb-hq-announcements="1"`).

Branch-admin mount of the same template keeps Stitch 35 (`35-branch-announcements-management`).

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/announcements/admin-list.ejs` | HQ Stitch 61 chrome; delivery overview note; HQ-only delivery column/cards from real `item.delivery` |
| `public/blessboard/v5/hq-admin.css` | Delivery overview styles (`?v=34`) |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-announcements.test.js` | HQ list markers, search/no-results, members vs admins delivery rendering |
| `tests/blessboard-v5-a11y-structure.test.js` | HQ announcements structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 71 Batch 17C note |
| `docs/gui/BATCH_17C_HQ_ANNOUNCEMENTS_LIST.md` | This document |

**Unchanged:** `listAdminAnnouncements` / routes, create/edit/preview/publish forms, CSRF, church/branch scoping, query params (`q`, `status`, `audience`, `page`), attachment auth rules, branch-admin list (no delivery column).

## 3. Fields and statuses displayed

| Field | Source | Notes |
|-------|--------|-------|
| Title | `item.title` | Link to detail |
| Message snippet | `item.body` | Truncated |
| Audience | `item.audiences` | Members / Admins |
| Source | `item.branchId` | Branch vs Church-wide |
| Published | `item.publishedAt` | When present |
| Status | `item.status` | draft / published / archived |
| Pinned / Featured | `item.isPinned`, `item.isFeatured` | Chips when true |
| Attachment count | `item.attachments.length` | Real count only |
| List total | `total` | Live filtered total |

## 4. Metrics displayed (HQ only)

| Metric | Source | When |
|--------|--------|------|
| Eligible members | `item.delivery.eligibleCount` | Members audience targeted |
| Read | `item.delivery.readCount` | Same |
| Unread | `item.delivery.unreadCount` | Same |

Shown as `data-bb-delivery="row"` with `data-bb-eligible` / `data-bb-read` / `data-bb-unread`. Detail page retains full delivery summary.

## 5. Unavailable metrics omitted

- Delivery / read **percentages**
- Branch reach / engagement scores
- Fabricated “Active Today”, “Total Views”, insight cards
- SMS, email, WhatsApp, or other broadcast channels
- Delivery column on **branch-admin** list (unchanged)

When members audience is not targeted: `data-bb-delivery="unavailable"` (em dash / note) — no invented counts.

## 6. Filters and actions preserved

| Control | Behavior |
|---------|----------|
| Search / status / audience / pagination | Existing query params |
| Create announcement | Existing CTA → `/new` (editor polish not this batch) |
| Open | Detail link |
| Branch scopes panel | Church-wide HQ list → `/hq/announcements/b/:key` |

## 7. Empty states

| State | Marker |
|-------|--------|
| Catalog empty | `data-bb-ann-empty="catalog"` |
| No results | `data-bb-ann-empty="no-results"` |

## 8. Verification

- `node --test tests/blessboard-announcements.test.js`
- `node --test tests/blessboard-v5-a11y-structure.test.js`
- stylelint on changed CSS only
- `git diff --check`

## 9. Suggested commit message

```
feat(gui): HQ announcements list and delivery overview (Batch 17C)

Match /hq/announcements to Stitch 61 broadcast-center chrome with real
eligible/read/unread counts when members are targeted. No fabricated
percentages or new channels. Editing unchanged.
```
