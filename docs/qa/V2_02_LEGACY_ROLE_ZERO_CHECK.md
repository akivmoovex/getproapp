# V2.02 Legacy Role Zero Check

**Task:** `V2_02_LEGACY_ROLE_ZERO_CHECK`  
**Date:** 2026-09-26T12:06:35Z  
**Branch:** `V9`  
**HEAD:** `fd2d6f8abf98d063ef0d0e25182130d1b7f193b2`  
**Production:** **DO NOT TOUCH**

**Scan:** 4952 files · 684 files with ≥1 legacy token · evidence `/tmp/v202-legacy-zero/`

---

## Verdict

### **`V2_02_LEGACY_ROLE_RUNTIME_ZERO`**

There is **zero active runtime authorization dependency** on legacy BlessBoard roles (`platform_admin` / `church_hq_admin` / `branch_admin` via `blessboard.user_roles` or compatibility permission bundles) for:

- BB login / session eligibility  
- BB permission authorize  
- Platform admin shell entry  
- AC staff permission middleware  

Historical migrations, tests, docs, display dual-reads, labels, and frozen legacy writer helpers may still **mention** legacy keys. Those are classified below and **do not** gate allow/deny on the auth decision path.

Static auth-surface guard + path verify: **23/23 PASS** (`v2-02-legacy-rbac-removal`, `v2-02-bb-catalogue-only-rbac`, `v2-02-platform-admin-rbac-convergence`).

---

## Searched tokens

| Token / theme | Sought |
| --- | --- |
| `blessboard.user_roles` | Table reads/writes |
| `platform_admin` (not `platform_administrator`) | Legacy PA key |
| `church_hq_admin` | Legacy HQ key |
| `branch_admin` | Legacy branch key |
| `legacyCompatibilityPermissions` | Compat grant module |
| Legacy login authorization | Session eligibility via `user_roles` |
| Role-name route authorization | `roleKey === '…'` gates on HTTP auth |

Duplicate `* 2.*` copies excluded from counts.

---

## Classification summary

| Class | File count (any token) | Meaning |
| --- | --- | --- |
| **RUNTIME** | 254 | Live `src/` / `views/` / ops `scripts/` / `db/scripts` mentioning tokens |
| **MIGRATION_HISTORY** | 8 | `db/migrations` / seeds creating or freezing legacy schema |
| **TEST_HISTORY** | 276 | `tests/` + local QA scripts |
| **DOC_ONLY** | 146 | `docs/` QA/plan prose |

### RUNTIME sub-split (authorization relevance)

| Subclass | Count | Authorization dependency? |
| --- | --- | --- |
| **AUTH_DECISION surfaces** (login, authorize, PA catalogue gate, AC permission MW, invite accept→URA) | **0** legacy allow/deny | **NONE — PASS** |
| Dual-read / display / support listing (`FROM user_roles` after catalogue gate) | ~12 product files | No — list/membership UX soak |
| Legacy writer helpers (`blessBoardAuthRepository.insertRole`, `hqRoleManagementService`) | 2 | INSERT **frozen** by migration `116`; not live grant path |
| UI/views still showing legacy key labels | 4+ | Labels / forms soak |
| Tooling / seed / v4→v5 / reset | ~14 | Non-request-path ops |
| String alias / `actorRole` telemetry / comments | ~219 | Non-auth |

---

## AUTH_DECISION surfaces (must be clean)

| Module | Legacy `user_roles` / role-name gate | Actual authority |
| --- | --- | --- |
| `blessBoardAuthorizationRepository.js` | No `FROM user_roles` | `user_role_assignments` |
| `authorizeBlessBoardTenantAccess.js` | Catalogue keys only | URA roles |
| `blessBoardRbacAuthorizationService.js` | Compat union **removed** | Catalogue permissions |
| `establishBlessBoardSession.js` | Explicit: no `user_roles` | Catalogue (+ member) |
| `inviteBlessBoardStaff.js` | No `INSERT user_roles` | Catalogue invite + URA on accept |
| `assignBlessBoardRole.js` | Catalogue write only | URA |
| `platformAdminAuthorization.js` | No `user_roles` | `platform_administrator` URA |
| `platformAdminRoutes.requirePlatformAdmin` | Catalogue assignment check | `hasActivePlatformAdministratorAssignment` |
| `activeClinicPermissionMiddleware.js` | Role-name allowlists forbidden | `authorizeStaffPermission` |
| `activeClinicLoginEligibility.js` | Linked PA via catalogue helper | `hasActivePlatformAdministratorAssignment` |
| `legacyCompatibilityPermissions.js` | **Empty stub** | Returns `[]` |

`platformAdminRoutes.js` still contains `FROM blessboard.user_roles` in **org staff list / password-reset membership** queries. Those run **after** catalogue `requirePlatformAdmin` and do **not** grant `/admin` access. Classified **RUNTIME dual-read soak**, not AUTH_DECISION.

---

## Required path verification

| Requirement | Result | Evidence |
| --- | --- | --- |
| BB invite uses catalogue roles | **PASS** | `inviteBlessBoardStaff` normalizes to catalogue keys; accept writes URA only; migration `114` CHECK includes catalogue keys |
| BB login uses membership + catalogue assignment | **PASS** | `establishBlessBoardSession` + `blessBoardCatalogueLogin.listCatalogueLoginRolesForUser` |
| Platform admin uses platform catalogue permissions | **PASS** | `requirePlatformAdmin` → `hasActivePlatformAdministratorAssignment`; ops via `assertPlatformCataloguePermission` / `platform.*` |
| AC catalogue / permission based | **PASS** | `staff_role_assignments` → shared catalogue; middleware permission keys only |

Legacy input **aliases** (`church_hq_admin` → `organisation_administrator`) may still be accepted at invite/assign **input** boundaries and immediately mapped to catalogue keys. That is not legacy authorization.

---

## Notable remaining RUNTIME mentions (non-auth soak)

| Area | Examples | Class |
| --- | --- | --- |
| PA org staff dual-read | `platformAdminRoutes.js` staff list / reset membership | RUNTIME dual-read |
| Directory / access-health / recovery | `platformAdminDirectoryService.js`, `…AccessHealth…`, `…AccountRecovery…` | RUNTIME dual-read |
| Staff access UI listing | `staffAccessService.js` (`permissionsForLegacyRoleKey` → stub `[]`) | RUNTIME dual-read + stub |
| HQ role management (legacy writer) | `hqRoleManagementService.js`, `blessBoardAuthRepository.js` | RUNTIME helper; INSERT frozen |
| Chrome / actor labels | `attachWebsiteAdminChrome.js`, shell locals, `actorRole: "church_hq_admin"` | RUNTIME label |
| Seeds / fixtures | `seedBlessBoardTestUsers.js`, QA seed services | Tooling (prefer catalogue; may still mention legacy) |

**Do not drop `user_roles` until these dual-reads are migrated.**

---

## MIGRATION_HISTORY (allowed)

Includes (non-exhaustive): `005_create_user_roles.sql`, `116_freeze_legacy_user_roles.sql`, `117_backfill_catalogue_assignments_from_user_roles.sql`, invitation CHECK migrations retaining legacy invite keys for in-flight rows.

---

## TEST_HISTORY / DOC_ONLY (allowed)

Large volumes of fixtures, regression assertions, and QA docs intentionally name legacy keys (aliases, denial cases, history). Not request-path authorization.

---

## Unit evidence

```text
node --test \
  tests/v2-02-legacy-rbac-removal.test.js \
  tests/v2-02-bb-catalogue-only-rbac.test.js \
  tests/v2-02-platform-admin-rbac-convergence.test.js
→ 23/23 PASS
```

Path-verify flags (`/tmp/v202-legacy-zero/path-verify.json`): all `true`.

---

## Return token

```
V2_02_LEGACY_ROLE_RUNTIME_ZERO
branch=V9
auth_decision_legacy_dependency=0
runtime_mentions=254_classified_non_auth_or_soak
invite=catalogue
login=catalogue+membership
platform_admin=catalogue_permissions
ac=catalogue_permission_middleware
user_roles_table_dropped=NO
prod_untouched=YES
```
