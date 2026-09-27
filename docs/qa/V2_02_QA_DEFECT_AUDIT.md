# V2_02_QA_DEFECT_AUDIT

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_02_QA_DEFECT_AUDIT` |
| **Date** | 2026-09-28 |
| **Mode** | AUDIT ONLY — **no** application / test / DB / UI changes |
| **Production** | **UNTOUCHED** (not probed for this audit) |

---

## Repo / deployment context

| Item | Value |
|------|--------|
| Branch | `V10` (ahead of `origin/V10` by 1 local docs commit) |
| Local HEAD | `c1a3911ae515121396ba5ec4b6e89f80ecc10121` |
| Working tree | **Dirty** (modified tests + many untracked QA docs / coverage harness) — audit did not clean or commit |
| Frozen V2.03 candidate (docs) | `039ad22193c97759ce9bd5ca73fe56b0e38886ab` |
| V2.02 handoff context | `docs/qa/V2_02_QA_RELEASE_HANDOFF.md` — testing `moovex-platform-testing` / About **2.02**; freeze tag `v2.02` → `3b94485c…` |
| Audit basis | Current `V10` tree code paths (defects described by manual QA) |

Manual QA can fail while broad packs pass because: (1) fixtures force `BLESSBOARD_MEDIA_UPLOADS_ENABLED=1`, (2) attachment/sermon creates use service-layer or perfectly-shaped form posts, (3) image framing is only asserted on the shared inline editor source, not on structured-edit surfaces.

---

## Coverage matrix

| BUG | EXISTING TEST FILE(S) | EXACT SCENARIO COVERED? | MISSING ASSERTION/STEP | LIKELY ROOT CAUSE | PLATFORM vs BB-SPECIFIC | STITCH_REQUIRED |
|-----|----------------------|-------------------------|------------------------|-------------------|-------------------------|-----------------|
| **1. Announcement file/document upload → save/publish blocked** | `tests/blessboard-announcements.test.js`; `tests/church-branch-announcement-attachments.test.js` (legacy `/branch/`); `tests/v8-shared-announcements.test.js`; `tests/blessboard-kill-switches.test.js`; fixtures `blessboardV5Fixtures` | **No** — service-layer attach of pre-inserted **private** PDF; download authz; publish confirm without upload; kill-switch unit only | No HTTP: open picker → multipart PDF to `/…/content/media/upload` → fill `media_asset_id` → save → publish; no assert on `media_uploads_disabled` / `website.edit` gate from announcement UI | Content media upload kill-switch **default off**; upload gated by **`website.edit`** while announcements use **`announcements.*`**; attachments **reject non-private** assets; form depends on BB content media picker | **BB-specific** product path; upload kill-switch + media asset store are BB media infra (platform website media is image-only and not used here) | **NO** |
| **2. Unable to add a new sermon** | `tests/blessboard-content-admin.test.js` (sermons create/publish); `tests/v2-bb-sermon-image-persistence.test.js` (static wiring); `tests/church-public-events-sermons-visual.test.js` (public visuals) | **Partial** — create with valid **ISO** `preached_at` + **https** `media_url`; rejects http media; CSRF deny | No create with human date / empty preached_at / datetime-local; no structured-editor “add sermon” journey; no Hostinger publicSrc → `image_url` form fill E2E | Content-admin form requires free-text **ISO datetime** + **https** URLs; invalid values → **400** re-render; create path is BB `publicContentAdminService.createSermon` | **BB-specific** | **NO** |
| **3. Image editor zoom/move/fit/fill inconsistent off homepage** | `tests/v2-01-universal-image-editor.test.js`; `tests/v2-01-shared-image-placement.test.js`; `tests/v7-image-editor-coverage.test.js`; `src/blessboard/website/blessboardImageEditorCoverage.js` | **No** — asserts Adjust Picture controls exist in **shared inline** JS/CSS and hero/logo partial attrs; placement validation unit | No assert that leadership/ministry/event/sermon/about structured surfaces expose Adjust Picture; no parity test inline vs structured | Dual editors: homepage hero/logo use `editable-image` + `website-inline-edit.js` (full framing); most other images use `structured-edit-trigger` + `website-structured-edit.js` (**no** framing UI) | **PLATFORM** framing (`website-inline-edit` / `imagePlacement`); BB wiring of which slots use which editor | **NO** |

---

## Issue 1 — Announcements document upload / save / publish

### Trace

| Layer | Path |
|-------|------|
| UI | `views/blessboard/v5/announcements/admin-form.ejs` → attachments → `content-admin/media-upload.ejs` (`fillField: assetId`, `visibility: private`) → `public/blessboard/v5/media-picker.js` |
| Client request | `POST {hq\|branch-admin}/content[/b/:key]/media/upload` multipart `file` + `_csrf` + `visibility=private` |
| Route | `src/blessboard/http/contentAdminRoutes.js` (`gateContent` → **`website.edit`**, `areMediaUploadsEnabled`, multer) |
| Authz | Announcement pages: `announcements.view` gate + service `announcements.manage` / `.publish`; **upload** requires **`website.edit`** |
| Service | `mediaUploadService.uploadMediaAsset` → then announcement save `media_asset_id` → `announcementsService` create/update (`mediaAssetIds` / `addMediaAssetIds`) |
| DB/storage | `blessboard.media_assets` (private) + `blessboard.announcement_attachments` |
| Response | Upload JSON `{ok, assetId,…}` or `{ok:false, reason: media_uploads_disabled\|…}`; save/publish HTML redirect or error |
| Publish | `GET/POST …/announcements/:id/publish` + `confirm_publish` → `announcements.publish` |

### Reproduced / root cause (code-level, high confidence)

1. **`BLESSBOARD_MEDIA_UPLOADS_ENABLED` defaults disabled** (`mediaUploadsEnabled.js`). Content-admin upload returns **403** `media_uploads_disabled`. Local tests force `"1"` via fixtures — hosted may not.
2. Even when enabled, announcement UI has **no dedicated upload route**; it borrows content media under **`website.edit`**. Roles with announcement manage but without website edit cannot attach.
3. Service **rejects non-`private`** media for attachments (`reason: media_asset`). Wrong visibility → save fails after a “successful” public upload.
4. Publish still requires confirm; failure after failed attach looks like “cannot complete save/publish.”

Corroboration: `docs/qa/V2_BB_IMAGE_EDITABILITY_AUDIT.md` already notes content-admin upload kill-switch vs website media path.

### Affected files

- `views/blessboard/v5/announcements/admin-form.ejs`
- `views/blessboard/v5/content-admin/media-upload.ejs`
- `public/blessboard/v5/media-picker.js`
- `src/blessboard/http/contentAdminRoutes.js`
- `src/blessboard/http/announcementAdminRoutes.js`
- `src/blessboard/services/announcementsService.js`
- `src/blessboard/media/mediaUploadService.js`
- `src/blessboard/config/mediaUploadsEnabled.js`

### Existing automated coverage / gap

- Covered: service attach private same-church PDF; reject public/foreign; download authz; HTTP create/publish **without** attachment upload.
- Gap: end-to-end picker upload from announcement form; kill-switch / missing `website.edit` surfacing in that UI; save with filled `media_asset_id` after real upload.

### Platform / BB ownership

**BB-specific** announcement domain + BB media asset pipeline. Do **not** duplicate platform website image library for PDFs. If a shared document-upload mechanism is extracted later, own it in **platform** with BB adapter — smallest fix is BB path + env/authz alignment.

### STITCH_REQUIRED

**NO** — upload/publish UI already exists (Stitch announcement editor markers present). Fix is infra/wiring/authz, not a new screen.

### Smallest safe fix

1. Confirm hosted `BLESSBOARD_MEDIA_UPLOADS_ENABLED` for testing when announcement docs are in scope (ops), **or** route announcement document upload through an announcements-authorized endpoint that does not silently 403.
2. Ensure announcement attachment upload authz matches `announcements.manage` (or document that `website.edit` is required).
3. Keep private-only attachment rule; surface clear error when visibility/mime rejected.
4. Add HTTP integration test: enable uploads → PDF → `media_asset_id` → draft save → publish confirm.

### Tests to add/change

- `tests/blessboard-announcements.test.js`: multipart upload via content media URL used by form + attach + publish.
- Optional: assert 403 reason when kill-switch off / missing `website.edit`.

---

## Issue 2 — Unable to add a new sermon

### Trace

| Layer | Path |
|-------|------|
| UI | `views/blessboard/v5/content-admin/entities.ejs` + `entity-fields.ejs` (`entityKind === 'sermons'`); public page uses structured-edit triggers |
| Client | `POST /{hq\|branch-admin}/content/sermons` form (`action=create`, `title`, `speaker_name`, `preached_at`, optional media/resource/image URLs) |
| Route | `contentAdminRoutes.js` entity POST → `entityPatchFromBody("sermons")` → `createSermon` |
| Authz | `website.edit` (`gateContent`) |
| Service | `publicContentAdminService.buildSermonFields` / `createSermon` |
| DB | `blessboard.sermons` (`preached_at`, `media_url`, `resource_url`, `image_url`, …) |
| Response | **303** `?saved=1` or **400** re-render with `errorMessage(reason)` |
| Publish | Same form `status=published` + `confirm_publish` |

### Reproduced / root cause (high confidence for content-admin path)

1. **`preached_at` is required free-text labeled “ISO datetime”** — not `datetime-local`. Non-ISO / empty → create fails (`reason: preached_at` or DB timestamp error).
2. **`media_url` / `resource_url` must be https** (or `/_bb/media/:uuid`). `http://` → **400** (`*_https_required`) — already asserted; easy manual fail if user pastes http or omits scheme wrongly.
3. Automated create uses perfectly shaped ISO + https; does not simulate typical manual input.
4. Structured public-page “edit sermon” is a different client (`website-structured-edit.js`); thumbnail durability covered statically, not “add new sermon” UX.

### Affected files

- `views/blessboard/v5/content-admin/entity-fields.ejs`
- `src/blessboard/http/contentAdminRoutes.js` (`entityPatchFromBody` sermons)
- `src/blessboard/services/publicContentAdminService.js` (`buildSermonFields`, `createSermon`)
- `src/blessboard/repositories/publicContentRepository.js` (`insertSermon`)
- Optionally structured editor / draft apply for inline add

### Existing automated coverage / gap

- Covered: create draft with ISO + https; reject http media; publish confirm; CSRF; static thumbnail wiring.
- Gap: invalid/human `preached_at`; empty required fields messaging; structured-editor create-new-sermon; image picker → `image_url` round-trip.

### Platform / BB ownership

**BB-specific** (sermon CMS entity). Shared media field for thumbnail is already platform partial — keep reuse; do not fork AC logic.

### STITCH_REQUIRED

**NO** — sermons admin Stitch markers already on list/editor. Fix validation/UX of existing form (e.g. proper datetime control + clearer errors), not a new Stitch screen.

### Smallest safe fix

1. Accept `datetime-local` / parse flexible dates into ISO in `buildSermonFields` (or change input `type` + server parse).
2. Show field-level errors for `preached_at` / https URL failures (not opaque 400).
3. Optionally default `preached_at` to now on create.

### Tests to add/change

- Content-admin: create with `datetime-local` value and with invalid date (expect clear 400).
- Optional: structured-editor add sermon if that is the QA surface.

---

## Issue 3 — Image editor controls inconsistent off homepage

### Trace

| Layer | Path |
|-------|------|
| Homepage hero/logo | `editable-image.ejs` → `data-website-image*` → `public/platform/website-inline-edit.js` → Adjust Picture (zoom/move/fit/fill, optional D/M) → placement save via website draft API |
| Other BB images | `structured-edit-trigger` on about/leadership/ministries/events/sermons/giving → `website-structured-edit.js` (replace/upload + “fit preview” copy) — **no** Adjust Picture panel |
| Authz / publish | Website edit + existing draft/publish paths |
| Platform contract | `src/platform/website/imagePlacement.js` (`IMAGE_SLOT_REGISTRY` + default separate framing) |

### Reproduced / root cause (confirmed in templates/JS)

Manual observation matches architecture: **homepage** uses the shared Universal Image Editor; **most other applicable images** use the older structured editor without framing controls. Coverage catalogue marks many surfaces `EDITABLE` via `structured_*` editors — replaceable, not “full framing.”

### Affected files

- `public/platform/website-inline-edit.js` / `.css`
- `views/blessboard/v5/partials/editable-image.ejs`
- `public/blessboard/v5/website-structured-edit.js`
- `views/blessboard/v5/public/**` (home vs structured-edit-trigger usage)
- `src/platform/website/imagePlacement.js`
- `src/blessboard/website/blessboardImageEditorCoverage.js`

### Existing automated coverage / gap

- Covered: framing controls present in inline editor; placement validate/serialize; BB/AC editable-image attrs; coverage catalogue classifications.
- Gap: no test that structured surfaces expose the same Adjust Picture controls; no matrix “EDITABLE ⇒ framing UI.”

### Platform / BB ownership

**PLATFORM** owns framing UI + placement contract. **BB** owns which public partials mount `editable-image` vs structured trigger. Implementation must extend shared platform editor (or shared partial) — **do not** copy framing into BB-only JS.

### STITCH_REQUIRED

**NO** — Universal Image Editor already approved (V2.01). Fix = wire existing component to more slots / structured path. New Stitch only if product invents a different interaction (not indicated).

### Smallest safe fix

1. For applicable structured image slots, open the shared inline Adjust Picture flow (or mount `editable-image` + inline editor) instead of structured-only replace.
2. Keep logo/seo separate-framing policy as today.
3. Add a small matrix test: N non-home EDITABLE slots assert framing markers when edit mode on.

### Tests to add/change

- Extend `v2-01-universal-image-editor.test.js` (or BB coverage test) for about/leadership/ministry/event/sermon image edit entry → framing controls present.
- Optional AC parity if same structured gap exists.

---

## Why green automation ≠ manual QA

| Factor | Effect |
|--------|--------|
| Fixtures set `BLESSBOARD_MEDIA_UPLOADS_ENABLED=1` | Hides default-off kill-switch on hosted |
| Attachment tests insert media in DB / call service | Skip picker + content upload route |
| Sermon tests post perfect ISO + https | Skip real form mistakes |
| Image tests lint inline editor source | Skip structured-edit surfaces users actually open |
| Broad BB regression pack | Surface inventory / contracts — not these exact journeys |

---

## Ready-for-fix gates

```text
ANNOUNCEMENTS_READY_FOR_FIX=YES
SERMONS_READY_FOR_FIX=YES
IMAGE_EDITOR_READY_FOR_FIX=YES
```

Confidence notes: announcements kill-switch + private + `website.edit` coupling are code-confirmed; confirm hosted env flag before coding. Sermons fix should confirm whether QA used content-admin vs structured editor. Image editor dual-path is template-confirmed.
