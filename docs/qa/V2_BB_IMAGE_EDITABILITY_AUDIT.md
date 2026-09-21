# V2.0 BlessBoard image editability audit

**Environment:** Neuniversity V2.0 (`blessboard.neuniversity.org`) only  
**Product:** BlessBoard church mini-websites  
**Date:** 2026-09-21  
**Production untouched:** YES

## Verdict

Hosted smoke + unit coverage after shared media migration: see hosted QA result and deployment SHA below.

## Complete image inventory (public mini-website)

| Page | Section | Source / model | Edit control | Upload from computer | Classification |
|---|---|---|---|---|---|
| All | Header / drawer logo | `home.logo` / branding | Inline image editor | Yes (shared) | EDITABLE |
| All | Footer GetPro mark | Platform CDN | None | N/A | SYSTEM_ONLY |
| Home | Hero banner | `home.hero.image` / section media | Inline + branding | Yes | EDITABLE |
| Home | Welcome media | section `welcome.mediaUrl` | Structured `editKind=image` | Yes | EDITABLE |
| Home | Grow and Serve ministries | `ministry.imageUrl` | Edit image (per card) | Yes | EDITABLE |
| Home | This Season events | `event.imageUrl` | Edit image (per card) | Yes | EDITABLE |
| Home | Listen and Reflect sermon | `sermon.imageUrl` | Edit image (per feature) | Yes | EDITABLE |
| Home | Pastors and Leaders | `leader.imageUrl` | Edit image (per card) | Yes | EDITABLE |
| About | Page hero | section media / soft-fill | Structured image | Yes | EDITABLE |
| About | Story | `about.story.mediaUrl` | Structured image | Yes | EDITABLE |
| About | Community | `about.community.mediaUrl` | Structured image | Yes | EDITABLE |
| About | Gallery grid | `gallery_1..3` only | Structured image per slot | Yes | EDITABLE (isolated) |
| About | Life Together | `life_together` (not gallery) | Structured image | Yes | EDITABLE (Bug 16) |
| About | Visit on Sunday | `visitor_cta.mediaUrl` | Structured image | Yes | EDITABLE |
| Leadership | Heroes / blocks | section media | Structured image | Yes | EDITABLE |
| Leadership | Pastor / leader photos | `leader.imageUrl` | Edit image + content-admin shared field | Yes | EDITABLE |
| Ministries | Cards | `ministry.imageUrl` | Edit image + content-admin shared field | Yes | EDITABLE |
| Events | Cards / featured | `event.imageUrl` | Edit image + content-admin shared field | Yes | EDITABLE |
| Sermons | Featured + list thumbs | `sermon.imageUrl` | Edit image on media plane | Yes | EDITABLE |
| Giving | Method QR | `giving.qrImageUrl` | Edit image + shared Upload/Library (no raw URL) | Yes | EDITABLE |
| Contact / Announcements | Optional section media | section mediaUrl | Structured image | Yes | EDITABLE |
| Branch overrides | `identity.hero_image_url`, `seo.og_image_url` | Branch settings shared media field | Yes | EDITABLE |
| Soft-fill demos | Platform demo assets | None until replaced | N/A | SYSTEM_ONLY |
| Register auth marks | Platform logo | None | N/A | SYSTEM_ONLY |

Catalogue source of truth: `src/blessboard/website/blessboardImageEditorCoverage.js`.

## Missing controls and root causes (pre-fix)

1. **Content-admin entity photos** (ministries, events, giving QR, leadership historically) used BB `media-upload` → `/hq/content/media/upload` kill-switch (`media_uploads_disabled`) and a single “Choose or upload media” control.
2. **Branch website settings** image overrides pointed at the same kill-switched HQ media paths.
3. **Home sermon teaser** lacked an Edit image control on the media plane (sermons page only had title “Edit”).
4. **Giving QR** structured form exposed a raw “QR image URL” text field and “Upload QR image” wording instead of the shared Upload from computer / Content Library / Replace pattern.
5. **Content-admin page/section** create/edit still offered raw Media URL fields alongside the legacy picker.

## Shared platform changes

- Reuse ActiveClinic/shared `views/platform/website/partials/media-field.ejs` + `media-picker-dialog.ejs` + `public/platform/website-media-field.js`.
- Uploads go to `/c/{org}/website/media` (Hostinger CDN), returning durable `media.id` + `publicSrc`.
- Content-admin `websiteMediaListUrlForReq` always injects that URL into shell locals.
- Structured `buildImageForm` supports `fieldName` (used for `qrImageUrl`) with Upload from computer / Choose from Content Library / Replace / Remove.
- Legacy `media-upload.ejs` prefers shared field when `websiteMediaListUrl` is present; document uploads can still use the BB dialog.

## Files modified (this audit wave)

- `public/blessboard/v5/website-structured-edit.js`
- `views/blessboard/v5/public/home.ejs`, `sermons.ejs`, `giving.ejs`
- `views/blessboard/v5/content-admin/entity-fields.ejs`, `entities.ejs`, `media-upload.ejs`, `page.ejs`, `section.ejs`
- `views/blessboard/v5/hq/branch-website-settings.ejs`
- `views/blessboard/v5/partials/tenant-public-shell-end.ejs` (cache bust `v2-bb-all-img-1`)
- `src/blessboard/http/contentAdminRoutes.js`
- `src/blessboard/http/websiteScopeSettingsAdminRoutes.js`
- `src/blessboard/website/blessboardImageEditorCoverage.js`
- Tests: `tests/v7-image-editor-coverage.test.js`, `tests/v2-bb-ministry-leader-image.test.js`, `tests/blessboard-v5-a11y-structure.test.js`
- Hosted: `scripts/local/v2-bb-all-images-editability-hosted.js`

## Regression coverage retained

- Bug 06 leadership data loss / section management tests
- Bug 16 About Life Together vs gallery isolation (`aboutSectionImageKeys`, hosted isolation script)
- Shared media parity + ministry/leader/season image contracts

## Remaining unsupported / intentionally non-editable

| Surface | Reason |
|---|---|
| Apex BlessBoard marketing | SYSTEM_ONLY |
| Soft-fill demo images | SYSTEM_ONLY until tenant replaces |
| Powered by GetPro / register auth marks | SYSTEM_ONLY |
| Sermon audio/video *files* | External URL only (by product design); thumbnails are editable |
| Sermon PDF resources in content-admin | Document upload via legacy BB picker when shared image field is not applicable |
| Separate mobile/desktop image assets | NOT_APPLICABLE (single asset + fit preview) |

## Automated QA

- `node --test tests/v7-image-editor-coverage.test.js` (+ ministry leader / shared parity / a11y image assertions)

## Hosted QA

- Script: `scripts/local/v2-bb-all-images-editability-hosted.js`
- Org: disposable `bb-v8qa-mub23a6v6a6b`
- Checks: content-admin leadership/ministries/events/giving shared Upload+Library; public editor bust; representative Hostinger upload; production non-V8

## Deployment SHA

Filled after deploy: see hosted JSON / report footer.

## Production untouched

Confirmed via `https://blessboard.pronline.org/healthz` (non-V8 platform line).
