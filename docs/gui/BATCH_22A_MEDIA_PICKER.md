# Batch 22A — Shared media picker interface

**Date:** 2026-07-18
**Scope:** Library picker UI only — list/grid, client search/type filter, selection, image preview, empty states, responsive drawer, keyboard/focus. **Upload not started in this batch.**
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 82), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`PLATFORM_ADMIN_PARITY_AUDIT.md`](./PLATFORM_ADMIN_PARITY_AUDIT.md), Shared UI States Board `b61a1ea8176648408211b681e942e0a6`

## 1. Files changed

| Path | Change |
|------|--------|
| `public/blessboard/v5/media-picker.js` | Library-first open; grid; filename search + type filter; selection restore; preview; listbox keyboard; DS focus reuse |
| `public/blessboard/v5/media-picker.css` | Grid/toolbar/preview/drawer (shell cache currently `?v=6` with later batches) |
| `public/blessboard/v5/design-system.js` | Export `BlessBoardDesignSystem.focusable` + `trapTabKey` |
| `views/blessboard/v5/partials/branch-admin-shell-*.ejs` | media-picker + design-system cache |
| `views/blessboard/v5/partials/hq-shell-*.ejs` | Same cache bumps |
| `tests/blessboard-v5-a11y-structure.test.js` | Picker library/focus contracts |
| `tests/blessboard-media.test.js` | Selection fill + empty + no stock search + tenant scope |
| `tests/blessboard-design-system.test.js` | Exported focus helpers |
| `docs/gui/BATCH_22A_MEDIA_PICKER.md` | This document |

**Unchanged:** `src/blessboard/media/*`, list/upload/archive route authz, multer, MIME validation, storage adapters, schema, public delivery. Upload tab presentation not modified in this batch.

**This pass:** Verified on branch `V5`. No further picker code edits required.

## 2. Stitch IDs

No dedicated media-picker Stitch desktop/mobile pair. Chrome adapted from Shared UI States + existing modal shell.

| Role | Exact title | ID |
|------|-------------|-----|
| Reference | BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` |

Markers: `data-bb-stitch-media="shared-ui-states"`, `data-bb-media-picker-dialog="1"`, `data-bb-media-library`, `data-bb-media-lib-preview`.

## 3. Selection behavior

| Step | Behaviour |
|------|-----------|
| Open | Dialog opens on **Library** tab (picker-first) |
| Load | `GET …/media?visibility={trigger}&limit=50` — church-scoped active assets only |
| Filter | Client-side filename search + All/Images/Documents (existing `category` from MIME) |
| Select | Click / Space / arrows set `aria-selected` + side preview |
| Confirm | **Use selected** or Enter/double-click writes target field |
| Fill | `data-fill="deliveryPath"` (default) → `/_bb/media/:id`; `assetId` → UUID |
| Restore | If target already has a value, matching library row is pre-selected |
| Cancel / Escape | Closes; focus returns to opener; form value unchanged |

## 4. Security confirmation

| Check | Status |
|-------|--------|
| Tenant/church scoping via existing list endpoint | Preserved (`churchId` from scope) |
| Cross-tenant list denied | Covered by media HTTP tests |
| No fabricated library rows | Only JSON `assets` from authorized list |
| No stock-image / external search | Asserted absent (`unsplash` / `pexels` / `stock`) |
| No storage credentials in client | List omits keys/buckets |
| Selection values unchanged | Same `deliveryPath` / `assetId` contract |
| Branch/HQ mounts preserved | Existing content-admin routes |

## 5. Empty / responsive / keyboard

| Concern | Detail |
|---------|--------|
| Empty library | “No church-owned files for this visibility.” |
| No filter matches | “No matching assets” + clear guidance |
| Loading | Spinner status region |
| Desktop ≥700 | 3-col grid + sticky preview |
| Mobile ≤767 | Bottom drawer-style dialog (`bb-media-picker-dialog--drawer`) |
| Focus | Reuses `BlessBoardDesignSystem.trapTabKey` / `focusable`; Escape closes; restore to opener |
| Listbox | Arrow/Home/End move selection; Enter applies |

## 6. Tests

| Command | Result |
|---------|--------|
| `npm run test:blessboard:media` (visibility, tenant-scope, selection fill, empty, no stock) | **21/21 pass** |
| `npm run test:blessboard:a11y-structure` (library grid/filter/keyboard/focus) | **83/83 pass** |
| `npm run test:blessboard:design-system` | **8/8 pass** |
| `npx stylelint public/blessboard/v5/media-picker.css` | **0 errors** (hex fallback warnings only) |
| `git diff --check` | **clean** |

## 7. Suggested commit message

```
Polish shared media picker library grid, filters, and focus behavior.
```
