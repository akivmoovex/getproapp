# V2.13.1 D22 — Isolated PostgreSQL provisioning verification

Branch `V13`. HEAD `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. No commit, push, or deployment.

This phase checked the provisioning inputs and wrote the later execution procedure. It did not run `initdb`, `pg_ctl`, `createdb`, or `psql`. It did not open port `5432`.

## Preflight

The worktree is branch `V13` at `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. The D04–D21 files remain, including `scripts/ci/v13-foundation-bootstrap.cjs` and `docs/qa/V2131_D21_ISOLATED_POSTGRES_PROVISIONING_PLAN.md`. `db/scripts/bootstrap-foundation.js`, package files, and CI workflows were not modified. This phase adds only this report.

## PostgreSQL 16.9 binaries

All five binaries are executable files under `/Applications/Postgres.app/Contents/Versions/16/bin`. Each `--version` reports `PostgreSQL 16.9 (Postgres.app)`.

| Command | Path |
| --- | --- |
| `initdb` | `/Applications/Postgres.app/Contents/Versions/16/bin/initdb` |
| `pg_ctl` | `/Applications/Postgres.app/Contents/Versions/16/bin/pg_ctl` |
| `postgres` | `/Applications/Postgres.app/Contents/Versions/16/bin/postgres` |
| `psql` | `/Applications/Postgres.app/Contents/Versions/16/bin/psql` |
| `createdb` | `/Applications/Postgres.app/Contents/Versions/16/bin/createdb` |

`--version` does not start a server. The later procedure must pass `--pgdata` or `-D` explicitly. It must not call bare `createdb`, `psql`, or `pg_ctl`, because an unset port can reach the shared local socket. `createdb` is recorded here and is not part of the procedure.

## Isolated paths and port

| Check | Result |
| --- | --- |
| Data directory `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data` | Absent. Not a symlink. |
| Socket directory `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/run` | Absent. Not a symlink. |
| Isolation root | Absent. Contained by the worktree path, whose realpath is the worktree itself. |
| Shared data directory | `/Users/akivsolomon/Library/Application Support/Postgres/var-16` remains a real directory, mode `0700`, uid `501`. It is outside the isolation root. |
| Process use | No PostgreSQL process has `.v13-isolated-pg` in its command line. |
| Port `55432` | No TCP listener. |

Port `5432` was not contacted. No directory was created.

## Later provisioning procedure

Do not run this section until a later phase is explicitly authorized. Abort on the first failed assertion. Do not choose another port, data directory, or role.

Set the isolated environment before every command:

```text
export PGDATA=/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data
export PGHOST=127.0.0.1
export PGPORT=55432
```

Abort unless all three values match exactly, and abort if `PGDATA` contains `Postgres.app`, `var-16`, or `Application Support/Postgres`.

1. Confirm port `55432` still has no listener and both directories are still absent and not symlinks. Abort if either directory exists as a symlink or resolves outside `.v13-isolated-pg`.
2. Create only the socket directory: `mkdir -p /Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/run`. Do not create it inside the shared data directory.
3. Initialize only the isolated data directory. The password file must be created outside the git tree, under `.v13-isolated-pg/`, and must not be printed.

```text
/Applications/Postgres.app/Contents/Versions/16/bin/initdb \
  --pgdata=/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data \
  --username=v13_isolated_bootstrap \
  --auth=scram-sha-256 \
  --pwfile=/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/bootstrap.pw \
  --encoding=UTF8 \
  --locale=C
```

`v13_isolated_bootstrap` is the superuser created inside this data directory only. It is not a role on the shared cluster.

4. Replace the generated `pg_hba.conf` in the new data directory before the server accepts sessions:

```text
local all v13_isolated_bootstrap scram-sha-256
host  all v13_regression_213101 127.0.0.1/32 scram-sha-256
```

Abort if that file contains `trust`, `0.0.0.0/0`, or `::/0`.

5. Start the server bound only to the isolated paths:

```text
/Applications/Postgres.app/Contents/Versions/16/bin/pg_ctl \
  -D /Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data \
  -o "-c listen_addresses=127.0.0.1 -c port=55432 -c unix_socket_directories=/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/run -c cluster_name=v13-regression-213101" \
  start
```

Abort unless `lsof` shows `127.0.0.1:55432` and does not show `*:55432`.

6. Connect only to that port as `v13_isolated_bootstrap` and create the disposable database and restricted login. Generate the regression password outside the repository. Do not use `createdb`.

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

Abort if any statement names a database other than `getpro_v13_e2e_regression213101`, `postgres`, or `template1`, or a role other than the two isolated roles.

## Verification queries and expected results

Run these with `psql` against `host=127.0.0.1 port=55432` only.

```sql
SELECT inet_server_addr() AS addr,
       inet_server_port() AS port,
       current_setting('data_directory') AS data_directory,
       current_setting('cluster_name') AS cluster_name,
       current_setting('unix_socket_directories') AS socket_directories;
```

Expected: address `127.0.0.1`, port `55432`, data directory ending in `.v13-isolated-pg/data`, cluster name `v13-regression-213101`, socket directory ending in `.v13-isolated-pg/run`.

```sql
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
       rolreplication, rolbypassrls, rolinherit
  FROM pg_roles
 WHERE rolname = 'v13_regression_213101';
```

Expected: `rolcanlogin` true, and `rolsuper`, `rolcreatedb`, `rolcreaterole`, `rolreplication`, `rolbypassrls`, and `rolinherit` all false.

```sql
SELECT datname, datdba::regrole AS owner
  FROM pg_database
 WHERE datname = 'getpro_v13_e2e_regression213101';
```

Expected owner: `v13_regression_213101`.

```sql
SELECT datname,
       has_database_privilege('v13_regression_213101', datname, 'CONNECT') AS can_connect
  FROM pg_database
 ORDER BY datname;
```

Expected: `can_connect` is true only for `getpro_v13_e2e_regression213101`.

Reconnect as `v13_regression_213101` and expect:

```text
current_user = v13_regression_213101
current_database = getpro_v13_e2e_regression213101
```

Build `GETPRO_V13_ROLE_CATALOG_SNAPSHOT` from those rows:

```json
{"rolname":"v13_regression_213101","rolsuper":false,"rolcreatedb":false,"rolcreaterole":false,"rolreplication":false,"rolbypassrls":false,"rolinherit":false,"rolcanlogin":true,"databases":["getpro_v13_e2e_regression213101"]}
```

Abort if the JSON disagrees with `pg_roles` or lists any other database. The current wrapper validates this document. It does not query `pg_roles` itself.

## Bootstrap command and validation order

The later command is `node scripts/ci/v13-foundation-bootstrap.cjs` with the isolated environment. It is not `npm run db:bootstrap:foundation`. The connection string is:

```text
postgresql://v13_regression_213101@127.0.0.1:55432/getpro_v13_e2e_regression213101
```

`foundationBootstrap.js` is imported only after every check below succeeds, and the same checks run again immediately before and after that import. The implemented order is:

1. `FOUNDATION_ALLOW_LOCALHOST=1`, `GETPRO_PG_SSL=off`, and `DATABASE_IDENTITY_EXPECTED=moovex-platform-v7`.
2. Both write flags, `GETPRO_V13_ALLOW_DB_WRITES=1` and `GETPRO_V13_DB_STAGES_AUTHORIZED=1`, inside the disposable-database guard.
3. Database name `getpro_v13_e2e_regression213101` and a local host.
4. Isolated launch: instance authorization, the same two write flags, `GETPRO_DATABASE_URL` unset, host `127.0.0.1`, port `55432`, database name, role `v13_regression_213101`, instance id and cluster name `v13-regression-213101`, data and socket paths, shared-directory rejection, the privilege declaration, and the catalog snapshot.
5. Import of `db/scripts/lib/foundationBootstrap.js`.

Write-flag checks happen before the instance-id check. Every listed assertion still happens before the Foundation import, and a failure skips that import. The production bootstrap file does not contain this gate.

The Foundation sequence remains 221 migrations (`platform` 47, `blessboard` 130, `activeclinic` 42, `getpro` 1, `ngo` 1), then database identity, then seeds `001`–`011`. Bootstrap was not invoked.

## Fixture compatibility

`applyBlessBoardFixtures` and `applyActiveClinicFixtures` still throw `V13_FIXTURE_HOLD` unless both write flags are set. After that they require the isolated URL and the same launch gate. Public booking stays `false`, and the apply path does not set `public_booking_enabled = true`.

The fixture assigns the existing roles `activeclinic_receptionist`, `activeclinic_clinician`, and `activeclinic_nurse` at facility scope. Receptionist includes `activeclinic.reception.check_in` and `activeclinic.reception.manage_queue`. Nurse includes `activeclinic.triage.record`, which is the vitals permission. Clinician does not include that permission. The service point is created by `createFacilityServicePoint` for the same organization, healthcare organization, and facility returned by clinic registration. No schema change is required. No fixture row was inserted.

## Safe tests

Database-free contract and unit tests, with database URLs and write/browser flags unset: 437 passed, 0 failed. HTTP and Playwright suites were not run. The negative guards for port `5432`, the shared data directory, remote hosts, missing flags, the wrong instance id, prohibited role attributes, and the wrong database name remain in the D20 and D21 contracts.

## Safe teardown

Only after `GETPRO_V13_TEARDOWN_AUTHORIZED=1`, and only while `PGHOST=127.0.0.1` and `PGPORT=55432`:

```sql
DROP DATABASE IF EXISTS getpro_v13_e2e_regression213101;
DROP ROLE IF EXISTS v13_regression_213101;
```

Then:

```text
/Applications/Postgres.app/Contents/Versions/16/bin/pg_ctl \
  -D /Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data \
  stop
```

Abort if the data directory is not the project-local path. Do not drop `postgres` and do not stop the Postgres.app process.

## Authorization still required

The procedure above is ready for review and was not executed. A later phase must explicitly authorize instance creation, both database-write flags, the live catalog query, and, separately, HTTP, browser, and teardown.

```
FINAL=V2131_D22_PROVISIONING_VERIFICATION
BRANCH=V13
HEAD_SHA=dac251c4d13ffd7c83b4e32c0bbe130a8d12a606
POSTGRES_BINARIES=POSTGRESQL_16.9_POSTGRES_APP
TARGET_PORT_AVAILABLE=YES
DATA_DIRECTORY_SAFE=ABSENT_CONTAINED_NOT_SYMLINK
SOCKET_DIRECTORY_SAFE=ABSENT_CONTAINED_NOT_SYMLINK
PROVISIONING_PROCEDURE_READY=YES
ROLE_PRIVILEGE_VERIFICATION_READY=YES
BOOTSTRAP_GUARD_READY=YES
FIXTURE_READINESS=SOURCE_CONTRACT_NOT_EXECUTED
SAFE_TESTS_PASSED=437
SAFE_TESTS_FAILED=0
DATABASE_CREATED=NO
DATABASE_MUTATION=NO
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
SHARED_POSTGRES_UNCHANGED=YES
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
DEPLOYMENT=NOT_PERFORMED
REPORT_PATH=docs/qa/V2131_D22_POSTGRES_PROVISIONING_VERIFICATION.md
BLOCKERS=Procedure not executed; isolated instance not created; pg_roles not queried; catalog snapshot remains a required document until the prepared query is run on port 55432
```
