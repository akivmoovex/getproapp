# V2.02 Legacy RBAC Removal QA

**Task:** `V2_02_LEGACY_RBAC_REMOVAL`  
**Date:** 2026-09-26  
**Branch:** `V9`  
**Prerequisites:** PLATFORM_RBAC_FOUNDATION · BB_CATALOGUE_ONLY · PLATFORM_ADMIN_RBAC · AC_RBAC_ALIGNMENT  
**Production:** **DO NOT TOUCH**

---

## Verdict

### **`V2_02_LEGACY_RBAC_REMOVED`**

Runtime **authorization** no longer depends on `blessboard.user_roles`, `legacyCompatibilityPermissions` unions, or legacy role-name gates (`platform_admin` / `church_hq_admin` / `branch_admin`).

- Tenant access, catalogue login, permission authorize, last-HQ-admin guard, PA catalogue gate, AC linked-PA check → **catalogue only**
- `assignBlessBoardRole` → writes **`user_role_assignments`** (accepts legacy input aliases → maps to catalogue)
- `legacyCompatibilityPermissions.js` → **empty stub**
- Migration `116_freeze_legacy_user_roles.sql` → **blocks INSERT** into `user_roles` (table retained; not dropped)
- Static guard on auth surfaces: **ZERO** forbidden patterns

Production untouched.

---

## 1. Classification inventory (summary)

| Reference class | Action | Notes |
| --- | --- | --- |
| Authz: `listActiveAuthorizationRoles` → `user_roles` | **REMOVE** | Now reads `user_role_assignments` |
| Authz: `evaluateRoleGrants` legacy keys | **REMOVE** | Catalogue keys only; unknown/legacy keys ignored |
| Authz: `mapLegacyRolesToPermissionGrants` | **REMOVE** | Stub returns `[]` |
| Authz: PA / last-admin / AC linked PA via `user_roles` | **MIGRATE** → catalogue | Done |
| Invite / assign writers to `user_roles` | **MIGRATE** | `assignBlessBoardRole` catalogue-only; invite paths already catalogue |
| Seeds / fixtures still naming legacy keys as **input** | **TEST-FIXTURE** | Accepted as aliases; stored as catalogue |
| Directory / access-health SQL still **reading** `user_roles` for display/counts | **MIGRATE** (soak) | Not used for allow/deny; dual-read until display cutover |
| Testing reset DELETE on `user_roles` | **TEST-FIXTURE** | Allowed (INSERT frozen) |
| Historical docs / migrations `005`/`057` | **HISTORICAL-DOC** | Leave |
| Drop `user_roles` table | **Deferred** | Still referenced by display/reset; freeze only |

---

## 2. Authorization surfaces verified clean

| Module | Status |
| --- | --- |
| `blessBoardAuthorizationRepository.js` | Catalogue assignments |
| `authorizeBlessBoardTenantAccess.js` | Catalogue evaluate |
| `blessBoardRbacAuthorizationService.js` | No legacy union |
| `blessBoardLastAdminGuard.js` | Catalogue HQ roles only |
| `tenantLoginHelpers.js` | Catalogue post-login paths |
| `platformAdminAuthorization.js` / `sharedAuthzDecision.js` | No fallthrough |
| `websiteGovernanceAccess.js` | Catalogue PA |
| `activeClinicLoginEligibility.js` | Catalogue PA assignment |
| `legacyCompatibilityPermissions.js` | Empty stub |

**Test:** `tests/v2-02-legacy-rbac-removal.test.js` (+ prior V2.02 suites).

---

## 3. Table policy

```text
blessboard.user_roles
  → INSERT forbidden (trigger, migration 116)
  → UPDATE/DELETE allowed for soak / testing reset
  → DROP deferred until display/directory MIGRATE complete
```

---

## 4. Remaining non-auth references (explicit soak backlog)

These still **mention** legacy keys or **read** `user_roles` but do **not** gate authorization:

- Platform admin directory / access-health / account-recovery dual-read SQL  
- `staffAccessService` display unions  
- HQ role admin UI still listing legacy assignable labels (needs catalogue UI follow-up)  
- Audit metadata strings `source: "platform_admin"` (telemetry labels)  
- Website `actorRole` string aliases in some publish helpers (capability already permission-gated)

Tracked as **MIGRATE** for a follow-on display cutover — not blockers for this authorization removal verdict.

---

## 5. Commands

```bash
node --test tests/v2-02-legacy-rbac-removal.test.js
node --test tests/v2-02-bb-catalogue-only-rbac.test.js
node --test tests/v2-02-platform-admin-rbac-convergence.test.js
```

---

## 6. Production

- **Not deployed.** No production migrate/seed/config change.
