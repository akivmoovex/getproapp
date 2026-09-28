# V2.03 Canonical QA Baseline Recovery

**Doc ID:** `V2_03_CANONICAL_QA_BASELINE`  
**Date:** 2026-09-28  
**Mode:** Baseline recovery (no full 855+ suite, no new coverage-gaming tests, production untouched)

---

## FINAL

```text
V2_03_CANONICAL_QA_BASELINE_READY
```

---

## 1) Canonical worktree

| Field | Value |
|--|--|
| CANONICAL_BRANCH | `V10` |
| CANONICAL_WORKTREE | `getpro` (`/Users/akivsolomon/Documents/DocumentsAkiv/Akiv/Dev/CursorProjects/getpro`) |
| CANONICAL_SHA | _(filled after checkpoint commit)_ |
| Pre-commit HEAD | `1e4251291c9f7440c6138a8ff6cec17478583eb4` |

### Worktree inventory (pre-integration)

| Tree | Branch | HEAD | Notes |
|--|--|--|--|
| `getpro` | `V10` → `origin/V10` | `1e425129…` | Overnight dirty: billing service, finance-rbac test, package.json, QA docs, 3 untracked v203 suites, screenshots |
| `getpro-v202-cov-audit` | detached | `c73dd9b2…` | Trusted 65.71% run site; dirty RC01–03 + Prompt-2 remediations + screenshots (~159 paths) |

Trusted earlier run (cov-audit): PASS=6184 FAIL=452 S/B/F/L=65.71/62.55/65.40/65.71.

Overnight run: **UNTRUSTWORTHY** (different tip, RC absent, Postgres trust rejected, batch 008 stall).

### Classification of post-trusted-run changes

| Class | Location | Disposition |
|--|--|--|
| **RC01** | cov-audit helpers + ~30 BB registration fixtures | **Integrated** into getpro |
| **RC02** | `blessboardRoleAssignmentFixture` + `blessboard-branch-admin-shell.test.js` | **Integrated** |
| **RC03** | same helper + `v8-shared-form-studio-authz.test.js` | **Integrated** |
| **V203_NEW_TEST** | 6 tracked + 3 untracked v203 suites; + local postgres guard | **KEEP** (see §3) |
| **COVERAGE_INFRA** | `scripts/coverage/*`, package.json coverage scripts, `.gitignore` `/coverage/` | **KEEP** (scripts were accidentally ignored by `coverage/` glob) |
| **QA_DOC** | V2_03 overnight/RC/matrix/baseline docs | **KEEP** (evidence) |
| **UNRELATED** | `__screenshots__/**` dirt; cov-audit Prompt-2 app changes (`assignBlessBoardRole`, `loadPg`, host registry, CSS/redirect mass edits) | **Not** in this checkpoint |
| **UNKNOWN→deferred** | Overnight `activeClinicBillingService.js` SEC fix | **Deferred** (application change; keep dirty, not in baseline commit) |

---

## 2) RC01–03 integration

Transferred verified files from cov-audit (no manual reimplementation):

- `tests/helpers/blessboardChurchRegistrationFixture.js`
- `tests/helpers/blessboardRoleAssignmentFixture.js`
- All RC01 call-site BB suites + raw INSERT / formBody corrections
- `tests/blessboard-branch-admin-shell.test.js`
- `tests/v8-shared-form-studio-authz.test.js`
- RC fix docs

```text
RC01_INCLUDED=YES
RC02_INCLUDED=YES
RC03_INCLUDED=YES

APPLICATION_CHANGE=NO   # for RC01–03 themselves
DB_SCHEMA_CHANGE=NO
PRODUCTION_CHANGE=NO
```

Invariants preserved (targeted verify):

| Invariant | Result |
|--|--|
| `branch_name` NOT NULL | preserved (0 NOT NULL hits in RC pack) |
| `user_role_assignments_revoked_consistency` | preserved (0 hits) |
| `user_role_assignments_active_scope_uidx` | preserved (0 hits) |
| RBAC weakened? | **NO** (Form Studio + shared RBAC companions green) |
| Tenant isolation weakened? | **NO** |

```text
RC01_REMAINING=0
RC02_REMAINING=0
RC03_REMAINING=0
```

Note: `blessboard-admin-ops-alerts` still has **1 non-RC01** residual (`unused growth trial window helper…`) — documented in RC01 fix as out-of-scope; does not revive RC01.

---

## 3) +9 test files (+1 guard)

Absent from earlier 855-file cov-audit inventory:

| File | Decision | Reason |
|--|--|--|
| `tests/v203-ac-batch1-test-readiness.test.js` | **KEEP** | AC Batch1 readiness / authz |
| `tests/v203-ac-batch2-test-readiness.test.js` | **KEEP** | AC Batch2 readiness |
| `tests/v203-ac-batch3-test-readiness.test.js` | **KEEP** | AC Batch3 readiness |
| `tests/v203-bb-regression-test-readiness.test.js` | **KEEP** | BB regression after V10 |
| `tests/v203-critical-platform-security.test.js` | **KEEP** | Critical platform security |
| `tests/v203-end-to-end-journeys.test.js` | **KEEP** | E2E journey inventory + HTTP |
| `tests/v203-qa-automation-gaps.test.js` | **KEEP** | Prompt4 QA gap closure |
| `tests/v203-coverage-gap-closure.test.js` | **KEEP** | High-risk billing/clinical authz |
| `tests/v203-security-coverage-gate.test.js` | **KEEP** | Security write-matrix gate |
| `tests/v203-local-postgres-guard.test.js` | **KEEP** | New production-DB guard unit (baseline) |

```text
NEW_TESTS_KEPT=10
NEW_TESTS_REWORKED=0
NEW_TESTS_DISCARDED=0
```

---

## 4) Test database environment

```text
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=postgres          # admin / maintenance DB
DB_PROVIDER/INSTANCE=Postgres.app (local PostgreSQL 16.9)
```

Hardening:

- New `tests/helpers/localPostgresAdmin.js` — explicit OS user + `127.0.0.1`, refuses remote/Hostinger/production markers
- Wired into `foundationDb.js`, `migrationFixtureDb.js`, `v5ToV7FixtureDb.js`
- Unit guard suite green

```text
DB_ENVIRONMENT_VALID=YES
PRODUCTION_DB_GUARD=PASS
```

Credentials/secrets: **not printed**; no production `.env.production.local` used for foundation admin.

---

## 5) Database smoke gate

Representative pack (NODE_ENV=test):

| Area | Suite | Result |
|--|--|--|
| BB registration | `blessboard-admin-registration-applications.test.js` | **PASS** |
| BB role / RBAC | `blessboard-branch-admin-shell` + `v8-shared-form-studio-authz` | **PASS** |
| AC registration | `activeclinic-registration-identity-idempotency.test.js` | **PASS** |
| AC patient/booking | `activeclinic-appointment-foundation` + `reception-foundation` | **PASS** |
| Billing/finance | `activeclinic-finance-rbac.test.js` | **PASS** |
| Tenant isolation | `v8-shared-rbac-tenant-isolation.test.js` | **PASS** |
| Connection probe | admin connect + TEMP write + ROLLBACK | **PASS** |

Known residual (not a smoke-blocker for env): `activeclinic-booking-patient-linkage.test.js` still fails **7** leaf asserts (triage **RC19** bool/linkage debt) — counted toward expected ~315 comparable residual, **not** PG trust.

```text
DB_SMOKE=PASS
BB_DB=PASS
AC_DB=PASS
BILLING_DB=PASS
PATIENT_BOOKING_DB=PASS
TENANT_ISOLATION_DB=PASS
DB_CONNECTION=PASS
READ=PASS
WRITE=PASS
ROLLBACK/CLEANUP=PASS
```

---

## 6) Test manifest

```text
TEST_FILES_EARLIER=855
TEST_FILES_OVERNIGHT=864
CANONICAL_TEST_FILES=865
```

Exact delta vs earlier 855:

- +9 V2.03 suites (6 tip-tracked + 3 overnight untracked now kept)
- +1 `v203-local-postgres-guard.test.js`

Artifacts:

- `docs/qa/manifests/V2_03_CANONICAL_TEST_MANIFEST.txt`
- `docs/qa/manifests/V2_03_CANONICAL_TEST_MANIFEST.sha256`

```text
MANIFEST_SHA256=fda6916a001ef8ceaea7fbf5dc0403cf95f2b2f1ac87c9f78e4dba8c858c22f5
```

---

## 7) Checkpoint commit scope

Included: RC01–03 fixtures/tests/docs, local Postgres guard, coverage harness un-ignore + scripts, kept v203 tests, package.json script updates, manifests, this report / reconciliation docs.

Excluded: production env files, screenshot dirt, deferred overnight billing **application** fix, cov-audit Prompt-2 mass CSS/redirect/application remediations.

```text
APPLICATION_CODE_CHANGED=NO
DB_SCHEMA_CHANGED=NO
PRODUCTION=UNTOUCHED
EXPECTED_COMPARABLE_RESIDUAL_FAILURES≈315
```

---

## Output block

```text
CANONICAL_BRANCH=V10
CANONICAL_SHA=<post-commit>
CANONICAL_WORKTREE=getpro

RC01_INCLUDED=YES
RC02_INCLUDED=YES
RC03_INCLUDED=YES

RC01_REMAINING=0
RC02_REMAINING=0
RC03_REMAINING=0

TEST_FILES_EARLIER=855
TEST_FILES_OVERNIGHT=864
CANONICAL_TEST_FILES=865

NEW_TESTS_KEPT=10
NEW_TESTS_REWORKED=0
NEW_TESTS_DISCARDED=0

DB_ENVIRONMENT_VALID=YES
PRODUCTION_DB_GUARD=PASS

DB_SMOKE=PASS
BB_DB=PASS
AC_DB=PASS
BILLING_DB=PASS
PATIENT_BOOKING_DB=PASS
TENANT_ISOLATION_DB=PASS

APPLICATION_CODE_CHANGED=NO
DB_SCHEMA_CHANGED=NO

PRODUCTION=UNTOUCHED

EXPECTED_COMPARABLE_RESIDUAL_FAILURES≈315

FINAL:
V2_03_CANONICAL_QA_BASELINE_READY
```
