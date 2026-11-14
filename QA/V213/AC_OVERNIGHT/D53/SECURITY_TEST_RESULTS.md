# Security test results

Write flags and the browser flag were `0`. Both database URLs were unset.

| Check | Result |
|---|---|
| AC-05 route contract | Present in the 308. Live denial was not run |
| Lower-privilege session | Not opened. A missing session is still 303 to `/login`, which is not the 403 denial |
| Portal registration | Still does not issue a session. In process only |
| Password reset | Still consumes the token before the password write, and only for the token’s organization. In process only |
| OTP | In-process tests ran. Production activation stays blocked. `1234` is not a production code |
| Document and result reads | Organization joins are in the source tests. No stored row was read |
| BlessBoard clinical tables | The existing contract still finds no `activeclinic.patients` query in BlessBoard source |

`SEC-01-02` stays blocked.
