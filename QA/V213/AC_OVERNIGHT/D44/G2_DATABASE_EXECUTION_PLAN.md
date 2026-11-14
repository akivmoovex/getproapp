# G2 database execution plan

This procedure was not run. Write flags are `0`. `DATABASE_URL` is unset.

## Gates that must all pass before any write

1. `GETPRO_V13_ALLOW_DB_WRITES=1`
2. `GETPRO_V13_DB_STAGES_AUTHORIZED=1`
3. `NODE_ENV=test`
4. `DATABASE_IDENTITY_ENV=testing`
5. `GETPRO_TEST_DB=1`
6. `GETPRO_V13_CI_RUN_ID` matches `^[a-z0-9_-]{8,64}$`
7. `assertV13CiDatabaseUrl` accepts the URL

The host must be `127.0.0.1`, `localhost`, or `::1`. The database name must match `^getpro_v13_(ci|bb_qa|int|e2e)_[a-z0-9]{6,32}$`. The guard rejects `hostinger`, `pronline.org`, `blessboard.com`, `activeclinic`, `amazonaws.com`, `neon.tech`, `supabase.co`, `railway.app`, and `render.com`, and it rejects the names `postgres`, `production`, `prod`, `getpro_ci`, and `blessboard_foundation_test`.

`applyActiveClinicFixtures` and `applyBlessBoardFixtures` throw `V13_FIXTURE_HOLD` until those checks pass. `runGated` returns `NOT_RUN` before `openPool` when the two write flags are off.

## What a later authorized run would do

Create one run-owned database with `buildOwnedDatabaseName(runId, "int")`. Apply the existing committed migrations only. Then call `applyActiveClinicFixtures` for clinics `v13d19-clinic-a` and `v13d19-clinic-b`. Do not create `048_otp_challenges.sql`. Do not add a capacity column.

The four V13 workflows are `workflow_dispatch` only, and their database jobs are `if: ${{ false }}`. `ci.yml` does not list branch `V13`. Do not dispatch them.

## Rollback

After `assertV13CiDatabaseUrl` still accepts the URL, drop only that run-owned database. Do not drop `postgres` or any name the guard rejects. This drop was not executed.
