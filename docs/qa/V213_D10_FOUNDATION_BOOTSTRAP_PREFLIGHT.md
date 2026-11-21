# V2.13.1 D10 — Foundation bootstrap safety preflight

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. The uncommitted D04–D09 tests, guards, Playwright isolation, and QA reports are intact. Nothing in this phase created a database, ran a migration or seed, or started a browser.

Node on this machine is 22.23.1. The package accepts Node 20 or newer.

## Target identity

`getpro_v13_e2e_regression213101` passes the unchanged guard:

`^getpro_v13_(ci|bb_qa|int|e2e)_[a-z0-9]{6,32}$`

`assertOwnedDisposableDatabaseName` accepted the complete string. `assertHarnessDatabaseTarget` accepted it only as `127.0.0.1` when `E2E_DATABASE_URL` and `TEST_DATABASE_URL` were that database, `GETPRO_V13_OWNED_DB_NAME` matched, and the testing identity flags were present. The prefix alone does not match.

## Bootstrap entrypoint

The supported Foundation entrypoint is:

`npm run db:bootstrap:foundation`

That runs `db/scripts/bootstrap-foundation.js`, which calls `bootstrapFoundation`. It is not part of application startup. It reads `DATABASE_URL` only. It does not call the V13 disposable-name guard.

Required environment before that command can be considered:

- `DATABASE_URL`, `TEST_DATABASE_URL`, and `E2E_DATABASE_URL` all equal, or `DATABASE_URL` unset and the test URLs set
- `GETPRO_DATABASE_URL` unset
- `GETPRO_V13_OWNED_DB_NAME=getpro_v13_e2e_regression213101`
- `NODE_ENV=test`
- `DEPLOYMENT_ENV=testing`
- `DATABASE_IDENTITY_ENV=testing`
- `EXPECTED_DATABASE_ENV=testing`
- `GETPRO_TEST_DB=1`
- `GETPRO_PG_SSL=off`
- `GETPRO_V13_CI_RUN_ID` of 8–64 safe characters
- `GETPRO_V13_ALLOW_DB_WRITES=1`
- `GETPRO_V13_DB_STAGES_AUTHORIZED=1`
- `GETPRO_V13_REQUIRE_DB_WRITE_AUTH=1`
- `FOUNDATION_ALLOW_LOCALHOST=1`
- `DATABASE_IDENTITY_EXPECTED=moovex-platform-v7`

`node scripts/ci/v13-assert-db-isolation.cjs` must print `V13_CI_DB_ISOLATION_OK` before bootstrap. Foundation host checks allow localhost when `NODE_ENV=test` or `GETPRO_TEST_DB=1`, but they do not reject a legal-looking URL that names a different local database. The V13 script is the name gate.

## Migration and seed contract

The migrator discovers 221 SQL files, excluding Finder `* 2.sql` copies:

| Module | Files | Order |
| --- | ---: | --- |
| platform | 47 | 1 |
| blessboard | 130 | 2 |
| activeclinic | 42 | 3 |
| getpro | 1 | 4 |
| ngo | 1 | 5 |

Seeds, in filename order, are `001` through `011`. Duplicate `* 2.sql` seed files are ignored.

Bootstrap order inside `bootstrapFoundation`:

1. Refuse a missing URL, an invalid identity key, or a non-testing environment code.
2. Open a pool from `DATABASE_URL` and run `SELECT 1`.
3. Take advisory lock `824510017`.
4. Apply migrations. Each file is skipped when `platform.schema_migrations` already has the same module, version, and checksum. A checksum mismatch throws and stops the run. The first application is not safe to repeat outside that ledger.
5. Insert `platform.database_identity` for `moovex-platform-v7` and `testing`. A second run with the same key and environment returns `already_initialized`. A different key or environment is refused and is not overwritten.
6. Apply seeds through the same ledger. Seeds `007`, `008`, and `011` return immediately unless `environment_code` is `production`, so a testing bootstrap does not write the production catalogue.
7. Run foundation verification for schemas `platform`, `blessboard`, `activeclinic`, `getpro`, and `ngo`, the required platform tables, and the deployment catalogue.
8. Read migration status. Pending work or checksum drift fails the bootstrap.

Expected success output is JSON with `ok: true`, `environment_code` `testing`, `verify_ok: true`, pending `0`, and drift `0`. `npm run db:verify:foundation` is the separate read-only confirmation and also uses `DATABASE_URL`.

`npm run test:db:schema` is not part of this bootstrap. It applies `db/postgres/*.sql`, inserts canonical tenants, and accepts any database whose name contains `test` or `_ci`. The target name does not match that weaker rule unless `ALLOW_TEST_DB_RESET=true` is set. That flag must stay unset. Running the legacy script against the Foundation database would mix two schema trees.

`npm run church:db-identity:init -- --env testing --confirm` is a later browser-preparation step, not part of Foundation bootstrap. In test mode it reads `TEST_DATABASE_URL` only, applies the church schema, and refuses to replace a different church identity. It is destructive schema work and stays outside D11 until the Foundation database has passed verification.

## Isolation and teardown

PostgreSQL 16.2 is accepting connections on `127.0.0.1:5432` and listening on all IPv4 and IPv6 interfaces. This phase did not change that configuration.

Process-level isolation for a later run:

- Host in the connection string is `127.0.0.1`, `localhost`, or `::1`
- Database name is exactly `getpro_v13_e2e_regression213101`
- `GETPRO_DATABASE_URL` is unset
- Both write flags are required before a test pool factory runs
- The shell does not export a second URL

Container isolation is what the disabled CI job uses: a private Postgres 16 service, then a database created with `buildOwnedDatabaseName`. A local D11 run is not inside that container. The URL guard is the control that keeps it off production and off the other local databases. It does not close the server’s public listen socket.

Creation and teardown, for a later authorized shell, are limited to the quoted target name:

```sh
psql -h 127.0.0.1 -p 5432 -d postgres -v ON_ERROR_STOP=1 \
  -c 'CREATE DATABASE "getpro_v13_e2e_regression213101";'
```

```sh
psql -h 127.0.0.1 -p 5432 -d postgres -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE IF EXISTS "getpro_v13_e2e_regression213101";'
```

`CREATE DATABASE` fails if the name already exists. `DROP DATABASE` is destructive. Neither command was run.

## Fixture map

Foundation seeds create catalogue rows, not the 16 regression tenants. The HTTP runners create their own tenants after the schema exists and after the disposable URL guard. `buildV213RegressionFixturePlan()` records the intended shape and has no apply function. `provisionHostedAuthQaClinic` turns public booking on, so it must not be used for AC-PUB-01.

| Bug | What the authorized runner creates | What is still missing |
| --- | --- | --- |
| AC-AUTH-04 | Clinic admin and a testing password-reset outbox | Browser account env |
| AC-REG-01 | Two clinic registration posts | None beyond schema |
| AC-WEB-08 | Two clinics, a website instance, and a text section | Browser path registers its own clinic |
| AC-WEB-09 | Clinic website and theme `ac.family-wellness-mint` | Browser admin env |
| AC-REC-02 | A patient through the reception form | A walk-in service point. Clinic approval can create default departments, but no fixture inserts a service point |
| AC-REC-03 | A patient, encounter, and heart-rate observation | Clinical department membership for the registering admin is not guaranteed |
| AC-PUB-01 | A clinic whose booking stays disabled | Enabled booking and coupons do not exist |
| BB-AUTH-04 | A member and a testing OTP from `peekTestCode` | Browser member number and OTP env |
| BB-REG-07 | Two church registration posts | None beyond schema |
| BB-MEM-01 | HQ admin `church_hq_admin` and a member | Browser admin env |
| BB-MEM-02 | The real HQ shell and a paired CSRF cookie | Browser admin env |
| BB-WEB-08 | Church, website instance, theme `bb.community` | Public home path env |
| BB-WEB-09 | Draft and published sermons on two churches | Public sermon path env |
| BB-WEB-10 | Draft and published events on two churches | Public event path env |
| BB-ANN-01 | Draft and published announcements | Public announcement path env |
| BB-ANN-02 | A PNG upload, an HTML rejection, and an oversized rejection | Public attachment rendering still depends on the detail template |

OTP delivery stays on the test provider. Recovery stays in the testing outbox. No live SMS or email credentials are part of the plan.

## Later authorized sequence

These commands are for review. They were not run. Each stage stops on the condition below it.

A. Reverify guard and ownership. Set the environment block above. Run `node scripts/ci/v13-assert-db-isolation.cjs`. Stop unless the output is `V13_CI_DB_ISOLATION_OK`.

B. Create the isolated database with the quoted `CREATE DATABASE` statement. Run the isolation script again. Stop if any other name would be created.

C. Run `npm run db:bootstrap:foundation`, then `npm run db:verify:foundation`. Stop on a non-testing identity, checksum drift, pending migrations, or `verify_ok` other than true. Do not run `npm run test:db:schema`. Do not set `ALLOW_TEST_DB_RESET`.

D. Let the HTTP runners provision tenants. Do not call `provisionHostedAuthQaClinic`. Stop if a fixture path points at a URL the guard rejects.

E. Run the two D04 and D05 integration files with `--test-concurrency=1`. Both write flags must already be set. Stop and record `NOT_RUN` if either flag is missing. A skip is not a pass.

F. Set `GETPRO_V13_BROWSER_AUTHORIZED=1` only after C succeeded. BlessBoard uses port 4186 and `playwright.v13-bb-qa.config.cjs`. ActiveClinic uses port 4187 and `playwright.v13-ac-platform.config.cjs`. Church identity initialization is a separate decision before BlessBoard browser setup, because that setup expects a testing church identity. Stop if the browser flag, either write flag, or the local URL is missing.

G. Classify failures as product defects, missing service points, missing department membership, private announcement rendering, or harness gaps. Keep AC-PUB-01 partial.

H. Drop only `getpro_v13_e2e_regression213101`, and only after a separate teardown authorization and another passing isolation check. Stop if `GETPRO_V13_OWNED_DB_NAME` is any other name.

CI jobs that are `if: ${{ false }}` stay disabled.

## Validation

Safe contract and unit tests: 402 passed, 0 failed. Write flags were unset. Integration and browser suites were not started.

## Whether D11 can proceed

Explicit authorization is required and is not sufficient by itself. D11 can bootstrap this database only when stage A passes first, `DATABASE_URL` cannot point elsewhere, `GETPRO_DATABASE_URL` is unset, and `npm run test:db:schema` is left out. The all-interface PostgreSQL listen remains a residual risk. Missing service-point and department-membership fixtures can make AC-REC-02 and AC-REC-03 fail closed after a correct bootstrap; those results need classification, not a second schema tool.
