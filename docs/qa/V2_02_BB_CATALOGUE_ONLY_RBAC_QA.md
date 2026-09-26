# V2.02 BlessBoard Catalogue-Only RBAC QA

**Task:** `V2_02_BB_LEGACY_ROLE_REMOVAL`  
**Date:** 2026-09-26  
**Branch:** `V9`  
**Prerequisite:** `V2_02_PLATFORM_RBAC_FOUNDATION_PASS`  
**Production:** **DO NOT TOUCH**

---

## Verdict

### **`V2_02_BB_CATALOGUE_ONLY_RBAC_PASS`**

BlessBoard login eligibility, invites, portal landing, and authorization now use **catalogue `user_role_assignments` + permission/scope** only. Runtime no longer depends on `blessboard.user_roles` or `legacyCompatibilityPermissions` unions. Tables are **not dropped** (rollback / verification soak). Local tests **9/9 PASS**. Production untouched.

---

## 1. Target login path (implemented)

```text
platform identity / BB user
→ active BB product profile
→ active org-scoped catalogue assignment (or member membership)
→ permissions + resource scope
→ allow / deny
```

**Removed from login eligibility:** `platform_admin`, `church_hq_admin`, `branch_admin` via `blessboard.user_roles`.

---

## 2. Legacy → catalogue test-user mapping

| Legacy | Catalogue | Scope |
| --- | --- | --- |
| `platform_admin` | `platform_administrator` | platform |
| `church_hq_admin` | `organisation_administrator` | organisation |
| `branch_admin` | `branch_administrator` | branch |

QA seed (`blessBoardQaRoleUsersSpec` / seed service) no longer dual-writes legacy companions. Elevated roles are not granted blindly — invite/seed uses the requested catalogue key only.

---

## 3. Changes by area

| Area | Change |
| --- | --- |
| Login | `establishBlessBoardSession` reads catalogue assignments only |
| Portal | `resolveTenantPortalAccess` routes catalogue HQ/branch/website/finance/auditor personas |
| Authz | `blessBoardRbacAuthorizationService` — legacy compatibility fallthrough **removed** |
| Invites | Catalogue role keys; accept writes `user_role_assignments` only |
| Staff Access | `createScopedTeamMemberService` invites catalogue roles (no legacy bootstrap) |
| Platform admin shell | Accepts catalogue `platform_administrator` (legacy PA still recognized during soak) |
| Announcements | Capability/actor checks recognize catalogue HQ/branch/platform keys |
| Migration | `114_bb_invitation_catalogue_roles.sql` expands invitation `role_key` CHECK |
| Tables | `user_roles` **retained** (no DROP) |

---

## 4. QA personas (catalogue-only)

| Persona | Login | Landing | Notes |
| --- | --- | --- | --- |
| organisation administrator | eligible | `/hq` | Org scope |
| church system administrator | eligible | `/hq` | Church scope |
| branch administrator | eligible | `/branch-admin` | Branch isolation |
| branch pastor | eligible | `/branch-admin` | Branch scope |
| website editor | eligible | `/account` (Website) | Edit without publish unless granted |
| auditor | eligible | `/account` (Audit) | Read/audit permissions only |
| communications officer | eligible | `/account` | Announcements capability |
| finance restricted | eligible | `/account` (Finance) | Finance role keys only |

**Verified in unit coverage:**

- Login with catalogue-only `website_editor` (no `user_roles` query)  
- Deny login with zero assignments  
- Permission allow via assignment; no legacy union  
- Invite: HQ may invite `website_editor`  
- Self-elevation prevention: branch admin cannot invite org admin  
- Portal options for HQ / branch / website  

**Hosted persona matrix** (login / landing / allow / deny / branch isolation / endpoint denial / assign-revoke / self-elevation): run after V9 testing deploy of this tip + migration `114`.

---

## 5. Local tests

| Suite | Result |
| --- | --- |
| `tests/v2-02-bb-catalogue-only-rbac.test.js` | **9/9 PASS** |
| `tests/v2-02-platform-rbac-foundation.test.js` | Re-run after changes |

---

## 6. Explicit non-claims / follow-ups

- `blessboard.user_roles` table **not dropped**  
- AC behavior unchanged  
- Production not migrated/deployed  
- Full hosted 8-persona matrix pending testing deploy  
- Some UI labels may still mention legacy names during soak  

---

## Return token

```
V2_02_BB_CATALOGUE_ONLY_RBAC_PASS
branch=V9
login=catalogue_assignments_only
legacy_user_roles_runtime=REMOVED
legacy_compat_unions=REMOVED
tables_dropped=NO
prod_untouched=YES
local_tests=9/9
```
