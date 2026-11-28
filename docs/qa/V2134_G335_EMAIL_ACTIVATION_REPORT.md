# V2134 G335 email activation

LIVE_EMAIL_TEST=BLOCKED_RECIPIENT_APPROVAL  
LIVE_EMAIL_SENT=NO  
EMAIL_PROVIDER=resend  
HOSTED_OTP_ACTIVATED=NO

The shared Resend adapter is in the local candidate. It does not send unless the process is non-production, `GETPRO_OTP_EMAIL_DELIVERY=owner-approved`, activation is `ACTIVE`, the product domain is listed as verified, a key and a distinct pepper are present, and the purpose is login or password recovery. Hosted testing runs with `NODE_ENV=production`, so that path stays closed even if the flag is copied onto the host.

## What is present

| Check | Result |
| --- | --- |
| `RESEND_API_KEY` in this process | Absent |
| Verified-domain setting | Absent |
| Sender profile | Absent |
| Recipient allowlist | Absent |
| OTP pepper | Absent |
| Live delivery flag | Absent |
| `pronline.org` SPF | `v=spf1 include:_spf.mail.hostinger.com ~all` |
| `pronline.org` DMARC | `v=DMARC1; p=none` |
| `resend._domainkey.pronline.org` | A DKIM TXT record is published |
| `notify.pronline.org`, `notify.activeclinic.org` | No TXT or MX records |
| Resend dashboard verification | Not available from DNS alone |

SPF authorizes Hostinger mail. It does not include Resend. A published DKIM selector is not dashboard verification and is not permission to send.

No approved mailbox is configured. No message was sent. Provider acceptance, mailbox receipt, code verification, and session creation were not attempted.

## Schema

`db/migrations/platform/048_otp_challenges.sql` is still absent. The isolated database has `platform.otp_challenges` and that table is not in its migration ledger. Hosted `/healthz` does not report that table. This gate did not apply a hosted migration.

Staff and patient login OTP stay off unless the isolated observer flags are set. Those flags require a non-production process. Hosted password sign-in does not query the OTP table.
