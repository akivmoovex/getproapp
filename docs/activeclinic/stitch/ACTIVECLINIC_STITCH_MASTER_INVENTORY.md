# ActiveClinic Stitch — Master Inventory Lock

**Verdict:** `ACTIVECLINIC_STITCH_MASTER_INVENTORY_LOCKED`  
**Locked:** 2026-08-20  
**Authority:** live Stitch MCP `list_screens` + `get_project` (not repository docs)  
**Stitch project:** [ActiveClinic Universal Authentication Interface](https://stitch.withgoogle.com/projects/10611909237747031838)  
**Project ID:** `projects/10611909237747031838`  
**Project type:** `TEXT_TO_UI_PRO`  
**Stitch updateTime:** `2026-08-20T20:01:22.418944Z`  
**Exact screen count:** **49**

This lock covers **only** project `10611909237747031838`. Internal ops P01–P07 live in `projects/12272131183982732110` ([screen inventory](../../activeclinic/ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md)). Public P21–P27 live in `projects/17813606734422395399`.

Do **not** implement a second staff authentication UI from the `active-clinic-03-*` screens. V7 already ships `/login` from P01. ACW08-01–ACW08-07 are **not present** in this project.

---

## 1. Safety

| Check | Value |
|-------|--------|
| Branch | `V7` |
| Local HEAD | `3cfdc5a3747099dc2d0dda0a52c576aabd5b14c2` |
| `origin/V7` HEAD | `3cfdc5a3747099dc2d0dda0a52c576aabd5b14c2` |
| Ahead / behind | `0` / `0` |
| Working tree | clean |
| Production touched | **NO** |
| Pushed | **NO** |
| Deployed | **NO** |
| Application code modified this task | **NO** |

---

## 2. Live inventory (every screen currently in Stitch)

MCP `list_screens` returned **49** screens. `get_project.screenInstances` matches those 49 (plus 4 design-system asset instances, which are not screens).

### Totals by naming family

| Family | Count | Device mix | Present numbers | Absent numbers |
|--------|------:|------------|-----------------|----------------|
| `MW*` | 28 | 23 desktop, 5 mobile | MW01–MW07 | **MW08, MW09, MW10** (0 screens) |
| `ACW*` | 14 | 7 desktop, 7 mobile | ACW01–ACW06 | **ACW07–ACW12** (0 screens); **ACW08-01–ACW08-07** (0 screens) |
| `active-clinic-03-*` (legacy auth) | 7 | 4 desktop, 3 mobile | 7 kebab-case auth screens | — |
| Other naming | 0 | — | none | — |
| **Project total** | **49** | 34 desktop, 15 mobile | — | — |

### Unique counts

| Measure | Count |
|---------|------:|
| Exact Stitch screens | 49 |
| Unique after SAME_DESIGN collapse | **49** (no intra-project SAME_DESIGN duplicates) |
| Unique workflows after collapsing desktop/mobile pairs | 34 |
| MW unique workflows (device pairs collapsed) | 23 |
| ACW unique workflows | 7 |
| Legacy auth unique workflows | 4 (login, org select, validation error, loading) |

### Screens expected by name that are **not** in this project

| Expected | Live result |
|----------|-------------|
| MW08-01–MW08-04, MW09-01–MW09-04, MW10-01–MW10-02 | **ABSENT.** V7 still has CMS routes tagged to those codes; they have **no current Stitch source** in this project. |
| ACW07–ACW12 | **ABSENT.** |
| ACW08-01–ACW08-07 | **ABSENT.** Cannot compare legacy auth to ACW08. |

---

## 3. Duplicate detection (legacy auth vs ACW08)

**Comparison targets ACW08-01 through ACW08-07 do not exist** in project `10611909237747031838`. Every legacy auth screen is therefore **UNKNOWN** versus ACW08.

Inspected screenshots of all seven `active-clinic-03-*` screens. They are **not** the same design as each other. Desktop/mobile pairs are device variants, not duplicates.

| Legacy Stitch screen | Screen ID | vs ACW08-01–07 | vs other screens in this project | Do not implement second UI |
|----------------------|-----------|----------------|----------------------------------|----------------------------|
| `active-clinic-03-desktop-login` | `2bfbc9c71ad64bfca245d9e1a26f837d` | **UNKNOWN** | DISTINCT from validation-error (centered card + Google SSO vs split pane) | Yes — V7 `/login` already exists (P01) |
| `active-clinic-03-mobile-login` | `edb81abfe548470db687f343186ff786` | **UNKNOWN** | Device variant of desktop-login (not SAME_DESIGN: different copy, icons, “Welcome back”) | Yes |
| `active-clinic-03-desktop-multi-clinic-selector` | `df566a9cd85e4583b019363ca2104b00` | **UNKNOWN** | DISTINCT — “Choose a clinic” card grid | Yes — V7 `/login/select-organization` exists |
| `active-clinic-03-mobile-multi-clinic-selector` | `ef782bd739854150b5b30ea4525c50c6` | **UNKNOWN** | DISTINCT from desktop selector (“Select a Workspace” + search; not SAME_DESIGN) | Yes |
| `active-clinic-03-desktop-validation-error` | `f300be014a6148329910762c0b2970c8` | **UNKNOWN** | DISTINCT login **error state** (split pane + photo + field errors) | Yes — error is already a state of `/login` |
| `active-clinic-03-mobile-validation-error` | `236850040de8488c9627970faad74b62` | **UNKNOWN** | Device variant of validation-error | Yes |
| `active-clinic-03-loading-signing-in` | `5adaedd9e29e48cc82b47dc3ac913383` | **UNKNOWN** | DISTINCT full-page “Signing you in…” | Yes — V7 uses button `data-loading="Signing in…"`, not this screen |

**Product rule from this lock:** do not implement duplicate authentication UIs from these seven screens, and do not wait for ACW08 screens that are not in Stitch.

---

## 4. Screen catalogue (purpose)

### Phase MW01 — Clinic public website + editor chrome (4)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| MW01-01 Clinic Website Home | 01 | Desktop | `97a428ff4b4d45abbe6d03b192f04ffb` | Public tenant clinic home |
| MW01-02 Clinic Website Mobile Home | 02 | Mobile | `b6287290e9264712a5b89da04c12a325` | Mobile tenant clinic home |
| MW01-03 Website Editor Home | 03 | Desktop | `effdec3344324c33aa7e3d8eb8f60002` | In-place website editor chrome on tenant home |
| MW01-04 Website Editor Mobile | 04 | Mobile | `23774b8a4baf4924bc659f4ad86708e0` | Mobile website editor chrome |

### Phase MW02 — Inline editing (4)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| MW02-01 Inline Text Editing | 01 | Desktop | `32e4cba9812c43f5ae9a808222ca6dbb` | Inline text field editing on the public site |
| MW02-02 Inline Image Editing | 02 | Desktop | `70cbbaefaa7f4e2ca2aafb583c33d84f` | Inline image replacement |
| MW02-03 Inline Section Editing | 03 | Desktop | `aa63525e14b342709f3636906ab2afb3` | Inline section field editing |
| MW02-04 Mobile Inline Editing | 04 | Mobile | `ead1eaa3d72c4eea884010b4ef6b5a18` | Mobile inline editor |

### Phase MW03 — Sections CMS (4)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| MW03-01 Manage Sections | 01 | Desktop | `f19c2a311e9b4f0d878e3ec51dae2769` | Section list for the clinic website |
| MW03-02 Add Section | 02 | Desktop | `6f3db361015d4c51b2323bd441b6e181` | Add-section dialog |
| MW03-03 Reorder Sections | 03 | Desktop | `2552e98a7d8d4b4695bbc4f5f629b9c0` | Section reorder |
| MW03-04 Section Settings | 04 | Desktop | `27d259868bd846c091c61d27744a2c42` | Per-section settings |

### Phase MW04 — Pages + navigation (4)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| MW04-01 Pages Manager | 01 | Desktop | `a2aaa656090347548594e79d9c7b401d` | Page list |
| MW04-02 Add New Page | 02 | Desktop | `36f2e7a043d344b98b391e464f451bb8` | Create page |
| MW04-03 Edit Page Settings | 03 | Desktop | `943371c07cd34875a6ea02dc7c03d3bf` | Page metadata settings |
| MW04-04 Navigation Manager | 04 | Desktop | `e7e2a1ab35a34e16a9e279a6f36c0d6f` | Public navigation editor |

### Phase MW05 — Page builder (4)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| MW05-01 Page Builder | 01 | Desktop | `df0401b47e454504b0d24ed27abf1c92` | Block canvas for a page |
| MW05-02 Add Content Block | 02 | Desktop | `64bc636a34404cff81e28e61acf688e7` | Add-block dialog |
| MW05-03 Block Settings | 03 | Desktop | `e15bf9d40eae4bbfbcb4bb8a25a067d8` | Per-block settings |
| MW05-04 Mobile Page Builder | 04 | Mobile | `44fca098452342a89255f9c9cd3cc9c9` | Mobile builder |

### Phase MW06 — Media (4)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| MW06-01 Media Library | 01 | Desktop | `6032ae29163940f2847099b69e21c001` | Media library grid |
| MW06-02 Upload Media | 02 | Desktop | `1328c4524fda4a7a9de1c409633be399` | Upload form |
| MW06-03 Select Media | 03 | Desktop | `fe0d81b72c5d483a85cd1011462af9c0` | Picker for builder/fields |
| MW06-04 Media Details | 04 | Desktop | `451748f8ee4b48ecb16c29137adb043d` | Single media item |

### Phase MW07 — Publishing (4)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| MW07-01 Site Status & Publishing | 01 | Desktop | `48a4b01abbf14eaca2265e7ab4b05e1e` | Draft/publish status |
| MW07-02 Version History | 02 | Desktop | `22fc73d39ad846a3aa6db72f13862def` | Version list |
| MW07-03 Publishing Confirmation | 03 | Desktop | `c2c22334084c4944af49d436e0872a88` | Confirm-before-publish |
| MW07-04 Mobile Publishing | 04 | Mobile | `f0cc5328778e4bd987429652f16cdb35` | Mobile publish |

### Phase ACW01 — Platform home (2)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| ACW01-01 ActiveClinic Home Desktop | 01 | Desktop | `cd19a117442440848c68b099de31e571` | Apex marketing home (“Healthcare Precision, Human Warmth.”) with Find a Clinic / Register CTAs |
| ACW01-02 ActiveClinic Home Mobile | 02 | Mobile | `d2771c7c7e804754a697d7550e3911ea` | Mobile platform home |

### Phase ACW02 — Clinic directory (2)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| ACW02-01 Clinic Directory Desktop | 01 | Desktop | `06e890aeec9344d4b4384389d7658659` | “Find Your Care” directory search + clinic cards |
| ACW02-02 Clinic Directory Mobile | 02 | Mobile | `00089a7dfc6848b0aedbe2acbd4b3f6f` | Mobile directory |

### Phase ACW03 — For clinics + features (4)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| ACW03-01 For Clinics Desktop | 01 | Desktop | `59af2deab69440c29a0be0d626734817` | Clinic-acquisition landing (“Empowering Your Practice.”) |
| ACW03-02 For Clinics Mobile | 02 | Mobile | `1def30eaafa84ca4a95dc902c57876c3` | Mobile for-clinics landing |
| ACW03-03 Platform Features Desktop | 03 | Desktop | `6dae23abf6d04b1b8bfa05fe491fdb7d` | Dedicated Features page (“Comprehensive Platform Capabilities”) |
| ACW03-04 Platform Features Mobile | 04 | Mobile | `e75ff649e21641ef85de97a26afab1c7` | Mobile features |

### Phase ACW04 — Clinic website product page (2)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| ACW04-01 Clinic Website Feature Desktop | 01 | Desktop | `d5710c9dd0174e49870845a511bca4ed` | Mini-website product marketing (“Your Clinic, Branded and Online.”) |
| ACW04-02 Clinic Website Feature Mobile | 02 | Mobile | `2e1ef6377ace4b4ea16737d785071c7f` | Mobile mini-website product page |

### Phase ACW05 — For patients (2)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| ACW05-01 For Patients Desktop | 01 | Desktop | `db1c779c25614552b0a426a3ea7965ba` | Patient-facing marketing + portal pitch |
| ACW05-02 For Patients Mobile | 02 | Mobile | `f22cca3648c2453bad5a1edbae142158` | Mobile for-patients |

### Phase ACW06 — About (2)

| Stitch screen | Number | Device | Screen ID | Purpose |
|---------------|--------|--------|-----------|---------|
| ACW06-01 About ActiveClinic Desktop | 01 | Desktop | `d6f4fe333ad245af89dbc517afeb8e06` | About / mission / data-handling marketing page |
| ACW06-02 About ActiveClinic Mobile | 02 | Mobile | `1899e7e6bbbc4a65ba083dcbe0d8fa0d` | Mobile about |

### Legacy auth — `active-clinic-03-*` (7)

| Stitch screen | Phase | Number | Device | Screen ID | Purpose |
|---------------|-------|--------|--------|-----------|---------|
| active-clinic-03-desktop-login | AUTH | 03 | Desktop | `2bfbc9c71ad64bfca245d9e1a26f837d` | Staff login card (email/phone + password + Google SSO) |
| active-clinic-03-mobile-login | AUTH | 03 | Mobile | `edb81abfe548470db687f343186ff786` | Mobile staff login (“Welcome back”) |
| active-clinic-03-desktop-multi-clinic-selector | AUTH | 03 | Desktop | `df566a9cd85e4583b019363ca2104b00` | Post-login “Choose a clinic” cards |
| active-clinic-03-mobile-multi-clinic-selector | AUTH | 03 | Mobile | `ef782bd739854150b5b30ea4525c50c6` | “Select a Workspace” list + search |
| active-clinic-03-desktop-validation-error | AUTH | 03 | Desktop | `f300be014a6148329910762c0b2970c8` | Login failed (split pane + field errors) |
| active-clinic-03-mobile-validation-error | AUTH | 03 | Mobile | `236850040de8488c9627970faad74b62` | Mobile login failed banner |
| active-clinic-03-loading-signing-in | AUTH | 03 | Desktop | `5adaedd9e29e48cc82b47dc3ac913383` | Full-page “Signing you in…” |

---

## 5. Map to V7

Status values: `IMPLEMENTED_MATCH` · `IMPLEMENTED_WITH_VARIANCE` · `PARTIAL` · `NOT_IMPLEMENTED` · `DUPLICATE` · `NOT_APPLICABLE`

ACW rows map to existing apex public routes that were built against **P21** in project `17813606734422395399`, not against these ACW screens. That is variance, not a second implementation target.

| Phase | Stitch Screen | Device | Screen ID | Existing Route | Existing View/Component | Status |
|-------|---------------|--------|-----------|----------------|-------------------------|--------|
| MW01 | MW01-01 Clinic Website Home | Desktop | `97a428ff4b4d45abbe6d03b192f04ffb` | `GET /clinics/:clinicKey` | `views/activeclinic/tenant/home.ejs` | `IMPLEMENTED_WITH_VARIANCE` |
| MW01 | MW01-02 Clinic Website Mobile Home | Mobile | `b6287290e9264712a5b89da04c12a325` | `GET /clinics/:clinicKey` (responsive) | same tenant home | `IMPLEMENTED_WITH_VARIANCE` |
| MW01 | MW01-03 Website Editor Home | Desktop | `effdec3344324c33aa7e3d8eb8f60002` | `GET /clinics/:clinicKey?website_edit=1` | tenant home + `partials/website-editor-chrome.ejs` | `IMPLEMENTED_WITH_VARIANCE` |
| MW01 | MW01-04 Website Editor Mobile | Mobile | `23774b8a4baf4924bc659f4ad86708e0` | same (responsive) | same | `IMPLEMENTED_WITH_VARIANCE` |
| MW02 | MW02-01 Inline Text Editing | Desktop | `32e4cba9812c43f5ae9a808222ca6dbb` | editor session on tenant pages | inline text editor | `IMPLEMENTED_MATCH` |
| MW02 | MW02-02 Inline Image Editing | Desktop | `70cbbaefaa7f4e2ca2aafb583c33d84f` | editor session on tenant pages | inline image editor | `IMPLEMENTED_MATCH` |
| MW02 | MW02-03 Inline Section Editing | Desktop | `aa63525e14b342709f3636906ab2afb3` | editor session + sections CMS | inline fields + section manager | `IMPLEMENTED_WITH_VARIANCE` |
| MW02 | MW02-04 Mobile Inline Editing | Mobile | `ead1eaa3d72c4eea884010b4ef6b5a18` | same (responsive) | inline editor | `IMPLEMENTED_WITH_VARIANCE` |
| MW03 | MW03-01 Manage Sections | Desktop | `f19c2a311e9b4f0d878e3ec51dae2769` | `GET /app/settings/website/sections` | `app/website-cms-sections.ejs` | `IMPLEMENTED_MATCH` |
| MW03 | MW03-02 Add Section | Desktop | `6f3db361015d4c51b2323bd441b6e181` | POST on sections route | Add Section dialog on sections view | `IMPLEMENTED_MATCH` |
| MW03 | MW03-03 Reorder Sections | Desktop | `2552e98a7d8d4b4695bbc4f5f629b9c0` | `POST /app/settings/website/sections/reorder` | reorder form on sections view | `IMPLEMENTED_MATCH` |
| MW03 | MW03-04 Section Settings | Desktop | `27d259868bd846c091c61d27744a2c42` | `GET /app/settings/website/sections/:sectionId` | `app/website-cms-section-settings.ejs` | `IMPLEMENTED_MATCH` |
| MW04 | MW04-01 Pages Manager | Desktop | `a2aaa656090347548594e79d9c7b401d` | `GET /app/settings/website/pages` | `app/website-cms-pages.ejs` | `IMPLEMENTED_MATCH` |
| MW04 | MW04-02 Add New Page | Desktop | `36f2e7a043d344b98b391e464f451bb8` | `GET /app/settings/website/pages/new` | `app/website-cms-page-new.ejs` | `IMPLEMENTED_MATCH` |
| MW04 | MW04-03 Edit Page Settings | Desktop | `943371c07cd34875a6ea02dc7c03d3bf` | `GET /app/settings/website/pages/:pageId` | `app/website-cms-page-settings.ejs` | `IMPLEMENTED_MATCH` |
| MW04 | MW04-04 Navigation Manager | Desktop | `e7e2a1ab35a34e16a9e279a6f36c0d6f` | `GET /app/settings/website/navigation` | `app/website-cms-navigation.ejs` | `IMPLEMENTED_MATCH` |
| MW05 | MW05-01 Page Builder | Desktop | `df0401b47e454504b0d24ed27abf1c92` | `GET /app/settings/website/pages/:pageId/builder` | `app/website-cms-builder.ejs` | `IMPLEMENTED_MATCH` |
| MW05 | MW05-02 Add Content Block | Desktop | `64bc636a34404cff81e28e61acf688e7` | `POST /app/settings/website/pages/:pageId/blocks` | Add block dialog on builder | `IMPLEMENTED_MATCH` |
| MW05 | MW05-03 Block Settings | Desktop | `e15bf9d40eae4bbfbcb4bb8a25a067d8` | `GET/POST /app/settings/website/blocks/:blockId` | inline block form on builder | `IMPLEMENTED_WITH_VARIANCE` |
| MW05 | MW05-04 Mobile Page Builder | Mobile | `44fca098452342a89255f9c9cd3cc9c9` | same builder (responsive) | `app/website-cms-builder.ejs` | `IMPLEMENTED_WITH_VARIANCE` |
| MW06 | MW06-01 Media Library | Desktop | `6032ae29163940f2847099b69e21c001` | `GET /app/settings/website/media` | `app/website-cms-media.ejs` | `IMPLEMENTED_MATCH` |
| MW06 | MW06-02 Upload Media | Desktop | `1328c4524fda4a7a9de1c409633be399` | `POST` media on library | upload form on media view | `IMPLEMENTED_MATCH` |
| MW06 | MW06-03 Select Media | Desktop | `fe0d81b72c5d483a85cd1011462af9c0` | `GET /app/settings/website/media?select=1` | same media view (`selectMode`) | `IMPLEMENTED_WITH_VARIANCE` |
| MW06 | MW06-04 Media Details | Desktop | `451748f8ee4b48ecb16c29137adb043d` | `GET /app/settings/website/media/:mediaId` | `app/website-cms-media.ejs` | `IMPLEMENTED_MATCH` |
| MW07 | MW07-01 Site Status & Publishing | Desktop | `48a4b01abbf14eaca2265e7ab4b05e1e` | `GET /app/settings/website/publish` | `app/website-cms-publish.ejs` | `IMPLEMENTED_MATCH` |
| MW07 | MW07-02 Version History | Desktop | `22fc73d39ad846a3aa6db72f13862def` | `GET /clinics/:clinicKey/website/history` | `tenant/website-history.ejs` | `IMPLEMENTED_WITH_VARIANCE` |
| MW07 | MW07-03 Publishing Confirmation | Desktop | `c2c22334084c4944af49d436e0872a88` | publish POST (browser confirm) | native confirm, not a dedicated route | `IMPLEMENTED_WITH_VARIANCE` |
| MW07 | MW07-04 Mobile Publishing | Mobile | `f0cc5328778e4bd987429652f16cdb35` | `GET /app/settings/website/publish` (responsive) | `app/website-cms-publish.ejs` | `IMPLEMENTED_WITH_VARIANCE` |
| ACW01 | ACW01-01 ActiveClinic Home Desktop | Desktop | `cd19a117442440848c68b099de31e571` | `GET /` | `public/home.ejs` + platform chrome | `IMPLEMENTED_WITH_VARIANCE` |
| ACW01 | ACW01-02 ActiveClinic Home Mobile | Mobile | `d2771c7c7e804754a697d7550e3911ea` | `GET /` (responsive) | same | `IMPLEMENTED_WITH_VARIANCE` |
| ACW02 | ACW02-01 Clinic Directory Desktop | Desktop | `06e890aeec9344d4b4384389d7658659` | `GET /clinics` | `public/clinics-directory.ejs` | `IMPLEMENTED_WITH_VARIANCE` |
| ACW02 | ACW02-02 Clinic Directory Mobile | Mobile | `00089a7dfc6848b0aedbe2acbd4b3f6f` | `GET /clinics` (responsive) | same | `IMPLEMENTED_WITH_VARIANCE` |
| ACW03 | ACW03-01 For Clinics Desktop | Desktop | `59af2deab69440c29a0be0d626734817` | `GET /for-clinics` (`/solutions` alias) | `public/for-clinics.ejs` | `IMPLEMENTED_WITH_VARIANCE` |
| ACW03 | ACW03-02 For Clinics Mobile | Mobile | `1def30eaafa84ca4a95dc902c57876c3` | `GET /for-clinics` | same | `IMPLEMENTED_WITH_VARIANCE` |
| ACW03 | ACW03-03 Platform Features Desktop | Desktop | `6dae23abf6d04b1b8bfa05fe491fdb7d` | `GET /features` | `public/features.ejs` | `IMPLEMENTED_WITH_VARIANCE` |
| ACW03 | ACW03-04 Platform Features Mobile | Mobile | `e75ff649e21641ef85de97a26afab1c7` | `GET /features` | same | `IMPLEMENTED_WITH_VARIANCE` |
| ACW04 | ACW04-01 Clinic Website Feature Desktop | Desktop | `d5710c9dd0174e49870845a511bca4ed` | `GET /clinic-website` | `public/clinic-website.ejs` | `IMPLEMENTED_WITH_VARIANCE` |
| ACW04 | ACW04-02 Clinic Website Feature Mobile | Mobile | `2e1ef6377ace4b4ea16737d785071c7f` | `GET /clinic-website` | same | `IMPLEMENTED_WITH_VARIANCE` |
| ACW05 | ACW05-01 For Patients Desktop | Desktop | `db1c779c25614552b0a426a3ea7965ba` | `GET /for-patients` | `public/for-patients.ejs` | `IMPLEMENTED_WITH_VARIANCE` |
| ACW05 | ACW05-02 For Patients Mobile | Mobile | `f22cca3648c2453bad5a1edbae142158` | `GET /for-patients` | same | `IMPLEMENTED_WITH_VARIANCE` |
| ACW06 | ACW06-01 About ActiveClinic Desktop | Desktop | `d6f4fe333ad245af89dbc517afeb8e06` | `GET /about` | `public/about.ejs` | `IMPLEMENTED_WITH_VARIANCE` |
| ACW06 | ACW06-02 About ActiveClinic Mobile | Mobile | `1899e7e6bbbc4a65ba083dcbe0d8fa0d` | `GET /about` (responsive) | same | `IMPLEMENTED_WITH_VARIANCE` |
| AUTH | active-clinic-03-desktop-login | Desktop | `2bfbc9c71ad64bfca245d9e1a26f837d` | `GET/POST /login` | `auth/login.ejs` + `layouts/auth-shell.ejs` (P01 split pane; no Google SSO) | `IMPLEMENTED_WITH_VARIANCE` |
| AUTH | active-clinic-03-mobile-login | Mobile | `edb81abfe548470db687f343186ff786` | `GET/POST /login` | same (responsive) | `IMPLEMENTED_WITH_VARIANCE` |
| AUTH | active-clinic-03-desktop-multi-clinic-selector | Desktop | `df566a9cd85e4583b019363ca2104b00` | `GET /login/select-organization` | `auth/select-organization.ejs` | `IMPLEMENTED_WITH_VARIANCE` |
| AUTH | active-clinic-03-mobile-multi-clinic-selector | Mobile | `ef782bd739854150b5b30ea4525c50c6` | `GET /login/select-organization` | same | `IMPLEMENTED_WITH_VARIANCE` |
| AUTH | active-clinic-03-desktop-validation-error | Desktop | `f300be014a6148329910762c0b2970c8` | `POST /login` error state | error alert on `auth/login.ejs` (not this split-pane error layout) | `PARTIAL` |
| AUTH | active-clinic-03-mobile-validation-error | Mobile | `236850040de8488c9627970faad74b62` | `POST /login` error state | same | `PARTIAL` |
| AUTH | active-clinic-03-loading-signing-in | Desktop | `5adaedd9e29e48cc82b47dc3ac913383` | none as a page | login button `data-loading="Signing in…"` only | `PARTIAL` |

---

## 6. Totals by phase and status

### By phase

| Phase | Screens | Desktop | Mobile | IMPLEMENTED_MATCH | IMPLEMENTED_WITH_VARIANCE | PARTIAL | NOT_IMPLEMENTED | DUPLICATE | NOT_APPLICABLE |
|-------|--------:|--------:|-------:|------------------:|--------------------------:|--------:|----------------:|----------:|---------------:|
| MW01 | 4 | 2 | 2 | 0 | 4 | 0 | 0 | 0 | 0 |
| MW02 | 4 | 3 | 1 | 2 | 2 | 0 | 0 | 0 | 0 |
| MW03 | 4 | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 |
| MW04 | 4 | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 |
| MW05 | 4 | 3 | 1 | 2 | 2 | 0 | 0 | 0 | 0 |
| MW06 | 4 | 4 | 0 | 3 | 1 | 0 | 0 | 0 | 0 |
| MW07 | 4 | 3 | 1 | 1 | 3 | 0 | 0 | 0 | 0 |
| ACW01 | 2 | 1 | 1 | 0 | 2 | 0 | 0 | 0 | 0 |
| ACW02 | 2 | 1 | 1 | 0 | 2 | 0 | 0 | 0 | 0 |
| ACW03 | 4 | 2 | 2 | 0 | 4 | 0 | 0 | 0 | 0 |
| ACW04 | 2 | 1 | 1 | 0 | 2 | 0 | 0 | 0 | 0 |
| ACW05 | 2 | 1 | 1 | 0 | 2 | 0 | 0 | 0 | 0 |
| ACW06 | 2 | 1 | 1 | 0 | 2 | 0 | 0 | 0 | 0 |
| AUTH (`active-clinic-03-*`) | 7 | 4 | 3 | 0 | 4 | 3 | 0 | 0 | 0 |
| **Total** | **49** | **34** | **15** | **16** | **30** | **3** | **0** | **0** | **0** |

### By status (all 49 live screens)

| Status | Count |
|--------|------:|
| `IMPLEMENTED_MATCH` | 16 |
| `IMPLEMENTED_WITH_VARIANCE` | 30 |
| `PARTIAL` | 3 |
| `NOT_IMPLEMENTED` | 0 |
| `DUPLICATE` | 0 |
| `NOT_APPLICABLE` | 0 |
| **Implemented (MATCH + VARIANCE)** | **46** |

### ACW07 (requested, not in Stitch)

No `ACW07-*` screens exist in project `10611909237747031838`. V7 still ships a real platform contact flow:

| Phase | Screen | Device | Screen ID | Existing Route | Existing View/Component | Status |
|-------|--------|--------|-----------|----------------|-------------------------|--------|
| ACW07 | Contact + success (no Stitch source) | Desktop/Mobile | — | `GET/POST /contact`, `GET /contact/success` | `public/contact.ejs`, `public/contact-success.ejs`, `platform_contact_inquiries` | `IMPLEMENTED_WITH_VARIANCE` (STITCH_GAP) |

---

## 7. Unexpected / notable

Present in Stitch but outside the MW01–MW10 / ACW01–ACW12 numbered systems:

- Seven kebab-case **`active-clinic-03-*`** auth screens (project title is “Universal Authentication Interface”). These are the only auth screens here. **ACW08-01–ACW08-07 were never found.**

Present but incomplete vs requested ranges:

- **ACW01–ACW06 only** (14 screens). ACW07–ACW12 are missing.
- **MW01–MW07 only** (28 screens). MW08–MW10 are missing from Stitch even though V7 still has `/app/settings/website/settings|branding|chrome|seo|library*` and the MW10 hub.

Cross-project overlap (not counted as `DUPLICATE` in this project):

- ACW01 / ACW02 / ACW06 overlap P21 Home / Directory / About in `17813606734422395399`.
- Legacy login overlaps P01 Login in `12272131183982732110`. Do not ship a third staff login.

Stitch login designs include **Sign in with Google**. V7 `/login` does not. That is a product difference, not a missing ACW08 screen.

---

## 8. Verdict

`ACTIVECLINIC_STITCH_MASTER_INVENTORY_LOCKED` (screens unchanged)  
**ACW implementation pass:** 2026-08-20 — ACW01–ACW06 shipped against live Stitch screens; ACW07 contact shipped with **STITCH_GAP**.

| Report field | Value |
|--------------|-------|
| Exact Stitch screen count | **49** |
| Unique screen count after duplicates | **49** |
| MW count | **28** (MW01–MW07 only) |
| ACW count | **14** (ACW01–ACW06 only) + ACW07 implemented without Stitch |
| Legacy auth count | **7** |
| Implemented count (MATCH + VARIANCE) | **46** Stitch screens |
| Partial count | **3** (legacy auth states only) |
| Not implemented count | **0** of the 14 live ACW screens |
| Duplicates (`SAME_DESIGN` / status `DUPLICATE`) | **0** in this project; ACW08 comparison **UNKNOWN** |
| Unexpected screens | 7× `active-clinic-03-*`; ACW07–12 absent from Stitch; MW08–10 absent; ACW08-01–07 absent |
| Production touched | **NO** |
