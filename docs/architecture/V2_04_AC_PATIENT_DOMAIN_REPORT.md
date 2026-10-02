# V2.04 — ActiveClinic Staff Add Patient Domain Foundation

## Phase 5 Implementation Report

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_AC_PATIENT_DOMAIN_REPORT` |
| **Phase** | 5 — STAFF ADD PATIENT FOUNDATION |
| **Branch** | `V4` |
| **Date** | 2026-09-30 |
| **UI / Stitch** | **Not implemented** |
| **Parallel patient stack** | **Not created** |

---

## 1. Architecture decision

Staff Add Patient is a **domain façade** over existing ACN10 / ACN11:

| Concern | Owner |
|---------|--------|
| Registration insert / facility link / Patient Number allocate | `registerActiveClinicPatient` (ACN10) |
| Duplicate candidate fetch + shared engine scoring | `activeClinicPatientDuplicateService` (ACN10 + Phase 2) |
| Demographic / NOK / address update | `updateActiveClinicPatient` (ACN11) |
| Consent ledger | `activeClinicPatientConsentService` (ACN11) — untouched |
| Person create/reuse + audit orchestration | Platform `runStaffManagedPersonWorkflow` (Phase 3) |
| Staff domain rules + RBAC aliases + clinical boundary | `activeClinicPatientDomainService` (**this phase**) |

**No** new `patients` table, **no** second numbering system, **no** final Stitch pages.

---

## 2. Patient Number policy (preserved)

Existing ACN policy retained — **not** silently replaced:

| Rule | Implementation |
|------|----------------|
| Format | `AC-YYYY-NNNNNN` (`generateActiveClinicPatientNumber`) |
| Scope | **HCO-unique** — `UNIQUE (healthcare_organization_id, patient_number)` |
| Allocation | Server-side `activeclinic.patient_number_counters` per HCO + year |
| Mutability | Immutable (DB trigger `prevent_patient_number_change`) |
| Client supply | Staff create does **not** accept client allocation; probe-only for duplicates |

Documented as `PATIENT_NUMBER_POLICY` in `patientDomainConstants.js`.

### Difference vs BlessBoard Church ID

| | ActiveClinic Patient Number | BlessBoard Church ID |
|--|----------------------------|----------------------|
| Allocator | Server counter | Church-controlled assign |
| Scope | Healthcare organization | Church organization |
| Staff manage permission | N/A (immutable after create) | `members.manage_church_id` |
| Format | Fixed `AC-YYYY-NNNNNN` | Product-defined `member_number` |

---

## 3. Portal vs patient record

- Patient record **does not require** portal activation.
- Portal access is derived from `platform_identity_id` linkage:
  - `none` — staff-created default
  - `linked` / `active` — after portal identity attach
- Unlike BlessBoard’s explicit `portal_access_status` column, AC keeps the existing identity-linked model and exposes `derivePortalAccessStatus` in the domain layer.

---

## 4. Fields supported (backend, no UI)

Create / demographic edit:

- full name (or first/middle/last), DOB, sex
- phone, email (when available)
- address
- next of kin, emergency contacts
- HCO, facility context
- patient status (`active` / `inactive` at create)
- Patient Number (server-allocated)

---

## 5. Permissions (platform RBAC)

Reuses seeded ACN10/11 catalogue keys:

| Spec alias | Catalogue key |
|------------|---------------|
| `patients.view` | `activeclinic.patient.view` |
| `patients.create` | `activeclinic.patient.create` |
| `patients.edit` | `activeclinic.patient.update` |

`resolvePermissionKey` accepts either form. Roles receive permissions — no hard-coded Reception/Doctor authorization.

**Clinical boundary:** demographics create/edit does **not** imply clinical read/write. Forbidden on these paths: encounters, diagnoses, observations, prescriptions, referrals, clinical notes/documents.

---

## 6. Duplicate check

- Uses shared Phase 2 engine via existing ACN10 `findPotentialPatientDuplicates`.
- Candidate fetch remains **HCO-scoped** — no cross-HCO patient exposure.
- Exact identifier conflict → `IDENTIFIER_CONFLICT`.
- Shared phone → warning / override path (existing ACN10 strength mapping preserved).

---

## 7. Artifacts

| Path | Role |
|------|------|
| `src/activeclinic/services/patientDomainConstants.js` | Statuses, permission aliases, number policy, clinical forbid list |
| `src/activeclinic/services/activeClinicPatientDomainService.js` | Staff create/update, duplicates, person reuse, gates |
| `src/activeclinic/services/activeClinicStaffPatientWorkflowAdapter.js` | Phase 3 adapter (unchanged contract; still composes register) |
| `tests/v2-04-ac-patient-domain.test.js` | Phase 5 suite |

Domain entry points:

- `createStaffManagedPatient`
- `updatePatientDemographics`
- `evaluateStaffPatientDuplicates`
- `checkStaffPatientIdentifierConflict`
- `findReusablePersonForPatient`

---

## 8. Audit

- Create: `activeclinic.patient.create` (+ workflow `person.staff_workflow.completed`)
- Demographic update: `activeclinic.patient.update` with field keys; `clinical_fields_accepted: false`

---

## 9. Tests

Coverage:

- patient creation (portal `none`, Patient Number present)
- duplicate warning
- duplicate identifier conflict
- shared phone warning surface
- tenant / HCO isolation
- RBAC (`patients.create` / `patients.edit` aliases + denial)
- patient without portal
- clinical field rejection
- Patient Number immutability
- person reuse (exact / ambiguous)
- ACN10/11 regression smoke (exports + no parallel migration)

Evidence: Phase 5 + Phase 3 suites **33 pass / 0 fail**.

---

## 10. Explicit non-goals

- No final Stitch Add Patient / Profile pages
- No clinical data moved into platform person
- No replacement of ACN10 directory UI or ACN11 consent ledger
- No production migration apply / deploy
- No automatic portal invite on staff create

---

PHASE5_AC_STAFF_PATIENT_PASS
