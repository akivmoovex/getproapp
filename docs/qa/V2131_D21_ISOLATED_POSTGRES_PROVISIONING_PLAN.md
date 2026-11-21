# V2.13.1 D21 — Isolated PostgreSQL provisioning plan

Branch `V13`. HEAD `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. No commit, push, or deployment.

This document prepares a separate PostgreSQL 16 regression instance. Nothing in this phase initialized a data directory, started PostgreSQL, created a role or database, or opened a connection.

The shared Postgres.app cluster was observed and left unchanged. Process `2116` is still the only listener on TCP `5432`. Port `55432` has no listener. No `psql` session was opened.

## Verified paths

| Path | Result |
| --- | --- |
| Worktree | `/Users/akivsolomon/Development/getproapp-v13` is a real directory, not a symlink. `realpath` is the same path. |
| Isolation root | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg` does not exist. |
| Data directory | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data` does not exist. |
| Socket directory | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/run` does not exist. |
| Shared data directory | `/Users/akivsolomon/Library/Application Support/Postgres/var-16` exists, is not a symlink, and is outside the isolation root. |
| Server binary | `/Applications/Postgres.app/Contents/Versions/16/bin/postgres` is PostgreSQL 16.9 (Postgres.app). |
| Init binary | `/Applications/Postgres.app/Contents/Versions/16/bin/initdb` is present and was not executed. |

`assertProjectLocalIsolationPath` rejects a symlink anywhere under the isolation root and rejects a target that resolves outside `.v13-isolated-pg`. A missing leaf is accepted. The check does not create directories. `.v13-isolated-pg/` is gitignored.

## Installation strategy

Use the Postgres.app 16 binaries only as programs. Point them at the project-local data directory, socket directory, and port `55432`. Do not point them at `var-16`, port `5432`, or the running process `2116`.

A future authorized phase, and only that phase, may run:

```text
/Applications/Postgres.app/Contents/Versions/16/bin/initdb \
  --pgdata=/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data \
  --username=v13_isolated_bootstrap \
  --auth=scram-sha-256 \
  --pwfile=/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/bootstrap.pw \
  --encoding=UTF8 \
  --locale=C
```

`initdb` always creates one superuser. That superuser is `v13_isolated_bootstrap` and exists only inside the new data directory. It is not the shared cluster's login role. Generate its password outside the repository, store it only under `.v13-isolated-pg/`, and do not print it. Before the server accepts any regression session, replace the generated `pg_hba.conf` with the configuration below. `initdb` must not be left on `trust`.

The regression role is created afterward and is the only role named by the bootstrap URL.

## Instance configuration

These settings belong only in the new data directory:

```text
listen_addresses = '127.0.0.1'
port = 55432
unix_socket_directories = '/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/run'
cluster_name = 'v13-regression-213101'
```

Identity:

| Setting | Value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `55432` |
| Database | `getpro_v13_e2e_regression213101` |
| Regression role | `v13_regression_213101` |
| Instance id | `v13-regression-213101` |
| Major version | 16 |

The dedicated instance does not share the data directory, socket directory, port, superuser credentials, `pg_hba.conf`, database files, or server process with Postgres.app.

Start and stop, later and only against the new data directory:

```text
/Applications/Postgres.app/Contents/Versions/16/bin/pg_ctl \
  -D /Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data \
  -o "-c listen_addresses=127.0.0.1 -c port=55432 -c unix_socket_directories=/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/run -c cluster_name=v13-regression-213101" \
  start
```

`pg_ctl stop` must use that same `-D`. It must not target `var-16`.

## Authentication

`pg_hba.conf` for the new instance:

```text
local all v13_isolated_bootstrap scram-sha-256
host  all v13_regression_213101 127.0.0.1/32 scram-sha-256
```

No `trust` line. No `0.0.0.0/0`. No `::/0`. The regression role has no local-socket trust entry. The bootstrap superuser is not allowed from the network.

## Role SQL for a later authorized execution

Run this only after connecting to `127.0.0.1` port `55432` as `v13_isolated_bootstrap`. Do not run it against port `5432`.

```sql
CREATE ROLE v13_regression_213101
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS
  NOINHERIT
  PASSWORD :'regression_password';

CREATE DATABASE getpro_v13_e2e_regression213101
  OWNER v13_regression_213101;

REVOKE ALL ON DATABASE getpro_v13_e2e_regression213101 FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
GRANT CONNECT ON DATABASE postgres TO v13_isolated_bootstrap;
GRANT CONNECT, TEMP ON DATABASE getpro_v13_e2e_regression213101 TO v13_regression_213101;
```

The password placeholder is not a secret stored in this repository. Supply it from the gitignored password file at execution time.

Required attributes: `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, `NOBYPASSRLS`, `NOINHERIT`. The role may connect only to `getpro_v13_e2e_regression213101`.

## Catalog verification commands

Run these only against `127.0.0.1:55432` after the role exists. They were not run in this phase.

```text
/Applications/Postgres.app/Contents/Versions/16/bin/psql \
  "host=127.0.0.1 port=55432 dbname=getpro_v13_e2e_regression213101 user=v13_regression_213101" \
  -c "SELECT inet_server_addr(), inet_server_port(), current_setting('data_directory'), current_setting('cluster_name'), current_setting('unix_socket_directories');"
```

```sql
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
       rolreplication, rolbypassrls, rolinherit
  FROM pg_roles
 WHERE rolname = 'v13_regression_213101';

SELECT datname, datdba::regrole AS owner
  FROM pg_database
 WHERE datname = 'getpro_v13_e2e_regression213101';

SELECT has_database_privilege('v13_regression_213101', datname, 'CONNECT') AS can_connect,
       datname
  FROM pg_database
 ORDER BY datname;
```

The expected role row is login true and every other listed privilege false. `has_database_privilege` must be true only for `getpro_v13_e2e_regression213101`. `data_directory` must be the project-local data path. `inet_server_port()` must be `55432`.

Before `scripts/ci/v13-foundation-bootstrap.cjs` may load `foundationBootstrap.js`, `GETPRO_V13_ROLE_CATALOG_SNAPSHOT` must be the JSON form of that row plus `"databases": ["getpro_v13_e2e_regression213101"]`. The wrapper rejects a missing snapshot, `rolsuper: true`, any other prohibited attribute, and any extra database. This gate does not query `pg_roles`. A later phase must run the SQL above and copy the result into the variable. A snapshot that was not produced by that query is not catalog proof.

## Bootstrap environment

`assertIsolatedBootstrapLaunch` runs before the Foundation module is imported. The production file `db/scripts/bootstrap-foundation.js` does not call that gate and was not modified.

Required environment:

| Variable | Value |
| --- | --- |
| `E2E_DATABASE_URL`, `TEST_DATABASE_URL`, `DATABASE_URL` | `postgresql://v13_regression_213101@127.0.0.1:55432/getpro_v13_e2e_regression213101` |
| `GETPRO_DATABASE_URL` | unset |
| `GETPRO_V13_ISOLATED_PG_PORT` | `55432` |
| `GETPRO_V13_ISOLATED_INSTANCE_ID` | `v13-regression-213101` |
| `GETPRO_V13_PG_CLUSTER_NAME` | `v13-regression-213101` |
| `GETPRO_V13_PG_DATA_DIR` | the project-local data path above |
| `GETPRO_V13_PG_SOCKET_DIR` | the project-local socket path above |
| `GETPRO_V13_WORKTREE` | `/Users/akivsolomon/Development/getproapp-v13` |
| `GETPRO_V13_REGRESSION_ROLE_PRIVILEGES` | `LOGIN,NOSUPERUSER,NOCREATEDB,NOCREATEROLE,NOREPLICATION,NOBYPASSRLS,NOINHERIT` |
| `GETPRO_V13_ROLE_CATALOG_SNAPSHOT` | the catalog JSON described above |
| `GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED` | `1` |
| `GETPRO_V13_ALLOW_DB_WRITES` | `1` |
| `GETPRO_V13_DB_STAGES_AUTHORIZED` | `1` |
| `FOUNDATION_ALLOW_LOCALHOST` | `1` |
| `GETPRO_PG_SSL` | `off` |
| `DATABASE_IDENTITY_EXPECTED` | `moovex-platform-v7` |
| `DEPLOYMENT_ENV`, `DATABASE_IDENTITY_ENV`, `EXPECTED_DATABASE_ENV` | `testing` |
| `GETPRO_TEST_DB` | `1` |
| `NODE_ENV` | `test` |
| `GETPRO_V13_CI_RUN_ID` | an 8–64 character run id |

Rejected before import: port `5432`, a remote host, a missing write flag, a missing instance flag, the wrong instance id, the wrong database name, the shared data directory, a symlink in the isolation path, a prohibited role attribute, and a catalog snapshot that lists another database.

The Foundation sequence is unchanged: migrations in module order `platform` (47), `blessboard` (130), `activeclinic` (42), `getpro` (1), `ngo` (1), for 221 files; then `ensureDatabaseIdentity`; then seeds `001` through `011`. The file scan found no `CREATE EXTENSION`. Seeds `007`, `008`, and `011` no-op unless `environment_code` is `production`. Seed `009` inserts the testing catalogue. Finder copies named `* 2.sql` are excluded by the migrator and were not edited.

Bootstrap was not invoked.

## Fixture readiness

`applyBlessBoardFixtures` and `applyActiveClinicFixtures` still refuse to run unless both write flags are set. After that hold they require the connection string to be the isolated `E2E_DATABASE_URL` and they call `assertIsolatedBootstrapLaunch`. Unauthorized calls still throw `V13_FIXTURE_HOLD` before any query.

The ActiveClinic plan keeps `publicBookingEnabled: false`. Provisioning uses `submitAndProvisionClinicRegistration`, `ensureDefaultDepartments`, `createStaffMember`, `assignStaffToFacility`, and `assignStaffRole`. The assigned role keys are the existing `activeclinic_receptionist`, `activeclinic_clinician`, and `activeclinic_nurse`. The clinician role does not include `activeclinic.triage.record`; the nurse role does. `createFacilityServicePoint` creates the walk-in point and requires the receptionist actor to hold `activeclinic.reception.manage_queue`. The path does not call `provisionHostedAuthQaClinic` and does not set `public_booking_enabled = true`.

No fixture row was inserted.

## Browser readiness

Both `playwright.v13-ac-platform.config.cjs` and `playwright.v13-bb-qa.config.cjs` call `assertV13BrowserHarness` before `webServer` is defined. The harness now calls `assertIsolatedBootstrapLaunch` after its own authorization checks. A missing `GETPRO_V13_BROWSER_AUTHORIZED=1`, a missing write flag, port `5432`, or a failed isolation check aborts before navigation. `installLocalOnlyRoutes` still allows only `http` on `127.0.0.1`, `localhost`, `::1`, and `*.local.test` for the approved port in `4100–4999`. ActiveClinic defaults to `4187` and BlessBoard to `4186`. Both configs map `*.local.test` to `127.0.0.1`, set `reuseExistingServer: false`, and do not start a server while the guard rejects the environment.

No server or browser was started.

## Safe teardown

After `GETPRO_V13_TEARDOWN_AUTHORIZED=1` and the same isolated URL, the only prepared statements are:

```sql
DROP DATABASE IF EXISTS getpro_v13_e2e_regression213101;
DROP ROLE IF EXISTS v13_regression_213101;
```

Then stop the postmaster with `pg_ctl -D` pointed at the project-local data directory. Do not drop `postgres`, do not use port `5432`, and do not delete `var-16`. Teardown was not executed.

## Safe validation

Database-free contract and unit tests, with database URLs and write/browser flags unset: 437 passed, 0 failed. The previous baseline was 432. The five new D21 tests account for the increase.

Negative coverage now rejects port `5432`, the Postgres.app data directory, a remote host, a missing write flag, the wrong instance id, prohibited catalog attributes, the wrong database name, an isolation symlink, and a path outside the isolation root. PostgreSQL was not started and the shared instance was not contacted.

## Remaining prerequisites and required authorization

Do not run the prepared `initdb`, `pg_ctl`, `psql`, role SQL, bootstrap, fixture, HTTP, or browser commands until a later phase is explicitly authorized and all of the following are true:

- `GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED=1`
- both write flags set to `1`
- the data and socket directories have been created by that phase and re-checked as real paths inside the isolation root
- the catalog SQL has been run on port `55432` and the snapshot matches
- `GETPRO_V13_HTTP_AUTHORIZED=1` before HTTP regression
- `GETPRO_V13_BROWSER_AUTHORIZED=1` before Playwright
- `GETPRO_V13_TEARDOWN_AUTHORIZED=1` before teardown

```
FINAL=V2131_D21_POSTGRES_PROVISIONING_PLAN
BRANCH=V13
HEAD_SHA=dac251c4d13ffd7c83b4e32c0bbe130a8d12a606
SOURCE_FIXES_PRESERVED=YES
ISOLATED_HOST=127.0.0.1
ISOLATED_PORT=55432
TARGET_DB=getpro_v13_e2e_regression213101
TARGET_ROLE=v13_regression_213101
INSTANCE_ID=v13-regression-213101
DATA_DIRECTORY_VERIFIED=ABSENT_CONTAINED_NOT_SYMLINK
SOCKET_DIRECTORY_VERIFIED=ABSENT_CONTAINED_NOT_SYMLINK
SHARED_POSTGRES_UNCHANGED=YES
AUTHENTICATION_DESIGN=SCRAM_SHA_256_127.0.0.1_32
ROLE_PRIVILEGE_DESIGN=LOGIN_NOSUPERUSER_NOCREATEDB_NOCREATEROLE_NOREPLICATION_NOBYPASSRLS_NOINHERIT
BOOTSTRAP_COMPATIBILITY=COMPATIBLE_NOT_EXECUTED
FIXTURE_READINESS=SOURCE_CONTRACT_NOT_EXECUTED
BROWSER_ISOLATION_READINESS=GUARDED_NOT_LAUNCHED
SAFE_TESTS_PASSED=437
SAFE_TESTS_FAILED=0
DATABASE_CREATED=NO
DATABASE_MUTATION=NO
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
DEPLOYMENT=NOT_PERFORMED
REPORT_PATH=docs/qa/V2131_D21_ISOLATED_POSTGRES_PROVISIONING_PLAN.md
BLOCKERS=Instance not initialized; port 55432 not started; role and database not created; pg_roles not queried; catalog snapshot gate is fail-closed and is not a live query; bootstrap, fixtures, HTTP, and browser not executed
```
