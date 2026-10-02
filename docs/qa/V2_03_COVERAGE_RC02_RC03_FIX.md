# V2.03 Coverage Remediation — RC02 + RC03 Fix

**Status:** `V2_03_RC02_RC03_FIX_PASS`  
**Date:** 2026-09-28  
**Worktree:** `getpro-v202-cov-audit`  
**Inputs:** `docs/qa/V2_03_FULL_COVERAGE_FAILURE_TRIAGE.md`, `docs/qa/V2_03_COVERAGE_RC01_FIX.md`  
**RC01:** `V2_03_RC01_FIX_PASS` (114 eliminated)

## Constraints honored

- Did **not** fix RC10 CSS fingerprints, redirects, Content/Image Library wording
- Did **not** weaken RBAC, broaden permissions, or grant super-admin
- Did **not** bypass authorization middleware
- Did **not** modify production
- Did **not** rerun the full 855-file suite
- Application RBAC code **unchanged**

---

## 1. Exact failure inventory

```text
RC02_FAILURES=12
RC03_FAILURES=11
```

### RC02 — `user_role_assignments_revoked_consistency`

| Field | Value |
|--|--|
| FAILED_TEST_FILES | `tests/blessboard-branch-admin-shell.test.js` (all 12) |
| FAILURE_SIGNATURE | `Local PostgreSQL unavailable: … violates check constraint "user_role_assignments_revoked_consistency"` |
| ROLE_EXPECTED | Suspended actor: prior `branch_admin` then **revoked** |
| ROLE_ACTUALLY_CREATED/ASSIGNED | Setup crashed on revoke SQL → entire `before()` failed |
| PERMISSION_EXPECTED | N/A (suite never reached HTTP assertions) |
| HTTP_STATUS | N/A (setup failure) |

**Trace:**

```text
before()
  → assignBlessBoardRole(... branch_admin ...)  // OK
  → UPDATE user_role_assignments SET status='revoked'  // missing revoked_at
    → CHECK user_role_assignments_revoked_consistency FAIL
      → skipSuite / requireDb fail × 12
```

### RC03 — `user_role_assignments_active_scope_uidx`

| Field | Value |
|--|--|
| FAILED_TEST_FILES | `tests/v8-shared-form-studio-authz.test.js` (all 11) |
| FAILURE_SIGNATURE | `duplicate key value violates unique constraint "user_role_assignments_active_scope_uidx"` |
| ROLE_EXPECTED | HQ `organisation_administrator`, branch `branch_administrator`, viewer `first_timers_coordinator` |
| ROLE_ACTUALLY_CREATED/ASSIGNED | `assignBlessBoardRole(branch_admin → branch_administrator)` then duplicate `insertAssignment` same active scope |
| PERMISSION_EXPECTED | N/A (setup failure) |
| HTTP_STATUS | N/A (setup failure) |

**Trace:**

```text
before()
  → assignBlessBoardRole(branch_admin, campus-a)  // inserts catalogue branch_administrator
  → assignCatalogue(branch_administrator, same scope)  // raw insertAssignment
    → UNIQUE active_scope_uidx FAIL
      → suite setup abort × 11
```

---

## 2. Root contract

Authoritative assignment path (V2.02+):

- Catalogue table: `blessboard.user_role_assignments`
- Product helper: `assignBlessBoardRole` (maps legacy keys via `LEGACY_TO_CATALOGUE_ROLE`)
- Repository revoke: `blessBoardRbacRepository.revokeAssignment` sets `status='revoked'` **and** `revoked_at=now()`
- Active uniqueness: one active row per `(user_id, organization_id, role_id, scope_type, scope_id, church_id)`

| ID | Classification | Detail |
|--|--|--|
| RC02 | **B. missing / inconsistent revoke fields** (fixture) — not app RBAC regression | Raw SQL set `status='revoked'` without `revoked_at` |
| RC03 | **H. combination: duplicate fixture assignment** | Same active catalogue scope inserted twice (legacy helper + raw catalogue insert) |

```text
RC02_ROOT_CAUSE=Fixture revoked assignments with status=revoked but revoked_at NULL
RC02_CLASSIFICATION=TEST_FIXTURE_CONTRACT_DRIFT (revoked_consistency)

RC03_ROOT_CAUSE=Double insert of identical active catalogue assignment (assignBlessBoardRole + insertAssignment)
RC03_CLASSIFICATION=TEST_FIXTURE_CONTRACT_DRIFT (active_scope_uidx)
```

No `APPLICATION_RBAC_DEFECT` found: product assign/revoke paths already satisfy the schema.

---

## 3. Security guardrail

Fixes do **not**:

- grant `website.edit` or unrelated permissions
- assign platform/super-admin as a shortcut
- bypass middleware
- change deny→allow in application code
- weaken tenant/branch membership checks

Actors remain explicitly scoped:

| Actor | Role | Scope |
|--|--|--|
| branch | `branch_administrator` | assigned branch only |
| campus | `branch_administrator` | campus branch only |
| hq | `organisation_administrator` | church/org as assigned |
| platform | `platform_administrator` | platform (still denied branch portal without support) |
| viewer | `first_timers_coordinator` | church (no `requests.*`) |
| outsider | HQ on **other** tenant | cross-tenant denied |

---

## 4. Canonical fixture fix

**New:** `tests/helpers/blessboardRoleAssignmentFixture.js`

| Helper | Purpose |
|--|--|
| `revokeActiveAssignmentsForUser(pool, userId, organizationId, opts)` | Uses `rbacRepo.revokeAssignment` → sets `revoked_at` |
| `ensureCatalogueAssignment(pool, userId, roleKey, scope)` | Idempotent insert; skips when matching active scope exists |

### File wiring

| File | Change |
|--|--|
| `tests/blessboard-branch-admin-shell.test.js` | Suspended actor uses `revokeActiveAssignmentsForUser`; HQ assertion updated to catalogue shell markers (was obsolete `/Church HQ admin/` copy masked by setup failure) |
| `tests/v8-shared-form-studio-authz.test.js` | `assignCatalogue` → `ensureCatalogueAssignment` |

```text
CANONICAL_FIX_LOCATIONS=
  tests/helpers/blessboardRoleAssignmentFixture.js
  tests/blessboard-branch-admin-shell.test.js
  tests/v8-shared-form-studio-authz.test.js
```

```text
APPLICATION_CODE_CHANGED=NO
TEST_FIXTURE_CHANGED=YES
```

---

## 5. Targeted verification

```text
TARGETED_TESTS=
  tests/blessboard-branch-admin-shell.test.js
  tests/v8-shared-form-studio-authz.test.js
  (+ security companions: v8-shared-rbac-tenant-isolation, v8-tenant-product-isolation)

PRIMARY RC02+RC03 SUITES:
PASS=24
FAIL=0
SKIP=0

revoked_consistency hits in log: 0
active_scope_uidx hits in log: 0
```

```text
RC02_ORIGINAL_FAILURES=12
RC02_REMAINING_FAILURES=0   # signature eliminated; suite green

RC03_ORIGINAL_FAILURES=11
RC03_REMAINING_FAILURES=0
```

### Required denial checks (from RC02/RC03 suites)

```text
AUTHORIZED_ACTORS=PASS
UNAUTHORIZED_DENIAL=PASS
CROSS_TENANT_DENIAL=PASS
WRONG_ROLE_DENIAL=PASS
```

Evidence (all `ok`):

- authorized `branch_admin` / HQ / Form Studio HQ+branch open
- platform without support → 403
- role without `requests.*` denied Form Studio
- wrong branch / wrong church → 403
- cross-tenant HQ denied
- inactive role / inactive user rejected
- unauthenticated → redirect/401

---

## 6. Downstream 403 recheck (no fixes applied)

Reran prior RC14/P1 403-bearing suites **without modifying them**:

- `shared-website-editor-wave4b1.test.js`
- `v7-branch-editor-canonical-actions.test.js`
- `blessboard-announcement-platform-admin-testing-policy.test.js`
- `activeclinic-roles-access-admin.test.js`
- `activeclinic-roles-access-parity.test.js`
- `activeclinic-organization-settings-parity.test.js`

| Previous 403 case | Classification after RC02/RC03 |
|--|--|
| AC org settings 403≠400 | **STILL_FAILING** |
| AC roles-access-admin 403≠303 | **STILL_FAILING** |
| AC roles-access-parity 403≠303 | **STILL_FAILING** |
| BB announcement platform publish 403≠200 | **STILL_FAILING** |
| wave4b1 media upload 403≠200 | **STILL_FAILING** |
| wave4b1 cross-tenant media 403≠200 | **STILL_FAILING** |
| v7-branch-editor forbidden | **STILL_FAILING** |

```text
DOWNSTREAM_403_BEFORE=7
DOWNSTREAM_403_RESOLVED=0
DOWNSTREAM_403_REMAINING=7
```

**Conclusion:** RC02/RC03 were **not** prerequisites for these remaining P1/RC14 403s (mostly ActiveClinic / media / announcement). Form Studio authz suite itself is now green (was setup-blocked by RC03).

---

## 7. P1 reassessment

```text
P1_BEFORE=18
P1_FAILURES_REMAINING=18
P1_ROOT_CAUSES_REMAINING=5
```

Remaining P1 root causes (unchanged; none were RC02/RC03):

| ID | Failures | Signature |
|--|--:|--|
| RC14 | 7 | HTTP 403 actual vs expected allow/redirect/validation |
| RC19 | 6 | AC booking↔patient linkage bool asserts |
| RC15 | 3 | tenant isolation / cross-tenant denial asserts |
| RC16 | 1 | expected 404 foreign resource, got redirect |
| RC20 | 1 | AC finance mutation `invalid_input` vs `created` |

No surviving security failure was downgraded.

---

## 8. Regression safety

```text
RBAC_WEAKENED=NO
TENANT_ISOLATION_WEAKENED=NO
BROAD_ADMIN_ROLE_USED_AS_FIX=NO
PERMISSIONS_BROADENED=NO
APPLICATION_CODE_CHANGED=NO
```

---

## 9. Diff audit

```text
SHARED_TEST_FIXTURE=tests/helpers/blessboardRoleAssignmentFixture.js
BB_TEST=tests/blessboard-branch-admin-shell.test.js
PLATFORM_TEST=tests/v8-shared-form-studio-authz.test.js
DOC=docs/qa/V2_03_COVERAGE_RC02_RC03_FIX.md
APPLICATION=none
AC_TEST=none
CONFIG=none
MIGRATION=none
UNRELATED=none
```

---

## 10. Summary block

```text
RC02_ROOT_CAUSE=Fixture revoked role rows without revoked_at
RC02_CLASSIFICATION=TEST_FIXTURE_CONTRACT_DRIFT
RC02_ORIGINAL_FAILURES=12
RC02_REMAINING_FAILURES=0

RC03_ROOT_CAUSE=Duplicate active catalogue assignment insert (same user/org/role/scope)
RC03_CLASSIFICATION=TEST_FIXTURE_CONTRACT_DRIFT
RC03_ORIGINAL_FAILURES=11
RC03_REMAINING_FAILURES=0

CANONICAL_FIX_LOCATIONS=
  tests/helpers/blessboardRoleAssignmentFixture.js
  tests/blessboard-branch-admin-shell.test.js
  tests/v8-shared-form-studio-authz.test.js

APPLICATION_CODE_CHANGED=NO
TEST_FIXTURE_CHANGED=YES

TARGETED_TESTS=blessboard-branch-admin-shell + v8-shared-form-studio-authz (+ isolation companions)
PASS=24
FAIL=0
SKIP=0

DOWNSTREAM_403_BEFORE=7
DOWNSTREAM_403_RESOLVED=0
DOWNSTREAM_403_REMAINING=7

P1_BEFORE=18
P1_FAILURES_REMAINING=18
P1_ROOT_CAUSES_REMAINING=5

AUTHORIZED_ACTORS=PASS
UNAUTHORIZED_DENIAL=PASS
CROSS_TENANT_DENIAL=PASS
WRONG_ROLE_DENIAL=PASS

RBAC_WEAKENED=NO
TENANT_ISOLATION_WEAKENED=NO
PERMISSIONS_BROADENED=NO

EXPECTED_TOTAL_FAILURES_ELIMINATED=137
  # RC01 114 + RC02 12 + RC03 11
  # Working residual estimate: 452 - 137 = 315

PRODUCTION=UNTOUCHED
```

---

## FINAL VERDICT

```text
V2_03_RC02_RC03_FIX_PASS
```
