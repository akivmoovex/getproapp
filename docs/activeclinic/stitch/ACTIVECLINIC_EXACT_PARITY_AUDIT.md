# ActiveClinic exact Stitch parity audit

**Stitch project:** [ActiveClinic Universal Authentication Interface](https://stitch.withgoogle.com/projects/10611909237747031838)  
**Project ID:** `10611909237747031838`  
**Inspected:** 2026-08-20 via live MCP `get_project` + `list_screens` + exported HTML/screenshots  
**Stitch `updateTime`:** `2026-08-20T20:01:22.418944Z`  
**Live screen count:** **49**

This audit is the source of truth for *this* project only. Internal ops remain in `12272131183982732110`. Older P21 public screens in `17813606734422395399` are not used here.

## STAGE 0 — Safety

| Check | Value |
|-------|--------|
| Branch | `V7` |
| Local SHA (start) | `3dd92fe389afd57817f75646664e04c5aa197879` |
| `origin/V7` SHA (start) | `3dd92fe389afd57817f75646664e04c5aa197879` |
| Hosted testing SHA | `3dd92fe389af` (`activeclinic.pronline.org` + `blessboard.pronline.org`) |
| Working tree (start) | clean |
| Environment | testing (`moovex-platform-testing`) |
| DB identity expected | `moovex-platform-v7` |
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

### Mini-website MW01–MW07 (28)

Existing CMS/public clinic website implementation on the shared V7 website engine. Status carried forward from live routes; this pass did not replace CMS chrome with a second engine.

| Screen | ID | Device | Route | Status |
|--------|----|--------|-------|--------|
| MW01-01 Clinic Website Home | `97a428ff4b4d45abbe6d03b192f04ffb` | Desktop | `/clinics/:clinicKey` | `MINOR_DIFFERENCE` |
| MW01-02 Clinic Website Mobile Home | `b6287290e9264712a5b89da04c12a325` | Mobile | same | `MINOR_DIFFERENCE` |
| MW01-03 Website Editor Home | `effdec3344324c33aa7e3d8eb8f60002` | Desktop | `?website_edit=1` | `MINOR_DIFFERENCE` |
| MW01-04 Website Editor Mobile | `23774b8a4baf4924bc659f4ad86708e0` | Mobile | same | `MINOR_DIFFERENCE` |
| MW02-01 Inline Text Editing | `32e4cba9812c43f5ae9a808222ca6dbb` | Desktop | inline editor | `EXACT` (function + chrome) |
| MW02-02 Inline Image Editing | `70cbbaefaa7f4e2ca2aafb583c33d84f` | Desktop | inline editor | `EXACT` |
| MW02-03 Inline Section Editing | `aa63525e14b342709f3636906ab2afb3` | Desktop | inline + sections | `MINOR_DIFFERENCE` |
| MW02-04 Mobile Inline Editing | `ead1eaa3d72c4eea884010b4ef6b5a18` | Mobile | same | `MINOR_DIFFERENCE` |
| MW03-01 Manage Sections | `f19c2a311e9b4f0d878e3ec51dae2769` | Desktop | `/app/settings/website/sections` | `EXACT` |
| MW03-02 Add Section | `6f3db361015d4c51b2323bd441b6e181` | Desktop | dialog | `EXACT` |
| MW03-03 Reorder Sections | `2552e98a7d8d4b4695bbc4f5f629b9c0` | Desktop | reorder POST | `EXACT` |
| MW03-04 Section Settings | `27d259868bd846c091c61d27744a2c42` | Desktop | `/sections/:id` | `EXACT` |
| MW04-01 Pages Manager | `a2aaa656090347548594e79d9c7b401d` | Desktop | `/pages` | `EXACT` |
| MW04-02 Add New Page | `36f2e7a043d344b98b391e464f451bb8` | Desktop | `/pages/new` | `EXACT` |
| MW04-03 Edit Page Settings | `943371c07cd34875a6ea02dc7c03d3bf` | Desktop | `/pages/:id` | `EXACT` |
| MW04-04 Navigation Manager | `e7e2a1ab35a34e16a9e279a6f36c0d6f` | Desktop | `/navigation` | `EXACT` |
| MW05-01 Page Builder | `df0401b47e454504b0d24ed27abf1c92` | Desktop | `/builder` | `EXACT` |
| MW05-02 Add Content Block | `64bc636a34404cff81e28e61acf688e7` | Desktop | dialog | `EXACT` |
| MW05-03 Block Settings | `e15bf9d40eae4bbfbcb4bb8a25a067d8` | Desktop | inline form | `MINOR_DIFFERENCE` (in-page form, not full-screen) |
| MW05-04 Mobile Page Builder | `44fca098452342a89255f9c9cd3cc9c9` | Mobile | same | `MINOR_DIFFERENCE` |
| MW06-01 Media Library | `6032ae29163940f2847099b69e21c001` | Desktop | `/media` | `EXACT` |
| MW06-02 Upload Media | `1328c4524fda4a7a9de1c409633be399` | Desktop | upload form | `EXACT` |
| MW06-03 Select Media | `fe0d81b72c5d483a85cd1011462af9c0` | Desktop | `?select=1` | `MINOR_DIFFERENCE` |
| MW06-04 Media Details | `451748f8ee4b48ecb16c29137adb043d` | Desktop | `/media/:id` | `EXACT` |
| MW07-01 Site Status & Publishing | `48a4b01abbf14eaca2265e7ab4b05e1e` | Desktop | `/publish` | `EXACT` |
| MW07-02 Version History | `22fc73d39ad846a3aa6db72f13862def` | Desktop | `/clinics/:key/website/history` | `MINOR_DIFFERENCE` |
| MW07-03 Publishing Confirmation | `c2c22334084c4944af49d436e0872a88` | Desktop | native confirm | `MINOR_DIFFERENCE` |
| MW07-04 Mobile Publishing | `f0cc5328778e4bd987429652f16cdb35` | Mobile | `/publish` | `MINOR_DIFFERENCE` |

### Absent from this Stitch project

| Named in prompt | Live result |
|-----------------|-------------|
| ACW07 Contact | **NOT_IN_PROJECT.** V7 `/contact` remains. |
| ACW09 Register clinic | **NOT_IN_PROJECT.** V7 `/register-clinic` remains. |
| MW08–MW10 | **NOT_IN_PROJECT.** V7 CMS settings/library/hub routes remain. |
| Pricing, Careers, HIPAA page, Cookie Settings, Sitemap | **NOT_IN_PROJECT** as screens. Footer Careers omitted (`FUNCTIONAL_GAP_CAREERS`). Cookie Settings not rendered as a fake control. HIPAA footer label not used; Privacy Policy / Terms remain real routes. Security Practices → `/privacy`. |

## STAGE 3 — Parity matrix (public + auth)

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
* Background: `#f9f9ff` / `#f8f9ff`
* Surface: white cards, 8–16px radius
* Headline xl: 48/56, weight 700, tracking -0.02em
* Icons: Material Symbols Outlined
* Desktop container: 1280px; mobile margin 16px

## Images stored

Stitch JPEG exports live under `public/activeclinic/assets/stitch/` (26 files). They are not hotlinked.

## Functional gaps (do not fake)

| Gap | Reason |
|-----|--------|
| `FUNCTIONAL_GAP_GOOGLE_SSO` | Stitch shows Sign in with Google. V7 has no Google identity integration. Button not rendered. |
| `FUNCTIONAL_GAP_CAREERS` | Stitch footer Careers. No careers product. Link omitted. |
| `FUNCTIONAL_GAP_DIRECTORY_QUICK_FILTERS` | Open Now / Telehealth / Accessible Facility are not V7 directory filters. Not rendered as working controls. |
| `FUNCTIONAL_GAP_COOKIE_SETTINGS` | No cookie-consent product. Not rendered as a control. |

Shared platform nav stays the ACW01 set (Find a Clinic, For Clinics, For Patients, About, Contact, Login, Register Your Clinic) because ACW03/ACW06 Stitch nav introduces Pricing / Resources / Patient Tools with no V7 routes.

## STAGE 11 — Text (public home desktop)

Stitch: `Healthcare Precision, Human Warmth.`  
V7: `Healthcare Precision, Human Warmth.`  
Status: MATCH

Stitch: `What is ActiveClinic?` / `Unified Workflows` / `Data Precision` / `Instant Comm` / `Anywhere Access`  
V7: same  
Status: MATCH

Removed previous honesty-rewrite sections (patient-benefits, clinic-benefits, privacy essay) because they are **EXTRA** vs this Stitch home.

Runtime-dynamic exceptions: clinic names, result counts, signed-in user, actual dates.

## STAGE 13 — Screenshot QA

Chromium viewports requested: Stitch desktop, 1440×900, 1280×800, Stitch mobile, 390×844.

Public ACW and login were compared against live Stitch HTML exports and screenshots (MCP + saved JPEGs), then implemented in EJS/CSS. A full side-by-side pixel loop of every V7 route vs every Stitch PNG was **not** completed in this pass (no dedicated screenshot suite checked in). Visual status for ACW/auth is therefore `MINOR_ACCEPTABLE_VARIANCE`, not `PIXEL_CLOSE_MATCH`.

MW01–MW07 were not re-captured against this project's Stitch PNGs in this pass.

## STAGE 15 — Tests (local `NODE_ENV=test node --test --test-concurrency=1`)

| Suite group | Passed | Failed | Skipped |
|-------------|-------:|-------:|--------:|
| public ACW, directory, auth, registration, website, mobile, a11y | 66 | 0 | 0 |
| authentication-foundation, onboarding, CMS, hardening, schema, RBAC | 67 | 0 | 0 |
| **Total** | **133** | **0** | **0** |

## STAGE 16 — Final status vocabulary

See `ACTIVECLINIC_STITCH_MASTER_INVENTORY.md` section 6.

## STAGE 17 — Git

Commits on `V7` (not `main`): public site, authentication copy, this audit. Push `V7 → origin/V7` after those commits. Production not deployed.
