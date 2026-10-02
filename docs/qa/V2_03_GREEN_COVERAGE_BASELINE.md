# V2.03 Green-Suite Coverage Baseline (Authoritative)

**FINAL: `V2_03_GREEN_COVERAGE_BASELINE_VALID`**

## Gate verdict

Authoritative green-suite coverage completed on the frozen **865**-file canonical manifest with batched c8. Green suite preserved (`FAIL=0`, `CANCELLED=0`), all **12/12** batches merged into one shared-temp report, application/test fingerprint unchanged for the run.

| Prerequisite | Required | Observed |
|---|---|---|
| Post-billing freeze | YES | **YES** — `V2_03_POST_BILLING_CANONICAL_GREEN_FROZEN` |
| `APP_TEST_FINGERPRINT` | PASS | **PASS** |
| `MANIFEST_FINGERPRINT` | PASS | **PASS** |
| `PRODUCTION_GUARD` | PASS | **PASS** |
| Coverage preserves green | `FAIL=0` | **YES** — `6792` pass / `0` fail / `484` skip |
| All batches merged | 12/12 | **YES** |
| Denominator comparable to trusted ~65.7% baseline | YES | **YES** (`COVERAGE_DENOMINATOR_VALID=YES`) |

```
APP_TEST_FINGERPRINT=PASS
MANIFEST_FINGERPRINT=PASS
PRODUCTION_GUARD=PASS
SOURCE_DRIFT=NO
GREEN_SUITE_PRESERVED=YES
ALL_BATCHES_MERGED=YES
PRODUCTION=UNTOUCHED
```

---

## 1. Pre-flight / frozen input

```
BRANCH=V10
COVERAGE_INPUT_SHA=bcf28138b69f9448c08dc3b005a907a761762e5f
COVERAGE_MANIFEST_SHA=fda6916a001ef8ceaea7fbf5dc0403cf95f2b2f1ac87c9f78e4dba8c858c22f5
COVERAGE_TEST_FILES=865
TREE_FINGERPRINT=97ca0f360c32d50642feaed9c7ab852064464cd4096dccdcf9f973b1ff5fff63
```

Repository `HEAD` may be `5e2e7707` (freeze/fingerprint/reporting infrastructure). That does **not** change application/test content. Runner warns on HEAD drift but continues when `TREE_FINGERPRINT` + manifest SHA match.

Fingerprint artifact: `docs/qa/manifests/V2_03_COVERAGE_INPUT_FINGERPRINT.json`  
Artifacts: `coverage/v203/` (`coverage-final.json`, `coverage-summary.json`, `lcov.info`, HTML)

---

## 2–5. Coverage run + batch green invariant

| Property | Value |
|---|---|
| Runner | `scripts/coverage/run-v203-coverage-batched.js` |
| Batch size | **75** → **12** batches (last batch 40 files) |
| Shared V8 temp | `coverage/v203/tmp` |
| Clean | batch `000` only; `clean=false` thereafter |
| Include | identical every batch (`src/**`, `server.js`, `server.legacy.js`, `index.js`) |
| Require green | ON (abort on `FAIL>0` / `CANCELLED>0` / kill / source drift) |
| Per-batch fingerprint | verified before each batch |

### Test census (under coverage)

```
TEST_FILES=865
TEST_CASES=7276
PASS=6792
FAIL=0
SKIP=484
CANCELLED=0
```

Matches frozen canonical green census.

### Batch table

| BATCH_ID | FILES | PASS | FAIL | SKIP | CANCELLED | EXIT_CODE | V8_TOTAL | DURATION_MS | MERGED |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 000 | 75 | 438 | 0 | 0 | 0 | 0 | 76 | 409412 | YES |
| 001 | 75 | 438 | 0 | 49 | 0 | 0 | 152 | 350698 | YES |
| 002 | 75 | 665 | 0 | 56 | 0 | 0 | 245 | 351814 | YES |
| 003 | 75 | 729 | 0 | 0 | 0 | 0 | 331 | 286346 | YES |
| 004 | 75 | 986 | 0 | 0 | 0 | 0 | 419 | 267510 | YES |
| 005 | 75 | 451 | 0 | 89 | 0 | 0 | 501 | 95216 | YES |
| 006 | 75 | 281 | 0 | 97 | 0 | 0 | 578 | 35550 | YES |
| 007 | 75 | 463 | 0 | 158 | 0 | 0 | 670 | 45132 | YES |
| 008 | 75 | 640 | 0 | 26 | 0 | 0 | 755 | 210672 | YES |
| 009 | 75 | 630 | 0 | 3 | 0 | 0 | 833 | 134405 | YES |
| 010 | 75 | 711 | 0 | 6 | 0 | 0 | 911 | 312035 | YES |
| 011 | 40 | 360 | 0 | 0 | 0 | 0 | 952 | 136377 | YES |

```
BATCHES_EXPECTED=12
BATCHES_COMPLETED=12
BATCHES_MERGED=12
MISSING_BATCHES=
SOURCE_DRIFT=NO
```

Batch `001` (billing/refund suites) is green under c8 — prior BLOCKED run’s `FAIL=2` cleared by post-billing calendar fix.

---

## 6. Authoritative coverage totals

Single overall merge; product metrics are **path slices** of that report (not separate merges).

### OVERALL

| Metric | Covered | Total | % |
|---|---:|---:|---:|
| STATEMENTS | 299182 | 444702 | **67.27** |
| BRANCHES | 44720 | 70451 | **63.47** |
| FUNCTIONS | 7099 | 10649 | **66.66** |
| LINES | 299182 | 444702 | **67.27** |

### PLATFORM

| Metric | Covered | Total | % |
|---|---:|---:|---:|
| STATEMENTS | 79098 | 118614 | **66.69** |
| BRANCHES | 12360 | 18666 | **66.22** |
| FUNCTIONS | 1944 | 3477 | **55.91** |
| LINES | 79098 | 118614 | **66.69** |

### BLESSBOARD

| Metric | Covered | Total | % |
|---|---:|---:|---:|
| STATEMENTS | 121291 | 151127 | **80.26** |
| BRANCHES | 20767 | 32462 | **63.97** |
| FUNCTIONS | 3011 | 3674 | **81.95** |
| LINES | 121291 | 151127 | **80.26** |

### ACTIVECLINIC

| Metric | Covered | Total | % |
|---|---:|---:|---:|
| STATEMENTS | 72679 | 95311 | **76.25** |
| BRANCHES | 9349 | 15764 | **59.31** |
| FUNCTIONS | 1593 | 1804 | **88.30** |
| LINES | 72679 | 95311 | **76.25** |

---

## 7. Denominator validation

Trusted prior completed run (855-file era, `FAIL≠0`, not green-suite): S/B/F/L = **65.71 / 62.55 / 65.40 / 65.71**, `TOTAL_LINES=443583`, `TOTAL_FUNCTIONS=10636`, `TOTAL_BRANCHES=67498` (`docs/qa/V2_03_OVERNIGHT_RECONCILIATION.md`).

| Field | Previous | Current |
|---|---:|---:|
| `INSTRUMENTED_FILES` | *(not recorded)* | **1337** |
| `TOTAL_LINES` | 443583 | **444702** |
| `TOTAL_BRANCHES` | 67498 | **70451** |
| `TOTAL_FUNCTIONS` | 10636 | **10649** |

**Material differences:** line denominator +**0.25%** (+1119) — consistent with added ActiveClinic/platform code since the 855-file freeze, not a collapsed merge. Branch denominator +**4.4%** (+2953) — Istanbul/c8 branch counting growth with new control flow; still same order of magnitude (unlike overnight collapse to ~26k branches). Function denominator nearly flat (+13).

Percentages rose modestly vs 65.71% lines (**67.27%**) on a comparable denominator while running a **fully green** 865-file suite — not an artifact of missing success paths from failing tests.

```
COVERAGE_DENOMINATOR_VALID=YES
```

---

## 8. Coverage gap inventory (by lines %)

Application files with line totals &gt; 0 in product slices:

| Bucket | Count |
|---|---:|
| `FILES_0` | 0 |
| `FILES_1_24` | 62 |
| `FILES_25_49` | 125 |
| `FILES_50_69` | 76 |
| `FILES_70_79` | 118 |
| `FILES_80_89` | 226 |
| `FILES_90_94` | 141 |
| `FILES_95_99` | 169 |
| `FILES_100` | 154 |
| **`FILES_90_PLUS`** | **464** |

### By product (lines %)

| Product | 1–24 | 25–49 | 50–69 | 70–79 | 80–89 | 90–94 | 95–99 | 100 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| PLATFORM | 8 | 28 | 22 | 31 | 72 | 48 | 61 | 55 |
| BLESSBOARD | 41 | 62 | 28 | 42 | 78 | 51 | 58 | 52 |
| ACTIVECLINIC | 13 | 35 | 26 | 45 | 76 | 42 | 50 | 47 |

*(Bucket `0%` empty for all three.)*

---

## 9. TOP 30 coverage multipliers

| RANK | PRODUCT | FILE/MODULE | S/B/F/L | UNCOVERED_LINES | UNCOVERED_BRANCHES | RISK | WHY_HIGH_LEVERAGE | RECOMMENDED_TEST_LAYER |
|---:|---|---|---|---:|---:|---:|---|---|
| 1 | ACTIVECLINIC | `src/activeclinic/http/activeClinicBillingRoutes.js` | 43.06/53.03/75/43.06 | 1518 | 62 | 9 | billing write routes | HTTP_INTEGRATION |
| 2 | ACTIVECLINIC | `src/activeclinic/http/activeClinicCashierRoutes.js` | 27.88/27.27/25/27.88 | 1262 | 8 | 9 | cashier write routes | HTTP_INTEGRATION |
| 3 | ACTIVECLINIC | `src/activeclinic/qa/activeClinicHostedAuthQaFixture.js` | 34.95/44/50/34.95 | 307 | 14 | 10 | auth fixture surface | DOMAIN_INTEGRATION |
| 4 | ACTIVECLINIC | `src/activeclinic/qa/activeClinicHostedAuthQaReleaseFlows.js` | 30.97/61.9/27.27/30.97 | 234 | 8 | 10 | auth release flows | DOMAIN_INTEGRATION |
| 5 | PLATFORM | `src/platform/services/authTransferService.js` | 84.91/54.95/100/84.91 | 70 | 50 | 10 | shared auth transfer | SERVICE_UNIT |
| 6 | PLATFORM | `src/platform/services/platformIdentityAuthTransferService.js` | 76.5/41.37/100/76.5 | 82 | 34 | 10 | shared identity auth | SERVICE_UNIT |
| 7 | ACTIVECLINIC | `src/activeclinic/http/activeClinicAuthRoutes.js` | 66.26/58.75/90.9/66.26 | 170 | 33 | 10 | clinic auth HTTP | HTTP_INTEGRATION |
| 8 | PLATFORM | `src/platform/rbac/platformRbacCatalogService.js` | 87.88/60.86/100/87.88 | 35 | 27 | 10 | shared RBAC catalog | SERVICE_UNIT |
| 9 | PLATFORM | `src/platform/rbac/platformAdminAuthorization.js` | 84.84/58.33/100/84.84 | 45 | 20 | 10 | platform admin authz | RBAC_INTEGRATION |
| 10 | PLATFORM | `src/platform/rbac/platformRbacCatalogRepository.js` | 76.32/65.62/66.66/76.32 | 49 | 11 | 10 | RBAC persistence | SERVICE_UNIT |
| 11 | ACTIVECLINIC | `src/activeclinic/qa/activeClinicHostedAuthQaClient.js` | 40.08/63.63/38.46/40.08 | 136 | 8 | 10 | auth QA client | DOMAIN_INTEGRATION |
| 12 | PLATFORM | `src/platform/rbac/sharedRbacFacade.js` | 84.03/59.25/100/84.03 | 34 | 11 | 10 | shared RBAC facade | RBAC_INTEGRATION |
| 13 | PLATFORM | `src/platform/forms/tenantFormService.js` | 72.57/51.36/88.88/72.57 | 328 | 143 | 9 | tenant forms / large gap | SERVICE_UNIT |
| 14 | PLATFORM | `src/platform/rbac/sharedTenantScope.js` | 93.62/88.33/100/93.62 | 22 | 14 | 10 | tenant isolation scope | RBAC_INTEGRATION |
| 15 | PLATFORM | `src/platform/rbac/platformRbacAssignmentAudit.js` | 93.12/53.65/100/93.12 | 11 | 19 | 10 | RBAC assignment audit | RBAC_INTEGRATION |
| 16 | PLATFORM | `src/platform/http/v5AuthObservability.js` | 93.5/68.96/100/93.5 | 10 | 18 | 10 | auth observability | HTTP_INTEGRATION |
| 17 | ACTIVECLINIC | `src/activeclinic/http/activeClinicPermissionMiddleware.js` | 72.77/71.23/80/72.77 | 101 | 21 | 10 | permission middleware | HTTP_INTEGRATION |
| 18 | ACTIVECLINIC | `src/activeclinic/services/authenticateActiveClinicIdentity.js` | 74.75/73.91/80/74.75 | 105 | 18 | 10 | clinic identity auth | SERVICE_UNIT |
| 19 | PLATFORM | `src/middleware/authRateLimit.js` | 85.71/55.55/20/85.71 | 16 | 8 | 10 | auth rate limit | HTTP_INTEGRATION |
| 20 | BLESSBOARD | `src/blessboard/services/blessBoardRbacAuthorizationService.js` | 87.8/81.22/80/87.8 | 66 | 40 | 10 | BB RBAC authz | SERVICE_UNIT |
| 21 | PLATFORM | `src/platform/http/v5SessionAuthGate.js` | 98.93/75.8/100/98.93 | 2 | 15 | 10 | session auth gate | HTTP_INTEGRATION |
| 22 | PLATFORM | `src/platform/rbac/platformEffectivePermissions.js` | 89.71/55/100/89.71 | 11 | 9 | 10 | effective permissions | RBAC_INTEGRATION |
| 23 | PLATFORM | `src/platform/rbac/sharedAuthzDecision.js` | 94.01/76.31/100/94.01 | 10 | 9 | 10 | shared authz decision | RBAC_INTEGRATION |
| 24 | PLATFORM | `src/platform/auth/resolveLoginIdentifier.js` | 96.96/58.62/100/96.96 | 2 | 12 | 10 | login identifier | DOMAIN_INTEGRATION |
| 25 | PLATFORM | `src/platform/auth/sharedPasswordPolicy.js` | 94.2/82.6/57.14/94.2 | 8 | 4 | 10 | password policy | DOMAIN_INTEGRATION |
| 26 | PLATFORM | `src/platform/repositories/authTransferRepository.js` | 100/52.63/100/100 | 0 | 9 | 10 | auth transfer repo branches | SERVICE_UNIT |
| 27 | ACTIVECLINIC | `src/activeclinic/services/activeClinicPatientPortalAuthService.js` | 75.69/12.5/100/75.69 | 70 | 28 | 10 | patient portal auth | SERVICE_UNIT |
| 28 | PLATFORM | `src/platform/website-engine/permissionHooks.js` | 99.11/72/100/99.11 | 1 | 7 | 10 | website permission hooks | RBAC_INTEGRATION |
| 29 | PLATFORM | `src/platform/website/authorizeWebsite.js` | 100/86.11/100/100 | 0 | 5 | 10 | website authorize | DOMAIN_INTEGRATION |
| 30 | PLATFORM | `src/platform/website/permissions.js` | 100/81.81/100/100 | 0 | 2 | 10 | website permissions | RBAC_INTEGRATION |

Analysis dump: `/tmp/v203-green-coverage-analysis.json`, `coverage/v203/v203-ranked-gaps.json`.

---

## 10. Exact gap to 90%

Additional **covered units** required (ceil(0.9×total) − covered), not percentage points:

| Scope | STATEMENTS_TO_90 | BRANCHES_TO_90 | FUNCTIONS_TO_90 | LINES_TO_90 |
|---|---:|---:|---:|---:|
| OVERALL | 101050 | 18686 | 2486 | 101050 |
| PLATFORM | 27655 | 4440 | 1186 | 27655 |
| BLESSBOARD | 14724 | 8449 | 296 | 14724 |
| ACTIVECLINIC | 13101 | 4839 | 31 | 13101 |

---

## 11. High-risk coverage

Pattern-flagged paths (auth/session/rbac/tenant/registration/publish/media/clinical/patient/billing/cashier/admin/provision/…):

```
HIGH_RISK_LINES_TOTAL=179918
HIGH_RISK_LINES_COVERED=120352
HIGH_RISK_LINES_PERCENT=66.89

HIGH_RISK_BRANCHES_TOTAL=28300
HIGH_RISK_BRANCHES_COVERED=17632
HIGH_RISK_BRANCHES_PERCENT=62.30
```

### Security / write modules below 80% lines (sample)

| File | Lines % | Uncovered lines |
|---|---:|---:|
| `src/activeclinic/http/activeClinicBillingRoutes.js` | 43.06 | 1518 |
| `src/activeclinic/http/activeClinicCashierRoutes.js` | 27.88 | 1262 |
| `src/activeclinic/http/activeClinicPatientPortalRoutes.js` | 51.74 | 855 |
| `src/activeclinic/http/activeClinicClinicalRoutes.js` | 53.91 | 588 |
| `src/activeclinic/http/activeClinicPatientRoutes.js` | 55.36 | 533 |
| `src/activeclinic/services/activeClinicBillingOpsService.js` | 72.41 | 467 |
| `src/blessboard/services/memberRegistrationService.js` | 75.03 | 356 |
| `src/routes/church/auth.js` | 41.64 | 290 |
| `src/blessboard/http/activityRegistrationRoutes.js` | 30.76 | 270 |
| `src/services/church/churchBillingInvoiceService.js` | 20.94 | 268 |
| `src/blessboard/services/platformChurchRegistrationService.js` | 59.53 | 244 |

---

## 12. Dead / legacy candidates (evidence only — no deletes)

No product-slice file at **exactly 0%** with ≥40 lines. Lowest-coverage large modules (measurement candidates only):

| Candidate class | Evidence | Examples |
|---|---|---|
| `OBSOLETE_MODULE` / under-tested church services | &lt;10% lines, large | `scheduledBroadcastService.js`, `scheduledReportService.js`, `churchMemberImportService.js`, `pilotReadinessService.js` |
| `LEGACY_ROUTE` / thin coverage | church auth/billing routes low | `src/routes/church/auth.js` (41.64%), `churchBillingInvoiceService.js` (20.94%) |
| `DUPLICATED_IMPLEMENTATION` | not asserted from coverage alone | *(none claimed)* |

**No deletion, exclusion, or refactor** performed in this measurement.

---

## 13. Residual business-date risks (`FOLLOW_UP_DATE_RISK`)

Preserved from post-billing freeze (not fixed here):

1. Payment-arrangement `startDate` default (`toISOString` UTC) vs DATE column  
2. `ac.financial_summary` export `from`/`to` defaults vs `payment_date` / invoice dates  
3. Cashier `defaultPaymentDate` form default vs `payment_date`

```
FOLLOW_UP_DATE_RISKS=3
```

---

## Marker

```text
COVERAGE_INPUT_SHA=bcf28138b69f9448c08dc3b005a907a761762e5f
MANIFEST_SHA=fda6916a001ef8ceaea7fbf5dc0403cf95f2b2f1ac87c9f78e4dba8c858c22f5

APP_TEST_FINGERPRINT=PASS
SOURCE_DRIFT=NO

TEST_FILES=865
TEST_CASES=7276
PASS=6792
FAIL=0
SKIP=484
CANCELLED=0

BATCHES_EXPECTED=12
BATCHES_COMPLETED=12
BATCHES_MERGED=12

OVERALL:
S=299182/444702=67.27
B=44720/70451=63.47
F=7099/10649=66.66
L=299182/444702=67.27

PLATFORM:
S=79098/118614=66.69
B=12360/18666=66.22
F=1944/3477=55.91
L=79098/118614=66.69

BLESSBOARD:
S=121291/151127=80.26
B=20767/32462=63.97
F=3011/3674=81.95
L=121291/151127=80.26

ACTIVECLINIC:
S=72679/95311=76.25
B=9349/15764=59.31
F=1593/1804=88.30
L=72679/95311=76.25

COVERAGE_DENOMINATOR_VALID=YES

FILES_0=0
FILES_1_24=62
FILES_25_49=125
FILES_50_69=76
FILES_70_79=118
FILES_80_89=226
FILES_90_PLUS=464

HIGH_RISK_LINES=120352/179918=66.89
HIGH_RISK_BRANCHES=17632/28300=62.30

GAP_TO_90:
OVERALL=S+101050 B+18686 F+2486 L+101050
PLATFORM=S+27655 B+4440 F+1186 L+27655
BLESSBOARD=S+14724 B+8449 F+296 L+14724
ACTIVECLINIC=S+13101 B+4839 F+31 L+13101

FOLLOW_UP_DATE_RISKS=3

ALL_BATCHES_MERGED=YES
GREEN_SUITE_PRESERVED=YES
PRODUCTION=UNTOUCHED

V2_03_GREEN_COVERAGE_BASELINE_VALID
```
