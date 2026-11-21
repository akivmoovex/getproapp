# V2.13.1 D11 — Foundation bootstrap hardening

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. D04–D10 files are intact. The production command `npm run db:bootstrap:foundation` is unchanged. No database was created and the wrapper was not executed against PostgreSQL.

## Guarded entrypoint

V13 regression bootstrap is:

`node scripts/ci/v13-foundation-bootstrap.cjs`

The wrapper calls `resolveDisposableConnectionString` and then checks the exact target before it loads `db/scripts/lib/foundationBootstrap.js`. That module is the first import that constructs a `pg` pool. A rejected run does not load it.

The locked target is `getpro_v13_e2e_regression213101` on `127.0.0.1`, `localhost`, or `::1`. Another name that merely matches the disposable pattern is rejected. `GETPRO_V13_OWNED_DB_NAME`, `E2E_DATABASE_URL`, `TEST_DATABASE_URL`, and `DATABASE_URL` must all describe that same URL. `GETPRO_DATABASE_URL` is refused. If any of those values change after the first check, the wrapper throws before import and does not pass the old URL onward.

The bootstrap call receives the locked connection string, identity key `moovex-platform-v7`, and environment `testing`. Foundation bootstrap still performs the supported sequence itself:

1. Platform migrations
2. BlessBoard migrations
3. ActiveClinic migrations
4. GetPro migrations
5. NGO migrations
6. `platform.database_identity` initialization
7. Seeds `001` through `011`

Seeds `007`, `008`, and `011` remain production-gated inside the existing seed files. `npm run test:db:schema` is not invoked.

## Required flags

- `GETPRO_V13_ALLOW_DB_WRITES=1`
- `GETPRO_V13_DB_STAGES_AUTHORIZED=1`
- `NODE_ENV=test`
- `DEPLOYMENT_ENV=testing`
- `DATABASE_IDENTITY_ENV=testing`
- `GETPRO_TEST_DB=1`
- `GETPRO_V13_CI_RUN_ID`
- `DATABASE_IDENTITY_EXPECTED=moovex-platform-v7`
- `FOUNDATION_ALLOW_LOCALHOST=1`
- `GETPRO_PG_SSL=off`
- The three URL variables and `GETPRO_V13_OWNED_DB_NAME` locked to the target

Missing any of these, a remote host, a production-marked host, a shared name, or `DEPLOYMENT_ENV=production` fails closed.

## Negative tests

Contract tests rejected, without calling the bootstrap loader:

- A different pattern-legal database name
- A remote host
- A production-marked host
- `shared_qa`
- Disagreeing `E2E_DATABASE_URL` and `TEST_DATABASE_URL`
- Either write flag missing
- `DEPLOYMENT_ENV=production`
- A missing identity key, localhost flag, or URL
- A URL swapped after the first validation and before import

A mock bootstrap received only the locked localhost URL. The CLI, started with an empty environment, exited with `V13_CI_DB_GUARD` and did not print success. Safe contract and unit tests: 407 passed, 0 failed.

## Fixture contracts

`buildV213RegressionFixturePlan()` now names two churches and two clinics. Records are not inserted.

- BlessBoard HQ admin `church_hq_admin`, member, testing OTP through `peekTestCode`, and an invitation with no exposed token
- ActiveClinic receptionist `activeclinic_receptionist` on department `reception`
- Clinician `activeclinic_clinician` on department `opd`
- Walk-in service point `v13d19-walk-in` with `acceptsWalkIn` on facility `v13d19-facility-a` only
- Themes, home sections, sermon, event, and announcement stay on church or clinic A
- Public hosts are `*.local.test`

Clinic approval can create default department rows later. This plan does not yet call `assignStaffRole` or `insertServicePoint`. Those functions exist, and an authorized provisioning step still has to use them. `provisionHostedAuthQaClinic` remains unsuitable because it enables public booking.

## Remaining isolation risk

PostgreSQL still listens on all interfaces. The wrapper does not change that. A localhost connection string does not remove the role’s ability to open a different database if some other command supplies a different URL. This wrapper will not start in that case. The local role used to create the database can still own every other local database. A dedicated login limited to `getpro_v13_e2e_regression213101` has not been created.

## D12 prerequisites

D12 needs separate authorization before any of these steps:

1. Run `node scripts/ci/v13-assert-db-isolation.cjs` with the locked environment.
2. Create only `getpro_v13_e2e_regression213101`.
3. Run `node scripts/ci/v13-foundation-bootstrap.cjs`, then `npm run db:verify:foundation`.
4. Provision the synthetic fixtures inside that database only.
5. Run the 16 HTTP regressions, then Playwright only with `GETPRO_V13_BROWSER_AUTHORIZED=1`.
6. Drop only that database under a separate teardown authorization.

Until that authorization, the 16 HTTP and browser regressions stay `NOT_RUN`.
