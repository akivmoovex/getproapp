# V8 Phase 0 — Integrated QA Report

**Recorded:** 2026-09-20T15:55:17Z (UTC)  
**Branch:** `V8`  
**Final status:** `V8_PHASE_0_BLOCKED`  
**Reason:** Hosted V8 QA on `*.neuniversity.org` is not serving the application (HTTP 503). Automated gates and hosted V7 verification passed; Phase 0 cannot PASS while hosted V8 environments remain unverified.

Policy references: [`V8_DEVELOPMENT_POLICY.md`](../platform/V8_DEVELOPMENT_POLICY.md), [`V8_HOSTINGER_TESTING_ENV.md`](../platform/V8_HOSTINGER_TESTING_ENV.md), [`V8_DB_COMPATIBILITY_BASELINE.md`](../database/V8_DB_COMPATIBILITY_BASELINE.md).

---

## 1. V8 branch and hosted SHA

| Check | Result | Evidence |
|-------|--------|----------|
| Local `HEAD` | `d2bb1642d97382a8e2159bc755ad1eead450f6a2` | `git rev-parse HEAD` |
| `origin/V8` | Same SHA | Local `V8` = `origin/V8` |
| Hosted V8 BB `blessboard.neuniversity.org/healthz` | **FAILED** — HTTP **503** Service Unavailable | curl 2026-09-20 |
| Hosted V8 AC `activeclinic.neuniversity.org/healthz` | **FAILED** — HTTP **503** Service Unavailable | curl 2026-09-20 |
| DNS for V8 hosts | Resolves (A records present) | Hostinger edge responds; Node app not healthy |

**Hosted V8 SHA:** *not obtainable* — application not serving `/healthz` JSON.

Phase 0 commits on `V8` since V7 baseline (`03a89106`…`d2bb1642`): 13 commits (policy, DB baseline, isolation, test gates, shared auth/verification/session/RBAC, website sections/lifecycle, validation/errors, audit).

---

## 2. V7 baseline and hosted SHA

| Check | Result | Evidence |
|-------|--------|----------|
| V7 baseline (policy) | `03a89106e2fef8a93e31015d160acf73ab59fd40` | `V8_DEVELOPMENT_POLICY.md` |
| `origin/V7` | `03a89106e2fef8a93e31015d160acf73ab59fd40` | `git rev-parse origin/V7` |
| Hosted V7 BB `blessboard.pronline.org/healthz` | **PASS** | `gitSha=03a89106e2fe`, `deploymentCode=moovex-platform-testing`, `schemaCompatible=true` |
| Hosted V7 AC `activeclinic.pronline.org/healthz` | **PASS** | Same SHA / deployment / schema gate |

V7 QA remains on the V7 line and is operational against the shared testing database identity.

---

## 3. Database identity and migration list

| Item | Value |
|------|--------|
| Shared testing identity | `moovex-platform-v7` |
| Shared testing environment | `testing` |
| V7 hosted expected DB | `expectedIdentityKey=moovex-platform-v7`, `expectedDatabaseEnvironment=testing` |
| V8 intended DB (when hosted) | Same URL / identity as V7 testing ([`V8_HOSTINGER_TESTING_ENV.md`](../platform/V8_HOSTINGER_TESTING_ENV.md)) |
| Production identity (untouched) | `moovex-platform-v7` / `production` on `moovex-platform-production` |

### Platform migrations present on V8 (`db/migrations/platform/`)

Canonical numbered set through **037** (duplicate `* 2.sql` workspace copies ignored for apply order):

`001`–`026` foundation / identity / sessions · `027`–`034` website engine, lifecycle, media folders, geo · `035_website_media_storage_provider.sql` · `036_identity_verification_challenges.sql` · `037_audit_events_product_facility.sql`

V8-era additive migrations relative to V7 baseline workstream: **035–037** (media provider column, verification challenges, audit `product_code` / `facility_id`). Compatibility contract and lint forbid destructive DDL against shared V7 readers/writers.

Automated migration/compat suites: **PASS** (see §4–§5).

---

## 4. V7/V8 backward compatibility

| Area | Method | Result |
|------|--------|--------|
| Additive migration contract / idempotency | `tests/v8-db-compatibility-baseline.test.js`, `tests/v8-migration-contract.test.js` | **PASS** (12 + related contract tests) |
| Runtime schema gate (V7-required capabilities) | `tests/v7-runtime-schema-compatibility.test.js`; hosted V7 `/healthz` | **PASS** — hosted `schemaCompatible=true`, all listed checks `ok` |
| Tenant / product isolation | `tests/v7-tenant-isolation-security.test.js`, `tests/v8-tenant-product-isolation.test.js`, `tests/activeclinic-product-isolation.test.js` | **PASS** (in regression) |
| V7-compatible publish / media namespaces | `tests/v8-shared-website-lifecycle.test.js` + publish helper | **PASS** — V8 writes `testing-v8/`, may read V7 `testing/`, no destructive shared deletes |
| Hosted V7 app still healthy on shared DB | `/healthz` BB+AC | **PASS** |
| Hosted interactive V7 smoke (login UI, invite click-through, publish UI) | Not re-executed end-to-end in this freeze (no disposable hosted credentials exercised) | **Deferred** — covered by automated product suites + live schema gate; not used to claim PASS |

**Conclusion:** Automated evidence shows V8 schema/code changes remain V7-readable/writable. Hosted V7 continues to serve with a compatible schema on the shared testing DB. No Phase 0 product defects found that require V8 code fixes from this gate.

---

## 5. BB and AC regression results

Command: `npm run test:v8:regression:coverage`

| Suite | Files | Gate |
|-------|------:|------|
| `shared-platform` | 20 | **PASS** |
| `compatibility` | 18 | **PASS** |
| `blessboard` | 14 | **PASS** |
| `activeclinic` | 14 | **PASS** |

| Aggregate (final node:test rollup) | Count |
|------------------------------------|------:|
| Tests | 185 |
| Suites | 39 |
| Pass | **185** |
| Fail | **0** |
| Skipped | **0** |
| Cancelled | **0** |
| Duration | ~181.7s (+ coverage) |

No silent skips. No weakened assertions observed in the gate run.

Coverage areas exercised by the gate include: shared platform unit/integration, auth password policy, verification, session security, RBAC/tenant isolation, website sections + draft/preview/publish lifecycle, media isolation, validation/API errors, audit logging, BB auth/RBAC/routing, AC auth/registration/website/media editor contracts.

---

## 6. Security test results

| Domain | Primary suites | Result |
|--------|----------------|--------|
| Authentication & password policy | `v8-shared-auth-password-security`, AC/BB auth foundations | **PASS** |
| Session / cookie / logout isolation | `v8-shared-session-security`, `platform-v5-sessions` | **PASS** |
| Account verification (email/phone) | `v8-shared-verification` | **PASS** |
| Invitation / recovery hardening | Shared password + verification suites; AC account lifecycle | **PASS** |
| RBAC & tenant isolation | `v8-shared-rbac-tenant-isolation`, `v7-tenant-isolation-security` | **PASS** |
| CSRF / input-output safety (BB) | `blessboard-v5-csrf-action-audit`, `blessboard-v5-input-output-safety` | **PASS** |
| Audit logging (redaction, critical writes) | `v8-shared-audit-logging` | **PASS** |
| Error handling (safe API errors / correlation) | `v8-shared-validation` | **PASS** |

Hosted V8 security smoke (login/logout, invite accept, permission UX): **BLOCKED** — V8 hosts return 503 (see §10).

---

## 7. Test coverage

Gate: `c8 --check-coverage --lines=90` over `COVERAGE_TARGETS` (aggregate “All files”).

| Metric | Value |
|--------|------:|
| Lines | **91.9%** (4883 / 5313) |
| Statements | **91.9%** |
| Functions | **95.38%** |
| Branches | **64.46%** (reported; not a hard fail gate) |
| Coverage gate | **PASS** |

### Per-target line coverage (selected Phase 0 modules)

| Module | Lines | Branches |
|--------|------:|---------:|
| `v8DbCompatibilityContract.js` | 100% | 95.65% |
| `v8DeploymentIsolation.js` | 96.49% | 66.03% |
| `sharedPasswordPolicy.js` | 94.2% | 80.95% |
| `sharedSessionSecurity.js` | 97.02% | 60.97% |
| `sharedRbacFacade.js` | 90.52% | 64% |
| `v7CompatibleWebsitePublish.js` | 96.42% | 82.5% |
| `sharedApiError.js` | 92.67% | 45.2% |
| `sharedAuditCatalog.js` | 100% | 100% |
| `sharedAuditLogging.js` | 95.98% | 58.97% |
| `sharedVerificationPolicy.js` | **83.96%** | 68.57% |
| `sharedVerificationService.js` | **84.92%** | 46.21% |
| `sectionValidation.js` | **89.38%** | 64.7% |
| `sectionManagementService.js` | **80.43%** | 59.64% |
| `sharedFieldValidators.js` | **84.15%** | 69.79% |

Files below 90% line coverage are **non-blocking coverage debt** under the current aggregate gate (gate still PASS). Not treated as Phase 0 P0 defects.

Justified exclusions (not in line gate): `moovexPlatformRuntimeServer.js`, `hostingerMediaConfig.js` (see `scripts/v8/run-coverage.js`).

---

## 8. Stitch implementation status

| Scope | Status |
|-------|--------|
| V8 Shared Security & Onboarding Stitch project | `projects/2734098283637220752` — **project exists; screens not generated** (Prompt 00 incomplete) |
| Shared auth / verification UI | Existing BB/AC screens retained; shared EJS partials where documented |
| BlessBoard / ActiveClinic product Stitch | V7 visual systems remain authoritative for product UIs; Phase 0 did **not** implement new Stitch screens |
| Phase 0 product UI claim | **Not Stitch-complete** — accepted as Phase 0 shared-platform freeze scope; not a hosted-runtime P0 by itself |

---

## 9. Open defects and severity

| ID | Severity | Summary | Status |
|----|----------|---------|--------|
| INFRA-V8-HOST-503 | **P0 / release-blocking** | `blessboard.neuniversity.org` and `activeclinic.neuniversity.org` return HTTP 503; V8 SHA and shared-DB binding cannot be confirmed on hosts | Open — Hostinger bind / Node app |
| COV-DEBT-PHASE0 | P3 | Five `COVERAGE_TARGETS` modules below 90% line (aggregate gate still ≥90%) | Open — non-blocking |
| STITCH-00 | P3 | Shared security Stitch screens not generated | Open — deferred to Stitch prompt |

No automated regression failures. No Phase 0 application code defects identified that require a V8 code fix in this freeze.

---

## 10. Remaining infrastructure blockers

From [`V8_HOSTINGER_TESTING_ENV.md`](../platform/V8_HOSTINGER_TESTING_ENV.md) checklist (still incomplete):

- [ ] Separate Hostinger Node.js application for V8 running branch `V8` at SHA `d2bb1642…`
- [ ] Env: `PLATFORM_DEPLOYMENT_CODE=moovex-platform-v8-testing`, shared testing `DATABASE_URL`, distinct `SESSION_SECRET`
- [ ] SSL + DNS already resolve; **application must stop returning 503**
- [ ] Concurrent smoke: V7 `*.pronline.org` + V8 `*.neuniversity.org` `/healthz` both OK with expected SHAs
- [ ] Disposable BB/AC QA tenants for hosted Step 4 flows after healthz green

Until `/healthz` returns JSON with `deploymentCode=moovex-platform-v8-testing` and `gitSha` matching `origin/V8`, hosted V8 QA remains **unverified**.

---

## 11. Production untouched confirmation

| Host | Result |
|------|--------|
| `https://blessboard.com/healthz` | **200** — `deploymentCode=moovex-platform-production`, `environment=production`, `expectedIdentityKey=moovex-platform-v7`, `expectedDatabaseEnvironment=production`, `gitSha=d4f5b190074d`, `schemaCompatible=true` |
| `https://www.blessboard.com/healthz` | Same production profile / SHA |
| V8 branch / neuniversity | Not bound to production hosts |
| Automatic production migrate/deploy | Not performed; policy forbids |

**Production remains on V7 production deployment — unchanged by this Phase 0 freeze.**

---

## 12. Phase 1 readiness decision

| Gate | Status |
|------|--------|
| Local V8 = origin/V8 | Met |
| Automated regression (BB+AC+shared+compat) | Met (185/185, 0 skip) |
| Coverage aggregate ≥90% lines | Met (91.9%) |
| V7 hosted operational on shared testing DB | Met |
| V7/V8 DB compatibility contract | Met (automated + V7 schemaCompatible) |
| V8 hosted SHA / shared-DB verification | **Not met** (503) |
| Hosted V8 disposable-tenant QA (Step 4) | **Not met** |
| Production untouched | Met |

### Decision

**`V8_PHASE_0_BLOCKED`**

Phase 1 must not start as a hosted-validated freeze until V8 QA hosts serve the expected SHA on the shared testing database and Step 4 disposable-tenant checks are recorded. Automated Phase 0 shared-platform work on `V8` is otherwise green and may continue locally; do **not** claim `V8_PHASE_0_QA_PASS` or `V8_PHASE_0_PASS_WITH_NONBLOCKING_DEBT` while hosted V8 remains unverified.

### Unblock criteria (minimum)

1. Both V8 `/healthz` endpoints return 200 with `gitSha` matching `origin/V8` and `deploymentCode=moovex-platform-v8-testing`.
2. Confirm `expectedIdentityKey=moovex-platform-v7` / `expectedDatabaseEnvironment=testing`.
3. Re-run disposable hosted BB+AC smoke (login/logout, verification, recovery/invite, RBAC, website draft/preview/publish, media, 390/1440, errors, audit).
4. Update this report (or a follow-on amendment) and re-evaluate final status.

---

*Generated for Prompt 14 — V8 Phase 0 integrated QA and freeze. No new product features implemented in this task.*
