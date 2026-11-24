# V13 G116 concurrency reconciliation

D25 slot and D25 overlap still fail on both HTTP runs. The tests throw and expect `NOT_RUN`.

Earlier reports of passing appointment persistence did not add a slot-capacity lock. `evaluateSlotCapacity()` returns `BLOCKED_APPROVAL_REQUIRED` with reason `slot_capacity_not_approved`. Unit tests assert that gate. `findStaffCollision()` is a SELECT and is not inside `pg_advisory_xact_lock`.

No route was found that already calls an approved appointment slot lock and was simply skipped. Registration and billing locks were not reused as a capacity policy.

No schema change and no lock were added. The two tests remain the negative evidence until a capacity and overlap policy is approved.
