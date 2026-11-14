# G1 final results

| Run | When | Executed | Passed | Failed | Skipped | Use |
|---|---|---|---|---|---|---|
| D22 | `2026-11-14T23:19:14+0200` to `2026-11-14T23:19:17+0200` | 195 | 195 | 0 | 0 | Historical only |
| D35 | `2026-11-14T23:55:36+0200` to `2026-11-14T23:55:40+0200` | 264 | 264 | 0 | 0 | Fresh evidence for this handoff |

The D35 log is `/tmp/d35-g1.log`. Exit 0. Database URLs were unset. Write flags and the browser flag were `0`. The log contains no integration path.

New test files since D30, all inside the 264:

| File | Tests |
|---|---|
| `tests/v13/unit/d31-package-a-security.test.js` | 7 |
| `tests/v13/contract/d31-package-a-contract.test.js` | 3 |
| `tests/v13/unit/d32-clinical-foundation.test.js` | 4 |
| `tests/v13/contract/d32-clinical-foundation-contract.test.js` | 5 |
| `tests/v13/unit/d33-clinical-operations.test.js` | 2 |
| `tests/v13/contract/d33-clinical-operations-contract.test.js` | 4 |
| `tests/v13/unit/d34-documents-operations.test.js` | 2 |
| `tests/v13/contract/d34-documents-operations-contract.test.js` | 4 |

That is 31 tests. D30 and D35 added reports and no test files. Thirteen integration files and both browser specs were not in the command.
