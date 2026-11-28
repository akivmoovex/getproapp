# V2134 G333 staff login OTP browser

STATUS=PASS  
SUITE=`tests/e2e/v13/v13-ac-staff-login-otp.spec.js`  
CLOSED=`tests/e2e/v13/v13-ac-staff-login-otp-closed.spec.js`  
DATABASE=getpro_v13_e2e_g78d2301  
HOST=127.0.0.1:55432  
RUNS=8/8 and 8/8, closed 1/1 and 1/1

Staff password login with `GETPRO_AC_STAFF_LOGIN_OTP_OBSERVER=1` and `GETPRO_OTP_PROVIDER=qa-observer` stops on the email code form. The browser checks the session cookie and `platform.deployment_sessions`, then requests `/app`.

| Case | Result |
| --- | --- |
| Password accepted, code form shown | Pass. Challenge row is `activeclinic` / `login` / pending / not consumed. |
| No staff session before the code | Pass. No session cookie. `GET /app` is a redirect. Open sessions are 0. |
| Correct code | Pass. Redirect to `/app`, session cookie present, one open deployment session. |
| Incorrect code | Pass. Reason `invalid_code`. No session. |
| Expired code | Pass. Local expire route, then reason `expired`. No session. |
| Replay | Pass. Second post of the consumed code is not a completion. Session count stays 1. |
| Simultaneous posts | Pass. Exactly one 303 and one open session. |
| Other clinic | Pass. Moving `organization_id` returns `cross_tenant`. No session. |
| Other account | Pass. Moving `account_id` returns `verification_failed`. Neither account has an open session. |
| Resend cooldown | Pass. Immediate resend returns `resend_cooldown`. No session. |
| Account cap | Pass. After five begins, the next login returns "Sign-in is temporarily unavailable." with no code form and no session. |
| Missing provider | Pass. Observer flag on, provider unset. Same unavailable page, no code form, no session, `/app` stays closed. |
| Password-only behavior | Pass. The existing ActiveClinic platform suite runs with the staff OTP flag removed: 36/36 twice. |
| Logout | Pass. `GET /logout` returns to `/login`, clears the session cookie, and leaves 0 open sessions. |

Fixtures are synthetic staff on `v13-d19-clinic-a` and `v13-d19-clinic-b`. Codes come from the loopback QA delivery route and are not printed in the page.
