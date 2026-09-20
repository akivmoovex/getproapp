# V8 Shared RBAC & Tenant Isolation

**Status:** Active  
**Branch:** `V8`  
**Modules:** `src/platform/rbac/`

## Goals

1. Centralize **tenant-scope** checks and forged-ID rejection for BlessBoard and ActiveClinic.
2. Keep **product-owned** permission catalogues and evaluators (do not merge BB/AC tables).
3. Enforce **least privilege** for platform-admin catalogue permissions on V8.
4. Preserve the V7 role / membership / permission data contract (additive only).

## Architecture

| Layer | Ownership | Path |
|-------|-----------|------|
| Shared tenant scope | Platform | `sharedTenantScope.js` |
| Shared authz decisions / PA gate | Platform | `sharedAuthzDecision.js` |
| Product dispatch facade | Platform | `sharedRbacFacade.js` |
| BB catalogue evaluator | BlessBoard | `blessBoardRbacAuthorizationService.js` |
| AC catalogue evaluator | ActiveClinic | `activeClinicAuthorizationService.js` |
| Website lifecycle tenancy | Platform website | `authorizeWebsite.js` (uses shared `uuidEqual`) |

## Trusted identity (never from the client)

| Product | Trusted sources |
|---------|-----------------|
| BlessBoard | Host-resolved tenant (`req.blessBoardTenantContext`) + session `userId` |
| ActiveClinic | `req.activeClinicAuth` organization + selected facility + staff member |
| Platform admin | Apex host + session user with catalogue / role checks |

Client `organizationId` / `churchId` / `branchId` / `facilityId` (and snake_case) are rejected unless they **exactly match** trusted context (`allowMatchingTrusted`).

## Platform admin least privilege

`requirePlatformPermission(key)` calls `evaluatePlatformAdminPermission`:

- Catalogue grant → allow.
- Else legacy `platform_admin` fallthrough:
  - **V8 default:** disabled (least privilege).
  - **V7 default:** enabled for compatibility.
  - Override with `PLATFORM_ADMIN_PERMISSION_FALLTHROUGH=0|1`.

Binary `requirePlatformAdmin` (active `platform_admin` role) still gates shell entry; fine-grained keys must not rely on fallthrough on V8.

## Permission matrices (representative)

### BlessBoard

| Permission | visitor | member | website_editor | branch_admin | church_hq_admin | platform_admin |
|------------|---------|--------|----------------|--------------|-----------------|----------------|
| `website.edit` | Deny | Deny | Allow | Allow | Allow | Allow |
| `website.publish` | Deny | Deny | Deny* | Allow | Allow | Allow |
| `finance.transactions.view` | Deny | Deny | Deny | Deny | Deny | Deny† |

\* Catalogue roles without publish must not gain it via legacy fallthrough (BB-BUG-001).  
† Legacy PA bundle intentionally excludes finance transaction keys.

### ActiveClinic

| Permission | receptionist | clinician | cashier | billing_officer | finance_supervisor | org_admin | website_editor |
|------------|--------------|-----------|---------|-----------------|--------------------|-----------|----------------|
| `activeclinic.patient.view` | Allow | Allow | Deny | — | — | Allow | Deny |
| `activeclinic.billing.refund` | — | — | Deny | Deny | Allow | Deny | — |
| `website.publish` | — | — | — | — | — | Allow | Deny |

Full AC role catalogue: `docs/activeclinic/ACTIVECLINIC_FOUNDATIONAL_PERMISSION_MATRIX.md`.

## Tests

- `tests/v8-shared-rbac-tenant-isolation.test.js` — helpers, forged IDs, PA fallthrough, matrices, product mismatch.
- `tests/helpers/authzNegativeHelpers.js` — reusable denial / forge / matrix helpers.
- Re-run: `blessboard-p0-publish-auth`, `blessboard-authorization*`, `v7-tenant-isolation-security`, `v7-shared-website-authorization-entrypoint`, `v7-website-rbac`, `activeclinic-rbac-role-matrix`.

## Non-goals

- Unifying BB and AC into one permission table.
- Removing V7 permissions or mutating legacy roles without a migration.
- Replacing commercial entitlements with RBAC (they stay orthogonal).
