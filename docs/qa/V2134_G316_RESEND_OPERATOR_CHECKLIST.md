# V2134 G316 Resend operator checklist

Date: 27 November 2026  
No email was sent. Values below are presence only.

| Item | Agent environment | Required before any live send |
| --- | --- | --- |
| `RESEND_API_KEY` | ABSENT | Sending-only key in the approved secret store. Never in Git, logs, or fixtures |
| `GETPRO_RESEND_VERIFIED_DOMAINS` | ABSENT | Exact single value `pronline.org` after dashboard verification |
| `GETPRO_RESEND_SENDER_PROFILE` | ABSENT | Exact value `hosted-qa` |
| `GETPRO_RESEND_QA_RECIPIENTS` | ABSENT | Exactly one approved mailbox. No wildcards. No second address |
| `GETPRO_OTP_PEPPER` | ABSENT | At least 32 characters, not the published testing pepper, not equal to `SESSION_SECRET` |
| `GETPRO_OTP_QA_LIVE_DELIVERY` | ABSENT | Exact value `owner-approved` on the disposable testing process only |
| `GETPRO_OTP_QA_PROVIDER_BUDGET` | ABSENT | Exact value `3`, backed by the durable file budget |
| `GETPRO_V13_APPROVED_DB_TARGET` | ABSENT | Exact value `getpro_v13_e2e_g78d2301` |
| `DATABASE_URL` | ABSENT | Loopback `127.0.0.1:55432`, role `v13_regression_213101`, database `getpro_v13_e2e_g78d2301` |

## Dashboard

No Resend dashboard session is connected in this environment. Verified-domain status is `NOT_OBSERVED`. Do not treat SPF, DKIM, or CNAME records as verification.

## Gates that stay closed

- `deliveryActivated` is hard-coded false on every channel adapter.
- A provider HTTP 2xx is not mailbox delivery.
- Production activation stays blocked.
- SMS is not authorized.
- More than one recipient is rejected.
- The published testing pepper is rejected for a live send.

## Operator sequence

1. Confirm `pronline.org` is Verified in the Resend dashboard. Record the confirmation outside Git.
2. Create a sending-only key and store it only in the approved secret store.
3. Choose exactly one QA mailbox and set `GETPRO_RESEND_QA_RECIPIENTS` to that address alone.
4. Set the pepper, sender profile, verified-domain list, budget, and `GETPRO_OTP_QA_LIVE_DELIVERY=owner-approved` on the disposable testing process.
5. Point `DATABASE_URL` at `127.0.0.1:55432/getpro_v13_e2e_g78d2301` as `v13_regression_213101`.
6. Only then authorize one BlessBoard login send and one ActiveClinic recovery send. Confirm the mailbox independently. Verify the received code. Complete the protected action once. Confirm replay is denied.

Until those steps are done, `LIVE_SEND_AUTHORIZED=NO`.
