# D19 test-count reconciliation

D19 reported `TOTAL_EXECUTED=184`, `TOTAL_PASSED=173`, `TOTAL_FAILED=0`, `TOTAL_NOT_RUN=30`, with 11 integration scenarios, 14 BlessBoard browser scenarios, and 5 ActiveClinic browser scenarios implemented.

## Manifest

Literal `it(` / `test(` counts in the V13 worktree:

| Set | Files | Tests |
|---|---|---|
| `tests/v13/unit` | 15 | 50 |
| `tests/v13/contract` | 18 | 95 |
| `tests/v13/quality` | 1 | 3 |
| Stage A extras (`shared-website-section-lifecycle`, BB-05 CSRF, `v211-hq-add-member-get`, `v213-version-initialization`) | 4 | 25 |
| Stage A total | 38 | 173 |
| `tests/v13/integration` | 11 | 11 |
| `tests/e2e/v13/v13-bb-qa-regression.spec.js` | 1 | 14 |
| `tests/e2e/v13/v13-ac-platform-qa.spec.js` | 1 | 5 |

Stage A manifest count is 173, the same number as the saved Stage A log (`# tests 173`, `# pass 173`, `# fail 0`, `# skipped 0`).

## How the D19 totals add up

Collected tests in that scope: `173 + 11 + 19 = 203`.

The node runner was started for the 173 Stage A tests and the 11 integration files. That is the reported 184 executed node tests.

The 173 Stage A tests asserted behavior and passed.

The 11 integration tests were entered and returned `NOT_RUN` from `runGated` before any database call. Node still counts each one as a passing test. They are not persistence passes.

The 19 browser tests were not launched. Playwright was not started.

`NOT_RUN=30` is `11` gated integration journeys plus `19` browser journeys that never started.

`184` is not `173 + 30`. The 11 gate records sit in both the executed node count and the not-run journey count. `173 + 11 = 184`, and `11 + 19 = 30`. Failed stays 0. Skipped stays 0.

`UNIT_TESTS`, `CONTRACT_TESTS`, `HTTP_TESTS`, `SECURITY_TESTS`, and `OTP_TESTS` were reported as `PASS` because those files are inside the 173. The log does not publish a separate pass count for each label. No failure is recorded in that log.

## What this does not prove

The 11 integration bodies and 19 browser bodies were not executed. AC-05 live denial, patient activation persistence, and appointment conflict persistence were not run.
