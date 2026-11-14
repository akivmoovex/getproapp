# Supplementary implementation

None of the eight supplementary requirements is approved, and none is complete.

| ID | This stage |
|---|---|
| ACX-001 | The stored consent types stay. Withdrawal now also requires the patient on the consent row. A caller who names another patient gets `patient_not_found` and the note is not returned. No new type was added |
| ACX-002 | No representative record |
| ACX-003 | Pharmacy still has no allergy blocker. Triage text is not a dispense rule |
| ACX-004 | No screen list and no contrast number |
| ACX-005 | No monitor was added. The OTP service still has no console log |
| ACX-006 | No availability, RPO, or RTO number |
| ACX-007 | Clinical services still do not write an outbox. No table was added |
| ACX-008 | No `/api/v1` route was added |

The offline page still returns 503 and does not write. Juflona signing stays unset. No record is deleted and no retention period was chosen.
