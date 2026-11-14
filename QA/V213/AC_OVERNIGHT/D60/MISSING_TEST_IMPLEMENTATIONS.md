# Missing test implementations

No new test file was added. A fourteenth integration file would change the suite the existing contract expects to stay at 13 files, and a body that throws `NOT_IMPLEMENTED` is not a completed test.

## Persistence, all 84

Each ID still needs a positive stored row, a negative denial, and a failure that leaves the row count unchanged. Fifty-six have no integration body. Twenty-four are `FEATURE_NOT_IMPLEMENTED` in the D29 class, including merge, retention, backup, offline writes, and `APT-01-03` capacity. The capacity file throws `APT-01-03_NOT_IMPLEMENTED` if the gate is opened. That is the correct hold until a capacity number is approved. It is not a passing concurrency test.

## Bodies that are not the acceptance outcome

| Body | Limit |
|---|---|
| `runAcAuth` | Calls `insertPatient` and `createAppointment` and expects one stored appointment and a collision. It does not sign in a lower-privilege user, does not check capacity, and has no ActiveClinic cleanup |
| `d24` portal | Empty phone returns `invalid_input`. No identity row and no clinic binding are stored |
| OTP integration | Requires `platform.otp_challenges`, which is not migrated, and then expects a second worker to complete the session. That is not the current memory-store behavior |
| Seven browser tests | After `hold()`, they use real routes and controls. `hold()` throws `NOT_RUN` first. The CI job cannot start |

## Future specifications, not added as tests

- AC-05: sign in the lower-privilege fixture, GET both test-database routes, expect 403, and compare row counts before and after.
- Portal: one stored identity and one patient link in the caller’s organization, no session cookie, and the other clinic cannot complete registration.
- Appointment: two connections, one stored overlap, and no capacity assertion until the number is approved.
- Document: insert a document in clinic A and read it as clinic B. The body must be absent.
- Payment: the same idempotency key and tenant returns `duplicate_submission`, and the payment count stays 1.
- Cleanup: delete only the run-owned database after the guard still accepts its name.
