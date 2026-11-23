# V13 G79 security results

Database: `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`.
Final run: `.v13-isolated-pg/g79-http10.log`.
Leaf tests: 34 executed, 16 passed, 18 failed, 0 skipped.
No test was marked passed by removing a security check.

## Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Missing CSRF returns 403 | Passed | BB-MEM-02. The member POST without a token returned 403. |
| Invalid CSRF returns 403 | Passed | BB-MEM-02. A mismatched token returned 403 and wrote no member. |
| Unauthorized access denied | Passed for the executed denials | G03 cross-organization laboratory denial, G04 cross-organization dispense denial, G05 paper-destruction refusal, D24 empty portal registration denial. |
| Cross-tenant access denied | Passed for organization boundaries | G03 and G04. |
| Cross-facility access denied | Not executed | No separate facility-boundary test completed. |
| Cross-church access denied | Passed | BB-02 hid the announcement from the other church. BB-05 rejected cross-church member confirmation. BB-03 rejected a foreign branch. |
| OTP replay denied | Failed | BB-AUTH-04 did not capture the expired testing code, so replay was not reached. BB-06 stopped at `authenticated_ownership_required`. |
| No production fake OTP | Held, test failed | D14C asserts production activation is blocked before it requires `platform.otp_challenges`. The table is absent, and contract tests still require that migration file to stay absent. The node test failed on the missing table. `BLESSBOARD_OTP_PROVIDER=test` was limited to this disposable run. |
| No unauthorized record export | Passed for paper destruction | G05 refused destruction and wrote no record. A general export test was not executed. |
| No cross-patient data association | Not executed | D16 did not reach the cross-clinic appointment assertion. |

## Failed security-adjacent tests

| Test | Failure |
| --- | --- |
| D14C and D16 platform OTP | `platform.otp_challenges` is not present. No OTP challenge migration was added. |
| D25 slot capacity | `APT-01-03_NOT_IMPLEMENTED`. |
| D25 staff overlap | `BLOCKED_APPROVAL_REQUIRED`. The overlap check remains outside the appointment transaction. |
| BB-ANN-02 | Upload returned 403 `media_uploads_disabled`. The upload flag was not enabled. |
| AC-WEB-08 | Section settings returned 404, so the edit CSRF token could not be read. |
| BB-24 | Posted church id returned 400, not the expected 404. |

## Guard result

The default isolated pin is still `getpro_v13_e2e_regression213101`.
An authorized HTTP run may select only `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`.
The same launch rejects the old regression database and port 5432.
`d18-isolated-execution-plan.test.js` covers that override and still passes with the default pin.
Append-only `platform.audit_events` were not deleted. Cleanup leaves those organizations in place and uses a new key for the next church.
