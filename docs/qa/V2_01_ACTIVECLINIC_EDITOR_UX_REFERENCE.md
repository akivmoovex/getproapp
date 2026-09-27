# V2.01 ActiveClinic Editor UX Reference

**Task:** `V2_01_ACTIVECLINIC_EDITOR_UX_REFERENCE`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing` (`activeclinic.neuniversity.org`)  
**Hosted SHA at verify:** `8d158f3ec258`  
**Persona:** ActiveClinic demo org admin (`activeclinic-demo`)  
**Purpose:** Evidence base for simplifying BlessBoard website editing in Google Stitch  
**Scope:** Investigation only — no code, DB, route, UI, or deployment changes  

**Related Stitch projects**

| Project | ID | Role |
|---------|----|------|
| Website Change Manager (toolbar, unpublished panel, field history, reminder) | `12538817760086591589` | Implemented / partially hosted |
| Shared Website Manager Desktop / Mobile | same project · screens `f5b9cdb2785141319f795576ba5b3d53` / `2106bb03b6aa428aa033b6519fbc1819` | Proposed redesign surface — **too complex vs live AC** |

**Evidence legend**

| Tag | Meaning |
|-----|---------|
| **HOSTED** | Observed on `moovex-platform-v8-testing` with authorized demo admin |
| **SOURCE** | Confirmed in routes / EJS / shared platform JS |
| **PRIOR QA** | Confirmed in `docs/qa/V2_01_*` reports; not re-executed end-to-end here |

---

## FINAL VERDICT

**`AC_EDITOR_UX_REFERENCE_COMPLETE`**

---

## A. Executive Summary

ActiveClinic’s successful website editing pattern is already **on the public mini-website**, not a three-column management studio:

1. Open Website Management Hub (optional status / secondary tools).  
2. **Edit Website** → live site with `?website_edit=1&website_mode=draft`.  
3. Use **Page Selector** rail → click **pencil** → dialog → **Save draft**.  
4. **Preview** unpublished draft → confirm **Publish**.

Ordinary administrators do **not** need to understand draft IDs, schemas, or publishing transactions. They see human labels: “Editing website”, “Draft • N unpublished changes”, “Save draft”, “Publish”.

Doctors and services are **not** fully edited via pencil dialogs. Cards deep-link to **Public Catalogue** forms under `/app/settings/website/catalogue/...`. That split is product-specific and should stay for AC; BB has analogous structured entity editors.

The Stitch **Shared Website Manager** (desktop/mobile) invents a dense multi-pane “studio” that the live AC editor does **not** use for normal editing. Redesign Stitch around the **WE01 public editor + dialogs**, and demote hub / catalogue / SEO / page-builder tiles to Settings / More.

BB and AC already share the engine shell, inline editor, change manager, draft save, preview, publish, media, field history, and unpublished-changes panel. Prefer reuse over new surfaces.

---

## B. Actual AC User Journey

Hosted walkthrough on `activeclinic-demo` (demo sample data only; no patient PHI). Screenshots: `docs/qa/references/v2-01-ac-editor-ux/`.

| # | Step | Route / screen | Visible controls | User action | What happens next | Save behavior | Friction | Evidence |
|---|------|----------------|------------------|-------------|-------------------|---------------|----------|----------|
| 1 | Open Website Management | `/app/settings/website` · “Website Management Hub” | Status metrics; Quick actions (View live, Preview, Edit Website, Publish, Unpublish); tiles (Pages, Sections, Page Builder, Media, Navigation, Branding, Settings, SEO, Catalogue, Library, Version History); CMS nav (Clinic Editor / Layers / Media / History / More) | Nav **Website** or `/app/settings/website` | Hub loads with published status (e.g. Version 60) | N/A | Hub exposes **version numbers**, many tiles, and a second “Clinic Editor” chrome — heavier than needed for day-to-day edits | **HOSTED** · `01-website-management-hub.png` |
| 2 | Open public site in editing mode | `/clinics/{key}?website_edit=1&website_mode=draft` | Toolbar: “Editing website”, draft count, History, Preview, Publish, More, Exit editing; left Page Selector | Click **Edit Website** (or Editor) | Full public homepage with pencils / section menus / Add section | Edits not live until Publish | Hub “Edit Website” click was flaky once in browser; direct URL worked | **HOSTED** · `02-public-edit-mode-home.png` |
| 3 | Select a page | Same editor; page rail | Home, About, Services, Doctors, Pricing, Contact, Location, Book; Manage Pages | Click page in rail (or edit URL `.../{page}?website_edit=1&...`) | Loads that public page in edit mode | Unsaved dialog changes stay local until Save draft | Rail click did not navigate once; URL navigation reliable | **HOSTED** · Doctors · `05-doctors-page-edit.png` |
| 4 | Find editable section | On-page content | Pencil + Field history beside text/images; section `...` menus; FAQ collection Save/Up/Down; “+ Add section” | Scan page | Editable regions marked in place | — | Many section menus + Add section can feel busy on long home pages | **HOSTED** |
| 5 | Click pencil | Field trigger | `Edit {label}` button (Material edit icon) | Click pencil | Opens shared field editor dialog (desktop) / bottom sheet (**SOURCE** mobile CSS) | — | — | **HOSTED** |
| 6 | Edit heading / description | Field dialog WE01-02 | Current value (read-only), New value, Cancel, **Save draft** | Change text → Save draft | Dialog closes; toolbar pending count updates (**SOURCE** / PRIOR QA) | **Draft only** — never publishes | Clear “Save draft” copy is excellent | **HOSTED** dialog opened · save itself **NOT completed** (demo left clean) · `03-text-edit-dialog.png` |
| 7 | Replace / upload image | Image dialog | Current / New preview; Replace image; Choose from Content Library; Remove; Alt text; Save draft | Replace or library pick → Save draft | Media upload via shared media URL then draft key write | Draft only; JPEG/PNG/WebP/GIF ≤5 MB (**SOURCE**) | Content Library choice adds a second concept | **HOSTED** UI · upload **NOT executed** · `04-image-edit-dialog.png` |
| 8 | Add / edit a doctor | Doctors page + catalogue | Per-card **Edit doctor profile**; page **Manage public doctors**; page title/intro pencils | Edit doctor profile → `/app/settings/website/catalogue/doctors/:id/edit` | Leaves WYSIWYG for catalogue form (name, title, specialty, bio, photo, visibility) | Catalogue POST (product CMS); visibility/catalogue is separate from field draft | Ordinary “edit doctor” is **not** pencil-on-card text | **HOSTED** links · form UI **SOURCE** |
| 9 | Add / edit a service | Services page + catalogue | Same pattern: Manage public catalogue / Edit service → catalogue service form | Same as doctors | Same | Same | Same | **SOURCE** · pattern mirrors doctors (**HOSTED** doctors) |
| 10 | Save changes | Field/collection dialogs | Save draft / collection Save | Confirm save | `POST` drafts API; status “Drafts saved”; pending pill | Draft ≠ publish | Must publish separately — intentional | **SOURCE** + PRIOR QA; hosted save click skipped |
| 11 | Navigate to another page | Page Selector | Rail links with edit query preserved | Choose page | New page edit URL | Pending drafts remain server-side | Prefer rail over leaving editor | **HOSTED** |
| 12 | Preview unpublished | `/clinics/{key}?website_mode=draft` (via Preview / `/website/preview`) | Banner: “Previewing unpublished draft”; Back to editing; Publish; **no pencils** | Click Preview | Visitor-like draft view | Preview never publishes | — | **HOSTED** · `06-preview-draft.png` |
| 13 | Publish | Toolbar Publish form | Confirm dialog: “Publish website? Your draft changes will become public…” | Confirm | Snapshot becomes live; version increments | Publish is explicit | Confirm is good; hub also shows raw version # | Overlay present **HOSTED**; confirm submit **NOT executed** · PRIOR QA covered publish |
| 14 | View live | `/clinics/{key}` (no edit query) or View live from hub | Normal public chrome; entry chrome “Edit website / Preview / Manage” if editor logged in | Open live URL | Live published content | — | — | **HOSTED** hub link; live chrome **SOURCE** |
| 15 | Restore earlier field value | Field History beside pencil | Revision History sheet; choices; **Restore This Version to Draft (Does Not Publish)** | History → select → Restore | Writes new draft for that key only | Never auto-publish | Sheet opened (**HOSTED**); full restore **PRIOR QA** / not re-run | **HOSTED** open · `05-doctors-page-edit.png` |

### Entry chrome (before edit mode)

When an authorized editor visits the live public site **without** `website_edit=1`, AC shows a compact bar: Edit website · Preview · Website management (**SOURCE** `website-editor-chrome.ejs`). This is a simpler entry than the hub.

---

## C. Existing Screens and Dialogs

### Minimum surfaces for normal editing

| Surface | Needed for normal edit? | Notes |
|---------|-------------------------|-------|
| Public site in edit mode + toolbar + page rail | **Yes** | Primary workplace |
| Text field dialog | **Yes** | Pencil → Save draft |
| Image field dialog | **Yes** | Replace / library / alt |
| Publish confirmation | **Yes** | Toolbar Publish |
| Draft preview banner | **Yes** | Preview |
| Field History sheet | Secondary | Beside pencil; power users |
| Unpublished Changes panel | Secondary | Opens from pending pill |
| Publishing reminder | Secondary | After ≥5 pending |
| Website Management Hub | Optional entry / status | Too many tiles for daily edit |
| Public Catalogue doctor/service forms | AC product-required | Structured entities |
| Version History page | Secondary | Toolbar History / hub tile |
| Page Builder / Sections / SEO / Branding / Media library / Navigation CMS | Settings / More | Not needed every edit |
| Content Library | Advanced | Optional placement reuse |
| Stitch Shared Website Manager 3-pane studio | **Unnecessary for normal editing** | Does not match live AC |

### Layout / behavior notes

- **Public editing mode:** WYSIWYG website + top toolbar + left page rail (desktop). Mobile: bottom nav Pages / Styles / History / Settings (**SOURCE** `editor-chrome.ejs`).  
- **Pencil:** In-context; opens one shared dialog host.  
- **Structured FAQ:** Inline list editor with Save / reorder / remove (**SOURCE** `website-collection-edit.js`) — AC-specific pattern.  
- **Save confirmation:** Soft status (“Drafts saved”), not a blocking success modal.  
- **Publish confirmation:** Modal overlay copy shared in shell.  
- **Version History:** Separate page from field history.

### What to simplify / eliminate from proposed Stitch Shared Website Manager

Eliminate or demote for **normal** BB+AC editing:

- Product mode switcher as a primary chrome control  
- Persistent three-column manager (hierarchy + canvas + inspector) for every edit  
- Always-on live-vs-draft comparison column  
- Always-on section inspector  
- Dashboard-first editing that replaces the public page  

Keep as secondary overlays / More / Settings: unpublished panel, field history, safe-draft messaging, hub tiles for branding/SEO/catalogue.

---

## D. BB vs AC Gap Matrix

| Feature | AC current | BB current | Shared component/service | Actual difference | Recommended change | Class |
|---------|------------|------------|--------------------------|-------------------|--------------------|-------|
| Hub entry | `/app/settings/website` tiles + CMS nav | `/hq/website` similar hub | Presentation patterns parallel | Labels (clinic vs church); AC has Catalogue / Page Builder | Keep hubs; don’t make hub the daily editor | Product-specific / Already shared pattern |
| Public WYSIWYG edit | `/clinics/{key}?website_edit=1` | `/c/{org}?website_edit=1` (+ branch paths) | `editorShell`, `editor-chrome`, `website-inline-edit.js` | Page sets differ (doctors/services vs ministries/sermons) | Reuse shell; product page registry only | Already shared |
| Pencil text/image | AC partials + shared dialog | BB `editable-text` / `editable-image` + same dialog | Field editor host WE01-02 | BB keys `page.section.field`; AC dotted content keys | Keep shared dialog | Already shared |
| Draft save | `contentService.saveWebsiteDraft` | Same + BB overlays/bridge | `platform/website` content + drafts routes | BB overlay fields may lag engine count until bridged | Do not rebuild; bridge overlays if gaps | Confirmed infra nuance |
| Preview | `website_mode=draft` preview chrome | Same engine preview | Preview banner WE01-07 | Paths differ | Keep | Already shared |
| Publish | Toolbar POST publish | HQ/branch publish + review policy | `publicationService.publishWebsiteDraft` | BB may require publish review / branch scope | Keep product policy; same confirm UX | Product-specific |
| Media upload | Shared media endpoint | Shared | `website_media` + CDN | — | Keep | Already shared |
| Field history / restore | History beside pencil | Same | Change Manager Screen 4 | — | Keep; don’t invent new restore UX | Already shared |
| Unpublished changes | Pending pill → panel | Same | Change Manager Screen 3 | — | Keep secondary | Already shared |
| Doctors / services | Catalogue forms + manage affordance | Leadership / ministries structured editors | Partial — structured item patterns differ | AC catalogue is ops-backed | Keep AC catalogue; BB structured editors | Product-specific |
| FAQ collections | Inline collection editor | Different structured tools | AC-only JS | — | Don’t force into BB | Product-specific |
| Section add/remove | Shared section actions | Shared when bridged | `website-section-actions.js` | Coverage varies by page | Keep | Already shared |
| Authz | `website.edit` / `website.publish` + clinic org | Same permissions + church/branch scope | `permissionHooks` | Scope rules differ | Keep adapters | Already shared |
| Image editability gaps | Generally wired on AC public | Historical BB gaps audited | Shared image dialog | Some BB surfaces lagged | Prefer AC coverage pattern | Confirmed UI gap (BB) · prior audits |
| Hub complexity | Many CMS tiles | Similar | — | Both hubs are busy | Stitch: hub = status + Edit + rare settings | Confirmed UI gap (both) |

---

## E. Shared Infrastructure Findings

Already shared and functioning (do **not** rebuild):

| Concern | Location |
|---------|----------|
| Editor shell / toolbar / page rail / More / mobile nav | `src/platform/website-engine/editorShell.js`, `views/platform/website-engine/editor-chrome.ejs` |
| Inline text/image dialogs | `public/platform/website-inline-edit.js`, `field-editor-host.ejs` |
| Change Manager (pending count, reminder, unpublished panel, field history) | `websiteChangeManagerService`, `changeManagerUi.js`, `website-change-manager-ui.js` |
| Draft / publish / unpublish / discard / versions | `src/platform/website/*` |
| Product page types | `productSchemaRegistry.js` |
| Permissions | `permissionHooks.js` + product adapters |
| Media | Shared website media routes + CDN |
| Section actions | `website-section-actions.js` |

Product adapters (keep thin):

- AC: `attachActiveClinicWebsiteChrome.js`, catalogue CMS, collection editor, operational affordances  
- BB: `attachWebsiteAdminChrome.js`, HQ/branch routes, structured/overlay bridges, publish review  

BB-specific opportunity: lean harder on the **same public WYSIWYG path** AC uses; treat HQ hub as status + advanced settings, not a parallel studio.

---

## F. Minimum-Screen UX Recommendation

### Preferred shared journey (BB + AC)

```
Open Website (hub or public Edit)
  → Click Pencil
  → Edit (dialog / bottom sheet)
  → Save draft
  → (optional) Preview
  → Publish
```

Keep ordinary editing **on the website**. Avoid a three-column management studio unless a specific function needs it (AC catalogue forms; BB structured entity forms).

### Control classification

| Control | Class |
|---------|--------|
| Public site edit mode | **ESSENTIAL** |
| Pencil / field dialog | **ESSENTIAL** |
| Image dialog | **ESSENTIAL** |
| Page Selector (rail or mobile Pages sheet) | **ESSENTIAL** |
| Preview | **ESSENTIAL** |
| Publish + confirm | **ESSENTIAL** |
| Exit editing | **ESSENTIAL** |
| Draft / unpublished count (simple label) | **ESSENTIAL** |
| Field History beside pencil | **OPTIONAL / SECONDARY** |
| Unpublished Changes panel | **OPTIONAL / SECONDARY** |
| Publishing reminder (≥5) | **OPTIONAL / SECONDARY** |
| Version History (full site) | **OPTIONAL / SECONDARY** |
| Website Manager dashboard / hub | **OPTIONAL / SECONDARY** (entry + status) |
| SafeDraft badge / reassurance copy | **OPTIONAL / SECONDARY** (keep short; avoid jargon) |
| More → Branding, SEO, Media, Sections, Manage Pages | **OPTIONAL / SECONDARY** |
| Product mode switcher | **UNNECESSARY FOR NORMAL EDITING** |
| Page hierarchy sidebar (deep tree) | **UNNECESSARY FOR NORMAL EDITING** (flat page list enough) |
| Section inspector column | **UNNECESSARY FOR NORMAL EDITING** (use section `...` menus) |
| Live-versus-draft comparison panel always visible | **UNNECESSARY FOR NORMAL EDITING** (use unpublished panel / field history on demand) |
| Dedicated “Publishing transactions” UI | **UNNECESSARY FOR NORMAL EDITING** |

### Simplicity assessment

Admins **can** edit without knowing database versions, draft IDs, schemas, or service names.  
Do **not** copy: hub version-number prominence, dual Clinic Editor + hub chrome, overcrowded More destinations, forcing catalogue for simple text edits, or Stitch’s three-pane Shared Website Manager as the primary path.

Reuse: pencil → Save draft → Preview → Publish; page rail; field history; pending pill; confirm publish.

---

## G. Stitch Design Brief

Use this without reading the codebase.

### 1. Actual AC editing journey

Sign in → Website hub (optional) → **Edit Website** → public site with pencils → edit via dialog → Save draft → Preview → Publish. Doctors/services: “Edit profile” / catalogue, not pencil text on the card body.

### 2. Recommended shared BB+AC journey

Same as above. Hub is optional. Primary canvas = real public pages.

### 3. Minimum required screens

1. Public website editing (toolbar + page list + page canvas)  
2. Draft preview  
3. (Product) structured entity form only when needed (doctor/service or ministry/leader)

### 4. Minimum required dialogs

1. Text edit (Current / New / Cancel / Save draft)  
2. Image edit (preview / replace / library / alt / Save draft)  
3. Publish confirm  
4. Optional: Field History; Unpublished Changes; Discard; Unpublish; Publishing reminder

### 5. Controls visible during ordinary editing

Editing label · draft change count · Preview · Publish · Exit · page list · pencils · (quiet) field history icons · section menus as needed

### 6. Controls under Settings / More

Branding, SEO, Media library, Navigation, Page manage/hide, Sections layout, Catalogue/Library (AC), Version History, Discard draft, Unpublish, Website hub

### 7. BB-specific content examples

Hero heading, about body, service times, sermon title, ministry name, giving blurb, contact address, leadership bio, event title

### 8. AC-specific content examples

Clinic hero title, about body, service card (catalogue), doctor card (catalogue), pricing line, location/hours, book CTA, FAQ question/answer

### 9. Desktop behavior

Top toolbar; left Page Selector; canvas = real site; centered modal dialogs; pending pill opens unpublished panel

### 10. 390px mobile behavior

Compact toolbar; bottom nav (Pages / Styles / History / Settings); field editor as **bottom sheet**; history/unpublished as sheets; no three-column layout

### 11. Exact patterns to preserve

- Pencil beside content  
- “Save draft” (never silent publish)  
- Explicit Publish + confirm  
- Preview without pencils  
- “Draft • N unpublished changes”  
- Restore to draft does not publish  
- Flat page list from product registry  

### 12. Stitch screens to simplify or replace

| Screen | Action |
|--------|--------|
| **Shared Website Manager Desktop** `f5b9cdb2…` | **Replace** as primary editor — rebuild as public WYSIWYG + toolbar + page rail |
| **Shared Website Manager Mobile** `2106bb03…` | **Replace** — match WE01 mobile bottom nav + sheets |
| Website Editor Toolbar `863c7192…` | **Keep / refine** — already close to live |
| Friendly Publishing Reminder `d9f101c6…` | Keep secondary |
| Unpublished Changes Panel `d205f226…` | Keep secondary |
| Field History and Restore `06f6fb04…` | Keep secondary |
| Version Details / Release Notes / QA Checklist screens in same project | Out of scope for admin editing redesign |

### Reference images (this investigation)

| File | Content |
|------|---------|
| `docs/qa/references/v2-01-ac-editor-ux/01-website-management-hub.png` | Hub |
| `docs/qa/references/v2-01-ac-editor-ux/02-public-edit-mode-home.png` | Edit mode home |
| `docs/qa/references/v2-01-ac-editor-ux/03-text-edit-dialog.png` | Text dialog |
| `docs/qa/references/v2-01-ac-editor-ux/04-image-edit-dialog.png` | Image dialog |
| `docs/qa/references/v2-01-ac-editor-ux/05-doctors-page-edit.png` | Doctors + Field History opening |
| `docs/qa/references/v2-01-ac-editor-ux/06-preview-draft.png` | Preview draft |
| `docs/qa/references/v2-01-ac-editor-ux/stitch-shared-website-manager-desktop.png` | Stitch SWM desktop thumbnail |

No credentials or private patient data were captured.

---

## H. Verification Gaps

| Item | Status |
|------|--------|
| Hosted login + hub + edit mode + text/image dialogs + doctors page + field history open + preview | **Verified** |
| Completing Save draft / Publish / image upload / field restore on hosted demo | **Not executed** (avoided mutating demo; covered by PRIOR QA) |
| 390px interactive browser pass | **NOT VERIFIED** visually (CSS densification present in SOURCE / PRIOR QA) |
| Page rail click navigation reliability | Intermittent in one session; URL navigation OK |
| Hub “Edit Website” click navigation | One click did not navigate; URL OK |
| Live Stitch pixel parity of Change Manager | PRIOR QA: coded; interactive Stitch compare often not run |
| BlessBoard hosted side-by-side click-through this session | **NOT VERIFIED** (SOURCE + prior reports used for BB column) |
| Production | Untouched |

---

## Sources consulted

- Hosted: `https://activeclinic.neuniversity.org` · demo admin · SHA `8d158f3ec258`  
- `docs/platform/SHARED_WEBSITE_ENGINE.md`, `HOSTED_WEBSITE_QA_PERSONAS.md`  
- `docs/qa/V2_01_CHANGE_MANAGER_FOUNDATION_QA.md`, `V2_01_TOOLBAR_REMINDERS_QA.md`, `V2_01_UNPUBLISHED_CHANGES_QA.md`, `V2_01_FIELD_HISTORY_RESTORE_QA.md`  
- `src/activeclinic/http/attachActiveClinicWebsiteChrome.js`, `activeClinicSettingsRoutes.js`  
- `views/activeclinic/partials/website-editor-chrome.ejs`, `website-editable-*.ejs`, `app/settings-website-content.ejs`  
- `views/platform/website-engine/*`, `public/platform/website-inline-edit.js`  
- Stitch project `12538817760086591589` screen list  

---

**Verdict restated:** `AC_EDITOR_UX_REFERENCE_COMPLETE`
