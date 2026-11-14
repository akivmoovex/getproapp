# Security evidence requirements

Twenty-eight acceptance IDs require an authenticated denial. Twenty-seven are `REQUIRED_NOT_RUN`. `SEC-01-02` is `BLOCKED_NOT_RUN`. None is ready.

| Case | What would count | What exists |
|---|---|---|
| `SEC-01-02` | `tenant-reader@v13d19.example` signed in, HTTP 403 on both test-database routes, body without “Test Database Management”, row counts unchanged | The browser steps exist and `hold()` throws first. `runAcAuth` does not perform that login. The in-process query double is not this session |
| `PAT-01-02` | A stored patient bound to clinic A, and clinic B’s registration denied | The gated body sends an empty phone and expects `invalid_input`. It does not store a patient |
| `FIN-01-02` | A second post of the same tenant idempotency key rolls back and does not insert | No payment row is written. The duplicate branch is a source guard |
| `DOC-01-02` | Clinic B cannot read clinic A’s document body | The in-process check uses a fake row. No stored document is read |
| `APT-01-02` | The other tenant’s staff cannot create the appointment, and the stored count stays 1 | `runAcAuth` would assert that count, and the gate does not run it |

A 303 to `/login` is not a 403. A 401 is not the AC-05 denial. The receptionist billing check is a different route.
