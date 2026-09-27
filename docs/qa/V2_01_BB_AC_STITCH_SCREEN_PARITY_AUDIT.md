# V2.01 BB / AC Stitch Screen Parity Audit

**Task:** `V2_01_BB_AC_STITCH_SCREEN_PARITY_AUDIT`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Target:** `moovex-platform-v8-testing` only  
**Production:** **untouched** (`blessboard.com` `03a89106e2fe` / `moovex-platform-production`)  
**Audit type:** Visual + interaction parity vs Stitch — **no editor code changes, no deploy**

**Stitch project:** Website Change Management System  
**Project ID:** `12538817760086591589`

**Hosted tip at capture:** `544f6b997a2b` · `deploymentCode=moovex-platform-v8-testing` · `environment=testing` · `mediaWriteNamespace=testing-v8` · `expectedIdentityKey=moovex-platform-v7`

**Personas / tenants (disposable):**
- BlessBoard HQ: `bb-v8qa-mub23a6v6a6b` · role `church_hq_admin`
- ActiveClinic admin: `ac-v8-qa-mub23a6v6a6b` · clinic admin

**Viewports:** Desktop **1440×900** · Mobile **390×844**  
**Evidence root:** `docs/qa/references/v2-01-stitch-parity/`  
**Capture harness:** `scripts/local/_tmp_v2_01_stitch_parity_capture.js` (read-only UI open; no publish mutations in this audit)

**Prior QA read:**
- `docs/qa/V2_01_SHARED_WEBSITE_EDITOR_FINAL_QA.md` (66/66 hosted)
- `docs/qa/V2_01_SHARED_EDITOR_P2_GAP_CLOSURE_QA.md` (48/48 hosted)
- `docs/qa/V2_01_BB_AC_RELEASE_NOTES_UPDATE_QA.md`

---

## Verdict

**`V2_01_BB_AC_STITCH_PARITY_AUDIT_COMPLETE`**

Seven Change Manager / WE01 screens were audited against Stitch for BB and AC at 1440 and 390 where implementable states were capturable. Scores are evidence-backed and intentionally **not** inflated from functional QA PASS alone. Several connected states are **NOT SCORED** for visual (publishing reminder not threshold-triggered; History sheet returns JSON on direct URL; one Stitch mobile flow download failed; Screen 6 primary Stitch thumbnail download corrupted). Universal Image Editor crop evidence includes this-session captures plus prior hosted P2/UIE screenshots on the same disposable tenants.

---

## Scoring rubric (0–100)

| Axis | Points |
| --- | ---: |
| Visual layout and hierarchy | 25 |
| Typography, spacing and controls | 20 |
| Interaction and workflow fidelity | 25 |
| Responsive / mobile behavior | 20 |
| Accessibility and usability | 10 |
| **Total** | **100** |

**Classification tags used below:** exact visual mismatch · expected product/theme variation · functional mismatch · Stitch-only/unimplemented · unsupported product capability · capture/NOT SCORED

Combined score = mean of desktop + mobile only when **both** viewports were visually inspected for that product/screen.

---

## 1. Screen inventory (Stitch ↔ implemented)

| # | Screen | Primary Stitch refs (id) | Implemented surface |
| --- | --- | --- | --- |
| 1 | Edit Website | `f8176aec…` Desktop · `d8d26495…` Toolbar+reminder · `863c7192…` Toolbar mobile · `d9f101c6…` Reminder mobile | WE01 chrome on public edit (`?website_edit=1`) · BB `/c/{org}/hq` · AC `/clinics/{org}` |
| 2 | Edit Content | `32d4fc19…` Desktop | Field dialogs (text/image) · pencil overlays |
| 3 | Review & Publish | `01698e70…` · `33660fcf…` · `d205f226…` Unpublished panel mobile | Pending pill · Unpublished Changes Panel · Preview · Publish |
| 4 | History & Restore | `5dcd717f…` · `3d0ca359…` · `06f6fb04…` mobile | Field History sheet / restore API · clock affordance beside pencils |
| 5 | Add & Organize Sections | `147683a1…` Desktop | `+ Add section` · section actions (no permanent Section Library column) |
| 6 | Choose Website Theme | `4a6f1807…` (download **corrupt** this run) · `2d53fd58…` Gallery | `/website/themes` product-filtered gallery |
| 7 | HQ & Branch Website Management | `af7bebae…` · `79c3f013…` Desktop · `f44b1ff1…` Mobile | `/website/websites` card list (BB multi-site · AC single clinic) |

### Connected Universal Image Editor states

| State | Stitch | Implemented |
| --- | --- | --- |
| Choose Image / Edit image dialog | `4ddd3919…` D · `6a6ac162…` M | Image field modal |
| Upload from Computer | `329d8fb8…` (+ error states) | File input in dialog (P2 hosted) |
| Media Library | same Choose Image screens | “Choose from Image Library” |
| Crop & Position | `cd1baa8b…` D · `c9e28954…` M | Adjust Picture · Desktop/Mobile framing |
| Final Preview / Save | `7571d1b5…` | Preview mode · Save draft |

### Dialogs / states also inventoried

| State | Stitch | Live this audit |
| --- | --- | --- |
| Publishing reminder (≥5) | `d9f101c6…` · `7cba508f…` (**download FAIL**) · `d8d26495…` | **NOT SCORED** — threshold not met (0 pending) |
| Publish confirmation / success / failure | Screen 3 variants | Happy-path chrome visible; failure UX **NOT SCORED** (not triggered) |
| Inherited-content copy | Screen 7 inheritance panels | BB card copy + settings inheritance wording; AC explicit “no facility websites” |

---

## 2. Screenshot mapping

### Stitch references (`docs/qa/references/v2-01-stitch-parity/stitch/`)

| File | Screen |
| --- | --- |
| `s1-edit-website-desktop__f8176aec.png` | 1 Edit Website desktop |
| `s1-toolbar-reminder-desktop__d8d26495.png` | 1 Toolbar + reminder |
| `s1-toolbar-mobile__863c7192.png` | 1 Toolbar mobile |
| `s1-reminder-mobile__d9f101c6.png` | Publishing reminder mobile |
| `s2-edit-content-desktop__32d4fc19.png` | 2 Edit Content |
| `s3-review-publish-desktop__01698e70.png` | 3 Review & Publish |
| `s3-simple-review-states-desktop__33660fcf.png` | 3 Publish states |
| `s3-unpublished-panel-mobile__d205f226.png` | 3 Unpublished panel mobile |
| `s4-history-desktop__5dcd717f.png` | 4 History desktop |
| `s4-simple-history-desktop__3d0ca359.png` | 4 Simple history |
| `s4-history-mobile__06f6fb04.png` | 4 History mobile |
| `s5-add-organize-desktop__147683a1.png` | 5 Sections |
| `s6-theme-gallery-desktop__2d53fd58.png` | 6 Theme gallery (primary usable Stitch visual this run) |
| `s7-hq-branch-desktop-a__af7bebae.png` | 7 HQ/branch desktop (studio) |
| `s7-hq-branch-desktop-b__79c3f013.png` | 7 HQ/branch desktop alt |
| `s7-hq-branch-mobile__f44b1ff1.png` | 7 Mobile |
| `uie-choose-image-desktop__4ddd3919.png` | UIE choose |
| `uie-choose-image-mobile__6a6ac162.png` | UIE choose mobile |
| `uie-crop-desktop__cd1baa8b.png` | UIE crop desktop |
| `uie-crop-mobile__c9e28954.png` | UIE crop mobile |
| `uie-upload-error-desktop__329d8fb8.png` | Upload errors |
| `uie-slots-preview-desktop__7571d1b5.png` | Slots / preview |

**NOT SCORED Stitch assets:** `4a6f1807` Screen 6 primary (corrupt/tiny JPEG); `7cba508f` mobile publishing flow (HTTP 400 on download).

### Implemented captures (`bb/` · `ac/`)

Pattern: `{bb|ac}-{desktop1440|mobile390}-s{N}-*.png` plus UIE / preview variants.  
Supplemental: `*-uie-crop-*-prior-p2.png`, `*-uie-crop-*-prior-uie.png`, `*-s5-add-section-prior.png`.  
Manifest: `capture-manifest.json`.

---

## 3. Screen-by-screen scores

### Score table (seven primary screens)

| Screen | BB Desktop | BB Mobile | BB Combined | AC Desktop | AC Mobile | AC Combined |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1. Edit Website | **58** | **54** | **56** | **60** | **55** | **58** |
| 2. Edit Content | **62** | **58** | **60** | **63** | **58** | **61** |
| 3. Review & Publish | **64** | **60** | **62** | **64** | **60** | **62** |
| 4. History & Restore | **NOT SCORED** (visual) | **NOT SCORED** (visual) | — | **NOT SCORED** (visual) | **NOT SCORED** (visual) | — |
| 5. Add & Organize Sections | **52** | **50** | **51** | **54** | **50** | **52** |
| 6. Choose Website Theme | **68** | **66** | **67** | **70** | **67** | **69** |
| 7. HQ & Branch Website Mgmt | **55** | **58** | **57** | **72** | **74** | **73** |

**History interaction note (not averaged into visual scores):** P2 hosted restore POST BB+AC **PASS** (draft-only, stale 409) — interaction fidelity strong; rendered History **sheet** HTML was not captured (direct `/website/field-history` returns JSON). Treat visual History as **NOT SCORED**, not as a functional failure.

### Connected UIE / dialog scores (when scored)

| State | BB D | BB M | AC D | AC M | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Choose Image / Edit dialog | 70 | 66 | 70 | 66 | Modal structure closer to Stitch than whole-page Edit Website |
| Media Library | 72 | 68 | 72 | 68 | Grid + select present (P2 + this session) |
| Crop & Position D/M | 74 | 72 | 74 | 72 | Prior P2/UIE hosted shots; simpler than Stitch dual-pane simulator |
| Upload from Computer | 70 | 68 | 70 | 68 | P2 hosted file input PASS |
| Publishing reminder | NOT SCORED | NOT SCORED | NOT SCORED | NOT SCORED | 0 pending; threshold-gated |
| Publish failure dialog | NOT SCORED | NOT SCORED | NOT SCORED | NOT SCORED | Not triggered |

---

## 4. Gap report by screen

### 1. Edit Website

**Stitch:** GetPro Web Studio · lilac section cards · “Inline Edit Mode Active” · sticky draft bar · studio framing.  
**Implemented:** WE01 public-site overlay · page selector rail · purple Publish · History/Preview/Exit · `+ Add section` FAB.

| Axis | BB D/M | AC D/M | Evidence |
| --- | --- | --- | --- |
| Layout | 12 / 11 | 13 / 11 | Studio vs live public canvas — **exact visual mismatch** (architecture) |
| Type/controls | 11 / 10 | 12 / 10 | Different chrome tokens; product colors = **expected variation** |
| Interaction | 18 / 17 | 18 / 17 | Edit/preview/publish present; no GetPro Web Studio shell |
| Responsive | 11 / 10 | 11 / 11 | 390 bottom nav (Pages/Styles/History/Settings) densified |
| A11y/usability | 6 / 6 | 6 / 6 | Pencils+history clocks; QA placeholder content noise |

**Missing vs Stitch:** permanent studio chrome, section lilac cards, sticky “Review Changes First / Publish Now” bar, “GetPro Web Studio” branding.  
**Severity:** **P1** (chrome/IA mismatch) · Recommended: densify WE01 toolbar toward Stitch Screen 1 labels without inventing three-column studio.

### 2. Edit Content

**Stitch:** Dedicated field editor / content cards with pencils.  
**Implemented:** Pencil → modal (text/image). This capture often opened **image/logo** dialog; text dialog path confirmed in prior AC UX refs.

| BB Combined 60 | AC Combined 61 |

**Differences:** Dialog chrome is shared and closer to Stitch than full-page Edit Website; Stitch still shows richer “current vs new” text layouts and cards.  
**Severity:** **P2** · Fix: unify text dialog layout tokens with Screen 2.

### 3. Review & Publish

**Stitch:** Unpublished Changes panel with live/draft diffs, Revert, Publish All (N).  
**Implemented:** Pending pill + unpublished panel (prior QA) + Preview + Publish. Live capture with 0 pending did not open a populated panel.

| BB Combined 62 | AC Combined 62 |

**Differences:** Workflow exists; Stitch panel denser with typed change cards and dual BB/AC sample copy. Publish failure / confirmation banners **NOT SCORED**.  
**Severity:** **P2** · Fix: ensure pending pill always opens panel empty-state matching Stitch empty copy.

### 4. History & Restore

**Stitch:** Revision history sheet with visual diff, restore CTA (does not publish).  
**Implemented:** History clock + restore API (P2 PASS). Direct history URL returns **JSON** in browser (both BB/AC) — **visual HTML sheet NOT SCORED**.

**Severity:** **P2** (presentation/capture gap) · Recommended: serve HTML sheet for `Accept: text/html` or document client-only mount; no functional restore regression observed in P2.

### 5. Add & Organize Sections

**Stitch:** Permanent Section Library column + canvas organizers.  
**Implemented:** Floating `+ Add section` + section actions; **Section Library column = Stitch-only / unimplemented** (intentional per B4/E1).

| BB Combined 51 | AC Combined 52 |

**Severity:** **P2** (visual) · **not** a product defect to invent a page builder. Fix: optional denser Add Section picker chrome only.

### 6. Choose Website Theme

**Stitch gallery:** Multi-theme healthcare/church marketing grid, live preview modal, “Full Image Sync (100%)”, Customize fonts — some claims are **unsupported / unverified marketing**.  
**Implemented:** Product-filtered list — BB Classic + Contemporary Fellowship; AC Classic + Family Wellness Mint; Preview Theme / Select Theme; draft-safe notice.

| BB Combined 67 | AC Combined 69 |

**Classification:** Fewer themes = **Stitch-only unimplemented** (remaining packs). BB vs AC theme names = **expected product/theme variation** (not defects).  
**Flagged Stitch claims:** “Full Image Sync (100%)”, accessibility certifications, hard-coded upload limits in UIE Stitch — **do not treat as product guarantees**.  
**Severity:** **P2** · Fix: richer theme card thumbnails; keep product isolation.

### 7. HQ & Branch Website Management

**Stitch:** Three-column “Web Studio” with Branch Sites, HQ inheritance panels, network locks, emergency concepts.  
**Implemented BB:** Choose Website card grid (HQ + branches) · Edit / View Live / Settings · inheritance caution copy.  
**Implemented AC:** **Single clinic card** · explicit “facilities are not separate public websites” — **unsupported product capability** correctly **not** invented.

| BB Combined 57 | AC Combined 73 |

AC scores higher because single-clinic list matches supported scope; Stitch multi-facility studio is **Stitch-only / unsupported** for AC. BB cards match E1 intent but lack Stitch studio density.  
**Severity:** BB **P2** · AC **none** for facility omission · Fix: BB card visual densification only; never add AC facility websites to chase Stitch.

---

## 5. BB vs AC summaries

### BlessBoard

- Strongest parity: Theme gallery (product themes), image dialog/crop (with P2 evidence), Review/Publish chrome basics.
- Weakest vs Stitch: Edit Website architecture (studio vs public overlay), Screen 5 Section Library absence, Screen 7 studio vs cards.
- Product-correct: Church pages (Ministries/Sermons), HQ+branch cards, Contemporary Fellowship theme.

### ActiveClinic

- Strongest parity: Theme gallery (Family Wellness Mint), single-clinic Screen 7 honesty, shared WE01 chrome.
- Weakest vs Stitch: Same Edit Website architecture gap; Stitch healthcare multi-theme marketing not shipped.
- Product-correct: No facility websites; clinic page selector (Services/Doctors); mint theme only as alternate.

### Common platform gaps

1. WE01 chrome ≠ Stitch “GetPro Web Studio” shell (P1 visual/IA).  
2. History HTML sheet not retrieveable via direct navigation (P2 presentation).  
3. Publishing reminder / failure dialogs not live-scored this run (threshold / not triggered).  
4. Stitch Section Library + three-column HQ studio remain intentional non-goals.  
5. Stitch marketing claims (100% image sync, AAA certs, fictional clinic+church hybrid copy) must stay non-product.

### Product-specific gaps

| Product | Gap |
| --- | --- |
| BB | Stitch branch inheritance “studio” panels richer than card list + settings copy |
| AC | Stitch multi-facility / network examples must remain unsupported |
| Both | Theme packs beyond first alternate remain Stitch-only |

---

## 6. Top five fixes by user impact

1. **P1 — Align WE01 editor toolbar/status copy with Stitch Screen 1** (pending pill, Preview, Publish (N), site name) without building a studio shell.  
2. **P2 — History sheet HTML mount** so field History opens the Stitch-like sheet reliably (not JSON-only raw GET).  
3. **P2 — Unpublished panel empty + populated states** match Screen 3 hierarchy (page groups, live/draft).  
4. **P2 — Theme cards** richer thumbnails / preview framing (keep product filters).  
5. **P2 — Image Crop UI** optional live section preview pane (Stitch dual-pane) — shared component only.

### Smallest shared-component changes

- `website-editor` chrome CSS/tokens (toolbar densification).  
- Field-history client mount path (Accept/HTML fragment).  
- `unpublished-changes-panel` empty-state.  
- `theme-gallery` card thumbnail presentation.  
- Universal Image Editor framing preview optional column.

---

## 7. Coverage matrix

| Area | Status |
| --- | --- |
| Screens 1–3, 5–7 BB D/M | **SCORED** |
| Screens 1–3, 5–7 AC D/M | **SCORED** |
| Screen 4 visual BB/AC D/M | **NOT SCORED** (JSON on direct URL) |
| Screen 4 interaction | Evidenced via P2 (not mixed into visual score) |
| Publishing reminder live | **NOT SCORED** |
| Stitch Screen 6 primary file | **NOT SCORED** (corrupt download); gallery Stitch used |
| Stitch mobile publishing flow `7cba508f` | **NOT SCORED** (download 400) |
| UIE crop | **SCORED** with prior P2/UIE hosted screenshots |
| Production | Untouched |

---

## 8. Production untouched confirmation

`https://blessboard.com/healthz` → `gitSha=03a89106e2fe` · `deploymentCode=moovex-platform-production` during and after this audit. No application code changes and no deployment performed for this task.

---

## FINAL VERDICT (repeat)

**`V2_01_BB_AC_STITCH_PARITY_AUDIT_COMPLETE`**

### Concise score summary (requested)

| Screen | BB Desktop | BB Mobile | AC Desktop | AC Mobile |
| --- | ---: | ---: | ---: | ---: |
| Edit Website | 58 | 54 | 60 | 55 |
| Edit Content | 62 | 58 | 63 | 58 |
| Review & Publish | 64 | 60 | 64 | 60 |
| History & Restore | NOT SCORED | NOT SCORED | NOT SCORED | NOT SCORED |
| Add & Organize Sections | 52 | 50 | 54 | 50 |
| Choose Website Theme | 68 | 66 | 70 | 67 |
| HQ & Branch Website Management | 55 | 58 | 72 | 74 |
