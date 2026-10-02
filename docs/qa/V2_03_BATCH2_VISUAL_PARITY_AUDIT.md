# V2.03 Batch 2 — Stitch Visual Parity Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH2_VISUAL_PARITY_AUDIT` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Stitch project** | [ActiveClinic V2.03 Batch 2](https://stitch.withgoogle.com/projects/7300898757945019896) (`7300898757945019896`) |
| **Frozen tokens** | `public/activeclinic/ac-app-tokens.css` (authoritative) |
| **Mode** | Visual-only — no business logic, schema, or route redesign |
| **Verdict** | `V2_03_BATCH2_STITCH_PARITY_PASS` |

---

## Method

1. Inventory AC-B2-01…10 desktop + 390px companions from frozen Stitch HTML/theme.
2. Compare shared staff chrome + `gp-ops-*` primitives against Stitch shell cues and frozen tokens.
3. Fix **shared** discrepancies only (shell + gp-ops + common panel/button radii).
4. Measure a chrome fixture with Playwright at **1280px** and **exactly 390px**.
5. Classify each screen: **EXACT/NEAR-EXACT**, **ACCEPTABLE FUNCTIONAL DIFFERENCE**, or **REMAINING GAP**.

Frozen tokens override Material Theme Generator dumps where they diverge (e.g. Stitch theme `primary: #004ac6` vs frozen `--ac-primary: #2563eb`; `primary-container` in Stitch already maps to `#2563eb`).

---

## Shared chrome (all Batch 2 screens)

| Check | Stitch cue | Implemented (post-fix) | Result |
|-------|------------|---------------------------|--------|
| Sidebar width | `w-64` = 256px | `--ac-staff-sidebar-w: 256px` (measured 256px @1280) | NEAR-EXACT |
| Top bar | `h-14` = 56px | `--ac-staff-topbar-h: 56px` | NEAR-EXACT |
| Mobile bottom nav height | `h-14` = 56px | Frozen `--ac-staff-bottom-nav-h: 64px` (touch) | ACCEPTABLE FUNCTIONAL DIFFERENCE |
| Primary color | `#2563eb` / primary-container | `#2563eb` (measured `rgb(37,99,235)`) | NEAR-EXACT |
| Font | Inter | Inter via `--ac-font` / gp-ops | NEAR-EXACT |
| Active nav / bottom tab | `text-primary` blue | Was teal; fixed to `--ac-primary` / `--ac-primary-soft` | NEAR-EXACT (fixed) |
| Primary buttons | `rounded-lg` (~8px) | Was pill; fixed to `var(--ac-radius)` 8px | NEAR-EXACT (fixed) |
| Cards / panels | `rounded-xl` (~12px) | `--ac-radius-card: 12px` (override was sm; fixed) | NEAR-EXACT (fixed) |
| gp-ops radii / font | lg/xl + Inter | Were 4px/8px + system-ui; fixed to 8px/12px + Inter | NEAR-EXACT (fixed) |
| Status tab touch | Filter chips | Were ~30px tall; `min-height` 2.5rem / 44px @mobile | NEAR-EXACT (fixed) |
| Touch targets @390 | ≥44px | Buttons/inputs/bottom items ≥44px measured | NEAR-EXACT |

### Playwright fixture (@1280 / @390)

Measured `/tmp/b2-parity-fixture.html` loading production CSS:

- Tokens: primary `#2563eb`, sidebar `256px`, topbar `56px`, bottom `64px`, card radius `12px`, control radius `8px`.
- Active nav + bottom item: primary blue.
- Primary/secondary buttons: 8px radius; @390 min-height 44px.
- Cards: 12px radius; @390 content width ~358px inside 390 viewport.
- Bottom nav inner height: 64px @390 (token-authoritative vs Stitch 56px).

---

## Per-screen report

### AC-B2-01 — Staff Dashboard

| Viewport | Classification | Notes |
|----------|----------------|-------|
| Desktop `ed2ef3ac…` | **NEAR-EXACT** | Shared shell + KPI/card tokens; domain widgets remain AC operational data (not Stitch demo density). |
| Mobile `2cb0ef95…` | **NEAR-EXACT** | Bottom nav uses frozen 64px; active color now primary. |

**ACCEPTABLE FUNCTIONAL DIFFERENCE:** Stitch demo metrics/widgets vs live dashboard KPIs from existing services.  
**REMAINING GAP:** Pixel-perfect widget collage / decorative Material icons rows not mirrored where no product widget exists.

---

### AC-B2-02 — Patients List

| Viewport | Classification | Notes |
|----------|----------------|-------|
| Desktop `04c24f7d…` | **NEAR-EXACT** | List/filter/badge/table via shared + gp-ops chrome; dual Batch1 markers retained. |
| Mobile `ccb2201f…` | **NEAR-EXACT** | Card stack + 390 filter wrap; touch targets via shared controls. |

**ACCEPTABLE FUNCTIONAL DIFFERENCE:** Directory columns/actions limited to existing patient model (no Stitch-only clinical columns).  
**REMAINING GAP:** None blocking shared visual system.

---

### AC-B2-03 — Patient Profile / Summary

| Viewport | Classification | Notes |
|----------|----------------|-------|
| — | **ACCEPTABLE FUNCTIONAL DIFFERENCE** | **Absent from frozen Stitch inventory** (map §1). No Batch 2 visual target. |

**REMAINING GAP:** N/A until Stitch adds a profile screen.

---

### AC-B2-04 — Appointments

| Viewport | Classification | Notes |
|----------|----------------|-------|
| Desktop `6bf6da61…` | **NEAR-EXACT** | Shared filter/table/status chrome; calendar remains AC calendar surface. |
| Mobile `b7ccd0f7…` | **NEAR-EXACT** | Card list + shared badges. |

**ACCEPTABLE FUNCTIONAL DIFFERENCE:** Status vocabulary and actions follow existing appointment APIs, not Stitch demo labels.  
**REMAINING GAP:** Dense Stitch calendar chrome flourishes not duplicated where calendar already ships AC layout.

---

### AC-B2-05 — Appointment Detail

| Viewport | Classification | Notes |
|----------|----------------|-------|
| Desktop `abc9994a…` | **NEAR-EXACT** | Timeline/badge/card shared primitives; RBAC-gated actions only. |
| Mobile `2621d934…` | **NEAR-EXACT** | Stacked sections; sticky action patterns use shared buttons. |

**ACCEPTABLE FUNCTIONAL DIFFERENCE:** History/timeline events from real audit/status transitions.  
**REMAINING GAP:** None for visual system; Stitch-only side panels without backend stay omitted.

---

### AC-B2-06 — Clinical Encounter

| Viewport | Classification | Notes |
|----------|----------------|-------|
| Desktop `b3d17678…` | **NEAR-EXACT** | Encounter workspace uses shared shell + status badges; clinical layout remains AC-specific. |
| Mobile `f0a06faa…` | **NEAR-EXACT** | Footer actions / 390 stacking; touch-safe controls. |

**ACCEPTABLE FUNCTIONAL DIFFERENCE:** Clinical steps, vitals, and notes are product workflows — not Stitch marketing composition.  
**REMAINING GAP:** Pixel-identical multi-column Stitch collage where clinical IA differs by design (documented earlier as AC-specific).

---

### AC-B2-07 — Pharmacy

| Viewport | Classification | Notes |
|----------|----------------|-------|
| Desktop `a587c5c7…` | **NEAR-EXACT** | Hub + queue use `gp-ops` filter/tabs/table/badges; ops-queue header pattern. |
| Mobile `e1162b52…` | **NEAR-EXACT** | Queue cards @390; shared bottom nav. |

**ACCEPTABLE FUNCTIONAL DIFFERENCE:** Queue statuses/actions from pharmacy domain only.  
**REMAINING GAP:** Stitch decorative KPI art not invented without metrics.

---

### AC-B2-08 — Diagnostics

| Viewport | Classification | Notes |
|----------|----------------|-------|
| Desktop `07d08d75…` | **NEAR-EXACT** | Hub + lab/rad queues share ops-queue + gp-ops chrome. |
| Mobile `f092ae13…` | **NEAR-EXACT** | Modality cards/queues @390. |

**ACCEPTABLE FUNCTIONAL DIFFERENCE:** Lab vs radiology permission split preserved (not Stitch combined fake queue).  
**REMAINING GAP:** None blocking.

---

### AC-B2-09 — Billing & Invoices

| Viewport | Classification | Notes |
|----------|----------------|-------|
| Desktop canonical `29257b0d…` | **NEAR-EXACT** | Operational header, KPI cards, filters, table, paid/balance badges. Alt desktop `ed8508e6…` treated as near-variant. |
| Mobile canonical `24632347…` | **NEAR-EXACT** | Invoice cards @390; collect actions RBAC-gated. Alt mobile `e36ead2e…` near-variant. |

**ACCEPTABLE FUNCTIONAL DIFFERENCE:** No claims/CMS-1500/insurance adjudication UI (no backend). Cashier collect stays permission-gated.  
**REMAINING GAP:** Stitch “claims / front desk copay” segments not built — product/data gap, not visual token gap.

---

### AC-B2-10 — Departments & Facilities

| Viewport | Classification | Notes |
|----------|----------------|-------|
| Desktop `fb88329a…` | **NEAR-EXACT** | Facility switcher, KPIs from real counts, dept table/drawer, shared filters/badges. |
| Mobile `4c70614f…` | **NEAR-EXACT** | Department cards @390; drawers use shared form-drawer pattern. |

**ACCEPTABLE FUNCTIONAL DIFFERENCE:** Facilities catalogue remains `/app/facilities`; departments remain clinic-setup — composed, not merged into one backend.  
**REMAINING GAP (documented in UI, not invented):** clinical lead, room counts, wing/floor/pod, Stitch-style `DPT-…` codes beyond `department_key`.

---

## Fixes applied this pass (shared only)

| Change | Where |
|--------|--------|
| Active sidebar / drawer / bottom-nav color → primary blue | `public/activeclinic/ac-app.css` |
| Primary/secondary buttons → 8px radius; secondary uses primary-soft (not teal) | `ac-app.css` |
| Panels/cards → 12px card radius (Phase 7C override corrected) | `ac-app.css` |
| gp-ops radii 8/12 + Inter; status-tab min-height / 44px mobile; accent badge → primary blue | `public/platform/gp-ops-shared.css` |
| Shell asset cache bust | `SHELL_ASSET_VERSION = v2-03-b2-parity-01` |
| Shell test asserts primary active nav + button radius + gp-ops radius | `tests/activeclinic-batch2-shell.test.js` |

No page-local CSS patches. No schema/route/business-logic changes.

---

## Residual intentional differences (not blockers)

1. **Bottom nav 64px vs Stitch 56px** — frozen touch token wins.  
2. **Material Theme Generator secondary greens / slate `#0F172A`** — normalized to ODS neutrals per Batch1/Batch2 reconciliation.  
3. **Stitch demo data density / decorative iconography** — omitted when not backed by product data.  
4. **AC-B2-03** — no Stitch screen.

---

## Verdict

Shared shell and ops primitives now match frozen Batch 2 Stitch geometry/color/radius/typography at desktop and 390px within token authority. Per-screen layouts remain NEAR-EXACT with documented acceptable functional differences and non-blocking remaining gaps.

**`V2_03_BATCH2_STITCH_PARITY_PASS`**
