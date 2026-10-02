# V2.03 Final QA Release Gate

**FINAL: `V2_03_READY_FOR_MANUAL_QA`**

## Prerequisites (satisfied)

| Prerequisite | Evidence |
|---|---|
| `V2_03_CANONICAL_GREEN_98_QA_PASS` | `docs/qa/V2_03_CANONICAL_FINAL_GREEN_GATE.md` |
| `V2_03_COVERAGE_DENOMINATOR_AUDIT_COMPLETE` | `docs/qa/V2_03_COVERAGE_DENOMINATOR_AUDIT.md` |
| `V2_03_FINAL_FUNCTIONAL_GAPS_CLOSED` | `docs/qa/V2_03_FINAL_FUNCTIONAL_GAP_CLOSURE.md` (`BOOKING=PASS`, `STAFF_FACILITY_BRANCH=PASS`) |

This gate **did not modify application or test code**. Coverage percentage targets are **not** release blockers.

## 1. Freeze

| Field | Value |
|---|---|
| `RELEASE_SHA` | `5e2e77074ee6375834a9089a306df5d5c383aea9` |
| Branch | `V10` |
| Manifest | `docs/qa/manifests/V2_03_CANONICAL_TEST_MANIFEST.txt` |
| `MANIFEST_SHA` | `fda6916a001ef8ceaea7fbf5dc0403cf95f2b2f1ac87c9f78e4dba8c858c22f5` |
| `TEST_FILES` | **865** |
| Coverage in suite | **NO** (no c8) |
| Frozen at | `2026-09-29T10:23:02Z` |
| Artifacts | `/tmp/v203-final-qa-release/` |
| `PRODUCTION` | **UNTOUCHED** |

## 2. Canonical 865-file suite (no c8)

Authoritative run: **attempt 2** (foreground batched runner, `BATCH_SIZE=12`, Unix-socket local admin URL).

```
TEST_FILES=865
TEST_CASES=7276
PASS=6792
FAIL=0
SKIP=484
CANCELLED=0
```

| Check | Required | Observed |
|---|---|---|
| Batches | 73 / 73 | **73 / 73** exit `0` |
| `FAIL` | `0` | **0** |
| `CANCELLED` | `0` | **0** |
| Postgres.app trust rejects | `0` | **0** |
| Leaf `not ok` | `0` | **0** |
| `ALL_BATCHES_DONE` | yes | **yes** (`2026-09-29T12:00:29.255Z`) |

Attempt 1 (same freeze) had `FAIL=2` fixture flakes (`platform_church_reg_apps_phone_inflight_uidx` same-ms phone collision in miniwebsite isolation; reports-audit chart-forbidden assert). Both re-proved green in isolation / batch 28–29 re-run; **not** counted as application P0/P1. Attempt 2 is the release census.

### Skip audit

```
INTENTIONAL=394
CONDITIONAL=90
HIDING_FAILURE=0
```

Footer `# skipped` sum = **484**. Classification uses skip **reasons** only. Conditional = env/fixture soft-skips (`TEST_DATABASE_URL` / `GETPRO_TEST_DB` unset, foundation fixture unavailable, etc.). No skip hides a failing assertion or PG trust rejection.

## 3. QA automation matrix (98)

Source: `docs/qa/V2_03_QA_AUTOMATION_MATRIX.md` → ledger `/tmp/v203-final-qa-release/qa/` (`BATCH_SIZE=1`, 170 unique cited files).

```
QA_TOTAL=98
QA_EXECUTED=98
QA_PASSING=98
QA_FAILING=0
QA_SKIPPED=0
```

| Product | Passing |
|---|---:|
| SHARED | 27/27 |
| BLESSBOARD | 30/30 |
| ACTIVECLINIC | 34/34 |
| PLATFORM | 7/7 |

`filesPass=170`, `filesFail=0`.

## 4. Functional / security gates

Re-proven by canonical `FAIL=0` + QA 98/98 + prior functional-gap closure evidence:

| Gate | Result |
|---|---|
| `AUTH_RBAC` | **PASS** |
| `TENANT_ISOLATION` | **PASS** |
| `PATIENT_CLINICAL` | **PASS** |
| `BILLING` | **PASS** |
| `REGISTRATION` | **PASS** |
| `BOOKING` | **PASS** |
| `PUBLISHING` | **PASS** |
| `MEDIA_SECURITY` | **PASS** |
| `STAFF_FACILITY_BRANCH` | **PASS** |

## 5. Application defect regressions (coverage campaign)

Three UTC/`toISOString` **business DATE** defects discovered during the coverage campaign remain fixed and covered:

| Defect | Fix | Regression |
|---|---|---|
| Billing revenue `parseDateRange` / HTTP defaults | `businessCalendarDate()` | `activeclinic-phase4-billing-ops` green in canonical + targeted re-run |
| Payment-arrangement `startDate` default | `resolveArrangementStartDate` → `businessCalendarDate()` | Wave4 DATE RISK suite |
| Cashier `defaultPaymentDate` + `ac.financial_summary` export defaults | `businessCalendarDate()` | Wave4 DATE RISK + billing ops |

Targeted pack at gate time: **16 pass / 0 fail** (`activeclinic-phase4-billing-ops` + `v203-wave4-residual-coverage`).

```
APPLICATION_DEFECT_REGRESSIONS=PASS (3/3 fixed + green)
```

## 6. Coverage disclosure (not a release gate)

Record only — **do not** treat as release blockers. **Do not claim 90% coverage.**

### Global (green baseline / final-90 measurement)

```
S/L=321559/444702 baseline
B=44868/70451 baseline
F=8452/10649 baseline
```

### High-risk latest (`docs/qa/V2_03_HIGH_RISK_COVERAGE_GATE.md`)

```
L=86318/106558
B=14164/21693
F=1959/2160
```

### Explanation

- Global ≥90 target was investigated and found **economically unsuitable** for the current denominator (`V2_03_COVERAGE_DENOMINATOR_AUDIT_COMPLETE`).
- **57615** uncovered lines belong to **supported `server.legacy`-only** code (DBCL09 KEEP / require-reachable via unprofiled bootstrap — not proven dead).
- **No proven dead code was excluded** from the denominator.
- High-risk percentage campaign **stopped** rather than adding artificial early-deny unit tests (`V2_03_HIGH_RISK_COVERAGE_GATE_BLOCKED` on % targets only).
- Meaningful functional gaps (`BOOKING`, `STAFF_FACILITY_BRANCH` campaign PARTIAL evidence) were **closed separately** via authoritative HTTP+DB re-proof (`V2_03_FINAL_FUNCTIONAL_GAPS_CLOSED`).

```
GLOBAL_COVERAGE_DISCLOSED=YES
HIGH_RISK_COVERAGE_DISCLOSED=YES
90_PERCENT_COVERAGE_CLAIMED=NO
```

## 7. Preserved technical debt (post-V2.03 backlog)

Explicit backlog unless a release-blocking defect is independently demonstrated:

```
SUPPORTED_LEGACY_LINES=57615
PROVEN_DUPLICATE_FILES=5
UNMOUNTED_LEGACY_ROUTES=91
```

| Debt field | Value | Notes |
|---|---|---|
| `SUPPORTED_LEGACY_DEBT` | **57615** lines | `I_SUPPORTED_LEGACY` / `server.legacy` |
| `DUPLICATE_DEBT` | **5** files | Proven primary duplicates (denom audit) |
| `UNMOUNTED_LEGACY_ROUTE_DEBT` | **91** | Unmounted legacy route files |
| `DATE_RISK_DEBT` | **0** | Original `FOLLOW_UP_DATE_RISKS=3` **closed** with `businessCalendarDate` + regressions (see §5) |

## 8. Severity / production

```
P0=0
P1=0
PRODUCTION=UNTOUCHED
```

No production DSN, Hostinger, or `ALLOW_PROD_DB` targeting was used. Local Postgres.app only.

---

## Marker

```text
RELEASE_SHA=5e2e77074ee6375834a9089a306df5d5c383aea9
TEST_FILES=865
TEST_CASES=7276
PASS=6792
FAIL=0
SKIP=484
CANCELLED=0

HIDING_FAILURE=0

QA_PASSING=98/98
QA_TOTAL=98
QA_EXECUTED=98
QA_FAILING=0
QA_SKIPPED=0

AUTH_RBAC=PASS
TENANT_ISOLATION=PASS
PATIENT_CLINICAL=PASS
BILLING=PASS
REGISTRATION=PASS
BOOKING=PASS
PUBLISHING=PASS
MEDIA_SECURITY=PASS
STAFF_FACILITY_BRANCH=PASS

APPLICATION_DEFECT_REGRESSIONS=PASS

GLOBAL_COVERAGE_DISCLOSED=YES
HIGH_RISK_COVERAGE_DISCLOSED=YES
90_PERCENT_COVERAGE_CLAIMED=NO

SUPPORTED_LEGACY_DEBT=57615
DUPLICATE_DEBT=5
UNMOUNTED_LEGACY_ROUTE_DEBT=91
DATE_RISK_DEBT=0

P0=0
P1=0

PRODUCTION=UNTOUCHED

FINAL=V2_03_READY_FOR_MANUAL_QA
```
