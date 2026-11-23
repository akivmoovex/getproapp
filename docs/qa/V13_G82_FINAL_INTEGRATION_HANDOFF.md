# V13 G82 final integration handoff

Product version stays 2.13.1. Branch `V13`. This handoff records the G82 runs. It does not mark the release ready, and it does not record a deployment.

The commit that adds this file is the G82 handoff commit. `PREVIOUS_SHA` is the parent. After the push, `git rev-parse HEAD` and `git rev-parse origin/V13` must match. Local `main` must stay `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. `origin/main` was not updated.

## What was executed

Safe suite, with database URLs and write flags unset:

`node --test --test-concurrency=1 --test-timeout=30000 tests/v13/contract/*.test.js tests/v13/unit/*.test.js tests/v13/quality/*.test.js tests/church-database-identity.test.js tests/v8-hostinger-env-profile-conflict.test.js`

Result: 528 tests, 526 passed, 0 failed, 2 skipped. Log: `.v13-isolated-pg/g82-safe.log` (gitignored).

HTTP suite, only through `.v13-isolated-pg/g79-run.cjs`:

Preflight: `database=getpro_v13_e2e_g78d2301`. The runner refuses a non-zero `public_booking_enabled` and requires `activeclinic.record_migration_batches` and `activeclinic.laboratory_reference_rules`. Result: 34 executed, 16 passed, 18 failed, 0 skipped. Log: `.v13-isolated-pg/g82-http.log`.

Playwright, only through `.v13-isolated-pg/g80-playwright.cjs`, localhost ports 4187 and 4186, same disposable database:

- ActiveClinic full suite: 20 executed, 15 passed, 5 failed, 0 skipped. Log: `.v13-isolated-pg/g82-ac.log`.
- BlessBoard full suite: 23 executed, 2 passed, 21 failed, 0 skipped. Log: `.v13-isolated-pg/g82-bb.log`.
- Combined full suites: 43 executed, 17 passed, 26 failed, 0 skipped.
- Focused rerun of AC-WEB-09, AC-REC-02, and AC-REC-03 after locator repairs: 3 executed, 0 passed, 3 failed. It is not added to the full-suite totals. Log: `.v13-isolated-pg/g82-ac-focus.log`.

## Disposable database versus deployment

| Target | Migration 043 | Migration 044 |
| --- | --- | --- |
| `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432` | Applied | Applied |
| `getpro_v13_e2e_regression213101` | Not executed in G82 | Not executed in G82 |
| Shared PostgreSQL port 5432 | Not contacted | Not contacted |
| Hosted QA and production | Not executed | Not executed |

`openMigrationBatch` stays unrouted. No numeric laboratory reference range was inserted. The G66 preview still does not persist.

## Source fixes included from G80–G82

- `src/startup/blessBoardOrgDbGate.js` accepts `platform.database_identity` when the legacy church identity table is absent, and only when the environment and `current_database()` match.
- `src/platform/config/deploymentProfiles.js` allows `local.test` for the testing profile only on `127.0.0.1` with `NODE_ENV=test` and the browser authorization flag.
- Synthetic fixtures create staff login identities for the receptionist and clinician. HTTP scenarios send the required member fields and a past password-reset expiry.
- Playwright assertions follow the registration wizard, the appointment review step, and duplicated responsive markup. They do not weaken CSRF.

## Original 16 regression ids

| ID | Class | Evidence |
| --- | --- | --- |
| AC-REG-01 | VERIFIED_E2E | HTTP passed. Browser passed |
| BB-REG-07 | VERIFIED_HTTP | HTTP passed. Browser URL assertion failed |
| AC-AUTH-04 | VERIFIED_HTTP | HTTP passed. Browser replay POST exceeded 90s |
| BB-AUTH-04 | PARTIAL | HTTP and browser failed. Plaintext OTP was not available |
| BB-MEM-01 | VERIFIED_HTTP | HTTP passed. Browser did not finish registration |
| BB-MEM-02 | VERIFIED_HTTP | HTTP missing CSRF returned 403. Browser status assertion failed |
| AC-WEB-08 | PARTIAL | HTTP and browser failed. Published page omitted the new section |
| AC-WEB-09 | VERIFIED_HTTP | HTTP passed. Draft preview rendered `ac.default` |
| BB-WEB-09 | PARTIAL | HTTP and browser failed |
| BB-WEB-10 | PARTIAL | HTTP and browser failed |
| BB-ANN-01 | PARTIAL | HTTP and browser failed |
| AC-REC-02 | PARTIAL | Unique patient was created. Walk-in stayed on the walk-in URL |
| AC-REC-03 | PARTIAL | Unique patient was created. Heart rate was not shown |
| AC-PUB-01 | PARTIAL | Browser disabled-booking assertion passed. HTTP text assertion failed |
| BB-WEB-08 | PARTIAL | HTTP returned 303. Browser failed |
| BB-ANN-02 | PARTIAL | HTTP returned 403 `media_uploads_disabled`. Upload journey did not pass |

`ORIGINAL_16_REGRESSIONS_VERIFIED` counts only `VERIFIED_E2E`: 1. Five more are `VERIFIED_HTTP`. Ten remain `PARTIAL`.

## D28 browser observations

D28 records `TOTAL_BROWSER_ISSUES=9` and lists 12 observations. This handoff does not renumber that document. G82 browser result: AC-PUB-01’s disabled-state assertion passed. AC-WEB-09, AC-REC-02, AC-REC-03, AC-AUTH-04, BB-MEM-01, BB-MEM-02, BB-ANN-01, BB-ANN-02, BB-WEB-09, BB-WEB-10, and BB-WEB-08 failed. `BROWSER_9_DEFECTS_VERIFIED=1`.

## Requirement counts

Implementation counts are unchanged: ActiveClinic 16 implemented, 7 partial, 6 blocked, 1 deferred. BlessBoard 13 implemented, 3 partial, 1 blocked. Those numbers are not end-to-end passes.

## Security review

- No new external integration was enabled.
- Public booking stayed at 0 on the disposable database.
- `BLESSBOARD_MEDIA_UPLOADS_ENABLED` stayed unset.
- Production OTP stayed inactive. `platform.otp_challenges` was not created.
- CSRF was not bypassed. The AC-AUTH-04 hang was left failing.
- Appointment slot lock and in-transaction staff overlap stay unimplemented.
- Passed cross-organisation denials include G03, G04, and G05 over HTTP, and the receptionist denials in the ActiveClinic browser suite.
- No critical data-integrity repair was required. Append-only audit rows were not deleted.

## Git exclusions

`docs/qa/V2131_GAP_G08_FINAL_REPORT.md` stays untracked and was not deleted. `.v13-isolated-pg/`, `bb-lifecycle.log`, Playwright traces, and `test-results/` are not staged.

## Final block

```
FINAL=V13_G82_ISOLATED_E2E_HANDOFF
BRANCH=V13
PREVIOUS_SHA=c1646e074fb7e7b3a342d76688f2107eff52ae59
NEW_SHA=SEE_PUSH_VERIFICATION
REMOTE_SHA=SEE_PUSH_VERIFICATION
REMOTE_SHA_MATCH=SEE_PUSH_VERIFICATION
TEST_DATABASE=getpro_v13_e2e_g78d2301
TEST_POSTGRES_HOST=127.0.0.1
TEST_POSTGRES_PORT=55432
MIGRATION_043_DISPOSABLE=APPLIED_ON_G78_ONLY
MIGRATION_044_DISPOSABLE=APPLIED_ON_G78_ONLY
DEPLOYMENT_MIGRATIONS=NOT_EXECUTED
AC_TOTAL=30
AC_IMPLEMENTED=16
AC_PARTIAL=7
AC_BLOCKED=6
AC_DEFERRED=1
BB_TOTAL=17
BB_IMPLEMENTED=13
BB_PARTIAL=3
BB_BLOCKED=1
SAFE_TESTS_PASSED=526
SAFE_TESTS_FAILED=0
HTTP_TESTS_EXECUTED=34
HTTP_TESTS_PASSED=16
HTTP_TESTS_FAILED=18
HTTP_TESTS_SKIPPED=0
PLAYWRIGHT_EXECUTED=43
PLAYWRIGHT_PASSED=17
PLAYWRIGHT_FAILED=26
PLAYWRIGHT_SKIPPED=0
ORIGINAL_16_REGRESSIONS_VERIFIED=1
BROWSER_9_DEFECTS_VERIFIED=1
BUG_FIXES_COMMITTED=2
REMAINING_BUGS=15
SECURITY_BLOCKERS=NONE_NEW
SHARED_POSTGRES_TOUCHED=NO
EXISTING_QA_DB_TOUCHED=NO
PRODUCTION_TOUCHED=NO
FILES_COMMITTED=39
COMMIT=SEE_COMMIT
PUSH=SEE_PUSH_VERIFICATION
MAIN_UNCHANGED=YES
DEPLOYMENT=NOT_PERFORMED
FUNCTIONALITY_DOC_UPDATED=YES
HANDOFF_REPORT=docs/qa/V13_G82_FINAL_INTEGRATION_HANDOFF.md
QA_CANDIDATE_READY=NO
RELEASE_READY=NO
NEXT_RECOMMENDED_ACTION=Repair the password-reset replay hang, unpublished website section, mint-theme preview, walk-in queue transition, vitals screen, and BlessBoard public markers without enabling booking, media uploads, production OTP, or platform.otp_challenges
```
