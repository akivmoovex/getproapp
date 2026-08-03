# ActiveClinic — Appointment Scope and Audit

**Prompt:** AC-V6-C03

## Permissions

| Key | Default network admin | Default facility admin | Default staff |
|-----|----------------------|------------------------|---------------|
| `activeclinic.appointment.view` | yes | yes | no |
| `activeclinic.appointment.create` | yes | yes | no |
| `activeclinic.appointment.update` | yes | yes | no |
| `activeclinic.appointment.cancel` | yes | yes | no |
| `activeclinic.appointment.check_in` | yes | yes | no |
| `activeclinic.appointment.manage_schedule` | yes | no | no |
| `activeclinic.appointment.audit_view` | yes | no | no |

Conservative: `activeclinic_staff` receives **no** appointment permissions by default.

## List / detail scope

- HCO id is mandatory on every query.
- Facility filter is applied from actor facility links unless org-wide.
- Cross-tenant and cross-HCO access returns denial / not-found (no leak).

## Audit actions (safe metadata only)

| Action key | When |
|------------|------|
| `activeclinic.appointment.service_type_create` | Catalogue entry created |
| `activeclinic.appointment.create` | Booking created |
| `activeclinic.appointment.update` | Schedule fields updated |
| `activeclinic.appointment.status_change` | Status transition |
| `activeclinic.appointment.reschedule` | Replacement booking |

Metadata allowlist only: `facility_key`, `status`, `from_status`, `to_status`, `reason_code`, `entity_key`. No patient names, phones, or clinical payloads.

## Isolation

- No BlessBoard church/member writes.
- No platform identity created for patients via scheduling.
- No encounter / clinical tables exist in this foundation.
