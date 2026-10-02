# V2.04 Release Blocker Closure Queue

**Mode:** LIVE queue (Wave1+Wave2 applied).  
**Date:** 2026-10-02  
**Input:** `docs/qa/V2_04_RELEASE_READINESS_REMAINING_BLOCKERS.md` (6 remaining after Wave3 eng+test)  
**Also:** `V2_04_FINAL_GAP_AND_TEST_PLAN.md`, `V2_04_LAST_2_HOURS_CURSOR_SUMMARY.md`, `V2_04_PRODUCT_DECISION_REGISTER.md`

### Rules applied

- No re-audit of closed bugs; no P2 enhancements; no deferred features.
- AC patient PARITY_ONLY / TEST_ONLY remain **non-gating** (PD-V204-AC-01).
- Manual QA never precedes its dependent code/test work.
- Identity sheet must be **captured before Wave 5 executes**; formal **RB-ID-01** close is Wave 6. **2026-10-02:** Hostinger subdomain env **unsupported**; shared `.getpro/build-identity.json` fix landed (focused 10/10); live BB+AC still UNKNOWN until Hostinger redeploy.
- Collapse: shared root-cause chains listed in §Dependency chains (blockers kept as distinct IDs for burn-down).

### Of the 18 `FASTEST_CLOSABLE_NOW` — truly independent?

| Truly independent (no other remaining blocker) | Soft / not independent |
|------------------------------------------------|------------------------|
| RB-PROD-01…08 | — |
| RB-TEST-01…06 | — |
| RB-ID-01 | — |
| RB-TEST-07 | Soft prefer after ENG-03/04 — **those CLOSED Wave1** → TEST-07 now independent |
| **Independent remaining fast = 16** | ~~RB-ENG-03/04 CLOSED~~ |

Wave assignment still puts Product→Wave 2, Tests→Wave 4, Identity→Wave 6 even when independent.

### Wave1 status (2026-10-02)

| BLOCKER_ID | RESULT | Evidence |
|------------|--------|----------|
| RB-ENG-03 | **CLOSED** | BB page heroes / welcome / about photos → shared `editable-image`; entity cards remain structured |
| RB-ENG-04 | **CLOSED** | `imageSrcFromCandidate` aliases; drafts dual-write IMAGE objects; `tests/v2-04-wave1-bb-inline-image-contract.test.js` + payload/coverage **18/18 PASS** |
| WAVE1_BLOCKED | **0** | Neither item needed a product decision |


---

## §Dependency chains (6)

| # | Chain | Blockers | Collapse note |
|---|-------|----------|---------------|
| 1 | Scoped review | RB-PROD-01 → RB-ENG-01 → (mount proof) → RB-QA-01 | One MUST Members scope root cause |
| 2 | Dual-role destinations | RB-PROD-02 → RB-ENG-02 → RB-QA-01 | One MUST dual-experience root cause |
| 3 | CREATE-UI schema | Product field-set confirm → RB-ENG-05 | No PD-V204 ID; quick Wave-2 gate |
| 4 | Editor claim | ~~RB-ENG-03 + RB-ENG-04~~ **CLOSED Wave1** → RB-TEST-07 → RB-QA-02 (/03) | Comparison A1/A2 done; A4 test + lifecycle QA remain |
| 5 | Public PHI | RB-PROD-07 → RB-QA-05 | Policy then spot-check |
| 6 | Identity → FEATURE QA | Identity capture → RB-QA-01…04; formal RB-ID-01 Wave 6 | Bind before manual; attest at end |

Secondary Product freezes (RB-PROD-03/04/05, RB-PROD-06/08) unlock claim completeness / presentation hygiene but do not gate Wave-1 editor eng.

---

## Full queue (all 26)

| BLOCKER_ID | PRODUCT | AREA | TYPE | PRIORITY | DEPENDENCIES | CAN_CLOSE_NOW | BLOCKED_BY | EXACT_ACTION | EXPECTED_EVIDENCE | ESTIMATED_EFFORT | RISK | WAVE |
|------------|---------|------|------|----------|--------------|---------------|------------|--------------|-------------------|------------------|------|------|
| RB-ENG-03 | BB | Editor inline coverage (A1) | ENGINEERING | P1 | Shared WE01 dialogs | — | — | ~~Port AC public pencil pattern~~ | **CLOSED Wave1** — pencils on page heroes / welcome / about photos | — | — | **1 CLOSED** |
| RB-ENG-04 | PLATFORM | Universal image payload (A2) | ENGINEERING | P1 | — | — | — | ~~Accept string URL + object shape~~ | **CLOSED Wave1** — aliases + object dual-write; 18/18 focused | — | — | **1 CLOSED** |
| ~~RB-PROD-01~~ | BB | DR-39 binding keys | PRODUCT | P0 | — | — | — | ~~Freeze keys~~ | **CLOSED Wave2** — OPTION A · TEMPORARY_APPROVED | — | — | **2 CLOSED** |
| ~~RB-PROD-02~~ | BB | FR-12 dual-role destinations | PRODUCT | P0 | — | — | — | ~~Confirm destinations~~ | **CLOSED Wave2** — `/member`↔`/hq` | — | — | **2 CLOSED** |
| ~~RB-PROD-03~~ | BB | DR-51 relevant sessions | PRODUCT | P1 | — | — | — | ~~Enumerate sessions~~ | **CLOSED Wave2** — OPTION A revoke all church-scoped | — | — | **2 CLOSED** |
| ~~RB-PROD-04~~ | BB | DR-52 rate-limit thresholds | PRODUCT | P1 | — | — | — | ~~Freeze N/window~~ | **CLOSED Wave2** — 8/15 min temporary | — | — | **2 CLOSED** |
| ~~RB-PROD-05~~ | BB | DR-55 PA cross-tenant | PRODUCT | P1 | — | — | — | ~~Enumerate PA actions~~ | **CLOSED Wave2** — deny-by-default empty allowlist | — | — | **2 CLOSED** |
| ~~RB-PROD-06~~ | AC | Stitch control matrix | PRODUCT | P1 | PD-V204-AC-01 | — | — | ~~Sign matrix~~ | **CLOSED Wave2** — PRESENTATION/FOUNDATION/FUTURE | — | — | **2 CLOSED** |
| ~~RB-PROD-07~~ | AC | Public PHI / field policy | PRODUCT | P1 | — | — | — | ~~Define field policy~~ | **CLOSED Wave2** — allowlist OPTION A | — | — | **2 CLOSED** |
| ~~RB-PROD-08~~ | AC | R08 booking chrome | PRODUCT | P1 | — | — | — | ~~Affirm chrome-only~~ | **CLOSED Wave2** — R08 handoff only | — | — | **2 CLOSED** |
| ~~RB-ENG-01~~ | BB | Wire `resolveManagedResourceIds` | ENGINEERING | P0 | RB-PROD-01 | — | — | ~~Wire injector~~ | **CLOSED Wave2** — resolver wired + focused PASS | — | — | **3→2 CLOSED early** |
| ~~RB-ENG-02~~ | BB | Dual-role entry points | ENGINEERING | P0 | RB-PROD-02 | — | — | ~~Cross-links~~ | **CLOSED Wave2** — bidirectional nav + focused PASS | — | — | **3→2 CLOSED early** |
| ~~RB-ENG-05~~ | BB | CREATE-UI gender/baptism | ENGINEERING | P1 | — | — | — | ~~Optionalize non-persisted fields~~ | **CLOSED Wave3** — gender/baptism optional presentation-only | — | — | **3 CLOSED** |
| ~~RB-TEST-01~~ | BB | AC-23 privacy | AUTOMATED_TEST | P0 | — | — | — | ~~Behavioral privacy~~ | **CLOSED Wave3** — session-bound profile + admin field omit | — | — | **4 CLOSED** |
| ~~RB-TEST-02~~ | BB | AC-11 OTP complete | AUTOMATED_TEST | P0 | — | — | — | ~~OTP complete paths~~ | **CLOSED Wave3** — fail leaves pending; success confirms | — | — | **4 CLOSED** |
| ~~RB-TEST-03~~ | BB | AC-24 no upload | AUTOMATED_TEST | P1 | — | — | — | ~~No upload UI~~ | **CLOSED Wave3** — no file/multipart on member portal | — | — | **4 CLOSED** |
| ~~RB-TEST-04~~ | BB | Church ID case-norm | AUTOMATED_TEST | P1 | — | — | — | ~~Case-norm auth~~ | **CLOSED Wave3** — lower(trim) path + variant lookup | — | — | **4 CLOSED** |
| ~~RB-TEST-05~~ | BB | FR-20 admin search | AUTOMATED_TEST | P1 | — | — | — | ~~Scoped search~~ | **CLOSED Wave3** — church_id scope + admin q wiring | — | — | **4 CLOSED** |
| ~~RB-TEST-06~~ | BB | AC-25 member_id history | AUTOMATED_TEST | P1 | — | — | — | ~~member_id history~~ | **CLOSED Wave3** — attendance keyed by member_id; number swap preserves id | — | — | **4 CLOSED** |
| ~~RB-TEST-07~~ | PLATFORM | Shared editor matrix (A4) | AUTOMATED_TEST | P1 | ENG-03/04 CLOSED | — | — | ~~Shared matrix~~ | **CLOSED Wave3** — AC+BB adapter + wave suite matrix lock | — | — | **4 CLOSED** |
| RB-QA-01 | BB | Members FEATURE QA | MANUAL_QA | P0 | RB-ID-01 **PASS** | NO | DEF-BB-MEMBERS-503 | Fix members 503; re-run T-M02–T-M15 | FEATURE_QA note: 2 PASS / 4 FAIL / 8 NOT_RUN @ `7dbe945d…` | LARGE | HIGH | 5 OPEN |
| RB-QA-02 | PLATFORM | Website lifecycle hosted | MANUAL_QA | P1 | RB-ID-01 **PASS** | NO | DEF-BB-WEB-PUBLISH-NOT-READY; DEF-AC-PUBLIC-403 | Fix BB publish readiness + AC public 403; re-run lifecycle | Hosted lifecycle OPEN; true-stale PASS | MEDIUM | MEDIUM | 5 OPEN |
| RB-QA-03 | AC | Hub + editor smoke | MANUAL_QA | P1 | — | — | RB-ID-01 **PASS** | Hosted invite + C01/C02/E03 + public smoke | **PASS** 2026-10-02 (`ac-hqa-v8-muq9wn7a9a3d`) | SMALL | LOW | 3 |
| ~~RB-QA-04~~ | PLATFORM | Geo + concurrency hosted | MANUAL_QA | P1 | RB-ID-01 **PASS** | — | — | Disabled-country POST + repeat-edit stale on AC+BB | **PASS** 2026-10-02 FR reject + engine 409 | SMALL | LOW | 5 CLOSED |
| RB-QA-05 | AC | Public PHI spot-check | MANUAL_QA | P1 | RB-PROD-07 **CLOSED** | — | — | Spot-check doctor/services pages vs allowlist | **PASS** 2026-10-02 allowlist clean | SMALL | MEDIUM | 3 |
| RB-ID-01 | PLATFORM | Build/deploy identity | BUILD_IDENTITY | P0 | Apex `GETPRO_GIT_BRANCH=V4` + shared metadata file + Hostinger redeploy | — | — | Live tip matches freeze | **PASS** BB+AC `V4` / `shared.build-identity` @ `7dbe945d…` | SMALL | HIGH | 6 CLOSED |

---

## Wave plans

### WAVE 1 — CLOSE NOW — **COMPLETE**

| BLOCKER_ID | STATUS | Evidence |
|------------|--------|----------|
| RB-ENG-03 | **CLOSED** | Shared pencils on BB page heroes / welcome / about photos |
| RB-ENG-04 | **CLOSED** | Universal image aliases + object overlay dual-write; 18/18 focused |

**Next:** Wave 2 Product decisions (parallel OK with Wave 4 early tests 01–06).

### WAVE 2 — PRODUCT DECISIONS — **COMPLETE**

| BLOCKER_ID | STATUS | Evidence |
|------------|--------|----------|
| RB-PROD-01…08 | **CLOSED** | All eight PD TEMPORARY_APPROVED_FOR_V2_04 · REVIEW_LATER=YES |
| RB-ENG-01 | **CLOSED early** | resolveManagedJoinResourceIds wired; Wave2 focused |
| RB-ENG-02 | **CLOSED early** | Bidirectional dual-role nav; Wave2 focused |
| *(gate)* | **CLOSED via ENG-05 optionalize** | No new Product decision; presentation-only fields |

**WAVE2_PRODUCT_REMAINING=0** · focused tests **26/26**.

### WAVE 3 — ENGINEERING AFTER PRODUCT — **COMPLETE**

| BLOCKER_ID | STATUS | Evidence |
|------------|--------|----------|
| ~~RB-ENG-01~~ | **CLOSED Wave2** | — |
| ~~RB-ENG-02~~ | **CLOSED Wave2** | — |
| RB-ENG-05 | **CLOSED** | Gender/baptism optional presentation-only; T-A12-class PASS |

### WAVE 4 — AUTOMATED PROOF — **COMPLETE**

| BLOCKER_ID | STATUS | Evidence |
|------------|--------|----------|
| RB-TEST-01…07 | **CLOSED** | `tests/v2-04-wave3-eng-test-closures.test.js` focused PASS |

**Next:** Wave 5 Manual QA (after identity capture) + Wave 6 identity formal close.

### WAVE 5 — MANUAL QA — EXECUTED (2026-10-02)

| BLOCKER_ID | RESULT | Evidence |
|------------|--------|----------|
| RB-QA-01 | **OPEN** | T-M02–T-M15: PASS=2 FAIL=4 NOT_RUN=8; `/hq/members` **503** (`v2-04-bb-members-scenario-probe-evidence.json`) |
| RB-QA-02 | **OPEN** | BB publish `not_ready` / Coming soon; AC publish/restore OK but public **403**; true-stale PASS (`v2-04-*-website-lifecycle-evidence.json`) |
| RB-QA-03 | **PASS** | Hosted resume on `ac-hqa-v8-muq9wn7a9a3d` @ `7dbe945d…`: invite + C01/C02/E03 + public smoke |
| RB-QA-04 | **PASS** | Forged FR POST **400** BB+AC; engine stale **409** BB+AC (`v2-04-disabled-country-post-evidence.json`, true-stale evidence) |
| RB-QA-05 | **PASS** | Public services/doctors allowlist spot-check PASS on same clinic |

Record: `docs/qa/V2_04_MANUAL_QA_RESULTS_RECORD.md`.

### WAVE 5b — POST-DEPLOY FINAL BLOCKER RETEST — **STOPPED** (2026-10-02)

| Check | Result |
|-------|--------|
| Required candidate | `600d1c07cfea3b287455226ab50d623809fa2ea8` |
| HUB/AC/BB hosted SHA | `7ae27d6631e6` |
| HOSTED_SHA_MATCH | **FAIL** |
| HOSTED_BRANCH_PARITY | **PASS** (V4) |
| Functional RB-QA-01/02 | **NOT RUN** |
| RB-QA-01 / RB-QA-02 | remain **OPEN** |
| RB-QA-03/04/05 / RB-ID-01 | not reopened |

**Action:** Redeploy exact `600d1c07…` (or Product accepts hosted tip that contains it and re-gates) then re-run this pack.

  
**MANUAL_QA_REMAINING=2** · **NEW_DEFECTS=3** · **REMAINING_BLOCKERS=2**.

**Prerequisite:** TESTING identity **PASS**; **NEW_APPLICATION_CANDIDATE=`7dbe945d6c9315cbe6c6a45c7a64ee354a2fe22b`**.

**Still outstanding:** Members pack (01) + website lifecycle public/publish proof (02). Geo/concurrency closed.

### WAVE 6 — RELEASE IDENTITY — SHARED BUILD METADATA FIX (2026-10-02)

| BLOCKER_ID | RESULT | Evidence |
|------------|--------|----------|
| RB-ID-01 | **PASS** (live tip = frozen candidate `7dbe945d6c93`) | Hub/AC/BB `V4` / `V4 testing`; Hub `GETPRO_GIT_BRANCH`; AC+BB `shared.build-identity`. Tip reconciled CASE A over `1b2aa5b7…`. |

#### Hostinger model (confirmed)

| Question | Answer |
|----------|--------|
| Separate lsnode workers of same app/tree? | **YES** — one sticky PID per hostname; same hbuild path |
| Why BB/AC ≠ apex branch? | Apex alone receives hPanel `GETPRO_GIT_BRANCH`; subdomain workers do not |
| Branch from per-process env only? | **Was** — now env → shared file → git → UNKNOWN |
| Shared metadata existed? | **NO** — added `.getpro/build-identity.json` |

#### Live identity sheet (pre-redeploy of shared-metadata tip)

| Field | BlessBoard testing | ActiveClinic testing | Hub |
|-------|--------------------|----------------------|-----|
| BRANCH | UNKNOWN | UNKNOWN | V4 |
| BRANCH_SOURCE | unknown | unknown | GETPRO_GIT_BRANCH |
| ENVIRONMENT | testing | testing | testing |
| FULL_SHA | `554d37406ef5` | `554d37406ef5` | `554d37406ef5` |
| HEALTHZ_LABEL | UNKNOWN testing | UNKNOWN testing | V4 testing |
| DEPLOYMENT_CODE | moovex-platform-v8-testing | moovex-platform-v8-testing | moovex-platform-v8-testing |

**Close when live:** BB+AC `V4 testing` after Hostinger redeploy. See `V2_04_BUILD_IDENTITY_UNKNOWN_FIX.md`.  
RB_ID_01=FAIL (hosted) · BUILD_IDENTITY_REMAINING=1 · FOCUSED_TESTS=10/10.

### WAVE 6 — prior note (code harden / first sheet)

RB-ID-01 remained **OPEN** after code harden: Hostinger injects env at worker start; detached HEAD → UNKNOWN without live `GETPRO_GIT_BRANCH` on **each** product app. See `V2_04_BUILD_IDENTITY_UNKNOWN_FIX.md`.

---

## Burn-down summary

| WAVE | BLOCKERS | PRODUCT | ENGINEERING | TEST | MANUAL | BUILD | EXPECTED_RESULT |
|------|----------|---------|-------------|------|--------|-------|-----------------|
| 1 CLOSE NOW | ~~RB-ENG-03, RB-ENG-04~~ **CLOSED** | 0 | 0 remaining | 0 | 0 | 0 | Editor A1/A2 eng closed; matrix unblocked |
| 2 PRODUCT | ~~RB-PROD-01…08~~ **CLOSED** (+ CREATE-UI gate remains) | 0 | 0 | 0 | 0 | 0 | P1 decisions frozen; ENG-01/02 closed early with Wave2 |
| 3 ENGINEERING | ~~RB-ENG-01/02/05 CLOSED~~ | 0 | 0 | 0 | 0 | 0 | CREATE-UI optionalized |
| 4 AUTOMATED PROOF | ~~RB-TEST-01…07 CLOSED~~ | 0 | 0 | 0 | 0 | 0 | Critical + member + shared editor proofs green |
| 5 MANUAL QA | RB-QA-01…05 | 0 | 0 | 0 | 5 | 0 | FEATURE QA on identity-captured TESTING |
| 6 BUILD IDENTITY | RB-ID-01 | 0 | 0 | 0 | 0 | 1 | Shared metadata code fixed; live pending Hostinger redeploy |

**Remaining after shared build-identity fix:** 6 blockers (ENG 0 · PRODUCT 0 · TEST 0 · MANUAL 5 · BUILD 1 until live verify).

**Shortest executable sequence (compressed):**  
~~Wave1 eng-editor~~ **DONE** ∥ Wave2 Product ∥ Wave4 early tests (01–06) → Wave3 eng-after-product → Wave4 TEST-07 + ENG mount proofs → capture identity → Wave5 manual → Wave6 formal identity close.

**Out of queue (non-gating):** patient PARITY_ONLY / TEST_ONLY; deferred features; P2 polish; REVIEW_LATER on temporary P0 decisions.

---

```
TOTAL_BLOCKERS=26
WAVE1_CLOSE_NOW=2
WAVE1_CLOSED=2
WAVE1_BLOCKED=0
WAVE2_PRODUCT=8
WAVE2_CLOSED=10
WAVE2_PRODUCT_REMAINING=0
WAVE3_ENGINEERING=1
WAVE3_CLOSED=1
WAVE3_BLOCKED=0
WAVE4_TEST=7
WAVE4_CLOSED=7
WAVE4_BLOCKED=0
WAVE5_MANUAL=5
WAVE6_BUILD_IDENTITY=1
DEPENDENCY_CHAINS=6
INDEPENDENT_FAST_CLOSURES=0
REMAINING_BLOCKERS=2
ENGINEERING_REMAINING=0
AUTOMATED_TEST_REMAINING=0
MANUAL_QA_REMAINING=2
BUILD_IDENTITY_REMAINING=0
BB_SHA_MATCH=PASS
AC_SHA_MATCH=PASS
BB_BRANCH_IDENTITY=PASS
AC_BRANCH_IDENTITY=PASS
UNKNOWN_LABEL_FOUND=NO
STALE_LABEL_FOUND=NO
PRODUCTION_UNTOUCHED=YES
RB_ID_01=PASS
RB_QA_01=OPEN
RB_QA_02=OPEN
RB_QA_03=PASS
RB_QA_04=PASS
RB_QA_05=PASS
HUB_BRANCH=V4
BB_BRANCH=V4
AC_BRANCH=V4
BRANCH_SOURCE_ALL=PASS
SHA_PARITY=PASS
HOSTINGER_SUBDOMAIN_ENV_SUPPORTED=NO
SHARED_BUILD_IDENTITY_SOURCE=.getpro/build-identity.json
NEW_DEFECTS=3
FINAL=V2_04_FINAL_MANUAL_QA_BLOCKERS_EXECUTED
```
