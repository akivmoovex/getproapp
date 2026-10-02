# V2.04 P0 Burn-Down

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_P0_BURNDOWN` |
| **Mode** | **UPDATED** after product decision approvals (2026-10-01) |
| **Source** | `docs/qa/V2_04_FINAL_GAP_AND_TEST_PLAN.md` + `docs/product/V2_04_PRODUCT_DECISION_REGISTER.md` |
| **Excluded / CLOSED** | REG-STATE-01, BB-PROVISION-01; **P0 product decisions PD-V204-BB-01..05 + PD-V204-AC-01** |
| **Scope** | Remaining **6** P0 release blockers |
| **Date** | 2026-10-01 |
| **Finish** | **`V2_04_PRODUCT_DECISIONS_APPLIED`** |

---

## 0. Why `READY_FOR_PRODUCTION_QA=NO`

Six former P0 product decisions are **TEMPORARY_APPROVED_FOR_V2_04** (`REVIEW_LATER=YES`). **Six non-product P0 rows remain.** Until those are closed or formally waived:

**`READY_FOR_PRODUCTION_QA=NO`**

Primary remaining reasons:

1. **Two HIGH implementation gaps:** dual-role destinations (FR-12); join `resolveManagedResourceIds` unwired (FR-16 / DR-39).  
2. **BlessBoard Members** in release scope with **no FEATURE_QA_PASS**.  
3. **Two CRITICAL automated test gaps** (AC-23 privacy proof; AC-11 OTP complete).  
4. **Build/release identity** unbound on the sanity host.

---

## 0.1 Closed P0 product decisions

| Burn-down | Decision | Approved | Impl class |
|-----------|----------|----------|------------|
| P0-01 | PD-V204-BB-01 | OPTION A (unique per church) | DOC_ONLY + TEST_ONLY |
| P0-02 | PD-V204-BB-02 | OPTION A (Select Church binds tenant) | DOC_ONLY + TEST_ONLY |
| P0-03 | PD-V204-BB-03 | OPTION A (phone OTP only) | DOC_ONLY + TEST_ONLY |
| P0-04 | PD-V204-BB-04 | OPTION A (status matrix) | CODE_CHANGE_REQUIRED (applied) |
| P0-06 | PD-V204-BB-05 | DEFER cells | DOC_ONLY |
| P0-07 | PD-V204-AC-01 | OPTION B (presentation; patient non-gated) | DOC_ONLY |

Normative matrix: `docs/product/V2_04_BB_MEMBERSHIP_PORTAL_STATUS_MATRIX.md`  
AC scope: `docs/product/V2_04_AC_PRODUCT_CONTRACT_SCOPE.md`

**P0_PRODUCT_DECISION_REMAINING = 0**

---

## 1. Remaining P0 analysis (6)

### P0-05

| Field | Value |
|-------|--------|
| **ID** | P0-05 |
| **PRODUCT** | BB |
| **REQ_ID** | FR-16 / AC-21 / DR-39 |
| **SHORT_DESCRIPTION** | Leader ↔ managed resource binding + join review scope injector |
| **GAP_TYPE** | IMPLEMENTATION |
| **CURRENT_STATUS** | Scope helper exists; **injector unwired** at production mount; DR-39 keys still need freeze |
| **WHAT_EXACTLY_BLOCKS_RELEASE** | Non-broad leaders fail-closed in real mount; scoped review MUST unproven |
| **MINIMUM_ACTION_TO_CLOSE** | Freeze keys; **wire `resolveManagedResourceIds`**; mount-level test (T-A06) |
| **CAN_ENGINEERING_CLOSE_NOW** | YES (wire helper; key freeze parallel) |
| **REQUIRES_PRODUCT_DECISION** | Partial (DR-39 keys — P1 register item; not a separate P0_PRODUCT_DECISION row) |
| **REQUIRES_MANUAL_QA** | YES after fix (T-M10) |

### P0-08

| Field | Value |
|-------|--------|
| **ID** | P0-08 |
| **PRODUCT** | BB |
| **REQ_ID** | FR-12 / AC-13 / DR-27 |
| **SHORT_DESCRIPTION** | Dual-role Member Portal + Church Management destinations |
| **GAP_TYPE** | IMPLEMENTATION |
| **CURRENT_STATUS** | Shells exist; **no cross-links**; UNTESTED dual-role journey |
| **MINIMUM_ACTION_TO_CLOSE** | Implement linked dual-role entry points; T-A07 + T-M08 |
| **CAN_ENGINEERING_CLOSE_NOW** | YES |
| **REQUIRES_PRODUCT_DECISION** | NO |
| **REQUIRES_MANUAL_QA** | YES |

### P0-09

| Field | Value |
|-------|--------|
| **ID** | P0-09 |
| **PRODUCT** | BB |
| **REQ_ID** | FR-01..FR-20 / AC-01..AC-25 |
| **SHORT_DESCRIPTION** | BlessBoard Members feature pack — no FEATURE_QA_PASS |
| **GAP_TYPE** | MANUAL_QA |
| **CURRENT_STATUS** | In release scope; **NOT_SANITY_TESTED**; no FEATURE_QA_PASS |
| **DEPENDENCY** | Prefer identity-bound TESTING (P0-10); product decisions no longer block pack start |
| **MINIMUM_ACTION_TO_CLOSE** | Run Members FEATURE QA on identity-bound build; record FEATURE_QA_PASS |
| **CAN_ENGINEERING_CLOSE_NOW** | NO |
| **REQUIRES_PRODUCT_DECISION** | NO |
| **REQUIRES_MANUAL_QA** | YES |

### P0-10

| Field | Value |
|-------|--------|
| **ID** | P0-10 |
| **PRODUCT** | PLATFORM |
| **REQ_ID** | Release identity |
| **SHORT_DESCRIPTION** | Bind tested deploy to candidate |
| **GAP_TYPE** | BUILD_IDENTITY |
| **MINIMUM_ACTION_TO_CLOSE** | Record branch, app SHA, deploy SHA, DB id, migration ceiling on TESTING |
| **CAN_ENGINEERING_CLOSE_NOW** | YES |
| **REQUIRES_PRODUCT_DECISION** | NO |
| **REQUIRES_MANUAL_QA** | YES |

### P0-11

| Field | Value |
|-------|--------|
| **ID** | P0-11 |
| **PRODUCT** | BB |
| **REQ_ID** | AC-23 |
| **SHORT_DESCRIPTION** | Member privacy proof gap |
| **GAP_TYPE** | AUTOMATED_TEST |
| **MINIMUM_ACTION_TO_CLOSE** | Behavioral cross-member denial test (T-A01) + manual T-M11 |
| **CAN_ENGINEERING_CLOSE_NOW** | YES |
| **REQUIRES_PRODUCT_DECISION** | NO |
| **REQUIRES_MANUAL_QA** | YES |

### P0-12

| Field | Value |
|-------|--------|
| **ID** | P0-12 |
| **PRODUCT** | BB |
| **REQ_ID** | AC-11 |
| **SHORT_DESCRIPTION** | Recovery phone OTP complete path unproven |
| **GAP_TYPE** | AUTOMATED_TEST |
| **MINIMUM_ACTION_TO_CLOSE** | Complete OTP success/fail tests (T-A03) + manual phone-change |
| **CAN_ENGINEERING_CLOSE_NOW** | YES |
| **REQUIRES_PRODUCT_DECISION** | NO |
| **REQUIRES_MANUAL_QA** | YES |

---

## 2. Groups (remaining 6)

### A. PRODUCT DECISION REQUIRED (0)

*(cleared — all six temporary-approved)*

### B. CODE FIX REQUIRED (2)

| ID | Note |
|----|------|
| P0-05 | Wire injector (+ DR-39 keys) |
| P0-08 | Dual-role destinations |

### C. AUTOMATED TEST ONLY (2)

| ID | Note |
|----|------|
| P0-11 | AC-23 proof |
| P0-12 | AC-11 OTP complete |

### D. MANUAL QA ONLY (1)

| ID | Note |
|----|------|
| P0-09 | Members FEATURE_QA_PASS |

### E. RELEASE/BUILD IDENTITY (1)

| ID | Note |
|----|------|
| P0-10 | Bind TESTING candidate |

**Check:** 0 + 2 + 2 + 1 + 1 = **6**.

---

## 3. Dependency map (remaining)

```
P0-05 DR-39 key freeze ──► wire resolveManagedResourceIds ──► T-A06 / T-M10
P0-08 Dual-role destinations ──► T-A07 / T-M08

P0-10 Build identity ──► authoritative P0-09 Members FEATURE QA
P0-11 AC-23 auto + P0-12 AC-11 auto ──► strengthen Members confidence (≠ substitute for P0-09)
```

---

## 4. Shortest-path closure order

1. **P0-10** — Bind release identity.  
2. **P0-11 + P0-12** — Critical automated proofs.  
3. **P0-08** — Dual-role destinations.  
4. **P0-05** — Wire injector + DR-39 keys.  
5. **P0-09** — Members FEATURE QA.  
6. Recompute `READY_FOR_PRODUCTION_QA` only when **all 6** are CLOSED or waived.

---

## 5. Fastest closable now

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
| 1 | Scoped ministry review (DR-39 + injector) | P0-05 |
| 2 | Dual-role destinations | P0-08 |
| 3 | Members FEATURE_QA_PASS missing | P0-09 |
| 4 | Unbound build/release identity | P0-10 |
| 5 | Privacy automation proof gap | P0-11 |
| 6 | Phone OTP completion automation proof gap | P0-12 |

**DISTINCT_ROOT_BLOCKERS = 6**

---

## 7. Footer counts

P0_TOTAL=6
P0_PRODUCT_DECISION=0
P0_CODE=2
P0_AUTOMATED_TEST=2
P0_MANUAL_QA=1
P0_BUILD_IDENTITY=1
P0_OTHER=0
DISTINCT_ROOT_BLOCKERS=6
FASTEST_CLOSABLE_NOW=5
FINAL=V2_04_PRODUCT_DECISIONS_APPLIED
