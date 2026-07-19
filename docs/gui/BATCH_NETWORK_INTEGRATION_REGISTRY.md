# BATCH_NETWORK_INTEGRATION_REGISTRY — gate stop

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **NOT STARTED** — entry gate failed  
**Prompt:** 54. IMPLEMENT NETWORK INTEGRATION REGISTRY

## Gate

Sources:

- [`NETWORK_BLOCKED_FEATURES.md`](../product/NETWORK_BLOCKED_FEATURES.md) (B4 / N2)
- [`NETWORK_SCREEN_AND_FEATURE_COVERAGE.md`](../product/NETWORK_SCREEN_AND_FEATURE_COVERAGE.md)
- [`NETWORK_ENTITLEMENT_MATRIX.md`](../product/NETWORK_ENTITLEMENT_MATRIX.md)
- [`NETWORK_IMPLEMENTATION_QUEUE.md`](./NETWORK_IMPLEMENTATION_QUEUE.md)
- [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md)

| Check | Result |
|-------|--------|
| Blocked-feature class | **B4** — External integrations = **REQUIRES_EXTERNAL_SERVICE** |
| Product decision | **N2** unsigned (API/webhook/**integration** protocol; self-serve vs assisted) |
| Runtime `FEATURE_KEYS.integrations` | **false** on all plans (reserved; by arrangement) |
| Approved integration-type allow-list | **None** in product SoT |
| Provider adapters | **None** (prompt correctly forbids inventing them) |
| Third-party secret vault | **Unsupported** — no BlessBoard pattern for vendor OAuth/API secrets beyond session/API-key hash designs that are themselves not READY |
| Canonical Stitch integration screens | **None** in [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (cannot match SoT) |
| Network queue | Explicitly **excludes** REQUIRES_EXTERNAL_SERVICE rows; no schema for integrations without approved providers |

## Why this batch did not run

A “safe registry” still needs (1) a product-approved fixed type allow-list, (2) Network entitlement activation policy, and (3) honest status semantics that do not invent “connected” without adapters. Shipping HQ/PA registry GUI + migration now would invent integration types and a generic bus that B4 and the Network queue forbid, activate or imply `integrations` before N2, and invent Stitch-parity chrome with no canonical screens.

Secret values: prompt requires existing secure secret-management **or remain unsupported**. There is no approved third-party credential store; remaining unsupported means **do not** add secret columns that pretend vaulting exists.

Without adapters, the only honest statuses are effectively “unavailable / by arrangement / disabled” — which is already commercial language, not a new registry product.

## Unchanged

- No integration registry migration  
- No allow-list service or HQ/PA routes  
- No connection-status GUI  
- No `integrations` entitlement activation  
- No provider adapters (also out of prompt scope)  
- No arbitrary URL / code-execution configuration  

## Resume when

1. Product closes **N2** for integrations (which types, assisted vs self-serve), **and**  
2. An approved fixed allow-list is written into product SoT (design doc), **and**  
3. Canonical Stitch integration screens exist or the prompt waives Stitch match, **and**  
4. Secret policy is explicit (hash-only metadata / assisted-only / unsupported), **and**  
5. Prompt 54 is re-issued for registry-only (still **stop before provider adapters**)

Until then: do not re-run this implementation prompt as written.

## Suggested follow-up

Write `docs/product/NETWORK_INTEGRATION_REGISTRY_DESIGN.md` (types allow-list, status enum, no-connected-without-adapter rule, secret unsupported) → Stitch or waive → then ship registry chrome with Growth denial and `integrations` still false until activation is approved.
