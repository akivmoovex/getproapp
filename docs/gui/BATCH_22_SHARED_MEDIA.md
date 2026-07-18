# Batch 22 — Shared media picker / upload

**Date:** 2026-07-18  
**Scope:** Visual and accessibility polish for the shared media library dialog used by branch and HQ content admin. **No storage, schema, validation, or authorization changes.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 82), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), backlog Batch 12, Shared UI States Board `b61a1ea8176648408211b681e942e0a6`

## 1. Canonical Stitch screen IDs

No dedicated media-picker Stitch desktop/mobile pair. Chrome adapted from Shared UI States.

| Role | Exact title | ID |
|------|-------------|-----|
| Reference | BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` |

Markers: `data-bb-stitch-media="shared-ui-states"`, `data-bb-media-picker="1"`, `data-bb-media-picker-dialog="1"`.

## 2. Files changed

| Path | Change |
|------|--------|
| `public/blessboard/v5/media-picker.js` | Focus trap/restore; `aria-modal`; tablist/tabpanel; library loading/empty; keyboard option select; stitch marker |
| `public/blessboard/v5/media-picker.css` | Sacred Modernity tokens; empty/loading; touch targets; 480px stack; cache `?v=3` |
| `views/blessboard/v5/content-admin/media-upload.ejs` | Stitch marker; `aria-haspopup="dialog"` |
| `views/blessboard/v5/partials/branch-admin-shell-*.ejs` | CSS/JS cache bump to v3 |
| `views/blessboard/v5/partials/hq-shell-*.ejs` | CSS/JS cache bump to v3 |
| `tests/blessboard-v5-a11y-structure.test.js` | Media a11y contracts expanded |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 82 Batch 22 note |
| `docs/gui/STITCH_IMPLEMENTATION_BACKLOG.md` | Batch 12 acceptance checked |
| `docs/gui/BATCH_22_SHARED_MEDIA.md` | This document |

**Unchanged:** `src/blessboard/media/*`, upload routes, multer limits, MIME/magic-byte validation, tenant scoping, storage adapters, public delivery rules, database schema.

## 3. Behaviour preserved

| Concern | Status |
|---------|--------|
| CSRF on upload + archive | Unchanged (`_csrf` + `X-CSRF-Token`) |
| Client allowlist (JPEG/PNG/WebP/GIF/PDF; SVG rejected) | Unchanged; server remains authoritative |
| Size limits (5 MiB image / 15 MiB PDF) | Unchanged |
| Visibility public/private from trigger | Unchanged |
| Fill field `deliveryPath` / `assetId` | Unchanged |
| List/upload/archive endpoints | Same URLs and JSON shapes |
| No storage credentials in client | Asserted in a11y structure test |

## 4. A11y / visual polish

| Item | Detail |
|------|--------|
| Dialog | Native `<dialog>` + `role="dialog"` + `aria-modal` + labelled title/description |
| Focus | Opens to close control; Escape/Cancel restores to trigger; Tab cycles inside dialog |
| Tabs | `role="tablist"` / `tab` / `tabpanel` with `aria-controls`; arrow keys move tabs |
| Library | `listbox` + `option`; Enter/Space select; loading + empty states |
| Archive confirm | Labelled modal; focus to Cancel; returns focus on dismiss |
| Tokens | `--bb-color-*`, `--bb-radius`, `--bb-control-h`, `--bb-touch-min` |
| Responsive | Library actions stack ≤480px; full-width foot buttons on narrow |

## 5. Omitted

New storage providers, CDN URLs, schema columns, bulk upload, image editing, Stitch-invented media browser chrome, fabricated library metrics.

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:media` | **15/15 pass** |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** |
| `npx stylelint public/blessboard/v5/media-picker.css` | **0 errors** (hex fallback warnings only) |
| `git diff --check` (changed files) | **clean** |

## 7. Suggested commit message

```
Polish shared media picker and upload UI for admin content flows.
```
