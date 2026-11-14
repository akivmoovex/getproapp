# D65 final report

The approved payment duplicate path is now reached by a unit test. A same-tenant repeat rolls back. Another tenant’s key does not. A patient outside the tenant does not open a transaction.

Appointment scheduling was not given a lock or a capacity limit. Two overlap checks can both pass before a row exists. That unit result is not persistent concurrency evidence. Database locking and capacity tests were prepared and not run.

G1 passed 333 and failed 0. Log `/tmp/d65-g1.log`, finished `2026-11-15T01:06:01+0200`. No database write, migration, commit, or push was made.
