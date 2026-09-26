# ActiveClinic V2.03 Batch 3 — Pre-Implementation Analysis

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_AC_BATCH3_PREIMPLEMENTATION_ANALYSIS` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Initial analysis HEAD** | `f13c7916` (pre-RC snapshot) |
| **Frozen B1+B2 RC SHA** | `6fb754ebef4c1bc652f1868b68b90ac96fbd8711` — treat shared infra as **frozen** until hosted QA/freeze completes |
| **Preparation mode** | [`ACTIVECLINIC_BATCH3_PREPARATION_MODE.md`](./ACTIVECLINIC_BATCH3_PREPARATION_MODE.md) |
| **Mode** | Read-only analysis — **no implementation**, **no migrations**, **no route/DB/CSS/token/shell/nav changes** |
| **Caveat** | Screen A–J mappings below remain valid as functional inventory. Collision severity and reuse rules for kickoff are governed by Preparation Mode against the RC SHA (not the earlier “B1/B2 still mutating” assumption). |
| **Verdict** | `V2_03_AC_BATCH3_PREIMPLEMENTATION_ANALYSIS_COMPLETE` |

---

## 1. Executive summary

Batch 3 mixes **staff clinical deep-dives** (ACN17–20), **patient portal surfaces** (AC-P03–07), and **ops locations** (ACN27). Most staff clinical paths already exist as P04/P05 foundation code; portal visit-summary / invoice surfaces and a true clinical-document archive are largely **missing**; referral management is **narrative + follow-up only**, not an external referral workflow.

| Classification (functional readiness vs Stitch Batch 3) | Count | Screens |
|----------------------------------------------------------|-------|---------|
| **EXISTING** (backend-ready; primarily UI/parity) | 4 | ACN17, ACN19, AC-P03, ACN27 |
| **PARTIAL** (route/data exists; Stitch IA or patient-facing gap) | 3 | ACN20, AC-P04, AC-P07 |
| **NEW / major backend extension** | 3 | ACN18, AC-P05, AC-P06 |

**Highest reuse:** vitals observations, clinical prescription orders → pharmacy, facilities CRUD, patient portal bookings + profile, platform `gp-ops-*` / phone / session / media primitives.

**Highest Batch 3 build cost:** clinical documents archive (ACN18), patient-facing visit summaries (AC-P05), patient-facing invoices/receipts (AC-P06), referral worklist beyond free-text (ACN20).

**Architecture rule:** keep clinical/patient/billing domain models in ActiveClinic; lift only generic list/filter/form/timeline/media-shell patterns to platform. Do **not** share BB member/giving models. Do **not** enable CDS / drug-interaction / auto-prescribe (see `ACTIVECLINIC_PRODUCT_GAPS.md`).

---

## 2. Stitch source of truth (Batch 3)

| Field | Value |
|-------|--------|
| **Project title** | ActiveClinic Clinical Interface Expansion |
| **Project ID** | `projects/3741389873539108242` |
| **URL** | https://stitch.withgoogle.com/projects/3741389873539108242 |
| **Created** | 2026-09-26 |
| **Surface** | Staff clinical expansion + patient portal (mixed) |

Distinct from:

| Project | ID | Role |
|---------|----|------|
| Operational Design System (Batch 1 ACN matrix) | `12134201997833374170` | ACN01–16, 21–23, 25–26 |
| V2.03 Batch 2 | `7300898757945019896` | AC-B2-01…10 staff chrome |
| Juflona Pilot (legacy internal) | `12272131183982732110` | Older P01–P07 references |
| Public Ecosystem & Booking | `17813606734422395399` | Legacy P21–P27 portal/booking |

### 2.1 Approved Batch 3 screen inventory (live MCP)

| Code | Title | Desktop screen ID | Mobile screen ID |
|------|-------|-------------------|------------------|
| **ACN17** | Vitals & Observations | `e4dc47dcc41a411184e987308aedc943` | `c8552b6186d4428283b31d7b875005d6` |
| **ACN18** | Clinical Documents | `13053c54723e41e1aad43f5343e7c753` | `22222fdd59f7474fbe1dfb9967b6747c` |
| **ACN19** | Prescription Editor | `47c5eb28d5e1482e9dd0c2f2cbee7b59` | `5e5048f347414e53af6e8a86aa83fba7` |
| **ACN20** | Referral Management | `9afe2826b316421e81d56d98364e1fbf` | `43fabf392a204db68bd229e2acc51926` |
| **AC-P03** | Patient Portal / My Appointments | `e5bc2a1492da4e1fb675d14c884ec059` | `2ea963ee11384dd680b21978b3f56ea1` |
| **AC-P04** | Appointment Detail & Reschedule | `497d0c05f6f241f981d07b47be7c7606` | `0af4b000cec2477389a576b11b33cba0` |
| **AC-P05** | Patient Portal / Visit Summaries | `24ad0b96c4ca4d709b78e1121dd5015f` | `ee5e5577e3e04e52bf4b9173eb191c78` |
| **AC-P06** | Patient Portal / Invoices & Receipts | `a493b33db83c4873ab2964391ee088b9` | `5b381b193b6643d09cbc317b55fd5f32` |
| **AC-P07** | Patient Portal / Profile & Contact Details | `e042789d436d48e8843e4bb3f99f379b` | `c15fcece57e2481cb4d5ff988b325730` |
| **ACN27** | Locations Management | `81baf40c090843b5a9ac22d0c40919e4` | `e43a1cea620e4a859f449276f5c763b7` |

**Also in project (not a Batch 3 code):** `8aaa5adf2e5b40c78ec1a86080692f62` — “ActiveClinic Mobile Clinical Encounter” (overlaps Batch 1 ACN15 / Batch 2 AC-B2-06; do not treat as Batch 3 scope unless product reassigns).

`get_screen` HTML retrieve was unavailable during this pass; titles/IDs above are from live `list_screens` / project instances. Implementation agents should re-fetch HTML before visual parity work.

---

## 3. Platform shared infrastructure (reuse targets)

From `docs/v2.03/PLATFORM_SHARED_FOUNDATION.md` and **frozen RC** `6fb754eb…` (see Preparation Mode). Do **not** recreate tokens, staff shell, `gp-ops-*`, or `.ac-ops-queue`:

| Capability | Location | Batch 3 use |
|------------|----------|-------------|
| RBAC / tenant scope | `src/platform/rbac/*`, AC permission middleware | Staff screens; portal uses patient session instead |
| Audit | `src/platform/audit/*` | Vitals, orders, facilities, portal profile writes |
| List query | `src/platform/http/listQuery.js` | Document lists, referral worklists, portal lists |
| Status history | `src/platform/history/` | Referral / document / booking status trails |
| Timeline composer | `src/platform/timeline/` | Appointment detail, referral history |
| Notifications (shell) | `src/platform/notifications/` | Optional portal/reschedule notices (adapters may still be noop) |
| Consent / prefs (non-clinical) | `src/platform/consent/` | Portal marketing prefs only — **not** clinical consent |
| Ops UI partials | `views/platform/partials/gp-ops-*.ejs` | Tables, filters, empty, badges, pagination, timeline |
| Ops CSS | `public/platform/gp-ops-shared.css` | Shared list/card chrome |
| Phone / geo | `phoneNumberService`, phone-field locals | AC-P07 profile |
| Session / CSRF | `sharedSessionSecurity`, `v5Csrf` | Portal auth |
| Media engine | `src/platform/media/*` | **Candidate** for ACN18 clinical attachments via AC adapter — do not reuse website CMS media as EHR docs |

**Still AC-owned (do not platform-genericize):** patients, encounters, vitals rows, clinical orders, pharmacy prescriptions, invoices/receipts, facilities as HCO locations, patient portal bookings.

---

## 4. Parallel Batch 1 / Batch 2 overlap (coordination risks)

**Superseded for kickoff planning by** [`ACTIVECLINIC_BATCH3_PREPARATION_MODE.md`](./ACTIVECLINIC_BATCH3_PREPARATION_MODE.md) §3 collision matrix against RC `6fb754eb…`.

Summary (post-reconciliation): in-repo B1/B2 token/shell ownership is **RESOLVED**. Remaining Batch 3 risks are **leaf-domain** (clinical vitals/Rx, follow-up/referral, portal projections) and **CRITICAL** overlap of **ACN27** with **AC-B2-10 facilities**. Do not edit frozen shared chrome while hosted QA runs.

| Batch | Overlap with Batch 3 | Risk if both edit |
|-------|----------------------|-------------------|
| **B1 ACN15** encounter workspace | ACN17/19 entry points linked from encounter; ACN20 referral text on consultation | Shared `consultation-workspace-content.ejs`, clinical routes, nav |
| **B1 ACN16** follow-up | ACN20 `pending_referral` item type | Follow-up service/schema/routes |
| **B1 ACN21–23** billing | AC-P06 patient invoice/receipt views need **read projections**, not staff ledger rewrite | Billing services + receipt presentation |
| **B2 AC-B2-06** clinical encounter chrome | ACN17/19 deep links / mobile clinical chrome | Shell tokens, encounter layout |
| **B2 AC-B2-07** pharmacy | ACN19 creates orders consumed by pharmacy queue | Pharmacy queue contracts |
| **B2 AC-B2-09** billing UI | AC-P06 must not fork staff invoice EJS into portal | Presentation boundaries |
| **B2 AC-B2-10** departments & facilities | **Direct conflict with ACN27** Locations Management | Same `/app/facilities` + department settings surfaces |
| **Platform `gp-ops-*` + `.ac-ops-queue`** | All Batch 3 list UIs should consume | Duplicate chrome if Batch 3 invents parallel packs |

**Coordination guidance:** Batch 3 remains in **preparation mode** until hosted QA completes; then prefer **leaf views** and thin adapters; treat facilities + clinical shell + billing ledger as owned by the frozen RC.

---

## 5. Per-screen analysis (A–J)

Legend — **Work type:**

- **UI-only** — visual/parity on existing route + data
- **UI + existing backend** — Stitch UI wired to current services
- **Backend extension** — new endpoints/services/projections without necessarily new tables
- **DB/migration potential** — new or extended schema likely

---

### ACN17 — Vitals & Observations

| Lens | Finding |
|------|---------|
| **A. Routes** | `GET/POST /app/clinical/encounter/:encounterId/vitals` |
| **B. Controller/service** | `activeClinicClinicalRoutes.js` → `loadActiveClinicVitalSignsEntryScreen` (`loadActiveClinicClinicalScreens.js`) → `recordVitalSignObservation` / `listVitalSignsForEncounter` (`activeClinicClinicalService.js`) |
| **C. DB** | `activeclinic.vital_sign_observations` (`015_clinical_encounters.sql`) — immutable rows; corrections via `corrects_observation_id` |
| **D. RBAC** | `activeclinic.triage.record` (`PERM.TRIAGE`); department `clinical` |
| **E. Preserve** | Immutable observation semantics; soft-warn only for out-of-range (no auto-escalation per product gaps); CSRF; facility/org scoping; audit `activeclinic.vitals.recorded` |
| **F. Shared UI** | `gp-ops-table`, status badge, empty state; staff shell from B2 |
| **G. Missing** | Stitch multi-vitals panel density; trend/history chrome; possible patient-timeline view beyond encounter scope |
| **H. Likely files** | `vital-signs-entry-content.ejs`, clinical CSS/tokens, optional loader tweaks; **avoid** rewriting `recordVitalSignObservation` |
| **I. B1/B2 overlap** | High with ACN15 / AC-B2-06 encounter chrome and vitals deep-link |
| **J. Platform vs AC** | Platform: table/form chrome. AC: observation types, BP fields, clinical immutability |

**Work type:** **UI + existing backend** (primarily UI-only if Stitch matches current fields).

---

### ACN18 — Clinical Documents

| Lens | Finding |
|------|---------|
| **A. Routes** | **None** dedicated. Website media (`/clinics/:clinicKey/website/media`) is CMS-only. No staff clinical document library route. |
| **B. Controller/service** | No clinical document service. Platform / website media services exist for **marketing** assets only. |
| **C. DB** | No `clinical_documents` (or equivalent) table found under `activeclinic`. Platform website media kinds include `document` for website engine — **not** encounter/patient clinical archive. |
| **D. RBAC** | None dedicated; would need new keys (e.g. `activeclinic.clinical_document.view/upload/manage`) — not in catalogue today |
| **E. Preserve** | Do not overload website CMS media into EHR; keep PHI out of public website storage paths |
| **F. Shared UI** | Platform media upload shell + `gp-ops-table` / filters / empty; BlessBoard church media is **not** a clinical template |
| **G. Missing** | Upload/list/view/download/classify by encounter/patient; retention; access audit; possibly signed URL delivery |
| **H. Likely files** | New routes/service/repo/views; migration; RBAC seed; optional platform media adapter registration |
| **I. B1/B2 overlap** | Low direct; medium if Batch 2 mounts media pickers into encounter |
| **J. Platform vs AC** | Platform: file storage, virus/size validation, signed download, job audit. AC: clinical classification, encounter linkage, clinician RBAC, retention policy |

**Work type:** **backend extension + database/migration potentially required**.

---

### ACN19 — Prescription Editor

| Lens | Finding |
|------|---------|
| **A. Routes** | `GET/POST /app/clinical/encounter/:encounterId/order/prescription` |
| **B. Controller/service** | `activeClinicClinicalRoutes.js` → order form loader → `createClinicalOrder`; pharmacy fulfillment via `pharmacy_prescriptions` / pharmacy services |
| **C. DB** | `activeclinic.clinical_orders` (`order_type='prescription'`, JSONB details); `activeclinic.pharmacy_prescriptions` (+ lines) in `016_pharmacy_stock.sql` |
| **D. RBAC** | `activeclinic.clinical_order.create`; pharmacy queue uses pharmacy.* keys |
| **E. Preserve** | Manual drug/dose/frequency/duration entry; **no** CDS / interaction checking / auto-dose; draft→submitted semantics; pharmacy handoff contract |
| **F. Shared UI** | Form chrome, empty/error; do not share pharmacy dispense editor |
| **G. Missing** | Stitch richer editor UX (multi-line meds, print preview, structured catalogue pick) — confirm against Stitch HTML before schema changes |
| **H. Likely files** | `create-prescription-content.ejs`, clinical routes/CSS; pharmacy queue only if order payload shape changes |
| **I. B1/B2 overlap** | High with ACN15 (orders not promoted on workspace chrome per clinical pass notes) and AC-B2-07 pharmacy |
| **J. Platform vs AC** | Platform: form validation helpers. AC: prescribing workflow + pharmacy linkage |

**Work type:** **UI + existing backend** (backend extension only if Stitch requires multi-line / catalogue FK beyond current JSONB).

---

### ACN20 — Referral Management

| Lens | Finding |
|------|---------|
| **A. Routes** | Staff: no dedicated `/app/clinical/referrals`. Fragments: consultation `referral` field on encounter complete/draft; follow-up list `GET /app/clinical/follow-up`; public procedure booking referral steps under `/clinics/:clinicKey/book/procedures/.../referral` |
| **B. Controller/service** | `activeClinicClinicalService` consultation `referral_text`; `activeClinicClinicalFollowUpService` `pending_referral`; `activeClinicPublicBookingService` referral_status/notes |
| **C. DB** | `consultation_notes.referral_text` (`039`); `clinical_follow_up_items` types including `pending_referral`; `public_booking_requests.referral_*` (`019`) — **not** a referral entity table |
| **D. RBAC** | Encounter/consultation/follow-up view-record keys; booking staff linkage keys; no `referral.manage` |
| **E. Preserve** | Free-text clinical referral narrative; follow-up worklist semantics; public booking referral acknowledgment without inventing upload if still blocked |
| **F. Shared UI** | Worklist filters/table/timeline (`gp-ops-*`); status badges |
| **G. Missing** | Dedicated referral queue/detail (inbound/outbound), status machine, destination facility/clinician, letter/PDF, upload of external referral docs (ties to ACN18) |
| **H. Likely files** | New AC referral routes/views **or** extend follow-up UI; possibly migration if product elevates referrals beyond text+follow-up |
| **I. B1/B2 overlap** | High with ACN16 follow-up; medium with ACN15 referral field; low with public booking |
| **J. Platform vs AC** | Platform: worklist shell, status-history helper. AC: referral clinical semantics |

**Work type:** **UI + existing backend** if Stitch ≈ follow-up of pending referrals; **backend extension + possible migration** if Stitch shows full referral case management.

---

### AC-P03 — My Appointments

| Lens | Finding |
|------|---------|
| **A. Routes** | `GET /clinics/:clinicKey/patient/bookings` (+ dashboard `GET .../patient` aggregates upcoming/pending/past) |
| **B. Controller/service** | `activeClinicPatientPortalRoutes.js` → `listPatientBookings` (`activeClinicPatientPortalBookingService.js`) |
| **C. DB** | `public_booking_requests` (+ portal link events `020`/`024`); ownership via patient and/or platform identity |
| **D. RBAC** | Patient portal session (`requirePatientAuth`) — not staff RBAC |
| **E. Preserve** | Status filter semantics; ownership checks; no leakage of other patients’ bookings; CSRF on mutating sibling routes |
| **F. Shared UI** | Portal chrome (not staff shell); list/filter/empty patterns reusable at platform **only** if portal-safe |
| **G. Missing** | Stitch “appointments” naming vs current “bookings”; staff `appointments` table is **not** currently the portal list source |
| **H. Likely files** | `views/activeclinic/patient/bookings.ejs`, portal CSS, optional loader labeling |
| **I. B1/B2 overlap** | Low with staff appointments B2; do not conflate staff ACN06/08 with portal |
| **J. Platform vs AC** | Platform: session/CSRF. AC: booking ownership + status vocabulary |

**Work type:** **UI + existing backend**.

---

### AC-P04 — Appointment Detail & Reschedule

| Lens | Finding |
|------|---------|
| **A. Routes** | `GET /clinics/:clinicKey/patient/bookings/:reference`; `POST .../cancel`; `POST .../reschedule`. Guest token path also: `/clinics/:clinicKey/my-booking` (+ reschedule) |
| **B. Controller/service** | Portal booking get/cancel/reschedule services; public booking reschedule for guest tokens |
| **C. DB** | Booking request status transitions (`reschedule_requested`, etc.) |
| **D. RBAC** | Patient auth / guest token ownership |
| **E. Preserve** | Request-based reschedule (clinic confirms) — do not silently rewrite staff appointment slots without product decision; ownership; CSRF |
| **F. Shared UI** | Detail timeline, form sections; Stitch P26/P27 legacy screens in public project remain secondary to Batch 3 IDs above |
| **G. Missing** | Richer slot-picker UX if Stitch shows live availability; linkage to staff `appointments` when booking is confirmed/linked |
| **H. Likely files** | `patient/booking-detail.ejs`, portal booking service presentation, possibly public reschedule views if shared |
| **I. B1/B2 overlap** | Medium with staff appointment reschedule (ACN08 / AC-B2-05) — different actors; shared status vocabulary only |
| **J. Platform vs AC** | Platform: forms/timeline. AC: booking state machine |

**Work type:** **UI + existing backend** (backend extension if live slot selection required).

---

### AC-P05 — Visit Summaries

| Lens | Finding |
|------|---------|
| **A. Routes** | **None** on patient portal |
| **B. Controller/service** | Staff clinical notes/encounters exist; **no** patient-facing summary projector |
| **C. DB** | Source candidates: `encounters`, `consultation_notes` (signed), diagnoses — but **no** patient-publish / visit_summary table |
| **D. RBAC** | Would need explicit patient-safe release rules (not clinician `encounter.view`) |
| **E. Preserve** | Clinical privacy boundaries (`patient/data-boundaries`); never expose draft notes, full chart, or unrelated PHI |
| **F. Shared UI** | Portal list/detail; platform empty/filter |
| **G. Missing** | Publish/release workflow, patient list/detail routes, redaction policy, PDF/print optional |
| **H. Likely files** | New portal routes/views/services; possible `visit_summaries` or `patient_visible_artifacts` migration; clinician release UI (may be later) |
| **I. B1/B2 overlap** | High clinical-safety coupling with ACN15 note signing; MF11 “visit summaries” was exploration only |
| **J. Platform vs AC** | Platform: notification of “new summary available”. AC: clinical release rules + content projection |

**Work type:** **backend extension + database/migration potentially required**.

---

### AC-P06 — Invoices & Receipts (patient portal)

| Lens | Finding |
|------|---------|
| **A. Routes** | Staff only: `/app/billing/invoices`, `/app/cashier/receipt/:receiptNumber`. **No** `/clinics/:clinicKey/patient/invoices` (or similar) |
| **B. Controller/service** | `activeClinicBillingService` / cashier services — facility staff scoped |
| **C. DB** | `invoices`, `invoice_lines`, `payments`, `receipts`, allocations (`018`/`025`) |
| **D. RBAC** | Staff `billing.*` / `payment.*` — not portal |
| **E. Preserve** | Ledger integrity; SoD cashier vs billing; no clinical narrative on finance artifacts; money formatting |
| **F. Shared UI** | Portal list/detail; do **not** reuse staff billing EJS; money display helpers may be shared carefully |
| **G. Missing** | Patient-owned invoice/receipt list + detail (+ PDF/print); authz by `patient_id` / portal identity; hide staff-only fields |
| **H. Likely files** | New portal routes + read-only billing projection service; portal views; tests for cross-patient isolation |
| **I. B1/B2 overlap** | High with ACN21–23 / AC-B2-09 — consume stable billing APIs after staff passes land |
| **J. Platform vs AC** | Platform: list chrome. AC: invoice/receipt domain + patient projection |

**Work type:** **backend extension** (migration unlikely if invoices already patient-keyed; **maybe** portal access audit table).

---

### AC-P07 — Profile & Contact Details

| Lens | Finding |
|------|---------|
| **A. Routes** | `GET/POST /clinics/:clinicKey/patient/profile` (+ `security`, `data-boundaries`) |
| **B. Controller/service** | `getPatientProfile` / `updatePatientProfile` (`activeClinicPatientPortalProfileService.js`); phone field locals |
| **C. DB** | Patients + platform identity profile (`026`); portal identity (`020`) |
| **D. RBAC** | Patient auth; unverified portal-only accounts show notice without patient record |
| **E. Preserve** | Phone E.164 validation; limited editable fields; booking-only account notice; no chart edit from portal |
| **F. Shared UI** | Platform phone partial patterns; form chrome |
| **G. Missing** | Stitch field set / sectioning; communication prefs if Stitch shows opt-ins (platform prefs adapter) |
| **H. Likely files** | `patient/profile.ejs`, portal profile service field allow-list, portal CSS |
| **I. B1/B2 overlap** | Low; staff ACN11 consent is separate and must not merge into portal profile |
| **J. Platform vs AC** | Platform: phone/geo/prefs. AC: patient row field policy |

**Work type:** **UI + existing backend** (backend extension if prefs/consent blocks added).

---

### ACN27 — Locations Management

| Lens | Finding |
|------|---------|
| **A. Routes** | `GET /app/facilities`, `GET/POST /app/facilities/new`, `GET /app/facilities/:facilityKey`, edit/archive/set-primary. Departments remain under `/app/settings/clinic-setup/departments` |
| **B. Controller/service** | `activeClinicFacilityRoutes.js` → `loadActiveClinicFacilityScreens.js` → `facilityService.js` / `facilityRepository.js` |
| **C. DB** | `activeclinic.facilities` (`003`), staff assignments (`005`), departments (`022`), public hours helpers |
| **D. RBAC** | `activeclinic.facility.view|create|update|archive` |
| **E. Preserve** | Facility key uniqueness; primary facility rules; archive semantics; org/HCO scoping |
| **F. Shared UI** | Ideal `gp-ops-*` pilot (also called out in Batch 2 map for AC-B2-10) |
| **G. Missing** | Stitch “Locations” naming/IA; possible hours/map/contact fields already partial via public hours |
| **H. Likely files** | `facilities-*-content.ejs`, facility form, nav label; **coordinate with Batch 2 AC-B2-10** |
| **I. B1/B2 overlap** | **Highest conflict** with AC-B2-10 Departments & Facilities |
| **J. Platform vs AC** | Platform: list/form chrome. AC: HCO facility model (do not merge with BlessBoard branches) |

**Work type:** **UI-only adaptation** / **UI + existing backend** (no migration expected unless Stitch adds new location attributes).

---

## 6. Work-type summary matrix

| Screen | UI-only | UI + existing backend | Backend extension | DB/migration potential |
|--------|---------|------------------------|-------------------|------------------------|
| ACN17 Vitals | possible | **primary** | unlikely | No |
| ACN18 Clinical Documents | — | — | **required** | **Likely yes** |
| ACN19 Prescription Editor | possible | **primary** | if multi-line/catalogue | Maybe |
| ACN20 Referral Management | — | **if = follow-up** | **if full referral cases** | Maybe |
| AC-P03 My Appointments | — | **primary** | unlikely | No |
| AC-P04 Detail & Reschedule | — | **primary** | if live slots | Maybe |
| AC-P05 Visit Summaries | — | — | **required** | **Likely yes** |
| AC-P06 Invoices & Receipts | — | — | **required** | Unlikely / audit only |
| AC-P07 Profile | possible | **primary** | if prefs | Unlikely |
| ACN27 Locations | **primary** | yes | unlikely | No |

---

## 7. Shared components — platform vs ActiveClinic

### Prefer platform level

- `gp-ops-table` / `filter-bar` / `pagination` / `empty-state` / `status-badge` / `timeline` / `card`
- `parseListQuery` / list page result helpers
- Phone field + geography
- Session/CSRF/password reset primitives (already used by portal)
- Generic file storage + signed URL mechanism (for ACN18), with AC owning clinical metadata
- Notification dispatch shell (portal “summary ready” / “invoice ready”)

### Keep ActiveClinic-specific

- Encounter/vitals/order/pharmacy/diagnostics/billing domain services
- Patient portal booking ownership and status machine
- Facility/HCO location model
- Clinical privacy / patient-visible artifact release rules
- Staff app shell / portal shell (separate design systems; Batch 2 tokens `#2563EB`)

### Do not cross-import

- BlessBoard Sacred Modernity / member/giving screens
- Staff billing EJS into patient portal
- Website CMS media as clinical documents
- MF11 exploratory EHR screens as product authority (Batch 3 Stitch project above is authority)

---

## 8. Suggested Batch 3 implementation order (advisory only)

1. **ACN27** after Batch 2 facilities chrome settles (or strictly leaf CSS if B2 unfinished).
2. **ACN17** + **ACN19** leaf visual parity on existing routes (low schema risk).
3. **AC-P03 / AC-P04 / AC-P07** portal Stitch parity on existing bookings/profile.
4. **ACN20** decide product scope (follow-up vs full referral) before schema.
5. **AC-P06** read-only patient billing projection once staff billing passes stabilize.
6. **AC-P05** + **ACN18** last (privacy + storage + migrations).

---

## 9. Open questions for product / design

1. Is ACN20 a **follow-up of pending referrals** or a **first-class referral case manager**?
2. Are portal “appointments” strictly **public booking requests**, or must confirmed staff `appointments` appear once linked?
3. Who **releases** visit summaries to patients (auto on encounter complete vs clinician publish)?
4. Should ACN18 use platform media with an `ac.clinical_document` adapter, or a dedicated clinical blob store?
5. ACN27 vs AC-B2-10: single combined Locations+Departments workspace or locations-only Stitch with departments elsewhere?

---

## 10. Analysis limits

- Functional inventory originally captured at `f13c7916`; **reuse/collision kickoff rules** locked to frozen RC `6fb754ebef4c1bc652f1868b68b90ac96fbd8711` via Preparation Mode.
- Stitch `get_screen` HTML was not retrieved successfully in the initial analysis pass; visual field-level gap scoring is deferred to implementation agents **after** hosted QA gate.
- Do not start Batch 3 application work while B1+B2 hosted QA/freeze is pending.

---

**End markers**

BATCH_3_PREIMPLEMENTATION_ANALYSIS_COMPLETE  
BATCH_3_PREPARATION_MODE_ACTIVE  
FROZEN_B1_B2_RC_SHA: 6fb754ebef4c1bc652f1868b68b90ac96fbd8711  
FILES_MODIFIED: DOCS_ONLY  
IMPLEMENTATION_STARTED: NO
IMPLEMENTATION_AUTHORIZED: NO