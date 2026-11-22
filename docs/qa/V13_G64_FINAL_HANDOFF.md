# V13 G64 — final handoff

Pull `origin/V13` after this file is pushed. The feature commit is `f4b82d2c60ed67c744d9193207f6256ab5bb43eb`. Its parent is `b1aee6322588b0a1c8125cd7038e6ecefb3aa023`. `main` remains `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. Product version is 2.13.1.

## What landed

- Laboratory reference rules are classified only from an explicitly approved rule for the same organisation, facility, test, and unit. No default threshold is in the code.
- Migration `044_laboratory_reference_rules.sql` is prepared and not executed. Saved range configuration is not operational.
- The prescription form stays manual, with an optional dose unit and an optional catalogue item id that does not choose a drug.
- One dispense request cannot list the same prescription item twice. Remainder and permission checks stay.
- Retention, hold, and consent planners never delete a record. Migration 043 is still not applied.
- Media uploads stay disabled. Production OTP delivery stays inactive. No vendor was selected.

## Counts and tests

ActiveClinic: 30 total, 16 implemented, 7 partial, 6 blocked, 1 deferred.
BlessBoard: 17 total, 13 implemented, 3 partial, 1 blocked.
Safe tests: 486 passed, 0 failed. HTTP: `NOT_RUN`. Browser: `NOT_RUN`.

## Still required before operations

A clinic must supply its own reference rules after 044 is applied on an authorized isolated database. Prescription queue handoff still needs a real catalogue id. Public-page rows are still absent. Do not set `BLESSBOARD_MEDIA_UPLOADS_ENABLED`. Do not set a production OTP provider until one is chosen and documented. Do not enable public booking.

## Next laptop

Read `docs/functional/LAPTOP_DEVELOPMENT_HANDOFF.md` and `docs/qa/V13_G36_ISOLATED_TEST_READINESS.md`. Do not connect to port 5432. The next authorized test stage is isolated HTTP and Playwright on `127.0.0.1:55432`, without applying 043 or 044 and without enabling booking or media uploads.

`docs/qa/V2131_GAP_G08_FINAL_REPORT.md` stays untracked.

```
FEATURE_COMMIT=f4b82d2c60ed67c744d9193207f6256ab5bb43eb
SAFE_TESTS_PASSED=486
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
MIGRATION_043=NOT_EXECUTED
MIGRATION_044=PREPARED_NOT_EXECUTED
PRODUCTION_MEDIA_UPLOADS=DISABLED
PRODUCTION_OTP_DELIVERY=NOT_ACTIVATED
CLINICAL_THRESHOLDS=NOT_CONFIGURED
RELEASE_READY=NO
```
