# V2134 G280 email OTP final execution

Branch `V13`. Started from actual `origin/V13` (newer than prompt base `df517e57…`).  
About versions already `2.13.4` before this cycle; no additional version bump required after OTP push.

## What was fixed (source)

- Non-production `GETPRO_OTP_ACTIVATION=ACTIVE` honored (production still forced BLOCKED).
- AC/BB forgot-password: eligible identity peek → begin OTP challenge → `/forgot-password/otp-verify` → `completeProtectedAction` once → then existing reset-link issuance.
- Hosted-QA Resend recipient allowlist (`GETPRO_RESEND_QA_RECIPIENTS`) fail-closed.
- Resend preflight/diagnostics; deliveryActivated remains false.
- Security matrix + recovery lifecycle tests.
- Schema **not** applied this cycle (not authorized). Disposable tables may already exist from prior G301 approval.

## What remains externally blocked

| Dependency | Status |
| --- | --- |
| Resend dashboard verification | NOT_OBSERVED |
| `RESEND_API_KEY` in approved secret store | ABSENT in agent env |
| `GETPRO_RESEND_VERIFIED_DOMAINS` / hosted-qa profile | UNSET |
| `GETPRO_RESEND_QA_RECIPIENTS` | UNSET |
| Live mailbox confirmation | NOT_EXECUTED |
| Migration 048 / re-apply SQL | NOT AUTHORIZED |

## Dual suite results (after final source changes)

| Suite | Result |
| --- | --- |
| Safe ×2 | 615 pass / 0 fail / 2 skip |
| HTTP g79 ×2 | 41 / 40 / 1 (D25 slot only) |
| AC Playwright ×2 | 32 pass |
| BB Playwright ×2 | 23 pass |
| Community mock ×2 | 9 pass |
| D14C / D16 / G185 / G272 PG | PASS |
| D25 overlap | PASS |
| D25 slot | FAIL expected / unapproved |

## EMAIL_OTP_QA_GO_NO_GO

**NO-GO** until authorized mailbox confirmation succeeds.
