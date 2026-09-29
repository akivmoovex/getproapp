# V2.03 Coverage Wave 2 — ActiveClinic

**FINAL: `V2_03_ACTIVECLINIC_90_COVERAGE_BLOCKED`**

## Gate verdict

Wave 2 added behavioral ActiveClinic tests targeting decision branches (authz deny, validation allow/deny, billing calendar/payment method, portal auth, clinical/patient/appointment/pharmacy early denials). Gains against the green baseline are **marginal**. ACTIVECLINIC remains well below 90% on statements, branches, and lines. Functions stay short of 90% by ~29. No application defects found; `businessCalendarDate` billing fix preserved; production untouched; AC regression + mapped QA PASS.

| Field | Value |
|---|---|
| Branch | `V10` |
| Authoritative baseline | `docs/qa/V2_03_GREEN_COVERAGE_BASELINE.md` → `V2_03_GREEN_COVERAGE_BASELINE_VALID` |
| Wave 1 input | `docs/qa/V2_03_COVERAGE_WAVE1_PLATFORM.md` (platform-scoped; AC baseline unchanged) |
| Measurement | Baseline `coverage/v203` ∪ targeted `coverage/v203-wave2` (per-file `max(covered)`, capped to baseline totals) |

```
BEFORE_S/B/F/L=76.25/59.31/88.30/76.25
AFTER_S/B/F/L=76.27/59.65/88.36/76.27

NEW_TEST_CASES=23
APPLICATION_DEFECTS_FOUND=0
APPLICATION_DEFECTS_FIXED=0

PATIENT_CLINICAL=PASS
BILLING=PASS
TENANT_ISOLATION=PASS
QA_AC=PASS

PRODUCTION=UNTOUCHED

FINAL=V2_03_ACTIVECLINIC_90_COVERAGE_BLOCKED
```

---

## ACTIVECLINIC metrics

| Metric | BEFORE | AFTER (merged est.) | ≥90% | Gap to 90 (counts) |
|---|---:|---:|---|---:|
| Statements | 76.25% (72679/95311) | **76.27%** (72690/95311) | NO | +13089 |
| Branches | 59.31% (9349/15764) | **59.65%** (9403/15764) | NO | +4784 |
| Functions | 88.30% (1593/1804) | **88.36%** (1594/1804) | NO | +29 |
| Lines | 76.25% (72679/95311) | **76.27%** (72690/95311) | NO | +13089 |

Wave 2 targeted c8 alone is not an AC slice score (loads a subset of modules). AFTER uses conservative union against the authoritative green denominator.

---

## What was added

| File | Focus | Cases |
|---|---|---:|
| `tests/v203-wave2-activeclinic-coverage.test.js` | Patient validation matrix; `businessCalendarDate` / `parseDateRange`; payment-method normalize + billing early denials; finance authz helpers; website resolver empty/populated; permission middleware unauth/context/forged-tenant/facility scope; portal auth resolve/authenticate; clinical/patient/appointment/pharmacy/staff controlled failures | **23** |

**Marker:** `V203_WAVE2_ACTIVECLINIC_COVERAGE`

### Branch decisions exercised

- authorized / denied (permission middleware, billing/clinical/pharmacy authz)
- valid / invalid (demographics, contacts, identifiers, date range, payment method)
- found / not found (portal identity/patient; catalog/invoice early paths)
- forged tenant / clean scope (permission middleware body forge)
- empty / non-empty (website operational/values snapshots)
- success / controlled failure (service early returns without inventing new product behavior)
- paid / refund / session-required shapes (billing `recordPayment` / `refundPayment` denials)

### Preserved

- `businessCalendarDate` local calendar semantics (billing green recovery) — asserted explicitly vs UTC `toISOString` day roll
- Three disclosed `FOLLOW_UP_DATE_RISK` candidates — **not** changed (no proven defect)
- No coverage exclusions, import-only tests, RBAC/tenant weakening, production changes

---

## Genuine blockers

| ID | Blocker |
|---|---|
| **W2-B1** | **Branches** need ~**+4784** to reach 90%. Remaining gap is dominated by deep service + HTTP route control flow (`clinicalRoutes`, `publicBookingRoutes`, website CMS/routes, billing/pharmacy services). Fake-pool / early-deny loops only recovered **+54** branches. |
| **W2-B2** | **Statements/lines** need ~**+13089**. Top uncovered line mass is HTTP: `activeClinicBillingRoutes` (~1518), `activeClinicCashierRoutes` (~1262), `activeClinicPharmacyRoutes` (~988), patient portal / website / clinical / patient routes (~4k+). Non-HTTP remaining (~9.7k lines) is still insufficient alone without near-total deep coverage; closing 90% **requires** large HTTP integration surface area already partially exercised by Batch 1–3 / phase suites in the baseline. |
| **W2-B3** | **Functions** still **+29** short; residual F live mostly inside large HTTP/route and ops services, not pure helpers. |
| **W2-B4** | Further unit/fake-pool multipliers yield diminishing returns on already-covered ACCESS_DENIED entry points; next wave must be **authenticated HTTP integration** (billing/cashier/clinical/pharmacy/patient portal) with allow + deny + cross-tenant matrices — multi-suite effort, not a single wave2 multiplier file. |

**Not blockers:** Mapped QA AC batches, billing ops, clinical domain integrity, tenant isolation (all PASS this wave). Production untouched.

---

## Security / product regression (Wave 2 close)

| Suite | Result |
|---|---|
| `tests/activeclinic-phase13-domain.test.js` + `tests/activeclinic-phase4-billing-ops.test.js` | **PASS** (15) → `PATIENT_CLINICAL=PASS`, `BILLING=PASS` |
| `npm run test:v8:tenant-isolation` | **PASS** (6) → `TENANT_ISOLATION=PASS` |
| `npm run test:v203:ac-batch1` | **PASS** (36) |
| `npm run test:v203:ac-batch2` | **PASS** (35) |
| `npm run test:v203:ac-batch3` | **PASS** (38) |

```
PATIENT_CLINICAL=PASS
BILLING=PASS
TENANT_ISOLATION=PASS
QA_AC=PASS
```

---

## Gap inventory (unchanged drivers from baseline)

From `docs/qa/V2_03_GREEN_COVERAGE_BASELINE.md` GAP_TO_90 / TOP_30 (still authoritative):

```
ACTIVECLINIC=S+13101 B+4839 F+31 L+13101   # baseline counts; AFTER ~S+13089 B+4784 F+29 L+13089
```

Highest remaining multipliers (lines): billing routes, cashier routes, pharmacy routes, patient portal routes, website CMS/routes, clinical/patient HTTP, billing ops service.

Highest remaining branch multipliers (services/HTTP): website catalogue/library, public booking, website/CMS routes, clinical routes, billing service, patient service, registration approve, clinical service.

---

## Artifacts

| Path | Purpose |
|---|---|
| `coverage/v203/` | Authoritative green baseline |
| `coverage/v203-wave2/` | Targeted c8 — wave2 AC tests |
| `tests/v203-wave2-activeclinic-coverage.test.js` | Wave 2 tests |

---

## Recommended follow-on (not executed)

1. HTTP integration matrices for `/app/billing/*`, `/app/cashier/*`, clinical/patient/pharmacy routes (reuse `createActiveClinicFoundationApp` + Batch seed patterns).
2. Branch-dense success paths in `activeClinicBillingOpsService` / `activeClinicClinicalService` beyond ACCESS_DENIED.
3. Website catalogue/library/CMS service decision branches with controlled fixtures.
4. Re-merge via green 865-file batched c8 for authoritative AFTER once material HTTP coverage lands.

---

## Required report fields (copy block)

```
BEFORE_S/B/F/L=76.25/59.31/88.30/76.25
AFTER_S/B/F/L=76.27/59.65/88.36/76.27

NEW_TEST_CASES=23
APPLICATION_DEFECTS_FOUND=0
APPLICATION_DEFECTS_FIXED=0

PATIENT_CLINICAL=PASS
BILLING=PASS
TENANT_ISOLATION=PASS
QA_AC=PASS

PRODUCTION=UNTOUCHED

FINAL=V2_03_ACTIVECLINIC_90_COVERAGE_BLOCKED
```
