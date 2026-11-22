# V13 G47 — clinical completion

The registration, search, encounter, reception, triage, consultation, laboratory order, manual prescription, pharmacy, billing, close, and document routes were already connected. This phase did not duplicate those services.

The encounter banner now shows Reception, Laboratory queue, Pharmacy, and Billing only after `authorizeStaffPermission` grants the existing view key. A clinician without `activeclinic.pharmacy.view` does not see Pharmacy. The department route still enforces its own permission.

Laboratory urgency remains routine, urgent, or stat. No reference range or critical threshold was added. Specimen collection and result acknowledgement stay on the existing diagnostics routes.

The prescription form still says manual entry only. No catalogue picker and no dose recommendation were added. Dispense still rejects a quantity above the remainder.

Signed notes are still not overwritten. The amendments table was not introduced. Follow-up and referral fields stay on the existing encounter form.

```
PATIENT_JOURNEY=IMPLEMENTED_UNVERIFIED
LABORATORY=PARTIAL
PHARMACY=PARTIAL
NEW_POLICY=NO
HTTP_TESTS=NOT_RUN
```
