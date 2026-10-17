# V211 Tenant Resolution Contract Review

Branch `V11`; baseline `75ce74d93fdac069dd511026b556b254f5e16e42`. This is a test/design-only review. No runtime refactoring, database mutation, migration, deployment, or production access occurred.

## Existing authority and call chain

1. `createLoadPlatformRequestContext` in `src/platform/http/platformRequestContext.js` obtains deployment configuration, resolves the request host through `resolveRequestCanonicalSiteAsync` when a pool exists, and then builds immutable `req.platform`.
2. `resolveRequestCanonicalSiteAsync` in `src/platform/http/resolveRequestHostname.js` first checks `canonicalHostRegistry.js`. Static canonical hosts always take precedence and do not query the database.
3. Unknown static hosts are passed to `resolveHostname` in `src/platform/services/resolveHostname.js`, which normalizes the hostname and calls `findDomainContextByHostname` in `src/platform/repositories/domainRepository.js`.
4. `resolveHostname` evaluates domain validity/status, deployment status and expected deployment code, product status, organization status, enrolment presence/status, and then returns `resolved_tenant` or a specific failure type.
5. `loadActiveClinicProductContext.js` consumes deployment/product context and uses `resolveOrganizationForProduct` for an explicit organization key; healthcare organization lookup is optional and facility is not globally resolved.
6. BlessBoard uses `buildBlessBoardTenantContext.js` and session-scoped church/branch loaders. Church, branch, membership, and authorization semantics remain product-owned.

## Dynamic-host test matrix

| Scenario | Current result | Evidence |
|---|---|---|
| Dynamic BlessBoard hostname | `resolved_tenant`, product `blessboard` | Characterization test |
| Dynamic ActiveClinic hostname | `resolved_tenant`, product `activeclinic` | Characterization test |
| Unknown hostname | `unknown_domain` | Characterization test |
| Inactive domain | `inactive_domain` | Characterization test |
| Inactive product | `inactive_product` | Characterization test |
| Inactive organization | `inactive_organization` | Characterization test |
| Suspended/inactive assignment | `inactive_enrolment` | Characterization test |
| Missing organization | `missing_organization` | Characterization test |
| Missing product assignment | `missing_enrolment` | Characterization test |
| Deployment mismatch | `deployment_mismatch` | Characterization test |
| Environment mismatch | Current async dynamic resolver carries organization environment; it does not independently reject it | Characterization test |
| Unrelated product row | Generic resolver returns `resolved_tenant` for the row's product; caller/profile enforcement remains separate | Characterization test |
| Missing database resolver | Static unknown host remains `UNKNOWN_PLATFORM_HOST` | Characterization test |
| Database failure | Static unknown host remains `UNKNOWN_PLATFORM_HOST` | Characterization test |
| Static/canonical precedence | Static host resolves without database query | Characterization test |
| Forwarded host | First forwarded-host hop is selected under one trusted proxy hop | Characterization test |

The test uses controlled in-memory query stubs and does not claim live database coverage.

## Deployment profile matrix

Dynamic tenant support is available through the database-backed resolver for unknown static hosts when a pool is supplied. Profile-specific deployments use profile product selection; hostname deployments additionally enforce host allowlists and platform-line checks. Canonical static hosts bypass dynamic lookup.

| Deployment code | Env | Product selection / expected product | Canonical hosts | Dynamic host path | DB env | Trust proxy | Session cookie | Runtime |
|---|---|---|---|---|---|---:|---|---|
| `blessboard-com-production` | production | profile / BlessBoard | blessboard.com, www | profile resolver | production | 1 | `blessboard_com_sid` | v5-foundation |
| `blessboard-org-staging` | testing | profile / BlessBoard | blessboard.org, www | profile resolver | testing | 1 | `blessboard_org_sid` | v5-foundation |
| `blessboard-pronline-testing` | testing | profile / BlessBoard | blessboard.pronline.org | profile resolver | testing | 1 | `blessboard_pronline_sid` | v5-foundation |
| `blessboard-org-legacy-redirect` | production | profile / BlessBoard | blessboard.org, www | redirect only | production | 1 | `blessboard_org_redirect_sid` | legacy-redirect |
| `activeclinic-org-v6` | testing | profile / ActiveClinic | activeclinic.org, www | profile resolver | testing | 1 | `activeclinic_org_sid` | v5-foundation |
| `activeclinic-org-production` | production | profile / ActiveClinic | activeclinic.org, www | profile resolver | production | 1 | `activeclinic_org_prod_sid` | v5-foundation |
| `activeclinic-pronline-testing` | testing | profile / ActiveClinic | activeclinic.pronline.org | profile resolver | testing | 1 | `activeclinic_pronline_sid` | v5-foundation |
| `getproapp-org-production` | production | profile / GetPro | getproapp.org, www | profile resolver | production | 1 | `getproapp_org_sid` | v5-foundation |
| `getpro-pronline-testing` | testing | profile / GetPro | getproapp.pronline.org, legacy alias | profile resolver | testing | 1 | `getpro_pronline_sid` | v5-foundation |
| `netraz-org-production` | production | profile / NGO | netraz.org, www | profile resolver | production | 1 | `netraz_org_sid` | v5-foundation |
| `netraz-pronline-testing` | testing | profile / NGO | netraz.pronline.org | profile resolver | testing | 1 | `netraz_pronline_sid` | v5-foundation |
| `moovex-org-production` | production | profile / Platform | moovex.org, www | profile resolver | production | 1 | `moovex_org_sid` | v5-foundation |
| `moovex-platform-testing` | testing | hostname / registry | pronline product hosts | dynamic tenant path | testing | 1 | `moovex_platform_testing_sid` | v5-foundation |
| `moovex-platform-v8-testing` | testing | hostname / registry | neuniversity product hosts | dynamic tenant path | testing | 1 | `moovex_platform_v8_testing_sid` | v5-foundation |
| `moovex-platform-production` | production | hostname / registry | production product hosts | dynamic tenant path | production | 1 | `moovex_platform_production_sid` | v5-foundation |

`blessboard-org-v5` and `blessboard-com-v4` are compatibility aliases and should remain documented separately from active canonical profiles.

## Proposed API review

### Proposed shape

```text
resolveProductTenantContext(request) -> {
  productKey,
  organizationId,
  tenantKey,
  deploymentProfile
}
```

### Required contract if ever implemented

- **Input:** request, trusted host resolution, deployment identity, and optional query-capable database dependency.
- **Output:** immutable routing context only: product key, organization ID, tenant key, deployment profile, environment, canonical hostname, and source.
- **Failure codes:** preserve `INVALID_HOSTNAME`, `UNKNOWN_DOMAIN`, `INACTIVE_DOMAIN`, `INACTIVE_DEPLOYMENT`, `DEPLOYMENT_MISMATCH`, `INACTIVE_PRODUCT`, `MISSING_ORGANIZATION`, `INACTIVE_ORGANIZATION`, `MISSING_ENROLMENT`, `INACTIVE_ENROLMENT`, environment/host mismatch, and profile/host mismatch semantics.
- **Product key:** registry-backed only; never inferred from arbitrary hostname substrings or organization data.
- **Trust boundary:** normalize host, apply current trusted-proxy policy, then exact registry/database lookup; unknown and malformed hosts fail closed.
- **Database dependency:** explicit injected pool/client only; no environment reads or implicit pool creation.
- **Authorization boundary:** context resolution grants no role, membership, patient, staff, branch, clinical, or admin permission.
- **Product adapters:** BlessBoard adds church/branch semantics; ActiveClinic adds healthcare organization/facility semantics. Neither is part of generic Platform context.
- **No side effects:** no session, CSRF, cookie, route, or response mutation beyond existing middleware contract.

## Recommendation

`PROPOSED_API_DECISION=NOT_IMPLEMENTING_AS_A_SECOND_AUTHORITY`. Existing `resolvePlatformRequestContext` plus `resolveRequestCanonicalSiteAsync` already supplies the generic Platform host/deployment/product authority. A new top-level resolver with the same responsibility would create competing authority and duplicate failure handling.

If a named API is later needed for readability, extend `resolvePlatformRequestContext` or expose a thin alias with no independent logic. Do not create a parallel database query or product resolver.

## Security ambiguities

1. The dynamic async resolver carries `organization_data_environment` into the site result but does not itself reject a runtime/environment mismatch. The full request-context layer rejects the mismatch with `PLATFORM_ENVIRONMENT_HOST_MISMATCH`; this is a defense-in-depth gap, not a confirmed request-path defect.
2. A generic dynamic row for an unrelated product resolves according to the row. Product/profile boundary enforcement must occur in the caller and must not be assumed from hostname lookup alone.
3. One trusted proxy hop consumes the first forwarded-host hop. Changing this policy requires deployment-topology review.
4. Live database-backed dynamic-host coverage was not run in ARCH-06 because no database identity was verified for an explicitly disposable V2.11 QA database; only controlled query stubs and prior existing integration evidence were used.

## Smallest reversible next step

`SECURITY_FINDING=NO_DEFECT` with `DEFENSE_IN_DEPTH_GAP`. Do not implement the proposed API. If further evidence is required, add integration characterization against an existing disposable test fixture for the dynamic resolver and profile mismatch paths. Keep the current resolver and product adapters unchanged. Rollback is removal of the additional tests/report only.
