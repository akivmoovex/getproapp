# ActiveClinic exact Stitch parity audit

**Stitch project:** [ActiveClinic Universal Authentication Interface](https://stitch.withgoogle.com/projects/10611909237747031838)  
**Project ID:** `10611909237747031838`  
**Inspected:** 2026-08-20 via live MCP `get_project` + `list_screens` + Stitch HTML/screenshots  
**Prior audit `updateTime`:** `2026-08-20T20:01:22.418944Z` (49 screens)  
**Live Stitch `updateTime`:** `2026-08-20T23:51:40.026527Z`  
**Live `list_screens` count:** **83** (28 MW + 14 ACW + 7 `active-clinic-03-*` + 30 MF + 4 additional auth-named screens)  
**This pass target:** original **49** (ACW + auth + MW01–MW07). **MF01–MF05 are out of scope.**

This audit is the source of truth for *this* project only. Internal ops remain in `12272131183982732110`. Older P21 public screens in `17813606734422395399` are not used here.

### Live inventory delta (before code changes)

| Family | Prior lock | Live now | This pass |
|--------|-----------:|---------:|-----------|
| MW01–MW07 | 28 | **28** (same IDs/names) | implement visual parity |
| ACW01–ACW06 | 14 | 14 | preserved; not restyled |
| `active-clinic-03-*` | 7 | 7 | preserved; not restyled |
| MF01–MF05 | 0 | 30 | **out of scope** |
| Other auth-named | 0 | 4 | **out of scope** |
| **Total** | **49** | **83** | 49 reaudited |

## STAGE 0 — Safety (MW phase 2)

| Check | Value |
|-------|--------|
| Branch | `V7` |
| Local SHA (start of MW pass) | `bc75aa580c70a00bfd32b8cde4249504f9ef1e2f` |
| `origin/V7` SHA (start) | `bc75aa580c70a00bfd32b8cde4249504f9ef1e2f` |
| Ahead / behind | `0` / `0` |
| Hosted testing SHA (start) | `bc75aa580c70` on `activeclinic.pronline.org` (**hosted current = YES** vs local HEAD at start) |
| Working tree (start) | clean |
| Deployment | `moovex-platform-testing` |
| Environment | `testing` |
| Database identity | `moovex-platform-v7` |
| Production touched | **NO** |
| Merged to `main` | **NO** |

## STAGE 1 — Locked screens

Status values used in this document:

* `EXACT` — visible copy, section order, and chrome match Stitch, with only runtime data differences
* `MINOR_DIFFERENCE` — same composition; small token/chrome variance
* `MAJOR_DIFFERENCE` — layout or content still diverges
* `WRONG_CONTENT` / `WRONG_IMAGE` / `WRONG_LAYOUT`
* `NOT_IMPLEMENTED`
* `FUNCTIONAL_GAP` — Stitch shows a control V7 must not fake
* `NOT_IN_PROJECT` — named in the task prompt but absent from this Stitch project

### Public ACW (14)

| Screen | ID | Device | Route | Template | Screenshot | Status |
|--------|----|--------|-------|----------|------------|--------|
| ACW01-01 ActiveClinic Home Desktop | `cd19a117442440848c68b099de31e571` | Desktop | `GET /` | `public/home.ejs` | yes | `MINOR_DIFFERENCE` |
| ACW01-02 ActiveClinic Home Mobile | `d2771c7c7e804754a697d7550e3911ea` | Mobile | `GET /` | same (`.acw-only-mobile`) | yes | `MINOR_DIFFERENCE` |
| ACW02-01 Clinic Directory Desktop | `06e890aeec9344d4b4384389d7658659` | Desktop | `GET /clinics` | `public/clinics-directory.ejs` | yes | `MINOR_DIFFERENCE` |
| ACW02-02 Clinic Directory Mobile | `00089a7dfc6848b0aedbe2acbd4b3f6f` | Mobile | `GET /clinics` | same | yes | `MINOR_DIFFERENCE` |
| ACW03-01 For Clinics Desktop | `59af2deab69440c29a0be0d626734817` | Desktop | `GET /for-clinics` | `public/for-clinics.ejs` | yes | `MINOR_DIFFERENCE` |
| ACW03-02 For Clinics Mobile | `1def30eaafa84ca4a95dc902c57876c3` | Mobile | same | same | yes | `MINOR_DIFFERENCE` |
| ACW03-03 Platform Features Desktop | `6dae23abf6d04b1b8bfa05fe491fdb7d` | Desktop | `GET /features` | `public/features.ejs` | yes | `MINOR_DIFFERENCE` |
| ACW03-04 Platform Features Mobile | `e75ff649e21641ef85de97a26afab1c7` | Mobile | same | same | yes | `MINOR_DIFFERENCE` |
| ACW04-01 Clinic Website Feature Desktop | `d5710c9dd0174e49870845a511bca4ed` | Desktop | `GET /clinic-website` | `public/clinic-website.ejs` | yes | `MINOR_DIFFERENCE` |
| ACW04-02 Clinic Website Feature Mobile | `2e1ef6377ace4b4ea16737d785071c7f` | Mobile | same | same | yes | `MINOR_DIFFERENCE` |
| ACW05-01 For Patients Desktop | `db1c779c25614552b0a426a3ea7965ba` | Desktop | `GET /for-patients` | `public/for-patients.ejs` | yes | `MINOR_DIFFERENCE` |
| ACW05-02 For Patients Mobile | `f22cca3648c2453bad5a1edbae142158` | Mobile | same | same | yes | `MINOR_DIFFERENCE` |
| ACW06-01 About ActiveClinic Desktop | `d6f4fe333ad245af89dbc517afeb8e06` | Desktop | `GET /about` | `public/about.ejs` | yes | `MINOR_DIFFERENCE` |
| ACW06-02 About ActiveClinic Mobile | `1899e7e6bbbc4a65ba083dcbe0d8fa0d` | Mobile | same | same | yes | `MINOR_DIFFERENCE` |

### Auth (`active-clinic-03-*`, 7)

| Screen | ID | Device | Route | Template | Status |
|--------|----|--------|-------|----------|--------|
| desktop-login | `2bfbc9c71ad64bfca245d9e1a26f837d` | Desktop | `/login` | `auth/login.ejs` | `MINOR_DIFFERENCE` + `FUNCTIONAL_GAP_GOOGLE_SSO` |
| mobile-login | `edb81abfe548470db687f343186ff786` | Mobile | `/login` | same | `MINOR_DIFFERENCE` + `FUNCTIONAL_GAP_GOOGLE_SSO` |
| desktop-validation-error | `f300be014a6148329910762c0b2970c8` | Desktop | `/login` error | same | `MINOR_DIFFERENCE` |
| mobile-validation-error | `236850040de8488c9627970faad74b62` | Mobile | `/login` error | same | `MINOR_DIFFERENCE` |
| desktop-multi-clinic-selector | `df566a9cd85e4583b019363ca2104b00` | Desktop | `/login/select-organization` | `auth/select-organization.ejs` | `MINOR_DIFFERENCE` |
| mobile-multi-clinic-selector | `ef782bd739854150b5b30ea4525c50c6` | Mobile | same | same | `MINOR_DIFFERENCE` |
| loading-signing-in | `5adaedd9e29e48cc82b47dc3ac913383` | Desktop | overlay on submit | `partials/auth-signing-in.ejs` | `EXACT` (copy) |

### Mini-website MW01–MW07 (28) — Phase 2 visual pass

Clinic Editor chrome (`views/activeclinic/partials/website-cms-nav.ejs`) + tenant home/header/footer. No duplicate fake routes. Theme / Emergency / media video-search / publish-note / staging URL are **omitted**, not faked.

| Screen | Desktop | Mobile | Text | Assets | Layout | Functional | Final status |
|--------|---------|--------|------|--------|--------|------------|--------------|
| MW01-01 Clinic Website Home | `GET /clinics/:clinicKey` `tenant/home.ejs` | — | DYNAMIC clinic/services/doctors; EXACT section labels | DYNAMIC_TENANT_MEDIA | MINOR (FAQ/promo extras if enabled) | working public site | `MINOR_ACCEPTED_VARIANCE` |
| MW01-02 Clinic Website Mobile Home | — | same route 390 CSS | same | DYNAMIC_TENANT_MEDIA | MINOR drawer vs Stitch bottom tabs | working | `MINOR_ACCEPTED_VARIANCE` |
| MW01-03 Website Editor Home | `?website_edit=1` + `website-editor-chrome.ejs` | — | EXACT Editor Mode / Pages / Sections / Assets / Publish | N/A chrome | MINOR extra V7 lifecycle pills | working inline edit | `MINOR_ACCEPTED_VARIANCE` |
| MW01-04 Website Editor Mobile | — | same | same | N/A | MINOR stacked chrome | working | `MINOR_ACCEPTED_VARIANCE` |
| MW02-01 Inline Text Editing | inline field on tenant | — | EXACT editor controls | N/A | MINOR | working save | `MINOR_ACCEPTED_VARIANCE` |
| MW02-02 Inline Image Editing | inline image | — | EXACT | DYNAMIC_TENANT_MEDIA | MINOR | working media picker | `MINOR_ACCEPTED_VARIANCE` |
| MW02-03 Inline Section Editing | inline + sections | — | EXACT | N/A | MINOR | working | `MINOR_ACCEPTED_VARIANCE` |
| MW02-04 Mobile Inline Editing | — | same | EXACT | N/A | MINOR | working | `MINOR_ACCEPTED_VARIANCE` |
| MW03-01 Manage Sections | `/app/settings/website/sections` | CSS | EXACT Homepage Sections / + Add Section | N/A | MINOR no live preview canvas | working reorder | `MINOR_ACCEPTED_VARIANCE` |
| MW03-02 Add Section | dialog `#ac-mw-add-section` | — | EXACT | N/A | MINOR | working POST | `MINOR_ACCEPTED_VARIANCE` |
| MW03-03 Reorder Sections | same list + POST | — | EXACT grips | N/A | MINOR | working | `MINOR_ACCEPTED_VARIANCE` |
| MW03-04 Section Settings | `/sections/:id` | — | EXACT Discard / Save Changes | N/A | MINOR | working | `MINOR_ACCEPTED_VARIANCE` |
| MW04-01 Pages Manager | `/pages` | CSS | EXACT Pages Manager / + Add New Page | N/A | MINOR | working | `MINOR_ACCEPTED_VARIANCE` |
| MW04-02 Add New Page | `/pages/new` | — | EXACT Add New Page / Select a Template | N/A | MINOR | working create | `MINOR_ACCEPTED_VARIANCE` |
| MW04-03 Edit Page Settings | `/pages/:id` | — | EXACT Basic Information / SEO / Save Changes | N/A | MINOR | working | `MINOR_ACCEPTED_VARIANCE` |
| MW04-04 Navigation Manager | `/navigation` | — | EXACT | N/A | MINOR | working | `MINOR_ACCEPTED_VARIANCE` |
| MW05-01 Page Builder | `/pages/:id/builder` | — | EXACT Clinic Builder | N/A | MINOR list vs canvas | working blocks | `MINOR_ACCEPTED_VARIANCE` |
| MW05-02 Add Content Block | dialog `#ac-mw-add-block` | — | EXACT | N/A | MINOR | working POST | `MINOR_ACCEPTED_VARIANCE` |
| MW05-03 Block Settings | in-page block form | — | EXACT fields | N/A | in-page not full-screen panel | working save | `MINOR_ACCEPTED_VARIANCE` |
| MW05-04 Mobile Page Builder | — | same builder | EXACT | N/A | stacked rail | working | `MINOR_ACCEPTED_VARIANCE` |
| MW06-01 Media Library | `/media` | CSS | EXACT Media Library | DYNAMIC clinic media | MINOR no video/search/pagination | working | `MINOR_ACCEPTED_VARIANCE` |
| MW06-02 Upload Media | `#ac-mw-upload-media` dialog | — | EXACT Upload Media / Done | N/A | MINOR | working multipart | `MINOR_ACCEPTED_VARIANCE` |
| MW06-03 Select Media | picker / `?select=1` | — | EXACT Select Media | DYNAMIC | MINOR | working | `MINOR_ACCEPTED_VARIANCE` |
| MW06-04 Media Details | `/media/:id` | — | EXACT Media Details | DYNAMIC | MINOR | working save | `MINOR_ACCEPTED_VARIANCE` |
| MW07-01 Site Status & Publishing | `/publish` | — | EXACT Site Status & Publishing | N/A | MINOR no staging URL | working publish | `MINOR_ACCEPTED_VARIANCE` |
| MW07-02 Version History | `/clinics/:key/website/history` | — | EXACT Version History | N/A | cards not Stitch table clone | working restore-as-new | `MINOR_ACCEPTED_VARIANCE` |
| MW07-03 Publishing Confirmation | native `confirm()` | — | INTENTIONAL (no fake note field) | N/A | native vs Stitch modal | working | `FUNCTIONAL_GAP` (`FUNCTIONAL_GAP_PUBLISH_NOTE`) |
| MW07-04 Mobile Publishing | `/publish` 390 | CSS | EXACT | N/A | stacked editor | working | `MINOR_ACCEPTED_VARIANCE` |

### Absent from this Stitch project (unchanged)

| Named in prompt | Live result |
|-----------------|-------------|
| ACW07 Contact | **NOT_IN_PROJECT.** V7 `/contact` remains. |
| ACW09 Register clinic | **NOT_IN_PROJECT.** V7 `/register-clinic` remains. |
| MW08–MW10 | **NOT_IN_PROJECT.** V7 CMS settings/library/hub remain under **More**. |
| MF01–MF05 | **NEW in live Stitch (30 screens). Out of scope for this MW pass.** |
| Pricing, Careers, HIPAA page, Cookie Settings, Sitemap | **NOT_IN_PROJECT** as screens. Footer Careers omitted (`FUNCTIONAL_GAP_CAREERS`). |

## STAGE 3 — ACW + auth matrix (unchanged this pass)

| Screen | Route | Text | Images | Layout | Typography | Responsive | Overall |
|--------|-------|------|--------|--------|------------|------------|---------|
| ACW01-01 | `/` | MATCH | MATCH | MINOR | MATCH | MATCH | MINOR |
| ACW01-02 | `/` | MATCH | MATCH | MINOR | MATCH | MATCH | MINOR |
| ACW02-01 | `/clinics` | MINOR | MINOR | MINOR | MATCH | MINOR | MINOR |
| ACW02-02 | `/clinics` | MINOR | MINOR | MINOR | MATCH | MINOR | MINOR |
| ACW03-01 | `/for-clinics` | MATCH | MATCH | MINOR | MATCH | MATCH | MINOR |
| ACW03-02 | `/for-clinics` | MATCH | MISSING | MINOR | MATCH | MATCH | MINOR |
| ACW03-03 | `/features` | MATCH | MINOR | MINOR | MATCH | MATCH | MINOR |
| ACW03-04 | `/features` | MATCH | MINOR | MINOR | MATCH | MATCH | MINOR |
| ACW04-01 | `/clinic-website` | MATCH | MATCH | MINOR | MATCH | MATCH | MINOR |
| ACW04-02 | `/clinic-website` | MATCH | MATCH | MINOR | MATCH | MATCH | MINOR |
| ACW05-01 | `/for-patients` | MATCH | MATCH | MINOR | MATCH | MATCH | MINOR |
| ACW05-02 | `/for-patients` | MATCH | MATCH | MINOR | MATCH | MATCH | MINOR |
| ACW06-01 | `/about` | MATCH | MATCH | MINOR | MATCH | MATCH | MINOR |
| ACW06-02 | `/about` | MATCH | N/A | MINOR | MATCH | MATCH | MINOR |
| desktop-login | `/login` | MINOR | N/A | MINOR | MATCH | MINOR | MINOR |
| Google SSO | `/login` | MISSING | — | — | — | — | `FUNCTIONAL_GAP_GOOGLE_SSO` |

Directory images: Stitch uses sample clinic logos/photos. V7 cards use live published clinic data (intentional runtime substitution).

## Design tokens (from live Stitch `designTheme`)

* Font: Inter (400/500/600/700)
* Primary: `#00685f` / teal accent `#0d9488`
* Background: `#f8f9ff`
* Surface: white cards, 8–16px radius
* Icons: Material Symbols Outlined
* Desktop container: 1280px; mobile margin 16px

## Images / assets (MW)

| Stitch asset | V7 | Status |
|--------------|----|--------|
| Sample clinic name / physicians / campus photos | Tenant `publicName`, catalogue, `websiteHeroUrl` | `DYNAMIC_TENANT_MEDIA` |
| Clinic Editor logos in CMS | Tenant branding | `DYNAMIC_TENANT_MEDIA` |
| Public ACW stitch JPEGs | `public/activeclinic/assets/stitch/` | unchanged this pass (`EXACT_ASSET` / `ACCEPTED_SUBSTITUTION` per prior ACW audit) |

No Stitch hotlinks.

## Dynamic text mapping (MW)

| Stitch sample | V7 |
|---------------|----|
| Clinic name (e.g. Northside Regional Campus) | tenant `websiteDisplayName` / `publicName` |
| Services / physicians | published catalogue |
| Opening hours / address | facility `publicHours` / location overlays |
| Version timestamps / editor identity | real versions / authenticated user |
| Draft Mode | real unpublished-draft lifecycle |

## Functional gaps (do not fake)

| Gap | Reason |
|-----|--------|
| `FUNCTIONAL_GAP_GOOGLE_SSO` | Stitch Sign in with Google. Not rendered. |
| `FUNCTIONAL_GAP_CAREERS` | No careers product. |
| `FUNCTIONAL_GAP_DIRECTORY_QUICK_FILTERS` | Not V7 directory filters. |
| `FUNCTIONAL_GAP_COOKIE_SETTINGS` | No cookie-consent product. |
| `FUNCTIONAL_GAP_THEME` | Stitch Theme tab. No V7 theme picker. Omitted. |
| `FUNCTIONAL_GAP_EMERGENCY_CTA` | Stitch Emergency header button. No clinic emergency field. Omitted. |
| `FUNCTIONAL_GAP_MEDIA_VIDEO_SEARCH` | Videos, tag search, 12-page pagination. Image-only library. |
| `FUNCTIONAL_GAP_STAGING_URL` | Stitch staging environment URL. Not a V7 environment. |
| `FUNCTIONAL_GAP_PUBLISH_NOTE` | Stitch publish-note field. Native `confirm()` kept. |

## Screenshot QA (MW)

Viewports used: Stitch desktop composition, 1440×900, 1280×800, Stitch mobile, 390×844 (CSS + Chromium where available). Stitch PNG/HTML from live MCP `list_screens` / `get_screen`. Hosted `activeclinic.pronline.org` matched start SHA `bc75aa580c70` **before** this commit; hosted screenshots were **not** used as evidence for the new CMS chrome.

| Metric | Count |
|--------|------:|
| Screens compared | 28 MW |
| Desktop comparisons | 23 |
| Mobile comparisons | 5 |
| `PIXEL_CLOSE_MATCH` | 0 |
| `MINOR_ACCEPTED_VARIANCE` | 27 |
| `FUNCTIONAL_GAP` | 1 (MW07-03 publish note modal) |
| `BLOCKED` | 0 |

No screen is `PIXEL_CLOSE_MATCH`: Stitch is a standalone Clinic Editor composition; V7 keeps real CMS semantics, More-menu extras, native confirm, and tenant-generated content.

## STAGE 15 — Tests (local `NODE_ENV=test node --test --test-concurrency=1`)

MW phase 2 run:

| Suite | Result |
|-------|--------|
| `tests/activeclinic-mw-stitch-parity.test.js` | pass |
| `tests/activeclinic-website-cms.test.js` | pass |
| `tests/activeclinic-website-hardening.test.js` | pass |
| `tests/activeclinic-public-website.test.js` | pass |
| `tests/activeclinic-phase8-mobile.test.js` | pass |
| `tests/activeclinic-phase9-a11y.test.js` | pass |
| `tests/activeclinic-navigation-rbac.test.js` | pass |
| `tests/activeclinic-acw-public-site.test.js` | pass |
| `tests/activeclinic-auth-stitch-parity.test.js` | pass |
| `tests/v7-activeclinic-website-template.test.js` | pass |
| `tests/v7-default-website-template-qa.test.js` | pass |
| `tests/v7-website-mobile-editor.test.js` | pass |

| | Passed | Failed | Skipped |
|--|-------:|-------:|--------:|
| **Total** | **80** | **0** | **0** |

## STAGE 16 — Final status vocabulary

See `ACTIVECLINIC_STITCH_MASTER_INVENTORY.md` section 6. This pass reports:

* `PIXEL_CLOSE_MATCH`
* `MINOR_ACCEPTED_VARIANCE` (includes prior ACW `MINOR_DIFFERENCE`)
* `FUNCTIONAL_GAP`
* `BLOCKED`
* `NOT_REAUDITED`

### Original 49-screen totals (target `NOT_REAUDITED = 0`)

Each of the original 49 screens has exactly one primary status:

| Status | Count | Composition |
|--------|------:|-------------|
| `PIXEL_CLOSE_MATCH` | 0 | none (Stitch compositions are not pixel-identical to V7) |
| `MINOR_ACCEPTED_VARIANCE` | 46 | 14 ACW + 5 auth (errors, org select, signing-in) + 27 MW |
| `FUNCTIONAL_GAP` | 3 | desktop-login, mobile-login (`FUNCTIONAL_GAP_GOOGLE_SSO`), MW07-03 (`FUNCTIONAL_GAP_PUBLISH_NOTE`) |
| `BLOCKED` | 0 | |
| `NOT_REAUDITED` | 0 | |

## STAGE 17 — Git

MW phase 2 commits on `V7` only. Production not deployed. `main` not merged.
