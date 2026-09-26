# V2.02 Platform Admin RBAC Convergence QA

**Task:** `V2_02_PLATFORM_ADMIN_RBAC_CONVERGENCE`  
**Date:** 2026-09-26  
**Branch:** `V9`  
**Prerequisite:** `V2_02_BB_CATALOGUE_ONLY_RBAC_PASS`  
**Production:** **DO NOT TOUCH**

---

## Verdict

### **`V2_02_PLATFORM_ADMIN_RBAC_PASS`**

Legacy `platform_admin` (`blessboard.user_roles`) is **no longer** an authorization gate for platform administration. Apex `/admin` and platform ops services require an active catalogue **`platform_administrator`** assignment (`scope_type = platform`) plus explicit **`platform.*`** permissions. Local tests **PASS**. Production untouched.

---

## 1. Authorization model (target)

```text
active user
→ active user_role_assignments
   role_key = platform_administrator
   scope_type = platform
→ role_permissions → platform.* keys
→ allow / deny
```

**Removed:** `user_roles.role_key = 'platform_admin'` fallthrough (including V7 env and `PLATFORM_ADMIN_PERMISSION_FALLTHROUGH`).

---

## 2. Platform permissions verified for `platform_administrator`

| Area | Permission keys (catalogue) |
| --- | --- |
| Users | `platform.users.view`, `.invite`, `.reset_access`, `.revoke_sessions`, `.suspend`, `.restore`, `.unlock` |
| Roles / team | `platform.roles.view`, `.assign_standard`, `.assign_sensitive`, `.revoke` |
| Support | `platform.support.enter_hq`, `.enter_branch`, `.exit`, `.view_status` |
| Deployments | `platform.deployments.view` |
| Domains / public links | `platform.domains.view` |
| Audit / access health | `platform.audit.view`, `platform.access_health.view` |
| Members (support profile) | `platform.members.search`, `.view_support_profile` |

Seeded by migrations `068`–`071`, `075` (and related). Gate implementation: `src/platform/rbac/platformAdminAuthorization.js`.

---

## 3. Must-not auto-grant (platform admin ≠ product privilege)

Platform administration remains separate from tenant-sensitive product access. Catalogue PA defaults **must not** imply:

| Denied by default | Why |
| --- | --- |
| `patient.create` (and clinic patient ops) | ActiveClinic clinical surface |
| Financial **transaction** keys (`finance.transactions.*`, `billing.transactions.*`) | Finance / cashier |
| Pastoral confidential (`pastoral.view_confidential`, `pastoral.notes.view_confidential`) | BB pastoral confidentiality |

Support mode is audited temporary portal access via `platform.support.*` only — it does not mint patient, finance-txn, or pastoral-confidential grants.

---

## 4. Code surfaces updated

| Surface | Change |
| --- | --- |
| `requirePlatformAdmin` (`platformAdminRoutes.js`) | Catalogue `platform_administrator` only (injectable for tests) |
| `evaluatePlatformAdminPermission` / fallthrough | Catalogue path; fallthrough always `false` |
| PA services (`Directory`, `Roles`, `Team`, `AccountRecovery`, `AccessHealth`, `PublicLinks`, `SupportMode`) | `assertPlatformCataloguePermission` — no `user_roles` fallback |
| `websiteGovernanceAccess.js` | Full PA via catalogue assignment |
| `releaseNotesService.userHasPlatformAdminRole` | Catalogue assignment |
| `platformSupportModeService.actorHasPlatformAdminRole` | Recognizes `platform_administrator` (session/context) |

---

## 5. Test matrix

| Case | Expected | Evidence |
| --- | --- | --- |
| Valid platform administrator | Allow `platform.*` | `authorizePlatformCataloguePermission` + `/admin` not 403 |
| Non-platform BB admin | Deny | No catalogue PA assignment → 403 / `PERMISSION_DENIED` |
| AC org admin | Deny | Same |
| Legacy `platform_admin` only | Deny | No `user_roles` consult on evaluate path |
| Direct route `/admin` | Deny without catalogue PA | Convergence route test |
| Support boundaries | `platform.support.*` ok; `patient.create` denied | Convergence support test |
| Fallthrough permanently off | Always false | `allowPlatformAdminPermissionFallthrough` |

**Commands:**

```bash
node --test tests/v2-02-platform-admin-rbac-convergence.test.js
node --test tests/v8-shared-rbac-tenant-isolation.test.js
```

---

## 6. Soak / ops notes (non-prod)

- Existing operators who only hold legacy `user_roles.platform_admin` **lose** `/admin` until they receive an active `platform_administrator` catalogue assignment (platform scope).
- Do **not** run physical catalogue relocate migrations on production as part of this task.
- Directory listing may still *display* legacy `user_roles` rows for support visibility; they are not authz grants for PA.

---

## 7. Production check

- **Not deployed.** No production migrate, seed, or config change.
