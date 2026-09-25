# V2.01 Shared Website Theme Gallery QA

**Task:** `V2_01_SHARED_THEME_GALLERY`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing`  
**Baseline (C1):** `240a22ea6732`  
**C2 functional commit / hosted SHA:** `86e8f26c154a` (`86e8f26c154a…`)  
**Deployment identity:** `moovex-platform-v8-testing`  
**DB identity:** `expectedIdentityKey=moovex-platform-v7` · `environment=testing` · `mediaWriteNamespace=testing-v8`  
**Production:** **untouched** (`blessboard.com` `/healthz` remained `03a89106e2fe` / `moovex-platform-production`)

**Refs:**  
- `docs/qa/V2_01_SHARED_THEME_INFRA_QA.md`  
- `docs/qa/V2_01_SHARED_EDITOR_ARCHITECTURE_AUDIT.md`  
- Stitch **Website Change Management System** `projects/12538817760086591589`  
  - Screen 6 desktop: `4a6f1807bf53410f8ae5de18a1e99588` (Choose Website Theme)  
  - Gallery desktop: `2d53fd58518a4a2192d2618d126f1c76` (Choose Website Theme Gallery)  
  - No dedicated mobile Theme screen in project list — responsive stacked cards at 390px

**Personas (disposable):**  
- BB HQ · org `bb-v8qa-mub23a6v6a6b`  
- AC admin · org `ac-v8-qa-mub23a6v6a6b`

---

## FINAL VERDICT

**`V2_01_SHARED_THEME_GALLERY_PASS`**

Shared Choose Theme gallery ships for BB and AC on the C1 registry/API. Each product sees only its selectable renderer-backed theme (`bb.default` / `ac.default`), with draft-only select, authorized draft preview, and compatibility review UI. Multi-theme alternate selection is **NOT TESTED** (only one implemented theme per product). Six Stitch visual packs, advanced customization, and HQ/branch studio remain out of scope.

---

## 1. Implemented selectable themes by product

| Product | Selectable themes | Renderer |
| --- | --- | --- |
| BlessBoard | `bb.default` — BlessBoard Classic | `blessboard_church` (`hasWorkingRenderer: true`) |
| ActiveClinic | `ac.default` — ActiveClinic Classic | `activeclinic_clinic` (`hasWorkingRenderer: true`) |

Themes without `hasWorkingRenderer` are excluded from gallery cards and rejected on save (`theme_renderer_unavailable`).

**Alternate-theme selection / visual divergence:** **NOT TESTED** — no second implemented theme exists per product.

---

## 2. Shared components reused

| Component | Role |
| --- | --- |
| `themeRegistry.js` / `websiteThemeService.js` | C1 registry, draft persistence, compatibility |
| `GET/POST …/website/theme` | JSON state + draft select (unchanged path) |
| `GET …/website/themes` | New HTML gallery page |
| `themeGalleryPageModel.js` + `theme-gallery-page.ejs` | Shared gallery view |
| `website-theme-gallery.css` / `.js` | Shared styles + select client |
| `renderWebsiteManagementPage` | Standalone settings shell (same as Styles/SEO) |
| Editor more-menu | **Choose Theme** → gallery URL |

No product-mode switcher in ordinary editing. BB and AC share gallery markup; collections stay isolated.

---

## 3. Files changed (C2)

**New**

- `src/platform/website/themeGalleryPageModel.js`
- `src/platform/website/renderWebsiteThemeGallery.js`
- `views/platform/website/theme-gallery-page.ejs`
- `public/platform/website-theme-gallery.css`
- `public/platform/website-theme-gallery.js`
- `tests/v2-01-shared-theme-gallery.test.js`

**Modified**

- `src/platform/website/themeRegistry.js` — `hasWorkingRenderer`, `listSelectableThemesForProduct`
- `src/platform/website/websiteThemeService.js` — preview query overlay, renderer gate
- `src/platform/website/websiteThemeHttp.js` — gallery presentation + standalone render
- `src/platform/website/publicWebsiteUrl.js` — `buildPublicWebsiteThemesPath`
- BB/AC editor routes + chrome — gallery routes + Choose Theme menu + preview query wiring

**Migrations:** none.

---

## 4. Local tests

| Suite | Result |
| --- | --- |
| `tests/v2-01-shared-theme-gallery.test.js` | **PASS** (7) |
| `tests/v2-01-shared-theme-infra.test.js` | **PASS** (regression) |

Covers product filtering, current/draft indicators, gallery markup isolation, routes/menu wiring, draft-only + preview overlay, compatibility/Adjust Picture hints, single-theme limitation copy, 390px CSS.

---

## 5. Hosted tests (disposable)

**Tip before QA:** BB + AC `/healthz` → `gitSha=86e8f26c154a` · `deploymentCode=moovex-platform-v8-testing` · `schemaCompatible=true`.

| Check | Result |
| --- | --- |
| Unauth BB/AC gallery | **PASS** — `401` / `403` |
| BB gallery product filter | **PASS** — `bb.default` only; no `ac.default` |
| AC gallery product filter | **PASS** — `ac.default` only; no `bb.default` |
| Current/draft indicators + Preview/Select | **PASS** |
| BB/AC draft select via C1 API | **PASS** — `published:false` |
| AC cross-product `bb.default` | **PASS** — `400 invalid_theme` |
| Preview without publication | **PASS** — draft preview query; live still default |
| Publish / live alternate theme | **NOT TESTED** — no second theme to publish |
| Unsupported section/slot warnings UI | **PASS** (markup + client render; live flags empty on defaults) |
| Desktop + 390px CSS | **PASS** — stylesheet served; `@media (max-width: 390px)` present |
| Content/image placement preserved | **PASS** — select does not rewrite content (C1 contract; `dropsContent:false`) |

---

## 6. Preview / publish limitations

- **Preview Theme** opens authorized draft preview with `website_theme_preview=<id>` overlay. Overlay does not write draft or live content.
- With only one theme per product, preview matches the current default appearance.
- **Select Theme** POSTs to existing C1 `/website/theme` — draft only.
- Publish remains the existing WE01 Publish control — **no auto-publish**.
- Alternate-theme visual preview/publish: **NOT TESTABLE** until a second renderer-backed theme ships.

---

## 7. Remaining gaps

- Six Stitch visual theme packs not implemented.
- Advanced palette/font theme editor not added (Styles remains secondary for brand colors).
- HQ/branch multi-site theme studio not added.
- Stitch product switcher (Church vs Clinic) intentionally omitted from ordinary editing.
- Compatibility warnings for unsupported sections/slots are ready; defaults currently produce empty warning lists.

---

## 8. Final hosted SHA and DB identity

| Field | Value |
| --- | --- |
| Hosted SHA | `86e8f26c154a` |
| Deployment | `moovex-platform-v8-testing` |
| Platform line | `v8` |
| Environment | `testing` |
| Expected DB identity | `moovex-platform-v7` |
| Media namespace | `testing-v8` |
| Production | Untouched (`moovex-platform-production` / `03a89106e2fe`) |

---

## Production untouched confirmation

No production host, DB, media root, migration, or deployment profile was modified. C2 writes used disposable V8 testing tenants only via the existing draft theme API.
