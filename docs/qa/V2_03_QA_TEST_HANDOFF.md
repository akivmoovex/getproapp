# V2.03 QA — Final Test Team Handoff (QA14)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_QA_TEST_HANDOFF` |
| **Date** | 2026-09-28 |
| **Mode** | READ/REPORT ONLY — **no application changes** · **no production changes** |
| **Prerequisites** | QA13A PASS · QA13B PASS · QA13C PASS |
| **Evidence authority** | `docs/qa/V2_03_TEST_EVIDENCE_LEDGER.md` (QA13C) |
| **Verdict** | **`V2_03_READY_FOR_MANUAL_QA`** |

---

## Identity

```text
VERSION: 2.03
BRANCH: V10
CANDIDATE SHA: 039ad22193c97759ce9bd5ca73fe56b0e38886ab
HOSTED SHA:    039ad22193c97759ce9bd5ca73fe56b0e38886ab
DEPLOYMENT:    moovex-platform-testing / testing
DB identity:   moovex-platform-v7 / testing
migration ceiling: platform/043 · blessboard/118 · activeclinic/042 · getpro/001 · ngo/001
Production:    UNTOUCHED
```

| Item | Value |
|------|--------|
| Testing hosts | `activeclinic.pronline.org` · `blessboard.pronline.org` |
| Session cookie | `moovex_platform_testing_sid` |
| Media write namespace | `testing` |
| DB instance | `c9189f08-e8ab-432c-a454-5a609ac91e32` |
| Hosted short SHA (AC + BB `/healthz`) | `039ad22193c9` |
| `origin/V10` | `039ad22193c97759ce9bd5ca73fe56b0e38886ab` (QA13A aligned) |

---

## Architecture / DB state

| Dimension | Classification |
|-----------|----------------|
| **PLATFORM ARCHITECTURE** | **`CANONICAL_READY_WITH_RESIDUAL_DEBT`** |
| **DB** | **`CANONICAL_WITH_JUSTIFIED_COMPATIBILITY`** |

Residual debt and justified compatibility are listed below under **KNOWN_TECH_DEBT** / **KNOWN_PRODUCT_LIMITATIONS**. They are **not** preparation blockers.

---

## Preparation chain (authoritative)

| Step | Doc | Marker | Result |
|------|-----|--------|--------|
| QA01 Baseline | `V2_03_QA_BASELINE.md` | `V203_QA_BASELINE_FREEZE_PASS` | PASS |
| QA02 Inventory | `V2_03_TEST_INVENTORY.md` | `V203_TEST_INVENTORY_COMPLETE` | PASS |
| QA03 Harness | `V2_03_COVERAGE_HARNESS.md` | `V203_COVERAGE_HARNESS_PASS` | PASS |
| QA04 Analyzer | `V2_03_COVERAGE_ANALYZER.md` | `V203_COVERAGE_ANALYZER_PASS` | PASS |
| QA05 Risk matrix | `V2_03_TEST_COVERAGE_MATRIX.md` | `V203_RISK_COVERAGE_MATRIX_COMPLETE` | PASS |
| QA06 Critical platform | `V2_03_CRITICAL_PLATFORM_COVERAGE.md` | `V203_CRITICAL_PLATFORM_COVERAGE_PASS` | PASS |
| QA07 AC Batch 1 | `V2_03_AC_BATCH1_TEST_READINESS.md` | `V203_AC_BATCH1_TEST_READINESS_PASS` | PASS |
| QA08 AC Batch 2 | `V2_03_AC_BATCH2_TEST_READINESS.md` | `V203_AC_BATCH2_TEST_READINESS_PASS` | PASS |
| QA09 AC Batch 3 | `V2_03_AC_BATCH3_TEST_READINESS.md` | `V203_AC_BATCH3_TEST_READINESS_PASS` | PASS |
| QA10 BB regression | `V2_03_BB_REGRESSION_TEST_READINESS.md` | `V203_BB_REGRESSION_TEST_READINESS_PASS` | PASS |
| QA11 E2E journeys | `V2_03_END_TO_END_JOURNEYS.md` | `V203_END_TO_END_JOURNEY_PASS` | PASS |
| QA12 Coverage remeasure | `V2_03_TEST_COVERAGE_REPORT.md` | `V203_COVERAGE_IMPROVEMENT_COMPLETE` | PASS |
| QA13 Hosted readiness | `V2_03_HOSTED_QA_READINESS.md` | `V203_HOSTED_QA_READINESS_BLOCKED` | **SUPERSEDED** (SHA lag) |
| QA13A Hosted SHA alignment | `V2_03_HOSTED_SHA_ALIGNMENT.md` | `V203_HOSTED_SHA_ALIGNMENT_PASS` | PASS |
| QA13B Hosted critical verification | `V2_03_HOSTED_CRITICAL_VERIFICATION.md` | `V203_HOSTED_CRITICAL_VERIFICATION_PASS` | PASS |
| QA13C Evidence ledger | `V2_03_TEST_EVIDENCE_LEDGER.md` | `V203_TEST_EVIDENCE_RECONCILIATION_PASS` | PASS |

**Coverage scopes:** `all` / `platform` / `blessboard` / `activeclinic` / `critical` — **PASS** (wired).

**STALE_FAILURES_AFFECTING_HANDOFF:** **0**

---

## TEST RESULTS (authoritative only)

| Area | Evidence | Result |
|------|----------|--------|
| **Architecture** | QA01 `npm run test:architecture` | **PASS** 7/7 |
| **Platform** (migrations + PL/DBCL nets) | QA01 | **PASS** 136/136 |
| **Security** (critical platform) | QA06 `npm run test:v203:critical-platform` | **PASS** 16/16 |
| **BlessBoard** | QA10 `npm run test:v203:bb-regression` | **PASS** **274 PASS / 0 FAIL** (5 skipped) |
| **ActiveClinic Batch 1** | QA07 `npm run test:v203:ac-batch1` | **PASS** 36/0 |
| **ActiveClinic Batch 2** | QA08 `npm run test:v203:ac-batch2` | **PASS** 35/0 |
| **ActiveClinic Batch 3** | QA09 `npm run test:v203:ac-batch3` | **PASS** 38/0 |
| **End-to-end** | QA11 `npm run test:v203:e2e-journeys` | **PASS** 7/0 |
| **Critical coverage** | QA12 `test:coverage:critical` + analyze | **PASS** (harness + analyzer; diagnostic %) |
| **Hosted verification** | QA13B on candidate SHA | **PASS** 79/0 |

### BlessBoard QA10 (explicit)

```text
BlessBoard QA10 = 274 PASS / 0 FAIL
```

An earlier QA10 run (257 pass / 17 fail) is **`SUPERSEDED_BY_LATER_GREEN_RUN`**. It is **not** an open failure and must **not** be reported as a handoff blocker.

### Critical coverage (diagnostic)

| Metric | Value |
|--------|------:|
| Overall lines / statements | 44.85% |
| Functions | 37.16% |
| Branches | 49.94% |
| Platform / BB / AC lines | 51.12% / 39.90% / 46.74% |

| Critical risk metric | Total | Tested / negative-tested |
|----------------------|------:|-------------------------:|
| CRITICAL_MUTATION_ROUTES | 118 | 63 |
| TENANT_BOUNDARIES | 35 | 20 |
| RBAC_BOUNDARIES | 29 | 23 |
| HIGH_RISK_RUNTIME_FILES | 339 | 309 |

Coverage % is **not** a release gate.

### Hosted verification (QA13B — candidate)

Testing-only, non-destructive, on `039ad221…`:

| Surface | Result |
|---------|--------|
| Platform health / session / CSRF / static / tenant resolution | PASS |
| BlessBoard public / login / register / HQ portal / editor / CMS / media / publish review | PASS |
| ActiveClinic public / clinics / login / register / staff / booking / patient login / Batch 1–3 critical routes / website | PASS |
| No 500 / redirect loop / schema-lag / cross-product chrome leakage on critical routes | PASS |

Evidence: `docs/qa/V2_03_HOSTED_CRITICAL_VERIFICATION.md` · `.json`.

---

## Classification legend

| Label | Meaning |
|-------|---------|
| **CONFIRMED_BUG** | Reproduced unexpected failure vs intended behavior on the **aligned candidate** |
| **KNOWN_PRODUCT_LIMITATION** | MVP / product decision; do not file as bug unless scope changed |
| **KNOWN_TECH_DEBT** | Engineering residual; intentional defer / on-touch; not a new defect |
| **KNOWN_QA_GAP** | Thin or missing automation/manual depth; risk, not proven defect |
| **DEFERRED_PRODUCTION_ONLY** | Applies only after a deliberate production action; out of this prep |

---

## CONFIRMED_BUGS

| Item | Notes |
|------|-------|
| **None** | No open confirmed application bugs against candidate `039ad221…` from QA01–QA13C authoritative evidence |

Historical (closed / not open):

| Item | Status |
|------|--------|
| ACN18 isolation hang | Resolved earlier; not open |
| Hosted SHA lag vs candidate | Cleared by QA13A; not open |
| QA10 earlier 257/17 | Superseded by 274/0; not open |

---

## KNOWN_PRODUCT_LIMITATIONS

| Item | Notes |
|------|-------|
| AC radiology as a named capability | No dedicated radiology suite; not MVP-automated as distinct surface |
| ACN27 occupancy engine | Intentionally absent (contract-tested as deferred) |
| Visit-summary PDF / private clinical-document binary storage | Product-deferred; contracts assert defer markers |
| Public clinic websites may be unavailable until publish | Expected until tenant publish/availability |
| BlessBoard V5 stub routes (e.g. legacy `/member`, foreign `/clinics/*` on BB host) | “Not yet available” stub — not product chrome leakage |

---

## KNOWN_TECH_DEBT

| ID / item | Notes |
|-----------|-------|
| Website dual-write / `blessboardBridge` / `publishFromLegacy` | **Retain** for V2.03; do not remove in QA |
| Dual media stores | platform `website_media` + BB operational assets |
| Classic CMS adapters / `v7CompatibleWebsitePublish` | Justified compatibility |
| Frozen `blessboard.user_roles` | Runtime R/W **0**; URA canonical |
| Audit `COLS_LEGACY` | Until production ceiling advances |
| `server.legacy.js` bootstrap keep | DBCL09 |
| Class-E platform composition allowlist | On-touch only |
| R-P2-01…04 | Class-E / editor / classic CMS / publish shim retirement |
| R-P3-01 / 03 / 04 / 05 | gp-ops / thin re-exports / stitch dirs / soft-savepoint |
| PL11 F1–F9 | Test pins / environmental — **P0=0, P1=0**; not product release bugs |
| QA12 gaps | Large admin HTTP bodies ~20–35% lines; bridge ~31% branches; billing ops depth |
| Doc gap | Standalone DBCL01–08 markdown not filed (doc only) |

---

## MANUAL_QA_SCENARIOS

Hosted testing is **SHA-aligned**. Emphasize:

| Scenario | Focus |
|----------|--------|
| Confirm deploy identity | `/healthz` → SHA `039ad22193c9`, deployment `moovex-platform-testing`, env `testing` |
| AC money path | Billing, cashier session, invoice/facility isolation, wrong-role denies |
| AC clinical Batch 2/3 | Encounter, vitals, prescriptions, referrals, rooms, clinical docs, visit-summary release + portal read |
| Isolation | Tenant / facility / patient; forged IDs; editor-cannot-publish |
| BB website | Draft → media → publish review → public; HQ vs branch scope; dual-write still works |
| Registration | BB `/register-church` + AC `/register-clinic` happy + deny |
| Stitch visual parity | 1440 / 390 for Batch screens (markers automated; pixel parity manual) |
| Patient portal booking E2E | Beyond smoke login entry |
| Cross-browser / real device | Not covered by node:test |
| Do **not** re-litigate | Bridge, frozen `user_roles`, justified dual-write as bugs |

Demo QA passwords/users: testing seed docs only (`docs/platform/HOSTED_WEBSITE_QA_PERSONAS.md`, AC/BB QA role-user docs). Never production.

---

## DEFERRED_PRODUCTION_ONLY_ITEMS

| Item | Notes |
|------|-------|
| Production deploy of V2.03 candidate | Requires separate deliberate authorization (not this handoff) |
| Production DB migrate / ceiling advance | Production remains behind testing by design |
| Production smoke / certification | **Out of scope** for QA01–QA14 prep |
| Production data wipe / QA seed | **Forbidden** |

```text
Production: UNTOUCHED
```

Read-only probe identity (not a target): `moovex-platform-production` / `production` · healthz SHA `03a89106e2fe`.

---

## Blocker determination

| Question | Answer |
|----------|--------|
| Open preparation blocker? | **None** |
| Superseded failures treated as blockers? | **No** |
| Verdict | **`V2_03_READY_FOR_MANUAL_QA`** |

Manual QA on `*.pronline.org` against candidate **`039ad22193c97759ce9bd5ca73fe56b0e38886ab`** is authorized.

---

## Marker

```text
V2_03_READY_FOR_MANUAL_QA

VERSION: 2.03
BRANCH: V10
CANDIDATE SHA: 039ad22193c97759ce9bd5ca73fe56b0e38886ab
HOSTED SHA: 039ad22193c97759ce9bd5ca73fe56b0e38886ab
DEPLOYMENT: moovex-platform-testing / testing
DB identity: moovex-platform-v7 / testing
migration ceiling: platform/043 · blessboard/118 · activeclinic/042 · getpro/001 · ngo/001
PLATFORM ARCHITECTURE: CANONICAL_READY_WITH_RESIDUAL_DEBT
DB: CANONICAL_WITH_JUSTIFIED_COMPATIBILITY
BlessBoard QA10: 274 PASS / 0 FAIL
Hosted verification: V203_HOSTED_CRITICAL_VERIFICATION_PASS (79/0)
STALE_FAILURES_AFFECTING_HANDOFF: 0
Production: UNTOUCHED
```
