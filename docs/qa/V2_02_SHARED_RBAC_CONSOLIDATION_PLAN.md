# V2.02 Shared RBAC Consolidation Plan

**Task:** `V2_02_SHARED_RBAC_CONSOLIDATION_AUDIT`  
**Date:** 2026-09-26  
**Branch:** `V9` (`b186991d7db5` tip at audit start)  
**Mode:** **AUDIT ONLY — no implementation**  
**Production:** **DO NOT TOUCH**

---

## Verdict

### **`V2_02_SHARED_RBAC_READY_TO_IMPLEMENT`**

Current RBAC is a documented dual-system coexistence, not a finished shared architecture. Target model, legacy→catalogue mapping, migration order, and rollback are clear enough for a sequenced V9 implementation. **Do not implement in this task.**

Incorporated product decision (**V8-002**):

> `activeclinic.patient.create` may be granted **only** to approved **clinical / reception / manager** role families.  
> Organization / network admin roles must **not** inherit `patient.create` by default.

---

## Target architecture (scalable shared RBAC)

```text
PLATFORM (auth + catalogue + primitives)
  platform.identities
  platform.organizations (+ products)
  platform.roles                  ← long-term home of catalogue roles
  platform.permissions
  platform.role_permissions
  platform.authorization primitives (decision helpers, scope asserts)
  platform.rbac_audit             ← assignment + authz decision audit

BLESSBOARD (product profile + assignments + scopes)
  blessboard profile (users / identity_product_profiles → blessboard_user)
  blessboard.user_role_assignments → platform.roles (today: blessboard.roles)
  BB scopes: organisation | church | branch | …

ACTIVECLINIC (product profile + assignments + scopes)
  staff profile (activeclinic.staff_members)
  activeclinic.staff_role_assignments → platform.roles (today: blessboard.roles)
  AC scopes: organisation | facility
```

### Long-term removals

| Remove | Why |
| --- | --- |
| `blessboard.user_roles` as login/session authority | Blocks catalogue-only staff (V8-003) |
| Legacy `platform_admin` role-name shell gate | Role-name auth; replace with catalogue `platform_administrator` + permission keys |
| Runtime legacy compatibility permission bundles | `legacyCompatibilityPermissions.js` invents grants without assignment rows |
| Role-name allowlists in product/middleware paths | Opaque, product-divergent, hard to audit |

### What stays product-owned

- BB / AC **assignment tables** and **scopes** (employment ≠ identity).  
- Product evaluators (permission resolution + resource context).  
- Commercial entitlements (orthogonal to RBAC).

---

## Current state (factual snapshot)

### Dual BlessBoard RBAC

| Layer | Table / code | Role today |
| --- | --- | --- |
| Legacy login | `blessboard.user_roles` (`platform_admin`, `church_hq_admin`, `branch_admin`) | **Session eligibility** |
| Catalogue | `blessboard.roles` / `permissions` / `role_permissions` | Shared BB + AC keys |
| Modern assignments | `blessboard.user_role_assignments` (+ events) | Action auth (preferred) |
| Compat fallthrough | `src/blessboard/rbac/legacyCompatibilityPermissions.js` | Runtime bundles from legacy roles |
| Evaluator | `blessBoardRbacAuthorizationService.js` | Catalogue first, then legacy bundles |

### ActiveClinic

| Layer | Location |
| --- | --- |
| Auth principal | `platform.identities` |
| Authz subject | `activeclinic.staff_members` |
| Assignments | `activeclinic.staff_role_assignments` → `blessboard.roles` |
| Middleware | Permission keys only (`activeClinicPermissionMiddleware.js`) |

### Platform shared layer (already present, incomplete)

| Module | Purpose |
| --- | --- |
| `src/platform/rbac/sharedTenantScope.js` | Forged ID rejection, tenant asserts |
| `src/platform/rbac/sharedAuthzDecision.js` | Normalized decisions; PA fallthrough policy |
| `src/platform/rbac/sharedRbacFacade.js` | Dispatch to BB/AC — **does not merge catalogues** |

Policy: `docs/security/V8_SHARED_RBAC_TENANT_ISOLATION.md`, `docs/activeclinic/ACTIVECLINIC_RBAC_PRINCIPAL_DECISION.md`.

**There is no `platform.roles` / `platform.permissions` yet.** Catalogue lives in `blessboard.*` and already hosts AC roles (`role_category = 'activeclinic'`).

---

## Answers (required)

### 1. Exact legacy dependencies

| Dependency | Where | Effect if removed naively |
| --- | --- | --- |
| **`blessboard.user_roles` login** | `listActiveRolesForUser` → `establishBlessBoardSession.js` | Staff with only catalogue roles → `NO_ACTIVE_ROLE` (V8-003) |
| **Prefer legacy session role** | `preferSessionRole()` HQ → branch → platform | Session chrome / actor labels wrong |
| **`platform_admin` shell gate** | `platformAdminRoutes.requirePlatformAdmin`, release-notes internal upgrade, account recovery | Apex admin shell / recovery / internal RNC blocked |
| **Legacy compat permission bundles** | `mapLegacyRolesToPermissionGrants` in BB authorize path | HQ/branch admins lose many permissions until catalogue assignments exist |
| **Role-name checks** | Invites (`inviteBlessBoardStaff`), announcements actor, website governance, last-admin guard, entitlements filters, RNC `platform_admin` session | Broken invite/governance/admin paths |
| **QA / seed dual-write** | `blessBoardQaRoleUsersSpec.js`, `seedBlessBoardTestUsers.js`, team invite services | Test users cannot log in |
| **PA permission fallthrough** | `evaluatePlatformAdminPermission` (disabled on V8 by default) | V8 already least-privilege; V7 still depends on fallthrough |

AC login does **not** depend on `blessboard.user_roles`; AC already uses staff assignments + permission keys.

---

### 2. Legacy → catalogue role mapping

| Legacy `user_roles.role_key` | Catalogue `roles.role_key` | Default assignment scope | Notes |
| --- | --- | --- | --- |
| `platform_admin` | `platform_administrator` | platform / global | Sensitive; shell entry must move to catalogue + `platform.*` permissions |
| `church_hq_admin` | `organisation_administrator` **and/or** `church_system_administrator` | organisation / church | Dual map: org-wide vs church HQ ops; migrate existing rows by current org/church columns |
| `branch_admin` | `branch_administrator` | branch | `branch_pastor` is separate catalogue role (pastoral), not a rename of legacy branch_admin |

**Invite / QA baseline today** (`blessBoardQaRoleUsersSpec.js`):

| Catalogue category / key | Legacy login baseline used today |
| --- | --- |
| `organisation_administrator`, `church_system_administrator`, most church-scoped roles | `church_hq_admin` |
| `branch_administrator`, `branch_pastor`, branch category | `branch_admin` |
| `platform_administrator` | `platform_admin` (catalogue alone never logs in) |

AC has **no legacy `user_roles` twin**. Compat alias only:

| Compat role | Canonical |
| --- | --- |
| `activeclinic_network_admin` | Treat as mirror of `activeclinic_organization_admin` (migration 088) |

---

### 3. Which RBAC components should live in platform schema

| Component | Target home | Near-term (wave 1–2) |
| --- | --- | --- |
| Identities | `platform.identities` | **Already** |
| Organizations / products | `platform.organizations`, `organization_products` | **Already** |
| Roles / permissions / role_permissions | `platform.*` long-term | **Keep in `blessboard.*` until cutover** (already shared by AC) |
| Authorization primitives | `src/platform/rbac/*` | Expand facade; no product secret logic |
| RBAC audit (assignment + decisions) | `platform.rbac_audit` (new) long-term | Keep BB assignment events + add shared write API |
| BB profile | BlessBoard user + `identity_product_profiles` | Stay product |
| BB assignments / scopes | BlessBoard tables | Stay product; FK to catalogue |
| AC staff profile | `activeclinic.staff_members` | Stay product |
| AC assignments / scopes | `activeclinic.staff_role_assignments` | Stay product; FK to catalogue |

**Do not** put BB church/branch or AC facility employment rows into platform. Platform owns **who can authenticate** and **what the catalogue means**; products own **who is employed where**.

---

### 4. Should roles/permissions physically migrate now?

**No — not in the first implementation wave.**

Reasons:

1. Catalogue already **physically shared** (`blessboard.roles` hosts AC). Moving tables is rename/FK churn without login gains.  
2. Login conversion (V8-003) and PA conversion unblock product; schema relocate does not.  
3. Risk: every AC/BB migration FK, seed, and test references `blessboard.roles` / `permissions`.  
4. Ordered later: after legacy login removal + dual-write freeze, add `platform.roles` (or views) and cut FKs in a dedicated migration packet.

**Wave guidance:** treat catalogue location as **Phase D (optional relocate)** after Phases A–C pass QA.

---

### 5. BlessBoard login conversion plan (V8-003)

**Goal:** Catalogue-only assignments (`website_editor`, `website_publisher`, finance, ministry, …) can establish a session without a companion `user_roles` row.

**Phased approach:**

1. **Eligibility rewrite**  
   - Session eligible if **any** of:  
     - active catalogue `user_role_assignments` in org/church/branch scope, **or**  
     - active member scope (existing), **or**  
     - (temporary) active legacy `user_roles`.  
2. **Dual-write freeze window**  
   - Invites / HQ staff access / seeds write **catalogue assignments as source of truth**.  
   - Continue writing legacy rows only as compatibility until cutover flag.  
3. **Backfill**  
   - For every active `user_roles` row, ensure matching catalogue assignment via mapping §2 (`origin = migration`).  
4. **Feature flag** `BB_LOGIN_CATALOGUE_ELIGIBLE=1` on V9 testing.  
5. **Cutover**  
   - Stop requiring legacy for session; prefer catalogue role for session label.  
6. **Deprecate**  
   - Stop writing new `user_roles`; retain read-only for rollback period.  
7. **Remove**  
   - Drop legacy CHECK dependency from login code; later drop table after soak.

**Acceptance:** website_editor-only user logs in on testing; publish still permission-gated (BB-BUG-001 preserved); no production touch until testing PASS.

---

### 6. Platform admin conversion plan

**Goal:** Apex admin shell and fine-grained ops use `platform_administrator` + `platform.*` permissions — not `role_key === 'platform_admin'`.

**Steps:**

1. Ensure every active legacy `platform_admin` has catalogue `platform_administrator` assignment (backfill).  
2. Replace `requirePlatformAdmin` role-name check with:  
   - active catalogue assignment **or** (temp) legacy role, behind flag.  
3. Keep V8 default: **no** legacy permission fallthrough (`PLATFORM_ADMIN_PERMISSION_FALLTHROUGH=0`).  
4. Update release-notes internal access, account recovery, directory, support-mode entry to catalogue permission keys.  
5. After soak: deny legacy-only PA; remove role-name gates.

**Do not** grant pastoral/finance transaction keys to PA (existing intentional denials in `legacyCompatibilityPermissions.js` must be preserved in catalogue maps).

---

### 7. Testing-user migration

| Source | Action |
| --- | --- |
| `seedBlessBoardTestUsers.js` | Seed catalogue assignments + (temp) legacy until login cutover |
| `blessBoardQaRoleUsersSpec.js` | Invert rule: catalogue is primary; legacy optional under flag |
| `rbacE2eFixtureService.js` | Fixtures assign catalogue roles; assert session without legacy when flag on |
| AC disposable QA users | Unchanged principal model; verify `patient.create` matrix vs § V8-002 |
| Hosted QA accounts docs | Document dual-role pattern for org_admin + receptionist where registration needed |

---

### 8. ActiveClinic compatibility impact

| Area | Impact |
| --- | --- |
| Login / staff assignments | **Low** — already catalogue + permission middleware |
| Shared `blessboard.roles` FK | **Medium** if/when catalogue relocates to `platform.roles` (Phase D) |
| Facade expansion | **Low** — keep `authorizeActiveClinic` dispatch |
| **V8-002 `patient.create`** | **Owner decision implemented in V2.02** — reception / clinical-records / clinic+org management; **no** facility_admin / finance / website auto-grant |
| Network admin alias | Keep mirrored permissions with org_admin (including `patient.create`); website publish remains org_admin-only |

#### V8-002 — approved grant families (product decision — **V2.02 owner update**)

`activeclinic.patient.create` **may** be held by:

| Family | Canonical role keys (current catalogue) | Status |
| --- | --- | --- |
| **Reception** | `activeclinic_receptionist` | Has create |
| **Clinical / records** | `activeclinic_medical_records_officer` | Has create; nurse/clinician keep **view** (+ quick_register) **without** create |
| **Clinic / organization management** | `activeclinic_clinic_manager`, `activeclinic_organization_admin`, `activeclinic_network_admin` (compat mirror) | Has create (migration `115`) |

**Must not** receive `patient.create` by default:

- `activeclinic_facility_admin` (facility config/admin — not registration family)
- Finance / pharmacy / diagnostics / auditor / website_editor / bare `activeclinic_staff`
- Nurse / clinician (view without create)

**Routes** authorize via `activeclinic.patient.create` + org/facility scope only — **no role-name allowlists**.  
See `docs/qa/V2_02_AC_RBAC_ALIGNMENT_QA.md`.

---

### 9. Migration ordering

| Phase | Name | Implement? | Depends on |
| --- | --- | --- | --- |
| **0** | This audit + owner ack of V8-002 families | Done (audit) | — |
| **A** | BB catalogue backfill from `user_roles` + invite dual-write hardening | Later | 0 |
| **B** | BB login eligibility via catalogue (flagged) + QA user seed flip | Later | A |
| **C** | Platform admin catalogue gate (flagged) + remove role-name shell | Later | A |
| **D** | Disable legacy compat bundles when assignments complete; freeze `user_roles` writes | Later | B+C soak |
| **E** | Drop legacy login dependency; archival of `user_roles` | Later | D |
| **F** | Optional physical relocate catalogue → `platform.roles/permissions` | Later / optional | E |
| **G** | Shared `platform.rbac_audit` unification | Later | C–E |

**Never** start F before B/C PASS on V9 testing.  
**Never** deploy phases to production in this audit window.

SQL sketch (future, not applied now):

1. Backfill assignments (idempotent INSERT…SELECT).  
2. Feature flags in env / deployment profile.  
3. Only after soak: stop inserts to `user_roles`; eventually DROP or rename to `_legacy`.

---

### 10. Rollback plan

| Phase | Rollback |
| --- | --- |
| A backfill | Leave rows (`origin=migration`); harmless if login still legacy |
| B login flag | Set `BB_LOGIN_CATALOGUE_ELIGIBLE=0`; legacy path restored |
| C PA flag | Re-enable legacy `requirePlatformAdmin` role check |
| Compat disable | Re-enable `mapLegacyRolesToPermissionGrants` |
| Catalogue relocate (F) | Keep `blessboard.*` tables as source until FK cutover complete; dual-read views if needed |
| Data | No destructive DELETE of `user_roles` until E soak ≥ N days on testing |

**Production rollback:** do not promote any phase until V9 testing matrices green; production remains on current RC.

---

### 11. Files / tests affected (implementation later)

#### Core services / HTTP

- `src/blessboard/services/establishBlessBoardSession.js`  
- `src/blessboard/repositories/blessBoardAuthRepository.js`  
- `src/blessboard/services/blessBoardRbacAuthorizationService.js`  
- `src/blessboard/rbac/legacyCompatibilityPermissions.js`  
- `src/blessboard/services/inviteBlessBoardStaff.js`  
- `src/blessboard/services/blessBoardRoleAssignmentService.js`  
- `src/blessboard/services/hqRoleManagementService.js`  
- `src/blessboard/services/assignBlessBoardRole.js`  
- `src/blessboard/services/blessBoardQaRoleUsersSpec.js`  
- `src/blessboard/services/seedBlessBoardTestUsers.js`  
- `src/blessboard/services/rbacE2eFixtureService.js`  
- `src/blessboard/http/hqStaffAccessRoutes.js`  
- `src/platform/http/platformAdminRoutes.js`  
- `src/platform/rbac/sharedAuthzDecision.js`  
- `src/platform/rbac/sharedRbacFacade.js`  
- `src/platform/services/createScopedTeamMemberService.js`  
- `src/platform/services/platformAdminAccountRecoveryService.js`  
- `src/platform/release-notes/releaseNotesService.js` (PA session upgrade)  
- `src/activeclinic/services/activeClinicAuthorizationService.js` (matrix/docs only for V8-002)  
- Role-name call sites: announcements, website governance, last-admin guard, entitlements

#### Migrations (future)

- New blessboard/platform migrations for backfill + flags — **not authored in this audit**  
- Touch points: `005_create_user_roles.sql`, `057`–`059`, AC `006_staff_role_assignments.sql`, identity `020`/`021`

#### Tests (re-run / extend)

- `tests/v8-shared-rbac-tenant-isolation.test.js`  
- `tests/blessboard-rbac-foundation.test.js`  
- `tests/blessboard-rbac-e2e.test.js`  
- `tests/v7-website-rbac.test.js`  
- `tests/activeclinic-rbac-role-matrix.test.js` (**V8-002 family assertions**)  
- `tests/activeclinic-staff-rbac-foundation.test.js`  
- `tests/activeclinic-patient-registration-rbac.test.js`  
- `tests/helpers/authzNegativeHelpers.js`  
- Platform admin / release-notes session tests  
- Hosted: BB catalogue-only login; PA shell; AC patient.create negative for org_admin

#### Docs to update on implement

- `docs/security/V8_SHARED_RBAC_TENANT_ISOLATION.md`  
- `docs/releases/V8_BACKLOG.md` (close V8-002 / V8-003 when done)  
- `docs/qa/V2_01_V8_002_V8_003_POLICY_DECISION.md` (mark V8-002 decided)  
- Foundational AC permission matrix  
- Release notes architecture section (after QA PASS — currently “under development”)

---

## Recommended implementation waves (summary)

1. **Backfill + dual-write** (no login behavior change).  
2. **BB catalogue login** behind flag on V9 testing.  
3. **Platform admin catalogue gate** behind flag.  
4. **Disable legacy compat + freeze `user_roles` writes**.  
5. **Remove legacy login dependency**.  
6. **Optional** catalogue relocate to `platform.*` + shared audit table.  
7. **V8-002 docs/tests alignment** with clinical/reception/clinic+org management families (see V2_02_AC_RBAC_ALIGNMENT).

---

## Non-goals (this audit / early waves)

- Merging BB and AC into one assignment table.  
- Using naked `platform.identities` as RBAC subject for clinic employment.  
- Changing `patient.create` families without an owner decision + catalogue migration (current: V2.02 alignment).  
- Production deploy or migration apply from this task.  
- Claiming shared RBAC consolidation complete before dedicated QA PASS.

---

## Evidence index

| Topic | Path |
| --- | --- |
| Legacy login | `establishBlessBoardSession.js`, `blessBoardAuthRepository.js` |
| Compat bundles | `legacyCompatibilityPermissions.js` |
| BB authorize order | `blessBoardRbacAuthorizationService.js` |
| Shared facade | `src/platform/rbac/*`, `docs/security/V8_SHARED_RBAC_TENANT_ISOLATION.md` |
| AC principal | `docs/activeclinic/ACTIVECLINIC_RBAC_PRINCIPAL_DECISION.md` |
| AC create grants | migrations `088`, `091`, `092`; `tests/activeclinic-rbac-role-matrix.test.js` |
| V8-002/003 policy pack | `docs/qa/V2_01_V8_002_V8_003_POLICY_DECISION.md`, `docs/releases/V8_BACKLOG.md` |
| Catalogue seed | `db/migrations/blessboard/057_create_rbac_permissions_roles.sql` |
| QA dual baseline | `blessBoardQaRoleUsersSpec.js` |

---

## Return token

```
V2_02_SHARED_RBAC_READY_TO_IMPLEMENT
branch=V9
mode=audit_only
prod_untouched=YES
v8_002=patient.create_reception_clinical_manager_families_only
physical_catalogue_migrate_now=NO
bb_login=phased_catalogue_eligibility
platform_admin=catalogue_gate_phased
```
