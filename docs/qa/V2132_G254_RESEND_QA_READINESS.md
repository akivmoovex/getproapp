# V2132 G254 Resend pronline.org readiness

DNS present (DKIM length 221; rsend/send CNAMEs).  
`RESEND_DASHBOARD_VERIFICATION=NOT_OBSERVED`  
`RESEND_API_KEY=UNSET`  
`LIVE_EMAIL_SENT=NO`

`pronline.org` ≠ `notify.pronline.org`. Production senders unchanged.

Prepared (not applied) QA config:

```
GETPRO_RESEND_SENDER_PROFILE=hosted-qa
GETPRO_RESEND_VERIFIED_DOMAINS=pronline.org
GETPRO_RESEND_QA_RECIPIENTS=<operator allowlist>
GETPRO_OTP_PROVIDER=resend
RESEND_API_KEY=<secret store>
```

Operator must confirm dashboard Verified and provision key outside Git.
