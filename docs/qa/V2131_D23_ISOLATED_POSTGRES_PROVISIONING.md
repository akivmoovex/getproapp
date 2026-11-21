# V2.13.1 D23 — Isolated PostgreSQL provisioning

Branch `V13`. HEAD `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. No commit, push, or deployment.

The dedicated project-local PostgreSQL 16.9 instance is running. Foundation bootstrap, migrations, seeds, fixtures, HTTP tests, and Playwright were not run. Port `5432` was not contacted, and the shared Postgres.app data directory was not modified.

Credentials were generated into mode `0600` files under `.v13-isolated-pg/`, which is gitignored. They are not recorded here.

## Binaries

| Command | Path | Version |
| --- | --- | --- |
| `initdb` | `/Applications/Postgres.app/Contents/Versions/16/bin/initdb` | PostgreSQL 16.9 (Postgres.app) |
| `pg_ctl` | `/Applications/Postgres.app/Contents/Versions/16/bin/pg_ctl` | PostgreSQL 16.9 (Postgres.app) |
| `postgres` | `/Applications/Postgres.app/Contents/Versions/16/bin/postgres` | PostgreSQL 16.9 (Postgres.app) |
| `psql` | `/Applications/Postgres.app/Contents/Versions/16/bin/psql` | PostgreSQL 16.9 (Postgres.app) |

Every invocation used an absolute path and an explicit data directory, host, or port. `createdb` was not used.

## Cluster identity

| Item | Observed value |
| --- | --- |
| Postmaster | PID `42963` |
| Command | `postgres -D /Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data` with `listen_addresses=127.0.0.1`, `port=55432`, the approved socket directory, and `cluster_name=v13-regression-213101` |
| `version()` | PostgreSQL 16.9 (Postgres.app), aarch64 |
| `inet_server_addr()` | `127.0.0.1` |
| `inet_server_port()` | `55432` |
| Listener | TCP `127.0.0.1:55432` only |
| Socket | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/run/.s.PGSQL.55432` |
| `data_directory` | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data` |
| `config_file` | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data/postgresql.conf` |
| `hba_file` | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data/pg_hba.conf` |
| `listen_addresses` | `127.0.0.1` |
| `password_encryption` | `scram-sha-256` |
| `cluster_name` | `v13-regression-213101` |

The process current directory is the isolated data directory. Its open files do not include `Application Support/Postgres` or port `5432`. The worktree, data directory, and socket directory are real directories, not symlinks, and their real paths stay under the worktree.

The bootstrap administrator is `v13_isolated_bootstrap`. It exists only in this data directory.

## Authentication

`pg_hba_file_rules` returned three rules and no errors:

| Type | User | Address | Method |
| --- | --- | --- | --- |
| local | `v13_isolated_bootstrap` | socket | `scram-sha-256` |
| host | `v13_isolated_bootstrap` | `127.0.0.1/32` | `scram-sha-256` |
| host | `v13_regression_213101` | `127.0.0.1/32` | `scram-sha-256` |

No rule uses `trust`. A connection to `127.0.0.1:55432` with an incorrect password for `v13_regression_213101` was rejected: `password authentication failed`.

## Database and role

Application database `getpro_v13_e2e_regression213101` is owned by `v13_regression_213101`. Its ACL is `v13_regression_213101=CTc/v13_regression_213101`: connect, temporary, and create. `PUBLIC` has no entry on that database.

`pg_roles` for `v13_regression_213101`:

| Attribute | Value |
| --- | --- |
| `rolcanlogin` | true |
| `rolsuper` | false |
| `rolcreatedb` | false |
| `rolcreaterole` | false |
| `rolreplication` | false |
| `rolbypassrls` | false |
| `rolinherit` | false |

`pg_auth_members` has no rows for this role. Both isolated roles have a password secret stored by PostgreSQL; the secret values were not selected.

Initialization also created `postgres`, `template0`, and `template1`, owned by `v13_isolated_bootstrap`. Those are not application databases. `CONNECT` was revoked from `PUBLIC` on them. `template0` does not allow connections. The application role's `has_database_privilege(..., 'CONNECT')` is true only for `getpro_v13_e2e_regression213101`.

Connected as `v13_regression_213101`, `current_user` and `current_database()` match that role and database. It can use and create objects in schema `public` (`public_usage`, `public_create`, and database `CREATE` are true). That is the privilege needed for a later, separately authorized schema bootstrap. It is not superuser.

Negative attempts, all rejected with no new object left behind:

- `CREATE DATABASE` returned `permission denied to create database`.
- `CREATE ROLE` returned the `CREATEROLE` denial.
- Connecting to database `postgres` returned `User does not have CONNECT privilege`.

## Live catalog snapshot

This JSON was produced by `json_build_object` from `pg_roles` and `has_database_privilege` on `127.0.0.1:55432`. `assertRoleCatalogSnapshot` accepted it. Database-write flags were not set, and the Foundation wrapper was not executed.

```json
{"rolname":"v13_regression_213101","rolsuper":false,"rolcreatedb":false,"rolcreaterole":false,"rolreplication":false,"rolbypassrls":false,"rolinherit":false,"rolcanlogin":true,"databases":["getpro_v13_e2e_regression213101"]}
```

## Guard tests

Database-free contract and unit tests, with database URLs and write/browser flags unset: 437 passed, 0 failed. The D21 absence assertion was updated because the authorized directories now exist: a real contained directory is accepted, and a symlink or a path outside the isolation root is still rejected. Port `5432`, the shared data directory, remote hosts, missing flags, the wrong instance id, prohibited role attributes, and the wrong database name remain rejected.

## Resources created

- `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/`
- `data/` — the new cluster, left running
- `run/` — the Unix socket
- Gitignored credential files `bootstrap.pw`, `role.pw`, and `pgpass`
- Role `v13_isolated_bootstrap`
- Role `v13_regression_213101`
- Database `getpro_v13_e2e_regression213101`

No application schema, migration, seed, or fixture row was written.

## What was not verified

- Row-level security bypass was not exercised. There are no application tables or policies. The catalog attribute `rolbypassrls` is false.
- `NOINHERIT` was not exercised through a membership grant. The membership list is empty.
- A wrong password was tested for the application role, not for the bootstrap role.
- The shared cluster was not queried, so this report does not include a new reading of port `5432`.

## D24 prerequisites

A later phase must be explicitly authorized before bootstrap. It needs:

- This same postmaster, still bound to `127.0.0.1:55432` and the data directory above.
- `GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED=1`, `GETPRO_V13_ALLOW_DB_WRITES=1`, and `GETPRO_V13_DB_STAGES_AUTHORIZED=1`.
- The connection string `postgresql://v13_regression_213101@127.0.0.1:55432/getpro_v13_e2e_regression213101`, with the password supplied from the gitignored `pgpass` file rather than the command line or the report.
- `GETPRO_V13_ROLE_CATALOG_SNAPSHOT` set from a fresh query, not from a copied declaration, and matching the JSON above.
- The existing Foundation wrapper, which still imports `foundationBootstrap.js` only after those checks.
- Separate authorization before HTTP tests, Playwright, fixture insertion, or teardown.

```
FINAL=V2131_D23_ISOLATED_POSTGRES_PROVISIONING
BRANCH=V13
HEAD_SHA=dac251c4d13ffd7c83b4e32c0bbe130a8d12a606
POSTGRES_VERSION=PostgreSQL 16.9 (Postgres.app)
INSTANCE_ID=v13-regression-213101
INSTANCE_STARTED=YES
ISOLATED_HOST=127.0.0.1
ISOLATED_PORT=55432
DATA_DIRECTORY=/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data
SOCKET_DIRECTORY=/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/run
AUTHENTICATION=SCRAM-SHA-256
TRUST_AUTHENTICATION=NO
APPLICATION_DATABASE=getpro_v13_e2e_regression213101
DATABASE_OWNER=v13_regression_213101
APPLICATION_ROLE=v13_regression_213101
ROLE_SUPERUSER=NO
ROLE_CREATEDB=NO
ROLE_CREATEROLE=NO
ROLE_REPLICATION=NO
ROLE_BYPASSRLS=NO
ROLE_INHERIT=NO
ROLE_MEMBERSHIPS=NONE
CATALOG_VERIFIED_LIVE=YES
GUARD_SNAPSHOT=ACCEPTED
SHARED_POSTGRES_TOUCHED=NO
FOUNDATION_BOOTSTRAP=NOT_RUN
MIGRATIONS=NOT_RUN
SEEDS=NOT_RUN
FIXTURES=NOT_RUN
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
SAFE_TESTS_PASSED=437
SAFE_TESTS_FAILED=0
FILES_CHANGED=2
UNEXPECTED_FILES=
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
DEPLOYMENT=NOT_PERFORMED
REPORT_PATH=docs/qa/V2131_D23_ISOLATED_POSTGRES_PROVISIONING.md
BLOCKERS=D24 still requires explicit authorization before Foundation bootstrap; the running cluster has no application schema yet
```
