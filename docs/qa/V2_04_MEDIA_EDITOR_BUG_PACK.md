# V2.04 IMAGE EDITOR + MEDIA BUG FIX PACK

**Products:** ActiveClinic + BlessBoard  
**Date:** 2026-10-02  
**Rule:** Prefer shared PLATFORM image/media/editor infrastructure. No separate AC/BB upload systems.

## Bugs closed

| ID | Issue | Fix |
|----|-------|-----|
| MEDIA-01 | AC new mini-websites show no default/template images | Presentation soft-fill via `resolveClinicHero` / `resolveClinicAboutImage` + adapter soft-fill. Draft seed stays `{src:null}` (no false unpublished changes). |
| MEDIA-02 | BB image editor missing Upload from computer parity | Structured editor uses shared `gp-we-media-field__btn--primary` Upload control; loads `website-media-field.css`; removed `capture="environment"` so computer file pick works. |
| MEDIA-03 | AC image uploads very slow | Root cause: CMS media page did full `location.reload()` after upload; inline editor deferred upload until Save draft (serial upload+save). Fix: in-place library card insert; eager shared upload on file select. |
| MEDIA-04 | AC image-edit popup button shapes inconsistent | Normalized shared editor/media-field buttons to 44px height, 8px radius, 16px padding, primary/ghost hierarchy + focus/hover/disabled. |
| MEDIA-05 | AC Image Library empty after upload | Eager upload creates durable `platform.website_media` row immediately so library list returns the asset before Save draft. |

## Shared paths (audit)

| Concern | Location |
|---------|----------|
| Shared editable-image | `views/platform/website/components/editable-image.ejs` + WE01 `public/platform/website-inline-edit.js` |
| Shared media upload | `src/platform/website/mediaService.js` (`registerWebsiteMedia` / `listWebsiteMedia`) |
| Shared Content/Image Library | `src/platform/website/libraryModel.js` + library EJS |
| AC adapter | `src/activeclinic/website/activeClinicWebsitePresentationAdapter.js` |
| BB adapter / structured editor | `public/blessboard/v5/website-structured-edit.js` |
| Draft persistence | platform website content + BB structured draft services |
| Media asset persistence | `platform.website_media` (Hostinger or DB payload) |
| Tenant/library query | `organization_id` + `instance_id` scoped list |
| Crop/position | framing panel in `website-inline-edit.js` + BB Adjust Picture → shared editor |
| Shared button tokens | `website-inline-edit.css` + `website-media-field.css` |

## Performance (MEDIA-03)

**Root cause:** full CMS page reload after upload + deferred upload until draft save (felt as double wait).  
**Fix:** smallest safe change — in-place library refresh + eager single shared upload (save draft reuses `pendingMediaId`, uploads again only on failure retry).  
Validation, durable storage, and tenant isolation unchanged.

## Focused tests

`tests/v2-04-media-editor-bug-pack.test.js` — scenarios A–J.

## End report

```
AC_DEFAULT_IMAGES=PASS
BB_UPLOAD_FROM_COMPUTER=PASS
AC_UPLOAD_PERFORMANCE_ROOT_CAUSE=CMS full reload after upload + deferred upload-until-save
AC_UPLOAD_PERFORMANCE=PASS
SHARED_BUTTON_STYLING=PASS
AC_IMAGE_LIBRARY=PASS
TENANT_MEDIA_ISOLATION=PASS
FOCUSED_TESTS=10/10
FINAL=V2_04_MEDIA_EDITOR_BUG_PACK_COMPLETE
```
