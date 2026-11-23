# V13 G80 Playwright results

Date: 2026-11-23. Branch V13. Database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432` only. Application servers listened on `127.0.0.1:4187` (ActiveClinic) and `127.0.0.1:4186` (BlessBoard). Port 5432 and `getpro_v13_e2e_regression213101` were not used. Public booking remained disabled (`booking_enabled=0`). Media uploads were not enabled. No production OTP, SMS, email, or payment integration was activated.

## Guards

Browser authorization, both database-write flags, and the G78 HTTP database override were required before either Playwright config loaded. The local-only route guard stayed in place. `PLATFORM_TEST_HOST` was an in-process routing key (`activeclinic.pronline.org` or `blessboard.pronline.org`) so the V5 hostname router could select a product while the browser stayed on `127.0.0.1`. Requests whose URL was not `http` to `127.0.0.1` or `*.local.test` on the approved port were aborted.

The first three ActiveClinic launches died before any test: missing platform identity, then the legacy server looking for `public.tenants`, then `BLESSBOARD_CANONICAL_DOMAIN=local.test` refused by the testing profile. Those runs executed 0 tests.

## Latest full ActiveClinic suite

Log: `.v13-isolated-pg/g80-ac8.log`.

| Result | Count |
| --- | --- |
| Executed | 20 |
| Passed | 15 |
| Failed | 5 |
| Skipped | 0 |

Passed: administrator login, staff login, patient portal activation, appointment slot collision, G13, G05, G04, G03, billing denial, AC-05, PAT-01, AC-REC-02, AC-PUB-01, G66, G67.

Failed: AC-AUTH-04, AC-REG-01, AC-WEB-08, AC-WEB-09, AC-REC-03.

A later focused rerun of those five (`.v13-isolated-pg/g80-ac9.log`) also failed all five. Locator adjustments made after that rerun were not executed again, so they are not counted as passes.

## Latest full BlessBoard suite

The first BlessBoard launch was serial. BB-01 failed, and Playwright did not run the other 22. That is not a pass for those 22.

The independent rerun (`.v13-isolated-pg/g80-bb2.log`) executed every test:

| Result | Count |
| --- | --- |
| Executed | 23 |
| Passed | 2 |
| Failed | 21 |
| Skipped | 0 |

Passed: BB-05 member registration, D14C OTP gate stayed blocked.

Failed: both BB-01 section tests, both BB-02 announcement tests, BB-03, BB-04, both BB-06 tests, both BB-24 tests, both INV-01 tests, BB-AUTH-04, BB-MEM-01, BB-MEM-02, BB-REG-07, BB-ANN-01, BB-WEB-08, BB-WEB-09, BB-WEB-10, BB-ANN-02.

Church administrator login reached the website hub. Legacy `ensureChurchSchema` was not applied. The setup flag `GETPRO_V13_SKIP_LEGACY_CHURCH_SCHEMA=1` returned before the foundation schema loader.

## Combined latest full suites

| Result | Count |
| --- | --- |
| Executed | 43 |
| Passed | 17 |
| Failed | 26 |
| Skipped | 0 |

These counts are passed Playwright assertions only. Journeys that rendered the right page but failed a later assertion are failures.
