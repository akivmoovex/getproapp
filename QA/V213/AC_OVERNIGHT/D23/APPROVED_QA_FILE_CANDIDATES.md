# Approved QA file candidates

122 paths are candidates for a later QA-only commit. The exact list is `QA_COMMIT_MANIFEST.md`. Nothing is staged.

## D22 test and harness changes

Five files:

- `tests/v13/contract/d22-ac05-route-contract.test.js`
- `tests/v13/unit/d22-ac05-admin-denial.test.js`
- `tests/v13/fixtures/v13SyntheticFixtures.js`
- `tests/v13/contract/d19-qa-implementation.test.js`
- `tests/e2e/v13/v13-ac-platform-qa.spec.js`

The last three already existed from D19. D22 edited them. They contain no product runtime.

## D22 reports

Seven files under `QA/V213/AC_OVERNIGHT/D22/`:

- `AC05_ROUTE_AND_PERMISSION_CONTRACT.md`
- `AC05_TEST_AUDIT.md`
- `AC05_NEGATIVE_AUTH_TESTS.md`
- `G1_EXECUTION_RESULTS.md`
- `G3_AUTHENTICATED_EVIDENCE_PLAN.md`
- `FILE_CHANGE_MANIFEST.md`
- `D22_FINAL_REPORT.md`

## D20 and D21 documentation

Seven D20 files and seven D21 files under `QA/V213/AC_OVERNIGHT/D20/` and `D21/`. They record the 84-case matrix, the V12/V13 diff, and the G1 classification. They are included.

## Earlier QA material required by those tests

The remaining candidates are the V13 tests, helpers, held integration and browser specs, `docs/qa/V213_*`, the three OTP design notes under `docs/platform/`, two Playwright configs, two CI scripts, ten `package.json` test-script lines, and four held V13 workflow files.

The workflow files are CI text. Their live jobs stay disabled. They do not add a push trigger or a deployment job. `package.json` gains test scripts only.

## Not candidates

Sixty product files under `src/`, `views/`, and `public/` are excluded. A future commit of the 122 QA paths still cannot pass on a clean tree, because the tests call the uncommitted OTP module and the modified route files.
