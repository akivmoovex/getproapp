# V2.03 Overnight Result Reconciliation

**Doc ID:** `V2_03_OVERNIGHT_RECONCILIATION`  
**Date:** 2026-09-28  
**Mode:** DIAGNOSTIC ONLY (no fixes, no new coverage tests, no full-suite rerun, production untouched)

---

## Authoritative inputs reconciled

| Run | Worktree | HEAD SHA | Test files | PASS / FAIL / SKIP | Coverage S/B/F/L |
|--|--|--|--:|--|--|
| Earlier full coverage | `getpro-v202-cov-audit` | `c73dd9b2…` | 855 | 6184 / 452 / (no `# skip` summary; `# cancelled=0`) | 65.71 / 62.55 / 65.40 / 65.71 |
| Overnight final | `getpro` | `1e425129…` | 864 | 4018 / 1717 / 844 (+ cancelled=26) | 37.88 / 62.49 / 30.31 / 37.88 |

Overnight identity (from final report):

```text
START_SHA=FINAL_SHA=1e4251291c9f7440c6138a8ff6cec17478583eb4
```

---

## 1. Test count difference (855 → 864)

### Exact 9 additional files

Diff of `tests/**/*.test.js` between cov-audit tree (855) and overnight manifest (864):

| # | FILE | SOURCE | WHEN_ADDED | TRACKED/UNTRACKED | WHY_INCLUDED | OVERNIGHT OUTCOME (batch 009 suite rollups) |
|--:|--|--|--|--|--|--|
| 1 | `tests/v203-ac-batch1-test-readiness.test.js` | V2.03 QA07 readiness | Commit `1e425129` (2026-09-28) | TRACKED | Present on overnight tip; absent from cov-audit @ `c73dd9b2` | Inventory suites **PASS**; HTTP/DB suites **SKIP/FAIL** (PG trust) |
| 2 | `tests/v203-ac-batch2-test-readiness.test.js` | V2.03 QA08 readiness | `1e425129` | TRACKED | Same | Inventory **PASS**; mutation/DB suites **SKIP/FAIL** |
| 3 | `tests/v203-ac-batch3-test-readiness.test.js` | V2.03 QA09 readiness | `1e425129` | TRACKED | Same | Inventory **PASS**; authz/DB suites **SKIP/FAIL** |
| 4 | `tests/v203-bb-regression-test-readiness.test.js` | V2.03 QA10 readiness | `1e425129` | TRACKED | Same | Inventory/bridge **PASS**; `user_roles` cutover **SKIP/FAIL** |
| 5 | `tests/v203-critical-platform-security.test.js` | V2.03 QA06 security | `1e425129` | TRACKED | Same | Unit/RBAC suites **PASS**; foundation CMS/media write suite **SKIP/FAIL** |
| 6 | `tests/v203-end-to-end-journeys.test.js` | V2.03 QA11 journeys | `1e425129` | TRACKED | Same | Inventory **PASS**; journey HTTP suites **SKIP/FAIL** |
| 7 | `tests/v203-qa-automation-gaps.test.js` | Overnight Prompt 4 | Working tree mtime 2026-09-28 04:21 | **UNTRACKED** | Glob `tests/**/*.test.js` picks up dirty files | Unit gap suites **PASS**; DB workflow suite **7 SKIP** |
| 8 | `tests/v203-coverage-gap-closure.test.js` | Overnight Prompt 6 | Working tree mtime 2026-09-28 05:09 | **UNTRACKED** | Same | Unit authz **PASS**; billing/clinical DB suites **SKIP/FAIL** |
| 9 | `tests/v203-security-coverage-gate.test.js` | Overnight Prompt 7 | Working tree mtime 2026-09-28 05:14 | **UNTRACKED** | Same | Inventory + forged/publish/media unit **PASS**; AC billing/clinical write matrix **SKIP/FAIL** |

```text
TEST_COUNT_DELTA_EXPLAINED=YES
# 6 files landed in tip commit 1e425129 (not in earlier cov-audit SHA);
# 3 files are overnight uncommitted additions included by the batched glob.
```

### Why `START_SHA=FINAL_SHA` despite overnight “add/fix” intent

Overnight application/test work was **never committed**. Prompt 8 explicitly records dirty worktree on the same tip:

- Modified: `package.json`, `activeClinicBillingService.js`, `activeclinic-finance-rbac.test.js`, screenshots
- Untracked: overnight docs + the three `tests/v203-{qa-automation-gaps,coverage-gap-closure,security-coverage-gate}.test.js`

Separately, RC01–RC03 and Prompt-2 remediation live as **dirty changes in `getpro-v202-cov-audit`**, not on `getpro` @ `1e425129`. Overnight therefore did **not** execute the RC-fixed tree the “~315 residual” forecast assumed.

```text
CHANGES_ONLY_IN_DIRTY_WORKING_TREE=YES (overnight getpro)
RC01_03_AND_PROMPT2_FIXES_NOT_ON_OVERNIGHT_TIP=YES (remain in cov-audit dirty tree)
```

---

## 2. Pass/fail reconciliation (452 → ~315 expected → 1717)

### Why the “~315 after RC01–03” forecast did not apply

| Assumption behind ~315 | Reality on overnight tip |
|--|--|
| RC01 (−114), RC02 (−12), RC03 (−11) applied | Fixes exist only in **cov-audit dirty tree**, not overnight `getpro` tip |
| Same DB/auth environment as earlier run | Overnight: **`Postgres.app rejected "trust" authentication`** |
| Same worktree/SHA lineage | Earlier = cov-audit @ `c73dd9b2`; overnight = getpro @ `1e425129` + dirty files |

### Overnight failure parse (existing logs only)

Sources: `coverage/v203/batches/batch-000.log` … `batch-011.log`, `run.log`, `progress.json`.

Orchestrator census: **FAIL=1717** (sum of per-batch counters; batch **008 counted as 0/0/0** after stall kill — see §5).

Parsed leaf `testCodeFailure` signatures (all batches, including 008 log content):

| Rank | ROOT_CAUSE | FAILURES (approx) | PRODUCT skew | ERROR_SIGNATURE | ENVIRONMENTAL | EXISTED_IN_EARLIER_RUN |
|--:|--|--:|--|--|--|--|
| 1 | `ENV_PG_TRUST_REJECTED` | ~1626–1849 | BB/AC/PLATFORM/CROSS | `Local PostgreSQL unavailable: Postgres.app rejected "trust" authentication` (and wrappers: Setup/DB/REQUIRES DATABASE) | **YES** | **NO** (earlier run reached real asserts; 452 were schema/stale/app) |
| 2 | `CASCADE_UNDEFINED_FROM_FAILED_SETUP` | ~60+ | mixed | `Cannot read properties of undefined (reading 'id'|'organizationId'|'query'|'address')` after failed provision | YES (downstream of #1) | NO as dominant class |
| 3 | `ENV_DB_POOL_REQUIRED` | ~5–50 | AC readiness / gap | `database client or pool required` / provision `transaction_error` | YES | NO |
| 4 | `ENV_TEST_DATABASE_URL_MISSING` | appears mainly as **skips** (~52) | mixed | `PostgreSQL test database not configured (set TEST_DATABASE_URL…)` | YES | partial (some suites always conditional) |
| 5 | Residual non-PG asserts | small vs #1 | mixed | HTTP/regex/value mismatches when setup partially proceeded | mixed | YES (subset of earlier 452), but **drowned** by #1 |

```text
UNIQUE_ROOT_CAUSES≈5_DOMINANT (PG trust + cascades + minor residuals)
FAILED_TEST_FILES≈275–301 (location-attributed); orchestrator fail leaves span majority of DB suites
```

**RC01 `branch_name` NOT NULL does not appear as an overnight signature** — suites never got far enough past PG auth for that seed failure mode to dominate.

### Multiplication factors checklist

| Factor | Role in 452→1717 |
|--|--|
| DB state / auth | **PRIMARY** — Postgres.app trust rejection |
| migration state | Not indicated as primary overnight signature |
| missing seed | Secondary only after connect failure |
| environment variables | Related (`FOUNDATION_ADMIN_DATABASE_URL` / `TEST_DATABASE_URL` messaging on skips) |
| test ordering | Not primary |
| batched execution | Secondary — batch 008 stall zeroed census; does not create PG trust errors |
| coverage runner | Secondary — measures depressed execution; does not invent PG auth failures |
| shared DB contamination | Not primary signature |
| server lifecycle | Cascade undefined `address` after failed listen/provision |
| port collision | Not observed as top signature |
| session state | Not primary |
| working-tree differences | **Material** — RC fixes absent; 9 extra files; billing fix uncommitted |
| new tests | Minor (+9 files); not the 4× fail jump |
| timeouts | Batch 008 stall (open-handle), not the mass fail class |
| Playwright/browser | Tiny residue (~4–7) |
| other | Suite `# SKIP` emitted on `not ok` lines (counted as fail/skip inconsistently) |

```text
1717_FAILURES_EXPLAINED=YES
# Dominant cause: environmental Postgres trust auth failure on overnight getpro run,
# plus absence of cov-audit RC remediations on this tip, plus batch-008 census loss.
```

---

## 3. Explain 844 skips

Official: `SKIP=844` (`progress.json` / meta). Parsed `# SKIP` on `ok`/`not ok` lines across batch logs ≈798–888 depending on whether batch 008 is included (orchestrator omitted 008).

### Skip mechanisms observed

| Mechanism | Evidence | Bucket |
|--|--|--|
| Conditional / fixture skip after PG trust failure | `REQUIRES DATABASE: … Postgres.app rejected "trust"…`; `Local PostgreSQL unavailable: …trust…`; `Setup unavailable: …trust…` | **FAILURE_CAUSED_SKIPS** |
| Explicit env prerequisite | `PostgreSQL test database not configured (set TEST_DATABASE_URL…)` (~52) | **CONDITIONAL_SKIPS** |
| Intentional legacy/superseded | `legacy mocha suite against superseded billing schema`; `Canonical suite is church-foundation-growth-regression…` | **INTENTIONAL_SKIPS** |
| `not ok … # SKIP …` hybrid | Node TAP: foundation skip after assertion/setup throw — inflates fail+skip coupling | FAILURE_CAUSED (+ accounting noise) |
| Suite/setup failure aborting descendants | `cancelledByParent` = 26 official | FAILURE_CAUSED (cancelled, not skip) |
| Coverage runner filtering | None — skips are test-runner skips, not c8 filters | N/A |

Approximate classification of parsed skip reasons (batch logs; order-of-magnitude):

```text
INTENTIONAL_SKIPS≈3–10
CONDITIONAL_SKIPS≈52–60   # TEST_DATABASE_URL / not configured
FAILURE_CAUSED_SKIPS≈340–800+  # PG trust / foundation unavailable (dominant)
UNKNOWN_SKIPS≈0–50        # empty/# SKIP with thin reason; batch-008 undercount
```

### Security / QA / high-risk among skips

Large volume of skipped/failed-as-skip cases include:

- ActiveClinic patient merge / role permission matrices  
- Booking linkage / cross-tenant patient denies  
- QA role catalogue permissions  
- V203 QA06 foundation CMS/media write isolation  
- V203 QA gaps **DB workflow** suite (media/CMS/publish/booking/reg) — 7 skips  
- V203 security gate **AC last-admin + billing/clinical write matrix** — 3 skips  
- Finance/billing HTTP suites failing at connect (not true security pass)

```text
844_SKIPS_EXPLAINED=YES
TEST_INTEGRITY=PASS is insufficient: many high-risk scenarios never meaningfully executed overnight.
```

---

## 4. Coverage collapse (65.71 → 37.88 lines; 65.40 → 30.31 functions; branches ~flat)

### Artifact / config comparison

| Dimension | Earlier (65.71%) | Overnight (37.88%) |
|--|--|--|
| Runner | `scripts/coverage/run-v203-coverage.js` monolithic c8 | `run-v203-coverage-batched.js` |
| Include | `src/**`, `server.js`, `server.legacy.js`, `index.js` | **Identical** |
| Exclude / `.c8rc.json` | Same exclude list | Same (unedited vs HEAD) |
| `all` flag | Not set | Not set |
| Temp dir | c8 default under reports | Shared `coverage/v203/tmp` |
| Clean | Single run | `--clean` **only batch 000**; `--clean=false` thereafter (**confirmed in run.log**) |
| Merge | Single process report | Final `c8 report --merge-async` on shared temp |
| cwd | cov-audit worktree | getpro worktree |
| NODE_V8_COVERAGE | via c8 | via c8 |
| Source maps | same stack | same stack |
| Test manifest | 855 files | 864 files |
| Failed/completed batches | N/A (mono) | 11 failed exit=1 + 1 hung; all marked completed in progress |

### Denominator / numerator (machine totals)

| Metric | EARLIER | OVERNIGHT |
|--|--:|--:|
| INSTRUMENTED_FILES | **1337** | **1333** |
| TOTAL_LINES / COVERED_LINES | **443583 / 291496** | **443902 / 168155** |
| TOTAL_STATEMENTS / COVERED | **443583 / 291496** | **443902 / 168155** |
| TOTAL_FUNCTIONS / COVERED | **10636 / 6956** | **10488 / 3179** |
| TOTAL_BRANCHES / COVERED | **67498 / 42226** | **26481 / 16548** |

```text
EARLIER_INSTRUMENTED_FILES=1337
OVERNIGHT_INSTRUMENTED_FILES=1333
EARLIER_TOTAL_LINES=443583
OVERNIGHT_TOTAL_LINES=443902
EARLIER_COVERED_LINES=291496
OVERNIGHT_COVERED_LINES=168155
```

### Why lines/functions collapse while branch % stays ~62.5%

1. **Line/statement denominator nearly unchanged** (+319 lines) → not a `.c8rc` exclusion / `all` gaming event.  
2. **Covered lines fell by ~123k** because DB-backed suites aborted at Postgres trust auth → far less application code executed.  
3. **Branch totals collapsed ~67k → ~26k** while covered branches fell proportionally → **ratio stays ~62.5%**. Per-file diffs show identical line totals with drastically smaller branch maps when deep paths never run (V8/c8 observed-branch shrinkage). Branches % is **not** evidence that overnight coverage quality matches the earlier run.  
4. Functions behave like lines (denominator stable-ish; covered collapses).

```text
COVERAGE_DROP_EXPLAINED=YES
# Primary: environmentally aborted execution (PG trust), not denominator sabotage.
# Branch % flatness is a measurement artifact of a shrunken observed-branch set.
```

---

## 5. Batch merge correctness

Orchestration evidence: `coverage/v203/batches/run.log`, `progress.json`, `coverage/v203/tmp` (893 V8 files), empty per-batch `reports-*` dirs (expected — reporters disabled per batch; merge from shared temp).

| BATCH_ID | TEST_FILES | EXIT_CODE | V8_FILES_WRITTEN (approx new) | CHECKPOINT_COMPLETE | INCLUDED_IN_FINAL_MERGE |
|--|--:|--:|--:|--|--|
| 000 | 75 | 1 | ~76 | YES | YES (`clean=true` only here) |
| 001 | 75 | 1 | ~76 | YES | YES |
| 002 | 75 | 1 | ~80 | YES | YES |
| 003 | 75 | 1 | ~76 | YES | YES |
| 004 | 75 | 1 | ~82 | YES | YES |
| 005 | 75 | 1 | ~82 | YES | YES |
| 006 | 75 | 1 | ~77 | YES | YES |
| 007 | 75 | 1 | ~82 | YES | YES |
| 008 | 75 | 1 (stall kill) | ~66 | YES (marked complete) | **PARTIAL V8 YES**; **census NO** (pass/fail/skip forced 0) |
| 009 | 75 | 1 | ~78 | YES | YES |
| 010 | 75 | 1 | ~78 | YES | YES |
| 011 | 39 | 1 | ~40 | YES | YES |

Audit answers:

| Question | Answer |
|--|--|
| `--clean` after batch 1? | **NO** — only batch 000 |
| Temp overwritten incorrectly? | **NO** evidence — cumulative V8 files grow 76→893 |
| Failed batches omitted from merge? | **NO** — failed exit=1 batches still wrote V8; final report used shared temp |
| Resume skipped coverage incorrectly? | Final run status `complete` with all 12 ids; not a bad resume wipe |
| Final c8 wrong temp? | **NO** — meta `tempDirectory=coverage/v203/tmp` |
| Scopes/config differed per batch? | **NO** — identical include/config |

```text
ALL_BATCHES_PRESENT_IN_FINAL_COVERAGE=YES (V8 contribution)
BATCH_MERGE_VALID=PARTIAL
# Merge mechanics OK; batch 008 TAP census omitted from PASS/FAIL/SKIP totals;
# coverage still under-represents green execution due to PG trust + hang.
```

Corrected census if batch 008 leaf TAP is restored (approx from `batch-008.log`):

```text
PASS≈4232  FAIL≈2003  SKIP≈888
# (214 ok + 286 fail + 44 skip leaf-ish in batch 008 log; orchestrator stored 0/0/0)
```

---

## 6. QA 98/98 claim

Matrix (`V2_03_QA_AUTOMATION_MATRIX.md`): **98/98 AUTOMATED=YES** (automation inventory claim).

Overnight full suite does **not** prove those 98 passed.

| Count | Value | Meaning |
|--|--:|--|
| QA_AUTOMATION_EXISTS | **98** | Matrix marks YES; gap suite + cited evidence files exist |
| QA_EXECUTED | **≈98 scheduled** / **meaningful exec PARTIAL** | Files were on overnight manifest; many DB workflows aborted on PG trust |
| QA_PASSING | **≪98 (NOT 98)** | Prompt-4 DB workflow suite overnight: **7 SKIP**; many cited BB/AC suites fail at connect |
| QA_FAILED | **large (env-dominated)** | Trust-impacted evidence suites |
| QA_SKIPPED | **material** | Foundation/REQUIRES DATABASE skips on high-value workflows |

Prompt 4’s earlier targeted `25/25` green and Prompt 8’s “100% automatable” gate refer to **automation existence / prior targeted packs**, not overnight full-suite pass.

```text
QA_98_98_VALID=NO  # as overnight execution/pass claim
QA_AUTOMATION_EXISTS=98
QA_EXECUTED=PARTIAL
QA_PASSING=NOT_98
QA_FAILED=ENV_DOMINATED
QA_SKIPPED=MATERIAL_INCLUDING_HIGH_RISK
```

---

## 7. Security gate reconciliation

Overnight final report: `P0=0 P1=0 SECURITY_GATE=PASS`.

### What actually ran overnight (batch 009 suite rollups)

| Suite | Overnight parent result |
|--|--|
| V203 security gate — inventory integrity | ok |
| V203 security gate — forged scope / publish / media / escalation | ok |
| V203 security gate — **AC last-admin + billing/clinical write matrix** | **not ok** (SKIPs on PG trust) |
| V203 QA06 unit auth/session/RBAC / publish matrix / audit / bootstrap | ok |
| V203 QA06 CMS/media/publish write isolation (foundation) | **not ok** (SKIPs) |
| Companion DB suites (`finance-rbac`, `p0-publish-auth`, `v8-shared-rbac-tenant-isolation`, …) | fail/skip at PG trust in their batches |

Prompt 7’s companion pack **79/0/0** was a **targeted** run (documented in `V2_03_SECURITY_COVERAGE_GATE.md`), **not** re-proven by the overnight full batched census.

```text
SECURITY_TESTS_TOTAL (companion pack claimed)=79
SECURITY_EXECUTED (overnight full suite)=PARTIAL
SECURITY_PASS (overnight)=UNIT_SUBSET_ONLY
SECURITY_FAIL / SECURITY_SKIP (overnight)=WRITE_MATRIX_AND_FOUNDATION_DB_CASES
SECURITY_GATE_VALID=NO  # must not remain PASS for overnight full-suite gate
```

P0/P1 “open defect” bookkeeping from Prompt 7 (billing foreign-patient fix in dirty tree) is separate from “security tests passed overnight.”

---

## 8. Trusted baseline

| Run | Classification | Rationale |
|--|--|--|
| EARLIER_65_71_RUN | **PARTIAL** (valid measurement, not green-suite coverage) | Completed monolithic run with working Postgres; 452 real leaf failures; coverage reflects substantial execution. Not “green suite ≥90%.” |
| OVERNIGHT_37_88_RUN | **INVALID** as comparable quality/coverage baseline; **PARTIAL** as orchestration artifact | Dominated by PG trust env failure; RC fixes absent; batch 008 census lost; branch % coincidence misleading |

**Current coverage baseline to use:** earlier freeze/hang-diag totals:

```text
TRUSTED_COVERAGE_BASELINE:
S=65.71
B=62.55
F=65.40
L=65.71
```

**Current test health baseline to use:** earlier leaf census (same run), not overnight 4018/1717:

```text
TRUSTED_TEST_BASELINE:
PASS=6184
FAIL=452
SKIP=(not summarized as # skip in earlier log; cancelled=0)
```

Do **not** prefer 65.71% merely because it is higher — prefer it because the overnight percentage is environmentally depressed and not comparable. Do **not** treat overnight 37.88% as proof the product lost ~28 points of real coverage.

---

## 9. Summary markers (no fixes performed)

```text
TEST_COUNT_DELTA_EXPLAINED=YES
1717_FAILURES_EXPLAINED=YES
844_SKIPS_EXPLAINED=YES
COVERAGE_DROP_EXPLAINED=YES
BATCH_MERGE_VALID=PARTIAL
QA_98_98_VALID=NO
SECURITY_GATE_VALID=NO

TRUSTED_TEST_BASELINE:
PASS=6184
FAIL=452
SKIP=unsummarized_in_earlier_log

TRUSTED_COVERAGE_BASELINE:
S=65.71
B=62.55
F=65.40
L=65.71

PRIMARY_ROOT_CAUSE=
Overnight full suite ran on getpro tip without cov-audit RC remediations and with
Postgres.app rejecting trust authentication, aborting most DB-backed tests;
coverage and gates then reflected non-execution, not a true 65→38 product coverage cliff.
Batch 008 stall also dropped TAP census (not V8 merge wipe).

FINAL:
V2_03_OVERNIGHT_RESULT_UNTRUSTWORTHY
```

---

## Production

```text
PRODUCTION=UNTOUCHED
```
