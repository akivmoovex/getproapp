# V2.13 D19 fixture readiness

Fixture plans are deterministic and synthetic. `applyBlessBoardFixtures` and `applyActiveClinicFixtures` throw `V13_FIXTURE_HOLD` before any query unless both write flags are set and `assertV13CiDatabaseUrl` accepts the connection. A unit test calls both with a query spy and records zero queries.

## BlessBoard plan

Two churches, `v13d19-church-a` and `v13d19-church-b`.

Each plan includes a platform tenant (`productKey: blessboard`, `dataEnvironment: testing`, `deploymentCode: moovex-platform-testing`, no domain), a church, an HQ branch, a church system administrator, a member, and a ministry-leader invitation. Emails use `@v13d19.example`. The shared password is `V13-synthetic-qa-password`, not the testing OTP.

Apply uses `provisionPlatformTenant`, `provisionBlessBoardChurch`, `insertUser`, and `assignBlessBoardRole`. Cleanup deletes only the returned church and organization ids.

## ActiveClinic plan

Two clinics, a facility, an administrator, a staff member, a receptionist, one patient, consultation service `v13d19-consult`, and the slot `2026-12-01T09:00:00.000Z` to `09:30:00.000Z`. The denial target is `activeclinic_receptionist` against `GET /app/billing`.

Apply uses `provisionHostedAuthQaClinic` on the disposable database only. The helper assigns its own organization key. The plan's labels and password stay fixed.

## Not applied

No fixture was written. The next approval is a local disposable database, Foundation bootstrap on that database only, and then the gated runners.
