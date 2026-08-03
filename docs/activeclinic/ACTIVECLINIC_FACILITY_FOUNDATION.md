# ActiveClinic V6 — Facility Foundation

Companion to [ACTIVECLINIC_HEALTHCARE_ORGANIZATION_FOUNDATION.md](./ACTIVECLINIC_HEALTHCARE_ORGANIZATION_FOUNDATION.md).

## Relationship

```text
healthcare_organizations
  → facilities (scoped by composite FK id + organization_id)
```

Facilities never reference BlessBoard branches. `organization_id` is derived from the healthcare organization; client-supplied org ids that do not match are rejected.

## Schema

`activeclinic.facilities`

Key fields: `facility_key`, `display_name`, `facility_type`, `status`, `is_primary`, address fields, `phone_normalized` / `phone_display`, optional email, `timezone`.

## Facility types

`hospital`, `health_centre`, `clinic`, `diagnostic_centre`, `pharmacy`, `mobile_clinic`, `administrative_office`, `other`

## Status matrix

| Status | Operational resolve? | Notes |
|--------|----------------------|--------|
| planned | no (unless admin allow-list) | Pre-open |
| active | yes | Default operational |
| inactive | no | Not ordinary access |
| suspended | no | Denied |
| archived | no | History; `is_primary` cleared on archive |

## Primary facility rule

Unique index: one row with `is_primary = true AND status = 'active'` per healthcare organization. Archived primaries do not block a replacement.

## Facility keys

- Format: `^[a-z][a-z0-9_-]{0,63}$`
- Unique within healthcare organization
- Immutable after create
- Reserved: `new`, `edit`, `admin`, `app`, `login`, `logout`, `healthz`, `settings`, `staff`, `patients`, `appointments`, `api`

## Ownership enforcement

- Composite FK `(healthcare_organization_id, organization_id)` → healthcare_organizations
- Enrolment trigger on facilities
- All reads require `organizationId`

## Indexes

| Index | Query |
|-------|--------|
| `facilities_organization_id_idx` | list by org |
| `facilities_healthcare_organization_id_idx` | list by HCO |
| `facilities_org_status_idx` | org + status |
| `facilities_hco_status_idx` | HCO + status |
| `facilities_org_facility_key_idx` | org + key lookup |
| `facilities_one_active_primary_per_hco_uidx` | active primary |

Unique `(healthcare_organization_id, facility_key)` covers HCO+key lookup.

## Migrations

`db/migrations/activeclinic/003_facilities.sql`

## Services / repos

- `facilityRepository.js` / `facilityService.js`
- Phone: E.164 required (`normalizeActiveClinicContact`) — no invented default country

## Infra probes (non-production)

- `GET /__ac/healthcare-organization-context`
- `GET /__ac/facilities`
- `GET /__ac/facilities/:facilityKey`

Disabled when `NODE_ENV=production` (404). Temporary.

## Rollback

Drop `activeclinic.facilities` (and triggers/indexes). No session/auth impact.

## Next phase

AC-V6-06: staff profile + RBAC principal. Authentication remains not ready.
