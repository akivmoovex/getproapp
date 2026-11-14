# Next Cursor prompt

Copy this only after a named approval allows one disposable database. Until then, do not send it.

```
# V2.13 D46 — Authorized disposable G2 and G3

MODE: AUTONOMOUS
NO QUESTIONS
BRANCH: V13
WORKTREE: /private/tmp/getpro-v13

Execute G2 and G3 only when every gate in
QA/V213/AC_OVERNIGHT/D44/EXECUTION_APPROVAL_CHECKLIST.md is already true
in the environment you were given. If either write flag is not 1, if
GETPRO_V13_BROWSER_AUTHORIZED is not 1, or if E2E_DATABASE_URL fails
assertV13CiDatabaseUrl, stop and report NOT_RUN. Do not flip those flags
yourself.

Use one run-owned local database from buildOwnedDatabaseName. Apply existing
committed migrations only. Apply the synthetic ActiveClinic fixture. Then run
the held integration files and the ActiveClinic Playwright spec.

Record AC-05 only if tenant-reader@v13d19.example receives HTTP 403 on both
test-database routes and the row counts do not change. A 303 to /login is
not that denial.

Leave capacity, OTP delivery, new migrations, retention, restore, offline
writes, and Juflona untouched. If D39-STAFF-OVERLAP-RACE throws
BLOCKED_APPROVAL_REQUIRED, record it as blocked.

Drop only that run-owned database after the guard still accepts its name.
Do not commit, push, or dispatch CI.

FINAL=V213_D46_G2_G3_EXECUTION
```
