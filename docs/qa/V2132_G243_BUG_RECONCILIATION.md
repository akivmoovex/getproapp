# V2132 G243 bug reconciliation

November 25 DOCX reports unavailable locally. Reconciliation uses G224–G240 matrices plus later G301/G280 tip evidence.

| Issue cluster | Local tip status | Coverage |
| --- | --- | --- |
| Lab result entry / verification / read-back | FIXED (G224) | HTTP + browser + PG |
| Lab queues/counters/filters | FIXED (G224/G230) | unit + HTTP + browser |
| Radiology reported filters / report / verify | FIXED (G229) | HTTP + browser + PG |
| Clinical printing depth | PARTIAL (G231/G310) | print regions present; hosted visual open |
| Patient portal / activation / search | PASS | browser + HTTP |
| AC-05 authorization | PASS preserved | security suites |
| D14C / D16 OTP PG | PASS on disposable (G301+) | schema apply not re-authorized this cycle |
| Live Resend mailbox OTP | BLOCKED | secrets/allowlist |
| D25 slot capacity | UNAPPROVED fail | expected |
| D25 staff overlap | PASS | HTTP concurrency |
| CB-01–CB-14 / Community Benefits | Source + disposable PG PASS; posting disabled | mock browser separate |
| Public booking | DISABLED preserved | — |
| Production media upload | DISABLED preserved | — |

Hosted V2.13.1 failures are not automatically claimed fixed on hosted until separate hosted retest.
