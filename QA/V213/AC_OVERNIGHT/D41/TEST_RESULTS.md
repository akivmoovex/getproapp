# Test results

Focused D41 and D33 checks passed: 10 tests, 0 failed.

Fresh G1, with database URLs unset and write and browser flags at `0`:

| | |
|---|---|
| Log | `/tmp/d41-g1.log` |
| Finished | `2026-11-15T00:13:13+0200` |
| Duration | 4020 ms |
| Executed | 285 |
| Passed | 285 |
| Failed | 0 |
| Skipped | 0 |

D40’s 281 passes are the previous fresh run. D22’s 195 passes remain historical. The new files are `tests/v13/unit/d41-clinical-operations.test.js` and `tests/v13/contract/d41-clinical-operations-contract.test.js`. No payment or dispense was executed.
