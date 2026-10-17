# V211 Dynamic Tenant Integration and Security Review

Branch `V11`, baseline `75ce74d93fdac069dd511026b556b254f5e16e42`. This review performed no runtime refactoring, database mutation, migration, deployment, or production access.

## Runtime call chain

```text
HTTP request
  -> resolveRequestHostname(req)
  -> normalizeCanonicalHostname()
  -> resolveRequestCanonicalSiteAsync()
       -> canonicalHostRegistry exact lookup
       -> [unknown static host + injected db]
          resolveHostname(db, hostname, expectedDeploymentCode)
            -> findDomainContextByHostname()
            -> domain/deployment/product/org/enrolment status checks
  -> resolvePlatformRequestContext()
       -> runtime/profile environment check
       -> hostname/profile/platform-line check
       -> product registry lookup
       -> immutable req.platform
  -> product adapter
       -> BB church/branch/session/authorization semantics
       -> AC organization/healthcare/facility/clinical semantics
```

`loadPlatformHostContext` is diagnostic/additive middleware and does not replace the authoritative request-context path.

## Database identity and authorization

No database was used in ARCH-06. The repository contains an explicitly guarded disposable foundation helper (`tests/helpers/foundationDb.js`) that allocates local `blessboard_ft_*` databases, but no live database identity was verified before this review. Therefore:

- `DATABASE_IDENTITY=NOT_VERIFIED`
- `DATABASE_AUTHORIZATION=NOT_PERFORMED`
- `DATABASE_INTEGRATION=BLOCKED_ENVIRONMENT`

No `DATABASE_URL`, production connection string, shared V10 database, or unverified test database was selected. Dynamic integration results below are controlled query-mock results, not live PostgreSQL evidence.

## Dynamic and boundary results

| Scenario | Result | Evidence |
|---|---|---|
| Dynamic BlessBoard tenant | PASS with controlled row | 18-test characterization suite |
| Dynamic ActiveClinic tenant | PASS with controlled row | 18-test characterization suite |
| Unknown hostname | `unknown_domain` / static `UNKNOWN_PLATFORM_HOST` | Characterization |
| Inactive domain | `inactive_domain` | Characterization |
| Inactive organization | `inactive_organization` | Characterization |
| Inactive product | `inactive_product` | Characterization |
| Inactive product assignment | `inactive_enrolment` | Characterization |
| Missing organization/enrolment | `missing_organization` / `missing_enrolment` | Characterization |
| Deployment mismatch | `deployment_mismatch` | Characterization |
| Static host precedence | PASS; database not queried | Characterization |
| Missing database | Fail closed to `UNKNOWN_PLATFORM_HOST` | Characterization |
| Database failure | Fail closed to `UNKNOWN_PLATFORM_HOST` | Characterization |
| Product boundary | PASS in product registry and isolation suites | Characterization and prior integration suite |
| Environment mismatch at resolver layer | Resolver carries organization environment | Characterization |
| Environment mismatch at request-context layer | Rejected as `PLATFORM_ENVIRONMENT_HOST_MISMATCH` | New characterization assertion |
| Forwarded-host policy | First hop used with trust-proxy `1` | Characterization |

## Security finding

`SECURITY_FINDING=NO_DEFECT`
`SECURITY_SEVERITY=DEFENSE_IN_DEPTH_GAP`

The async database resolver does not independently reject a different organization data environment. That behavior is not sufficient to establish a vulnerability: the complete request-context path applies `assertHostnameMatchesEnvironment` after dynamic site resolution and rejects a production runtime paired with a testing organization as `PLATFORM_ENVIRONMENT_HOST_MISMATCH`. Product adapters and authorization remain downstream boundaries.

No supported HTTP path was shown to reach BlessBoard, ActiveClinic, authenticated routes, or tenant content with the mismatched environment. Live database-backed HTTP verification remains unavailable in this phase, so the conclusion is based on the complete static call chain and controlled context test, not a production assertion.

## Boundary ownership

- Deployment identity: `deploymentProfiles.js` and expected deployment code passed into the dynamic resolver.
- Database environment: deployment profile plus resolved organization environment; request-context comparison is authoritative for host/runtime environment.
- Product identity: exact canonical registry, profile product selection, and `productRegistry.js`.
- Dynamic eligibility: active domain, deployment, product, organization, and organization-product statuses.
- Host ownership: domain repository join and organization/product linkage.
- Availability: status checks in `resolveHostname`.
- Cross-product isolation: `resolveOrganizationForProduct`, product registry, host/profile checks, and product-specific adapters.
- Authorization: not granted by tenant resolution; BB and AC role/policy layers remain authoritative.

## Tests executed

New characterization:

```sh
NODE_PATH=../getpro/node_modules node --test --test-concurrency=1 \
  tests/v211-tenant-resolution-characterization.test.js
```

Result: 18 passed, 0 failed, 0 skipped.

Existing ARCH-05 regression evidence: 75 passed, 0 failed, 0 skipped across 12 tenant, host, isolation, and architecture suites. The architecture command reported 7 passed, 0 failed, 0 skipped. Those earlier integration results are retained as regression evidence; ARCH-06 itself did not connect to a database.

## Remaining limitations

1. No verified disposable PostgreSQL identity was available/selected for this run.
2. Dynamic BB and AC scenarios use controlled query rows rather than real schema fixtures.
3. Full HTTP route execution against a live dynamic domain was not performed.
4. The resolver-layer environment behavior remains a defense-in-depth opportunity; changing it would require an approved contract decision and regression plan.

## Recommendation and smallest next batch

Do not implement a second resolver. Keep `resolvePlatformRequestContext` and `resolveHostname` as the authorities. The smallest future batch is an explicitly authorized disposable-foundation integration test that provisions only non-privileged synthetic BB/AC organizations and exercises dynamic host resolution plus request-context environment rejection. It must not alter runtime code, session/CSRF contracts, roles, public URLs, or deployment profiles.

Rollback is removal of the integration fixture/test and this review document. Required regression gates are the 18-test characterization suite, existing tenant/isolation suites, dependency-direction checks, and the full relevant product route suites.
