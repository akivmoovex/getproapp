# V2.03 90% Coverage Baseline (Prompt 5 Measurement)

**Doc ID:** `V2_03_90_COVERAGE_BASELINE`  
**Prompt:** Overnight 5/8 — COVERAGE MEASUREMENT  
**Date:** 2026-09-28  
**Production:** UNTOUCHED  
**Denominator:** Unchanged (`.c8rc.json` + overall include `src/**`, `server.js`, `server.legacy.js`, `index.js`)  
**Final:** `V2_03_COVERAGE_MEASURED`

---

## Orchestration

Safer batched runner (hang diagnosis → streamed batches):

| Property | Value |
|--|--|
| Runner | `scripts/coverage/run-v203-coverage-batched.js` |
| Command | `npm run test:coverage` / `npm run test:coverage:batched` |
| Manifest | Deterministic sorted `tests/**/*.test.js` → `coverage/v203/batches/manifest.txt` |
| Batch size | 75 |
| Batches | 12 (862 files) |
| Progress | Streamed TAP + `coverage/v203/batches/progress.json` checkpoint/resume |
| c8 config | Identical `.c8rc.json` every batch |
| V8 temp | Shared `coverage/v203/tmp` |
| Clean | `--clean` only first batch; `--clean=false` thereafter |
| Final merge | `c8 report --merge-async` (single overall report) |
| Product metrics | Path slices of overall `coverage-summary.json` — **not** merged incompatible product reports |

### Run caveats

- Batch **008** stalled on `tests/shared-website-editor-wave4b1.test.js` (open-handle / no TAP progress). Quarantined; resume continued 009–011. Partial V8 from 008 remains in temp.
- Process-group kill hardened after stall (`detached` + `kill(-pid)`).
- Product slices corrected post-run from `coverage-summary.json` (Istanbul summary shape).

Artifacts: `coverage/v203/{coverage-summary.json,coverage-final.json,lcov.info,v203-coverage-meta.json,v203-ranked-gaps.json,v203-product-slices.json}`

---

## Coverage totals

### OVERALL

| Metric | Covered / Total | % |
|--|--:|--:|
| Statements | 163276 / 443873 | **36.78%** |
| Branches | 15907 / 25148 | **63.25%** |
| Functions | 2995 / 10478 | **28.58%** |
| Lines | 163276 / 443873 | **36.78%** |

### PLATFORM (path slice)

| Metric | % |
|--|--:|
| Statements | **45.23%** |
| Branches | **64.58%** |
| Functions | **29.31%** |
| Lines | **45.23%** |

### BLESSBOARD (path slice)

| Metric | % |
|--|--:|
| Statements | **40.98%** |
| Branches | **63.41%** |
| Functions | **33.83%** |
| Lines | **40.98%** |

### ACTIVECLINIC (path slice)

| Metric | % |
|--|--:|
| Statements | **25.48%** |
| Branches | **60.53%** |
| Functions | **17.46%** |
| Lines | **25.48%** |

---

## High-risk uncovered

```text
HIGH_RISK_LINES=115463
HIGH_RISK_BRANCHES=3830
```

(High-risk = path patterns matching auth/session/RBAC/publish/media/clinical/billing/admin/… per analyzer.)

---

## Test census (this measurement)

```text
TEST_PASS=3992
TEST_FAIL=1728
TEST_SKIP=838
```

**Expected `TEST_FAIL=0` was not met.** Residual Prompt-2 leaf failures + schema/env skips still present; this prompt measures coverage only (does not remediate). Coverage is therefore a lower bound vs a green suite (freeze historical ~65.71% lines on a prior full run with fewer fails).

---

## ≥90% gate

| Scope | All metrics ≥90%? |
|--|--|
| OVERALL | **NO** |
| PLATFORM | **NO** |
| BLESSBOARD | **NO** |
| ACTIVECLINIC | **NO** |

→ **Do not skip to Prompt 8.** Generate ranked gaps for **Prompt 6**.

---

## Ranked coverage gaps (Prompt 6 input)

Machine-readable: `coverage/v203/v203-ranked-gaps.json`  
Analyzer: `coverage/coverage-gap-report.md` / `.json`

### Top 20 by gap score (uncovered volume)

| Rank | File | Lines % | Branches % | Uncovered lines |
|--|--|--:|--:|--:|
| 1 | `src/routes/admin/adminChurchPlatform.js` | 13.20 | 100.00 | 3544 |
| 2 | `src/platform/http/platformAdminRoutes.js` | 40.61 | 70.73 | 3168 |
| 3 | `src/blessboard/http/contentAdminRoutes.js` | 17.93 | 85.00 | 2709 |
| 4 | `src/activeclinic/services/activeClinicBillingService.js` | 10.04 | 22.22 | 2212 |
| 5 | `src/activeclinic/http/activeClinicBillingRoutes.js` | 18.04 | 100.00 | 2185 |
| 6 | `src/blessboard/repositories/platformChurchRegistrationRepository.js` | 33.84 | 35.00 | 2099 |
| 7 | `src/blessboard/services/websitePublicationVersionService.js` | 14.95 | 100.00 | 1882 |
| 8 | `src/blessboard/http/loadTenantPublicPageModel.js` | 17.86 | 56.45 | 1784 |
| 9 | `src/activeclinic/http/activeClinicWebsiteCmsRoutes.js` | 22.50 | 100.00 | 1760 |
| 10 | `src/routes/fieldAgent.js` | 11.57 | 75.00 | 1589 |
| 11 | `src/activeclinic/services/activeClinicClinicalService.js` | 10.04 | 100.00 | 1549 |
| 12 | `src/db/pg/fieldAgentPayRunRepo.js` | 15.87 | 100.00 | 1479 |
| 13 | `src/activeclinic/services/activeClinicBillingOpsService.js` | 11.97 | 100.00 | 1478 |
| 14 | `src/activeclinic/http/activeClinicPharmacyRoutes.js` | 20.82 | 100.00 | 1475 |
| 15 | `src/activeclinic/http/activeClinicPatientPortalRoutes.js` | 17.21 | 66.66 | 1467 |
| 16 | `src/routes/admin/adminCrm.js` | 17.07 | 100.00 | 1467 |
| 17 | `src/blessboard/http/blessboardWebsiteEditorRoutes.js` | 17.29 | 85.71 | 1435 |
| 18 | `src/blessboard/services/provisionRegisteredBlessBoardChurch.js` | 21.36 | 39.28 | 1424 |
| 19 | `src/activeclinic/services/activeClinicDemoClinicSeedService.js` | 8.38 | 100.00 | 1432 |
| 20 | `src/db/pg/fieldAgentSubmissionsRepo.js` | 21.38 | 100.00 | 1423 |

### Prompt 6 priority themes

1. **ActiveClinic billing + clinical/patient HTTP/services** — largest product shortfall (lines ~25%).
2. **BlessBoard content-admin / registration / publication** — large uncovered route/service surfaces.
3. **Platform admin HTTP** — `platformAdminRoutes.js` + shared admin church platform routes.
4. **High-risk auth/RBAC/publish/media** — 115k uncovered high-risk lines; prefer meaningful workflow tests over line-touch.
5. **Green the suite** (Prompt 2 residual) — reducing `TEST_FAIL` will raise executed coverage before inventing tests.

---

## Comparison to freeze baseline

| | Freeze (prior hang-diag run) | This measurement |
|--|--:|--:|
| Lines | 65.71% | 36.78% |
| Branches | 62.55% | 63.25% |
| Functions | 65.40% | 28.58% |
| TEST_FAIL | 452 | 1728 |

Lower statements/functions/lines vs freeze reflect higher fail/skip rate + incomplete batch 008, not a denominator change.

---

## Marker

```text
V2_03_COVERAGE_MEASURED

OVERALL_STATEMENTS=36.78
OVERALL_BRANCHES=63.25
OVERALL_FUNCTIONS=28.58
OVERALL_LINES=36.78

PLATFORM_LINES=45.23
BLESSBOARD_LINES=40.98
ACTIVECLINIC_LINES=25.48

HIGH_RISK_LINES=115463
HIGH_RISK_BRANCHES=3830

TEST_PASS=3992
TEST_FAIL=1728
TEST_SKIP=838

GATE_90=NO
NEXT=PROMPT_6_RANKED_GAPS
```
