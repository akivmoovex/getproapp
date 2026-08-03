# ActiveClinic V6 — Foundational Permission Matrix

Permission keys live in shared `blessboard.permissions` (resource `activeclinic`).  
Routes/services must authorize by **permission key**, never by role name.

## Roles

| Role key | Scope |
|----------|--------|
| `activeclinic_network_admin` | Organisation-wide |
| `activeclinic_facility_admin` | Facility (requires facility assignment) |
| `activeclinic_staff` | Organisation-wide minimal access |

## Matrix

| Permission | Network admin | Facility admin | Staff |
|------------|---------------|----------------|-------|
| `activeclinic.access` | ✓ | ✓ | ✓ |
| `activeclinic.organization.view` | ✓ | ✓ | ✓ |
| `activeclinic.organization.manage` | ✓ | | |
| `activeclinic.facility.view` | ✓ | ✓ | ✓ |
| `activeclinic.facility.create` | ✓ | | |
| `activeclinic.facility.update` | ✓ | ✓ (assigned) | |
| `activeclinic.facility.archive` | ✓ | | |
| `activeclinic.staff.view` | ✓ | ✓ (assigned) | |
| `activeclinic.staff.create` | ✓ | ✓ (assigned) | |
| `activeclinic.staff.update` | ✓ | ✓ (assigned) | |
| `activeclinic.staff.archive` | ✓ | | |
| `activeclinic.staff.assign_facility` | ✓ | ✓ (assigned) | |
| `activeclinic.staff.assign_access` | ✓ | | |
| `activeclinic.audit.view` | ✓ | | |
| `activeclinic.patient.view` | ✓ | ✓ (assigned facilities) | |
| `activeclinic.patient.search` | ✓ | ✓ (assigned facilities) | |
| `activeclinic.patient.create` | ✓ | ✓ (assigned facilities) | |
| `activeclinic.patient.update` | ✓ | ✓ (assigned facilities) | |
| `activeclinic.patient.manage_identifiers` | ✓ | ✓ (assigned facilities) | |
| `activeclinic.patient.view_sensitive_contact` | ✓ | ✓ (assigned facilities) | |
| `activeclinic.patient.duplicate_override` | ✓ | ✓ (assigned facilities) | |
| `activeclinic.patient.archive` | ✓ | | |
| `activeclinic.patient.audit_view` | ✓ | | |
| `activeclinic.patient.merge` | reserved / unassigned | | |

Patient permissions seeded in `080_activeclinic_patient_permissions.sql` (AC-V6-C01).  
`activeclinic_staff` intentionally receives **no** patient permissions by default.  
See `docs/activeclinic/clinical/` for ownership, search scope, and privacy rules.

## Authorization gates

Active staff + active role assignment + enrolment + healthcare org + (facility assignment when facility-scoped). Suspended staff denied even with active roles.  
Patient visibility for facility-scoped actors additionally requires an active `patient_facility_links` row to an authorized facility.
