# V2.13.2 G138 — full regression results

Branch `V13`. Disposable database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432` only. No migration. No production flag change. Hosted QA was not run. The suite is not green.

## Database-free

One run after the appointment-link repair and the new tests: 561 tests, 559 passed, 0 failed, 2 skipped. The skips are the PostgreSQL identity checks when no database is configured. The command included contract tests, unit tests, quality tests, About tests, and `tests/v212-version-initialization.test.js` plus `tests/v213-version-initialization.test.js`.

## HTTP run 1

`G79_PREFLIGHT_OK` churches=67 clinics=617. 35 tests, 32 passed, 3 failed, 0 skipped.

Failures: D14C OTP, D16 platform OTP, D25 appointment persistence. Inside D25, the slot subtest threw `BLOCKED_APPROVAL_REQUIRED`. The overlap source check passed. The two-connection staff test passed. D05 passed, including website publication and vitals correction.

## HTTP run 2

`G79_PREFLIGHT_OK` churches=68 clinics=640. 35 tests, 32 passed, 3 failed, 0 skipped. Same three failures. The two-connection staff test passed again.

## Playwright cycle 1

ActiveClinic 22 passed, 0 failed. BlessBoard 23 passed, 0 failed. Combined 45 passed, 0 failed.

## Playwright cycle 2

ActiveClinic 22 passed, 0 failed. BlessBoard 23 passed, 0 failed. Combined 45 passed, 0 failed.

The previous 20 ActiveClinic tests and 23 BlessBoard tests are inside those totals. The two added ActiveClinic tests are `AC-FU-PORTAL-01` and `AC-FU-WEB-02`.

## 23 November 2026 scenarios

| ID | Status | Evidence |
|---|---|---|
| AC-FU-PORTAL-01 | VERIFIED_LOCAL_E2E | Named browser test passed in both ActiveClinic cycles. One patient number, login, profile read-back. |
| AC-FU-PORTAL-02 | POLICY_MISMATCH | Unknown registration does not insert a patient. Not a pass. |
| AC-FU-PORTAL-03 | BLOCKED_BY_POLICY | `AC-PUB-01` passed. Public booking stays disabled. |
| AC-FU-PORTAL-04 | BLOCKED_BY_MIGRATION | `platform.otp_challenges` was not created. |
| AC-FU-WEB-01 | VERIFIED_LOCAL_E2E | `AC-WEB-08` passed in both cycles. |
| AC-FU-WEB-02 | VERIFIED_LOCAL_E2E | New text and an https image reference publish and survive reload. Binary upload was not run. |
| AC-FU-WEB-03 | VERIFIED_LOCAL_E2E | `AC-WEB-09` passed in both cycles. |
| AC-FU-REC-01 | VERIFIED_LOCAL_E2E | Staff create inside `AC-FU-PORTAL-01`. |
| AC-FU-REC-02 | VERIFIED_LOCAL_E2E | `AC-REC-02` passed in both cycles. |
| AC-FU-REC-03 | VERIFIED_LOCAL_E2E | Covered by the reception journey already in the 22-test file. No new title. Both cycles passed. |
| AC-FU-REC-04 | VERIFIED_LOCAL_E2E | Same full-file pass. No separate title was added. |
| AC-FU-REC-05 | VERIFIED_LOCAL_E2E | Same full-file pass. No separate title was added. |
| AC-FU-CLIN-01 | VERIFIED_LOCAL_E2E | Same full-file pass. No separate title was added. |
| AC-FU-CLIN-02 | VERIFIED_LOCAL_E2E | `AC-REC-03` saves 72 bpm and denies the other session. |
| AC-FU-CLIN-03 | VERIFIED_LOCAL_E2E | `AC-REC-03` appends 80 bpm, keeps 72 bpm, and rejects the stale retry over HTTP. |

Binary media upload, public self-registration, and public booking are not implemented.
