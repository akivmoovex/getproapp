# V2.13.1 D24 — Guarded Foundation bootstrap

Branch `V13`. HEAD `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. No commit, push, or deployment.

The guarded entrypoint `node scripts/ci/v13-foundation-bootstrap.cjs` ran once against the isolated instance. It applied 221 migrations and 11 seeds. The production command `npm run db:bootstrap:foundation` was not used. Port `5432` was not contacted.

## Connection identity

Before any write, a session as `v13_regression_213101` on `127.0.0.1:55432` reported:

| Check | Live value |
| --- | --- |
| `current_database()` | `getpro_v13_e2e_regression213101` |
| `current_user` | `v13_regression_213101` |
| `inet_server_addr()` | `127.0.0.1` |
| `inet_server_port()` | `55432` |
| `version()` | PostgreSQL 16.9 (Postgres.app) |
| Database owner | `v13_regression_213101` |
| Role memberships | 0 |

`pg_roles` for that login: superuser false, createdb false, createrole false, replication false, bypassrls false, inherit false, login true.

The application role cannot read server file settings or `pg_hba_file_rules`. Those were read on the same `127.0.0.1:55432` listener as `v13_isolated_bootstrap`, without changing any role:

| Setting | Value |
| --- | --- |
| `data_directory` | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data` |
| `config_file` | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data/postgresql.conf` |
| `hba_file` | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data/pg_hba.conf` |
| `listen_addresses` | `127.0.0.1` |
| `port` | `55432` |
| `password_encryption` | `scram-sha-256` |
| `unix_socket_directories` | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/run` |

`pg_hba_file_rules` still has three SCRAM-SHA-256 rules and no `trust` rule. The postmaster remains PID `42963`, listening only on `127.0.0.1:55432`. The shell had no `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, or `PGUSER` before the run. `GETPRO_DATABASE_URL` stayed unset.

A fresh `pg_roles` query produced the same catalog snapshot accepted by the D21 guard:

```json
{"rolname":"v13_regression_213101","rolsuper":false,"rolcreatedb":false,"rolcreaterole":false,"rolreplication":false,"rolbypassrls":false,"rolinherit":false,"rolcanlogin":true,"databases":["getpro_v13_e2e_regression213101"]}
```

The target database had only the empty `public` schema: no `platform` schema, no migration ledger, and no tables. There was no partial bootstrap to preserve or discard.

## Bootstrap

Command, run once:

```text
node scripts/ci/v13-foundation-bootstrap.cjs
```

The connection string named `v13_regression_213101` at `127.0.0.1:55432` and database `getpro_v13_e2e_regression213101`. The password was supplied to the process environment from the gitignored credential file and was not placed in the URL, the report, or the bootstrap log. Both write flags and `GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED=1` were set. `GETPRO_PG_SSL=off`. `DATABASE_IDENTITY_EXPECTED=moovex-platform-v7`. `environment_code=testing`.

The wrapper log:

```text
[db:bootstrap:foundation] host_fingerprint=***.0.0.1
[db:bootstrap:foundation] ssl=off
[db:bootstrap:foundation] identity_key=moovex-platform-v7 environment_code=testing
[db:bootstrap:foundation] migrations applied=221 skipped=0
[db:bootstrap:foundation] identity result=initialized
[db:bootstrap:foundation] seeds applied=11 skipped=0
V13_FOUNDATION_BOOTSTRAP_OK
```

Each migration and seed file is applied in its own transaction by `db/scripts/lib/migrator.js`. A failed file rolls back that transaction and stops the run. This run had no failure, so every recorded file committed. The bootstrap was not repeated.

## Ledger

`platform.schema_migrations` after the run:

| Module | Rows |
| --- | --- |
| platform | 47 |
| blessboard | 130 |
| activeclinic | 42 |
| getpro | 1 |
| ngo | 1 |
| seeds | 11 |

The five product modules total 221. Seeds, in order, are `001_deployments.sql` through `011_production_catalogue_after_identity.sql`.

`platform.database_identity` has one row: `identity_key=moovex-platform-v7`, `environment_code=testing`, `database_name=getpro_v13_e2e_regression213101`.

## Schemas

| Schema | Tables |
| --- | --- |
| platform | 52 |
| blessboard | 94 |
| activeclinic | 86 |
| getpro | 0 |
| ngo | 0 |

`getpro` and `ngo` are present. Their single migrations only create the schemas and reserve them for a later phase, so zero tables is the expected result. `activeclinic.healthcare_organizations.public_booking_enabled` still defaults to `false`.

The database owner is still `v13_regression_213101`. The six restricted role attributes are unchanged, and the role still has no memberships.

## Validation

Database-free contract and unit tests, with database URLs and write flags unset: 437 passed, 0 failed. That matches the previous baseline. HTTP regressions, Playwright, synthetic fixtures, and CI stages were not run.

No migration source, product code, or production bootstrap file was edited. The only repository file added by this phase is this report.

## D25

The isolated database now has the Foundation schema, identity row, and seeds. Fixture provisioning is a separate authorization. It still needs the write flags, the isolated URL, and a fresh catalog snapshot. This phase did not insert fixture rows.

```
FINAL=V2131_D24_FOUNDATION_BOOTSTRAP
BRANCH=V13
HEAD_SHA=dac251c4d13ffd7c83b4e32c0bbe130a8d12a606
ISOLATED_INSTANCE_VERIFIED=YES
POSTGRES_VERSION=PostgreSQL 16.9 (Postgres.app)
HOST=127.0.0.1
PORT=55432
DATABASE=getpro_v13_e2e_regression213101
DATABASE_OWNER=v13_regression_213101
ROLE_PRIVILEGES_VERIFIED=YES
CATALOG_SNAPSHOT_MATCH=YES
BOOTSTRAP_GUARD=PASS
FOUNDATION_BOOTSTRAP=PASS
FOUNDATION_MIGRATIONS_EXPECTED=221
FOUNDATION_MIGRATIONS_APPLIED=221
IDENTITY_MIGRATION=INITIALIZED
SEEDS_EXPECTED=11
SEEDS_APPLIED=11
PLATFORM_SCHEMA=PRESENT
BLESSBOARD_SCHEMA=PRESENT
ACTIVECLINIC_SCHEMA=PRESENT
GETPRO_SCHEMA=PRESENT
NGO_SCHEMA=PRESENT
SHARED_IDENTITY=PRESENT
POST_BOOTSTRAP_VERIFICATION=PASS
PARTIAL_SCHEMA=NO
SAFE_TESTS_PASSED=437
SAFE_TESTS_FAILED=0
HTTP_REGRESSIONS=NOT_RUN
BROWSER_REGRESSIONS=NOT_RUN
SYNTHETIC_FIXTURES=NOT_RUN
SHARED_POSTGRES_TOUCHED=NO
DATABASE_RESET=NO
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
DEPLOYMENT=NOT_PERFORMED
FILES_CHANGED=1
UNEXPECTED_FILES=
REPORT_PATH=docs/qa/V2131_D24_FOUNDATION_BOOTSTRAP_EXECUTION.md
D25_FIXTURE_PROVISIONING_READY=YES
BLOCKERS=D25 fixture provisioning is not authorized by this phase
```
