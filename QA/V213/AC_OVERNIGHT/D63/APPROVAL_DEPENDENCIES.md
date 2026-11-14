# Approval dependencies

| Tasks | May proceed when |
|---|---|
| T01, T02, T03, T05, T24 | The D44 checklist is already true for one named local database. This backlog does not set the flags |
| T04 | No clinical approval. A unit test can reach the existing duplicate return |
| T06, T07 | A workflow edit is explicitly allowed. D59 wrote the patch and did not apply it |
| T08, T09 | D21-05 names the capacity rule. Until then, no `FOR UPDATE` and no `slot_capacity` |
| T10 | D21-06 names the acknowledgement target |
| T11 | D21-11 names the provider. No migration before that |
| T12 | D21-03 |
| T13 | D21-09 names a period |
| T14, T15, T20 | D21-10 or D29-18 names the number or the screen list |
| T16 | D29-16 names a representative separately from the patient |
| T17 | D29-17 names the review result, with no dose |
| T18, T19 | D21-02 names the outbox or the paths |
| T21 | D21-13 |
| T22 | D21-12 |
| T23 | A decision says the booking lookup token is one-time |

No task in this file was implemented. No migration was written.
