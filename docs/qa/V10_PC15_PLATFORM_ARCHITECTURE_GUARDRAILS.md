# V10 PC15 — Platform Architecture Guardrails

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PLATFORM_ARCHITECTURE_GUARDRAILS` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | PC14 `V10_PLATFORM_CONSOLIDATION_COMPLETE_WITH_GAPS` (no P0/P1 architecture/security blocker) |
| **Deploy / production** | **NOT TOUCHED** |
| **Verdict** | **`V10_PLATFORM_ARCHITECTURE_GUARDRAILS_PASS`** |

Developer SoT: [`docs/platform/PLATFORM_ARCHITECTURE_GUARDRAILS.md`](../platform/PLATFORM_ARCHITECTURE_GUARDRAILS.md)  
Cursor rule: `.cursor/rules/platform-architecture-guardrails.mdc` (`alwaysApply: true`)

---

## 1. Rules enforced

| Rule | Enforcement |
|------|-------------|
| DENY `src/platform` → blessboard / church / activeclinic implementation | Scanner + PC03/PC15 tests (Class E allowlist only) |
| DENY `src/blessboard` → activeclinic implementation | Scanner + PC15 |
| DENY `src/activeclinic` → blessboard / church implementation | Scanner + PC15 (exceptions listed) |
| ALLOW product → platform | Not restricted |
| ALLOW adapter/bootstrap contract registration | Not restricted |
| Do **not** force theme / navigation / domain catalogue sharing | Documented; not scanned |

Developer search rule (before product-local infra): search `src/platform`, `views/platform`, `public/platform`, then the other product for *platform* patterns only. Generic → platform + adapter; domain semantics → product.

---

## 2. Explicit exceptions

### Platform → product (Class E) — 32 files

SoT: `scripts/architecture/dependencyDirectionAllowlists.js` → `PLATFORM_PRODUCT_REQUIRE_ALLOWLIST`  
(composition roots, blessboardBridge, platform-admin BB-tied helpers, etc.)

### Cross-product — 3 edges

| Source | Requires | Debt |
|--------|----------|------|
| `activeclinic/.../approveClinicRegistrationService.js` | `blessboard/services/organizationKey` | Move normalizer to platform |
| `activeclinic/.../activeClinicPublicRoutes.js` | `church/blessBoardEnv` | Shared env helper relocation |
| `activeclinic/.../activeClinicPlatformAdminClinicRegistrationRoutes.js` | `church/blessBoardEnv` | Same |

BB → `src/church` remains **allowed** (same product family).

---

## 3. Artifacts

| Path | Role |
|------|------|
| `scripts/architecture/dependencyDirection.js` | CLI scanner (exit 1 on violation) |
| `scripts/architecture/dependencyDirectionAllowlists.js` | Allowlist SoT |
| `tests/v10-pc15-architecture-guardrails.test.js` | Guardrail suite |
| `tests/v10-pc03-platform-product-dependency-direction.test.js` | Uses shared scanner |
| `npm run test:architecture` | CI/local command |

---

## 4. Test evidence

```bash
npm run test:architecture
# → scanner ok (platformAllowlistSize: 32, crossAllowlistSize: 3)
# → PC15 + PC03: 7/7 PASS

node --test --test-concurrency=1 \
  tests/v10-pc15-architecture-guardrails.test.js \
  tests/v10-pc03-platform-product-dependency-direction.test.js \
  tests/v10-pc10-publication-convergence.test.js \
  tests/v10-pc11-cms-convergence.test.js \
  tests/v10-pc07-shared-website-editor-http.test.js \
  tests/v8-tenant-product-isolation.test.js
# → 31/31 PASS
```

---

## 5. Verdict

```text
V10_PLATFORM_ARCHITECTURE_GUARDRAILS_PASS

CI/test command: npm run test:architecture
```
