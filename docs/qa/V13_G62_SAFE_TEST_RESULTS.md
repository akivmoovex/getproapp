# V13 G62 — safe test results

Command: database URLs and authorization flags unset, then `node --test` on `tests/v13/contract/*.test.js` and `tests/v13/unit/*.test.js`.

Syntax checks passed for the new engine, retention rules, diagnostics service, pharmacy service, clinical rules, and the new unit file.

```
SAFE_TESTS_PASSED=486
SAFE_TESTS_FAILED=0
SAFE_TESTS_SKIPPED=0
SUITES=147
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
```
