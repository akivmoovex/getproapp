# V2.13.2 G129 — full regression

Runs are independent. Counts are not added together.

## Database-free suite

Command includes `tests/v13/contract`, `tests/v13/unit`, `tests/v13/quality`, `tests/church-database-identity.test.js`, `tests/v8-hostinger-env-profile-conflict.test.js`, and the version files `tests/about-v11-platform.test.js`, `tests/v8-about-version-2.test.js`, and `tests/v212-version-initialization.test.js`.

Final confirmation log: `.v13-isolated-pg/g132-safe3.log`.

Earlier confirmation after the appointment and vitals edits: `.v13-isolated-pg/g132-safe2.log` — 553 tests, 551 passed, 0 failed, 2 skipped.

## HTTP

Disposable database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432` only.

| Run | Log | Executed | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| 1 | `.v13-isolated-pg/g132-http1.log` | 34 | 31 | 3 | 0 |
| 2 | `.v13-isolated-pg/g132-http2.log` | 34 | 31 | 3 | 0 |

Failures in each run: D14C OTP, D16 platform OTP, D25 slot capacity. The same-staff overlap subtest passed. Slot capacity still throws `BLOCKED_APPROVAL_REQUIRED`.

## Playwright

| Run | Log | Result |
|---|---|---|
| ActiveClinic 1 | `.v13-isolated-pg/g132-ac1.log` | 20 passed |
| ActiveClinic 2 | `.v13-isolated-pg/g132-ac2.log` | 20 passed |
| BlessBoard 1 | `.v13-isolated-pg/g132-bb1.log` | 23 passed |
| BlessBoard 2 | `.v13-isolated-pg/g132-bb2.log` | 23 passed |

Combined inventory remains 43 browser cases. Each complete cycle was 43 passed, 0 failed, 0 skipped.

## Not counted as E2E

The new vitals history unit test and the patient-activation contract do not replace a hosted or browser proof of AC-FU-PORTAL-01, AC-FU-WEB-02, or AC-FU-CLIN-03.
