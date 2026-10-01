# V2.04 P0 Burn-Down

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_P0_BURNDOWN` |
| **Mode** | **READ-ONLY** (no repo rediscovery; no code changes) |
| **Source** | `docs/qa/V2_04_FINAL_GAP_AND_TEST_PLAN.md` + referenced completed audits |
| **Excluded** | **REG-STATE-01=CLOSED**, **BB-PROVISION-01=CLOSED** (not listed) |
| **Scope** | Remaining **12** P0 release blockers only |
| **Date** | 2026-10-01 |
| **Finish** | **`V2_04_P0_BURNDOWN_COMPLETE`** |

---

## 0. Why `READY_FOR_PRODUCTION_QA=NO`

Closing REG-STATE-01 and BB-PROVISION-01 removed two defects from the blocker list. **Twelve P0 rows remain** in the final gap plan. Until those are closed or formally waived, the plan correctly keeps:

**`READY_FOR_PRODUCTION_QA=NO`**

Primary reasons (from remaining P0s only):

1. **Six pure product decisions** still unresolved (Church ID uniqueness, multi-membership login context, recovery email criteria, status transition matrices, cells in/out, AC V2.04 contract scope). Engineering cannot truthfully certify MUST behavior without them.
2. **Two HIGH implementation gaps** remain: dual-role destinations (FR-12) and production mount missing `resolveManagedResourceIds` (FR-16 / DR-39).
3. **BlessBoard Members** is in release scope but has **no FEATURE_QA_PASS** (never sanity-tested as a pack).
4. **Two CRITICAL automated test gaps** on FULL implementations (AC-23 privacy; AC-11 OTP complete).
5. **Build/release identity** on the sanity host is unbound (no candidate SHA/DB/migration ceiling sheet).

P1/P2 and DEFERRED work are **not** used below.

---

## 1. Per-P0 analysis (12)

### P0-01

| Field | Value |
|-------|--------|
| **ID** | P0-01 |
| **PRODUCT** | BB |
| **REQ_ID** | FR-02 / BR-01 / DR-1 |
| **SHORT_DESCRIPTION** | Church ID uniqueness scope (per church vs per organization) |
| **GAP_TYPE** | SPEC_DECISION |
| **CURRENT_STATUS** | BLOCKING_DECISION; implementation FULL at `(church_id, lower(trim(member_number)))`; domain COVERED |
| **EVIDENCE** | Gap plan P0 row; Spec Completeness BLOCKING #1; Spec Implementation FR-02 FULL with org-scoped unique index |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | Spec wording conflicts; cannot freeze import/activation/isolation acceptance criteria |
| **DEPENDENCY** | None (root decision). Informs DR-28 login context wording |
| **MINIMUM_ACTION_TO_CLOSE** | Product freezes uniqueness = per **church** **or** per **org**; align FR-02/BR-01 |
| **CAN_ENGINEERING_CLOSE_NOW** | NO |
| **REQUIRES_PRODUCT_DECISION** | YES |
| **REQUIRES_MANUAL_QA** | AFTER_SPEC (T-M03) |

### P0-02

| Field | Value |
|-------|--------|
| **ID** | P0-02 |
| **PRODUCT** | BB |
| **REQ_ID** | Login / DR-28 |
| **SHORT_DESCRIPTION** | Multi-membership login / activation tenant context rules |
| **GAP_TYPE** | SPEC_DECISION |
| **CURRENT_STATUS** | BLOCKING_DECISION; multi-membership data FOUNDATION; selection UX DEFERRED |
| **EVIDENCE** | Gap plan; Spec Completeness BLOCKING #2 |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | MUST login lacks rules when a person has multiple memberships |
| **DEPENDENCY** | Related to P0-01 (Church ID scope) but **distinct** decision |
| **MINIMUM_ACTION_TO_CLOSE** | Product: Church Directory selection = session tenant; document interaction with Church ID |
| **CAN_ENGINEERING_CLOSE_NOW** | NO |
| **REQUIRES_PRODUCT_DECISION** | YES |
| **REQUIRES_MANUAL_QA** | AFTER_SPEC |

### P0-03

| Field | Value |
|-------|--------|
| **ID** | P0-03 |
| **PRODUCT** | BB |
| **REQ_ID** | FR-06 / AC-07 / DR-10 |
| **SHORT_DESCRIPTION** | Password recovery email fallback “where available” |
| **GAP_TYPE** | SPEC_DECISION |
| **CURRENT_STATUS** | BLOCKING_DECISION; implementation PARTIAL (phone OTP only); tests PARTIAL |
| **EVIDENCE** | Gap plan; Spec Implementation FR-06 PARTIAL / DR-10; Spec Completeness BLOCKING #3 |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | Criteria undefined; cannot pass/fail recovery MUST without A vs B |
| **DEPENDENCY** | If Product chooses **B**, unlocks P1 email-channel **implementation** (not a separate P0 here) |
| **MINIMUM_ACTION_TO_CLOSE** | Product: **(A)** phone-only V2.04 **or** **(B)** verified-email OTP if no phone; then impl+test only if B |
| **CAN_ENGINEERING_CLOSE_NOW** | NO (decision first). If A: document phone-only closure. If B: then code |
| **REQUIRES_PRODUCT_DECISION** | YES |
| **REQUIRES_MANUAL_QA** | AFTER_SPEC (T-M05) |

### P0-04

| Field | Value |
|-------|--------|
| **ID** | P0-04 |
| **PRODUCT** | BB |
| **REQ_ID** | Statuses / checklist |
| **SHORT_DESCRIPTION** | Membership + portal status transition matrices (who/when) |
| **GAP_TYPE** | SPEC_DECISION |
| **CURRENT_STATUS** | BLOCKING_DECISION; enums FULL; transitions underspecified; block paths PARTIAL tested |
| **EVIDENCE** | Gap plan; Spec Completeness BLOCKING #4 |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | No actor/transition matrix for INACTIVE/FORMER/BLOCKED↔ACTIVE |
| **DEPENDENCY** | None |
| **MINIMUM_ACTION_TO_CLOSE** | Product publishes membership + portal transition + actor permission matrices |
| **CAN_ENGINEERING_CLOSE_NOW** | NO |
| **REQUIRES_PRODUCT_DECISION** | YES |
| **REQUIRES_MANUAL_QA** | AFTER_SPEC |

### P0-05

| Field | Value |
|-------|--------|
| **ID** | P0-05 |
| **PRODUCT** | BB |
| **REQ_ID** | FR-16 / AC-21 / DR-39 |
| **SHORT_DESCRIPTION** | Leader ↔ managed resource binding + join review scope injector |
| **GAP_TYPE** | IMPLEMENTATION |
| **CURRENT_STATUS** | BLOCKING_DECISION on binding model; scope helper exists; **injector unwired** at production mount; tests COVERED only with **injected** deps |
| **EVIDENCE** | Gap plan AFTER_FIX; Spec Implementation HIGH IMPLEMENTATION_GAP (`createJoinRequestAdminRouter` omits `resolveManagedResourceIds`); Spec Completeness BLOCKING #5 (binding keys) |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | Non-broad leaders fail-closed in real mount; scoped review MUST unproven in production wiring |
| **DEPENDENCY** | **Product freeze of binding model + permission keys (DR-39)** — same root decision as Spec Decision #5; wiring is the engineering half of this P0 |
| **MINIMUM_ACTION_TO_CLOSE** | Freeze keys; **wire `resolveManagedResourceIds`**; add mount-level test (T-A06) |
| **CAN_ENGINEERING_CLOSE_NOW** | YES (wire injector using existing helper; formal key freeze can parallel) |
| **REQUIRES_PRODUCT_DECISION** | YES (binding model / keys) |
| **REQUIRES_MANUAL_QA** | YES after fix (T-M10) |

### P0-06

| Field | Value |
|-------|--------|
| **ID** | P0-06 |
| **PRODUCT** | BB |
| **REQ_ID** | DR-46 |
| **SHORT_DESCRIPTION** | Cells in V2.04? (`MUST IF CELLS`) |
| **GAP_TYPE** | SPEC_DECISION |
| **CURRENT_STATUS** | BLOCKING_DECISION; cell scope ABSENT / UNVERIFIABLE; OUT_OF_SCOPE until decided |
| **EVIDENCE** | Gap plan; Spec Completeness BLOCKING #6; Spec Implementation UNVERIFIABLE DR-46 |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | Conditional MUST cannot be tested or claimed |
| **DEPENDENCY** | If **DEFER**, related P1 cell attendance scope is non-blocking for V2.04 |
| **MINIMUM_ACTION_TO_CLOSE** | Product: **DEFER cells** for V2.04 **or** ship cell mini-spec; if DEFER, reclassify #46 |
| **CAN_ENGINEERING_CLOSE_NOW** | NO |
| **REQUIRES_PRODUCT_DECISION** | YES |
| **REQUIRES_MANUAL_QA** | NO if deferred |

### P0-07

| Field | Value |
|-------|--------|
| **ID** | P0-07 |
| **PRODUCT** | AC |
| **REQ_ID** | AC V2.04 contract |
| **SHORT_DESCRIPTION** | Canonical AC Feature Spec **or** explicit non-product / non-gated scope |
| **GAP_TYPE** | SPEC_DECISION |
| **CURRENT_STATUS** | SPEC_GAP / BLOCKING_DECISION; website + patient foundation implemented; website SANITY_PASS; patient NOT_SANITY_TESTED |
| **EVIDENCE** | Gap plan; Spec Completeness BLOCKING AC Canonical Spec; inventory SPEC_NOT_FOUND |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | Inventing ACs forbidden; cannot objectively gate AC product intent |
| **DEPENDENCY** | Unlocks whether P1 AC-PATIENT-DOMAIN / Stitch matrix / PHI are release-gated |
| **MINIMUM_ACTION_TO_CLOSE** | Author AC Canonical Spec **or** declare Stitch/website presentation-only + patient foundation **non-release-gated** |
| **CAN_ENGINEERING_CLOSE_NOW** | NO |
| **REQUIRES_PRODUCT_DECISION** | YES |
| **REQUIRES_MANUAL_QA** | AFTER_SPEC |

### P0-08

| Field | Value |
|-------|--------|
| **ID** | P0-08 |
| **PRODUCT** | BB |
| **REQ_ID** | FR-12 / AC-13 / DR-27 |
| **SHORT_DESCRIPTION** | Dual-role Member Portal + Church Management destinations |
| **GAP_TYPE** | IMPLEMENTATION |
| **CURRENT_STATUS** | AMBIGUOUS (HIGH completeness); shells exist; **no cross-links**; UNTESTED dual-role journey |
| **EVIDENCE** | Gap plan AFTER_FIX; Spec Implementation HIGH IMPLEMENTATION_GAP FR-12/AC-13 |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | MUST dual experience incomplete (missing destinations / linking UX) |
| **DEPENDENCY** | Soft: Spec Completeness HIGH decision on linked `userId` + explicit destinations — **not** one of the seven formal SPEC_DECISIONS_REQUIRED; treat as engineering-led with Product confirm |
| **MINIMUM_ACTION_TO_CLOSE** | Implement linked dual-role entry points; automated T-A07 + manual T-M08 |
| **CAN_ENGINEERING_CLOSE_NOW** | YES |
| **REQUIRES_PRODUCT_DECISION** | NO (confirm acceptable; not a freeze that blocks starting) |
| **REQUIRES_MANUAL_QA** | YES |

### P0-09

| Field | Value |
|-------|--------|
| **ID** | P0-09 |
| **PRODUCT** | BB |
| **REQ_ID** | FR-01..FR-20 / AC-01..AC-25 |
| **SHORT_DESCRIPTION** | BlessBoard Members feature pack — no FEATURE_QA_PASS |
| **GAP_TYPE** | MANUAL_QA |
| **CURRENT_STATUS** | In release scope; mostly FULL impl; **NOT_SANITY_TESTED**; no FEATURE_QA_PASS |
| **EVIDENCE** | Gap plan; Sanity reconciliation (Members excluded from website sanity) |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | Website sanity must not be treated as Members PASS; pack never executed |
| **DEPENDENCY** | Benefit from P0-01..05/08 decisions & fixes; **requires identity-bound TESTING (P0-10)** before authoritative FEATURE QA |
| **MINIMUM_ACTION_TO_CLOSE** | Run Members FEATURE QA scenario pack on identity-bound build; record FEATURE_QA_PASS |
| **CAN_ENGINEERING_CLOSE_NOW** | NO (manual QA campaign; not a single code change) |
| **REQUIRES_PRODUCT_DECISION** | NO (execution); blocked practically by open decisions for full pack pass |
| **REQUIRES_MANUAL_QA** | YES |

### P0-10

| Field | Value |
|-------|--------|
| **ID** | P0-10 |
| **PRODUCT** | PLATFORM |
| **REQ_ID** | Release identity |
| **SHORT_DESCRIPTION** | Bind tested deploy to candidate (branch / SHA / DB / migrations) |
| **GAP_TYPE** | BUILD_IDENTITY |
| **CURRENT_STATUS** | Sanity host unbound; no identity sheet on sanity report |
| **EVIDENCE** | Gap plan; freeze handoff references candidate SHA but sanity unbound vs candidate |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | Cannot claim production QA against an unidentified build |
| **DEPENDENCY** | Prerequisite for authoritative Members / lifecycle manual QA |
| **MINIMUM_ACTION_TO_CLOSE** | Record branch, app SHA, deploy SHA, DB id, migration ceiling on TESTING (T-M01); refuse production claim without it |
| **CAN_ENGINEERING_CLOSE_NOW** | YES (ops/QA documentation action; no product decision) |
| **REQUIRES_PRODUCT_DECISION** | NO |
| **REQUIRES_MANUAL_QA** | YES (identity recording / confirm About 2.04) |

### P0-11

| Field | Value |
|-------|--------|
| **ID** | P0-11 |
| **PRODUCT** | BB |
| **REQ_ID** | AC-23 |
| **SHORT_DESCRIPTION** | Member privacy — no other-member/admin data (proof gap) |
| **GAP_TYPE** | AUTOMATED_TEST |
| **CURRENT_STATUS** | Spec COMPLETE; implementation FULL; automation **WEAK** (CRITICAL_TEST_GAP) |
| **EVIDENCE** | Gap plan; Spec Implementation AC-23 FULL + TEST_GAP |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | Missing **proof** of cross-member denial — not missing privacy implementation |
| **DEPENDENCY** | Distinct from P0-09 (FEATURE pack) but feeds the same Members confidence story |
| **MINIMUM_ACTION_TO_CLOSE** | Add behavioral cross-member denial test (T-A01) + manual privacy check (T-M11) |
| **CAN_ENGINEERING_CLOSE_NOW** | YES (automated test) |
| **REQUIRES_PRODUCT_DECISION** | NO |
| **REQUIRES_MANUAL_QA** | YES (spot-check) |

### P0-12

| Field | Value |
|-------|--------|
| **ID** | P0-12 |
| **PRODUCT** | BB |
| **REQ_ID** | AC-11 |
| **SHORT_DESCRIPTION** | New recovery phone verified before use (OTP complete path unproven) |
| **GAP_TYPE** | AUTOMATED_TEST |
| **CURRENT_STATUS** | Spec COMPLETE; implementation FULL; automation **PARTIAL** (CRITICAL_TEST_GAP) |
| **EVIDENCE** | Gap plan; Spec Implementation AC-11 FULL + PARTIAL tests (pending/start only) |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | Missing **proof** of OTP success/fail completion — not missing phone-verify implementation |
| **DEPENDENCY** | Distinct proof gap from P0-03 (email fallback decision) |
| **MINIMUM_ACTION_TO_CLOSE** | Add complete OTP success/fail automated tests (T-A03) + manual phone-change (QA07 / T-M07) |
| **CAN_ENGINEERING_CLOSE_NOW** | YES (automated test) |
| **REQUIRES_PRODUCT_DECISION** | NO |
| **REQUIRES_MANUAL_QA** | YES |

---

## 2. Groups (each of 12 assigned once)

### A. PRODUCT DECISION REQUIRED (6)

| ID | REQ_ID | Note |
|----|--------|------|
| P0-01 | FR-02 / BR-01 / DR-1 | Uniqueness freeze |
| P0-02 | Login / DR-28 | Multi-membership session context |
| P0-03 | FR-06 / DR-10 | Phone-only vs email OTP |
| P0-04 | Statuses | Transition matrices |
| P0-06 | DR-46 | Cells in or out |
| P0-07 | AC V2.04 contract | Spec or non-gate waiver |

### B. CODE FIX REQUIRED (2)

| ID | REQ_ID | Note |
|----|--------|------|
| P0-05 | FR-16 / AC-21 / DR-39 | Wire injector (+ product key freeze dependency) |
| P0-08 | FR-12 / AC-13 / DR-27 | Dual-role destinations |

### C. AUTOMATED TEST ONLY (2)

| ID | REQ_ID | Note |
|----|--------|------|
| P0-11 | AC-23 | Impl FULL; proof WEAK |
| P0-12 | AC-11 | Impl FULL; proof PARTIAL |

### D. MANUAL QA ONLY (1)

| ID | REQ_ID | Note |
|----|--------|------|
| P0-09 | FR-01..20 / AC-01..25 | Members FEATURE_QA_PASS missing |

### E. RELEASE/BUILD IDENTITY (1)

| ID | REQ_ID | Note |
|----|--------|------|
| P0-10 | Release identity | Bind TESTING candidate |

### F. OTHER (0)

*(none)*

**Check:** 6 + 2 + 2 + 1 + 1 + 0 = **12**.

---

## 3. Dependency map (do not treat as 12 independent eng tasks)

```
P0-01 Church ID uniqueness ──┐
P0-02 Multi-membership login ←┘ (related identity/tenant decisions)

P0-03 Recovery email A|B ──(if B)──► P1 email channel impl (not a P0)

P0-04 Status matrices (independent)

P0-06 Cells DEFER|IN ──(if DEFER)──► cell P1 scope non-blocking

P0-07 AC contract ──► whether AC patient/PHI/hub are release-gated (P1)

P0-05 DR-39 key freeze ──► wire resolveManagedResourceIds ──► T-A06 / T-M10
P0-08 Dual-role destinations ──► T-A07 / T-M08

P0-10 Build identity ──► authoritative P0-09 Members FEATURE QA
P0-11 AC-23 auto + P0-12 AC-11 auto ──► strengthen Members confidence (≠ substitute for P0-09)
```

**Shared root (counted once for DISTINCT):** Spec Decision #5 (leader↔resource binding) underlies the **decision half** of P0-05; the **distinct engineering deliverable** remains injector wiring.

---

## 4. Shortest-path closure order

1. **P0-10** — Bind release identity on TESTING (unblocks authoritative manual claims).  
2. **P0-11 + P0-12** — Land critical automated proofs (AC-23, AC-11) in parallel.  
3. **P0-08** — Dual-role destinations (engineering-led).  
4. **P0-05** — Wire `resolveManagedResourceIds`; parallel Product freeze of DR-39 keys.  
5. **Batch Product decisions (P0-01, P0-02, P0-03, P0-04, P0-06, P0-07)** — seven formal decisions; P0-03 choice A closes without email code; P0-06 DEFER closes without cell code; P0-07 waiver can de-scope AC patient gating.  
6. **P0-09** — Execute Members FEATURE QA on identity-bound build after critical fixes/decisions.  
7. Recompute `READY_FOR_PRODUCTION_QA` only when **all 12** are CLOSED or waived.

---

## 5. Fastest closable now (`CAN_ENGINEERING_CLOSE_NOW=YES`)

| ID | Action |
|----|--------|
| P0-10 | Record identity sheet |
| P0-11 | Write AC-23 denial test |
| P0-12 | Write AC-11 OTP complete tests |
| P0-08 | Dual-role entry points |
| P0-05 | Wire injector |

**FASTEST_CLOSABLE_NOW = 5**

---

## 6. Distinct root blockers

| # | Root blocker | Covers |
|---|--------------|--------|
| 1 | Church ID uniqueness decision | P0-01 |
| 2 | Multi-membership login context decision | P0-02 |
| 3 | Recovery email criteria decision | P0-03 |
| 4 | Status transition matrices decision | P0-04 |
| 5 | Scoped ministry review (DR-39 freeze + injector) | P0-05 |
| 6 | Cells in/out decision | P0-06 |
| 7 | AC V2.04 contract decision | P0-07 |
| 8 | Dual-role destinations implementation | P0-08 |
| 9 | Members FEATURE_QA_PASS missing | P0-09 |
| 10 | Unbound build/release identity | P0-10 |
| 11 | Privacy automation proof gap | P0-11 |
| 12 | Phone OTP completion automation proof gap | P0-12 |

**DISTINCT_ROOT_BLOCKERS = 12** (one primary root per remaining P0; P0-05’s product+code halves share one scoped-review root narrative but remain one P0 row).

---

## 7. Footer counts

P0_TOTAL=12
P0_PRODUCT_DECISION=6
P0_CODE=2
P0_AUTOMATED_TEST=2
P0_MANUAL_QA=1
P0_BUILD_IDENTITY=1
P0_OTHER=0
DISTINCT_ROOT_BLOCKERS=12
FASTEST_CLOSABLE_NOW=5
FINAL=V2_04_P0_BURNDOWN_COMPLETE
