# Test results

Focused D38, D24, and D31 portal checks passed first: 19 tests, 0 failed.

Fresh G1, with database URLs unset and write and browser flags at `0`:

| | |
|---|---|
| Command | The D37 regression command, which now includes the D38 files through the unit and contract globs |
| Log | `/tmp/d38-g1.log` |
| Finished | `2026-11-15T00:02:35+0200` |
| Duration | 3967 ms |
| Executed | 272 |
| Passed | 272 |
| Failed | 0 |
| Skipped | 0 |
| Integration paths in the log | 0 |

D35's 264 passes are the previous fresh run. D22's 195 passes remain historical. Eight of the new passes are the D38 unit and contract tests. They are in-process. They are not an acceptance pass.

New tests:

- `tests/v13/unit/d38-identity-portal.test.js` — 5 tests
- `tests/v13/contract/d38-identity-portal-contract.test.js` — 3 tests
