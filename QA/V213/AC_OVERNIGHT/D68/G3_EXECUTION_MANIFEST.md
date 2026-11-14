# G3 execution manifest

This package was not executed. `GETPRO_V13_BROWSER_AUTHORIZED` is not `1`.

`tests/e2e/v13/v13-ac-platform-qa.spec.js` calls `hold()` unless all of these are already true:

- `GETPRO_V13_BROWSER_AUTHORIZED=1`
- `GETPRO_V13_ALLOW_DB_WRITES=1`
- `GETPRO_V13_DB_STAGES_AUTHORIZED=1`
- `E2E_DATABASE_URL` passes `assertV13CiDatabaseUrl`

`hold()` throws `NOT_RUN`. A thrown hold is not a passed journey. The Playwright config was not loaded.

The seven prepared journeys are administrator login, staff login, patient activation, a second booking in the same slot, receptionist billing denial, AC-05 lower privilege, and registration on the wrong clinic. The billing denial is not AC-05.

Stage C in `.github/workflows/v13-ac-qa-regression.yml` is `if: ${{ false }}`. It was not dispatched.

Collect the same SHA, run id, and testing identity as G2, plus the HTTP status and the response text check for each journey. Do not collect session cookies or passwords.
