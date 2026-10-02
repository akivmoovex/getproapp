# V2.02 Shared RBAC Final Regression

**Task:** `V2_02_SHARED_RBAC_FINAL_REGRESSION`  
**Date:** 2026-09-26T11:35:14Z  
**Branch:** `V9`  
**Production:** **DO NOT TOUCH** (no prod deploy, no hosted mutate)

---

## Verdict

### **`V2_02_SHARED_RBAC_CONVERGED`**

BlessBoard, ActiveClinic, and platform administration authorize against **one shared catalogue foundation** (`blessboard.roles` / `permissions` / `role_permissions` + product assignment tables). Auth-decision surfaces no longer fall through to `blessboard.user_roles`. Local automated matrix **PASS** after regression fixes below. Hosted retest **SKIP** (V9 not deployed; production forbidden).

---

## Exact V9 SHA

| Ref | Value |
| --- | --- |
| **Committed HEAD (V9 tip)** | `b186991d7db5334bfaa235f8a0ecf37428ea4a5a` |
| HEAD subject | `Document V2.02 version and release notes QA on V8 testing.` |
| **Working-tree fingerprint** (`git write-tree`) | `33a5353988884e7e7ecd6d1564ab2dd0b00fdc4e` |
| Dirty file count at report | ~309 (uncommitted V2.02 RBAC sequence + prior local artifacts) |

> Regression evidence applies to **HEAD + uncommitted V2.02 RBAC work** on branch `V9`. Commit when the owner requests; do not treat HEAD alone as the converged runtime without the working tree.

---

## Security regressions found & fixed in this pass

| Issue | Severity | Fix |
| --- | --- | --- |
| `listActiveAuthorizationRoles` / PA / last-admin SQL used `ends_at` (column is `expires_at`) → website scope **503**, silent PA false-negatives | **P0** | `expires_at` in `blessBoardAuthorizationRepository.js`, `platformAdminAuthorization.js`, `blessBoardLastAdminGuard.js` |
| Platform-scoped URA filtered only by `organization_id` → PA denied on other orgs | **P0** | `listActiveAssignmentsForUser` also returns `scope_type = 'platform'` |
| P0 publish fixture assigned catalogue `church_hq_admin` + `website_editor` → editor could **publish** | **P0** (fixture / dual-role pattern) | Editor = `website_editor` only; publisher = `website_publisher` only |
| Legacy bundle constants emptied → several suites crashed on `.includes` | Test debt | Tests assert catalogue `role_permissions` |

No remaining known allow-when-deny auth regressions in the suites below.

---

## Automated matrix (local)

### Core shared foundation — **PASS** `112/112`

| Suite | Result |
| --- | --- |
| `v2-02-platform-rbac-foundation` | PASS |
| `v2-02-bb-catalogue-only-rbac` | PASS |
| `v2-02-platform-admin-rbac` | PASS |
| `v2-02-legacy-rbac-removal` | PASS |
| `v2-02-ac-rbac-alignment` | PASS |
| `v8-shared-rbac-tenant-isolation` | PASS |
| `v8-tenant-product-isolation` | PASS |
| `blessboard-authorization-shells` | PASS |
| `blessboard-rbac-foundation` | PASS |
| `blessboard-finance-separation` | PASS |
| `blessboard-p0-publish-auth` | PASS |
| `v7-website-rbac` (contract + AC + BB) | PASS |
| `activeclinic-rbac-role-matrix` | PASS |

Log: `/tmp/v202-rbac-reg/round2.txt`

### Shared product surfaces — **PASS** `61/61` + AC extra `29/29`

| Area | Suite(s) | Result |
| --- | --- | --- |
| Themes | `v2-01-shared-theme-gallery`, `v2-01-shared-theme-infra` | PASS |
| Media ownership / resolution | `v8-shared-media-resolution` | PASS |
| Booking | `activeclinic-public-booking`, `activeclinic-mf10-booking` | PASS |
| AC website editor / CMS | `activeclinic-website-cms`, `v7-shared-website-editor` | PASS |
| Sections | `v2-01-shared-section-management` | PASS |
| AC staff / multi-role / product isolation | `activeclinic-staff-rbac-foundation`, `activeclinic-multi-role-rbac`, `activeclinic-product-isolation` | PASS |
| BB website scope resolver | `blessboard-website-scope` | PASS |

Logs: `/tmp/v202-rbac-reg/shared2.txt`, `ac-extra.txt`, `scope.txt`, `bb-scope.txt`

### Scope cards / chrome — **PASS with 2 non-auth fails**

| Case | Result | Notes |
| --- | --- | --- |
| BB website scope resolver (HQ/branch isolation) | PASS | Authz + scope resolution |
| Branch settings chrome HTTP | **2 FAIL** | Expect `200`, got **`301`** on `/c/…?website_edit=1` — URL redirect, **not** permission grant. Settings/403 isolation cases in same file still PASS. |

---

## Requirement coverage

### PLATFORM

| Case | Automated | Notes |
| --- | --- | --- |
| Platform administrator | PASS | Catalogue `platform_administrator` + `platform.*` |
| Unauthorized product admins | PASS | Tenant HQ ≠ platform ops; PA suite |
| Cross-product / forged / direct denial | PASS | Isolation + PA suites |

### BB

| Case | Automated | Notes |
| --- | --- | --- |
| Organisation / church admin equivalent | PASS | `organisation_administrator` / HQ map |
| Branch admin / branch pastor | PASS | Shells + foundation scope |
| Website editor | PASS | Edit yes; publish no; content shell 200 after `expires_at` fix |
| Auditor / finance-restricted | PASS | Finance separation + foundation |
| Role assign / revoke | PASS | Assignment service + revoke preserves row |
| HQ / branch isolation | PASS | Shells, publish auth, website scope |

### AC

| Case | Automated | Notes |
| --- | --- | --- |
| Org / clinic manager | PASS | Alignment + matrix |
| Receptionist / clinical staff | PASS | `patient.create` families |
| `patient.create` policy | PASS | Migration 115 + alignment suite |
| Staff / access management | PASS | Staff RBAC foundation |
| Facility isolation | PASS | Cross-facility deny |
| Restricted roles | PASS | Billing / lab / website editor deny create |

### SHARED security

| Case | Automated | Notes |
| --- | --- | --- |
| Cross-product denial | PASS | `v8-tenant-product-isolation` |
| Cross-org denial | PASS | BB + AC suites |
| Forged IDs | PASS | P0 publish + website RBAC |
| Direct route / API denial | PASS | Publish 403; AC `/app/patients/new` |
| Session permission refresh / revoked | PASS | Revoke → deny; expired path in authorize |
| Suspended identity | PASS | Covered in foundation / PA suites |
| Expired assignment | PASS | `expires_at` filter + mark-expired path |
| Self-elevation protections | PASS | AC `SELF_ESCALATION`; BB sensitive assign deny |

### Rerun surfaces

| Surface | Result |
| --- | --- |
| BB website editor | PASS |
| AC website editor | PASS |
| Publish authorization | PASS |
| Media ownership | PASS |
| Booking | PASS |
| Themes | PASS |
| Scope cards | PASS resolver; chrome URL 301 noted |

---

## Hosted

| Environment | Result |
| --- | --- |
| Production | **DO NOT TOUCH** — not exercised |
| Hosted V8/V9 testing | **SKIP** — this task is local V9 regression only; no Hostinger deploy |

---

## Legacy references remaining (non-auth soak)

Auth-decision surfaces: **ZERO** `FROM blessboard.user_roles` / INSERT / legacy permission unions (guarded by `v2-02-legacy-rbac-removal`).

Still present (display / directory / recovery / reset — **not** allow/deny):

- Platform admin directory / access-health / account-recovery dual-read SQL  
- `staffAccessService` / HQ role UI labels still mentioning legacy keys  
- `blessBoardAuthRepository` legacy helpers (frozen INSERT via migration `116`)  
- Testing reset DELETE on `user_roles`  
- Historical migrations / docs  

`legacyCompatibilityPermissions.js` remains an **empty stub** for old `require()` paths.

Phase F physical move to `platform.roles` remains **deferred**.

---

## Security regression summary

| Class | Status |
| --- | --- |
| Editor publish elevation (dual HQ+editor catalogue) | Fixed in fixtures; catalogue grants correctly deny `website.publish` for `website_editor` |
| Website scope 503 (`ends_at`) | Fixed |
| PA cross-org miss (`organization_id` filter) | Fixed |
| Cross-tenant / cross-product / forged publish | PASS |
| Self-elevation | PASS |
| Open residual auth allow-when-deny | **None known** in automated matrix |

---

## Evidence commands (local)

```bash
node --test \
  tests/v2-02-platform-rbac-foundation.test.js \
  tests/v2-02-bb-catalogue-only-rbac.test.js \
  tests/v2-02-platform-admin-rbac.test.js \
  tests/v2-02-legacy-rbac-removal.test.js \
  tests/v2-02-ac-rbac-alignment.test.js \
  tests/v8-shared-rbac-tenant-isolation.test.js \
  tests/v8-tenant-product-isolation.test.js \
  tests/blessboard-authorization-shells.test.js \
  tests/blessboard-rbac-foundation.test.js \
  tests/blessboard-finance-separation.test.js \
  tests/blessboard-p0-publish-auth.test.js \
  tests/v7-website-rbac.test.js \
  tests/activeclinic-rbac-role-matrix.test.js
# → 112/112 pass
```

---

## Follow-ups (non-blocking for this verdict)

1. Commit uncommitted V2.02 RBAC tree on `V9` when owner requests.  
2. Hosted smoke on moovex-platform testing after deploy (out of scope here).  
3. Chrome-scope `301` vs `200` test expectations / redirect-follow.  
4. Display dual-read cutover off `user_roles` → drop table after soak.  
5. HQ role-admin UI catalogue labels (still shows legacy assignable names).
