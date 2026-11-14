# Security release gates

| Gate | Status | Evidence |
|---|---|---|
| G1 in-process | 233 passed, 0 failed | `/tmp/d28-g1.log` |
| G2 database | Not run | Write flags are 0. No migration ran |
| G3 browser | Not run | Browser flag is 0. Specs call `hold()` before the scenario |
| G4 OTP provider | Not approved | No provider selected. No message sent |
| AC-05 live denial | Not run | In-process 403 does not close the live session requirement |
| Patient activation persistence | Not run | Phone match and guest-token denials are in memory |
| Appointment conflict persistence | Not run | Staff overlap is check-then-insert. Capacity is absent |
| OTP production | No | `1234` is limited to the verified testing identity. A second memory store cannot see the first challenge |
| SEC-01-02 | Blocked | Unchanged from D21 |

The four V13 workflows are `workflow_dispatch` only. Database and browser jobs use `if: ${{ false }}`. They do not add a push, pull request, or schedule trigger. `ci.yml` is unchanged. Local `postgresql://postgres:postgres@127.0.0.1:5432` strings sit inside those disabled jobs.

No database, production host, infrastructure file, or scheduler was mutated.
