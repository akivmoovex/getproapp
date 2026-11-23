# V13 G77 isolated test preflight

No database mutation was performed. Migrations were not applied. HTTP and Playwright were not run. G78 was not started.

## Verified environment

| Check | Result |
| --- | --- |
| Worktree | `/Users/akivsolomon/Development/getproapp-v13` |
| Branch | `V13` |
| HEAD | `c1646e074fb7e7b3a342d76688f2107eff52ae59` |
| origin/V13 after fetch | `c1646e074fb7e7b3a342d76688f2107eff52ae59` |
| Fast-forward | Not required. Local HEAD is the remote tip. |
| Local main | `44eafec486a18aeef2777bbcc9683e43f68ebe0d`, not modified |
| Worktree | Clean except untracked `docs/qa/V2131_GAP_G08_FINAL_REPORT.md`, which was left in place |

## Isolated PostgreSQL

The previous instance is present on this laptop. It was inspected with read-only transactions. Port 5432 is listening as a separate PostgreSQL process and was not contacted.

| Item | Observed |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `55432` |
| Instance id / cluster name | `v13-regression-213101` |
| Postmaster | PID `42963`, binary `/Applications/Postgres.app/Contents/Versions/16/bin/postgres` |
| Version | PostgreSQL 16.9 (Postgres.app), aarch64 |
| Data directory | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/data` |
| Socket directory | `/Users/akivsolomon/Development/getproapp-v13/.v13-isolated-pg/run` |
| Config and HBA | Inside that data directory |
| Listen addresses | `127.0.0.1` |
| Data and socket paths | Real directories under the worktree, not symlinks |
| HBA | SCRAM for `v13_isolated_bootstrap` and `v13_regression_213101` on `127.0.0.1` only. No `trust` rule. |
| Application role | `v13_regression_213101`: login true; superuser, createdb, createrole, replication, bypassrls, and inherit all false; no memberships |
| Bootstrap role | `v13_isolated_bootstrap`: superuser on this data directory only |
| Databases | `getpro_v13_e2e_regression213101`, plus `postgres`, `template0`, and `template1` |
| Application-role connect | True only for `getpro_v13_e2e_regression213101` |
| Identity | `moovex-platform-v7` / `testing` / `getpro_v13_e2e_regression213101` |
| Ledger | 221 product rows and 11 seed rows. ActiveClinic stops at `042_patient_visit_summary_releases.sql` |
| Public booking | Default `false`. Zero healthcare organisations have it enabled. |
| BlessBoard pages | `public_pages=0`, `website_structured_drafts=0` |

`getpro_v13_e2e_regression213101` was not modified. The read-only sessions ended with `ROLLBACK`.

## Proposed disposable database

Proposed name: `getpro_v13_e2e_g77http01`

It matches the disposable-name pattern and does not exist. It was not created. The regression role cannot create a database. The current isolated launch gate accepts only `getpro_v13_e2e_regression213101`, so Playwright and bootstrap checks would reject the proposed name. The HTTP disposable-name guard would accept it, but that guard does not by itself require port `55432`.

Eligible server for a later, separately authorized database: `127.0.0.1:55432`, cluster `v13-regression-213101`. No other PostgreSQL server is an acceptable substitute.

## Migrations

Disk order for the new ActiveClinic files is `042`, then `043_record_migration_inventory.sql`, then `044_laboratory_reference_rules.sql`. The repository has 223 migration files. The ledger has the older 221 product files. `043` and `044` are absent from `platform.schema_migrations`, and both new tables are absent.

`043` creates record-migration batches, files, retention categories, and retention holds. `044` creates `laboratory_reference_rules` and inserts no threshold. Both reference organisation, facility, and staff tables that already exist. Neither changes patients or encounters. There is no name collision with the current schema. Foundation bootstrap has already initialized this database and must not be run again.

Current HTTP journeys do not need `043` or `044`. The authorized G66 runner reads `to_regclass` for both tables and fails with `MIGRATION_PENDING` while they are absent. It does not create them.

## Test guards

Database-free contract and unit tests do not open a database. They remain the only safe command:

`node --test --test-concurrency=1 --test-timeout=30000 tests/v13/contract/*.test.js tests/v13/unit/*.test.js`

Every file in `tests/v13/integration/` calls `runGated` or the same write gate. Without both `GETPRO_V13_ALLOW_DB_WRITES=1` and `GETPRO_V13_DB_STAGES_AUTHORIZED=1`, those tests skip as `NOT_RUN`. With the flags, D04, D05, BlessBoard, invitation, portal, appointment, laboratory, pharmacy, and records runners write synthetic rows. G66 is a read of catalog names behind the same write gate.

Playwright configs call `assertV13BrowserHarness` at load. Each test calls `hold()` before navigation. Browser execution also needs `GETPRO_V13_BROWSER_AUTHORIZED=1`, `GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED=1`, the isolated data-directory and role snapshot, `DATABASE_IDENTITY_ENV=testing`, `DEPLOYMENT_ENV=testing`, `NODE_ENV=test`, `GETPRO_TEST_DB=1`, and a local `http://127.0.0.1` port in `4100-4999`. ActiveClinic uses `playwright.v13-ac-platform.config.cjs` and port fallback `4187`. BlessBoard uses `playwright.v13-bb-qa.config.cjs` and port fallback `4186`. No guard was changed.

## Command inventory, not executed

HTTP, all writing except the noted G66 read:

- `node --test tests/v13/integration/d04-critical-regression.integration.test.js`
- `node --test tests/v13/integration/d05-regression.integration.test.js`
- `node --test tests/v13/integration/d14c-otp-auth.integration.test.js`
- `node --test tests/v13/integration/d16-ac-auth.integration.test.js`
- `node --test tests/v13/integration/d16-platform-otp.integration.test.js`
- `node --test tests/v13/integration/d24-patient-portal.integration.test.js`
- `node --test tests/v13/integration/d25-appointment-concurrency.integration.test.js`
- `node --test tests/v13/integration/inv01-staff-invitation.integration.test.js`
- `node --test tests/v13/integration/bb01-homepage-sections.integration.test.js`
- `node --test tests/v13/integration/bb02-announcements.integration.test.js`
- `node --test tests/v13/integration/bb03-events.integration.test.js`
- `node --test tests/v13/integration/bb04-sermons.integration.test.js`
- `node --test tests/v13/integration/bb05-member-registration.integration.test.js`
- `node --test tests/v13/integration/bb06-member-activation.integration.test.js`
- `node --test tests/v13/integration/bb24-public-directory.integration.test.js`
- `node --test tests/v13/integration/g03-laboratory.integration.test.js`
- `node --test tests/v13/integration/g04-pharmacy-billing.integration.test.js`
- `node --test tests/v13/integration/g05-records.integration.test.js`
- `node --test tests/v13/integration/g66-reference-rules.integration.test.js`

Playwright:

- `npx playwright test --config=playwright.v13-ac-platform.config.cjs`
- `npx playwright test --config=playwright.v13-bb-qa.config.cjs`

## Risks

- An authorized browser run against the current gate would write to `getpro_v13_e2e_regression213101`.
- The HTTP URL guard can accept a disposable name on port `5432`. The execution command must name `127.0.0.1:55432` explicitly.
- Applying `043` or `044`, or rerunning foundation bootstrap, on the existing database would mutate the D25 database.
- BlessBoard homepage and public-directory HTTP still need public-page rows. Those rows are absent.
- G66 cannot pass on this database until `043` and `044` exist.

## Blockers

`DISPOSABLE_DB_READINESS=NOT_READY`

There is no separate disposable database. The regression role cannot create one. The isolated target gate names only the existing D25 database, and that database must stay unchanged. Public-page fixtures are absent. Migrations `043` and `044` are not applied. No HTTP or browser authorization flag was set.

`NEXT_ACTION` is a separate authorization to create `getpro_v13_e2e_g77http01` on `127.0.0.1:55432` without changing `getpro_v13_e2e_regression213101`, and to point the isolated target gate at that new database before any HTTP or Playwright run. G78 is not authorized by this preflight.
