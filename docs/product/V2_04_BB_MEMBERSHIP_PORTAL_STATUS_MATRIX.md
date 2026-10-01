# V2.04 BlessBoard — Membership & Portal Status Transition Matrix

**Doc ID:** `V2_04_BB_MEMBERSHIP_PORTAL_STATUS_MATRIX`  
**Normative for:** PD-V204-BB-04 OPTION A  
**Status:** `TEMPORARY_APPROVED_FOR_V2_04` · `REVIEW_LATER=YES`  
**Product:** BlessBoard  

This document is the V2.04 temporary Product freeze for membership and portal lifecycle transitions. Status **values** remain as in the Canonical Feature Spec; this matrix defines **who may transition what**.

---

## Portal access

| From | To | Actor |
|------|----|-------|
| NOT_ACTIVATED | ACTIVE | Member activation flow only |
| ACTIVE | BLOCKED | Authorized admin (`members.block`) |
| BLOCKED | ACTIVE | Authorized admin (`members.block`), only if membership is ACTIVE |

Admin APIs must not set NOT_ACTIVATED → ACTIVE (activation owns that edge).

---

## Membership

| From | To | Actor |
|------|----|-------|
| ACTIVE | INACTIVE | Authorized admin (`members.edit`) |
| INACTIVE | ACTIVE | Authorized admin (`members.edit`) |
| ACTIVE or INACTIVE | FORMER | Authorized admin (`members.edit`) |
| ACTIVE or INACTIVE | DECEASED | Authorized admin (`members.edit`) |
| ACTIVE | TRANSFERRED | Authorized admin through controlled transfer / lifecycle edit |

Unlisted edges (e.g. FORMER → ACTIVE, DECEASED → *, TRANSFERRED → *) are **forbidden** for V2.04 unless Product revises this matrix.

---

## Cross-cutting rules

1. Membership that becomes **INACTIVE**, **FORMER**, **DECEASED**, or **TRANSFERRED** must **not** retain ordinary **ACTIVE** portal access unless an explicitly documented exception exists.  
   - Implementation: ACTIVE portal → NOT_ACTIVATED; BLOCKED portal may remain BLOCKED.  
2. Privileged lifecycle transitions require **audit records** (before/after membership and portal, actor, reason when provided).  
3. Blocking portal access preserves membership history (membership status unchanged on block/unblock).  
4. Login and portal gates deny ordinary access when membership is not ACTIVE or portal is BLOCKED / NOT_ACTIVATED.

---

## Related temporary decisions

| ID | Decision | Status |
|----|----------|--------|
| PD-V204-BB-01 | Church ID unique per church | TEMPORARY_APPROVED_FOR_V2_04 |
| PD-V204-BB-02 | Select Church binds tenant; resolve Church ID inside selected church | TEMPORARY_APPROVED_FOR_V2_04 |
| PD-V204-BB-03 | Phone OTP recovery only; no email fallback | TEMPORARY_APPROVED_FOR_V2_04 |
| PD-V204-BB-05 | Cells deferred | TEMPORARY_APPROVED_FOR_V2_04 |
| PD-V204-AC-01 | AC presentation-only; patient non-gated | TEMPORARY_APPROVED_FOR_V2_04 |
