# V2.12 Phase 3D ActiveClinic QA

## Supported provisioning contract

The following services were exercised against `getpro_v212_reset_qa_01`:

1. `provisionPlatformTenant` with `productKey: "activeclinic"` and deployment `activeclinic-org-v6`.
2. `provisionActiveClinicClinic` to create the healthcare organization and facility.
3. `createPlatformIdentity` for synthetic staff identities.
4. `createStaffMember`.
5. `assignStaffToFacility`.
6. `assignStaffRole` from `activeClinicAuthorizationService`.
7. `registerActiveClinicPatient` with a staff actor.
8. `createAppointmentServiceType` with a schedule-capable actor.
9. `createAppointment` with a receptionist actor.
10. `seedActiveClinicQaRoleUsers` for the supported demo clinic role catalogue and login fixtures.

## Fixture diagnostics

The first failing attempt was `createAppointmentServiceType` with `activeclinic_clinic_manager`, returning `access_denied`. This is fixture-only: the role lacks the schedule-management permission required by the service. Retrying with the supported `activeclinic_network_admin` role created the service type. Appointment creation required a supported `activeclinic_receptionist` role and then succeeded.

The existing QA seed service initially returned `QA_ROLE_USERS_SEED_REFUSED` because its required explicit `confirm: true` option was omitted. Supplying confirmation and a random in-process password succeeded with 15 login-ready users.

## Result

- Two independent ActiveClinic organizations have healthcare organizations and facilities.
- Synthetic staff identities, facility assignments, and supported roles were created.
- Synthetic patients were created through `registerActiveClinicPatient`.
- Appointments were created through `createAppointment`.
- No patient self-registration assumption was introduced.
- No direct role or identity inserts were used for the repaired fixtures.

## HTTP authentication

The supported ActiveClinic login flow returned `303` to `/app/onboarding` and issued the ActiveClinic session cookie. The test database inspection remains protected by the platform-admin middleware; tenant administrators are denied.

## Remaining limitation

The seeded demo role users provide authenticated staff coverage. A full browser workflow for every staff role and patient portal-link lifecycle remains broader than this phase and is not treated as reset proof.
