# D25 final report

Assigned-staff overlap is the conflict control that exists. It is a read before insert, skipped when no staff member is assigned, and it does not take a lock. Slot capacity is not implemented. Two empty checks both pass.

Public booking retries are deduplicated by organization and idempotency key. That key is not a slot lock. A stale appointment version updates no row and the service source rolls back. A cancelled appointment is not a valid source for a reverse transition in the status map.

The safe suite passed 208 tests and failed 0. The simultaneous-booking integration test stayed `NOT_RUN`. APT-01-03 remains a design gap. No schema, product, database, browser, commit, or push change was made.

A capacity constraint needs an explicit product decision before any implementation.
