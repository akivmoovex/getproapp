# V2134 G280 OTP security matrix

| # | Case | Result |
| --- | --- | --- |
| 1 | Correct recipient / resolved account + ACTIVE | Challenge issued (fake/testing) |
| 2 | Unknown recipient | Enumeration-safe suppress / neutral link path |
| 3 | Wrong OTP | Rejected |
| 4 | Expired OTP | Covered by D14C/D16 policy |
| 5 | Reused OTP / replay | Rejected after completeProtectedAction |
| 6–7 | Parallel verify / completion | One completion wins (D14C/G185) |
| 8 | Wrong tenant | Cross-tenant denied (G185) |
| 9 | Wrong product | Denied by product check |
| 10 | Wrong purpose | Denied |
| 11–12 | Missing/wrong pepper | Fail closed |
| 13 | Missing API key | Resend preflight fail closed |
| 14–15 | Wrong/unverified sender domain | Fail closed |
| 16–20 | Resend 401/403/429/timeout/unavailable | Covered by existing g140 transport mocks |
| 21 | Duplicate delivery idempotency | Covered by transport |
| 22–23 | Cross-worker / restart persistence | PASS on disposable PG when tables present |
| 24–25 | No session before completion; one-time completion | PASS |
| 26–27 | No plaintext OTP in DB / no secrets in logs | PASS (hashed store; diagnostics sanitize) |
| 28 | No fake OTP in production | PASS |
| 29 | Rate-limit persistence | PASS (unique context isolation) |
| 30 | Forgot Password neutral response | PASS when activation BLOCKED / unresolved |

Live mailbox rows are **BLOCKED**, not PASS.
