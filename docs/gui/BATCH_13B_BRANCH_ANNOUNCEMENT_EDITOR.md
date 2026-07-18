# Batch 13B — Branch admin announcement create / edit

**Date:** 2026-07-18  
**Scope:** Branch Admin announcement **create and edit form presentation** (+ confirm-publish chrome). Preview detail polish not started. **Public Content overview started in Batch 13C.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 47), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_13A_BRANCH_ANNOUNCEMENTS_LIST.md`](./BATCH_13A_BRANCH_ANNOUNCEMENTS_LIST.md)

## 1. Canonical Stitch screen IDs

No dedicated create/edit Stitch pair exists. Canonical reference pair for announcements management:

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `35-branch-announcements-management-desktop` | `65941542c13048edb2c62bccd01ddcea` |
| Mobile | `35-branch-announcements-management-mobile` | `daa416025c704a5693b295ef3139af89` |
| Form states | BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` |

Marker: `data-bb-stitch-announcement-editor="35-branch-announcements-management"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/announcements/admin-form.ejs` | Sectioned editor: message, audience/placement, action link, attachments, Save draft vs Publish |
| `views/blessboard/v5/announcements/admin-publish.ejs` | Confirm-publish chrome only (existing fields/POST) |
| `public/blessboard/v5/branch-admin.css` | Editor layout (`?v=20`) |
| `public/blessboard/v5/hq-admin.css` | Shared editor styles (`?v=16`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-announcements.test.js` | Create/edit form markers + field preservation |
| `tests/blessboard-v5-a11y-structure.test.js` | Editor structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 47 Batch 13B note |
| `docs/gui/BATCH_13B_BRANCH_ANNOUNCEMENT_EDITOR.md` | This document |

**Unchanged:** `announcementAdminRoutes` handlers, `announcementsService` / repository queries, CSRF validation, audience parsing, media upload URL wiring, attachment auth via `/_bb/media/:id`.

## 3. Fields and actions preserved

| Control | Name / href | Notes |
|---------|-------------|-------|
| CSRF | `_csrf` | Required on POST |
| Optimistic lock (edit) | `expected_updated_at` | Existing |
| Title / body | `title`, `body` | Required |
| Audience | `audience_members`, `audience_admins` | Checkboxes |
| Pin / featured | `is_pinned`, `is_featured` | Checkboxes |
| Action link | `action_url`, `action_label` | Optional |
| Attach media | `media_asset_id` + media picker | Existing upload partial |
| Create Save draft | `status=draft` submit button | Distinct primary action |
| Create Publish… | `status=published` + `confirm_publish` | Confirmation required |
| Edit save | POST `basePath/:id` | Label: Save draft / Save changes |
| Edit publish | Link `basePath/:id/publish` | Separate confirm page |
| Confirm publish | POST `basePath/:id/publish` | `confirm_publish` required |
| Cancel / Preview | Existing links | |

## 4. Attachment behavior

| Behavior | Treatment |
|----------|-----------|
| Upload / attach | Existing media picker + `media_asset_id` on create/update POST |
| Download | Link to `/_bb/media/:mediaAssetId` (existing media authorization) |
| Delete | **Not exposed** — no V5 announcement attachment DELETE route; not invented |

## 5. Unsupported elements omitted

- Scheduling / publish-later
- Templates
- Delivery channels (email/SMS/push)
- Analytics / engagement metrics on the editor
- Bulk tools
- Hard delete
- Attachment delete UI (no route)

## 6. Responsive status

| Viewport | Behavior |
|----------|----------|
| `≥960px` | Form + sticky member preview side panel |
| `<900px` | Stacked sections; full-width action buttons; preview above form |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:announcements` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **50/50 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Remaining gaps

1. Member preview page (`admin-preview.ejs`) Stitch polish deferred.
2. Detail page polish deferred.
3. No dedicated Stitch create/edit frames — adapted from management pair + Shared UI States.

## 9. Suggested commit message

```
Polish branch-admin announcement create and edit form presentation.
```
