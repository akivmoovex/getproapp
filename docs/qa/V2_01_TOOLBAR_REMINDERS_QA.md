# V2.01 Editor Toolbar + Friendly Publishing Reminders QA

**Task:** `V2_01_EDITOR_TOOLBAR_AND_REMINDERS`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Deployment target:** `moovex-platform-v8-testing` (code only — **production untouched**)  
**Products:** BlessBoard + ActiveClinic  
**Stitch:** [Website Change Manager](https://stitch.withgoogle.com/projects/12538817760086591589)  
- Screen 1 Toolbar: `863c719271a242e696406112b9f80ee9`  
- Screen 2 Friendly Publishing Reminder: `d9f101c607e3469b84fdbcdcd6d0c062`  

**Local SHA (working tree base):** `e5bd58adc7cf` (`e5bd58adc7cf81725ce34b463d81b8a25850f224`)  
**Hosted deploy of this UI:** not performed in this task  

**Prerequisite:** `V2_01_CHANGE_MANAGER_FOUNDATION_PASS` (`docs/qa/V2_01_CHANGE_MANAGER_FOUNDATION_QA.md`)

---

## Verdict

**`V2_01_TOOLBAR_REMINDERS_PASS`**

Shared Change Manager toolbar + friendly publishing reminder are mounted in existing BlessBoard and ActiveClinic website editors. Pending counts come from server-confirmed draft-vs-published distinct fields; save status never shows “Drafts saved” during pending/failed saves; Publish respects `website.publish`; Preview never auto-publishes; reminder threshold is five; dismissal is website-scoped with “don’t show again today” + suppress-until-count-changes; no organization switcher in this chrome.

---

## Stitch parity (Screen 1 + 2)

| Stitch element | Implementation | Match |
|----------------|----------------|-------|
| Pending edits pill (warm `#ffdcc3`) | `.gp-website-editor__pending-pill` | **Yes** |
| Save status “Drafts saved” / Saving… / failed | `[data-website-save-status]` + `gp:website-save-*` events | **Yes** |
| History / Preview / Publish actions | Shared `editor-chrome.ejs` | **Yes** |
| Publish count badge `Publish (N)` | `publishButtonLabel` / `data-website-publish-label` | **Yes** |
| Primary `#004357` + reminder dialog layout | `website-change-manager-ui.css` | **Yes** |
| “Your website is taking shape!” + pending badge | `publishing-reminder.ejs` | **Yes** |
| Preview Changes + Keep Editing | Preview = `previewHref` only (no publish form) | **Yes** |
| Don’t show again today | localStorage key via `reminderDismissTodayKey` | **Yes** |
| SafeDraft Protection badge | Reminder header copy | **Yes** |
| Desktop + ~390px mobile densification | `@media (max-width: 430px)` | **Yes** (CSS) |
| Organization switcher in editor chrome | Absent | **Yes** (none) |

---

## Changed / added files

| File | Change |
|------|--------|
| `src/platform/website-engine/changeManagerUi.js` | **New** — threshold, labels, reminder helpers, `applyChangeManagerToolbar` |
| `src/platform/website-engine/editorShell.js` | Applies Change Manager toolbar facts on shell present |
| `views/platform/website-engine/editor-chrome.ejs` | History, pending pill, save status row, compact nav reminder, scope attrs |
| `views/platform/website-engine/publishing-reminder.ejs` | **New** — Screen 2 reminder dialog |
| `views/platform/website-engine/editor-overlays.ejs` | Includes publishing reminder |
| `public/platform/website-change-manager-ui.css` | **New** — Stitch colors + desktop/390px |
| `public/platform/website-change-manager-ui.js` | **New** — save status, reminder open/dismiss, nav reminder |
| `public/platform/website-inline-edit.js` | Emits `gp:website-save-start/success/error` + upload; uses server `pendingChangeCount` |
| `src/blessboard/http/attachWebsiteAdminChrome.js` | `getPendingChangeSummary` count + `websiteScopeKey` |
| `src/activeclinic/http/attachActiveClinicWebsiteChrome.js` | `websiteScopeKey` / instance / org on shell |
| `src/blessboard/http/blessboardWebsiteEditorRoutes.js` | Draft save JSON includes `pendingChangeCount` |
| `src/activeclinic/http/activeClinicWebsiteRoutes.js` | Draft save JSON includes `pendingChangeCount` |
| `views/blessboard/v5/partials/tenant-public-shell-*.ejs` | Wire CM CSS/JS |
| `views/activeclinic/layouts/public-shell.ejs` | Wire CM CSS/JS |
| `tests/v2-01-toolbar-reminders.test.js` | **New** — count, threshold, dismissal, save status, perms, mobile, BB+AC |
| `docs/qa/V2_01_TOOLBAR_REMINDERS_QA.md` | This document |

---

## Behaviour checklist

| Requirement | Result |
|-------------|--------|
| Accurate pending counter (distinct unpublished fields) | **PASS** — Change Manager summary / save response |
| Never fake-bump count on client | **PASS** — inline-edit stops local invent |
| Server-confirmed save status | **PASS** — success only after save JSON `ok` |
| Never show saved during pending/failed | **PASS** — `__gpCmBusy` + status machine |
| History / Preview / Publish on toolbar | **PASS** |
| `website.publish` gates Publish | **PASS** — `canPublish` / `showPublish` |
| Reminder after **5** meaningful saved unpublished changes | **PASS** — `REMINDER_THRESHOLD = 5` |
| Preview Changes + Keep Editing | **PASS** |
| Optional Don’t show again today | **PASS** — day-scoped localStorage |
| Preview never auto-publishes | **PASS** — preview link only |
| Compact page-navigation reminder | **PASS** — `[data-website-nav-reminder]` |
| No interruption during saves/uploads | **PASS** — reminder closed + blocked while busy |
| Suppress repeated dismissal until count changes | **PASS** — `reminderSuppressKey` |
| Website-scoped (not cross-site) | **PASS** — `websiteScopeKeyFor(product, org, instance)` |
| No unauthorized organization switcher | **PASS** — not present in CM chrome/reminder |
| Shared components for BB + AC | **PASS** — platform website-engine + assets |

---

## Tests

Command: `node --test tests/v2-01-toolbar-reminders.test.js`

| Case | Result |
|------|--------|
| Pending count normalization | **PASS** |
| Threshold = 5; busy/dismiss/suppress gates | **PASS** |
| Dismissal keys scoped per website + UTC day | **PASS** |
| Save status never “saved” while saving/failed | **PASS** |
| Preview CTA copy; no publish submit in reminder | **PASS** |
| `website.publish` hides Publish; AC/BB labels | **PASS** |
| BB + AC shell asset + chrome wiring | **PASS** |
| Save routes return `pendingChangeCount` | **PASS** |
| Compact nav reminder + shared chrome includes | **PASS** |
| Mobile CSS densification (`max-width: 430px` ≈ 390px) | **PASS** |

**12/12 PASS**

---

## Mobile results (390px)

| Check | Result |
|-------|--------|
| CSS densification for ≤430px (preview icon-only, full-width reminder) | **PASS** (static) |
| Shared chrome used by BB + AC | **PASS** |
| Live Cursor Browser pixel compare vs Stitch at 390px | **Not run** (gap — local CSS verified only) |

---

## BB + AC coverage

| Surface | Coverage |
|---------|----------|
| BlessBoard tenant public editor shell | CM CSS/JS + shared chrome + overlays reminder |
| ActiveClinic public tenant editor shell | CM CSS/JS + shared chrome + overlays reminder |
| Pending count source | BB: `getPendingChangeSummary` when instance exists; AC: resolver unpublished / save summary |
| Save → count refresh | Both draft save routes return `pendingChangeCount` |

---

## Gaps (non-blocking)

| Gap | Notes |
|-----|-------|
| Live Stitch browser visual QA at desktop + 390px | CSS/markup parity inspected; interactive browser not recorded this pass |
| Hosted smoke on `moovex-platform-v8-testing` | Requires deploy of this diff |
| BlessBoard overlay-only fields not in `platform.website_content` | Still outside Change Manager count until bridged (foundation gap) |
| Unpublished Changes Panel / Field History Stitch screens | Out of scope for this task |

---

## Explicit non-actions

| Action | Done? |
|--------|-------|
| Production changes | **No** |
| Hostinger deploy / restart | **No** |
| Autosave | **No** |
| Organization switcher in editor | **No** |
| Preview auto-publish | **No** |

---

## Verdict (restated)

**`V2_01_TOOLBAR_REMINDERS_PASS`**
