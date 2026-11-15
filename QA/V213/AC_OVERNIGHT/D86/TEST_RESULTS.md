# Test results

| Command | Result |
|---|---|
| New D86 unit and contract files | 5 passed, 0 failed |
| G1 | `/tmp/d86-g1.log`, finished `2026-11-15T03:40:28+0200`, 5674 ms |
| Executed | 404 |
| Passed | 404 |
| Failed | 0 |
| Skipped | 0 |

`NODE_ENV=test`. Both write flags and the browser flag were `0`. Database URLs were unset. Stage A `npm run test:v13:ac` does not include the new D86 files. The D86 tests ran inside the G1 list.
