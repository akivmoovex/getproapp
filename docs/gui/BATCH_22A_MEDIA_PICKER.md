# Batch 22A — Shared media picker interface

**Date:** 2026-07-18  
**Scope:** Library picker UI only — list/grid, client search/type filter, selection, image preview, empty states, responsive drawer, keyboard/focus. **Upload tab left unchanged (no upload work this batch).**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 82), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_22_SHARED_MEDIA.md`](./BATCH_22_SHARED_MEDIA.md), Shared UI States Board `b61a1ea8176648408211b681e942e0a6`

## 1. Canonical Stitch screen IDs

No dedicated media-picker Stitch pair. Chrome adapted from Shared UI States + existing modal shell patterns.

| Role | Exact title | ID |
|------|-------------|-----|
| Reference | BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` |

Markers: `data-bb-stitch-media="shared-ui-states"`, `data-bb-media-picker-dialog="1"`, `data-bb-media-library`, `data-bb-media-lib-preview`.

## 2. Files changed

| Path | Change |
|------|--------|
| `public/blessboard/v5/media-picker.js` | Library-first open; grid; filename search + type filter; selection restore; preview; listbox keyboard; DS focus reuse |
| `public/blessboard/v5/media-picker.css` | Grid/toolbar/preview/drawer (`?v=4`) |
| `public/blessboard/v5/design-system.js` | Export `BlessBoardDesignSystem.focusable` + `trapTabKey` |
| `views/blessboard/v5/partials/branch-admin-shell-*.ejs` | media-picker `?v=4`; design-system `?v=3` |
| `views/blessboard/v5/partials/hq-shell-*.ejs` | Same cache bumps |
| `tests/blessboard-v5-a11y-structure.test.js` | Picker library/focus contracts |
| `tests/blessboard-media.test.js` | Selection fill + empty + no stock search |
| `tests/blessboard-design-system.test.js` | Exported focus helpers |
| `docs/gui/BATCH_22A_MEDIA_PICKER.md` | This document |

**Unchanged:** `src/blessboard/media/*`, list/upload/archive route authz, multer, MIME validation, storage adapters, schema, public delivery.

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
| No stock-image / external search | Asserted absent in picker JS |
| No storage credentials in client | Unchanged; list omits keys/buckets |
| Selection values unchanged | Same `deliveryPath` / `assetId` contract |
| Upload not modified this batch | Upload handlers left as-is from Batch 22 |

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

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:media` | **15/15 pass** (visibility, tenant-scope, selection fill, empty copy, no stock search) |
| `npm run test:blessboard:a11y-structure` | **83/83 pass** (library grid/filter/keyboard/focus contracts) |
| `npm run test:blessboard:design-system` | **8/8 pass** (`BlessBoardDesignSystem` focus helpers) |
| `npx stylelint public/blessboard/v5/media-picker.css` | **0 errors** (hex fallback warnings only) |
| `git diff --check` (changed files) | **clean** |

## 7. Suggested commit message

```
Polish shared media picker library grid, filters, and focus behavior.
```
