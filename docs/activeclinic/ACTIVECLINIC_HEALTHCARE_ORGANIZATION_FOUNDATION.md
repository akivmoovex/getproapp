# ActiveClinic V6 — Healthcare Organization Foundation

Companion to [ACTIVECLINIC_FACILITY_FOUNDATION.md](./ACTIVECLINIC_FACILITY_FOUNDATION.md).

## Relationship

```text
platform.organizations
  → platform.organization_products (activeclinic, status=active)
  → activeclinic.healthcare_organizations (explicit root; one per platform org)
```

Enabling ActiveClinic on a platform organization does **not** create a healthcare organization. Provisioning is explicit via `healthcareOrganizationService.createHealthcareOrganization`.

## Schema

`activeclinic.healthcare_organizations`

| Field | Notes |
|-------|--------|
| `id` | UUID PK |
| `organization_id` | FK → `platform.organizations`, unique |
| `legal_name` / `public_name` | 1–200 chars |
| `organization_type` | CHECK catalogue |
| `country_code` | `^[A-Z]{2}$` |
| `registration_number` / `license_number` | optional |
| `status` | `active` \| `inactive` \| `suspended` \| `archived` |
| `timezone` | 1–64 chars |

## Organization types

`independent_facility`, `healthcare_network`, `faith_based_healthcare`, `government_healthcare`, `non_profit_healthcare`, `private_healthcare`, `other`

## Status matrix

| Status | Resolve as active? | Notes |
|--------|--------------------|--------|
| active | yes | Normal tenant resolution |
| inactive | no | Not operational |
| suspended | no | Denied |
| archived | no | Historical only |

Product enrolment status remains separate (`organization_products`).

## Ownership / enrolment

- DB trigger requires **active** ActiveClinic enrolment on insert/update of `organization_id`.
- Service also checks enrolment before create/requireActive.
- No BlessBoard church/branch references.

## Migrations

- `db/migrations/activeclinic/001_create_activeclinic_schema.sql`
- `db/migrations/activeclinic/002_healthcare_organizations.sql`

## Services / repos

- `src/activeclinic/repositories/healthcareOrganizationRepository.js`
- `src/activeclinic/services/healthcareOrganizationService.js`

Audit events use `actorUserId: null` with `actor_kind: system` until platform identities become AC actors.

## Context

`loadActiveClinicProductContext` may attach `healthcareOrganization` after tenant resolution. Facility is not resolved globally.

## Rollback

Drop facilities first, then healthcare_organizations, then schema (additive reverse). No BlessBoard impact.

## Known limitations / auth

- No ActiveClinic staff or login yet.
- `deployment_sessions` / `auth_transfers` unchanged.
- AC-V6-06 may begin staff-profile + RBAC principal design.
