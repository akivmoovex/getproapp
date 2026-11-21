# V2.13.1 G02 — core patient journey

The healthcare developer brief is still not on disk. This phase inspected the existing ActiveClinic services and did not add clinical thresholds, diagnosis rules, or a second patient module. Staff-created registration, facility scope, and the deferred merge stay as they are.

## What already exists

| Workflow | Status | Evidence |
| --- | --- | --- |
| PATIENT_IDENTITY | PRESENT | `registerActiveClinicPatient` searches identifiers, phone, email, and name plus date of birth. A blocking match returns `duplicate_warning` and does not insert. Override requires `activeclinic.patient.duplicate_override`. `mergeActiveClinicPatients` returns `merge_deferred`. Demographics, contacts, and next of kin are stored on `activeclinic.patients` and `activeclinic.patient_emergency_contacts`. |
| PATIENT_VISITS | PRESENT | A visit is an `activeclinic.encounters` row tied to `patient_id`, `facility_id`, and an optional `reception_arrivals` row. A later visit is a new encounter. Status is `open` until close. There is no separate visits table. |
| RECEPTION | PRESENT | `checkInScheduledPatient` and `checkInWalkInPatient` require reception check-in permission and a service point in the selected facility. Queue statuses are `waiting`, `called`, `serving`, `paused`, and `completed`, with explicit transitions in `activeClinicReceptionService.js`. |
| NURSING_TRIAGE | PRESENT | The queue shows Start triage for `activeclinic.triage.record`. `recordTriageAssessment` stores the complaint and a stored triage category. `recordVitalSignObservation` accepts blood pressure, heart rate, temperature, respiratory rate, oxygen saturation, height, and weight, with unit, timestamp, and staff author. Rows are inserted, and a later row may point at `corrects_observation_id`. Receptionists are not granted triage. |
| CONSULTATIONS | PRESENT | `recordConsultationNote` stores examination, assessment, history, medication, plan, follow-up, and referral text on the current encounter. Structured diagnosis coding remains deferred in `docs/activeclinic/ACTIVECLINIC_PRODUCT_GAPS.md`. Prescription and diagnostic handoff use the existing order services. |
| CLINICAL_AUDIT | PRESENT | Encounter events and `recordAuditEventSafe` cover triage, vitals, nursing intake, and consultation. Signed notes return `CANNOT_EDIT_SIGNED`. Draft edits use the version column. The D49 contract forbids a `consultation_note_amendments` table, so none was added. |

## Tests

Database-free coverage added in `tests/v13/unit/g02-patient-journey.test.js` and `tests/v13/contract/g02-patient-journey-contract.test.js`.

A new integration or Playwright file was not added. The existing gate requires every integration file to call `runGated`, and the ActiveClinic browser config only loads `v13-ac-platform-qa.spec.js`. Those existing suites already cover patient, reception, and clinical HTTP and browser paths, and they stay `NOT_RUN`.

No migration was prepared. The required tables are already in `db/migrations/activeclinic/008_patients.sql`, `014_reception_queue.sql`, and `015_clinical_encounters.sql`.

```
FINAL=V2131_G02
PATIENT_IDENTITY=PRESENT
PATIENT_VISITS=PRESENT
RECEPTION=PRESENT
NURSING_TRIAGE=PRESENT
CONSULTATIONS=PRESENT
CLINICAL_AUDIT=PRESENT
TESTS_ADDED=3
SAFE_TESTS_PASSED=450
SAFE_TESTS_FAILED=0
MIGRATIONS_PREPARED=0
BLOCKERS=Healthcare brief absent; HTTP and browser NOT_RUN; structured diagnosis codes remain deferred; G03 prompt was not in this request
```
