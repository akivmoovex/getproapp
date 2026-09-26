# ActiveClinic V2.03 Batch 2 — Stitch / Existing Code Implementation Map

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH2_STITCH_IMPLEMENTATION_MAP` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **HEAD** | `88f3e5f4` |
| **Stitch project** | [ActiveClinic V2.03 Batch 2](https://stitch.withgoogle.com/projects/7300898757945019896) (`7300898757945019896`) |
| **Mode** | Read-only gap audit — **no code changes**, **no migrations**, **no commits**, **no deployments** |
| **Governing contract** | ActiveClinic V2.03 Batch 2 Implementation Contract (frozen tokens + reuse rules) |

---

## 1. AC-B2-03 / AC-B2-04 naming resolution (from Stitch + code)

**Resolved from live Stitch inventory — not guessed.**

| Code | In Stitch project `7300898757945019896`? | Authoritative title |
|------|------------------------------------------|---------------------|
| **AC-B2-03** | **No** — zero screens titled `AC-B2-03` or “Patient Profile / Summary” | **ABSENT from final Batch 2 Stitch inventory** |
| **AC-B2-04** | **Yes** (desktop + mobile) | **ActiveClinic Appointments** |

Implications:

- Batch 2 visual work does **not** include a Patient Profile / Summary Stitch target.
- Existing patient profile at `GET /app/patients/:patientNumber` remains in code for workflows that deep-link from lists/detail; it is **out of Batch 2 Stitch parity scope** until a later Stitch screen appears.
- Earlier contract wording that listed “AC-B2-03 Patient Profile” and “AC-B2-04 Appointments” is reconciled as: **03 skipped in frozen Stitch; 04 = Appointments**.

---

## 2. Stitch inventory (authoritative)

Project lists **20 screen assets**. Unique logical codes with companions:

| Code | Stitch screen name | Desktop ID | Mobile ID | Notes |
|------|--------------------|------------|-----------|-------|
| AC-B2-01 | ActiveClinic Staff Dashboard | `ed2ef3ac64d44c398f177d1b58ffc430` | `2cb0ef951e1e40418cc7272d1392b26d` | Desktop `w-64` sidebar; mobile fixed bottom tabs (`h-14` in HTML) |
| AC-B2-02 | ActiveClinic Patients List | `04c24f7dd1d847e494733d32becc9534` | `ccb2201ff02641e199f1a58481fb2cc4` | |
| AC-B2-03 | — | — | — | **Not in project** |
| AC-B2-04 | ActiveClinic Appointments | `6bf6da61f93a4e12972d7c3ab649549c` | `b7ccd0f78b8a491580554999c8d1e1b9` | |
| AC-B2-05 | ActiveClinic Appointment Detail | `abc9994a9cff42568c7d7ddb4bf905a4` | `2621d93473ab4a79a5280f9a036a2209` | |
| AC-B2-06 | ActiveClinic Clinical Encounter | `b3d1767822e74ccd844a04947266f4c3` | `f0a06faaa89b4ded8506f3fc67cdfa77` | |
| AC-B2-07 | ActiveClinic Pharmacy | `a587c5c7bb87492fa7eb986bcd843a39` | `e1162b521dcf45e98692799923ab42ca` | |
| AC-B2-08 | ActiveClinic Diagnostics | `07d08d75a44248acab897adb33254426` | `f092ae1348084d1bb41b689d34c86f16` | |
| AC-B2-09 | ActiveClinic Billing & Invoices | `29257b0d01c64fa4896a369efd3f6417` **and** `ed8508e6713044eda5925aa6a51af13a` | `24632347e4ab4c89937b611457d94730` **and** `e36ead2e5106495b8e0ad8d0738421c7` | **Duplicate near-variants** (same title; different composition density) |
| AC-B2-10 | ActiveClinic Departments & Facilities | `fb88329aa6af454a8e7b6675c6070b78` | `4c70614fd2534fa3a5baee0f61f1f964` | Combined Facilities + Departments workspace |

Shared Stitch chrome cues (sampled HTML): Inter + Material Symbols; `primary-container` ≈ `#2563eb`; desktop sidebar `w-64` (256px); sticky/header bands use `h-14` (56px).

---

## 3. Shared staff chrome (all Batch 2 screens)

| Layer | Existing path |
|-------|----------------|
| Layout | `views/activeclinic/layouts/app-shell.ejs` |
| Sidebar / mobile drawer | `views/activeclinic/partials/sidebar.ejs` |
| Shell renderer | `src/activeclinic/http/renderActiveClinicShell.js` |
| Shell VM / nav | `buildActiveClinicShellViewModel.js`, `activeClinicNavigation.js` |
| CSS | `public/activeclinic/ac-tokens.css`, `ac-app.css` (primary today `#003c90`; border already `#e2e8f0`) |
| Platform ops (unused by AC views yet) | `views/platform/partials/gp-ops-*.ejs`, `public/platform/gp-ops-shared.css` |

**Mobile chrome gap:** Stitch Batch 2 mobile companions use a **fixed bottom tab bar**. Staff app today uses **hamburger + drawer only** (public `acp-mobile-bottom-nav` is not wired to staff shell).

---

## 4. Screen maps

### AC-B2-01 — Staff Dashboard

1. **Stitch:** ActiveClinic Staff Dashboard (+ Mobile)
2. **Routes:** `GET /app`, `GET /app/` (no `/app/dashboard`)
3. **EJS:** `views/activeclinic/app/home-content.ejs` via `app-shell.ejs`
4. **Controller/service/repo:** `activeClinicAppRoutes.js` → `loadActiveClinicDashboardHome.js`, `activeClinicDashboardCapabilities.js`, `facilityService.js`, `facilityRepository.js`
5. **RBAC:** `activeclinic.access`
6. **Platform reusable:** `gp-ops-card`, `gp-ops-empty-state`; future `gp-ops-metric-card` / page-header / alert (not created yet)
7. **AC-specific:** Dashboard capability gating, clinic-setup checklist cards, facility/org console blocks, nav registry
8. **Unchanged:** Route, auth, capability aggregation, onboarding links, facility switcher flows
9. **Min UI gap:** Align tokens to frozen `#2563EB` system; Stitch KPI / quick-action / section composition; desktop 256px sidebar; mobile bottom nav + 390 composition; Material icon nav treatment
10. **Backend gap:** **None** (presentation + chrome)

---

### AC-B2-02 — Patients List

1. **Stitch:** ActiveClinic Patients List (+ Mobile)
2. **Routes:** `GET /app/patients` (+ create/quick-register siblings unchanged)
3. **EJS:** `patients-list-content.ejs`
4. **Controller/service/repo:** `activeClinicPatientRoutes.js` → `loadActiveClinicPatientScreens.js` → `activeClinicPatientService.js` → `patientRepository.js` (+ identifier/emergency contact repos as needed)
5. **RBAC:** `activeclinic.patient.search` (list); create/view keys on sibling actions
6. **Platform reusable:** `gp-ops-filter-bar`, `gp-ops-table`, `gp-ops-pagination`, `gp-ops-empty-state`, `gp-ops-status-badge`; `listQuery.js`
7. **AC-specific:** Patient filter fields (DOB, patient number, phone E.164 hints), duplicate markers, register CTAs
8. **Unchanged:** Search/filter semantics, duplicate prevention service, RBAC, pagination contract
9. **Min UI gap:** Filter bar / table / mobile card list / empty states to Stitch; touch targets; status chips
10. **Backend gap:** **None**

---

### AC-B2-03 — Patient Profile / Summary

1. **Stitch:** **ABSENT** from project `7300898757945019896`
2. **Routes (code only):** `GET /app/patients/:patientNumber` (+ edit/consents/identifiers/archive…)
3. **EJS:** `patient-profile-content.ejs`
4. **Controller/service/repo:** same patient stack as B2-02; profile loader `loadActiveClinicPatientProfileScreen`
5. **RBAC:** `activeclinic.patient.view` (+ update/consent/archive keys on actions)
6. **Platform reusable:** cards, badges, timeline (for history sections), empty states
7. **AC-specific:** Clinical demographics, identifiers, emergency contacts, clinical consent ledger UI
8. **Unchanged:** Entire profile backend and route surface for Batch 2
9. **Min UI gap:** **N/A for Batch 2 Stitch** — do not invent a Stitch redesign; keep functional profile for deep-links
10. **Backend gap:** **None for Batch 2** (any consent/history depth already tracked under Batch 1 ACN11; out of this Stitch set)

---

### AC-B2-04 — Appointments

1. **Stitch:** ActiveClinic Appointments (+ Mobile)
2. **Routes:** `GET /app/appointments`, `GET /app/appointments/calendar` (+ schedule/missed/new)
3. **EJS:** `appointments-list-content.ejs`, `appointments-calendar-content.ejs`
4. **Controller/service/repo:** `activeClinicAppointmentRoutes.js` → `loadActiveClinicAppointmentScreens.js` → `activeClinicAppointmentService.js` → `appointmentRepository.js`
5. **RBAC:** `activeclinic.appointment.view` (+ create/update/cancel/check-in/manage_schedule); department gate `reception`
6. **Platform reusable:** filter bar, table, pagination, status badge, empty state
7. **AC-specific:** Calendar/agenda grids, practitioner/service/status filters, collision-aware book CTA
8. **Unchanged:** Status machine, collision checks, list/calendar data loaders, booking deep-links
9. **Min UI gap:** Stitch appointments workspace chrome (list/calendar density, filters, mobile agenda); shell tokens
10. **Backend gap:** **None**

---

### AC-B2-05 — Appointment Detail

1. **Stitch:** ActiveClinic Appointment Detail (+ Mobile)
2. **Routes:** `GET /app/appointments/:appointmentId` (+ cancel/reschedule/check-in/status POSTs)
3. **EJS:** `appointment-detail-content.ejs` (+ cancel/reschedule/success siblings)
4. **Controller/service/repo:** same appointment stack; `loadActiveClinicAppointmentDetailScreen`
5. **RBAC:** `activeclinic.appointment.view` (+ action-specific keys); department `reception`
6. **Platform reusable:** `gp-ops-timeline`, `gp-ops-status-badge`, `gp-ops-card`, alerts
7. **AC-specific:** Lifecycle action rail, patient banner, clinical handoff links
8. **Unchanged:** Status transitions, append-only `appointment_status_events`, CSRF POSTs
9. **Min UI gap:** Lifecycle rail / timeline / badges / mobile action stacking to Stitch
10. **Backend gap:** **None**

---

### AC-B2-06 — Clinical Encounter

1. **Stitch:** ActiveClinic Clinical Encounter (+ Mobile)
2. **Routes:** Hub `GET /app/clinical`; workspace `GET /app/clinical/encounter/:encounterId` (+ triage/vitals/nursing/consultation/diagnosis/orders/alerts/close)
3. **EJS:** `clinical-queue-content.ejs`, `consultation-workspace-content.ejs` (+ workflow content partials)
4. **Controller/service/repo:** `activeClinicClinicalRoutes.js` → `loadActiveClinicClinicalScreens.js` → `activeClinicClinicalService.js` (service-layer SQL; no separate encounter repository file)
5. **RBAC:** `activeclinic.encounter.view` / `.manage`; triage/nursing/consultation/diagnosis/order/alert keys; department `opd` or `triage`
6. **Platform reusable:** cards, badges, alerts, empty/loading; **not** SOAP/order semantics
7. **AC-specific:** Encounter banner, SOAP grid, clinical subflow links, orders/alerts
8. **Unchanged:** Encounter lifecycle, clinical write paths, RBAC, department gates
9. **Min UI gap:** Stitch multi-panel encounter workspace vs current stacked panels; mobile companion layout; iconography/density
10. **Backend gap:** **None** for visual parity (do not replace SOAP/order logic with Stitch demo data)

---

### AC-B2-07 — Pharmacy

1. **Stitch:** ActiveClinic Pharmacy (+ Mobile)
2. **Routes:** Hub `GET /app/pharmacy` (+ catalogue/inventory/queue/dispense/alerts/PO…)
3. **EJS:** `pharmacy-dashboard-content.ejs` (+ queue/inventory/catalogue/dispense content files)
4. **Controller/service/repo:** `activeClinicPharmacyRoutes.js` → `loadActiveClinicPharmacyScreens.js` → `activeClinicPharmacyService.js` / `activeClinicPharmacyOpsService.js`
5. **RBAC:** `activeclinic.pharmacy.view` (+ dispense/review/inventory/audit keys); department `pharmacy`
6. **Platform reusable:** metric cards, filter/table/pagination/empty/badge
7. **AC-specific:** Dispense/batch/substitution/inventory workflows
8. **Unchanged:** Pharmacy domain services and routes
9. **Min UI gap:** Hub KPI/queue composition to Stitch; list chrome shared patterns
10. **Backend gap:** **None**

---

### AC-B2-08 — Diagnostics

1. **Stitch:** ActiveClinic Diagnostics (+ Mobile)
2. **Routes:** Hub `GET /app/diagnostics`; lab/radiology dashboards, queues, specimens, results
3. **EJS:** `diagnostics-hub-content.ejs` (+ laboratory/radiology/specimen/result content files)
4. **Controller/service/repo:** `activeClinicDiagnosticsRoutes.js` → `loadActiveClinicDiagnosticsScreens.js` → `activeClinicDiagnosticsService.js`
5. **RBAC:** Hub anyOf `activeclinic.lab.view` | `activeclinic.radiology.view` | `activeclinic.diagnostics.view` (+ lab/radiology collect/result/verify); department `laboratory` / `radiology`
6. **Platform reusable:** same list/KPI/empty/badge primitives
7. **AC-specific:** Lab vs radiology modality hubs, specimen/result flows, critical alerts
8. **Unchanged:** Diagnostics domain routes and verification rules
9. **Min UI gap:** Hub + modality dashboards to Stitch; shared table/filter chrome
10. **Backend gap:** **None**

---

### AC-B2-09 — Billing & Invoices

1. **Stitch:** ActiveClinic Billing & Invoices (+ Mobile) — **two desktop and two mobile assets with the same title**
2. **Routes:** `GET /app/billing`, `GET /app/billing/invoices`, `GET /app/billing/invoices/:invoiceId` (+ create/post/void/AR/collections…)
3. **EJS:** `billing-dashboard-content.ejs`, `billing-invoice-list-content.ejs`, `billing-invoice-detail-content.ejs` (+ finance siblings); cashier remains `/app/cashier` (separate nav)
4. **Controller/service/repo:** `activeClinicBillingRoutes.js` → `activeClinicBillingService.js` / `activeClinicBillingOpsService.js` / `activeClinicFinanceAuthz.js`
5. **RBAC:** `activeclinic.billing.view` (+ invoice/payment/catalog keys); department `billing`
6. **Platform reusable:** KPI, filter, table, pagination, badge, empty, timeline (invoice events)
7. **AC-specific:** Invoice lifecycle, AR/collections, statutory money formatting, SoD with cashier
8. **Unchanged:** Billing ledger rules, invoice/payment POSTs, finance authz
9. **Min UI gap:** Pick **one** Stitch desktop + mobile variant as canonical, then match workspace KPIs / invoice table / mobile stacking; do not merge cashier SoD into billing unless Stitch variant explicitly requires and product confirms
10. **Backend gap:** **None** (canonical Stitch pick is a design/inventory decision, not a missing API)

---

### AC-B2-10 — Departments & Facilities

1. **Stitch:** ActiveClinic Departments & Facilities (+ Mobile) — **combined** configuration workspace
2. **Routes:** Facilities `GET /app/facilities` (+ `:facilityKey`, new/edit/archive); Departments `GET /app/settings/clinic-setup/departments` (no `/app/departments`)
3. **EJS:** `facilities-list-content.ejs`, `facility-detail-content.ejs`, `facility-form-content.ejs`, `settings-departments-content.ejs`
4. **Controller/service/repo:** `activeClinicFacilityRoutes.js` + `loadActiveClinicFacilityScreens.js` + `facilityService.js` + `facilityRepository.js`; `activeClinicSettingsRoutes.js` + `loadActiveClinicSettingsScreens.js` + `activeClinicDepartmentService.js` + `departmentRepository.js`
5. **RBAC:** `activeclinic.facility.view|create|update|archive` (nav currently anyOf create/update/archive); `activeclinic.departments.manage`
6. **Platform reusable:** filter/table/empty/badge/card — ideal **first** `gp-ops-*` pilot
7. **AC-specific:** Facility keys/types/primary flag; department type activate/deactivate module gating
8. **Unchanged:** Facility CRUD, department activate/deactivate semantics, module availability gates
9. **Min UI gap:** Present Stitch combined Facilities+Departments IA **without** inventing a new backend — e.g. tabbed/sectioned shell reusing both existing routes/partials; align list chrome
10. **Backend gap:** **None** (split routes are sufficient; UI composition only)

---

## 5. BB / AC duplication → safe shared platform UI (Batch 2 scope)

`gp-ops-*` already exists but **is not mounted** by AC or BB views (`PLATFORM_SHARED_FOUNDATION.md` known gap).

| Opportunity | AC today | BB mirror | Platform target |
|-------------|----------|-----------|-----------------|
| Ops CSS tokens + btn/input/card | `ac-app.css` `ac-btn`/`ac-input`/`ac-panel` | `bb-ba-*` / `bb-ds-*` | Mount `gp-ops-shared.css`; bridge `--gp-ops-*` ← AC frozen tokens |
| Filter bar shell | Repeated `ac-filter-bar` | Branch-admin GET filter forms | `gp-ops-filter-bar.ejs` (`filtersHtml` for domain fields) |
| Data table | `ac-table` / `ac-table-wrap` | `bb-ba-table` | `gp-ops-table.ejs` |
| Pagination | Inline `ac-pagination` | `bb-ds-pagination` (partial largely unused) | `gp-ops-pagination.ejs` |
| Empty / no-results | `ac-inline-state.ejs` | `empty-state.ejs` | `gp-ops-empty-state.ejs` |
| Status badges | `ac-status` / `ac-badge` | `bb-ba-chip` / `bb-ds-badge` | `gp-ops-status-badge.ejs` |
| Section card | `ac-panel` | `bb-ba-panel` | `gp-ops-card.ejs` |
| Timeline | Raw `ac-timeline` on appointment/reception | Custom history UIs | `gp-ops-timeline.ejs` + `src/platform/timeline/` |
| KPI / metric tiles | `ac-stat-card` / `ac-metric-grid` | `metric-card.ejs` / `bb-ba-members-metric` | **New** `gp-ops-metric-card.ejs` |
| Page header / flash / loading | Shell + `ac-flash` / `ac-loading-state` | `page-header` / `flash-message` / `loading-state` | **New** thin `gp-ops-page-header`, `gp-ops-alert`, `gp-ops-loading-state` |

**Do not share:** app shells (AC vs BB Stitch chrome), patient/member models, invoice vs giving, clinical encounter workspace, pharmacy/diagnostics semantics.

---

## 6. Cross-cutting UI gaps (not backend)

| Gap | Evidence | Batch 2 handling |
|-----|----------|------------------|
| Frozen primary `#2563EB` vs current `--ac-primary: #003c90` | `ac-app.css` | Token remaps in AC staff CSS; keep public teal tokens separate |
| Sidebar 256px vs `--ac-sidebar-w: 16.5rem` (~264px) | `ac-app.css` | Set to `256px` / `16rem` |
| Mobile bottom nav present in Stitch, absent in staff shell | B2-01 mobile HTML vs `app-shell.ejs` | Implement staff bottom nav (or document PRODUCT_DECISION if drawer retained) |
| Contract 64px bottom nav vs Stitch sample `h-14` (56px) | Contract vs B2-01 mobile HTML | Prefer **Stitch screen HTML** for that companion; note token doc conflict |
| B2-09 duplicate assets | Two desktop + two mobile same title | Product picks canonical IDs before billing parity work |
| B2-10 combined Stitch vs split routes | Stitch tabs Facilities+Departments | Compose UI; keep both backends |
| `gp-ops-*` unused | No includes under `views/activeclinic` | Mount during Batch 2 list pilots |

---

## 7. Recommended implementation order

Optimized for shared dependency reuse, lowest regression risk, and minimum duplication:

1. **Platform ops mount + AC token bridge** — `gp-ops-shared.css` on staff shell; map frozen Batch 2 tokens; optional new metric/header/alert/loading partials only as needed.
2. **Staff shell chrome** (desktop 256/56 + mobile header/bottom nav decision) — unblocks every screen.
3. **AC-B2-10 Departments & Facilities** — simplest catalogues; first `gp-ops-filter/table/empty/pagination` pilot; compose combined Stitch IA over existing routes.
4. **AC-B2-02 Patients List** — reuse list primitives; domain filters stay AC.
5. **AC-B2-04 Appointments** — same list/filter patterns + calendar chrome.
6. **AC-B2-05 Appointment Detail** — timeline/badge/card reuse; status POSTs untouched.
7. **AC-B2-01 Staff Dashboard** — after metric/card primitives exist.
8. **AC-B2-09 Billing & Invoices** — after canonical Stitch variant selected.
9. **AC-B2-07 Pharmacy** then **AC-B2-08 Diagnostics** — hub + list chrome; deep workflows stay AC.
10. **AC-B2-06 Clinical Encounter** — last (highest AC-specific layout risk).
11. **AC-B2-03** — **skip** until Stitch adds a profile screen.

---

BATCH2_AUDIT_RESULT
Screens mapped: 10
Existing routes reusable: 10
Backend gaps: 0
Shared component opportunities: 11
Blocking issues: 2
