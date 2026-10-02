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
| RB-QA-03 | AC | Hub + public/editor regression | MANUAL_QA | **OPEN** (final hosted verify 2026-10-02: live SHA `4a7cf4beb6c2` ≠ candidate `1b2aa5b7…`; C01/C02/E03 + invite origin not verified on expected tip) | Hub/editor + C01/C02 visual not FEATURE-proven on **candidate** tip | Deploy `1b2aa5b7…` → authenticated catalogue + invite origin smoke | RB-ID-01 **PASS** on live tip | NO |
| RB-QA-04 | SHARED | Geography + concurrency hosted | MANUAL_QA | **NOT_RUN** (ingestion 2026-10-02; no evidence) | Disabled-country POST + true stale not reconfirmed on tip | Hosted QA-03-class + repeat-edit conflict on AC+BB | RB-ID-01 | NO |
| RB-QA-05 | AC | Public PHI spot-check | MANUAL_QA | **OPEN** (final hosted verify abort: candidate `1b2aa5b7…` undeployed; PHI NOT_RUN) | Public pages need hygiene sign-off vs allowlist | Spot-check after deploy of `1b2aa5b7…` + published clinicKey | RB-PROD-07 **CLOSED** | YES (after sample clinic) |

### E. RELEASE IDENTITY

| BLOCKER_ID | PRODUCT | AREA | TYPE | CURRENT_STATUS | WHY_RELEASE_BLOCKED | MINIMUM_ACTION_TO_CLOSE | DEPENDENCY | CAN_CLOSE_NOW |
|------------|---------|------|------|----------------|---------------------|-------------------------|------------|---------------|
| RB-ID-01 | SHARED | Build / deployment identity | BUILD_IDENTITY | **PASS** (hosted 2026-10-02 on tip `4a7cf4beb6c2`): Hub/AC/BB all `branch=V4` / `V4 testing`; Hub `GETPRO_GIT_BRANCH`; AC+BB `shared.build-identity`; no UNKNOWN. Note: tip ≠ final app candidate `1b2aa5b7…` (invite-origin fix still undeployed). | — (identity labels OK on current tip) | Keep verifying after each Hostinger redeploy | Apex env + shared metadata | YES (identity); redeploy still needed for candidate SHA |

---

## Group summary

| Group | Blocker IDs | n |
|-------|-------------|--:|
| **A. ENGINEERING** | — (Wave3 closed) | **0** |
| **B. PRODUCT** | — (Wave2 closed) | **0** |
| **C. AUTOMATED TEST** | — (Wave3 closed) | **0** |
| **D. MANUAL QA** | RB-QA-01…05 | **5** |
| **E. RELEASE IDENTITY** | RB-ID-01 (**PASS** on tip `4a7cf4beb6c2`) | **0** open |
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

#### Hostinger subdomain model + shared metadata fix

**Constraint:** Hostinger subdomains do **not** support separate env vars. `GETPRO_GIT_BRANCH=V4` is apex-only (`neuniversity.org`). LiteSpeed spawns one lsnode PID per hostname on the **same** hbuild tree — shared SHA/filesystem, **not** shared `process.env`.

**Root cause:** Branch identity was per-process env (+ detached git → UNKNOWN). Apex PASS; BB/AC UNKNOWN despite identical deploy.

**Code fix:** Shared `.getpro/build-identity.json` (authority: env → shared file → git → UNKNOWN). Apex seeds; BB/AC read. Focused tests **10/10 PASS**. See `V2_04_BUILD_IDENTITY_UNKNOWN_FIX.md`.

**Live (pre-redeploy of this fix):**

| Field | BlessBoard testing | ActiveClinic testing | Hub |
|-------|--------------------|----------------------|-----|
| HOST | blessboard.neuniversity.org | activeclinic.neuniversity.org | neuniversity.org |
| BRANCH | UNKNOWN | UNKNOWN | V4 |
| BRANCH_SOURCE | unknown | unknown | GETPRO_GIT_BRANCH |
| ENVIRONMENT | testing | testing | testing |
| FULL_SHA | `554d37406ef5` | `554d37406ef5` | `554d37406ef5` |
| HEALTHZ_LABEL | UNKNOWN testing | UNKNOWN testing | V4 testing |
| DEPLOYMENT_CODE | moovex-platform-v8-testing | moovex-platform-v8-testing | moovex-platform-v8-testing |

**Post-redeploy expect:** BB/AC `branch=V4` · `branchSource=shared.build-identity` · labels `V4 testing`. Production untouched. BUILD_IDENTITY_REMAINING=1 until live verify.

#### Prior RB-ID-01 final Hostinger env recheck (same day, FAIL under wrong Topology-B assumption)

| Field | BlessBoard testing | ActiveClinic testing | Hub |
|-------|--------------------|----------------------|-----|
| HOST | blessboard.neuniversity.org | activeclinic.neuniversity.org | neuniversity.org |
| VERSION | 2.04 | 2.04 | — |
| BRANCH | UNKNOWN | UNKNOWN | V4 |
| BRANCH_SOURCE | unknown | unknown | GETPRO_GIT_BRANCH |
| ENVIRONMENT | testing | testing | testing |
| FULL_SHA | `554d37406ef5` | `554d37406ef5` | `554d37406ef5` |
| ABOUT_LABEL | UNKNOWN testing | UNKNOWN testing | (hub `/about` 404; healthz authoritative) |
| HEALTHZ_LABEL | UNKNOWN testing | UNKNOWN testing | V4 testing |
| DEPLOYMENT_CODE | moovex-platform-v8-testing | moovex-platform-v8-testing | moovex-platform-v8-testing |

**Prior verdict:** Expected BB/AC `BRANCH=V4` via per-subdomain env → **impossible on Hostinger**. SHA_PARITY PASS. Production untouched.

#### Prior RB-ID-01 close attempt (same day, same FAIL pattern)

| Field | BlessBoard testing | ActiveClinic testing | Hub |
|-------|--------------------|----------------------|-----|
| HOST | blessboard.neuniversity.org | activeclinic.neuniversity.org | neuniversity.org |
| VERSION | 2.04 | 2.04 | — |
| BRANCH | UNKNOWN | UNKNOWN | V4 |
| BRANCH_SOURCE | unknown | unknown | GETPRO_GIT_BRANCH |
| ENVIRONMENT | testing | testing | testing |
| FULL_SHA | `554d37406ef5` | `554d37406ef5` | `554d37406ef5` |
| ABOUT_LABEL | UNKNOWN testing | UNKNOWN testing | — |
| HEALTHZ_LABEL | UNKNOWN testing | UNKNOWN testing | V4 testing |
| DEPLOYMENT_CODE | moovex-platform-v8-testing | moovex-platform-v8-testing | moovex-platform-v8-testing |

**Prior verdict:** Required BB/AC labels → **FAIL**. Topology B: product Hostinger apps still missing live `GETPRO_GIT_BRANCH` (or workers not restarted).

#### Prior sheet (earlier same day, SHA `75531602725a`)

| Field | BB | AC | Hub |
|-------|----|----|-----|
| VERSION | 2.04 | 2.04 | — |
| BRANCH | UNKNOWN | UNKNOWN | V4 |
| BRANCH_SOURCE | (not on hosted tip / N/A — UNKNOWN) | same | implied GETPRO_GIT_BRANCH |
| ENVIRONMENT | testing | testing | testing |
| GIT_SHA | `75531602725a` | `75531602725a` | `75531602725a` |
| DEPLOYMENT_NAME | moovex-platform-v8-testing | moovex-platform-v8-testing | moovex-platform-v8-testing |
| displayLabel | UNKNOWN testing | UNKNOWN testing | V4 testing |

**Earlier post-restart re-verify:** Operator reported Hostinger restart with `GETPRO_GIT_BRANCH=V4`. Live probe: **hub PASS**; **BB+AC still FAIL**. Same pattern as close attempt above.

### Prior Wave6 note (earlier same day)

Hub healthz may report `branch=V4` while BB/AC show UNKNOWN when Topology B workers lack live `GETPRO_GIT_BRANCH` — do not infer product identity from hub alone.  
**Code fix (2026-10-02):** `docs/qa/V2_04_BUILD_IDENTITY_UNKNOWN_FIX.md` — shared resolver hardened; focused **6/6 PASS**; **Hostinger restart required** for env change to take effect (must apply to **BB + AC apps**, not hub only).  
`7c957101..54cdb1f76f5a` was docs-only; tip now `75531602725a` includes Wave2/3 app. Production untouched.  
BB_SHA_MATCH=PASS · AC_SHA_MATCH=PASS · BRANCH_IDENTITY=FAIL · ENVIRONMENT_IDENTITY=PASS · DB_IDENTITY=PASS · BUILD_IDENTITY_REMAINING=1.

### Wave3 closure note (2026-10-02)

- **RB-ENG-05 CLOSED:** Add Member gender/baptism optionalized (presentation-only; not schema-backed; not required).  
- **RB-TEST-01…07 CLOSED:** focused suite `tests/v2-04-wave3-eng-test-closures.test.js` (+ M01/M02 ENG-05 asserts).  
- No IMPLEMENTATION_DEFECT stoppers found in this wave.

### AC public-site management fix pack (2026-10-02)

- **CLOSED eng defects (not release-registry IDs):** Services/Doctors manage blank screens (broken `/catalogue/services|doctors` manageHref), Contact R07 parity (urgent/legal/form heading), Pricing edit-mode CTA query drop.  
- Canonical operational catalogue retained (`appointment_service_types` + staff public profiles); no second domains.  
- Evidence: `docs/qa/V2_04_AC_SERVICES_DOCTORS_CONTACT_AUDIT.md`; focused suite `tests/v2-04-ac-public-site-management-fix.test.js` + related AC website tests **65/65 PASS**.  
- **True C01/C02 Stitch parity (same day):** catalogue list renders Stitch structure (`data-ac-stitch-screen=C01|C02`), desktop table + mobile cards + sticky bar; doctor photo forms wire shared E03 media-field framing. Screen map: `docs/design/stitch-exports/AC_MW_C01_C02_E03_SCREEN_MAP.md`. Focused **11/11** (`tests/v2-04-ac-catalogue-c01-c02-stitch-parity.test.js`). Prior contract-only “STITCH_PARITY=PASS” superseded. Hosted visual sign-off still via **RB-QA-03** / **RB-QA-05**.
- **C01/C02/E03 application candidate frozen (same day):** SHA `33e5c29612942e1484086432214b733f353f8601` on `V4` (previous hosted tip `554d37406ef5`). **Not deployed** from Cursor; production untouched. Ready for operator Hostinger testing deploy + RB-QA-03/05 re-run.

### Wave2 closure note (2026-10-02)

- **RB-PROD-01…08 CLOSED:** all eight PD-V204-*-P1-* `TEMPORARY_APPROVED_FOR_V2_04` · `REVIEW_LATER=YES`.  
- **RB-ENG-01 CLOSED:** scoped join review injector wired to ministry/department leader bindings.  
- **RB-ENG-02 CLOSED:** bidirectional Member Portal / Church Management dual-role nav.  
- Also applied: session revoke Option A (BB-P1-03), rate-limit freeze 8/15 (BB-P1-04), PA deny-by-default (BB-P1-05), public allowlist (AC-P1-02), AC matrix + R08 chrome (AC-P1-01/03).  
- Focused suite: `tests/v2-04-wave2-product-decisions.test.js` **26/26 PASS**.

---

```
REMAINING_RELEASE_BLOCKERS=5
ENGINEERING=0
PRODUCT=0
AUTOMATED_TEST=0
MANUAL_QA=5
BUILD_IDENTITY=0
FASTEST_CLOSABLE_NOW=0
READY_FOR_PRODUCTION_QA=NO
EXPECTED_CANDIDATE=1b2aa5b7fd60ebff791aafeabed762abe520ee25
LIVE_TIP=4a7cf4beb6c2
HOSTED_SHA_MATCH=FAIL
BRANCH_IDENTITY=PASS
RB_ID_01=PASS
HUB_BRANCH=V4
AC_BRANCH=V4
BB_BRANCH=V4
HUB_BRANCH_SOURCE=GETPRO_GIT_BRANCH
AC_BRANCH_SOURCE=shared.build-identity
BB_BRANCH_SOURCE=shared.build-identity
PRODUCTION_UNTOUCHED=YES
RB_QA_03=OPEN
RB_QA_05=OPEN
FINAL=V2_04_FINAL_HOSTED_CANDIDATE_VERIFIED
```
