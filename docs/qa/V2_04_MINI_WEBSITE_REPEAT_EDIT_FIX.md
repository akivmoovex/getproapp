# V2.04 — Mini-Website Repeat Edit / Stale Version Fix

**Status:** `V2_04_MINI_WEBSITE_REPEAT_EDIT_FIX_PASS`  
**Branch:** V4  
**Base before fix:** `5a99cd68eae0954b0f42bcabd355a92c8bd5f542`  
**Date:** 2026-09-29  
**Production:** UNTOUCHED  
**pronline / V10:** UNTOUCHED  

## 1. Bug

In the mini-website editor:

1. Edit an editable text field → Save #1 succeeds  
2. Edit the **same** field again without reload → Save #2  
3. Observed: `"This field was updated elsewhere. Reload and try again."`  
4. Expected: sequential same-session saves succeed when no other session modified the field  

## 2. Reproduction

| Product | Result | Evidence |
| --- | --- | --- |
| BlessBoard | **YES** (`BB_REPEAT_EDIT_REPRODUCED=YES`) | One HTTP `/website/drafts` save performed **two** engine mutations |
| ActiveClinic | **NO** (`AC_REPEAT_EDIT_REPRODUCED=NO`) | Single engine write per draft POST; sequential saves already succeeded |

## 3. Concurrency token

| Field | Value |
| --- | --- |
| `CONCURRENCY_TOKEN` | `platform.website_content.updated_at` |
| Server compare | `date_trunc('milliseconds', …)` in `contentService.saveWebsiteDraft` |
| Client attribute | `data-website-updated-at` |
| Request field | `expectedUpdatedAt` |
| Conflict UX | `"This field was updated elsewhere. Reload and try again."` |

Optimistic concurrency remains **enabled**. Conflicts are not ignored.

## 4. Root cause (BlessBoard)

Classification: **G. SERVER_GENERATES_INCONSISTENT_VERSION** (+ **A. SAVE_RESPONSE_MISSING_NEW_VERSION**)

During one BlessBoard HTTP save:

1. Primary `contentService.saveWebsiteDraft` → row `updated_at = T1`  
2. Compatibility overlay `saveInlineFieldDraft` → called `saveFieldDraft` again → row `updated_at = T2`  
3. HTTP response returned content from step 1 (`T1`)  
4. Browser stored `T1` on the field  
5. Next save sent `expectedUpdatedAt=T1` against server `T2` → false conflict  

ActiveClinic did not double-write; shared post-save authoritative refresh + client token sync were still applied as hardening.

## 5. Implementation correction

1. **`skipEngineWrite: true` + `engineContent`** on `saveInlineFieldDraft` **only** when the BlessBoard editor route has already performed the canonical engine write. Other callers still perform the engine write (default path unchanged).  
2. **`expectedUpdatedAt`** continues through `saveFieldDraft` / applicable overlay paths.  
3. After all mutations for the HTTP request, routes re-fetch via **`getWebsiteContentRow`** and return that row as `content` (final authoritative `updatedAt`).  
4. Client (`website-inline-edit.js`): after successful save, normalize ISO token and set `data-website-updated-at` on **all** elements sharing the same `data-website-key`.  

Precision: ISO normalization preserves millisecond timestamps consistent with the existing SQL `date_trunc('milliseconds')` contract.

## 6. Gate results

| Gate | Result |
| --- | --- |
| `IMPLEMENTATION_REVIEW` | **PASS** |
| `BB_SAVE_1` / `BB_SAVE_2` / `BB_SAVE_3` / `BB_FINAL_VALUE` (V1→V4) | **PASS** |
| `BB_FALSE_CONFLICTS` | **0** |
| `AC_SAVE_1` / `AC_SAVE_2` / `AC_SAVE_3` / `AC_FINAL_VALUE` | **PASS** |
| `AC_FALSE_CONFLICTS` | **0** |
| `TRUE_CONCURRENT_EDIT_DETECTION` | **PASS** (HTTP 409 / `code: conflict`) |
| `STALE_SECOND_SESSION_REJECTED` | **PASS** |
| `MULTI_FIELD_SEQUENTIAL_EDIT` | **PASS** (A → B → A) |
| `SAVE_RESPONSE_FINAL_TOKEN` | **PASS** (`RESPONSE_UPDATED_AT == FINAL_SERVER_UPDATED_AT`) |
| `CLIENT_TOKEN_SYNC` / `SHARED_KEY_TOKEN_SYNC` | **PASS** (contract + helper coverage) |
| `DRAFT_SAVE_REGRESSION` / `PUBLISH_REGRESSION` / lifecycle | **PASS** (`v8-shared-website-lifecycle`) |
| `BB_EDITOR_REGRESSION` / `AC_EDITOR_REGRESSION` | **PASS** (`v7-shared-website-editor-persistence`) |
| Color hotfix intact | **PASS** (`v2-04-product-token-cascade`, batch-8 guard) |

### Color regression (must remain)

| Check | Value |
| --- | --- |
| `AC_PRIMARY_BRAND` | `#006068` |
| `BB_PRIMARY_BRAND` | `#6c5ce7` |
| `PRODUCT_TOKEN_RESOLUTION_TEST` | **PASS** |
| `BB_TOKEN_LEAK_INTO_AC` / `AC_TOKEN_LEAK_INTO_BB` | **0** |
| `UNJUSTIFIED_PLATFORM_GUI_RAW_COLORS` | **0** |
| `UNDEFINED_TOKENS` | **0** |

## 7. Tests run

```bash
node --test tests/v2-04-mini-website-repeat-edit.test.js
node --test tests/v8-shared-website-lifecycle.test.js
node --test tests/v2-04-product-token-cascade.test.js
node --test tests/v7-shared-website-editor-persistence.test.js
node --test tests/v2-04-color-migration-batch-8.test.js
```

All **PASS**.

## 8. Files in this fix

- `src/blessboard/http/blessboardWebsiteEditorRoutes.js`
- `src/blessboard/services/websiteInlineDraftService.js`
- `src/blessboard/website/blessboardEngineContentService.js`
- `src/activeclinic/http/activeClinicWebsiteRoutes.js`
- `src/platform/website/http/websiteEditorSharedOperations.js`
- `public/platform/website-inline-edit.js`
- `tests/v2-04-mini-website-repeat-edit.test.js`
- `docs/qa/V2_04_MINI_WEBSITE_REPEAT_EDIT_FIX.md`

## 9. Deploy note

Do **not** deploy this alone ahead of operator schedule. Deploy **color alias scope hotfix (`5a99cd68…`) + this fix together** to **neuniversity.org** testing only. Production and pronline/V10 remain untouched.
