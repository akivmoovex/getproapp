# V2.04 BB Stitch — Phase 5 Member Activation + Login

| Field | Value |
|-------|--------|
| **Phase** | 5 — MEMBER ACTIVATION + LOGIN |
| **Branch** | `V4` |
| **Stitch project** | `projects/12773983203917549893` |
| **Screens** | BB-M13 … BB-M19 |
| **Result** | **BB_V204_MEMBER_AUTH_BLOCKED** |

## Verdict

**BB_V204_MEMBER_AUTH_BLOCKED**

Functional member portal auth (activation, Church ID login, recovery, blocked gate, rate limits, session revoke, audit) is implemented and tested. Exact Stitch visual parity for M13–M19 is **blocked** because those frames are **not present** in the V2.04 Stitch project (listed screens stop at M01–M06 / A* / R*). Legacy church Stitch (`17124191473876947591`) has related `09-auth-member-login-*` and `13-auth-forgot-password-*` only — not the V2.04 M13–M19 set.

UI ships on existing BlessBoard auth chrome (`tenant-auth.css` / `apex-auth.css` + `member-auth.css`) pending Stitch frames.

## Delivered (functional)

| Screen | Route | Behavior |
|--------|-------|----------|
| **M13** Member Login | `GET/POST /member/login` | Church ID + password; apex staff `/login` preserved |
| **M14** First-Time Verification | `GET/POST /member/activate` | Exact Church ID + full name + phone; email optional; no fuzzy match; no membership create on failure |
| **M15** Create Password | `POST /member/activate/password` | ≥8, 1 uppercase, 1 special; signed draft token |
| **M16** Portal Activated | success view after activate / reset | Continue to `/member/login` |
| **M17** Forgot Password | `GET/POST /member/forgot-password` | Church ID → **verified phone OTP only** (PD-V204-BB-03); enumeration-safe; no email fallback in V2.04 |
| **M18** Recovery Verification | `POST /member/forgot-password/verify` | OTP + new password; sessions revoked on success |
| **M19** Recovery Failure | `?lost=1` + OTP failure | Lost Church ID = contact church only; no automated ID recovery |

### Security
- Rate limits on activate / login / recovery (**PD-V204-BB-P1-04** temporary freeze: **8 / 15 min** per bucket; neutral lockout message)
- Portal `blocked` cannot login; `requireActiveMemberForTenant` adds `PORTAL_BLOCKED`
- Password reset revokes sessions for the BlessBoard user (**PD-V204-BB-P1-03** OPTION A — all church-scoped sessions for that userId)
- Staff `setPortalAccessStatus(blocked)` already revokes sessions (same Option A)
- Audit keys: `members.portal_activation_*`, `members.portal_login*`, `members.portal_recovery_*`, `members.portal_password_reset`
- Platform session cookie via `issueAuthenticatedSessionCookie`

### Code
- `src/blessboard/services/blessBoardMemberPortalAuthService.js`
- `src/blessboard/http/memberPortalAuthRoutes.js` (mounted before member portal router)
- `views/blessboard/v5/member-auth/*.ejs`
- `public/blessboard/v5/member-auth.css`

## Gaps / blockers
1. **P0 for parity:** V2.04 Stitch has no completed BB-M13–M19 screens → cannot claim exact visual parity.
2. Tenant public “Member Login” CTA still points at `/login` (apex transfer) in places; Church ID portal is `/member/login`.
3. Optional email on activation uses synthetic `@members.blessboard.app` when creating the user if no email on file.

## Tests
`node --test tests/v2-04-bb-member-auth.test.js` — **pass** (happy + negative: exact verify, weak password, blocked login, enumeration-safe recovery, lost Church ID, OTP fail/success + session revoke, rate limit, wiring).

BB_V204_MEMBER_AUTH_BLOCKED
