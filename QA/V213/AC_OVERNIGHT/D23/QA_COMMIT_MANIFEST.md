# QA commit manifest

This is the exact file list for a future QA-only commit. It has not been staged. `git add -A` must not be used, because that would include the 60 product files.

HEAD must still be `b8f6b420d25e908de64ba292866c218c32edc30c` on `V13`.

The QA set is not self-contained. Tests import `src/platform/otp/` and the modified BlessBoard and ActiveClinic routes. Those product files are excluded. A clean checkout of this commit alone will not pass the suite until a separate approved product commit exists, or until this list is deliberately widened.

Proposed message, not executed:

```
Record the V2.13 QA evidence and held regression tests.

The reports and tests stay on the QA branch. They do not release ActiveClinic, enable OTP, or open the database and browser gates.
```

Proposed push, not executed:

```
git push -u origin V13
```

Candidate count: 122

- `.github/workflows/v13-ac-qa-regression.yml`
- `.github/workflows/v13-bb-bug-regressions.yml`
- `.github/workflows/v13-bb-qa-regression.yml`
- `.github/workflows/v13-platform-qa-regression.yml`
- `QA/V213/AC_OVERNIGHT/D20/ACCEPTANCE_CASE_PROVENANCE.md`
- `QA/V213/AC_OVERNIGHT/D20/ACCEPTANCE_MATRIX_69_VS_84.csv`
- `QA/V213/AC_OVERNIGHT/D20/BASELINE_VERIFICATION.md`
- `QA/V213/AC_OVERNIGHT/D20/D19_TEST_COUNT_RECONCILIATION.md`
- `QA/V213/AC_OVERNIGHT/D20/D20_FINAL_REPORT.md`
- `QA/V213/AC_OVERNIGHT/D20/IMPLEMENTATION_VS_TEST_COVERAGE.md`
- `QA/V213/AC_OVERNIGHT/D20/V12_V13_AC_DIFF.md`
- `QA/V213/AC_OVERNIGHT/D21/ACCEPTANCE_84_STATUS.csv`
- `QA/V213/AC_OVERNIGHT/D21/BASELINE_SAFETY.md`
- `QA/V213/AC_OVERNIGHT/D21/CLINICAL_DESIGN_APPROVALS.md`
- `QA/V213/AC_OVERNIGHT/D21/D21_FINAL_REPORT.md`
- `QA/V213/AC_OVERNIGHT/D21/FEATURE_DEPENDENCY_PLAN.md`
- `QA/V213/AC_OVERNIGHT/D21/G1_EVIDENCE_REVIEW.md`
- `QA/V213/AC_OVERNIGHT/D21/SECURITY_RELEASE_BLOCKERS.md`
- `QA/V213/AC_OVERNIGHT/D22/AC05_NEGATIVE_AUTH_TESTS.md`
- `QA/V213/AC_OVERNIGHT/D22/AC05_ROUTE_AND_PERMISSION_CONTRACT.md`
- `QA/V213/AC_OVERNIGHT/D22/AC05_TEST_AUDIT.md`
- `QA/V213/AC_OVERNIGHT/D22/D22_FINAL_REPORT.md`
- `QA/V213/AC_OVERNIGHT/D22/FILE_CHANGE_MANIFEST.md`
- `QA/V213/AC_OVERNIGHT/D22/G1_EXECUTION_RESULTS.md`
- `QA/V213/AC_OVERNIGHT/D22/G3_AUTHENTICATED_EVIDENCE_PLAN.md`
- `QA/V213/AC_OVERNIGHT/D23/APPROVED_QA_FILE_CANDIDATES.md`
- `QA/V213/AC_OVERNIGHT/D23/D23_FINAL_REPORT.md`
- `QA/V213/AC_OVERNIGHT/D23/GIT_STATUS_AUDIT.md`
- `QA/V213/AC_OVERNIGHT/D23/PUSH_APPROVAL_CHECKLIST.md`
- `QA/V213/AC_OVERNIGHT/D23/QA_COMMIT_MANIFEST.md`
- `QA/V213/AC_OVERNIGHT/D23/UNEXPECTED_FILE_REVIEW.md`
- `docs/platform/V213_D14A_OTP_FOUNDATION.md`
- `docs/platform/V213_D14B_OTP_PROVIDERS.md`
- `docs/platform/V213_D14C_OTP_INTEGRATION.md`
- `docs/qa/V213_BB_REGRESSION_MATRIX.json`
- `docs/qa/V213_BB_REGRESSION_MATRIX.md`
- `docs/qa/V213_D05_BUG_REGRESSION_INVENTORY.json`
- `docs/qa/V213_D05_REGRESSION_REPORT.md`
- `docs/qa/V213_D16_CI_COVERAGE_REPORT.md`
- `docs/qa/V213_D16_FEATURE_COVERAGE_MATRIX.json`
- `docs/qa/V213_D16_FEATURE_COVERAGE_MATRIX.md`
- `docs/qa/V213_D17_CI_COVERAGE_REPORT.md`
- `docs/qa/V213_D17_FEATURE_BEHAVIOR_MATRIX.json`
- `docs/qa/V213_D17_FEATURE_BEHAVIOR_MATRIX.md`
- `docs/qa/V213_D17_FINAL_OVERNIGHT_REPORT.md`
- `docs/qa/V213_D17_PRODUCTION_REPAIRS.md`
- `docs/qa/V213_D17_RELEASE_BLOCKERS.md`
- `docs/qa/V213_D17_SECURITY_COVERAGE_REPORT.md`
- `docs/qa/V213_D17_TEST_QUALITY_REPORT.md`
- `docs/qa/V213_D18_CI_READINESS.md`
- `docs/qa/V213_D18_EXECUTION_APPROVAL_MATRIX.md`
- `docs/qa/V213_D18_RELEASE_BLOCKER_PLAN.md`
- `docs/qa/V213_D19_CI_SAFETY_REPORT.md`
- `docs/qa/V213_D19_CONDITIONAL_PUSH_DECISION.md`
- `docs/qa/V213_D19_FIXTURE_READINESS.md`
- `docs/qa/V213_D19_TEST_IMPLEMENTATION_REPORT.md`
- `docs/qa/V213_RELEASE_BLOCKER_REPORT.md`
- `package.json`
- `playwright.v13-ac-platform.config.cjs`
- `playwright.v13-bb-qa.config.cjs`
- `scripts/ci/v13-assert-db-isolation.cjs`
- `scripts/ci/v13-qa-report.cjs`
- `tests/bb05-hq-add-member-csrf-contract.test.js`
- `tests/blessboard-member-invitation-route-contract.test.js`
- `tests/blessboard-public-pages.test.js`
- `tests/blessboard-v5-a11y-structure.test.js`
- `tests/e2e/v13/v13-ac-platform-qa.spec.js`
- `tests/e2e/v13/v13-bb-qa-regression.spec.js`
- `tests/shared-website-section-lifecycle.test.js`
- `tests/v13/contract/bb01-homepage-sections-contract.test.js`
- `tests/v13/contract/bb02-announcements-contract.test.js`
- `tests/v13/contract/bb03-events-contract.test.js`
- `tests/v13/contract/bb04-sermons-contract.test.js`
- `tests/v13/contract/bb05-member-registration-csrf-contract.test.js`
- `tests/v13/contract/bb06-member-activation-contract.test.js`
- `tests/v13/contract/bb24-public-directory-contract.test.js`
- `tests/v13/contract/csrf-shell-extra-override-hardening.test.js`
- `tests/v13/contract/d14a-shared-otp-contract.test.js`
- `tests/v13/contract/d14b-otp-providers-contract.test.js`
- `tests/v13/contract/d14c-otp-auth-contract.test.js`
- `tests/v13/contract/d16-ac-v213-contract.test.js`
- `tests/v13/contract/d16-platform-shared-contract.test.js`
- `tests/v13/contract/d18-ci-readiness.test.js`
- `tests/v13/contract/d19-qa-implementation.test.js`
- `tests/v13/contract/d22-ac05-route-contract.test.js`
- `tests/v13/contract/inv01-staff-invitation-contract.test.js`
- `tests/v13/contract/v13-ci-isolation-guards.test.js`
- `tests/v13/contract/v13-previously-passing-sanity-coverage.test.js`
- `tests/v13/fixtures/v13SyntheticFixtures.js`
- `tests/v13/helpers/v13CiDatabaseGuard.js`
- `tests/v13/helpers/v13DbWriteGate.js`
- `tests/v13/helpers/v13QaStatus.js`
- `tests/v13/integration/bb01-homepage-sections.integration.test.js`
- `tests/v13/integration/bb02-announcements.integration.test.js`
- `tests/v13/integration/bb03-events.integration.test.js`
- `tests/v13/integration/bb04-sermons.integration.test.js`
- `tests/v13/integration/bb05-member-registration.integration.test.js`
- `tests/v13/integration/bb06-member-activation.integration.test.js`
- `tests/v13/integration/bb24-public-directory.integration.test.js`
- `tests/v13/integration/d14c-otp-auth.integration.test.js`
- `tests/v13/integration/d16-ac-auth.integration.test.js`
- `tests/v13/integration/d16-platform-otp.integration.test.js`
- `tests/v13/integration/inv01-staff-invitation.integration.test.js`
- `tests/v13/integration/v13AuthorizedScenarios.js`
- `tests/v13/quality/d17-mutation-probes.test.js`
- `tests/v13/unit/bb01-homepage-section-editor.test.js`
- `tests/v13/unit/bb03-event-creation.test.js`
- `tests/v13/unit/bb04-sermon-creation.test.js`
- `tests/v13/unit/bb24-public-directory.test.js`
- `tests/v13/unit/d14a-shared-otp.test.js`
- `tests/v13/unit/d14b-otp-providers.test.js`
- `tests/v13/unit/d14c-otp-auth.test.js`
- `tests/v13/unit/d16-otp-security.test.js`
- `tests/v13/unit/d17-ac-behavior.test.js`
- `tests/v13/unit/d17-bb-behavior.test.js`
- `tests/v13/unit/d17-otp-behavior.test.js`
- `tests/v13/unit/d17-platform-http-behavior.test.js`
- `tests/v13/unit/d18-sermon-route-http.test.js`
- `tests/v13/unit/d19-synthetic-fixtures.test.js`
- `tests/v13/unit/d22-ac05-admin-denial.test.js`
- `tests/v13/unit/inv01-staff-invitation.test.js`
- `tests/v211-hq-add-member-get.test.js`
