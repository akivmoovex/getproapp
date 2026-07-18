# Batch 22C — Shared media detail + archive confirmation

**Date:** 2026-07-18
**Scope:** Presentation for **asset detail** (side panel / mobile stack) and existing **soft-archive confirmation**. No replace, crop, rename, bulk-delete, or hard-delete. **Final regression:** completed 2026-07-19 — see [`V5_FULL_GUI_REGRESSION_AUDIT.md`](./V5_FULL_GUI_REGRESSION_AUDIT.md).
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 82), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_22B_MEDIA_UPLOAD.md`](./BATCH_22B_MEDIA_UPLOAD.md), Shared UI States Board `b61a1ea8176648408211b681e942e0a6`

## 1. Files changed

| Path | Change |
|------|--------|
| `public/blessboard/v5/media-picker.js` | Detail panel metadata + usage copy; archive confirm; inline archive errors |
| `public/blessboard/v5/media-picker.css` | Detail + confirm warning styles; mobile stack (`?v=6`) |
| `src/blessboard/http/contentAdminRoutes.js` | Archive CSRF returns JSON `{ ok:false, reason:"csrf" }` (same contract as upload) |
| Branch/HQ shell partials | `media-picker.css/js?v=6` |
| `tests/blessboard-media.test.js` | Detail UI; archive CSRF; cross-tenant archive 404; soft-archive / no in-use fabrication |
| `tests/blessboard-v5-a11y-structure.test.js` | Detail/confirm a11y + cache `?v=6` |
| `docs/gui/BATCH_22C_MEDIA_DETAIL.md` | This document |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 82 Batch 22C note |

**Unchanged:** church-scoped `UPDATE … AND church_id = $2`, soft-archive semantics (object retained), list DTO fields, storage adapters, schema.

**This pass:** Verified on branch `V5`. No further detail/confirm code edits required.

## 2. Stitch IDs

No dedicated media-detail Stitch pair. Chrome adapted from Shared UI States (modal, alert, metadata patterns).

| Role | Exact title | ID |
|------|-------------|-----|
| Reference | BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` |

Markers: `data-bb-media-detail`, `data-bb-media-lib-meta`, `data-bb-media-detail-archive`, `data-bb-media-archive-confirm`, `data-bb-media-archive-error`.

## 3. Metadata shown (list DTO only)

| Field | Source | UI label |
|-------|--------|----------|
| `originalFilename` | list/select | Filename |
| `mimeType` / `category` | list/select | Type |
| `sizeBytes` | list/select | Size (formatted) |
| `visibility` | list/select | Public / Private chip |
| `createdAt` | list/select | Added (locale datetime) |
| `deliveryPath` | list/select | Delivery (`/_bb/media/:id` style path only) |
| Preview | `previewPath` or `deliveryPath` | Image `<img>` or PDF preview link |

**Never shown:** `storageKey`, `storageBucket`, signed URLs, credentials, internal object paths.

**Usage copy:** Soft-archive removes library + public delivery while retaining the stored object for audit. Reference / dependency counts are **not** reported by this release (no fabricated in-use API).

## 4. Deletion safeguards

| Safeguard | Behaviour |
|-----------|-----------|
| Soft-archive only | `POST …/archive` sets `status=archived`; object not hard-deleted |
| Tenant scope | Archive `WHERE id AND church_id`; other church → `404 not_found` |
| CSRF | `_csrf` body + `X-CSRF-Token`; invalid → `403 csrf` |
| Confirmation | Modal lists church-only effects + retention; filename shown |
| In-use / dependency warnings | **Not supported by backend** — UI states this honestly; no fabricated blockers |
| Errors | Mapped safe messages in confirm (`role="alert"`); confirm disabled while posting |
| Absent features | No replace, crop, rename, bulk-delete, hard-delete UI |

## 5. Responsive layout

| Breakpoint | Layout |
|------------|--------|
| ≥700px | Grid + sticky detail aside |
| ≤699px | Single column; detail below library |
| ≤767px | Drawer-style picker dialog (existing) |
| ≤480px | Full-width archive action |

## 6. Tests

| Command | Result |
|---------|--------|
| `npm run test:blessboard:media` (detail UI, authorized archive, cross-tenant 404, soft-archive honesty, CSRF) | **21/21 pass** |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** |
| `npx stylelint public/blessboard/v5/media-picker.css` | **0 errors** (hex fallback warnings only) |
| `git diff --check` | **clean** |

## 7. Suggested commit message

```
Add media detail panel and soft-archive confirmation presentation.
```
