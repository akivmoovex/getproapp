# V2.13.2 G127 — appointment integrity

Exclusive same-staff overlap was already enforced by `findStaffCollision`. The check ran before `BEGIN`, so two requests could both pass and both insert.

`createAppointment`, `updateAppointment`, and `rescheduleAppointment` now take `pg_advisory_xact_lock` on the organization, healthcare organization, and assigned staff, then repeat the overlap query on the same client before the write. A collision rolls the transaction back.

Slot capacity is unchanged. `evaluateSlotCapacity` still returns `BLOCKED_APPROVAL_REQUIRED`. The D25 slot test still throws and is expected to fail. No room capacity was added. Public booking stays disabled.

The D25 overlap test now checks that the lock and the write are inside `BEGIN` for those three functions. It does not claim a two-connection race was executed.
