# Appointment implementation

Assigned-staff overlap is unchanged. `findStaffCollision` still runs only when a staff id is present, still uses `starts_at < ends` and `ends_at > starts`, and still runs before `BEGIN`. It still does not take a row lock. Two checks against an empty slot can both miss.

The approved fix is identifier validation. `createAppointment`, `updateAppointment`, `rescheduleAppointment`, and `listAvailableAppointmentSlots` now reject a non-empty assigned staff id that is not a UUID before any query. A blank staff id still means unassigned, and an unassigned appointment still does not run the overlap query.

Public booking was not edited. A repeated public booking key remains a request retry for one organization. It is not a slot lock. Portal registration was not edited.

No capacity value, capacity column, or exclusion constraint was added. `evaluateSlotCapacity` returns `BLOCKED_APPROVAL_REQUIRED` and `capacity: null`. The appointment service does not call it, so a create is not refused for lack of a capacity number.
