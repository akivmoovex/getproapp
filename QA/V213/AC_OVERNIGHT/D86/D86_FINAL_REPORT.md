# D86 final report

The approved patient and facility behavior was already present: organization-scoped departments, staff-created patients without a portal, the existing patient-number format, duplicate filtering without a merge, and portal reset expiry and replay checks. D86 added five tests for that behavior. G1 passed 404 and failed 0.

Merge and any identifier outside `AC-YYYY-NNNNNN` stay blocked. No public self-registration and no OTP bypass were added. Persistence and browser tests were not run. No product file, database write, commit, or push was made.
