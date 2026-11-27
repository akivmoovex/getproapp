# V2134 G317 OTP operator checklist

Date: 27 November 2026  
No email was sent. This checklist names settings and exact required values. It does not contain a key, pepper, mailbox address, or OTP code.

Live send stays fail-closed until every row below is true on the disposable testing process. A provider HTTP 2xx is not mailbox delivery. `deliveryActivated` stays false in source until a later reviewed change. Production OTP stays blocked.

| Setting | Observed | Required value |
| --- | --- | --- |
| `RESEND_API_KEY` | ABSENT | Sending-only key in the approved secret store. Never in Git, logs, or fixtures |
| `GETPRO_RESEND_VERIFIED_DOMAINS` | ABSENT | Exact `pronline.org` after the Resend dashboard shows the domain Verified |
| `GETPRO_RESEND_SENDER_PROFILE` | ABSENT | Exact `hosted-qa` |
| `GETPRO_RESEND_QA_RECIPIENTS` | ABSENT | Exactly one approved mailbox. No wildcard. No second address |
| `GETPRO_OTP_PEPPER` | ABSENT | Private value of at least 32 characters. Not the published testing pepper. Not equal to `SESSION_SECRET` |
| `GETPRO_OTP_QA_LIVE_DELIVERY` | ABSENT | Exact `owner-approved` on the disposable testing process only |
| `GETPRO_OTP_QA_PROVIDER_BUDGET` | ABSENT | Exact `3`, backed by the durable exclusive-slot budget |
| `GETPRO_V13_APPROVED_DB_TARGET` | ABSENT | Exact `getpro_v13_e2e_g78d2301` |
| `DATABASE_URL` | ABSENT | `127.0.0.1:55432`, role `v13_regression_213101`, database `getpro_v13_e2e_g78d2301` |
| `GETPRO_GIT_BRANCH` on the hosted panel | `V11` | `V13`, applied only under a separate deployment approval, then a worker restart |

## Dashboard

No Resend dashboard session is connected here. Record the Verified state outside Git. Do not treat SPF, DKIM, or CNAME records as that confirmation.

## Sequence

1. Confirm `pronline.org` is Verified in the Resend dashboard.
2. Store a sending-only key only in the approved secret store.
3. Choose one QA mailbox and set `GETPRO_RESEND_QA_RECIPIENTS` to that address alone.
4. Generate a private pepper of at least 32 characters. Store it with the key. Do not reuse the published testing pepper or `SESSION_SECRET`.
5. Set the sender profile, verified-domain list, budget `3`, and `GETPRO_OTP_QA_LIVE_DELIVERY=owner-approved` on the disposable testing process.
6. Point that process at `127.0.0.1:55432/getpro_v13_e2e_g78d2301` as `v13_regression_213101`.
7. Only then authorize one BlessBoard login send and one ActiveClinic recovery send. Read the mailbox independently. Enter the received code once. Confirm the protected action completes once and a replay is denied.
8. For the hosted label, set `GETPRO_GIT_BRANCH=V13` in the Hostinger panel and restart the workers only after a separate deployment approval. Do not combine that restart with OTP activation.

Until steps 1–7 are done, `LIVE_SEND_AUTHORIZED=NO`.

## Browser fixture gap

The isolated BlessBoard and ActiveClinic Playwright suites are already authorized and were executed. The unused D161 login-OTP spec still needs a separate fixture approval: a localhost delivery read for the login challenge, a distinct expired challenge, and a second-tenant verify path. Do not satisfy that gap by printing the testing code in the page or by setting production OTP activation.
