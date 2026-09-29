# V2.03 — Post-billing canonical green re-freeze

**FINAL: `V2_03_POST_BILLING_CANONICAL_GREEN_FROZEN`**

## Identity

| Field | Value |
| --- | --- |
| `BRANCH` | `V10` |
| `POST_BILLING_SHA` | `bcf28138b69f9448c08dc3b005a907a761762e5f` |
| Billing fix commit | `19cb2af4035666b736bf9d5633259b437fd38936` |
| Analytics UTC fixture commit | `bcf28138b69f9448c08dc3b005a907a761762e5f` |
| `WORKTREE` | `DIRTY` (Wave 4 remediations + screenshots excluded from freeze commit; required for green suite) |
| Manifest | `docs/qa/manifests/V2_03_CANONICAL_TEST_MANIFEST.txt` |
| Coverage | **NOT RUN** |
| Canonical artifacts | `/tmp/v203-post-billing-canonical2/` |
| QA artifacts | `/tmp/v203-post-billing-qa/` |
| Fingerprint | `docs/qa/manifests/V2_03_COVERAGE_INPUT_FINGERPRINT.json` |
| `PRODUCTION` | `UNTOUCHED` |

## Prerequisite

`V2_03_BILLING_GREEN_RECOVERY_PASS` — revenue filters aligned to `businessCalendarDate()` vs PG `CURRENT_DATE`.

## 1. Freeze input state

```
BRANCH=V10
HEAD=bcf28138b69f9448c08dc3b005a907a761762e5f
WORKTREE=DIRTY
```

### Dirt classification (pre-billing commit)

| Class | Count | Action |
| --- | ---: | --- |
| `BILLING_FIX` | 2 | **Committed** (`19cb2af4`) |
| `BILLING_TEST` | 2 | **Committed** (`19cb2af4`) |
| `QA_DOC` | 11+ | Recovery doc committed with billing; other wave docs remain untracked |
| `SCREENSHOT` | 32 | **Excluded** from commits |
| `UNRELATED` | ~227 | **Excluded** from billing commit; retained dirty (Wave-4 green suite) |

Additional freeze-blocking fixture (UTC analytics window): committed as `bcf28138`.

```
POST_BILLING_SHA=bcf28138b69f9448c08dc3b005a907a761762e5f
```

## 2. Manifest integrity

```
TEST_FILES=865
MANIFEST_SHA=fda6916a001ef8ceaea7fbf5dc0403cf95f2b2f1ac87c9f78e4dba8c858c22f5
MISSING=0
```

No new test **files** added (isolation case landed in existing `phase4-billing-ops`). Manifest **preserved** (not regenerated).

## 3. Full canonical run (no coverage)

Prod guard: **PASS** (local Postgres; `ALLOW_PROD_DB` unset).

```
TEST_FILES=865
TEST_CASES=7276
PASS=6792
FAIL=0
SKIP=484
CANCELLED=0
```

Batches: **73 / 73** exit `0`. Leaf `not ok`: **0**.

First attempt (`/tmp/v203-post-billing-canonical/`) had `FAIL=1` in registration onboarding analytics (UTC day-boundary fixture). Fixed; authoritative green is `canonical2`.

## 4. Skip integrity

```
INTENTIONAL_SKIP=400
CONDITIONAL_SKIP=84
HIDING_FAILURE=0
```

Footer `# skipped` sum = **484**. Classification uses skip **reasons** only (`HIDING_FAILURE=0`). Conditional = env/fixture soft-skips (`REQUIRES DATABASE`, foundation fixture unavailable, etc.).

## 5. QA 98 gate

Source: `docs/qa/V2_03_QA_AUTOMATION_MATRIX.md` → ledger `/tmp/v203-post-billing-qa/execution-ledger.json`.

```
QA_TOTAL=98
QA_EXECUTED=98
QA_PASSING=98
QA_FAILING=0
QA_SKIPPED=0
```

`filesPass=170`, `filesFail=0`. Billing scenarios: `AC-BILL-01=PASS`, `AC-BILL-02=PASS`.

## 6. Security / business gates

| Pack | Result |
| --- | --- |
| `RBAC` | **PASS** |
| `TENANT_ISOLATION` | **PASS** |
| `PATIENT_CLINICAL` | **PASS** |
| `BILLING` | **PASS** |
| `PUBLISHING` | **PASS** |
| `MEDIA_SECURITY` | **PASS** |
| `REFUND_NET_COLLECTIONS` | **PASS** |
| `FACILITY_REVENUE` | **PASS** |
| `BILLING_CROSS_TENANT_ISOLATION` | **PASS** |
| `BILLING_CROSS_FACILITY_ISOLATION` | **PASS** |

## 7. Date regression check (`toISOString().slice(0,10)` in ActiveClinic)

| Location | Class | Notes |
| --- | --- | --- |
| `activeClinicBillingOpsService.js` revenue `parseDateRange` / HTTP revenue defaults | **FIXED** | `businessCalendarDate()` |
| `activeClinicBillingOpsService.js` payment-arrangement `startDate` default | `BUSINESS_DATE_RISK` | Writes `start_date` DATE; deferred (not failing suite) |
| `activeClinicDataJobAdapters.js` `ac.financial_summary` export from/to | `BUSINESS_DATE_RISK` | Filters `payment_date` / invoice dates; deferred |
| `activeClinicCashierRoutes.js` `defaultPaymentDate` | `BUSINESS_DATE_RISK` | Form default for `payment_date`; deferred |
| Pharmacy expiry comparisons | `BUSINESS_DATE_RISK` (inventory) | Not revenue aggregation; deferred |
| Appointment screen date labels / query params | `SAFE_TIMESTAMP_USE` / `NOT_RELEVANT` | UI labels & timestamptz-derived day keys |
| Visit summary / registration applicant `formatSubmittedDate` | `SAFE_TIMESTAMP_USE` | Display of timestamptz values |
| Performance `fmt` helpers | `NOT_RELEVANT` | Non-billing aggregates |
| Platform registration analytics UTC window | `SAFE_TIMESTAMP_USE` | **Explicit UTC contract**; fixture adjusted so contact median stays inside window |

```
OTHER_BUSINESS_DATE_RISKS=3
```

(payment-arrangement startDate; financial_summary export defaults; cashier defaultPaymentDate). **Not auto-refactored** per mission. Disclosed before freeze; suite remains green.

## 8. Coverage input freeze

```
COVERAGE_INPUT_SHA=bcf28138b69f9448c08dc3b005a907a761762e5f
COVERAGE_MANIFEST_SHA=fda6916a001ef8ceaea7fbf5dc0403cf95f2b2f1ac87c9f78e4dba8c858c22f5
COVERAGE_TEST_FILES=865
TREE_FINGERPRINT=97ca0f360c32d50642feaed9c7ab852064464cd4096dccdcf9f973b1ff5fff63
```

`scripts/coverage/run-v203-coverage-batched.js` now **aborts** when `TREE_FINGERPRINT` or `COVERAGE_MANIFEST_SHA` diverge from `V2_03_COVERAGE_INPUT_FINGERPRINT.json` (HEAD drift alone warns if tree still matches).

Mirror: `/tmp/v203-post-billing-freeze/freeze.json`.

## Marker

```text
BRANCH=V10
POST_BILLING_SHA=bcf28138b69f9448c08dc3b005a907a761762e5f
WORKTREE=DIRTY

TEST_FILES=865
TEST_CASES=7276
PASS=6792
FAIL=0
SKIP=484
CANCELLED=0

INTENTIONAL_SKIP=400
CONDITIONAL_SKIP=84
HIDING_FAILURE=0

QA_TOTAL=98
QA_EXECUTED=98
QA_PASSING=98
QA_FAILING=0
QA_SKIPPED=0

RBAC=PASS
TENANT_ISOLATION=PASS
PATIENT_CLINICAL=PASS
BILLING=PASS
PUBLISHING=PASS
MEDIA_SECURITY=PASS

REFUND_NET_COLLECTIONS=PASS
FACILITY_REVENUE=PASS
BILLING_CROSS_TENANT_ISOLATION=PASS
BILLING_CROSS_FACILITY_ISOLATION=PASS

OTHER_BUSINESS_DATE_RISKS=3

COVERAGE_INPUT_SHA=bcf28138b69f9448c08dc3b005a907a761762e5f
COVERAGE_MANIFEST_SHA=fda6916a001ef8ceaea7fbf5dc0403cf95f2b2f1ac87c9f78e4dba8c858c22f5
COVERAGE_TEST_FILES=865

PRODUCTION=UNTOUCHED

V2_03_POST_BILLING_CANONICAL_GREEN_FROZEN
```
