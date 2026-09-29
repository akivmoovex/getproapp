# Platform Website Presentation Model

| Field | Value |
|---|---|
| **VERSION** | 2.04 Overnight Step 2 |
| **STATUS** | SHARED PRESENTATION COMPONENTS (opt-in library; public render unwired) |
| **STEP_1** | **PASS** (canonical contracts + vocabulary) |
| **CODE** | `src/platform/website/presentation/` |
| **COMPONENTS** | `views/platform/website/components/` (18 shared primitives) |
| **AUDIT** | `docs/qa/V2_04_AC_WEBSITE_PLATFORM_REUSE_AUDIT.md` |
| **COMPONENT_SHAREABILITY_BEFORE** | **74%** (audit 14/19 candidates) |
| **COMPONENT_SHAREABILITY_AFTER** | **89%** (17/19 with shared presentation coverage) |
| **SHARED_EDITOR_ENGINE_COUNT** | **1** (`public/platform/website-inline-edit.js`) |
| **WIRED_TO_PUBLIC_RENDER** | **NO** |
| **WIRED_TO_EDITOR_MUTATION** | **NO** |
| **BB_LIFECYCLE_MIGRATED** | **NO** |
| **PRODUCTION** | **UNTOUCHED** |

This document is the **canonical website presentation architecture** shared by BlessBoard and ActiveClinic.

Architecture:

```
PRODUCT DOMAIN
    ↓
PRODUCT ADAPTER
    ↓
PLATFORM PRESENTATION MODEL
    ↓
SHARED COMPONENT
    ↓
SHARED EDITOR (WE01)
```

**Do not merge domain entities.** Doctor ≠ Pastor. Service ≠ Ministry. Share presentation DTOs only.

---

## Audit field inventory

| Class | Count | Treatment |
|---|---|---|
| **A — Universal** | **18** | Mapped to presentation keys (`universalFieldVocabulary.js`) |
| **B — Component / product-semantic** | **42** | Mapped onto presentation components (`componentContracts.js`) |
| **C — Product-specific** | **175** | Preserved product-owned; land in adapter `unmapped` / product bags |
| **D — Legacy duplicates** | **25** | Documented in `legacyFieldMap.js` — **not migrated overnight** |

Constant: `AUDIT_FIELD_INVENTORY` in `auditFieldInventory.js`.

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

**Storage is not rewritten.** Product keys remain authoritative in `platform.website_content` / BB settings.

---

## Component / product-semantic concepts (Class B) — 42

`COMPONENT_SEMANTIC_CONCEPTS` maps the audited Class B concepts onto presentation components (nav, visibility, CTA chrome, person/offering cards, CMS section fields, hours/address, social, collection mechanics, gallery/video/announcement chrome, etc.).

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

## Product-specific fields (Class C) — 175

Audited product-owned concepts remain **product-local** (giving, sermons, events, booking, patient info, insurance, pricing, theology copy, etc.). They must not be forced into universal keys.

Unmapped content from `mapUniversalContentToPresentation` lands in `unmapped` for adapters to handle locally.

---

## Legacy duplicates (Class D) — 25 mapped, not removed

`legacyFieldMap.js` documents **25** legacy/duplicate entries (Stage-1 coarse blobs, `identity.hero_*`, contact dual paths, `seo.noindex`, gallery aliases, AC seed examples, naming aliases).

Status values: `alias` | `overlap` | `seed_overlay` | `coarse_blob` | `retain`.

**Do not delete or migrate these keys overnight.**

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
4. Presentation adapters are **not** required on live public EJS / resolver paths until a later wiring step.
5. Prefer WE01 + existing `editableFieldSchema` for mutations until a later phase introduces presentation write-backs.

---

## Stitch integration rules

Stitch **may** design layout, responsive variants, typography, spacing, and editor chrome.

Stitch **must not** define DB schema, draft/publish, authz, versioning, media persistence, or merged domain catalogues.

Bind UI slots to: (1) Class A presentation keys, (2) presentation component types, (3) product adapters for Class B/C.

---

## Shared component library (Step 2 — available, opt-in)

| Asset | Path |
|---|---|
| Partials | `views/platform/website/components/*.ejs` |
| Render helper | `presentation/componentLibrary.js` |
| Component CSS | `public/platform/website-presentation-components.css` (`--gp-website-*` only) |
| Token bridge | `public/platform/website-presentation-token-bridge.css` (BB / AC scoped) |
| Editable hooks | `editable-field.ejs`, `editable-image.ejs` → WE01 data attributes |

### Shared primitives (18)

Hero · SectionHeader · RichText · ImageText · CTA · PersonCard · PersonGrid · CollectionCard · CollectionGrid · Contact · Hours · Location · Gallery · Video · Announcement · Navigation · Footer · SEO

Rules:

- Components consume presentation contracts / PersonPresentation / CollectionPresentation only.
- Components do **not** query BB/AC domain tables.
- No church/clinic business logic in shared partials.
- Product appearance via semantic theme tokens (`--gp-website-*` bridged from `--bb-*` / `--ac-*`).
- No raw product brand hex in platform component CSS.
- Preserve `public/platform/website-inline-edit.js` as the single editor engine.

Live product templates are **not** replaced by overnight Step 2. Appearance unchanged until a later wiring step.

---

## Module map

| File | Role |
|---|---|
| `presentation/auditFieldInventory.js` | Audit Class A–D counts |
| `presentation/componentTypes.js` | Type enum (18) |
| `presentation/componentLibrary.js` | Opt-in render registry + shareability metrics |
| `presentation/universalFieldVocabulary.js` | 18 Class A fields |
| `presentation/legacyFieldMap.js` | 25 Class D maps |
| `presentation/componentContracts.js` | Shape contracts + 42 Class B concepts |
| `presentation/personPresentation.js` | Person DTO |
| `presentation/collectionPresentation.js` | Collection DTO |
| `presentation/domainBoundaries.js` | Forbidden merges |
| `presentation/fieldKeyResolver.js` | Key bag mapping |
| `presentation/adapters.js` | Domain → presentation helpers |
| `presentation/index.js` | Public barrel (`PHASE` flag) |

Exported as `require("…/platform/website").presentation`.

---

## Regression policy (Step 2)

Because `PHASE.wiredToPublicRender === false` and no live product templates are required to change:

- **BB_THEME = PASS** (token bridge maps `--bb-*` → `--gp-website-*`; BB templates untouched)
- **AC_THEME = PASS** (token bridge maps `--ac-*` → `--gp-website-*`; AC templates untouched)
- **SHARED_EDITOR_REGRESSION = PASS** (WE01 remains the single editor)
- **TOKEN_LEAKS = 0** in `website-presentation-components.css`

---

## Tests

- `tests/v2-04-platform-website-presentation.test.js` — contracts, vocabulary, adapters
- `tests/v2-04-shared-website-components.test.js` — 18 partials, render, person/collection, theme leaks, editor singularity
