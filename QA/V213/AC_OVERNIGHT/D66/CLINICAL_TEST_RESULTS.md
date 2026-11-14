# Clinical test results

| | |
|---|---|
| Log | `/tmp/d66-g1.log` |
| Finished | `2026-11-15T01:10:33+0200` |
| Duration | 4544 ms |
| Passed | 340 |
| Failed | 0 |
| Skipped | 0 |

The new cases cover a scoped radiology report, a missed radiology update, a closed laboratory result, a self-verify, a verify that loses its row, and a dispense denied before a connection. The contract checks the dispense organization predicates and keeps acknowledgement free of a result id.

Database URLs were unset. No browser and no integration file ran.
