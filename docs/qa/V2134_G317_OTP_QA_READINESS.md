# V2134 G317 OTP QA readiness

**FINAL=V2134_G317_OTP_QA_READINESS**

Date: 27 November 2026  
Worktree: `/Users/akivsolomon/Development/getproapp-v13`  
Branch: `V13`  
Base at start: `030f2fbecfd5340cb38c0cde21424398734a61bd`  
Versions: ActiveClinic `2.13.4`, BlessBoard `2.13.4`

| Field | Value |
| --- | --- |
| FINAL_SHA | this G317 documentation commit on `origin/V13` |
| REMOTE_SHA_MATCH | recorded after the push |
| ISOLATED_BROWSER_AUTHORIZED | YES |
| BB_OTP_BROWSER | PASS_D14C_AND_RECOVERY / D161_NOT_RUN |
| AC_OTP_BROWSER | PASS_RESET_JOURNEY / EMAIL_OTP_SPEC_ABSENT |
| D14C | PASS |
| D16 | PASS |
| POSTGRES_OTP | PASS |
| RESEND_DOMAIN_VERIFIED | NOT_OBSERVED |
| RESEND_KEY_PRESENT | NO |
| QA_RECIPIENT_CONFIGURED | NO |
| PEPPER_CONFIGURED | NO |
| RESEND_ACCEPTED | NOT_RUN |
| REAL_EMAIL_DELIVERED | NOT_RUN |
| OTP_END_TO_END | NO |
| HOSTED_DEPLOYMENT | NOT_PERFORMED |
| QA_GO_NO_GO | NO-GO |

No email was sent. No OTP code, API key, pepper, or mailbox address is recorded here.

## Git and database

`origin/V13` matched `030f2fbecfd5340cb38c0cde21424398734a61bd` before this evidence. `main` stayed `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. Untracked `bb-lifecycle.log` and `docs/qa/V2131_GAP_G08_FINAL_REPORT.md` were left untracked.

The approved database was read on `127.0.0.1:55432` as `getpro_v13_e2e_g78d2301`. Identity was `testing` / `moovex-platform-v7`, role `v13_regression_213101`, cluster `v13-regression-213101`. `platform.otp_challenges` was present. Public booking stayed disabled. No database was created, reset, or migrated. `db/migrations/platform/048_otp_challenges.sql` remains absent.

## Browser authorization

G301 register item 4 authorizes synthetic OTP browser testing on `getpro_v13_e2e_g78d2301`. That authorization covers the existing isolated Playwright configs. Both preflights accepted only that database, port `55432`, and the testing identity. The browser server kept `BLESSBOARD_OTP_PROVIDER=test` and did not expose a testing code in the page.

It does not cover `tests/e2e/v13/v13-d161-member-otp.spec.js` or `tests/e2e/v13/v13-d163-journeys.spec.js`. Those files are outside both Playwright `testMatch` patterns. Their own comments say they wait for future run-owned fixtures.

Additional authorization required before D161 can run:

1. Include `v13-d161-member-otp.spec.js` in the isolated BlessBoard Playwright match.
2. Provide a member-login challenge whose code is readable only by the test process through a localhost delivery endpoint. The code must not be rendered, logged, or committed.
3. Provide an expired challenge that is distinct from the wrong-code value `000000`. The spec currently falls back to `000000`, which does not prove expiration.
4. Provide `E2E_BB_OTHER_TENANT_VERIFY_PATH` bound to a second disposable church. The spec default stays on the same verify path.
5. Keep production OTP activation off and keep `GETPRO_OTP_QA_LIVE_DELIVERY` unset.

The current authorized contract is the opposite of an active login gate: D14C requires that staff sign-in does not show a one-time code field, and the member login in the same suite completes without that field.

ActiveClinic has no email-OTP browser spec in `playwright.v13-ac-platform.config.cjs`. An ActiveClinic email-OTP browser journey needs a reviewed spec and the same non-logging delivery fixture. That is separate from the reset-token journey that already ran.

## What the browser runs proved

BlessBoard, twice, 23 passed / 0 failed:

- D14C: after staff sign-in the one-time code field is absent and the session is open.
- BB-AUTH-04: recovery asks for a code, the page does not contain the testing code, the localhost delivery endpoint returns a six-digit code to the test process, the password updates, the new password opens the member dashboard, and a wrong code shows "Recovery unsuccessful".

ActiveClinic, twice, 32 passed / 0 failed:

- AC-AUTH-04: an invalid reset token is rejected, the check page does not show the reset link, mismatched passwords are rejected, the new password opens the staff shell, and the used token cannot be reused.
- The synthetic admin password is restored by the test.

These runs do not prove login-OTP expiration, login-OTP replay of the same consumed code, or cross-tenant OTP binding. Those remain in the unrun D161 spec. PostgreSQL coverage of consumption and replay is recorded separately below.

## PostgreSQL OTP

D14C, D16, G185, and G272 passed 4 / 0 twice against the approved database. G272 completed one protected recovery action, rejected replay, left mailbox delivery `NOT_EXECUTED`, and left Resend `BLOCKED_MISSING_CREDENTIALS`. `deliveryActivated` stayed false.

Safe contract and unit suites passed 672 / 0 twice. Those suites do not open a database.

## Resend and live delivery

Process environment and local env files:

| Setting | Result |
| --- | --- |
| `RESEND_API_KEY` | ABSENT |
| `GETPRO_RESEND_VERIFIED_DOMAINS` | ABSENT |
| `GETPRO_RESEND_SENDER_PROFILE` | ABSENT |
| `GETPRO_RESEND_QA_RECIPIENTS` | ABSENT |
| `GETPRO_OTP_PEPPER` | ABSENT |
| `GETPRO_OTP_QA_LIVE_DELIVERY` | ABSENT |

No Resend dashboard session was available, so domain verification is `NOT_OBSERVED`. DNS records were not treated as verification. No message was submitted to Resend.

## Hosted branch label

Public `/healthz` was read and not changed.

| Surface | gitSha prefix | branch | branchSource |
| --- | --- | --- | --- |
| BlessBoard | `030f2fbecfd5` | `V11` | `GETPRO_GIT_BRANCH` |
| ActiveClinic | `030f2fbecfd5` | `V11` | `GETPRO_GIT_BRANCH` |

Both reported `testing`, `moovex-platform-testing`, and `schemaCompatible=true`. The source still prefers the panel variable over git. The required correction is an operator change of `GETPRO_GIT_BRANCH` to `V13`, then a worker restart. That change needs a separate deployment approval. This session did not edit the Hostinger panel, restart a hosted service, or deploy.

## Remaining blockers

1. Verified Resend domain, sending-only key, exactly one QA mailbox, and a private pepper are absent.
2. D161 login, expiration, and cross-tenant browser cases need the fixture authorization above.
3. ActiveClinic has no email-OTP browser spec in the authorized match.
4. Hosted health still labels the branch `V11`.

`QA_GO_NO_GO=NO-GO`
