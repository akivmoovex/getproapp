# V2.01 Remaining Shared Editor UI Parity QA

**Task:** `V2_01_REMAINING_SHARED_EDITOR_UI_PARITY`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing`  
**Production:** **untouched** (`blessboard.com` `03a89106e2fe` / `moovex-platform-production`)

**Stitch:** Website Change Management System `projects/12538817760086591589`  
**Baseline skipped:** SP-T1 toolbar parity **PASS** at `d2ce78f3`  
**Final hosted tip after U1-A…D:** `fb0575a832d6`

**Personas:** disposable `bb-v8qa-mub23a6v6a6b` · `ac-v8-qa-mub23a6v6a6b`

**Rubric:** Layout 25 · Type/controls 20 · Interaction 25 · Responsive 20 · A11y 10  
**Before** = action-plan revised scores (`docs/qa/V2_01_STITCH_PARITY_ACTION_PLAN.md`) unless noted.

**Not changed (all checkpoints):** publishing services, media ownership, theme *data* registry contents / HQ–branch authorization, autosave claims.

---

## Overall verdict

| Checkpoint | Result | Hosted SHA (BB=AC) | Cache |
| --- | --- | --- | --- |
| **U1-A Field History** | **PASS** | `27504439770e` | `v2-u1a-history-1` |
| **U1-B Unpublished Changes** | **PASS** | `076312f7dd10` | `v2-u1b-panel-1` |
| **U1-C Edit Dialogs** | **PASS** | `08c6564e36f6` | `v2-u1c-dialogs-1` |
| **U1-D Theme Gallery** | **PASS** | `fb0575a832d6` | `v2-u1d-gallery-1` |

**`V2_01_REMAINING_SHARED_EDITOR_UI_PARITY_PASS`** on testing tip `fb0575a8`. Production unchanged. Scores are from hosted screenshots + Stitch refs, not unit tests alone.

---

## U1-A — Field History

### Result: **PASS** · SHA `27504439770e`

**Stitch:** desktop `3d0ca359…` · mobile `06f6fb04…`  
**Gap confirmed:** prior sheet titles used raw keys (`History · home.hero.heading`); choices lacked value previews.

**Implemented:** human `fieldLabel` titles; truncated current/draft/published previews on choices; mobile sheet densify; restore POST + conflict guards unchanged.

**Regression:** `tests/v2-01-field-history-restore.test.js` (+ asset cache companions) green.

### Scores (Screen 4)

| Product / viewport | Before | After |
| --- | --- | --- |
| BB desktop 1440 | 70 | **84** |
| BB mobile 390 | 68 | **82** |
| AC desktop 1440 | 71 | **85** |
| AC mobile 390 | 69 | **83** |

### Screenshots

| Path |
| --- |
| `docs/qa/references/v2-01-remaining-ui/u1a-history/bb-desktop1440-field-history.png` |
| `docs/qa/references/v2-01-remaining-ui/u1a-history/bb-mobile390-field-history.png` |
| `docs/qa/references/v2-01-remaining-ui/u1a-history/ac-desktop1440-field-history.png` |
| `docs/qa/references/v2-01-remaining-ui/u1a-history/ac-mobile390-field-history.png` |
| `docs/qa/references/v2-01-remaining-ui/u1a-history/u1a-manifest.json` |

### Remaining gaps

- Some labels still prefer template `description` when that is the registered human string (e.g. length hints) — not raw keys.
- Dense Stitch “revision timeline” chrome remains out of scope (simple sheet is the approved ref).

---

## U1-B — Unpublished Changes

### Result: **PASS** · SHA `076312f7dd10`

**Stitch:** mobile panel `d205f226…` · simple review `33660fcf…`  
**Gap confirmed:** hierarchy/empty polish + status strip toward Stitch; empty copy not always wired from panel model.

**Implemented:** page-group card hierarchy CSS; status strip (“Ready for public visitors” / “N pending edits verified”); emptyTitle/emptyBody wiring; 390 densify; reminder dismiss + publish/revert paths preserved.

**Regression:** `tests/v2-01-unpublished-changes-panel.test.js` (+ UIE/section/theme cache) green.

### Scores (Screen 3 / unpublished panel)

| Product / viewport | Before | After |
| --- | --- | --- |
| BB desktop 1440 | 64 | **80** |
| BB mobile 390 | 60 | **78** |
| AC desktop 1440 | 64 | **82** |
| AC mobile 390 | 60 | **80** |

### Screenshots

| Path | Notes |
| --- | --- |
| `…/u1b-panel/bb-desktop1440-empty.png` | Friendly empty state |
| `…/u1b-panel/bb-desktop1440-populated.png` | Page group + count |
| `…/u1b-panel/bb-mobile390-populated.png` | 390 sheet + sticky footer |
| `…/u1b-panel/ac-desktop1440-empty.png` | AC empty |
| `…/u1b-panel/ac-desktop1440-populated.png` | 2 Home changes |
| `…/u1b-panel/ac-mobile390-populated.png` | 390 hierarchy |
| `…/u1b-panel/u1b-panel-manifest.json` | Metrics + SHA |

### Remaining gaps

- Stitch “pages up to date” footer strip not added (secondary).
- Field title may surface template description rather than short label for some BB keys.
- Reminder modal not re-captured this checkpoint; dismiss/localStorage path unchanged and still wired.

---

## U1-C — Edit Dialogs

### Result: **PASS** · SHA `08c6564e36f6`

**Stitch:** Edit Content `32d4fc19…`  
**Gap confirmed:** 390 sheet density left Save/Cancel cramped on tall image/framing dialogs.

**Implemented:** `@media (max-width: 430px)` densify for field-editor head/body/foot + framing stage; sticky 2-col Cancel/Save; no image-picker or Adjust Picture behavior changes.

**Regression:** UIE + section + theme-infra asset tests green.

### Scores (Screen 2)

| Product / viewport | Before | After |
| --- | --- | --- |
| BB desktop 1440 | 62 | **74** |
| BB mobile 390 | 58 | **72** |
| AC desktop 1440 | 63 | **74** |
| AC mobile 390 | 58 | **70** |

### Hosted metrics (tip `08c6564e`)

All 8 cases: dialog body `scrollWidth == clientWidth`; Save + Cancel **in view**; framing present on image cases. AC page `overflowX` residual remains known `AC-WE-OVERFLOW` (public chrome), not dialog body overflow.

### Screenshots

| Path |
| --- |
| `docs/qa/references/v2-01-remaining-ui/u1c-dialogs/{bb,ac}-{desktop1440,mobile390}-{text,image}.png` |
| `docs/qa/references/v2-01-remaining-ui/u1c-dialogs/u1c-dialogs-manifest.json` |

### Remaining gaps

- Stitch multi-field “Edit Hero Section” studio modal is not the live WE01 single-field dialog (product decision — keep inline single-field editors).
- Image dialog still stacks Replace / Library / Adjust / Remove; usable at 390 with sticky footer, not pixel-identical to Stitch.

---

## U1-D — Theme Gallery

### Result: **PASS** · SHA `fb0575a832d6` (also final tip)

**Stitch:** gallery layout `2d53fd58…` (marketing packs / AAA claims = unsupported) · chooser `4a6f1807…`  
**Gap confirmed:** small previews; weak selection ring; desktop single-column cards; “Select Theme” wording.

**Implemented:** larger swatch previews; stronger draft/live selection indicators; 2-column desktop grid; Preview / Choose for draft actions; mobile full-width actions. Gallery continues to use `listSelectableThemesForProduct` only (`hasWorkingRenderer === true`). **No** unbuilt Stitch themes added.

**Regression:** `tests/v2-01-shared-theme-gallery.test.js` + theme-infra green.

### Scores (Screen 6)

| Product / viewport | Before | After |
| --- | --- | --- |
| BB desktop 1440 | 68 | **80** |
| BB mobile 390 | 66 | **78** |
| AC desktop 1440 | 70 | **82** |
| AC mobile 390 | 67 | **78** |

### Hosted metrics (tip `fb0575a8`)

| Product | Cards | Cross-product / Stitch-pack leak | Preview H (D/M) |
| --- | --- | --- | --- |
| BB | 2 (`bb.default`, `bb.contemporary-fellowship`) | **none** | 205 / 189 |
| AC | 2 (`ac.default`, `ac.family-wellness-mint`) | **none** | 205 / 189 |

### Screenshots

| Path |
| --- |
| `docs/qa/references/v2-01-remaining-ui/u1d-gallery/{bb,ac}-{desktop1440,mobile390}-gallery.png` |
| `docs/qa/references/v2-01-remaining-ui/u1d-gallery/u1d-gallery-manifest.json` |

### Remaining gaps

- Stitch healthcare pack names / “Full Image Sync 100%” / in-gallery D·M preview modal **not** implemented (by design — `THEME-PACKS-REST`).
- Preview opens draft URL with theme overlay (new tab), not the Stitch overlay modal.

---

## Commits (testing only)

| Checkpoint | Commit | Message |
| --- | --- | --- |
| U1-A | `27504439` | Humanize Field History titles and show value previews on choices. |
| U1-B | `076312f7` | Clarify Unpublished Changes panel hierarchy and empty state. |
| U1-C | `08c6564e` | Densify mobile field-editor sheets so Save/Cancel stay usable at 390px. |
| U1-D | `fb0575a8` | Polish theme gallery cards with larger previews and clearer draft actions. |

Each checkpoint: implement → BB+AC regression → commit → push `origin/V8` → wait `/healthz` SHA → hosted capture/score. Stop-on-failure protocol: no checkpoint continued over a broken deploy.

---

## Environment / production

| Check | Result |
| --- | --- |
| Testing BB `/healthz` | `fb0575a832d6` · `moovex-platform-v8-testing` · `schemaCompatible: true` |
| Testing AC `/healthz` | match |
| Production `blessboard.com` | `03a89106e2fe` · `moovex-platform-production` · **untouched** |
| Publishing / media ownership / theme IDs / HQ-branch auth | unchanged |

---

## Still open outside this task

- `SP-T6` BB HQ/branch card density · `SP-T7` Add Section picker polish  
- `AC-WE-OVERFLOW` residual public-chrome overflow while editing  
- `THEME-PACKS-REST` additional Stitch theme packs (deferred)  
- Hostinger Package A / NPROC (infra, not editor UI)
