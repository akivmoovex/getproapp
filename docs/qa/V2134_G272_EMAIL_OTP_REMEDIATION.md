# V2134 G272 email OTP remediation

Branch `V13`. Started from actual `origin/V13` tip (newer than prompt SHA
`8ef0a151…`). G223/G224/G240/G301–G315 work preserved. Version left at 2.13.4.
No `main` changes. No deployment. Migration `048` not created. Reviewed OTP SQL
was **not** re-applied in this cycle (tables may already exist on the disposable
DB from prior owner-authorized G301 work).

## Root cause

1. Production OTP activation remains intentionally `BLOCKED` until migration,
   provider, and release verification are all satisfied.
2. `deliveryActivated` remains hard-`false`; live network delivery is forbidden
   without a separate activation policy.
3. Password recovery still defaults to **password-reset links** while OTP
   activation is blocked. When OTP is ACTIVE without a proven account binding,
   recovery must stay enumeration-safe.
4. Resend live delivery cannot run: `RESEND_API_KEY` absent, verified-domain
   allowlist unset in the agent environment, and no authorized QA mailbox list.

## Source corrections

- `otpReadinessDiagnostics.js` — operator-safe readiness/database/provider report
- `otpPasswordRecoveryBridge.js` — recovery mode bridge (link vs code OTP)
- Session gate: password-recovery unresolved accounts suppress without blocking
  the neutral link path; resolved ACTIVE accounts require a code challenge
- AC/BB/patient forgot-password routes use the recovery bridge and surface OTP
  metadata attributes when held
- Resend OTP transport preflight (`diagnoseResendOtpTransport`) fail-closed
- Unit, contract, and disposable PostgreSQL lifecycle tests (`g272-*`)

## Verification

| Check | Result |
| --- | --- |
| Persistent challenge on disposable PG | PASS (existing tables; not applied this cycle) |
| Cross-worker D14C/D16/G185 | PASS (context bucket isolation restored) |
| G272 recovery lifecycle PG | PASS (challenge → verify → complete once → replay reject; Resend fail-closed) |
| Resend domain dashboard verification | BLOCKED / NOT_OBSERVED |
| Resend API key | BLOCKED / absent |
| Provider acceptance | BLOCKED (missing credentials) |
| QA mailbox receipt | NOT_EXECUTED |
| Browser live email OTP AC/BB | NOT_EXECUTED |
| Browser recovery under default BLOCKED activation | link-reset path preserved (AC-AUTH-04 / BB suites) |
| Delivery activated | false (preserved) |
| Safe suite ×2 | 609 pass / 0 fail / 2 skip |
| HTTP g79 ×2 | 41 / 40 / 1 (D25 slot only) |

## EMAIL_OTP_QA_GO_NO_GO

**NO-GO** — real end-to-end mailbox verification was not executed.

## Required operator action

1. Confirm Resend dashboard verification for the intended sender domain(s).
2. Store a sending-only API key in the approved QA secret store.
3. Supply exact allowlisted QA recipients outside Git.
4. Separately authorize live mailbox OTP and any hosted QA deploy.
5. Do not treat disposable PostgreSQL PASS as production OTP activation.
