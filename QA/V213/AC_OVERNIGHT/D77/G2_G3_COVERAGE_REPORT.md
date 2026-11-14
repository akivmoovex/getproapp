# G2 and G3 coverage report

Neither gate was executed.

| Gate | Prepared | Executed |
|---|---|---|
| G2 | 13 `tests/v13/integration/*.integration.test.js` files. They are outside the safe G1 command. The appointment concurrency file still throws if the gate opens | 0 |
| G3 | 7 tests in `tests/e2e/v13/v13-ac-platform-qa.spec.js`. Each calls `hold()` until the browser flag and a guarded `E2E_DATABASE_URL` are already set | 0 |

Prepared coverage that remains not run:

| Behavior | Needed evidence |
|---|---|
| Portal and booking | One stored identity and one second-owner `link_conflict` |
| Appointment overlap | Two connections and one stored appointment. Capacity stays unapproved, so no lock is prepared |
| Payment retry | One stored payment, then the same key returns `duplicate_submission` |
| Document facility | A stored document in facility A is not finalized from facility B |
| Consent | One granted row, one withdrawal, and a second withdrawal that does not insert another event |
| AC-05 | A lower-privilege session receives HTTP 403. A redirect to `/login` is not that denial |

`v13AuthorizedScenarios.js` is a helper, not a fourteenth integration file.
