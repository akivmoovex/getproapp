# V2.13.2 G139 — Resend configuration

Branch `V13`. Starting HEAD and `origin/V13` were `500d648f8e4bace54d6291567ea73057920c9c07`. BlessBoard and ActiveClinic remain `2.13.2`. No DNS change was made. No Resend plan was purchased or upgraded. No email was sent.

## Account status

Resend MCP is not available in this session. `RESEND_API_KEY` was unset in the agent environment. Account connection, plan, domain verification, and DNS record values were not observed. This document does not invent them.

| Item | Status |
| --- | --- |
| Account | NOT_CONNECTED |
| Plan | NOT_OBSERVED. The requested target is the free plan |
| API key | NOT_CONFIGURED |
| DNS records | NOT_VERIFIED |
| Email delivery | NOT_TESTED |

## Sending identities

These domains are catalog identities. They are not treated as verified until an operator confirms each one in Resend and lists it in `GETPRO_RESEND_VERIFIED_DOMAINS`.

| Product | Domain | From |
| --- | --- | --- |
| BlessBoard | `notify.blessboard.com` | BlessBoard Security `<security@notify.blessboard.com>` |
| ActiveClinic | `notify.activeclinic.org` | ActiveClinic Security `<security@notify.activeclinic.org>` |
| PROnline | `notify.pronline.org` | PROnline Security `<security@notify.pronline.org>` |
| NEUniversity | NOT_CONFIGURED | Do not add a domain |

## Operator setup

1. Sign in to the existing Resend account. Do not create a paid upgrade from this repository.
2. Add only the three domains above. Leave NEUniversity unset.
3. Open each domain in the Resend dashboard and copy the TXT and MX records it displays. This repository does not contain those values. Do not type SPF, DKIM, or return-path records from memory or from this file.
4. After Resend shows a domain as verified, add that exact domain to `GETPRO_RESEND_VERIFIED_DOMAINS`, comma-separated. Leave the variable empty until then. Empty means no catalog sender may send.
5. Create a sending-only API key in Resend. Store it as `RESEND_API_KEY` in the host environment. Do not commit it, print it, or place it in a tracked file.
6. Keep production OTP disabled until `platform.otp_challenges` exists and the security gates pass. A configured key does not activate OTP.

Existing transactional mail still requires the production identity gate in `liveEmailTransportDecision` before a live adapter is constructed. Credential variables alone do not enable sending.
