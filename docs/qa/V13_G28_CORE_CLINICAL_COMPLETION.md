# V13 G28 — core clinical completion

No new clinical model was added. The approved services already cover search, duplicate review, staff registration, demographics, next of kin, encounters, reception, triage, consultations, and closeout.

Checked in source on this pass:

- `mergeActiveClinicPatients` still returns `merge_deferred`. Unapproved merge and unmerge were not built.
- `startEncounter` still rejects a second open encounter for the same patient and facility.
- `closeEncounter` still requires organisation, facility, open status, and version.
- Signed consultation notes still return `cannot_edit_signed`. The existing contract still forbids `consultation_note_amendments`.
- Vital types still include blood pressure, pulse, respiratory rate, temperature, oxygen saturation, height, and weight. No triage threshold was added.
- The prescription form remains manual entry. It does not choose a dose. A catalogue picker was not added, because the screen’s own guardrail says manual entry only and no auto-prescribe.

Diagnosis codes, automated treatment rules, and cross-facility encounter transfer stay deferred.

```
CONSULTATIONS=IMPLEMENTED_UNVERIFIED
PATIENT_JOURNEY=IMPLEMENTED_UNVERIFIED
```
