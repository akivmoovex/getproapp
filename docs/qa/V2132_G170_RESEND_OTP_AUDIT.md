# G170 Resend and OTP audit

Read-only DNS on this cycle. No Resend session. No email sent.

| Check | Result |
| --- | --- |
| `resend._domainkey.pronline.org` | TXT present, 221 characters. Key material is not copied. |
| `rsend.pronline.org` | CNAME `rsend-apne1.forge.rmta.net` |
| `send.pronline.org` | CNAME `send.forge.rmta.net` |
| `_dmarc.pronline.org` | `v=DMARC1; p=none` |
| Apex MX | `5 mx1.hostinger.com`, `10 mx2.hostinger.com` |
| Domain verified in Resend | NOT_OBSERVED |
| `RESEND_API_KEY` | absent |
| `GETPRO_RESEND_VERIFIED_DOMAINS` | absent |
| Exact domain match | `pronline.org` is not `notify.pronline.org`. The production catalog sender stays on `notify.pronline.org`. |

Mock tests in the safe suite still cover missing key, wrong domain, 401, 429, retry exhaustion, duplicate suppression, and redaction. They passed as part of 570. They do not prove delivery.

OTP lifecycle: generation and the adapter exist. Persistence does not. D14C and D16 failed in both HTTP runs because `platform.otp_challenges` is absent. Migration 048 was not created. Production OTP stays disabled. Provider acceptance is not OTP verification.

`RESEND_EMAIL_DELIVERY=NOT_TESTED_LIVE`. `OTP_PERSISTENCE=ABSENT`.
