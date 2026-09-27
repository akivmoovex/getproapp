# V2.01 Stitch Parity Action Plan

**Task:** `V2_01_STITCH_PARITY_ACTION_PLAN`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing`  
**Production:** **untouched** (`blessboard.com` `03a89106e2fe` / `moovex-platform-production`)  
**Type:** Audit + planning only — **no editor changes, migrations, or deployment**

**Inputs:**
- `docs/qa/V2_01_BB_AC_STITCH_SCREEN_PARITY_AUDIT.md`
- `docs/qa/V2_01_SHARED_WEBSITE_EDITOR_FINAL_QA.md`
- `docs/qa/V2_01_ACTIVECLINIC_EDITOR_UX_REFERENCE.md` (source of “final simplified” vs studio guidance)

**Stitch:** Website Change Management System · `projects/12538817760086591589`

**Hosted tip during History re-capture:** `544f6b997a2b` · `moovex-platform-v8-testing`

---

## Verdict

**`V2_01_STITCH_PARITY_ACTION_PLAN_COMPLETE`**

The prior parity audit partly scored against **superseded “GetPro Web Studio” / three-column HQ studio** Stitch frames. This plan remaps the seven screens to the **final simplified ActiveClinic-style inline editor** references (public WE01 canvas + toolbar + dialogs/sheets), re-scores where references changed, **resolves Field History visual coverage** by opening the real sheet from `[data-website-field-history-open]`, and lists small shared-component tasks that do **not** rebuild WE01 or invent a studio.

---

## 1. Correct Stitch reference mapping

### Design authority rule

| Authority | Meaning |
| --- | --- |
| **Final / approved** | Simplified **inline** editor: public site + top toolbar + page rail + pencil dialogs/sheets (AC UX reference §§A–C, §G.12) |
| **Obsolete / superseded** | Three-column “Shared Website Manager” / dense “GetPro Web Studio” branch studio; permanent Section Library column as primary IA |
| **Secondary keep** | Reminder, unpublished panel, field history, theme gallery, choose-website **cards** |

Do **not** use Shared Website Manager Desktop/Mobile (`f5b9cdb2…` / `2106bb03…` per AC UX reference) as the primary Edit Website target — those redesign surfaces were judged **too complex vs live AC**.

### Seven-screen mapping (exact IDs)

| # | Screen | **Approved final Stitch** (use for scoring / work) | Name | Role | **Obsolete / secondary** (do not drive rebuilds) |
| --- | --- | --- | --- | --- | --- |
| 1 | Edit Website | `d8d264953e304d02946313240814a3bb` | 1. Edit Website Toolbar & 5-Change Reminder - Desktop | Final inline toolbar + canvas pencils | `f8176aec2a2c4c29a6839b676c62e4ad` “1. Edit Website - Desktop” (**studio lilac cards** — obsolete primary) |
| 1 | Edit Website (mobile) | `863c719271a242e696406112b9f80ee9` | Website Editor Toolbar | Final mobile toolbar / densification | — |
| 1 | Reminder (secondary) | `d9f101c607e3469b84fdbcdcd6d0c062` | Friendly Publishing Reminder | Keep secondary | `7cba508feafd424cba2af1674ea1c90f` (download flaky; secondary) |
| 2 | Edit Content | `32d4fc191b124153ac69bdfd4fd0cd41` | 2. Edit Content - Desktop | Field / content edit surfaces | — |
| 3 | Review & Publish | `33660fcf4baf439586bdbe6fc8b11643` | 3. Simple Review, Publish & States - Desktop | Final simple review modal/states | `01698e70b06b4d579f89ae3f433ec11a` denser Review (secondary) |
| 3 | Unpublished panel | `d205f226463c4e38b797b4757338404e` | Unpublished Changes Panel | Final mobile panel | — |
| 4 | History & Restore | `3d0ca359954840aab5b4f4d4587af5ca` | 4. Simple Field History & Restore - Desktop | **Final simplified** History | `5dcd717f0e904bf7af968b904b3d6653` denser History desktop (secondary) |
| 4 | History mobile | `06f6fb0423eb47808b0227564ae48458` | Field History and Restore | Final mobile sheet | — |
| 5 | Add & Organize Sections | `147683a1ada04a5c9179aac66e5158d7` | 5. Add & Organize Sections - Desktop | Partial — compare **Add Section / reorder** only | Permanent **Section Library column** = unsupported Stitch-only |
| 6 | Choose Website Theme | `4a6f1807bf53410f8ae5de18a1e99588` | 6. Choose Website Theme - Desktop | Final theme chooser | Marketing claims in gallery (`2d53fd58518a4a2192d2618d126f1c76`) stay non-product |
| 6 | Theme gallery | `2d53fd58518a4a2192d2618d126f1c76` | 6. Choose Website Theme Gallery - Desktop | Gallery layout reference | “Full Image Sync 100%” / AAA claims = unsupported |
| 7 | HQ & Branch Website Mgmt | Card-list intent (E1) + `f44b1ff17685428c8b0f5a3f22bcfae4` Mobile | 7. HQ & Branch Management - Mobile | Prefer **cards / mobile stack** | `af7bebae74a7420e9fd9d982ec4cafd7` · `79c3f01367ec4c819ffc487378c04552` Desktop (**three-column studio** — obsolete for implementation) |

**Revision note:** Stitch MCP does not expose a separate “revision number” field in `get_screen` / `list_screens`. “Latest approved” here means the **named simple/final screens** above as selected by AC UX reference + product decisions (E1 cards-only HQ/branch; no facility websites). Traceability keeps prior audit scores that used obsolete studio frames.

---

## 2. Original vs revised scores

Rubric unchanged (Layout 25 · Type/controls 20 · Interaction 25 · Responsive 20 · A11y 10).

| Screen | BB D orig → rev | BB M orig → rev | AC D orig → rev | AC M orig → rev | Why changed |
| --- | --- | --- | --- | --- | --- |
| 1 Edit Website | 58 → **72** | 54 → **68** | 60 → **74** | 55 → **70** | Switched primary ref from studio `f8176aec` → inline toolbar `d8d26495` / `863c7192` |
| 2 Edit Content | 62 (unchanged) | 58 | 63 | 58 | Same approved `32d4fc19` |
| 3 Review & Publish | 64 (unchanged) | 60 | 64 | 60 | Prefer `33660fcf` + `d205f226`; scores already near simple review |
| 4 History & Restore | NOT SCORED → **70** | NOT SCORED → **68** | NOT SCORED → **71** | NOT SCORED → **69** | Rendered sheet captured (see §3) |
| 5 Add & Organize | 52 (unchanged) | 50 | 54 | 50 | Section Library remains **D** unsupported |
| 6 Choose Theme | 68 (unchanged) | 66 | 70 | 67 | Gallery/chooser refs unchanged |
| 7 HQ & Branch | 55 → **70** | 58 → **72** | 72 → **78** | 74 → **80** | Studio desktop refs marked **E obsolete**; score vs cards + mobile |

Combined (where both viewports scored):

| Screen | BB combined orig → rev | AC combined orig → rev |
| --- | --- | --- |
| 1 | 56 → **70** | 58 → **72** |
| 4 | — → **69** | — → **70** |
| 7 | 57 → **71** | 73 → **79** |

---

## 3. Field History visual coverage (resolved)

### Correct user-facing path

1. Open WE01 edit (`?website_edit=1&website_mode=draft`).  
2. Click **`[data-website-field-history-open]`** beside a field (not the raw `/website/field-history` URL).  
3. Client `public/platform/website-change-manager-ui.js` → `openFieldHistory()` fetches JSON (`Accept: application/json`) and **renders** into `views/platform/website-engine/field-history-restore.ejs` (`.gp-cm-history` / `[data-website-field-history]`).

Direct browser navigation to `/website/field-history?contentKey=…` returns **JSON** by design — that is the API, **not** the UI. The prior audit’s NOT SCORED was a capture method error, not a missing product screen.

### Captures this plan (authorized disposable tenants)

| Product | Viewport | File | Result |
| --- | --- | --- | --- |
| BB | 1440 | `docs/qa/references/v2-01-stitch-parity/action-plan/bb-desktop1440-field-history-sheet.png` | **PASS** open · choices · confirm |
| BB | 390 | `…/bb-mobile390-field-history-sheet.png` | **PASS** |
| AC | 1440 | `…/ac-desktop1440-field-history-sheet.png` | **PASS** |
| AC | 390 | `…/ac-mobile390-field-history-sheet.png` | **PASS** |

Manifest: `docs/qa/references/v2-01-stitch-parity/action-plan/history-capture-manifest.json`  
Keys opened: BB `home.hero.heading` · AC `home.hero.title`

### Compare vs approved Stitch (`3d0ca359` · `06f6fb04`)

| Observation | Class |
| --- | --- |
| Sheet opens from pencil-adjacent History control; draft-safe copy; restore does not publish | Interaction match |
| Choice cards (undo / previously saved / currently published / earlier versions) | Workflow match |
| Stitch shows richer timeline grouping + quoted content previews + inline “Restore to Draft” on selection | **B** shared visual mismatch |
| Live uses technical `home.hero.*` in title | **B** (usability copy) |
| Mobile sheet usable at 390 | Responsive OK |

**History scores (revised):** BB 70/68 · AC 71/69 — see table §2.

---

## 4. Actionable gap matrix

Classes: **A** usability/functional · **B** shared visual component · **C** deliberate product/theme · **D** unsupported Stitch-only · **E** obsolete Stitch reference

| Screen | Gap | Class | Affected files (primary) |
| --- | --- | --- | --- |
| 1 | Prior audit scored vs studio Edit Website | **E** | Stitch `f8176aec…` — do not implement |
| 1 | Toolbar density / pending pill / Publish (N) wording vs `d8d26495` | **B** | `views/platform/website-engine/editor-chrome.ejs` · `public/platform/website-inline-edit.css` · `public/platform/website-change-manager-ui.js` |
| 1 | Mobile bottom nav densification vs `863c7192` | **B** | `public/platform/website-inline-edit.css` · `public/platform/website-editor-mobile.js` · product chrome partials |
| 1 | Pencil + history clock cluster size/hit targets on mobile | **A** (usability) | editable field partials · `website-inline-edit.css` |
| 2 | Text/image dialog spacing vs Stitch Edit Content | **B** | `views/platform/website-engine/field-editor-host.ejs` · media field CSS · product editable-*.ejs |
| 2 | AC catalogue deep-links for doctors/services | **C** | AC catalogue routes (preserve) |
| 3 | Unpublished panel empty/populated hierarchy vs `d205f226` / `33660fcf` | **B** | `views/platform/website-engine/unpublished-changes-panel.ejs` · `website-change-manager-ui.css` / `.js` |
| 3 | Publish failure UX not visually audited | Remaining unscored | `lifecycle-dialog-host.ejs` / publish handlers |
| 4 | History title shows raw contentKey | **A**/**B** | `field-history-restore.ejs` · `fieldHistoryRestore.js` presentation |
| 4 | Missing Stitch-like quoted value preview in choice cards | **B** | `field-history-restore.ejs` · `website-change-manager-ui.js` `renderHistoryChoices` |
| 5 | Permanent Section Library column | **D** | Do not build — keep `add-section-picker.ejs` + FAB |
| 5 | Add Section picker chrome densification | **B** | `views/platform/website-engine/add-section-picker.ejs` · `public/platform/website-add-section.css` |
| 6 | Theme card thumbnails / preview chrome vs gallery | **B** | `theme-gallery-page.ejs` · `website-theme-gallery.css` / `.js` |
| 6 | Remaining Stitch theme packs / palette editor | **D** | `themeRegistry.js` (no invent packs here) |
| 6 | BB church vs AC healthcare themes | **C** | Preserve product filter |
| 7 | Three-column HQ/branch studio screens | **E**/**D** | Stitch `af7bebae` / `79c3f013` — do not rebuild |
| 7 | BB card list visual densification | **B** | `website-scope-list-page.ejs` · `website-scope-list.css` |
| 7 | AC facility websites | **D** / unsupported product | Explicit copy already correct — preserve |
| — | Publishing reminder live (≥5) | Remaining unscored | `publishing-reminder.ejs` · change-manager UI |

---

## 5. Minimal improvement plan (independently testable)

**Constraints:** Preserve draft≠publish, auth isolation, theme product filter, HQ/branch cards (no studio), AC single clinic. Prefer mobile hit targets for non-technical admins. **No WE01 rebuild.**

### Recommended implementation order

| Order | Task ID | Area | Smallest change | Acceptance (testing only) |
| --- | --- | --- | --- | --- |
| 1 | `SP-T1` | Shared toolbar + pencils | Densify `editor-chrome` pending pill + Publish label; enlarge mobile pencil/history hit areas in `website-inline-edit.css` | BB+AC 1440/390: toolbar readable; history-open still works |
| 2 | `SP-T2` | Field History | Humanize sheet title (field label); show truncated value preview on choices in `field-history-restore.ejs` + `renderHistoryChoices` | Sheet matches simple Stitch structure; restore still draft-only |
| 3 | `SP-T3` | Review / publish | Unpublished panel empty-state + page-group hierarchy CSS toward `d205f226` | Open from pending pill at 0 and N>0 |
| 4 | `SP-T4` | Shared editing dialogs / image UI | Align field-editor / Adjust Picture spacing tokens; keep Desktop/Mobile framing | Dialog usable at 390; no CDN rewrite |
| 5 | `SP-T5` | Theme gallery | Richer card thumbnails + clearer Preview/Select affordances | Product isolation preserved |
| 6 | `SP-T6` | HQ/branch cards | Card density / badge stacking on `website-scope-list.css` (BB); leave AC single-card copy | No studio; AC still one clinic |
| 7 | `SP-T7` | Section management | Polish Add Section picker sheet only — **no** Section Library column | Add Section still draft-only |

### Explicit non-goals

- Recreate three-column Shared Website Manager / GetPro Web Studio.  
- AC facility mini-websites / network-wide publish.  
- Remaining Stitch theme packs / palette customizer as a dependency of this plan.  
- Treating JSON `/website/field-history` as a user page.

---

## 6. Remaining unscored / incomplete visual states

| State | Status | Blocker / note |
| --- | --- | --- |
| Publishing reminder (≥5 pending) | NOT SCORED live | Threshold not met on disposable tenants during captures |
| Publish failure dialog | NOT SCORED | Not triggered (avoid breaking publish path in audit) |
| Stitch `4a6f1807` primary theme file download | Intermittent corrupt thumbnail | Use gallery `2d53fd58` + live `/website/themes` |
| Stitch `7cba508f` mobile reminder flow download | HTTP 400 intermittent | Secondary; `d9f101c6` available |
| Obsolete studio screens | Intentionally not re-scored as targets | Kept for traceability as **E** |

---

## 7. Screenshot evidence index

| Path | Purpose |
| --- | --- |
| `docs/qa/references/v2-01-stitch-parity/stitch/s1-toolbar-reminder-desktop__d8d26495.png` | Approved Edit Website toolbar ref |
| `docs/qa/references/v2-01-stitch-parity/stitch/s4-simple-history-desktop__3d0ca359.png` | Approved simple History ref |
| `docs/qa/references/v2-01-stitch-parity/stitch/s3-simple-review-states-desktop__33660fcf.png` | Approved simple Review ref |
| `docs/qa/references/v2-01-stitch-parity/bb|ac/*-s1-edit-website.png` | Live WE01 (prior audit) |
| `docs/qa/references/v2-01-stitch-parity/action-plan/*-field-history-sheet.png` | **New** rendered History UI |
| `docs/qa/references/v2-01-stitch-parity/action-plan/history-capture-manifest.json` | Capture metadata |

---

## 8. Production untouched

No code, migration, or deploy. Production `/healthz` remained `03a89106e2fe` / `moovex-platform-production`.

---

## FINAL VERDICT (repeat)

**`V2_01_STITCH_PARITY_ACTION_PLAN_COMPLETE`**

### Five highest-impact improvements

1. **Toolbar + mobile pencil/history hit targets** (`SP-T1`) — everyday admin usability.  
2. **Field History sheet human labels + value preview** (`SP-T2`) — closes the prior visual gap without API changes.  
3. **Unpublished Changes panel hierarchy/empty state** (`SP-T3`) — Review & Publish clarity.  
4. **Field/image dialog densification at 390** (`SP-T4`) — shared dialogs, not a new editor.  
5. **Theme gallery card affordances** (`SP-T5`) — high perceived polish, low risk to publish safety.
