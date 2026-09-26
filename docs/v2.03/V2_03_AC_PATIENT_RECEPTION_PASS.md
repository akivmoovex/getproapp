# V2.03 AC Patient & Reception Pass — ACN10–ACN13

**Verdict:** `V2_03_AC_PATIENT_RECEPTION_PASS`

**Stitch project:** `projects/12134201997833374170`  
**Branch:** V10  
**Scope:** Patient Directory, Patient Profile & Consent, Check-in, Live Patient Queue

| Screen | Stitch IDs | Route |
|--------|------------|-------|
| ACN10 Patient Directory | `d6fa60ee647a44949449f163990a3e1f` / `580bd1e41bf1439e97587ee3accb8b30` | `GET /app/patients` |
| ACN11 Profile & Consent | `63b85a8c28b84e9e81db2930c93c1217` / `147ab133a55f41e6afc6faf3010f03e3` | `GET /app/patients/:patientNumber` + consent POSTs |
| ACN12 Check-in | `ed27c2dfb6474a139b126c5bd57e0869` / `a2900a9ef33247d8817fe801f4a06fd5` | `GET/POST /app/reception/check-in` |
| ACN13 Live Queue | `4bdf5a39d81043e1bd9488caa0833048` / `a21f9b37a2ca4939948bf39a86a5df90` | `GET /app/reception` |

## Delivered

- **Single patient identity engine extended** — registration fields (identity, contact, DOB, sex, address, next of kin, emergency, clinic-specific JSON); no second identity system.
- **Duplicate detection** remains HCO/org-scoped; masked matches only; never discloses another clinic’s patient.
- **Consent ledger** (`038_batch1a_patient_consent_clinic_fields.sql`) — type / status / date / method / version / withdrawal + append-only events; AC-owned (not platform T&Cs).
- **Check-in** — patient/appointment lookup, confirmation, destination, Arrived + queue placement via existing reception engine.
- **Live queue** — patient, arrival, waiting duration, service, destination, practitioner, status; **no restricted clinical notes**.
- **Platform reuse** — RBAC, audit, validation, forged-tenant rejection, search/filters.

## Tests

- `tests/activeclinic-batch1a-patient-reception.test.js` — markers, registration fields, cross-clinic duplicate/search isolation, consent grant/withdraw isolation, HTTP Stitch + no clinical-note leakage
- Reception UI parity stitch ID updated to ACN13

## Gaps (non-blocking)

1. Stitch visual density remains Batch1A shell patterns rather than pixel-perfect Tailwind port.
2. Clinic-specific fields currently expose insurance + referral_source keys; additional HCO field schemas can extend `clinic_fields_json` without a second identity store.
