# V2_02_IMAGE_EDITOR_COVERAGE_READY

**Status:** `V2_02_IMAGE_EDITOR_COVERAGE_READY`  
**Phase:** AUDIT + TEST CONTRACT ONLY  
**APPLICATION_CODE_CHANGED:** NO  
**STITCH_REQUIRED:** NO  
**NEW_STITCH_SCREENS_REQUIRED:** NO  
**READY_FOR_PLATFORM_FIX:** YES

Announcements / Sermons fix passes were not modified.

---

## Verdict fields

| Field | Value |
|---|---|
| CANONICAL_EDITOR | Platform Universal Image Editor (`Adjust Picture` framing sheet) |
| CANONICAL_FILES | See below |
| ARCHITECTURE_CURRENT | Framing only on `editable-image` / `website-editable-image` → `website-inline-edit.js`. BB structured surfaces use replace + weak focal select. |
| ARCHITECTURE_TARGET | Platform Universal Image Editor + shared framing/mount API; BB/AC declare slot config only |
| TOTAL_IMAGE_SLOTS | 32 |
| BB_SLOTS | 20 |
| AC_SLOTS | 12 |
| CATEGORY_A | 17 |
| CATEGORY_B | 8 |
| CATEGORY_C | 0 |
| CATEGORY_D | 7 |
| CATEGORY_A_PASS | 5 (all `platform_inline`) |
| CATEGORY_A_FAIL | 12 (all BB `structured`) |
| BB_MISSING_FRAMING | 12 structured category-A slots |
| AC_MISSING_FRAMING | 0 (AC public IMAGE keys already on shared inline path; catalogue/CMS = B) |
| DUPLICATE_IMPLEMENTATIONS | BB structured focal select only (not a full editor). CSS static `object-position` fallbacks in product CSS. |
| SAFE_EXTRACTION_BOUNDARY | Keep algorithms in `imagePlacement.js` + `website-inline-edit.js`; expose mount API for structured/entity triggers; products only declare slots |
| EXISTING_TESTS | `v2-01-universal-image-editor`, `v2-01-shared-image-placement`, `v2-01-shared-image-payload-contract`, `v7-image-editor-coverage` |
| NEW_TESTS | `tests/helpers/v2-02-universal-image-editor-coverage-matrix.js`, `tests/v2-02-universal-image-editor-coverage.test.js` |
| EXPECTED_RED_TESTS | `every category-A slot reaches shared Adjust Picture / framing controls` |
| UNEXPECTED_FAILURES | `v7-image-editor-coverage`: expects `Choose from Content Library`; runtime copy is `Choose from Image Library` (pre-existing naming drift; not introduced by this audit) |
| WHY_EXISTING_TESTS_MISSED_QA | See §6 |
| STITCH_REQUIRED | NO |
| READY_FOR_PLATFORM_FIX | YES |

---

## 1. Canonical editor

### Trace

```
UI trigger (pencil on editable-image / website-editable-image)
  → public/platform/website-inline-edit.js
      → Adjust Picture (data-website-adjust)
      → zoom (data-website-frame-zoom range)
      → move (pointer drag on data-website-frame-stage)
      → Fit/Fill (data-website-frame-fit contain|cover)
      → preview (current/new image + framing stage)
  → placement model: src/platform/website/imagePlacement.js
      (validateImagePlacement, renderPlacementStyle, IMAGE_SLOT_REGISTRY)
  → draft save via website inline draft APIs (placement on IMAGE value)
  → reload applies CSS vars / object-position from placement
  → publish publishes draft IMAGE values including placement
  → public render: editable-image / website-editable-image + renderPlacementStyle
```

### CANONICAL_FILES

| Layer | Path |
|---|---|
| Framing UI | `public/platform/website-inline-edit.js` |
| Framing CSS | `public/platform/website-inline-edit.css` |
| Placement model | `src/platform/website/imagePlacement.js` |
| IMAGE validation | `src/platform/website/contentTypes.js` |
| BB mount partial | `views/blessboard/v5/partials/editable-image.ejs` |
| AC mount partial | `views/activeclinic/partials/website-editable-image.ejs` |

### Platform vs homepage coupling

| Shared / platform | Coupled today |
|---|---|
| Framing algorithms + dialog | Mounted only where templates include editable-image partials |
| Placement persistence on IMAGE content keys | BB structured `mediaUrl` / entity `imageUrl` paths never open framing UI |
| Slot registry (`IMAGE_SLOT_REGISTRY`) | Covers AC/BB content keys; not structured section keys |

**Not canonical:** `public/blessboard/v5/website-structured-edit.js` — upload/library/replace + optional “Focal position” select only.

---

## 2–3. Slot matrix (compact)

Legend: U=upload R=replace AP=Adjust Picture Z=zoom M=move FF=fit/fill P=placement persistence  
Mount: `inline` = platform editable-image; `struct` = structured/entity; `settings`/`cms`/`lib` = replace surfaces; `none` = not editable.

| ID | Product | Page | Slot | Editor | U | R | AP | Z | M | FF | P | Class | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bb.home.hero.image | BB | home | home.hero.image | inline | Y | Y | Y | Y | Y | Y | Y | A | Canonical framing path |
| bb.home.logo | BB | chrome | home.logo | inline | Y | Y | Y | Y | Y | Y | Y | A | Shared inline |
| bb.page_hero.image | BB | multi | section.hero.mediaUrl | struct | Y | Y | expect | expect | expect | expect | expect | A | Photo hero; no framing UI |
| bb.home.welcome.image | BB | home | welcome.mediaUrl | struct | Y | Y | expect | expect | expect | expect | expect | A | Photo surface |
| bb.about.story.image | BB | about | about.story.mediaUrl | struct | Y | Y | expect | expect | expect | expect | expect | A | Photo |
| bb.about.community.image | BB | about | about.community.mediaUrl | struct | Y | Y | expect | expect | expect | expect | expect | A | Photo |
| bb.about.life_together.image | BB | about | about.life_together.mediaUrl | struct | Y | Y | expect | expect | expect | expect | expect | A | Photo |
| bb.about.visit_sunday.image | BB | about | about.visitor_cta.mediaUrl | struct | Y | Y | expect | expect | expect | expect | expect | A | Photo |
| bb.about.gallery | BB | about | about.gallery_*.mediaUrl | struct | Y | Y | expect | expect | expect | expect | expect | A | Gallery photos |
| bb.content_block.media | BB | multi | content_block.mediaUrl | struct | Y | Y | expect | expect | expect | expect | expect | A | Section photos |
| bb.leadership.photo | BB | leadership | leader.imageUrl | struct | Y | Y | expect | expect | expect | expect | expect | A | Portraits |
| bb.ministry.image | BB | ministries | ministry.imageUrl | struct | Y | Y | expect | expect | expect | expect | expect | A | Card photos |
| bb.event.image | BB | events | event.imageUrl | struct | Y | Y | expect | expect | expect | expect | expect | A | Event photos |
| bb.sermon.thumbnail | BB | sermons | sermon.imageUrl | struct | Y | Y | expect | expect | expect | expect | expect | A | Thumbnails |
| bb.giving.qr | BB | giving | giving.qrImageUrl | struct | Y | Y | N | N | N | N | n/a | B | QR must stay scannable |
| bb.identity.hero_image_url | BB | settings | identity.hero_image_url | settings | Y | Y | N | N | N | N | n/a | B | Settings media field |
| bb.seo.og_image_url | BB | settings | seo.og_image_url | settings | Y | Y | N | N | N | N | n/a | B | OG asset replace |
| bb.apex.marketing | BB | apex | platform.marketing | none | N | N | N | N | N | N | n/a | D | SaaS marketing |
| bb.softfill.demo | BB | demo | softfill | none | N | N | N | N | N | N | n/a | D | Soft-fill |
| bb.shell.getpro | BB | shell | powered_by_getpro | none | N | N | N | N | N | N | n/a | D | Platform chrome |
| ac.home.hero.image | AC | home | home.hero.image | inline | Y | Y | Y | Y | Y | Y | Y | A | Shared inline |
| ac.home.logo | AC | chrome | home.logo | inline | Y | Y | Y | Y | Y | Y | Y | A | Shared inline |
| ac.about.story.image | AC | about | about.story.image | inline | Y | Y | Y | Y | Y | Y | Y | A | Shared inline |
| ac.seo.image | AC | cms seo | seo.image | cms | Y | Y | N | N | N | N | n/a | B | Social asset |
| ac.cms.block.image | AC | cms | cms.block.image | cms | Y | Y | N | N | N | N | n/a | B | Builder media field |
| ac.cms.library.image | AC | library | cms.library.image | cms | Y | Y | N | N | N | N | n/a | B | Library media field |
| ac.doctor.photo | AC | doctors | library.doctor.image | lib | Y | Y | N | N | N | N | n/a | B | Catalogue overlay |
| ac.service.image | AC | services | library.service.image | lib | Y | Y | N | N | N | N | n/a | B | Catalogue overlay |
| ac.service.default_icon | AC | services | platform.service_icon | none | N | N | N | N | N | N | n/a | D | Icon pack |
| ac.location.facility_photo | AC | locations | location.facility_photo | none | N | N | N | N | N | N | n/a | D | No slot |
| ac.platform.marketing | AC | platform | platform.marketing | none | N | N | N | N | N | N | n/a | D | SaaS |
| ac.doctor.fallback | AC | doctors | doctor.fallback | none | N | N | N | N | N | N | n/a | D | Silhouette |

Authoritative machine matrix: `tests/helpers/v2-02-universal-image-editor-coverage-matrix.js`.

---

## 4. Duplicate implementations

| Kind | Location | Notes |
|---|---|---|
| CANONICAL_IMPLEMENTATION | `website-inline-edit.js` + `imagePlacement.js` | Zoom/move/fit/fill + persistence |
| DUPLICATE_IMPLEMENTATIONS | None for full framing | No second Adjust Picture stack |
| PRODUCT_SPECIFIC_IMPLEMENTATIONS | `website-structured-edit.js` focal select; product CSS static `object-position` | Replace path + weak focal; not Universal Image Editor |
| SAFE_EXTRACTION_BOUNDARY | Platform owns framing mount + placement validation; products declare which slots are framing-applicable and how drafts store media | Do not reimplement zoom/fit in BB/AC |

---

## 5. New coverage contract

- Matrix helper classifies A/B/C/D so missing framing cannot be silent success for B/C/D.
- Contract asserts every **A** slot reaches shared framing markers.
- **Expected red:** 12 BB structured A slots.
- **Green today:** 5 platform_inline A slots (BB hero/logo + AC hero/logo/about).

---

## 6. Why existing tests were green

| Suite | What it proves | Why QA still saw the gap |
|---|---|---|
| `v2-01-universal-image-editor.test.js` | Platform dialog has Adjust Picture / placement serialize when mounted | Does not require every EDITABLE surface to mount that dialog |
| `v2-01-shared-image-placement.test.js` | Placement model + CSS render for IMAGE keys | Does not cover structured `mediaUrl` / entity `imageUrl` mounts |
| `v7-image-editor-coverage.test.js` | EDITABLE vs SYSTEM_ONLY catalogue; upload/library/replace wiring | “EDITABLE” = replaceable media, **not** framing parity |
| Product coverage catalogues | Editor kind labels (`structured_image`, `shared_inline_image`) | Labelled structured as EDITABLE without framing contract |

Manual QA found framing only on homepage inline path — exactly the mount gap v7 did not assert.

---

## 7. Stitch

**STITCH_REQUIRED=NO**  
Category-A surfaces need the **existing** Universal Image Editor interaction already approved for homepage/inline IMAGE slots. No new visual interaction is required.

---

## 8. Test run

```
node --test \
  tests/v2-02-universal-image-editor-coverage.test.js \
  tests/v2-01-universal-image-editor.test.js \
  tests/v2-01-shared-image-placement.test.js \
  tests/v2-01-shared-image-payload-contract.test.js
```

| Result | Detail |
|---|---|
| EXPECTED_RED | `v2-02` category-A framing contract — **12 fail / 5 pass** |
| PASS | Remaining v2-02 subtests; all v2-01 universal + placement + payload tests |
| UNEXPECTED (pre-existing) | `v7-image-editor-coverage` library label string mismatch (`Image` vs `Content`) |

---

## Recommended smallest platform fix (DO NOT IMPLEMENT YET)

1. **Do not** rebuild zoom/move/fit/fill in BlessBoard.
2. Extract a **mount API** from `website-inline-edit.js` that can open the existing Adjust Picture sheet for an image URL + placement object + save callback.
3. From `website-structured-edit.js` (and entity-image flows), after media select/upload, offer **Adjust Picture** when the slot is category-A (product slot config / registry flag).
4. Persist placement on structured draft payloads using `validateImagePlacement` (extend structured media value shape or map into IMAGE placement fields).
5. Public render for structured photos must apply `renderPlacementStyle` (or equivalent CSS vars) on reload/publish.
6. Keep category-B (QR, SEO, settings, CMS library) on replace-only.
7. Turn the v2-02 category-A contract green as the acceptance gate.

---

## Sign-off

`V2_02_IMAGE_EDITOR_COVERAGE_READY`  
`APPLICATION_CODE_CHANGED=NO`  
`READY_FOR_PLATFORM_FIX=YES`
