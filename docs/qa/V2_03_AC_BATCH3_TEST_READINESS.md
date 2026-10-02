# V2.03 QA — ActiveClinic Batch 3 Test Readiness (QA09)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_AC_BATCH3_TEST_READINESS` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | QA08 · Frozen Batch 3 Stitch `7300898757945019896` (+ leaves from `3741389873539108242`) · [OPEN_DECISIONS](../v2.03/ACTIVECLINIC_BATCH3_OPEN_DECISIONS.md) · [BACKLOG post-MVP gaps](../BACKLOG.md) |
| **Mode** | MAP + ADD high-value tests (authz / facility-scope clinical negatives / implemented MVP gap contracts) |
| **Proof rule** | Functional + authz assertions — **not** line coverage alone; deferred private-storage features tested as **contracts**, not invented features |
| **Verdict** | **`V203_AC_BATCH3_TEST_READINESS_PASS`** |

---

## Screen → implementation map

| Screen | Route | Controller / service | DB (primary) | RBAC | Automated tests | Class |
|--------|-------|----------------------|--------------|------|-----------------|-------|
| **ACN17** Vitals | `GET/POST …/encounter/:id/vitals` | clinical routes/service | `vital_sign_observations` | triage/vitals keys · facility scope | batch3-acn17-acn19 · QA09 facility deny | STRONG |
| **ACN18** Clinical documents | `/app/clinical/patients/:id/documents*` | clinical document routes/service | `clinical_documents` (+ events) · mig 041 | `clinical_document.view/create/finalize` | batch3-acn18 · QA09 facility/authz | STRONG |
| **ACN19** Prescription editor | `…/order/prescription` | clinical order create | `clinical_orders` → pharmacy handoff | `clinical_order.create` · facility scope | batch3-acn17-acn19 · QA09 facility deny | STRONG |
| **ACN20** Referrals | `GET /app/clinical/referrals` | presentation over ACN16 follow-up | follow-up pending_referral | clinical follow-up perms | batch3-acn20 · QA09 unauth | STRONG |
| **ACN27** Rooms & Spaces | `/app/rooms*` | room routes/service | `facility_rooms` · mig 040 | `facility.view/update` | batch3-acn27 · QA09 facility list isolation | STRONG |
| **AC-P03** My bookings | `/clinics/:key/patient/bookings` | patient portal routes | booking requests | portal owner session | batch3-acp03-acp07 | STRONG |
| **AC-P04** Booking detail | `…/bookings/:reference` (+ reschedule request) | portal booking detail | booking requests | portal owner | batch3-acp04 | STRONG |
| **AC-P05** Visit summaries | `…/patient/visit-summaries*` · staff release | release service + staff/patient routes | `patient_visit_summary_releases` · mig 042 | `visit_summary.release` (clinician) | batch3-acp05 · QA09 release authz/isolation | STRONG |
| **AC-P06** Invoices (portal) | `…/patient/invoices` | portal billing projection | invoices (read) | portal owner | batch3-acp06 | STRONG |
| **AC-P07** Profile | `…/patient/profile` | portal profile | patient demographics | portal owner | batch3-acp03-acp07 | STRONG |

Migrations: AC `040`–`042`. Shared staff shell remains Batch 2 ownership.

---

## Added this pass

`tests/v203-ac-batch3-test-readiness.test.js`

| Priority | Coverage |
|----------|----------|
| Inventory | All ten Batch 3 screens → view markers + route module wiring |
| MVP gap contracts | Assert `BINARY_ATTACHMENT_DEFERRED_*` / `VISIT_SUMMARY_PDF_DEFERRED_*` markers; no file input; no PDF route; rooms migration has no occupancy engine |
| Facility scope | Vitals/orders denied at unassigned satellite; clinical doc forge/mismatch/list filter; room list facility isolation + cross-tenant create deny |
| Authz negatives | Unauth staff routes; cashier denied ACN18 HTTP; facility admin denied visit-summary release; cross-patient release get → NOT_FOUND |

`npm run test:v203:ac-batch3`

Critical pack: `scripts/coverage/run-v203-coverage.js` includes QA09 readiness file.

---

## Verification

```text
npm run test:v203:ac-batch3
→ 38 pass / 0 fail
V203_AC_BATCH3_TEST_READINESS_PASS
```

---

## IMPLEMENTED_AND_TESTED

| Area | Evidence |
|------|----------|
| ACN17 vitals leaf + POST | batch3-acn17-acn19 · QA09 facility deny |
| ACN18 draft/final lifecycle + isolation | batch3-acn18 · QA09 facility filter / forge / cashier deny |
| ACN19 prescription order POST | batch3-acn17-acn19 · QA09 facility deny |
| ACN20 referral presentation | batch3-acn20 |
| ACN27 rooms CRUD + facility isolation | batch3-acn27 · QA09 list/forge |
| AC-P03 / P04 / P06 / P07 portal leaves | batch3-acp03-acp07 · acp04 · acp06 |
| AC-P05 clinician release + patient-safe snapshot | batch3-acp05 · QA09 release authz/patient isolation |
| Deferred storage **contracts** (not features) | QA09 asserts markers + absence of upload/PDF/occupancy |

---

## MANUAL_ONLY

| Item | Why |
|------|-----|
| Stitch visual parity (desktop 2560 / mobile 390) for ACN18/27/P05 pairs | Visual QA against Stitch; automated markers only |
| Portal multi-clinic UX polish (keyboard / focus / print) | Low risk; not mutation/authz |
| Occupancy / PDF / binary attachment UX | **Not implemented** — see KNOWN_MVP_GAPS; do not manual-test as if present |

---

## KNOWN_MVP_GAPS

| Gap marker / backlog | Contract under test |
|----------------------|---------------------|
| `BINARY_ATTACHMENT_DEFERRED_PRIVATE_STORAGE_REQUIRED` (ACN18) | UI deferred attrs; no `type=file`; migration/docs forbid public CMS storage |
| `VISIT_SUMMARY_PDF_DEFERRED_PRIVATE_STORAGE_REQUIRED` (AC-P05) | `data-ac-pdf-deferred` copy; `pdfDeferred: true`; no PDF Content-Type route |
| ACN27 occupancy / IoT / scheduling / beds | Migration comment + no occupancy columns; inventory MVP only |
| AC-V203-PHI-STORE private clinical object storage | Architecture backlog — not website/CMS media |

These are **intentional** post-MVP gaps — **not** V2.03 QA blockers.

---

## DEFECTS

| Severity | Item |
|----------|------|
| — | **None found** during QA09 readiness pass |

---

## Marker

```text
V203_AC_BATCH3_TEST_READINESS_PASS
```
