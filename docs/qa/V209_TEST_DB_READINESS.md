# V2.09 Dedicated Test Database Readiness

Branch: `V9`  
SHA: `6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4`

```text
BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
TEST_DB_STATUS=BLOCKED: TEST_DATABASE_URL is unset
POSTGRES_AVAILABLE=YES: PostgreSQL 16.9 (Postgres.app), local server accepting connections
DB_IDENTITY_VERIFIED=NO candidate test URL supplied; no database was selected or mutated
MIGRATION_READINESS=READY PROCEDURE IDENTIFIED; not executed
REQUIRED_CONFIGURATION=Dedicated disposable TEST_DATABASE_URL plus GETPRO_TEST_DB=1 and NODE_ENV=test
SAFE_TEST_COMMAND=NODE_ENV=test GETPRO_TEST_DB=1 TEST_DATABASE_URL=<approved-disposable-url> node scripts/run-node-tests-with-test-db.js -- tests/v209-theme-lifecycle.test.js tests/v7-website-settings-ux.test.js tests/blessboard-website-management-hub-parity.test.js
PRODUCTION_MUTATION=NO
FINAL=V209_TEST_DB_READINESS_COMPLETE
```

## Findings

- `TEST_DATABASE_URL` is not configured.
- `DATABASE_URL` was not used as a fallback.
- `psql` is available and reports PostgreSQL 16.2 client tools.
- The local server is PostgreSQL 16.9 (Postgres.app) and `pg_isready` reports
  `/tmp:5432 - accepting connections`.
- Local database names matching test/foundation patterns exist, but none was
  selected or treated as safe because no explicit `TEST_DATABASE_URL` was
  provided. Identity was therefore not verified for a candidate database.

## Repository setup procedure

The dedicated-test wrapper is `scripts/run-node-tests-with-test-db.js`. It
requires `TEST_DATABASE_URL`, sets `GETPRO_TEST_DB=1` and `NODE_ENV=test`, and
refuses to run when the URL is absent.

The schema bootstrap procedure is `scripts/apply-test-db-schema.js`. It uses
the safe test-URL guard, applies `db/postgres/000_full_schema.sql` followed by
ordered incremental `db/postgres/NNN_*.sql` files, skips duplicate `* 2.sql`
files, and creates canonical tenant fixtures. It deliberately does not use
`DATABASE_URL`.

The clean-foundation integration helper is `tests/helpers/foundationDb.js`.
It uses a local maintenance connection only for explicitly requested ephemeral
database creation and allocates names with the `blessboard_ft_` prefix. That
destructive reset path was not invoked.

The repository requires Node `>=20` from `package.json`; the available
PostgreSQL 16.9 satisfies the observed local server requirement. No separate
repository PostgreSQL minimum was found.

## Minimum safe setup

1. Create or select a disposable local PostgreSQL database and record its
   identity independently.
2. Export only its connection string as `TEST_DATABASE_URL`; do not substitute
   `DATABASE_URL`.
3. Set `GETPRO_TEST_DB=1` and `NODE_ENV=test`.
4. Apply the test schema using the repository's safe schema script, after
   explicitly approving the database identity:

```text
GETPRO_TEST_DB=1 NODE_ENV=test TEST_DATABASE_URL=<approved-disposable-url> node scripts/apply-test-db-schema.js
```

No setup command was executed during this readiness check.

## Remaining test command

After the database is approved and migrated, run the database-backed theme
batch serially:

```text
NODE_ENV=test GETPRO_TEST_DB=1 TEST_DATABASE_URL=<approved-disposable-url> node scripts/run-node-tests-with-test-db.js -- tests/v209-theme-lifecycle.test.js tests/v7-website-settings-ux.test.js tests/blessboard-website-management-hub-parity.test.js
```

The placeholder must be replaced by the approved disposable URL locally; it is
not recorded here.

