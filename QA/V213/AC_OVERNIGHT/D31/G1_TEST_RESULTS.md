# G1 test results

D22 historical result, not re-executed as its own command: 195 passed, 0 failed, 0 skipped, finished `2026-11-14T23:19:17+0200`.

D31 command started `2026-11-14T23:50:01+0200` and finished `2026-11-14T23:50:05+0200`. Exit 0. Log `/tmp/d31-g1.log`.

| Result | Count |
|---|---|
| Executed | 243 |
| Passed | 243 |
| Failed | 0 |
| Skipped | 0 |

Flags: write authorization `0`, database-stage authorization `0`, browser authorization `0`, `NODE_ENV=test`. Database URLs were unset. The log has no `not ok` line and no `tests/v13/integration` path.

The 10 new Package A tests are inside the 243. They do not move any of the 23 acceptance IDs to pass. Integration files and browser specs were outside the command, so they are not run rather than skipped.
