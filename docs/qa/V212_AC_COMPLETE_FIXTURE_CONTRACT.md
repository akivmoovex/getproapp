# V2.12 ActiveClinic Acceptance Fixture Contract

Status: `BLOCKED_AT_SUPPORTED_PREREQUISITES`

Verified contracts:

- Clinic/facility and staff: `activeclinic-seed-demo-clinics.js` and `activeclinic-seed-qa-role-users.js`.
- Patient registration: `registerActiveClinicPatient` through `/app/patients`.
- Appointment creation: `/app/appointments` and `createAppointment`.
- Portal association: `registerPatientWithGuestToken` in `src/activeclinic/services/activeClinicPatientPortalRegistrationService.js`.

The portal contract requires a supported `activeclinic.public_booking_requests` row with a verified booking access token and deliberate `patient_id`; it then creates a platform identity and links the patient profile. The current approved database contains zero `public_booking_requests` and zero `patient_portal_link_events`, so AC-01 cannot begin at token verification without a supported booking-request provisioning step.

The current database also has only the seeded ActiveClinic organization with acceptance records. A complete second-clinic patient/appointment fixture and supported platform Super Admin fixture are absent, blocking AC-04 and AC-05.
