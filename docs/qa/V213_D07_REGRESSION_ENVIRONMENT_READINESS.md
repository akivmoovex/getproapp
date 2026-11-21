# V2.13.1 D07 — regression environment readiness

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. D04, D05, and D06 files were left in place. Supertest 7.2.2, Express 5.2.1, and Playwright 1.59.1 still load.

This phase did not create a database, run a migration or seed, install a browser, start Playwright, or execute a gated suite. The recorded safe baseline remains the D06 contract and unit run: 386 passed, 0 failed.

## Database readiness

PostgreSQL 16.2 is installed and accepting connections on `127.0.0.1:5432`. The server process also listens on all IPv4 and IPv6 interfaces. A local catalog read succeeded. Credentials are not recorded here.

The catalog contains 637 databases, owned by the local OS user or the `postgres` role. None match the V13 disposable pattern. The proposed name `getpro_v2131_regression_e2e_01` is not present and was not created.

The guard in `tests/v13/helpers/v13CiDatabaseGuard.js` accepts only:

`getpro_v13_(ci|bb_qa|int|e2e)_` plus 6–32 lowercase letters or digits.

It was exercised in process, without a connection, and rejected:

- `getpro_v2131_regression_e2e_01`
- a suffix shorter than 6 characters
- the database name `postgres`
- the database name `shared_qa`
- a non-local host
- a connection string containing a banned remote marker

A compliant example, `getpro_v13_e2e_d07ready01`, was accepted by the name check. The helper `buildOwnedDatabaseName(runId, "e2e"|"int")` is what the held CI stage uses to mint a name. The proposed name cannot be used until the guard is changed, and this phase does not change it.

Names that already exist and are refused by the exact-name rule include `postgres` and `blessboard_foundation_test`. Older `getpro_v7`, `getpro_v209`, `getpro_v210`, `getpro_v211`, and `getpro_v212` databases also fail the pattern. The HTTP runners and `hold()` call this guard before opening a pool. They cannot select those databases while the guard stays in front of the connection.

Required environment before any later authorized HTTP run:

- `DATABASE_URL` and `TEST_DATABASE_URL` pointing at localhost and an owned name
- `NODE_ENV=test`
- `DEPLOYMENT_ENV=testing`
- `DATABASE_IDENTITY_ENV=testing`
- `GETPRO_TEST_DB=1`
- `GETPRO_V13_CI_RUN_ID` of 8–64 safe characters
- both `GETPRO_V13_ALLOW_DB_WRITES=1` and `GETPRO_V13_DB_STAGES_AUTHORIZED=1`

Foundation bootstrap is `npm run db:bootstrap:foundation`, followed by `npm run db:verify:foundation`. It is not part of application startup. It requires `DATABASE_URL`, `DATABASE_IDENTITY_EXPECTED`, and `DATABASE_IDENTITY_ENV=testing`. Local use also requires `FOUNDATION_ALLOW_LOCALHOST=1`. The held CI stage runs `scripts/ci/v13-assert-db-isolation.cjs` before bootstrap and drops only `GETPRO_V13_OWNED_DB_NAME` afterward. No bootstrap or drop was run.

The HTTP suites do not seed a shared tenant. After schema bootstrap they create the clinic, church, patient, sermon, event, and announcement rows themselves. There is no separate seed step for those 16 scenarios.

## Browser readiness

Playwright 1.59.1 is installed. Its Chromium executable file is already present in the local Playwright cache. It was not launched, and no browser was installed in this phase. If the cache were missing, the procedure would be `npx playwright install chromium` for this package version.

BlessBoard browser config `playwright.v13-bb-qa.config.cjs`:

- Refuses to load without `E2E_DATABASE_URL`.
- Serves the app on `127.0.0.1:4186` through `scripts/ci/observe-blessboard-server.cjs`.
- Maps `*.local.test` and `local.test` to `127.0.0.1` inside Chromium.
- Sets `reuseExistingServer: false`.
- Does not point the base URL at a production host.

ActiveClinic browser config `playwright.v13-ac-platform.config.cjs`:

- Refuses to load without `E2E_DATABASE_URL`.
- Uses `http://127.0.0.1:4187`.
- Does not start a web server and does not install the `local.test` host rule.

Both specs call `hold()` before `page.goto`. `hold()` requires the browser flag, both database-write flags, and a disposable `E2E_DATABASE_URL`. The specs do not assign those flags and do not name a production host.

Isolation is not ready for an authorized browser run. The BlessBoard config’s `tests/e2e/global-setup.cjs` connects and applies the foundation schema before any test reaches `hold()`. That setup does not call `assertV13CiDatabaseUrl`. A mistaken `E2E_DATABASE_URL` could therefore reach an existing local database before the per-test guard. The ActiveClinic config has no isolated server of its own. The PostgreSQL process is not bound to loopback only.

## Fixture inventory

HTTP runners build their own data after the schema exists. Browser scenarios mostly expect a harness to supply accounts and public URLs. Nothing was inserted.

| Bug | HTTP fixture created by the runner | Browser fixture still required | Gap |
| --- | --- | --- | --- |
| AC-AUTH-04 | Clinic admin and testing password-reset outbox | `E2E_AC_ADMIN_EMAIL` | Browser account is not provisioned |
| AC-REG-01 | Two clinic registrations in the test | None beyond the registration form | Ready once schema exists |
| AC-WEB-08 | Two clinics, website instance, text section | Browser path registers its own clinic | Service depends on website provisioning during registration |
| AC-WEB-09 | Clinic website and theme `ac.family-wellness-mint` | `E2E_AC_ADMIN_EMAIL` and password | Browser account is not provisioned |
| AC-REC-02 | Patient and a facility service point | `E2E_AC_ADMIN_EMAIL` and password | Registering admin may lack the reception department. No service-point fixture is guaranteed |
| AC-REC-03 | Patient, encounter, heart-rate observation | `E2E_AC_ADMIN_EMAIL`, password, and a patient id read after authorization | Registering admin may lack the clinical department |
| AC-PUB-01 | Fresh clinic with booking left disabled | Browser path registers its own clinic | Enabled booking and coupons do not exist |
| BB-AUTH-04 | Member, testing OTP from `peekTestCode` | `E2E_BB_MEMBER_NUMBER`, `E2E_BB_MEMBER_OTP` | Browser OTP must come from the harness, not the page |
| BB-REG-07 | Two church registration posts | None beyond the registration form | Ready once schema exists |
| BB-MEM-01 | HQ admin and member form | `E2E_BB_ADMIN_EMAIL` and password | Browser church admin is not provisioned |
| BB-MEM-02 | Paired CSRF cookie and field on the real shell | `E2E_BB_ADMIN_EMAIL` and password | Browser church admin is not provisioned |
| BB-WEB-08 | Church, website instance, theme `bb.community` | Admin login and `E2E_BB_PUBLIC_HOME_PATH` | Public hostname fixture is not provisioned |
| BB-WEB-09 | Draft and published sermon on two churches | Admin login, `E2E_BB_PUBLIC_SERMONS_PATH`, `E2E_BB_OTHER_PUBLIC_SERMONS_PATH` | Public hostname fixtures are not provisioned |
| BB-WEB-10 | Draft and published event on two churches | Admin login, `E2E_BB_PUBLIC_EVENTS_PATH`, `E2E_BB_OTHER_PUBLIC_EVENTS_PATH` | Public hostname fixtures are not provisioned |
| BB-ANN-01 | Draft and published announcement | Admin login and both public announcement paths | Public hostname fixtures are not provisioned |
| BB-ANN-02 | PNG upload, HTML rejection, oversized rejection | Admin login and both public announcement paths | Public attachment rendering still depends on the detail template |

The foundation browser setup creates a `public.admin_users` super-admin. That is not the BlessBoard HQ user or the ActiveClinic clinic admin used by these 16 scenarios.

## Missing infrastructure

- No database whose name the V13 guard accepts.
- The requested database name is rejected by that guard.
- Foundation bootstrap has not been run.
- PostgreSQL is listening beyond loopback.
- BlessBoard Playwright setup connects before the V13 guard.
- ActiveClinic Playwright has no localhost web server.
- Browser account, OTP, invite, and public-path fixtures are absent.
- Enabled booking and coupon behavior are not product features.

## Execution sequence

CI workflows `v13-bb-qa-regression.yml`, `v13-ac-qa-regression.yml`, and `v13-platform-qa-regression.yml` remain `workflow_dispatch` only. Their database and browser jobs stay `if: ${{ false }}`. Workflow environment defaults keep both write flags at `0`. This plan does not enable those jobs.

Stage A — safe contract and unit tests. Authorization: none. Command remains `node --test --test-concurrency=1 tests/v13/contract/*.test.js tests/v13/unit/*.test.js`. No database and no browser. Baseline already recorded as 386 passed.

Stage B — disposable PostgreSQL and HTTP tests. Authorization required before any command: a newly created database named by `buildOwnedDatabaseName`, localhost only, the identity and test flags above, and both write flags. Then `node scripts/ci/v13-assert-db-isolation.cjs`, `npm run db:bootstrap:foundation`, `npm run db:verify:foundation`, and `node --test --test-concurrency=1 tests/v13/integration/d04-critical-regression.integration.test.js tests/v13/integration/d05-regression.integration.test.js`. Teardown drops only that owned database. Do not point this stage at `postgres`, `blessboard_foundation_test`, or any existing rehearsal database.

Stage C — Playwright. Authorization required: Stage B’s disposable database in `E2E_DATABASE_URL`, both write flags, and `GETPRO_V13_BROWSER_AUTHORIZED=1`. BlessBoard uses port 4186. ActiveClinic needs a localhost server on port 4187. Do not start Stage C until its setup calls the same disposable-database guard before connecting. Do not install or launch browsers until that approval exists.

Stage D — failure classification. Authorization: the Stage B and Stage C outputs. Separate product failures from missing reception or clinical department membership, missing service points, and private announcement files that the public template does not render. Do not treat a skipped or unrun suite as a pass.

Stage E — final coverage report. Authorization: completed Stage B and Stage C evidence. Record implemented coverage separately from executed passes. Keep AC-PUB-01 partial.

## Approval required before any later execution

- Approval to create one new database with a guard-legal `getpro_v13_e2e_` or `getpro_v13_int_` name. The name `getpro_v2131_regression_e2e_01` is not legal.
- Approval to set both database-write flags for that database only.
- Approval to run foundation bootstrap and verification against that database only.
- Approval to set `GETPRO_V13_BROWSER_AUTHORIZED=1` after the Playwright setup is guarded.
- No approval is requested or given for production access, live SMS, live email, shared-tenant edits, CI activation, or enabled booking and coupons.

## Security checks

Production hosts and banned remote markers are rejected by the V13 URL guard. The testing OTP provider refuses `DEPLOYMENT_ENV=production`. The D04 and D05 runners remove Resend, Twilio, and Infobip credentials from the app environment they construct and do not set `BLESSBOARD_OTP_EXPOSE_TEST_CODE`. Browser specs use localhost and `local.test`, not production origins. No authorization or CSRF rule was changed. The remaining accidental-access risk is the unguarded BlessBoard Playwright global setup combined with a PostgreSQL server that listens on every interface.

## Sixteen scenarios

AC-AUTH-04, AC-REG-01, AC-WEB-08, AC-WEB-09, AC-REC-02, AC-REC-03, AC-PUB-01, BB-AUTH-04, BB-REG-07, BB-MEM-01, BB-MEM-02, BB-WEB-08, BB-WEB-09, BB-WEB-10, BB-ANN-01, BB-ANN-02.

Fifteen have complete test implementations. AC-PUB-01 is partial. None were executed.

## Remaining release blockers

- No guard-legal disposable database exists, and the requested name is rejected.
- Foundation bootstrap has not been approved or run.
- PostgreSQL listens beyond loopback.
- BlessBoard browser setup can connect before the V13 guard.
- ActiveClinic browser execution has no isolated web server.
- Browser fixtures for staff, members, OTP, and public paths are absent.
- Clinic reception and clinical department membership, and walk-in service points, are not established fixtures.
- Enabled public booking and coupons are unimplemented.
- CI database and browser stages remain disabled.
