# V2.03 Coverage Denominator / Reachability Audit

**FINAL: `V2_03_COVERAGE_DENOMINATOR_AUDIT_COMPLETE`**

## Gate / scope

| Field | Value |
|---|---|
| Audit type | **READ-ONLY** (no tests added, no exclusions changed, no deletes, no behavior changes) |
| Input coverage | Wave-4 merged union vs baseline `coverage/v203/coverage-final.json` (1337 instrumented files) |
| Prior gate | `V2_03_FINAL_90_COVERAGE_QA_BLOCKED` |
| Production | **UNTOUCHED** |

Machine artifacts: `docs/qa/artifacts/v203_denom_*.json`

---

## Executive finding

**≥90% cannot be reached economically on the current official denominator** primarily because:

1. **~47% of all uncovered lines** (`57615 / 123143`) sit in **`I_SUPPORTED_LEGACY`** modules that are **require-reachable only via `server.legacy.js`**, not via V10 profiled foundation (`v5FoundationServer` / ActiveClinic foundation / Moovex). Evidence: DBCL09 `KEEP` / `ACTIVE` for unprofiled bootstrap; require-graph BFS.
2. Of the remainder, **active product gaps are concentrated in HTTP route megafiles** (`B_INTEGRATION_TEST_GAP` ≈ `24287` unc lines) plus large service branches (`A_MEANINGFUL_TEST_GAP` ≈ `31799` unc lines / **`16922` unc branches**).
3. **Browser/public JS is not in the c8 denominator at all** (`BROWSER_FILES=0`) — Playwright cannot move the official score without changing instrumentation policy (forbidden in this audit).
4. Even a **hypothetical cleanup** that removes all legacy-only modules from the tree (Scenario 2) only lifts overall lines to **~80.9%** and leaves branches ~**63.7%** — still far from 90%.

---

## 1. Denominator inventory

```
INSTRUMENTED_FILES=1337

TOTAL_LINES=444702
COVERED_LINES=321559
UNCOVERED_LINES=123143

TOTAL_BRANCHES=70451
COVERED_BRANCHES=44868
UNCOVERED_BRANCHES=25583

TOTAL_FUNCTIONS=10649
COVERED_FUNCTIONS=8452
UNCOVERED_FUNCTIONS=2197
```

### By product slice

| PRODUCT | FILES | L_COVERED/L_TOTAL | L_UNCOVERED | B_COVERED/B_TOTAL | B_UNCOVERED | F_COVERED/F_TOTAL |
|---|---:|---|---:|---|---:|---|
| PLATFORM | 444 | 101061/118614 | 17553 | 12434/18666 | 6232 | 3255/3477 |
| BB | 433 | 121524/151127 | 29603 | 20775/32462 | 11687 | 3036/3674 |
| AC | 194 | 72690/95311 | 22621 | 9403/15764 | 6361 | 1594/1804 |
| OTHER | 266 | 26284/79650 | 53366 | 2256/3559 | 1303 | 567/1694 |

**OTHER** (mostly `src/routes/**`, `src/services/church/**`) carries **53366** uncovered lines — more than PLATFORM+AC combined uncovered — while not being the V10 profiled BlessBoard/ActiveClinic mount path.

Per-file S/B/F/L covered/uncovered for all 1337 files: `docs/qa/artifacts/v203_denom_classified_refined.json`.

---

## 2. Classification of uncovered code

Primary category = exactly one. Evidence required; **zero coverage alone never implies dead**.

| Category | Uncovered lines | Uncovered branches | Meaning |
|---|---:|---:|---|
| **I_SUPPORTED_LEGACY** | **57615** | **1752** | Mounted only on unprofiled `server.legacy` path (DBCL09 KEEP) |
| **A_MEANINGFUL_TEST_GAP** | **31799** | **16922** | V10-reachable services/helpers still under-tested |
| **B_INTEGRATION_TEST_GAP** | **24287** | **5065** | Active HTTP/controllers needing integration matrices |
| **H_BOOTSTRAP_CONFIG_INFRA** | **6401** | **1356** | Startup, migration, seeds, QA fixtures, maintenance |
| **F_DUPLICATED_IMPLEMENTATION** | **2246** | **6** | Strict primary dups with identified canonical twin |
| **J_OTHER** | **795** | **476** | Residual unclassified / thin edge |
| **D_DEAD_OR_OBSOLETE** | **0** | **0** | **No file proven dead** in this audit |
| **E_GENERATED_VENDOR_BUILD** | **0** | **~6** | Not a material line contributor |
| **C_BROWSER_UI_GAP** | **0** | **0** | Browser JS **not instrumented** in official c8 include |
| **G_ARCHITECTURALLY_UNREACHABLE** | **~0 proven** | — | Near-empty; unwired candidates ≤277 L and unproven |

**Secondary flag (not primary):** `F_DUPLICATED_IMPLEMENTATION_ARCHITECTURAL` on **140** legacy church/admin modules that parallel V5 BlessBoard/platform HTTP — **44037** uncovered lines already counted under **I**.

```
A_MEANINGFUL_TEST_GAP_LINES=31799
B_INTEGRATION_TEST_GAP_LINES=24287
C_BROWSER_UI_GAP_LINES=0
D_DEAD_OBSOLETE_LINES=0
E_GENERATED_VENDOR_LINES=0
F_DUPLICATED_LINES=2246
G_UNREACHABLE_LINES=0
H_BOOTSTRAP_INFRA_LINES=6401
I_SUPPORTED_LEGACY_LINES=57615

A_MEANINGFUL_TEST_GAP_BRANCHES=16922
B_INTEGRATION_TEST_GAP_BRANCHES=5065
C_BROWSER_UI_GAP_BRANCHES=0
D_DEAD_OBSOLETE_BRANCHES=0
E_GENERATED_VENDOR_BRANCHES=6
F_DUPLICATED_BRANCHES=6
G_UNREACHABLE_BRANCHES=0
H_BOOTSTRAP_INFRA_BRANCHES=1356
I_SUPPORTED_LEGACY_BRANCHES=1752
```

---

## 3. TOP 100 uncovered executable lines

| RANK | PRODUCT | FILE | TOTAL_LINES | UNCOVERED_LINES | TOTAL_BRANCHES | UNCOVERED_BRANCHES | FUNCTION_COVERAGE | CATEGORY | RISK | CURRENTLY_REACHABLE_FROM_PRODUCT | RECOMMENDED_ACTION |
|---:|---|---|---:|---:|---:|---:|---|---|---:|---|---|
| 1 | OTHER | `src/routes/admin/adminChurchPlatform.js` | 4083 | 3544 | 2 | 0 | 1/40 (2.5%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 2 | OTHER | `src/routes/fieldAgent.js` | 1797 | 1589 | 4 | 1 | 1/13 (7.7%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 3 | PLATFORM | `src/platform/http/platformAdminRoutes.js` | 5335 | 1555 | 1035 | 428 | 39/46 (84.8%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 4 | AC | `src/activeclinic/http/activeClinicBillingRoutes.js` | 2666 | 1518 | 132 | 62 | 3/4 (75.0%) | B_INTEGRATION_TEST_GAP | 9 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 5 | OTHER | `src/routes/admin/adminCrm.js` | 1769 | 1467 | 3 | 0 | 1/36 (2.8%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 6 | OTHER | `src/services/church/scheduledBroadcastService.js` | 1499 | 1368 | 1 | 0 | 0/24 (0.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 7 | OTHER | `src/routes/admin/adminFieldAgentPayRuns.js` | 1464 | 1308 | 2 | 0 | 1/19 (5.3%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 8 | AC | `src/activeclinic/http/activeClinicCashierRoutes.js` | 1750 | 1262 | 11 | 8 | 1/4 (25.0%) | B_INTEGRATION_TEST_GAP | 9 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 9 | OTHER | `src/services/church/scheduledReportService.js` | 1308 | 1207 | 1 | 0 | 0/21 (0.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 10 | OTHER | `src/routes/church/memberPortal.js` | 1254 | 1052 | 2 | 0 | 1/18 (5.6%) | F_DUPLICATED_IMPLEMENTATION | 4 | NO | CONSOLIDATE_TO_CANONICAL_AFTER_CONSUMER_PROOF |
| 11 | OTHER | `src/routes/admin/adminIntake.js` | 1152 | 990 | 2 | 0 | 1/7 (14.3%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 12 | AC | `src/activeclinic/http/activeClinicPharmacyRoutes.js` | 1863 | 988 | 126 | 82 | 5/6 (83.3%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 13 | OTHER | `src/routes/church/hqAdminBroadcasts.js` | 1069 | 932 | 2 | 0 | 1/15 (6.7%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 14 | OTHER | `src/services/church/churchMemberImportService.js` | 985 | 919 | 1 | 0 | 0/16 (0.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 15 | BB | `src/blessboard/http/contentAdminRoutes.js` | 3302 | 911 | 706 | 351 | 35/44 (79.5%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 16 | OTHER | `src/routes/admin/adminDirectory.js` | 1040 | 892 | 2 | 0 | 1/1 (100.0%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 17 | AC | `src/activeclinic/http/activeClinicPatientPortalRoutes.js` | 1772 | 855 | 157 | 85 | 10/16 (62.5%) | B_INTEGRATION_TEST_GAP | 9 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 18 | BB | `src/blessboard/http/blessboardWebsiteEditorRoutes.js` | 1753 | 803 | 236 | 130 | 27/34 (79.4%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 19 | BB | `src/blessboard/http/memberJourneyAdminRoutes.js` | 1224 | 799 | 61 | 43 | 8/12 (66.7%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 20 | PLATFORM | `src/db/pg/fieldAgentPayRunRepo.js` | 1758 | 745 | 1 | 0 | 36/39 (92.3%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 21 | OTHER | `src/services/church/pilotReadinessService.js` | 796 | 745 | 1 | 0 | 0/12 (0.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 22 | BB | `src/blessboard/services/messageService.js` | 828 | 724 | 5 | 1 | 2/14 (14.3%) | A_MEANINGFUL_TEST_GAP | 6 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 23 | OTHER | `src/routes/admin/adminFieldAgentAnalytics.js` | 962 | 721 | 37 | 25 | 3/17 (17.6%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 24 | OTHER | `src/services/church/churchGrowthTrialService.js` | 891 | 685 | 29 | 21 | 6/16 (37.5%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 25 | AC | `src/activeclinic/services/activeClinicDiagnosticsService.js` | 874 | 676 | 13 | 4 | 6/14 (42.9%) | A_MEANINGFUL_TEST_GAP | 6 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 26 | AC | `src/activeclinic/http/activeClinicWebsiteCmsRoutes.js` | 2271 | 675 | 297 | 158 | 19/20 (95.0%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 27 | OTHER | `src/admin/adminTestDataService.js` | 770 | 666 | 1 | 0 | 0/11 (0.0%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 28 | OTHER | `src/routes/church/branchAdminAnnouncements.js` | 797 | 658 | 2 | 0 | 1/9 (11.1%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 29 | AC | `src/activeclinic/http/activeClinicWebsiteRoutes.js` | 1561 | 631 | 337 | 142 | 11/11 (100.0%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 30 | BB | `src/blessboard/services/memberJourneyDomainService.js` | 1230 | 627 | 147 | 94 | 13/23 (56.5%) | A_MEANINGFUL_TEST_GAP | 6 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 31 | OTHER | `src/routes/church/branchAdminMembers.js` | 743 | 615 | 2 | 0 | 1/6 (16.7%) | F_DUPLICATED_IMPLEMENTATION | 4 | NO | CONSOLIDATE_TO_CANONICAL_AFTER_CONSUMER_PROOF |
| 32 | OTHER | `src/services/church/churchPackageUsageService.js` | 1015 | 611 | 59 | 34 | 9/18 (50.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 33 | OTHER | `src/services/church/churchPackageAssignmentService.js` | 751 | 605 | 24 | 13 | 4/10 (40.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 34 | PLATFORM | `src/db/pg/fieldAgentSubmissionsRepo.js` | 1810 | 593 | 1 | 0 | 49/51 (96.1%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 35 | AC | `src/activeclinic/http/activeClinicClinicalRoutes.js` | 1276 | 588 | 141 | 109 | 5/5 (100.0%) | B_INTEGRATION_TEST_GAP | 9 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 36 | OTHER | `src/services/church/crossBranchComparisonService.js` | 614 | 567 | 2 | 1 | 0/9 (0.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 37 | OTHER | `src/services/church/churchPilotFeatureFlagService.js` | 761 | 564 | 42 | 32 | 4/15 (26.7%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 38 | OTHER | `src/services/church/tenantUnifiedLoginService.js` | 709 | 563 | 20 | 8 | 4/18 (22.2%) | I_SUPPORTED_LEGACY | 5 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 39 | BB | `src/blessboard/services/websiteDraftApplyService.js` | 1016 | 561 | 180 | 83 | 10/17 (58.8%) | A_MEANINGFUL_TEST_GAP | 6 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 40 | OTHER | `src/services/church/churchDormancyService.js` | 618 | 558 | 1 | 0 | 0/12 (0.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 41 | AC | `src/activeclinic/http/activeClinicPatientRoutes.js` | 1194 | 533 | 101 | 67 | 9/9 (100.0%) | B_INTEGRATION_TEST_GAP | 9 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 42 | OTHER | `src/services/church/churchControlledPilotSeedService.js` | 609 | 508 | 22 | 11 | 4/17 (23.5%) | H_BOOTSTRAP_CONFIG_INFRA | 3 | NO | ACCEPT_AS_INFRA_OR_SEED_TOOLING; measure_separately |
| 43 | OTHER | `src/services/church/foundationBasicReportService.js` | 542 | 495 | 2 | 1 | 0/10 (0.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 44 | OTHER | `src/routes/church/hqAdmin.js` | 651 | 493 | 9 | 2 | 1/6 (16.7%) | F_DUPLICATED_IMPLEMENTATION | 4 | NO | CONSOLIDATE_TO_CANONICAL_AFTER_CONSUMER_PROOF |
| 45 | AC | `src/activeclinic/http/activeClinicDiagnosticsRoutes.js` | 997 | 472 | 49 | 34 | 4/5 (80.0%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 46 | BB | `src/blessboard/services/registrationApplicationsAdminService.js` | 2908 | 469 | 884 | 286 | 41/48 (85.4%) | A_MEANINGFUL_TEST_GAP | 7 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 47 | PLATFORM | `src/platform/http/moovexPlatformRuntimeServer.js` | 868 | 469 | 92 | 35 | 5/6 (83.3%) | B_INTEGRATION_TEST_GAP | 6 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 48 | AC | `src/activeclinic/services/activeClinicBillingOpsService.js` | 1693 | 467 | 160 | 73 | 24/33 (72.7%) | A_MEANINGFUL_TEST_GAP | 9 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 49 | OTHER | `src/routes/church/branchAdminLeaders.js` | 548 | 463 | 2 | 0 | 1/6 (16.7%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 50 | OTHER | `src/services/church/churchPlatformSupportAccessService.js` | 526 | 463 | 1 | 0 | 0/17 (0.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 51 | OTHER | `src/routes/admin/adminDashboardContent.js` | 556 | 459 | 2 | 0 | 1/6 (16.7%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 52 | AC | `src/activeclinic/http/activeClinicPublicBookingRoutes.js` | 1333 | 457 | 250 | 150 | 7/7 (100.0%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 53 | OTHER | `src/routes/church/branchAdminEvents.js` | 540 | 437 | 2 | 0 | 1/4 (25.0%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 54 | OTHER | `src/routes/church/leaderPortal.js` | 548 | 433 | 6 | 2 | 1/6 (16.7%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 55 | OTHER | `src/routes/church/branchAdminDutyRoster.js` | 500 | 423 | 2 | 0 | 1/6 (16.7%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 56 | PLATFORM | `src/platform/http/v5FoundationServer.js` | 1987 | 422 | 365 | 81 | 73/84 (86.9%) | B_INTEGRATION_TEST_GAP | 6 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 57 | OTHER | `src/services/church/churchControlledPilotRehearsalService.js` | 456 | 420 | 1 | 0 | 0/3 (0.0%) | H_BOOTSTRAP_CONFIG_INFRA | 3 | NO | ACCEPT_AS_INFRA_OR_SEED_TOOLING; measure_separately |
| 58 | BB | `src/blessboard/services/websitePublicationVersionService.js` | 2213 | 408 | 538 | 253 | 31/32 (96.9%) | A_MEANINGFUL_TEST_GAP | 6 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 59 | OTHER | `src/routes/admin/adminSuper.js` | 475 | 408 | 2 | 0 | 1/1 (100.0%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 60 | AC | `src/activeclinic/http/activeClinicStaffRoutes.js` | 954 | 392 | 113 | 60 | 6/6 (100.0%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 61 | BB | `src/blessboard/services/givingService.js` | 1453 | 392 | 339 | 161 | 25/28 (89.3%) | A_MEANINGFUL_TEST_GAP | 6 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 62 | OTHER | `src/routes/church/branchAdminAttendanceCheckIn.js` | 485 | 380 | 2 | 0 | 1/7 (14.3%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 63 | OTHER | `src/routes/church/branchAdmin.js` | 589 | 377 | 11 | 6 | 1/3 (33.3%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 64 | BB | `src/blessboard/http/churchWebsiteAdminRoutes.js` | 1244 | 374 | 236 | 116 | 20/24 (83.3%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 65 | PLATFORM | `src/db/pg/church/platformSupportSearchRepo.js` | 498 | 374 | 1 | 0 | 5/19 (26.3%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 66 | OTHER | `src/routes/church/branchAdminAttendance.js` | 433 | 374 | 2 | 0 | 1/7 (14.3%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 67 | BB | `src/blessboard/repositories/messageRepository.js` | 495 | 365 | 11 | 8 | 2/16 (12.5%) | A_MEANINGFUL_TEST_GAP | 6 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 68 | OTHER | `src/seeds/seedChurchDemoOrganization.js` | 436 | 365 | 5 | 2 | 2/10 (20.0%) | H_BOOTSTRAP_CONFIG_INFRA | 3 | NO | ACCEPT_AS_INFRA_OR_SEED_TOOLING; measure_separately |
| 69 | BB | `src/blessboard/services/pastoralCareService.js` | 1167 | 361 | 205 | 104 | 18/21 (85.7%) | A_MEANINGFUL_TEST_GAP | 6 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 70 | BB | `src/blessboard/services/memberRegistrationService.js` | 1426 | 356 | 292 | 153 | 17/17 (100.0%) | A_MEANINGFUL_TEST_GAP | 6 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 71 | PLATFORM | `src/platform/http/sharedFormBuilderRoutes.js` | 906 | 354 | 110 | 76 | 12/13 (92.3%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 72 | BB | `src/blessboard/services/provisionRegisteredBlessBoardChurch.js` | 1831 | 353 | 388 | 162 | 20/20 (100.0%) | A_MEANINGFUL_TEST_GAP | 6 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 73 | BB | `src/blessboard/services/demoMinimumDatasetService.js` | 874 | 352 | 174 | 69 | 15/15 (100.0%) | H_BOOTSTRAP_CONFIG_INFRA | 3 | NO | ACCEPT_AS_INFRA_OR_SEED_TOOLING; measure_separately |
| 74 | PLATFORM | `src/platform/http/platformWebsiteAdminRoutes.js` | 1161 | 351 | 200 | 92 | 23/24 (95.8%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 75 | BB | `src/blessboard/http/pastoralWelfareAdminRoutes.js` | 550 | 340 | 20 | 14 | 5/10 (50.0%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 76 | OTHER | `src/routes/admin/adminFieldAgentWebsiteListingReview.js` | 405 | 339 | 2 | 0 | 1/8 (12.5%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 77 | OTHER | `src/services/church/growthPastoralAutomationService.js` | 396 | 336 | 1 | 0 | 0/18 (0.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 78 | PLATFORM | `src/db/pg/financeCfoDashboardRepo.js` | 1662 | 333 | 1 | 0 | 36/36 (100.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 79 | PLATFORM | `src/platform/forms/tenantFormService.js` | 1196 | 328 | 294 | 143 | 24/27 (88.9%) | A_MEANINGFUL_TEST_GAP | 9 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 80 | OTHER | `src/routes/church/publicPages.js` | 648 | 327 | 93 | 50 | 7/11 (63.6%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 81 | AC | `src/activeclinic/http/activeClinicSettingsRoutes.js` | 872 | 326 | 77 | 51 | 5/8 (62.5%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 82 | BB | `src/blessboard/http/pathPublicChurchActionRoutes.js` | 694 | 323 | 79 | 42 | 10/15 (66.7%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 83 | PLATFORM | `src/db/pg/fieldAgentPayoutBatchRepo.js` | 610 | 323 | 1 | 0 | 10/10 (100.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 84 | OTHER | `src/routes/admin/adminChurchBranchAdminPasswordResetRequests.js` | 382 | 323 | 2 | 0 | 1/10 (10.0%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 85 | PLATFORM | `src/db/pg/church/hqBroadcastsRepo.js` | 823 | 316 | 1 | 0 | 20/21 (95.2%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 86 | OTHER | `src/services/church/growthAdvancedEventsService.js` | 373 | 315 | 1 | 0 | 0/19 (0.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 87 | OTHER | `src/routes/admin/adminChurchHqAdminPasswordResetRequests.js` | 370 | 314 | 2 | 0 | 1/10 (10.0%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 88 | OTHER | `src/services/church/growthAttendanceOfflineSyncService.js` | 385 | 313 | 1 | 0 | 0/8 (0.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 89 | AC | `src/activeclinic/services/activeClinicBillingService.js` | 2488 | 311 | 271 | 106 | 39/42 (92.9%) | A_MEANINGFUL_TEST_GAP | 9 | YES | EXPAND_BEHAVIORAL_UNIT_OR_SERVICE_TESTS |
| 90 | OTHER | `src/services/church/notificationTemplateService.js` | 494 | 311 | 63 | 38 | 6/13 (46.2%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 91 | AC | `src/activeclinic/qa/activeClinicHostedAuthQaFixture.js` | 472 | 307 | 25 | 14 | 6/12 (50.0%) | H_BOOTSTRAP_CONFIG_INFRA | 5 | NO | ACCEPT_AS_INFRA_OR_SEED_TOOLING; measure_separately |
| 92 | OTHER | `src/routes/church/branchAdminLeaderPasswordResetRequests.js` | 368 | 306 | 2 | 0 | 1/3 (33.3%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 93 | OTHER | `src/routes/admin/adminFinanceCfo.js` | 347 | 305 | 2 | 0 | 1/4 (25.0%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 94 | OTHER | `src/routes/church/branchAdminPasswordResetRequests.js` | 369 | 305 | 2 | 0 | 1/4 (25.0%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 95 | OTHER | `src/routes/church/branchAdminMinistries.js` | 378 | 300 | 2 | 0 | 1/3 (33.3%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 96 | AC | `src/activeclinic/http/activeClinicStaffAdminRoutes.js` | 478 | 299 | 25 | 11 | 6/9 (66.7%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 97 | AC | `src/activeclinic/http/activeClinicPublicRoutes.js` | 1705 | 295 | 433 | 140 | 28/33 (84.8%) | B_INTEGRATION_TEST_GAP | 7 | YES | HTTP_INTEGRATION_MATRIX allow/deny/cross-tenant |
| 98 | OTHER | `src/routes/admin/adminFieldAgentPayoutBatches.js` | 332 | 292 | 2 | 0 | 1/7 (14.3%) | I_SUPPORTED_LEGACY | 4 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 99 | OTHER | `src/routes/church/auth.js` | 497 | 290 | 35 | 10 | 6/6 (100.0%) | I_SUPPORTED_LEGACY | 5 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |
| 100 | OTHER | `src/services/church/churchReleaseRegisterService.js` | 502 | 290 | 54 | 23 | 11/20 (55.0%) | I_SUPPORTED_LEGACY | 3 | NO | KEEP_UNTIL_UNPROFILED_FAIL_CLOSED; do_not_exclude; dual_run_ |

Full JSON: `docs/qa/artifacts/v203_denom_top100.json`

```
TOP_100_UNCOVERED_FILES=100
```

---

## 4. Directory aggregation

Uncovered lines are **concentrated**, not diffuse.

| Cumulative share of uncovered lines | # directories | Last directory entering bucket | Cumulative unc lines |
|---|---:|---|---:|
| top **25%** | **2** | `src/routes/church` | 32284 |
| top **50%** | **5** | `src/activeclinic/http` | 71302 |
| top **75%** | **8** | `src/db/pg` | 94003 |
| top **90%** | **26** | (long tail starts) | 111100 |

### Top directories by uncovered lines

| # | Directory | Files | Unc lines | Unc branches | Cum % lines |
|---|---|---:|---:|---:|---:|
| 1 | `src/services/church` | 56 | 16871 | 505 | 13.7% |
| 2 | `src/routes/church` | 64 | 15413 | 182 | 26.2% |
| 3 | `src/blessboard/services` | 156 | 13764 | 6297 | 37.4% |
| 4 | `src/routes/admin` | 25 | 12993 | 25 | 47.9% |
| 5 | `src/activeclinic/http` | 46 | 12261 | 1951 | 57.9% |
| 6 | `src/blessboard/http` | 89 | 8965 | 3102 | 65.2% |
| 7 | `src/activeclinic/services` | 102 | 8030 | 3402 | 71.7% |
| 8 | `src/db/pg` | 123 | 5706 | 102 | 76.3% |
| 9 | `src/platform/http` | 33 | 3897 | 1046 | 79.5% |
| 10 | `src/platform/services` | 37 | 2566 | 1437 | 81.6% |
| 11 | `src/platform/website` | 77 | 1615 | 1403 | 82.9% |
| 12 | `src/routes/fieldAgent.js` | 1 | 1589 | 1 | 84.2% |
| 13 | `src/blessboard/repositories` | 29 | 1270 | 812 | 85.2% |
| 14 | `src/activeclinic/website` | 19 | 827 | 683 | 85.9% |
| 15 | `src/activeclinic/qa` | 3 | 677 | 30 | 86.4% |
| 16 | `src/admin/adminTestDataService.js` | 1 | 666 | 0 | 87.0% |
| 17 | `src/migration/v4ToV5` | 28 | 662 | 196 | 87.5% |
| 18 | `src/activeclinic/repositories` | 17 | 657 | 223 | 88.1% |
| 19 | `src/platform/forms` | 6 | 418 | 226 | 88.4% |
| 20 | `src/platform/registration` | 25 | 401 | 256 | 88.7% |
| 21 | `src/seeds/seedChurchDemoOrganization.js` | 1 | 365 | 2 | 89.0% |
| 22 | `src/platform/repositories` | 13 | 328 | 166 | 89.3% |
| 23 | `src/migration/v5ToV7` | 18 | 303 | 136 | 89.5% |
| 24 | `src/platform/config` | 14 | 299 | 144 | 89.8% |
| 25 | `src/blessboard/media` | 8 | 281 | 96 | 90.0% |
| 26 | `src/seo/seoCopy.js` | 1 | 276 | 0 | 90.2% |
| 27 | `src/platform/website-engine` | 15 | 270 | 201 | 90.4% |
| 28 | `src/companies/providerSeoFallback.js` | 1 | 265 | 0 | 90.7% |
| 29 | `src/intake/intakeProjectAllocation.js` | 1 | 265 | 0 | 90.9% |
| 30 | `src/intake/adminIntakeProjectStatus.js` | 1 | 242 | 0 | 91.1% |

Uncovered **branches** concentrate even harder: top **3** directories ≈ **50%** of all uncovered branches (BB/AC service + HTTP control flow), while legacy `src/routes/**` is line-heavy but branch-sparse (Istanbul often collapses those files to ~1–4 branch slots).

---

## 5. Duplication audit

### Strict primary duplicates (canonical still live)

| Duplicate / legacy | Canonical (V10 profiled) | Still routed? | Tests can reach duplicate? |
|---|---|---|---|
| `src/routes/church/memberPortal.js` | `src/blessboard/http/memberPortalRoutes.js` | Legacy only (`server.legacy`) | Yes via legacy/unprofiled suites |
| `src/routes/church/hqAdmin.js` | `src/blessboard/http/hqAdminRoutes.js` | Legacy only | Yes |
| `src/routes/church/branchAdminMembers.js` | `src/blessboard/http/branchAdminRoutes.js` | Legacy only | Yes |
| `src/routes/blessboardAdmin.js` | V5 foundation BB routers | Legacy only | Yes |
| `src/activeclinic/services/formatMoney.js` | `src/platform/money/formatMoney.js` | Thin wrap still imported by AC | Yes |

```
PROVEN_DUPLICATE_FILES=5
```

- `src/activeclinic/services/formatMoney.js`
- `src/routes/blessboardAdmin.js`
- `src/routes/church/branchAdminMembers.js`
- `src/routes/church/hqAdmin.js`
- `src/routes/church/memberPortal.js`

### Architectural duplicate mass (primary category remains I)

Legacy `src/routes/church/**` + `src/routes/admin/**` + `src/services/church/**` parallel V5 BlessBoard/platform admin surfaces. **Not deleted** (DBCL09). Consumer proof required before any consolidate.

- `src/routes/admin/adminChurchPlatform.js` (unc L=3544)
- `src/routes/admin/adminCrm.js` (unc L=1467)
- `src/services/church/scheduledBroadcastService.js` (unc L=1368)
- `src/routes/admin/adminFieldAgentPayRuns.js` (unc L=1308)
- `src/services/church/scheduledReportService.js` (unc L=1207)
- `src/routes/church/memberPortal.js` (unc L=1052)
- `src/routes/admin/adminIntake.js` (unc L=990)
- `src/routes/church/hqAdminBroadcasts.js` (unc L=932)
- `src/services/church/churchMemberImportService.js` (unc L=919)
- `src/routes/admin/adminDirectory.js` (unc L=892)
- `src/services/church/pilotReadinessService.js` (unc L=745)
- `src/routes/admin/adminFieldAgentAnalytics.js` (unc L=721)
- `src/services/church/churchGrowthTrialService.js` (unc L=685)
- `src/routes/church/branchAdminAnnouncements.js` (unc L=658)
- `src/routes/church/branchAdminMembers.js` (unc L=615)
- `src/services/church/churchPackageUsageService.js` (unc L=611)
- `src/services/church/churchPackageAssignmentService.js` (unc L=605)
- `src/services/church/crossBranchComparisonService.js` (unc L=567)
- `src/services/church/churchPilotFeatureFlagService.js` (unc L=564)
- `src/services/church/tenantUnifiedLoginService.js` (unc L=563)
- `src/services/church/churchDormancyService.js` (unc L=558)
- `src/services/church/foundationBasicReportService.js` (unc L=495)
- `src/routes/church/hqAdmin.js` (unc L=493)
- `src/routes/church/branchAdminLeaders.js` (unc L=463)
- `src/services/church/churchPlatformSupportAccessService.js` (unc L=463)
- … +115 more (total secondary-dup files=140, unc L=44037)

---

## 6. Route reachability

BFS from V10 profiled roots (`moovexPlatformRuntimeServer`, `v5FoundationServer`, `activeClinicFoundationServer`, …) **excluding** `server.legacy.js`:

| Class | Definition | Count (sample basis) |
|---|---|---|
| **ACTIVE_ROUTE** | In V10 profiled require graph | BB/AC/platform `*Routes.js` under `src/**/http/**` |
| **CONDITIONAL_ROUTE** | Only via `server.legacy` when `PLATFORM_DEPLOYMENT_CODE` unset / unprofiled | **91** `src/routes/**` files with uncovered lines (**30369** unc L) |
| **LEGACY_UNMOUNTED_ROUTE** | Same as conditional for **profiled** BB/AC/GetPro deployments | All CONDITIONAL_ROUTE on V10 product profiles |
| **DEAD_ROUTE** | Proven zero consumer | **0** |
| **UNKNOWN** | Not classified | rare |

Evidence: `server.js` loads V5 foundation for profiled `runtimeMode`; else `require("./server.legacy")` (DBCL09 KEEP). `v5FoundationServer` does **not** require `src/routes/admin|church|fieldAgent`.

```
UNMOUNTED_ROUTE_FILES=91
```

Sample CONDITIONAL_ROUTE files:

- `src/routes/admin.js`
- `src/routes/admin/adminAuth.js`
- `src/routes/admin/adminChurchBranchAdminPasswordResetRequests.js`
- `src/routes/admin/adminChurchHqAdminPasswordResetRequests.js`
- `src/routes/admin/adminChurchMemberPasswordResetRequests.js`
- `src/routes/admin/adminChurchMinistryLeaderSupport.js`
- `src/routes/admin/adminChurchPlatform.js`
- `src/routes/admin/adminChurchPlatformInquiries.js`
- `src/routes/admin/adminChurchResetRequestsInbox.js`
- `src/routes/admin/adminChurchSupportAccess.js`
- `src/routes/admin/adminCrm.js`
- `src/routes/admin/adminDashboardContent.js`
- `src/routes/admin/adminDbTools.js`
- `src/routes/admin/adminDirectory.js`
- `src/routes/admin/adminFieldAgentAdjustments.js`
- `src/routes/admin/adminFieldAgentAnalytics.js`
- `src/routes/admin/adminFieldAgentBankReconciliation.js`
- `src/routes/admin/adminFieldAgentDisputes.js`
- `src/routes/admin/adminFieldAgentPayRuns.js`
- `src/routes/admin/adminFieldAgentPayoutBatches.js`
- `src/routes/admin/adminFieldAgentWebsiteListingReview.js`
- `src/routes/admin/adminFinanceCfo.js`
- `src/routes/admin/adminIntake.js`
- `src/routes/admin/adminShared.js`
- `src/routes/admin/adminSuper.js`
- `src/routes/admin/adminTenantUsers.js`
- `src/routes/api.js`
- `src/routes/blessboardAdmin.js`
- `src/routes/church/auth.js`
- `src/routes/church/branchAdmin.js`
- `src/routes/church/branchAdminAnnouncements.js`
- `src/routes/church/branchAdminAppointments.js`
- `src/routes/church/branchAdminAttendance.js`
- `src/routes/church/branchAdminAttendanceCheckIn.js`
- `src/routes/church/branchAdminAudit.js`
- … +56 more under `src/routes/**`

---

## 7. UI / browser code

Official c8 include instruments server `src/**` (+ entry servers). **`public/**` client JS is not present in `coverage-final.json`.**

```
BROWSER_FILES=0
BROWSER_TOTAL_LINES=0
BROWSER_UNCOVERED_LINES=0
BROWSER_TOTAL_BRANCHES=0
BROWSER_UNCOVERED_BRANCHES=0
```

| Need | Role for official 90% score |
|---|---|
| jsdom/unit | N/A for current denom |
| browser integration | N/A for current denom |
| Playwright/E2E | Product quality yes; **does not move official c8 %** unless include policy changes (out of scope / denied here) |
| manual-only | Visual Stitch parity etc. |

---

## 8. Bootstrap / config / infra

Contributors classified **H** (startup, deployment profiles, migration, seeds, hosted QA fixtures, purge/demo tooling, diagnostics):

```
BOOTSTRAP_INFRA_UNCOVERED_LINES=6401
BOOTSTRAP_INFRA_UNCOVERED_BRANCHES=1356
BOOTSTRAP_INFRA_FILES≈99
```

Includes: `src/startup/**`, `src/migration/**`, `src/seeds/**`, `*Seed*`, `*Qa*`, `*Purge*`, `*Pilot*`, `server.js` paths, platform diagnostics. These are **legitimate** to keep instrumented; they are poor ROI for chasing global 90%.

---

## 9. Legitimate testable gap (post-classification)

```
TOTAL_UNCOVERED_LINES=123143

MEANINGFULLY_TESTABLE_UNCOVERED_LINES=31799
INTEGRATION_TESTABLE_UNCOVERED_LINES=24287
BROWSER_TESTABLE_UNCOVERED_LINES=0

DEAD_OBSOLETE_LINES=0
GENERATED_VENDOR_LINES=0
DUPLICATED_LINES=2246
ARCHITECTURALLY_UNREACHABLE_LINES=0
BOOTSTRAP_INFRA_LINES=6401
SUPPORTED_LEGACY_LINES=57615
```

Same for branches (see §2). **Note:** ~44k additional lines inside **I** are also architectural duplicates (secondary), but must not be treated as free denom deletion without fail-closed unprofiled bootstrap.

---

## 10. 90% feasibility

### SCENARIO 1 — current denominator unchanged

```
CURRENT_90_GAP:
  LINES=+78673 covered needed
  BRANCHES=+18538
  FUNCTIONS=+1133
```

To close with tests alone: cover essentially **all** A+B (`~56k` lines) **plus** a large fraction of legacy **I** (`~57k`) or equivalent. Legacy HTTP is economically hostile (duplicate surface + conditional mount). **Not economically reachable** via more unit waves of the Wave 1–4 style.

### SCENARIO 2 — after PROVEN dead/obsolete/duplicate removal (no exclusions)

Hypothetical: remove **all legacy-only modules** from the tree after consumer/fail-closed proof (stronger than today’s DBCL09 KEEP).

```
POST_CLEANUP_PROJECTED:
  LINES=265972/328983 = 80.85%
  BRANCHES=41820/65653 = 63.70%
  FUNCTIONS=6647/7495 = 88.69%

POST_CLEANUP_PROJECTED_90_GAP:
  LINES=+30113
  BRANCHES=+17268
```

**Still not 90%.** Branches barely move (legacy is line-heavy, not branch-heavy). Remaining gap is active BB/AC/platform HTTP+services.

V10-profiled-only slice (informational, not official denom):

```
V10_PROFILED_ONLY L=242006/298244 (81.14%) B=38854/60926 (63.77%) F=6065/6803 (89.15%)
V10_ONLY_90_GAP L=+26414 B=+15980
```

### SCENARIO 3 — risk-based target (official denom unchanged)

High-risk active path heuristics (auth/RBAC/tenant/billing/clinical/publish/media/registration/booking/staff) ∩ V10 profiled ∩ PLATFORM/BB/AC:

```
HIGH_RISK_ACTIVE_COVERAGE:
  FILES=261
  LINES=86232/106558 (80.92%)
  BRANCHES=14097/21693 (64.98%)
  FUNCTIONS=1958/2160 (90.65%)
```

| Metric | Can reasonably reach 90%? |
|---|---|
| Functions | **Already ≥90%** on this slice |
| Lines | **Possible** with focused HTTP/service work (~+10k lines) — still large but bounded |
| Branches | **Hard** — needs deep allow/deny matrices (~+5.4k branches); not a small unit wave |

---

## 11. Security-critical coverage (V10-reachable path match)

| Area | Lines | Branches | Functions | Untested high-risk behavior (examples) |
|---|---|---|---|---|
| Authentication | 15149/17703 (**85.6%**) | 2625/3788 (**69.3%**) | 429/485 (**88.5%**) | AC auth routes; portal password flows |
| RBAC | 5253/6457 (**81.4%**) | 971/1426 (**68.1%**) | 124/161 (**77.0%**) | HQ role assignment/admin routes |
| Tenant isolation | 11521/12948 (**89.0%**) | 2469/3476 (**71.0%**) | 312/336 (**92.9%**) | tenant forms; some public tenant loaders |
| Patient / clinical | 17946/24815 (**72.3%**) | 1711/3206 (**53.4%**) | 327/382 (**85.6%**) | pharmacy/portal/diagnostics HTTP |
| Billing / refunds | 6424/10308 (**62.3%**) | 448/816 (**54.9%**) | 96/116 (**82.8%**) | **billing + cashier write routes** |
| Publishing | 8778/10578 (**83.0%**) | 1509/2557 (**59.0%**) | 175/197 (**88.8%**) | draft apply; publication versions |
| Media security | 4439/5156 (**86.1%**) | 897/1321 (**67.9%**) | 143/161 (**88.8%**) | storage adapters; media config edges |
| Registration | 30101/35194 (**85.5%**) | 5857/8693 (**67.4%**) | 699/774 (**90.3%**) | registration admin; provision paths |
| Booking | 5657/7514 (**75.3%**) | 638/1215 (**52.5%**) | 118/130 (**90.8%**) | public booking + linkage HTTP |
| Staff / facility | 9241/11712 (**78.9%**) | 1518/2382 (**63.7%**) | 228/255 (**89.4%**) | staff admin HTTP |

**Billing/cashier and clinical/pharmacy HTTP remain the weakest money/clinical write surfaces** despite green functional suites.

---

## 12. Recommended strategy (evidence-based)

```
RECOMMENDED_STRATEGY=STRATEGY_B + STRATEGY_A_FOCUSED + STRATEGY_D
```

| Strategy | Apply? | Why |
|---|---|---|
| **STRATEGY_A** continue meaningful coverage tests | **YES — focused** | Only on **A/B high-risk active** (billing/cashier/clinical/RBAC branches). Do **not** spray unit tests at legacy `src/routes/**`. |
| **STRATEGY_B** remove/refactor proven dead/duplicate first | **YES — gated** | Architectural duplicates are real, but DBCL09 forbids treating `server.legacy` as dead. Sequence: fail-closed unprofiled bootstrap → consumer proof → consolidate duplicates → **then** denom shrinks honestly (still not enough alone — see Scenario 2). |
| **STRATEGY_C** browser/E2E infrastructure | **NO for official 90%** | Browser files are **outside** the denominator; E2E helps quality, not c8 %. |
| **STRATEGY_D** accept lower global %; require ≥90% high-risk active | **YES** | Global 90% is structurally blocked by legacy mass + branch density. High-risk F already ≥90; push high-risk **lines/branches** (especially billing/clinical) as the release bar until Scenario 2 cleanup lands. |

**Do not** change coverage exclusions to fake 90%. **Do not** delete legacy in this audit.

---

## 13. Marker output

```text
TOTAL_LINES=444702
COVERED_LINES=321559
UNCOVERED_LINES=123143

TOTAL_BRANCHES=70451
COVERED_BRANCHES=44868
UNCOVERED_BRANCHES=25583

TOP_100_UNCOVERED_FILES=100

A_MEANINGFUL_TEST_GAP_LINES=31799
B_INTEGRATION_TEST_GAP_LINES=24287
C_BROWSER_UI_GAP_LINES=0
D_DEAD_OBSOLETE_LINES=0
E_GENERATED_VENDOR_LINES=0
F_DUPLICATED_LINES=2246
G_UNREACHABLE_LINES=0
H_BOOTSTRAP_INFRA_LINES=6401
I_SUPPORTED_LEGACY_LINES=57615

BROWSER_UNCOVERED_LINES=0
BOOTSTRAP_INFRA_UNCOVERED_LINES=6401

PROVEN_DEAD_FILES=0
PROVEN_DUPLICATE_FILES=5
UNMOUNTED_ROUTE_FILES=91

CURRENT_90_GAP=L+78673 B+18538 F+1133
POST_CLEANUP_PROJECTED_90_GAP=L+30113 B+17268 (projected L%=80.85)
HIGH_RISK_ACTIVE_COVERAGE=L 86232/106558 (80.92%) B 14097/21693 (64.98%) F 1958/2160 (90.65%)

RECOMMENDED_STRATEGY=STRATEGY_B_GATED + STRATEGY_A_FOCUSED_HIGHRISK + STRATEGY_D

PRODUCTION=UNTOUCHED

FINAL=V2_03_COVERAGE_DENOMINATOR_AUDIT_COMPLETE
```
