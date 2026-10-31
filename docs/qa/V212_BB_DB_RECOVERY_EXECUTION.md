# BlessBoard V2.12 Database Recovery Execution

Status: `RECOVERED_WITH_TEST_ONLY_FIXTURE_CORRECTION`

## Database

- Original database: `getpro_v212_bb_ephemeral_202610310941` (preserved)
- Recovery database: `getpro_v212_bb_test_ephemeral_202610310942`
- PostgreSQL service: `v212-bb-postgres` on `v212-qa-internal`
- Ownership: created by this execution; owner `postgres`; no pre-existing database was overwritten.
- Identity: `moovex-platform-v7`, `testing`
- Migrations: repository `db/scripts/migrate.js` applied the full V12 migration sequence, including platform, 130 BlessBoard, and ActiveClinic migrations.
- SSL: `GETPRO_PG_SSL=off`
- ActiveClinic database: untouched.

The initial `migrate-testing.js` attempt was rejected because the fresh database had no identity table; the supported full `migrate.js` procedure followed by explicit testing identity initialization completed successfully. For the canonical-tenant contract, the supported `scripts/apply-test-db-schema.js` bootstrap was run against the recovery database. It applied `000_full_schema.sql`, the numbered PostgreSQL scripts, and created eight canonical tenant rows. Read-only checks confirmed `public.tenants` exists.

## Recovered test execution

Command:

`NODE_ENV=test DEPLOYMENT_ENV=testing GETPRO_TEST_DB=1 GETPRO_PG_SSL=off TEST_DATABASE_URL=postgresql://postgres:...@v212-bb-postgres:5432/getpro_v212_bb_test_ephemeral_202610310942 node --test --test-reporter=tap tests/church-branch-announcements-events.test.js`

Result: 3 cases — 2 PASS, 1 FAIL, 0 SKIP, exit code 1. The missing `public.tenants` error no longer occurs.

The remaining failing case is `branch announcements and events management`. First failing operation:

`branchesRepo.createBranch()` at `src/db/pg/church/branchesRepo.js:174`, called by the second branch fixture at `tests/church-branch-announcements-events.test.js:110`.

Error: `23505 duplicate key value violates unique constraint "idx_church_branches_host_slug_unique"`.

Classification: `TEST_FIXTURE_CONTRACT`. The test creates `slug: "main"` for two organizations without distinct host slugs; the repository defaults `host_slug` to `slug`, while migration 072 enforces global host-slug uniqueness. V11 and V12 migration 072 and the affected test are identical. This is not a confirmed V12 product defect.

Raw evidence:

- `/private/tmp/v212-bb-qa-output/docs/qa/v212/bb/raw/phase5f-branch-announcements-events.tap`
- `/private/tmp/v212-bb-qa-output/docs/qa/v212/bb/raw/phase5f-branch-announcements-events.stderr`
- `/private/tmp/v212-bb-qa-output/docs/qa/v212/bb/raw/phase5g-branch-announcements-events.tap`
- `/private/tmp/v212-bb-qa-output/docs/qa/v212/bb/raw/phase5g-branch-announcements-events.stderr`

Phase 5H applied a test-only correction in the isolated QA copy: explicit
run-scoped `host_slug` values are supplied for the two branches while retaining
the application slug `main`. The corrected test ran 3/3 cases successfully.
A repeat run in independently provisioned database
`getpro_v212_bb_test_ephemeral_202610310943` also ran 3/3 cases successfully.
Raw TAP:

- `/private/tmp/v212-bb-qa-output/docs/qa/v212/bb/raw/phase5h-first-rerun-patched.tap`
- `/private/tmp/v212-bb-qa-output/docs/qa/v212/bb/raw/phase5h-second-rerun.tap`
