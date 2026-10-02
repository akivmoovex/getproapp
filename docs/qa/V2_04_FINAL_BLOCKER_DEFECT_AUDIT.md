# V2.04 Final Blocker Defect Audit

**Scope:** RB-QA-01 + RB-QA-02 only  
**Mode:** Root-cause proven → minimal fixes → focused regression  
**Hosted candidate audited:** `2a2498f630676638c63f1961f0c8bf80507a15c5`  
**Clean application candidate (fixes only):** `27969978043c96ff67638e3a8f1da20c9b102d8f`  
**Date:** 2026-10-02  
**Deploy:** not performed · production untouched

Evidence:
- `docs/qa/references/v2-04-final-hosted-rc-retest-evidence.json`
- `docs/qa/references/v2-04-final-hosted-rc-deep-evidence.json`
- `docs/qa/references/v2-04-final-hosted-rc-deep2-evidence.json`
- `docs/qa/V2_04_MANUAL_QA_RESULTS_RECORD.md`

### Freeze note

Application + regression tests for the three defects are frozen at  
`27969978043c96ff67638e3a8f1da20c9b102d8f` (this docs commit does not change app behavior).  
`READY_FOR_HOSTED_DEPLOY=YES` after this freeze; hosted RB-QA-01/02 retest still required before closing blockers.

---

## 1. RB-QA-01 — Three failed BB member scenarios

| SCENARIO_ID | SCENARIO_NAME | EXPECTED | ACTUAL | HTTP_STATUS | ERROR_CODE | ROUTE | TENANT | ROLE |
|-------------|---------------|----------|--------|-------------|------------|-------|--------|------|
| T-M03 | Add Member (staff create) | Create succeeds with assigned branch UUID | Form options `value=""`; POST fails validation | 400 | field `branch_id` | `/branch-admin/members/new` | `bb-v8qa-muq9wn7a9a3d` | branch admin |
| T-M04 | Member portal login / activate | Church ID login + activation pages | Apex hard-reject / path unmounted | 404 / 404 | Not found | `/member/login`, `/member/activate` | same | public member |
| T-M08 | Dual-role HQ → member portal | HQ session can open member home | Apex hard-reject → V5 unavailable | 503 | unavailable | `/member` | same | HQ admin (+ member) |

### Root causes

| SCENARIO | CLASSIFICATION | ROOT CAUSE |
|----------|----------------|------------|
| T-M03 | DATA_SETUP + QUERY (DTO) | `listBlessBoardBranches` → `mapBranch` omitted `id`; template uses `b.id \|\| b.branchId` → empty select values; POST validation “Assigned branch is required” (and stale fieldError survived workspace default) |
| T-M04 | LOGIN + ACTIVATION + TENANT_SCOPE | Member auth used **hard** apex reject; V8 `blessboard.neuniversity.org` is both apex and `churchHostDomain`; no `/c/:org/member/*` mount |
| T-M08 | MULTI_ADMIN + TENANT_SCOPE | Same hard apex reject on member portal (`503` via `sendUnavailable`) despite session-scoped HQ tenant (HQ shells already use `unlessTenant`) |

**Shared root for T-M04 + T-M08:** one apex gating defect (hard reject vs `unlessTenant` + missing path tenant mount).  
**T-M03** is a separate branch-id DTO/form defect.

---

## 2. RB-QA-02 — BB website lifecycle failure

| Field | Value |
|-------|-------|
| FAILED_STAGE | **RESTORE_AS_NEW** |
| REQUEST | `GET/POST /hq/website/version-history/{classicId}/restore` (also engine history UI with live-only version) |
| STATUS | 400 (classic) · engine UI `canRestore=false` for sole live version |
| ERROR | “This version cannot be restored.” / no restore control |
| SERVER_LOG_EVENT | classic `prepareVersionRestore` → `draft_source` / non-restorable classic rows |
| EXPECTED_STATE | Restore-as-new creates draft; published unchanged |
| ACTUAL_STATE | Classic restore rejected; engine history listed live `ee45facb-…` with `canRestore:false` (API POST restore still succeeded when forced) |

AC lifecycle **PASS** (engine restore). BB publish/public/unpublish/republish/preview **PASS**. Failure is BB-specific classic↔engine restore surface + live-version UI gate — **not** shared lifecycle engine.

Checked (not primary blame): publish governance, readiness, branch/HQ scope, public route, unpublish, republish — all PASS on hosted tip.

---

## 3. Three defects mapped

| DEFECT_ID | BLOCKER | SCENARIO/STAGE | ROOT_CAUSE | SHARED_OR_PRODUCT | FILES_INVOLVED | CODE_FIX_REQUIRED | DATA_FIX_REQUIRED | TEST_GAP |
|-----------|---------|----------------|------------|-------------------|----------------|-------------------|-------------------|----------|
| DEF-BB-ADD-MEMBER-BRANCH-ID | RB-QA-01 | T-M03 | Branch list DTO omitted UUID for form options | BB product | `listBlessBoardBranches.js`, `branchRegistrationAdminRoutes.js`, `member-add.ejs` | YES | NO | YES → pack |
| DEF-BB-MEMBER-PORTAL-ROUTES | RB-QA-01 | T-M04, T-M08 | Hard apex reject + no path member mount on V8 product host | BB product | `memberPortalAuthRoutes.js`, `memberPortalRoutes.js`, `pathMemberTenantMiddleware.js`, `v5FoundationServer.js` | YES | NO | YES → pack |
| DEF-BB-WEBSITE-RESTORE | RB-QA-02 | RESTORE_AS_NEW | Classic restore rejects engine/draft rows; history UI blocked live restore | BB + shared history model | `historyModel.js`, `websitePublicationVersionAdminRoutes.js`, `websiteManagementFeatureContract.js` | YES | NO | YES → pack |

**Exactly 3 root causes** explain the 3 failed member scenarios + 1 failed lifecycle stage (T-M04/T-M08 share one cause).

---

## 4. Fixes applied (minimal)

1. **Branch ID:** `listBlessBoardBranches(..., { includeIds: true })` for Add Member; clear stale `branch_id` fieldError when applying workspace default.
2. **Member portal:** `unlessTenant` apex gate; path middleware + `/c/:organizationKey` member auth/portal mounts for V8 apex===churchHostDomain.
3. **Website restore:** allow `canRestore` for live published versions in shared history model; on classic prepare failure redirect to engine history; BB_HISTORY contract → engine `/website/history`.

Preserved: AC lifecycle path, membership schema, tenant isolation/RBAC patterns, responsive editor, version preview plumbing.

---

## 5. Regression tests

- **New:** `tests/v2-04-final-blocker-defect-pack.test.js` (8 focused assertions across the three defects)
- Updated: `tests/blessboard-apex-hq-website-lifecycle.test.js` (unlessTenant expectation)
- Reran: BB members suites, website management contract, shared wave4b1, V8 shared lifecycle, website RBAC, authorization shells, apex HQ lifecycle, branch-list

Do **not** close RB-QA-01/02 from automated tests alone — hosted manual retest required.

---

## 6. Release decision

| Gate | Value |
|------|-------|
| RB_QA_01_READY_FOR_HOSTED_RETEST | **YES** |
| RB_QA_02_READY_FOR_HOSTED_RETEST | **YES** |
| NEW_CLEAN_CANDIDATE_SHA | **`27969978043c96ff67638e3a8f1da20c9b102d8f`** (app+tests only) |
| READY_FOR_DEPLOY | **YES** (hosted retest still required to close RB-QA-01/02) |

Hosted retest checklist after deploy of a clean SHA:
- T-M03 Add Member with non-empty `branch_id` options + successful create
- T-M04 `/c/{org}/member/login` + `/member/activate`
- T-M08 HQ session `/member` (not 503)
- BB RESTORE_AS_NEW from hub history (restore control on published version → `restored_draft`)
- AC lifecycle regression remains PASS

---

DEFECTS_IDENTIFIED=3

RB_QA_01_FAILED_SCENARIOS=3
RB_QA_01_ROOT_CAUSES=2
RB_QA_01_CODE_FIXES=2
RB_QA_01_DATA_FIXES=0

RB_QA_02_FAILED_STAGE=RESTORE_AS_NEW
RB_QA_02_ROOT_CAUSES=1
RB_QA_02_CODE_FIXES=1

NEW_REGRESSION_TESTS=8
FOCUSED_TESTS=107/107
AC_LIFECYCLE_REGRESSION=PASS
BB_LIFECYCLE_REGRESSION=PASS

RB_QA_01_READY_FOR_HOSTED_RETEST=YES
RB_QA_02_READY_FOR_HOSTED_RETEST=YES

NEW_CLEAN_CANDIDATE_SHA=27969978043c96ff67638e3a8f1da20c9b102d8f
READY_FOR_DEPLOY=YES
FINAL=V2_04_FINAL_BLOCKER_DEFECT_AUDIT_COMPLETE
