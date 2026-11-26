# V2134 G280 Resend delivery evidence

No live email was sent in this cycle.

## DNS (rechecked)

| Record | Observation |
| --- | --- |
| `resend._domainkey.pronline.org` TXT | Present; `dig +short` length 221 (key not copied) |
| `rsend.pronline.org` | CNAME `rsend-apne1.forge.rmta.net` |
| `send.pronline.org` | CNAME `send.forge.rmta.net` |
| `_dmarc.pronline.org` | `v=DMARC1; p=none` |

`RESEND_PRONLINE_DNS=PRESENT`  
`RESEND_DASHBOARD_VERIFICATION=NOT_OBSERVED`  
`RESEND_API_KEY=UNSET`  
`RESEND_PROVIDER_ACCEPTED=BLOCKED`  
`RESEND_MAILBOX_DELIVERED=NOT_EXECUTED`

## Domain distinction

- Hosted-QA profile requires exact allowlisted domain `pronline.org`.
- Production catalog senders remain on `notify.blessboard.com`, `notify.activeclinic.org`, `notify.pronline.org`.
- `pronline.org` is not `notify.pronline.org`.

## Operator configuration (not applied here)

```
GETPRO_RESEND_SENDER_PROFILE=hosted-qa
GETPRO_RESEND_VERIFIED_DOMAINS=pronline.org
GETPRO_RESEND_QA_RECIPIENTS=<exact allowlisted mailboxes>
GETPRO_OTP_PROVIDER=resend
GETPRO_OTP_EMAIL_PROVIDER=resend
GETPRO_OTP_ACTIVATION=ACTIVE   # testing / disposable only; production stays blocked
RESEND_API_KEY=<sending-only key from approved secret store>
```

Never commit the API key. Never treat a provider 2xx as mailbox proof.
