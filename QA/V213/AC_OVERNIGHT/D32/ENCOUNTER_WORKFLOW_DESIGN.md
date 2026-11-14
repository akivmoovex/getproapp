# Encounter workflow design

Package C has these 12 IDs: `VIS-01-01`, `VIS-01-02`, `VIS-01-03`, `VIS-02-01`, `VIS-02-02`, `VIS-02-03`, `NUR-01-01`, `NUR-01-02`, `NUR-01-03`, `CLN-01-01`, `CLN-01-02`, `CLN-01-03`.

Stored encounter status is `open`, `completed`, or `cancelled`. The proposed names `REGISTERED`, `WAITING`, `IN_TRIAGE`, `IN_CONSULTATION`, `ACTIVE_ORDERS`, and `READY_FOR_CLOSEOUT` are not stored and are not approved.

Queue creation can return `duplicate_active_queue_entry`. Triage and consultation writes exist. Encounter completion updates a row that is still `open`. A stale encounter version does not have a proven conflict result. `VIS-02-03` stays partial.

Consultation notes are `draft` or `signed`. Both update paths return `cannot_edit_signed` for a signed note. `consultation_note_amendments` exists and no clinical service inserts into it. `CLN-01-03` stays missing.

The encounter-started audit records facility, patient, and encounter type. The metadata object has no `purpose` field. That gap is `SEC-01-01`, which remains in Package A. It is not reassigned.

No new encounter state is proposed for implementation. D21-02 stays pending.
