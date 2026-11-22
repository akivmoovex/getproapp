# V13 G35 — ActiveClinic completion

Staff can register a patient, review a duplicate without merging it, open one encounter at a facility, check the patient in, record triage and the supported vital types, write a consultation, sign it so it cannot be silently overwritten, order a laboratory test with a stored priority, dispense from the pharmacy catalogue, bill in minor units, and close the encounter. Text records can be retrieved by permission.

Those paths are in the current source. They were not executed as HTTP or browser journeys on this HEAD.

Still incomplete: longitudinal continuity is basic, diagnosis codes are free text, the manual prescription does not join the pharmacy queue, laboratory flags are caller-supplied, file bytes are refused, and migration 043 is not applied. Interoperability stays deferred. Export, recovery, accessibility, monitoring, and performance were not demonstrated.

```
PATIENT_JOURNEY=IMPLEMENTED_UNVERIFIED
CONSULTATIONS=IMPLEMENTED_UNVERIFIED
LABORATORY=PARTIAL
PHARMACY=PARTIAL
BILLING=IMPLEMENTED_UNVERIFIED
MEDICAL_RECORDS=PARTIAL
RECORD_MIGRATION=MIGRATION_PENDING
```
