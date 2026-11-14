# Next Cursor prompt

Do not run this prompt unless the write flags, the browser flag, and a guarded local `E2E_DATABASE_URL` are already set. If any one of them is missing, stop and report `NOT_RUN`. Do not set the flags. Do not create a database, run a migration, open a browser, dispatch CI, commit, or push.

```
# V2.13 G2/G3 execution
MODE: AUTONOMOUS
BRANCH: V13
WORKTREE: /private/tmp/getpro-v13

If GETPRO_V13_ALLOW_DB_WRITES, GETPRO_V13_DB_STAGES_AUTHORIZED, and GETPRO_V13_BROWSER_AUTHORIZED are not already 1, stop.
If E2E_DATABASE_URL is missing or assertV13CiDatabaseUrl rejects it, stop.
Do not flip those flags.
Do not target a hosted database.
Do not create 048_otp_challenges.sql.
Do not add slot_capacity or FOR UPDATE.
Do not mark any acceptance ID as PASS without stored evidence.
Drop only the run-owned database after the guard still accepts its name.
```

The next approval is `G2_G3_EXECUTION_AUTHORIZATION`.
