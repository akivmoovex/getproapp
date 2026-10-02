# V2.01 Unpublished Changes Panel QA

**Task:** `V2_01_UNPUBLISHED_CHANGES_PANEL`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Deployment target:** `moovex-platform-v8-testing` (code only — **production untouched**)  
**Products:** BlessBoard + ActiveClinic  
**Stitch:** [Website Change Manager](https://stitch.withgoogle.com/projects/12538817760086591589)  
- Screen 3 Unpublished Changes Panel: `d205f226463c4e38b797b4757338404e`  

**Local SHA (working tree base):** `e5bd58adc7cf` (`e5bd58adc7cf81725ce34b463d81b8a25850f224`)  
**Hosted deploy of this panel:** not performed in this task  

**Prerequisites:**  
- `V2_01_CHANGE_MANAGER_FOUNDATION_PASS`  
- `V2_01_TOOLBAR_REMINDERS_PASS`

---

## Verdict

**`V2_01_UNPUBLISHED_CHANGES_PASS`**

Shared Unpublished Changes Panel matches Stitch Screen 3 structure for BB+AC: accurate pending count, page-grouped field cards with type + save status, readable live-vs-draft text and image previews, navigate-to-editor, Preview Website + Publish All Changes with permission gates, clear empty state, tenant-scoped API, and safe field Revert only via existing `revertFieldToPublished` / discard path (no destructive placeholder).

---

## Visual parity (Stitch Screen 3)

| Stitch element | Implementation | Match |
|----------------|----------------|-------|
| Title `Unpublished Changes (N)` | Panel title + pending count | **Yes** |
| Draft Safe / visitors see live banner | `.gp-cm-panel__banner` | **Yes** |
| Page groups (e.g. Home Page) with change count | `presentUnpublishedChangesPanel` groups by pageKey | **Yes** |
| Field type chip (Text / Media) | `typeLabel` from content type | **Yes** |
| Saved relative time | `relativeSavedLabel(updatedAt)` | **Yes** |
| Live vs Draft text diff | Live strikethrough + Draft emphasis | **Yes** |
| Image Live → New thumbnails | `.gp-cm-panel__media-diff` | **Yes** |
| Preview Full Context | Opens field editor / page edit href | **Yes** |
| Revert (safe only) | Shown only when `discardPath` present | **Yes** |
| Footer Preview + Publish All (N) Changes | Preview link; Publish form if `website.publish` | **Yes** |
| ~390px sheet densification | `@media (max-width: 430px)` | **Yes** (CSS) |
| Org switcher | Absent | **Yes** |

---

## Changed / added files

| File | Change |
|------|--------|
| `src/platform/website-engine/unpublishedChangesPanel.js` | **New** — page grouping + presentation |
| `src/platform/website/websiteChangeManagerService.js` | `getUnpublishedChangesPanel` |
| `src/platform/website/contentService.js` | Diff rows include `updatedAt` |
| `src/platform/website/publicWebsiteUrl.js` | `buildPublicWebsiteUnpublishedChangesPath` |
| `src/platform/website-engine/changeManagerUi.js` | Panel Stitch screen id on toolbar model |
| `src/platform/website-engine/editorShell.js` | `unpublishedChangesUrl` on shell |
| `views/platform/website-engine/unpublished-changes-panel.ejs` | **New** — Screen 3 shell |
| `views/platform/website-engine/editor-overlays.ejs` | Includes panel |
| `public/platform/website-change-manager-ui.js` | Open/render panel, revert, navigate to field |
| `public/platform/website-change-manager-ui.css` | Panel styles + 390px |
| `src/blessboard/http/attachWebsiteAdminChrome.js` | `unpublishedChangesUrl` |
| `src/activeclinic/http/attachActiveClinicWebsiteChrome.js` | `unpublishedChangesUrl` |
| `src/blessboard/http/blessboardWebsiteEditorRoutes.js` | GET panel JSON; single-field revert via `revertFieldToPublished` |
| `src/activeclinic/http/activeClinicWebsiteRoutes.js` | GET panel JSON; single-field revert via `revertFieldToPublished` |
| `views/blessboard/v5/partials/tenant-public-shell-*.ejs` | Asset version bump |
| `tests/v2-01-unpublished-changes-panel.test.js` | **New** |
| `docs/qa/V2_01_UNPUBLISHED_CHANGES_QA.md` | This document |

---

## Behaviour checklist

| Requirement | Result |
|-------------|--------|
| Accurate pending count | **PASS** — distinct draft≠published keys |
| Group by actual website page | **PASS** — pageKey from content key / template group |
| Field/item, type, save status | **PASS** |
| Readable live-vs-draft text | **PASS** |
| Image previews | **PASS** |
| Navigate to field editor | **PASS** — click field / page `editHref` |
| Preview Website | **PASS** — previewHref only |
| Publish All Changes + permission checks | **PASS** — `canPublish` / `website.publish` |
| Clear empty state | **PASS** |
| Tenant isolation | **PASS** — org+instance authorize in Change Manager |
| Safe revert only if available | **PASS** — existing discard / `revertFieldToPublished` |
| No destructive placeholder before restore | **PASS** — Revert hidden without discardPath |

---

## Tests

Command: `node --test tests/v2-01-unpublished-changes-panel.test.js`

| Case | Result |
|------|--------|
| Page grouping + accurate count | **PASS** |
| Live/draft text + image comparisons | **PASS** |
| Navigation edit targets | **PASS** |
| Empty state | **PASS** |
| Publish / Revert permissions | **PASS** |
| No destructive revert without discard path | **PASS** |
| BB+AC wiring + tenant-scoped URLs | **PASS** |
| Preview ≠ Publish paths | **PASS** |
| 390px CSS densification present | **PASS** |

**9/9 PASS**

---

## Mobile / 390px

| Check | Result |
|-------|--------|
| Panel sheet full-width ≤430px | **PASS** (CSS) |
| Footer stacks on narrow viewports | **PASS** (CSS) |
| Live browser Stitch pixel compare | **Not run** (gap) |

---

## Hosted results

| Check | Result |
|-------|--------|
| Deploy to `moovex-platform-v8-testing` | **Not performed** |
| Production | **Untouched** |

---

## Gaps (non-blocking)

| Gap | Notes |
|-----|-------|
| Live Cursor Browser Stitch compare | CSS/markup parity coded; interactive visual QA not recorded |
| Hosted smoke | Requires deploy of this diff |
| Field History drawer (Screen 4) | Separate task; panel uses safe discard only |
| Overlay-only BB fields | Still outside engine count until bridged |

---

## Explicit non-actions

| Action | Done? |
|--------|-------|
| Production changes | **No** |
| Hostinger deploy / restart | **No** |
| Destructive fake Revert UI | **No** |
| Autosave | **No** |

---

## Verdict (restated)

**`V2_01_UNPUBLISHED_CHANGES_PASS`**
