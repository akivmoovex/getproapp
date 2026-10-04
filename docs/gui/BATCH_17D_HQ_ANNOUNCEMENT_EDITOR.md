# Batch 17D — HQ announcement create / edit presentation (historical implementation note)

**Date:** 2026-07-18 · **V2.07 reconciliation:** 2026-10-04
**Scope:** HQ Admin announcement **create and edit form presentation** (+ confirm-publish chrome). **Content admin not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 71), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_17C_HQ_ANNOUNCEMENTS_LIST.md`](./BATCH_17C_HQ_ANNOUNCEMENTS_LIST.md), [`BATCH_13B_BRANCH_ANNOUNCEMENT_EDITOR.md`](./BATCH_13B_BRANCH_ANNOUNCEMENT_EDITOR.md)

## 1. Canonical Stitch screen IDs

V2.07 canonical HQ create/edit pair:

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `70-hq-create-announcement-desktop` | Stitch project `4931965034209316203` |
| Mobile | `70-hq-create-announcement-mobile` | Stitch project `4931965034209316203` |
| Form states | BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` |

Markers:
- Form: Screen 70 marker (+ `data-bb-hq-announcement-editor="1"`)
- Publish: no dedicated Stitch publish-confirmation pair; use Screen 70 as the editor reference

Branch-admin mount keeps Stitch 35.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/announcements/admin-form.ejs` | HQ Stitch 70 chrome, scope panel, audience estimate when delivery present |
| `views/blessboard/v5/announcements/admin-publish.ejs` | HQ Stitch 72 confirm-publish + scope/estimate markers |
| `src/blessboard/http/announcementAdminRoutes.js` | Pass existing scope locals into form/publish only (`editorScopeExtras`) — no service changes |
| `public/blessboard/v5/hq-admin.css` | Editor scope styles (`?v=35`) |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-announcements.test.js` | HQ create/edit/publish presentation + estimate assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | HQ editor structure + CSS version |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 71 Batch 17D note |
| `docs/gui/BATCH_17D_HQ_ANNOUNCEMENT_EDITOR.md` | This document |

**Unchanged:** `announcementsService` / repository, CSRF validation, audience parsing, media upload URL wiring, attachment auth via `/_bb/media/:id`, POST targets, publish confirmation rules.

## 3. Controls preserved

| Control | Name / href | Notes |
|---------|-------------|-------|
| CSRF | `_csrf` | Required on POST |
| Optimistic lock (edit) | `expected_updated_at` | Existing |
| Title / body | `title`, `body` | Required |
| Audience | `audience_members`, `audience_admins` | Checkboxes |
| Pin / featured | `is_pinned`, `is_featured` | Checkboxes |
| Action link | `action_url`, `action_label` | Optional |
| Attach media | `media_asset_id` + media picker | Existing upload partial |
| Create Save draft | `status=draft` | Distinct primary action |
| Create Publish… | `status=published` + `confirm_publish` | Confirmation required |
| Edit save | POST `basePath/:id` | Save draft / Save changes |
| Edit publish | Link `basePath/:id/publish` | Separate confirm page |
| Confirm publish | POST `basePath/:id/publish` | `confirm_publish` required |
| Audience estimate | `item.delivery.eligibleCount` | Edit hint + publish review when present |
| Scope panel (HQ) | `data-bb-ann-scope-panel` | Church-wide vs branch from existing route scope |

## 4. Unsupported channels omitted

- Scheduling / publish-later
- Templates
- SMS / WhatsApp / email / push delivery channels
- Fabricated engagement analytics on the editor
- Attachment delete UI (no V5 route)
- Hard delete

## 5. Responsive status

| Viewport | Behavior |
|----------|----------|
| `≥960px` | Form + sticky member preview side panel |
| `<900px` | Stacked sections; full-width action buttons; preview above form |

## 6. Verification

- `node --test tests/blessboard-announcements.test.js`
- `node --test tests/blessboard-v5-a11y-structure.test.js`
- stylelint on changed CSS only
- `git diff --check`

## 7. Suggested commit message

```
feat(gui): HQ announcement create/edit Stitch presentation (Batch 17D)

Match HQ announcement editor and confirm-publish chrome to Stitch 70 with
scope panel and real eligible-member estimates. No new channels or service
logic. Content admin unchanged.
```
