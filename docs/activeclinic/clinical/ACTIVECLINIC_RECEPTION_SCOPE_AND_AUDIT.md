# ActiveClinic — Reception Scope and Audit

**Prompt:** AC-V6-C05  
**Scope:** Authorization, facility scope, and audit trail for reception/queue

## Permissions

Conservative defaults: `activeclinic_staff` role gets **NONE** by default.

| Permission | Display Name | Who Gets It | Purpose |
|------------|-------------|-------------|---------|
| `activeclinic.reception.view` | View reception queue | Network Admin, Facility Admin | View arrivals and queue entries |
| `activeclinic.reception.check_in` | Check in patients | Network Admin, Facility Admin | Check in scheduled and walk-in patients |
| `activeclinic.reception.manage_queue` | Manage queue entries | Network Admin, Facility Admin | Create and update queue entries |
| `activeclinic.reception.call_next` | Call next patient | Network Admin, Facility Admin | Call patient from waiting to called |
| `activeclinic.reception.transfer` | Transfer queue entry | Network Admin, Facility Admin | Transfer patient to different service point |
| `activeclinic.reception.cancel` | Cancel queue entry | Network Admin, Facility Admin | Cancel or mark left before service |
| `activeclinic.reception.audit_view` | View reception audit | Network Admin only | View audit events for reception/queue |

## Authorization Pattern

All services use `authorizeStaffPermission` with HCO + facility scope:

1. **Organization membership**: Staff must belong to same organization
2. **HCO scope**: Staff must have access to the healthcare organization
3. **Facility scope**: Staff must have access to the specific facility (via role assignment or network admin override)
4. **Permission check**: Staff must have the required permission key

### Network Admin Override
- `activeclinic_network_admin` role grants **all permissions** across **all facilities** in the HCO
- No facility-specific assignment required

### Facility Admin
- `activeclinic_facility_admin` role requires explicit facility assignment
- Can only access data for assigned facilities
- Does **not** get `audit_view` permission

### Staff Role
- `activeclinic_staff` role gets **no reception permissions** by default
- Must be explicitly granted per-facility or per-HCO

## Facility Scope Resolution

Services use `resolveFacilityScope` to determine access:

```javascript
{
  orgWide: true,       // Network admin or org-wide role
  facilityIds: null    // Access all facilities
}
// OR
{
  orgWide: false,
  facilityIds: [...]   // Access only listed facilities
}
```

Queries filtered by:
- `orgWide = true`: No facility filter (can see all)
- `orgWide = false`: `WHERE facility_id = ANY($1::uuid[])` with allowed IDs

## Cross-HCO Isolation

All reception/queue operations **require** `healthcare_organization_id` match:
- Patient must belong to same HCO
- Facility must belong to same HCO
- Service point must belong to same HCO
- Staff access checked against same HCO

Cross-HCO check-ins are **rejected** with `RESULT.ACCESS_DENIED` or `RESULT.NOT_FOUND`.

## Audit Events

All reception/queue actions recorded via `recordAuditEventSafe`:

| Action Key | Trigger | Entity Type | Metadata |
|------------|---------|-------------|----------|
| `activeclinic.reception.check_in_scheduled` | Scheduled patient check-in | `reception_arrival` | `appointment_id` |
| `activeclinic.reception.check_in_walk_in` | Walk-in patient check-in | `reception_arrival` | `patient_id` |
| `activeclinic.reception.queue_entry_create` | Queue entry created | `queue_entry` | `service_point_key` |
| `activeclinic.reception.queue_status_change` | Queue status transition | `queue_entry` | `from_status`, `to_status`, `reason_code` |

### Append-Only Status History

`activeclinic.queue_status_events` table provides immutable audit trail:
- `from_status`: Previous status (NULL for initial entry)
- `to_status`: New status
- `reason_code`: Optional short code (e.g., `patient_no_show`, `emergency_priority`)
- `note`: Optional free-text explanation (max 300 chars)
- `actor_staff_id`: Staff member who performed transition
- `created_at`: Timestamp (never updated)

No updates or deletes allowed. History is permanent.

## Data Access Patterns

### List Queue (Facility Admin)
1. Authorize `reception.view` permission
2. Resolve facility scope → gets assigned facility IDs
3. Filter: `WHERE facility_id IN (assigned_facilities)`
4. Return visible entries only

### List Queue (Network Admin)
1. Authorize `reception.view` permission
2. Resolve facility scope → `orgWide = true`
3. Filter: `WHERE healthcare_organization_id = $1` (no facility restriction)
4. Return all entries in HCO

### Check In Patient (Any Role)
1. Authorize `reception.check_in` permission for target facility
2. Verify patient belongs to HCO
3. If scheduled: verify appointment exists and belongs to facility
4. Insert arrival record
5. Update appointment status (if scheduled)
6. Record audit event

## Security Constraints

1. **No client-authoritative data**: Queue position and number allocated server-side atomically
2. **Version checks**: All queue entry updates require correct `expectedVersion`
3. **No raw SQL in services**: All queries via repository layer
4. **No permission escalation**: Staff cannot grant themselves permissions
5. **No cross-product leakage**: Reception services **never** touch BlessBoard tables

## BlessBoard Table Isolation

Reception/queue implementation **must not**:
- Modify `blessboard.churches`, `blessboard.members`, or any church-specific tables
- Read church product data except via shared platform tables (`organizations`, `products`, etc.)
- Allow ActiveClinic staff to access BlessBoard tenant data

Only shared platform tables and `blessboard.permissions`, `blessboard.roles`, `blessboard.role_permissions` are touched (for authorization only).
