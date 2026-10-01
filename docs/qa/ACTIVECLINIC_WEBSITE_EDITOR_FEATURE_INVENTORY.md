# ActiveClinic Website Editor — Feature Inventory

**Mode:** READ-ONLY (no code changes).  
**Date:** 2026-10-02  
**Scope:** Current ActiveClinic website editing code + automated tests only.  
**Do not compare with BlessBoard.** Do not infer from Stitch unless present in code.

---

## Surfaces

| Surface | Route | Role |
|---------|-------|------|
| **Canonical visual editor** | `GET /clinics/:clinicKey?website_edit=1&website_mode=draft` | On-canvas editing with shared WE01 chrome |
| **Draft preview** | `GET /clinics/:clinicKey?website_mode=draft` (no `website_edit`) | Preview unpublished draft without pencils |
| **Website Management Hub** | `GET /app/settings/website` | Management tiles/metrics — **not** the visual editing canvas |

**Chrome stack (visual editor):**  
`attachActiveClinicWebsiteLocals` → `views/activeclinic/partials/website-editor-chrome.ejs` → `views/platform/website-engine/editor-chrome.ejs` + overlays.

**Mutation family:** `/clinics/:clinicKey/website/*` (`activeClinicWebsiteRoutes.js`).

---

## Exact semantics (verified)

| Concept | Meaning in current AC code |
|---------|----------------------------|
| **Edit mode** | `website_edit=1` + edit permission + not version-preview + not edit-locked → pencils + full editor shell |
| **Draft content resolution** | `website_mode=draft` **or** `website_edit=1` (when canEdit) → draft values |
| **Preview** | `website_mode=draft` without `website_edit` → preview banner, no pencils; Publish may still show if permitted |
| **Save** | Per-field / dialog **Save draft** → `POST …/website/drafts`; response `published: false`. **No** global toolbar Save button |
| **Unpublished changes count** | Distinct **content keys** where `draft_value ≠ published_value` (Change Manager / `diffContentRows`). Not a save-operation counter. Label pattern: `Draft • N unpublished changes` |
| **Publish** | Confirmed `POST …/website/publish` promotes draft → live (optional availability / `makePublic`) |
| **Restore (version)** | `POST …/website/versions/:id/restore` → **new draft only**; live unchanged until Publish |
| **Restore (field)** | Field History → restore into draft; does not publish |
| **Layers** | **No** visual z-order Layers panel. Hub rail label **“Layers”** navigates to **Sections** CMS (`/app/settings/website/sections`) |
| **Device modes** | Toolbar **Desktop / Tablet / Mobile** viewport toggles (`data-website-viewport`) apply CSS canvas width classes — not real device/UA emulation |

---

## Inventory

Legend: `IMPLEMENTED` = YES \| PARTIAL \| NO · `AUTOMATED_TEST` = YES \| PARTIAL \| NO

---

### 1. DEVICE / RESPONSIVE MODES

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Desktop viewport toggle | Toolbar Desktop resizes canvas preview | `editor-chrome.ejs` `data-website-viewport="desktop"`; `website-inline-edit.js` | YES | PARTIAL | Markup/attrs asserted (`v7-shared-website-editor`); no AC click/switch HTTP |
| Tablet viewport toggle | Toolbar Tablet resizes canvas preview | `data-website-viewport="tablet"` | YES | PARTIAL | Same as Desktop |
| Mobile viewport toggle | Toolbar Mobile resizes canvas preview | `data-website-viewport="mobile"` | YES | PARTIAL | Same as Desktop |
| Image framing Desktop/Mobile | Image field dialog framing tabs; optional mobile placement | `website-inline-edit.js` framing UI | YES | PARTIAL | Client-side; image save covered, framing modes lightly |
| True device / UA emulation | Browser UA or device chrome | — | NO | NO | CSS width simulation only |

---

### 2. EDITING

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Enter visual edit mode | Open clinic site in edit+draft query | `GET /clinics/:key?website_edit=1&website_mode=draft` | YES | YES | post-reg editor, wave1, hardening |
| Inline text edit | Pencil → dialog/sheet → Save draft | `website-editable-field.ejs` + field-editor-host + `website-inline-edit.js` | YES | YES | wave2 / v7 shared AC path |
| Inline image edit | Upload / library / remove / frame → Save draft | `website-editable-image.ejs` | YES | YES | v7 shared AC image |
| FAQ / collection editor | Add/reorder/remove FAQ items on home | `website-collection-editor.ejs` + `website-collection-edit.js` | YES | PARTIAL | Contract/static stronger than HTTP |
| Page selector (editor rail) | Switch pages while staying in edit mode | Shared chrome page rail; `buildEditorPages` | YES | YES | wave1 |
| More menu destinations | Settings, Branding, Theme, History, Pages, Sections, Assets, SEO, Discard, Unpublish… | `attachActiveClinicWebsiteChrome.js` `moreItems` | YES | YES | wave1 chrome |
| Exit editing | Finish session → leave edit mode | `POST …/website/edit-session/finish` | YES | PARTIAL | Route wired; AC finish lightly asserted |
| Dirty leave guard | Warn before leaving with unsaved field edits | `website-inline-edit.js` / lifecycle `beforeunload` | YES | YES | `activeclinic-editor-client-contracts` |
| Boolean visibility toggles | Show/hide optional nav items in nav editor | `website-nav-editor.ejs` `[data-website-boolean]` | YES | NO | Present in template |

---

### 3. DRAFT / SAVE

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Save draft (never auto-publishes) | Field Save posts draft only | `POST /clinics/:key/website/drafts` | YES | YES | wave2 / hardening `published:false` |
| Draft status label | Shows draft + unpublished count | `editorShell.draftStatusLabel` | YES | YES | wave1 |
| Toolbar save-status indicator | Idle / saving / saved / failed | `[data-website-save-status]` | YES | PARTIAL | UI present; transitions client-side |
| Discard all draft changes | Confirm → discard all; live unchanged | More → Discard; `POST …/drafts/discard` | YES | YES | wave3 AC discard_all |
| Revert single field to published | Revert one key from panel/discard path | Change Manager `revertFieldToPublished` | YES | YES | Platform + discard path |

---

### 4. PREVIEW / PUBLISH

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Draft preview mode | View draft without pencils | `?website_mode=draft`; `/website/preview` → 303 | YES | YES | wave3 preview banner |
| Preview banner | “Previewing unpublished draft” + Back + Publish | `preview-banner.ejs` | YES | YES | wave3 |
| Publish with confirmation | Confirm dialog → promote draft live | Toolbar Publish; `POST …/website/publish` | YES | YES | v7 shared AC publish |
| Unpublish website | Take site offline; content preserved | More → Unpublish; `POST …/website/unpublish` | YES | PARTIAL | Route + chrome; AC HTTP coverage lighter |
| Submit for approval | When policy requires review + canSubmit | More → Submit; `POST …/website/submit` | PARTIAL | PARTIAL | Implemented behind policy; limited AC UX coverage |
| Hub Publish / Preview / View live / Edit Website | Hub quick actions | `/app/settings/website` | YES | YES | `activeclinic-website-cms.test.js` |

---

### 5. UNPUBLISHED CHANGES

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Pending-changes pill | Shows N unpublished; opens panel | `[data-website-pending-pill]` | YES | YES | wave1 / count wiring |
| Unpublished changes panel | Grouped diffs; Preview / Publish All / revert | `unpublished-changes-panel.ejs`; `GET …/unpublished-changes` | YES | YES | Change Manager + AC route |
| Publishing reminder (≥5 pending) | Reminder overlay; Preview CTA; never auto-publish | `publishing-reminder.ejs` | YES | PARTIAL | Shell wired; reminder UX mostly static |
| Hub unpublished metric | Yes (N) / No | Hub metrics | YES | YES | CMS hub |

---

### 6. SECTIONS / LAYERS

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Section action menu | Edit / reorder / hide-show / restore default / remove | `section-action-menu.ejs`; `POST …/section-actions` | YES | YES | wave4a AC hide without publish |
| Add section | Pick type → adds to **draft** | `add-section-picker.ejs`; `POST …/add-section` | YES | YES | wave4b2 |
| Hub Sections / Pages CMS | Manage sections/pages from hub | `/app/settings/website/sections`, `/pages` | YES | YES | CMS tests |
| In-editor Layers panel (z-order tree) | Visual layers tree in editor | — | NO | NO | Hub rail “Layers” = Sections CMS alias only |

---

### 7. MEDIA

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Upload image in field editor | Upload ≤5MB → draft | `POST …/website/media` + drafts | YES | YES | wave4b1 |
| Choose from Image Library | Pick existing media in dialog | Inline library in field editor | YES | YES | wave4b1 |
| Media / Assets library (hub + More) | Upload/reuse photos | `/app/settings/website/media` | YES | YES | CMS + wave4b1 |
| Delete media from library cards | Delete asset from shared cards | — | NO | YES | Negative: delete not exposed by default (wave4b1) |

---

### 8. VERSION HISTORY

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Version history list | Open history from toolbar / More / hub | `GET …/website/versions` (+ history alias) | YES | YES | wave4b1 |
| Historical version preview | Read-only past snapshot | `GET …/website/versions/:versionId` | YES | YES | wave4b2 / restore path |
| Toolbar History control | Jump to history | Chrome `historyHref` | YES | YES | wave4b1 / mobile when present |

---

### 9. RESTORE

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Restore version as new draft | Confirm → draft only; live unchanged | `POST …/versions/:id/restore` | YES | YES | wave4b1 “restore creates draft only” |
| Field history restore | Per-field history → restore to draft | `GET/POST …/field-history[/restore]` | YES | YES | Field-history-restore panel + routes |

---

### 10. SERVICES / PRACTITIONERS / CLINIC CONTENT

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Public catalogue manage (hub) | Show/hide doctors & services for website | `/app/settings/website/catalogue` | YES | YES | v7 persistence catalogue |
| In-edit operational affordances | From doctors/services pages → catalogue links | `website-operational-affordance.ejs` | YES | PARTIAL | Template/link presence |
| Inline edit doctor/service cards on canvas | Pencil-edit clinician/service profiles in visual editor | Catalogue forms, not public-card pencils | PARTIAL | YES | Catalogue CRUD tested; not inline on cards |
| Clinic copy overlays (hero, contact, location, FAQ…) | Pencil-edit content keys | Tenant templates + drafts API | YES | YES | Draft/editor HTTP matrix |

---

### 11. NAVIGATION

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| In-editor website menu editor | Edit labels; show/hide optional pages | `website-nav-editor.ejs` when editing | YES | NO | UI present; no dedicated AC nav-editor suite |
| Hub Navigation page | Manage menu links | `/app/settings/website/navigation` | YES | PARTIAL | Hub tile present; coverage varies |
| Editor page rail / mobile Pages sheet | Switch editable pages | Shared chrome rail + sheet | YES | YES | wave1 |

---

### 12. ERROR / EMPTY STATES

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Offline / suspended website states | Public offline/suspended; admin chrome notes | `clinic-website-offline/suspended.ejs` | YES | YES | JSON error matrix + hardening |
| Unpublished panel empty | “No unpublished changes” | Panel empty state | YES | PARTIAL | Markup + model |
| Save/publish connection failure copy | Dirty retained; retry messaging | Inline-edit + lifecycle JS | YES | YES | editor-client-contracts |
| Edit locked / waiting review | Messaging; pencils suppressed when locked | `websiteEditLocked` / workflow | YES | PARTIAL | Locals + chrome |
| Cross-tenant / forbidden editor | 403/404 without content leak | Auth + attach chrome | YES | YES | post-reg H; hardening |

---

### 13. AUTHORIZATION / TENANT SAFETY

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Same-clinic organization isolation | Only own org edits own site | `sameClinicOrganization` | YES | YES | hardening + post-reg |
| Permission gates (view/edit/publish/restore/submit) | Actions hidden/denied by permission | `assertWebsiteAction` + AC checks | YES | YES | hardening role matrix |
| CSRF on mutations | Invalid CSRF → 403 | POST website routes | YES | YES | JSON error matrix |
| Reject client tenant override | Body org spoof blocked | `clientTenantOverride` | YES | YES | wave4a |
| No multi-website switcher (AC) | Switcher disabled | `changeWebsiteHref: null` | YES | YES | Explicit AC chrome config |

---

### 14. MOBILE EDITING UX

| FEATURE | USER_BEHAVIOR | ROUTE/COMPONENT | IMPLEMENTED | AUTOMATED_TEST | NOTES |
|---------|---------------|-----------------|-------------|---------------:|-------|
| Mobile editor bottom nav | Pages / Styles / History / Settings | `[data-website-mobile-nav]` | YES | YES | wave1 + mobile QA |
| Field editor as mobile bottom sheet | Pencil opens sheet | Field editor host + CSS | YES | YES | wave2 / `v7-website-mobile-editor` |
| Keyboard inset / scroll-into-view | Keeps field above keyboard | `website-editor-mobile.js` | YES | YES | mobile editor suite |
| Touch targets / safe-area | Shared chrome stack CSS | `website-inline-edit.css` | YES | YES | mobile QA |
| Compact mobile toolbar labels | Short Edit/Preview labels | AC chrome + shared exit | YES | YES | mobile QA |

---

## Hub-only note (not double-counted as visual editor)

`/app/settings/website` is the **Website Management Hub** (identity, Draft/Published status, unpublished changes, Sections/Media/History, Preview, Publish-by-permission, management tiles). Primary **Edit Website** opens the canonical visual editor at `/clinics/:clinicKey?website_edit=1&website_mode=draft`. Hub does **not** mount MW Studio chrome (`website-cms-nav` / `data-ac-mw-editor`) or a fake blank canvas (AC-WEB-EDITOR-01 CLOSED).

---

## Primary automated test corpus

- `tests/ac-web-editor-01-management-hub.test.js` (hub management-only UX)
- `tests/activeclinic-ac-post-reg-editor-route.test.js`
- `tests/activeclinic-editor-client-contracts.test.js`
- `tests/activeclinic-website-hardening.test.js`
- `tests/activeclinic-website-cms.test.js` (hub)
- `tests/activeclinic-website-json-error-matrix.test.js`
- `tests/shared-website-editor-wave{1,2,3,4a,4b1,4b2}.test.js`
- `tests/v7-shared-website-editor.test.js`
- `tests/v7-shared-website-editor-persistence.test.js`
- `tests/v7-website-mobile-editor.test.js`
- `tests/v2-04-initial-website-unpublished-count.test.js` (initial count = 0 semantics)

---

## Count methodology

- Each inventory table row (excluding headers) is one **FEATURE**.
- **FULLY_IMPLEMENTED** = `IMPLEMENTED=YES`
- **PARTIAL** = `IMPLEMENTED=PARTIAL`
- **NOT_IMPLEMENTED** = `IMPLEMENTED=NO`
- **AUTOMATED_TESTED** = `AUTOMATED_TEST=YES` only (PARTIAL/NO excluded)

**Counted from this document:** 64 features · IMPLEMENTED YES=59 / PARTIAL=2 / NO=3 · AUTOMATED_TEST YES=46.

---

## Footer

AC_EDITOR_FEATURES=64
FULLY_IMPLEMENTED=59
PARTIAL=2
NOT_IMPLEMENTED=3
AUTOMATED_TESTED=46
FINAL=AC_WEBSITE_EDITOR_FEATURE_INVENTORY_COMPLETE
