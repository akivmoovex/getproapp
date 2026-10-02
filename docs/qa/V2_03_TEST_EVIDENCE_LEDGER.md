# V2.03 QA — Test Evidence Ledger (QA13C)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_TEST_EVIDENCE_LEDGER` |
| **Date** | 2026-09-28 |
| **Mode** | READ ONLY reconciliation |
| **Prerequisite** | QA13B `V203_HOSTED_CRITICAL_VERIFICATION_PASS` |
| **Frozen candidate SHA** | `039ad22193c97759ce9bd5ca73fe56b0e38886ab` |
| **Branch** | `V10` |
| **Verdict** | **`V203_TEST_EVIDENCE_RECONCILIATION_PASS`** |
| **STALE_FAILURES_AFFECTING_HANDOFF** | **0** |

---

## Authority rules

1. Only results against frozen candidate `039ad22193c97759ce9bd5ca73fe56b0e38886ab` (or tooling/docs packs that freeze that SHA) are **AUTHORITATIVE**.
2. When the same pack has multiple runs, the **latest valid green run** against the frozen candidate wins.
3. Earlier fails that were later cleared on the same pack are **SUPERSEDED** — they must not block handoff.
4. Hosted results on a lagging SHA (`b8c18c3ded98`, etc.) are **SUPERSEDED** once QA13A/QA13B prove the candidate on testing.
5. Tests were **not re-run** for this ledger; coverage metrics were **recomputed read-only** from existing `coverage/v203-critical` artifacts (timestamp 2026-09-27).

---

## Coverage scope wiring (authoritative)

| Item | Value |
|------|--------|
| **Status** | **PASS** · **AUTHORITATIVE** |
| **Scopes** | `all` / `platform` / `blessboard` / `activeclinic` / `critical` |
| **Commands** | `npm run test:coverage` · `test:coverage:platform` · `test:coverage:blessboard` · `test:coverage:activeclinic` · `test:coverage:critical` |
| **Evidence** | `docs/qa/V2_03_COVERAGE_HARNESS.md` · `package.json` scripts · `scripts/coverage/run-v203-coverage.js` |

---

## QA10 BlessBoard (authoritative vs superseded)

| Run | Pass | Fail | Skip | Status |
|-----|-----:|-----:|-----:|--------|
| Later green (`npm run test:v203:bb-regression`) | **274** | **0** | 5 | **AUTHORITATIVE** |
| Earlier run | 257 | 17 | — | **SUPERSEDED_BY_LATER_GREEN_RUN** |

Do not cite 257/17 in handoff or release gates.

---

## Critical coverage metrics (established methodology)

Source: critical pack AFTER QA06–QA11 · `coverage/v203-critical/coverage-summary.json` + `coverage/coverage-gap-report.json` (remeasure QA12).  
Methodology: same definitions as prior QA14 metrics computation (mutation HTTP routes; tenant/RBAC boundary modules; analyzer HIGH-risk runtime under product `src/` trees; “tested/negative-tested” = substantive critical-pack line coverage thresholds).

```text
CRITICAL_MUTATION_ROUTES_TOTAL: 118
CRITICAL_MUTATION_ROUTES_TESTED: 63

TENANT_BOUNDARIES_TOTAL: 35
TENANT_BOUNDARIES_NEGATIVE_TESTED: 20

RBAC_BOUNDARIES_TOTAL: 29
RBAC_BOUNDARIES_NEGATIVE_TESTED: 23

HIGH_RISK_RUNTIME_FILES: 339
HIGH_RISK_RUNTIME_FILES_WITH_AUTOMATED_TESTS: 309
```

| Ratio | Value |
|-------|------:|
| Mutation routes tested | 53.4% (63/118) |
| Tenant boundaries negative-tested | 57.1% (20/35) |
| RBAC boundaries negative-tested | 79.3% (23/29) |
| High-risk runtime with automated tests | 91.2% (309/339) |

These metrics are **diagnostic risk coverage**, not release % gates.

---

## Authoritative pack ledger (QA01–QA13)

| Pack | Name | Candidate SHA | Pass | Fail | Skip | Coverage artifact | Status |
|------|------|---------------|-----:|-----:|-----:|-------------------|--------|
| QA01 | Baseline freeze | `039ad221…` | 7 (arch) + 136 (mig/PL/DBCL) | 0 | 0 | — | **AUTHORITATIVE** |
| QA02 | Test inventory | `039ad221…` | n/a (inventory) | 0 | 0 | — | **AUTHORITATIVE** |
| QA03 | Coverage harness | `039ad221…` | harness PASS | 0* | 0 | `coverage/v203-critical/*` (initial) | **AUTHORITATIVE** |
| QA04 | Coverage analyzer | `039ad221…` | analyzer PASS | 0 | 0 | `coverage/coverage-gap-report.*` (BEFORE snap retained) | **AUTHORITATIVE** |
| QA05 | Risk coverage matrix | `039ad221…` | n/a (matrix) | 0 | 0 | uses critical pack + gap report | **AUTHORITATIVE** |
| QA06 | Critical platform coverage | `039ad221…` | 16 | 0 | 0 | critical pack includes suite | **AUTHORITATIVE** |
| QA07 | AC Batch 1 test readiness | `039ad221…` | 36 | 0 | 0 | critical pack | **AUTHORITATIVE** |
| QA08 | AC Batch 2 test readiness | `039ad221…` | 35 | 0 | 0 | critical pack | **AUTHORITATIVE** |
| QA09 | AC Batch 3 test readiness | `039ad221…` | 38 | 0 | 0 | critical pack | **AUTHORITATIVE** |
| QA10 | BB regression test readiness | `039ad221…` | **274** | **0** | **5** | critical pack | **AUTHORITATIVE** |
| QA10-early | BB regression (earlier) | `039ad221…` | 257 | 17 | — | — | **SUPERSEDED** |
| QA11 | End-to-end journeys | `039ad221…` | 7 | 0 | 0 | critical pack | **AUTHORITATIVE** |
| QA12 | Coverage remeasure | `039ad221…` | harness+analyze PASS | 0* | 0 | `coverage/v203-critical/*` · `coverage/coverage-gap-report.*` (AFTER) | **AUTHORITATIVE** |
| QA13 | Hosted QA readiness | `b8c18c3…` (lag) | smoke partial | SHA mismatch | — | — | **SUPERSEDED** |
| QA13A | Hosted SHA alignment | `039ad221…` | alignment PASS | 0 | 0 | — | **AUTHORITATIVE** |
| QA13B | Hosted critical verification | `039ad221…` | 79 checks | 0 | 0 | `docs/qa/V2_03_HOSTED_CRITICAL_VERIFICATION.json` | **AUTHORITATIVE** |
| QA13C | Test evidence reconciliation | `039ad221…` | ledger PASS | 0 | 0 | this doc | **AUTHORITATIVE** |

\*QA03/QA12 harness: individual suite `testExitCode` may be non-zero; harness PASS = reports written (no thresholds).

---

## Pack detail (evidence pointers)

### QA01 — Baseline freeze
- Doc: `docs/qa/V2_03_QA_BASELINE.md`
- Marker: `V203_QA_BASELINE_FREEZE_PASS`
- Architecture **7/7**; migrations+PL/DBCL **136/136**
- Ceiling freeze: platform/043 · blessboard/118 · activeclinic/042 · getpro/001 · ngo/001

### QA02 — Test inventory
- Doc: `docs/qa/V2_03_TEST_INVENTORY.md`
- Marker: `V203_TEST_INVENTORY_COMPLETE`

### QA03 — Coverage harness
- Doc: `docs/qa/V2_03_COVERAGE_HARNESS.md`
- Marker: `V203_COVERAGE_HARNESS_PASS`
- Provider: c8 · scopes wired (see above)

### QA04 — Coverage analyzer
- Doc: `docs/qa/V2_03_COVERAGE_ANALYZER.md`
- Marker: `V203_COVERAGE_ANALYZER_PASS`
- Artifact: `coverage/coverage-gap-report.json` (+ BEFORE snap for QA12 delta)

### QA05 — Risk coverage matrix
- Doc: `docs/qa/V2_03_TEST_COVERAGE_MATRIX.md`
- Marker: `V203_RISK_COVERAGE_MATRIX_COMPLETE`

### QA06 — Critical platform
- Doc: `docs/qa/V2_03_CRITICAL_PLATFORM_COVERAGE.md`
- Marker: `V203_CRITICAL_PLATFORM_COVERAGE_PASS`
- Command: `npm run test:v203:critical-platform` → **16/0**

### QA07 — AC Batch 1
- Doc: `docs/qa/V2_03_AC_BATCH1_TEST_READINESS.md`
- Marker: `V203_AC_BATCH1_TEST_READINESS_PASS`
- Command: `npm run test:v203:ac-batch1` → **36/0**

### QA08 — AC Batch 2
- Doc: `docs/qa/V2_03_AC_BATCH2_TEST_READINESS.md`
- Marker: `V203_AC_BATCH2_TEST_READINESS_PASS`
- Command: `npm run test:v203:ac-batch2` → **35/0**

### QA09 — AC Batch 3
- Doc: `docs/qa/V2_03_AC_BATCH3_TEST_READINESS.md`
- Marker: `V203_AC_BATCH3_TEST_READINESS_PASS`
- Command: `npm run test:v203:ac-batch3` → **38/0**

### QA10 — BlessBoard regression
- Doc: `docs/qa/V2_03_BB_REGRESSION_TEST_READINESS.md`
- Marker: `V203_BB_REGRESSION_TEST_READINESS_PASS`
- Command: `npm run test:v203:bb-regression` → **274/0** (5 skipped)
- Earlier 257/17 → **SUPERSEDED_BY_LATER_GREEN_RUN**

### QA11 — E2E journeys
- Doc: `docs/qa/V2_03_END_TO_END_JOURNEYS.md`
- Marker: `V203_END_TO_END_JOURNEY_PASS`
- Command: `npm run test:v203:e2e-journeys` → **7/0**

### QA12 — Coverage remeasure
- Doc: `docs/qa/V2_03_TEST_COVERAGE_REPORT.md`
- Marker: `V203_COVERAGE_IMPROVEMENT_COMPLETE`
- Critical AFTER: lines **44.85%** · functions **37.16%** · branches **49.94%** (70 files)
- Artifacts: `coverage/v203-critical/` · `coverage/coverage-gap-report.{json,md}`

### QA13 — Hosted readiness (stale)
- Doc: `docs/qa/V2_03_HOSTED_QA_READINESS.md`
- Marker: `V203_HOSTED_QA_READINESS_BLOCKED`
- Reason: hosted SHA `b8c18c3ded98` ≠ candidate
- Status: **SUPERSEDED** by QA13A + QA13B

### QA13A — Hosted SHA alignment
- Doc: `docs/qa/V2_03_HOSTED_SHA_ALIGNMENT.md`
- Marker: `V203_HOSTED_SHA_ALIGNMENT_PASS`
- AC+BB pronline: `039ad22193c9` · `moovex-platform-testing` / `testing` · DB `moovex-platform-v7`

### QA13B — Hosted critical verification
- Doc: `docs/qa/V2_03_HOSTED_CRITICAL_VERIFICATION.md`
- JSON: `docs/qa/V2_03_HOSTED_CRITICAL_VERIFICATION.json`
- Marker: `V203_HOSTED_CRITICAL_VERIFICATION_PASS`
- **79** checks / **0** failures on candidate SHA (testing only; production untouched)

### QA13C — This ledger
- Doc: `docs/qa/V2_03_TEST_EVIDENCE_LEDGER.md`
- Marker: `V203_TEST_EVIDENCE_RECONCILIATION_PASS`

---

## Stale / superseded results (must not affect handoff)

| Item | Stale result | Authoritative replacement | Affects handoff? |
|------|--------------|---------------------------|------------------|
| QA10 early BB pack | 257 pass / 17 fail | 274 pass / 0 fail | **No** |
| QA13 hosted readiness | BLOCKED (SHA lag `b8c18c3…`) | QA13A PASS + QA13B PASS on `039ad221…` | **No** |
| Pre-QA13A hosted smokes | Candidate not deployed | QA13B authenticated critical on aligned SHA | **No** |
| Older V2.03 hosted gates on prior SHAs (`0014616…`, `d5bb820…`, `b8c18c3…`) | Various BLOCKED/FAIL | Frozen candidate + QA13B | **No** |

**STALE_FAILURES_AFFECTING_HANDOFF: 0**

---

## Local automated totals (authoritative packs only)

| Bucket | Pass | Fail | Skip |
|--------|-----:|-----:|-----:|
| Architecture (QA01) | 7 | 0 | 0 |
| Migrations + PL/DBCL (QA01) | 136 | 0 | 0 |
| Critical platform (QA06) | 16 | 0 | 0 |
| AC Batch 1 (QA07) | 36 | 0 | 0 |
| AC Batch 2 (QA08) | 35 | 0 | 0 |
| AC Batch 3 (QA09) | 38 | 0 | 0 |
| BB regression (QA10) | 274 | 0 | 5 |
| E2E journeys (QA11) | 7 | 0 | 0 |
| **Sum (listed packs)** | **549** | **0** | **5** |

Hosted critical (QA13B): **79/0** (HTTP check ledger; separate from node:test counts).

---

## NOT_RUN / BLOCKED (current)

| Item | Status | Notes |
|------|--------|-------|
| Production verification | **NOT_RUN** (out of scope) | Production untouched by design |
| Pixel Stitch parity (all Batch screens) | **NOT_RUN** as release gate | Documented gaps; markers automated |
| AC radiology named suite | **NOT_RUN** | Known QA05/QA12 gap — not a stale fail |
| Full product-scope coverage % gates | **NOT_RUN** | No thresholds; diagnostic only |

No current **BLOCKED** pack on the frozen candidate after QA13B.

---

## Required block

```text
V203_TEST_EVIDENCE_RECONCILIATION_PASS

CANDIDATE_SHA: 039ad22193c97759ce9bd5ca73fe56b0e38886ab
COVERAGE_SCOPES: all/platform/blessboard/activeclinic/critical = PASS
QA10_AUTHORITATIVE: 274 PASS / 0 FAIL
QA10_EARLIER_257_17: SUPERSEDED_BY_LATER_GREEN_RUN

CRITICAL_MUTATION_ROUTES_TOTAL: 118
CRITICAL_MUTATION_ROUTES_TESTED: 63
TENANT_BOUNDARIES_TOTAL: 35
TENANT_BOUNDARIES_NEGATIVE_TESTED: 20
RBAC_BOUNDARIES_TOTAL: 29
RBAC_BOUNDARIES_NEGATIVE_TESTED: 23
HIGH_RISK_RUNTIME_FILES: 339
HIGH_RISK_RUNTIME_FILES_WITH_AUTOMATED_TESTS: 309

STALE_FAILURES_AFFECTING_HANDOFF: 0
```
