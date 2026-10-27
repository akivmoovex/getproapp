# V211-QA167 Regression Coverage Matrix

Baseline: `a55731044240d385236f0a6d0cd8d21fcffd5a0d` on `qa-v211-overnight-20261017`.

This inventory counts only executable tests and their recorded execution results. Source inspection, test discovery, and browser plans are not counted as passes. No product code was changed and no new placeholder tests were created.

## Coverage matrix

| Bug | Executable coverage and exact test name | Result | HTTP/browser | Persistence/security | Missing coverage |
|---|---|---|---|---|---|
| AC-11 | `tests/activeclinic-mf08-patient-registration.test.js` — `registration GET, valid phone-first register, login, profile, and isolation`; `keeps patient register usable at 390px` | `EXECUTED_PASS` (QA158 suite evidence) | HTTP; 390px source/DOM assertion, not hosted browser | Registration and clinic isolation asserted; CSRF/unauthorized negative matrix is not complete | Full desktop/mobile browser workflow |
| AC-15 | `tests/activeclinic-mf08-patient-registration.test.js` — `registration GET, valid phone-first register, login, profile, and isolation`; `tests/activeclinic-mf08-patient-registration.test.js` suite broader setup | `BLOCKED` for full MF08 persistence run; QA159 recorded setup collision `pg_database_datname_index` | HTTP/local only; no browser completion | Exactly-one persistence and wrong-clinic checks were not completed in the blocked run | Non-reset disposable fixture and duplicate-submit persistence proof |
| AC-16 | `tests/activeclinic-patient-portal.test.js` — `guest token registration links patient and lists only owned bookings`; `patient login/logout and session isolation from /app`; `CSRF required on patient login POST` | `EXECUTED_PASS` (9/9 portal suite per QA160) | HTTP; browser navigation not executed | Patient account/session isolation and CSRF asserted | Full public Find Clinic browser path and activation UI |
| AC-17 | `tests/activeclinic-mf08-patient-registration.test.js` — `registration GET, valid phone-first register, login, profile, and isolation`; `tests/activeclinic-patient-portal.test.js` phone/session paths | `PARTIALLY_VERIFIED` | HTTP only | Clinic scope and identity association covered | Full phone-format matrix: international, leading-zero, ambiguous, cross-clinic, malformed |
| BB-06 | `tests/blessboard-announcements.test.js` — `HQ publishes church-wide with confirm; drafts without confirm`; `branch admin list/create/preview/publish/archive GUI with CSRF and delivery summary`; `HQ church-wide and branch-scoped announcement GUI preserve publish/preview/archive/concurrency` | `EXECUTED_PASS` (local focused evidence) | HTTP; no hosted/browser acceptance | Publish policy, drafts, branch scope, CSRF and cross-tenant reads covered | Hosted public rendering and authorized browser workflow |
| BB-07 | `tests/blessboard-website-mode-admin-nav.test 2.js` — `multi-site HQ navigation shows HQ Website, Branch Websites, and active branches only`; `tests/blessboard-branch-mini-websites.test.js` relevant branch publication tests | `EXECUTED_PASS` for local navigation/branch coverage | HTTP/local; no hosted browser | Branch isolation and cross-branch denial asserted | Hosted Add Sermon/Event browser and public checks |
| BB-08 | `tests/v7-website-image-management.test 2.js` and shared website editor suites provide contract-level media assertions | `BLOCKED` for requested V211 media workflow; QA156 recorded empty media library/upload unavailable | HTTP/unit contract; no browser media picker | Media ownership/security contract exists, but valid asset selection/upload and public image persistence were not executed | Real authorized media selection/upload, reopen, publish, public image URL |
| BB-09 | `tests/blessboard-announcements.test.js` — `HQ publishes church-wide with confirm; drafts without confirm`; `isolates member audiences and branch scope for reads`; `branch admin cannot open another campus announcement on host HQ scope` | `EXECUTED_PASS` locally; QA157 workflow pass | HTTP; no hosted/browser acceptance | Audience, draft, branch and tenant restrictions asserted | Full scheduled/expired/HQ-vs-branch hosted matrix |
| BB-10 | `tests/bb-v211-qa137-member-registration.http.test.js` — `HTTP registration form is served in the tenant context`; `HTTP negative CSRF cases`; `tests/bb-v211-qa137-member-registration.spec.cjs` — `member registration preserves CSRF and creates one registration` | `PARTIALLY_VERIFIED` | HTTP and browser spec exists; recorded hosted/authenticated execution unavailable | CSRF and registration contract covered; exactly-one persistence depends on configured fixture | Executed authorized browser run and complete hosted persistence proof |
| BB staff invitation | `tests/blessboard-staff-invitation.test.js` — `invite new user`, `duplicate invitation resends (invalidates prior token)`, `role and branch scope enforced`, `token expiration and single use`, `revocation works`, `unauthorized role escalation fails`; `tests/bb-v211-qa137-staff-invitation.http.test.js` — `HTTP staff invitation form requires authorized HQ session`, `HTTP invalid, replayed and wrong-church invitations` | `EXECUTED_PASS` locally; browser portion partial | HTTP/local; authenticated browser fixture unavailable | Token lifecycle, role/branch scope, replay, revocation and wrong-church denial covered | Hosted authorized browser invitation/activation |

## Totals

- `EXECUTED_PASS`: AC-11, AC-16, BB-06, BB-07, BB-09, BB staff invitation
- `PARTIALLY_VERIFIED`: AC-17, BB-10
- `BLOCKED`: AC-15, BB-08
- `TEST_MISSING`: none for the listed bug contracts at unit/integration level
- `EXECUTED_FAIL`: none recorded in the referenced QA131–QA166 evidence
- `SKIPPED`: hosted/browser executions and specific matrices listed above; these are not counted as passes

## Test files changed

None. No safe, non-placeholder focused test could be added without inventing the unavailable authorized hosted/media fixtures. Product files changed: zero.

## Remaining blockers

1. Authenticated BlessBoard browser fixture is unavailable.
2. Hosted QA still serves V9 baseline rather than the QA branch.
3. BB-08 requires a test-owned authorized media asset and supported picker/upload route.
4. AC-15 requires a non-colliding disposable database fixture for persistence and duplicate prevention.
5. AC-17 requires execution of the full phone normalization and clinic-scope matrix.
6. BB-10 requires an executed authorized browser/persistence run.
