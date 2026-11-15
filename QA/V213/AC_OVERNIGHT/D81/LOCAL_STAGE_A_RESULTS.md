# Local Stage A results

Fresh commands at `2026-11-15T03:29:01+0200`. `NODE_ENV=test`. Both write flags and the browser flag were `0`. Database URLs were unset. The D80 baseline of 399 passed and 0 failed was not re-run and is not this result.

| Command | Log | Executed | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| `npm run test:v13:ac` | `/tmp/d81-ac.log` | 14 | 14 | 0 | 0 |
| `npm run test:v13:platform` | `/tmp/d81-platform.log` | 52 | 52 | 0 | 0 |
| D18 and D67 hold tests | `/tmp/d81-holds.log` | 5 | 5 | 0 | 0 |

The two `npm` commands are the Stage A commands in the repaired workflows. Together they executed 66 tests and failed 0. The hold file is separate. `test:v13:ac` does not include integration or Playwright files. The D79 acceptance file still has 84 rows and no `PASS` row.
