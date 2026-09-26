# V2.01 Shared Editor Toolbar Parity QA

**Task:** `V2_01_SHARED_EDITOR_TOOLBAR_PARITY`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing`  
**Approved commit / hosted tip:** `d2ce78f3b260`  
**Production:** **untouched** (`blessboard.com` `03a89106e2fe` / `moovex-platform-production`)

**Stitch:** Website Change Management System `projects/12538817760086591589`  
**Final refs (Screen 1):** desktop `d8d264953e304d02946313240814a3bb` · mobile `863c719271a242e696406112b9f80ee9`  
**Scope:** SP-T1 only (shared toolbar + pencil/History hit targets). **P2–P5 not started.**

**Personas:** disposable `bb-v8qa-mub23a6v6a6b` · `ac-v8-qa-mub23a6v6a6b`

---

## Verdict

**`V2_01_SHARED_EDITOR_TOOLBAR_PARITY_PASS`**

Shared WE01 toolbar and field History/pencil controls now meet ≥44px touch targets on BB/AC desktop and 390px, History opens from the field control (not the JSON API), idle status row no longer wastes a second band, Publish uses `Publish Changes (n)` when pending, and no unsupported autosave claims appear. BB has no horizontal overflow. AC retains a small residual overflow from existing public chrome (not toolbar icon shrink). Production untouched.

---

## 1. Gaps corrected (from action plan SP-T1)

| Gap | Fix |
| --- | --- |
| Mobile toolbar icons shrunk to 32px | Restored to `--gp-website-touch` (2.75rem / 44px) |
| History control 32px, not clustered | History ≥44px; desktop left-of-pencil cluster; mobile vertical stack above pencil |
| History could clip off left edge at 390 | Field `min-width` + mobile stack + padding-bottom for two controls |
| Empty status row always reserved space | Hide status row when pending pill + save status idle |
| Pending / save pills undersized | `min-height: 44px`, denser padding/type |
| Publish label vs Stitch | `Publish Changes (n)` when unpublished count ≥ 1 (still `Publish` when 0) |
| Fixed toolbar height clipped status wrap | `height: auto` + expand `--gp-we-toolbar-h` when pills visible |
| CSS cache | `v2-toolbar-parity-2` (BB shells + AC `ASSET_VERSION`) |

**Not changed (preserved):** draft/publish services, image payload/placement, media ownership, Field History persistence, theme registry, HQ/branch auth, public layouts, Add Section / Theme (still under Website Options / more menu).

---

## 2. Shared files changed

| File | Role |
| --- | --- |
| `public/platform/website-inline-edit.css` | Toolbar height, 44px buttons, field cluster room |
| `public/platform/website-change-manager-ui.css` | Status-row hide, pending/save densify, History placement |
| `src/platform/website-engine/changeManagerUi.js` | `Publish Changes (n)` label |
| `views/blessboard/v5/partials/tenant-public-shell-start.ejs` | CSS cache bump |
| `views/blessboard/v5/partials/tenant-public-shell-end.ejs` | JS cache bump |
| `src/platform/website/renderWebsiteManagementPage.js` | Inline-edit CSS cache |
| `src/activeclinic/http/renderActiveClinicPublic.js` | `ASSET_VERSION=v2-toolbar-parity-2` |
| `tests/v2-01-toolbar-reminders.test.js` | Touch/label assertions |
| `tests/v2-01-universal-image-editor.test.js` (+ section/theme infra) | Cache version assertions |

**Commits:** `fa0853ff` (initial toolbar parity) → `d2ce78f3` (mobile History/pencil overflow fix). Hosted tip = `d2ce78f3`.

---

## 3. Verification results

### Automated

```
node --test tests/v2-01-toolbar-reminders.test.js \
  tests/v2-01-field-history-restore.test.js \
  tests/v2-01-universal-image-editor.test.js
```

**Pass** (presentation suites green; DB-gated field-history skips unchanged).

### Hosted (tip `d2ce78f3b260`)

| Case | Touch ≥44 | Overflow X | History open | Cache `v2-toolbar-parity-2` | Autosave claim |
| --- | --- | --- | --- | --- | --- |
| BB desktop 1440 | **PASS** (44) | **0 PASS** | **PASS** | **PASS** | none |
| BB mobile 390 | **PASS** (44) | **0 PASS** | **PASS** | **PASS** | none |
| AC desktop 1440 | **PASS** (44) | 161 residual* | **PASS** | **PASS** | none |
| AC mobile 390 | **PASS** (44) | 31 residual* | **PASS** | **PASS** | none |

\*AC residual scrollWidth comes from existing public header/nav chrome while editing — not from shrunk toolbar icons. Field History + pencil clusters stay on-canvas after the mobile stack fix. Documented residual, not a SP-T1 functional failure.

Also confirmed: site/branch context in toolbar (`[data-website-scope-name]`), Preview + Publish present, idle status row collapsed (toolbar 56px desktop), no studio three-column chrome.

---

## 4. Before / after Screen 1 scores

Rubric: Layout 25 · Type/controls 20 · Interaction 25 · Responsive 20 · A11y 10.  
**Before** = action-plan revised scores vs final Stitch refs (pre-SP-T1).

| Product / viewport | Before | After | Delta |
| --- | --- | --- | --- |
| BB desktop | 72 | **80** | +8 |
| BB mobile 390 | 68 | **78** | +10 |
| AC desktop | 74 | **82** | +8 |
| AC mobile 390 | 70 | **76** | +6 |

Combined Screen 1: BB **70 → 79** · AC **72 → 79**.

Remaining gap vs Stitch is mostly branding (“GetProWeb Studio”), Website Options gear density, and AC residual overflow — not SP-T1 blockers.

---

## 5. Screenshot evidence

| Path | Content |
| --- | --- |
| `docs/qa/references/v2-01-toolbar-parity/stitch/s1-toolbar-reminder-desktop__d8d26495.png` | Approved desktop Stitch |
| `docs/qa/references/v2-01-toolbar-parity/stitch/s1-toolbar-mobile__863c7192.png` | Approved mobile Stitch |
| `docs/qa/references/v2-01-toolbar-parity/before-*-*.png` | Pre-change audit shots |
| `docs/qa/references/v2-01-toolbar-parity/{bb,ac}-{desktop1440,mobile390}-toolbar.png` | After toolbar |
| `docs/qa/references/v2-01-toolbar-parity/{bb,ac}-*-field-history.png` | History sheet from field control |
| `docs/qa/references/v2-01-toolbar-parity/toolbar-parity-manifest.json` | Metrics + SHA |

---

## 6. Environment / production

| Check | Result |
| --- | --- |
| Hosted BB `/healthz` | `d2ce78f3b260` · `moovex-platform-v8-testing` · `testing` |
| Hosted AC `/healthz` | `d2ce78f3b260` · match |
| Production `blessboard.com` | `03a89106e2fe` · `moovex-platform-production` |
| Migrations | None |
| Unrelated working-tree docs/scripts | Preserved untracked |

---

## FINAL VERDICT (repeat)

**`V2_01_SHARED_EDITOR_TOOLBAR_PARITY_PASS`**
