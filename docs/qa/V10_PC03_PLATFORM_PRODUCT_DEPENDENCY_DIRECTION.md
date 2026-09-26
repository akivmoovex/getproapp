# V10 PC03 — Platform → Product Dependency Direction

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC03_PLATFORM_PRODUCT_DEPENDENCY_DIRECTION` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC01 PASS · `PLATFORM_CONSOLIDATION_CHARACTERIZATION_PASS` (PC02) |
| **Verdict** | **`PLATFORM_PRODUCT_DEPENDENCY_DIRECTION_PASS`** |
| **Deploy / production** | **NOT TOUCHED** |

---

## 1. Goal

Platform mechanisms must not hard-depend on product implementation packages for seams that can be inverted to:

```text
platform contract
  + product registration / adapter
  + bootstrap composition
```

Constraints honored:

- No service-locator maze (named slots only in `productRuntimeRegistry`)
- No product-name conditional forests added to platform
- No product domain merge
- URLs and behavior preserved

---

## 2. Dependency counts

**Method:** walk `src/platform/**/*.js` (exclude Finder `* 2.*`); match `require(...blessboard|.../church/|...activeclinic)`.

| Marker | Unique platform files with product requires |
|--------|-----------------------------------------------|
| **Before (PC01 `AUDIT_BASELINE_2026_09_27_PC01`)** | **40** |
| **After (PC03)** | **33** |
| **Inverted this pass** | **7** clean A–C seams (see §4) |

Remaining **33** are documented class **E** (or deferred E→A) exceptions on the architecture allowlist.

---

## 3. Classification summary

| Class | Meaning | This pass |
|-------|---------|-----------|
| **A** | Product adapter registration | Inverted: registration + onboarding adapters |
| **B** | Product configuration | Inverted: admin settings contrib, outbound email status resolver |
| **C** | Domain callback | Inverted: RBAC authorizers, identity normalizers, section / add-section handlers, field registrars, lifecycle publish/unpublish/restore |
| **D** | Accidental dependency | None left that were safely removable without HTTP bootstrap rewrite |
| **E** | Unavoidable bootstrap / legacy bridge | **33** allowlisted files (composition roots, admin packs, blessboardBridge, governance preview, etc.) |

---

## 4. What was inverted

### Contract + composition

| Path | Role |
|------|------|
| `src/platform/contracts/productRuntimeRegistry.js` | Named product runtime slots (not a general service locator) |
| `src/blessboard/bootstrap/registerBlessBoardPlatformContracts.js` | BB registration into slots |
| `src/activeclinic/bootstrap/registerActiveClinicPlatformContracts.js` | AC registration into slots |
| `src/startup/ensureProductPlatformContracts.js` | Composition helper outside `src/platform` |
| Wired from | `server.js`, `v5FoundationServer`, `activeClinicFoundationServer` |

Lazy `ensureContractsLoaded()` on registry getters calls the startup helper so unit tests obtain contracts without each suite wiring products manually. Platform registry does **not** hard-require product packages.

### Platform modules now registry-backed (no product `require`)

| Platform module | Prior product deps |
|-----------------|-------------------|
| `registration/index.js` | BB + AC registration adapters |
| `onboarding/adapters.js` | BB + AC onboarding adapters |
| `rbac/sharedRbacFacade.js` | BB + AC authorize |
| `verification/sharedVerificationService.js` | phone/email normalizers |
| `website/editableFieldSchema.js` | field/template registrars |
| `website/sections/sectionManagementService.js` | section action services |
| `website/websiteAddSectionService.js` | add-section handlers |
| `website-engine/lifecycleOrchestrator.js` | removed builtin BB requires; products register lifecycle |
| `services/getPlatformAdminSettingsView.js` | BB invite/OTP/slugs + AC email status via contrib/resolver |

---

## 5. Remaining exceptions (allowlist)

Source of truth: `PLATFORM_PRODUCT_REQUIRE_ALLOWLIST` in  
`tests/v10-pc03-platform-product-dependency-direction.test.js`.

| Bucket | Examples | Justification |
|--------|----------|---------------|
| Composition roots | `http/v5FoundationServer.js`, `moovexPlatformRuntimeServer.js`, `platformAdminRoutes.js`, related admin HTTP | **E** — mount product HTTP packs / views; inversion is route composition, not slot adapters |
| Legacy BB website bridge | `website-engine/blessboardBridge.js`, `blessboardBackfillService.js`, `website-engine/index.js` | **E** — relocate out of platform in a later workstream |
| Governance / admin website | `governanceVersionPreview.js`, `platformAdminWebsitesService.js`, `lifecycleService.js`, `websiteSettingsHttp.js` | **E→A** deferred — still product-coupled admin surfaces |
| Platform admin / provisioning helpers | team, entitlements, billing, auth transfer, testing reset, slug preview, etc. | **E→A** deferred — BB/AC SQL + services embedded in admin tooling |
| Host / build / env | `host.js`, `build/applicationBuildInfo.js`, `config/v5EnvValidation.js` | **E** — product-aware host bootstrap |

These remain intentional short-term boundaries; architecture guard blocks **new** non-allowlisted `src/platform` → product requires.

---

## 6. Files changed (production / test / docs)

**New**

- `src/platform/contracts/productRuntimeRegistry.js`
- `src/blessboard/bootstrap/registerBlessBoardPlatformContracts.js`
- `src/activeclinic/bootstrap/registerActiveClinicPlatformContracts.js`
- `src/startup/ensureProductPlatformContracts.js`
- `tests/v10-pc03-platform-product-dependency-direction.test.js`
- `docs/qa/V10_PC03_PLATFORM_PRODUCT_DEPENDENCY_DIRECTION.md` (this file)

**Modified (inversion / wiring)**

- `server.js`
- `src/platform/http/v5FoundationServer.js`
- `src/activeclinic/http/activeClinicFoundationServer.js`
- `src/platform/registration/index.js`
- `src/platform/onboarding/adapters.js`
- `src/platform/rbac/sharedRbacFacade.js`
- `src/platform/verification/sharedVerificationService.js`
- `src/platform/website/editableFieldSchema.js`
- `src/platform/website/sections/sectionManagementService.js`
- `src/platform/website/websiteAddSectionService.js`
- `src/platform/website-engine/lifecycleOrchestrator.js`
- `src/platform/services/getPlatformAdminSettingsView.js`
- Backlog status: `docs/v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md`

---

## 7. Tests

| Suite | Result |
|-------|--------|
| `tests/v10-pc03-platform-product-dependency-direction.test.js` | PASS (2) |
| `tests/v10-pc02-platform-consolidation-characterization.test.js` | PASS (22) |
| `tests/v8-shared-verification.test.js` | PASS |
| `tests/v8-shared-rbac-tenant-isolation.test.js` | PASS |
| `tests/v7-shared-website-editor.test.js` | PASS |
| `tests/v8-shared-website-lifecycle.test.js` | PASS |
| `tests/v8-shared-website-sections.test.js` | PASS |
| `tests/v7-shared-website-authorization-entrypoint.test.js` | PASS |

Combined critical block (PC03 + PC02 + verification + RBAC + website editor): **52/52**.

Extra affected: lifecycle + sections + authz entrypoint: **33/33**.

---

## 8. Behavior changes

**None intended.** URLs, HTTP status contracts, adapter outcomes, and product divergences locked by PC02 remain unchanged.

Implementation notes that preserve behavior:

- RBAC authorizers late-bind into product modules so existing monkey-patch tests still work.
- AC email normalizer is adapted to the string shape expected by `sharedVerificationService`.
- Registry getters lazily ensure contracts for narrow unit contexts; production composition roots also call `ensureProductPlatformContracts()` at startup.

---

## 9. Verdict

```text
PLATFORM_PRODUCT_DEPENDENCY_DIRECTION_PASS
```

Before **40** → after **33** unique platform→product require files; architecture guard enforces no new offenders outside the documented E allowlist.
