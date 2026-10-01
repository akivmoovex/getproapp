# ActiveClinic Patient — Stitch-to-Code Gap Matrix

| Field | Value |
|-------|--------|
| **Doc ID** | `ACTIVECLINIC_PATIENT_STITCH_TO_CODE_GAP_MATRIX` |
| **Mode** | **READ-ONLY reconciliation** (no implementation) |
| **Design freeze** | PATIENT_PORTAL_SCREENS=8 · STAFF_PATIENT_SCREENS=11 · MISSING=0 · DUPLICATES=0 · DESIGN_GAPS=0 |
| **Audit inventory** | Expanded screen IDs below (portal AC-P01–P14 + staff ACN / ACN-P / AC-PT aliases) |
| **Product decisions applied** | AC-PD-01…05 (temporary V2.04) — see §0 |
| **Date** | 2026-10-01 |
| **Finish** | `ACTIVECLINIC_PATIENT_STITCH_CODE_RECONCILIATION_COMPLETE` |

**Method:** For each screen, verified route + handler + service/repository + persistence + view + tests where present. Routes alone are **not** treated as implementation.

**ID note:** V2.03 Batch 3 markers used `AC-P03`…`AC-P07` for bookings/visit-summary/invoices/profile. The frozen Stitch set renumbers portal screens as `AC-P01`…`AC-P14`. Matrix uses **freeze IDs**; historic markers noted under GAPS.

---

## 0. Temporary V2.04 product decisions (binding for this reconciliation)

| ID | Decision | Effect on gaps |
|----|----------|----------------|
| **AC-PD-01** | Standard app/DB audit logging only | Blockchain / SHA-256 chain / WORM / Victorian Health Cloud mirroring = **DEFERRED_BY_PRODUCT_DECISION** (Stitch labels illustrative) |
| **AC-PD-02** | Ordinary permitted documents via existing attachment infra | DICOM cine / PACS / imaging engine = **DEFERRED**; ordinary docs still in scope |
| **AC-PD-03** | No live Medicare ECLIPSE/API | Manual/stored claim refs OK in billing UI; automated submission = **DEFERRED** |
| **AC-PD-04** | Duplicate detect + compare / mark distinct / escalate | Destructive full merge = **DEFERRED** (already stubbed `merge_deferred`) |
| **AC-PD-05** | Existing RBAC + tenant/facility scope | Tier-2 / step-up clinical clearance architecture = **DEFERRED** (Stitch wording illustrative) |

Also preserved: **PD-V204-AC-01** — patient foundation **non-release-gated** until canonical AC Feature Spec; presentation/editor may be claimed.

---

## OUTPUT 1 — Implementation matrix

### Legend

| Column | Meaning |
|--------|---------|
| **STITCH** | Present in frozen patient design set (Y/N/alias) |
| **CURSOR** | Route + view present |
| **BACKEND** | Service + repo + real persistence |
| **REAL_DATA** | YES if live DB projection (not chrome-only) |
| **PARITY** | FULL / PARTIAL / NO vs frozen Stitch |
| **STATUS** | A–G classification (see goal) |

### A. Patient portal (AC-P01–P14)

| SCREEN | SURFACE | REQUIREMENT | STITCH | CURSOR | BACKEND | REAL_DATA | TESTS | SECURITY | PARITY | STATUS | GAP |
|--------|---------|-------------|--------|--------|---------|-----------|-------|----------|--------|--------|-----|
| AC-P01 Patient Login | Portal | AC-24 | Y | `/clinics/:clinicKey/patient/login` → `patient/login.ejs` · `activeClinicPatientPortalRoutes` · `activeClinicPatientPortalAuthService` | platform identity + session | YES | `activeclinic-patient-portal` · `mf08` | Session isolated from `/app`; tenant clinicKey | PARTIAL | **B** | New freeze visual parity; auth real |
| AC-P02 Registration / Activation | Portal | AC-10, AC-24 | Y | `/patient/register` (+ link-guest, verify-phone) · registration/password services | `patients` / portal identity / link events | YES | portal + mf08 | Org/HCO scoped link; enum-safe failures | PARTIAL | **B** | Stitch parity; activation/link flows exist |
| AC-P03 My Bookings | Portal | AC-24 + booking | Y (hist. Batch3 AC-P03) | `/patient/bookings` · `patient/bookings.ejs` · portal booking service | booking requests owned by patient/identity | YES | batch3 ACP03/07 · portal | Owner-scoped list SQL | PARTIAL | **B** | Marker remap + visual parity |
| AC-P04 Booking Detail / Reschedule | Portal | AC-24 + booking | Y (hist. AC-P04) | `/patient/bookings/:reference` + cancel/reschedule POSTs · `booking-detail.ejs` | get/cancel/reschedule owned booking | YES | batch3 ACP04 | `getPatientBooking` ownership clauses; foreign → not-found | PARTIAL | **B** | Stitch chrome; ownership enforced |
| AC-P05 Approved Visit Summary | Portal | AC-24 | Y (hist. AC-P05) | `/patient/visit-summaries` + `/:id` · visit-summary views · release service/repo | `patient_visit_summary_releases` | YES | `batch3-acp05` | Unreleased invisible; cross-patient/tenant NOT_FOUND | PARTIAL | **B** | PDF/private binary polish deferred historically; release gate real |
| AC-P06 My Invoices | Portal | AC-24 + billing | Y (hist. AC-P06) | `/patient/invoices` · `invoices.ejs` · portal billing service | `invoices` / `receipts` / payments | YES | `batch3-acp06` | Patient-owned only; staff billing chrome excluded | PARTIAL | **B** | List+receipts; no pay actions (intentional) |
| AC-P07 My Profile | Portal | AC-24 | Y (hist. AC-P07) | `/patient/profile` GET/POST · `profile.ejs` · portal profile service | `patients` demographics | YES | portal / ACP07 | Org + patientId scoped | PARTIAL | **B** | Combined view/edit vs multi-screen Stitch |
| AC-P08 Edit Contact Details | Portal | AC-24 | Y/alias | Same profile POST surface (phone/email/address fields) | same as P07 | YES | covered via profile tests | Same as P07 | PARTIAL | **B** | Often same Cursor screen as P07; may need dedicated Stitch route split |
| AC-P09 Consent & Communication Preferences | Portal | AC-11, AC-24 | Y | `/patient/notifications` · AC-SEC-01 EXISTING_STORE | `platform.communication_preferences` (043); clinical consent staff-only | YES | `ac-sec-01-preferences` · `backend-and-ui-p09-p13` | Own patient+org; forged IDs denied; no clinical consent write | YES | **B** | AC-SEC-01 **CLOSED**; clinical vs comms distinguished |

| AC-P10 My Prescriptions | Portal | AC-17, AC-24 | Y | `/patient/prescriptions` + `/:id` read-only | `pharmacy_prescriptions` patient projection | YES | `backend-and-ui-p09-p13` | Own patient only; no prescribe/edit | YES | **B** | Read-only portal Rx |
| AC-P11 My Referrals | Portal | AC-18, AC-24 | Y | `/patient/referrals` + `/:id` read-only | `clinical_follow_up_items` `pending_referral` | YES | `backend-and-ui-p09-p13` | Own patient; staff owner fields stripped | YES | **B** | Read-only portal referrals |
| AC-P12 Documents & Results | Portal | AC-16, AC-24 | Y | `/patient/documents` + `/:modality/:id` | Released lab/radiology only (`status=released`); staff release authz | YES | `backend-and-ui-p09-p13` | Unreleased never listed; cross-patient 404 | YES | **B** | Diagnostics release gate (AC-PD-02); ACN18 clinical_docs stay staff-only (no patient_release column; 0 migrations) |
| AC-P13 Invoice / Receipt Detail | Portal | AC-24 + billing | Y | `/patient/invoices/:id` detail leaf | `getPatientInvoice` + lines/receipts | YES | `backend-and-ui-p09-p13` | Own invoice only; notes omitted | YES | **B** | No Medicare API; no finance notes |
| AC-P14 Security / Access States | Portal | AC-24 | Y | `/patient/security`, `data-boundaries`, `offline`, verify/recovery/password-updated | password + session services | YES | portal suite | Auth gates; clinic not-found | PARTIAL | **B** | Stitch state coverage vs existing templates |

**Portal subtotal (14):** A=0 · B=14 · C=0 · D=0 · E=0 · F=0 · G=0

### B. Staff patient management (freeze + historical + intake)

| SCREEN | SURFACE | REQUIREMENT | STITCH | CURSOR | BACKEND | REAL_DATA | TESTS | SECURITY | PARITY | STATUS | GAP |
|--------|---------|-------------|--------|--------|---------|-----------|-------|----------|--------|--------|-----|
| ACN-P01 Edit Patient Demographics | Staff | AC-10 | Y | `/app/patients/:patientNumber/edit` + profile POST · `patient-form` / profile | `updateActiveClinicPatient` / domain façade | YES | foundation · batch1a · ui-parity · v2-04 domain | RBAC `patient.*` + HCO scope | PARTIAL | **B** | Alias of ACN11 edit; new Stitch chrome |
| ACN-P02 Patient Clinical History | Staff | AC-14 | Y | **Yes** `/app/patients/:patientNumber/clinical-history` → `patient-clinical-history-content.ejs` | `listPatientEncounters` (list only; no note bodies) | YES | `ui-only-patient-history-activity` | `patient.view` + `encounter.view` | YES | **B** | Aggregate history leaf implemented (UI_ONLY batch) |
| ACN-P03 Patient Documents & Attachments | Staff | AC-16 | Y | `/app/clinical/patients/:patientId/documents*` | clinical document service + tables | YES (metadata; **binaries deferred**) | `batch3-acn18` | Staff permissions + patient scope | PARTIAL | **B** | Ordinary attachments OK (AC-PD-02); DICOM/PACS **F** |
| ACN-P04 Patient Activity / Audit History | Staff | AC-10/privacy | Y | **Yes** `/app/patients/:patientNumber/activity` → `patient-activity-content.ejs` | `auditEventRepository.listAuditEvents` (patient-scoped) | YES | `ui-only-patient-history-activity` | `patient.view` + `patient.audit_view` | YES | **B** | Standard audit timeline (AC-PD-01); not WORM/ledger |
| ACN10 Directory & Duplicate Prevention | Staff | AC-10, AC-12 | Y | `/app/patients` · list loader | register + duplicate engine | YES | foundation · batch1a · rbac · ui-parity | Org-scoped dup; override audited; merge deferred | PARTIAL | **B** | New Stitch directory chrome; AC-PD-04 satisfied (no full merge) |
| ACN11 Profile & Consent | Staff | AC-11 | Y | `/app/patients/:patientNumber` + consents POSTs | consent service + patients | YES | batch1a · foundation | Facility/HCO + RBAC; consent clinic-local | PARTIAL | **B** | Consent ledger UI plainer than Stitch |
| ACN12 Check-In | Staff | AC-13 | Y | `/app/reception/check-in` (+ walk-in) | reception/queue services | YES | batch1a | Reception department + perms | PARTIAL | **B** | — |
| ACN13 Live Queue / Triage | Staff | AC-13 | Y | `/app/reception` + queue detail/call-board | queue persistence | YES | batch1a | Reception scope | PARTIAL | **B** | — |
| ACN14 Practitioner Worklist | Staff | AC-14 | Y | `/app/clinical` | clinical + appointments + queue | YES | clinical pass tests | Clinical roles | PARTIAL | **B** | — |
| ACN15 Clinical Encounter Workspace | Staff | AC-14 | Y | `/app/clinical/encounter/:id` | encounters + notes/orders | YES | clinical | Clinical RBAC (not Tier-2 — AC-PD-05) | PARTIAL | **B** | Tier-2 Stitch labels illustrative only |
| ACN16 Follow-up / Recall | Staff | AC-19 | Y | `/app/clinical/follow-up` | `clinical_follow_up_items` | YES | clinical | Clinical RBAC | PARTIAL | **B** | — |
| ACN17 Vitals | Staff | AC-15 | Y | `/app/clinical/encounter/:id/vitals` | observations | YES | batch3 ACN17/19 | Clinical RBAC | PARTIAL | **B** | — |
| ACN19 Prescriptions (staff) | Staff | AC-17 | Y | encounter order prescription + pharmacy queue | clinical orders + pharmacy | YES | batch3 · pharmacy | Staff/pharmacy RBAC | PARTIAL | **B** | Not patient portal |
| ACN20 Referrals (staff) | Staff | AC-18 | Y | `/app/clinical/referrals` | follow-up/referral items | YES | batch3 ACN20 | Clinical RBAC | PARTIAL | **B** | Not patient portal |
| AC-PT02 Add Patient Identity | Staff intake | AC-10 | Y | `/app/patients/new` multi-step (find/identity) · domain façade | register + person workflow | YES | v2-04-ac-patient-domain · ui-parity | CREATE perm; clinical fields forbidden on create | PARTIAL | **B** | Stitch wizard vs utilitarian form |
| AC-PT03 Contact & Address | Staff intake | AC-10 | Y | same create/edit form steps | patients address fields | YES | domain / foundation | same | PARTIAL | **B** | Legacy viewport asymmetry — §Responsive |
| AC-PT04 Next of Kin | Staff intake | AC-10 | Y | emergency contacts on create/profile | `patient_emergency_contacts` | YES | foundation | scoped | PARTIAL | **B** | Legacy viewport asymmetry |
| AC-PT05 Possible Patient Match | Staff intake | AC-12 | Y | duplicate warning UI on create | duplicate service + shared engine | YES | ui-parity · rbac · foundation | Override reason; no auto-merge | PARTIAL | **B** | Aligns AC-PD-04 |
| AC-PT06 Registration Review | Staff intake | AC-10 | Y | review step before POST `/app/patients` | same create path | YES | ui-parity | CSRF + RBAC | PARTIAL | **B** | Legacy viewport asymmetry |
| AC-PT07 Patient Created | Staff intake | AC-10 | Y | `patient-success-content.ejs` / redirect to profile | created patient row | YES | ui-parity | — | PARTIAL | **B** | Legacy viewport asymmetry |
| AC-PT08 Legacy Edit Demographics | Staff | AC-10 | alias | `/app/patients/:n/edit` | same as ACN-P01 | YES | same | same | PARTIAL | **B** | Duplicate of ACN-P01 / ACN11 edit — **dedupe** |

**Staff notes:** ACN18 clinical documents staff path covered under ACN-P03. Rooms ACN27 out of patient design freeze.

---

## Functional requirement mapping

| REQ | Cursor coverage | Dominant STATUS | Notes |
|-----|-----------------|-----------------|-------|
| AC-10 Patient registration | Staff ACN10/11 + AC-PT* + domain façade | B | Portal register = identity link (AC-P02), not staff create |
| AC-11 Consent management | ACN11 ledger | B | Portal AC-P09 **not** the clinical ledger |
| AC-12 Duplicate prevention | ACN10 + AC-PT05 | B | Full merge **F** (AC-PD-04) |
| AC-13 Check-in / queue | ACN12/13 | B | — |
| AC-14 Clinical encounter | ACN14/15 (+ ACN-P02 history leaf) | B | Aggregate history UI_ONLY batch complete |
| AC-15 Vitals | ACN17 | B | — |
| AC-16 Document attachments | ACN-P03 / ACN18 staff | B + F(DICOM) | Portal AC-P12 **E** |
| AC-17 Prescription | Staff ACN19/pharmacy | B | Portal AC-P10 **E** |
| AC-18 Referral | Staff ACN20 | B | Portal AC-P11 **E** |
| AC-19 Follow-up | ACN16 | B | — |
| AC-24 Patient portal | AC-P01–P08, P14, P05–P06 | B | P09–P13 gaps |
| Appointments (portal) | AC-P03/P04 | B | — |
| Billing (portal) | AC-P06; P13 gap | B / D | Medicare live claim **F** (AC-PD-03) |

---

## Security / privacy audit (enforcement vs visual)

| Control | Evidence | Verdict |
|---------|----------|---------|
| Patient only own record | Portal auth binds `patientId` + org/HCO; profile/booking/invoice/summary queries filter owner | **ENFORCED** (core paths) |
| No patient ID enumeration | Visit summary + booking get return not-found; invoice list omits foreign | **ENFORCED** on tested paths; booking/invoice detail enumeration **proof uneven** (summary strong) |
| Clinic/tenant isolation | ClinicKey → org; SQL tenant_id / organization_id | **ENFORCED** |
| Facility scoping | Staff facility assignments; reception/clinical loaders | **ENFORCED** where applicable |
| Staff RBAC | `requirePermission` / role catalogue | **ENFORCED** |
| Reception cannot see restricted clinical notes | Catalogue omits clinical perms for `activeclinic_receptionist`; **AC-SEC-02** same-tenant HTTP denial suite `activeclinic-ac-sec-02-reception-clinical-notes.test.js` | **ENFORCED** |
| Unreleased result ≠ portal | `getReleasedSummaryForPatient`; ACP05 tests | **ENFORCED** for visit summaries |
| Unverified contact ≠ recovery | Portal recovery phone-normalized path; email-as-recovery not implemented as OTP channel | **MOSTLY ENFORCED**; add explicit negative test |
| Document release server-side | Staff docs exist; **portal documents absent** | **N/A live leak**; gap when AC-P12 built |
| Invoice/receipt patient-owned | ACP06 tests | **ENFORCED** (list) |
| Rx/referrals read-only for patient | No portal write/read routes | **N/A** until AC-P10/11 exist (must ship read-only) |
| Portal errors hide existence | not-found templates; neutral copy on auth | **PARTIAL** — keep for new leaves |

**CRITICAL_SECURITY_GAPS (live or proof):**

1. ~~**AC-SEC-01 / AC-P09** portal notifications without durable preference persistence~~ → **CLOSED** — uses existing `platform.communication_preferences` (EXISTING_STORE); clinical consent remains staff ACN11; tests `activeclinic-ac-sec-01-preferences.test.js`.  
2. ~~**AC-SEC-02 / Reception → restricted clinical notes**~~ → **CLOSED** — catalogue DENIED (no grant change); focused same-tenant denial + practitioner/nurse/tenant/facility proof in `activeclinic-ac-sec-02-reception-clinical-notes.test.js`.

---

## OUTPUT 2 — Gap groups

### 1. PARITY_ONLY

Existing functionality works; Stitch visual/alignment needed.

- AC-P01, P02, P03, P04, P05, P06, P07, P08, P14  
- ACN10–17, ACN19–20, ACN-P01, ACN-P03 (metadata UI), AC-PT02–08 (utilitarian vs freeze Stitch)

### 2. UI_ONLY

Backend exists; dedicated screen/view thin or missing.

- ~~ACN-P02 clinical history **aggregate** view~~ → **IMPLEMENTED** (staff leaf + real encounters)  
- ~~ACN-P04 patient activity timeline~~ → **IMPLEMENTED** (standard audit, AC-PD-01)  
- AC-P08 if Product requires a separate route from P07 (same backend) — not in this batch count

**UI_ONLY remaining for this matrix count: 0** (batch complete: 2/2).

### 3. BACKEND_AND_UI

Real implementation work required.

- ~~AC-P09 portal consent/communication preferences~~ → **IMPLEMENTED** (platform prefs; clinical consent unchanged)  
- ~~AC-P10 patient prescriptions read projection~~ → **IMPLEMENTED**  
- ~~AC-P11 patient referrals read projection~~ → **IMPLEMENTED**  
- ~~AC-P12 patient documents/results~~ → **IMPLEMENTED** (released diagnostics; ACN18 clinical docs remain staff-only without patient_release column)  
- ~~AC-P13 invoice/receipt detail~~ → **IMPLEMENTED**  

**BACKEND_AND_UI remaining: 0** (batch complete: 5/5).

### 4. TEST_ONLY

Behavior likely exists; proof missing or weak.

- ~~Receptionist denied restricted clinical encounter notes~~ → **PROVEN** (AC-SEC-02)  
- Portal recovery rejects unverified email as recovery channel (explicit)  
- Portal foreign booking-reference enumeration (extend ACP04)  
- ~~Portal invoice detail ownership (when P13 built)~~ → covered by ACP06 / AC-P13 implementation path (not counted as open TEST_ONLY)

### 5. DEFERRED_BY_PRODUCT_DECISION

- DICOM / PACS / cine viewer (AC-PD-02)  
- Live Medicare ECLIPSE/API claiming (AC-PD-03)  
- Full destructive patient merge (AC-PD-04; stub already `merge_deferred`)  
- Tier-2 / step-up clinical clearance architecture (AC-PD-05)  
- Cryptographic / WORM / SHA-chain / special cloud audit ledger (AC-PD-01)  
- ACN18 private binary attachment depth (pre-existing deferral; ordinary docs still in scope)

### 6. NO_ACTION

- Merge permission unassigned + stub deferred (correct under AC-PD-04)  
- Visit summary release gate (ACP05)  
- Invoice list ownership (ACP06)  
- Staff duplicate override without auto-merge  
- Patient domain clinical-boundary on Add Patient façade  

---

## OUTPUT 3 — Implementation batches (do **not** implement yet)

### BATCH 1 — Patient Portal missing UI backed by existing services

| | |
|--|--|
| **SCREENS** | AC-P13 (if detail can project from existing invoice/receipt rows); optional AC-P08 route split from P07; Stitch parity wrappers for P01–P07/P14 |
| **FILES/AREAS** | `activeClinicPatientPortalRoutes.js`, `activeClinicPatientPortalBillingService.js`, `views/activeclinic/patient/*`, `ac-patient.css` |
| **DEPENDENCIES** | None beyond existing billing tables |
| **MIGRATIONS_REQUIRED** | **0** (prefer) |
| **RISK** | Low — read-only projections |
| **ESTIMATED_COMPLEXITY** | **LOW** |

### BATCH 2 — Patient Portal backend + UI functionality

| | |
|--|--|
| **SCREENS** | AC-P09, AC-P10, AC-P11, AC-P12 (+ finish P13 if Batch 1 insufficient) |
| **FILES/AREAS** | New portal services for Rx/referrals/docs release; prefs store; document release flags; portal routes/views; reuse clinical/pharmacy/doc tables |
| **DEPENDENCIES** | Staff release rules for docs/results; read-only contracts; AC-PD-02 (no DICOM) |
| **MIGRATIONS_REQUIRED** | **Maybe 0–1** (prefs and/or `patient_release` flags if not already modeled) — plan without PACS |
| **RISK** | **High** — PHI to portal; must fail closed |
| **ESTIMATED_COMPLEXITY** | **HIGH** |

### BATCH 3 — Staff Patient Management parity/gaps

| | |
|--|--|
| **SCREENS** | ACN-P01–P04 Stitch parity; AC-PT* wizard parity; ACN-P02 history leaf; ACN-P04 activity timeline (standard audit) |
| **FILES/AREAS** | `activeClinicPatientRoutes.js`, `loadActiveClinicPatientScreens.js`, app patient/clinical views, domain façade |
| **DEPENDENCIES** | AC-PD-01/04/05; no merge UI |
| **MIGRATIONS_REQUIRED** | **0** |
| **RISK** | Medium (RBAC regressions on create/edit) |
| **ESTIMATED_COMPLEXITY** | **MEDIUM** |

### BATCH 4 — Security / privacy / isolation tests

| | |
|--|--|
| **SCREENS** | Cross-cutting (P04/P05/P06/P09–P12, reception vs clinical) |
| **FILES/AREAS** | `tests/activeclinic-patient-portal*.js`, batch3 ACP*, clinical RBAC negatives |
| **DEPENDENCIES** | Stable routes from Batches 1–2 |
| **MIGRATIONS_REQUIRED** | **0** |
| **RISK** | Low |
| **ESTIMATED_COMPLEXITY** | **LOW–MEDIUM** |

---

## Responsive legacy check (Stitch viewport asymmetries)

| Gap | Classification | Rationale |
|-----|----------------|-----------|
| AC-PT03 desktop missing | **EXISTING_REPLACEMENT_COVERS_IT** | Contact/address captured on `/app/patients/new` + edit/profile; not a release blocker |
| AC-PT04 desktop missing | **EXISTING_REPLACEMENT_COVERS_IT** | NOK/emergency contacts on create/profile |
| AC-PT06 mobile missing | **EXISTING_REPLACEMENT_COVERS_IT** | Registration review step exists on create flow |
| AC-PT07 desktop missing | **EXISTING_REPLACEMENT_COVERS_IT** | Success content / profile redirect exists |

None are release blockers while replacements cover the workflow. Optional **NEEDS_DESIGN** only if Product demands 1:1 Stitch viewport pairs for marketing screenshots.

**LEGACY_VIEWPORT_GAPS=4** (all covered by replacement).

---

## Deduplication map (same function, multiple IDs)

| Canonical Cursor surface | Also known as |
|--------------------------|---------------|
| `/app/patients` directory + duplicates | ACN10, AC-PT05 (match step) |
| `/app/patients/:n` profile + consents | ACN11 |
| `/app/patients/:n/edit` | ACN-P01, AC-PT08 |
| `/app/patients/new` wizard | AC-PT02–07 |
| `/app/clinical/patients/:id/documents*` | ACN-P03, ACN18 |
| Portal `/patient/profile` | AC-P07 + much of AC-P08 |
| Portal bookings | Freeze AC-P03/P04 ≡ hist. Batch3 AC-P03/P04 |
| Portal invoices list | Freeze AC-P06 ≡ hist. Batch3 AC-P06 |

---

## Count rollup (matrix rows)

| Class | Portal | Staff (unique functions; aliases not double-counted in totals below) |
|-------|--------|------|
| A FULLY_IMPLEMENTED | 0 | 0 |
| B PARITY / IMPLEMENTED_NEEDS_STITCH_PARITY | 14 | 13 design-freeze-equivalent staff surfaces (directory, profile/consent, check-in, queue, worklist, encounter, follow-up, vitals, staff Rx, staff referrals, intake/duplicates, **ACN-P02 history**, **ACN-P04 activity**) plus ACN-P03 docs metadata |
| C UI_MISSING_BACKEND_EXISTS | 0 | 0 |
| D PARTIAL_BACKEND_AND_UI | 0 | 0 |
| E NOT_IMPLEMENTED | 0 | 0 |
| F DESIGN_ONLY_DEFERRED | 0 (deferred items listed in §Output 2.5, not as missing freeze screens) | — |
| G PRODUCT_DECISION_REQUIRED | 0 | 0 (AC-PD-01…05 already decided) |

**PATIENT_PORTAL_TOTAL** = 14 audited freeze-list screens (design freeze package count remains 8 screens delivered in Stitch; inventory expands to P01–P14).  
**STAFF_PATIENT_TOTAL** = 11 design-freeze staff screens (reconciled via ACN/ACN-P/AC-PT aliases above).

Gap-bucket totals (unique work items, not screen alias duplicates):

| Bucket | n | Items |
|--------|---|-------|
| FULLY_IMPLEMENTED | 0 | — |
| PARITY_ONLY | 27 | Portal B×14 + core staff B surfaces (~13 incl. ACN-P02/P04) |
| UI_ONLY | 0 | ACN-P02 + ACN-P04 implemented in UI_ONLY batch |
| BACKEND_AND_UI | 0 | P09–P13 implemented in BACKEND_AND_UI batch |
| TEST_ONLY | 2 | Recovery email negative; booking enum proof extension (reception clinical denial proven) |
| DEFERRED | 6 | DICOM/PACS; Medicare ECLIPSE; full merge; Tier-2; WORM/crypto audit; ACN18 deep binaries |
| NO_ACTION | — | See §Output 2.6 |

**MIGRATIONS_REQUIRED** for recommended path: **0** forced; Batch 2 may introduce at most one prefs/release migration after design — counted **0** until chosen.

---

```
PATIENT_PORTAL_TOTAL=14
STAFF_PATIENT_TOTAL=11
FULLY_IMPLEMENTED=0
PARITY_ONLY=27
UI_ONLY=0
BACKEND_AND_UI=0
TEST_ONLY=2
DEFERRED=6
CRITICAL_SECURITY_GAPS=0
MIGRATIONS_REQUIRED=0
LEGACY_VIEWPORT_GAPS=4
UI_ONLY_BATCH=ACN-P02,ACN-P04
BACKEND_AND_UI_BATCH=AC-P09,AC-P10,AC-P11,AC-P12,AC-P13
AC_SEC_01=CLOSED
AC_SEC_01_MODE=EXISTING_STORE
AC_SEC_02=CLOSED
AC_SEC_02_RECEPTIONIST_CLINICAL_PERMISSION=DENIED
CRITICAL_SECURITY_GAPS=0
UI_ONLY=0
BACKEND_AND_UI=0
TEST_ONLY=2
PARITY_ONLY=27
FINAL=AC_PATIENT_GAP_COUNTS_REFRESHED
```
