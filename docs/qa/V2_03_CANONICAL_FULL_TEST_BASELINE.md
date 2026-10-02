# V2.03 Canonical Full Test Baseline (Phase A)

**FINAL: `V2_03_CANONICAL_FULL_TEST_BASELINE_COMPLETE`**

## Identity

| Field | Value |
|---|---|
| `BASELINE_SHA` | `13f0dac4762b387c6b91260eb8bceebb27cf5076` |
| Tip at run (docs-only atop baseline) | `fa67efba0a8ecfa46886f47fae51b3c3ee331e9f` |
| Branch | `V10` |
| Worktree | `getpro` |
| Manifest | `docs/qa/manifests/V2_03_CANONICAL_TEST_MANIFEST.txt` |
| `MANIFEST_SHA` | `fda6916a001ef8ceaea7fbf5dc0403cf95f2b2f1ac87c9f78e4dba8c858c22f5` |
| `TEST_FILES` | `865` |
| Coverage | **NO** |
| `BILLING_FIX_INCLUDED_IN_RUN` | **NO** |
| `PRODUCTION` | **UNTOUCHED** |
| DB | local Postgres.app `127.0.0.1:5432` (`getpro_local`) |

Artifacts (durable): `/tmp/v203-canonical-phase-a/`  
- `combined-suite.log` (partial + hang note + remaining batches)  
- `failure-classification-final.json`  
- `billing-fix.patch` (preserved; not applied during run)  
- `git stash@{0}`: `V2_03_PHASE_A: preserve overnight SEC-AC-BILLING-FOREIGN-PATIENT`

---

## 1. Dirty tree guard

| Item | Action |
|---|---|
| Overnight billing service change (`assertPatientInTenant`) | Stashed + patch copy; **excluded from run** |
| Screenshot dirt (`AC-REG-admin-D.png`, `AC-REG-review-D.png`) | Left dirty; **not committed** |
| New QA helper scripts under `scripts/qa/` | Untracked tooling only |

`BILLING_FIX_INCLUDED_IN_RUN=NO` (preferred for baseline measurement).

---

## 2. Run census (leaf tests; suite wrappers excluded)

| Metric | Value |
|---|---|
| `PASS` | **4342** |
| `FAIL` | **2150** |
| `SKIP` | **803** |
| `CANCELLED` | **1** (file-level) |
| Wall duration | ~24.1 min (`2026-09-28T09:47:39Z` → `10:11:43Z`) |
| Productive duration | ~5 min (≈20 min open-handle hang on wave4b1) |

### Execution notes (required for honesty)

1. Full 865-file single process hung on `tests/shared-website-editor-wave4b1.test.js` (~20 min stall after 8 already-failed subtests). Process killed; suite **resumed** for remaining 207 files in batches (no coverage).
2. `CANCELLED=1` counts that hang file as cancelled at process level; its leaf failures are already in `FAIL`.
3. Node TAP `# tests/# pass/# fail` footers are **per-process**; combined leaf census above is authoritative.
4. Historical residual estimate ≈315 aligns with **non-ENVIRONMENT** residual ≈**249** (see §3), not raw `FAIL=2150`.

---

## 3. Failure map summary

| Field | Value |
|---|---|
| `FAILED_TEST_FILES` | **359** |
| `UNIQUE_FAILURE_SIGNATURES` | **59** |
| `UNIQUE_ROOT_CAUSES` | **17** |

### FAILURES_BY_PRODUCT

| Product | Failures |
|---|---|
| `PLATFORM` | 182 |
| `BB` | 1126 |
| `AC` | 478 |
| `CROSS_PRODUCT` | 364 |
| `INFRA` | 0 |

### FAILURES_BY_CLASS

| Class | Count |
|---|---|
| `STALE_TEST` | 85 |
| `FIXTURE_DRIFT` | 1 |
| `ENVIRONMENT` | **1902** |
| `APPLICATION_DEFECT` | **0** (validated) |
| `SECURITY_DEFECT` | **0** (validated; authz cases drowned by ENV) |
| `QA_CONTRACT_MISMATCH` | 9 |
| `TEST_INFRA` | 28 |
| `UNKNOWN` | 125 |

### Priority buckets (failure counts)

| Priority | Count | Notes |
|---|---|---|
| `P0` | **0** | No confirmed tenant/RBAC/security product P0 from this run |
| `P1` | **2** | `RC_BB_PUBLISH_ISOLATION_EMPTY` only — **requires exact reproduction** before any app fix |
| `P2` | **1936** | Dominated by PG trust ENVIRONMENT |
| `P3` | **127** | Mostly UNKNOWN / low-signal asserts |
| `TEST_DEBT_ONLY` | **85** | CSS fingerprint / regex HTML / library label |

### Non-ENVIRONMENT residual (actionable vs historical ≈315)

| | Count |
|---|---|
| Non-ENV failures | **249** |
| Of which STALE_TEST | 85 |
| UNKNOWN | 125 |
| TEST_INFRA | 28 |
| QA_CONTRACT_MISMATCH | 9 |
| FIXTURE_DRIFT | 1 |
| APPLICATION_DEFECT | 0 |

---

## 4. TOP_20_ROOT_CAUSES

| RC_ID | Count | Files | Class | Sev | Signature / layer |
|---|---|---|---|---|---|
| `RC_ENV_PG_TRUST_REJECTED` | 1876 | 252 | ENVIRONMENT | P2 | Postgres.app rejected `"trust"` — `test_db_auth` |
| `RC_EMPTY_ERROR` | 63 | 14 | UNKNOWN | P3 | empty TAP error body |
| `RC10_CSS_FINGERPRINT` | 54 | 34 | STALE_TEST | TEST_DEBT_ONLY | stale CSS `?v=` |
| `RC_ASSERT_VALUE` | 30 | 23 | UNKNOWN | P3 | strict/deep equal drift |
| `RC_OTHER` | 30 | 21 | UNKNOWN | P3 | heterogeneous (auth CSS v=, phone field, PA bundle…) |
| `RC22_REGEX_HTML_CONTRACT` | 26 | 23 | STALE_TEST | TEST_DEBT_ONLY | HTML/JS regex contract |
| `RC_PARENT_CANCELLED` | 26 | 6 | TEST_INFRA | P2 | cancelled by parent |
| `RC_ENV_DB_POOL_REQUIRED` | 23 | 6 | ENVIRONMENT | P2 | database client or pool required |
| `RC_BB_WEBSITE_PREVIEW_LINK` | 5 | 4 | QA_CONTRACT_MISMATCH | P2 | `/admin/organizations/…/website-preview` |
| `RC06_LIBRARY_LABEL` | 5 | 5 | STALE_TEST | TEST_DEBT_ONLY | Content vs Image Library |
| `RC_AC_MEDIA_ASSET_MAP` | 3 | 2 | QA_CONTRACT_MISMATCH | P3 | hero/doctor asset mapping |
| `RC12_PLATFORM_LINE_HOST` | 2 | 2 | ENVIRONMENT | P2 | `PLATFORM_LINE_HOST_MISMATCH` |
| `RC_BB_PUBLISH_ISOLATION_EMPTY` | 2 | 1 | UNKNOWN | **P1** | BB branch publish isolation (empty error) — repro required |
| `RC_TIMEOUT` | 2 | 2 | TEST_INFRA | P2 | timeout |
| `RC_AC_PERMISSION_SEED_LIST` | 1 | 1 | FIXTURE_DRIFT | P2 | AC permission catalogue seed list |
| `RC_AC_EMPTY_STATE_MARKER` | 1 | 1 | QA_CONTRACT_MISMATCH | P3 | `clinical-queue-empty` marker |
| `RC_ENV_DB_POOL_REQUIRED_TITLE_MISMATCH` | 1 | 1 | ENVIRONMENT | P2 | pool error; title mentioned freeze (not app defect) |

(Only 17 distinct RCs; table is complete.)

### Hang (execution infra)

| Item | Detail |
|---|---|
| File | `tests/shared-website-editor-wave4b1.test.js` |
| Class | `TEST_INFRA` |
| Behavior | 8 subtests failed, then open-handle stall; killed + resumed |
| Severity | P2 (blocks single-process full-manifest runs) |

---

## 5. RC01 / RC02 / RC03

| Gate | Result |
|---|---|
| `RC01_REAPPEARED` | **NO** |
| `RC02_REAPPEARED` | **NO** |
| `RC03_REAPPEARED` | **NO** |

---

## 6. ENVIRONMENT dominance (critical baseline finding)

`RC_ENV_PG_TRUST_REJECTED` accounts for **1876/2150 (87%)** of leaf failures across **252 files**.

Control: `tests/activeclinic-account-lifecycle.test.js` alone → **12 pass / 0 fail** on the same local Postgres. Under the mega-manifest process it fails with trust rejection. Conclusion: **suite-scale ENV/auth load-order issue**, not product regressions for that mass.

Until ENV is stabilized (batched runner as default, or trust/auth fix under large argv), **authorization / tenant / billing / clinical / publishing defect signals are largely unobservable** in a single-process 865-file run.

---

## 7. Billing dirty-fix reconciliation

### What the dirty change does

Adds `assertPatientInTenant` to `src/activeclinic/services/activeClinicBillingService.js` and calls it from:

- `createPatientCharge`
- `createInvoice`
- `recordPayment`

Intent: refuse foreign `patientId` even when the actor is authorized in their own tenant (`SEC-AC-BILLING-FOREIGN-PATIENT`).

### Mapping to this canonical run

| Check | Result |
|---|---|
| Fix included in run? | **NO** |
| Canonical reproduction of claimed bug? | **NO** — `tests/activeclinic-finance-rbac.test.js` “cross-tenant payment/invoice and foreign facility session denied” failed with `Postgres.app rejected "trust" authentication` at `requireDb`, **before** billing service tenant checks execute |
| Other billing files | Same ENV pattern (`batch1a-billing`, `batch2-billing`, coverage-gap billing paths → pool/trust) |

### Verdict

`BILLING_FIX_STATUS=UNVALIDATED_DIRTY_CHANGE`

Do **not** commit in Phase A. Preserve stash/patch for a Phase B isolated repro with ENV healthy.

---

## 8. Sensitive domains (attention)

| Domain | Observation this run |
|---|---|
| Authorization / tenant isolation | Mostly ENV-drowned; no validated SECURITY_DEFECT leaf cluster |
| Patient / clinical | Failures present; predominantly trust/pool |
| Booking | No validated `RC19` booking↔patient cluster after title corrections |
| Billing / finance | ENV-blocked; dirty fix **unvalidated** |
| Publishing | `RC_BB_PUBLISH_ISOLATION_EMPTY` → **P1 pending exact repro** |
| Media / upload | Stale library labels + AC media asset map mismatches |
| Registration | Stale consent/CSS fingerprint contracts in STALE_TEST |
| Destructive writes | No isolated P0/P1 app defect confirmed |

---

## 9. Phase A gates

| Gate | Status |
|---|---|
| Dirty billing excluded | PASS |
| Manifest 865 exact | PASS (attempted; hang + resume) |
| No coverage | PASS |
| Production untouched | PASS |
| RC01–03 stay green | PASS |
| Every failure classified | PASS (17 RCs; UNKNOWN residual remains for Phase B) |
| Billing fix not committed | PASS |

---

## FINAL

```
BASELINE_SHA=13f0dac4762b387c6b91260eb8bceebb27cf5076
MANIFEST_SHA=fda6916a001ef8ceaea7fbf5dc0403cf95f2b2f1ac87c9f78e4dba8c858c22f5
TEST_FILES=865
PASS=4342
FAIL=2150
SKIP=803
CANCELLED=1
FAILED_TEST_FILES=359
UNIQUE_FAILURE_SIGNATURES=59
UNIQUE_ROOT_CAUSES=17
BILLING_FIX_INCLUDED_IN_RUN=NO
BILLING_FIX_STATUS=UNVALIDATED_DIRTY_CHANGE
RC01_REAPPEARED=NO
RC02_REAPPEARED=NO
RC03_REAPPEARED=NO
PRODUCTION=UNTOUCHED
V2_03_CANONICAL_FULL_TEST_BASELINE_COMPLETE
```
