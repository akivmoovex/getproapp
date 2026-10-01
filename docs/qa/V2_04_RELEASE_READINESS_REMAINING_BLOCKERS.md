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
| RB-ENG-01 | BB | FR-16 / AC-21 / DR-39 scoped review | CODE | `resolveManagedResourceIds` exists; **unwired** at join-request mount; fail-closed for scoped leaders | FINAL_GAP **P0**: production mount does not deliver MUST scoped review | Freeze DR-39 keys; wire injector; mount-level test | RB-PROD-01 | NO |
| RB-ENG-02 | BB | FR-12 / AC-13 dual-role destinations | CODE | Shells exist; **no linked dual-role entry points** | FINAL_GAP **P0**: MUST dual Member Portal + Church Management incomplete | Implement cross-links / documented dual entry; dual-role auto + manual | RB-PROD-02 | NO |
| RB-ENG-03 | BB | Editor inline coverage (comparison **A1**) | CODE | BB public pencils **PARTIAL**; some surfaces structured-only / bridge lag | Blocks claiming BB visual-editor parity with AC | Port AC pencil coverage to remaining BB editable surfaces | Shared WE01 dialogs | YES |
| RB-ENG-04 | PLATFORM/BB | Universal image payload (comparison **A2**) | CODE | Object-shape image save can return `invalid_url` on BB | Image replace/upload contract unreliable on BB path | Single accepted payload contract (string URL + object); shared tests | None | YES |
| RB-ENG-05 | BB | Add Member CREATE-UI vs schema | CODE | UI requires gender/baptism; schema columns missing | Create-member UI contradicts persistence | Persist fields **or** optionalize/remove until schema exists | Product confirm field set | NO |

### B. PRODUCT

| BLOCKER_ID | PRODUCT | AREA | TYPE | CURRENT_STATUS | WHY_RELEASE_BLOCKED | MINIMUM_ACTION_TO_CLOSE | DEPENDENCY | CAN_CLOSE_NOW |
|------------|---------|------|------|----------------|---------------------|-------------------------|------------|---------------|
| RB-PROD-01 | BB | DR-39 leader↔resource keys | PRODUCT_DECISION | OPEN (PD-V204-BB-P1-01) | Cannot safely wire scoped review without frozen binding keys | Freeze key list in decision register | None (Product) | YES |
| RB-PROD-02 | BB | FR-12 dual-role destinations | PRODUCT_DECISION | OPEN (PD-V204-BB-P1-02) | Engineering destinations undefined | Confirm linked Member Portal + Church Mgmt entry points | None (Product) | YES |
| RB-PROD-03 | BB | DR-51 relevant sessions | PRODUCT_DECISION | OPEN (PD-V204-BB-P1-03) | Block/reset session classes undefined for dual-role | Enumerate session classes to revoke | None (Product) | YES |
| RB-PROD-04 | BB | DR-52 rate-limit thresholds | PRODUCT_DECISION | OPEN (PD-V204-BB-P1-04) | Lockout UX/thresholds not frozen | Freeze N/window values | None (Product) | YES |
| RB-PROD-05 | BB | DR-55 PA cross-tenant actions | PRODUCT_DECISION | OPEN (PD-V204-BB-P1-05) | Platform Admin intervention catalogue incomplete | Enumerate allowed PA actions + audit requirements | None (Product) | YES |
| RB-PROD-06 | AC | Stitch control matrix | PRODUCT_DECISION | OPEN (PD-V204-AC-P1-01) | Risk of false MUST vs PRESENTATION blockers on presentation claim | Product-signed MUST/PRESENTATION/FUTURE matrix | PD-V204-AC-01 (non-patient) | YES |
| RB-PROD-07 | AC | Public PHI / field policy | PRODUCT_DECISION | OPEN (PD-V204-AC-P1-02) | Public doctor/services field hygiene undefined | Define public-safe field policy | None (Product) | YES |
| RB-PROD-08 | AC | R08 booking chrome vs domain | PRODUCT_DECISION | OPEN (PD-V204-AC-P1-03) | Second booking-engine risk if mis-scoped | Affirm chrome/handoff only in product note | None (Product) | YES |

### C. AUTOMATED TEST

| BLOCKER_ID | PRODUCT | AREA | TYPE | CURRENT_STATUS | WHY_RELEASE_BLOCKED | MINIMUM_ACTION_TO_CLOSE | DEPENDENCY | CAN_CLOSE_NOW |
|------------|---------|------|------|----------------|---------------------|-------------------------|------------|---------------|
| RB-TEST-01 | BB | AC-23 member privacy | TEST | Impl FULL; automation **WEAK** (FINAL_GAP **P0** CRITICAL_TEST_GAP) | Production QA cannot rely on source-match privacy | Behavioral cross-member profile denial test | None | YES |
| RB-TEST-02 | BB | AC-11 recovery phone OTP complete | TEST | Start path covered; **complete** OTP success/fail missing (FINAL_GAP **P0**) | Recovery phone verification unproven end-to-end | Automate complete OTP success + fail | None | YES |
| RB-TEST-03 | BB | AC-24 no member document upload | TEST | Restriction FULL; **UNTESTED** | Upload prohibition unproven | Assert no upload control / reject upload route | None | YES |
| RB-TEST-04 | BB | Church ID case-insensitive auth | TEST | Impl `lower(trim)`; **UNTESTED** | Login/activate case variants unproven | Automate `ch-10001` vs `CH-10001` | None | YES |
| RB-TEST-05 | BB | FR-20 admin search | TEST | Plumbing-only / WEAK | In-scope search + tenant deny unproven | Behavioral search + cross-tenant miss | None | YES |
| RB-TEST-06 | BB | AC-25 immutable `member_id` history | TEST | FK present; no behavioral post-ID-change proof | History integrity after Church ID change unproven | Change Church ID → attendance/requests still resolve | None | YES |
| RB-TEST-07 | PLATFORM | Shared editor regression matrix (comparison **A4** / unpublish depth) | TEST | AC inventory dense; BB/shared matrix incomplete; AC unpublish HTTP lighter | Editor claim lacks shared regression lock | Shared suite: viewport, draft, preview, publish, unpublish, media payload, restore | Prefer RB-ENG-03/04 first | YES |

### D. MANUAL QA

| BLOCKER_ID | PRODUCT | AREA | TYPE | CURRENT_STATUS | WHY_RELEASE_BLOCKED | MINIMUM_ACTION_TO_CLOSE | DEPENDENCY | CAN_CLOSE_NOW |
|------------|---------|------|------|----------------|---------------------|-------------------------|------------|---------------|
| RB-QA-01 | BB | Members FEATURE QA pack | MANUAL_QA | Sanity **excluded** Members; no FEATURE_QA_PASS (FINAL_GAP **P0**) | In-scope MUST Members pack never FEATURE-QA’d | Execute BB Members scenarios (T-M02–T-M15 class) on identity-bound TESTING | RB-ID-01; prefer RB-ENG-01/02 after wire | NO |
| RB-QA-02 | SHARED | Website lifecycle beyond sanity | MANUAL_QA | Sanity = edit/save/preview/public only | Publish / unpublish / version / restore / true-stale not FEATURE-proven on hosted tip | Manual lifecycle on **AC + BB** (`7c957101` or later tip) | RB-ID-01 | NO |
| RB-QA-03 | AC | Hub + public/editor regression | MANUAL_QA | AC-WEB-EDITOR-01 code CLOSED; hosted hub re-check pending | Hub management-only + editor path need hosted confirmation post-fix | Manual hub (no fake canvas) + Edit Website + draft/publish smoke | RB-ID-01 | NO |
| RB-QA-04 | SHARED | Geography + concurrency hosted | MANUAL_QA | Auto COVERED; hosted spot-check incomplete | Disabled-country POST + true stale not reconfirmed on tip | Hosted QA-03-class + repeat-edit conflict on AC+BB | RB-ID-01 | NO |
| RB-QA-05 | AC | Public PHI spot-check | MANUAL_QA | Policy missing | Cannot sign public clinic pages privacy hygiene | Spot-check doctor/services pages vs policy | RB-PROD-07 | NO |

### E. RELEASE IDENTITY

| BLOCKER_ID | PRODUCT | AREA | TYPE | CURRENT_STATUS | WHY_RELEASE_BLOCKED | MINIMUM_ACTION_TO_CLOSE | DEPENDENCY | CAN_CLOSE_NOW |
|------------|---------|------|------|----------------|---------------------|-------------------------|------------|---------------|
| RB-ID-01 | SHARED | Build / deployment identity | BUILD_IDENTITY | Sanity host previously **unbound**; tip `7c957101` not identity-sheeted for FEATURE QA (FINAL_GAP **P0**) | FEATURE QA results cannot be bound to branch/SHA/deploy/DB/migrations | Record on TESTING: branch, app SHA, deploy SHA, DB identity, migration ceiling, About=2.04 | None | YES |

---

## Group summary

| Group | Blocker IDs | n |
|-------|-------------|--:|
| **A. ENGINEERING** | RB-ENG-01…05 | **5** |
| **B. PRODUCT** | RB-PROD-01…08 | **8** |
| **C. AUTOMATED TEST** | RB-TEST-01…07 | **7** |
| **D. MANUAL QA** | RB-QA-01…05 | **5** |
| **E. RELEASE IDENTITY** | RB-ID-01 | **1** |
| **Total unique** | | **26** |

### Editor P1 → blocker map

| Comparison P1 | Release blocker? | Mapped ID |
|---------------|------------------|-----------|
| A1 BB inline coverage | YES | RB-ENG-03 |
| A2 Image payload contract | YES | RB-ENG-04 |
| A3 Hub management-only | AC code CLOSED; hosted verify remains | RB-QA-03 (verify only) |
| A4 Shared editor regression matrix | YES | RB-TEST-07 |
| B1 AC submit-for-review maturity | Not HARD — only if publish-review claim required | Out of this hard set unless Product elevates |
| B2 Diagnostics parity | Fold into lifecycle + shared suite | RB-QA-02 + RB-TEST-07 |

Roadmap **Phase 5** product adapters / branding and all **P2** items are **not** release blockers here.

### Fastest closable now (`CAN_CLOSE_NOW=YES`)

| Set | IDs | Why fast |
|-----|-----|----------|
| Identity | RB-ID-01 | Documentation / identity sheet only |
| Product freezes | RB-PROD-01…08 | Product write-up (no code) |
| Automated proofs | RB-TEST-01…07 | Tests against existing implementation (ENG-03/04 preferred first for TEST-07) |
| Editor eng | RB-ENG-03, RB-ENG-04 | Coverage/contract work without Product freeze |

**FASTEST_CLOSABLE_NOW = 18**  
**Not fast:** RB-ENG-01/02/05 (Product deps), RB-QA-01…05 (need identity and/or Product/ENG).

---

## Minimum path to `READY_FOR_PRODUCTION_QA=YES`

1. **RB-ID-01** — bind TESTING identity to tip.  
2. Close **RB-PROD-01/02** then **RB-ENG-01/02** (Members MUST completeness).  
3. Land **RB-TEST-01…06** (privacy / recovery / upload / case / search / history).  
4. Land **RB-ENG-03/04** + **RB-TEST-07** (editor claim).  
5. Execute **RB-QA-01** (Members FEATURE QA) + **RB-QA-02…04** (website / geo / concurrency).  
6. Close **RB-PROD-06…08** + **RB-QA-05** (AC presentation hygiene).  
7. Close **RB-ENG-05** or Product-optionalize fields.  
8. Close remaining Product P1 freezes (**RB-PROD-03…05**) before claiming dual-role session / rate-limit / PA completeness.

Until that set is closed (or Product **explicitly waives** a subset in writing), readiness stays **NO**.

---

```
REMAINING_RELEASE_BLOCKERS=26
ENGINEERING=5
PRODUCT=8
AUTOMATED_TEST=7
MANUAL_QA=5
BUILD_IDENTITY=1
FASTEST_CLOSABLE_NOW=18
READY_FOR_PRODUCTION_QA=NO
FINAL=V2_04_REMAINING_BLOCKERS_IDENTIFIED
```
