# D48 final report

A simultaneous public booking that hits the existing organization idempotency key now returns the stored request instead of failing the request. Staff overlap, cancellation, and the unapproved capacity helper are unchanged. The appointment service still does not lock a row.

G1 passed 300 and failed 0. That does not verify persistent concurrency. No schema change, database write, commit, or push was made.
