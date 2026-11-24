# V2.13.2 G125 — vitals correction

AC-FU-CLIN-03 now has a correction action on the vitals screen for a row that has not already been superseded.

`correctVitalSignObservation` requires the triage permission, the same organization, healthcare organization, facility, and encounter, and a correction reason. It inserts a new `vital_sign_observations` row with `corrects_observation_id` and `correction_reason`. It does not update or delete the original row. If another row already corrects that id, the request returns `stale_version`.

Current rows are those not referenced by a later correction. Superseded rows stay visible and do not show the correction form.

No migration was added. The columns already exist. Persistence on the disposable database was not executed in this document's authoring step. Unit coverage: `tests/v13/unit/g125-vitals-correction.test.js`.

Status: IMPLEMENTED_NOT_E2E_VERIFIED until a disposable persistence run records a correction row.
