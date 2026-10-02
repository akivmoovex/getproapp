# V2.03 Coverage Wave 1 — PLATFORM / Shared Infrastructure

**FINAL: `V2_03_PLATFORM_90_COVERAGE_BLOCKED`**

## Gate verdict

Wave 1 raised PLATFORM **functions** above 90% and cut the statement/line gap by ~18pp via behavioral coverage of previously zero-F `src/db/pg/**` repositories plus auth/RBAC/tenant, website URL/forms/media, and related shared services. PLATFORM **branches** and **statements/lines** remain below 90%. No application defects were found; no production touch; security regression suites PASS.

| Field | Value |
|---|---|
| Branch | `V10` |
| Authoritative baseline | `docs/qa/V2_03_GREEN_COVERAGE_BASELINE.md` → `V2_03_GREEN_COVERAGE_BASELINE_VALID` |
| Canonical suite input | `FAIL=0`, `QA=98/98`, `PRODUCTION=UNTOUCHED` |
| Measurement | Baseline `coverage/v203` ∪ targeted `coverage/v203-wave1` ∪ `coverage/v203-wave1b` (per-file `max(covered)`, covered capped to baseline totals) |

```
BEFORE_S/B/F/L=66.69/66.22/55.91/66.69
AFTER_S/B/F/L=85.20/66.61/93.62/85.20

NEW_TEST_CASES=148
APPLICATION_DEFECTS_FOUND=0
APPLICATION_DEFECTS_FIXED=0

RBAC=PASS
TENANT_ISOLATION=PASS
MEDIA_SECURITY=PASS
PUBLISH_AUTHZ=PASS

PRODUCTION=UNTOUCHED

FINAL=V2_03_PLATFORM_90_COVERAGE_BLOCKED
```

---

## PLATFORM metrics

| Metric | BEFORE | AFTER (merged est.) | ≥90% | Gap to 90 (counts) |
|---|---:|---:|---|---:|
| Statements | 66.69% (79098/118614) | **85.20%** (101061/118614) | NO | +5691 |
| Branches | 66.22% (12360/18666) | **66.61%** (12434/18666) | NO | +4365 |
| Functions | 55.91% (1944/3477) | **93.62%** (3255/3477) | **YES** | 0 |
| Lines | 66.69% (79098/118614) | **85.20%** (101061/118614) | NO | +5691 |

Notes:

- AFTER is a **conservative union** against the authoritative baseline denominator (not a full 865-file re-run). Targeted c8 alone undercounts PLATFORM because it does not include the rest of the green suite.
- Many previously zero-F `src/db/pg/**` files show collapsed branch maps in the baseline (`branches.total≈1`). Wave1 exercise covers real control flow in those files, but that branch credit **cannot** be applied against the baseline denominator without reinstrumentation. A reinstrumented union estimate still lands near **~66% branches** — the branch problem is density, not only reporting.
- No coverage exclusions, import-only tests, assertion-free tests, RBAC/tenant weakening, or production changes.

---

## What was added

### Tests

| File | Role | Cases |
|---|---|---:|
| `tests/v203-wave1-platform-coverage.test.js` | Auth/RBAC/tenant helpers, website editor shared ops, tenants/adminUsers contracts, fake-pool exercise of zero-F db repos | ~129 |
| `tests/v203-wave1b-platform-branches.test.js` | `publicWebsiteUrl`, `formSchema`/`tenantFormService` authz, media MIME/ownership/hostinger roots, editable fields, announcements, verification, governance/change-manager denials, deployment/consent, pay-run helpers | 19 |
| `tests/fixtures/v203-wave1-zero-f-db-repos.json` | Manifest of baseline zero-F PLATFORM `src/db/pg/**` targets (~118) | — |

**Marker:** `V203_WAVE1_PLATFORM_COVERAGE`  
**Combined:** `NEW_TEST_CASES=148` (all green under `node --test`)

### Priority coverage addressed

1. Auth/RBAC/tenant — `sharedTenantScope`, `sharedAuthzDecision`, `sharedRbacFacade`
2. Shared website/editor — `websiteEditorSharedOperations`, HTTP utils, `publicWebsiteUrl`, `editableFieldSchema`, change-manager denials
3. Media/upload security — MIME signature, filename sanitize, owned delivery paths, Hostinger root persistence / path safety
4. Forms / registration infrastructure — `formSchema` allow/deny, `tenantFormService` authz-required denials
5. Publishing/governance — governance action denials, announcement effective-status visibility
6. Shared repositories — zero-F `src/db/pg/**` SQL contracts via fake pool (positive/negative/empty-result shapes)

### Anti-gaming

- Assertions on allow/deny outcomes, status codes, structured reasons, MIME/path results
- Fake pool returns rows / empty / exercises multiple call shapes; not import-only
- No `.c8rc` exclude expansion for score
- Application code unchanged (no defect found)

---

## Remaining gap (why BLOCKED)

After Wave 1, uncovered PLATFORM lines are still dominated by:

| Area | Example | Approx. remaining L / B (post-merge) |
|---|---|---|
| Platform HTTP mega-routes | `platformAdminRoutes.js`, `v5FoundationServer.js`, `moovexPlatformRuntimeServer.js`, `platformWebsiteAdminRoutes.js`, `sharedFormBuilderRoutes.js` | ~4k lines / ~1k branches |
| Deep service paths | `tenantFormService`, admin directory/team, billing subscription, verification | hundreds each |
| Large db repos (partial) | `fieldAgentPayRunRepo`, `fieldAgentSubmissionsRepo`, finance/HQ repos | still hundreds of lines each despite F≈high |

Closing **S/L ≥90** needs ~**5691** more lines. Even clearing **all** remaining non-HTTP uncovered lines is theoretically enough, but requires near-complete deep path coverage inside large services/repos — not achievable with the current fake-pool multiplier alone. Closing **B ≥90** needs ~**4365** more baseline-denominator branches; HTTP route and service branch density is the limiter. A reinstrumented estimate that expands collapsed db branch maps still does **not** reach 90% branches.

### Genuine blockers

| ID | Blocker |
|---|---|
| **W1-B1** | PLATFORM **branches** stuck ~66% on authoritative (and reinstrumented) accounting; Wave1 function exercise does not unlock nested branch density at 90%. |
| **W1-B2** | PLATFORM **statements/lines** at **85.20%**; remaining ~5.7k lines concentrated in HTTP admin/foundation routes and deep service/db paths that need integration-style coverage, not additional import/exercise theater. |
| **W1-B3** | Full authoritative AFTER would require another green 865-file batched c8 merge; targeted iterations are directional only. Not used as an excuse to claim PASS. |

**Not blockers:** Functions ≥90 (cleared). Security/RBAC/tenant/media/publish regressions (PASS). Canonical green / QA 98 / production (preserved).

---

## Security regression (Wave 1 close)

| Suite | Result |
|---|---|
| `npm run test:v203:critical-platform` | **PASS** (16) |
| `npm run test:v8:rbac-isolation` | **PASS** (19) |
| `npm run test:v8:tenant-isolation` | **PASS** (6) |
| `npm run test:blessboard:media` | **PASS** (25) |
| `tests/blessboard-p0-publish-auth.test.js` | **PASS** (6) |

```
RBAC=PASS
TENANT_ISOLATION=PASS
MEDIA_SECURITY=PASS
PUBLISH_AUTHZ=PASS
```

---

## Artifacts

| Path | Purpose |
|---|---|
| `coverage/v203/` | Authoritative green baseline |
| `coverage/v203-wave1/` | Targeted c8 — wave1a |
| `coverage/v203-wave1b/` | Targeted c8 — wave1a+wave1b |
| `tests/v203-wave1-platform-coverage.test.js` | Wave 1a tests |
| `tests/v203-wave1b-platform-branches.test.js` | Wave 1b tests |
| `tests/fixtures/v203-wave1-zero-f-db-repos.json` | Zero-F db target list |

---

## Recommended Wave 1 follow-on (not executed)

1. HTTP integration coverage for `platformAdminRoutes` / website admin / form-builder routes (authz allow + deny + forged tenant).
2. Deep `tenantFormService` publish/submit/review paths with controlled repo fakes (branch-heavy).
3. Branch-dense paths in `mediaService` register/archive/assertOwned and `sharedVerificationService` start/complete.
4. Re-run batched green c8 (865) once those land for authoritative AFTER S/B/F/L.

---

## Required report fields (copy block)

```
BEFORE_S/B/F/L=66.69/66.22/55.91/66.69
AFTER_S/B/F/L=85.20/66.61/93.62/85.20

NEW_TEST_CASES=148
APPLICATION_DEFECTS_FOUND=0
APPLICATION_DEFECTS_FIXED=0

RBAC=PASS
TENANT_ISOLATION=PASS
MEDIA_SECURITY=PASS
PUBLISH_AUTHZ=PASS

PRODUCTION=UNTOUCHED

FINAL=V2_03_PLATFORM_90_COVERAGE_BLOCKED
```
