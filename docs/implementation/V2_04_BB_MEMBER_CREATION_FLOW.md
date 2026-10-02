# V2.04 BB Stitch — Phase 3 Member Creation Completion

| Field | Value |
|-------|--------|
| **Phase** | 3 — MEMBER CREATION COMPLETION |
| **Branch** | `V4` |
| **Stitch** | `projects/12773983203917549893` · BB-M03 / BB-M04 / BB-M05 |
| **Result** | **BB_V204_MEMBER_CREATION_FLOW_PASS** |

## Flow

```
Add Member (M02)
  → normalize + duplicate check
  → NO MATCH → Review (M04) → Confirm & Create → Success (M05)
  → POSSIBLE MATCH → Possible Member Match (M03)
       → Open Existing (navigate only; never merge)
       OR Confirm Different Person → Review (M04) → Create → Success (M05)
  → EXACT Church ID collision → M03 blocked (no Different Person CTA)
```

## Delivered

### BB-M03 Possible Member Match
- Template `member-match.ejs` + POST `/branch-admin/members/new/match`
- Entered card vs possible match cards (church-scoped only)
- CTAs: Back to Form · Open Existing Member · This Is a Different Person
- Hard Church ID block hides Different Person

### BB-M04 Review New Member
- Template `member-review.ejs` + POST `/branch-admin/members/new/review`
- Step 3 of 3 · portal **NOT ACTIVATED** · Confirm & Create Member
- Duplicate-passed vs staff-override banners

### BB-M05 Member Created
- GET `/branch-admin/members/:id/created`
- Success state + Record Summary Card
- Return to Directory · View Profile · Add Another Member

### Backend
- `blessBoardStaffAddMemberFlowService.js` — signed draft (`bbam1`), match gate, createToken idempotency
- Create still via `createStaffManagedMember` (audit + portal `not_activated`)
- Never auto-merge; cross-church cards dropped in `presentMatchCards`

## Rules enforced

| Rule | How |
|------|-----|
| Never auto-merge | Open Existing → redirect only (`merged: false`) |
| Duplicate Church ID = block | `MATCH_BLOCKED`; Different Person denied |
| Probable phone / name+DOB = review | `MATCH_REQUIRED` → M03 |
| No cross-tenant leak | Present only same-`churchId` members |
| Portal initially NOT_ACTIVATED | Domain + review/success chips |
| Audit creation | `members.create` audit via domain service |
| Double-submit | `createToken` map → `IDEMPOTENT_REPLAY` |

## Tests

`node --test tests/v2-04-bb-member-creation-flow.test.js tests/v2-04-bb-m01-m02-members.test.js` — pass.

Coverage: Church ID collision, phone match, name+DOB, different person, open existing (no merge), cross-tenant isolation, successful create + portal, double-submit, draft actor isolation.

## Gaps (accepted)

1. Dedicated Stitch mobile frames absent — responsive from desktop M03–M05.
2. Gender / baptism still presentation-only (schema gap from Phase 2).
3. Stitch “Quick Pastoral Actions” on M05 omitted (non-functional chrome).
4. Person reuse remains via domain `reusePersonId` / workflow — Open Existing does not link a new membership.

BB_V204_MEMBER_CREATION_FLOW_PASS
