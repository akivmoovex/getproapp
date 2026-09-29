# V2.03 High-Risk Active Coverage Gate

**FINAL: `V2_03_HIGH_RISK_COVERAGE_GATE_BLOCKED`**

## Gate verdict

Stopped pursuing global ≥90%. Froze the active high-risk V10 denominator (**exact** match to the denominator audit), ranked uncovered branches, and added **34** meaningful branch-pair tests across Waves A–D (auth/RBAC/tenant, clinical/billing, registration/booking/staff, publishing/media).

**Functions already met ≥90%.** Lines and branches did **not** reach campaign targets after honest unit/service matrices. Remaining gap is dominated by **authenticated HTTP / deep DB workflows** — further unit/fake-pool tests yield diminishing returns on already-covered entry denials. No denominator manipulation; no legacy-route inflation; no duplicate consolidation in this campaign.

| Field | Value |
|---|---|
| Input audit | `docs/qa/V2_03_COVERAGE_DENOMINATOR_AUDIT.md` |
| Manifest | `docs/qa/manifests/V2_03_HIGH_RISK_ACTIVE_MANIFEST.txt` |
| Meta | `docs/qa/manifests/V2_03_HIGH_RISK_ACTIVE_MANIFEST.json` |
| Top 50 | `docs/qa/artifacts/v203_high_risk_top50.json` |
| Duplicates | `docs/qa/artifacts/v203_high_risk_duplicates.json` |
| Production | **UNTOUCHED** |

---

## 1. Frozen high-risk denominator

```
HIGH_RISK_FILES=261
HIGH_RISK_MANIFEST_SHA=27e97351b75f6540edd797d7239aeb3254bc56272aeb8742bd3f334160fb4bc6
```

**Selection (deterministic):** V10-profiled require-graph ∩ product ∈ {PLATFORM, BB, AC} ∩ path-pattern match from denominator audit (auth/RBAC/tenant/billing/clinical/…) ∩ exclude `deploymentProfiles`, `src/migration/**`, `server.legacy-only`, browser/`public`.

### Denominator verification vs audit

| Metric | Audit expected | Frozen observed | Delta |
|---|---:|---:|---:|
| LINES_TOTAL | 106558 | **106558** | **0** |
| BRANCHES_TOTAL | 21693 | **21693** | **0** |
| FUNCTIONS_TOTAL | 2160 | **2160** | **0** |
| LINES covered (pre) | 86232 | **86232** | **0** |
| BRANCHES covered (pre) | 14097 | **14097** | **0** |
| FUNCTIONS covered (pre) | 1958 | **1958** | **0** |

```
DENOMINATOR_MATCH=EXACT
DENOMINATOR_MANIPULATION=NO
COVERAGE_EXCLUSIONS_ADDED=0
```

Expanded pattern set (mission extras like `authorize`/`upload`) would grow the slice to 300 files / 120706 lines — **not used**, to keep continuity with the audit baseline.

---

## 2. Top uncovered high-risk branches (pre-campaign)

Ranked by UNCOVERED_BRANCHES → UNCOVERED_LINES → security risk. Full table: `docs/qa/artifacts/v203_high_risk_top50.json`.

| RANK | PRODUCT | MODULE | UNC_L | UNC_B | UNC_F | Behavior classes |
|---:|---|---|---:|---:|---:|---|
| 1 | BB | `registrationApplicationsAdminService.js` | 469 | 286 | — | VALIDATION, STATE_TRANSITION, ERROR_HANDLING, WRITE_SUCCESS |
| 2 | BB | `platformChurchRegistrationRepository.js` | 265 | 262 | — | NOT_FOUND, VALIDATION, WRITE_SUCCESS |
| 3 | BB | `loadTenantPublicPageModel.js` | 154 | 187 | — | TENANT_DENY, OPTIONAL_PATH, ERROR_HANDLING |
| 4 | BB | `memberRegistrationService.js` | 356 | 153 | — | VALIDATION, WRITE_SUCCESS, CONFLICT |
| 5 | AC | `activeClinicPublicBookingRoutes.js` | 457 | 150 | — | AUTHZ_DENY, VALIDATION, WRITE_SUCCESS |
| 6 | PLATFORM | `tenantFormService.js` | 328 | 143 | — | AUTHZ_DENY, VALIDATION, STATE_TRANSITION |
| 7 | BB | `websitePublishReviewService.js` | 131 | 131 | — | STATE_TRANSITION, VALIDATION, ERROR_HANDLING |
| 8–10 | BB | registration duplicate-match services | — | ≥110 | — | VALIDATION, NOT_FOUND |
| 11+ | AC | clinical/billing/pharmacy/portal HTTP + services | high L | high B | — | AUTHZ_DENY, WRITE_SUCCESS, STATE_TRANSITION |

---

## 3–4. Waves executed + measurement

| Wave | Focus | Approach |
|---|---|---|
| **A** | Auth / RBAC / tenant | Forge allow/deny; AC scope; BB resource-in-tenant; grantMatchesScope; evaluateRoleGrants; RBAC early deny; tenant forms authz; permission middleware redirects; patient.create policy |
| **B** | Clinical / billing | Payment method matrix; billing/refund/void early denials; billingOps calendar/arrangement; clinical `startEncounter` deny; portal auth misses |
| **C** | Registration / booking / staff | Registration validation surfaces; invite/staff module contracts; booking linkage early path |
| **D** + **A2** | Publishing / media / reg admin | Publish review classify/collect/blocking; media MIME/sanitize/CDN keys; registration `normalizeListFilters` allow/deny; workflow/priority; forms publish deny |

**Test file:** `tests/v203-high-risk-active-coverage.test.js`  
**Marker:** `V203_HIGH_RISK_ACTIVE_COVERAGE`  
**Cases:** **34** (all green under `node --test`)

Measurement: baseline istanbul ∪ HR c8 `coverage-final.json` at **statement/branch key** level (capped to frozen totals; floor = pre-campaign covered). Targeted c8 only — **not** full 865-file rerun.

```
BEFORE:
LINES=86232/106558 (80.92%)
BRANCHES=14097/21693 (64.98%)
FUNCTIONS=1958/2160 (90.65%)

AFTER:
LINES=86318/106558 (81.01%)
BRANCHES=14164/21693 (65.29%)
FUNCTIONS=1959/2160 (90.69%)

DELTA: L+86  B+67  F+1
GAP_TO_TARGET: L+9585 (to 90%)  B+3191 (to 80%)  F=0 (already ≥90%)
```

---

## 5. Application defects

```
APPLICATION_DEFECTS_FOUND=0
APPLICATION_DEFECTS_FIXED=0
```

No incorrect product behavior discovered in exercised paths (denials and validations behaved as designed).

---

## 6. Coverage integrity

```
MEANINGFUL_TESTS=YES
DENOMINATOR_MANIPULATION=NO
COVERAGE_EXCLUSIONS_ADDED=0
HIDDEN_FAILURE_SKIPS=0
IMPORT_ONLY_TESTS=0
ASSERTION_FREE_TESTS=0
AUTHZ_LAYER_MOCKED_AWAY=NO
WEAKENED_ASSERTIONS=0
```

Forbidden patterns avoided: no private-only coverage hooks, no fake impossible states, no production behavior changes for branch exposure.

---

## 7. Proven duplicate files (inspect only)

| DUPLICATE_FILE | CANONICAL_FILE | ACTIVE_V10_IMPORTS | LEGACY_IMPORTS | BEHAVIORAL_DIFFERENCES | SAFE_TO_CONSOLIDATE |
|---|---|---|---|---|---|
| `src/routes/church/memberPortal.js` | `src/blessboard/http/memberPortalRoutes.js` | none (not V10-mounted) | `src/routes/church/index.js` → `server.legacy` | Parallel portal surface | **NO** (DBCL09 KEEP) |
| `src/routes/church/hqAdmin.js` | `src/blessboard/http/hqAdminRoutes.js` | none | church index → legacy | Parallel HQ admin | **NO** |
| `src/routes/church/branchAdminMembers.js` | `src/blessboard/http/branchAdminRoutes.js` | none | `branchAdmin.js` → legacy | Parallel branch admin | **NO** |
| `src/routes/blessboardAdmin.js` | V5 foundation BB routers | none | `server.legacy.js` | Legacy admin mount | **NO** |
| `src/activeclinic/services/formatMoney.js` | `src/platform/money/formatMoney.js` | billing/cashier/dataJob/performance | — | Thin wrap; platform also used elsewhere | **NO** this campaign (map all AC imports first; architecture-driven) |

```
DUPLICATES_CONSOLIDATED=0
```

---

## 8. Legacy routes

```
LEGACY_ROUTES_CHANGED=0
UNMOUNTED_ROUTE_FILES=91
```

Documented as **supported legacy debt** (conditional on unprofiled `server.legacy`). **No** tests added to inflate coverage; **no** deletions.

---

## 9. Why blocked (remaining branch categories)

Campaign targets **LINES ≥90%** and **BRANCHES ≥80%** not met. Remaining work is **not** meaningful unit-test ROI:

| Remaining category | Why unit/fake-pool stalls | Needed layer |
|---|---|---|
| **HTTP write routes** (billing, cashier, pharmacy, clinical, portal, booking) | Early ACCESS_DENIED already covered; body of handlers needs auth session + DB | HTTP_INTEGRATION |
| **Registration admin / repository** | List/filter helpers improved slightly; approve/provision/comms need real TX | SERVICE+HTTP+DB |
| **Publish success paths** | Error/classify matrices done; prepare/publish success needs drafts + authz | HTTP_INTEGRATION |
| **Tenant public page model** | Large branch map in loader | HTTP/integration |

Continuing with more early-deny unit loops would be **artificial** relative to uncovered branch mass (~+3191 branches still required).

---

## 10. Targeted security / business gates

| Gate | Result | Evidence |
|---|---|---|
| AUTH_RBAC | **PASS** (campaign matrices) | forge/scope/grant/RBAC early deny tests |
| TENANT_ISOLATION | **PASS** | `npm run test:v8:tenant-isolation` (6) + forge matrices |
| PATIENT_CLINICAL | **PASS** (smoke) | clinical `startEncounter` deny path in campaign; full clinical pack not re-batched |
| BILLING | **PASS** | `activeclinic-phase4-billing-ops` (9) + billing early denials |
| REGISTRATION | **PASS** (filter/validation matrices) | normalizeListFilters allow/deny; full provision HTTP not re-run |
| BOOKING | **PARTIAL** | linkage early path only |
| PUBLISHING | **PASS** (review/error matrices) | classify/collect/blocking/error page |
| MEDIA_SECURITY | **PASS** (helper matrices) | MIME/sanitize/CDN key allow/deny |
| STAFF_FACILITY_BRANCH | **PARTIAL** | middleware facility redirect; staff list not deep |

Full 98/98 QA matrix **not** re-executed in this campaign (scoped high-risk gate). Functional green prerequisite assumed unchanged (`FAIL=0`, `QA=98/98`).

---

## Marker

```text
HIGH_RISK_FILES=261
HIGH_RISK_MANIFEST_SHA=27e97351b75f6540edd797d7239aeb3254bc56272aeb8742bd3f334160fb4bc6

BEFORE:
LINES=86232/106558
BRANCHES=14097/21693
FUNCTIONS=1958/2160

AFTER:
LINES=86318/106558
BRANCHES=14164/21693
FUNCTIONS=1959/2160

NEW_TEST_CASES=34
APPLICATION_DEFECTS_FOUND=0
APPLICATION_DEFECTS_FIXED=0

AUTH_RBAC=PASS
TENANT_ISOLATION=PASS
PATIENT_CLINICAL=PASS
BILLING=PASS
REGISTRATION=PASS
BOOKING=PARTIAL
PUBLISHING=PASS
MEDIA_SECURITY=PASS
STAFF_FACILITY_BRANCH=PARTIAL

MEANINGFUL_TESTS=YES
DENOMINATOR_MANIPULATION=NO
COVERAGE_EXCLUSIONS_ADDED=0

DUPLICATES_CONSOLIDATED=0
LEGACY_ROUTES_CHANGED=0

PRODUCTION=UNTOUCHED

TARGET_LINES_90=FAIL (81.01%)
TARGET_BRANCHES_80=FAIL (65.29%)
TARGET_FUNCTIONS_90=PASS (90.69%)

FINAL=V2_03_HIGH_RISK_COVERAGE_GATE_BLOCKED
```

**Next (if continuing):** authenticated HTTP integration matrices for billing/cashier/clinical/pharmacy/portal/booking and registration approve/provision — not additional early-deny unit waves.
