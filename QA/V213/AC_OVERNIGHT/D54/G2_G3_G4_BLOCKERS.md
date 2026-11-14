# G2, G3, and G4 blockers

G2 and G3 are not ready. G4, a release claim, is not ready either.

| Gate | Blocker |
|---|---|
| G2 database | Both write flags are `0`. No run-owned local database has been named. Fixture apply still throws `V13_FIXTURE_HOLD` |
| G3 browser | The browser flag is `0` and `E2E_DATABASE_URL` is unset. The specs stop in `hold()` |
| AC-05 | Needs `tenant-reader@v13d19.example` signed in, HTTP 403 on both test-database routes, and unchanged row counts |
| Portal | Needs one stored identity and one patient link, then a login redirect with no session cookie |
| Appointments | Needs a stored overlap. Capacity stays unapproved, so the gated race still throws `BLOCKED_APPROVAL_REQUIRED` if the flags are opened early |
| G4 | Needs the 84 acceptance rows, the eight ACX rows that are in scope, and the 18 design decisions. None of that evidence exists |

The procedure is `QA/V213/AC_OVERNIGHT/D44/EXECUTION_APPROVAL_CHECKLIST.md`. This stage does not grant it.
