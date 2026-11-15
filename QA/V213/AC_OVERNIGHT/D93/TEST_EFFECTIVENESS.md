# Test effectiveness

The G1 run passed 416, failed 0, and skipped 0. No `assert.ok(true)` or `assert.equal(true, true)` appears under `tests/v13`. The D17 mutation probes ran inside that same command.

A skipped row did not occur, so nothing in this run was converted from a skip into a pass. The passing tests include in-memory fakes. Those fakes do not establish a stored row, a rollback, or two database sessions. They are not acceptance evidence.

The D84 push trigger is not applied. Stage A still runs five files and does not include the D86 through D90 tests. This local pass is not a GitHub Actions pass.
