# Stage A local results

Commands ran at `2026-11-15T03:34:32+0200` with `NODE_ENV=test`, both write flags and the browser flag at `0`, and the database URLs unset. The tree includes the quote fix and does not include a push trigger.

| Command | Log | Executed | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| `npm run test:v13:ac` | `/tmp/d83-ac.log` | 14 | 14 | 0 | 0 |
| `npm run test:v13:platform` | `/tmp/d83-platform.log` | 52 | 52 | 0 | 0 |

Neither command includes `tests/v13/integration` or Playwright. A failing assertion in these files exits nonzero. The D80 run of 399 is a separate baseline and was not repeated.
