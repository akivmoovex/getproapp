# V13 G81 verified bug fixes

A fix is listed here only when a later test assertion passed, or when a unit/contract test passed for the change itself. Playwright journeys that still fail are in `V13_G81_REMAINING_FAILURES.md`.

## G80-BOOT-01 — V13 server rejected the disposable database

The browser server exited because `public.church_database_identity` is absent on `getpro_v13_e2e_g78d2301`. `verifyDatabaseIdentity` now accepts `platform.database_identity` when `environment_code` matches the deployment environment and `database_name` equals `current_database()`. A mismatched database name stays fatal.

Regression: `tests/church-database-identity.test.js` (platform identity match, and a mismatched current database stays fatal). The file run was 21 passed, 2 skipped (those two need a configured PostgreSQL and were not pointed at the old QA database).

## G80-BOOT-02 — testing profile refused local.test

`buildLocalServerEnv` sets the browser host fields to `local.test`. The testing profile expected `pronline.org` and refused to start. `validateAuthoritativeProfileCompatibility` now allows `local.test`, `*.local.test`, and `127.0.0.1` only when the profile environment is `testing`, `NODE_ENV=test`, `HOST=127.0.0.1`, and `GETPRO_V13_BROWSER_AUTHORIZED=1`. `blessboard.com` and `HOST=0.0.0.0` still fail that test.

Regression: `tests/v8-hostinger-env-profile-conflict.test.js` “allows local.test only for an authorized localhost browser test” passed.

After both boot fixes, ActiveClinic `/login` returned the ActiveClinic sign-in form and `/healthz` returned 200 on `127.0.0.1:4187`.

## G80-ISO-01 — BlessBoard setup would apply the legacy church schema

`tests/e2e/global-setup.cjs` calls `ensureChurchSchema`. The V13 BlessBoard setup and teardown now return before that loader when `GETPRO_V13_SKIP_LEGACY_CHURCH_SCHEMA=1`. Unauthorized runs still fail before any connection module loads.

Regression: `tests/v13/contract/d08-isolation-hardening.test.js` passed for the skip path. The BlessBoard Playwright run completed without applying the legacy schema.

## G81-AC-STAFF-01 — receptionist and clinician had no login identity

`clinical-a@v13d19.example` and `reception-a@v13d19.example` existed as staff rows with `platform_identity_id` null, so sign-in stayed on `/login`. New fixture staff now get an active platform identity and a link through `linkStaffMemberToIdentity`. The two existing G78 rows were linked on the disposable database only.

Regression: `tests/v13/unit/d19-synthetic-fixtures.test.js` asserts the fixture source creates those identities with the synthetic password. Playwright then passed staff login, G13, G05, G04, G03, the billing denial, and G67 (clinician prescription screen).

## G81-AC-PORTAL-01 — patient portal hid unpublished clinics

`resolvePublishableClinicByKey` requires `website_published`. Both original clinics were unpublished, so `/clinics/v13-d19-clinic-a/patient/register` was “Page not found”. The disposable rows were published with `public_booking_enabled` left false. A post-run query still showed `booking_enabled=0`.

Playwright then passed patient portal activation, PAT-01, and AC-PUB-01 (booking stays disabled, no coupon).

## G81-AC-FLOW-01 — appointment review and patient wizard

The appointment form’s first submit opens “Review appointment”. The patient form starts on “Find existing patient”. The tests now complete Confirm booking, and patient registration uses “None of these”, Review, and Create patient. The scoped submit locator no longer matches the shell Sign out buttons.

Playwright then passed the appointment collision journey and AC-REC-02.

## Harness fixes that unblocked the passed journeys

These are test harness changes, not product policy changes:

- Session secret supplied to the browser server is at least 32 characters. Shorter values made `POST /register-clinic` return 500.
- Password-reset replay no longer leaves the shared administrator on the replacement password. `afterEach` restores the synthetic password. Later tests in the 15-pass run could sign in again.
- AC-05 accepts 404 as well as 403 when the body does not contain “Test Database Management”. On the ActiveClinic host the platform-admin route is not mounted. The preview request was not 401. The test passed.

No CSRF check was removed. No OTP challenge table was added. No slot-capacity lock was implemented. Media uploads stayed disabled.
