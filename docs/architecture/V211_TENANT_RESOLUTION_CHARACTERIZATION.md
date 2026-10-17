# V211 Tenant-Resolution Characterization

Branch `V11`, commit `90eaa4d5e9ef6e62d45f058bb38b63d10dd144ff`. This batch documents current behavior only. No resolver, product, startup, deployment, session, CSRF, RBAC, database, or migration code was changed.

## Existing entrypoints

### Platform

- Static host registry: `src/platform/config/canonicalHostRegistry.js`
  - `normalizeCanonicalHostname(raw)`
  - `resolveCanonicalHost(rawHostname)`
- Request host selection: `src/platform/http/resolveRequestHostname.js`
  - `resolveRequestHostname(req, opts)`
  - `resolveRequestCanonicalSite(req, opts)`
  - `resolveRequestCanonicalSiteAsync(req, opts)`
- Database-backed dynamic host resolution: `src/platform/services/resolveHostname.js`
- Deployment selection: `src/platform/config/deploymentProfiles.js`
- Product identity registry: `src/platform/config/productRegistry.js`
- Diagnostic middleware: `src/platform/http/loadPlatformHostContext.js`

The static resolver uses exact canonical-host matching. Request resolution uses the existing trusted-proxy contract and then the exact allowlist. Dynamic tenant lookup is only attempted by the async resolver when the static host is unknown and a database is supplied.

### BlessBoard

- Compact tenant context: `src/blessboard/http/buildBlessBoardTenantContext.js`
- Session-scoped church/branch context: `src/blessboard/http/loadSessionScopedTenantContext.js`
- Host attachment compatibility path: `src/church/attachChurchContext.js`, `src/tenants/index.js`
- Branch ownership check: `loadActiveBranchForChurch(...)`
- Product-specific authorization remains in BlessBoard/church services and is not granted by context construction.

`buildBlessBoardTenantContext` returns `null` unless organization, church, HQ branch, and primary branch identities are all present. It copies identifiers into a compact context and does not attach admin/authorization flags.

### ActiveClinic

- Product/organization context middleware: `src/activeclinic/http/loadActiveClinicProductContext.js`
- Product organization lookup: `src/platform/services/organizationProductService.js`, via `resolveOrganizationForProduct(...)`
- Healthcare organization lookup: `src/activeclinic/services/healthcareOrganizationService.js`
- Facility behavior is explicitly not globally resolved by the product-context loader.

The loader starts with deployment-only context, rejects product mismatch, resolves an organization only when an organization key is supplied, and optionally resolves an active healthcare organization. It does not grant clinical permissions or facility authority.

## Characterization matrix

| Area | Current behavior | Evidence |
|---|---|---|
| Valid BB host | Exact canonical site, product `blessboard`, testing environment | New test 1 |
| Valid AC host | Exact canonical site, product `activeclinic`, testing environment | New test 1 |
| Unknown/unsupported host | Rejected by exact registry | New test 2 |
| Malformed host | Rejected before registry lookup | New test 2 |
| Forwarded host | First forwarded-host hop is used when one proxy hop is trusted | New test 3 |
| Deployment profile | Product and environment come from profile registry | New test 4 |
| BB missing context | Compact builder returns `null` | New test 5 |
| BB branch context | HQ and primary branch remain separate identifiers | New test 6; existing BB tenant tests |
| AC missing context | Deployment-only context is retained | New test 7 |
| AC product mismatch | Resolution is `product_mismatch`; tenant lookup is not performed | New test 7 |
| AC unknown organization | Resolution is `denied`; organization/facility remain null | New test 8 |
| Product boundary | BB and AC product keys remain distinct | New test 9; existing isolation tests |
| Authorization boundary | Context objects do not add admin/clinical permissions | New tests 6 and 8 |

## Security invariants

- Hostnames are normalized and exact-allowlisted; substring or arbitrary product selection is not accepted.
- Deployment profile product/environment identity is separate from product business policy.
- Tenant context does not itself grant authorization.
- BB and AC organization/product lookups fail closed across product boundaries.
- ActiveClinic facility is not globally inferred by the product context loader.
- Existing session and CSRF contracts were not changed.
- The current trusted-proxy behavior intentionally selects the first forwarded-host hop for one trusted proxy hop; later comma-separated hops are not selected. This is characterized behavior, not a new security policy.

## Tests executed

New:

```sh
NODE_PATH=../getpro/node_modules node --test --test-concurrency=1 tests/v211-tenant-resolution-characterization.test.js
```

Result: 9 passed, 0 failed, 0 skipped.

Existing focused regression:

```sh
NODE_PATH=../getpro/node_modules node --test --test-concurrency=1 \
  tests/tenant-host-routing.test.js \
  tests/platform-host-context-middleware.test.js \
  tests/host-tenant-mapping.test.js \
  tests/church-attach-tenant-by-host.test.js \
  tests/v8-tenant-product-isolation.test.js \
  tests/v8-shared-rbac-tenant-isolation.test.js \
  tests/blessboard-tenant-context-website-routes.test.js \
  tests/v10-pc15-architecture-guardrails.test.js \
  tests/v10-pc03-platform-product-dependency-direction.test.js
```

Result: 75 passed, 0 failed, 0 skipped across 12 suites. The dependency-direction and architecture guardrail tests passed.

## Divergences and limitations

1. The proposed future `resolveProductTenantContext(request)` API does not exist and was not implemented.
2. The trusted-proxy test confirms current first-hop behavior; it does not approve changing proxy trust or adding a new forwarded-host policy.
3. The new tests use safe mocks for ActiveClinic context and the compact BlessBoard builder. Existing database-backed BB/AC isolation and tenant-context suites supplied integration evidence.
4. Dynamic database-host resolution and every deployment profile were not exhaustively exercised in this batch.

## Extraction readiness

`EXTRACTION_READY=NO`. Characterization is green, but tenant resolution remains security-sensitive and the future shared API still needs a contract review, dynamic-host/database coverage, and product-adapter design before implementation.
