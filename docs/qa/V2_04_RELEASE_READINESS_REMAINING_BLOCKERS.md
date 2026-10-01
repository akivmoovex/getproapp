# V2.04 Release Readiness — Remaining Blockers Only

**Mode:** READ-ONLY (no code changes).  
**Date:** 2026-10-02  
**Question:** What still prevents `READY_FOR_PRODUCTION_QA=YES`?

### Excluded (by instruction)

| Excluded | Why |
|----------|-----|
| All **9** closed tracked bugs | REG-STATE-01, BB-PROVISION-01, BB-REG-WEB-01, AC-REG-WEB-01, PLATFORM-PASSWORD-UX-01, AC-WEB-EDITOR-01, AC-INITIAL-DIRTY-STATE-01, AC-SEC-01, AC-SEC-02 |
| Six P0 product decisions | PD-V204-BB-01…05, PD-V204-AC-01 — `TEMPORARY_APPROVED_FOR_V2_04` (engineering may proceed; REVIEW_LATER is post-closeout) |
| Closed patient CRITICAL_SECURITY | AC-SEC-01/02 and related security closures |
| Deferred patient features | DICOM/PACS, Medicare API, full merge, Tier-2, crypto-WORM, deep clinical binaries |
| Patient PARITY_ONLY / TEST_ONLY | **Not release-gated** under PD-V204-AC-01 OPTION B (patient FOUNDATION / non-gated) |
| P2 polish / enhancement | Editor chrome polish, Stitch medium gaps, roadmap Phase 5 adapters, asset-bust P2, etc. |

### Sources

- `docs/qa/V2_04_LAST_2_HOURS_CURSOR_SUMMARY.md`
- `docs/qa/V2_04_FINAL_GAP_AND_TEST_PLAN.md`
- `docs/product/V2_04_WEBSITE_EDITOR_PLATFORM_ROADMAP.md`
- `docs/product/V2_04_AC_BB_WEBSITE_EDITOR_COMPARISON.md`
- `docs/product/V2_04_PRODUCT_DECISION_REGISTER.md`

### Explicit non-blockers (patient)

Under **PD-V204-AC-01**, remaining patient **PARITY_ONLY** (~27) and **TEST_ONLY** (2: recovery-email negative; booking enum extension) do **not** prevent `READY_FOR_PRODUCTION_QA=YES`. No patient-domain release blocker is listed below.

---

## Blocker registry

### A. ENGINEERING

| BLOCKER_ID | PRODUCT | AREA | TYPE | CURRENT_STATUS | WHY_RELEASE_BLOCKED | MINIMUM_ACTION_TO_CLOSE | DEPENDENCY | CAN_CLOSE_NOW |
|------------|---------|------|------|----------------|---------------------|-------------------------|------------|---------------|
| ~~RB-ENG-01~~ | BB | FR-16 / AC-21 / DR-39 scoped review | CODE | **CLOSED Wave2** — `resolveManagedJoinResourceIds` wired; ministry_leader/department_head bindings; Wave2 focused PASS | — | — | — | — |
| ~~RB-ENG-02~~ | BB | FR-12 / AC-13 dual-role destinations | CODE | **CLOSED Wave2** — bidirectional `/member` ↔ `/hq` nav for dual-role; Wave2 focused PASS | — | — | — | — |
| ~~RB-ENG-03~~ | BB | Editor inline coverage (comparison **A1**) | CODE | **CLOSED Wave1** — page heroes / welcome / about photos mount shared `editable-image`; entity/collection photos remain structured by design | — | — | — | — |
| ~~RB-ENG-04~~ | PLATFORM/BB | Universal image payload (comparison **A2**) | CODE | **CLOSED Wave1** — aliases + object dual-write; focused tests **18/18** | — | — | — | — |
| ~~RB-ENG-05~~ | BB | Add Member CREATE-UI vs schema | CODE | **CLOSED Wave3** — gender/baptism optional presentation-only; not required; not persisted | — | — | — | — |

### B. PRODUCT

| BLOCKER_ID | PRODUCT | AREA | TYPE | CURRENT_STATUS | WHY_RELEASE_BLOCKED | MINIMUM_ACTION_TO_CLOSE | DEPENDENCY | CAN_CLOSE_NOW |
|------------|---------|------|------|----------------|---------------------|-------------------------|------------|---------------|
| ~~RB-PROD-01…08~~ | BB/AC | Wave2 P1 decisions | PRODUCT_DECISION | **CLOSED Wave2** — all eight `TEMPORARY_APPROVED_FOR_V2_04` · `REVIEW_LATER=YES` | — | — | — | — |

### C. AUTOMATED TEST

| BLOCKER_ID | PRODUCT | AREA | TYPE | CURRENT_STATUS | WHY_RELEASE_BLOCKED | MINIMUM_ACTION_TO_CLOSE | DEPENDENCY | CAN_CLOSE_NOW |
|------------|---------|------|------|----------------|---------------------|-------------------------|------------|---------------|
| ~~RB-TEST-01…07~~ | BB/PLATFORM | Automated proofs | TEST | **CLOSED Wave3** — `tests/v2-04-wave3-eng-test-closures.test.js` (+ M01/M02 ENG-05 asserts) | — | — | — | — |

### D. MANUAL QA

| BLOCKER_ID | PRODUCT | AREA | TYPE | CURRENT_STATUS | WHY_RELEASE_BLOCKED | MINIMUM_ACTION_TO_CLOSE | DEPENDENCY | CAN_CLOSE_NOW |
|------------|---------|------|------|----------------|---------------------|-------------------------|------------|---------------|
| RB-QA-01 | BB | Members FEATURE QA pack | MANUAL_QA | **NOT_RUN** (ingestion 2026-10-02; no evidence) | In-scope MUST Members pack never FEATURE-QA’d | Execute BB Members scenarios (T-M02–T-M15 class) on identity-bound TESTING | RB-ID-01; prefer RB-ENG-01/02 after wire | NO |
| RB-QA-02 | SHARED | Website lifecycle beyond sanity | MANUAL_QA | **NOT_RUN** (ingestion 2026-10-02; no evidence) | Publish / unpublish / version / restore / true-stale not FEATURE-proven on hosted tip | Manual lifecycle on **AC + BB** (`7c957101` or later tip) | RB-ID-01 | NO |
| RB-QA-03 | AC | Hub + public/editor regression | MANUAL_QA | **NOT_RUN** (ingestion 2026-10-02; no evidence) | Hub management-only + editor path need hosted confirmation post-fix | Manual hub (no fake canvas) + Edit Website + draft/publish smoke | RB-ID-01 | NO |
| RB-QA-04 | SHARED | Geography + concurrency hosted | MANUAL_QA | **NOT_RUN** (ingestion 2026-10-02; no evidence) | Disabled-country POST + true stale not reconfirmed on tip | Hosted QA-03-class + repeat-edit conflict on AC+BB | RB-ID-01 | NO |
| RB-QA-05 | AC | Public PHI spot-check | MANUAL_QA | **NOT_RUN** (ingestion 2026-10-02; no evidence); policy CLOSED Wave2 | Public pages need manual hygiene sign-off vs allowlist | Spot-check doctor/services pages vs allowlist | RB-PROD-07 **CLOSED** | YES (after identity capture preferred) |

### E. RELEASE IDENTITY

| BLOCKER_ID | PRODUCT | AREA | TYPE | CURRENT_STATUS | WHY_RELEASE_BLOCKED | MINIMUM_ACTION_TO_CLOSE | DEPENDENCY | CAN_CLOSE_NOW |
|------------|---------|------|------|----------------|---------------------|-------------------------|------------|---------------|
| RB-ID-01 | SHARED | Build / deployment identity | BUILD_IDENTITY | **OPEN** — sheet captured 2026-10-02 READ-ONLY; BB+AC `branch=UNKNOWN` / About `UNKNOWN testing` (hub healthz `V4` not used as BB/AC identity). HOSTED_SHA=`54cdb1f76f5a` = tip; app candidate `7c957101…`; docs-only between. ENV=testing · deploy=`moovex-platform-v8-testing` · DB=`moovex-platform-v7` / testing · About Version=2.04 · schemaCompatible · no V9/V10. SHA_MATCH PASS; BRANCH FAIL | FEATURE QA cannot claim full identity bind while product hosts report UNKNOWN branch | Rebuild/redeploy so BB+AC emit non-UNKNOWN branch (expected V4); re-verify About+healthz | None | NO (blocked on branch label) |

---

## Group summary

| Group | Blocker IDs | n |
|-------|-------------|--:|
| **A. ENGINEERING** | — (Wave3 closed) | **0** |
| **B. PRODUCT** | — (Wave2 closed) | **0** |
| **C. AUTOMATED TEST** | — (Wave3 closed) | **0** |
| **D. MANUAL QA** | RB-QA-01…05 | **5** |
| **E. RELEASE IDENTITY** | RB-ID-01 | **1** |
| **Closed Wave1** | RB-ENG-03, RB-ENG-04 | **2** |
| **Closed Wave2** | RB-PROD-01…08, RB-ENG-01, RB-ENG-02 | **10** |
| **Closed Wave3** | RB-ENG-05, RB-TEST-01…07 | **8** |
| **Total remaining unique** | | **6** |

### Editor P1 → blocker map

| Comparison P1 | Release blocker? | Mapped ID |
|---------------|------------------|-----------|
| A1 BB inline coverage | **CLOSED Wave1** | ~~RB-ENG-03~~ |
| A2 Image payload contract | **CLOSED Wave1** | ~~RB-ENG-04~~ |
| A3 Hub management-only | AC code CLOSED; hosted verify remains | RB-QA-03 (verify only) |
| A4 Shared editor regression matrix | YES | RB-TEST-07 |
| B1 AC submit-for-review maturity | Not HARD — only if publish-review claim required | Out of this hard set unless Product elevates |
| B2 Diagnostics parity | Fold into lifecycle + shared suite | RB-QA-02 + RB-TEST-07 |

Roadmap **Phase 5** product adapters / branding and all **P2** items are **not** release blockers here.

### Fastest closable now (`CAN_CLOSE_NOW=YES`)

| Set | IDs | Why fast |
|-----|-----|----------|
| Manual PHI | RB-QA-05 | Policy frozen; hosted spot-check |

**FASTEST_CLOSABLE_NOW = 1**  
**Not fast:** RB-ID-01 (BRANCH=UNKNOWN on BB+AC); RB-QA-01…04 (need identity / FEATURE pack).

---

## Minimum path to `READY_FOR_PRODUCTION_QA=YES`

1. **RB-ID-01** — fix BB+AC branch label (not UNKNOWN), then re-verify; sheet already captured for SHA/env/DB/About=2.04.  
2. ~~RB-PROD-01…08 + RB-ENG-01/02~~ **CLOSED Wave2**.  
3. ~~RB-ENG-05 + RB-TEST-01…07~~ **CLOSED Wave3**.  
4. Execute **RB-QA-01** (Members FEATURE QA) + **RB-QA-02…04** (website / geo / concurrency).  
5. Execute **RB-QA-05** (public PHI spot-check vs allowlist).

Until that set is closed (or Product **explicitly waives** a subset in writing), readiness stays **NO**.

### Wave1 closure note (2026-10-02)

- **RB-ENG-03 CLOSED:** BB page heroes, welcome, about story/community/life_together/visitor/gallery_1–3 mount shared `editable-image`; entity cards remain structured.  
- **RB-ENG-04 CLOSED:** `imageSrcFromCandidate` aliases; BB editor drafts dual-write IMAGE objects; focused suite `tests/v2-04-wave1-bb-inline-image-contract.test.js` + payload/coverage contracts **18/18 PASS**.

### Manual QA ingestion note (2026-10-02)

- Session ingestion: **no tester evidence supplied** for RB-QA-01…05.
- Classification: all five **NOT_RUN** (see `V2_04_MANUAL_QA_RESULTS_RECORD.md`).
- MANUAL_QA_REMAINING=5 · NEW_RELEASE_BLOCKERS=0 · READY_FOR_PRODUCTION_QA still **NO**.

### Wave6 build-identity verification note (2026-10-02, READ-ONLY)

| Field | BB | AC |
|-------|----|----|
| VERSION | 2.04 | 2.04 |
| BRANCH | UNKNOWN | UNKNOWN |
| FULL_GIT_SHA | `54cdb1f76f5af70593fdaf54366ce0c64ae9885c` | same |
| HOSTED_SHA | `54cdb1f76f5a` | `54cdb1f76f5a` |
| EXPECTED_CANDIDATE_SHA | app `7c957101…` · tip docs `54cdb1f76f5a…` | same |
| SHA_MATCH | PASS | PASS |
| ENVIRONMENT | testing | testing |
| DEPLOYMENT_NAME | moovex-platform-v8-testing | moovex-platform-v8-testing |
| DB_IDENTITY | moovex-platform-v7 | moovex-platform-v7 |
| DB_ENVIRONMENT | testing (`testing-v8` media NS) | testing |
| BUILD_LABEL | UNKNOWN testing | UNKNOWN testing |
| MIGRATION_CEILING | schemaCompatible; refs ≤ BB099 / AC034 / P031 | same |

Hub healthz reports `branch=V4` — **not** used to override BB/AC explicit UNKNOWN.  
`7c957101..54cdb1f76f5a` = docs-only. Local Wave2/3 app changes uncommitted / not hosted. Production untouched.  
BB_SHA_MATCH=PASS · AC_SHA_MATCH=PASS · BRANCH_IDENTITY=FAIL · ENVIRONMENT_IDENTITY=PASS · DB_IDENTITY=PASS · BUILD_IDENTITY_REMAINING=1.

### Wave3 closure note (2026-10-02)

- **RB-ENG-05 CLOSED:** Add Member gender/baptism optionalized (presentation-only; not schema-backed; not required).  
- **RB-TEST-01…07 CLOSED:** focused suite `tests/v2-04-wave3-eng-test-closures.test.js` (+ M01/M02 ENG-05 asserts).  
- No IMPLEMENTATION_DEFECT stoppers found in this wave.

### Wave2 closure note (2026-10-02)

- **RB-PROD-01…08 CLOSED:** all eight PD-V204-*-P1-* `TEMPORARY_APPROVED_FOR_V2_04` · `REVIEW_LATER=YES`.  
- **RB-ENG-01 CLOSED:** scoped join review injector wired to ministry/department leader bindings.  
- **RB-ENG-02 CLOSED:** bidirectional Member Portal / Church Management dual-role nav.  
- Also applied: session revoke Option A (BB-P1-03), rate-limit freeze 8/15 (BB-P1-04), PA deny-by-default (BB-P1-05), public allowlist (AC-P1-02), AC matrix + R08 chrome (AC-P1-01/03).  
- Focused suite: `tests/v2-04-wave2-product-decisions.test.js` **26/26 PASS**.

---

```
REMAINING_RELEASE_BLOCKERS=6
ENGINEERING=0
PRODUCT=0
AUTOMATED_TEST=0
MANUAL_QA=5
BUILD_IDENTITY=1
FASTEST_CLOSABLE_NOW=1
READY_FOR_PRODUCTION_QA=NO
BB_SHA_MATCH=PASS
AC_SHA_MATCH=PASS
BRANCH_IDENTITY=FAIL
ENVIRONMENT_IDENTITY=PASS
DB_IDENTITY=PASS
PRODUCTION_UNTOUCHED=YES
BUILD_IDENTITY_REMAINING=1
FINAL=V2_04_BUILD_IDENTITY_VERIFIED
```
