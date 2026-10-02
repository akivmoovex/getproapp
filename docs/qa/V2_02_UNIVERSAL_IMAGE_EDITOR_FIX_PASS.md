# V2_02_UNIVERSAL_IMAGE_EDITOR_FIX_PASS

**Status:** `V2_02_UNIVERSAL_IMAGE_EDITOR_FIX_PASS`  
**STITCH_REQUIRED:** NO  
**NEW_STITCH_SCREENS:** 0  
**MIGRATION:** NO  
**PRODUCTION:** UNTOUCHED  
**FRAMING_ALGORITHM_DUPLICATED:** NO  
**IMAGE_EDITOR_READY_FOR_MANUAL_RETEST:** YES

---

## Architecture

| | |
|---|---|
| ARCHITECTURE_BEFORE | Framing only on inline `editable-image` / `website-editable-image`. BB structured = replace + weak focal select. |
| ARCHITECTURE_AFTER | Platform Universal Image Editor + `GpUniversalImageEditor.openFraming` mount API. BB structured/entity Category-A calls the shared API. |
| SHARED_MOUNT_API | `window.GpUniversalImageEditor.openFraming` in `public/platform/website-inline-edit.js` |
| CANONICAL_EDITOR | Same Adjust Picture sheet (zoom / move / fit / fill / preview) |
| PLACEMENT_MODEL | `src/platform/website/imagePlacement.js` → `validateImagePlacement` |
| PUBLIC_RENDERER | `renderPlacementStyle` via `presentImagePlacementStyle` EJS helper |

---

## Category results

| Metric | Value |
|---|---|
| CATEGORY_A_TOTAL | 17 |
| CATEGORY_A_PASS | **17** |
| CATEGORY_A_FAIL | **0** |
| BB_CATEGORY_A_PASS | 14/14 |
| AC_CATEGORY_A_PASS | 3/3 |
| CATEGORY_B_UNCHANGED | 8/8 |
| CATEGORY_D_UNCHANGED | 7/7 |

### Previously failing BB Category-A slots (now PASS)

| Slot | Result |
|---|---|
| bb.page_hero.image | PASS |
| bb.home.welcome.image | PASS |
| bb.about.story.image | PASS |
| bb.about.community.image | PASS |
| bb.about.life_together.image | PASS |
| bb.about.visit_sunday.image | PASS |
| bb.about.gallery | PASS |
| bb.content_block.media | PASS |
| bb.leadership.photo | PASS |
| bb.ministry.image | PASS |
| bb.event.image | PASS |
| bb.sermon.thumbnail | PASS |

---

## Lifecycle

| Step | Status |
|---|---|
| OPEN_ADJUST | YES — structured `data-bb-se-adjust` → `openFraming` |
| ZOOM | YES — shared framing range |
| MOVE | YES — shared pointer drag |
| FIT / FILL | YES — shared fit buttons |
| SAVE | YES — placement in structured draft payload |
| RELOAD | YES — draft overlay + editPayload.placement |
| PUBLISH | YES — section `layoutMetadata.imagePlacement`; entity map on `public_pages.layout_metadata.entityImagePlacements` (no migration) |
| PUBLIC_RENDER | YES — `renderPlacementStyle` / `presentImagePlacementStyle` |

Replacement: preserves existing placement (same as inline). Remove: clears placement.

---

## Files changed (this fix)

### PLATFORM_APPLICATION
- `public/platform/website-inline-edit.js` — export `GpUniversalImageEditor` + `openExternalFraming`

### BB_APPLICATION
- `public/blessboard/v5/website-structured-edit.js` — Adjust Picture button → mount API; placement hidden field
- `src/blessboard/website/blessboardStructuredImageFraming.js` — Category-A vs B framing flags
- `src/blessboard/website/entityImagePlacement.js` — page layout_metadata placement map (no migration)
- `src/blessboard/website/sectionMediaDraftFields.js` — persist `imagePlacement`
- `src/blessboard/services/websiteStructuredDraftValidation.js` — `validateOptionalPlacement`
- `src/blessboard/services/websiteDraftApplyService.js` — publish placement for sections + entities
- `src/blessboard/services/websiteStructuredDraftService.js` — draft overlay placement
- `src/blessboard/http/loadTenantPublicPageModel.js` — sanitize + attach entity placements
- `src/blessboard/http/renderTenantPublicPage.js` / `v5EjsTemplateCache.js` — `presentImagePlacementStyle`
- Templates: `page-hero`, `content-block-media`, `leader-card`, `content-card`, `home`, `about`, `ministries`, `events`, `sermons`, shell script cache bump

### AC_APPLICATION
- none (AC Category-A already green)

### TEST
- `tests/v2-02-universal-image-editor-coverage.test.js` (gate green 17/17)
- `tests/v2-02-structured-image-framing-lifecycle.test.js` (new)
- `tests/helpers/v2-02-universal-image-editor-coverage-matrix.js`
- `tests/v2-01-universal-image-editor.test.js` (cache bump assertion)

### DOC
- `docs/qa/V2_02_UNIVERSAL_IMAGE_EDITOR_FIX_PASS.md`

### CONFIG / MIGRATION
- none

---

## Regressions (automated)

| Area | Result |
|---|---|
| UPLOAD / LIBRARY / REPLACE / REMOVE | Covered by existing BB structured + v7 image wiring (pass except pre-existing copy string) |
| BB_HOME | Inline hero/logo unchanged; coverage PASS |
| AC_EXISTING | No AC app changes; coverage PASS |
| TENANT_ISOLATION | Existing media validators still pass (`v7-website-image-management`) |

---

## Test results

| Suite | Result |
|---|---|
| NEW_COVERAGE_CONTRACT | PASS (17/17 Category A) |
| LIFECYCLE | PASS |
| V2_01_EDITOR | PASS |
| PLACEMENT | PASS |
| PAYLOAD_PERSISTENCE | PASS |
| V7_COVERAGE | 16/17 — **PRE_EXISTING_FAILURE** only |
| BB structured editors / image mgmt | PASS |
| AC | no AC-specific suite required for this gap |
| PLATFORM | placement + mount API assertions PASS |

### PRE_EXISTING_FAILURES
- `v7-image-editor-coverage.test.js`: expects `Choose from Content Library`; production copy remains `Choose from Image Library`. **Not altered** (per brief).

### NEW_FAILURES
- none

---

## Notes

- Entity placement durability uses existing `public_pages.layout_metadata.entityImagePlacements` — **no migration**.
- Category B (QR / SEO / settings / CMS) still replace-only; giving QR passes `framing: false`.
- Framing algorithms were **not** duplicated into BlessBoard.

**FINAL:** `IMAGE_EDITOR_READY_FOR_MANUAL_RETEST=YES`
