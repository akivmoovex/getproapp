# ActiveClinic — Patient Registration

**Prompt:** AC-V6-C01

## Service

`registerActiveClinicPatient({ organizationId, healthcareOrganizationId, facilityId, demographics, contacts, address, identifiers, emergencyContacts, registrationMethod, duplicateOverride, actor })`

## Flow

1. Authorize `activeclinic.patient.create` for actor at facility scope  
2. Validate HCO active + facility active + ownership  
3. Normalize demographics / contacts / address / identifiers / emergency contacts  
4. Reject live identifier conflicts within HCO  
5. Run duplicate detection  
6. If blocking matches and no override → return `duplicate_warning` (no write)  
7. If override → require `activeclinic.patient.duplicate_override` + audit  
8. Transaction:
   - allocate `patient_number`
   - insert `patients`
   - insert initial `patient_registrations` (`is_initial=true`)
   - insert `patient_facility_links` (`registered_at`)
   - insert identifiers / emergency contacts
   - audit `activeclinic.patient.create`

Partial failure rolls back the transaction.

## Registration methods

`walk_in` | `referral` | `transfer_in` | `outreach` | `imported` | `other`

Registration does **not** create encounters or appointments.

## Facility association

Registration at a facility creates an active `registered_at` facility link. Later facilities may add `seen_at` / `administrative_link` (future workflows).

## Update / status

- `updateActiveClinicPatient` — allowlisted fields; number and ownership immutable  
- `setPatientStatus` — `deceased` and `archived` are separate; archive requires `activeclinic.patient.archive`  
- No hard delete; no merge; no HCO transfer  

## Permissions (defaults)

| Permission | Network admin | Facility admin | Staff |
|------------|---------------|----------------|-------|
| view / search / create / update | ✓ | ✓ (facility scope) | — |
| manage_identifiers | ✓ | ✓ | — |
| view_sensitive_contact | ✓ | ✓ | — |
| duplicate_override | ✓ | ✓ | — |
| archive | ✓ | — | — |
| audit_view | ✓ | — | — |
| merge | reserved, unassigned | — | — |
