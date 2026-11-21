# V2.13.1 D08 — regression isolation hardening

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. The D04–D07 tests and QA reports are still present. No database was created, no migration or seed ran, and Playwright was not executed.

## Database guard verification

The approved pattern is unchanged:

`^getpro_v13_(ci|bb_qa|int|e2e)_[a-z0-9]{6,32}$`

The complete name `getpro_v13_e2e_regression_2131_01` starts with the approved prefix and is still rejected. Its suffix, `regression_2131_01`, contains underscores. The pattern allows only 6–32 lowercase letters or digits after `getpro_v13_e2e_`. A prefix check is not treated as acceptance. The name was not created.

The harness now requires, before any pool factory runs:

- `E2E_DATABASE_URL` or `TEST_DATABASE_URL` on `127.0.0.1`, `localhost`, or `::1`
- the complete disposable-name pattern
- `GETPRO_V13_OWNED_DB_NAME`, when set, equal to that database name
- `NODE_ENV=test`, `DEPLOYMENT_ENV=testing`, `DATABASE_IDENTITY_ENV=testing`, `GETPRO_TEST_DB=1`, and a valid `GETPRO_V13_CI_RUN_ID`
- both `GETPRO_V13_ALLOW_DB_WRITES=1` and `GETPRO_V13_DB_STAGES_AUTHORIZED=1`

Empty, malformed, remote, production-marked, and shared names (`postgres`, `shared_qa`, `blessboard_foundation_test`) are rejected. `DATABASE_URL` is not a credential source. A set `GETPRO_DATABASE_URL` is rejected rather than inherited. Contract tests pass a pool factory that records whether it was called; unauthorized and unsafe targets leave that factory uncalled.

## Browser setup ordering

`playwright.v13-bb-qa.config.cjs` calls the same guard while the config loads, before `webServer` exists. Its setup entry is `tests/e2e/v13/v13-bb-global-setup.cjs`. That wrapper calls `assertV13BrowserHarness` and only then loads `tests/e2e/global-setup.cjs`. Teardown uses the same order. An unauthorized call does not load the file that constructs the pool.

The shared foundation setup is unchanged and is no longer the V13 BlessBoard entrypoint. Browser navigation still stops in `hold()` with `NOT_RUN` until the browser flag and both write flags are present. Once those flags are present, an unsafe database target throws instead of continuing.

## ActiveClinic local server

`playwright.v13-ac-platform.config.cjs` now has a localhost web server definition. The base URL is `http://127.0.0.1` on port `4187`, or another port in `4100–4999`. BlessBoard remains on `4186` in that same range. Both configs set `reuseExistingServer: false` and start through `scripts/ci/observe-v13-local-server.cjs`.

That launcher exits before loading `observe-blessboard-server.cjs` unless the guard has accepted the environment and `HOST` is `127.0.0.1` on the approved port. Loading either Playwright config, or the launcher, without authorization exits before a listen. Neither was started in this phase.

## External network protections

Both products keep the existing Chromium rule that maps `*.local.test` and `local.test` to `127.0.0.1`. Each test installs a route that continues only for `http` requests to `127.0.0.1`, `localhost`, `::1`, or `local.test` on the approved port. Other destinations, including `https://blessboard.com` and `activeclinic.pronline.org`, are aborted. New ActiveClinic contexts are created with an empty cookie jar and the same local base URL. The server environment forces the test OTP provider, removes provider API keys, and does not copy `GETPRO_DATABASE_URL`.

## Fixture readiness

`buildV213RegressionFixturePlan()` defines the future records and does not insert them:

- BlessBoard church, headquarters branch, `church_hq_admin`, and member
- ActiveClinic clinic, staff, receptionist, and patient
- reception and clinical departments, plus a walk-in service that requires a service point
- themes `bb.community` and `ac.family-wellness-mint`, and a home website section
- draft sermon, event, and announcement with a testing-only PNG attachment
- testing OTP through `peekTestCode`, with the code kept off the page
- password recovery through the testing outbox, with live email left off
- public paths `/`, `/announcements`, `/sermons`, `/events`, `/clinics/:key/book`, and `/clinics/:key/patient/register`

Applying those rows still requires an authorized disposable database. The plan does not supply live department membership or a service-point row.

## PostgreSQL listening interface

PostgreSQL 16.2 was already accepting local connections and listening on all interfaces. This phase did not change `postgresql.conf`, restart the server, or open a connection. The harness rejects non-local connection-string hosts. That does not move the server socket back to loopback.

## Safe validation

Syntax checks passed for the guard, browser helper, Playwright configs, setup wrappers, and local-server launcher.

Contract and unit tests: 399 passed, 0 failed. That includes the previous 386 and the new guard, browser, and fixture-definition tests.

D04 and D05 HTTP tests, with database authorization unset: 16 skipped, 0 failed. Each diagnostic is `V13_RESULT=NOT_RUN`.

Static discovery found every BlessBoard and ActiveClinic browser test calling `hold()` before `page.goto`. Playwright was not launched.

## Permissions required before execution

- Approval to create one new database whose complete name matches the existing pattern. `getpro_v13_e2e_regression_2131_01` is not that name.
- `E2E_DATABASE_URL` and `TEST_DATABASE_URL` set to that localhost database, with `DATABASE_URL` either equal to it or unset.
- `GETPRO_DATABASE_URL` unset.
- `NODE_ENV=test`, `DEPLOYMENT_ENV=testing`, `DATABASE_IDENTITY_ENV=testing`, `GETPRO_TEST_DB=1`, and `GETPRO_V13_CI_RUN_ID`.
- Both database-write flags for HTTP and browser stages.
- `GETPRO_V13_BROWSER_AUTHORIZED=1` before Playwright. The disabled CI stage does not set this flag.
- Foundation bootstrap and verification against that database only, then a drop of only that owned name.
- `BLESSBOARD_OTP_PROVIDER=test`, with no Resend, Twilio, or Infobip credentials.

CI workflow jobs that are `if: ${{ false }}` were not enabled.

## Remaining blockers

- The requested database name is outside the approved suffix pattern.
- No guard-legal disposable database exists, and foundation bootstrap has not run.
- PostgreSQL still listens beyond loopback.
- Fixture definitions are not loaded records. Reception, clinical, and walk-in service points still have to be created in an authorized run.
- Enabled public booking and coupons remain out of product scope for AC-PUB-01.
- HTTP and browser suites have not been executed.
- The disabled browser CI stage does not yet carry `GETPRO_V13_BROWSER_AUTHORIZED=1`.
