# AC-V6-C04 — Appointment Calendar, List, Create, and Detail

**Stage:** AC-V6-C04  
**Date:** 2026-08-04  
**Verdict:** `ACTIVECLINIC_V6_C04_APPOINTMENT_UI_PARTIAL`

Prerequisite **AC-V6-C03** is COMPLETE. Appointment Stitch P03 scheduling screens are implemented on the ActiveClinic shell with stitch ID markers. Full pixel chrome vs Stitch packs is **VISUAL_BLOCKED**. Reception/queue P03 screens are deferred to C05/C06.

---

## Exact Stitch screens (mapped)

| Exact Stitch name | Stitch ID | Route / surface | Status |
|---|---|---|---|
| P03 – Appointment List – Desktop | `284e9f8cd6804b0eb0f50574e2f571d6` | `GET /app/appointments` | PARTIAL |
| P03 – Appointment List – Mobile | `480ecaba5258423e8711b1fdd2f39e1b` | same (card list) | PARTIAL |
| P03 – Appointment Calendar – Desktop | `0fca19f233af43c49966e7eb62bccb02` | `GET /app/appointments/calendar` | PARTIAL |
| P03 – Book Appointment – Desktop | `a99c6ac04cf24f2c8ca349715c1829dc` | `GET/POST /app/appointments/new` | PARTIAL |
| P03 – Appointment Confirmation – Desktop | `327422c1b36747039e4026a17c5a2f33` | review step + detail | PARTIAL |
| P03 – Reschedule Appointment – Desktop / Mobile | `da39a394…` / `9429b14e…` | edit + `POST …/reschedule` | PARTIAL |
| P03 – Cancel Appointment – Desktop | `b27eafc25bad4006868f3932d08bfed5` | detail cancel action | PARTIAL |
| P03 – Missed Appointments – Desktop | `7d37e069c7644e7cb4c9b72349a0ccf7` | no-show action | PARTIAL |
| P03 – Appointment Shared States – Desktop | `089aa8f266664446a8b38cb69d1fda48` | empty / no-results | PARTIAL |
| P03 – Doctor Schedule / Reception / Queue / Walk-In Visit | various | **deferred** (C05/C06) | NOT_STARTED |

---

## Routes

| Route | Permission |
|---|---|
| `GET /app/appointments` | `appointment.view` |
| `GET /app/appointments/calendar` | `appointment.view` |
| `GET /app/appointments/new` | `appointment.create` |
| `POST /app/appointments` | `appointment.create` + CSRF (review then confirm) |
| `GET /app/appointments/:appointmentId` | `appointment.view` |
| `GET /app/appointments/:appointmentId/edit` | `appointment.update` |
| `POST /app/appointments/:appointmentId` | `appointment.update` + CSRF |
| `POST …/reschedule` | `appointment.update` + CSRF |
| `POST …/cancel` | `appointment.cancel` + CSRF |
| `POST …/check-in` | `appointment.check_in` + CSRF |
| `POST …/no-show` | `appointment.update` + CSRF |

Public path key is appointment UUID (HCO-scoped lookups). List shows minimized patient summary only.

---

## Security

- HCO + facility scope via C03 services  
- Server-side slot revalidation before confirm  
- Collision handling surfaced on review  
- Timezone stored explicitly (no silent conversion)  
- CSRF on all writes; PRG after mutations  
- No clinical diagnoses/notes; no encounter creation  
- Nav **Appointments** gated on `appointment.view`  
- Staff role has no appointment permissions by default

---

## Tests

```bash
node --test --test-concurrency=1 tests/activeclinic-appointment-ui-parity.test.js
```

Also: C03 foundation + db-bootstrap.

---

## Remaining gaps

- Pixel Stitch chrome / dense weekly calendar grid  
- Doctor schedule screen  
- Reception / queue / walk-in visit UI (C05 backend → C06 UI)  
- Duplicate-submission token beyond CSRF + PRG  

---

## Gate for AC-V6-C05

**OPEN (non-blocking PARTIAL).** Appointment check-in, patient scope, list/calendar/create/detail are functional.
