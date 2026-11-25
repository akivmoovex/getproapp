# V2.13.2 G187 Resend and OTP test configuration

No email was sent. No API key was written. Production sender identities were not changed. Production OTP was not activated.

## Pepper

`publishedTestingPepper` returns `g187-published-test-pepper-not-secret` only when the environment is not production. Two test workers call that function and receive the same value. Production startup throws `otp_test_config_forbidden` if `GETPRO_OTP_PEPPER` is that published value. A missing or short pepper makes `beginChallenge` return `pepper` and `sessionComplete: false`. A different pepper does not match the stored HMAC. The fixed code `1234` remains rejected when any production signal is set.

The value is a test fixture. It is not a production secret and it is not loaded from a file in this repository.

## Resend

Public DNS for `pronline.org` was read again. `resend._domainkey.pronline.org` is present, `dig +short` length 221. `rsend.pronline.org` points at `rsend-apne1.forge.rmta.net`. `send.pronline.org` points at `send.forge.rmta.net`. The apex MX remains Hostinger. `_dmarc.pronline.org` is `v=DMARC1; p=none`.

`RESEND_PRONLINE_DNS=PRESENT`. `RESEND_DOMAIN_VERIFIED=NOT_OBSERVED`. No Resend account was connected. `RESEND_API_KEY`, `GETPRO_RESEND_VERIFIED_DOMAINS`, and `GETPRO_RESEND_SENDER_PROFILE` are unset.

`pronline.org` is not `notify.pronline.org`. Production senders stay `security@notify.blessboard.com`, `security@notify.activeclinic.org`, and `security@notify.pronline.org`. The QA addresses `qa-blessboard@pronline.org` and `qa-activeclinic@pronline.org` are selected only when the profile is `hosted-qa` and the verified-domain list contains the exact string `pronline.org`.
