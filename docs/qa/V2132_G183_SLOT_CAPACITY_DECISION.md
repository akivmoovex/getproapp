# V2.13.2 G183 slot capacity decision

D21-05 in `QA/V213/AC_OVERNIGHT/D85/DESIGN_APPROVAL_REGISTER.md` is still unapproved. The allowed action is "Do not add a slot lock or a capacity number." G137 recorded the same hold. This cycle does not add an integer and does not change `createAppointment`.

`D25_SLOT=FAIL`. `D25_OVERLAP=PASS` on the G180 HTTP runs. The overlap test was not edited.

## What is already implemented

Same-staff overlap is exclusive for one assigned staff member.

`lockStaffAppointmentScope` takes `pg_advisory_xact_lock(hashtext(...))` on `ac-staff-appt`, organization, healthcare organization, and assigned staff id. It then calls `findStaffCollision`. The query keeps a row when status is `requested`, `confirmed`, `arrived`, `waiting`, or `with_practitioner`, and when `starts_at < new end` and `ends_at > new start`. A visit that starts when the previous one ends is not a collision. The write is inside the same transaction. A collision rolls back. A different staff id uses a different lock. Another organization is not written by the other clinic's staff id.

`createAppointment` does not call `evaluateSlotCapacity`. That function still returns `BLOCKED_APPROVAL_REQUIRED`, `capacity: null`, and `slot_capacity_not_approved`. `db/migrations/activeclinic/013_appointments.sql` has no capacity column and no exclusion constraint. The D25 contract forbids `evaluateSlotCapacity`, `slot_capacity`, and `FOR UPDATE` on the appointment service.

## The open decision

No approved source says whether a further capacity exists beyond one overlapping visit per assigned staff member.

| Question | What the code does now | What is not approved |
| --- | --- | --- |
| Per slot, staff, service, room, or facility? | The lock and the query are per assigned staff member, inside one organization and healthcare organization. Facility, service, and room are not part of the overlap key. | Any of those other scopes. |
| Exclusive or multi-patient? | One blocking row for that staff member rejects the second overlapping appointment. | A capacity above one. |
| Assigned and unassigned | A null assigned staff id skips the lock and the collision query. A service with `requires_assigned_staff` rejects a missing staff id before the lock. | Whether an unassigned visit would count toward a future number. |
| Existing configuration | No capacity column and no approved integer. | Do not invent one. |
| Cancellation | `cancelled` and `no_show` are not blocking statuses. `completed` is not blocking. A cancelled row no longer collides. | No extra capacity refund rule. |
| Reschedule | `rescheduleAppointment` cancels the prior row and inserts the replacement in one transaction. The lock excludes the prior id, then the prior row becomes `cancelled` before the insert. | No second capacity counter. |

## Options, not selected

Option A. Keep the current staff overlap and leave D25 slot failed. No schema change. This is the current behavior.

Option B. An approval names one integer and the scope it belongs to. The implementation would call a new check after the existing staff lock, re-read the count inside that transaction, and roll back when the count would exceed the approved integer. Tests would use that integer only after it is written into an approved fixture. They would still keep the two-client staff collision at one row.

Option C. An approval says the staff overlap is the whole capacity rule and there is no second integer. Only then may the slot test be rewritten. That rewrite is not authorized now. The slot test must keep throwing `APT-01-03_NOT_IMPLEMENTED`.

Until one of B or C is approved, D25 slot stays failed.
