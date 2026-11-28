# V2134 G331 OTP readiness

LIVE_EMAIL_OTP=BLOCKED  
PROVIDER_DELIVERY=NOT_VERIFIED  
OTP_MAILBOX_RECEIPT=NONE  
OTP_PRODUCTION_READY=NO  
MIGRATION_048=ABSENT_NOT_APPLIED  

No email was sent. No API key, pepper, OTP code, or recipient address is recorded here.

## Credentials observed in this process

| Name | Presence |
| --- | --- |
| `RESEND_API_KEY` | unset |
| `GETPRO_RESEND_VERIFIED_DOMAINS` | unset |
| `GETPRO_RESEND_SENDER_PROFILE` | unset |
| `GETPRO_RESEND_QA_RECIPIENTS` | unset |
| `GETPRO_OTP_PEPPER` | unset in the agent shell. Isolated tests supply their own test pepper |
| `GETPRO_OTP_QA_LIVE_DELIVERY` | unset |
| `GETPRO_OTP_ACTIVATION` | unset |
| `GETPRO_OTP_ALLOW_FIXED_CODE` | unset |

`deliveryActivated` remains false on the inactive, observer, and paid-gateway adapters in `src/platform/otp/otpProviders.js`. The observer accepts a code only inside an authorized local fixture and does not open a network client.

## Shared architecture

ActiveClinic recovery and BlessBoard member login use `src/platform/otp/otpService.js`. Verification requires a pepper, a bound organization, account, product, channel, and attempt. A wrong purpose, a cross-tenant row, a consumed challenge, an exhausted attempt count, and an expired challenge are denied. A verified row is a replay denial. The public failure text does not name which account exists.

`db/migrations/platform/048_otp_challenges.sql` is not in the repository. The isolated database already has `platform.otp_challenges` from the earlier approved test schema. That is not approval to add 048 on the host.

## Tests executed this session

| Suite | Result |
| --- | --- |
| `npm run test:v13:otp-security` | 15/15 twice |
| ActiveClinic `v13-ac-email-otp.spec.js` | 9/9 twice, synthetic observer |
| BlessBoard `v13-d161-member-otp.spec.js` | 10/10 twice, synthetic observer |

ActiveClinic browser cases that passed: a bound challenge does not open a session, a wrong code is rejected, an expired challenge is rejected, the wrong product, clinic, and account are rejected, one correct completion allows sign-in, a concurrent completion allows one recovery, and a missing observer challenge fails closed.

BlessBoard browser cases that passed: the login form is reachable, credentials leave the session closed until the code form, a wrong code and an expired code leave the session closed, a correct code survives reload, cross-tenant and wrong-member challenges do not sign in, concurrent completion allows one session, the rate limit keeps the session closed, and a missing observer challenge fails closed.

## What this does not prove

A message arriving in a mailbox. Production OTP. SMS. Patient activation by email. The patient activation journey that passed in the ActiveClinic platform browser is the existing staff-created chart and testing activation path, not a live email OTP.

Staff password sign-in on ActiveClinic still opens a session without an email OTP step. That is the current D14C contract. This session did not add a second OTP system in front of staff login.
