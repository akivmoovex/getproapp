# Negative test coverage

| Case | Observed |
|---|---|
| Required row `NOT_RUN` | Release stays blocked |
| Required row `SKIPPED` | Release stays blocked |
| Required row `PASS` and no open blocker | The helper can return ready. This fixture is not the 84-case release |
| `MOCK_ONLY` with a SHA, a run id, testing identity, and `database_evidence=VERIFIED` | Validator rejects it and blocks release |
| Honest not-run report | Validator accepts the report shape and still blocks release |
| Missing CI run id | `v13-assert-db-isolation.cjs` exits 1 |
| Forced `node --test` failure in `/tmp/d67-fail.test.js` | Exit 1, fail 1 |
| Skipped `node --test` in `/tmp/d67-skip.test.js` | Exit 0, and the TAP summary says skipped 1 |

Live AC-05 denial, a stored second tenant, and two database connections were not run.
