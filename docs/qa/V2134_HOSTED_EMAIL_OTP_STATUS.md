# V2.13.4 hosted email OTP status

**FINAL=V2134_MAC_MINI_OTP_AUDIT**

Date: 27 November 2026  
Inspection was read-only. No hosted infrastructure was changed. No email was sent.

| Field | Value |
| --- | --- |
| LOCAL_SHA | `b781af3318478bff83e98284c81ba32afad23162` |
| REMOTE_SHA | `b781af3318478bff83e98284c81ba32afad23162` |
| REMOTE_MATCH | YES |
| RESEND_VERIFIED | NOT_OBSERVED |
| RESEND_KEY_PRESENT | NO |
| QA_RECIPIENT_CONFIGURED | NO |
| HOSTED_AC_SHA | `b781af331847` |
| HOSTED_BB_SHA | `b781af331847` |
| HOSTED_VERSION | `2.13.4` |
| REAL_EMAIL_ACCEPTED | NOT_RUN |
| REAL_EMAIL_DELIVERED | NOT_RUN |
| OTP_END_TO_END | NO |
| BLOCKERS | No sending-only key, no exact QA recipient, dashboard verification not observable, live identity database absent, delivery gate fail-closed |
| NEXT_ACTION | Do not send mail. Operator must confirm Resend dashboard verification for `pronline.org`, place a sending-only key in the approved secret store, and supply exactly one allowlisted QA recipient outside Git. |

Disposable D14C, D16, cross-worker, replay, atomic consumption, and session-completion checks passed on `getpro_v13_e2e_g78d2301`. That is not proof of email OTP.

## Hosted About and health

Public `GET` only.

| Surface | URL | HTTP | About version | Published SHA | Health environment |
| --- | --- | --- | --- | --- | --- |
| ActiveClinic | `https://activeclinic.pronline.org` | 200 | `2.13.4` | `b781af331847` | `testing` |
| BlessBoard | `https://blessboard.pronline.org` | 200 | `2.13.4` | `b781af331847` | `testing` |

Both `/healthz` responses report:

- `ok=true`
- `deploymentCode=moovex-platform-testing`
- `environment=testing`
- `expectedDatabaseEnvironment=testing`
- `expectedIdentityKey=moovex-platform-v7`
- `platformLine=v8`
- `schemaCompatible=true`
- `jobsEnabled=false`
- `gitSha=b781af331847`
- `branch=V11` and `displayLabel=V11 testing`

The 12-character SHA is the prefix of `origin/V13` `b781af3318478bff83e98284c81ba32afad23162`. About copy says the maintenance text is on branch V13. The live health field still says branch `V11`. Classification used here is the health identity: hosted QA / testing, deployment code `moovex-platform-testing`. This audit did not deploy that SHA.

## Resend

| Check | Result |
| --- | --- |
| Dashboard verified-sender status | NOT_OBSERVED. No API key and no dashboard session |
| `RESEND_API_KEY` in the agent environment | Absent |
| Local secret-store assignment | None found outside example and documentation placeholders |
| `GETPRO_RESEND_QA_RECIPIENTS` | Absent. Exact mailbox remains `UNVERIFIED_ATTACHMENT` |
| `GETPRO_OTP_PEPPER` | Absent |
| `GETPRO_OTP_QA_LIVE_DELIVERY` | Absent |
| OTP delivery activation | Fail-closed. `createChannelAdapter` sets `deliveryActivated: false` |
| Latest provider delivery status | Not accessible |

Public DNS, rechecked without copying key material:

| Record | Observation |
| --- | --- |
| `pronline.org` TXT | SPF includes `_spf.mail.hostinger.com` only |
| `resend._domainkey.pronline.org` TXT | Present. `dig +short` length 220 |
| `rsend.pronline.org` | CNAME `rsend-apne1.forge.rmta.net` |
| `send.pronline.org` | CNAME `send.forge.rmta.net` |
| `_dmarc.pronline.org` | `v=DMARC1; p=none` |

DNS presence is the same class of evidence as G254/G280. It is not dashboard verification. G280 recorded DKIM length 221; this `dig +short` length is 220. The record is present. That difference is not treated as verification.

The approval register still requires an operator-confirmed sending domain, a sending-only key outside Git, and an exact recipient allowlist. None of those credentials were available in this session.

## Why no live mailbox test ran

A live send was not authorized by the fail-closed gate:

1. The exact QA recipient is not configured, so there is no confirmed mailbox.
2. `RESEND_API_KEY` is absent.
3. The live-delivery database name required by this tip, `getpro_v13_e2e_otpqa135`, does not exist.
4. The approved disposable database `getpro_v13_e2e_g78d2301` fails that name check.
5. The approved role cannot read `data_directory` or `unix_socket_directories`, which the live identity probe requires.
6. `deliveryActivated` stays false.

No recipient was emailed. Provider acceptance and mailbox delivery were not observed.

## Disposable result that must not be read as email success

On the approved disposable database only:

| Gate | Result |
| --- | --- |
| D14C | PASS |
| D16 | PASS |
| CROSS_WORKER | PASS |
| REPLAY | PASS |
| ATOMIC_CONSUMPTION | PASS |
| SESSION_COMPLETION | PASS |
| G272 Resend acceptance | BLOCKED_MISSING_CREDENTIALS |
| G272 mailbox | NOT_EXECUTED |

`OTP_END_TO_END=NO` until one authorized recipient receives a message, the code verifies, the protected action completes once, and replay is denied, without the code being written to logs.
