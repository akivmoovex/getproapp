# V2.03 QA — ActiveClinic Batch 2 Test Readiness (QA08)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_AC_BATCH2_TEST_READINESS` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | QA07 · Frozen Batch 2 Stitch `7300898757945019896` · [BATCH2_STITCH_IMPLEMENTATION_MAP](../v2.03/V2_03_BATCH2_STITCH_IMPLEMENTATION_MAP.md) · [BATCH2_RBAC_ISOLATION_AUDIT](./V2_03_BATCH2_RBAC_ISOLATION_AUDIT.md) |
| **Mode** | MAP + ADD high-value tests (mutations / clinical / permissions / facility / transitions / validation) |
| **Proof rule** | Functional + authz assertions — **not** line coverage alone |
| **Verdict** | **`V203_AC_BATCH2_TEST_READINESS_PASS`** |

---

## Screen → implementation map (AC-B2-01…10)

| Screen | Route | Controller / service | DB (primary) | RBAC | Automated tests | Class |
|--------|-------|----------------------|--------------|------|-----------------|-------|
| **AC-B2-01** Dashboard | `GET /app` | `activeClinicAppRoutes` · `loadActiveClinicDashboardHome` | capability tiles / facility context | `activeclinic.access` | batch2-dashboard · shell · QA08 | STRONG |
| **AC-B2-02** Patients | `GET /app/patients` | patient routes/screens/service | `patients` | `patient.search/view` | batch2-patient-workspace · rbac · QA08 | STRONG |
| **AC-B2-03** Profile summary | — | — | — | — | **ABSENT from frozen Stitch** (B1 profile deep-link only) | N/A |
| **AC-B2-04** Appointments | `GET /app/appointments` (+ calendar) | appointment routes/service | `appointments` | `appointment.view` | batch2-appointments · QA08 transitions | STRONG |
| **AC-B2-05** Appt detail | `GET /app/appointments/:id` + status POSTs | status machine + events | status events | check-in/cancel/update | batch2-appointments · QA08 lifecycle | STRONG |
| **AC-B2-06** Clinical encounter | `/app/clinical/encounter/:id` | clinical routes/service | encounters + consultation notes | encounter/consultation keys | batch2-clinical-encounter · rbac · QA08 clinical facility | STRONG |
| **AC-B2-07** Pharmacy | `GET /app/pharmacy` (+ queue) | pharmacy routes/service | prescriptions / inventory | `pharmacy.view/dispense` | batch2-operational-queues · rbac · QA08 dispense validation | STRONG |
| **AC-B2-08** Diagnostics | `GET /app/diagnostics` (+ lab/rad queues) | diagnostics routes/service | lab/rad requests | diagnostics.* + **department** gate | batch2-operational-queues · rbac | STRONG |
| **AC-B2-09** Billing | `/app/billing*` · invoices | billing routes/service · finance authz | invoices / charges | billing.* · cashier SoD | batch2-billing · rbac · QA08 post immutability | STRONG |
| **AC-B2-10** Facilities/Depts | `/app/facilities` · departments settings | facility + department services | facilities / departments | facility.* · `departments.manage` | batch2-facilities · rbac · QA08 dept validation | STRONG |

Shared shell: `app-shell.ejs` · sidebar · bottom tabs · `ac-app.css` (256px / 390 companion). Evidence also in `batch2-shell` + `batch2-rbac-isolation`.

---

## Added this pass

`tests/v203-ac-batch2-test-readiness.test.js`

| Priority | Coverage |
|----------|----------|
| Mutations | Consultation note write; encounter close; invoice post; department create attempts; pharmacy dispense gate |
| Clinical data | Persisted HPI/assessment text asserted after `recordConsultationNote` |
| Permissions | Unauth hubs; receptionist denied dispense |
| Facility scope | Encounter start/read denied outside assigned facility |
| Status transitions | Appt confirmed → illegal complete → arrived → waiting → with_practitioner → completed → illegal re-complete; invoice double-post → `immutable_record` |
| Validation | Invalid department type/empty name; empty dispense items |

`npm run test:v203:ac-batch2`

---

## Verification

```text
node --test --test-concurrency=1 tests/activeclinic-batch2-*.test.js tests/v203-ac-batch2-test-readiness.test.js
→ 35 pass / 0 fail
V203_AC_BATCH2_TEST_READINESS_PASS
```

---

## AUTOMATED

| Area | Evidence |
|------|----------|
| Desktop Batch 2 hubs + Stitch markers | batch2-* + QA08 inventory/nav |
| 390 companion CSS (where shipped) | batch2 suites assert `@media (max-width: 390px)` packs |
| Navigation / shell | batch2-shell (bottom tabs, check-in CTA, restricted role) |
| Mutations + clinical persistence | batch2-clinical-encounter + QA08 consultation note/close |
| Permissions / SoD / forged IDs | batch2-rbac-isolation (+ billing/cashier SoD) |
| Facility / tenant / department scope | rbac-isolation + QA08 encounter facility deny |
| Status transitions | QA08 appointment lifecycle + invoice post immutability |
| Validation | QA08 department type/name; pharmacy empty dispense |
| Lab ↔ radiology department boundary | batch2-operational-queues + rbac |

---

## MANUAL_QA_REQUIRED

| Item | Why |
|------|-----|
| Visual Stitch parity 1440/390 for B2-01…10 | Composition CSS automated; pixel judgment not |
| Canonical AC-B2-09 Stitch variant pick | Duplicate desktop/mobile assets in Stitch inventory |
| AC-B2-03 | Absent from frozen Stitch — no Batch 2 visual target |
| Hosted authenticated journey | Prior hosted gates had deploy/schema lag risk |
| Deep pharmacy dispense / diagnostics specimen UX | Hub/queue + authz automated; full dispense happy-path UX manual |
| Mobile bottom-nav feel vs Stitch `h-14` | Shell tabs wired; visual timing manual |

---

## DEFECTS

**None** found this pass (no STOP / no application defect classification).

---

## Marker

```text
V203_AC_BATCH2_TEST_READINESS_PASS

AUTOMATED: Batch2 suites (27) + QA08 readiness (8) = 35 pass
MANUAL_QA_REQUIRED: visual 1440/390; B2-09 canonical Stitch pick; B2-03 N/A; hosted auth journey; deep pharmacy/diagnostics UX
DEFECTS: none
```
