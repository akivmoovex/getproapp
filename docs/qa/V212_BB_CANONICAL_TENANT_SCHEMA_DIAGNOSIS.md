# V2.12 BlessBoard canonical tenant schema diagnosis

## Result

The original `42P01` failure was an incomplete test-database bootstrap, not a V12
application defect. The supported `scripts/apply-test-db-schema.js` bootstrap was
run against a newly created, exclusively owned database
`getpro_v212_bb_test_ephemeral_202610310942`. It applied `000_full_schema.sql`
and the numbered PostgreSQL scripts, then created the eight canonical tenant
rows through `tenantsRepo.ensureCanonicalTenantsIfMissing()`.

Read-only verification showed:

- `current_database()` = `getpro_v212_bb_test_ephemeral_202610310942`
- schema = `public`, search path = `"$user", public`
- `to_regclass('public.tenants')` = `public.tenants`
- canonical tenant count = 8
- no ActiveClinic database was used

The first database, `getpro_v212_bb_ephemeral_202610310941`, was preserved. No
database was reset or overwritten.

## Contract and source trace

`tests/church-branch-announcements-events.test.js` calls
`ensureCanonicalTenantsForTests()`, which reaches
`ensureCanonicalTenantsIfMissing()` in `src/db/pg/tenantsRepo.js:251`.
That repository explicitly writes `public.tenants`. The supported test
bootstrap is `scripts/apply-test-db-schema.js`; `db/scripts/migrate.js` alone
does not establish this legacy canonical table.

`db/postgres/000_full_schema.sql` defines `public.tenants`. The V11 and V12
copies of `db/postgres/072_church_branch_host_slug.sql` and the affected test
are byte-identical, so this was not introduced by V2.12.

## Focused rerun

Command (credentials redacted):

```text
NODE_ENV=test DEPLOYMENT_ENV=testing GETPRO_TEST_DB=1 GETPRO_PG_SSL=off TEST_DATABASE_URL=postgresql://postgres:REDACTED@v212-bb-postgres:5432/getpro_v212_bb_test_ephemeral_202610310942 node --test --test-reporter=tap tests/church-branch-announcements-events.test.js
```

Result: 3 cases, 2 passed, 1 failed, exit code 1. The `public.tenants`
failure is gone. The remaining failure is the test setup's second
`branchesRepo.createBranch()` call (line 110), which supplies `slug: "main"`
for a second organization without a distinct `host_slug`. The repository
defaults `host_slug` to `slug`; migration `072_church_branch_host_slug.sql`
enforces a global unique host slug, producing:

```text
23505 duplicate key value violates unique constraint "idx_church_branches_host_slug_unique"
```

Raw evidence:

- `/private/tmp/v212-bb-qa-output/docs/qa/v212/bb/raw/phase5g-branch-announcements-events.tap`
- `/private/tmp/v212-bb-qa-output/docs/qa/v212/bb/raw/phase5g-branch-announcements-events.stderr`

This is an obsolete/incomplete test fixture relative to the supported global
host-slug contract. It is distinct from the original missing-schema failure.
No test or product source was changed in this phase. The test should supply
unique supported host slugs as a test-only correction before claiming a pass.

## Disposition

`public.tenants`: resolved by the supported bootstrap.
Remaining test: `BLOCKED — TEST_FIXTURE_CONTRACT`, not a confirmed product
defect. The original test assertions did not reach announcement/event
operations after setup failed, so acceptance remains incomplete.
