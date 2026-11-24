# V2.13.2 G132 — final QA handoff

Branch `V13`. Base SHA `f6149d382c64b508bfedd87332dc780b2741684f`.

The commit SHA is recorded in the push verification, not in this file.

BlessBoard version 2.13.2. ActiveClinic version 2.13.2.

## QA scenarios from 23 November 2026

| ID | Status |
|---|---|
| AC-FU-PORTAL-01 | Implemented in the existing clinic-scoped match. Not a new browser proof. |
| AC-FU-PORTAL-02 | POLICY_MISMATCH. Public self-registration stays unapproved. |
| AC-FU-PORTAL-03 | DISABLED_BY_POLICY |
| AC-FU-PORTAL-04 | EXCLUDED_FROM_THIS_FIX_CYCLE |
| AC-FU-WEB-01 | Already passing. Browser suite still green. |
| AC-FU-WEB-02 | Not fixed. Production image upload was not enabled. |
| AC-FU-WEB-03 | Already passing. Browser suite still green. |
| AC-FU-REC-01 through AC-FU-REC-05 | Already passing. Browser suite still green. |
| AC-FU-CLIN-01 and AC-FU-CLIN-02 | Already passing. Browser suite still green. |
| AC-FU-CLIN-03 | Correction form and append-only service added. Persistence of a correction row was not executed as its own HTTP case. |

## Regression

Database-free suite: 551 passed, 0 failed, 2 skipped, of 553 tests, including the version files.

HTTP run 1 and run 2, each: 34 executed, 31 passed, 3 failed, 0 skipped. Failures: D14C, D16, D25 slot. D25 overlap passed.

Playwright cycle 1 and cycle 2, each: ActiveClinic 20 passed, BlessBoard 23 passed, combined 43 passed, 0 failed, 0 skipped.

## New tests

- `tests/v13/unit/g125-vitals-correction.test.js`
- `tests/v13/contract/g122-patient-activation.test.js`

No new Playwright file.

## Migrations

043 and 044 remain G78 disposable only. No new migration file. No migration executed in this run. Shared PostgreSQL was not used. `getpro_v13_e2e_regression213101` was not used. Production was not touched.

## Flags

Public booking disabled. Production media upload disabled. Production OTP disabled. Deployment not performed. `main` was not modified.

## QA readiness

QA_GO = NO-GO. RELEASE_READY = NO.

Hosted QA retest still required for portal activation, new website content, and vitals correction. OTP persistence and slot capacity need a separate approval before those tests can pass. Do not deploy from this candidate without that approval.
