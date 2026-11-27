# V2134 G321 Resend operator actions

Date: 27 November 2026  
Candidate: `27a940e7809bd2f01ee22e9032443414b76a8dfa`

No email was sent for this review. No key, pepper, mailbox address, or OTP code belongs in Git.

## Current gate

| Check | Result |
| --- | --- |
| Dashboard verification for `pronline.org` | NOT_OBSERVED |
| `RESEND_API_KEY` | ABSENT |
| `GETPRO_RESEND_QA_RECIPIENTS` | ABSENT |
| `GETPRO_OTP_PEPPER` | ABSENT |
| `GETPRO_OTP_QA_LIVE_DELIVERY` | ABSENT |
| Live message received | NO |
| Received code completed the protected action | NO |
| Live delivery | NO-GO |

`deliveryActivated` stays false. A provider HTTP 2xx is not mailbox proof. The BlessBoard and ActiveClinic browser OTP passes used the loopback observer. They do not authorize a live send.

## Operator sequence

Do these steps outside Git, on the disposable testing process only.

1. Confirm `pronline.org` is Verified in the Resend dashboard. Record that confirmation outside Git.
2. Create a sending-only key and store it only in the approved secret store.
3. Choose exactly one QA mailbox. Set `GETPRO_RESEND_QA_RECIPIENTS` to that address alone.
4. Set a pepper of at least 32 characters. It must not be the published testing pepper and must not equal `SESSION_SECRET`.
5. Set `GETPRO_RESEND_VERIFIED_DOMAINS=pronline.org`, `GETPRO_RESEND_SENDER_PROFILE=hosted-qa`, `GETPRO_OTP_QA_PROVIDER_BUDGET=3`, and `GETPRO_OTP_QA_LIVE_DELIVERY=owner-approved`.
6. Point the process at `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301` as `v13_regression_213101`.
7. Send one BlessBoard member-login message and one ActiveClinic password-recovery message.
8. Confirm each message in the mailbox. Submit the received code. Complete the protected action once. Confirm a replay is denied.

Until step 8 is done with a message that was actually received, live OTP stays NO-GO.

## Separate hosted action

This is not a Resend step and was not performed.

Public `/healthz` shows git SHA `7b9b31d0c478` and branch `V11` from `GETPRO_GIT_BRANCH` on both BlessBoard and ActiveClinic. The release candidate is `27a940e7`. A later approval is required before changing the panel branch to `V13`, deploying the candidate, or restarting workers.

## Still forbidden

- Production OTP activation
- SMS
- More than one recipient
- Financial posting
- Public booking enablement
- Shared or hosted migration 048
- Changes to `main`
