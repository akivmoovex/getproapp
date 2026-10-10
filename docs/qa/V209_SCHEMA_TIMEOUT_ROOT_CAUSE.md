# V2.09 Schema Initialization Timeout Diagnosis

Branch: `V9`  
SHA: `6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4`

```text
BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
TEST_DB_IDENTITY=getpro_v209_theme_test on local Postgres.app 16.9
TEST_DB_TABLE_COUNT=0
NODE_STARTUP=PASS (direct require/exit)
BOOTSTRAP=PASS (runBootstrap returns and process exits)
POSTGRES_CONNECTION=PASS (SELECT 1)
LAST_COMPLETED_SCHEMA_STEP=none; no apply-test-db-schema progress line emitted
BLOCKING_OPERATION=apply-test-db-schema CLI lifecycle before first schema progress output; no active PostgreSQL query or lock observed
ROOT_CAUSE=localized to the schema-script process before full-schema execution; exact internal wait is not observable from the read-only evidence
FOUNDATION_DB_BEHAVIOR=creates separate ephemeral blessboard_ft_* databases through the local admin connection, then migrates each; lifecycle tests do not use TEST_DATABASE_URL as their final database
SCHEMA_SCRIPT_REQUIRED_FOR_LIFECYCLE=NO as a target database initializer; lifecycle setup calls resetFoundationDatabase() and migrate() itself
SAFE_NEXT_ACTION=diagnose the schema CLI's pre-schema lifecycle with a bounded process trace; do not retry initialization or run DB tests yet
PRODUCTION_MUTATION=NO
FINAL=V209_SCHEMA_TIMEOUT_DIAGNOSIS_COMPLETE
```

## Evidence

- `SELECT 1` succeeded against `getpro_v209_theme_test`.
- The target database still has zero non-system tables.
- A direct Node diagnostic showed `require(bootstrap)`, `runBootstrap()`,
  `require(tenantsRepo)`, and `requireSafeTestDatabaseUrl()` all return.
- PostgreSQL activity/lock inspection found no waiting query and no ungranted
  lock for the target database after the stalled process was stopped.
- `db/postgres/000_full_schema.sql` is 22,627 bytes; 101 numbered SQL files
  exist. No full-schema SQL was confirmed to execute.

The schema script's documented first progress line is printed inside `main()`
immediately before the `000_full_schema.sql` query. Neither attempt emitted that
line. Bootstrap and the imported modules terminate independently, so the
observed timeout is not a PostgreSQL lock or connection wait and did not reach
incremental migrations, tenant fixtures, or connection shutdown.

The available evidence localizes the stall to the schema-script CLI lifecycle
between module setup and entry into `main()`. It does not prove a more specific
function-level cause; reporting full-schema execution as the cause would be
unsupported.

## Foundation lifecycle behavior

`tests/v209-theme-lifecycle.test.js` calls `resetFoundationDatabase()` in its
`before` hook and then calls `migrate({ connectionString: databaseUrl })`.
`resetFoundationDatabase()` creates a unique `blessboard_ft_<pid>_<time>_<hex>`
database using `FOUNDATION_ADMIN_DATABASE_URL`, then
`DATABASE_URL_ADMIN`, then the local `postgres` maintenance database.
`FOUNDATION_DATABASE_URL`, when set, changes the returned fixed database URL and
causes that named database to be dropped and recreated.

Neither `FOUNDATION_ADMIN_DATABASE_URL` nor `FOUNDATION_DATABASE_URL` was set or
used in this diagnosis. No ephemeral child database was created. The
`FOUNDATION_DATABASE_URL` path is a destructive reset risk if pointed at an
unapproved database and must remain unset for the authorized run.

Therefore `scripts/apply-test-db-schema.js` is not required to initialize the
database used by the lifecycle test: that test creates its own ephemeral
database and applies `db/migrations` through `migrator.js`. The script remains
relevant only to other test workflows using a fixed dedicated database.

