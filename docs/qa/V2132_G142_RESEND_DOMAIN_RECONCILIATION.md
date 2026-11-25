# V2.13.2 G142 — Resend domain reconciliation

Branch `V13`. Starting HEAD and `origin/V13` were `a8e6e688b0840d063a38d031eb79f6599636cc01`. BlessBoard and ActiveClinic About pages in this worktree say `2.13.2`. No email was sent. No DNS record was changed. No API key was read out or written to git.

## What was observed

Resend MCP is not available. In this process, `RESEND_API_KEY`, `GETPRO_RESEND_VERIFIED_DOMAINS`, and the product `EMAIL_FROM` variables were unset. Domain verification status is `DOMAIN_VERIFICATION_NOT_OBSERVED`. A Hostinger DNS entry is not treated as Resend verification.

The operator reported an earlier Resend dashboard domain name of `pronline.org`. This session did not open that dashboard and does not confirm that report.

## Names that must stay distinct

| Name | Role |
| --- | --- |
| `pronline.org` | Reported Resend domain. Not re-observed. Not added to the allowlist |
| `notify.pronline.org` | Production catalog domain for PROnline Security `<security@notify.pronline.org>` |
| `notify.blessboard.com` | Production BlessBoard catalog domain |
| `notify.activeclinic.org` | Production ActiveClinic catalog domain |

The adapter compares the From address domain with `GETPRO_RESEND_VERIFIED_DOMAINS` by exact string. `pronline.org` does not authorize `security@notify.pronline.org`. `notify.pronline.org` does not authorize `qa-blessboard@pronline.org`.

## Sender profiles

Production identities are unchanged. They send only when their own domain is listed in `GETPRO_RESEND_VERIFIED_DOMAINS`.

`GETPRO_RESEND_SENDER_PROFILE=hosted-qa` selects proposed hosted testing addresses:

| Product | Proposed From | Exact domain required |
| --- | --- | --- |
| BlessBoard | BlessBoard QA `<qa-blessboard@pronline.org>` | `pronline.org` |
| ActiveClinic | ActiveClinic QA `<qa-activeclinic@pronline.org>` | `pronline.org` |
| PROnline | Not configured in this profile | — |
| NEUniversity | Not configured | — |

These addresses are proposals. They are not mailboxes, and they are not verified. With the profile unset, or with the verified-domain list empty, the proposal does not send. Production OTP activation stays `BLOCKED` even when the profile and a verified domain are both set.

## Operator steps after a separate approval

1. In Resend, read the domain status for `pronline.org` and for `notify.pronline.org` separately.
2. Copy only a domain Resend marks verified into `GETPRO_RESEND_VERIFIED_DOMAINS`.
3. For hosted QA mail, set `GETPRO_RESEND_SENDER_PROFILE=hosted-qa` and create the two proposed addresses in Resend only after `pronline.org` is verified.
4. Store `RESEND_API_KEY` in the host environment. Do not commit it.
5. Leave production OTP disabled until `platform.otp_challenges` exists and that gate is explicitly approved.
