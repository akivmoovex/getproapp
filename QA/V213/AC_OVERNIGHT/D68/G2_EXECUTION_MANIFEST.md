# G2 execution manifest

This package was not executed. Both write flags are off. `DATABASE_URL` is unset. `applyActiveClinicFixtures` throws `V13_FIXTURE_HOLD` before a query.

## Gates, all required

1. `GETPRO_V13_ALLOW_DB_WRITES=1`
2. `GETPRO_V13_DB_STAGES_AUTHORIZED=1`
3. `NODE_ENV=test`
4. `DATABASE_IDENTITY_ENV=testing`
5. `GETPRO_TEST_DB=1`
6. `GETPRO_V13_CI_RUN_ID` matches `^[a-z0-9_-]{8,64}$`
7. `assertV13CiDatabaseUrl` accepts the URL
8. The stored identity key is `moovex-platform-v7` and its environment code is `testing`

Allowed hosts are `127.0.0.1`, `localhost`, and `::1`. The name must match `^getpro_v13_(ci|bb_qa|int|e2e)_[a-z0-9]{6,32}$`. Use `buildOwnedDatabaseName(runId, "int")`.

A local check refused `blessboard.com`, `amazonaws.com`, the name `postgres`, and the name `blessboard_foundation_test`. The same guard refuses a connection string that contains `hostinger`, `pronline.org`, `activeclinic`, `neon.tech`, `supabase.co`, `railway.app`, or `render.com`.

## Bootstrap

`npm run db:migrate` reads `DATABASE_URL` only. The module order is `platform`, `blessboard`, `activeclinic`, `getpro`, `ngo`. Do not create `db/migrations/platform/048_otp_challenges.sql`. Do not add a capacity column.

## Fixture sequence, after the gates

1. `applyActiveClinicFixtures` calls `provisionHostedAuthQaClinic` once per plan clinic.
2. That provisioner does not use `v13d19-clinic-a` or `v13d19-clinic-b`. It mints `ac-hqa-` plus a stamp, an `hosted-qa-` email, and a generated phone.
3. It registers a clinic, marks `test_cleanup_eligible`, creates one consultation service when a staff row exists, and publishes a website.
4. It does not insert patient Pat Ient, an encounter, or the AC-05 users.
5. `runAcAuth` then inserts one patient and one appointment and expects `appointment_collision` on the second call. It does not delete those rows.

## Teardown

`runAcAuth` has no ActiveClinic cleanup. BlessBoard has `cleanupBlessBoardFixtures`. After the guard still accepts the URL, drop only that run-owned database. Do not drop `postgres` or a name the guard rejects. `purgeActiveClinicTestingOrganization` is not a substitute and was not called.

## Artifact

Keep the checkout SHA, `GETPRO_V13_CI_RUN_ID`, the database name, and the test log. Do not store the password, an OTP, or a connection string.
