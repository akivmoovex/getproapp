# ActiveClinic — Scheduling Rules

**Prompt:** AC-V6-C03

## Scope gates

1. Actor must hold the relevant `activeclinic.appointment.*` permission.
2. Facility scope: org-wide roles may book/list across facilities; facility-scoped staff only their linked facilities.
3. Patient must be active (not `archived` / `deceased`) and HCO-matched.
4. Facility must be active and belong to the same HCO.

## Time rules

- `starts_at < ends_at` (DB check + service validation).
- Timezone is stored explicitly on the appointment (from facility/HCO or caller).
- No silent timezone conversion — callers must pass or inherit the facility/HCO zone string.
- Duration defaults from `appointment_service_types.default_duration_minutes` when `ends_at` omitted.

## Collision policy

When `assigned_staff_id` is set, overlapping bookings in statuses  
`scheduled | confirmed | checked_in | in_progress` are rejected (`appointment_collision`).

- Overlap: `starts_at < other.ends_at AND ends_at > other.starts_at`
- Updates/reschedules exclude the appointment being moved.
- Configurable buffers are **not** implemented in C03 (deferred unless mapped).

## Staff requirement

If `requires_assigned_staff` is true on the service type, create/update without staff returns `assigned_staff_required`.

## Reschedule

- Allowed from `scheduled` or `confirmed` only.
- Marks prior row `rescheduled`, inserts replacement with `rescheduled_from_appointment_id`, appends status events — **one transaction**.
- Optimistic concurrency via `version` on the prior row.

## Reminder honesty

Creating with `reminderChannel` other than `none` inserts a reminder row with `delivery_state = unavailable`. Providers are not called; `sent` is not a valid state.

## Server authority

Clients never trust facility ownership or collision outcomes — all checks run server-side.
