# Missing automated tests

Every acceptance row is still a release blocker. The tests below are the ones that do not exist yet. A nearby file is not a substitute when it does not assert the case.

| Need | Cases | Required shape |
|---|---|---|
| Persisted tenant denial | `TEN-01-02` and the other tenant reads | Clinic B requests clinic A’s row and receives a denial. The row counts do not change |
| Live authorization | `SEC-01-02` | `tenant-reader@v13d19.example` receives HTTP 403 on both test-database routes. The in-process query double does not count |
| Portal persistence | `PAT-01-01` through `PAT-01-03` | One stored identity and one patient link. No session cookie on registration. `d38` and `d47` stop at a fake database |
| Appointment concurrency | `APT-01-03` | Two connections and one stored overlap. The gated test returns `NOT_RUN`, and the body throws if the gate is opened because capacity is still unapproved |
| OTP delivery | `OTP-01` through `OTP-03` | A production-shaped verify that does not accept `1234`. `d14c` is in Stage A and does not name these IDs |
| Rollback | Billing, consent withdrawal, laboratory status | A failed statement leaves no invoice, consent event, or result |
| Cross-product | `BBF-01-02` is source-only | BlessBoard serving a request must not query `activeclinic.patients`. The file scan does not serve a request |
| Backup and accessibility | `OPS-01` and `ACX-004` through `ACX-006` | No test file. No number, screen list, or restore drill is approved, so the test cannot invent one |

Integration and browser coverage for the 84 cases is `PREPARED_NOT_RUN` or absent. Authorization and persistent transactions are required for the rows whose D29 columns already say so. Those columns were copied into the matrix and were not executed.
