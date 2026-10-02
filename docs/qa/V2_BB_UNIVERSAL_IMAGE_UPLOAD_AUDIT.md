# V2.0 BlessBoard — Universal Image Upload & Content Library (Bug 19)

**Bug ID:** V2-BB-19 (universal image upload)  
**Environment:** Neuniversity V2.0 testing only (`moovex-platform-v8-testing`)  
**Product:** BlessBoard church mini-websites  
**Priority:** P1  
**Date:** 2026-09-21  
**Branch:** `V8`

## Final status

**`V2_BB_UNIVERSAL_IMAGE_UPLOAD_QA_PASS`**

Hosted smoke (`scripts/local/v2-bb-all-images-editability-hosted.js`) returned **PASS** against tip SHA `8a65c0c71f88` on `moovex-platform-v8-testing`.

**Production untouched:** **YES** (`blessboard.pronline.org` SHA `03a89106e2fe`, non-V8)

## Complete inventory (editable vs non-editable)

Catalogue source of truth: `src/blessboard/website/blessboardImageEditorCoverage.js`.

| Page | Section | Field / model | Edit control | Upload from computer | Classification |
|------|---------|---------------|--------------|----------------------|----------------|
| All | Header / drawer logo | `home.logo` | Shared inline image editor | Yes | EDITABLE |
| All | Footer GetPro mark | Platform CDN | None | N/A | SYSTEM_ONLY |
| Home | Hero banner | `home.hero.image` / section media | Inline + branding | Yes | EDITABLE |
| Home | Welcome media | `welcome.mediaUrl` | Structured `editKind=image` | Yes | EDITABLE |
| Home | Grow and Serve | `ministry.imageUrl` | Edit image (per card) | Yes | EDITABLE |
| Home | This Season | `event.imageUrl` | Edit image (per card) | Yes | EDITABLE |
| Home | Listen and Reflect | `sermon.imageUrl` | Edit image (per feature) | Yes | EDITABLE |
| Home | Pastors and Leaders | `leader.imageUrl` | Edit image (per card) | Yes | EDITABLE |
| About | Page hero | section media | Structured image | Yes | EDITABLE |
| About | Story / Community | section `mediaUrl` | Structured image | Yes | EDITABLE |
| About | Gallery grid | `gallery_1..3` only | Structured image per slot | Yes | EDITABLE (isolated) |
| About | Life Together | `life_together` (not gallery) | Structured image | Yes | EDITABLE (Bug 16) |
| About | Visit on Sunday | `visitor_cta.mediaUrl` | Structured image | Yes | EDITABLE |
| Leadership | Pastor / leader photos | `leader.imageUrl` | Public Edit image + content-admin shared field | Yes | EDITABLE |
| Ministries | Cards / leader photos | `ministry.imageUrl` / leader | Edit image + content-admin | Yes | EDITABLE |
| Events | Thumbnails / banners | `event.imageUrl` | Edit image + content-admin | Yes | EDITABLE |
| Sermons | Featured / list thumbs | `sermon.imageUrl` → durable `blessboard.sermons.image_url` | Edit image + content-admin shared field | Yes | EDITABLE |
| Giving | Method QR | `giving.qrImageUrl` | Edit image + shared Upload/Library | Yes | EDITABLE |
| Contact / Announcements | Optional section media | section `mediaUrl` | Structured image (Contact public hero photo still redesign backlog) | Yes | EDITABLE / backlog |
| Branch | Identity / OG | `identity.hero_image_url`, `seo.og_image_url` | Branch settings shared media field | Yes | EDITABLE |
| Soft-fill demos | Platform demo assets | None until replaced | N/A | SYSTEM_ONLY |
| Apex marketing / register marks | Platform | None | N/A | SYSTEM_ONLY |

### Intentional non-editable (documented separately)

| Surface | Reason |
|---------|--------|
| Apex BlessBoard marketing | SYSTEM_ONLY |
| Soft-fill demo images | SYSTEM_ONLY until tenant replaces |
| Powered by GetPro / register auth marks | SYSTEM_ONLY |
| UI icons / decorative chrome | NOT_APPLICABLE |
| Separate mobile/desktop image assets | NOT_APPLICABLE (single asset + fit preview) |
| Sermon A/V *files* | External HTTPS URL only (by design) |
| Contact page video→photograph redesign | **V2-BB-CONTACT-01** (DESIGN PENDING) — not Bug 19 |

## Existing vs missing controls (pre → post Bug 19)

| Gap | Pre | Post |
|-----|-----|------|
| Leader / ministry / event / giving / section images | Shared picker (Bug 04 wave) | Unchanged — retained |
| Sermon thumbnail UI | Pencil present; draft overlay only | **Durable** `image_url` + apply/repo + content-admin media-field |
| Structured editor CDN preference | `deliveryPath` before `publicSrc` | **`publicSrc` / `previewUrl` first** |
| Sermon PDF resource upload | Shared image field forced (blocked docs) | `allowDocuments: true` on resource upload |
| Contact public photo section | Video orientation | Deferred to **V2-BB-CONTACT-01** |

## Root causes addressed

1. **`blessboard.sermons` lacked `image_url`** — UI collected `imageUrl` but publish dropped it; soft-fill returned after refresh.
2. **Draft apply omitted `payload.imageUrl` for sermons.**
3. **Content-admin sermons** had no shared thumbnail media-field (hint only).
4. **Legacy `deliveryPath` preference** could prefer non-Hostinger paths when both existed.

## Files changed

- `db/migrations/blessboard/113_sermon_thumbnail_image_url.sql` (**applied on testing DB** `moovex-platform-v7` / testing)
- `src/blessboard/repositories/publicContentRepository.js`
- `src/blessboard/services/websiteDraftApplyService.js`
- `src/blessboard/http/contentAdminRoutes.js`
- `src/blessboard/website/blessboardImageEditorCoverage.js`
- `public/blessboard/v5/website-structured-edit.js` (cache bust `v2-bb-univ-img-1`)
- `views/blessboard/v5/content-admin/entity-fields.ejs`
- `views/blessboard/v5/partials/tenant-public-shell-end.ejs`
- `tests/v2-bb-sermon-image-persistence.test.js`
- `tests/v7-image-editor-coverage.test.js`
- `scripts/local/v2-bb-all-images-editability-hosted.js`
- `docs/backlog/V2_MEDIA_BACKLOG.md` (sermon gap notes updated)

## Shared platform components reused

- `views/platform/website/partials/media-field.ejs`
- `views/platform/website/partials/media-picker-dialog.ejs`
- `public/platform/website-media-field.js`
- Tenant upload/list: `POST/GET /c/{org}/website/media` → Hostinger CDN (`publicSrc` + media id)
- No BlessBoard-only uploader introduced

## Content Library / CDN persistence

| Check | Result |
|-------|--------|
| Upload registers tenant Content Library media | Yes (shared `/website/media`) |
| Durable media id + delivery URL | Yes (`media.id`, `media.publicSrc`) |
| Image binaries not stored in website JSON | Yes (URL / media reference only) |
| Upload does not auto-publish website | Yes (`published` remains false until website publish) |
| Tenant isolation | Shared media scoped by org; unauthorized tenants cannot select others’ assets |
| Testing migration `113` | Applied via `npm run db:migrate:testing` (only pending file) |

## Independent editing / data integrity

| Concern | Coverage |
|---------|----------|
| Bug 06 leadership collection loss | Retained tests (`v2-bb-about-image-isolation`, section management) |
| Bug 16 Life Together vs gallery | Retained (`aboutSectionImageKeys` + isolation tests) |
| Per-card association (ministry/event/leader/sermon) | Entity key + kind in structured drafts; apply writes only that entity |

## Automated test results

```text
node --test tests/v2-bb-sermon-image-persistence.test.js \
  tests/v7-image-editor-coverage.test.js \
  tests/v2-bb-ministry-leader-image.test.js \
  tests/v2-bb-about-image-isolation.test.js
→ 36/36 PASS
```

Related ministry/season image contract tests also PASS.  
`tests/v7-shared-website-editor-persistence.test.js` — BB leader/image draft flow PASS; one pre-existing ActiveClinic doctor subtest FAIL (unrelated to Bug 19).

## Hosted Neuniversity testing

| Item | Value |
|------|--------|
| Hosts | `https://blessboard.neuniversity.org` |
| Disposable org | `bb-v8qa-mub23a6v6a6b` |
| Smoke script | `scripts/local/v2-bb-all-images-editability-hosted.js` |
| Shared media parity | `scripts/local/v2-shared-media-upload-parity-hosted.js` |
| Public edit URL | `https://blessboard.neuniversity.org/c/bb-v8qa-mub23a6v6a6b/?website_edit=1&website_mode=draft` |
| Deployment SHA | **`8a65c0c71f88`** (`moovex-platform-v8-testing`) |
| Pre-fix live SHA | `7b5756436431` |
| Hosted smoke | **PASS** (all surface checks + Hostinger upload `storageProvider=hostinger`, `published: false`) |
| Shared media parity (BB + AC) | **PASS** (`v2-shared-media-upload-parity-hosted.js` @ `8a65c0c7`) |
| Production (`blessboard.pronline.org`) | SHA `03a89106e2fe`, non-V8 — **untouched** |

### Hosted smoke checklist (script)

- [x] Every admin surface: Upload from computer + Content Library (leadership, ministries, events, giving, **sermons**)
- [x] Public edit mode: structured JS cache bust + Edit image pencils
- [x] Shared Hostinger upload returns `publicSrc` / media id
- [x] Production healthz remains non-V8

## Outstanding gaps / blocked tests

1. **Contact video→image** remains **V2-BB-CONTACT-01** (design pending) — not a Bug 19 image-upload blocker.
2. **Sermons page IA redesign** (Upcoming/Recent/YouTube) remains **V2-BB-SERMONS-01** — thumbnail durability is no longer blocked.
3. Sermons content-admin still exposes legacy HQ document upload URL for PDF resources alongside the shared thumbnail field (intentional; smoke ignores that URL when the shared image field is present).

## ActiveClinic compatibility

Shared media-field / Hostinger path unchanged for ActiveClinic. Coverage catalogue still requires AC unexplained gaps = 0. No AC-only uploader fork.

---

## Changelog

| Date | Note |
|------|------|
| 2026-09-21 | Bug 19 implementation: sermon `image_url`, publicSrc preference, content-admin sermon thumbnail, testing migration applied. |
| 2026-09-21 | Hosted smoke **PASS** on SHA `8a65c0c71f88`; status promoted to **`V2_BB_UNIVERSAL_IMAGE_UPLOAD_QA_PASS`**. |
