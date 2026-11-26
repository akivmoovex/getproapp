# V2134 G298 final issue register

Compared against G281 master register after G300 dual suites on tip with SOAP print fix.

| ID | Status | Fix / evidence | External blocker |
| --- | --- | --- | --- |
| OTP-LIVE-MAILBOX | BLOCKED | Source fail-closed | Resend key/domain/allowlist |
| OTP-MIGRATION-048 | BLOCKED | Reviewed SQL only | Shared/hosted apply |
| D14C-D16 | VERIFIED_DISPOSABLE | g79 + g185/g272 ×2 | Live mailbox |
| D25-SLOT | BLOCKED_BY_POLICY | Test kept FAIL | Product decision |
| D25-OVERLAP | VERIFIED | HTTP PASS | — |
| LAB-E2E | VERIFIED | AC G224 ×2 | Hosted retest |
| RAD-E2E | VERIFIED | AC G229 ×2 | Hosted retest |
| PRINT-SOAP-IDENTITY | FIXED+VERIFIED | G168 browser + g300 unit | Hosted visual |
| PUBLIC-BOOKING | DISABLED | AC-PUB-01 | Policy |
| CB-POSTING | DISABLED | G206 posting_disabled | Legal/commercial |
| HOSTED-RETEST | BLOCKED | Package only | Owner deploy |
| AC-05 | VERIFIED | Browser + D22 | — |

`ALL_FIXED=NO` — P0 live mailbox and schema/policy gates remain.
