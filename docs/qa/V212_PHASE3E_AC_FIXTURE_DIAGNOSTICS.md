# V2.12 Phase 3E ActiveClinic Fixture Diagnostics

## First failing stage

`createAppointmentServiceType` was the first failing stage when invoked by a clinic-manager fixture. The service returned `access_denied`; this was an authorization-capability mismatch, not a database or provisioning failure.

## Reproduction and repair

| Stage | Supported contract | Result |
|---|---|---|
| Tenant | `provisionPlatformTenant` | PASS |
| Clinic | `provisionActiveClinicClinic` | PASS |
| Staff identity | `createPlatformIdentity` / `createStaffMember` | PASS |
| Facility assignment | `assignStaffToFacility` | PASS |
| Staff role | `assignStaffRole` | PASS |
| Patient | `registerActiveClinicPatient` | PASS |
| Service type | `createAppointmentServiceType` | PASS with `activeclinic_network_admin`; manager attempt was denied |
| Appointment | `createAppointment` | PASS after adding `activeclinic_receptionist` facility role |

The smallest repair was adding the supported receptionist facility role to the synthetic appointment actor. No product code changed and no direct database role insertion was used.

## Sanitized evidence

- Initial service-type response: `access_denied`.
- Initial appointment response: `access_denied`.
- Repaired service type and appointment: successful service responses with synthetic tenant IDs.
- Login: HTTP `303` to `/app/onboarding`, with a session cookie.

## Classification

`AC_ROOT_CAUSE=FIXTURE_ONLY_ROLE_CAPABILITY_MISMATCH`; `PRODUCT_CODE_CHANGED=NO`.

## Remaining QA boundary

The fixture and service contracts are proven. Tenant-isolated HTTP testing for every seeded staff role and patient portal linking still requires the broader application workflow harness and is not inferred from database rows.
