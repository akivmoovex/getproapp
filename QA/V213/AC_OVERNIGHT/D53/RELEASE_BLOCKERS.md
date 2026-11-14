# Release blockers

| Blocker | State |
|---|---|
| 84 acceptance IDs | 0 passed, 83 not run, 1 blocked |
| AC-05 live denial | Not run |
| Portal persistence | Not run |
| Appointment concurrency | Not verified. Capacity approval is pending |
| Eight ACX rows | Not run and not in the release |
| Eighteen design decisions | Pending |
| OTP production | Not ready |
| G2 and G3 | Not authorized. Both write flags and the browser flag are `0` |
| Commit and push | Not done. A test-only commit cannot load |

Before a later G2 or G3 run, the checklist in `QA/V213/AC_OVERNIGHT/D44/EXECUTION_APPROVAL_CHECKLIST.md` has to be true for one named local database. This stage did not set those flags.

No database write, migration, browser session, CI dispatch, commit, push, or deployment occurred.
