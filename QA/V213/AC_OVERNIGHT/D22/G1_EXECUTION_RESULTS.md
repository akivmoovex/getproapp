# G1 execution results

Worktree `/private/tmp/getpro-v13`. Branch `V13`. HEAD `b8f6b420d25e908de64ba292866c218c32edc30c`.

Started `2026-11-14T23:19:14+0200`. Finished `2026-11-14T23:19:17+0200`. Exit 0.

Environment for the command:

- `GETPRO_V13_ALLOW_DB_WRITES=0`
- `GETPRO_V13_DB_STAGES_AUTHORIZED=0`
- `GETPRO_V13_BROWSER_AUTHORIZED=0`
- `NODE_ENV=test`
- `DATABASE_URL`, `TEST_DATABASE_URL`, and `E2E_DATABASE_URL` unset

Command:

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
| Tests | 195 |
| Passed | 195 |
| Failed | 0 |
| Skipped | 0 |
| Suites | 40 |
| Duration | 3018 ms |

The log is `/tmp/d22-g1.log`. It contains no `not ok` line and no `tests/v13/integration` path. Playwright was not started. The integration glob was not included.

The earlier focused command, at the same SHA and with the same flags, ran only the two new AC-05 files: 12 passed, 0 failed. Those 12 are inside the 195.

Static check: `node --check` passed for the new unit test, the new contract test, the fixture module, and the browser spec. `git diff --check` reported no whitespace errors on the D22 test files.

This run does not replace the D19 accounting of 184 node executions and 173 assertion passes. Integration and browser journeys were not part of this command.
