# Appointment implementation

Staff overlap still uses the existing interval check. A later interval that only touches the previous end is not a collision. An overlapping interval is.

Slot capacity stays unapproved. `evaluateSlotCapacity` returns `BLOCKED_APPROVAL_REQUIRED` and a null capacity. The appointment service has no row lock and no capacity column.

A booking retry is resolved by the caller’s organization and idempotency key. Another organization’s key returns no booking, and the access token is not reissued. No stored concurrency run was made.
