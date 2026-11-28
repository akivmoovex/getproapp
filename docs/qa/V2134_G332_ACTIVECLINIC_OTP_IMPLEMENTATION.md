# V2134 G332 ActiveClinic OTP implementation

BASE_SHA=9d87d73a7957b24b4da79dfbd9160649c0116dea  
LIVE_EMAIL_SENT=NO  
MIGRATION_APPLIED=NO  
HOSTED_MODIFIED=NO

No email was sent. No API key, pepper, OTP code, or recipient address is recorded here.

## What was added

Staff sign-in and patient sign-in can require a second email code, and only on an isolated testing process that sets an observer flag.

| Flow | Flag | Default and hosted |
| --- | --- | --- |
| Staff login | `GETPRO_AC_STAFF_LOGIN_OTP_OBSERVER=1` | Password sign-in continues |
| Patient login | `GETPRO_AC_PATIENT_LOGIN_OTP_OBSERVER=1` | Password sign-in continues |
| Patient recovery | Existing `GETPRO_AC_RECOVERY_OTP_OBSERVER=1` | Unchanged |
| Patient activation | Unchanged chart-first path | No new email send |

The flag is accepted only when the existing testing-observer deployment checks pass: testing deployment, testing database identity, deployment code `moovex-platform-testing`, browser and database-stage authorization, and a non-production `NODE_ENV`. Hosted testing runs `NODE_ENV=production`, so the flag cannot open this step there.

## Session withholding

The password is checked first. A matching password does not create the platform session while the flag is on.

- One eligible clinic returns a deferred binding. `completeLoginSession` runs after the code is accepted.
- Several clinics still use the existing organization selector. The selector is checked for eligibility, and the session is created only after the code is accepted for that clinic.
- The pending step is an HMAC cookie signed with `SESSION_SECRET`. The browser cannot choose the organization, account, clinic, or email.
- The session cookie is issued with `protectedActionCompleted: true` after one successful completion. A second evaluation is not sent through the gate.
- A send that is not accepted returns a generic unavailable message and does not open a session.
- A missing verified email does not open a session and does not say whether the account exists.
- CSRF remains on the password form, the code form, and resend.
- Patient completion re-checks the sealed clinic, organization, and patient. A code sealed for one clinic is rejected on another clinic URL.
- Recovery still issues the reset only after the existing code gate. Unmatched public registration still returns `no_patient_match` and does not create a chart.

Policy remains 6 digits, 300 second lifetime, 5 attempts, and 60 second resend cooldown. The login route limiter is unchanged.

## Provider

`deliveryActivated` stays false. The observer stores a code in this process only. An inactive provider, a missing observer, and a production signal fail closed. `db/migrations/platform/048_otp_challenges.sql` was not added and was not applied. The isolated database already has `platform.otp_challenges` from the earlier approved test schema.

## Tests

`tests/v13/unit/g332-activeclinic-login-otp.test.js` passed 6/6 twice. It covers the hosted-off flag, server binding, a tampered and expired cookie, a refused cross-clinic organization, missing-provider failure, one winning concurrent completion, and replay.

The existing ActiveClinic recovery browser spec passed 9/9 twice. BlessBoard member-login OTP passed 10/10 twice. The default ActiveClinic browser suite passed 36/36 twice with the new flags removed from the server environment, so hosted-style password sign-in still reaches the clinic workspace.

There is no dedicated browser spec yet for the new staff or patient login code form. That is a coverage gap, not a hosted activation.
