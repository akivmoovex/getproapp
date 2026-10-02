# V10 PC19 — Cross-Product Dependency Verification

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC19_CROSS_PRODUCT_DEPENDENCY_ZERO` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | PC18 `PLATFORM_ORGANIZATION_KEY_LIFT_PASS` |
| **Deploy / production DB** | **NOT TOUCHED** |
| **Verdict** | **`CROSS_PRODUCT_DEPENDENCY_ZERO_PASS`** |

---

## 1. Before (post-PC18)

| Metric | Count |
|--------|------:|
| BB → AC implementation requires | **0** |
| AC → BB implementation requires | **0** |
| AC → church implementation requires | **2** (allowlisted) |
| `CROSS_PRODUCT_REQUIRE_ALLOWLIST` | **2** |
| Platform Class E allowlist | **31** |

Remaining AC→church edges:

| Source | Requires | Classification |
|--------|----------|----------------|
| `activeclinic/http/activeClinicPublicRoutes.js` | `church/blessBoardEnv` (`getDeploymentEnvMode`) | **Generic mechanism** — deployment mode gate |
| `activeclinic/http/activeClinicPlatformAdminClinicRegistrationRoutes.js` | same | **Generic mechanism** |

Not product semantics (no clinic/church domain merge).

---

## 2. Fix applied (generic only)

| Change | Detail |
|--------|--------|
| New SoT | `src/platform/config/deploymentEnv.js` — `getDeploymentEnvMode` / testing\|production gates |
| BB compatibility | `church/blessBoardEnv.js` re-exports mode helpers from platform (BlessBoard apex/domain config stays local) |
| AC consumers | Both AC routes → `platform/config/deploymentEnv` |
| Platform bonus | `applicationBuildInfo.js` → platform `deploymentEnv` (removed from Class E) |
| Allowlist | `CROSS_PRODUCT_REQUIRE_ALLOWLIST = []` |

**Not moved:** BlessBoard canonical/apex/domain helpers, church upload roots, BB job switches, church-specific org-testing detectors.

---

## 3. After

| Metric | Count |
|--------|------:|
| BB → AC implementation requires | **0** |
| AC → BB implementation requires | **0** |
| AC → church implementation requires | **0** |
| `CROSS_PRODUCT_REQUIRE_ALLOWLIST` | **0** |
| Platform Class E allowlist | **30** |

```text
platformAllowlistSize: 30
crossAllowlistSize: 0
```

### Documented exceptions (not cross-product product→product)

Platform composition roots may still require product packages via **PC15 Class E** allowlist (`scripts/architecture/dependencyDirectionAllowlists.js`) — e.g. `v5FoundationServer`, `blessboardBridge`, platform-admin BB routes, `host.js` → church apex helpers. That is **platform → product composition**, not BB↔AC / AC→church product implementation coupling.

Test harness files may still import the other product for fixtures — out of scope for this runtime gate.

BB → `src/church` remains **same product family** (allowed).

---

## 4. Verification

```text
npm run test:architecture                          → PASS (7/7)
tests/v10-pc19-cross-product-dependency-zero.test.js → PASS (4/4)
tests/v10-pc18-organization-key-lift.test.js         → PASS
blessboard-platform-01-registration                  → PASS
v7-public-website-url-hardening                      → PASS
AC platform-02 (slug + registration success sample)  → PASS
bootstrap BB+AC registerPlatformContracts            → OK
```

Full-tree require scan of `src/activeclinic` / `src/blessboard`: **0** cross-product implementation edges.

---

## Marker

```text
CROSS_PRODUCT_DEPENDENCY_ZERO_PASS

BEFORE: BB→AC 0 | AC→BB 0 | AC→church 2 (allowlisted)
AFTER:  BB→AC 0 | AC→BB 0 | AC→church 0 | crossAllowlist 0
```
