# V2.01 Shared Website Editor — Architecture Audit

**Task:** `V2_01_SHARED_EDITOR_ARCHITECTURE_AUDIT`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing`  
**Scope:** Audit only — no code, migrations, or deployment  
**UX reference:** `docs/qa/V2_01_ACTIVECLINIC_EDITOR_UX_REFERENCE.md`  
**Design reference:** Stitch project **Website Change Management System** `projects/12538817760086591589` (updated 2026-09-25) — numbered screens **1–7** plus Universal Image Editor subflow  

**Production:** Untouched  

---

## FINAL VERDICT

**`SHARED_EDITOR_ARCHITECTURE_AUDIT_COMPLETE`**

---

## A. Executive Summary

ActiveClinic’s live **pencil → Save draft → Preview → Publish** editor is the correct shared UX target. Most of that stack already exists for **both** products in `src/platform/website*` and `src/platform/website-engine*`.

Minimum work is **not** a rewrite. It is:

1. Close remaining **BlessBoard inline parity / bridge** gaps so BB behaves like AC on the public site.  
2. Add **true Universal Image crop + desktop/mobile placement** (largely **NOT IMPLEMENTED**; only BB structured `focal` enum today).  
3. Treat **selectable public themes** and Stitch **HQ/Branch multi-site studio** as **new product surfaces** on top of existing inheritance — do not invent a second model before finishing Prompt 7 stages already in the repo.  
4. Keep AC catalogue / BB structured entity editors as **product-specific** structured paths.

Stitch “GetPro Web Studio” chrome (three-pane manager, Auto-saved, Branch Sites rail) remains **too complex** for normal editing; implement the **numbered 1–7 capabilities** into the **existing WE01 public editor + overlays**, not as a replacement shell.

---

## B. Stitch Design Reference (inspected)

**Project:** `Website Change Management System` · `12538817760086591589`  

| # | Screen title | Screen ID | Role |
|---|--------------|-----------|------|
| 1 | Edit Website - Desktop | `f8176aec2a2c4c29a6839b676c62e4ad` | Primary public edit canvas |
| 2 | Edit Content - Desktop | `32d4fc191b124153ac69bdfd4fd0cd41` | Content edit overlay |
| — | Universal Image: Choose Image & Media Picker D/M | `4ddd3919…` / `6a6ac162…` | Upload / library |
| — | Universal Image: Crop & Position D/M | `cd1baa8b…` / `c9e28954…` | Crop + desktop/mobile framing |
| — | Universal Image: Upload errors / Image Slots | `329d8fb8…` / `7571d1b5…` | Errors + slot preview |
| 3 | Review & Publish / Simple Review | `01698e70…` / `33660fcf…` | Publish review |
| 4 | History & Restore / Simple Field History | `5dcd717f…` / `3d0ca359…` | Field/site history |
| 5 | Add & Organize Sections - Desktop | `147683a1ada04a5c9179aac66e5158d7` | Section library |
| 6 | Choose Website Theme (+ Gallery) | `4a6f1807…` / `2d53fd58…` | Theme presets |
| 7 | HQ & Branch Management D/M | `af7bebae…` / `79c3f013…` / `f44b1ff1…` | Multi-site scope |

**Visual parity note:** Screens and HTML copy were retrieved via Stitch MCP (`get_screen` / `list_screens`). Pixel-perfect comparison against hosted UI was **not** performed in this audit → interactive **visual parity NOT VERIFIED**. Written requirements below come from screen titles + extracted HTML copy.

**Stitch-only / aspirational (not ship as primary chrome):** “GetPro Web Studio”, Always Auto-saved, permanent Section Library column, facility portals as first-class websites for AC (AC today is **one clinic org website**).

Older **V7 Shared Website Editor** (`9585058196210789597`, WE01-*) remains the **implemented** shell lineage; do not replace it with the Web Studio layout.

---

## C. Shared Infrastructure Classification

| Capability | Classification | Evidence | Notes |
|------------|----------------|----------|-------|
| Editor shell / toolbar / page rail / More / mobile nav | **SHARED AND VERIFIED** | `editorShell.js`, `editor-chrome.ejs`; AC HOSTED in UX ref; BB wired via `attachWebsiteAdminChrome.js` | Reuse |
| Pencil controls (text/image) | **SHARED AND VERIFIED** (AC); **SHARED WITH GAPS** (BB coverage) | AC `website-editable-*.ejs`; BB `editable-text/image.ejs` + structured | Some BB fields still structured-only / bridge lag |
| Text dialog | **SHARED AND VERIFIED** | `field-editor-host.ejs`, `website-inline-edit.js` | WE01-02 |
| Image dialog (upload / library / replace / remove / alt) | **SHARED AND VERIFIED** (basic) | Same JS; HOSTED AC dialog | No crop UI |
| Structured-item dialogs | **PRODUCT-SPECIFIC** (+ shared media field) | AC catalogue + FAQ collection; BB `website-structured-edit.js` | Keep product adapters |
| Draft saving | **SHARED AND VERIFIED** | `contentService.saveWebsiteDraft` | Draft ≠ publish |
| Preview | **SHARED AND VERIFIED** | Preview banner WE01-07; AC HOSTED | |
| Publishing | **SHARED AND VERIFIED** | `publicationService.publishWebsiteDraft` | BB has extra review / overlay apply |
| Publish diagnostics | **SHARED WITH GAPS** → largely BB-fixed | `docs/qa/V2_01_PUBLISH_ERROR_DIAGNOSTICS_QA.md` | AC already returned explicit codes |
| Media upload + library | **SHARED AND VERIFIED** | `mediaService.js`, `website-media-field.js` | Global **5 MB**; JPEG/PNG/WebP/GIF — **no per-org limit** found |
| Field history + restore | **SHARED AND VERIFIED** | Change Manager Screen 4; PRIOR QA + AC HOSTED open | Prior draft revisions unavailable by design |
| Pending changes + reminder | **SHARED AND VERIFIED** | Change Manager toolbar; PRIOR QA | Threshold 5 |
| Unpublished changes panel | **SHARED AND VERIFIED** | Screen 3 | |
| Authorization + tenant isolation | **SHARED AND VERIFIED** | `permissionHooks.js` + product adapters | Org/instance scoped |
| Section add/hide/reorder/remove | **SHARED WITH GAPS** | `sectionRegistry.js`, section services; storage **not** unified BB vs AC | Works; Stitch “Section Library” UI denser than live |
| Selectable public themes gallery | **NOT IMPLEMENTED** | Stitch #6; code has branding colors + `themeKey≈default` on BB versions | See §E |
| Universal crop + D/M placement | **NOT IMPLEMENTED** | Stitch Crop screens; `validateFocal` = fit enum only | See §D |
| HQ/branch multi-site studio | **PRODUCT-SPECIFIC** (BB partial) / **NOT IMPLEMENTED** (Stitch AC facilities) | Prompt 7 + inheritance services | See §F |

**Do not replace:** draft/publish/media/change-manager/editor-shell services that are already shared and functioning.

---

## D. Universal Image Editing Audit

### Limits and types (existing)

| Rule | Value | Files |
|------|-------|-------|
| Max size | **5 MB** (hard-coded) | `public/platform/website-inline-edit.js`, `website-media-field.js` |
| Types | `image/jpeg`, `image/png`, `image/webp`, `image/gif` | Same |
| Org-specific limits | **Not found** | Do not assume |

### Capability matrix

| Requirement | UI available? | Persisted behavior? | Classification |
|-------------|---------------|---------------------|----------------|
| Upload from computer | Yes (shared dialog + media field) | Yes → CDN + `website_media` + content draft key | **SHARED AND VERIFIED** |
| Choose from library | Yes | Yes (select existing media id/src into draft) | **SHARED AND VERIFIED** |
| Replace / remove where permitted | Yes | Yes (draft image value / null) | **SHARED AND VERIFIED** |
| Original media preservation | Partial | Uploads create **new** media rows; replace does not overwrite file bytes. Soft-archive exists for library assets. No crop derivative store | **SHARED WITH GAPS** (OK for replace; no crop derivatives) |
| Per-placement crop | **No** in shared inline dialog | **No** true crop pipeline | **NOT IMPLEMENTED** |
| Focal / fit position | BB structured forms: enum select (`center`, `top`, …). Shared inline image dialog: **no focal control**. AC public: hardcoded `objectPosition` in templates / `activeClinicPublicMediaService` | BB: `focal` in structured payload (**fit**, not crop). Comment: *“no true crop pipeline”* | **SHARED WITH GAPS** / **PRODUCT-SPECIFIC** |
| Theme-specific image dimensions | Stitch: e.g. Desktop 16:9 · 1920×1080 | **No** theme slot dimension registry | **NOT IMPLEMENTED** |
| Separate desktop/mobile positioning | Stitch Crop screen: Desktop View / Mobile View + “Separate…” | Explicitly **NOT_APPLICABLE** in BB image audits (single asset + fit). No D/M placement JSON | **NOT IMPLEMENTED** |
| Draft persistence + publication | Yes for media id/src/alt | Yes via draft → publish | **SHARED AND VERIFIED** |

**BB image pencil coverage:** Strong after V2-BB universal upload audits (`blessboardImageEditorCoverage.js`). Remaining gaps are product backlog / contact redesign — not a missing shared uploader.

**AC image pencil coverage:** Hero/about/logo/etc. via shared editable image; doctor/service photos via **catalogue** (product-specific).

---

## E. Themes and Sections Audit

### Public templates (existing)

| Product | Template | Registry |
|---------|----------|----------|
| ActiveClinic | `activeclinic_clinic` | `productSchemaRegistry.js`, `templateRegistry.js` |
| BlessBoard | `blessboard_church` | Same |

These are **engine templates** (field keys / pages), not visitor-facing “theme presets.”

### Selectable themes

| Mechanism | Status |
|-----------|--------|
| Branding colors + logo + hero image | **Exists** — `branding.js` keys `home.logo`, `brand.primary_color`, `brand.accent_color`, `home.hero.image` |
| Styles / branding settings routes | **Exists** (product settings / More → Branding) |
| Theme gallery (Church vs Clinic presets, Apply Theme to Draft) | **Stitch #6 only** — **NOT IMPLEMENTED** |
| `themeKey` on BB publication versions | Present, typically **`default`**; filter UI in history — **not** a gallery chooser |

**Content vs presentation:** Engine content keys and BB `public_pages` / entities are independent of CSS theme. Safe to add theme presentation later **if** content keys stay stable.

### Sections

| Feature | Status |
|---------|--------|
| Add section (text / image / image+text / CTA; AC domain-backed services/doctors/hours) | **Exists** — `sectionRegistry.js`, Wave 4B |
| Hide / restore default / remove / reorder | **Exists** — section action services + WE01-06 menus |
| Storage | **Product-specific:** BB structured drafts → `page_sections`; AC `cms.sections` / engine keys |
| Theme missing a section | No theme packing yet. Section types are page-gated in registry; unknown types rejected at validation. **Stitch compatibility story is Stitch-only** until themes exist |

---

## F. HQ and Branch (and AC scope) Audit

### What exists today

**BlessBoard**

| Scope | Reality |
|-------|---------|
| Church-wide website | Primary: `/c/{org}` · engine instance `church_wide` / `branch_id NULL` content |
| Branch mini-websites | `/c/{org}/branches/{branchKey}` · nullable `branch_id` on CMS rows |
| Inheritance (pages/entities) | Read-time: branch published page/list if present else church-wide; entity lists **replace**, no merge (`loadTenantPublicPageModel.js`, architecture doc) |
| Page override | `websiteBranchPageInheritanceService.js` — copy church sections once; archive to remove |
| Settings inheritance | `resolveBranchWebsiteSettings.js` + `website_scope_settings` (Prompt 7 Stages 1–3) for identity/contact/SEO/service-times registry keys |
| Who edits/publishes | HQ vs branch roles; `website.edit` / `website.publish`; approval settings exist; trusted branch publish **configured but not activated** |
| Media / history isolation | Org-scoped media; versions can carry `branch_id`; Change Manager scopes by product+org+instance |

**Prompt 7 Stages 4–8** (collections, giving governance, trusted publish, full visual Stitch parity): **not started**.

**ActiveClinic**

| Scope | Reality |
|-------|---------|
| Clinic public website | **One** site per clinic organization (`/clinics/{key}`) |
| Facilities | Operational facilities, **not** separate public website instances in engine |
| Stitch #7 “Facility portals” | **Stitch-only / aspirational** for AC |

### HQ publish → branch content

- Inherited (no branch override): public resolution continues to show church-wide published content after HQ publish.  
- Branch override pages: church-wide publish does **not** mutate branch override rows; branch keeps local copy until reset.  
- Settings overrides: branch override rows win; reset returns to HQ default (Stage 2/3).

**Do not invent a new inheritance model** before completing/aligning with Prompt 7 + `websiteBranchPageInheritanceService`. Stitch #7 should be designed as a **thin UI** over these services.

---

## G. BB vs AC Editor Parity (remaining differences)

| Area | AC (reference) | BB | Gap type |
|------|----------------|----|----------|
| Entry | Hub + public `?website_edit=1`; compact entry chrome | Hub `/hq/website` + `/c/...?website_edit=1`; branch settings editor | Entry UX similar; BB also has HQ content-admin / publish review |
| Pencil coverage | Broad on public pages | Broad after image audits; some fields structured-only; historical key bugs in backlog | **Confirmed UI gap** (narrow) |
| Text/image dialogs | Shared | Shared | **Already shared** |
| Structured items | Catalogue doctors/services; FAQ collection | Leadership/ministries/events/sermons/giving structured | **Product-specific** |
| Save / preview / publish | Shared shell | Shared shell + BB publish review / bridge | **Product-specific** policy |
| Mobile | Shared CSS sheets | Shared | Mostly shared; BB 390px interactive parity **NOT VERIFIED** this audit |
| History / media | Shared CM + media | Shared | **Already shared** |
| Public layout | Clinic template | Church template | **Not an editor defect** |

---

## H. Requirement Matrix (implementation guide)

| Requirement | Existing implementation | Gap | Exact affected files (primary) | Proposed minimal change | QA test |
|-------------|-------------------------|-----|--------------------------------|-------------------------|---------|
| Shared pencil editor | WE01 shell + inline-edit | BB residual fields / overlay count | `attachWebsiteAdminChrome.js`, BB editable partials, `blessboardBridge.js` | Bridge remaining fields into engine keys; match AC entry | Hosted BB edit save/preview/publish smoke |
| Text dialog | Shared | None material | `website-inline-edit.js`, `field-editor-host.ejs` | None | Existing wave tests |
| Image upload/library | Shared | Crop / D/M placement | Same + `mediaService.js` | Add placement metadata only; keep upload | Media upload + draft publish |
| Crop & D/M position | Stitch only; BB focal enum | Full crop UI + persist | New shared crop module; extend image value schema; CSS consumers | Placement JSON per slot; optional crop box; **no** org upload limit invention | Unit + hosted crop draft/publish |
| Themes gallery | Branding colors only | Gallery + apply | `branding.js`, styles routes, instance/settings | Theme id on instance/settings; CSS packs; content unchanged | Theme switch preview/publish |
| Sections organize | Registry + actions | Stitch library density | `sectionRegistry.js`, section services, `website-section-actions.js` | UX polish only unless missing ops | Wave 4A/4B2 + V8 sections tests |
| HQ/branch scope | Prompt 7 + inheritance | Stitch studio; Stages 4–8 | `resolveBranchWebsiteSettings.js`, `websiteBranchPageInheritanceService.js`, HQ branch routes | Thin selector UI; finish Prompt 7 stages as needed | Branch inherit/override/publish isolation |
| Pending/reminder/history | Change Manager | None material | `websiteChangeManagerService.js`, CM UI | None | Existing V2.01 CM tests |
| Authz isolation | Permission hooks | None material | `permissionHooks.js`, adapters | None | Cross-tenant deny tests |

---

## I. Implementation Plan (independently testable tasks)

Recommended order: **A → B → D → C → E → F** (parity and images before themes/network chrome).

### A. BB inline editor parity

| Field | Value |
|-------|--------|
| Goal | BB public edit matches AC journey: pencil → Save draft → Preview → Publish |
| Dependencies | None (shared stack exists) |
| Migration | **NO** (unless a missing content key requires registry only — usually no DDL) |
| Risk | Medium — BB overlay/bridge regressions |
| Tests | Hosted BB edit smoke; `shared-website-editor-wave*`; bridge tests; fix backlog keys (e.g. V2-BB-18 if still open) |
| Minimal change | Wire remaining public fields to shared editables; ensure Change Manager counts bridge keys; simplify hub CTAs to “Edit Website” |

### B. Universal image cropping and positioning

| Field | Value |
|-------|--------|
| Goal | Shared crop + desktop/mobile placement per image slot; preserve original media |
| Dependencies | A helpful but not hard-required |
| Migration | **YES** (likely) — placement/crop metadata on content value and/or media derivatives table; **UNKNOWN** exact DDL until design freeze |
| Risk | High — CSS/layout breakage across BB+AC templates |
| Tests | Upload → crop → draft → publish → live CSS; original media still listable; remove/replace; 390px sheet |
| Minimal change | Extend image JSON `{ mediaId, src, alt, placement: { desktop, mobile } }`; shared crop UI in `website-inline-edit.js`; **do not** rebuild uploader |

### C. Theme infrastructure

| Field | Value |
|-------|--------|
| Goal | Selectable public theme packs without rewriting content |
| Dependencies | Prefer after A; independent of B if themes only swap CSS tokens |
| Migration | **YES** if theme id stored on instance/settings; **NO** if CSS-only file maps + branding key |
| Risk | Medium — visual regressions |
| Tests | Apply theme to draft; preview; publish; revert via history; content keys unchanged |
| Minimal change | Theme registry + CSS variables; More → Appearance; keep branding color overrides |

### D. Section creation and organization

| Field | Value |
|-------|--------|
| Goal | Match Stitch #5 capabilities using existing section services |
| Dependencies | A |
| Migration | **NO** (BB `update_section` already added in 109) |
| Risk | Low–medium |
| Tests | `v8-shared-website-sections`, wave4a/4b2; theme-missing-section behavior when C lands |
| Minimal change | UX for add/reorder/hide; document domain-backed AC sections |

### E. HQ/branch website scope and inheritance

| Field | Value |
|-------|--------|
| Goal | Stitch #7 as thin UI over **existing** BB inheritance; AC remains single-site unless product explicitly adds facility sites |
| Dependencies | A; Prompt 7 Stages 1–3 done |
| Migration | **UNKNOWN** / likely **NO** for selector UI; Stages 4–8 may need DDL |
| Risk | High if new model invented; Low if UI-only over existing services |
| Tests | Inherit vs override; HQ publish does not clobber overrides; branch publish isolation; media/history scope |
| Minimal change | Website switcher (HQ vs branch); inherit badges; reuse settings editor; **reject** AC facility websites until product decision |

### F. Integrated desktop/mobile QA

| Field | Value |
|-------|--------|
| Goal | Hosted BB+AC desktop + 390px pass for A–E |
| Dependencies | A–E as delivered |
| Migration | **NO** |
| Risk | Low |
| Tests | Cursor Browser + hosted scripts; Stitch visual compare for Crop/Theme/HQ screens |
| Minimal change | QA pack only |

---

## J. Explicit Non-Actions

| Action | Done? |
|--------|-------|
| Code / migration / deploy | **No** |
| Production changes | **No** |
| Replacing shared draft/publish/media/CM | **No** (recommended against) |
| Inventing new HQ/branch inheritance before Prompt 7 | **No** |

---

## K. Verification Gaps

| Gap | Status |
|-----|--------|
| Hosted BB click-through this audit | **NOT VERIFIED** (SOURCE + prior QA) |
| Pixel Stitch vs live for screens 1–7 | **NOT VERIFIED** (screens retrieved; no pixel compare) |
| Crop/theme/HQ features on hosted | **N/A** — not implemented |
| Exact migration shape for crop/theme | **UNKNOWN** until product freezes JSON schema |

---

## L. Sources

- `docs/qa/V2_01_ACTIVECLINIC_EDITOR_UX_REFERENCE.md`  
- Stitch `12538817760086591589` (screens 1–7 + Universal Image)  
- `docs/platform/SHARED_WEBSITE_ENGINE.md`, `V8_SHARED_WEBSITE_SECTIONS.md`  
- `docs/architecture/CHURCH_BRANCH_WEBSITE_CUSTOMIZATION.md`, Prompt 7 Stage 1–3 docs  
- `docs/qa/V2_BB_*_IMAGE_*.md`, `V2_01_*` Change Manager / Publish Diagnostics QA  
- Code: `website-engine/*`, `platform/website/*`, `attachActiveClinicWebsiteChrome.js`, `attachWebsiteAdminChrome.js`, `websiteStructuredDraftValidation.js`, `branding.js`, `sectionRegistry.js`, `websiteBranchPageInheritanceService.js`, `resolveBranchWebsiteSettings.js`  

---

**Verdict restated:** `SHARED_EDITOR_ARCHITECTURE_AUDIT_COMPLETE`
