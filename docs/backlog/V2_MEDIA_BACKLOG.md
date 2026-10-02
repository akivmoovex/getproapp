# V2.0 Media & BlessBoard Content Backlog

**Branch / environment:** Neuniversity V2.0 testing (`V8`) only  
**Production:** out of scope — do not implement against production  
**Purpose:** Product backlog for shared platform media capabilities and BlessBoard content surfaces that depend on them.

Do **not** implement items marked **BACKLOG — NOT IMPLEMENTED** or **BACKLOG — DESIGN PENDING** until explicitly scheduled. Documentation-only entries must not change application code, schema, deployment, or production.

---

## Index

| ID | Title | Products | Status | Priority |
|----|-------|----------|--------|----------|
| **V2-MEDIA-01** | YouTube-only video support | BlessBoard, ActiveClinic | **BACKLOG — NOT IMPLEMENTED** | P1 |
| **V2-BB-SERMONS-01** | BlessBoard Sermons redesign | BlessBoard | **BACKLOG — DESIGN PENDING** | P1 |
| **V2-BB-GIVING-01** | Giving page YouTube player (Generosity section) | BlessBoard | **BACKLOG — DESIGN PENDING** | P1 |
| **V2-BB-CONTACT-01** | Contact page video-to-image redesign | BlessBoard | **BACKLOG — DESIGN PENDING** | P1 |

---

## V2-MEDIA-01 — YouTube-only video support

| Field | Value |
|-------|--------|
| **ID** | V2-MEDIA-01 |
| **Title** | YouTube-only video support |
| **Products** | BlessBoard, ActiveClinic |
| **Scope** | Shared platform video handling (website content / CMS editors) |
| **Status** | **BACKLOG — NOT IMPLEMENTED** |
| **Priority** | P1 |
| **Added** | 2026-09-21 |
| **Implementation** | None — documentation only |

### Summary

Allow church and clinic website editors to attach **YouTube videos** to website content by pasting an approved YouTube URL. The platform must validate the URL, convert it into a safe responsive embed, and keep the existing draft → preview → publish → history lifecycle. **No direct video-file uploads** and **no storage of video binaries** on Hostinger, CDN object storage, or the database.

### Requirements

1. Support adding videos to website content through **valid YouTube video URLs** only.
2. Accept approved YouTube URL formats, including at least:
   - `https://www.youtube.com/watch?v=…`
   - `https://youtu.be/…`
   - `https://www.youtube.com/shorts/…`
   - `https://www.youtube.com/embed/…`
   - Common `m.youtube.com` / `youtube-nocookie.com` variants only if explicitly allow-listed after privacy review.
3. Convert accepted links into a **safe, responsive YouTube player/embed** (iframe constrained to approved domains).
4. In the website editor, provide:
   - Video URL input  
   - Validation with clear error messages  
   - Preview of the resolved embed  
   - Replace URL / Replace video  
   - Remove video  
5. Preserve the existing **draft, preview, publish, and website-history** lifecycle (no live publish of draft-only video changes).
6. Enforce **tenant/branch ownership** and existing website **RBAC** (same gates as other website media/content edits).
7. **Do not** provide direct video-file uploads; **do not** store video binaries on Hostinger, CDN storage, or in the database. Persist only a validated URL / canonical video id + metadata needed for rendering.
8. Prevent arbitrary iframe/HTML injection; restrict embeds to **approved YouTube domains** (deny other hosts).
9. Provide an appropriate **fallback UI** when a video is private, removed, unavailable, or embedding-disabled (editor + public).
10. Reuse **shared platform components** for both products; allow product-specific display integration (BlessBoard church pages, ActiveClinic clinic pages) without forking upload/storage logic.
11. Before implementation, complete a **privacy and consent review** for third-party YouTube embeds (cookies, tracking, consent banners / regional requirements, nocookie option trade-offs).
12. Define and ship **automated + hosted QA** acceptance criteria (below) before marking done.

### Non-goals (explicit)

- Direct MP4/WebM/upload-to-CDN video hosting  
- Vimeo, Wistia, or other providers (unless a later backlog ID expands allow-list)  
- Storing binary video blobs in website JSON or Postgres  
- Arbitrary admin-supplied HTML/iframe snippets  

### Acceptance criteria

#### Functional

- [ ] Editor accepts each approved YouTube URL format and rejects non-YouTube / malformed URLs with a stable error reason.
- [ ] Accepted URLs normalize to a canonical video id; public render uses a responsive embed from an allow-listed domain only.
- [ ] Editor shows preview after a valid URL; Replace and Remove clear or update draft state without publishing.
- [ ] Draft save keeps video change unpublished; publish promotes it per existing website publish rules; history retains prior video reference.
- [ ] Unauthorized roles cannot set or publish video fields; CSRF and file/HTML injection attempts fail closed.
- [ ] Public page shows fallback (not a broken blank iframe) for private / removed / embedding-disabled videos where detectable; otherwise graceful unavailable state.

#### Security / privacy

- [ ] No raw HTML from the editor is executed; only structured URL → embed builder.
- [ ] Iframe `src` host allow-list is enforced server-side and client-side.
- [ ] Privacy/consent review recorded (decision on youtube-nocookie, consent UX, documentation for tenants).
- [ ] No video bytes written to Hostinger/CDN media buckets or DB BYTEA/blob columns.

#### Shared platform

- [ ] Shared validation + embed helpers used by BlessBoard and ActiveClinic.
- [ ] Product templates consume shared component; product-specific layout only.

#### Automated QA

- [ ] Unit/contract tests for URL parse/normalize/reject matrix (watch, youtu.be, shorts, embed, garbage, non-YouTube).
- [ ] Tests assert embed builder never emits non-allow-listed hosts or inline scripts.
- [ ] RBAC/CSRF regression coverage for video field write paths.

#### Hosted QA (Neuniversity V2 / disposable tenants only)

- [ ] BlessBoard: authorized editor adds YouTube URL → draft preview → publish → anonymous public embed; remove/replace cycle.
- [ ] ActiveClinic: same lifecycle on an applicable public content surface.
- [ ] Confirm no new objects in Hostinger media paths for the video (metadata/URL only).
- [ ] Production (`pronline.org`) untouched.

### Implementation notes (when scheduled)

- Prefer extending existing website structured/inline editors and content models that already support `video` / media URL shapes where present (e.g. BlessBoard structured `buildVideoForm` patterns) — **without** enabling file upload for video.
- Align with shared media ownership rules used for images (tenant scope, draft/publish), but keep video references URL-only.
- Record privacy review outcome in this backlog item or a linked ops/privacy note before coding starts.

### Status history

| Date | Status | Note |
|------|--------|------|
| 2026-09-21 | **BACKLOG — NOT IMPLEMENTED** | Documented from V2.0 backlog request. No application, schema, deploy, or production changes. |

---

## V2-BB-SERMONS-01 — BlessBoard Sermons redesign

| Field | Value |
|-------|--------|
| **ID** | V2-BB-SERMONS-01 |
| **Title** | BlessBoard Sermons redesign |
| **Product** | BlessBoard |
| **Scope** | Public church mini-website Sermons page (tenant + branch) |
| **Status** | **BACKLOG — DESIGN PENDING** |
| **Priority** | P1 |
| **Depends on** | **[V2-MEDIA-01](#v2-media-01--youtube-only-video-support)** (shared YouTube-only video support) — required before shipping YouTube recordings / livestream embeds on this page |
| **Added** | 2026-09-21 |
| **Implementation** | None — documentation only |

### Live / design references

| Kind | URL / ID |
|------|----------|
| Current hosted page (demo) | https://blessboard.neuniversity.org/c/demo-church-22/demo-c-branch-22/sermons |
| Stitch project | [GetPro Church Platform `5087412725796049014`](https://stitch.withgoogle.com/projects/5087412725796049014) |
| Stitch — Public Church Sermons Page — Desktop (1440px) | Screen ID `679381b0eb874b2abe2fa90e925035d5` |
| Stitch — Public Church Sermons Page — Mobile (390px) | Screen ID `1cb5817988b94f9aba7676cc255d25c0` |
| Stitch — extracted text from demo sermons URL | Screen ID `d9c40e77171943388c23d4285e2bb0c7` |

Use the approved Google Stitch design as the **implementation reference when available**. Status remains **DESIGN PENDING** until layout/section hierarchy is confirmed against Stitch desktop + mobile.

### Summary

Redesign the BlessBoard public Sermons page to keep **Featured Sermon**, insert **Upcoming Sermons** (≤3, ascending by scheduled date, See More), then **Recent Sermons** (≤3, descending by sermon date, See More). Support title, speaker, date/time, description, thumbnail, and optional YouTube links via **V2-MEDIA-01** (no direct video-file uploads). Preserve existing sermon data, tenant/branch ownership, website editing, CDN thumbnails, draft/publish, and RBAC.

### Requirements

1. **Preserve** the existing Featured Sermon section.
2. Add **Upcoming Sermons** immediately below Featured Sermon and **above** Recent Sermons.
3. Show **up to three** upcoming sermons, sorted by **scheduled date ascending**. Provide **See More** for additional upcoming sermons.
4. Show **up to three** recent sermons, sorted by **sermon date descending**. Provide **See More** for additional recent sermons.
5. Classify **completed sermon events** as recent using the **church timezone** and the recorded event date/time. Do **not** move unrelated past events (non-sermon) into the sermons lists.
6. Support sermon fields: **title**, **speaker**, **date/time**, **description**, **thumbnail**, and optional **YouTube link**.
7. Support YouTube-hosted **recordings** and scheduled **livestreams** using safe responsive embeds (**depends on V2-MEDIA-01**).
8. **Do not** support direct video-file uploads.
9. Integrate with existing **tenant/branch** data, website editing, media/CDN (thumbnails), draft/publish lifecycle, and RBAC.
10. **Preserve** existing sermon records and website content during future implementation (no destructive migration; additive UX/data classification only).
11. Use the approved **Google Stitch** design as the implementation reference when available (desktop + mobile screens above).
12. Add **acceptance tests** for sorting, three-card limit, See More, video playback, mobile layouts, and publication permissions.

### Non-goals (explicit)

- Replacing Featured Sermon with a different hero pattern without Stitch/product approval  
- Pulling arbitrary past church events into Recent Sermons  
- Direct MP4/WebM or CDN video binary hosting (blocked; use V2-MEDIA-01)  
- Implementing before V2-MEDIA-01 if YouTube playback is in scope for the same release  

### Known code gaps (pre-implementation — backlog only)

> **Update (2026-09-21 / Bug 19):** Sermon thumbnail durability is addressed by additive migration `113_sermon_thumbnail_image_url.sql` plus repo/draft-apply/content-admin wiring. Remaining items below that still apply to the broader Sermons redesign (Upcoming/Recent/YouTube) stay in scope for **V2-BB-SERMONS-01**.

1. ~~**No durable sermon thumbnail column**~~ — **Addressed in Bug 19** (`blessboard.sermons.image_url`).
2. ~~**Draft apply drops sermon images**~~ — **Addressed in Bug 19** (`websiteDraftApplyService` passes `payload.imageUrl`).
3. Soft-fill vs persistence — soft-fill remains for empty tenants; once a tenant thumbnail is published it must round-trip via `image_url` (verify in Bug 19 QA).
4. ~~**Platform preference (shared)**~~ — **Addressed in Bug 19** (`website-structured-edit.js` prefers `publicSrc` before `deliveryPath`).

### Acceptance criteria (when implementation is scheduled)

#### Information architecture / sorting

- [ ] Featured Sermon section remains present and functionally equivalent (or Stitch-aligned) for published featured content.
- [ ] Page order: Featured → Upcoming → Recent.
- [ ] Upcoming: max **3** cards; sort **scheduled date ascending** (earliest first); See More reveals additional upcoming items.
- [ ] Recent: max **3** cards; sort **sermon date descending** (newest first); See More reveals additional recent items.
- [ ] “Recent” classification uses church timezone + recorded sermon event date/time; non-sermon past events are excluded.

#### Content / media

- [ ] Cards/detail support title, speaker, date/time, description, thumbnail (existing CDN/image pipeline).
- [ ] Sermon thumbnail **persists** via additive durable column/media-ref + draft apply/repo (closes known gaps above); soft-fill alone is insufficient.
- [ ] Optional YouTube URL uses V2-MEDIA-01 validation + safe embed for recordings and livestreams.
- [ ] No video-file upload affordance on sermon forms or public editor.

#### Platform integration

- [ ] Tenant/branch scoping, website draft/preview/publish/history, and RBAC unchanged in authority.
- [ ] Existing sermon rows and published media URLs remain intact after deploy (additive schema only if required; no wipe).

#### Design

- [ ] Desktop (~1440) and mobile (~390) layouts match approved Stitch Sermons screens (or recorded `PRODUCT_DECISION_DIFFERENCE`).
- [ ] Design status cleared from **DESIGN PENDING** once Stitch parity is signed off.

#### Automated QA

- [ ] Unit/integration tests: upcoming asc sort, recent desc sort, three-card caps, See More pagination/expand behavior.
- [ ] Timezone classification tests for completed sermon vs non-sermon events.
- [ ] Publication permission tests (unauthorized cannot publish sermon list changes).

#### Hosted QA (Neuniversity V2 / disposable tenants only)

- [ ] Disposable church: Featured + Upcoming (≤3 + See More) + Recent (≤3 + See More) on public `/sermons` (and branch path as applicable).
- [ ] YouTube preview/playback via V2-MEDIA-01 on a disposable sermon (when V2-MEDIA-01 is available).
- [ ] Mobile + desktop layout smoke vs Stitch references.
- [ ] Production untouched.

### Status history

| Date | Status | Note |
|------|--------|------|
| 2026-09-21 | **BACKLOG — DESIGN PENDING** | Documented from V2.0 backlog request. Depends on **V2-MEDIA-01**. Stitch project + D/M sermon screens recorded. No application, schema, deploy, or production changes. |

---

## V2-BB-GIVING-01 — Giving page YouTube player (Generosity with Charity and Care)

| Field | Value |
|-------|--------|
| **ID** | V2-BB-GIVING-01 |
| **Title** | Giving page YouTube player |
| **Product** | BlessBoard |
| **Page** | Church mini-website → Giving |
| **Section** | Generosity with Charity and Care |
| **Status** | **BACKLOG — DESIGN PENDING** |
| **Priority** | P1 |
| **Depends on** | **[V2-MEDIA-01](#v2-media-01--youtube-only-video-support)** — shared YouTube-only video support. **Do not** create a separate BlessBoard video system. |
| **Added** | 2026-09-21 |
| **Implementation** | None — documentation only |

### Live / design references

| Kind | URL / note |
|------|------------|
| Current hosted Giving page (demo) | https://blessboard.neuniversity.org/c/demo-church-22/demo-c-branch-22/giving |
| Stitch | **Create Stitch design before implementation.** Preserve existing Giving page styling; place the player naturally within **Generosity with Charity and Care**. Record Stitch project/screen IDs here when approved. |

### Summary

Add a responsive **16:9 YouTube player** inside the existing **Generosity with Charity and Care** section on the Giving page. Authorized website admins add/edit/replace/remove the YouTube URL (and optional thumbnail/preview where supported) via the website editor. Reuse **V2-MEDIA-01** only — no file uploads, no video binaries in DB/Hostinger/CDN. Preserve layout, text, branding, giving methods, draft/preview/publish/history, RBAC, and tenant/branch isolation.

### Requirements

1. Preserve the existing section layout, text, branding, and giving functionality.
2. Add a responsive **16:9** YouTube video player within the section.
3. Allow authorized church website administrators to **add, edit, replace, and remove** the YouTube video URL through the website editor.
4. Provide an editable video **thumbnail or preview image** where supported.
5. Accept only approved YouTube URLs (watch, youtu.be, shorts, embed) via V2-MEDIA-01 validation.
6. Do **not** support direct video-file uploads.
7. Do **not** store video files in the database, Hostinger storage, or CDN.
8. Use a **safe YouTube embed** that prevents arbitrary iframe or HTML injection (V2-MEDIA-01).
9. Show an appropriate **placeholder** or **hide** the player when no video is configured.
10. Handle unavailable, private, and embedding-disabled videos gracefully.
11. Preserve existing website **draft, preview, publish, and version-history** functionality.
12. Support **desktop and mobile** layouts.
13. Preserve **tenant and branch isolation**, RBAC, and publication permissions.
14. Reuse the shared platform YouTube player from **V2-MEDIA-01**. Do not create a separate BlessBoard video system.
15. Include automated and hosted QA acceptance criteria (below).

### Design gate

- Status remains **DESIGN PENDING** until a Stitch design for this section/player placement is created and approved.
- Implementation must not start until **V2-MEDIA-01** is available for the YouTube embed path (or is delivered in the same coordinated release with shared components first).

### Acceptance criteria (when implementation is scheduled)

#### UX / layout

- [ ] Generosity with Charity and Care text, branding, and giving flows unchanged aside from the added player region.
- [ ] Player is responsive **16:9** and fits desktop + mobile within existing Giving styling.
- [ ] No video configured → placeholder or player hidden (no empty broken iframe).
- [ ] Stitch-approved placement recorded; visual parity or documented `PRODUCT_DECISION_DIFFERENCE`.

#### Editor / lifecycle

- [ ] Authorized admin can add, edit, replace, remove YouTube URL in website editor.
- [ ] Optional thumbnail/preview editable where supported (existing image/CDN pipeline for stills only — not video bytes).
- [ ] Draft / preview / publish / history behave like other website media fields.
- [ ] Unauthorized roles cannot change or publish the video field; CSRF enforced.

#### Video / security (via V2-MEDIA-01)

- [ ] Only approved YouTube URL formats accepted; non-YouTube rejected.
- [ ] No video-file upload UI or API path on Giving.
- [ ] No video binaries written to DB, Hostinger, or CDN.
- [ ] Embed allow-list only; no arbitrary HTML/iframe injection.
- [ ] Graceful fallback for private / removed / embedding-disabled videos.

#### Automated QA

- [ ] Contract tests: Giving section video field wiring uses shared V2-MEDIA-01 helpers (not a BB-only embed builder).
- [ ] URL accept/reject matrix; empty-state placeholder/hide behavior.
- [ ] RBAC/publish permission tests for the Giving video field.

#### Hosted QA (Neuniversity V2 / disposable tenants only)

- [ ] Disposable church Giving page: set YouTube URL → draft preview → publish → anonymous public 16:9 player.
- [ ] Replace and remove cycles; empty state after remove.
- [ ] Desktop + mobile layout smoke.
- [ ] Confirm no new Hostinger video objects (URL/metadata only).
- [ ] Production untouched.

### Status history

| Date | Status | Note |
|------|--------|------|
| 2026-09-21 | **BACKLOG — DESIGN PENDING** | Documented from V2.0 backlog request. Depends on **V2-MEDIA-01**. Stitch design to be created before implementation. No application, schema, deploy, or production changes. |

---

## V2-BB-CONTACT-01 — Contact page video-to-image redesign

| Field | Value |
|-------|--------|
| **ID** | V2-BB-CONTACT-01 |
| **Title** | Contact page video-to-image redesign |
| **Product** | BlessBoard |
| **Page** | Church mini-website → Contact |
| **Status** | **BACKLOG — DESIGN PENDING** |
| **Priority** | P1 |
| **Depends on** | V2.0 shared image-upload and editability improvements (**Bug 04** media parity / shared platform image picker + Hostinger CDN). Reuse existing Upload from computer / Content Library / Replace image controls — do not invent a Contact-only uploader. |
| **Added** | 2026-09-21 |
| **Implementation** | None — documentation only |

### Live / design references

| Kind | URL / note |
|------|------------|
| Current hosted Contact page (demo) | https://blessboard.neuniversity.org/c/demo-church-22/demo-c-branch-22/contact |
| Stitch | **Update the existing Contact page design in Google Stitch before implementation.** Preserve current BlessBoard branding and visual language. Record Stitch project/screen IDs here when approved. |

### Summary

Replace the Contact page **video** section with a **photograph** section consistent with other photo-based blocks on the church mini-website. Admins edit the image via the shared platform picker (computer upload, Content Library, replace, preview). Default soft-fill uses an approved church template asset. Preserve contact details, enquiry form, navigation, draft/preview/publish/history, RBAC, CSRF, and tenant/branch isolation.

### Requirements

1. Remove the video player from the Contact page section and replace it with a photograph.
2. Preserve the section’s purpose, position, heading, description, and surrounding content unless the approved Stitch design specifies otherwise.
3. Match image layout, aspect ratio, border radius, spacing, and visual styling of existing BlessBoard photo sections.
4. Provide a suitable **default photograph** using an existing approved church template asset.
5. Allow authorized website administrators to **upload from computer**, **Choose from Content Library**, **replace**, and **preview** changes.
6. Reuse the shared platform image picker/uploader and existing Hostinger/CDN infrastructure (Bug 04 / shared media field).
7. Store the selected image through the existing durable media-reference system. Do **not** introduce hardcoded tenant image URLs or binary image storage in website JSON.
8. Preserve website draft, preview, publish, history, and restore functionality.
9. Preserve tenant/branch isolation, RBAC, CSRF protection, and publication authorization.
10. Ensure desktop and mobile layouts remain consistent with the existing mini-website.
11. Preserve all existing contact functionality (contact details, enquiry form, navigation).
12. Define automated and hosted QA acceptance criteria (below).

### Design gate

- Status remains **DESIGN PENDING** until Stitch Contact page design (video → image) is updated and approved.
- Do not implement until Bug 04 shared image-upload/editability path is the authoritative editor control for this field.

### Non-goals (explicit)

- Adding YouTube or other video to Contact as part of this item (out of scope; Contact becomes image-based).  
- A Contact-only media upload pipeline separate from shared platform media.  
- Hardcoding demo-church or tenant-specific CDN URLs in templates for live content (template soft-fill defaults only).  

### Acceptance criteria (when implementation is scheduled)

#### Content / visual

- [ ] Contact page no longer renders a video player in the target section; a photograph is shown instead.
- [ ] Layout/aspect/radius/spacing align with other BlessBoard photo sections (or Stitch-approved variance documented).
- [ ] Default template photograph appears when no tenant image is set.
- [ ] Heading, description, contact details, enquiry form, and nav remain intact unless Stitch explicitly changes them.

#### Editor / media

- [ ] Authorized admin can Upload from computer, Choose from Content Library, Replace, and preview (shared picker).
- [ ] Image stored as durable media reference (`publicSrc` / media id); no binary in website JSON; no hardcoded tenant URLs for live content.
- [ ] Draft → preview → publish → history/restore unchanged in authority.
- [ ] CSRF + RBAC + tenant/branch isolation enforced.

#### Automated QA

- [ ] Contract tests: Contact section uses image editor (not video form) and shared media field/picker wiring.
- [ ] Soft-fill default asset present when empty; tenant media reference persists after draft save.
- [ ] Regression: enquiry form and contact channels still present in markup.

#### Hosted QA (Neuniversity V2 / disposable tenants only)

- [ ] Disposable church Contact: replace image → draft preview → publish → anonymous public shows CDN image.
- [ ] Desktop + mobile layout smoke vs Stitch (when available).
- [ ] Production untouched.

### Status history

| Date | Status | Note |
|------|--------|------|
| 2026-09-21 | **BACKLOG — DESIGN PENDING** | Documented from V2.0 backlog request. Depends on Bug 04 shared image upload/editability. Stitch Contact redesign before implementation. No application, schema, deploy, or production changes. |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-09-21 | Created file; added **V2-MEDIA-01** YouTube-only video support. |
| 2026-09-21 | Added **V2-BB-SERMONS-01** BlessBoard Sermons redesign (**BACKLOG — DESIGN PENDING**); dependency on **V2-MEDIA-01**. |
| 2026-09-21 | Added **V2-BB-GIVING-01** Giving page YouTube player (**BACKLOG — DESIGN PENDING**); dependency on **V2-MEDIA-01**. |
| 2026-09-21 | Added **V2-BB-CONTACT-01** Contact page video-to-image redesign (**BACKLOG — DESIGN PENDING**); dependency on Bug 04 shared image upload/editability. |
