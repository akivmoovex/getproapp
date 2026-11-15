# Release gates

| Gate | Status |
|---|---|
| AC-05 live denial | `BLOCKED` |
| Patient activation persistence | `NOT_RUN` |
| Appointment concurrency persistence | `NOT_RUN` |
| OTP production activation | `HELD` |
| G2 database tests | `HELD` |
| G3 browser tests | `HELD` |
| G4 operational tests | `HELD` |
| Production deployment | `NOT_AUTHORIZED` |
| Acceptance verified | 0 of 84 |
| Acceptance not run | 83 |
| Acceptance blocked | 1 (`SEC-01-02`) |
| Release ready | No |

The local G1 pass does not move any of these gates. The GitHub runs did not execute a test.
