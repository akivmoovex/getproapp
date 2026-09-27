# Platform architecture guardrails (V10 PC15)

| Field | Value |
|-------|--------|
| **Doc ID** | `PLATFORM_ARCHITECTURE_GUARDRAILS` |
| **Enforcement** | `npm run test:architecture` · `tests/v10-pc15-architecture-guardrails.test.js` · `tests/v10-pc03-platform-product-dependency-direction.test.js` |
| **Allowlists** | `scripts/architecture/dependencyDirectionAllowlists.js` |
| **Scanner** | `scripts/architecture/dependencyDirection.js` |

---

## Developer rule

Before creating **product-local infrastructure**, search:

1. `src/platform`
2. `views/platform`
3. `public/platform`
4. The other product (to discover shared *platform* patterns — not to import the other product’s domain)

| Kind | Placement |
|------|-----------|
| Generic mechanism | Platform + product adapter / bootstrap registration |
| Domain semantics | Product only |

Do **not** force shared themes, navigation, or domain catalogues across BlessBoard and ActiveClinic.

---

## Dependency direction

### DENY

| From | To |
|------|-----|
| `src/platform` | `src/blessboard`, `src/church`, `src/activeclinic` implementation |
| `src/blessboard` | `src/activeclinic` implementation |
| `src/activeclinic` | `src/blessboard` or `src/church` implementation |

### ALLOW

- Product → platform
- Adapter / bootstrap registration into platform contracts (`productRuntimeRegistry`, publication governance, website field registrars, etc.)
- BlessBoard → `src/church` (same product family / legacy church package)

### Explicit exceptions (shrink over time)

See `PLATFORM_PRODUCT_REQUIRE_ALLOWLIST` (Class E composition roots / legacy bridges) and `CROSS_PRODUCT_REQUIRE_ALLOWLIST` (currently: AC→BB `organizationKey`; AC→`church/blessBoardEnv`).

---

## CI / local command

```bash
npm run test:architecture
```

Equivalent:

```bash
node scripts/architecture/dependencyDirection.js
node --test tests/v10-pc15-architecture-guardrails.test.js tests/v10-pc03-platform-product-dependency-direction.test.js
```

Violations exit non-zero and print the offending file + `require(...)` paths with the rule name.
