# V211-AC-QA160 Patient Portal and Phone Matching

## Canonical routes

The supported public flow is:

- clinic website: `/clinics/:clinicKey`
- patient portal login: `/clinics/:clinicKey/patient/login`
- portal registration: `GET/POST /clinics/:clinicKey/patient/register`
- authenticated portal: `/clinics/:clinicKey/patient`

The registration handler uses server-issued CSRF and
`registerPatientWithPhoneMatch` when no guest token is supplied. Phone values
are normalized by `normalizeActiveClinicPhone`, then matched within the
organization and healthcare-organization scope. Ambiguous matches are rejected;
unknown numbers return `no_patient_match`.

## Focused execution

The existing ActiveClinic Patient Portal suite passed 9/9:

- portal login/session isolation
- guest-token registration and patient association
- booking visibility limited to the owned patient
- CSRF denial
- portal pages and password/verification states

No product defect was reproduced. The service contract explicitly requires an
existing eligible patient for phone matching and does not auto-create or
auto-merge a patient from an unknown phone.

The broader requested phone-format matrix and live Find Clinic browser
navigation were not separately executed in this run. No product source,
database reset, migration, protected database mutation, commit, push, or
deployment occurred.
