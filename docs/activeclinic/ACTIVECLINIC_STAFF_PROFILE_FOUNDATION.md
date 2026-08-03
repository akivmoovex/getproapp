# ActiveClinic V6 — Staff Profile Foundation

See also [ACTIVECLINIC_RBAC_PRINCIPAL_DECISION.md](./ACTIVECLINIC_RBAC_PRINCIPAL_DECISION.md) and [ACTIVECLINIC_FOUNDATIONAL_PERMISSION_MATRIX.md](./ACTIVECLINIC_FOUNDATIONAL_PERMISSION_MATRIX.md).

## Separation

| Layer | Table | Role |
|-------|-------|------|
| Auth identity | `platform.identities` | Credentials / login principal (future) |
| Product link | `platform.identity_product_profiles` | identity → staff id (`activeclinic_staff`) |
| Employment | `activeclinic.staff_members` | Authorization subject |
| Facility placement | `activeclinic.staff_facility_assignments` | Multi-facility membership |
| RBAC | `activeclinic.staff_role_assignments` | Role grants on staff |

Identity existence alone grants no ActiveClinic access.

## Staff fields / lifecycle

Statuses: `invited` → `active` → `inactive` / `suspended` / `archived`.  
Employment: permanent, contract, temporary, volunteer, visiting, agency, other.

`platform_identity_id` is **nullable** (invited before login). Once linked: one live staff row per identity per healthcare organization; one identity may work for multiple AC organizations.

## Ownership

Composite FK to healthcare organization + active ActiveClinic enrolment trigger.

## Migrations

- `activeclinic/004_staff_members.sql`
- `activeclinic/005_staff_facility_assignments.sql`
- `activeclinic/006_staff_role_assignments.sql`
- `platform/021_identity_product_profiles_multi_org_ac.sql`
- `blessboard/077_activeclinic_rbac_catalogue.sql`

## Services

- `activeClinicStaffService`
- `activeClinicStaffFacilityService`
- `activeClinicAuthorizationService`

## Auth dependency

Login unavailable until session principal migrates off `blessboard.users` (AC-V6-07).
