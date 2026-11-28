# V2134 G325 final test execution

Database: `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301` only. No other database was opened. No test was skipped. Earlier locator failures in the new website test were fixed before the recorded ActiveClinic pair. Those red runs are not counted as passes.

The last source edit added the service and doctor image uploads to the ActiveClinic browser spec. Product code was not changed. After that edit, the contract suite, the HTTP suite, and the ActiveClinic browser suite were each run twice. BlessBoard, both OTP browser suites, and the Community Benefits mock browser had already run twice against the same product source. They do not load the changed spec.

| Suite | Run 1 | Run 2 | Skipped |
| --- | --- | --- | --- |
| `npm run test:v13:contract` | 682 pass, 0 fail | 682 pass, 0 fail | 0 |
| HTTP and PostgreSQL, `.v13-isolated-pg/g79-run.cjs` | 41 pass, 0 fail | 41 pass, 0 fail | 0 |
| ActiveClinic Playwright, 36 tests | 36 pass | 36 pass | 0 |
| BlessBoard Playwright | 23 pass | 23 pass | 0 |
| ActiveClinic email OTP Playwright | 9 pass | 9 pass | 0 |
| BlessBoard member-login OTP Playwright | 10 pass | 10 pass | 0 |
| Community Benefits mock browser | 9 pass | 9 pass | 0 |

Security-negative coverage is inside the contract suite and the HTTP suite: wrong-password sign-in, cross-clinic denial, public booking 403, OTP production activation blocked, and Resend fail-closed. No separate suite was invented.

Appointment Option C passed inside both HTTP runs: assigned-staff non-overlap is the capacity rule. No slot-capacity integer was added.

Community Benefits PostgreSQL persistence passed inside both HTTP runs. `financialPostingEnabled()` stayed false. The mock browser is not that PostgreSQL result and is not a payment posting.

Public booking stayed disabled in AC-PUB-01 on both HTTP runs. SMS was not sent. No live email was sent. Migration 048 was not created.

## ActiveClinic evidence pair

The recorded browser pair is the two 36-pass runs after the final spec. It includes:

- G325 workspace prompt, including the foreign organization refusal and clinic B.
- G325 website upload, draft, publish, About, Welcome, service, doctor, contact, location, and hours.
- G168 follow-up text saved, reloaded, and stored on `follow_up_plan_text`.
- The previously passing portal, laboratory, radiology, and print journeys.

## Portal

Staff-created charts, one-account activation, testing-mode recovery, duplicate-account refusal, and clinic binding stayed as they were. Unmatched public registration still creates no patient.
