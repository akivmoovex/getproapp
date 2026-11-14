# G1 regression results

Branch `V13`. HEAD `b8f6b420d25e908de64ba292866c218c32edc30c`. The index was empty. `GETPRO_V13_ALLOW_DB_WRITES`, `GETPRO_V13_DB_STAGES_AUTHORIZED`, and `GETPRO_V13_BROWSER_AUTHORIZED` were `0`. `DATABASE_URL`, `TEST_DATABASE_URL`, and `E2E_DATABASE_URL` were unset.

D22 remains a historical result: 195 passed and 0 failed at `2026-11-14T23:19:14+0200`. That command was not repeated as its own run.

This execution started `2026-11-14T23:55:36+0200` and finished `2026-11-14T23:55:40+0200`. Exit 0. Log `/tmp/d35-g1.log`.

```
node --test --test-concurrency=1 \
  tests/v13/contract/*.test.js \
  tests/v13/unit/*.test.js \
  tests/v13/quality/d17-mutation-probes.test.js \
  tests/shared-website-section-lifecycle.test.js \
  tests/bb05-hq-add-member-csrf-contract.test.js \
  tests/v211-hq-add-member-get.test.js \
  tests/v213-version-initialization.test.js \
  tests/v2-02-platform-admin-rbac-convergence.test.js
```

| Result | Count |
|---|---|
| Executed | 264 |
| Passed | 264 |
| Failed | 0 |
| Skipped | 0 |
| Cancelled | 0 |

The log has no `not ok` line and no `tests/v13/integration` path. One `# skipped` line is the summary value 0. No retry was required. The run used concurrency 1 and did not open a database, so no flake and no environment database dependency appeared in this execution.

These 264 passes are in-process. They are not acceptance passes.
