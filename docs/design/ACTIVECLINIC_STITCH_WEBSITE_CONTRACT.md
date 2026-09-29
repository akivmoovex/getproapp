# ActiveClinic Stitch Website Contract (V2.04 Step 6)

| Field | Value |
|---|---|
| **VERSION** | 2.04 Overnight Step 6 |
| **STATUS** | IMPLEMENTATION / DESIGN CONTRACT (no Stitch generation; no app code) |
| **PURPOSE** | Bound the upcoming ActiveClinic Stitch redesign to shared platform presentation |
| **AUDIT** | `docs/qa/V2_04_AC_WEBSITE_PLATFORM_REUSE_AUDIT.md` |
| **PRESENTATION_MODEL** | `docs/design/PLATFORM_WEBSITE_PRESENTATION_MODEL.md` |
| **SHARED_LIBRARY** | `views/platform/website/components/*` (18 primitives) + WE01 |
| **AC_ADAPTER** | `src/activeclinic/website/activeClinicWebsitePresentationAdapter.js` |
| **STITCH_VISUAL_MAP** | `docs/design/ACTIVECLINIC_V2_04_STITCH_IMPLEMENTATION_MAP.md` (actual canvas inventory) |
| **SCREENS** | **20** planned: R01–R12 · E01–E02 · H01–H06 |
| **DO_NOT** | Implement screens · Generate Stitch · Change application code |

Architecture (frozen):

```
AC DOMAIN → AC ADAPTER → PLATFORM PRESENTATION → SHARED COMPONENT → WE01
```

---

## Frozen Stitch rules

1. **Reuse approved components** — bind UI to the shared library / presentation types below.
2. **No invented card/button/input patterns** where a shared component already exists.
3. **Stitch defines presentation only** — layout, type, spacing, states, chrome.
4. **Stitch does not define DB schema** or content storage keys inventively.
5. **Stitch does not define publish / version / draft engines.**
6. **Stitch does not define authorization.**
7. **Editor screens edit the same public components** (WE01 overlays; no parallel editor UI system).
8. **Desktop + 390px mobile** required for every public / editor screen; hub may be responsive from desktop.
9. **AC brand uses platform theme tokens** (`--gp-website-*` via AC token bridge) — no one-off hex systems that bypass the bridge.
10. **Compatible with shared inline editor** — preserve WE01 hooks (`data-website-inline`, media-field, UIE framing).

---

## Shared component catalogue (reference IDs)

| ID | Library partial |
|---|---|
| `navigation` | navigation |
| `hero` | hero |
| `section_header` | section-header |
| `rich_text` | rich-text |
| `image_text` | image-text |
| `cta` | cta |
| `person_card` / `person_grid` | person-card / person-grid |
| `collection_card` / `collection_grid` | collection-card / collection-grid |
| `contact` | contact |
| `hours` | hours |
| `location` | location |
| `gallery` | gallery |
| `video` | video |
| `announcement` | announcement |
| `footer` | footer |
| `seo` | seo (meta; not page chrome) |
| WE01 | `website-inline-edit.js` + editable-field / editable-image / media-field |

**SHARED_COMPONENTS_REFERENCED = 18** library primitives (+ WE01 as editor engine, not a visual Stitch card).

---

## Screen contracts (planned 20)

### Public — AC-MW-R01…R12

#### AC-MW-R01 — Home

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-R01` |
| **PURPOSE** | Public clinic homepage |
| **ROUTE** | `/clinics/:clinicKey` |
| **SHARED_COMPONENTS** | `navigation`, `hero`, `section_header`, `cta`, `collection_grid`, `person_grid`, `footer` |
| **AC_SPECIFIC_COMPONENTS** | Booking CTA band; home preview headings; optional promo |
| **EDITABLE_FIELDS** | `home.hero.*`, `home.promo.*`, `home.preview.*`, `footer.tagline`, `home.logo` |
| **COLLECTIONS** | services preview, doctors preview, testimonials, FAQ |
| **PRIMARY_CTA** | Book appointment (domain booking URL) |
| **EDITOR_BEHAVIOR** | WE01 inline on hero/logo/promo/footer; collection manage via hub |
| **MOBILE_REQUIREMENTS** | Desktop + 390px; sticky book/phone affordance OK |
| **PLATFORM_DATA_CONTRACT** | Class A hero/logo/footer + AC adapter collections (doctors/services/testimonials/faq) |

#### AC-MW-R02 — About

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-R02` |
| **PURPOSE** | Clinic story / about |
| **ROUTE** | `/clinics/:clinicKey/about` |
| **SHARED_COMPONENTS** | `navigation`, `section_header`, `image_text`, `rich_text`, `footer` |
| **AC_SPECIFIC_COMPONENTS** | Clinic story framing / eyebrow |
| **EDITABLE_FIELDS** | `about.story.heading`, `about.story.body`, `about.story.image`, about eyebrow |
| **COLLECTIONS** | — |
| **PRIMARY_CTA** | Contact / Book (secondary) |
| **EDITOR_BEHAVIOR** | WE01 on story fields + image framing |
| **MOBILE_REQUIREMENTS** | Desktop + 390px; image/text stack |
| **PLATFORM_DATA_CONTRACT** | `image_text` / `rich_text` via AC about adapter |

#### AC-MW-R03 — Services list

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-R03` |
| **PURPOSE** | Services catalogue |
| **ROUTE** | `/clinics/:clinicKey/services` |
| **SHARED_COMPONENTS** | `navigation`, `section_header`, `collection_grid` (offering), `footer` |
| **AC_SPECIFIC_COMPONENTS** | Empty-state copy; service icon overlay |
| **EDITABLE_FIELDS** | `services.intro`, `services.empty_*` |
| **COLLECTIONS** | clinical services → `CollectionPresentation` |
| **PRIMARY_CTA** | Service detail / Book |
| **EDITOR_BEHAVIOR** | Intro/empty WE01; items via catalogue hub |
| **MOBILE_REQUIREMENTS** | Desktop + 390px; 1-col grid |
| **PLATFORM_DATA_CONTRACT** | `adaptActiveClinicServicesCollection` |

#### AC-MW-R04 — Service detail

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-R04` |
| **PURPOSE** | Single service / procedure |
| **ROUTE** | `/clinics/:clinicKey/services/:id` |
| **SHARED_COMPONENTS** | `navigation`, `collection_card`, `cta`, `rich_text`, `footer` |
| **AC_SPECIFIC_COMPONENTS** | Booking handoff CTA |
| **EDITABLE_FIELDS** | service title/summary/body/image (catalogue overlay) |
| **COLLECTIONS** | — (single offering card) |
| **PRIMARY_CTA** | Book this service |
| **EDITOR_BEHAVIOR** | Catalogue CMS; public WE01 limited |
| **MOBILE_REQUIREMENTS** | Desktop + 390px |
| **PLATFORM_DATA_CONTRACT** | `adaptActiveClinicServiceToCard` → offering |

#### AC-MW-R05 — Doctors list

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-R05` |
| **PURPOSE** | Doctors / team directory |
| **ROUTE** | `/clinics/:clinicKey/doctors` |
| **SHARED_COMPONENTS** | `navigation`, `section_header`, `person_grid`, `footer` |
| **AC_SPECIFIC_COMPONENTS** | Specialty cue; book cue |
| **EDITABLE_FIELDS** | `doctors.intro`, `doctors.empty_*` |
| **COLLECTIONS** | doctors → `PersonPresentation[]` |
| **PRIMARY_CTA** | Doctor profile / Book |
| **EDITOR_BEHAVIOR** | Intro WE01; profiles via catalogue |
| **MOBILE_REQUIREMENTS** | Desktop + 390px |
| **PLATFORM_DATA_CONTRACT** | `adaptActiveClinicDoctorsCollection` |

#### AC-MW-R06 — Doctor profile

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-R06` |
| **PURPOSE** | Doctor detail |
| **ROUTE** | `/clinics/:clinicKey/doctors/:id` |
| **SHARED_COMPONENTS** | `navigation`, `person_card`, `cta`, `rich_text`, `footer` |
| **AC_SPECIFIC_COMPONENTS** | Clinical title / specialty / book CTA |
| **EDITABLE_FIELDS** | name, title, bio, photo (catalogue) |
| **COLLECTIONS** | — |
| **PRIMARY_CTA** | Book with doctor |
| **EDITOR_BEHAVIOR** | Catalogue CMS media-field |
| **MOBILE_REQUIREMENTS** | Desktop + 390px |
| **PLATFORM_DATA_CONTRACT** | `adaptActiveClinicDoctorToPerson` |

#### AC-MW-R07 — Location

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-R07` |
| **PURPOSE** | Facility location + hours |
| **ROUTE** | `/clinics/:clinicKey/location` |
| **SHARED_COMPONENTS** | `navigation`, `location`, `hours`, `contact`, `footer` |
| **AC_SPECIFIC_COMPONENTS** | Map/landmark note |
| **EDITABLE_FIELDS** | `location.*`, hours text/rows |
| **COLLECTIONS** | optional hours rows |
| **PRIMARY_CTA** | Get directions / Contact |
| **EDITOR_BEHAVIOR** | WE01 on location/hours/contact keys |
| **MOBILE_REQUIREMENTS** | Desktop + 390px |
| **PLATFORM_DATA_CONTRACT** | AC location/hours/contact adapters |

#### AC-MW-R08 — Contact

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-R08` |
| **PURPOSE** | Contact facts + inquiry |
| **ROUTE** | `/clinics/:clinicKey/contact` |
| **SHARED_COMPONENTS** | `navigation`, `contact`, `cta`, `footer` |
| **AC_SPECIFIC_COMPONENTS** | Inquiry form (product) |
| **EDITABLE_FIELDS** | `contact.phone`, `contact.email`, address, intro |
| **COLLECTIONS** | — |
| **PRIMARY_CTA** | Submit inquiry / Call |
| **EDITOR_BEHAVIOR** | WE01 on contact facts; form stays product |
| **MOBILE_REQUIREMENTS** | Desktop + 390px |
| **PLATFORM_DATA_CONTRACT** | `adaptActiveClinicContact` + product form |

#### AC-MW-R09 — Pricing

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-R09` |
| **PURPOSE** | Self-pay / pricing guidance |
| **ROUTE** | `/clinics/:clinicKey/pricing` |
| **SHARED_COMPONENTS** | `navigation`, `section_header`, `collection_grid` or table shell, `footer` |
| **AC_SPECIFIC_COMPONENTS** | Pricing table (product Class C) |
| **EDITABLE_FIELDS** | `pricing.*` |
| **COLLECTIONS** | pricing rows (product) |
| **PRIMARY_CTA** | Contact / Book |
| **EDITOR_BEHAVIOR** | Product settings; no new platform table engine |
| **MOBILE_REQUIREMENTS** | Desktop + 390px; scrollable table |
| **PLATFORM_DATA_CONTRACT** | Product-specific bag only (not Class A) |

#### AC-MW-R10 — Patient information

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-R10` |
| **PURPOSE** | Patient guidance copy |
| **ROUTE** | `/clinics/:clinicKey/patient-information` |
| **SHARED_COMPONENTS** | `navigation`, `section_header`, `rich_text`, `footer` |
| **AC_SPECIFIC_COMPONENTS** | Clinical guidance framing |
| **EDITABLE_FIELDS** | `patient.info_title`, `patient.info_body` |
| **COLLECTIONS** | — |
| **PRIMARY_CTA** | Book / Contact |
| **EDITOR_BEHAVIOR** | WE01 or CMS on patient keys |
| **MOBILE_REQUIREMENTS** | Desktop + 390px |
| **PLATFORM_DATA_CONTRACT** | AC product-specific preserved fields |

#### AC-MW-R11 — Custom CMS page

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-R11` |
| **PURPOSE** | Modular clinic CMS page |
| **ROUTE** | `/clinics/:clinicKey/:pageSlug` |
| **SHARED_COMPONENTS** | `navigation`, `hero`/`section_header`, `rich_text`, `image_text`, `cta`, `gallery`, `video`, `footer` |
| **AC_SPECIFIC_COMPONENTS** | Page-builder canvas chrome |
| **EDITABLE_FIELDS** | `cms.section.*` / blocks |
| **COLLECTIONS** | blocks, library placements |
| **PRIMARY_CTA** | Section CTA |
| **EDITOR_BEHAVIOR** | CMS section lifecycle + WE01 where mounted |
| **MOBILE_REQUIREMENTS** | Desktop + 390px |
| **PLATFORM_DATA_CONTRACT** | Shared section kinds via AC CMS adapter |

#### AC-MW-R12 — Offline / suspended

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-R12` |
| **PURPOSE** | Lifecycle unavailable shell |
| **ROUTE** | Public site when lifecycle offline/suspended |
| **SHARED_COMPONENTS** | `announcement` (status chrome), optional `footer` |
| **AC_SPECIFIC_COMPONENTS** | Clinic unavailable copy; lifecycle shell |
| **EDITABLE_FIELDS** | tenant-visible moderation note (read-only public) |
| **COLLECTIONS** | — |
| **PRIMARY_CTA** | — / contact phone if allowed |
| **EDITOR_BEHAVIOR** | Not editable as public content; PA/lifecycle controls |
| **MOBILE_REQUIREMENTS** | Desktop + 390px |
| **PLATFORM_DATA_CONTRACT** | `lifecycleStatus` / availability — **no second offline engine** |

---

### Editor — AC-MW-E01…E02

#### AC-MW-E01 — Inline editor (desktop)

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-E01` |
| **PURPOSE** | WE01 inline edit chrome on public pages |
| **ROUTE** | same public routes + `?website_edit=1&website_mode=draft` |
| **SHARED_COMPONENTS** | Exact public components under edit + WE01 pencil/history |
| **AC_SPECIFIC_COMPONENTS** | AC editor chrome wrapper |
| **EDITABLE_FIELDS** | All Class A/B fields mounted on the page |
| **COLLECTIONS** | Manage links to hub; no duplicate collection editor |
| **PRIMARY_CTA** | Save / publish (existing lifecycle) |
| **EDITOR_BEHAVIOR** | **SHARED_EDITOR_ENGINE_COUNT=1** — `website-inline-edit.js` only |
| **MOBILE_REQUIREMENTS** | Desktop primary; must not break 390px |
| **PLATFORM_DATA_CONTRACT** | Existing draft content + media usages |

#### AC-MW-E02 — Image adjust (mobile-capable)

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-E02` |
| **PURPOSE** | Universal Image Editor framing |
| **ROUTE** | Inline/CMS mounts → `GpUniversalImageEditor.openFraming` |
| **SHARED_COMPONENTS** | media-field + UIE (shared) |
| **AC_SPECIFIC_COMPONENTS** | Mount points only |
| **EDITABLE_FIELDS** | image + `placement` |
| **COLLECTIONS** | — |
| **PRIMARY_CTA** | Apply framing |
| **EDITOR_BEHAVIOR** | One UIE; Class B slots may stay replace-only |
| **MOBILE_REQUIREMENTS** | Usable at 390px |
| **PLATFORM_DATA_CONTRACT** | `imagePlacement.js` + `platform.website_media` |

---

### Hub — AC-MW-H01…H06

#### AC-MW-H01 — Website management hub

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-H01` |
| **PURPOSE** | Customer website hub tiles |
| **ROUTE** | `/app/settings/website` |
| **SHARED_COMPONENTS** | Hub presentation model tiles (shared semantics) |
| **AC_SPECIFIC_COMPONENTS** | AC settings nav / CMS tiles |
| **EDITABLE_FIELDS** | — (navigation to surfaces) |
| **COLLECTIONS** | — |
| **PRIMARY_CTA** | Open editor / Publish |
| **EDITOR_BEHAVIOR** | Links out; not inline public editor |
| **MOBILE_REQUIREMENTS** | Responsive from desktop Stitch |
| **PLATFORM_DATA_CONTRACT** | `websiteManagementPresentation` |

#### AC-MW-H02 — Publish / history

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-H02` |
| **PURPOSE** | Versions / publish history |
| **ROUTE** | AC website history / publish surfaces under settings |
| **SHARED_COMPONENTS** | Shared history / version list semantics |
| **AC_SPECIFIC_COMPONENTS** | AC publish page chrome |
| **EDITABLE_FIELDS** | — |
| **COLLECTIONS** | versions |
| **PRIMARY_CTA** | Publish / Restore-as-new |
| **EDITOR_BEHAVIOR** | Existing publication services only |
| **MOBILE_REQUIREMENTS** | Responsive |
| **PLATFORM_DATA_CONTRACT** | `versionService` / publication orchestrator |

#### AC-MW-H03 — Media library

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-H03` |
| **PURPOSE** | Website media + folders |
| **ROUTE** | `/app/settings/website/media` |
| **SHARED_COMPONENTS** | Shared media picker / library UX |
| **AC_SPECIFIC_COMPONENTS** | AC media routes chrome |
| **EDITABLE_FIELDS** | alt, framing (where Class A) |
| **COLLECTIONS** | media items, folders |
| **PRIMARY_CTA** | Upload / Choose |
| **EDITOR_BEHAVIOR** | `mediaService` only |
| **MOBILE_REQUIREMENTS** | Responsive |
| **PLATFORM_DATA_CONTRACT** | `platform.website_media` + folders |

#### AC-MW-H04 — Branding / SEO / chrome

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-H04` |
| **PURPOSE** | Brand, SEO, chrome settings |
| **ROUTE** | `/app/settings/website/branding`, `/seo`, `/chrome` |
| **SHARED_COMPONENTS** | branding fields, `seo`, media-field |
| **AC_SPECIFIC_COMPONENTS** | AC settings page chrome |
| **EDITABLE_FIELDS** | `brand.*`, `seo.*`, header/chrome keys |
| **COLLECTIONS** | — |
| **PRIMARY_CTA** | Save |
| **EDITOR_BEHAVIOR** | Forms + shared media-field |
| **MOBILE_REQUIREMENTS** | Responsive |
| **PLATFORM_DATA_CONTRACT** | Class A brand/SEO + AC chrome |

#### AC-MW-H05 — Catalogue / library

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-H05` |
| **PURPOSE** | Doctors/services website catalogue |
| **ROUTE** | `/app/settings/website/catalogue/*` + library |
| **SHARED_COMPONENTS** | `person_card` / `collection_card` presentation in previews |
| **AC_SPECIFIC_COMPONENTS** | Catalogue ops forms |
| **EDITABLE_FIELDS** | library doctor/service image overlays |
| **COLLECTIONS** | library items |
| **PRIMARY_CTA** | Save item |
| **EDITOR_BEHAVIOR** | Shared media-field; framing Class B as designed |
| **MOBILE_REQUIREMENTS** | Responsive |
| **PLATFORM_DATA_CONTRACT** | AC catalogue → Person/Collection adapters |

#### AC-MW-H06 — Pages / sections / nav CMS

| Field | Value |
|---|---|
| **SCREEN_ID** | `AC-MW-H06` |
| **PURPOSE** | Pages, sections, nav CMS |
| **ROUTE** | `/app/settings/website/pages` (+ sections/nav) |
| **SHARED_COMPONENTS** | Section lifecycle affordances; `navigation` labels |
| **AC_SPECIFIC_COMPONENTS** | AC CMS manager |
| **EDITABLE_FIELDS** | cms pages/sections/nav labels |
| **COLLECTIONS** | pages, sections |
| **PRIMARY_CTA** | Add section / Publish page |
| **EDITOR_BEHAVIOR** | Existing CMS section services |
| **MOBILE_REQUIREMENTS** | Responsive |
| **PLATFORM_DATA_CONTRACT** | AC CMS + shared section contract |

---

## Component reuse matrix (must stay visually identical)

Components listed **MUST** share one Stitch / implementation appearance across screens (responsive variants only).

| Shared component | R01 | R02 | R03 | R04 | R05 | R06 | R07 | R08 | R09 | R10 | R11 | R12 | E01 | E02 | H* |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `navigation` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ○ | ● | ○ | ○ |
| `footer` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ○ | ● | ○ | ○ |
| `hero` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ● | ○ | ○ |
| `section_header` | ● | ● | ● | ○ | ● | ○ | ○ | ○ | ● | ● | ● | ○ | ● | ○ | ○ |
| `cta` | ● | ○ | ○ | ● | ○ | ● | ○ | ● | ○ | ○ | ● | ○ | ● | ○ | ○ |
| `person_card`/`person_grid` | ● | ○ | ○ | ○ | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | H05 |
| `collection_card`/`grid` | ● | ○ | ● | ● | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ● | ○ | H05 |
| `image_text` / `rich_text` | ○ | ● | ○ | ● | ○ | ● | ○ | ○ | ○ | ● | ● | ○ | ● | ○ | ○ |
| `contact` / `hours` / `location` | ○ | ○ | ○ | ○ | ○ | ○ | ● | ● | ○ | ○ | ○ | ○ | ● | ○ | ○ |
| `gallery` / `video` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ● | ○ | ○ |
| `announcement` | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ |
| WE01 / media-field / UIE | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ● | H03–H05 |

● = required identical family · ○ = not primary on that screen · H* = hub uses management chrome, not public chrome.

**Do not** create alternate doctor cards, service cards, CTAs, or headers per page.

---

## Design / implementation batches (≤5)

Optimized for component reuse:

| Batch | Screens | Focus |
|---|---|---|
| **1 — Chrome + foundation** | R01, R02, R03 + shared `navigation`/`footer`/`hero`/`section_header`/`cta`/`collection_grid` | Public shell + home/about/services |
| **2 — People & offerings** | R04, R05, R06 | Person + collection detail parity |
| **3 — Visit & content** | R07, R08, R09, R10, R11, R12 | Location/contact/pricing/patient/CMS/offline |
| **4 — Editor parity** | E01, E02 | WE01 + UIE on Batch 1–3 components |
| **5 — Hub** | H01–H06 | Settings hub, media, brand/SEO, catalogue, pages, history |

**STITCH_BATCHES = 5**

---

## Notes vs live Stitch canvas

Planned codes above follow the **audit 20-screen contract**. The visual canvas (`8888814012921999511`) may renumber or add extras (booking entry, gallery) — see `ACTIVECLINIC_V2_04_STITCH_IMPLEMENTATION_MAP.md`. Implementation must prefer **existing routes** and **shared components**; extras map as EXTEND, missing planned screens (if absent in canvas) stay in this contract until designed.

---

## Step gate

| Gate | Value |
|---|---|
| STITCH_CONTRACT | **PASS** |
| SCREENS | **20** |
| SHARED_COMPONENTS_REFERENCED | **18** |
| STITCH_BATCHES | **5** |
| APPLICATION_CODE_CHANGED | **NO** |
| FINAL | **PASS** |
