# V13 G89 final handoff

Product version stays 2.13.1. Branch `V13`. Base `967af6e96d1b4e3e64fa7230fdfbd50918a214a3`. This commit records the G83–G88 repair evidence. It does not mark the release ready.

The commit that adds this file cannot name its own SHA. After the push, `git rev-parse HEAD` must equal `git rev-parse origin/V13`. Local `main` must stay `44eafec486a18aeef2777bbcc9683e43f68ebe0d`.

## What changed

- Unresolved BlessBoard enquiries return 404 before body validation. A posted church id is still ignored.
- Walk-in arrival constraint failures return invalid input instead of an uncaught exception.
- Patient HTTP registration sends `step=confirm` and a unique surname.
- Heart-rate browser assertion reads the select option. Anonymous vitals HTML is a login redirect. The other clinic is denied with 403.
- Password-reset browser replay opens the used link and requires the invalid-link message.
- Media upload HTTP asserts 403 `media_uploads_disabled` while the flag is unset.

## What did not change

Public booking, production media upload, production OTP, and `platform.otp_challenges` stay off. Migrations 043 and 044 were not applied anywhere except the existing disposable database. Port 5432 and `getpro_v13_e2e_regression213101` were not used.

## Final block

```
FINAL=V13_G89_REGRESSION_REPAIR_HANDOFF
BRANCH=V13
BASE_SHA=967af6e96d1b4e3e64fa7230fdfbd50918a214a3
NEW_SHA=SEE_PUSH_VERIFICATION
REMOTE_SHA=SEE_PUSH_VERIFICATION
REMOTE_SHA_MATCH=SEE_PUSH_VERIFICATION
TEST_DATABASE=getpro_v13_e2e_g78d2301
TEST_POSTGRES_HOST=127.0.0.1
TEST_POSTGRES_PORT=55432
SAFE_TESTS_PASSED=526
SAFE_TESTS_FAILED=0
SAFE_TESTS_SKIPPED=2
HTTP_TESTS_EXECUTED=34
HTTP_TESTS_PASSED=20
HTTP_TESTS_FAILED=14
HTTP_TESTS_SKIPPED=0
PLAYWRIGHT_EXECUTED=43
PLAYWRIGHT_PASSED=19
PLAYWRIGHT_FAILED=24
PLAYWRIGHT_SKIPPED=0
AC_REGRESSIONS_VERIFIED_E2E=3
AC_REGRESSIONS_VERIFIED_HTTP=2
BB_REGRESSIONS_VERIFIED_E2E=0
BB_REGRESSIONS_VERIFIED_HTTP=4
ORIGINAL_16_VERIFIED_E2E=3
ORIGINAL_16_REMAINING=13
D28_BROWSER_DEFECTS_VERIFIED=3
D28_BROWSER_DEFECTS_REMAINING=9
BUGS_FIXED_THIS_RUN=5
BUGS_STILL_FAILING=14_HTTP_24_BROWSER
TEST_INFRASTRUCTURE_BLOCKERS=BB_INVITE_AND_OTP_SECRETS_NOT_RETAINED
NEW_CRITICAL_SECURITY_ISSUES=NONE
MIGRATION_043=G78_DISPOSABLE_ONLY
MIGRATION_044=G78_DISPOSABLE_ONLY
SHARED_POSTGRES_TOUCHED=NO
EXISTING_QA_DB_TOUCHED=NO
PRODUCTION_TOUCHED=NO
PUBLIC_BOOKING=DISABLED
PRODUCTION_MEDIA_UPLOAD=DISABLED
PRODUCTION_OTP=DISABLED
FILES_COMMITTED=18
COMMIT=SEE_COMMIT
PUSH=SEE_PUSH_VERIFICATION
MAIN_UNCHANGED=YES
DEPLOYMENT=NOT_PERFORMED
FUNCTIONALITY_DOC_UPDATED=YES
QA_CANDIDATE_READY=NO
RELEASE_READY=NO
BLOCKERS=AC-WEB-08 public section, AC-WEB-09 existing-clinic preview, AC-REC-02 existing-clinic check-in, unpublished BlessBoard public pages, BB-06, INV-01, OTP table absent, slot lock unimplemented
HANDOFF_REPORT=docs/qa/V13_G89_FINAL_HANDOFF.md
NEXT_RECOMMENDED_ACTION=Repair the existing-clinic walk-in error, the mint draft preview, and BlessBoard website publication without enabling booking, media uploads, or platform.otp_challenges
```
