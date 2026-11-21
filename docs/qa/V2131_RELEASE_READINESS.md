# V2.13.1 release readiness

RELEASE_READY=NO

QA_CANDIDATE_READY=YES

Parent SHA `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606` on branch `V13`. BlessBoard and ActiveClinic product version is `2.13.1`.

Database-free contract and unit tests passed 441 and failed 0. JavaScript syntax checks on the changed `.js` and `.cjs` files passed. HTTP regressions, Playwright, new fixture writes, migrations, and deployment were not run.

## Why this is not a release

All 16 regression bugs have source implementations and passing database-free assertions. None has an executed HTTP or browser pass, so none is `VERIFIED_FIXED`.

BB-WEB-08 still has no persisted public-page section. The theme draft is present. The missing section is a later authorized fixture write, not a reason to weaken the theme rule.

`v13-d25-reuse-clinic` remains. It reuses clinic A’s identity after a matching password. It is not a duplicate identity and it does not enable booking.

No bug fix adds a migration. CI Stage B and Stage C stay disabled. Production OTP is not selected. CSRF, RBAC, tenant isolation, and facility isolation were not relaxed. The disposable database name rule was not broadened. `.v13-isolated-pg/` is gitignored, including passwords and the data directory.

## Tomorrow

Follow `docs/qa/V2131_QA_HANDOFF.md`. Run the gated HTTP and Playwright suites only against `127.0.0.1:55432`. Do not record `NOT_RUN` as a pass.
