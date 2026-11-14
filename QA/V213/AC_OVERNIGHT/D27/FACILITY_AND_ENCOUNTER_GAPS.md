# Facility and encounter gaps

| Area | Present | Missing |
|---|---|---|
| Facility scope | Active facility must belong to the healthcare organization | Live wrong-facility denial |
| Department | Department records exist | A failed department handoff does not roll the order back |
| Encounter | `open`, `completed`, `cancelled` | `REGISTERED`, `WAITING`, `IN_TRIAGE`, `IN_CONSULTATION`, `ACTIVE_ORDERS`, `READY_FOR_CLOSEOUT` |
| Queue | Duplicate active entry is rejected | Proposed queue states and a live retry |
| Nursing | Vitals and triage writes exist | Invalid-unit and cross-tenant observation were not executed |
| Notes | Signed notes are not edited in place | Amendment workflow, despite the table |
| Identity | Duplicate candidates, no automatic merge | Authorized merge, lineage, and unmerge |

Data-integrity risks to keep in view:

- Critical acknowledgement selects the newest active alert for the organization, not the result id passed in.
- Encounter completion updates a row that is still `open`. Two completions can race. No encounter lock was found in this review.
- A patient who is not yet linked to the facility can be linked during appointment create. That path is outside this clinical review and was not executed.

Cross-tenant risk: services pass `organization_id` into queries. A BlessBoard session reading a clinical row was not run. Do not treat the source filter as a completed denial test.
