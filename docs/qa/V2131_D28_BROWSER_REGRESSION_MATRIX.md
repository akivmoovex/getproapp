# V2.13.1 D28 — browser regression matrix

Safe tests: 447 passed, 0 failed. HTTP and browser suites were not executed. None of these rows is `VERIFIED_E2E`.

| Bug | Browser observation | Classification | Notes |
| --- | --- | --- | --- |
| AC-WEB-09 | Apply to draft showed `csrf` | VERIFIED_SAFE_TESTS | Gallery token and cookie now match. HTTP not run. |
| AC-REC-02 | Walk-in service point list was empty | VERIFIED_SAFE_TESTS | Empty facility explains the gap. Existing facility points still render. HTTP not run. |
| AC-REC-03 | Nurse had no vitals or triage action | VERIFIED_SAFE_TESTS | Triage permission opens Start triage and Record vitals. HTTP not run. |
| AC-AUTH-04 | Password recovery | VERIFIED_SAFE_TESTS | Testing outbox unchanged. Reset HTTP not run. |
| AC-PUB-01 | Public booking | DEFERRED_APPROVED_SCOPE | Disabled state preserved. Enabled booking and coupons stay deferred. |
| BB-MEM-01 | Required membership fields were missing | VERIFIED_SAFE_TESTS | Form and parser now require the contract fields. HTTP not run. |
| BB-MEM-02 | Member CSRF | VERIFIED_SAFE_TESTS | One token. Missing token stays 403. HTTP not run. |
| BB-ANN-01 | Published announcement was absent publicly | IMPLEMENTED_UNVERIFIED | Public query still requires the public audience. Success link now includes the announcement id. HTTP not run. |
| BB-ANN-02 | 1.1 MB PNG showed a generic error | PARTIAL | The UI reports the real reason. Uploads stay off until `BLESSBOARD_MEDIA_UPLOADS_ENABLED` is set. |
| BB-WEB-09 | Add sermon only edited a draft | VERIFIED_SAFE_TESTS | Create payload keeps preached date and summary. HTTP not run. |
| BB-WEB-10 | Add event was not a working control | VERIFIED_SAFE_TESTS | Add event is a create button. HTTP not run. |
| BB-WEB-08 | Public page fixture | PARTIAL | Church id is required in fixture source. Rows were not inserted. |

Original regression bugs that were not part of this browser pass stay `IMPLEMENTED_UNVERIFIED` from the prior candidate: AC-REG-01, BB-REG-07, BB-AUTH-04. Duplicate phone, OTP, appointment concurrency, and tenant checks were not relaxed. Both products remain `2.13.1`.

```
FINAL=V2131_D28
TOTAL_BROWSER_ISSUES=9
ORIGINAL_REGRESSION_ISSUES=16
SOURCE_FIXES_IMPLEMENTED=12
PARTIAL=2
BLOCKED=0
SAFE_TESTS_PASSED=447
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
UNEXPECTED_FILES=
PUSH_READINESS=YES
BLOCKERS=No row is VERIFIED_E2E; media uploads remain deployment-gated; BlessBoard public-page fixture rows are still absent
```
