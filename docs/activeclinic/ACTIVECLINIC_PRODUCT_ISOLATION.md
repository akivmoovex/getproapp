# ActiveClinic V6 — Product Isolation

**Prompt:** AC-V6-03  
**Branch:** `V6`  
**Verdict:** `ACTIVECLINIC_V6_PRODUCT_ISOLATION_COMPLETE`

## Why `platform.organization_products` is reused

The table already provides explicit product enablement:

| Column | Role |
|--------|------|
| `id` | PK |
| `organization_id` | FK → `platform.organizations` |
| `product_id` | FK → `platform.products` (keys: `blessboard`, `activeclinic`, …) |
| `status` | `active` \| `inactive` \| `retired` |
| `product_tenant_key` | Unique per product |
| `activated_at` / `deactivated_at` | Lifecycle |
| `created_at` / `updated_at` | Audit timestamps |

Constraints already present:

- `UNIQUE (organization_id, product_id)`
- `UNIQUE (product_id, product_tenant_key)`
- Status check
- Deactivated-after-activated check

No parallel enablement table was created.

Plans/settings live on related platform subscription/entitlement tables — not duplicated here.

## Additive migration

`db/migrations/platform/019_organization_products_lookup_indexes.sql`

- `(product_id, status)`
- `(organization_id, status)`
- partial active `(product_id, organization_id) WHERE status = 'active'`

## Enablement rules

1. Organization existence alone never grants ActiveClinic access.
2. ActiveClinic requires `organization_products` row with `product_key=activeclinic` and `status=active`.
3. BlessBoard continues to require its own enrolment (church trigger + hostname resolver).
4. Dual-product orgs are allowed (two rows, one per product).
5. `inactive` / `retired` enrolments resolve as safe denial (`organization_product_not_found`).
6. No ActiveClinic backfill of existing orgs.

## Services

`src/platform/services/organizationProductService.js`

| Method | Purpose |
|--------|---------|
| `getOrganizationProduct` | Read enrolment (any status) |
| `requireOrganizationProduct` | Enforce allowed statuses; safe denial |
| `organizationHasActiveProduct` | Boolean active check |
| `listOrganizationsByProduct` | Product-scoped org list |
| `listProductsForOrganization` | Products enabled for one org |
| `resolveOrganizationForProduct` | Key + product → org context |
| `enableOrganizationProduct` | Governed write via `provisionPlatformTenant` |
| `suspendOrganizationProduct` / `restoreOrganizationProduct` | Lifecycle |

Repository: `src/platform/repositories/organizationProductRepository.js`

## Tenant resolution (ActiveClinic)

```
activeclinic-org-v6
→ product activeclinic
→ optional organizationKey
→ require active organization_products row
→ req.activeClinicContext
```

Loader: `src/activeclinic/http/loadActiveClinicProductContext.js`

Infrastructure probes:

- `GET /__ac/organization-context`
- `GET /__ac/organizations`

BlessBoard hostname resolution already enforces enrolment via `resolveHostname` — unchanged.

## Legacy BlessBoard compatibility

- BlessBoard churches require active BlessBoard enrolment (DB trigger) — unchanged.
- Platform admin org listing remains BlessBoard-scoped — intentional (D).
- ActiveClinic does **not** inherit any BlessBoard implicit fallback.
- No automatic classification of legacy orgs as ActiveClinic.

## Status mapping

| Conceptual | DB status |
|------------|-----------|
| enabled | `active` |
| suspended | `inactive` |
| archived | `retired` |

## Tests

`tests/activeclinic-product-isolation.test.js`

## Next gate

AC-V6-04 (identity architecture) may begin — product isolation foundation is in place.
