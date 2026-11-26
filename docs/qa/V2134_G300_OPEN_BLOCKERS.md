# V2134 G300 open blockers

| Blocker | Severity | Required approval | Operator action | Impact |
| --- | --- | --- | --- | --- |
| Live Resend mailbox OTP | P0 | Platform + security | Verify pronline.org in Resend; install sending-only QA key; set recipient allowlist | OTP E2E incomplete |
| Migration 048 shared/hosted | P0 | DB owner | Approve SQL + backup; do not use disposable-only evidence as hosted proof | Cross-worker hosted OTP |
| D25 slot capacity | P1 | Product | Approve Option B (integer+scope) or C (overlap is capacity) per G183 | Capacity gate stays FAIL |
| Community posting / agreements | P1 | Product + legal | Keep disabled or approve commercial terms | No live discounts/settlements |
| Public booking | P0 | Product | Keep disabled | Public book unavailable |
| Hosted visual clinical print parity | P1 | Owner after deploy | Browser acceptance guide print checks | Visual only |
| Production release | — | Owner | Refuse until gates clear | NO-GO |

`deliveryActivated=false` is intentional fail-closed; it does not authorize bypassing Resend readiness. It blocks accidental live activation, not authorized QA transport once key/domain/allowlist exist.
