# V2.12 ActiveClinic Final Acceptance

Status: `BLOCKED — FIXTURE CONTRACTS UNAVAILABLE`

Phase 5C added and executed a guarded, repeatable QA bootstrap audit. It verified the existing two clinic organizations/facilities but confirmed that the platform-admin, Clinic-B role/patient/appointment, and verified portal-token gates remain unavailable through supported test services.

## Executed scenarios

### AC-01 Patient portal linking

`BLOCKED` at the authenticated browser portal-link fixture. The approved database has zero `activeclinic.public_booking_requests` and zero `patient_portal_link_events`; the supported guest-token contract therefore cannot begin.

### AC-02 Appointment creation

`PASS` through the browser and read-only SQL:

- Receptionist authenticated.
- `GET /app/appointments/new` returned 200.
- Synthetic patient `AC-2026-000006` selected.
- Service type selected.
- Review transition completed.
- Confirm booking completed.
- UI displayed “Appointment confirmed” and “View appointment”.
- Read-only SQL verified the confirmed appointment, patient, organization, healthcare organization, facility, service type, and scheduled time.

No unintended duplicate was observed.

### AC-03 Logout invalidation

`PASS`. The supported visible logout form posts to `/logout`; reusing the pre-logout session cookie returned `303 /login`.

### AC-04 Cross-tenant isolation

`BLOCKED`. The current disposable database lacks a complete second-clinic patient/appointment fixture for both-direction direct API evidence.

### AC-05 Admin Console authorization

`BLOCKED`. The ActiveClinic foundation server returned 404 for the platform Test Database Management routes, and no supported platform Super Admin fixture was available in this database.

## Environment

The app and PostgreSQL containers remained on `v212-qa-internal`. No production access, reset, commit, or push occurred. Existing optional external font DNS warnings remain environmental.

`SCENARIOS_EXECUTED=5`
`SCENARIOS_PASS=2`
`SCENARIOS_FAIL=0`
`SCENARIOS_BLOCKED=3`
`CONFIRMED_PRODUCT_DEFECTS=0`
`FINAL=V212_AC_ACCEPTANCE_BLOCKED`
