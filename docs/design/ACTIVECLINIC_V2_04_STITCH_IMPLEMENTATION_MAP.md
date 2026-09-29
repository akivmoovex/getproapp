# ActiveClinic V2.04 — Stitch Website Implementation Map

| Field | Value |
|---|---|
| **VERSION** | 2.04 |
| **BRANCH** | V4 |
| **TASK** | ACTIVECLINIC_STITCH_IMPLEMENTATION_MAPPING |
| **STITCH_PROJECT_ID** | `8888814012921999511` |
| **STITCH_PROJECT_URL** | https://stitch.withgoogle.com/projects/8888814012921999511 |
| **STITCH_PROJECT_TITLE** | ActiveClinic Design System Foundation |
| **INSPECTED** | 2026-09-30 via Stitch MCP `get_project` / `list_screens` / `get_screen` |
| **AUTHORITATIVE_DESIGN** | **YES** — this project is the visual source of truth for the AC website redesign |
| **PRIOR_AUDIT** | `docs/qa/V2_04_AC_WEBSITE_PLATFORM_REUSE_AUDIT.md` |
| **PRESENTATION_MODEL** | `docs/design/PLATFORM_WEBSITE_PRESENTATION_MODEL.md` |
| **APPLICATION_CANDIDATE** | `4d602f9c715fa6e0ad0c9b5a8999911e123d0582` (unchanged by this docs commit) |
| **MODE** | READ-ONLY mapping (docs only) |

**Stitch is the visual source of truth.** Implementation must reproduce text, layout, spacing, typography, imagery, component hierarchy, and responsive behavior while preserving platform architecture (presentation model, WE01 editor, `platform.website_*` lifecycle, media engine).

Do **not** invent a second draft/publish/version/editor engine.

---

## 1. Stitch project access

| Gate | Value |
|---|---|
| **STITCH_PROJECT_ACCESS** | **PASS** |
| **STITCH_SCREEN_COUNT** | **27** (excluding design-system asset instance) |
| **DESIGN_THEME** | Clinical Clarity & Digital Care — Inter, primary `#006068`, light surfaces |

---

## 2. Authoritative screen inventory (actual Stitch)

### 2.1 Public website screens

| ID | Stitch name | Device | Planned code | Purpose | Target route | Route class |
|---|---|---|---|---|---|---|
| `9bdb512b1c774aafa5257842b28ed275` | AC-MW-R01 Clinic Homepage | DESKTOP | R01 | Public home | `/clinics/:clinicKey` | EXISTING |
| `2dc4d65a318b42b9ac8f58b1cacfdc01` | AC-MW-R01 Clinic Homepage | MOBILE | R01 | Public home mobile | same (responsive) | EXISTING |
| `5a537de24c3945eaa802173373e9d180` | AC-MW-R02 About Our Clinic | DESKTOP | R02 | About / story | `/clinics/:clinicKey/about` | EXISTING |
| `2117905e0e4d4e4db6f5742a73a46941` | AC-MW-R02 About Our Clinic | MOBILE | R02 | About mobile | same | EXISTING |
| `e8f6b836be7344d99cd9e7ad5e358c44` | AC-MW-R03 Our Services | DESKTOP | R03 | Services catalogue | `/clinics/:clinicKey/services` | EXISTING |
| `885b5a099a2b4eb69abc90498ff0ab3c` | AC-MW-R03 Our Services | MOBILE | R03 | Services mobile | same | EXISTING |
| `603e16afb6d848a3b87db84d5314b511` | AC-MW-R04 Meet Our Doctors | MOBILE | R05† | Doctors list | `/clinics/:clinicKey/doctors` | EXISTING |
| `8706630e1c574ce4884695533b968436` | AC-MW-R05 Doctor Profile | MOBILE | R06† | Doctor detail | `/clinics/:clinicKey/doctors/:id` | EXISTING |
| `49d4fdb3c71641538b2f30b5451d4fa6` | AC-MW-R06 Service Detail | MOBILE | R04† | Service detail | `/clinics/:clinicKey/services/:id` | EXISTING |
| `92f8da15fae74e4a81242c32a3e066b8` | AC-MW-R07 Contact Page | MOBILE | R08† | Contact + inquiry | `/clinics/:clinicKey/contact` | EXISTING |
| `8c8083261c694e878f1b389b83c69d21` | AC-MW-R08 Appointment Booking Entry | MOBILE | **EXTRA** | Booking handoff entry | existing booking entry routes | EXISTING (domain) |
| `65b9ec884cd6445eb1726aff9417a9bc` | AC-MW-R09 Facilities & Clinic Info | DESKTOP | R07† | Location / hours / facility | `/clinics/:clinicKey/location` (or contact/location page) | EXISTING/EXTEND |
| `bfd4f66b94ff44df9da2ec17048a30dc` | AC-MW-R09 Facilities & Clinic Info | MOBILE | R07† | Location mobile | same | EXISTING/EXTEND |
| `cbf127a8594a41e4bf467aca547ac151` | AC-MW-R10 Clinic Environment Gallery | DESKTOP | **EXTRA** | Gallery | CMS page or dedicated gallery page | EXTEND |
| `12299f9e1a164e10a35fdbeacab9ba28` | AC-MW-R10 Clinic Environment Gallery | MOBILE | **EXTRA** | Gallery mobile | same | EXTEND |
| `fdb54ad344354493b717adcf5848b60e` | AC-MW-R11 Patient Info & Guidance | DESKTOP | R10† | Patient guidance | `/clinics/:clinicKey/patient-information` (or CMS page) | EXISTING/EXTEND |
| `c9ef8d867598419bb98cf222790e34bc` | AC-MW-R11 Patient Info & Guidance | MOBILE | R10† | Patient mobile | same | EXISTING/EXTEND |
| `802776b40ddd47a6ba6a4aff4e62f3f8` | AC-MW-R12 Canonical Modular Content Page | DESKTOP | R11† | CMS modular page | `/clinics/:clinicKey/:pageSlug` | EXISTING |
| `34021a926bea485881aea5aa066c42bc` | AC-MW-R12 Canonical Modular Content Page | MOBILE | R11† | CMS page mobile | same | EXISTING |

† Planned audit codes differ from Stitch numbering — see §2.4 remapping.

**PUBLIC_SCREENS = 19** (unique Stitch screens tagged R01–R12 + companions).

### 2.2 Editor screens

| ID | Stitch name | Device | Planned | Purpose | Target | Class |
|---|---|---|---|---|---|---|
| `439db8a9c8a44d3f8459c420f3396a5c` | AC-MW-E01 Desktop Inline Edit Mode | DESKTOP | E01 | WE01 inline edit chrome | `/clinics/:key?website_edit=1&website_mode=draft` | EXISTING |
| `0d09099c45a3415dbf14adbd94a88fd9` | AC-MW-E02 Mobile Inline Edit Mode | MOBILE | E02 | Mobile inline + image adjust | same + UIE framing | EXISTING |

**EDITOR_SCREENS = 2**

### 2.3 Website hub screens

| ID | Stitch name | Device | Planned | Purpose | Target route | Class |
|---|---|---|---|---|---|---|
| `ef46f62dff8041eb8936f76b4194d414` | AC-MW-H01 Website Management Hub | DESKTOP | H01 | Hub tiles | `/app/settings/website` | EXISTING |
| `3b4ffe6c6df14ed38ec3331062176f55` | AC-MW-H02 Pages Manager | DESKTOP | H06† | Pages CMS | `/app/settings/website/pages` | EXISTING |
| `0711352486e646de80ac3c613fb1a07f` | AC-MW-H03 Brand & Appearance | DESKTOP | H04† | Branding | `/app/settings/website/branding` (+ chrome/theme) | EXISTING |
| `ae4c1d1bedca45058fc88ae891e30fc0` | AC-MW-H04 Media Library | DESKTOP | H03† | Media library | `/app/settings/website/media` | EXISTING |
| `36ee1df342644e0aa34ba8f8a70cf07a` | AC-MW-H05 Version History | DESKTOP | H02† | Versions / history | clinic website history route / hub history | EXISTING |
| `e6b21c0b3f954f1990ab908b7a0f4a10` | AC-MW-H06 Website Settings & Configuration | DESKTOP | H04/H06 | SEO/chrome/settings | `/app/settings/website/settings`, `/seo`, `/chrome` | EXISTING |

**HUB_SCREENS = 6** (desktop only in Stitch).

### 2.4 Planned vs actual deltas

| Kind | Detail |
|---|---|
| **MOBILE_COMPANIONS** | **12** explicit mobile screens (R01–R03, R04–R08 mobile-only set, R09–R12 mobile) |
| **EXTRA_SCREENS** | **2 concept families**: R08 Appointment Booking Entry; R10 Clinic Environment Gallery (+ D/M) |
| **MISSING_PLANNED_SCREENS** | **2**: planned **Pricing (R09)**; planned **Offline/suspended status shell (R12)** — Stitch R12 is modular CMS instead |
| **RENUMBERING** | Stitch R04=Doctors list, R05=Doctor profile, R06=Service detail, R07=Contact, R09=Facilities (≠ audit table order) |
| **MISSING_DESKTOP** | R04 Doctors, R05 Doctor profile, R06 Service detail, R07 Contact, R08 Booking — **mobile-only in Stitch**; implement as responsive variants of same components |
| **MISSING_MOBILE_HUB** | H01–H06 have **no** mobile companions; use responsive hub templates |
| **DESIGN_SYSTEM_ASSET** | One `DESIGN_SYSTEM_INSTANCE` on canvas (not a product screen) |

---

## 3. Design system / component families

From project `designTheme` + screen titles + design.md:

| # | Family | Notes |
|---|---|---|
| 1 | Public header / emergency utility bar | Desktop 72px + emergency top bar |
| 2 | Mobile header / sticky book bar | 60px + hamburger + phone |
| 3 | Navigation | Departmental links |
| 4 | Footer | Contact / legal / social |
| 5 | Hero / display | Inter display-hero |
| 6 | Buttons (primary/secondary/text) | Teal `#006068`, 48px min |
| 7 | Section headings | H1–H4 |
| 8 | Rich text | body-large/base |
| 9 | Image + text | Story modules |
| 10 | CTA bands | Book appointment |
| 11 | Person / doctor card | Flexible person card (4:5 / 1:1) |
| 12 | Service / collection card | Icon tile + title + chevron |
| 13 | Card grids | 3/2/1 columns |
| 14 | Contact facts | Phone/email/address |
| 15 | Hours | Facility hours |
| 16 | Location / map | Facilities page |
| 17 | Gallery | Environment gallery |
| 18 | Video | Optional embeds (CMS) |
| 19 | Announcement / chips / badges | Status pills |
| 20 | Forms | Contact / booking entry |
| 21 | Website management cards | Hub tiles |
| 22 | Editor controls | Inline pencil affordance + UIE |

**STITCH_COMPONENT_FAMILIES = 22**

---

## 4. Platform component classification matrix

| Stitch component | Class | Current platform component | Required change | BB reuse | AC domain |
|---|---|---|---|---|---|
| Header / nav / footer chrome | B | `navigation`, `footer`, branding | Extend chrome tokens for emergency bar + sticky mobile book | HIGH | clinic chrome settings |
| Hero | A | `hero` | Visual token/spacing parity only | HIGH | `home.hero.*` |
| Section heading | A | `section_heading` | Visual parity | HIGH | CMS/about |
| Rich text | A | `rich_text` | Visual parity | HIGH | about/patient/CMS |
| Image + text | A | `image_text` | Visual parity | HIGH | about |
| CTA | A | `cta` | Visual parity | HIGH | promo/book CTA |
| Doctor / person card | A/B | `person` / `person_card` | **EXTENSION**: credentials chip, specialty pill, book CTA layout | HIGH (pastor card) | **Doctor domain** |
| Service card | A/B | `collection_card` offering | **EXTENSION**: icon tile variant | HIGH (ministry) | **Service domain** |
| Card grids | A | `collection_grid` / person grid | Layout density tokens | HIGH | doctors/services |
| Contact | A | `contact` | Visual parity | HIGH | `contact.*` |
| Hours | A | `hours` | Structured rows styling | HIGH | location hours |
| Location | A | `location` | Map embed presentation | HIGH | facility |
| Gallery | A | `gallery` | Wire AC gallery page | MED | library/CMS |
| Video | A | `video` | CMS blocks | MED | CMS |
| Announcement / chips | C | announcement + new chip partial | **NEW shared chip/badge** if reused on BB | MED | status |
| Forms (contact/booking) | D/E | product forms | Keep AC forms; style only | LOW | booking/contact |
| Hub management cards | B | website management presentation | Hub tile visual refresh | HIGH | settings hub |
| Editor pencil / UIE | A | WE01 + UIE | Mount Stitch affordance chrome | HIGH | editor |
| Emergency utility bar | C/D | none shared | **NEW shared or AC chrome partial** | LOW | AC chrome |
| Offline/suspended shell | — | lifecycle status shell | **MISSING in Stitch** — keep platform lifecycle UI | HIGH | lifecycle |

### Counts

| Metric | Count |
|---|---|
| **EXISTING_PLATFORM_COMPONENTS (A)** | **14** |
| **PLATFORM_COMPONENT_EXTENSIONS (B)** | **5** (chrome, person card, service card, hub tiles, hours/location polish) |
| **NEW_SHARED_PLATFORM_COMPONENTS (C)** | **2** (status chip/badge; optional emergency utility bar if BB can share) |
| **AC_SPECIFIC_PRESENTATION_COMPONENTS (D)** | **2** (booking entry chrome; emergency bar if not shared) |
| **DOMAIN (E)** | Doctor, Service, Booking, Facility — adapters only |

---

## 5. Field mapping

### Editable / presentation fields (Stitch-facing)

| Concept | Platform / presentation | AC storage / domain | Adapter | New platform field? |
|---|---|---|---|---|
| Clinic name | branding.siteName | org/clinic display | yes | NO |
| Logo | `home.logo` (A) | `home.logo` | yes | NO |
| Brand colors | `brand.primary_color` / accent | same | yes | NO |
| Hero title/subtitle/image | `home.hero.*` (A) | AC keys | yes | NO |
| Hero CTA | hero.primaryCta | button_label/url | yes | NO |
| About heading/body/image | about / image_text | `about.story.*` | yes | NO |
| Services collection | collection offering | service catalogue | `adaptService…` | NO |
| Doctors collection | person collection | doctor catalogue | `adaptDoctor…` | NO |
| Doctor credentials/specialty | person.title / subtitle + chip | doctor profile fields | **EXTENSION** | maybe presentation-only chip |
| Contact phone/email/address | `contact.*` (A) | contact keys | yes | NO |
| City / country | location / contact address parts | facility / registration geo | product | NO (product) |
| Opening hours | `hours` | location.hours | yes | NO |
| Social links | `social_links` | social.* | yes | NO |
| Gallery items | `gallery` | CMS/library | yes | NO |
| SEO | `seo.*` (A) | seo keys | yes | NO |
| Footer tagline | `footer.tagline` (A) | footer | yes | NO |
| Booking CTA targets | CTA urls | book.* domain | E | NO |
| Patient guidance copy | rich_text | `patient.info_*` | product Class C | NO |
| Pricing table | — | `pricing.*` | **MISSING Stitch screen** | N/A until designed |

### Field metrics

| Metric | Count |
|---|---|
| **STITCH_EDITABLE_FIELDS** | **36** (public chrome + hero/about/contact/hours/social/seo/footer + doctor/service card fields + gallery + CMS section pattern) |
| **EXISTING_PLATFORM_FIELDS** | **28** (18 Class A + mapped Class B presentation slots already in model) |
| **ADAPTER_MAPPED_FIELDS** | **24** (via AC presentation adapter + doctor/service adapters) |
| **NEW_PLATFORM_FIELDS_REQUIRED** | **0** storage keys; **2** presentation-only affordances (credential chip, emergency bar copy) |
| **AC_SPECIFIC_FIELDS** | **8** (booking entry copy, patient.info_*, pricing if later, facility landmark notes) |

---

## 6. Doctor / person mapping

```
AC Doctor domain
  → adaptDoctorToPersonPresentation
  → PersonPresentation
  → shared person / person_card component
```

| Gate | Value |
|---|---|
| **STITCH_DOCTOR_COMPONENT_MAPPING** | **EXTENSION_REQUIRED** |

Extension = specialty pill + credentials line + book CTA layout on shared person card — **not** a second doctor engine.

---

## 7. Services mapping

```
AC Service domain
  → adaptServiceToOfferingCard (collection)
  → CollectionPresentation (cardKind=offering)
  → shared collection_card / grid
```

| Gate | Value |
|---|---|
| **STITCH_SERVICE_COMPONENT_MAPPING** | **EXTENSION_REQUIRED** |

Extension = icon-tile offering variant — still one collection engine.

---

## 8. Media mapping

| Surface | Shared media engine |
|---|---|
| Hero / about / gallery / CMS images | YES — `platform.website_media` + media-field + UIE |
| Doctor / service images | YES — CMS media-field / catalogue overlay (Class B framing where enabled) |
| Hub media library (H04) | YES — shared library + folders |

| Gate | Value |
|---|---|
| **STITCH_MEDIA_PLATFORM_MAPPING** | **PASS** |

One upload / library / replace / remove / alt / persistence path. No product uploader.

---

## 9. Editor mapping

| Stitch | Platform |
|---|---|
| E01 Desktop inline | `public/platform/website-inline-edit.js` |
| E02 Mobile inline + adjust | same + `GpUniversalImageEditor.openFraming` |

| Gate | Value |
|---|---|
| **STITCH_EDITOR_MAPPING** | **PASS** |
| **SHARED_EDITOR_ENGINE_COUNT** | **1** |

Extension complete = Stitch pencil affordance chrome + mobile editor density on WE01 — **not** a new engine.

---

## 10. Website hub mapping

| Stitch | Route | Service / mechanism | Gap |
|---|---|---|---|
| H01 Hub | `/app/settings/website` | `websiteManagementPresentation` + AC settings | Visual tile parity |
| H02 Pages | `/app/settings/website/pages` | CMS pages | Visual parity |
| H03 Brand | `/app/settings/website/branding` (+ themes) | branding + theme | Visual parity |
| H04 Media | `/app/settings/website/media` | mediaService + folders | Visual parity |
| H05 History | website history routes | versionService | Visual parity |
| H06 Settings | `/settings`, `/seo`, `/chrome` | seoModel / chrome | Visual consolidation |

No new lifecycle services.

---

## 11. Lifecycle rule

| Requirement | Value |
|---|---|
| DUPLICATE_DRAFT_ENGINE_REQUIRED | **NO** |
| DUPLICATE_PUBLISH_ENGINE_REQUIRED | **NO** |
| DUPLICATE_VERSION_ENGINE_REQUIRED | **NO** |
| DUPLICATE_EDITOR_ENGINE_REQUIRED | **NO** |

Stitch plugs into existing draft / preview / publish / unpublish / versions / restore-as-new / concurrency / authz / audit.

---

## 12. Route mapping summary

Prefer existing `/clinics/:clinicKey…` and `/app/settings/website…` routes. Minimize NEW.

| NEW routes required | **0 preferred**; gallery may reuse CMS page slug rather than invent `/gallery` |
|---|---|
| EXTEND | Facilities page presentation; patient info page presentation; hub visuals |
| DOMAIN keep | Booking entry → existing booking stack |

---

## 13. Mobile mapping

| Gate | Value |
|---|---|
| **DESKTOP_MOBILE_SHARED_COMPONENTS** | **YES** |

Mobile companions and mobile-only public screens share the same presentation components with responsive CSS. Do **not** duplicate page implementations. Hub screens: responsive from desktop Stitch (no mobile Stitch yet).

---

## 14. Implementation batches (do not execute here)

| Batch | Scope | Screens | Dependencies |
|---|---|---|---|
| **1** | Shared Stitch component extensions | person/service cards, chips, chrome tokens | presentation model |
| **2** | AC public foundation | R01–R03 D+M | Batch 1 + AC adapter |
| **3** | Doctors / services / contact / booking entry | R04–R08 | Batch 1–2 + catalogue |
| **4** | Facilities / gallery / patient / CMS page | R09–R12 | Batch 1–2 |
| **5** | Inline editor parity | E01–E02 | WE01 only |
| **6** | Website hub | H01–H06 | management presentation |
| **7** | Responsive + visual parity | all | prior batches |
| **8** | Regression / freeze | — | focused BB/AC website tests |

**IMPLEMENTATION_BATCHES = 8**

Detailed Cursor prompts: `docs/design/ACTIVECLINIC_V2_04_STITCH_IMPLEMENTATION_PROMPTS.md`.

---

## 15. Visual parity contract

1. Match Stitch screenshots for desktop and mobile companions.
2. Use Inter + `#006068` clinical system for AC public redesign (product-scoped CSS — do not import BlessBoard Sacred Modernity).
3. Bind slots to presentation keys / component types / AC adapters.
4. Preserve platform engines; change markup/CSS/presentation wiring only.

---

## 16. Conflicts

| Conflict | Classification |
|---|---|
| Stitch R-numbering ≠ audit R-table | DESIGN_CAN_ADAPT — map by purpose |
| Pricing screen missing | DESIGN_CAN_ADAPT — defer pricing visual until Stitch adds; keep `pricing.*` domain |
| Offline/suspended shell missing | PRODUCT_ADAPTER_REQUIRED / keep platform lifecycle shell |
| Mobile-only doctors/services/contact | DESIGN_CAN_ADAPT — responsive from mobile Stitch + desktop patterns from R01–R03 |
| Emergency utility bar | PLATFORM_COMPONENT_EXTENSION or AC chrome partial |
| Doctor credential chips | PLATFORM_COMPONENT_EXTENSION on person card |
| Booking entry screen | PRODUCT_ADAPTER_REQUIRED — domain booking, presentation CTA only |
| Hub desktop-only | DESIGN_CAN_ADAPT — responsive hub |

| Gate | Value |
|---|---|
| **ARCHITECTURE_BLOCKERS** | **0** |
| **REAL_ARCHITECTURE_BLOCKER** | **NONE** |

---

## 17. Worktree / production

| Gate | Value |
|---|---|
| APPLICATION_CODE_CHANGED | **NO** (docs only) |
| DATABASE_CHANGED | **NO** |
| WORKTREE_INTEGRITY | **PASS** |
| PRODUCTION | **UNTOUCHED** |
| NEUNIVERSITY_DEPLOYMENT | **NOT_REQUIRED** |

---

## Related prompts

`docs/design/ACTIVECLINIC_V2_04_STITCH_IMPLEMENTATION_PROMPTS.md`
