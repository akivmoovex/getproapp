# Appointment gaps

`createAppointment` returns `invalid_input` when the organization, facility, patient, service, or actor id is not a UUID, and the throwing database double is not called. That is the fail-closed input boundary.

Staff overlap is queried only inside `if (assignedStaffId)`. There is no `slot_capacity` and no `FOR UPDATE`. Two requests with no assigned staff, or two requests that both pass the check, are still the D25 race. `APT-01-03` stays missing.

The gated integration file throws `APT-01-03_NOT_IMPLEMENTED` if its gate is opened. This stage did not open it. No appointment row was written.
