# Supplementary requirements

The eight IDs are `ACX-001` through `ACX-008`. All stay `NOT_RUN` and `NOT_IN_V213_RELEASE`. None was given an approval in this stage.

| ID | What exists now | Observable outcome still required |
|---|---|---|
| ACX-001 Consent | The allow-list rejects an unknown type. Withdrawal updates only a `granted` row in the caller’s organization and skips the event when that update misses | A disposable database shows one consent row and one event, and a second organization cannot read it |
| ACX-002 Representatives | No representative field | Not observable until D29-16 names the person separately from the patient |
| ACX-003 Allergy review | Dispense has no allergy blocker. Triage allergies stay free text | Not observable until D29-17 names the review result. A new blocker is not allowed before that |
| ACX-004 Accessibility | No approved screen list | A browser pass of the named screens. Not run |
| ACX-005 Monitoring | No exporter was added | A counter or log line for each approved signal, with no patient text and no OTP material |
| ACX-006 Service levels | No number, host, or controller role was chosen | A written decision. A release note that quotes a number not in that decision is not evidence |
| ACX-007 Outbox | Clinical, billing, and diagnostics services do not publish an outbox. The staff-invitation testing outbox is a different path and was not turned into a clinical outbox | After approval, a rolled-back encounter or payment leaves no outbox row |
| ACX-008 Versioned clinical API | No `/api/v1/` clinical route was added | After paths are approved, an unauthenticated call gets no clinical body, and a client tenant that disagrees with the session is rejected |

Database evidence and browser evidence for these eight rows were not run.
