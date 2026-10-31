# V2.12 AC-01 Patient Portal Activation

## Contract

`POST /clinics/:clinicKey/patient/register` supports staff-created patients
without a guest booking token. The registration service performs tenant/HCO
scoped phone and name matching, creates a password identity, links the
identity to the patient, and records the portal-link event.

## Result

`PASS` — the focused MF08 and patient-portal suites completed in the
isolated QA database. Public booking remains disabled and is not used.

The executed suites covered registration, account association, login,
dashboard/profile ownership, tenant isolation, logout, and staff-session
separation. Evidence is retained under:
`/private/tmp/v212-ac-qa-output/docs/qa/v212/ac/raw/`

Required assertions include account association, authenticated patient
dashboard access, tenant ownership, and denial of unrelated patient records.
No token or booking record is fabricated.
