# V2.03 QA — ActiveClinic Batch 1 Test Readiness (QA07)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_AC_BATCH1_TEST_READINESS` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | QA06 · Frozen Batch 1 Stitch ODS `12134201997833374170` · [AC_BATCH1_STITCH_PARITY](../v2.03/AC_BATCH1_STITCH_PARITY.md) · [BATCH1_IMPLEMENTATION_AUDIT](../v2.03/ACTIVECLINIC_BATCH1_IMPLEMENTATION_AUDIT.md) |
| **Mode** | MAP + ADD high-value tests only (no screen redesign) |
| **Verdict** | **`V203_AC_BATCH1_TEST_READINESS_PASS`** |

---

## Screen → implementation map (ACN01–16, 21–23, 25–26)

| Screen | Route | Controller / service | DB (primary) | RBAC (representative) | Automated tests | Coverage class |
|--------|-------|----------------------|--------------|------------------------|-----------------|----------------|
| **ACN01** Setup checklist | `GET /app/onboarding` | `activeClinicAppRoutes` · onboarding adapter · setup state | platform onboarding + AC setup facts | `activeclinic.access` | batch1a-config · QA07 inventory/nav | STRONG |
| **ACN02** Services catalogue | `GET /app/services` | `activeClinicOpsConfigRoutes` · `activeClinicOpsCatalogueService` | `appointment_service_types` + pricing cols (036) | `website.edit` / catalog | batch1a-config · QA07 | STRONG |
| **ACN03** Service editor | `GET/POST /app/services[/new\|/:id/edit]` | ops catalogue `saveOpsService` | same + staff assignments | `website.edit` | batch1a-config (RBAC deny + persist) · QA07 validation | STRONG |
| **ACN04** Practitioners | `GET /app/practitioners` | ops practitioners list | `staff_members` | `staff.view` | batch1a-config · QA07 | STRONG |
| **ACN05** Availability | `GET/POST /app/practitioners/:id` | practitioner workspace + availability | availability tables (036) | `staff.update` | batch1a-config | STRONG |
| **ACN06** Calendar | `GET /app/appointments/calendar` | appointment routes/screens/service | `appointments` + status events | `appointment.view` | batch1a-appointments · QA07 mobile marker | STRONG |
| **ACN07** Create + conflict | `GET/POST /app/appointments/new` | `createAppointment` / collision | `appointments` | `appointment.create` | batch1a-appointments · QA07 facility deny | STRONG |
| **ACN08** Detail + lifecycle | `GET /app/appointments/:id` + status POSTs | status machine + events | status vocabulary (037) | check-in/cancel/… | batch1a-appointments | STRONG |
| **ACN09** Booking requests | `GET /app/booking-requests` | booking triage/linkage | `public_booking_requests` | reception/appt manage | batch1a-appointments | STRONG |
| **ACN10** Patient directory | `GET /app/patients` | patient routes + duplicate service | `patients` (+ identifiers) | `patient.search/create` | batch1a-patient-reception · QA07 | STRONG |
| **ACN11** Profile + consent | `GET/POST …/consents` | `activeClinicPatientConsentService` | consents (038) | `patient.update` | batch1a-patient-reception · QA07 invalid consent | STRONG |
| **ACN12** Check-in | `GET /app/reception/check-in` | reception service | reception arrivals | `reception.check_in` | batch1a-patient-reception | STRONG |
| **ACN13** Live queue | `GET /app/reception` | reception queue | `reception_queue` | `reception.view/manage_queue` | batch1a-patient-reception · QA07 | STRONG |
| **ACN14** Practitioner worklist | `GET /app/clinical` | clinical service worklist | encounters | `encounter.view` | batch1a-clinical | STRONG |
| **ACN15** Encounter workspace | `…/clinical/encounter/:id` | clinical encounter complete | encounters + notes | encounter manage keys | batch1a-clinical | STRONG |
| **ACN16** Follow-up | `GET /app/clinical/follow-up` | `activeClinicClinicalFollowUpService` | follow-up (039) | clinical follow-up perms | batch1a-clinical · QA07 | STRONG |
| **ACN21** Invoices | `GET /app/billing/invoices` | billing routes/service | invoices / charges | `billing.view` / invoice.* | batch1a-billing · QA07 | PARTIAL→improved |
| **ACN22** Invoice editor | create/detail/post paths | `createInvoice` / amend | invoice_lines | `invoice.create/post` | batch1a-billing · QA07 facility mismatch | PARTIAL→improved |
| **ACN23** Payment + receipt | `/app/cashier/payment` · receipt | `recordPayment` + cashier session | payments / receipts / sessions | `payment.collect` · cashier session | batch1a-billing · QA07 cash-without-session | PARTIAL→improved |
| **ACN25** Performance | `GET /app/performance` | management data routes | aggregates (no clinical narrative) | `performance.view` | batch1a-management-data · QA07 | STRONG |
| **ACN26** Import/export | `GET /app/data` (+ preview/commit) | platform data jobs + AC mappers | platform jobs (043) | `data.import/export` | batch1a-management-data · QA07 | STRONG |

Migrations: AC `036`–`039` · BB `118` management perms · platform `043` data jobs.

---

## Added this pass

`tests/v203-ac-batch1-test-readiness.test.js`

- 21-screen view/Stitch/390 CSS inventory  
- Unauthenticated denial on Batch 1 hubs  
- Validation / error: empty service name, invalid consent type, cash without cashier session  
- Facility-scoped appointment create denial + invoice charge/facility mismatch denial  
- Authenticated hub render (nav chrome + Stitch markers)

`npm run test:v203:ac-batch1`

---

## Verification

```text
node --test --test-concurrency=1 tests/activeclinic-batch1a-*.test.js tests/v203-ac-batch1-test-readiness.test.js
→ 36 pass / 0 fail
V203_AC_BATCH1_TEST_READINESS_PASS
```

---

## AUTOMATED

| Area | Evidence |
|------|----------|
| Desktop functional Batch 1 hubs | batch1a-* HTTP 200 + Stitch/`data-ac-batch1` markers |
| 390 companion (where automation exists) | CSS `@media (max-width: 390px)` + `.ac-batch1a__mobile` + calendar `data-ac-calendar="mobile"` |
| Navigation chrome | QA07 hub routes assert shell/nav markers |
| Form validation | empty service; invalid consent; cash session required; appt collision/blocked (batch1a) |
| Authorization / wrong role | batch1a RBAC denials (config/clinical/billing/management) + QA07 unauth |
| Tenant / facility scope | batch1a cross-clinic isolation + QA07 facility appointment/invoice denials |
| Success / error states | publish status history, payment clamp, follow-up create, cash SESSION_REQUIRED |
| Stitch-required functionality | ODS IDs / ACN markers asserted in batch1a + QA07 inventory |
| Privacy | finance UI does not leak clinical narrative (batch1a-billing) |

---

## MANUAL_QA_REQUIRED

| Item | Why |
|------|-----|
| Visual Stitch parity at **1440 / 390** for all 21 screens | Documented `COMPLETE_WITH_GAPS`; CSS/markers automated, pixel parity not |
| Hosted authenticated journey on pronline | Prior Final QA: deploy lag / new routes historically 404 until deploy |
| Dual B2 chrome surfaces (ACN08/10/15/21–22) visual judgment | Shared Batch 2 layout; ODS IDs attributed without redesign |
| ACN01 marketing checklist cards vs fact-driven steps | Intentional product gap — do not rebuild cosmetics |
| Print/receipt paper layout (ACN23) | Functional receipt automated; print chrome manual |
| Realtime queue refresh feel (ACN13) | Status actions automated; live UX timing manual |
| Import dry-run UX for large CSV (ACN26) | Preview/commit + forged columns automated; operator UX manual |

---

## DEFECTS

**None** found this pass (no STOP / no application defect classification).

Residual product gaps remain documentation-only (Stitch decorative chrome, hosted deploy lag from prior Final QA) — not new code defects.

---

## Marker

```text
V203_AC_BATCH1_TEST_READINESS_PASS

AUTOMATED: Batch1a (28) + QA07 readiness (8) = 36 pass
MANUAL_QA_REQUIRED: visual 1440/390 parity; hosted auth journey; print/realtime/import UX judgment; ACN01 cosmetic cards
DEFECTS: none
```
