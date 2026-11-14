# Encounter design

D21-02 is pending. The stored states remain `open`, `completed`, and `cancelled`. `isStoredEncounterStatus` returns false for any other name, including `REGISTERED`.

No new transition was added. A later state machine may be written only after D21-02 names each state and the allowed edges. Until then the service must not write those names.

Opening an encounter still records `activeclinic.encounter.started` with `facility_id`, `patient_id`, and `encounter_type`. The metadata still has no `purpose` field. Adding one is the SEC-01-01 gap and is not approved.

No migration is proposed, because a new state would require a check-constraint change that D21-02 has not approved.
