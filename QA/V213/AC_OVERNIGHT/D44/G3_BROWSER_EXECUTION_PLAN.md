# G3 browser execution plan

No browser was opened. `GETPRO_V13_BROWSER_AUTHORIZED` is `0`. `E2E_DATABASE_URL` is unset.

`tests/e2e/v13/v13-ac-platform-qa.spec.js` calls `hold()` unless all of these are true: the browser flag is `1`, both database write flags are `1`, and `E2E_DATABASE_URL` passes `assertV13CiDatabaseUrl`. `hold()` records `NOT_RUN` and throws. It is not a pass.

Prepared ActiveClinic journeys, still held:

| Test | What it would do |
|---|---|
| AC administrator login | Sign in through `form[data-ac-login-form]` |
| AC staff login | Same form, staff identity |
| AC patient activation | Register and confirm no session cookie from registration |
| AC appointment conflict | Submit a colliding staff slot and expect conflict text |
| Billing denial | Receptionist `GET /app/billing` is 401 or 403, and a post does not show an invoice form |
| AC-05 | Lower-privilege user receives 403 on both test-database routes |
| PAT-01 | Registration on the other clinic key does not create the first clinic’s patient |

BlessBoard’s 14 journeys in `v13-bb-qa-regression.spec.js` use the same hold. They were not run.

Start the application only against the run-owned local database from the G2 plan. Do not point Playwright at a hosted host.
