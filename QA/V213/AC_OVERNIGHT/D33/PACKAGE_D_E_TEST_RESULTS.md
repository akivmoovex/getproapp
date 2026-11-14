# Package D and E test results

Started `2026-11-14T23:53:22+0200`. Finished `2026-11-14T23:53:26+0200`. Exit 0. Log `/tmp/d33-g1.log`.

| Result | Count |
|---|---|
| Executed | 258 |
| Passed | 258 |
| Failed | 0 |

Write flags were `0`. Database URLs were unset. Six new tests are inside the 258:

| Test | ID |
|---|---|
| Order status check | ORD-01-01 |
| Newest critical alert | LAB-01-03 |
| Empty acknowledgement | LAB-01-03 |
| Empty dispense | RX-01-01 |
| Dispense permission and no substitution function | RX-01-02, RX-01-03 |
| Idempotency rollback before insert | FIN-01-03 |

None of these is an acceptance pass. No financial posting ran.
