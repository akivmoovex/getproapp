# V2.01 SP-T7 — Add Section picker polish QA

**Task:** `V2_01_SP_T7_IMPLEMENTATION`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Hosted tip:** `0d28e3289dae` · `moovex-platform-v8-testing` (BB=AC)  
**Production:** **untouched** · `03a89106e2fe` · `moovex-platform-production`  
**Cache:** `website-add-section.css|js?v=v2-spt7-picker-1` (BB) · AC `ASSET_VERSION=v2-spt7-picker-1`

**Stitch:** Website Change Management System `projects/12538817760086591589` · Screen 5 `147683a1ada04a5c9179aac66e5158d7`

---

## Exact SP-T7 requirement (from action plan)

Quoted from `docs/qa/V2_01_STITCH_PARITY_ACTION_PLAN.md` § ordered tasks:

> | 7 | `SP-T7` | Section management | Polish Add Section picker sheet only — **no** Section Library column | Add Section still draft-only |

Supporting gap row (same plan):

> | 5 | Add Section picker chrome densification | **B** | `views/platform/website-engine/add-section-picker.ejs` · `public/platform/website-add-section.css` |

Screen 5 compare scope (same plan):

> Partial — compare **Add Section / reorder** only · Permanent **Section Library column** = unsupported Stitch-only

**Confirmed still OPEN** before this change: overnight summary + master audit listed SP-T7 OPEN; tip before commit lacked densified picker (plain stacked buttons, no draft badge / icons / Add affordance).

---

## Verdict

**`V2_01_SP_T7_PASS`**

Shared WE01 Add Section picker densified for BB+AC at 1440/390. No Section Library column. Add remains draft-only (reload after POST; Publish unchanged). Production untouched.

---

## What changed

| File | Change |
| --- | --- |
| `public/platform/website-add-section.css` | Sheet densify, grabber @390, option cards, draft badge styles |
| `public/platform/website-add-section.js` | Icon + body + “+ Add” option chrome; HTML escape |
| `views/platform/website-engine/add-section-picker.ejs` | Draft badge + clearer draft intro |
| BB shells + AC `renderActiveClinicPublic.js` | Cache `v2-spt7-picker-1` |
| Tests | Asset version assertions |

**Not changed:** section registry types, add/reorder/hide APIs, publishing, media, history, themes, scope list, DB migrations, Web Studio / library column.

---

## Automated regression

```text
tests/v2-01-shared-section-management.test.js
tests/v2-01-shared-theme-infra.test.js
tests/v2-01-field-history-restore.test.js
tests/v2-01-unpublished-changes-panel.test.js
tests/v2-01-universal-image-editor.test.js
tests/v2-01-bb-hq-branch-websites.test.js
→ 39 tests · 36 pass · 0 fail · 3 skipped (field-history service DB fixture)
```

(Unrelated pre-existing `wave4b2` static `orderedTeaserKeys` assertion fail — not SP-T7.)

---

## Hosted browser QA (`0d28e328`)

| Check | BB | AC |
| --- | --- | --- |
| CSS `v2-spt7-picker-1` | **yes** | **yes** |
| Draft badge | **yes** | **yes** |
| Option icons + Add actions | 4 / 4 | 3 / 3 |
| Panel fits viewport (1440 & 390) | **yes** | **yes** |
| Section Library / template search | **absent** | **absent** |
| Types (registry) | Text / Image / Image+Text / CTA | Text / Image+Text / CTA |

Artifact: `docs/qa/references/v2-01-spt7-picker/spt7-manifest.json`

---

## Matched screenshots

| Role | Path |
| --- | --- |
| Stitch Screen 5 (library = unsupported) | `docs/qa/references/v2-01-spt7-picker/stitch-s5-add-organize-desktop__147683a1.png` |
| BB desktop picker | `…/bb-desktop1440-add-section-picker.png` |
| BB mobile 390 sheet | `…/bb-mobile390-add-section-picker.png` |
| AC desktop picker | `…/ac-desktop1440-add-section-picker.png` |
| AC mobile 390 sheet | `…/ac-mobile390-add-section-picker.png` |

**Parity note:** Stitch Frame 5 is a two-column studio (Current sections + Add Pre-Designed). Product compare is **Add Section picker chrome only** (right-column card intent). Library / search / category pills remain **D — do not build**.

---

## Before / after parity scores (Screen 5 Add Section chrome)

Rubric unchanged (Layout 25 · Type/controls 20 · Interaction 25 · Responsive 20 · A11y 10).  
**Before** = action-plan / audit combined scores for Screen 5.

| Product / viewport | Before | After | Notes |
| --- | ---: | ---: | --- |
| BB desktop 1440 | 52 | **72** | Card densify + draft badge; no library (intentional) |
| BB mobile 390 | 50 | **74** | Bottom sheet + grabber; options usable |
| AC desktop 1440 | 54 | **73** | Same shared chrome |
| AC mobile 390 | 50 | **74** | Same |
| Combined BB / AC (approx) | 51 / 52 | **73 / 73** | Cap remains below studio Stitch due to **D** library |

---

## Remaining gaps (not SP-T7)

- Permanent Section Library column / template catalog — **unsupported**  
- Drag-reorder canvas from Stitch left column — existing `…` menus / move APIs (out of SP-T7)  
- SP-VIS-REMINDER / SP-VIS-PUBFAIL — separate

---

## Production

| Check | Result |
| --- | --- |
| `blessboard.com` `/healthz` | `03a89106e2fe` · `moovex-platform-production` |
| Mutations | **None** |

---

## FINAL VERDICT (repeat)

**`V2_01_SP_T7_PASS`** on testing tip `0d28e328`. Shared Add Section picker polished; draft-only preserved; no library column; production untouched.
