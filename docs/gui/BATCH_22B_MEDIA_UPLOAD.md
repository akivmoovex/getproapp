# Batch 22B — Shared media upload presentation

**Date:** 2026-07-18
**Scope:** Presentation-only polish for the existing media **upload** tab (drop zone, file ready state, progress, success/error). **Media detail not started.** No route/validation/storage/schema changes.
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 82), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_22A_MEDIA_PICKER.md`](./BATCH_22A_MEDIA_PICKER.md), Shared UI States Board `b61a1ea8176648408211b681e942e0a6`

## 1. Files changed

| Path | Change |
|------|--------|
| `public/blessboard/v5/media-picker.js` | Upload drop/file/progress/success/error UI; safe reason map; drop-state machine; CSRF field unchanged |
| `public/blessboard/v5/media-picker.css` | Upload states + file chip (shell cache currently `?v=6`) |
| Branch/HQ shell partials | `media-picker.css/js` cache |
| `tests/blessboard-media.test.js` | Valid upload, MIME/SVG/size reject, CSRF, cross-tenant, safe UI copy |
| `tests/blessboard-v5-a11y-structure.test.js` | Upload error/success a11y markers |
| `docs/gui/BATCH_22B_MEDIA_UPLOAD.md` | This document |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 82 Batch 22B note |

**Unchanged:** upload route, multer field `file`, `_csrf` / `X-CSRF-Token`, visibility body field, MIME/extension/size server validation, storage adapters, metadata schema. Detail/archive UI not modified in this batch.

**This pass:** Verified on branch `V5`. No further upload-presentation code edits required.

## 2. Stitch IDs

No dedicated upload Stitch pair. Chrome adapted from Shared UI States (buttons, form error, success/feedback patterns).

| Role | Exact title | ID |
|------|-------------|-----|
| Reference | BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` |

Markers: `data-bb-media-panel="upload"`, `data-bb-media-drop`, `data-bb-media-drop-state`, `data-bb-media-progress`, `data-bb-media-success`, `data-bb-media-error`.

## 3. Accepted files (unchanged policy)

| Kind | MIME / extension | Max size |
|------|------------------|----------|
| Image | JPEG (`.jpg`/`.jpeg`), PNG, WebP, GIF | 5 MiB |
| Document | PDF (`.pdf`) | 15 MiB |
| Rejected | SVG and all other types | — |

Client allowlist mirrors server; magic-byte checks remain authoritative on the server.

## 4. Validation / state behaviour (presentation)

| State | UI |
|-------|-----|
| Idle | Dashed drop zone + accepted-type list + Choose file |
| Drag-over | Primary soft fill |
| Ready | Solid primary border; file chip + local preview; Upload enabled |
| Client reject | Error alert (`role="alert"` + `aria-live="assertive"`); Upload stays disabled |
| Uploading | Progress bar; drop zone muted; aria-busy |
| Success | Success banner; then existing selection apply (dialog closes) |
| Server error | Safe mapped message; cleanup warning style when `cleanup=removed` |

Unknown server reasons map to **“Upload failed. Please try again.”** — raw reason keys and storage paths are never shown.

## 5. Security confirmation

| Check | Status |
|-------|--------|
| Route / field name `file` | Preserved |
| CSRF `_csrf` + `X-CSRF-Token` | Preserved; 403 CSRF covered |
| Authorization / tenant scope | Unchanged; cross-tenant upload still 403 |
| MIME / extension / size / signature | Unchanged (server authoritative) |
| No storage paths / credentials in UI | Asserted |
| No crop / compress / remote URL / bulk | Asserted absent |
| No media detail work | Detail/archive presentation left for Batch 22C |

## 6. Tests

| Command | Result |
|---------|--------|
| `npm run test:blessboard:media` (valid upload, MIME/SVG/size reject, cross-tenant, CSRF, safe UI) | **21/21 pass** |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** |
| `npx stylelint public/blessboard/v5/media-picker.css` | **0 errors** (hex fallback warnings only) |
| `git diff --check` | **clean** |

## 7. Suggested commit message

```
Polish media upload drop zone, progress, and safe error states.
```
