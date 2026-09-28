# V2.03 — Billing green-state recovery

**FINAL: `V2_03_BILLING_GREEN_RECOVERY_PASS`**

| Field | Value |
| --- | --- |
| Branch | `V10` |
| `GREEN_SHA` | `32e83bd56e1df8a70f477a242c8f1a911d4414ad` |
| `CURRENT_SHA` | `32e83bd56e1df8a70f477a242c8f1a911d4414ad` |
| Prior gate | `V2_03_CANONICAL_GREEN_98_QA_PASS` |
| Coverage | **NOT RUN** (baseline remains BLOCKED until FAIL=0 under c8) |
| `PRODUCTION` | `UNTOUCHED` |

---

## Gate summary

```
GREEN_SHA=32e83bd56e1df8a70f477a242c8f1a911d4414ad
CURRENT_SHA=32e83bd56e1df8a70f477a242c8f1a911d4414ad

FAILURES_BEFORE=2

REFUND_FAILURE_ROOT_CAUSE=UTC_ISO_TODAY_VS_PG_CURRENT_DATE_ON_REVENUE_DATE_FILTER
FACILITY_REVENUE_ROOT_CAUSE=UTC_ISO_TODAY_VS_PG_CURRENT_DATE_ON_REVENUE_DATE_FILTER
SHARED_ROOT_CAUSE=YES

CLASSIFICATION=APPLICATION_DEFECT

APPLICATION_FILES_CHANGED=
  src/activeclinic/services/activeClinicBillingOpsService.js
  src/activeclinic/http/activeClinicBillingRoutes.js
TEST_FILES_CHANGED=
  tests/activeclinic-phase13-domain.test.js
  tests/activeclinic-phase4-billing-ops.test.js
FIXTURE_FILES_CHANGED=(none)

REFUND_NET_COLLECTIONS=PASS
FACILITY_REVENUE=PASS

REPEAT_RUN_1=PASS
REPEAT_RUN_2=PASS
REPEAT_RUN_3=PASS

CROSS_FACILITY_ISOLATION=PASS
CROSS_TENANT_ISOLATION=PASS
BILLING_QA=PASS

NEW_FAILURES=0

PRODUCTION=UNTOUCHED

FINAL:
V2_03_BILLING_GREEN_RECOVERY_PASS
```

---

## 1. Exact assertions (before fix)

### Failure A — refund net collections

| Field | Value |
| --- | --- |
| `TEST_FILE` | `tests/activeclinic-phase13-domain.test.js` |
| `TEST_NAME` | `counts refunds once in net collections` |
| `ASSERTION` | `summary.summary.payments.totalMinor === 4000` (then refunds `1500`, net `2500`) |
| `EXPECTED` | payments `4000`, refunds `1500`, netCollections `2500` |
| `ACTUAL` | payments `0`, refunds `0`, netCollections `0` (empty date window) |
| `DATA_SETUP` | Unique tenant/facility; posted invoice `8000`; payment `4000`; partial refund `1500` |
| `FACILITY` / `TENANT` | Fresh seed per test (`seedTenant` + primary facility) |
| `INVOICE/PAYMENT/REFUND STATE` | Invoice posted; payment completed; refund completed (`status` completed); dates via `CURRENT_DATE` |

### Failure B — facility revenue aggregate

| Field | Value |
| --- | --- |
| `TEST_FILE` | `tests/activeclinic-phase4-billing-ops.test.js` |
| `TEST_NAME` | `aggregates revenue report facility-scoped with auth denial` |
| `ASSERTION` | `summary.summary.postedInvoices.count >= 1` (and `totalMinor >= 7000`) |
| `EXPECTED` | ≥1 posted invoice totaling ≥ `7000` |
| `ACTUAL` | `postedInvoices.count === 0`, `totalMinor === 0` |
| `DATA_SETUP` | Unique tenant/facility; posted invoice `7000`; cashier denied; billing officer reads report |
| `FACILITY` / `TENANT` | Fresh seed per test |
| `INVOICE/PAYMENT/REFUND STATE` | Posted invoice only; `invoice_date = CURRENT_DATE` |

Shared calculation path: `billingOps.getRevenueReportSummary` → `parseDateRange` → SQL `*_date BETWEEN $from AND $to`.

Numeric discrepancy: **all zeros vs expected non-zero** — not a wrong net formula.

---

## 2. Green-state diff

| Item | Value |
| --- | --- |
| `GREEN_SHA` | `32e83bd56e1df8a70f477a242c8f1a911d4414ad` (`V2_03_CANONICAL_GREEN_98_QA_PASS`) |
| `CURRENT_SHA` | `32e83bd56e1df8a70f477a242c8f1a911d4414ad` (same tip) |
| `RELEVANT_COMMITS` | **None** — tip unchanged; billing service not dirty vs green tip |
| `RELEVANT_FILES_CHANGED` (pre-recovery) | No billing/finance/refund/revenue commit delta vs green |
| `REGRESSION_INTRODUCED_BY` | **Calendar-day boundary**: process UTC date ≠ PostgreSQL `CURRENT_DATE` (session TZ `Asia/Jerusalem` at repro). Green gate ran when UTC and local calendar day were the same (`2026-09-28`). Recovery repro on `2026-09-29` local / `2026-09-28` UTC. |

Evidence at repro:

| Source | Date |
| --- | --- |
| `SELECT CURRENT_DATE` | `2026-09-29` |
| `new Date().toISOString().slice(0, 10)` | `2026-09-28` |
| Node local Y-M-D | `2026-09-29` |

`COVERAGE_INSTRUMENTATION_CAUSE=NO` (same 12 PASS / 2 FAIL with and without c8).

---

## 3. Refund net collections trace

```
createInvoice / postInvoice  → invoices.invoice_date = CURRENT_DATE
recordPayment                → payments.payment_date = COALESCE(input, CURRENT_DATE)
refundPayment                → refunds.refund_date = CURRENT_DATE
                             → refund payment row excluded via NOT EXISTS (refund_payment_id = p.id)
getRevenueReportSummary      → payments SUM − refunds SUM = netCollectionsMinor
```

**Intended accounting contract**

| Measure | Contract |
| --- | --- |
| Gross collections | Sum of non-refund payment rows in facility/date window |
| Refund amount | Sum of completed/approved refunds in facility/date window |
| Net collections | `payments.totalMinor - refunds.totalMinor` |

Refund exclusion `NOT EXISTS (refund_payment_id = p.id)` excludes the **refund payment row**, not the original payment — correct for “counts refunds once.”

Root cause of zeros: filter `dateFrom/dateTo` built with **UTC ISO “today”** while rows stored on **business `CURRENT_DATE`**.

---

## 4. Facility revenue trace

```
tenant + facility → posted invoices WHERE tenant_id AND facility_id
                 → invoice_date BETWEEN dateFrom AND dateTo
```

Checks:

| Concern | Result |
| --- | --- |
| Missing facility predicate | No — `facility_id = $2` present |
| Wrong facility predicate | No |
| Duplicate join multiplication | No — simple `SUM` on `invoices` |
| Refund subtraction | N/A for posted invoice count |
| Status filtering | `status = 'posted'` correct |
| Date filtering | **Broken when UTC day ≠ CURRENT_DATE** |
| Test-data leakage | No — empty window, not inflated totals |
| Shared DB state | Ruled out by 3× repeat PASS after fix |

Same root cause as refund net (`SHARED_ROOT_CAUSE=YES`).

---

## 5. Isolation

Added and verified: `revenue aggregates isolate by facility and tenant` in `activeclinic-phase4-billing-ops.test.js`.

| Check | Result |
| --- | --- |
| Facility A totals unaffected by Facility B / Tenant B seed (`9000` vs `11000`) | PASS |
| Tenant A staff + Facility B id → not `OK` (access denied) | PASS |
| Cross-facility / cross-tenant refund receipt negatives (existing) | PASS |

---

## 6. Fix

**Classification:** `APPLICATION_DEFECT` (date contract mismatch), with tests updated to call the corrected helper.

**Do not** change expected amounts (`4000` / `1500` / `2500` / `≥7000`).

### Change

1. `businessCalendarDate()` — process-local `YYYY-MM-DD` aligned with PG `DATE` / `CURRENT_DATE` (not UTC `toISOString`).
2. `parseDateRange` defaults use `businessCalendarDate()`.
3. Revenue report HTTP handlers default `from`/`to` with the same helper.
4. Both failing tests filter with `billingOps.businessCalendarDate()`.
5. Isolation regression retained in phase-4 suite.

---

## 7. Targeted verification

| Run | Files | Result |
| --- | --- | --- |
| RUN 1 | phase13-domain + phase4-billing-ops | PASS (`15/15`) |
| RUN 2 | same | PASS (`15/15`) |
| RUN 3 | same | PASS (`15/15`) |

---

## 8. Billing QA (98-scenario matrix mapped)

Files executed (AC-BILL-01/02 + finance RBAC + recovery suites):

- `tests/activeclinic-phase13-domain.test.js`
- `tests/activeclinic-phase4-billing-ops.test.js`
- `tests/activeclinic-batch1a-billing.test.js`
- `tests/activeclinic-batch2-billing.test.js`
- `tests/activeclinic-finance-rbac.test.js`
- `tests/v203-qa-automation-gaps.test.js`

Result: **`56` tests, `fail 0`** → `BILLING_QA=PASS`.

Full 865-file canonical suite **not** re-run (per mission).

---

## 9. Final

```
V2_03_BILLING_GREEN_RECOVERY_PASS
```
