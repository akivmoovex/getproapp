# V13 G78 disposable database bootstrap

One new database was created on the isolated instance verified in G77. The existing regression database was not opened. Port 5432 was not contacted.

| Item | Value |
| --- | --- |
| DATABASE_NAME | `getpro_v13_e2e_g78d2301` |
| DATABASE_OWNER | `v13_regression_213101` |
| DATABASE_HOST | `127.0.0.1` |
| DATABASE_PORT | `55432` |
| INSTANCE_ID | `v13-regression-213101` |
| Data directory | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data` |
| DATABASE_CREATION_RESULT | `created` |

Before creation, the name matched `^getpro_v13_(ci|bb_qa|int|e2e)_[a-z0-9]{6,32}$`, the database was absent, the postmaster data directory and cluster name matched this worktree, and the regression role was login-only without superuser, createdb, createrole, replication, bypassrls, or inherit. The database was created by `v13_isolated_bootstrap` on the `postgres` maintenance database of this instance and owned by the regression role.

The V13 wrapper `scripts/ci/v13-foundation-bootstrap.cjs` still accepts only `getpro_v13_e2e_regression213101`. It was not used, and that guard was not changed. The supported library `bootstrapFoundation` was called with an explicit connection string for the new database after those checks.

## Foundation result

| Item | Count |
| --- | --- |
| Product migrations applied | 223 |
| Product migrations skipped on first run | 0 |
| Seeds applied | 11 |
| Seeds skipped on first run | 0 |
| Identity | `initialized`, `moovex-platform-v7`, `testing`, `getpro_v13_e2e_g78d2301` |

Ledger rows: platform 47, blessboard 130, activeclinic 44, getpro 1, ngo 1, seeds 11.

A second migration pass applied 0 files and skipped 223, including `043_record_migration_inventory.sql` and `044_laboratory_reference_rules.sql`.

`verifyFoundation` returned not ok. Its only failures were the five tables added by migrations 043 and 044. The allowlist is stale relative to those reviewed files. The tables, identity row, and seeds were already committed. No other verifier failure was present.

Public booking default remains `false`. No reference-rule rows were inserted. Production media uploads stay disabled when the flag is unset. A production OTP provider resolves to inactive.

## Guard that still blocks test execution

HTTP and Playwright launch checks still require the old database name. This database is ready for a later run only after a separate authorization points those checks at `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432` without accepting port 5432. G79 was not started.
