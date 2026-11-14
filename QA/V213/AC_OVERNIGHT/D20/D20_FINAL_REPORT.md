# D20 final report

Committed `V13` matches `origin/V13` at `b8f6b420d25e908de64ba292866c218c32edc30c`. The working tree is dirty and was not used as a different baseline.

The uploaded 14 November 2026 acceptance PDF contains 84 unique cases, not 69. The repository CSV contains the same 84 IDs and no others. No duplicate IDs. No separate 69-case file. `69 = 84 - 9 PLT - 6 BBF` is exact, and those 15 rows stay in the preserved set. The 69 count is unverified as its own matrix.

Committed ActiveClinic code differs from V12 only in `views/activeclinic/public/about.ejs`. Uncommitted OTP session tags are not new clinical features and were not treated as acceptance passes.

D19’s 173, 184, 0, and 30 reconcile with the Stage A log and the test manifests. The 11 integration files were executed only as `NOT_RUN` gates. The 19 browser files were not executed.

No product code was edited in D20. No database, migration, CI dispatch, commit, or push.

Remaining blockers: all 84 acceptance cases are `NOT_RUN`; AC-05 live denial, patient activation persistence, and appointment conflict persistence have no execution evidence; OTP migration and provider approval remain held; the V13 worktree is uncommitted.

Next stage stays held until a disposable database and browser run are separately approved.
