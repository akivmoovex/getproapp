# Concurrency tests

In-process tests added:

- `tests/v13/unit/d39-appointment-scheduling.test.js` rejects a bad staff id with no query, treats a touching interval as free, and keeps capacity null.
- `tests/v13/contract/d39-appointment-contract.test.js` keeps `FOR UPDATE` and `slot_capacity` out of the appointment service.

The race test was added to the existing gated file, not a new integration file:

- `tests/v13/integration/d25-appointment-concurrency.integration.test.js`
- Label `D39-STAFF-OVERLAP-RACE`
- Default result `NOT_RUN`
- If the database flags were turned on, the body throws `BLOCKED_APPROVAL_REQUIRED` and does not insert

UI cases prepared and not opened in a browser:

| Case | Expected screen behavior |
|---|---|
| Review with an assigned staff overlap | The review step shows an empty slot list and does not confirm the booking |
| Confirm after the slot was taken | The create path returns the collision and redisplays the form |
| Two browsers, same staff, same window | Both may pass the current pre-transaction check. This is not a pass |
| Unassigned staff | The overlap query is skipped. No capacity message is shown |
| Public booking retry | The same idempotency key returns the existing receipt and does not claim a second slot |
| Bad staff id | The request fails as invalid input and does not open a slot query |

No browser spec was added. The ActiveClinic browser file remains at its existing seven named tests.
