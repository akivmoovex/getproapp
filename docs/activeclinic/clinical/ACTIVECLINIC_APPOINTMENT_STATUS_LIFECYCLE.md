# ActiveClinic — Appointment Status Lifecycle

**Prompt:** AC-V6-C03

## Allowed transitions

| From | To |
|------|-----|
| _(create)_ | `scheduled` |
| `scheduled` | `confirmed`, `checked_in`, `cancelled`, `no_show`, `rescheduled` |
| `confirmed` | `checked_in`, `cancelled`, `no_show`, `rescheduled` |
| `checked_in` | `in_progress`, `completed`, `cancelled`, `no_show` |
| `in_progress` | `completed`, `cancelled` |
| `completed` | _(terminal)_ |
| `cancelled` | _(terminal)_ |
| `no_show` | _(terminal)_ |
| `rescheduled` | _(terminal)_ |

`in_progress` and `completed` are reserved for future clinical workflow; C03 may set them via authorized status events but does **not** create encounter rows.

## Permissions for transitions

| Target | Permission |
|--------|------------|
| `cancelled` | `activeclinic.appointment.cancel` |
| `checked_in` | `activeclinic.appointment.check_in` |
| Other status changes | `activeclinic.appointment.update` |
| Service catalogue | `activeclinic.appointment.manage_schedule` |

## History

Every successful create/transition inserts into `appointment_status_events` (append-only). Cancellation stores a reason on the appointment row and a reason code on the event.

## Concurrency

Status updates require matching `version` (optimistic lock). Stale writers receive `stale_version`.
