# Appointment implementation

No appointment service file was changed. Check-in still moves a booking to `arrived`. Overlap still treats touching intervals as free and overlapping intervals as a collision. A missing idempotency row is a new request. A stored row is a duplicate and still has `capacity: null`.

`evaluateSlotCapacity()` returns `BLOCKED_APPROVAL_REQUIRED`. The appointment service has no `FOR UPDATE` and no `slot_capacity`. D21-05 has no approval, so no capacity number and no migration file were written. A persistent exclusion constraint would need that decision before it can be named.
