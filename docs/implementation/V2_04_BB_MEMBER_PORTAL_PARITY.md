# V2.04 BB Stitch — Phase 6 Member Portal

| Field | Value |
|-------|--------|
| **Phase** | 6 — MEMBER PORTAL |
| **Branch** | `V4` |
| **Stitch project** | `projects/12773983203917549893` |
| **Screens** | BB-M20 … BB-M27 |
| **Result** | **BB_V204_MEMBER_PORTAL_BLOCKED** |

## Verdict

**BB_V204_MEMBER_PORTAL_BLOCKED**

Functional member portal behaviour for M20–M27 requirements is implemented and tested (self-edit fields, phone verification gate, always-PENDING ministry join, member-scoped requests, mobile 390 CSS). Exact Stitch visual parity is **blocked** because BB-M20–M27 frames are **not present** in the V2.04 Stitch project (same gap as Phase 5 M13–M19). UI continues on existing member-portal chrome with V2.04 screen markers.

## Delivered (functional)

| Screen | Route | Notes |
|--------|-------|--------|
| **M20** Homepage | `GET /member` | Church/branch context; announcements/events/ministries previews (tenant content, not public website dump) |
| **M21** My Profile | `GET /member/profile` | Read view; Church ID + official branch read-only |
| **M22** Edit My Profile | `GET/POST /member/profile/edit` | Name, phone, email, DOB, residence, occupation, marital, children, next of kin |
| **M23** Verify New Phone | `GET/POST /member/profile/phone-verify` | New phone stays pending until OTP succeeds |
| **M24** Ministries | `GET /member/ministries` | List / filters |
| **M25** Ministry detail | `GET/POST …/join` | **Request to Join → PENDING only** (open policy no longer auto-activates) |
| **M26** My Requests | `GET /member/requests` | Scoped to authenticated member (`forMember: true`) |
| **M27** Request detail | `GET /member/requests/:id` | Same member + church isolation |

### Hard rules enforced
- Cannot edit Church ID or official membership branch via portal forms
- Phone change → `phone_pending_*` + verification required before verified contact
- Ministry self-join never creates `active` membership
- Requests listed/loaded only for `scope.memberId`
- Mobile ≤390px layout rules in `member-portal-v204.css`

## Gaps / blockers
1. **P0 for parity:** No completed Stitch screens BB-M20–M27 in project `12773983203917549893`.
2. Departments join UI not separately framed (ministries path covers Request→PENDING; department join service remains available in join-request domain).
3. Exact Stitch desktop/mobile visual diff deferred until frames exist.

## Tests
`node --test tests/v2-04-bb-member-portal.test.js` — pass.

BB_V204_MEMBER_PORTAL_BLOCKED
