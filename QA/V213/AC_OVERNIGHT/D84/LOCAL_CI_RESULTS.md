# Local CI results

`NODE_ENV=test`. Both write flags and the browser flag were `0`. Database URLs were unset. Finished `2026-11-15T03:37:49+0200`.

| Command | Log | Passed | Failed | Skipped |
|---|---|---|---|---|
| `npm run test:v13:ac` | `/tmp/d84-ac.log` | 14 | 0 | 0 |
| `npm run test:v13:platform` | `/tmp/d84-platform.log` | 52 | 0 | 0 |
| D18, D19, and D67 | `/tmp/d84-holds.log` | 9 | 0 | 0 |

A missing `npm` script or a failed assertion exits nonzero. These commands do not include integration or Playwright files.
