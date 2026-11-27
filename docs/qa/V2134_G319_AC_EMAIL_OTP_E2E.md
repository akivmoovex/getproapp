# V2134 G319 ActiveClinic email OTP end to end

**FINAL=V2134_G319_AC_EMAIL_OTP_E2E**

Date: 27 November 2026  
Worktree: `/Users/akivsolomon/Development/getproapp-v13`  
Branch: `V13`  
Base at start: `cee1286e830a92845d44f6c6a17cd581de2042f0`  
Versions: ActiveClinic `2.13.4`, BlessBoard `2.13.4`

| Field | Value |
| --- | --- |
| FINAL_SHA | this G319 commit on `origin/V13` |
| REMOTE_MATCH | recorded after the push |
| EMAIL_OTP_SPEC_IMPLEMENTED | YES |
| EMAIL_OTP_SPEC_EXECUTED | 9 |
| EMAIL_OTP_PASS | 9 |
| EMAIL_OTP_FAIL | 0 |
| CLINIC_ISOLATION | YES |
| EXPIRED_CHALLENGE | YES |
| REPLAY_DENIAL | YES |
| OTP_POSTGRESQL | 4 pass / 0 fail, twice |
| AC_BROWSER_RUN_1 | 32 pass / 0 fail |
| AC_BROWSER_RUN_2 | 32 pass / 0 fail |
| SAFE_TESTS | 682 pass / 0 fail, twice |
| HTTP_TESTS | 15 pass / 0 fail, twice |
| REAL_RESEND_DELIVERY | NOT_VERIFIED_UNLESS_ACTUALLY_RECEIVED |
| PUSH | recorded after the push |
| MAIN_UNCHANGED | YES |
| NEXT_ACTION | G320 |

No email was sent. No OTP code, API key, pepper, mailbox, or database password is recorded here. The reset-link journey AC-AUTH-04 is not counted as email OTP evidence.

## Implemented contract

The email OTP path that exists today is `activeclinic.forgot_password`. An eligible staff identity with a verified email receives a password-recovery challenge. The reset link is issued only after that protected action completes. Verification does not create a session. Login after the new password is the existing staff session path.

These catalogued workflows do not have a completable email OTP form, and this change does not add one:

- `activeclinic.staff_login`
- `activeclinic.clinic_administrator_login`
- `activeclinic.patient_login`
- `activeclinic.patient_forgot_password` holds without a proven account, so an active policy stays on the link path
- `activeclinic.staff_role_change` and `activeclinic.patient_account_action` require an existing session

The dedicated spec is selected only when `GETPRO_AC_RECOVERY_OTP_OBSERVER=1`. The regression match stays `v13-ac-platform-qa.spec.js`. Global `GETPRO_OTP_ACTIVATION` is not set, so staff sign-in on the regression server stays historical.

The observer stores a code only in the authorized testing process. A read requires the ActiveClinic fixture flag, the testing deployment identity, browser and database-stage authorization, and a loopback socket. Production startup rejects `qa-observer` and any `GETPRO_AC_RECOVERY_OTP_OBSERVER` value. The BlessBoard login flag does not authorize this observer, and this flag does not authorize BlessBoard member login.

## Executed email OTP cases

Both focused runs passed 9 / 0. Port `4189`. Database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`. Synthetic staff were created on clinic A and clinic B and removed by the `@g319.v13d19.example` suffix.

| Case | Result |
| --- | --- |
| Eligible account requests a challenge bound to that identity, clinic, and email | PASS |
| No session exists before verification, and the page does not render the code | PASS |
| Loopback observer returns the synthetic code | PASS |
| Wrong code `000000` returns `invalid_code` and no reset link | PASS |
| Expired captured code returns `expired` and no reset link | PASS |
| Challenge moved to product `blessboard` returns `verification_failed` | PASS |
| Clinic B organization id returns `cross_tenant` | PASS |
| Clinic B account id returns `verification_failed` | PASS |
| Correct code reaches the check page once, replay returns 401 `replay`, the reset link updates the password, and login then opens the staff shell | PASS |
| Two concurrent completions produce one HTTP 303 and one reset token | PASS |
| Missing attempt id returns 400; unknown attempt id returns 404; neither body contains a code | PASS |

Production rejection and the missing-provider fail-closed path ran in `tests/v13/unit/g319-ac-recovery-otp.test.js` (5 tests). Without the fixture, recovery stays on the reset-link path.

## Other suites

ActiveClinic regression, twice, 32 / 0, including AC-AUTH-04 as a reset-link journey. That server did not select the email OTP spec.

PostgreSQL D14C, D16, G185, and G272, twice, 4 / 0. `npm run test:v13:contract`, twice, 682 / 0. That is the previous 677 plus the 5 new recovery tests. `npm run test:v13:ac`, twice, 15 / 0.

## Boundaries

No schema was added. No database was created, reset, or migrated. `deliveryActivated` stays false. No hosted service was restarted. Local `main` stayed `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. Untracked `bb-lifecycle.log` and `docs/qa/V2131_GAP_G08_FINAL_REPORT.md` were left untracked.
