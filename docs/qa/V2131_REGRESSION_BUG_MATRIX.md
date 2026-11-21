# V2.13.1 regression bug matrix

HEAD `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. Status values are source and safe-test status only. None of these rows is a passing HTTP or browser result.

| Bug | Source status | Safe tests | HTTP | Browser | Migration | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| AC-REG-01 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Password match plus advisory lock. Second clinic is not inserted on mismatch. |
| BB-REG-07 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Occupying phones include active and duplicate_review. Unique violation maps to the duplicate message. |
| AC-AUTH-04 | IMPLEMENTED_UNVERIFIED | Not covered by a new D13 unit test | NOT_RUN | NOT_RUN | No | Already present. No file in this diff. Outbox, neutral copy, and staff shell marker were re-read. |
| BB-AUTH-04 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Recovery page has no test OTP. Substituted verification id fails before the OTP check. Production signal refuses the test provider. |
| BB-MEM-01 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Name, phone, and branch required. Email optional. Review and created pages show the same fields. Portal stays not activated. |
| BB-MEM-02 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Single CSRF field. Missing token still 403. `members.create` still required. |
| AC-WEB-08 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Section id is a UUID. Draft save does not publish. Missing section is 404. |
| AC-WEB-09 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | BlessBoard theme rejected as `invalid_theme`. Draft and live theme ids stay separate. |
| BB-WEB-08 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Same theme rule for BlessBoard. Clinic theme is not applied. |
| BB-WEB-09 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Add sermon mints a new key. Public list shows published titles only. |
| BB-WEB-10 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Event summary is a textarea. Draft events stay off the public list. |
| BB-ANN-01 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Posted status normalizes so publish wins over a duplicate status field. |
| BB-ANN-02 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Upload control posts to the existing media route. Public pages print filename and asset id. |
| AC-REC-02 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Facility-scoped service-point form and walk-in list. Queue detail prints the same display name. Authorized run still needs a reception department and a service point. |
| AC-REC-03 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Heart rate 72 renders `72 bpm`. Types stay inside the existing check. Other clinic is not a 303. Needs a clinical department on the authorized user. |
| AC-PUB-01 | IMPLEMENTED_UNVERIFIED | VERIFIED_SAFE_TESTS | NOT_RUN | NOT_RUN | No | Disabled clinic is 403 with the existing sentences and no coupon. Enabled booking and coupons are deferred, not implemented. |

## Scenarios that stay open without an authorized run

Each row’s HTTP runner and Playwright spec is implemented and gated. With the write flags unset, the integration files skip as `NOT_RUN` before they open a connection. Playwright calls `hold()` before navigation and aborts non-local requests. Those files were syntax-checked and were not executed.

Closing any row requires the isolated PostgreSQL 16 instance on `127.0.0.1:55432`, the limited role, bootstrap, and fixtures that follow `buildV213RegressionFixturePlan()` rather than `provisionHostedAuthQaClinic()`. AC-REC-02 and AC-REC-03 also need the reception or clinical department and, for walk-in, service point `v13d19-walk-in`. AC-PUB-01 must be run against a clinic whose `public_booking_enabled` is false. A run that uses the hosted-auth fixture would turn booking on and would not satisfy the disabled-state assertion.
