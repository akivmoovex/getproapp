# V13 G106 appointment concurrency

D25 slot and D25 staff overlap still fail on both HTTP runs. The tests throw and expect `NOT_RUN`. They were not rewritten into passes.

`evaluateSlotCapacity()` returns `BLOCKED_APPROVAL_REQUIRED` with reason `slot_capacity_not_approved`. `findStaffCollision()` is a SELECT outside an appointment transaction. No `pg_advisory_xact_lock` exists on the appointment path. Registration and billing locks were not reused as a new capacity policy.

No schema change and no migration were applied. The existing tests remain the negative evidence.

Decision: blocked until a capacity and overlap policy is approved. The product was not given a new lock in this phase.
