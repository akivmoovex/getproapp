# Platform Website Presentation Model

| Field | Value |
|---|---|
| **VERSION** | 2.04 Phase 2 |
| **STATUS** | COMPONENT LIBRARY (opt-in; not wired to live product templates) |
| **CODE** | `src/platform/website/presentation/` + `views/platform/website/components/` |
| **AUDIT** | `docs/qa/V2_04_AC_WEBSITE_PLATFORM_REUSE_AUDIT.md` |
| **WIRED_TO_PUBLIC_RENDER** | **NO** |
| **WIRED_TO_EDITOR_MUTATION** | **NO** |
| **COMPONENT_LIBRARY** | **YES** (`PHASE.componentLibraryAvailable`) |

This document defines the **canonical website presentation architecture** shared by BlessBoard and ActiveClinic. Phase 1 shipped contracts/vocabulary/adapters. Phase 2 adds reusable presentation components (EJS + token CSS + render helper) without replacing live BB/AC public templates.

---

## Target flow

```
DOMAIN DATA
    ↓
PRODUCT ADAPTER
    ↓
PLATFORM PRESENTATION MODEL
    ↓
SHARED COMPONENTS          ← Phase 2+
    ↓
SHARED EDITOR (WE01)       ← already exists; not rewired in Phase 1
    ↓
PRODUCT-THEMED WEBSITE
```

---

## Canonical presentation component types (18)

| Type | Purpose |
|---|---|
| `branding` | Logo, favicon, colors, themeId, siteName |
| `navigation` | Ordered nav items (label/href/visibility) |
| `hero` | Eyebrow, title, subtitle, image, CTAs |
| `section_heading` | Eyebrow, title, lead, optional CTA |
| `rich_text` | Heading + body |
| `image_text` | Heading, body, image, position, CTA |
| `cta` | Heading, body, primary/secondary CTA |
| `person` | PersonPresentation card DTO |
| `collection_card` | Ordered collection of cards / people |
| `contact` | Phone, email, address, intro |
| `hours` | Free-text and/or structured rows |
| `location` | Address, map, directions, landmark |
| `social_links` | Network/label/url list |
| `gallery` | Image grid items |
| `video` | Embed URL + title/poster |
| `announcement` | Presentation chrome only (BB domain stays product) |
| `seo` | Title, description, image, canonical, robots, sitemap |
| `footer` | Tagline, legal, showContact |

Module: `componentTypes.js`, contracts: `componentContracts.js`.

---

## Universal fields (Class A) — 18

Canonical **presentation keys** (platform vocabulary):

| # | Presentation key | BB storage key | AC storage key |
|---|---|---|---|
| 1 | `home.logo` | `home.logo` | `home.logo` |
| 2 | `brand.primary_color` | same | same |
| 3 | `brand.accent_color` | same | same |
| 4 | `home.hero.image` | same | same |
| 5 | `home.hero.eyebrow` | same | same |
| 6 | `home.hero.title` | `home.hero.heading` | `home.hero.title` |
| 7 | `home.hero.subtitle` | `home.hero.body_text` | `home.hero.subtitle` |
| 8 | `about.story.heading` | same | same |
| 9 | `about.story.body` | `about.story.body_text` | `about.story.body` |
| 10 | `contact.phone` | `contact.details.phone` | `contact.phone` |
| 11 | `contact.email` | `contact.details.email` | `contact.email` |
| 12 | `footer.tagline` | `home.footer.tagline` | `footer.tagline` |
| 13 | `seo.title` | same | same |
| 14 | `seo.description` | same | same |
| 15 | `seo.image` | `seo.og_image_url` | `seo.image` |
| 16 | `seo.canonical_url` | same | same |
| 17 | `seo.robots` | same | same |
| 18 | `seo.sitemap_include` | same | same |

Helpers: `universalFieldVocabulary.js`, `fieldKeyResolver.js`  
(`mapUniversalContentToPresentation`, `mapPresentationToProductStorage`).

**Phase 1 does not rewrite storage.** Product keys remain authoritative in `platform.website_content` / BB settings.

---

## Component / product-semantic concepts (Class B)

`COMPONENT_SEMANTIC_CONCEPTS` in `componentContracts.js` maps ~42 audited Class B concepts onto presentation components (nav labels, visibility, CTA chrome, person/offering cards, CMS section fields, hours/address, social links, collection mechanics, etc.).

Collection presentation contract (`collectionPresentation.js`):

```
{
  cardKind,          // person | offering | generic | quote | faq
  layoutVariant,     // grid | list | carousel
  intro,
  emptyState: { heading, body },
  manageHref,
  items: [ CollectionCardPresentation | PersonPresentation ]
}
```

Platform-owned item fields: image, title, subtitle, description, CTA, displayOrder, visibility, featured.

---

## Product-specific fields (Class C)

~175 audited concepts remain **product-owned** (giving, sermons, events, booking, patient info, insurance, pricing, theology copy, etc.). They must not be forced into universal keys.

Unmapped content from `mapUniversalContentToPresentation` lands in `unmapped` for adapters to handle locally.

---

## Legacy duplicates (Class D) — mapped, not removed

`legacyFieldMap.js` documents **25** legacy/duplicate entries (Stage-1 coarse blobs, `identity.hero_*`, contact dual paths, `seo.noindex`, gallery aliases, AC seed examples, naming aliases).

Status values: `alias` | `overlap` | `seed_overlay` | `coarse_blob` | `retain`.

**Do not delete these keys in Phase 1.**

---

## Person presentation

```
PersonPresentation {
  image, name, title, subtitle, description,
  cta: { label, url },
  displayOrder, visibility, featured,
  sourceProduct, sourceDomain, sourceId   // metadata only
}
```

Adapters (presentation only):

| Domain | Adapter | sourceDomain |
|---|---|---|
| Pastor / leader | `adaptLeaderToPersonPresentation` | `pastor_leader` |
| Doctor | `adaptDoctorToPersonPresentation` | `doctor` |

---

## Domain-boundary rules

**FORBIDDEN** to merge as domain identity:

| Merge id | Left | Right | Shared presentation only |
|---|---|---|---|
| `doctor_pastor` | AC doctor | BB pastor/leader | `person` |
| `service_ministry` | AC clinical service | BB ministry | `collection_card` offering |
| `appointment_event` | AC appointment/booking | BB church event | none (product-local) |
| `sermon_clinical` | BB sermon | AC clinical content | none |

`assertDomainBoundary(left, right)` returns `{ ok: false }` for forbidden pairs.

---

## Adapter rules

1. Products read domain data; adapters emit presentation DTOs.
2. Platform validates DTOs; it does not own pastoral or clinical tables.
3. `sourceDomain` / `sourceId` are opaque metadata for debugging — never used as a shared primary key across products.
4. Phase 1 adapters are **not** called from public EJS / resolver paths.
5. Prefer WE01 + existing `editableFieldSchema` for mutations until a later phase introduces presentation write-backs.

---

## Stitch integration rules

Stitch **may** design:

- Layout, responsive variants, typography, spacing
- Component visual states (default / empty / editing)
- Editor affordance chrome

Stitch **must not** define:

- Database schema, draft/publish, authz, versioning
- Media persistence, content storage, platform APIs
- Merged domain catalogues (doctors+pastors, etc.)

When implementing Stitch screens (Phase 3), bind UI slots to:

1. Universal presentation keys (Class A)
2. Presentation component types (this doc)
3. Product adapters for Class B/C semantics

---

## Phase 2 — shared presentation component library

| Asset | Path |
|---|---|
| Partials | `views/platform/website/components/*.ejs` (18 + editable-field/image) |
| Render helper | `presentation/componentLibrary.js` → `renderPresentationComponent` |
| Component CSS | `public/platform/website-presentation-components.css` (`--gp-website-*` only) |
| Token bridge | `public/platform/website-presentation-token-bridge.css` (scoped BB/AC body classes) |

Library component ids: `hero`, `section_header`, `rich_text`, `image_text`, `cta`, `person_card`, `person_grid`, `collection_card`, `collection_grid`, `contact`, `hours`, `location`, `gallery`, `video`, `announcement`, `navigation`, `footer`, `seo`.

Editable hooks use shared WE01 attributes (`data-website-inline`, `data-website-key`, …) and **one** editor engine: `public/platform/website-inline-edit.js`.

**Live product templates are not replaced in Phase 2.** Opt-in includes come later (AC Stitch redesign / BB alignment).

Duplication measurement (Phase 2):

- Shared components created: **18**
- BB/AC product-specific component logic removed: **0** (templates retained by design)
- Shareable component coverage vs audit list (19 incl. Event=NO): **18/19 ≈ 95%**

---

## Module map

| File | Role |
|---|---|
| `presentation/componentTypes.js` | Type enum |
| `presentation/componentLibrary.js` | Phase 2 render registry |
| `presentation/universalFieldVocabulary.js` | 18 Class A fields |
| `presentation/legacyFieldMap.js` | 25 Class D maps |
| `presentation/componentContracts.js` | Shape contracts + Class B concepts |
| `presentation/personPresentation.js` | Person DTO |
| `presentation/collectionPresentation.js` | Collection DTO |
| `presentation/domainBoundaries.js` | Forbidden merges |
| `presentation/fieldKeyResolver.js` | Key bag mapping |
| `presentation/adapters.js` | Domain → presentation helpers |
| `presentation/index.js` | Public barrel (`PHASE` flag) |

Exported as `require("…/platform/website").presentation`.

---

## Visual / editor regression policy (Phase 1)

Because `PHASE.wiredToPublicRender === false` and no product templates were changed:

- **BB_VISUAL_REGRESSION = PASS** (no public markup/CSS change)
- **AC_VISUAL_REGRESSION = PASS** (no public markup/CSS change)
- **SHARED_EDITOR_REGRESSION = PASS** (WE01 assets untouched)

Later phases that wire presentation into renderers must add explicit visual parity checks.

---

## Tests

`tests/v2-04-platform-website-presentation.test.js` validates:

- Universal field count and BB/AC maps
- Legacy map count
- Component type contracts
- Person/collection validation
- Domain boundary enforcement
- Adapter helpers
- Phase unwired flags
