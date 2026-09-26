# V2.03 AC Appointments Pass — ACN06–ACN09

**Verdict:** `V2_03_AC_APPOINTMENTS_PASS`

**Stitch project:** `projects/12134201997833374170`  
**Branch:** V10  
**Scope:** Appointment Calendar, Create Appointment, Appointment Detail, Booking Requests Queue

| Screen | Stitch IDs | Route |
|--------|------------|-------|
| ACN06 Appointment Calendar | desktop `3c1a421cf1e140e9affe193071c8f80a` · mobile `c36313bff4274c72b341c38cdfafbc35` | `GET /app/appointments/calendar` |
| ACN07 Create Appointment | desktop `c1e205c9ebd84f7a8f67d21681230d83` | `GET/POST /app/appointments/new` |
| ACN08 Appointment Detail | desktop `1ec9b9f67d9746ebbbf331cd2ecf2a04` | `GET /app/appointments/:id` (+ status POSTs) |
| ACN09 Booking Requests | desktop `41394d581882437b80e941cebefbb95f` | `GET/POST /app/booking-requests` |

## Delivered

- **Single appointment engine extended** — `activeClinicAppointmentService` + `appointmentRepository` (no second scheduler).
- **Canonical statuses** — Requested, Confirmed, Arrived, Waiting, With Practitioner, Completed, Cancelled, No-show (`037_batch1a_appointment_canonical_statuses.sql` remaps legacy `scheduled`/`checked_in`/`in_progress`/`rescheduled`).
- **Timestamped status history** — `appointment_status_events` on every transition; server-side `ALLOWED_TRANSITIONS` validation.
- **Calendar** — day/week views, practitioner/location/service/status filters, blocked-time rows, mobile single-day agenda (ACN06).
- **Create** — staff create starts `confirmed`; collision vs appointments + `staff_availability_blocks`.
- **Detail** — lifecycle chrome, confirm / arrived / waiting / with practitioner / complete / no-show / cancel / reschedule.
- **Booking queue** — confirm (creates appointment after patient link), propose reschedule, decline + required reason.
- **Platform reuse** — audit events, forged-tenant rejection, CSRF, RBAC permissions, facility scope.

## Tests

- `tests/activeclinic-batch1a-appointments.test.js` — markers, history, double-book, blocked time, isolation, RBAC, triage, HTTP Stitch + refresh, `/book` smoke
- Updated foundation/UI parity expectations for canonical statuses

## Gaps (non-blocking)

1. Stitch visual density (hour grid chrome) remains Batch1A shell patterns rather than pixel-perfect Tailwind port.
2. Booking-request reschedule from the queue proposes a new preferred slot; full patient re-confirmation UX stays on the existing public booking token path.
