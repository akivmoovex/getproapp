# V2.13.1 D18 — Isolated execution readiness

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. D04–D17 files were left in place. No database, role, container, migration, or browser was started. The shared Postgres.app cluster was not queried and its configuration was not changed.

This phase observed the process list and listening sockets only. PostgreSQL 16 from Postgres.app is still the process bound to `*:5432` on IPv4 and IPv6. Its data directory is `/Users/akivsolomon/Library/Application Support/Postgres/var-16`. Port `55432` had no listener. Docker is installed at `/opt/homebrew/bin/docker` and was not started.

Safe contract and unit tests: 427 passed, 0 failed. HTTP and browser suites were not executed.

## Why the shared cluster stays unused

D12 still stands. That server listens on every interface, the login role is a superuser with `CREATEDB`, `pg_hba.conf` uses `trust`, and hundreds of existing databases accept `PUBLIC` connect. A loopback connection string does not remove those privileges. Regression work uses a separate PostgreSQL 16 instance.

The current wrapper `scripts/ci/v13-foundation-bootstrap.cjs` still accepts any loopback port, including `5432`, when the database name is `getpro_v13_e2e_regression213101`. That acceptance is covered by the existing D08–D12 contracts and was not changed. `tests/v13/helpers/v13IsolatedExecutionPlan.js` is the additional gate. It refuses port `5432`, any host other than `127.0.0.1`, any role other than `v13_regression_213101`, and any data directory other than the project-local path below. The wrapper does not call this helper yet. Do not run bootstrap until a later authorized phase uses port `55432` and passes this gate first.

## Isolated instance

Two equivalent setups are allowed later. Neither was created.

Project-local cluster, preferred when a container is not wanted:

- Binaries may be PostgreSQL 16 from `/Applications/Postgres.app/Contents/Versions/16/bin`. The data directory must not be.
- Data directory: `<worktree>/.v13-isolated-pg/data`
- Socket directory: `<worktree>/.v13-isolated-pg/run`
- Password file: `<worktree>/.v13-isolated-pg/pgpass`, mode `0600`, never committed
- `listen_addresses = '127.0.0.1'`
- `port = 55432`
- `unix_socket_directories` points only at the project-local `run` directory
- `.v13-isolated-pg/` is gitignored

Container alternative, only if chosen later:

- Image `postgres:16`
- Publish `127.0.0.1:55432:5432` only
- Do not use host networking
- Do not mount `/Users/akivsolomon/Library/Application Support/Postgres/var-16` or any other existing data directory
- Volume name `v13_regression_213101_data` or the project-local directory above

Both setups replace `pg_hba.conf`. The isolated file allows SCRAM for `v13_regression_213101` from `127.0.0.1/32` and `::1/128` only. It has no `trust` line and no `0.0.0.0` or `::/0` line. Do not copy the shared cluster’s `pg_hba.conf`, password, socket, or port.

The instance bootstrap superuser exists only inside the new data directory. It is used once, from `127.0.0.1:55432`, to create the limited role and the one database:

```sql
CREATE ROLE v13_regression_213101
  LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  NOINHERIT
  PASSWORD '...';
CREATE DATABASE getpro_v13_e2e_regression213101 OWNER v13_regression_213101;
REVOKE ALL ON DATABASE getpro_v13_e2e_regression213101 FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE getpro_v13_e2e_regression213101 TO v13_regression_213101;
```

The password is generated at that later step and stored only in the gitignored pgpass file. It is not written in this repository. The regression URL is:

`postgresql://v13_regression_213101@127.0.0.1:55432/getpro_v13_e2e_regression213101`

`GETPRO_DATABASE_URL` stays unset. `E2E_DATABASE_URL`, `TEST_DATABASE_URL`, and `DATABASE_URL` are the same URL. `GETPRO_V13_OWNED_DB_NAME` is `getpro_v13_e2e_regression213101`.

## Bootstrap sequence

The preserved command remains:

`node scripts/ci/v13-foundation-bootstrap.cjs`

It loads `db/scripts/lib/foundationBootstrap.js` only after the disposable-database guard accepts the environment. The Foundation sequence is unchanged:

1. Platform migrations (47)
2. BlessBoard migrations (130)
3. ActiveClinic migrations (42)
4. GetPro migrations (1)
5. NGO migrations (1)
6. Initialize `platform.database_identity` as `moovex-platform-v7` / `testing`
7. Seeds `001` through `011`

The file count is 221. `* 2.sql` copies are excluded by the migrator. None of the 221 files contains `CREATE EXTENSION`, so the limited role can apply them. `platform/003_database_identity.sql` creates the identity table and does not insert a row. The wrapper then calls `ensureDatabaseIdentity`. Seeds `007`, `008`, and `011` return immediately when the identity is not `production`. Seed `009` inserts the testing catalogue row `moovex-platform-v8-testing` inside this database only.

Required wrapper flags, all still required:

- `GETPRO_V13_ALLOW_DB_WRITES=1`
- `GETPRO_V13_DB_STAGES_AUTHORIZED=1`
- `GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED=1` (new preflight; not read by the wrapper yet)
- `NODE_ENV=test`
- `DEPLOYMENT_ENV=testing`
- `DATABASE_IDENTITY_ENV=testing`
- `DATABASE_IDENTITY_EXPECTED=moovex-platform-v7`
- `GETPRO_TEST_DB=1`
- `GETPRO_V13_CI_RUN_ID` of 8–64 safe characters
- `FOUNDATION_ALLOW_LOCALHOST=1`
- `GETPRO_PG_SSL=off`

`npm run db:bootstrap:foundation` stays the production command and is not the regression entrypoint.

## Fixture plan

`buildV213RegressionFixturePlan()` is still the regression shape and still has `persisted: false`. It names church A and church B, clinic A and clinic B, a receptionist on department `reception`, a clinician on department `opd`, and walk-in service point `v13d19-walk-in` on facility `v13d19-facility-a` only. Public hosts are `*.local.test`. The plan does not set `publicBookingEnabled`.

`applyActiveClinicFixtures()` is not that plan. It calls `provisionHostedAuthQaClinic()`, which sets `public_booking_enabled = true`. A later provisioning step must not call that function. It also still does not call `insertServicePoint` or the department role assignment. Those functions exist. Until a provisioning path uses the synthetic plan, fixture execution stays blocked even after the isolated database exists.

BlessBoard apply and cleanup already refuse to run unless both database-write flags are set and the URL passes the disposable-name guard. Cleanup deletes only the church and organization ids it created. It is still not a substitute for dropping the isolated database.

## Playwright

ActiveClinic uses `http://127.0.0.1` on a port in `4100–4999`, default `4187`. BlessBoard uses the same host, default `4186`. Both configs map `*.local.test` to `127.0.0.1`, set `reuseExistingServer: false`, and do not register a server unless the browser guard accepts the environment. `installLocalOnlyRoutes` aborts any request that is not `http` on that port to `127.0.0.1`, `localhost`, `::1`, or `local.test`. The local server helper refuses to bind any host other than `127.0.0.1`. OTP provider must be `test`. Provider credentials are stripped from the child environment.

## Future authorization gates

`assertFutureStageAuthorized` in the new helper is the checklist. Every connecting stage also requires the isolated URL above. None of these flags is set in this phase.

| Stage | Extra requirement |
| --- | --- |
| Create the instance | `GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED=1`, and no URL may use port `5432` |
| Create the role and database | Isolated-instance flag plus both database-write flags |
| Bootstrap | Same three flags, then `node scripts/ci/v13-foundation-bootstrap.cjs` |
| Fixtures | Same three flags, using the synthetic plan, not the hosted-auth clinic fixture |
| HTTP regressions | Same three flags plus `GETPRO_V13_HTTP_AUTHORIZED=1`. The D04 and D05 suites already stay `NOT_RUN` without the two write flags |
| Browser | Same three flags plus `GETPRO_V13_BROWSER_AUTHORIZED=1` |
| Teardown | Same three flags plus `GETPRO_V13_TEARDOWN_AUTHORIZED=1` |

## Teardown

Only after the teardown flag is set, and only while connected to `127.0.0.1:55432` as an administrator of the isolated instance:

```sql
DROP DATABASE IF EXISTS getpro_v13_e2e_regression213101;
DROP ROLE IF EXISTS v13_regression_213101;
```

Then stop that instance and delete `<worktree>/.v13-isolated-pg`. Do not run `DROP DATABASE` against port `5432`, the socket in the shared data directory, or any other database name. The helper rejects a teardown URL on port `5432`.

## Still blocked

The wrapper can still be pointed at port `5432` if the new preflight is skipped. Fixture application for ActiveClinic still enables public booking and does not create the walk-in service point. The shared cluster is unchanged. HTTP and browser regressions were not run.

FINAL=V2131_D18
ISOLATION_DESIGN=DEDICATED_LOOPBACK_POSTGRES_16_PORT_55432
SHARED_POSTGRES_UNCHANGED=YES
DEDICATED_INSTANCE_CREATED=NO
DATABASE_CREATED=NO
BOOTSTRAP=NOT_RUN
BROWSER_TESTS=NOT_RUN
SAFE_TESTS_PASSED=427
SAFE_TESTS_FAILED=0
DATABASE_MUTATION=NO
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
BLOCKERS=The bootstrap wrapper still accepts 127.0.0.1:5432. The new preflight refuses that port but is not called by the wrapper. applyActiveClinicFixtures still calls provisionHostedAuthQaClinic, which enables public booking, and does not insert the walk-in service point. The shared cluster was not changed. HTTP and browser regressions were not run.
