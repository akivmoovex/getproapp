# V2.03 Coverage Wave 4 — Residual / Cross-Product Closure

**FINAL: `V2_03_ALL_SCOPES_90_TARGET_BLOCKED`**

## Gate verdict

Wave 4 measured the post–Waves 1–3 merged state, ranked residual gaps still under 90%, added timezone-boundary behavioral tests for the three disclosed `FOLLOW_UP_DATE_RISK` candidates, and **fixed all three** to the established `businessCalendarDate` contract after proving UTC/`toISOString` day-roll defects. Residual high-risk matrices (tenant forge, finance authz, arrangement validation) were added without padding trivial utils.

**No scope reaches independent ≥90 S/B/F/L.** Only PLATFORM **functions** remain ≥90 (from Wave 1). Closing the remaining gaps requires large authenticated HTTP integration matrices across PLATFORM/BB/AC mega-route files — not further unit/fake-pool multipliers.

| Field | Value |
|---|---|
| Branch | `V10` |
| Authoritative baseline | `docs/qa/V2_03_GREEN_COVERAGE_BASELINE.md` → `V2_03_GREEN_COVERAGE_BASELINE_VALID` |
| Prior waves | Wave 1 PLATFORM BLOCKED · Wave 2 AC BLOCKED · Wave 3 BB BLOCKED |
| Measurement | Baseline `coverage/v203` ∪ `v203-wave1` ∪ `v203-wave1b` ∪ `v203-wave2` ∪ `v203-wave3` ∪ `v203-wave4` (per-file `max(covered)`, capped to baseline totals) |

```
CURRENT_MERGED (AFTER Wave 4 union):

OVERALL   S/B/F/L = 72.31 / 63.69 / 79.37 / 72.31
PLATFORM  S/B/F/L = 85.20 / 66.61 / 93.62 / 85.20
BB        S/B/F/L = 80.41 / 64.00 / 82.63 / 80.41
AC        S/B/F/L = 76.27 / 59.65 / 88.36 / 76.27

METRICS_STILL_LT_90 =
  OVERALL: S,B,F,L
  PLATFORM: S,B,L   (F PASS)
  BB: S,B,F,L
  AC: S,B,F,L

NEW_TEST_CASES=7
APPLICATION_DEFECTS_FOUND=3
APPLICATION_DEFECTS_FIXED=3

DATE_RISKS_REVISITED=3
DATE_RISKS_FIXED=3
DATE_RISKS_LEFT_UNCHANGED=0

BILLING=PASS
TENANT_ISOLATION=PASS (shared forge matrix + prior suites)
PRODUCTION=UNTOUCHED

FINAL=V2_03_ALL_SCOPES_90_TARGET_BLOCKED
```

---

## 1. Current targeted coverage (merged)

| Scope | Statements | Branches | Functions | Lines | All ≥90? |
|---|---:|---:|---:|---:|---|
| **OVERALL** | 72.31% (321559/444702) | 63.69% (44868/70451) | 79.37% (8452/10649) | 72.31% (321559/444702) | **NO** |
| **PLATFORM** | 85.20% (101061/118614) | 66.61% (12434/18666) | **93.62%** (3255/3477) | 85.20% (101061/118614) | **NO** |
| **BB** | 80.41% (121524/151127) | 64.00% (20775/32462) | 82.63% (3036/3674) | 80.41% (121524/151127) | **NO** |
| **AC** | 76.27% (72690/95311) | 59.65% (9403/15764) | 88.36% (1594/1804) | 76.27% (72690/95311) | **NO** |

### Gap to 90 (counts still needed)

| Scope | S | B | F | L |
|---|---:|---:|---:|---:|
| OVERALL | +78673 | +18538 | +1133 | +78673 |
| PLATFORM | +5692 | +4366 | 0 | +5692 |
| BB | +14491 | +8441 | +271 | +14491 |
| AC | +13090 | +4785 | +30 | +13090 |

Wave 4 targeted c8 alone is not a product-slice score. AFTER uses the conservative union against the green baseline denominator. Wave 4 did **not** materially move merged S/B/F/L (new helpers are additive beyond baseline instrumentation; HTTP mass remains uncovered).

---

## 2. Deficient metrics — residual ranking

Only metrics still &lt;90 are ranked. Ranking criteria: **risk → business relevance → uncovered units → cross-product leverage**.

### PLATFORM (S/B/L deficient; F already PASS)

| Rank | File | Unc. L | Unc. B | Risk | Relevance | Leverage | Layer |
|---:|---|---:|---:|---:|---|---|---|
| 1 | `src/platform/http/platformAdminRoutes.js` | 1555 | 428 | 9 | admin writes / ops | PLATFORM-only HTTP | HTTP_INTEGRATION |
| 2 | `src/db/pg/fieldAgentPayRunRepo.js` | 745 | ~0* | 6 | pay-run money | PLATFORM db | INTEGRATION |
| 3 | `src/db/pg/fieldAgentSubmissionsRepo.js` | 593 | ~0* | 6 | submissions | PLATFORM db | INTEGRATION |
| 4 | Remaining platform admin / foundation HTTP | large | high | 8 | authz surface | shared chrome | HTTP_INTEGRATION |

\*Baseline branch maps for many `src/db/pg/**` files remain collapsed; Wave 1 already exhausted honest F credit.

### BLESSBOARD (all deficient)

| Rank | File | Unc. L | Unc. B | Risk | Relevance | Leverage | Layer |
|---:|---|---:|---:|---:|---|---|---|
| 1 | `contentAdminRoutes.js` | 911 | 351 | 9 | content admin writes | BB HTTP | HTTP_INTEGRATION |
| 2 | `blessboardWebsiteEditorRoutes.js` | 803 | 130 | 9 | publish/edit | BB + platform editor | HTTP_INTEGRATION |
| 3 | `memberJourneyAdminRoutes.js` | 799 | 43 | 8 | member journey | BB domain | HTTP_INTEGRATION |
| 4 | `messageService.js` | 724 | 1 | 7 | messaging | BB domain | SERVICE+HTTP |
| 5 | `memberJourneyDomainService.js` / `websiteDraftApplyService.js` / registration admin | 500–600 | high | 8–9 | drafts / registration | BB | SERVICE+HTTP |

### ACTIVECLINIC (all deficient; F closest at −30)

| Rank | File | Unc. L | Unc. B | Risk | Relevance | Leverage | Layer |
|---:|---|---:|---:|---:|---|---|---|
| 1 | `activeClinicBillingRoutes.js` | 1518 | 62 | 10 | billing writes | money | HTTP_INTEGRATION |
| 2 | `activeClinicCashierRoutes.js` | 1262 | 8 | 10 | cashier collect | money / SoD | HTTP_INTEGRATION |
| 3 | `activeClinicPharmacyRoutes.js` | 988 | 82 | 9 | pharmacy | clinical ops | HTTP_INTEGRATION |
| 4 | `activeClinicPatientPortalRoutes.js` | 855 | 85 | 9 | portal | patient | HTTP_INTEGRATION |
| 5 | Website CMS/routes, clinical/patient/diagnostics HTTP, diagnostics service | 500–700 | high | 8–9 | CMS / clinical | AC | HTTP_INTEGRATION |

**Cross-product leverage note:** Shared RBAC/tenant helpers are already well exercised (Wave 1 + Wave 4 forge matrix). Remaining mass is **product HTTP**, not shared primitives — further unit tests cannot close +78k OVERALL lines.

---

## 3. Date risks revisited

| # | Candidate | Proven defect? | Action |
|---|---|---|---|
| 1 | Payment-arrangement `startDate` default | **YES** — UTC `toISOString().slice(0,10)` vs PG `DATE` / local business day | **FIXED** → `resolveArrangementStartDate` → `businessCalendarDate` |
| 2 | `ac.financial_summary` export `from`/`to` | **YES** — same UTC day-roll on payment_date window | **FIXED** → `resolveFinancialExportDateRange` |
| 3 | Cashier `defaultPaymentDate` | **YES** — form default used UTC ISO day | **FIXED** → `billingOps.businessCalendarDate()` |

### Evidence

Timezone-boundary tests in `tests/v203-wave4-residual-coverage.test.js` construct local `Date` values where local `YYYY-MM-DD` ≠ UTC ISO day and assert:

- arrangement default ≠ UTC day when they diverge
- financial export `to` / 29-day `from` use business calendar
- call sites wire the helpers (no remaining UTC default for these three)

Regression: `tests/activeclinic-phase4-billing-ops.test.js` → **PASS** (9).

### Application changes

| File | Change |
|---|---|
| `src/activeclinic/services/activeClinicBillingOpsService.js` | `resolveArrangementStartDate`, `resolveFinancialExportDateRange`; arrangement create uses helper |
| `src/activeclinic/services/activeClinicDataJobAdapters.js` | financial_summary export uses `resolveFinancialExportDateRange` |
| `src/activeclinic/http/activeClinicCashierRoutes.js` | `defaultPaymentDate` via `billingOps.businessCalendarDate()` |

```
FOLLOW_UP_DATE_RISKS_REMAINING=0
```

---

## 4. What was added (tests)

| File | Focus | Cases |
|---|---|---:|
| `tests/v203-wave4-residual-coverage.test.js` | Date-risk timezone boundaries + wiring; arrangement invalid input; shared tenant forge allow/deny; finance authz id/permission shapes | **7** |

**Marker:** `V203_WAVE4_RESIDUAL_COVERAGE`

### Anti-gaming

- No coverage exclusions, import-only, or assertion-free tests
- Date tests prove UTC/local divergence class and business-calendar contract
- Residual cases target tenant isolation + finance authz + billing validation — not pure utils
- Did **not** invent fake HTTP success paths to inflate line %

---

## 5. Genuine blockers to `V2_03_ALL_SCOPES_90_TARGET_REACHED`

| ID | Blocker |
|---|---|
| **W4-B1** | **OVERALL** needs ~**+79k** statements/lines and ~**+18.5k** branches. Dominated by HTTP megafiles across all products. |
| **W4-B2** | **PLATFORM** S/L ~**−5.7pp**, B ~**−23pp**. Remaining mass is `platformAdminRoutes` + deep db/HTTP — Wave 1 already took the zero-F / helper credit. |
| **W4-B3** | **BB** needs ~**+14.5k** lines / ~**+8.4k** branches — content/website/member-journey HTTP + domain services. Wave 3 proved decision-matrix unit tests add **0** merged delta on already-covered paths. |
| **W4-B4** | **AC** needs ~**+13k** lines / ~**+4.8k** branches; F still **−30**. Billing/cashier/pharmacy/portal HTTP — Wave 2 showed fake-pool early-deny yields diminishing returns. |
| **W4-B5** | Honest path to 90% is a **multi-suite authenticated HTTP integration campaign** (allow + deny + cross-tenant + SoD) reusing Batch/foundation app patterns — outside residual unit-wave scope. Claiming PASS without that would require gaming. |

**Not blockers this wave:** Date-risk class (closed), billing ops green, production untouched, V2.02 BB regressions not touched.

---

## 6. Security / product close checks

| Check | Result |
|---|---|
| `tests/v203-wave4-residual-coverage.test.js` | **PASS** (7) |
| `tests/activeclinic-phase4-billing-ops.test.js` | **PASS** (9) → `BILLING=PASS` |
| Application defects (date UTC defaults) | **3 found / 3 fixed** |
| RBAC / tenant weakened? | **NO** |
| Production | **UNTOUCHED** |

---

## Marker

```text
WAVE=4
MISSION=RESIDUAL_CROSS_PRODUCT_CLOSURE

CURRENT_MERGED:
OVERALL=72.31/63.69/79.37/72.31
PLATFORM=85.20/66.61/93.62/85.20
BB=80.41/64.00/82.63/80.41
AC=76.27/59.65/88.36/76.27

DATE_RISKS_FIXED=3
NEW_TEST_CASES=7
APPLICATION_DEFECTS_FOUND=3
APPLICATION_DEFECTS_FIXED=3

PRODUCTION=UNTOUCHED

FINAL=V2_03_ALL_SCOPES_90_TARGET_BLOCKED
```

**Required independently ≥90 S/B/F/L for OVERALL, PLATFORM, BB, AC: NOT MET.**
