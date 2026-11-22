# V13 G36 — isolated test readiness

No authorization flag was set. No server was started. No fixture was written. The shared cluster on port 5432 must not be used.

Isolated target, from `tests/v13/helpers/v13IsolatedExecutionPlan.js` and `v13BrowserIsolation.js`: host `127.0.0.1`, port `55432`. Playwright also requires a local base URL on `127.0.0.1`.

HTTP writes stay closed unless both `GETPRO_V13_ALLOW_DB_WRITES` and `GETPRO_V13_DB_STAGES_AUTHORIZED` are `1`. Browser runs also require `GETPRO_V13_BROWSER_AUTHORIZED=1`. This plan does not set them.

Migration 043 is not required for the current gated runners. BlessBoard public-page rows are required before BB-WEB-08 and homepage-section HTTP can pass. They are not required for the denial and auth scenarios.

## Order, after a later authorization

1. D04 critical HTTP: AC-AUTH-04, BB-AUTH-04, BB-MEM-02, AC-REG-01, BB-REG-07, BB-MEM-01, BB-ANN-01. Uses existing isolated fixtures.
2. D05 remaining HTTP regressions. Same fixtures. Do not enable public booking.
3. D16 auth and OTP, D14C OTP, INV-01 invitation. Testing OTP only.
4. D24 patient portal and D25 appointment concurrency. Must keep the existing version check.
5. BB-02 announcements, BB-03 events, BB-04 sermons, BB-05 members, BB-06 activation. BB-01 homepage sections and BB-24 directory only after a public-page fixture write is separately authorized.
6. G03 laboratory denial of a missing request, G04 dispense denial, G05 paper-disposal refusal. These do not insert migration 043 rows.
7. Playwright `v13-ac-platform-qa.spec.js`: login, portal, appointment collision, receptionist denials, AC-05, PAT-01, AC-AUTH-04, AC-REG-01, AC-WEB-08, AC-WEB-09, AC-REC-02, AC-REC-03, AC-PUB-01.
8. Playwright `v13-bb-qa-regression.spec.js` after the public-page decision. Do not turn on media uploads to make BB-ANN-02 pass.

Each HTTP file calls `runGated` and skips as `NOT_RUN` without the write flags. Each browser test calls `hold()` before navigation.

```
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
ISOLATED_TEST_READINESS=PLANNED_NOT_AUTHORIZED
```
