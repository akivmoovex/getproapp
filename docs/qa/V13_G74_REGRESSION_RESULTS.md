# V13 G74 regression results

Command: `node --test --test-concurrency=1 --test-timeout=30000 tests/v13/contract/*.test.js tests/v13/unit/*.test.js`

Database URLs, `PG*` variables, and the write, HTTP, and browser authorization flags were unset.

First run after the source edits: 486 passed, 0 failed, 0 skipped, 147 suites. The new assertions were still inside an existing test.

After the dedicated pharmacy-queue and preview test was split out, the complete suite was run again.

`SAFE_TESTS_PASSED=487`

`SAFE_TESTS_FAILED=0`

`SAFE_TESTS_SKIPPED=0`

`SUITES=147`

Syntax checks passed for the clinical rules, reference engine, clinical routes, diagnostics routes, the G66 integration file, and the authorized scenario module.

HTTP tests: `NOT_RUN`. Browser tests: `NOT_RUN`. No assertion was weakened. No failing test was deleted.
