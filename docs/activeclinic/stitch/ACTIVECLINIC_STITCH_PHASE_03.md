# ActiveClinic Stitch — Phase 3 (`P03`)

**Exact Stitch phase label:** `P03`
**Module:** Appointments / Reception / Queues
**Audited:** 2026-08-04
**Updated:** 2026-08-04 (P03 completion checkpoint)
**Screens:** 20 (Desktop 17 · Mobile 3 · Tablet 0)

Appointments, reception queue, check-in, walk-in, transfers

## Status summary

| Status | Count |
|--------|------:|
| PARTIAL | 18 |
| PRODUCT_DECISION | 2 |
| SCHEMA_BLOCKED | 0 |

## Implementation notes

- Appointment booking/list/detail/cancel/reschedule/no-show: existing `/app/appointments*` (prior checkpoint).
- Reception queue foundation: migration `014_reception_queue.sql`, permissions `082_activeclinic_reception_permissions.sql`, service + repository (committed earlier on V6).
- Reception UI: `/app/reception*` routes, loaders, EJS views, call-board privacy (queue # + initials only).
- Queue statuses (canonical): `waiting`, `called`, `serving`, `paused`, `completed`, `cancelled`, `left_before_service`, `transferred`.
- Doctor schedule: PRODUCT_DECISION — no clinician roster/capacity schema beyond appointment slots.
- Call-board is privacy-reduced relative to any Stitch full-name display (documented security deviation: safer representation).

## Screens

| Exact name | ID | Form | Route | Status | Notes |
|------------|----|------|-------|--------|-------|
| P03 – Appointment Calendar – Desktop | `0fca19f233af43c49966e7eb62bccb02` | DESKTOP | `/app/appointments/calendar` | PARTIAL | Calendar view over appointment records |
| P03 – Appointment Confirmation – Desktop | `327422c1b36747039e4026a17c5a2f33` | DESKTOP | `/app/appointments` (review step) | PARTIAL | Booking confirmation step |
| P03 – Appointment List – Desktop | `284e9f8cd6804b0eb0f50574e2f571d6` | DESKTOP | `/app/appointments` | PARTIAL | |
| P03 – Appointment List – Mobile | `480ecaba5258423e8711b1fdd2f39e1b` | MOBILE | `/app/appointments` | PARTIAL | Responsive cards |
| P03 – Appointment Shared States – Desktop | `089aa8f266664446a8b38cb69d1fda48` | DESKTOP | `/app/appointments*` | PARTIAL | Empty/error via shared states |
| P03 – Book Appointment – Desktop | `a99c6ac04cf24f2c8ca349715c1829dc` | DESKTOP | `/app/appointments/new` | PARTIAL | Administrative scheduling only |
| P03 – Cancel Appointment – Desktop | `b27eafc25bad4006868f3932d08bfed5` | DESKTOP | `/app/appointments/:id/cancel` | PARTIAL | |
| P03 – Create Walk-In Visit – Desktop | `305d90143b0e4381b112bf6eb113f1c2` | DESKTOP | `/app/reception/walk-in` | PARTIAL | Administrative walk-in + queue; not clinical encounter |
| P03 – Doctor Schedule – Desktop | `fd009ceba70f40b2ae1755b94220c64b` | DESKTOP | — | PRODUCT_DECISION | No roster capacity schema |
| P03 – Missed Appointments – Desktop | `7d37e069c7644e7cb4c9b72349a0ccf7` | DESKTOP | `/app/appointments?status=no_show` | PARTIAL | Filtered list |
| P03 – Patient Called – Desktop | `8dca6dbd36b840928e73d6674bbcb3ea` | DESKTOP | `/app/reception/queue/:id` + call-board | PARTIAL | Status `called` |
| P03 – Patient Check-In – Desktop | `9284064428f443b1a3a1504054827d91` | DESKTOP | `/app/reception/check-in` | PARTIAL | Scheduled appointment check-in |
| P03 – Patient Did Not Respond — Desktop | `f7841548662446cfa8d70d0772d3fa9f` | DESKTOP | `/app/reception/queue/:id` requeue/left | PARTIAL | |
| P03 – Queue Assignment – Desktop | `1fa99f4a358c47ffb858addae7095fe8` | DESKTOP | `/app/reception/queue/:id/assign` | PARTIAL | Room/desk assignment |
| P03 – Queue Stale Data Warning – Desktop | `bf9b846da6174bf995793b09e869cd30` | DESKTOP | `/app/reception?stale=1` | PARTIAL | Optimistic lock warning |
| P03 – Reception Queue – Desktop | `8b7173ba4ff94eb2a7d7e548b5f7253d` | DESKTOP | `/app/reception` | PARTIAL | |
| P03 – Reception Queue – Mobile | `73499b0dfef446c99a908b1cc56252a5` | MOBILE | `/app/reception` | PARTIAL | Responsive cards |
| P03 – Reschedule Appointment – Desktop | `da39a3945ace4fac85cb12bd86f0cdc2` | DESKTOP | `/app/appointments/:id/reschedule` | PARTIAL | |
| P03 – Reschedule Appointment – Mobile | `9429b14e9ea243ad93aec4a486db93e9` | MOBILE | `/app/appointments/:id/reschedule` | PARTIAL | |
| P03 – Transfer Patient to Department – Desktop | `e807a1354fdd418391496e69e5ac5f3e` | DESKTOP | `/app/reception/queue/:id/transfer` | PARTIAL | Terminal `transferred`; no cross-facility link |

## Checkpoint

`activeclinic stitch p03 reception queues complete`

Production touched: no · Pushed: no
