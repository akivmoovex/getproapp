# V2.13.2 G182 Resend QA configuration

No email was sent. No API key was created or written. Production sender identities were not changed. Production OTP was not activated.

## DNS and verification

Public DNS for `pronline.org` was read again this cycle.

| Record | Observation |
| --- | --- |
| `resend._domainkey.pronline.org` TXT | Present. `dig +short` length 221. The key is not copied. |
| `rsend.pronline.org` | CNAME `rsend-apne1.forge.rmta.net` |
| `send.pronline.org` | CNAME `send.forge.rmta.net` |
| Apex MX | `5 mx1.hostinger.com`, `10 mx2.hostinger.com` |
| Apex SPF | `v=spf1 include:_spf.mail.hostinger.com ~all` |
| `_dmarc.pronline.org` | `v=DMARC1; p=none` |

`RESEND_PRONLINE_DNS=PRESENT`.

`RESEND_VERIFIED=NOT_OBSERVED`. No Resend account was connected. DNS does not prove the domain is verified.

`RESEND_API_KEY=UNSET`. `GETPRO_RESEND_VERIFIED_DOMAINS` and `GETPRO_RESEND_SENDER_PROFILE` are unset in this shell.

`REAL_EMAIL_SENT=NO`.

## Exact domains

`src/platform/email/resendSenderCatalog.js` keeps production senders on:

- `security@notify.blessboard.com`
- `security@notify.activeclinic.org`
- `security@notify.pronline.org`

`pronline.org` is not `notify.pronline.org`. The hosted-QA proposals `qa-blessboard@pronline.org` and `qa-activeclinic@pronline.org` are selected only when `GETPRO_RESEND_SENDER_PROFILE=hosted-qa` and `GETPRO_RESEND_VERIFIED_DOMAINS` contains the exact string `pronline.org`. Otherwise the sender is refused. Existing proof is `tests/v13/unit/g140-resend-transport.test.js` and `tests/v13/contract/g141-otp-resend-contract.test.js`.

## Manual verification

1. Open the Resend dashboard for the GetPro account.
2. Open the domain `pronline.org`, not `notify.pronline.org`.
3. Record the dashboard status. `Verified` is the only status that counts. A pending or failed domain stays `NOT_OBSERVED` for this repository.
4. Confirm the dashboard shows the DKIM host `resend._domainkey.pronline.org` as verified.
5. Leave the apex MX on Hostinger. The `rsend` and `send` records are the sending hosts.

## QA-only configuration, not applied

| Item | Value |
| --- | --- |
| Key | A new sending-only Resend key, restricted to `pronline.org` if the dashboard can restrict a key to one domain. |
| Location | The testing host secret store, process environment name `RESEND_API_KEY`. Not a file in this repository, not a log, and not a document. |
| Allowlist | `GETPRO_RESEND_VERIFIED_DOMAINS=pronline.org` and `GETPRO_RESEND_SENDER_PROFILE=hosted-qa`. |
| Recipients | `GETPRO_RESEND_QA_RECIPIENTS` set to the operator mailbox list. The adapter already rejects a malformed recipient, retries a timeout and a rate limit, and suppresses a repeated idempotency key. A QA send must also refuse a recipient that is not on that list. That check is not enabled in production code in this cycle. |
| OTP | Do not set activation to `ACTIVE`. `resolveOtpActivation` stays blocked on a production signal. |

The separately approved smoke test is one non-OTP message from each QA sender to one allowlisted recipient. It is not part of this cycle.

## OTP end-to-end after later authorization

`tests/v13/unit/g181-otp-readiness.test.js` is the executable contract for that later run. It issues a testing challenge, proves a second memory service cannot verify it, proves verify does not complete the session, and proves completion works once. It does not open a database, send mail, or change D14C or D16. Those HTTP tests still fail while the table is absent.
