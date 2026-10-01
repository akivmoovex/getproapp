# V2.04 BlessBoard Church Provisioning Failure Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BB_CHURCH_PROVISIONING_FAILURE_AUDIT` |
| **Mode** | **CLOSED / FIXED** (2026-10-01) — identity propagation |
| **Request ID** | `fa8d80570e5a728cf1acaca6` |
| **applicationId** | `4224b1a5-692f-42d2-9d9a-cafb6b8b3d94` |
| **organizationKey** | `demo-c-2402` |
| **Authoritative log** | `provisioningStage=assign_administrator_roles` · `outcome=rollback` · `failureCategory=database_conflict` · `identityResolution=reuse` · `emailMatched=false` · `phoneMatched=true` · `postgresCode/constraint/table=null` · `underlyingErrorClass=OrchestratorError` |
| **Date** | 2026-10-01 |
| **Defect status** | **BB-PROVISION-01=CLOSED** |
| **Finish** | **`BB_PROVISION_IDENTITY_FIX_COMPLETE`** |

---

## 0. Executive diagnosis

This is **not** a lost PostgreSQL unique-violation mystery. The log’s null `postgresCode` / `constraint` / `table` match code that throws a **logical** `OrchestratorError(STATUS.DATABASE_CONFLICT, …)` when `assignBlessBoardRole` returns `ok: false` — **without attaching a PG `cause`**.

Given **`identityResolution=reuse` + `phoneMatched=true` + `emailMatched=false`**, the role assigner then looks up the administrator by **`application.contact_email`** (the new, unmatched email). That lookup fails (`user_not_found`) before any `INSERT` into `user_role_assignments`.

| Report field | Value |
|--------------|--------|
| **ROOT_OPERATION** | `assignBlessBoardRole` → `findUserByEmail(application.contact_email)` inside stage `assign_administrator_roles` |
| **SOURCE_PATH** | `src/blessboard/services/provisionRegisteredBlessBoardChurch.js` (reuse branch ~1246–1293) → `src/blessboard/services/assignBlessBoardRole.js` (~174–177) |
| **SQL/REPOSITORY_PATH** | `blessBoardAuthRepository.findUserByEmail` — **no role INSERT reached**; SQL for roles would have been `blessBoardRbacRepository.insertAssignment` → `blessboard.user_role_assignments` |
| **EXPECTED_BEHAVIOR** | Phone-matched reuse authorizes existing principal; role grants attach to **that user id** for the new org |
| **ACTUAL_BEHAVIOR** | Reuse selects existing user by phone; role assignment re-resolves user by **registration email** (unmatched) → failure wrapped as `database_conflict` → outer TX **rollback** |
| **LIKELY_CONFLICT** | **Email/user lookup miss on phone-only reuse** (misclassified as DB conflict). Secondary (less consistent with null PG fields on first failure): entitlement `ROLE_CONFLICT` or unique-recovery mapped to non-PG statuses |
| **CONSTRAINT_IF_IDENTIFIED** | **None involved** for the primary path. Unique index if insert were reached: `user_role_assignments_active_scope_uidx` on `blessboard.user_role_assignments` |
| **WHY_ERROR_METADATA_WAS_LOST** | Failure is `OrchestratorError` with identity diagnostics only; **no `cause` PG error**. Trace allowlist **drops `roleStatus`**. `assignBlessBoardRole` returns status strings without PG codes |
| **REPRO_TEST_EXISTS** | **YES** — `tests/v2-04-bb-church-provisioning-phone-reuse.test.js` (11/11 PASS after fix) |
| **PLATFORM_OR_BB_SPECIFIC** | Identity **match** rules are shared (`resolveRegistrationContactIdentity.js`); **role assign-by-email on reuse** is **BlessBoard-specific** in the provisioner + `assignBlessBoardRole` |

---

## 1. Code path (only the requested chain)

```
POST /register-church (apexMarketingRoutes.js)
  → validate + write draft / confirm
  → shared registration submit / orchestrator (platform/registration)
  → provisionRegisteredBlessBoardChurch / provision_registered_church
      TX open
      → resolveBlessBoardRegistrationAdministrator
           → matchRegistrationContactPrincipals (email + phone)
           → phone principal wins when emailMatched=false, phoneMatched=true
           → ACTION.REUSE (password verified / multi-org rules)
      → create org/church/branch/subscription… (earlier stages succeeded per incident)
      → assign_administrator_roles  ← FAIL HERE
           → assignBlessBoardRole({ email: application.contact_email || existingUser.email_normalized, … })
                → findUserByEmail(contact_email)  ← miss when emailMatched=false
                → return { ok:false, status: USER_NOT_FOUND, message: "user_not_found" }
           → throw OrchestratorError(DATABASE_CONFLICT, "user_not_found", { diagnostics: identity… })
      → catch → rollback → persist provisioning_failed
```

Entry for self-service reuse (not invitation):

```1246:1268:src/blessboard/services/provisionRegisteredBlessBoardChurch.js
      } else if (existingUser && (resumeExistingOrg || reuseExistingUserForNewOrg)) {
        ...
        provisioningStage = "assign_administrator_roles";
        const hqRole = await roleAssign.assignBlessBoardRole(
          client,
          {
            email: application.contact_email || existingUser.email_normalized,
            organizationKey,
            roleKey: "church_hq_admin",
            churchKey: organizationKey,
          },
          { manageTransaction: false }
        );
        if (!hqRole.ok) {
          throw new OrchestratorError(STATUS.DATABASE_CONFLICT, hqRole.message || hqRole.status, {
            diagnostics: {
              ...identityResolutionDiagnostics,
              roleStatus: hqRole.status,
            },
          });
        }
```

Role assigner (email-only user resolve):

```174:177:src/blessboard/services/assignBlessBoardRole.js
    const user = await repo.findUserByEmail(client, req.email);
    if (!user) {
      return abort({ ok: false, status: STATUS.USER_NOT_FOUND, message: "user_not_found", role: null });
    }
```

Identity match (shared): when email does not hit a principal but phone does, **`principal = phonePrincipal`**, diagnostics carry `emailMatched: false`, `phoneMatched: true` (`resolveRegistrationContactIdentity.js`).

---

## 2. Inspected areas (1–10)

### 1) Existing identity reused by phone

- Shared matcher: email principal **or** single phone principal; split email/phone → conflict.
- BB wrapper: `resolveBlessBoardRegistrationAdministrator.js` → `identityResolution: "reuse"` when password/auth rules pass (`phone_matched_reuse` / multi-org / orphan).
- Incident matches **phone-only match** (email not on that user).

### 2) Role assignment

- Catalogue assignments only via `assignBlessBoardRole` (comment: does **not** write legacy `blessboard.user_roles`).
- Self-service reuse assigns **`church_hq_admin`** then **`branch_admin`** (mapped to catalogue keys `organisation_administrator` / `branch_administrator`).
- Lookup key for assignment API is **email**, not `userId` — despite provisioner already holding `existingUser.id`.

### 3) Organization membership / admin

- “Membership” for staff here = active rows in **`blessboard.user_role_assignments`** scoped to org/church/branch.
- New org in same TX: no prior assignment for this org; conflict is **finding the user**, not duplicate org membership.

### 4) Product access assignment

- Not the failing stage in this log. Failure is explicitly **`assign_administrator_roles`** before later website/product stages.

### 5) Legacy BB roles vs platform RBAC

- Assign path: **catalogue `user_role_assignments` only** + legacy **input aliases** (`church_hq_admin` → catalogue).
- No evidence this incident hit a legacy `user_roles` write.

### 6) Unique indexes / constraints involved

| Object | Relevance |
|--------|-----------|
| `user_role_assignments_active_scope_uidx` | Would apply on INSERT; **not reached** if `user_not_found` |
| Scope CHECK / ownership trigger on `user_role_assignments` | Same — post-lookup |
| Users email uniqueness | Explains why `emailMatched=false` with a distinct contact email on a phone-matched user |

### 7) INSERT vs UPSERT / idempotency

- `insertAssignment`: plain **INSERT** (no `ON CONFLICT`).
- Pre-check: `listActiveAssignmentsForUser` → `ALREADY_ASSIGNED` if same role/scope.
- `runInsertWithUniqueRecovery`: on `23505` returns `{ ok:false, uniqueViolation:true }` then assigner maps to **`invalid_scope`** (strips PG metadata) — secondary loss path, not primary for this log.

### 8) Transaction error wrapping

- Any `!hqRole.ok` / `!branchRole.ok` → **`OrchestratorError(DATABASE_CONFLICT, hqRole.message, { diagnostics })`**.
- `USER_NOT_FOUND`, `ROLE_CONFLICT` (seat limits), `INVALID_SCOPE`, `TRANSACTION_ERROR` all become **`database_conflict`**.
- Outer catch: rollback + `failureCategory=database_conflict`; `extractProvisionErrorDiagnostics` finds **no PG fields** without `cause`.

### 9) Why postgresCode / constraint / table are null

1. No Postgres exception thrown on the primary path.  
2. `OrchestratorError` only merges PG fields from **`extra.cause`**.  
3. Diagnostics include `roleStatus`, but **`registrationTraceLog` ALLOWED_KEYS omits `roleStatus`** — so even `user_not_found` status is **not** in the public trace payload.  
4. `underlyingErrorClass=OrchestratorError` is consistent with a synthetic orchestrator failure, not a driver error.

### 10) Is retrying the same registration safe?

- Outer TX rolls back tenant writes for this attempt.  
- Catch path persists application as **`provisioning_failed`** (`retryable: true` for `database_conflict` in ERROR_META).  
- Re-entry requires **`allowRetry`**; without it → `retry_not_allowed`.  
- Retry of the **same** phone+different-email payload will **hit the same assign-by-email bug** until fixed.  
- Slug `demo-c-2402` should be free after rollback (unless a concurrent success consumed it).  
- **Not safe as a user workaround** for this identity shape; operator retry alone will not change email/phone mismatch behavior.

---

## 3. Test search (requested scenarios)

| Scenario | Evidence in tests | Verdict |
|----------|-------------------|---------|
| New user + new church | Instant-free / registration e2e happy paths | Covered in spirit |
| Existing user + new church (same email) | `blessboard-instant-free-registration.test.js` — “duplicate email that already administers another church reuses identity” | **YES** (email reuse) |
| Existing phone + **different** email | No BB provision test found matching this | **NO** |
| User already admin of another church | Same multi-org email reuse test | Partial (email, not phone-diff-email) |
| User already member of another church | Not as phone-diff-email provision role assign | **NO** for this failure mode |
| Duplicate administrator-role assignment | Assigner `ALREADY_ASSIGNED` + form-studio idempotent notes | Unit/helpers; not this incident |
| Retry after transaction rollback | Provisioning composability / review-matrix idempotent retry exist; not this phone/email role miss | **NO** for this bug |

**`REPRO_TEST_EXISTS=NO`** for the exact failing combination.

---

## 4. Incident binding

| Log field | Code meaning |
|-----------|----------------|
| `identityResolution=reuse` | `resolveBlessBoardRegistrationAdministrator` returned REUSE |
| `emailMatched=false` | Registration email did **not** resolve to that user |
| `phoneMatched=true` | Phone resolved to the reused user |
| `provisioningStage=assign_administrator_roles` | Fail on first/second `assignBlessBoardRole` in reuse branch |
| `failureCategory=database_conflict` | Blanket wrap of `!role.ok` |
| `postgresCode/constraint/table=null` | No PG exception / cause |
| Validation + auto-provision decided OK before | Consistent: identity reuse allowed; failure is **post-decision role attach** |

---

## 5. Fix scope (historical diagnosis)

| Layer | Role |
|-------|------|
| **BLESSBOARD** | Pass **`userId` / existing user’s email_normalized** into role assign on reuse; stop requiring unmatched `application.contact_email` for lookup |
| **PLATFORM** | Shared identity matcher already correct for phone reuse |
| **DATABASE** | No schema change required for primary cause |

---

## 6. Fix implementation (2026-10-01)

### ROOT_CAUSE_CONFIRMED

Phone-reuse provisioning called `assignBlessBoardRole` with the new unmatched `application.contact_email`, so `findUserByEmail` returned null (`user_not_found`) and the orchestrator mislabeled it `database_conflict` with no Postgres metadata.

### FIX (identity propagation)

1. **`assignBlessBoardRole`** accepts optional **`userId`** (preferred). When `userId` is present, **does not** fall back to email re-resolution.
2. Unique-scope race on insert → **idempotent `already_assigned`** when the active row exists; otherwise retain structured PG diagnostics (`postgresCode` / `constraint` / `table` / `schema`).
3. **`buildAdministratorRoleAssignInput`** always passes **`administratorUserId`**; when userId is known, email is canonical identity email only — never unmatched registration `contact_email`.
4. **`throwRoleAssignmentFailure` / `mapRoleAssignmentFailureStatus`**: `user_not_found` → `administrator_not_found` (**not** `database_conflict` unless PG `23*` conflict metadata exists). Diagnostics retained for internal traces; public messages stay generic.
5. Trace allowlist includes **`roleStatus`**.
6. AC untouched.

### TESTS

`tests/v2-04-bb-church-provisioning-phone-reuse.test.js`

| ID | Scenario | Result |
|----|----------|--------|
| A | Brand-new identity → new church | PASS |
| B/C | Phone match + different email → reuse, no duplicate user | PASS |
| D | Admin of Church A → admin of Church B; A roles untouched | PASS |
| E | Duplicate role assignment idempotent | PASS |
| F | Injected failure rolls back org data | PASS |
| G | `allowRetry` after rollback succeeds | PASS |
| H | Cross-tenant role isolation | PASS |
| I | Normal same-email registration unchanged | PASS |
| — | `buildAdministratorRoleAssignInput` prefers userId / omits unmatched email | PASS |
| — | `user_not_found` not mapped to `database_conflict`; no email fallback when userId set | PASS |

Focused run: **11/11 PASS**.

### RESULT

- Canonical `administratorUserId` propagates identity → org → membership → role assign.
- Existing phone-matched identity can administer a newly created church without duplicate accounts.
- Tenant isolation and RBAC catalogue assignments preserved.
- Transaction rollback + safe retry confirmed.
- New-identity and same-email registration paths unchanged.
- Failure classification corrected.

---

ROOT_CAUSE=Phone-reuse provisioning called assignBlessBoardRole with unmatched contact email → user_not_found mislabeled database_conflict.
ROOT_CAUSE_CONFIRMED=Phone-reuse role assign looked up by unmatched contact email instead of reused userId.
FIX=assignBlessBoardRole(userId-only-when-set)+buildAdministratorRoleAssignInput+mapRoleAssignmentFailureStatus
TESTS=tests/v2-04-bb-church-provisioning-phone-reuse.test.js 11/11 PASS
RESULT=FIXED
BB_PROVISION_01=CLOSED
FINAL=BB_PROVISION_IDENTITY_FIX_COMPLETE
