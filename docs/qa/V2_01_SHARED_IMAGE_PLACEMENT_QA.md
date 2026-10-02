# V2.01 Shared IMAGE Placement Infrastructure QA

**Task:** `V2_01_SHARED_IMAGE_PLACEMENT_INFRA`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing`  
**Baseline (B1):** `6656d7e233f0`  
**B2 commit / hosted SHA:** `c2b862655a6b` (`c2b862655a6b6cd88a759f54292758693502ee3e`)  
**Deployment identity:** `moovex-platform-v8-testing`  
**DB identity:** `databaseIdentityExpected=moovex-platform-v7` · `databaseIdentityEnv=testing`  
**Production:** **untouched** (`blessboard.com` `/healthz` remained `03a89106e2fe` / `moovex-platform-production`)

**Refs:**  
- `docs/qa/V2_01_SHARED_EDITOR_ARCHITECTURE_AUDIT.md`  
- `docs/qa/V2_01_SHARED_IMAGE_PAYLOAD_QA.md`  
- Stitch **Website Change Management System** `projects/12538817760086591589` — Universal Image Editor Crop & Position screens (`cd1baa8b…`, `c9e28954…`)

**Personas (disposable):**  
- BB HQ `hq.admin@bb-v8qa-mub23a6v6a6b.example.invalid` · org `bb-v8qa-mub23a6v6a6b`  
- AC admin · org `ac-v8-qa-mub23a6v6a6b`

---

## FINAL VERDICT

**`V2_01_SHARED_IMAGE_PLACEMENT_PASS`**

Shared field-scoped IMAGE placement metadata (crop/zoom/focal + optional mobile framing) persists through WE01 draft → preview → publish without rewriting CDN assets. Graphical crop UI is **NOT TESTED** (B3).

---

## 1. Audit baseline (pre-change shapes)

| Area | Existing support |
| --- | --- |
| IMAGE field contract | `{ mediaId, src, alt }` (+ legacy string URL normalized to object) |
| Media service | Ownership rewrite preserves object spread; no crop derivatives |
| Draft/version storage | JSON `draft_value` / `published_value` via `contentService` |
| BB render | `editable-image.ejs` — src/alt/mediaId only; structured `focal` enum is fit-only elsewhere |
| AC render | Hardcoded `objectPosition` / `ac-media` template defaults |
| Desktop/mobile framing | **Absent** |
| Historical restore | Full field JSON restore (placement rides along once stored) |

---

## 2. Final shared IMAGE contract

```json
{
  "mediaId": "<uuid|null>",
  "src": "<https URL or owned delivery path|null>",
  "alt": "<string|null>",
  "placement": {
    "v": 1,
    "fit": "cover|contain",
    "x": 0,
    "y": 0,
    "zoom": 1,
    "mobile": { "fit": "cover|contain", "x": 0, "y": 0, "zoom": 1 }
  }
}
```

### Validation rules (`src/platform/website/imagePlacement.js` + `contentTypes` IMAGE)

- `placement` optional — legacy string/object without it remain valid.  
- `v` must be `1`.  
- `fit` ∈ `{cover, contain}` (default `cover`).  
- `x`/`y` (aliases `focalX`/`focalY`) ∈ `0..100`.  
- `zoom` ∈ `1..3`.  
- `mobile` optional; rejected for slots with `supportsSeparateFraming: false` (e.g. `home.logo`).  
- Explicit `desktop` blob rejected (base frame = desktop/shared).  
- Client `aspect` / `aspectRatio` / `width` / `height` / `slot` → `image_placement_slot_override`.  
- Slot aspect hints come only from server `IMAGE_SLOT_REGISTRY` (hero/about currently **null** — no invented 16:9 / 9:16).  
- Media ownership still enforced by `assertOwnedWebsiteImageValue`; placement does not change storage keys or CDN bytes.

### Defaults for legacy images

No placement → existing template fallbacks (`object-position` / AC `center 42%`, etc.). CSS class `gp-website-image--placed` only when placement present.

---

## 3. Files changed (B2)

| File | Change |
| --- | --- |
| `src/platform/website/imagePlacement.js` | **New** schema, validation, slot registry, CSS render helper |
| `src/platform/website/contentTypes.js` | Persist validated `placement` on IMAGE objects |
| `src/platform/website/contentService.js` | Pass content key into IMAGE validation |
| `src/platform/website/editableFieldSchema.js` | Include field key in content def |
| `src/platform/website/branding.js` | `imageFromWebsiteValue` / `imageValueFromParts` carry placement |
| `src/platform/media/cdnMediaPresentation.js` | `presentImageValue` preserves placement |
| `src/platform/website/mediaService.js` | Hydrate preserves placement |
| `src/blessboard/http/attachWebsiteAdminChrome.js` | Wire hero/logo placement into public model |
| `views/blessboard/v5/partials/editable-image.ejs` | Apply placement CSS vars |
| `views/activeclinic/partials/website-editable-image.ejs` | Apply placement CSS vars |
| `views/activeclinic/partials/ac-media.ejs` | `styleOverride` for placed images |
| `views/blessboard/v5/public/home.ejs` + `shell-brand.ejs` | Pass placement locals |
| `views/activeclinic/tenant/home.ejs` | Pass hero placement |
| `public/platform/website-inline-edit.css` | `.gp-website-image--placed` + mobile overrides |
| Shell / management CSS cache bumps | `v2-img-place-1` |
| `tests/v2-01-shared-image-placement.test.js` | **New** shared suite (10) |

**Migrations:** none.

---

## 4. Supported slots / rendering behavior

| Slot | Separate D/M | Render |
| --- | --- | --- |
| `home.hero.image` | Yes | BB + AC public/edit partials → CSS `object-position` + `transform: scale(zoom)` via vars; mobile media query uses `--gp-img-mobile-*` when present |
| `about.story.image` | Yes | Same contract; AC editable image path when used |
| `home.logo` | No | Placement without `mobile`; square slot hint optional |
| `seo.image` | No | Contract only (not a visual crop canvas) |
| Unknown IMAGE keys | Separate allowed | No assumed aspect |

Non-destructive: original CDN/`/media/` URL unchanged; framing is CSS-only.

---

## 5. Local tests

| Suite | Result |
| --- | --- |
| `tests/v2-01-shared-image-placement.test.js` | **PASS** (10) — legacy render, valid placement, invalid reject, multi-slot independence, BB/AC mutations, D/M fallback, present/brand helpers, **EJS rendering assertions**, CSS/registry, restore round-trip |
| `tests/v2-01-shared-image-payload-contract.test.js` | **PASS** (6) |
| `tests/v2-01-bb-inline-editor-parity.test.js` | **PASS** |

---

## 6. Deploy

| Step | Result |
| --- | --- |
| Commit | `c2b86265 Add shared non-destructive IMAGE placement metadata for BB and AC.` |
| Push `V8` | **PASS** |
| Hosted BB/AC/apex SHA | **PASS** — `c2b862655a6b` on `moovex-platform-v8-testing` |
| Production `/healthz` | **Unchanged** `03a89106e2fe` / `moovex-platform-production` |
| Unrelated untracked QA docs/refs | Preserved (not committed) |

---

## 7. Hosted disposable smoke

| Check | Result |
| --- | --- |
| BB save draft with placement | **PASS** (`200`, draft saved) |
| BB reject zoom `9` | **PASS** (`400 validation_failed`) |
| BB reject client aspect/width override | **PASS** (`400 validation_failed`) |
| BB draft preview CSS (`gp-website-image--placed`, `--gp-img-x:22%`, mobile vars, alt) | **PASS** |
| BB refresh / reopen persistence | **PASS** |
| BB publish + live public CSS | **PASS** |
| Original CDN/media src unchanged | **PASS** |
| AC draft save with placement | **PASS** (`saved_to_draft`) |
| AC draft preview CSS + alt | **PASS** |
| AC session on BB inline-field | **PASS** (`401` sign-in required) |
| Graphical crop UI (B3) | **NOT TESTED** |

---

## 8. Compatibility gaps

- Crop/position **UI** not built (Stitch Universal Image Editor screens inform B3).  
- BB structured-section `focal` enum remains a separate product path; shared WE01 IMAGE placement is the canonical crop/position metadata.  
- Template aspect still may apply local aspect (e.g. AC `16 / 10` on hero media container) when no registry aspect is set — placement does not invent global 16:9/9:16.  
- Field history UI click-through not re-run; JSON restore contract covered by tests + existing field-history infrastructure.

---

## 9. Production confirmation

No production host, DB, media root, or deployment profile was modified. All writes used disposable V8 testing tenants only.

---

## Verdict line

`V2_01_SHARED_IMAGE_PLACEMENT_PASS`
