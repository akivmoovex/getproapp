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

## Authorization gates

Active staff + active role assignment + enrolment + healthcare org + (facility assignment when facility-scoped). Suspended staff denied even with active roles.
