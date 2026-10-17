# V211 First Refactoring Batch

## Decision

Select a preparatory characterization-test batch, not a production extraction. No reviewed extraction is sufficiently low-risk: the smallest candidates still alter security, tenant, session, CSRF, rate-limit, or website-publication contracts. This batch creates the evidence boundary needed before moving one mechanism into the existing Platform services.

## Scope

**Modify:**

- `tests/v211-tenant-resolution-characterization.test.js` (new)
- `docs/architecture/V211_FIRST_REFACTORING_BATCH.md`

**Do not modify:**

- `src/platform/**`
- `src/blessboard/**`
- `src/activeclinic/**`
- `src/church/**`
- `src/routes/**`
- `server.js`
- `server.legacy.js`
- `index.js`
- `views/**`
- `public/**`
- `db/**`
- deployment configuration, migrations, or package scripts

The characterization test now exists and remains deliberately limited to current behavior. No shared resolver API was implemented.

## Characterization targets

The test should assert existing behavior without introducing a new implementation:

1. Dependency direction passes and reports the current 29-entry Platform/product allowlist with zero cross-product exceptions.
2. BB and AC resolve distinct product keys and do not cross-resolve tenant/product context.
3. Existing Platform session and host-context primitives preserve product-scoped boundaries.
4. Website draft/live/publication services preserve tenant scope and product-specific adapters.
5. Existing BB and AC focused tests remain the required parity suite.

These are observations of current contracts, not permission to widen roles, merge identities, or move business policy.

## Proposed future Platform API

No API is implemented in this batch. The next extraction candidate, after characterization passes, is a narrow mechanism contract:

```text
resolveProductTenantContext(request) -> {
  productKey,
  organizationId,
  tenantKey,
  deploymentProfile
}
```

The contract must fail closed for unknown hosts, require an explicit product registry entry, and carry no product role or business-policy decision. It should extend `src/platform/http/loadPlatformHostContext.js` and `src/platform/tenantHostRouting.js`, not create a parallel resolver.

## Adapter contracts

**BlessBoard adapter**

- Supplies church/branch/HQ organization semantics.
- Supplies BlessBoard product key and host registry entry.
- Applies church role, membership, ministry, attendance, pastoral, giving, and publication policy.
- Must not receive ActiveClinic roles or clinical records.

**ActiveClinic adapter**

- Supplies clinic/facility/staff/patient tenant semantics.
- Supplies ActiveClinic product key and host registry entry.
- Applies healthcare identity, clinical permissions, booking, diagnostics, pharmacy, and billing policy.
- Must not receive BlessBoard roles or church records.

## Focused verification commands

For the characterization batch:

```sh
node scripts/architecture/dependencyDirection.js
NODE_PATH=../getpro/node_modules node --test --test-concurrency=1 tests/v8-shared-rbac-tenant-isolation.test.js
NODE_PATH=../getpro/node_modules node --test --test-concurrency=1 tests/about-v11-platform.test.js tests/v8-about-version-2.test.js
```

The database-backed isolation test may skip or require its existing disposable test database preconditions. No migration or production database may be used.

## Acceptance criteria

- No source/product/runtime/deployment file changes.
- No database schema or migration changes.
- No RBAC privilege widening.
- No session, CSRF, or public URL contract changes.
- Existing dependency-direction and product-isolation tests pass.
- New characterization assertions are limited to already-supported behavior.
- The diff is reversible as one documentation/test commit.

## Rollback and commit boundary

Rollback is deletion/revert of the single characterization test and this batch report. Do not revert or rewrite V11, V10, V9, or `main`. Commit only the new test (when implemented) and this report; do not combine it with Platform extraction, legacy deletion, UI cleanup, migration, or deployment work.

## Verification status

This selection is **CHARACTERIZATION_COMPLETE / EXTRACTION_NOT_IMPLEMENTED**. Tenant-resolution characterization covers static and dynamic-host behavior with controlled database mocks, while existing integration suites cover product isolation. No source runtime, product runtime, database, migration, deployment, or production system was changed.
