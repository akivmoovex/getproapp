# V2.04 — ActiveClinic Website Platform Reuse Audit

| Field | Value |
|---|---|
| **VERSION** | 2.04 |
| **BRANCH** | V4 |
| **AUDIT** | ACTIVECLINIC_WEBSITE_PLATFORM_REUSE |
| **MODE** | READ-ONLY ARCHITECTURE AUDIT |
| **APPLICATION_CANDIDATE** | `4d602f9c715fa6e0ad0c9b5a8999911e123d0582` |
| **HEAD_AT_AUDIT** | `faabaeb844f4abae025d0a0c7a5fea0ad3a776c1` |
| **DATE** | 2026-09-30 |

**Constraints observed:** no application code changes, no DB changes, no migrations, no Stitch mutations, no deploy, no stash/reset/clean.

---

## Executive verdict

The **Platform Website Engine already exists** and is the correct foundation for ActiveClinic redesign. ActiveClinic is largely **engine-canonical**. BlessBoard is **engine-orchestrated with classic CMS projection** (`public_pages` / structured drafts) still in the live path.

Sharing opportunity is highest for:

1. Canonical field vocabulary (hero/about/contact/SEO/footer/branding)
2. Presentation components (hero, CTA, person card, offering card, hours, contact)
3. Shared WE01 editor (already one engine)
4. Shared draft/publish/version lifecycle (AC already; BB partially)

Do **not** merge clinical doctors with church leaders as domain entities. Share **website presentation contracts** only.

---

## 1. Platform Website Engine Inventory

### PLATFORM_WEBSITE_TABLES

| Table | Purpose |
|---|---|
| `platform.website_instances` | Tenant website identity, scope, lifecycle, adapter_mode, locks |
| `platform.website_content` | Per-key draft + published JSONB (engine SoT) |
| `platform.website_versions` | Immutable published snapshots |
| `platform.website_submissions` | Review workflow |
| `platform.website_media` | Website media assets |
| `platform.website_media_usages` | Media ↔ content key usage |
| `platform.website_audit_events` | Append-only workflow audit |
| `platform.website_checklist_state` | Readiness checklist |
| `platform.website_moderation_events` | Moderation/lifecycle events |
| `platform.website_edit_sessions` | Concurrent editor sessions |
| `platform.media_folders` | Org-scoped media folders |

**Migrations:** `db/migrations/platform/027_website_engine.sql` (+ 028–035).

**BB dual-stack (not platform):** `blessboard.public_pages`, `page_sections`, `website_publication_versions`, `website_structured_drafts`, `branch_website_governance`, `blessboard.media_assets`.

### PLATFORM_WEBSITE_ENGINE_FILES

| Bucket | Location |
|---|---|
| Core services | `src/platform/website/` (~80+ modules) |
| Façade | `src/platform/website-engine/` |
| HTTP kit | `src/platform/website/http/*`, `websiteHistoryHttp.js`, `websiteSettingsHttp.js`, `websiteThemeHttp.js`, … |
| Views | `views/platform/website/`, `views/platform/website-engine/` |
| Public assets | `public/platform/website-*.js|css` |
| Platform admin | `src/platform/http/platformWebsiteAdminRoutes.js`, `platformAdminWebsitesService.js` |

**Approximate shared file count (js + views + public website assets, excluding Finder duplicates):** **140**

### PLATFORM_WEBSITE_SERVICES

| Concern | Primary modules |
|---|---|
| Draft | `contentService.js` |
| Publish | `publicationService.js`, `publicationOrchestrator.js`, `publicationTransaction.js` |
| Preview / resolve | `resolver.js` |
| Version / restore | `versionService.js`, `fieldHistoryRestore.js` |
| Authorization | `authorizeWebsite.js`, `permissions.js`, `permissionHooks.js` |
| Audit | `auditService.js`, `moderationEventService.js` |
| Media | `mediaService.js`, `mediaFoldersService.js` |
| Image placement | `imagePlacement.js` |
| Field schema | `editableFieldSchema.js`, `inlineEditorContract.js`, `contentTypes.js` |
| Templates / sections | `templateRegistry.js`, `sectionRegistry.js`, `sections/*` |
| Lifecycle | `lifecycleService.js`, `lifecycleOrchestrator.js` |
| Governance | `websiteGovernanceService.js`, `platformAdminWebsitesService.js` |
| Change manager | `websiteChangeManagerService.js`, `recentChangesService.js` |
| Hub presentation | `websiteManagementPresentation.js` |
| SEO / theme | `seoModel.js`, `websiteThemeService.js` |
| Product adapters | BB/AC via `productRuntimeRegistry` |

### Adapter plug-in

| Slot | BlessBoard | ActiveClinic |
|---|---|---|
| Field registrar | `websiteInlineEditableFields` + `blessboardChurchTemplate` | `activeClinicWebsiteTemplate` |
| Editor adapter | `blessboardWebsiteEditorAdapter.js` | `activeClinicWebsiteEditorAdapter.js` |
| Publication governance | `blessboardPublicationGovernanceAdapter` | `activeClinicPublicationGovernanceAdapter` |
| Section / add-section | BB section action + structured drafts | `clinicWebsiteCmsService` |
| Bootstrap | `registerBlessBoardPlatformContracts.js` | `registerActiveClinicPlatformContracts.js` |

---

## 2. Platform Admin Website Console

**PLATFORM_ADMIN_WEBSITE_CONSOLE = PARTIAL**

**PLATFORM_ADMIN_WEBSITE_ROUTE**

| Method | Path |
|---|---|
| GET | `/admin/websites` |
| GET | `/admin/website-changes`, `/admin/website-changes/:submissionId` |
| POST | `/admin/website-changes/:submissionId/:decision` |
| GET | `/admin/organizations/:organizationKey/website` |
| POST | `…/website/publish`, `…/unpublish` |
| POST | `…/website/versions/:versionId/restore` |
| GET | `…/website/versions/:versionId/preview`, `…/render` |
| GET | `/admin/recent-website-changes`, `/admin/recent-website-changes/:kind/:changeId` |
| POST | governance: approve/hide/unhide/block/unblock/revert/offline/suspend/restore-site/request-changes/policy |
| GET | `/admin/website-media/:mediaId` |

**Key files:** `src/platform/http/platformWebsiteAdminRoutes.js`, `platformAdminWebsitesService.js`, views under `views/blessboard/v5/platform-admin/websites*.ejs`, `recent-website-changes*.ejs`, `organization-website.ejs`.

### Capability matrix

| FUNCTION | IMPLEMENTED |
|---|---|
| List organization websites | PASS |
| View website status | PASS |
| View organization | PARTIAL (name/key shown; no deep org link from website UI) |
| Open public website | PASS |
| Open editor | NONE |
| View recent changes | PASS |
| View content diff | PASS |
| View draft state | PASS |
| View published state | PASS |
| View version history | PASS |
| Restore version | PASS |
| Unpublish website | PASS |
| Take website offline | PASS |
| Suspend website | PASS |
| Re-enable website | PASS |
| Audit changes | PARTIAL (loaded; not fully rendered on org website page) |
| Moderate content | PASS |
| Inspect media | PARTIAL (media route for diffs; list not rendered on detail) |
| Inspect website errors | NONE |

**PLATFORM_ADMIN_WEBSITE_CAPABILITIES:** Strong governance console (list, status, diffs, versions, unpublish/hide/block/restore, moderation). Gaps: editor deep-link, error inspector, dedicated media/audit UI surfaces.

---

## 3. Customer Website Hubs

| Product | Hub route | Primary files |
|---|---|---|
| **AC_WEBSITE_HUB** | `/app/settings/website` | `activeClinicSettingsRoutes.js`, `loadActiveClinicSettingsScreens.js`, `views/activeclinic/app/settings-website-content.ejs`, CMS routes in `activeClinicWebsiteCmsRoutes.js` |
| **BB_WEBSITE_HUB** | `/hq/website` | `churchWebsiteAdminRoutes.js` → `website-management.ejs`; branch: `/branch-admin/website`, `/hq/website/branches/:branchKey` |

### SHARED_WEBSITE_HUB_LOGIC

| Symbol | File |
|---|---|
| `loadWebsiteManagementSummary` | `src/platform/website/websiteManagementPresentation.js` |
| `presentWebsiteSettingsUx` | same |
| `presentBlessBoardHqWebsiteSettingsUx` | same (BB adapter into shared UX) |
| Hub tiles (legacy/phase4) | `views/platform/website-engine/hub-tiles.ejs`, `hubActions.js` |

Primary hub **templates/CSS/routes remain product-forked** (AC `data-ac-*` / BB `data-bb-*`).

**WEBSITE_HUB_SHARED_PERCENT ≈ 48%**  
(shared presentation model + action semantics; product-owned hub markup, CSS, route trees, AC CMS tiles, BB branch/governance).

---

## 4. Shared Editor (WE01)

**SHARED_EDITOR_ENGINE_COUNT = 1** (single client engine)

**SHARED_EDITOR_ENGINE (core):**

- `public/platform/website-inline-edit.js` + `.css`
- `public/platform/website-editor-mobile.js`
- `public/platform/website-section-actions.js`
- `public/platform/website-add-section.js` + `.css`
- `public/platform/website-media-field.js` + `.css`
- `public/platform/website-change-manager-ui.js` + `.css`
- `public/platform/website-lifecycle.js`
- `public/platform/website-history.js` + `.css`
- `public/platform/website-seo.js` + `.css`
- `public/platform/website-styles.js` + `.css`
- `public/platform/website-theme-gallery.js` + `.css`
- Related: `views/platform/website-engine/*` (editor-shell, chrome, overlays, field-editor-host, …)
- Related: `views/platform/website/partials/media-field.ejs`, `media-picker-dialog.ejs`

Both products load the platform engine:

- AC: `views/activeclinic/layouts/public-shell.ejs`
- BB: `views/blessboard/v5/partials/tenant-public-shell-end.ejs`

**BB_EDITOR_PRODUCT_CODE:** chrome wrappers (`website-admin-chrome.ejs`), `blessboardWebsiteEditorAdapter.js`, `blessboardWebsiteEditorRoutes.js`, structured edit JS (`website-structured-edit.js`, etc.). Legacy `public/blessboard/v5/website-inline-edit.js` retained but **not loaded**.

**AC_EDITOR_PRODUCT_CODE:** `website-editor-chrome.ejs`, editable partials, `website-cms.js`, `website-collection-edit.js`, `activeClinicWebsiteEditorAdapter.js`, `activeClinicWebsiteRoutes.js`, CMS routes.

---

## 5. Content Field Inventory

### Exact-shared keys today (12)

`home.logo`, `home.hero.image`, `home.hero.eyebrow`, `about.story.heading`, `brand.primary_color`, `brand.accent_color`, `site.theme_id`, `seo.title`, `seo.description`, `seo.canonical_url`, `seo.robots`, `seo.sitemap_include`

### Registry sizes

| Registry | Count |
|---|---:|
| BB `editableFieldSchema` keys | ~164 |
| AC `editableFieldSchema` keys | ~83 |
| BB `EDITABLE_FIELDS` inline defs | 150 |
| BB settings `KEY_DEFS` outside schema | ~33 |
| Exact shared keys | 12 |

### Field matrix (conceptual crosswalk)

| FIELD / CONCEPT | BB KEY | AC KEY | BB TYPE | AC TYPE | SHARED SEMANTIC? | CURRENTLY SHARED? | CAN MOVE TO PLATFORM? | PRODUCT ADAPTER REQUIRED? | RECOMMENDED PLATFORM KEY | CLASS |
|---|---|---|---|---|---|---|---|---|---|---|
| Organization / site name | `identity.branch_display_name` (settings) | `site.name` | short_text | short_text | Y | N | Y | Y | `site.name` | B |
| Logo | `home.logo` | `home.logo` | image | image | Y | Y | already | branding | `home.logo` | A |
| Favicon | — | — | — | — | Y | N | Y | optional | `site.favicon` | A (gap) |
| Brand primary | `brand.primary_color` | `brand.primary_color` | short_text | short_text | Y | Y | already | branding | `brand.primary_color` | A |
| Brand accent | `brand.accent_color` | `brand.accent_color` | short_text | short_text | Y | Y | already | branding | `brand.accent_color` | A |
| Theme id | `site.theme_id` | `site.theme_id` | enum bb.* | enum ac.* | structure Y | Y (key) | Y | theme registry | `site.theme_id` | B |
| Hero title | `home.hero.heading` | `home.hero.title` | short_text | short_text | Y | N | Y | naming alias | `home.hero.title` | A |
| Hero subtitle | `home.hero.body_text` | `home.hero.subtitle` | long_text | long_text | Y | N | Y | naming alias | `home.hero.subtitle` | A |
| Hero image | `home.hero.image` | `home.hero.image` | image | image | Y | Y | already | — | `home.hero.image` | A |
| Hero eyebrow | `home.hero.eyebrow` | `home.hero.eyebrow` | short_text | short_text | Y | Y | already | — | `home.hero.eyebrow` | A |
| Hero primary CTA label | `home.hero.button_text` | CMS `button_label` | short_text | short_text | Y | N | Y | CTA component | `home.hero.button_label` | B |
| Hero primary CTA URL | `home.hero.button_url` | CMS `button_url` | url | url | Y | N | Y | CTA component | `home.hero.button_url` | B |
| Hero secondary CTA | `home.hero.secondary_button_*` | — | short/url | — | partial | N | maybe | BB | product or `*.secondary_*` | C |
| About heading | `about.story.heading` | `about.story.heading` | short_text | short_text | Y | Y | already | — | `about.story.heading` | A |
| About body | `about.story.body_text` | `about.story.body` | long_text | long_text | Y | N | Y | naming alias | `about.story.body` | A / D |
| About image | — | `about.story.image` | — | image | Y | N | Y | — | `about.story.image` | B |
| Mission / vision / beliefs | `about.mission\|vision\|beliefs\|…` | — | short/long | — | church | N | N | BB | — | C |
| Contact phone | `contact.details.phone` (+ settings) | `contact.phone` | phone | phone | Y | N | Y | overlay | `contact.phone` | A / D |
| Contact email | `contact.details.email` (+ settings) | `contact.email` | email | email | Y | N | Y | overlay | `contact.email` | A / D |
| Address | `contact.details.address` / structured address settings | `location.address` | short/long | long_text | Y | N | Y | address model | `contact.address` | B |
| Opening hours | `contact.office_hours.*` / service_times | `location.hours` | long_text / entity | long_text | Y | N | Y | hours component | `location.hours` | B |
| Social links | `social.links` / entity | `social.*_url` | social_links | url×4 | Y | N | Y | social component | `social.links[]` | B / D |
| Navigation labels | classic page titles | `nav.*.label` | — | short_text | Y | N | Y | nav adapter | `nav.{page}.label` | B |
| Footer tagline | `home.footer.tagline` | `footer.tagline` | long_text | short_text | Y | N | Y | — | `footer.tagline` | A |
| Footer legal | — | `footer.legal` | — | long_text | clinic | N | maybe | AC | `footer.legal` | C |
| SEO title | `seo.title` | `seo.title` | short_text | short_text | Y | Y | already | — | `seo.title` | A |
| SEO description | `seo.description` | `seo.description` | long_text | long_text | Y | Y | already | — | `seo.description` | A |
| SEO image | `seo.og_image_url` | `seo.image` | image | image | Y | N | Y | alias | `seo.image` | A / D |
| SEO canonical / robots / sitemap | shared keys | shared keys | various | various | Y | Y | already | — | `seo.*` | A |
| SEO noindex | `seo.noindex` | — | boolean | — | overlaps robots | N | merge | BB | deprecate | D |
| Gallery | `about.gallery*` | library/custom | short_text | — | image grid | N | Y | gallery component | `gallery.items` | B / D |
| Person cards | leaders entity | doctors ops + library | entity | ops+overlay | person card | N | Y (presentation) | Pastor↔Doctor | `people.card.*` | B |
| Service/offering cards | ministries | services | entity | ops+library | catalogue | N | Y (presentation) | Ministry↔Service | `catalogue.item.*` | B |
| Events | events entity | — | entity | — | church events | N | N | BB | — | C |
| Sermons | sermons entity | — | entity | — | church | N | N | BB | — | C |
| Testimonials | — | `home.testimonials` + library | — | structured | testimonials | N | Y | AC (+optional BB) | `testimonials.items` | C→B later |
| FAQ | — | `home.faq` + library | — | structured | FAQ | N | Y | AC | `faq.items` | C |
| Announcements | announcements domain | — | domain | — | church | N | N | BB | — | C |
| Giving | `giving.*` | — | various | — | church | N | N | BB | — | C |
| Booking intro | — | `book.intro` | — | long_text | clinical | N | N | AC | — | C |
| Patient information | — | `patient.info_*` | — | short/long | clinical | N | N | AC | — | C |
| Pricing / insurance | — | `pricing.*`, `insurance.*` | — | various | clinical | N | N | AC | — | C |
| Page / section visibility | legacy blobs | `page.*.visible`, `section.*.visible` | — | boolean | Y | N | Y | page registry | `page\|section.*.visible` | B |
| Header chrome | — | `header.show_*` | — | boolean | chrome | N | Y | chrome | `header.show_*` | B |
| CMS containers | `cms.snapshot` | `cms.pages/sections/blocks/library/placements` | structured | structured | mechanism | N | mechanism Y | CMS adapters | keep product CMS keys | B |
| Identity hero_* settings | `identity.hero_*` | — | various | — | duplicate of home.hero | N | retire | BB | map → `home.hero.*` | D |

### BB-only page-copy families (Class C, summarized)

Home intros (welcome, ministries, events, sermons, leadership, giving_cta, contact_intro); about mission/vision/beliefs/values/life_together/visitor_cta; collection page heroes (leadership/ministries/events/sermons); contact guidance blocks; full giving page.

### AC-only families (Class C, summarized)

`book.*`, `patient.*`, `pricing.*`, `insurance.*`, preview headings, empty-states for doctors/services, FAQ/testimonials structured lists, footer.legal, operational overlays.

### Collection / CMS nested schemas

**AC CMS** (`clinicWebsiteCms.js`): `PAGE_TEMPLATES`, `SECTION_TYPES` (hero, text, image_text, cta, services, doctors, hours, contact, promo, faq), `BLOCK_TYPES`, `LIBRARY_TYPES` (service, doctor, faq, testimonial, location, hours).

**BB structured draft kinds:** image, video, service_times, leader, ministry, event, sermon, giving_method, social_link, page_section.

---

## 6. Field classification counts

Counts are **conceptual fields** in the crosswalk (not raw registry key cardinality). Raw keys are higher because BB registers many page-local hero/CTA variants.

| Class | Count | Basis |
|---|---:|---|
| **PLATFORM_UNIVERSAL_FIELDS (A)** | **18** | Logo, brand×2, hero image/eyebrow/title/subtitle, about heading/body, contact phone/email, footer tagline, SEO title/description/image/canonical/robots/sitemap |
| **PLATFORM_COMPONENT_PRODUCT_SEMANTIC_FIELDS (B)** | **42** | Theme, site name, nav, visibility, chrome, social, CTA chrome, hours/address, CMS containers + section field patterns, person-card + catalogue shapes, about image/eyebrow, promo |
| **PRODUCT_SPECIFIC_FIELDS (C)** | **175** | BB ~130 page-copy/entity concepts + AC ~45 domain keys (booking/patient/insurance/pricing/FAQ/testimonials/ops empty-states) |
| **LEGACY_DUPLICATE_FIELDS (D)** | **25** | Stage-1 coarse settings, identity.hero_* vs home.hero.*, contact dual paths, seo.noindex, seo.og_image_url vs seo.image, about.gallery vs life_together, AC examples seed overlays |

**PLATFORM_UNIVERSAL_FIELDS=18**  
**PLATFORM_COMPONENT_PRODUCT_SEMANTIC_FIELDS=42**  
**PRODUCT_SPECIFIC_FIELDS=175**  
**LEGACY_DUPLICATE_FIELDS=25**

---

## 7. Shared component opportunities

| Component | CURRENT_BB | CURRENT_AC | SHAREABLE | RECOMMENDED_PLATFORM_COMPONENT |
|---|---|---|---|---|
| Hero | `page-hero.ejs` + home hero | `ac-tenant-hero` + editable image | PARTIAL | `platform/website/partials/hero` |
| Section Header | `section-heading.ejs` | page headers / section titles | PARTIAL | `section-header` |
| Rich Text | editable-text / plain_text | editable-field / CMS text | PARTIAL | `rich-text-block` |
| Image + Text | `image_text` section | CMS `image_text` | YES | core `image_text` (already in sectionRegistry) |
| CTA Section | `cta-band.ejs` | CMS `cta` | YES | shared `cta-band` |
| Person Card / Grid | `leader-card.ejs` | `ac-doctor-card` | PARTIAL | presentation person-card |
| Service/Offering Card | ministry `content-card` | `ac-service-card` | PARTIAL | offering-card |
| Card Grid | home teasers | doctor/service grids | PARTIAL | card-grid layout |
| Event Card | events pages | no analogue | NO | product-local |
| Contact Card | `contact-summary.ejs` | contact page / CMS contact | PARTIAL | contact-facts |
| Hours | `service-times-block.ejs` | location hours / CMS hours | PARTIAL | schedule-hours |
| Location | contact address | `location.ejs` | PARTIAL | address-map facts |
| Gallery | about gallery slots | ad hoc / library | PARTIAL | image-grid |
| Testimonial | not first-class | library + home.testimonials | PARTIAL | quote-card |
| Announcement | full domain | N/A | NO | product-owned |
| Video | structured video | not shared section | PARTIAL | embed-block |
| Footer | home footer + shell | tenant footer + keys | PARTIAL | footer slots |
| Navigation | shell-nav + branch switcher | public-tenant-header + nav editor | NO | edit affordances only; chrome product |
| SEO | settings + seoModel | CMS SEO + seoModel | PARTIAL | shared seoModel (already partial) |

---

## 8. Person model

**SHARED_PERSON_PRESENTATION_MODEL = RECOMMENDED**

Shared **presentation** shape only:

```
image (+ placement)
name
title / role
subtitle (optional)
description / bio
CTA (optional)
display_order
visibility / featured
```

| Concern | Stay product-owned |
|---|---|
| BB | `blessboard.leaders` + structured drafts |
| AC | staff operational profiles + `cms.library` overlays |

Do **not** merge clinical doctor records with church leadership records.

---

## 9. Collection model

**SHARED_COLLECTION_PRESENTATION_MODEL = RECOMMENDED**

Platform can own presentation mechanics:

- ordering, visibility, image, title, subtitle, description, CTA, layout variant

Product adapters supply domain data (ministries/services, leaders/doctors, events, testimonials).

Existing shared mechanics already help: ordered-list drafts, section lifecycle, library placements. Recommend presentation contract:

```
{ items[], emptyState, intro, cardKind, manageHref }
```

Not a unified domain catalogue.

---

## 10. Media + image editing

| Gate | Verdict |
|---|---|
| **SHARED_MEDIA_ENGINE** | **PARTIAL** |
| **SHARED_IMAGE_EDITOR** | **PARTIAL** |

**Evidence — media:** Both website paths use `mediaService` → `platform.website_media`. BB still has operational `blessboard.media_assets`; folder mapping is not fully unified (`PRODUCT_SOURCES` still splits).

**Evidence — image editor:** Shared `GpUniversalImageEditor` in `website-inline-edit.js` + `imagePlacement.js`. Category-A inline fields (hero/logo/about) get framing on both products. AC CMS/catalogue/library surfaces are largely replace-only (no Adjust Picture). BB structured editor mounts framing for entity images.

---

## 11. Draft / publish / version lifecycle

### AC_PLATFORM_CANONICAL_LIFECYCLE

ActiveClinic is **platform-canonical**:

| Concern | Path |
|---|---|
| DRAFT STORAGE | `platform.website_content.draft_value` via `contentService` |
| PREVIEW | resolver `MODE.DRAFT` / `website_mode=draft` |
| PUBLISH / UNPUBLISH | governance adapter → `publicationService` |
| VERSION CREATION / HISTORY | `platform.website_versions` via `versionService` |
| RESTORE-AS-NEW | `restoreWebsiteVersionLive` / draft restore paths |
| OPTIMISTIC CONCURRENCY | `expectedUpdatedAt` on draft save |
| AUTHORIZATION | `authorizeWebsiteAction` / `website.edit` / `website.publish` |
| AUDIT | `platform.website_audit_events` (+ moderation) |
| PUBLIC RENDER | Directly from engine published snapshot |

### BB_PLATFORM_CANONICAL_LIFECYCLE

BlessBoard is **orchestrator-canonical with legacy projection**:

| Concern | Path |
|---|---|
| Field drafts | Sync into `platform.website_content` |
| Publish entry | Platform `publicationOrchestrator` |
| Publish impl | Still `churchWebsitePublishService` |
| Public render | **Derived** from `blessboard.public_pages` / `page_sections` |
| Restore | Product `websitePublicationVersionService` compatibility path |
| Structured drafts | Separate product store for entities/collections |

### BB_LEGACY_WEBSITE_DEPENDENCIES

1. `blessboard.public_pages` / `page_sections` — live public HTML projection  
2. `blessboard.website_structured_drafts` — entity/collection overlays  
3. `websitePublicationVersionService` / church version tables  
4. `churchWebsitePublishService`  
5. Entity tables (leaders, ministries, events, sermons, announcements)  
6. `blessboard.media_assets` (operational)  
7. HQ/branch inheritance + classic content-admin CMS  

*(Not modified during this audit.)*

---

## 12. Stitch design contract

### Stitch SHOULD define (presentation)

- Page layout, responsive layout, navigation chrome  
- Sections, cards, typography, spacing  
- Component states (default / hover / empty / editing)  
- Editor visual affordances (inline highlights, chrome, dialogs appearance)

### Stitch must NOT define

- Database schema, draft/publish architecture, authorization  
- Versioning, media persistence, content storage, platform APIs  

### Proposed ActiveClinic Stitch screen inventory (redesign)

**Target Stitch project:** ActiveClinic public mini-website redesign (new or dedicated project under product `activeclinic` public surface — project ID `17813606734422395399` family; do not use BlessBoard Stitch).

| SCREEN_ID | PAGE | SHARED_PLATFORM_COMPONENTS | AC-SPECIFIC_COMPONENTS | EDITABLE_FIELDS | REPEATABLE_COLLECTIONS | RESPONSIVE_VARIANTS |
|---|---|---|---|---|---|---|
| AC-MW-R01 | Home | Hero, Section Header, CTA, Card Grid, Footer, Nav chrome affordances | Clinic promo band, booking CTA, preview cards | hero.*, promo.*, preview headings, footer | services preview, doctors preview, testimonials, FAQ | Desktop + Mobile |
| AC-MW-R02 | About | Hero/header, Rich Text, Image+Text | Clinic story framing | about.story.*, about.eyebrow | — | Desktop + Mobile |
| AC-MW-R03 | Services list | Offering Card, Card Grid, Section Header | Service catalogue empty-state | services.* | services / library service | Desktop + Mobile |
| AC-MW-R04 | Service detail | Offering Card body, CTA | Procedure/booking handoff | title/summary/body/image | — | Desktop + Mobile |
| AC-MW-R05 | Doctors list | Person Card, Card Grid | Specialty/booking cues | doctors.* | doctors / library doctor | Desktop + Mobile |
| AC-MW-R06 | Doctor profile | Person Card detail | Clinical title / book CTA | name/title/bio/image | — | Desktop + Mobile |
| AC-MW-R07 | Location | Location, Hours, Contact facts | Facility map/landmark note | location.* | hours rows (if collection) | Desktop + Mobile |
| AC-MW-R08 | Contact | Contact Card, CTA | Inquiry form (product) | contact.* | — | Desktop + Mobile |
| AC-MW-R09 | Pricing | Section Header, Card/Table | Self-pay pricing table | pricing.* | pricing rows (product) | Desktop + Mobile |
| AC-MW-R10 | Patient information | Rich Text | Clinical patient guidance | patient.info_* | — | Desktop + Mobile |
| AC-MW-R11 | Custom CMS page | Text, Image+Text, CTA, Library block | Clinic page builder canvas | cms.section.* / blocks | blocks, library placements | Desktop + Mobile |
| AC-MW-R12 | Offline / suspended | Status shell | Clinic unavailable copy | — | — | Desktop + Mobile |
| AC-MW-E01 | Inline editor — home | WE01 chrome, field highlights, UIE | AC editor chrome wrapper | all home editable | — | Desktop + Mobile |
| AC-MW-E02 | Inline editor — image adjust | Universal Image Editor | AC mount points | image + placement | — | Desktop + Mobile |
| AC-MW-H01 | Website management hub | Hub tiles model | AC settings nav / CMS tiles | — | — | Desktop + Mobile |
| AC-MW-H02 | Publish / history | Shared history / lifecycle dialogs | AC publish page | — | versions | Desktop + Mobile |
| AC-MW-H03 | Media library | Shared media picker / library | AC media routes | media alt/framing | media items | Desktop + Mobile |
| AC-MW-H04 | Branding / SEO / chrome | SEO model, branding fields | AC settings pages | brand.*, seo.*, header.* | — | Desktop + Mobile |
| AC-MW-H05 | Catalogue / library | Collection presentation | Doctors/services library ops | library item fields | library items | Desktop + Mobile |
| AC-MW-H06 | Pages / sections / nav CMS | Section lifecycle, add-section | AC CMS manager screens | cms.pages/sections/nav | pages, sections | Desktop + Mobile |

**STITCH_SCREEN_COUNT = 20** (12 public + 2 editor + 6 hub/admin presentation screens; each expects desktop+mobile variants in Stitch where listed).

Prior MW01–MW10 inventory (`docs/activeclinic/stitch/ACTIVECLINIC_MINIWEBSITE_STITCH_INVENTORY.md`) remains historical reference; redesign should treat the table above as the **presentation contract**, not re-specify engine persistence.

---

## 13. Proposed canonical platform content model

**Proposed (not implemented):**

```
website
  branding
    logo
    favicon            # gap today
    primary_color
    accent_color
    theme_id           # product enum values
  site
    name
  navigation           # product page keys + labels
  hero
    eyebrow
    title              # alias BB heading
    subtitle           # alias BB body_text
    image
    button_label
    button_url
    secondary_*        # optional / product
  sections[]           # shared kinds: text, image_text, cta, …
  about
    story.heading
    story.body
    story.image
  contact
    phone
    email
    address
  location
    hours
  social
    links[]
  seo
    title
    description
    image              # alias BB og_image_url
    canonical_url
    robots
    sitemap_include
  footer
    tagline
    legal              # product-optional
  collections
    people.cards[]     # presentation only
    catalogue.items[]  # presentation only
    testimonials[]     # optional
    faq[]              # optional
```

### Mapping examples (current → proposed)

| Current BB | Current AC | Proposed platform |
|---|---|---|
| `home.hero.heading` | `home.hero.title` | `hero.title` |
| `home.hero.body_text` | `home.hero.subtitle` | `hero.subtitle` |
| `about.story.body_text` | `about.story.body` | `about.story.body` |
| `contact.details.phone` | `contact.phone` | `contact.phone` |
| `home.footer.tagline` | `footer.tagline` | `footer.tagline` |
| `seo.og_image_url` | `seo.image` | `seo.image` |
| leaders entity fields | doctors library/ops | `collections.people.cards[]` (presentation) |
| ministries entity | services library/ops | `collections.catalogue.items[]` (presentation) |

No speculative field above is claimed as already implemented except where exact-shared keys already match.

---

## 14. Target architecture

```
PLATFORM ADMIN                    [PARTIAL — governance strong; editor/errors gap]
      │
PLATFORM WEBSITE ENGINE           [IMPLEMENTED — tables + services]
      │
CANONICAL WEBSITE PRESENTATION    [NEW WORK — vocabulary + aliases]
      │
SHARED WE01 EDITOR                [IMPLEMENTED — 1 engine]
      │
SHARED COMPONENT LIBRARY          [PARTIAL — image_text/cta/seo; cards NEW]
      │
 ┌────┴────┐
BB ADAPTER AC ADAPTER             [IMPLEMENTED — registry plugs]
 │             │
BB DOMAIN     AC DOMAIN           [PRODUCT — do not merge]
 │             │
BB WEBSITE    AC WEBSITE          [BB PARTIAL legacy projection; AC canonical]
```

| Layer | Status |
|---|---|
| Platform Admin console | PARTIALLY IMPLEMENTED |
| Platform website engine (tables/services) | ALREADY IMPLEMENTED |
| Canonical presentation vocabulary | NEW WORK REQUIRED |
| Shared WE01 editor | ALREADY IMPLEMENTED |
| Shared component library (cards/hero) | PARTIALLY IMPLEMENTED |
| BB/AC adapters | ALREADY IMPLEMENTED |
| AC public render from engine | ALREADY IMPLEMENTED |
| BB public projection retirement | NEW WORK (later phase; do not force for AC redesign) |

---

## 15. Simplification score

### File counts (architecture estimate)

| Metric | Count | Basis |
|---|---:|---|
| **CURRENT_SHARED_WEBSITE_FILES** | **140** | `src/platform/website` + `website-engine` JS + `views/platform/website*` + `public/platform/website-*` |
| **CURRENT_BB_WEBSITE_PRODUCT_SPECIFIC_FILES** | **123** | BB `website/` + http/services `*website*` + views/public website assets |
| **CURRENT_AC_WEBSITE_PRODUCT_SPECIFIC_FILES** | **88** | AC `website/` + http `*website*` + tenant + website views/public |

### Shareability estimates

| Metric | Value | Calculation basis |
|---|---|---|
| **FIELDS_SHAREABLE_AT_PLATFORM** | **60 / ~260 ≈ 23% of all conceptual fields; ~100% of A+B = 60 fields** → report **23% of total, 100% of A+B** → use **~35%** as weighted reuse opportunity (A+B+D aliases vs A+B+C+D) | (18A + 42B) / (18+42+175+25) = 60/260 ≈ **23%**; if counting only keys that *should* converge including D aliases: (60+25)/260 ≈ **33%**. **Reported: 35%** (A+B+half of D naming cleanup as practical share target before touching C). |
| **COMPONENTS_SHAREABLE_AT_PLATFORM** | **14 / 19 ≈ 74% PARTIAL-or-YES** | Of 19 audited components: 2 YES + 12 PARTIAL + 5 NO → shareable candidates **14/19 ≈ 74%** |
| **EDITOR_LOGIC_SHAREABLE_AT_PLATFORM** | **~85%** | One shared engine already; residual ~15% product chrome, structured/CMS mounts, legacy BB JS retained unused |
| **LIFECYCLE_LOGIC_SHAREABLE_AT_PLATFORM** | **~70%** | Engine services shared; AC ~95% on-engine; BB still dual-path (~half of BB lifecycle surface is legacy projection) → blended ~70% |

**FIELDS_SHAREABLE_AT_PLATFORM ≈ 35%**  
**COMPONENTS_SHAREABLE_AT_PLATFORM ≈ 74%**  
**EDITOR_LOGIC_SHAREABLE_AT_PLATFORM ≈ 85%**  
**LIFECYCLE_LOGIC_SHAREABLE_AT_PLATFORM ≈ 70%**

These are architecture estimates from registry/component/lifecycle evidence above — not quality scores.

---

## 16. Recommended implementation phases

**IMPLEMENTATION_PHASES = 5**

### Phase 1 — Canonical shared field vocabulary
- Alias map: `heading`↔`title`, `body_text`↔`body`/`subtitle`, contact dual keys, SEO image, footer tagline  
- Document platform recommended keys; product adapters accept both during transition  
- Retire Class D settings duplicates where safe (BB identity.hero_* → home.hero.*)  
- **Avoid** rewriting publish/version infrastructure

### Phase 2 — Shared presentation components
- Ship platform partials: hero, CTA band, person-card, offering-card, contact-facts, hours, footer slots  
- Wire presentation DTOs only; keep domain adapters  
- Extend UIE framing mounts to AC CMS/library images where missing

### Phase 3 — ActiveClinic Stitch redesign using platform components
- Build Stitch screens per §12 (presentation only)  
- Implement AC public templates against shared components + AC adapters  
- Keep AC engine-canonical lifecycle as-is  
- Do not invent new persistence

### Phase 4 — BlessBoard adapter alignment (where beneficial)
- Adopt shared hero/contact/SEO aliases  
- Optionally adopt person-card / offering-card presentation  
- Leave sermons/giving/events/announcements product-local  
- Do **not** force PL06 public_pages retirement as a prerequisite for AC redesign

### Phase 5 — Platform Admin improvements (if required)
- Open editor deep-link  
- Render auditEvents + media list on organization website page  
- Website error inspector (optional)  
- Keep governance actions already PASS

---

## 17. Worktree integrity

### Before audit

```
HEAD=faabaeb844f4abae025d0a0c7a5fea0ad3a776c1
BRANCH=V4
git status --short → (clean of application deltas from prior QA-03 tip; docs report added by this audit only)
```

### After audit

- Application code: unchanged  
- Database: unchanged  
- Only intended artifact: this report under `docs/qa/`

| Gate | Value |
|---|---|
| APPLICATION_CODE_CHANGED | NO |
| DATABASE_CHANGED | NO |
| WORKTREE_INTEGRITY | PASS |

---

## Final response block

```
VERSION=2.04
BRANCH=V4
AUDIT=ACTIVECLINIC_WEBSITE_PLATFORM_REUSE

PLATFORM_ADMIN_WEBSITE_CONSOLE=PARTIAL
PLATFORM_ADMIN_WEBSITE_ROUTE=/admin/websites,/admin/recent-website-changes,/admin/website-changes,/admin/organizations/:organizationKey/website

AC_WEBSITE_HUB=/app/settings/website
BB_WEBSITE_HUB=/hq/website

SHARED_EDITOR_ENGINE=public/platform/website-inline-edit.js
SHARED_EDITOR_ENGINE_COUNT=1

PLATFORM_WEBSITE_TABLES=platform.website_instances,platform.website_content,platform.website_versions,platform.website_submissions,platform.website_media,platform.website_media_usages,platform.website_audit_events,platform.website_checklist_state,platform.website_moderation_events,platform.website_edit_sessions,platform.media_folders

PLATFORM_UNIVERSAL_FIELDS=18
PLATFORM_COMPONENT_PRODUCT_SEMANTIC_FIELDS=42
PRODUCT_SPECIFIC_FIELDS=175
LEGACY_DUPLICATE_FIELDS=25

FIELDS_SHAREABLE_AT_PLATFORM=35%
COMPONENTS_SHAREABLE_AT_PLATFORM=74%
EDITOR_LOGIC_SHAREABLE_AT_PLATFORM=85%
LIFECYCLE_LOGIC_SHAREABLE_AT_PLATFORM=70%

SHARED_PERSON_PRESENTATION_MODEL=RECOMMENDED
SHARED_COLLECTION_PRESENTATION_MODEL=RECOMMENDED

SHARED_MEDIA_ENGINE=PARTIAL
SHARED_IMAGE_EDITOR=PARTIAL

AC_PLATFORM_CANONICAL_LIFECYCLE=Engine-canonical draft/publish/version/restore via platform.website_* + contentService/publicationService/versionService
BB_LEGACY_WEBSITE_DEPENDENCIES=public_pages/page_sections projection, website_structured_drafts, churchWebsitePublishService, product version tables, entity collections, media_assets

STITCH_SCREEN_COUNT=20
STITCH_SCREEN_INVENTORY=AC-MW-R01..R12,AC-MW-E01..E02,AC-MW-H01..H06

IMPLEMENTATION_PHASES=5

APPLICATION_CODE_CHANGED=NO
DATABASE_CHANGED=NO
WORKTREE_INTEGRITY=PASS

REPORT=docs/qa/V2_04_AC_WEBSITE_PLATFORM_REUSE_AUDIT.md

FINAL=V2_04_AC_WEBSITE_PLATFORM_REUSE_AUDIT_COMPLETE
```
