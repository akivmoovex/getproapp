# CI gate validation

No workflow was dispatched.

| Check | Exit | Result |
|---|---|---|
| `npm run test:v13:ac` | 0 | 14 passed, 0 failed, 0 skipped. Log `/tmp/d67-ac-script.log` |
| Isolation script with no run id | 1 | `missing or invalid GETPRO_V13_CI_RUN_ID` |
| Isolation script with a local owned name and both write flags at 0 | 0 | `V13_CI_DB_ISOLATION_OK`. The script parsed the URL and did not open a connection |
| QA report with every stage `NOT_RUN` | 0 | `RELEASE_BLOCKED`, 16 required rows not passed. Output `/tmp/d67-qa-report` |
| Forced failing test | 1 | The failure is visible |
| Skipped test | 0 | The skip is visible as skipped 1, not as a pass |
| G1 | 0 | 344 passed, 0 failed, 0 skipped. Log `/tmp/d67-g1.log`, finished `2026-11-15T01:13:44+0200` |

G2 and G3 were not started. The held jobs cannot fail a build because they do not run.
