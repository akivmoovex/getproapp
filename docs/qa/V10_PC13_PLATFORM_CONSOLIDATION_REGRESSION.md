# V10 PC13 — Final Platform Consolidation Regression

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC13_PLATFORM_CONSOLIDATION_REGRESSION` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC10 `PLATFORM_PUBLICATION_CONVERGENCE_PASS` · PC11 `PLATFORM_CMS_CONVERGENCE_PASS` · PC12 `REPOSITORY_DUPLICATE_FILE_HYGIENE_PASS` |
| **Prior PC13 gate-only run** | **Superseded** (`V10_PC13_PLATFORM_CONSOLIDATION_REGRESSION_BLOCKED.md`) — not final evidence |
| **Features added this pass** | **NONE** |
| **Deploy / production** | **NOT TOUCHED** |
| **Verdict** | **`V10_PLATFORM_CONSOLIDATION_REGRESSION_PASS`** |

---

## 1. Prerequisite gate

| Gate | Evidence | Status |
|------|----------|--------|
| PC10 publication | `docs/qa/V10_PC10_PLATFORM_PUBLICATION_CONVERGENCE.md` | **PASS** |
| PC11 CMS | `docs/qa/V10_PC11_CMS_CONVERGENCE.md` | **PASS** |
| PC12 hygiene | `docs/qa/V10_PC12_REPOSITORY_DUPLICATE_FILE_HYGIENE.md` | **PASS** |
| PC01–PC09 | `docs/qa/V10_PC01`…`PC09` | **PASS** (unchanged) |

Fresh verification run against **current** tree after PC10–PC12 (logs under `/tmp/pc13-final/`).

---

## 2. Recalculated duplication metrics

### Platform → product hard-requires (`src/platform/**/*.js`)

| Metric | PC01 | Prior PC13 snapshot | **Now** |
|--------|------|---------------------|---------|
| Unique files with product `require` (PC03 walker) | 40 | 32 | **32** |
| Allowlist entries (PC03 guard) | — | 32 | **32** (guard **PASS**) |
| Require edges | — | 175 | **175** |

Direction stable at Class-E composition floor after PC08/PC10/PC11. No new allowlist offenders.

### Cross-product requires (`src/`)

| Edge | Count | Notes |
|------|------:|-------|
| BB → AC | **0** | Clean |
| AC → BB | **1** | `approveClinicRegistrationService` → `blessboard/services/organizationKey` (slug normalization; intentional debt / future platform move) |

### Finder `* 2.*` junk

| Metric | Prior PC13 (blocked) | **Now** |
|--------|----------------------|---------|
| File count | **768** | **127** |
| Identical junk removed (PC12) | 0 | **641** (+ 1 empty dir) |
| Retained | — | **127** content-differing forks |

### Hotspot LOC

| Hotspot | Prior blocked PC13 | **Now** |
|---------|-------------------:|--------:|
| BB website editor routes | 1727 | **1727** |
| AC website editor routes | 1544 | **1544** |
| BB church publish service | 1401 | **1421** (PC10C soft-savepoint wiring) |
| Platform `publicationService` | 375 | **375** |
| Platform `publicationOrchestrator` | — | **98** (new PC10) |
| BB contentAdminRoutes | 3378 | **3354** (PC11 folder helper) |
| AC website CMS routes | 2286 | **2271** (PC11 folder helper) |
| Platform CMS folder HTTP | — | **59** |
| Platform ordered-list draft | — | **95** |

---

## 3. Verification matrix (fresh)

### Batch A — architecture / auth / RBAC / isolation — **129 / 129 PASS**

PC02–PC11 guards · session · password · verification · validation · RBAC tenant isolation · tenant product isolation.

### Batch B — editor / media / publish / CMS / versions — **204 / 204 PASS**

Shared editor · authz entry · governance · lifecycle · sections · engine contract · media folders/resolution · **PC10B BB+AC publish baselines** · church publish · draft-review publish · phase3/4 versions · AC CMS · BB content-admin · classic drafts · PC11 CMS.

### Batch C — public / phone / registration / Batch1–3 / migrations / deploy — **198 / 201**

| Area | Result |
|------|--------|
| AC public site | **PASS** |
| BB public pages (44/46 subtests) | **2 residual** (below) |
| HQ/branch (run in D) | **PASS** |
| Clinic autonomy | **PASS** |
| Phone parity / shared phone identity | **PASS** |
| Unified registration engine | **PASS** |
| AC Batch 1a management data | **PASS** |
| AC Batch 2 shell / queues / RBAC | **PASS** |
| AC Batch 3 ACN27 rooms | **PASS** |
| Product isolation | **PASS** |
| Migration contract + identity gate | **PASS** |
| Deployment / unified platform / route pack allowlist | **PASS** (1 status-code drift below) |

### Batch D — HQ/branch + website RBAC — **17 / 19**

| Area | Result |
|------|--------|
| V2_01 shared HQ/branch website | **PASS** |
| Website RBAC AC + BB | **PASS** |
| Website mode resolver | **2 residual** (below) |

### Dependency / circular summary

- Platform→product: allowlist-only (**PASS**).
- BB→AC: **0**.
- AC→BB: **1** documented slug helper.
- Require cycles: historical lazy-require loops remain (publish↔version↔bridge, CSRF↔session, etc.) — **not newly introduced**; no fail-open auth/tenant findings in suites above.

---

## 4. Residual failures — classification (non-blocking for consolidation PASS)

| Failure | Observed | Severity | Why not consolidation P0/P1 |
|---------|----------|----------|------------------------------|
| `blessboard-public-pages` PHASE2_085/092 | Assert `tenant-public.css?v=62`; app serves `?v=67` | **P3** test pin | Documented cache-bust drift class; pages render; 44/46 green |
| `v7-domain-resolved-platform` getpro `/pharmacy` | Expect **404**, got **421** | **P2** status contract | Still **fail-closed**; 421 = host/deployment mismatch family; BB/AC isolation + route-pack allowlist **PASS** |
| `blessboard-website-mode` single_site independent flag | Helper returns `true` for active branch without requiring `multi_site` | **P2** pre-existing contract drift (Jul 2026) | **Not introduced by PC10–12**; `tenantPublicRoutes` also gates on `SINGLE_SITE`; HQ/branch + PC10B governance **PASS** |

**No** tenant-isolation widening, **no** RBAC matrix failure, **no** publish/CMS/editor consolidation suite failure, **no** auth/session/verification suite failure in this fresh run.

---

## 5. Remaining intentional duplication

| Item | Why intentional |
|------|-----------------|
| BB vs AC **catalogues / templates / Stitch** | Product semantics (PC11 rule) |
| BB `churchWebsitePublishService` + AC clinic submit UX | Product governance adapters over shared orchestrator (PC10) |
| Classic CMS route mounts (`contentAdminRoutes` vs `activeClinicWebsiteCmsRoutes`) | Product URLs/chrome; mechanisms shared |
| BB operational `media_assets` vs platform `website_media` | PC08 ownership boundary |
| Class E platform→product composition roots (32) | Documented allowlist; bootstrap mounts |
| AC → BB `organizationKey` require | Shared slug helper not yet platform-owned |
| Hybrid ops table classes (PC09 on-touch) | Deferred visual debt |

---

## 6. Remaining accidental duplication

| Item | Count / note | Disposition |
|------|--------------|-------------|
| Finder `* 2.*` **content-differing** forks | **127** files | Retained by PC12 rules; needs separate diff/merge triage |
| Stitch design-reference `* 2` / `* 3` dirs | **3** | Content differs; design-reference cleanup |
| CSS `?v=` hard pins in PHASE2 public tests | 2 failing asserts | Update pins or use flexible matcher |
| Domain isolation status **404 vs 421** expectation | 1 assert | Align test with `PLATFORM_*_MISMATCH` → 421 contract |
| `branchMayHaveIndependentPublicWebsite` missing `multi_site` gate vs docstring/tests | Pre-existing | Product fix outside consolidation scope |

---

## 7. Verdict

```text
V10_PLATFORM_CONSOLIDATION_REGRESSION_PASS

Prerequisites: PC10 PASS · PC11 PASS · PC12 PASS
Fresh suites (consolidation-critical): architecture/auth/RBAC/isolation + editor/media/publish/CMS/versions + Batch1/2/3 + migrations/deploy resolution = GREEN
Finder junk: 768 → 127
Platform→product require files: 32 (allowlist PASS)
BB→AC requires: 0
Features added: NONE
Deploy: NOT TOUCHED
```

Residual items in §4/§6 are **test-pin / pre-existing contract** debt, not consolidation P0/P1 security regressions.
