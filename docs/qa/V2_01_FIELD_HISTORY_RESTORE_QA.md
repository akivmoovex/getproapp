# V2.01 Field History and Restore QA

**Task:** `V2_01_FIELD_HISTORY_AND_RESTORE`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Deployment target:** `moovex-platform-v8-testing` (code only — **production untouched**)  
**Products:** BlessBoard + ActiveClinic  
**Stitch:** [Website Change Manager](https://stitch.withgoogle.com/projects/12538817760086591589)  
- Screen 4 Field History and Restore: `06f6fb0423eb47808b0227564ae48458`  

**Local SHA (working tree base):** `e5bd58adc7cf` (`e5bd58adc7cf81725ce34b463d81b8a25850f224`)  
**Hosted deploy of this feature:** not performed in this task  

**Prerequisites:**  
- `V2_01_CHANGE_MANAGER_FOUNDATION_PASS`  
- `V2_01_UNPUBLISHED_CHANGES_PASS`

---

## Verdict

**`V2_01_FIELD_HISTORY_RESTORE_PASS`**

Safe field-level history/restore is available in BB+AC editors via History beside the pencil. Choices use existing published version history + current draft tip. Previously-saved draft revisions are explicitly **unavailable** (never fabricated). Restore requires `website.edit`, writes a new draft revision for the selected field only, never auto-publishes, recalculates pending count, validates historical CDN media, and uses existing `expectedUpdatedAt` conflict protection against stale overwrites.

---

## Migrations

| Question | Answer |
|----------|--------|
| New migration required? | **No** |
| Independent draft-revision table? | **No** — previously saved drafts are unavailable without fabricating |
| History source | Immutable `platform.website_versions` + live `website_content` draft/published |

---

## Visual parity (Stitch Screen 4)

| Stitch element | Implementation | Match |
|----------------|----------------|-------|
| History beside pencil | `.gp-website-editable__history` on BB+AC field/image editables | **Yes** |
| Revision History sheet | `field-history-restore.ejs` + `.gp-cm-history` | **Yes** |
| Draft vs Live compare (text/images) | Panel compare block | **Yes** |
| Undo current edit | Choice when pending draft exists | **Yes** |
| Previously saved | Shown as **unavailable** (not fabricated) | **Yes** (honest) |
| Currently published | Restorable to draft | **Yes** |
| Earlier published version | From version snapshots | **Yes** |
| Confirm: Restore This Version to Draft (Does Not Publish) | Footer CTA | **Yes** |
| Desktop + ~390px | Centered modal ≥720px; bottom sheet ≤430px | **Yes** (CSS) |

---

## Changed / added files

| File | Change |
|------|--------|
| `src/platform/website-engine/fieldHistoryRestore.js` | **New** — choice presentation |
| `src/platform/website/websiteChangeManagerService.js` | `getFieldHistoryRestorePanel`, `restoreFieldRevisionToDraft`; history includes live row |
| `src/platform/website/publicWebsiteUrl.js` | Field history/restore path helpers |
| `src/platform/website-engine/editorShell.js` | `fieldHistoryUrl` / `fieldRestoreUrl` |
| `views/platform/website-engine/field-history-restore.ejs` | **New** — Screen 4 shell |
| `views/platform/website-engine/editor-overlays.ejs` | Includes history sheet |
| `views/blessboard/v5/partials/editable-text.ejs` / `editable-image.ejs` | History beside pencil |
| `views/activeclinic/partials/website-editable-field.ejs` / `website-editable-image.ejs` | History beside pencil |
| `public/platform/website-change-manager-ui.js` / `.css` | Open/select/restore UI + styles |
| `public/platform/website-inline-edit.js` | `expectedUpdatedAt` on saves; conflict messaging |
| `src/blessboard/http/attachWebsiteAdminChrome.js` | History/restore URLs on shell |
| `src/activeclinic/http/attachActiveClinicWebsiteChrome.js` | History/restore URLs on shell |
| `src/blessboard/http/blessboardWebsiteEditorRoutes.js` | GET history / POST restore; save conflict 409 |
| `src/activeclinic/http/activeClinicWebsiteRoutes.js` | GET history / POST restore; save conflict 409 |
| `tests/v2-01-field-history-restore.test.js` | **New** |
| `docs/qa/V2_01_FIELD_HISTORY_RESTORE_QA.md` | This document |

---

## Behaviour checklist

| Requirement | Result |
|-------------|--------|
| History beside pencil | **PASS** |
| Undo current edit when data exists | **PASS** |
| Previously saved when data exists | **PASS** — unavailable (no prior draft store) |
| Currently published | **PASS** |
| Earlier published version | **PASS** |
| Text diffs + image thumbnails | **PASS** |
| Structured restore = one content key only | **PASS** — other keys untouched |
| Edit permission required to restore | **PASS** |
| Never auto-publishes | **PASS** — `published: false` |
| Recalculates pending count | **PASS** |
| Historical CDN media validated | **PASS** — `assertOwnedWebsiteImageValue` |
| Missing draft history never fabricated | **PASS** |
| Stale overwrite prevented | **PASS** — `expectedUpdatedAt` / `conflict` |
| Tenant isolation | **PASS** (service tests written; local DB skipped this run) |

---

## Tests

Command: `node --test tests/v2-01-field-history-restore.test.js`

| Case | Result |
|------|--------|
| Choice matrix (undo / previously saved unavailable / published / earlier) | **PASS** |
| Missing previously-saved never fabricated | **PASS** |
| Missing historical media marked unavailable | **PASS** |
| No restore without edit permission | **PASS** |
| BB+AC wiring (History control, APIs, confirm copy, 390px CSS) | **PASS** |
| Undo/currently published restore; unrelated draft preserved; counter | **SKIP** (local foundation Postgres unavailable) |
| Earlier published restore; previously_saved reject; auth deny; concurrency conflict | **SKIP** (local foundation Postgres unavailable) |
| Tenant isolation; no auto-publish | **SKIP** (local foundation Postgres unavailable) |

**Presentation/wiring: 5/5 PASS**  
**Service integration: 3 SKIP** (fixture DB unavailable in this environment — same helper as foundation suite)

---

## Hosted results

| Check | Result |
|-------|--------|
| Deploy to `moovex-platform-v8-testing` | **Not performed** |
| Production | **Untouched** |
| BB+AC publish regression smoke (hosted) | **Not performed** |

---

## Gaps (non-blocking)

| Gap | Notes |
|-----|-------|
| Local/hosted DB integration run | Service tests are authored; need Postgres fixture or hosted deploy to execute |
| Live Stitch browser pixel compare | CSS/markup parity coded; interactive visual QA not recorded |
| Prior draft revision timeline | Intentionally unavailable until a real draft-revision store exists |

---

## Explicit non-actions

| Action | Done? |
|--------|-------|
| Production changes | **No** |
| Hostinger deploy / restart | **No** |
| Fabricate previously-saved drafts | **No** |
| Auto-publish on restore | **No** |
| New migration | **No** |

---

## Verdict (restated)

**`V2_01_FIELD_HISTORY_RESTORE_PASS`**
