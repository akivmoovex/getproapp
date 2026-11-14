# Regression findings

No failing test appeared in the fresh G1 run, and `node --check` reported no syntax error in the 15 D38–D42 product files.

Checked and left as already implemented:

| Area | Result |
|---|---|
| BlessBoard clinical reads | No BlessBoard file was edited. The D40 and D42 contracts still find no `activeclinic.patients` query there |
| Portal registration | Still checks CSRF and does not issue a session. Guest registration now also requires the clinic organization |
| Appointments | Staff overlap still runs only when a staff id is present, still before `BEGIN`, and still without a row lock |
| OTP | No OTP file was edited in D38–D42. Production activation stays blocked |
| Shared platform | CSRF, session signing, and the platform-admin gates were not removed |

Regressions found: 0. Regressions fixed: 0. No runtime behavior was changed in this stage.
