# V2.13 D16 CI coverage report

Branch `V13`. Committed HEAD `b8f6b420d25e908de64ba292866c218c32edc30c`. This audit compared that commit with the full working tree, including untracked files. D03–D14 product changes were left in place. D16 added tests, fixtures are the existing in-memory OTP fixtures, QA documents, and static workflow files.

## Feature inventory

32 changed behaviors are in `docs/qa/V213_D16_FEATURE_COVERAGE_MATRIX.json`.

- BlessBoard: 12. Eight repaired QA issues, staff invitation, church-registration session hook, login/logout, website editing, and branch administration.
- ActiveClinic: 8. Six are OTP hooks on existing authentication and role changes. AC-05 is the preserved lower-privilege blocker, not a new V2.13 feature. Appointment routes are not in the V2.13 diff.
- Shared platform: 12. OTP engine, environment policy, providers, Zambia SMS normalization, activation hold, session gate, workflows, CSRF, audit, version 2.13, CI guards, and rate/replay controls.

ActiveClinic appointment booking, clinical records, pharmacy, and billing were not newly implemented in V2.13.

## Existing tests reused

The D03–D14 V13 contract and unit files, BB-05 CSRF contracts, the version initialization test, the CI isolation guards, and the gated BlessBoard integration files. Those integration files still stop at `NOT_RUN` unless both database authorization flags are set. D16 did not turn that gate on.

## New tests

- `tests/v13/unit/d16-otp-security.test.js` covers the production fixed-code refusal, fake-provider refusal, activation hold, six-digit generation, expiry, single use, attempt cap, resend cooldown, account, tenant, session, and purpose binding, recovery non-enumeration, wrong-action denial, cross-church denial, plaintext and log absence, provider failure, and no session cookie before OTP when the policy is active.
- `tests/v13/contract/d16-ac-v213-contract.test.js` checks the ActiveClinic route hooks and records that AC-05 is not closed.
- `tests/v13/contract/d16-platform-shared-contract.test.js` checks the shared policy, both products on one gate, version text, and logout remaining CSRF-only.
- `tests/v13/integration/d16-ac-auth.integration.test.js` and `tests/v13/integration/d16-platform-otp.integration.test.js` name real routes and persistence scenarios. Both stayed `NOT_RUN`.
- `tests/e2e/v13/v13-ac-platform-qa.spec.js` names browser routes and fails closed if executed. It was not executed.

## CI mapping

| Area | Workflow | Stage A | Stages B–D |
|---|---|---|---|
| BlessBoard | `v13-bb-qa-regression.yml` and `v13-bb-bug-regressions.yml` | Static, unit, and contract commands. Not dispatched. | B and C remain `if: false`. Existing Stage D writes a QA report and does not write a database. It was not dispatched. |
| ActiveClinic | `v13-ac-qa-regression.yml` | `npm run test:v13:ac` after syntax checks. Not dispatched. | B, C, and D are `if: false`. |
| Shared platform | `v13-platform-qa-regression.yml` | `npm run test:v13:platform`. Not dispatched. | B, C, and D are `if: false`. |

All four V13 workflows are `workflow_dispatch` only. None has a push, pull request, or schedule trigger. Database-writing jobs were not enabled.

## Execution

Database-independent command `npm run test:v13:contract`: 131 passed, 0 failed. That includes the new OTP, ActiveClinic, platform, CSRF, and CI-guard tests.

`node --test tests/v213-version-initialization.test.js`: 3 passed, 0 failed.

`npm run test:v13:integration:gated`: 11 records passed as `NOT_RUN`. They are not functional integration passes. Re-running the two new records after the scenario text change produced the same `NOT_RUN` result.

JavaScript syntax checks on the new tests and the existing CI scripts passed. `git diff --check` was clean. Playwright was not run. No workflow was dispatched.

## Measured coverage

Tool: c8 10.1.3, already in the repository, with `--all` on the changed source included below. The suite was the V13 contract and unit tests only.

Full-product statement, branch, function, and line coverage through `npm run test:coverage:blessboard`, `test:coverage:activeclinic`, and `test:coverage:platform` is `NOT_MEASURED`. Those runners are not limited to database-independent tests, so they were not started.

Changed-code coverage from this suite:

| Area | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| BlessBoard changed JavaScript | 17.34% (2042/11779) | 59.11% (357/604) | 24.18% (44/182) | 17.34% (2042/11779) |
| ActiveClinic changed JavaScript | 4.30% (208/4826) | 13.33% (2/15) | 10.00% (1/10) | 4.30% (208/4826) |
| OTP, session gate, and startup | 83.30% (1417/1701) | 66.73% (305/457) | 84.05% (58/69) | 83.30% (1417/1701) |

c8 reported the same statement and line totals on this run. ActiveClinic route files were read by contract tests and not imported, so their executed coverage is 0. The ActiveClinic branch and function denominators include only modules the suite loaded. Templates are outside this c8 run.

These percentages are baselines for this suite. They are not release gates. BlessBoard and ActiveClinic route coverage is too low, and too dependent on unloaded HTTP modules, to justify a numeric threshold. The platform OTP baseline of 83.30% lines and 66.73% branches can be used later as a regression floor for the same include set. Falling below it would be a signal. Staying at it does not approve production OTP. The supported release gate is unchanged: Stage A must have zero failures, and Stages B, C, and authenticated Stage D must record real passes on a disposable database before a product area can be called ready.

## Security coverage

OTP security tests in `npm run test:v13:otp-security`: 15 passed. The production activation result is `BLOCKED`, including when the override is `ACTIVE`, and the test asserts it is not a ready state. Production still completes existing sessions because the hold is blocked. That is a release blocker, not a production-ready OTP policy.

CSRF security tests that executed include 5 shell-hardening tests, 7 BB-05 route contract tests, and 6 BB-05 registration contract tests. Logout still validates CSRF and does not take an OTP workflow.

Tenant isolation for OTP cross-organization verification passed in process. Live cross-church and cross-clinic browser sessions were not run.

## Missing scenarios

- Authorized database persistence for every gated integration file.
- Playwright journeys for BlessBoard, ActiveClinic, and the platform hold. The new browser file was not run.
- INV-01 first authenticated login.
- AC-05 live lower-privilege denial.
- Staff-created patient activation persistence. The workflow is booking-independent and is not a new enrollment engine.
- Clinic administrator login as a distinct executed session. The V2.13 change is the registration session hook.
- Existing appointment behavior. No V2.13 appointment file changed, and no new appointment suite was added.

## Release status

| Area | Status |
|---|---|
| BlessBoard | Not ready. Local unit and contract evidence passed. Integration and browser evidence is `NOT_RUN`. |
| ActiveClinic | Not ready. AC-05 remains blocked. Route coverage was not executed. |
| Shared platform | Not ready. OTP persistence and authenticated sessions were not run. |
| OTP | Not ready. Architecture tests passed. Production activation is `BLOCKED`. |
| V2.13 overall | `RELEASE_BLOCKED` |

## Remaining approvals

Disposable CI database authorization, browser provisioning, OTP migration application, provider selection, and release verification. None of those approvals was granted or simulated in D16.
