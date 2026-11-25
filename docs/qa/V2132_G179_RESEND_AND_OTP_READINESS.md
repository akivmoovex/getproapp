# V2.13.2 G179 Resend and OTP readiness

No email was sent. No API key was created. `pronline.org` was not added to `GETPRO_RESEND_VERIFIED_DOMAINS`. DNS presence is not account verification.

## DNS observed for pronline.org

Read-only public DNS on this cycle:

| Record | Observation |
| --- | --- |
| `resend._domainkey.pronline.org` TXT | Present. `dig +short` length 221. The published key is not copied here. |
| `rsend.pronline.org` | CNAME `rsend-apne1.forge.rmta.net`. TXT SPF `v=spf1 include:amazonses.com ~all`. MX `10 feedback-smtp.ap-northeast-1.amazonses.com`. |
| `send.pronline.org` | CNAME `send.forge.rmta.net`. TXT SPF `v=spf1 ip4:52.3.252.119 ip4:44.222.39.36 ip4:199.249.231.0/24 ~all`. MX `10 feedback.forge.rmta.net`. |
| Apex MX | `5 mx1.hostinger.com` and `10 mx2.hostinger.com`. Incoming mail is still Hostinger. |
| Apex TXT | `v=spf1 include:_spf.mail.hostinger.com ~all`. |
| `_dmarc.pronline.org` TXT | `v=DMARC1; p=none`. |

`RESEND_PRONLINE_DNS=PRESENT`.

## What DNS does not prove

`RESEND_DOMAIN_VERIFIED=NOT_OBSERVED`. This cycle had no Resend account access. A published DKIM name and the `rsend` / `send` CNAMEs do not prove the domain is verified in a Resend account.

## Sender routing in source

`src/platform/email/resendSenderCatalog.js` keeps the production catalog on exact domains:

- BlessBoard `security@notify.blessboard.com` / `notify.blessboard.com`
- ActiveClinic `security@notify.activeclinic.org` / `notify.activeclinic.org`
- PROnline `security@notify.pronline.org` / `notify.pronline.org`

`pronline.org` is not `notify.pronline.org`. The `hosted-qa` profile selects `qa-blessboard@pronline.org` and `qa-activeclinic@pronline.org` only when `GETPRO_RESEND_SENDER_PROFILE=hosted-qa` and `GETPRO_RESEND_VERIFIED_DOMAINS` contains the exact string `pronline.org`. An empty verified list fails closed. Production OTP stays blocked in `resolveOtpActivation` even if that profile is set.

## Environment

In this shell, `RESEND_API_KEY`, `GETPRO_RESEND_VERIFIED_DOMAINS`, and `GETPRO_RESEND_SENDER_PROFILE` are unset. No secret was printed.

`RESEND_API_KEY_CONFIGURED=NO`.

## Tests already in the tree

Safe-suite coverage, not a live send:

- `tests/v13/unit/g140-resend-transport.test.js` refuses an unverified domain, a missing key, a bad recipient, and a provider rejection. It retries a timeout and a rate limit, sends once for a verified catalog sender, and keeps a code out of the templates.
- `tests/v13/contract/g141-otp-resend-contract.test.js` keeps recovery on the shared adapter and keeps production OTP blocked.

`EMAIL_DELIVERY_TESTED=NO`.

## OTP persistence

`platform.otp_challenges` is absent. D14C and D16 still fail for that reason. The memory store in `src/platform/otp/otpChallengeStore.js` is unit-test only. The approval package is `docs/qa/V2132_G179_OTP_MIGRATION_APPROVAL_PACKAGE.md`. The migration file was not created and was not applied.

`NEW_MIGRATIONS_EXECUTED=NO`.
