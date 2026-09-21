# V2.0 Shared Platform — Video ↔ Image Media Type Conversion (Bug 22)

**Bug ID:** V2-BB-22 / shared platform media conversion  
**Environment:** Neuniversity V2.0 testing only (`moovex-platform-v8-testing`)  
**Products:** BlessBoard + ActiveClinic (shared content model / media stack)  
**Priority:** P0  
**Date:** 2026-09-21  
**Branch:** `V8`

## Final status

**`V2_SHARED_MEDIA_CONVERSION_QA_PARTIAL`** — automated contract + unit coverage PASS; hosted conversion smoke pending deploy of this tip (see Deployment SHA below once live).

**Production untouched:** **YES** (verified against `blessboard.pronline.org` in hosted script; must remain non-V8).

---

## Root cause

Publish apply preferred `payload.imageUrl || payload.videoUrl || payload.thumbnailUrl` for section `mediaUrl`. After an administrator replaced a YouTube-backed section with a photograph:

1. Draft overlay correctly preferred `imageUrl` / poster `thumbnailUrl` (Bug 21 path).
2. Publish still wrote the **YouTube URL into `mediaUrl`** when a video draft residual / merged payload still carried `videoUrl`, or left `layoutMetadata.videoUrl` active without a `mediaKind` discriminator.
3. Public heroes render `<img src="<%= mediaUrl %>">` only — so a surviving YouTube URL either broke the image or left the previous poster while the selected photograph never became the durable published asset.

**Fix:** Shared helper `resolveSectionMediaFromDraft` used by **both** draft overlay and publish apply:

| Draft kind | `mediaUrl` | `layoutMetadata` |
|------------|------------|------------------|
| `image` | Photograph URL | `mediaKind: "image"`, clears `videoUrl` / `videoTitle`, keeps `previousVideo*` |
| `video` | Poster/`thumbnailUrl` only (never YouTube) | `mediaKind: "youtube"`, stores `videoUrl` / `videoTitle`, keeps `previousImageUrl` |

---

## Full inventory of video-capable fields

### BlessBoard — convertible (Image **or** YouTube URL)

| Page / surface | Section key | Editor | Public renderer | Classification |
|----------------|-------------|---------|-----------------|----------------|
| Home | `hero` | Structured `editKind=image` (editable-image) + `editKind=video` | Full-bleed `<img>` (YouTube embed = **V2-MEDIA-01 backlog**) | **CONVERTIBLE** |
| About, Contact, Giving, Leadership, Ministries, Events, Sermons, Announcements | `hero` (via `page-hero.ejs`) | Dual pencils: Photograph / YouTube | `<img class="bb-tp-page-hero__img">` | **CONVERTIBLE** |

Contact was the reported repro: photograph after video did not survive publish.

### BlessBoard — image-only (do **not** silently convert)

| Surface | Notes |
|---------|-------|
| Welcome / story / gallery / Life Together / visitor CTA / logos / OG | Structured or inline **image** only |
| Leaders, ministries, events, sermons thumbnails, giving QR | Entity image fields — no video editKind |
| Soft-fill demo assets | SYSTEM_ONLY until replaced |

### BlessBoard — video-adjacent / not website section conversion

| Surface | Classification |
|---------|----------------|
| Sermon `mediaUrl` / A/V HTTPS links | External URL fields (sermon entity), not hero conversion |
| Apex marketing “Watch the video” | SYSTEM / marketing — out of tenant CMS |

### ActiveClinic

| Surface | Classification |
|---------|----------------|
| Public / tenant / booking templates | **No** `editKind=video` / page-hero YouTube controls found |
| Shared `mediaService` `mediaKind=video_url` | Library can store a URL asset; **no** AC public convertible section UI in this release |
| Internal ops Stitch | Out of scope for website section conversion |

**AC conversion matrix:** no supported convertible fields today — documented, not silently invented.

---

## Conversion support matrix

| Field | Image → YouTube | YouTube → Image | Notes |
|-------|-----------------|-----------------|-------|
| BB page-hero (`hero`) | Supported (URL + optional poster) | Supported (upload / Content Library) | Clears active opposite type; retains `previous*` |
| BB home hero | Supported | Supported (via image path + video pencil) | Home video payload now binds live `layoutMetadata.videoUrl` |
| AC website sections | N/A | N/A | No convertible UI |
| Image-only sections | Unsupported | Unsupported | Do not expose video pencil |
| V2-MEDIA-01 public YouTube embed | Backlog | Backlog | Preserve URL persistence; public still shows poster/photo |

**Unsupported conversions (explicit):**

- Contact **page redesign** remaining Stitch work → still tracked as **V2-BB-CONTACT-01** (layout/video framing), separate from persistence fix.
- Full YouTube player on public heroes → **V2-MEDIA-01**.
- Video **file** upload / Hostinger video binaries → blocked by design.
- AC inventing convertible heroes without schema/UI → not done.

---

## Shared platform implementation details

1. **Media selector:** Structured editor titles + mode hints — Photograph vs YouTube; Image mode uses Upload from Computer + Content Library; YouTube mode accepts approved https YouTube/Vimeo URLs (existing validation), optional poster via same picker.
2. **Persistence:** Versioned structured drafts → publish apply writes `mediaUrl` + `layoutMetadata.mediaKind` / video fields through shared helper.
3. **Reversible:** `previousVideoUrl` / `previousVideoTitle` / `previousImageUrl` retained when switching modes (not hard-deleted).
4. **Isolation:** Section-scoped drafts only; Bug 16 About `life_together` vs `gallery_*` helpers + tests retained.
5. **CDN:** Images via existing Hostinger/`publicSrc` path; no video binaries stored.

### Files changed

- `src/blessboard/website/sectionMediaDraftFields.js` (**new**)
- `src/blessboard/services/websiteDraftApplyService.js`
- `src/blessboard/services/websiteStructuredDraftService.js`
- `src/blessboard/services/websiteDraftReviewService.js`
- `public/blessboard/v5/website-structured-edit.js` (cache bust `v2-bb-media-conv-1`)
- `views/blessboard/v5/partials/tenant-public-shell-end.ejs`
- `views/blessboard/v5/public/partials/page-hero.ejs`
- `views/blessboard/v5/public/home.ejs`
- `tests/v2-shared-media-type-conversion.test.js` (**new**)
- `tests/v2-bb-contact-image-replace.test.js`
- `scripts/local/v2-shared-media-type-conversion-hosted.js` (**new**)
- `docs/qa/V2_SHARED_MEDIA_TYPE_CONVERSION_AUDIT.md` (this file)

---

## Image / video persistence results (automated)

| Check | Result |
|-------|--------|
| Image draft clears YouTube + stores photo in `mediaUrl` | PASS (unit) |
| Video draft stores URL in layout; poster only in `mediaUrl` | PASS (unit) |
| Video without poster never uses YouTube as `<img src>` | PASS (unit) |
| Apply + overlay share helper; old `\|\| videoUrl` apply gone | PASS (unit) |
| Editor Image/YouTube modes + Upload/Library | PASS (contract) |
| page-hero / home convertible wiring | PASS (contract) |
| Bug 16 gallery isolation retained | PASS |
| AC no convertible video editKind | PASS (inventory) |

---

## Draft / publish / public rendering tests

| Path | Automated | Hosted |
|------|-----------|--------|
| Contact video → image draft preview | Covered by helper + Bug 21 soft-fill | Scripted |
| Contact publish after image | Apply unit + hosted script | Pending tip deploy |
| Public Contact hero shows photo (not YouTube URL) | Hosted script assert | Pending tip deploy |
| Home YouTube control payload | Contract | Spot-check in script |
| Cross-section isolation | Bug 16 tests + hosted guard | Pending tip deploy |
| Desktop / mobile | Same asset + fit preview in editor | Same public CSS |
| Existing websites with legacy `videoUrl` | Image publish clears active video, keeps `previousVideo*` | Hosted seeds video then converts |
| Newly provisioned defaults | Soft-fill image paths unchanged | Untouched |
| Shared media regression | Existing parity / isolation suites | Run after deploy |

Hosted runner: `scripts/local/v2-shared-media-type-conversion-hosted.js`  
Env: `V2_SHARED_MEDIA_CONV_EXPECTED_SHA=<12-char prefix>`

---

## Cross-section isolation verification

- Structured drafts target `pageKey` + `sectionKey` only.
- About Life Together uses `life_together` (not `gallery_N`) — `tests/v2-bb-about-image-isolation.test.js` still PASS.
- Hosted script asserts Contact photo media id is not incorrectly bound as About Life Together feature media.

---

## Existing website migration compatibility

- No DB migration required.
- Legacy sections with `layoutMetadata.videoUrl` remain valid (`mediaKind` may be absent until next edit).
- Next **image** edit sets `mediaKind: "image"` and archives prior YouTube into `previousVideo*`.
- Next **video** edit sets `mediaKind: "youtube"` and archives prior photograph into `previousImageUrl`.
- History / restore unchanged (versioned drafts + website publish history).

---

## Automated and hosted QA evidence

### Automated

```text
node --test tests/v2-shared-media-type-conversion.test.js \
  tests/v2-bb-contact-image-replace.test.js \
  tests/v2-bb-about-image-isolation.test.js
# pass 19 / fail 0
```

### Hosted

| Item | Value |
|------|-------|
| Target | `https://blessboard.neuniversity.org` (+ AC healthz SHA family) |
| Script | `scripts/local/v2-shared-media-type-conversion-hosted.js` |
| Result | **Pending** until tip SHA is live on `moovex-platform-v8-testing` |
| Evidence file | `/tmp/v2-shared-media-type-conversion-hosted.json` (after run) |

---

## Deployment SHA

| Surface | SHA |
|---------|-----|
| Source tip (this change set) | *fill after commit* |
| Hosted `blessboard.neuniversity.org` `/healthz` | *fill after deploy* |
| Hosted `activeclinic.neuniversity.org` `/healthz` | *fill after deploy* |
| Production `blessboard.pronline.org` | Must remain non-V8 / unchanged |

---

## Outstanding gaps and dependencies

1. **V2-MEDIA-01** — public responsive YouTube embed / shared player (backlog). Conversion persists URLs; public heroes still show photograph/poster.
2. **V2-BB-CONTACT-01** — Contact page Stitch redesign video→image framing (design pending); persistence bug fixed independently.
3. ActiveClinic — no convertible section UI yet; library `video_url` kind only.
4. Hosted PASS required to promote status to `V2_SHARED_MEDIA_CONVERSION_QA_PASS`.

---

## Production untouched

**YES** — Neuniversity V2.0 / V8 testing only; production hosts not deployed or mutated by this work.
