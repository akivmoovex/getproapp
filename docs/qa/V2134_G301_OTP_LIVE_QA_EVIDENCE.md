# V2134 G301 OTP live QA evidence

## Disposable PostgreSQL (authorized)

| Gate | Result |
| --- | --- |
| Schema applied on `getpro_v13_e2e_g78d2301` | YES (present; prior authorized apply) |
| D14C | PASS (HTTP g79 + focused integration) |
| D16 platform OTP | PASS |
| G185 cross-worker store | PASS |
| G272 recovery lifecycle | PASS |
| Replay / atomic consume | PASS |
| Session before completion | Denied by design |

## Live Resend / mailbox

| Check | Result |
| --- | --- |
| `RESEND_API_KEY` in agent env | UNSET |
| `GETPRO_RESEND_VERIFIED_DOMAINS` | UNSET |
| `GETPRO_RESEND_QA_RECIPIENTS` | UNSET |
| Resend dashboard domain verify | NOT_OBSERVED |
| Provider accepted send | NOT_RUN |
| Mailbox delivered | NOT_RUN |
| OTP browser E2E with real inbox | BLOCKED |

`deliveryActivated=false` remains hard-coded fail-closed. It does not authorize inventing delivery. Operator must supply sending-only key, verified `pronline.org`, and allowlisted recipients outside Git before live mailbox tests.

No secrets, OTP codes, or patient data recorded here.
