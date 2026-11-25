# G160 Resend pronline.org audit

Read-only public DNS on this cycle. No Resend API call. No email sent. The API key value was not printed because it is not set.

## DNS

| Name | Observed | Meaning |
| --- | --- | --- |
| `resend._domainkey.pronline.org` | TXT present, 221 characters | A DKIM-shaped TXT exists. The key material is not copied here. |
| `rsend.pronline.org` | CNAME `rsend-apne1.forge.rmta.net`. TXT `v=spf1 include:amazonses.com ~all`. MX `10 feedback-smtp.ap-northeast-1.amazonses.com` | Resend-like return path. Not a dashboard verification. |
| `send.pronline.org` | CNAME `send.forge.rmta.net`. TXT `v=spf1 ip4:52.3.252.119 ip4:44.222.39.36 ip4:199.249.231.0/24 ~all`. MX `10 feedback.forge.rmta.net` | Resend-like send host. Not a dashboard verification. |
| `_dmarc.pronline.org` | `v=DMARC1; p=none` | DMARC exists with policy none. |
| `pronline.org` | SPF `v=spf1 include:_spf.mail.hostinger.com ~all`. MX `5 mx1.hostinger.com`, `10 mx2.hostinger.com` | Inbound Hostinger mail is still published. |

`pronline.org` is not `notify.pronline.org`. The production catalog sender remains `security@notify.pronline.org`.

## Account and environment

| Check | Result |
| --- | --- |
| Resend MCP or API session | `RESEND_ACCOUNT_NOT_CONNECTED` |
| `RESEND_API_KEY` in this agent | absent |
| `GETPRO_RESEND_VERIFIED_DOMAINS` | absent |
| `GETPRO_RESEND_SENDER_PROFILE` | unset, so the catalog stays on production sender domains |
| Domain verified | no |
| Region confirmed in a dashboard | no. The MX hostname is an observation, not an account region. |

## Status words

| Word | Status |
| --- | --- |
| DNS_READY | records of a Resend-like shape are published |
| DOMAIN_VERIFIED | no |
| API_CONFIGURED | no |
| EMAIL_REQUEST_ACCEPTED | no |
| EMAIL_DELIVERED | no |
| OTP_CHALLENGE_PERSISTED | no |
| OTP_VERIFIED | no |
| PRODUCTION_READY | no |

## Operator checklist

1. Confirm `pronline.org` in the Resend dashboard, exact domain, not `notify.pronline.org`.
2. Create a QA sending-only key. Do not reuse a production key.
3. Install that key only on the testing host.
4. Set `GETPRO_RESEND_VERIFIED_DOMAINS` to the exact verified domain after the dashboard says verified.
5. Set `GETPRO_RESEND_SENDER_PROFILE=hosted-qa` only on testing, so the proposals are `qa-blessboard@pronline.org` and `qa-activeclinic@pronline.org`.
6. Keep a recipient allowlist.
7. Send one manual non-OTP message after the key exists. This cycle did not.
8. Approve and apply the OTP challenge migration before any OTP integration test can pass.
9. Re-run D14C and D16 after that migration. Do not bypass them with a memory store or a fixed code.
