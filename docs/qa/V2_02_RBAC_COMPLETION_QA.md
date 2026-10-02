# V2.02 Shared RBAC Completion QA

**Task:** `V2_02_RBAC_COMPLETE_REMAINING`  
**Date:** 2026-09-26T12:03:59Z  
**Branch:** `V9`  
**Production:** **DO NOT TOUCH**

**Plan:** `docs/qa/V2_02_SHARED_RBAC_CONSOLIDATION_PLAN.md`  
**Prior evidence:** all `docs/qa/V2_02_*RBAC*.md`, `V2_02_LEGACY_RBAC_REMOVAL_QA.md`, `V2_02_SHARED_RBAC_FINAL_REGRESSION.md`, `V2_02_RELEASE_CANDIDATE_REVIEW.md`

---

## Verdict

### **`V2_02_SHARED_RBAC_CONVERGED`**

Target V2.02 shared RBAC state is met on V9. Already-PASS phases were **skipped** (evidence preserved). The only incomplete approved wave item remaining was **Phase A data backfill** (`user_roles` → catalogue assignments); that is now implemented, tested, and **committed separately**. Legacy `user_roles` storage is **not dropped** (INSERT frozen; display dual-reads may remain). Phase F physical catalogue relocate remains **deferred**.

---

## Target-state checklist

| Target | Status | Evidence |
| --- | --- | --- |
| One platform-owned role/permission catalogue | **YES** | `blessboard.roles` / `permissions` / `role_permissions` via `src/platform/rbac/*` (Phase F relocate deferred) |
| Shared authorization primitives | **YES** | `platformRbacCatalog*`, `platformEffectivePermissions`, `platformAdminAuthorization`, `sharedAuthzDecision` |
| BB catalogue-only RBAC | **YES** | Login + authorize + invites on URA; `V2_02_BB_CATALOGUE_ONLY_RBAC_PASS` |
| AC shared RBAC foundation | **YES** | Staff assignments → shared catalogue; permission middleware; `V2_02_AC_RBAC_ALIGNMENT_PASS` |
| Product-specific assignment scopes | **YES** | BB org/church/branch URA; AC org/facility `staff_role_assignments` |
| `platform_administrator` replaces legacy `platform_admin` | **YES** | `V2_02_PLATFORM_ADMIN_RBAC_PASS` |
| No BB legacy login-role dependency | **YES** | Session eligibility from catalogue assignments |
| No authorization by hardcoded legacy role name (auth surfaces) | **YES** | `v2-02-legacy-rbac-removal` static guard |
| `patient.create` only reception / clinical / manager families | **YES** | Owner policy in `PATIENT_CREATE_ROLE_FAMILIES` + migration `115` |
| Legacy storage not dropped | **YES** | Table retained; INSERT frozen (`116`); Phase A backfill reads only |

---

## Phase matrix (skip vs implement)

| Phase | Plan name | Prior verdict | This task |
| --- | --- | --- | --- |
| Foundation | Platform catalogue primitives | `V2_02_PLATFORM_RBAC_FOUNDATION_PASS` | **SKIP** — preserve |
| B | BB catalogue-only login / authorize | `V2_02_BB_CATALOGUE_ONLY_RBAC_PASS` | **SKIP** — preserve |
| C | Platform admin catalogue gate | `V2_02_PLATFORM_ADMIN_RBAC_PASS` | **SKIP** — preserve |
| AC | patient.create alignment | `V2_02_AC_RBAC_ALIGNMENT_PASS` | **SKIP** — preserve (owner families already applied) |
| D/E auth | Legacy auth removal + freeze INSERT | `V2_02_LEGACY_RBAC_REMOVED` | **SKIP** — preserve |
| Final | Shared regression | `V2_02_SHARED_RBAC_CONVERGED` | **SKIP** — preserve |
| **A** | Legacy → catalogue **backfill** | Missing migration | **IMPLEMENTED** + tested + **committed** |
| F | Physical `platform.roles` relocate | Deferred by plan | **DEFER** (not V2.02 blocker) |
| Drop `user_roles` | Archival after soak | Not allowed yet | **DEFER** (runtime display refs remain) |

---

## Owner decision — `patient.create`

Applied (no change this task):

| Family | Role keys | Create |
| --- | --- | --- |
| Reception | `activeclinic_receptionist` | Yes |
| Clinical / records | `activeclinic_medical_records_officer` | Yes |
| Manager | `activeclinic_clinic_manager`, `activeclinic_organization_admin`, `activeclinic_network_admin` | Yes |

**Excluded:** nurse/clinician create, facility_admin, finance/billing/cashier, lab/radiology/pharmacy, website_editor, bare staff, auditor.

Routes continue to check **`activeclinic.patient.create` + scope only** (no role-name allowlists).

---

## Phase A work completed this task

| Item | Detail |
| --- | --- |
| Migration | `db/migrations/blessboard/117_backfill_catalogue_assignments_from_user_roles.sql` |
| Behavior | Idempotent map: `platform_admin`→`platform_administrator` (platform), `church_hq_admin`→`organisation_administrator` (church), `branch_admin`→`branch_administrator` (branch) |
| Origin | `assignment_origin = 'migration'` |
| Safety | Does **not** drop `user_roles`; freeze trigger remains |
| Test | `tests/v2-02-phase-a-user-roles-backfill.test.js` — **2/2 PASS** |
| Commit | `5140acc4cef3820575b14e5a65cf08bcd9a971e1` — *Add V2.02 Phase A backfill from legacy user_roles to catalogue assignments.* |

No other incomplete auth phase required a code change.

---

## Re-verification (local)

```text
node --test \
  tests/v2-02-platform-rbac-foundation.test.js \
  tests/v2-02-bb-catalogue-only-rbac.test.js \
  tests/v2-02-platform-admin-rbac-convergence.test.js \
  tests/v2-02-legacy-rbac-removal.test.js \
  tests/v2-02-ac-rbac-alignment.test.js \
  tests/v2-02-phase-a-user-roles-backfill.test.js
→ 44/44 PASS
```

Log: `/tmp/v202-rbac-completion-final.txt`

| Ref | Value |
| --- | --- |
| HEAD (includes Phase A commit) | `5140acc4cef3820575b14e5a65cf08bcd9a971e1` |
| Ahead of `origin/V9` | **1** (Phase A commit only among new commits) |
| Hosted / production | Untouched |

---

## Explicitly remaining (out of V2.02 auth convergence)

| Item | Why deferred |
| --- | --- |
| Phase F physical relocate to `platform.roles` / `permissions` | Plan: optional after soak; catalogue already shared in `blessboard.*` |
| DROP `blessboard.user_roles` | Display/directory dual-reads still reference table; INSERT already frozen |
| Display / HQ role-admin UI catalogue labels | Soak MIGRATE (non-auth) |
| Hosted V9 smoke of RBAC tip + migrations 114–117 | Deploy prerequisite — not this task |
| Commit of earlier uncommitted V2.02 RBAC tree (B–E code) | Separate from Phase A; still local dirty files outside this commit |

---

## Return token

```
V2_02_SHARED_RBAC_CONVERGED
branch=V9
phases_skipped=foundation,B,C,AC,legacy_auth,final_regression
phase_a=IMPLEMENTED_COMMITTED
phase_a_sha=5140acc4cef3820575b14e5a65cf08bcd9a971e1
patient_create=reception_clinical_manager_families
legacy_table_dropped=NO
phase_f=DEFERRED
local_tests=44/44
prod_untouched=YES
```
