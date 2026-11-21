# V2.13.1 QA handoff

This is a QA candidate for tomorrow. It is not a production release.

Parent SHA `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. Branch `V13`. BlessBoard and ActiveClinic both read product version `2.13.1` from `src/platform/build/applicationBuildInfo.js`.

Safe tests: 441 passed, 0 failed. HTTP regressions: `NOT_RUN`. Browser regressions: `NOT_RUN`. Isolated PostgreSQL was not modified in this phase. Shared PostgreSQL was not contacted. `RELEASE_READY=NO`.

## What to run tomorrow

Use only the isolated instance:

- Host `127.0.0.1`
- Port `55432`
- Database `getpro_v13_e2e_regression213101`
- Role `v13_regression_213101`
- Data directory `.v13-isolated-pg/data` inside this worktree

Do not connect to port `5432`. Do not use the hosted QA clinic helper. It turns public booking on.

The cluster was left running as PID `42963`. If it is down, start it with the same `-D` data directory, `listen_addresses=127.0.0.1`, and port `55432`. Do not run `initdb` again and do not drop the database.

Set both database-write flags, the isolated-instance flag, and a fresh catalog snapshot before any HTTP run. Set browser authorization only for Playwright. Keep `GETPRO_DATABASE_URL` unset. The connection string must be `127.0.0.1:55432` and the disposable database name above.

HTTP runners live in:

- `tests/v13/integration/d04-critical-regression.integration.test.js`
- `tests/v13/integration/d05-regression.integration.test.js`

Playwright specs live in:

- `tests/e2e/v13/v13-ac-platform-qa.spec.js`
- `tests/e2e/v13/v13-bb-qa-regression.spec.js`

They are gated. With the flags unset they stay `NOT_RUN`. A `NOT_RUN` result is not a pass.

## Fixture notes

`applyActiveClinicFixtures` passes `publicBookingEnabled: false`. Do not call `provisionHostedAuthQaClinic`.

`v13-d25-reuse-clinic` is an expected matching-password identity reuse of clinic A. Leave it. Booking is false on every clinic. Service points store `accepts_scheduled = true`; that does not enable public booking.

BlessBoard public pages and structured drafts are still empty. The theme draft `bb.community` is on church A. A later fixture write must pass church A’s id through `buildBlessBoardWebsiteSectionFixture`. Do not insert a draft with a null `church_id`.

Enabled public booking and coupons are deferred. Do not add them during QA.

## Closeout rule

A bug moves to `VERIFIED_FIXED` only after its HTTP or browser assertion has actually run and passed on this isolated database. Until then every bug stays `IMPLEMENTED_UNVERIFIED`.
