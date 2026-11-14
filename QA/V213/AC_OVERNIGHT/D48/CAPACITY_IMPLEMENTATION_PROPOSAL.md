# Capacity implementation proposal

Status: pending. D21-05 is not approved. No capacity number is chosen here.

A later approval has to name all of these before any lock is added:

1. Whether the current rule remains one overlapping visit per assigned staff member.
2. The integer capacity, if a service or facility may hold more than that, and where that integer already lives. No new column is named here.
3. Whether the existing overlap read moves inside the same transaction as the insert, and which existing row would be locked.
4. That an unassigned visit still skips the overlap query.
5. That a visit starting when the previous one ends is still not an overlap.
6. That the public booking unique key stays a retry of the same request and does not become the capacity lock.

Until that approval, `evaluateSlotCapacity` stays unwired. The isolated case is the existing gated test in `tests/v13/integration/d25-appointment-concurrency.integration.test.js`. It was not run.
