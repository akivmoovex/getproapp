# G2, G3, and G4 blockers

| Gate | State | Blocker |
|---|---|---|
| G2 | `NOT_RUN` | Both write flags are `0`. Thirteen integration files are prepared. The appointment file still throws if the gate opens. Capacity is unapproved, so no lock is authorized |
| G3 | `NOT_RUN` | The browser flag is `0`. Seven ActiveClinic browser tests call `hold()` until that flag and a guarded `E2E_DATABASE_URL` are already set |
| G4 | `NOT_RUN` | No V13 workflow contains a G4 job |
| AC-05 | `NOT_RUN` | A live lower-privilege HTTP 403 was not produced. A redirect to `/login` is not the denial |
| Portal persistence | `NOT_RUN` | No patient identity was stored |
| Appointment concurrency | `NOT_VERIFIED` | Two in-memory overlap checks are not two database sessions |
| OTP | Not production ready | `deliveryActivated` still throws. No provider and no OTP migration |

Do not flip the flags in the next run. Do not treat a prepared file as an execution.
