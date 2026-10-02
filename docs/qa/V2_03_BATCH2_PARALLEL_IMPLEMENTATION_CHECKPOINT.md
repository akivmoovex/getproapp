# ActiveClinic V2.03 — Batch 2 Parallel Implementation Checkpoint

| Field | Value |
| --- | --- |
| **Doc ID** | `V2_03_BATCH2_PARALLEL_IMPLEMENTATION_CHECKPOINT` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **HEAD (audit)** | `27d4021147c0e03fd3c724ea47081a1e1a00ef17` |
| **origin/V10** | `802912259ab0fdea48fe0a3b6596e3a4b2080383` |
| **Stitch (Batch 2)** | `7300898757945019896` |
| **Audit mode** | READ-ONLY (no code/git mutations except this doc) |
| **Verdict** | `PAUSE_BATCH2_UNTIL_BATCH1_CHECKPOINT` |

---

## 1. Current Batch 2 progress

### A. Prompts/tasks completed (this tab)

1. **Implementation contract** — accepted governing rules (reuse, no backend rewrite for UI, frozen tokens).
2. **Gap audit / Stitch map** — `docs/v2.03/V2_03_BATCH2_STITCH_IMPLEMENTATION_MAP.md` (committed with shell).
3. **Responsive staff shell** — commit `daba6c4c`.
4. **AC-B2-01 Staff Dashboard** — commit `9192bd6a`.
5. **Patient workspace** — AC-B2-02 list parity; AC-B2-03 skipped (ABSENT in Stitch) — commit `a60dac02`.
6. **Appointments workspace** — AC-B2-04/05 — commit `31143b50`.
7. **This checkpoint audit** — documentation only.

### B. Started / incomplete

- AC-B2-06 Clinical Encounter — **NOT STARTED** (Batch 2 Stitch)
- AC-B2-07 Pharmacy — **NOT STARTED**
- AC-B2-08 Diagnostics — **NOT STARTED**
- AC-B2-09 Billing & Invoices — **NOT STARTED** as Batch 2 Stitch parity (Batch 1 ACN21–23 landed interleaved on same branch)
- AC-B2-10 Departments & Facilities — **NOT STARTED**
- Deduplication / convergence with Batch 1 — **NOT STARTED** (explicitly deferred)

### C–G. Commits, uncommitted, tests, docs

| Commit | Subject |
| --- | --- |
| `daba6c4c` | Batch 2 responsive staff app shell |
| `9192bd6a` | AC-B2-01 staff dashboard Stitch parity |
| `a60dac02` | Batch 2 patient workspace list parity |
| `31143b50` | Batch 2 appointments workspace Stitch parity |

**Uncommitted Batch 2 code:** none identifiable as Batch 2 WIP.

**Working tree note:** `public/activeclinic/ac-app.css` is **dirty** with uncommitted edits that re-label the file as “Batch 1 + Batch 2” and retune `:root` tokens toward Batch 1 Operational Design System (`12134201997833374170`). That dirty diff is **Batch 1 collision evidence**, not a Batch 2 commit from this tab.

**Documentation added by Batch 2:** `docs/v2.03/V2_03_BATCH2_STITCH_IMPLEMENTATION_MAP.md`.

**Tests added:**

- `tests/activeclinic-batch2-shell.test.js`
- `tests/activeclinic-batch2-dashboard.test.js`
- `tests/activeclinic-batch2-patient-workspace.test.js`
- `tests/activeclinic-batch2-appointments-workspace.test.js`

Plus small assertion updates in existing parity/Batch1a tests.

---

## 2. Screens implemented

### AC-B2-01 — Staff Dashboard

| Field | Value |
| --- | --- |
| **STATUS** | COMPLETE (Stitch composition + RBAC-gated real KPIs; unsupported Stitch metrics marked internal) |
| **ROUTE** | `GET /app` |
| **VIEW/EJS** | `views/activeclinic/app/home-content.ejs` |
| **CSS** | `public/activeclinic/ac-app.css` (`.ac-dashboard--b2` and related) |
| **CLIENT JS** | none new (shell `ac-shell-nav.js` only) |
| **CONTROLLER/SERVICE** | `activeClinicAppRoutes.js` (pageHeader from dashboard greeting); large extension of `loadActiveClinicDashboardHome.js` |
| **SHARED USED** | `gp-ops-status-badge`; shell; existing services for queues/appointments |
| **NEW COMPONENTS** | none platform-new; screen uses `ac-stat-card` markup |
| **TESTS** | `tests/activeclinic-batch2-dashboard.test.js` |

### AC-B2-02 — Patients List

| Field | Value |
| --- | --- |
| **STATUS** | COMPLETE |
| **ROUTE** | `GET /app/patients` |
| **VIEW/EJS** | `views/activeclinic/app/patients-list-content.ejs` |
| **CSS** | `ac-app.css` (`.ac-patients--b2`) |
| **CLIENT JS** | none new |
| **CONTROLLER/SERVICE** | label/copy in `activeClinicPatientRoutes.js`; `loadActiveClinicPatientScreens.js`; `countPatientsByOrg` + shared WHERE in `patientRepository.js` / service |
| **SHARED USED** | `gp-ops-status-badge`, `gp-ops-pagination`, `gp-ops-filter-bar` / `gp-ops-table` class hooks |
| **NEW COMPONENTS** | none |
| **TESTS** | `tests/activeclinic-batch2-patient-workspace.test.js` |

### AC-B2-03 — Patient Profile / Summary

| Field | Value |
| --- | --- |
| **STATUS** | NOT STARTED (Stitch ABSENT; profile kept Batch 1 / ACN11 functional) |
| **ROUTE** | `GET /app/patients/:patientNumber` (unchanged purpose) |
| **VIEW/EJS** | `patient-profile-content.ejs` (marker only: `data-ac-b2-stitch="absent"`) |
| **TESTS** | asserts profile remains functional / out of B2 Stitch scope |

### AC-B2-04 — Appointments

| Field | Value |
| --- | --- |
| **STATUS** | COMPLETE (list; calendar tagged `data-ac-batch2`) |
| **ROUTE** | `GET /app/appointments` (+ calendar route unchanged) |
| **VIEW/EJS** | `appointments-list-content.ejs`, `appointments-calendar-content.ejs` |
| **CSS** | `ac-app.css` (`.ac-appointments--b2`) |
| **CONTROLLER/SERVICE** | `loadActiveClinicAppointmentScreens.js` |
| **SHARED USED** | gp-ops badge/filter/table hooks |
| **TESTS** | `tests/activeclinic-batch2-appointments-workspace.test.js` |

### AC-B2-05 — Appointment Detail

| Field | Value |
| --- | --- |
| **STATUS** | COMPLETE |
| **ROUTE** | existing appointment detail route |
| **VIEW/EJS** | `appointment-detail-content.ejs` |
| **CONTROLLER/SERVICE** | loader enrichment; `activeClinicClinicalRoutes.js` prefill `patient_id` / `appointment_id` for start-encounter |
| **SHARED USED** | `gp-ops-status-badge`, `gp-ops-timeline` |
| **TESTS** | same appointments workspace suite |

### Shell (shared chrome for Batch 2)

| Field | Value |
| --- | --- |
| **STATUS** | COMPLETE for Batch 2 chrome wiring |
| **LAYOUT** | `views/activeclinic/layouts/app-shell.ejs` |
| **PARTIALS** | `sidebar.ejs`, **new** `staff-mobile-bottom-nav.ejs`, **new** `staff-shell-ops-tools.ejs` |
| **JS** | `public/activeclinic/ac-shell-nav.js` |
| **CSS** | shell dimension tokens + `.ac-staff-bottom-nav` already present from Batch 1 clinical commit `e167315b`; Batch 2 wired markup/JS |
| **TESTS** | `tests/activeclinic-batch2-shell.test.js` |

### Not started (Batch 2 Stitch)

AC-B2-06, AC-B2-07, AC-B2-08, AC-B2-09, AC-B2-10.

---

## 3. Changed-file inventory (Batch 2 commits only)

Exact union of `daba6c4c`, `9192bd6a`, `a60dac02`, `31143b50` (excludes interleaved Batch 1 commits `f13c7916` / `7302eb6f` / `27d40211`).

### A. PLATFORM SHARED

| path | new/mod | purpose | B2-specific? | overlap risk |
| --- | --- | --- | --- | --- |
| *(none created/modified in B2 commits)* | — | B2 **consumes** existing `gp-ops-*` partials + `gp-ops-shared.css` | reusable | LOW (read-use); MEDIUM if Batch 1 edits gp-ops |

### B. ACTIVECLINIC SHARED

| path | new/mod | purpose | overlap risk |
| --- | --- | --- | --- |
| `public/activeclinic/ac-app.css` | modified | tokens, shell, dashboard/patients/appointments B2 blocks | **HIGH** |
| `public/activeclinic/ac-shell-nav.js` | modified | shell nav / drawers | **HIGH** |
| `views/activeclinic/layouts/app-shell.ejs` | modified | desktop/mobile chrome | **HIGH** |
| `views/activeclinic/partials/sidebar.ejs` | modified | sidebar affordances | **HIGH** |
| `views/activeclinic/partials/staff-mobile-bottom-nav.ejs` | **new** | mobile bottom tabs | **HIGH** |
| `views/activeclinic/partials/staff-shell-ops-tools.ejs` | **new** | search + Check-in tools | **MEDIUM** |

### C. SCREEN-SPECIFIC

| path | new/mod | purpose | overlap risk |
| --- | --- | --- | --- |
| `views/activeclinic/app/home-content.ejs` | modified | B2 dashboard | MEDIUM (Batch 1 also owns “management” surfaces) |
| `views/activeclinic/app/patients-list-content.ejs` | modified | B2 list | MEDIUM (Batch 1 ACN10–13) |
| `views/activeclinic/app/patient-profile-content.ejs` | modified | absent marker | LOW |
| `views/activeclinic/app/appointments-list-content.ejs` | modified | B2 list | MEDIUM (Batch 1 ACN06–09) |
| `views/activeclinic/app/appointments-calendar-content.ejs` | modified | batch2 marker | LOW |
| `views/activeclinic/app/appointment-detail-content.ejs` | modified | B2 detail | MEDIUM |
| `views/activeclinic/app/clinical-start-encounter-content.ejs` | modified | query prefill UI | LOW–MEDIUM |

### D. BACKEND / BUSINESS LOGIC

| path | new/mod | purpose | classification | overlap risk |
| --- | --- | --- | --- | --- |
| `src/activeclinic/http/activeClinicAppRoutes.js` | modified | pageHeader from dashboard | UI wiring | LOW |
| `src/activeclinic/services/loadActiveClinicDashboardHome.js` | modified | KPI aggregation / presentation model | REQUIRED FOR APPROVED B2 (+ large) | MEDIUM |
| `src/activeclinic/http/activeClinicPatientRoutes.js` | modified | CTA/copy | UI | LOW |
| `src/activeclinic/services/loadActiveClinicPatientScreens.js` | modified | list VM / pagination | REQUIRED FOR B2 | MEDIUM |
| `src/activeclinic/services/activeClinicPatientService.js` | modified | count wiring | REQUIRED FOR B2 | MEDIUM |
| `src/activeclinic/repositories/patientRepository.js` | modified | `countPatientsByOrg` + shared WHERE | REQUIRED FOR B2 pagination | MEDIUM |
| `src/activeclinic/services/loadActiveClinicAppointmentScreens.js` | modified | detail/list VM | REQUIRED FOR B2 | MEDIUM |
| `src/activeclinic/http/activeClinicClinicalRoutes.js` | modified | start-encounter query prefill | REQUIRED FOR B2 action UX | LOW |

No Batch 2 migrations / schema changes.

### E. TESTS

All `tests/activeclinic-batch2-*.test.js` (new) + small updates to `activeclinic-*-parity` / `batch1a-*` tests listed in commit stats. Overlap: MEDIUM if Batch 1 changes same fixtures/assertions.

### F. DOCUMENTATION

`docs/v2.03/V2_03_BATCH2_STITCH_IMPLEMENTATION_MAP.md` (new). Risk: NONE.

### G. DATABASE / MIGRATIONS

None by Batch 2.

---

## 4. Duplication findings

| ID | Files | What | Canonical (if known) | Severity | Future owner |
| --- | --- | --- | --- | --- | --- |
| DUP-01 | `ac-app.css` `:root` vs `ac-tokens.css` vs dirty Batch 1 token retune | Parallel design tokens / status colors for staff shell | `ac-tokens.css` + Batch 1 ODS (contested) | **HIGH** | UNKNOWN UNTIL BATCH 1 COMPLETES |
| DUP-02 | `ac-stat-card*` in `ac-app.css` / `home-content.ejs` vs `gp-ops-card` | KPI/stat cards recreated AC-side | `views/platform/partials/gp-ops-card.ejs` + `gp-ops-shared.css` | **MEDIUM** | PLATFORM SHARED |
| DUP-03 | `.ac-filter-bar` + `.gp-ops-filter-bar` dual classes | Filter bar styling in both AC and gp-ops | `gp-ops-filter-bar` partial/CSS | **MEDIUM** | PLATFORM SHARED |
| DUP-04 | `.ac-status` / `.ac-status-badge` + `gp-ops-status-badge` | Dual badge systems | `gp-ops-status-badge` | **MEDIUM** | PLATFORM SHARED / AC SHARED |
| DUP-05 | Desktop table + mobile card lists in patients/appointments EJS | Intentional responsive recompose (allowed) but repeated patterns | Could be shared list/card partial | **LOW** | ACTIVECLINIC SHARED |
| DUP-06 | Screen blocks `.ac-*-b2` in monolithic `ac-app.css` | Page-specific CSS stacked in global AC app CSS | Prefer screen CSS or shared primitives | **MEDIUM** | ACTIVECLINIC SHARED |
| DUP-07 | `SHELL_ASSET_VERSION` churn (`batch2-shell-01` → `billing-01` → `mgmt-data-01`) | Cache-bust string overwritten by interleaved Batch 1 commits | single shell asset version owner | **HIGH** (process) | ACTIVECLINIC SHARED |
| DUP-08 | Bottom-nav CSS from Batch 1 `e167315b` + Batch 2 partials | Shell chrome split across tabs | `app-shell` + `ac-app.css` | **HIGH** | UNKNOWN UNTIL BATCH 1 COMPLETES |

---

## 5. Batch 1 collision risks

Evidence of **already interleaved** commits on `V10`:

```
27d40211 Batch1 helper dedupe
7302eb6f ACN25–26 (also +51 lines ac-app.css)
31143b50 Batch2 appointments
f13c7916 ACN21–23 billing (overwrote SHELL_ASSET_VERSION)
a60dac02 Batch2 patients
9192bd6a Batch2 dashboard
daba6c4c Batch2 shell
e167315b ACN14–16 (introduced staff chrome CSS tokens / bottom-nav)
```

| File / component | What Batch 2 changed | Why Batch 1 may also touch | Risk | Safe parallel? |
| --- | --- | --- | --- | --- |
| `public/activeclinic/ac-app.css` | Large B2 screen + shell styling; tokens claimed as Batch 2 | Batch 1 ODS token retune (dirty working tree); ACN25 CSS; clinical shell CSS | **HIGH** | **NO** |
| `views/activeclinic/layouts/app-shell.ejs` | Mobile bottom nav + ops tools wiring | Any Batch 1 shell/nav work | **HIGH** | **NO** |
| `buildActiveClinicShellViewModel.js` | B2 set `SHELL_ASSET_VERSION=v2-03-batch2-shell-01` | Billing/mgmt commits already overwrote | **HIGH** | **NO** |
| `staff-mobile-bottom-nav.ejs` / sidebar | New B2 chrome | Batch 1 nav modules | **HIGH** | **NO** |
| `home-content.ejs` + dashboard loader | B2 operational home | Batch 1 performance/management dashboards | **MEDIUM** | UNCERTAIN |
| Patient/appointment list EJS + loaders | B2 Stitch parity | Batch 1 ACN06–13 already built engines | **MEDIUM** | UNCERTAIN for further edits |
| `gp-ops-*` | consumed, not rewritten by B2 | Batch 1 foundation/`27d40211` platform helpers | **LOW–MEDIUM** | UNCERTAIN |
| Platform helpers (CSV/money/status) | untouched by B2 | Batch 1 `27d40211` | **LOW** | YES |

---

## 6. Shared infrastructure assessment (Batch 2 current view)

| Concern | Path(s) Batch 2 treats as canonical | Classification |
| --- | --- | --- |
| Design tokens | `ac-app.css` `:root` (+ `ac-tokens.css` for shared status/space) | **POSSIBLE DUPLICATE — WAIT FOR BATCH 1** (dirty tree already retunes tokens) |
| Application shell | `views/activeclinic/layouts/app-shell.ejs` | **AC-SPECIFIC BUT APPROPRIATE** / contested |
| Desktop sidebar | `views/activeclinic/partials/sidebar.ejs` | **AC-SPECIFIC BUT APPROPRIATE** |
| Top bar | `app-shell.ejs` + `staff-shell-ops-tools.ejs` | **AC-SPECIFIC BUT APPROPRIATE** |
| Mobile header | `app-shell.ejs` drawer/hamburger | **AC-SPECIFIC BUT APPROPRIATE** |
| Mobile bottom nav | `staff-mobile-bottom-nav.ejs` + `.ac-staff-bottom-nav` in `ac-app.css` | **POSSIBLE DUPLICATE — WAIT FOR BATCH 1** (CSS originated in B1 clinical) |
| Buttons | `.ac-btn*` in `ac-app.css`; also `gp-ops-btn` | **POSSIBLE DUPLICATE — WAIT FOR BATCH 1** |
| Forms / filters | `.ac-filter-bar` + `gp-ops-filter-bar` | **SHOULD EVENTUALLY MOVE TO PLATFORM SHARED** |
| Cards | `.ac-stat-card` / `.ac-panel` | **POSSIBLE DUPLICATE** vs `gp-ops-card` |
| Tables | `.ac-table` + `gp-ops-table` hooks | **AC-SPECIFIC BUT APPROPRIATE** with platform hooks |
| Badges | `gp-ops-status-badge` + `.ac-status*` | **POSSIBLE DUPLICATE** |
| Drawers/modals | existing AC drawer in shell | **AC-SPECIFIC BUT APPROPRIATE** |
| Search/filter | shell ops tools + list filter forms | **AC-SPECIFIC BUT APPROPRIATE** |
| Responsive utilities | media queries inside `ac-app.css` | **UNCLEAR** / monolithic |

---

## 7. Backend changes

| Change | Classification |
| --- | --- |
| Dashboard loader KPI aggregation from existing services | **REQUIRED FOR APPROVED BATCH 2 FUNCTIONALITY** (large surface; not a new domain engine) |
| App route pageHeader from greeting | **UI-DRIVEN BUT NOT NECESSARY** (cosmetic) / low risk |
| Patient list CTA/copy | **UI-DRIVEN BUT NOT NECESSARY** |
| `countPatientsByOrg` + shared WHERE | **REQUIRED FOR APPROVED BATCH 2 FUNCTIONALITY** (pagination totals) |
| Appointment loader presentation enrichment | **REQUIRED FOR APPROVED BATCH 2 FUNCTIONALITY** |
| Clinical start-encounter query prefill | **REQUIRED FOR APPROVED BATCH 2 FUNCTIONALITY** (deep-link UX) |
| Migrations / RBAC policy tables / schema | **none by Batch 2** |
| Parallel appointment/patient systems | **none observed** |

**Backend rewrite risk:** LOW–MEDIUM (extensions, not rewrites). Flag **P1** only if further Batch 2 work reimplements Batch 1 billing/clinical engines for Stitch.

---

## 8. Test status

### Previously run during Batch 2 (from implementation commits / prior tab work)

Focused Batch 2 suites were run at commit time (shell, dashboard, patients, appointments) with PASS reported before each commit.

### Re-run at this checkpoint (lightweight)

```
node --test \
  tests/activeclinic-batch2-shell.test.js \
  tests/activeclinic-batch2-dashboard.test.js \
  tests/activeclinic-batch2-patient-workspace.test.js \
  tests/activeclinic-batch2-appointments-workspace.test.js
```

| Result | Count |
| --- | --- |
| PASS | 14 |
| FAIL | 0 |
| SKIPPED | 0 |

**Known regression:** none in these suites.

**Unknown / unverified:** full Batch 1 suites after interleaved commits; visual Stitch browser parity; dirty `ac-app.css` token retune impact on Batch 2 CSS assertions if committed as-is.

---

## 9. Git status

| Item | Value |
| --- | --- |
| Branch | `V10` |
| HEAD | `27d4021147c0e03fd3c724ea47081a1e1a00ef17` |
| origin/V10 | `802912259ab0fdea48fe0a3b6596e3a4b2080383` |
| Ahead/behind | **ahead 14 / behind 0** |
| Working tree | **dirty** (`M public/activeclinic/ac-app.css` + many unrelated untracked `* 2.*` / V2.01 QA artifacts) |
| Uncommitted Batch 2 implementation | **none** (dirty CSS appears Batch 1 token work) |
| Identifiable Batch 2 commits | `daba6c4c`, `9192bd6a`, `a60dac02`, `31143b50` |

---

## 10. Recommended parallel-work decision

**`PAUSE_BATCH2_UNTIL_BATCH1_CHECKPOINT`**

Decision bullets:

1. Both tabs already write interleaved commits on the same `V10` tip.
2. `ac-app.css` is actively contested (B2 commits + B1 ACN25 + dirty B1 token retune).
3. Shell asset version was set by Batch 2 then overwritten twice by Batch 1.
4. Staff chrome CSS tokens/bottom-nav originated in Batch 1 clinical, then Batch 2 wired partials — ownership unclear.
5. Remaining Batch 2 screens (06–10) historically append more global CSS to the same file.
6. Screen-only continuation still tends to edit shared shell/CSS under current patterns.
7. Duplication vs `gp-ops-*` is real but secondary to live merge collision.
8. No Batch 2 migrations; backend risk is acceptable — collision is primarily front-of-shell shared assets.
9. Batch 2 focused tests still PASS on current HEAD, so pause is process safety, not a red suite.
10. Converge after a Batch 1 checkpoint + explicit owner for tokens/shell/`ac-app.css`.

---

## Appendix — Top 10 files to compare with Batch 1

1. `public/activeclinic/ac-app.css`
2. `views/activeclinic/layouts/app-shell.ejs`
3. `src/activeclinic/services/buildActiveClinicShellViewModel.js`
4. `views/activeclinic/partials/staff-mobile-bottom-nav.ejs`
5. `views/activeclinic/partials/staff-shell-ops-tools.ejs`
6. `views/activeclinic/partials/sidebar.ejs`
7. `public/activeclinic/ac-shell-nav.js`
8. `views/activeclinic/app/home-content.ejs`
9. `src/activeclinic/services/loadActiveClinicDashboardHome.js`
10. `public/platform/gp-ops-shared.css` (+ `views/platform/partials/gp-ops-*`)
