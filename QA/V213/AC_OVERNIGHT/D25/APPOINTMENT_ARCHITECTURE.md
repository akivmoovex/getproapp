# Appointment architecture

Branch `V13` at `b8f6b420d25e908de64ba292866c218c32edc30c`. No product file was edited.

Staff appointments are created by `createAppointment` in `src/activeclinic/services/activeClinicAppointmentService.js`. The route layer rechecks `listAvailableAppointmentSlots` before create. That listing returns the requested window, or an empty list when the optional assigned staff member already collides. The service comment says full calendar grids are deferred.

`findStaffCollision` reads `activeclinic.appointments` for the same organization, healthcare organization, and `assigned_staff_id`. The statuses that count are `requested`, `confirmed`, `arrived`, `waiting`, and `with_practitioner`. Overlap is `starts_at < new_end AND ends_at > new_start`. A matching `staff_availability_blocks` row is also a collision. The check is skipped when no staff id is set.

The check runs before `BEGIN`. The insert and status event then run in a transaction. There is no `FOR UPDATE`, advisory lock, or exclusion constraint. The staff index in `db/migrations/activeclinic/013_appointments.sql` is not unique. Two callers can both see an empty slot and both insert.

Facility scope uses `requireActiveFacility` and rejects a facility whose healthcare organization does not match. Patient lookup is `getPatientByOrgAndId`. Those denials were not executed against a database.

Cancellation is a status change to `cancelled` through `appendAppointmentStatusEvent`. `cancelled` has no outgoing transition, so a second cancel is not allowed by the map. The update includes `expectedVersion`. A missing row rolls back and returns `stale_version`. Reschedule cancels the prior row and inserts a replacement in one transaction, after the same pre-transaction staff check.

`listAvailableAppointmentSlots` does not represent a numeric capacity. The appointments table has no capacity column.
