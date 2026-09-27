# V2.03 QA — Test Coverage Remeasure Report (QA12)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_TEST_COVERAGE_REPORT` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | QA03 harness · QA04 analyzer · QA05 risk matrix · QA06–QA11 readiness packs |
| **Measure** | `npm run test:coverage:critical` → `npm run test:coverage:analyze` |
| **Provider** | c8 + `node --test` (no new tooling) |
| **Mode** | REMEASURE + RANK GAPS (no low-value tests added for %) |
| **Verdict** | **`V203_COVERAGE_IMPROVEMENT_COMPLETE`** |

---

## Measure definition

**BEFORE** = QA03/QA04 critical pack snapshot (`coverage/v203-critical`, analyzer `2026-09-27T13:34:30Z`, **60** critical test files).

**AFTER** = post-QA06–QA11 critical pack (`2026-09-27`, **70** critical test files — includes `v203-critical-platform-security`, AC batch1–3 readiness, BB regression readiness, end-to-end journeys).

Product **platform / BB / AC** rows below are **critical-pack module buckets** (`src/platform`, `src/blessboard`, `src/activeclinic`) so BEFORE vs AFTER is apples-to-apples. Dedicated product-scope runners exist (`test:coverage:platform|blessboard|activeclinic`) but were not the QA03 baseline.

Diagnostic thresholds (not release gates): lines &lt; 70% · functions &lt; 70% · branches &lt; 60% · or 0% / absent.

---

## Overall BEFORE → AFTER

| Metric | BEFORE | AFTER | Δ |
|--------|-------:|------:|--:|
| **Lines** | 44.00% (131650/299166) | **44.85%** (134292/299371) | **+0.85** |
| **Statements** | 44.00% (131650/299166) | **44.85%** (134292/299371) | **+0.85** |
| **Functions** | 36.06% (2435/6752) | **37.16%** (2512/6759) | **+1.10** |
| **Branches** | 48.97% (9786/19981) | **49.94%** (10427/20878) | **+0.97** |

Critical pack grew 60 → 70 files; more code was exercised (+~2.6k covered lines). Aggregate % movement is intentionally modest: QA06–QA11 closed **risk/contract** gaps, not percentage farming.

---

## By product bucket (critical pack)

| Bucket | Metric | BEFORE | AFTER | Δ |
|--------|--------|-------:|------:|--:|
| **Platform** (`src/platform`) | Lines | 50.61% | **51.12%** | +0.51 |
| | Statements | 50.61% | **51.12%** | +0.51 |
| | Functions | 45.12% | **45.91%** | +0.79 |
| | Branches | 54.33% | **55.19%** | +0.86 |
| **BlessBoard** (`src/blessboard`) | Lines | 38.94% | **39.90%** | +0.96 |
| | Statements | 38.94% | **39.90%** | +0.96 |
| | Functions | 28.02% | **29.19%** | +1.17 |
| | Branches | 46.25% | **46.86%** | +0.61 |
| **ActiveClinic** (`src/activeclinic`) | Lines | 45.63% | **46.74%** | +1.11 |
| | Statements | 45.63% | **46.74%** | +1.11 |
| | Functions | 47.76% | **49.46%** | +1.70 |
| | Branches | 45.24% | **47.03%** | +1.79 |

AC gained the most (batch readiness + journeys). Platform security (QA06) and BB regression (QA10) show smaller aggregate lifts because those suites were already partially represented in the critical pack.

---

## Analyzer count movement

| Count | BEFORE | AFTER |
|-------|-------:|------:|
| filesInSummary | 823 | 824 |
| absentFromCoverage / completelyUntested | 555 | 554 |
| flagged | 1269 | 1263 |
| largeWeak (≥200 lines &amp; &lt;50% lines) | 263 | 250 |
| weakRoutes | 163 | 163 |
| weakServices | 372 | 369 |
| highRiskFlagged (analyzer top export) | 425 | 424 |

Artifacts: `coverage/v203-critical/*`, `coverage/coverage-gap-report.{json,md}` (AFTER). BEFORE snapshot retained as `coverage/coverage-gap-report.qa04-before.*`.

---

## 0%-covered runtime files (HIGH risk, product-relevant)

Still absent from the critical pack load graph (never executed). Exclude QA fixtures / hosted QA helpers from release urgency.

### Platform
| Lines (file) | File | Note |
|-------------:|------|------|
| 267 | `src/platform/website-engine/unpublishedChangesPanel.js` | Panel logic; related UX covered elsewhere |
| 49 | `src/platform/registration/registrationSlugPreview.js` | Preview helper |

### BlessBoard
| Lines (file) | File | Note |
|-------------:|------|------|
| 570 | `src/blessboard/services/websiteDraftPublishService.js` | Alternate publish path vs engine bridge |
| 195 | `src/blessboard/website/blessboardAuthorizedWebsiteScopes.js` | Scope helper (0% in pack) |
| 95 | `src/blessboard/website/sectionMediaDraftFields.js` | Draft field map |
| 1180 | `src/blessboard/services/rbacE2eFixtureService.js` | **Test fixture** — not product runtime |

### ActiveClinic
| Lines (file) | File | Note |
|-------------:|------|------|
| 455 | `src/activeclinic/services/activeClinicAdminRoleMigrationService.js` | One-shot / migration admin |
| 95 | `src/activeclinic/website/activeClinicAuthorizedWebsiteScopes.js` | Scope helper (0% in pack) |
| 95 | `src/activeclinic/website/juflonaWebsiteMigration.js` | Pilot migration |
| — | `src/activeclinic/qa/activeClinicHostedAuthQa*.js` | **QA fixtures** — not worth product coverage |

### Legacy / out-of-pack surfaces (large 0% HIGH)
Hundreds of `src/routes/church/*` classic admin routes and `src/church/*` auth helpers remain unloaded by the critical pack. Treat as **NORMAL_BACKLOG / NOT_WORTH** for V2.03 platform-critical release unless a specific church classic route is still production-hot.

---

## High-risk files below 70% lines (loaded)

Representative lowest product/runtime files (critical pack AFTER):

| Lines% | Lines | File |
|-------:|------:|------|
| 7.5 | 993 | `src/platform/services/platformAdminDirectoryService.js` |
| 7.9 | 1083 | `src/platform/services/platformAdminTeamService.js` |
| 10.6 | 739 | `src/platform/website/platformAdminWebsitesService.js` |
| 11.1 | 1426 | `src/blessboard/services/memberRegistrationService.js` |
| 12.0 | 1679 | `src/activeclinic/services/activeClinicBillingOpsService.js` |
| 12.1 | 535 | `src/blessboard/registration/blessboardChurchRegistrationAdapter.js` |
| 12.4 | 523 | `src/activeclinic/services/activeClinicPatientPortalRegistrationService.js` |
| 16.3 | 1493 | `src/blessboard/services/registrationVerificationFacts.js` |
| 18.0 | 333 | `src/activeclinic/http/renderActiveClinicAuth.js` |
| 18.9 | 2906 | `src/blessboard/services/registrationApplicationsAdminService.js` |
| 19.5 | 364 | `src/activeclinic/services/activeClinicStaffAccountAdministrationService.js` |
| 19.9 | 1224 | `src/blessboard/http/memberJourneyAdminRoutes.js` |
| 21.0 | 5335 | `src/platform/http/platformAdminRoutes.js` |
| 22.2 | 478 | `src/activeclinic/http/activeClinicStaffAdminRoutes.js` |
| 22.5 | 2271 | `src/activeclinic/http/activeClinicWebsiteCmsRoutes.js` |
| 27.9 | — | `src/activeclinic/http/activeClinicCashierRoutes.js` |
| 32.3 | — | `src/blessboard/http/blessboardWebsiteEditorRoutes.js` |
| 36.1 | — | `src/activeclinic/http/activeClinicBillingRoutes.js` |

Migration `src/migration/v4ToV5/*` also sits &lt;10% — ranked **NOT_WORTH** for V2.03 (one-shot).

---

## High-risk files below 60% branches

| Branches% | Lines% | File |
|----------:|-------:|------|
| 13.0 | 42.5 | `src/activeclinic/services/authenticateActiveClinicIdentity.js` |
| 15.8 | 21.0 | `src/platform/http/platformAdminRoutes.js` |
| 21.4 | 53.9 | `src/activeclinic/http/activeClinicClinicalRoutes.js` |
| 27.3 | 27.9 | `src/activeclinic/http/activeClinicCashierRoutes.js` |
| 26.6 | 37.3 | `src/activeclinic/http/activeClinicPatientPortalRoutes.js` |
| 30.95 | 68.55 | `src/platform/website-engine/blessboardBridge.js` |
| 32.0 | 67.8 | `src/activeclinic/http/activeClinicClinicalDocumentRoutes.js` |
| 35.7 | 27.6 | `src/activeclinic/http/activeClinicPatientRoutes.js` |
| 42.2 | 24.6 | `src/blessboard/http/contentAdminRoutes.js` |
| 49.0 | 69.6 | `src/activeclinic/http/activeClinicPermissionMiddleware.js` |
| 52.67 | 73.41 | `src/platform/website/mediaService.js` |
| ~50 | ~24–33 | Many BB admin HTTP shells (`hqAdminRoutes`, `branchAdminRoutes`, website workflow routes) |

Note: some large services report **branches 100%** with very low lines — usually sparse branch instrumentation / few recorded branch points, not proof of complete decision coverage. Prefer line + mutation/RBAC evidence for those.

---

## Untested / weak mutation routes

HIGH-risk HTTP surfaces still &lt;45% lines in the critical pack (mutation-heavy):

| Lines% | Route module |
|-------:|--------------|
| 0 | `src/church/http/classicAdminNav.js` |
| 18.0 | `src/activeclinic/http/renderActiveClinicAuth.js` |
| 19.9–25 | BB `memberJourney`, `formsRequests`, `giving`, `announcement`, `content`, `hq*`, `attendance`, `broadcast`, `tenantRegistration` admin routes |
| 20.6–21.0 | `src/platform/http/platformWebsiteAdminRoutes.js`, `platformAdminRoutes.js` |
| 22.2–22.5 | AC `activeClinicStaffAdminRoutes`, `activeClinicWebsiteCmsRoutes` |
| 24.4 | `src/activeclinic/http/activeClinicAuthRoutes.js` |
| 27.6–27.9 | AC `activeClinicPatientRoutes`, `activeClinicCashierRoutes` |
| 36.1–37.3 | AC `activeClinicBillingRoutes`, `activeClinicPatientPortalRoutes` |

QA06–QA11 improved **service-layer** mutation contracts (CMS/media/publish, journeys, batch readiness). Deep **route** body coverage for every admin POST remains a deliberate backlog — not closed by percentage chasing.

---

## Untested / weak RBAC boundaries

| Status | Evidence |
|--------|----------|
| **Stronger after QA06–11** | Platform CMS/publish/media permission matrix (`v203-critical-platform-security`); AC staff invite deny (cashier); BB invite escalation deny; editor-cannot-publish |
| **Still weak / absent** | `blessboardAuthorizedWebsiteScopes.js` (0%), `activeClinicAuthorizedWebsiteScopes.js` (0%), `activeClinicAdminRoleMigrationService.js` (0%) |
| **Partial branch depth** | `activeClinicPermissionMiddleware` ~49% branches; `authorizeBlessBoardTenantAccess` ~48% branches (lines ~79%); `authenticateActiveClinicIdentity` ~13% branches; `blessBoardRoleAssignmentService` ~17% lines; platform `platformRbacCatalogService` / `platformEffectivePermissions` ~32–34% lines |
| **Route RBAC bodies** | Large HQ/branch/admin route files still ~20–35% lines — permission middleware often tested, handler branches not |

---

## Untested / weak tenant boundaries

| Status | Evidence |
|--------|----------|
| **Stronger after QA06–11** | Cross-tenant CMS/media/publish denies; BB cross-tenant authz; AC cross-facility vitals; cross-patient visit summary; forged-org middleware in critical security suite |
| **Still weak** | Classic `src/church/tenantLoginSession.js` (0% in pack); legacy `src/routes/church/*` unloaded; facility isolation not asserted on every billing/clinical write route; `tenantFormService` / registration `tenantHealthSummary` still ~8–14% lines |
| **Partial** | Platform admin forged-org coverage uneven outside website/CMS; host-mismatch matrix still incomplete (QA05 P1); `requireBlessBoardTenantRole` ~29% lines |

---

## Ranked remaining gaps

### RELEASE_CRITICAL
1. **AC billing / cashier write-path depth** — `activeClinicBillingOpsService` ~12% lines; cashier/billing routes ~28–36% lines / weak branches. Money mutations need authz + tenant/facility + invalid/duplicate proofs (unchanged P0 from QA05).
2. **AC radiology as a named clinical capability** — still **UNTESTED** as a distinct suite (diagnostics ≠ radiology).
3. **Facility-scoped deny on remaining HIGH clinical/billing writes** where not yet asserted (release gate: isolation, not line %).

### HIGH_VALUE_AFTER_QA
1. `blessboardBridge` branch coverage (~31% branches) — dual-write / publish-from-legacy edges.
2. `blessboardWebsiteEditorRoutes` depth (~32% lines).
3. AC patient portal registration / portal routes (`activeClinicPatientPortalRegistrationService` ~12%; portal routes ~37% lines / ~27% branches).
4. Media **write** branch edges (`mediaService` ~53% branches) beyond QA06 meta/ownership cases.
5. `websiteDraftPublishService` (0%) vs engine publish path — confirm dead code vs live path, then cover or delete.
6. Authorized website scope modules (BB/AC) currently 0% in pack.
7. Negative uniformity on remaining HIGH admin mutation routes (unauth / forged org / wrong role).

### NORMAL_BACKLOG
1. BB registration admin / verification / applications services (large, low %).
2. Platform admin console services (`platformAdminDirectoryService`, team, websites, recovery) — ops console depth.
3. BB pastoral / members / giving / announcements admin route bodies.
4. Classic `src/routes/church/*` and unloaded `src/church/*` auth helpers — only if still production-serving.
5. `unpublishedChangesPanel.js` (0%) if not covered via shared unpublished-changes tests.

### NOT_WORTH_TESTING
1. QA / hosted fixtures (`activeClinicHostedAuthQa*`, `rbacE2eFixtureService`).
2. One-shot migrations (`src/migration/v4ToV5/*`, juflona migration helpers) for V2.03 %.
3. Presentation/copy/theme helpers and Storybook-only code.
4. Legacy GetPro `src/routes/admin/*` CRM/intake/field-agent surfaces out of BB/AC V2.03 release scope.
5. Adding tests solely to move aggregate % without new risk contracts.

---

## Interpretation

QA06–QA11 **succeeded at risk coverage**, not vanity percentage:

- Critical pack +10 purposeful suites.
- Overall lines **+0.85 pp**; AC branches **+1.79 pp** (largest product lift).
- largeWeak **263 → 250**.
- Security/isolation/journey contracts now automated; remaining gaps are deep money-path, radiology, and large admin HTTP bodies.

**Do not** add low-value tests only to raise %. Next work should follow the ranking above.

---

## Commands to reproduce

```bash
npm run test:coverage:critical
npm run test:coverage:analyze
# optional product scopes (not the QA03 baseline):
# npm run test:coverage:platform
# npm run test:coverage:blessboard
# npm run test:coverage:activeclinic
```

---

## Marker

```text
V203_COVERAGE_IMPROVEMENT_COMPLETE
```
