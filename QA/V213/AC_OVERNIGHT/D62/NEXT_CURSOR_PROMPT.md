# Next Cursor prompt

Do not send this until a named approval has already set the disposable-database flags. Do not flip the flags in the prompt.

```
# V2.13 D63 — Authorized disposable G2 and G3

MODE: AUTONOMOUS
NO QUESTIONS
BRANCH: V13
WORKTREE: /private/tmp/getpro-v13

Run G2 and G3 only if both write flags are already 1, the browser flag is
already 1, and E2E_DATABASE_URL already passes assertV13CiDatabaseUrl.
If any of those is missing, stop and report NOT_RUN. Do not change the flags.

Use one run-owned local database. Apply existing committed migrations only.
Record AC-05 only for a signed-in lower-privilege user with HTTP 403 on both
test-database routes and unchanged row counts. A 303 to /login is not that denial.

Do not assert slot capacity. If that case throws BLOCKED_APPROVAL_REQUIRED,
record it as blocked. Do not add a consent type, allergy rule, monitor,
service-level number, outbox, or versioned clinical route.

Drop only that run-owned database. Do not commit, push, or dispatch CI.
Run the D61 evidence validator on the result. A missing SHA, run id, or
testing identity is not a pass.

FINAL=V213_D63_G2_G3_EXECUTION
```

Before that run, the separate CI edit in `QA/V213/AC_OVERNIGHT/D59/CI_RECOMMENDED_CHANGES.md` is still unapplied. It does not replace G2 or G3.
