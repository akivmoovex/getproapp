# G3 execution plan

Do not run this command. The browser flag is off, and loading `playwright.v13-ac-platform.config.cjs` throws when `E2E_DATABASE_URL` is empty.

When the database approvals and the browser approval exist, the command is:

```bash
export NODE_ENV=test DATABASE_IDENTITY_ENV=testing GETPRO_TEST_DB=1
export GETPRO_V13_ALLOW_DB_WRITES=1 GETPRO_V13_DB_STAGES_AUTHORIZED=1
export GETPRO_V13_BROWSER_AUTHORIZED=1
export GETPRO_V13_CI_RUN_ID=<8-to-64-chars>
export E2E_DATABASE_URL=postgresql://<local-user>@127.0.0.1:5432/getpro_v13_e2e_<runid>
export PLAYWRIGHT_E2E_PORT=4187
npx playwright test --config=playwright.v13-ac-platform.config.cjs
```

The config binds `http://127.0.0.1:4187` and matches only `v13-ac-platform-qa.spec.js`. Workers are 1. Traces are retained on failure under `test-results/v13-ac-platform`. Video is off.

`hold()` returns only when the browser flag, both write flags, and `assertV13CiDatabaseUrl(E2E_DATABASE_URL)` all succeed. The seven tests then require `E2E_AC_ADMIN_EMAIL`, `E2E_AC_ADMIN_PASSWORD`, `E2E_AC_STAFF_EMAIL`, `E2E_AC_STAFF_PASSWORD`, `E2E_AC_RECEPTIONIST_EMAIL`, `E2E_AC_RECEPTIONIST_PASSWORD`, `E2E_AC05_LOWER_EMAIL`, `E2E_AC05_LOWER_PASSWORD`, `E2E_AC_CLINIC_KEY`, `E2E_AC_OTHER_CLINIC_KEY`, `E2E_AC_PATIENT_NUMBER`, `E2E_AC_PATIENT_ID`, `E2E_AC_PATIENT_PHONE_NATIONAL`, and `E2E_AC_PATIENT_PASSWORD`.

AC-05 is a signed-in GET of `/admin/settings/test-database` by the lower-privilege account. A redirect to `/login` is not the denial. Those identities are not persisted today. The AC-05 plan is `persisted: false`.
