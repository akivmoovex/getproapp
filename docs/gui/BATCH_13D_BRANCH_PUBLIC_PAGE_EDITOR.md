# Batch 13D — Branch admin public page editor

**Date:** 2026-07-18  
**Scope:** Branch Admin (shared content-admin) **public page + section editor presentation only**. Ministries/events entity editors not started.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 46), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_13C_BRANCH_PUBLIC_CONTENT_OVERVIEW.md`](./BATCH_13C_BRANCH_PUBLIC_CONTENT_OVERVIEW.md)

## 1. Canonical Stitch screen IDs

No dedicated page-editor Stitch pair exists. Canonical reference pair remains the website editor frames:

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop | `34-branch-website-editor-desktop` | `3f3160664d91423d80cb4ba81e2af6c4` |
| Mobile | `34-branch-website-editor-mobile` | `f2bb5e794f074a1aa3d248a2fe54ddeb` |

Markers: `data-bb-stitch-page-editor="34-branch-website-editor"`, `data-bb-stitch-section-editor="34-branch-website-editor"`.

Stitch shows a full website builder; V5 implements the **existing page/section forms** with editor chrome (settings, section cards, publish confirm) — not the builder canvas.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/content-admin/page.ejs` | Page settings form, section cards, add-section form, publish confirm, preview |
| `views/blessboard/v5/content-admin/section.ejs` | Section content/media/status editor with publish confirm |
| `public/blessboard/v5/branch-admin.css` | Page/section editor layout (`?v=22`) |
| `public/blessboard/v5/hq-admin.css` | Shared editor styles (`?v=18`) |
| `views/blessboard/v5/partials/branch-admin-shell-start.ejs` | CSS cache bump |
| `views/blessboard/v5/partials/hq-shell-start.ejs` | CSS cache bump |
| `tests/blessboard-content-admin.test.js` | Page/section editor markers + field presence |
| `tests/blessboard-v5-a11y-structure.test.js` | Editor structure assertions; shell `?v=22` / `?v=18` |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 46 Batch 13D note |
| `docs/gui/BATCH_13D_BRANCH_PUBLIC_PAGE_EDITOR.md` | This document |

**Unchanged:** `contentAdminRoutes` handlers, page/section services, CSRF, optimistic concurrency, publish confirmation, media upload endpoints, scoping/authz.

## 3. Supported fields (preserved)

### Page save — `POST …/pages/:pageKey`

| Control | Name | Notes |
|---------|------|-------|
| CSRF | `_csrf` | Required |
| Optimistic lock | `expected_updated_at` | Existing |
| Title | `title` | Required |
| Status | `status` | `draft` / `published` / `archived` |
| Publish confirm | `confirm_publish` | Required when status is `published` |

### Add section — `POST …/pages/:pageKey/sections`

| Control | Name | Notes |
|---------|------|-------|
| CSRF | `_csrf` | Required |
| Key / type | `section_key`, `section_type` | Supported keys only (e.g. `text`, `image`) |
| Content | `heading`, `body_text` | Plain text |
| Media | `media_url` | HTTPS or uploaded URL via existing media picker |
| Order / status | `sort_order`, `status` | Existing |
| Publish confirm | `confirm_publish` | When creating as published |

### Edit section — `POST …/pages/:pageKey/sections/:sectionKey`

Same content fields as create, plus `expected_updated_at` and `confirm_publish` on publish.

Media controls use the existing `media-upload` partial (`visibility: 'public'`) — only where `media_url` is already supported.

## 4. Omitted editor functions (Stitch / product)

| Omitted | Reason |
|---------|--------|
| Drag-and-drop reorder | Not in V5 routes |
| Live / WYSIWYG editing | Not supported |
| Custom HTML | Not supported |
| Theme / branding / SEO / domain | Not in V5 product |
| Unsupported widgets | Only plain section types |
| Hard delete sections | Archive only (existing) |
| Ministries / events entity editors | Explicitly out of scope for 13D |

## 5. Publication behavior

- Draft remains private; published requires `confirm_publish=1` (unchanged backend).
- UI shows confirm checkbox when status select is `published` (client-side required attribute; server still enforces).
- Preview uses existing `…/preview/:pageKey`.

## 6. Responsive status

| Viewport | Behavior |
|----------|----------|
| `≥960px` | Page settings + sticky publication aside |
| `≥700px` | Two-column section cards; two-column field grids |
| `<700px` | Stacked layout; full-width actions |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:content-admin` | **11/11 pass** |
| `npm run test:blessboard:a11y-structure` | **52/52 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Remaining gaps

1. Ministries / events entity list + field editors still PLACEHOLDER (not started).
2. Stitch builder canvas / theme chrome remains unavailable by design.
3. Preview page polish deferred.

## 9. Suggested commit message

```
Polish branch-admin public page and section editor presentation.
```
