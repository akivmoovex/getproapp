# ActiveClinic P27 — Security Model

## Ownership

Every portal request verifies: usable identity → activeclinic_patient profile → active patient → org/HCO scope → booking ownership when applicable.

## Session isolation

- Same deployment cookie namespace with `contextJson.principalKind = "patient"`
- Patient middleware never clears sessions for “not staff”
- `requireActiveClinicAuth` (staff) rejects patient-kind sessions without granting `/app` access
- Patient routes reject staff-kind sessions unless also linked as patient (staff must use patient login path with patient profile)

## Tokens

- Guest booking: hashed P26 tokens
- Password reset: `activeclinic_patient_password_reset` purpose (hashed)
- Phone verification: honest unavailable delivery when SMS absent; no production code display

## Abuse

Rate limits on login, register, forgot, link-booking, cancel, reschedule. Enumeration-safe messages.
