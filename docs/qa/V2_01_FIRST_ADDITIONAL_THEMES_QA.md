# V2.01 First Additional Website Themes QA

**Task:** `V2_01_FIRST_ADDITIONAL_WEBSITE_THEMES` (C3)  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing`  
**Baseline (C2):** `86e8f26c154a`  
**C3 functional commit / hosted SHA:** `6b2bf8820dce`  
**Deployment identity:** `moovex-platform-v8-testing`  
**DB identity:** `expectedIdentityKey=moovex-platform-v7` · `environment=testing` · `mediaWriteNamespace=testing-v8` · `expectedDatabaseEnvironment=testing`  
**Production:** **untouched** (`blessboard.com` `/healthz` remained `03a89106e2fe` / `moovex-platform-production`)

**Refs:**  
- `docs/qa/V2_01_SHARED_THEME_INFRA_QA.md` (C1)  
- `docs/qa/V2_01_SHARED_THEME_GALLERY_QA.md` (C2)  
- `docs/qa/V2_01_UNIVERSAL_IMAGE_EDITOR_QA.md` (B2/B3)  
- `docs/qa/V2_01_SHARED_SECTION_MANAGEMENT_QA.md`  
- Stitch **Website Change Management System** `projects/12538817760086591589`  
  - Screen 6: `4a6f1807bf53410f8ae5de18a1e99588` (Choose Website Theme)  
  - Gallery: `2d53fd58518a4a2192d2618d126f1c76` (Choose Website Theme Gallery)

**Personas (disposable):**  
- BB HQ · org `bb-v8qa-mub23a6v6a6b`  
- AC admin · org `ac-v8-qa-mub23a6v6a6b`

---

## FINAL VERDICT

**`V2_01_FIRST_ADDITIONAL_THEMES_PASS`**

One additional renderer-backed public theme ships per product (`bb.contemporary-fellowship`, `ac.family-wellness-mint`) on the existing C1 registry and C2 gallery. Draft select / preview / publish / rollback work on hosted V8 with product isolation enforced server-side. Defaults preserved. Content and section identities survive switching. Remaining four Stitch packs, palette editor, and HQ/branch studio stay out of scope.

---

## 1. Implemented theme IDs and public renderers

| Product | Theme ID | Display name | Renderer / shell | CSS pack |
| --- | --- | --- | --- | --- |
| BlessBoard | `bb.default` | BlessBoard Classic | `blessboard_church` / `blessboard_tenant_public` | (unchanged shell CSS) |
| BlessBoard | `bb.contemporary-fellowship` | Contemporary Fellowship | same engine + body class + stylesheet | `/blessboard/v5/website-theme-contemporary-fellowship.css?v=v2-theme-c3-1` |
| ActiveClinic | `ac.default` | ActiveClinic Classic | `activeclinic_clinic` / `activeclinic_public_tenant` | (unchanged shell CSS) |
| ActiveClinic | `ac.family-wellness-mint` | Family Wellness Mint | same engine + body class + stylesheet | `/activeclinic/website-theme-family-wellness-mint.css?v=v2-theme-c3-1` |

Body classes: `gp-website-theme--bb-contemporary-fellowship`, `gp-website-theme--ac-family-wellness-mint`.

Themes are CSS packs on the existing product public shells (not new engines). Organization-owned text, images, and structured items continue to render through the same templates.

---

## 2. Screens / pages supported

Both alternate themes declare the same page/section coverage as their product default (full renderer support; compatibility reports `dropsContent:false` / empty unsupported lists on QA tenants).

**BlessBoard pages:** `home`, `about`, `contact`, `giving`, `leadership`, `ministries`, `events`, `sermons` (+ shared section types from `BLESSBOARD_SECTION_TYPES`).

**ActiveClinic pages:** derived from `ACTIVECLINIC_SECTION_TYPES` (home / about / services / doctors / contact and related public pages already served by the clinic public renderer).

Hero framing overrides (B2/B3 contract):

| Theme | Slot | Desktop aspect | Mobile aspect |
| --- | --- | --- | --- |
| Contemporary Fellowship | `home.hero.image` | `21 / 9` | `16 / 10` |
| Family Wellness Mint | `home.hero.image` | `16 / 10` | `4 / 3` |

---

## 3. Exact files changed (C3 commit `6b2bf8820dce`)

**New**

- `public/blessboard/v5/website-theme-contemporary-fellowship.css`
- `public/activeclinic/website-theme-family-wellness-mint.css`
- `tests/v2-01-first-additional-themes.test.js`

**Modified**

- `src/platform/website/themeRegistry.js` — register alternates, hero slot aspects, `stylesheetHref`, selectable flags
- `src/platform/website/websiteThemeService.js` — present stylesheet to shells
- `src/blessboard/website/blessboardChurchTemplate.js` — ENUM includes `bb.contemporary-fellowship`
- `src/activeclinic/website/activeClinicWebsiteTemplate.js` — ENUM includes `ac.family-wellness-mint`
- `src/activeclinic/http/renderActiveClinicPublic.js` — asset cache bump for theme CSS
- `views/blessboard/v5/partials/tenant-public-shell-start.ejs` — optional `websiteThemeStylesheet` link
- `views/activeclinic/layouts/public-shell.ejs` — optional `websiteThemeStylesheet` link
- `tests/v2-01-shared-theme-infra.test.js`
- `tests/v2-01-shared-theme-gallery.test.js`
- `tests/v2-01-shared-section-management.test.js`
- `tests/v2-01-universal-image-editor.test.js`

**This QA follow-up (docs only)**

- `docs/qa/V2_01_FIRST_ADDITIONAL_THEMES_QA.md`
- `docs/qa/references/v2-01-first-additional-themes/*`

---

## 4. Local test results

```
node --test tests/v2-01-first-additional-themes.test.js \
  tests/v2-01-shared-theme-infra.test.js \
  tests/v2-01-shared-theme-gallery.test.js
→ 21 pass / 0 fail
```

---

## 5. Hosted E2E (A–L) — BB and AC

Hosted SHA confirmed on both apexes before/after QA: **`6b2bf8820dce`** / `moovex-platform-v8-testing` / `testing`.

CSS assets HTTP 200:

- `https://blessboard.neuniversity.org/blessboard/v5/website-theme-contemporary-fellowship.css?v=v2-theme-c3-1`
- `https://activeclinic.neuniversity.org/activeclinic/website-theme-family-wellness-mint.css?v=v2-theme-c3-1`

### Theme switching / rollback evidence

| Step | BlessBoard | ActiveClinic |
| --- | --- | --- |
| A–B Content already present on disposable tenants (text, images, ministries/services, prior QA markers) | PASS | PASS |
| C Preview alternate (draft mode / `website_theme_preview` with edit context) | PASS — draft sheet loads | PASS |
| D Select alternate as draft (`POST …/website/theme`) | `bb.contemporary-fellowship`, `published:false`, `dropsContent:false` | `ac.family-wellness-mint`, same |
| E Refresh — draft persists | draft theme id persists | draft theme id persists |
| F Live still original | live `bb.default` while draft alt | live `ac.default` while draft alt |
| G Image adjust if framing requires | Hero aspect metadata registered; Universal Image Editor unchanged (B2/B3). No CDN rewrite. On these tenants hero reposition not required for PASS. | same |
| H Publish → live uses new theme | live `bb.contemporary-fellowship` + stylesheet | live `ac.family-wellness-mint` + stylesheet |
| I Inline pencils / edit chrome | `gp-website-editor` + `data-bb-field` / field-editor host present under alternate theme | edit chrome + field editor host present |
| J Switch default as draft → publish | restored live `bb.default` | restored live `ac.default` |
| K Content / section identities | 10 `data-section*` ids identical draft-alt vs live-default before publish | tenant content markers preserved through cycle |
| L Unauthorized / cross-product | unauth `403`; cross `ac.*` → `400 invalid_theme` | unauth `403`; cross `bb.*` → `400 invalid_theme` |

Gallery isolation: BB gallery lists Classic + Contemporary Fellowship only; AC lists Classic + Family Wellness Mint only (no cross-product cards).

CSRF note: JSON theme select requires a fresh edit-page CSRF (`meta csrf-token` / cookie). Publish succeeded via form POST with fresh CSRF (JSON publish returned CSRF 403 with a stale token — same pattern as prior C1 hosted checks).

Tenants left with **live defaults** after QA (`bb.default` / `ac.default`).

---

## 6. Content and image preservation

- Theme select responses returned `compatibility.ok:true`, empty `unsupportedSections` / `preservedSections` / `imageFlags`, `dropsContent:false`.
- Section keys on BB home matched across default live and alternate draft (e.g. `hero`, `welcome`, `service_times`, `ministries_intro`, `sermons_intro`, `locations`, custom `text_ed61bd`, …).
- Structured ministry / service / doctor content continued to render under alternate themes (product-native templates only — no church content in AC or clinic content in BB).
- No automatic publication; draft theme never flipped live until explicit publish.
- Media references remained organization-owned; theme CSS only changes framing tokens / surfaces.

---

## 7. Desktop / mobile visual evidence

References: `docs/qa/references/v2-01-first-additional-themes/`

| File | What it shows |
| --- | --- |
| `01-bb-contemporary-fellowship-desktop-draft.png` | BB draft Contemporary Fellowship (dark header / cyan accents) |
| `02-bb-contemporary-fellowship-mobile-390.png` | BB draft at 390 emulation — cyan CTAs, dark sanctuary surfaces |
| `03-ac-family-wellness-mint-mobile-390.png` | AC draft Family Wellness Mint — mint surfaces, `#006c4a` CTA |
| `04-ac-family-wellness-mint-desktop-draft.png` | AC draft mint theme (panel capture) |
| `05-bb-gallery-two-themes.png` | BB Choose Theme gallery with both Classic + Contemporary Fellowship |

**Viewport caveat:** Cursor browser panel captured files at ~300px width even when CDP desktop metrics were set. Desktop **behavior** was verified via accessibility snapshots (desktop nav present) and HTML (`data-website-theme-id`, stylesheet link, theme body class). True full-bleed 1280px photographic parity is therefore **partial** — not blocked.

---

## 8. Remaining Stitch parity gaps

Stitch Screen 6 HTML retrieved successfully (names + tokens present: Contemporary Fellowship, Family Wellness Mint, `#006c4a`, `#F4FDF8`, `#68dba9`, `#A7F3D0`).

Gaps / intentional differences:

- Themes are CSS packs on shared shells, not pixel clones of Stitch marketing mockups (no new sermon/booking/clinical features from mockups).
- Cyan Contemporary Fellowship tokens follow gallery concept (dark slate + cyan) — Stitch HTML did not expose a matching `#06b6d4` hex in the retrieved Screen 6 markup; visual direction taken from approved gallery concept + HTML labels.
- Ultra-wide / mint hero aspects registered; full Stitch art-directed hero compositions **NOT VERIFIED** pixel-for-pixel.
- Remaining four Stitch theme packs **not implemented** (out of scope).
- Advanced palette customization and HQ/branch theme studio **out of scope**.

---

## 9. Production confirmation

| Surface | gitSha | deploymentCode | environment |
| --- | --- | --- | --- |
| blessboard.neuniversity.org | `6b2bf8820dce` | `moovex-platform-v8-testing` | testing |
| activeclinic.neuniversity.org | `6b2bf8820dce` | `moovex-platform-v8-testing` | testing |
| blessboard.com | `03a89106e2fe` | `moovex-platform-production` | production |

Production was not deployed or modified for this task.

---

## 10. Out of scope (confirmed untouched)

- Remaining four Stitch website themes  
- Advanced brand / palette customization beyond existing Styles  
- HQ/branch theme management studio  
- New editors or galleries  
- Production
