# V2.03 Coverage Remediation — RC01 Fix

**Status:** `V2_03_RC01_FIX_PASS`  
**Date:** 2026-09-28  
**Worktree:** `getpro-v202-cov-audit`  
**Input:** `docs/qa/V2_03_FULL_COVERAGE_FAILURE_TRIAGE.md`  
**Scope:** RC01 only (`branch_name` NOT NULL on registration seed)

## Constraints honored

- Did **not** fix RC02/RC03, CSS fingerprints, redirects, or P1 authz
- Did **not** weaken DB constraints / make `branch_name` nullable
- Did **not** change application registration logic
- Did **not** touch production
- Did **not** rerun the full 855-file coverage suite

---

## 1. Root-cause audit

### Contract

| Item | Value |
|--|--|
| Table | `blessboard.platform_church_registration_applications` |
| Column | `branch_name` |
| Constraint | `NOT NULL` + length check (1–200) |
| Migration | `db/migrations/blessboard/105_registration_branch_name_required.sql` (V7 BUG 4) |
| Original create DDL | `026_create_platform_church_registration_applications.sql` (`branch_name TEXT NULL`) |

### Trace

```text
test suite before()/fixture
  → appRepo.createApplication(pool, fields)   // often omitted branch_name
    → insertApplicationRow(..., fields.branch_name || null)
      → INSERT blessboard.platform_church_registration_applications
        → PG 23502 NOT NULL on branch_name
          → wrapped as "Local PostgreSQL unavailable: null value in column \"branch_name\"..."
```

Public/product path (unaffected defect):

```text
HTTP /register-church
  → validatePlatformChurchRegistration (branch_name required: true)
  → blessboardChurchRegistrationAdapter
  → createApplicationIdempotent (persistable.branch_name always set when validation ok)
```

Original RC01 impact from triage: **114 failures / 21 test files** (all BlessBoard).

### Classification decision

```text
RC01_ROOT_CAUSE=Test/direct createApplication (and a few raw SQL INSERTs / one validation payload) omitted branch_name after migration 105 made it NOT NULL; public registration validation already requires the field.
RC01_CLASSIFICATION=TEST_FIXTURE_CONTRACT_DRIFT
```

Subtype: **B. shared seed/factory contract drift** (plus a small amount of per-suite HTTP/validation payload drift in RC01 files).

**Not** an application registration regression: `platformChurchRegistrationValidation.js` requires `branch_name` (`emptyMessage: "Please enter a branch name."`), and `tests/v7-bugs-01-04.test.js` BUG 4 confirms POST rejects a missing branch name. Real user registration cannot reach the NOT NULL insert when validation is used.

---

## 2. Product contract

| Question | Answer |
|--|--|
| Is `branch_name` legitimately required? | **YES** — V7 BUG 4 / migration 105; HQ campus name for provisioning |
| Products | **BlessBoard** church registration (`platform_church_registration_applications`). Not ActiveClinic clinic registration. |
| Where it originates | Church registration form / HQ campus name; provisioning uses `application.branch_name` as HQ display name |
| App supplies it correctly? | **YES** on the validated public path |
| Real users hit NOT NULL? | **NO** — validation blocks first → **not** `APPLICATION_DEFECT` |

Canonical default used in fixtures (matches migration 105 backfill): **`Headquarters`**. Suites that already chose `Main Campus` / `HQ Campus` keep their explicit values.

---

## 3. Fix (smallest correct change)

### Canonical fixture

**New:** `tests/helpers/blessboardChurchRegistrationFixture.js`

- `DEFAULT_HQ_BRANCH_NAME = "Headquarters"`
- `withRequiredBranchName(fields)`
- `createChurchRegistrationApplication(pool, fields)` → wraps repository `createApplication` with required `branch_name`

### Call-site wiring

59 direct `*.createApplication(...)` payloads that omitted `branch_name` were switched to `createChurchRegistrationApplication(...)` across BlessBoard registration-related suites (shared helper — not 114 one-off assertion edits).

Additional RC01-file fixture corrections:

- Raw SQL INSERTs in `blessboard-foundation-schema-status.test.js` and `blessboard-testing-org-purge.test.js` now include `branch_name`
- `blessboard-v1-blocker-and-bugs-04-06.test.js` BB-REG-05 validation payload includes `branch_name`
- `blessboard-v1-registration-review-matrix.test.js` `formBody()` includes `branch_name`

### Not changed

- No migrations
- No repository/schema weakening
- No application validation/adapter changes
- No RC02/RC03 / CSS / redirect / P1 work

---

## 4. Targeted verification

Ran **only** RC01-affected suites + BB registration contract (`v7-bugs-01-04`), not the 855-file suite.

### Evidence that RC01 is gone

| Check | Result |
|--|--|
| `null value in column "branch_name"` in targeted logs | **0** |
| `"Please enter a branch name"` after fixture fixes (verify set) | **0** |
| `platform-admin registration applications (Phase 5)` | **PASS** (was 12 RC01 fails) |
| `blessboard testing maintenance http + reset` | **PASS** (was 14 RC01 fails) |
| `rejectRegistrationApplication PostgreSQL` | **PASS** |
| V7 BUG 4: registration POST rejects missing branch name | **PASS** |
| V7 bugs 1–4 suite | **PASS** |

Broader RC01-file run still has non-RC01 failures (status 400/303, phone validation, `branch_not_found`, CSS regex, identity purge, etc.). Those map to other triage root causes and were **out of scope**.

```text
RC01_TESTS=21 original RC01 files + tests/v7-bugs-01-04.test.js
PASS=134   # broader RC01-file node --test run (includes non-RC01 assertions)
FAIL=71    # non-RC01 residual in those files (0 branch_name NOT NULL)
SKIP=0

CORE_PROOF_SUITE (createApplication-heavy + contract):
  admin-registration-applications=PASS
  testing-maintenance=PASS
  registration-rejection-service-pg=PASS
  v7-bugs-01-04=PASS
  admin-ops-alerts=1 residual non-RC01 fail (trial window date assert)
```

```text
EXPECTED_FAILURES_ELIMINATED=114
NEW_FAILURES=0
```

---

## 5. Regression safety

| Check | Result |
|--|--|
| BB registration contract (`v7-bugs-01-04`) | **PASS** |
| AC registration (`activeclinic-acw09-registration`) | Pre-existing CSS fingerprint / `acceptTerms` failures (**RC10/J**); **not** introduced by RC01; **0** `branch_name` NOT NULL |
| Tenant creation via createApplication fixtures | Restored (applications + maintenance suites green) |
| HQ/default branch naming in fixtures | Deterministic `Headquarters` / explicit suite values |
| Schema invariant | Preserved |

```text
BB_REGISTRATION=PASS
AC_REGISTRATION=FAIL   # pre-existing non-RC01 (CSS fingerprint / acceptTerms); unaffected by this fix
TENANT_CREATION=PASS   # for BB createApplication/provision fixtures exercised above

BRANCH_NAME_NOT_NULL_PRESERVED=YES
DB_SCHEMA_CHANGED=NO
PRODUCTION=UNTOUCHED
```

---

## 6. Diff audit

```text
FILES_CHANGED=
  tests/helpers/blessboardChurchRegistrationFixture.js          SHARED_TEST_FIXTURE (new)
  tests/blessboard-*.test.js (27 suites wired to helper)        BB_TEST
  tests/blessboard-foundation-schema-status.test.js             BB_TEST (raw INSERT)
  tests/blessboard-testing-org-purge.test.js                    BB_TEST (raw INSERT)
  tests/blessboard-v1-blocker-and-bugs-04-06.test.js            BB_TEST (validation payload)
  tests/blessboard-v1-registration-review-matrix.test.js        BB_TEST (formBody)
  docs/qa/V2_03_COVERAGE_RC01_FIX.md                            DOC

APPLICATION=none
AC_TEST=none
PLATFORM_TEST=none
CONFIG=none
MIGRATION=none
UNRELATED=none intentionally (worktree may show pre-existing screenshot dirt; not part of this fix)
```

```text
CANONICAL_FIX_LOCATION=tests/helpers/blessboardChurchRegistrationFixture.js
APPLICATION_CHANGE_REQUIRED=NO
TEST_FIXTURE_CHANGE_REQUIRED=YES
DB_SCHEMA_CHANGED=NO
```

---

## 7. Summary block

```text
RC01_ROOT_CAUSE=BlessBoard test fixtures called createApplication/raw INSERT without branch_name after migration 105 NOT NULL; public validation already requires the field
RC01_CLASSIFICATION=TEST_FIXTURE_CONTRACT_DRIFT

ORIGINAL_FAILURES=114

FILES_CHANGED=1 new shared helper + 30 BB test files + this doc

CANONICAL_FIX_LOCATION=tests/helpers/blessboardChurchRegistrationFixture.js

APPLICATION_CHANGE_REQUIRED=NO
TEST_FIXTURE_CHANGE_REQUIRED=YES
DB_SCHEMA_CHANGED=NO

BRANCH_NAME_NOT_NULL_PRESERVED=YES

TARGETED_TESTS=22 files (21 RC01 + v7-bugs-01-04)
PASS=134
FAIL=71
SKIP=0
# Note: FAIL are non-RC01 residuals; branch_name NOT NULL count in logs = 0

BB_REGISTRATION=PASS
AC_REGISTRATION=FAIL
TENANT_CREATION=PASS

EXPECTED_FAILURES_ELIMINATED=114
NEW_FAILURES=0

PRODUCTION=UNTOUCHED
```

---

## FINAL VERDICT

```text
V2_03_RC01_FIX_PASS
```
