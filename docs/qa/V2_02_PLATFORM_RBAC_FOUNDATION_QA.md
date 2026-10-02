# V2.02 Platform RBAC Foundation QA

**Task:** `V2_02_PLATFORM_RBAC_FOUNDATION`  
**Date:** 2026-09-26  
**Branch:** `V9`  
**Mode:** Implementation of platform-owned catalogue primitives (no physical table relocate)  
**Production:** **DO NOT TOUCH**

**Plan source:** `docs/qa/V2_02_SHARED_RBAC_CONSOLIDATION_PLAN.md`  
**Physical migrate now:** **NO** (Phase F deferred) — platform repositories/services read `blessboard.roles` / `permissions` / `role_permissions`.

---

## Verdict

### **`V2_02_PLATFORM_RBAC_FOUNDATION_PASS`**

Platform owns shared RBAC catalogue lookup, product/category validation, effective-permission resolution, and assignment audit primitives. Existing role keys and permission keys are preserved. BlessBoard login and ActiveClinic route/authz behavior were not changed. No route gained new permissions. Local unit tests **11/11 PASS**. Production untouched.

---

## 1. What was implemented

| Capability | Module |
| --- | --- |
| Role / permission catalogue constants | `src/platform/rbac/platformRbacConstants.js` |
| Catalogue repository (reads) | `src/platform/rbac/platformRbacCatalogRepository.js` |
| Role lookup + product/category validation | `src/platform/rbac/platformRbacCatalogService.js` |
| Effective permission primitives | `src/platform/rbac/platformEffectivePermissions.js` |
| Assignment audit primitives | `src/platform/rbac/platformRbacAssignmentAudit.js` |
| Public exports | `src/platform/rbac/index.js` |
| BB catalogue read delegation | `src/blessboard/repositories/blessBoardRbacRepository.js` (same tables, same keys) |

### Explicit non-changes

- No `platform.roles` / `platform.permissions` SQL migration  
- No BB login / session eligibility change (`user_roles` still authoritative)  
- No AC middleware / staff assignment behavior change  
- No catalogue permission grants added or removed  
- No platform_admin role-name gate removal  

### V8-002 policy encoded (read-only helper)

`PATIENT_CREATE_ALLOWED_ROLE_KEYS` = reception / clinical-records / clinic+organization management families.  
Facility admin, finance, website, and bare staff are **not** included. Helpers do not mutate `role_permissions` (catalogue grants applied in migration `115` / V2_02_AC_RBAC_ALIGNMENT).

---

## 2. Test results

| Suite | Result |
| --- | --- |
| `tests/v2-02-platform-rbac-foundation.test.js` | **11/11 PASS** |
| `tests/v8-shared-rbac-tenant-isolation.test.js` | Re-run for regression |

Covered:

- Catalogue reads (role + permission by key)  
- Permission resolution / union  
- Missing / inactive / invalid / duplicate role handling  
- BB repository compatibility with platform catalogue reads  
- AC product category filter (AC roles ok; BB website role mismatch)  
- Assignment audit build + BB persist + AC payload-only  

---

## 3. Safety checklist

| Rule | Status |
| --- | --- |
| Preserve role keys | YES |
| Preserve permission keys | YES |
| No BB login change | YES |
| No AC behavior change | YES |
| No accidental new route permissions | YES |
| Production untouched | YES |
| Physical table migrate | NO (deferred) |

---

## 4. Files touched

- `src/platform/rbac/platformRbacConstants.js` *(new)*  
- `src/platform/rbac/platformRbacCatalogRepository.js` *(new)*  
- `src/platform/rbac/platformRbacCatalogService.js` *(new)*  
- `src/platform/rbac/platformEffectivePermissions.js` *(new)*  
- `src/platform/rbac/platformRbacAssignmentAudit.js` *(new)*  
- `src/platform/rbac/index.js`  
- `src/blessboard/repositories/blessBoardRbacRepository.js`  
- `tests/v2-02-platform-rbac-foundation.test.js` *(new)*  
- `docs/qa/V2_02_PLATFORM_RBAC_FOUNDATION_QA.md` *(this file)*  

---

## 5. Next waves (not this task)

Per consolidation plan: BB catalogue login (Phase B), platform admin catalogue gate (Phase C), legacy `user_roles` removal, optional Phase F relocate to `platform.*` tables.

---

## Return token

```
V2_02_PLATFORM_RBAC_FOUNDATION_PASS
branch=V9
physical_migrate=NO
bb_login_changed=NO
ac_behavior_changed=NO
catalogue_keys_preserved=YES
local_tests=11/11
prod_untouched=YES
```
