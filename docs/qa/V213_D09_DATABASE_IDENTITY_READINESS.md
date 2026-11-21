# V2.13.1 D09 — database identity readiness

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. D04–D08 files are intact. The database guard expression was not changed. No database was created and no bootstrap command was run.

## Validated database name

`getpro_v13_e2e_regression213101`

The live guard is:

`^getpro_v13_(ci|bb_qa|int|e2e)_[a-z0-9]{6,32}$`

`assertOwnedDisposableDatabaseName` accepted the whole string. The checks were:

- Prefix `getpro_v13_e2e_`
- Suffix `regression213101`
- Suffix length 16, inside 6–32
- Suffix is lowercase letters and digits, with no underscore
- The anchored expression rejects the prefix alone
- `assertV13CiDatabaseUrl` accepts `127.0.0.1` and requires the database name to equal `GETPRO_V13_OWNED_DB_NAME`
- `assertHarnessDatabaseTarget` returns that same database and hostname

The earlier name `getpro_v13_e2e_regression_2131_01` stays rejected because of the underscores. The synthetic fixture plan now records the accepted name and still does not insert rows.

## Negative guard results

Mocked contract tests rejected every unsafe case before a pool factory or browser setup loader ran:

- Production and shared names, including `production`, `prod`, `postgres`, `shared_qa`, `blessboard_foundation_test`, and `getpro_ci`
- Invalid prefixes `getpro_v2131_e2e_…` and `getpro_v13_qa_…`
- A suffix containing an underscore
- Suffixes shorter than 6 and longer than 32
- A remote host, including a production-marked host
- A missing disposable URL, including a `DATABASE_URL` left as the only candidate
- Either database-write flag missing
- Browser authorization missing

The BlessBoard setup source still calls the guard before `require("../global-setup.cjs")`. Unauthorized setup does not load that module.

## Foundation bootstrap requirements

The next authorized phase, and only that phase, can use this order. It was not executed.

1. Create only `getpro_v13_e2e_regression213101` on `127.0.0.1`.
2. Set `E2E_DATABASE_URL` and `TEST_DATABASE_URL` to that database. Set `DATABASE_URL` to the same value or leave it unset. Leave `GETPRO_DATABASE_URL` unset. Set `GETPRO_V13_OWNED_DB_NAME` to the same database name.
3. Set `NODE_ENV=test`, `DEPLOYMENT_ENV=testing`, `DATABASE_IDENTITY_ENV=testing`, `GETPRO_TEST_DB=1`, `GETPRO_V13_CI_RUN_ID`, both write flags, and `FOUNDATION_ALLOW_LOCALHOST=1`.
4. Run `node scripts/ci/v13-assert-db-isolation.cjs`. The expected line is `V13_CI_DB_ISOLATION_OK`.
5. Run `npm run db:bootstrap:foundation` with `DATABASE_IDENTITY_EXPECTED=moovex-platform-v7`. Foundation bootstrap opens its pool only after its own input check. It does not apply the V13 name guard, so step 4 has to pass first.
6. Bootstrap order is migrations, then database identity, then seeds. Migration modules run `platform`, `blessboard`, `activeclinic`, `getpro`, then `ngo`. Seeds `007`, `008`, and `011` are production-gated and no-op until identity exists, which is why seeds follow identity.
7. Run `npm run db:verify:foundation`. The bootstrap result must report `ok: true`, `environment_code` `testing`, `verify_ok: true`, and migration status with pending `0` and drift `0`.
8. The disabled browser stage also runs `npm run test:db:schema` and `npm run church:db-identity:init -- --env testing --confirm`. Those remain part of the later authorized browser preparation, not this phase.
9. Provision fixtures only after verification: BlessBoard church, branch, administrator, and member; ActiveClinic clinic, staff, receptionist, patient, reception department, clinical department, and walk-in service point; themes, website sections, sermon, event, and announcement. OTP stays on the test provider. Recovery stays in the testing outbox.
10. Teardown drops only `GETPRO_V13_OWNED_DB_NAME` after the guard accepts that name again. It must not drop `postgres`, `blessboard_foundation_test`, or any other existing database.

## Browser readiness

BlessBoard setup still guards before the connection-opening module. ActiveClinic still targets `http://127.0.0.1` on port `4187`, through the guarded local launcher. BlessBoard remains on port `4186`. Both specs keep local-only routes and `hold()` before navigation. No Chromium process and no application server were started.

Synthetic fixture definitions are ready. They are not loaded records. Reception membership, clinical membership, and a walk-in service point still have to be created during the authorized provisioning step. AC-PUB-01 still covers disabled booking only.

## Authorization required before execution

- Permission to create and later drop only `getpro_v13_e2e_regression213101`
- Both database-write flags
- `GETPRO_V13_BROWSER_AUTHORIZED=1` before Playwright
- `BLESSBOARD_OTP_PROVIDER=test`, with no live SMS or email credentials
- No change to the disabled CI jobs

## Validation

Safe contract and unit tests: 402 passed, 0 failed. The 16 HTTP regressions, with write flags unset, were 16 skipped and 0 failed. Each diagnostic was `V13_RESULT=NOT_RUN`.

## Remaining blockers

- The validated database has not been created.
- Foundation bootstrap, migrations, seeds, and verification have not run.
- PostgreSQL still listens on all interfaces. The harness rejects non-local connection strings, and this phase did not change the server configuration.
- Fixture rows, departments, and service points are not in a database.
- Enabled booking and coupons remain out of scope.
- HTTP and browser suites have not executed.
- CI database and browser stages remain `if: ${{ false }}`.
