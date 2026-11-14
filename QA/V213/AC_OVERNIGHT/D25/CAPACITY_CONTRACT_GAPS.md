# Capacity contract gaps

APT-01-01 is the ordinary create path. The code exists. This stage did not insert an appointment.

APT-01-02 is the assigned-staff overlap. `findStaffCollision` returns that overlap in process when the query returns a row. It does not see another organization's row. Persistence of the denial was not run.

APT-01-03 is concurrent slot capacity. It is not implemented. Two overlap checks against an empty double both return no collision, and neither statement takes a lock. That test records the race. It is not a pass for APT-01-03.

| Needed decision | Current code | Not built |
|---|---|---|
| Whose capacity | Assigned staff only, and only when a staff id is present | Facility or room capacity |
| Where it is enforced | Read, then a later insert | Same transaction as the insert, with a lock or exclusion constraint |
| Empty slot | Both concurrent readers proceed | One commit wins |
| Cancelled row | Omitted from the overlap statuses | A retry after cancel is allowed by the status list, but was not executed |
| Public booking | Idempotency key returns the same request | The key does not reserve a clinical slot |

No schema change is proposed for execution. A later approved change would need a product decision before adding a constraint or a lock. Until then the capacity tests stay unexecuted.
