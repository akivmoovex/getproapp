# V2.01 Shared Website Theme Infrastructure QA

**Task:** `V2_01_SHARED_WEBSITE_THEME_INFRA`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing`  
**Baseline (B4 section-management):** `4b3d9dda8fdc`  
**C1 functional commit / hosted SHA:** `240a22ea6732` (`240a22ea6732…`)  
**Deployment identity:** `moovex-platform-v8-testing`  
**DB identity:** `expectedIdentityKey=moovex-platform-v7` · `environment=testing` · `mediaWriteNamespace=testing-v8`  
**Production:** **untouched** (`blessboard.com` `/healthz` remained `03a89106e2fe` / `moovex-platform-production`)

**Refs:**  
- `docs/qa/V2_01_SHARED_EDITOR_ARCHITECTURE_AUDIT.md`  
- `docs/qa/V2_01_SHARED_SECTION_MANAGEMENT_QA.md`  
- `docs/qa/V2_01_UNIVERSAL_IMAGE_EDITOR_QA.md`  
- Stitch **Website Change Management System** `projects/12538817760086591589` · Screen 6 (Choose Website Theme) — **gallery UI not implemented in C1**

**Personas (disposable):**  
- BB HQ · org `bb-v8qa-mub23a6v6a6b`  
- AC admin · org `ac-v8-qa-mub23a6v6a6b`

---

## FINAL VERDICT

**`V2_01_SHARED_THEME_INFRA_PASS`**

Minimal shared theme registry + draft persistence (`site.theme_id`) ships for BB and AC with product-isolated collections, default themes preserving current public appearance, draft-only selection APIs, shell presentation attrs, B2/B3 image-slot compatibility reporting, and BB publication `theme_key` mirroring. No theme gallery UI, no six Stitch visual themes, no page builder, no HQ/branch studio in C1.

---

## 1. Theme registry and persistence contract

| Item | Contract |
| --- | --- |
| Content key | `site.theme_id` via existing `platform.website_content` |
| Persistence | `contentService.saveWebsiteDraft` only — **never auto-publishes** |
| Registry module | `src/platform/website/themeRegistry.js` |
| Service | `src/platform/website/websiteThemeService.js` |
| HTTP helper | `src/platform/website/websiteThemeHttp.js` |
| API | `GET/POST …/website/theme` (BB path + AC clinic path) |
| Product isolation | Separate BB / AC collections; `getTheme(id, product)` rejects cross-product ids |
| Legacy BB alias | publication / historical `theme_key` `"default"` → `bb.default` |
| Publication mirror (BB) | Published theme → version `theme_key` via `publicationThemeKeyFor` (`bb.default` → `"default"`) |

Switching a theme does **not** rewrite text, images, structured item IDs, section order, drafts, media ownership, field history, or HQ/branch scopes. Unsupported sections / image slots are **preserved and flagged** (`dropsContent: false`).

---

## 2. Existing default themes

| Theme ID | Product | Display name | Engine template | CSS class |
| --- | --- | --- | --- | --- |
| `bb.default` | BlessBoard | BlessBoard Classic | `blessboard_church` | `gp-website-theme--bb-default` |
| `ac.default` | ActiveClinic | ActiveClinic Classic | `activeclinic_clinic` | `gp-website-theme--ac-default` |

These encode the **current** public layouts. No additional Stitch theme packs in C1.

---

## 3. Supported sections and image slots

- **Sections:** Product section types from `sectionRegistry` (`BLESSBOARD_SECTION_TYPES` / `ACTIVECLINIC_SECTION_TYPES`).
- **Image slots:** Trusted framing metadata from existing `IMAGE_SLOT_REGISTRY` (B2/B3). Themes declare slot framing requirements where known; unlisted slots fall back to runtime defaults and are flagged for review.
- **Compatibility response:** `unsupportedSections[]`, `imageFlags[]`, always `preserved: true` for reported items.

---

## 4. Exact files / migrations changed

**New**

- `src/platform/website/themeRegistry.js`
- `src/platform/website/websiteThemeService.js`
- `src/platform/website/websiteThemeHttp.js`
- `tests/v2-01-shared-theme-infra.test.js`

**Modified**

- `src/blessboard/website/blessboardChurchTemplate.js` — `site.theme_id` ENUM + editable field
- `src/activeclinic/website/activeClinicWebsiteTemplate.js` — `site.theme_id` ENUM
- `src/blessboard/http/attachWebsiteAdminChrome.js` — theme presentation + `themeUrl`
- `src/activeclinic/http/attachActiveClinicWebsiteChrome.js` — theme presentation + `themeUrl`
- `src/blessboard/http/blessboardWebsiteEditorRoutes.js` — theme GET/POST
- `src/activeclinic/http/activeClinicWebsiteRoutes.js` — theme GET/POST
- `src/blessboard/services/websitePublicationVersionService.js` — published theme → `theme_key`
- `src/platform/website/publicWebsiteUrl.js` — `buildPublicWebsiteThemePath`
- Shells: `views/blessboard/v5/partials/tenant-public-shell-start.ejs`, `views/activeclinic/layouts/public-shell.ejs`
- Asset bumps: BB `website-add-section.css?v=v2-theme-infra-1`, AC `ASSET_VERSION=v2-theme-infra-1`
- Related test asset assertions updated

**Migrations:** **none** (reuse `platform.website_content`).

---

## 5. Local tests

| Suite | Result |
| --- | --- |
| `tests/v2-01-shared-theme-infra.test.js` | **PASS** (9) |
| `tests/v2-01-shared-section-management.test.js` | **PASS** (regression) |
| `tests/v2-01-universal-image-editor.test.js` | **PASS** (regression) |

Coverage includes: BB/AC isolation, default layout compatibility, persistence key + auth rejection, draft API wiring, draft/live presentation attrs, publish authorization path (draft-only save), content/section preservation flags, image placement compatibility, HQ/branch path builders, legacy fallback alias.

---

## 6. Hosted tests (disposable)

**Tip verified before QA:** BB + AC `/healthz` → `gitSha=240a22ea6732` · `deploymentCode=moovex-platform-v8-testing` · `schemaCompatible=true`.

| Check | Result |
| --- | --- |
| BB public `/c/bb-v8qa-…` body theme attrs | **PASS** — `data-website-theme-id="bb.default"` · class `gp-website-theme--bb-default` · legacy `1` |
| AC public `/clinics/ac-v8-qa-…` body theme attrs | **PASS** — `ac.default` · no BB theme id |
| Unauthenticated theme GET | **PASS** — BB `401 not_authenticated` · AC `403 forbidden` |
| Authenticated BB theme GET/POST | **PASS** — draft save `published:false`; unsupported `magic_carousel` preserved+flagged |
| BB cross-product `ac.default` | **PASS** — `400 invalid_theme` |
| Authenticated AC theme GET/POST | **PASS** — draft save `published:false` |
| AC cross-product `bb.default` | **PASS** — `400 invalid_theme` |
| Live public remains product default after draft save | **PASS** (only default themes exist in C1; live still `bb.default` / `ac.default`) |
| Production `/healthz` | **PASS** — unchanged `03a89106e2fe` / `moovex-platform-production` |

---

## 7. Remaining limitations (intentional C1)

- No theme gallery / chooser UI (Stitch Screen 6 visual gallery deferred).
- Only one theme per product (`bb.default` / `ac.default`); six Stitch visual themes not implemented.
- No advanced color/font theme editor (branding keys unchanged).
- No HQ/branch multi-site theme studio.
- Theme draft vs live isolation is fully wired; visual divergence requires future non-default themes.
- Image placement is never rewritten; adjustment UX remains B3 Adjust Picture.

---

## 8. Final hosted SHA and DB identity

| Field | Value |
| --- | --- |
| Hosted SHA | `240a22ea6732` |
| Deployment | `moovex-platform-v8-testing` |
| Platform line | `v8` |
| Environment | `testing` |
| Expected DB identity | `moovex-platform-v7` |
| Media namespace | `testing-v8` |
| Production | Untouched (`moovex-platform-production` / `03a89106e2fe`) |

---

## Production untouched confirmation

No production host, DB, media root, migration apply, or deployment profile was modified. C1 used existing `website_content` rows only on disposable V8 testing tenants.
