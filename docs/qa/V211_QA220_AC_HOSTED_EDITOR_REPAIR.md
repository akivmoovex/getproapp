# V211-QA220 ActiveClinic Hosted Editor Repair

Date: 2026-10-29  
Base: `V11` / `d93bdd671c6b0fb0f18f3fe5ac3b430a07c091b1`  
Branch: `fix/v211-ac-hosted-editor-qa220`

## Findings and corrections

### New section rendering

The ActiveClinic CMS section service persisted sections under
`cms.sections`, and the settings page loaded them correctly. The tenant home
template did not iterate `clinic.cmsSections`; it rendered only the fixed
Stitch sections. Consequently, newly added sections were visible in the
settings list but absent from the editor canvas and draft preview.

`views/activeclinic/tenant/home.ejs` now renders visible CMS sections with
stable IDs, types, text, links, images, and an editor-only settings link.
Existing sections remain unchanged.

### Image and image+text editing

The section settings form had no image controls, although the CMS service
already supported owned image objects. The settings route also discarded image
form fields.

The settings form now exposes image media ID, source, and required alt-text
controls for `image` and `image_text` sections, with a link to the existing
Media Library selection surface. The route forwards the image object to the
existing ownership validation path. No media entitlement or ownership check
was bypassed.

### Save Draft

The canonical ActiveClinic CMS writes are draft/autosave-style persistence:
section changes are saved immediately by the existing authenticated settings
forms and remain unpublished until the authorized publish workflow. No second
conflicting Save Draft mechanism was introduced. The existing settings copy
communicates that changes remain draft until publication.

### Patient phone validation

Unknown phone behavior remains unchanged: the server returns the safe
no-match response and does not create a patient account. Existing authorized
phone registration tests pass.

The shared phone field now adds native client-side validation for malformed
characters/length while retaining server-side normalization and matching.

## Regression evidence

- QA220 focused editor/rendering and related patient/CMS tests: `16/16 PASS`.
- ActiveClinic regression: `108/108 PASS` across 14 files.
- BlessBoard relevant regression: `274 PASS / 0 FAIL` (279 tests; 5 skipped).
- Platform security: `28/28 PASS`.
- Build: PASS.
- `git diff --check`: PASS.
- Lint diagnostics: none.

The focused tests cover text-section editor/preview rendering, image and
image+text rendering, media persistence fields, existing CMS workflows, and
patient registration/no-match behavior. Existing phone registration fixtures
were reused.

## Browser and hosted status

Local authenticated Playwright was not run because no authorized local browser
session fixture was available. Hosted screenshots at
`/workspace/acv211/docs/qa/evidence/grok-ac-v211/` were not accessible from
this workspace and were not claimed as inspected.

`LOCAL_BROWSER_QA=BLOCKED_FIXTURE`  
`HOSTED_BROWSER_QA=BLOCKED_AUTH`

No database, Supabase, Hostinger, production, V11, or deployment changes were
made.
