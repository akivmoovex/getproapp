# Batch 15C — Branch admin forms

**Date:** 2026-07-18  
**Scope:** Branch Admin **forms management list, allowlisted schema create editor, and submission review presentation only**. Requests not started.  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 52a), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_15B_BRANCH_GIVING.md`](./BATCH_15B_BRANCH_GIVING.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Dedicated Branch Forms desktop | — | **STITCH_MISSING** |
| Dedicated Branch Forms mobile | — | **STITCH_MISSING** |
| Shared UI States (empty/error) | BlessBoard Shared UI States Board | `b61a1ea8176648408211b681e942e0a6` |
| Supporting management list chrome | `35-branch-announcements-management-desktop` | `65941542c13048edb2c62bccd01ddcea` |
| Supporting management list chrome | `35-branch-announcements-management-mobile` | `daa416025c704a5693b295ef3139af89` |
| Shell frame (unchanged) | `25-branch-admin-dashboard-*` | see screen map |

Markers: `data-bb-stitch-forms="shared-ui-states"`, `data-bb-stitch-forms-detail="shared-ui-states"`.

No dedicated branch Forms management pair exists in the Stitch inventory. Composition uses Shared UI States empty patterns + branch admin management list chrome (status chips, desktop table + mobile cards) inside the Branch Admin shell.

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/forms-requests/admin-forms.ejs` | List chrome, status chips, create editor, table/cards, empty/no-results, unavailable notes |
| `views/blessboard/v5/forms-requests/admin-form-detail.ejs` | Schema field list, publish control, submission table/cards, privacy copy, empty states |
| `src/blessboard/http/formsRequestsAdminRoutes.js` | Optional `?status=` filter wired to existing `listForms` status support |
| `public/blessboard/v5/branch-admin.css` | Forms management layout (`?v=29`) |
| `public/blessboard/v5/hq-admin.css` | Shared forms styles (`?v=25`) |
| Shell partials | CSS cache bumps |
| `tests/blessboard-forms-requests.test.js` | Stitch markers, editor fields, no-results, privacy |
| `tests/blessboard-v5-a11y-structure.test.js` | Forms structure assertions |
| `docs/gui/STITCH_SCREEN_MAP.md` | Order 52a note |
| `docs/gui/BATCH_15C_BRANCH_FORMS.md` | This document |

**Unchanged:** `createForm` / `publishForm` / `listForms` / `getForm` / `listFormSubmissions`, allowlisted field validation, CSRF, branch scoping, Requests routes/views.

## 3. Supported form controls (V5 allowlist)

| Type | Notes |
|------|-------|
| `text` | Plain text |
| `textarea` | Multi-line |
| `email` | Validated email |
| `phone` | Validated phone |
| `number` | Numeric |
| `select` | Options allowlist |
| `checkbox` | Boolean |
| `date` | `YYYY-MM-DD` |

Create editor fields preserved: `title`, `description`, `schema_json`, `_csrf`. Publish: `POST …/forms/:id/publish` with `_csrf`.

## 4. Omitted features

| Omitted | Reason |
|---------|--------|
| Dedicated Stitch forms builder UI | STITCH_MISSING |
| Signatures / payment / checkout fields | Not in allowlist |
| Conditional logic / automation | Not supported |
| Unsupported file-upload fields | Not in allowlist |
| Drag-and-drop visual builder | V5 uses schema JSON only |
| Bulk export / PDF | Not supported |
| Cross-branch submission browsing | Branch-scoped only |
| Full member contact directories | Truncated `memberRef` only |

## 5. Actions preserved

| Action | Method / path |
|--------|----------------|
| List + status filter | `GET …/forms?status=` |
| Create draft | `POST …/forms` |
| Detail + submissions | `GET …/forms/:id` |
| Publish | `POST …/forms/:id/publish` |

## 6. Empty states

| State | Marker |
|-------|--------|
| No forms | `data-bb-forms-empty="catalog"` |
| Status filter miss | `data-bb-forms-empty="no-results"` |
| No schema fields | `data-bb-form-schema-empty="1"` |
| No submissions | `data-bb-forms-submissions-empty="1"` |

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:forms-requests` | **10/10 pass** |
| `npm run test:blessboard:a11y-structure` | **58/58 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Suggested commit message

```
Polish branch-admin forms management and submissions to Shared UI chrome.
```
